/**
 * Find Accounting Integrity Issues — Apr 2026 follow-up to Orphan Ledger Audit.
 *
 * Context: orphan-ledger catches the case where a POSTED transactional doc has
 * NO settlement JournalEntry (the JE engine threw outside the POST txn). Even
 * when JEs DO exist, the books can still go silently wrong:
 *
 *   1. Trial balance is unbalanced (Σ debits ≠ Σ credits across POSTED JEs)
 *   2. Sub-ledger total ≠ control-account GL total (e.g., VatLedger.OUTPUT
 *      total for a period ≠ what the OUTPUT_VAT GL account credited that period)
 *   3. A POSTED JE row exists where the row itself has total_debit ≠ total_credit
 *      (pre-save validator catches this on save; runtime sweep catches drift
 *      from direct DB writes / migrations / mongoose .updateOne bypass)
 *   4. Inter-entity (IC) imbalance — VIP's "Due from Balai" ≠ Balai's "Due to VIP"
 *      (POSTED IcTransfers vs POSTED IcSettlements that close them)
 *   5. Period-close readiness — for the period about to close, are there still
 *      DRAFT / VALID transactional docs unposted?
 *
 * READ-ONLY. No repair, no rewrites. Each finding is an alert that finance / president
 * investigates and fixes by hand (re-post, void + re-issue, manual JE).
 *
 * Tolerance: ₱1.00 for sub-ledger / IC drift (default; overridable by lookup
 * `ACCOUNTING_INTEGRITY_THRESHOLDS`). 0.01 for TB and per-row JE math (rounding-only).
 *
 * IMPORTANT — VAT / CWT sub-ledger semantics in this codebase:
 *   • `journalFromSale` credits OUTPUT_VAT to the GL on CSI POST (accrual basis)
 *   • `createVatEntry` writes the VatLedger row on COLLECTION POST (cash basis,
 *     used for BIR 2550Q filing)
 *   • These two recognitions are DELIBERATELY split — GL is accrual, VatLedger
 *     is cash basis for filing. The drift between them at any point in time =
 *     VAT on open A/R (invoices issued but not yet collected).
 *   • Per-period equality CANNOT be enforced. v1 reports these as INFORMATIONAL
 *     (numbers shown, not counted as failures). Same for INPUT_VAT and CWT.
 *   • If the user later adopts pure-accrual or pure-cash recognition end-to-end,
 *     flip `subledger_enforce: true` in the ACCOUNTING_INTEGRITY_THRESHOLDS
 *     lookup row to make the recon strict.
 *
 * Usage (from backend/):
 *   node erp/scripts/findAccountingIntegrityIssues.js
 *
 * Optional flags:
 *   --entity <id>        Scope to a single entity (default: all entities)
 *   --period <YYYY-MM>   Override the period scope (default: current + previous month)
 *   --check <name>       Run one of: tb, subledger, jemath, ic, periodclose, all (default: all)
 *   --csv                Emit a CSV block to stdout
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  const val = args[i + 1];
  return val && !val.startsWith('--') ? val : true;
}

const ENTITY_FILTER = flag('entity');
const PERIOD_OVERRIDE = flag('period');
const CHECK_FILTER = (flag('check') || 'all').toString().toLowerCase();
const EMIT_CSV = !!flag('csv');

// Tolerances (defaults; overridable via ACCOUNTING_INTEGRITY_THRESHOLDS lookup).
// 0.01 = bank rounding; 1.00 = peso-rounding cushion. Anything bigger is a real
// problem the agent shouldn't mask.
const DEFAULT_TB_TOLERANCE = 0.01;
const DEFAULT_JE_MATH_TOLERANCE = 0.01;
const DEFAULT_SUBLEDGER_TOLERANCE = 1.00;
const DEFAULT_IC_TOLERANCE = 1.00;

function nowYM() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function loadThresholds() {
  // Try the Lookup model first; fall back to defaults if missing / lazy-seed
  // hasn't run yet. Failure here is never fatal — the agent must keep running.
  // `subledger_enforce` defaults to false because PH cash-basis VAT vs accrual GL
  // diverge by design (see header). Subscribers flip it on once their accounting
  // policy is consistent end-to-end.
  try {
    const Lookup = require('../models/Lookup');
    const row = await Lookup.findOne({
      category: 'ACCOUNTING_INTEGRITY_THRESHOLDS',
      code: 'DEFAULT',
    }).lean();
    const meta = row?.metadata || {};
    return {
      tb: typeof meta.tb_tolerance === 'number' ? meta.tb_tolerance : DEFAULT_TB_TOLERANCE,
      jeMath: typeof meta.je_math_tolerance === 'number' ? meta.je_math_tolerance : DEFAULT_JE_MATH_TOLERANCE,
      subledger: typeof meta.subledger_tolerance === 'number' ? meta.subledger_tolerance : DEFAULT_SUBLEDGER_TOLERANCE,
      ic: typeof meta.ic_tolerance === 'number' ? meta.ic_tolerance : DEFAULT_IC_TOLERANCE,
      subledgerEnforce: meta.subledger_enforce === true,
    };
  } catch {
    return {
      tb: DEFAULT_TB_TOLERANCE,
      jeMath: DEFAULT_JE_MATH_TOLERANCE,
      subledger: DEFAULT_SUBLEDGER_TOLERANCE,
      ic: DEFAULT_IC_TOLERANCE,
      subledgerEnforce: false,
    };
  }
}

async function loadCoaMap() {
  // Settings.COA_MAP is the single source of truth for which 4-digit code maps
  // to which conceptual account (OUTPUT_VAT, CWT_RECEIVABLE, IC_RECEIVABLE...).
  // Subscribers can renumber accounts via Control Center → COA Mapping without
  // touching the agent (Rule #3).
  const Settings = require('../models/Settings');
  const s = await Settings.getSettings();
  return s?.COA_MAP || {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 1 — Trial Balance balanced (cumulative + per-period)
// ─────────────────────────────────────────────────────────────────────────────
async function checkTrialBalance(entityId, periods, tolerance) {
  const JournalEntry = require('../models/JournalEntry');
  const findings = [];

  // Cumulative (all-time) — strongest invariant
  const allTime = await JournalEntry.aggregate([
    { $match: { entity_id: entityId, status: 'POSTED' } },
    { $unwind: '$lines' },
    { $group: {
      _id: null,
      total_debit: { $sum: '$lines.debit' },
      total_credit: { $sum: '$lines.credit' },
      je_count: { $addToSet: '$_id' },
    } },
  ]);

  if (allTime.length) {
    const r = allTime[0];
    const diff = Math.abs((r.total_debit || 0) - (r.total_credit || 0));
    findings.push({
      scope: 'cumulative',
      total_debit: r.total_debit || 0,
      total_credit: r.total_credit || 0,
      diff,
      je_count: r.je_count.length,
      ok: diff <= tolerance,
    });
  }

  // Per-period (current + previous, or override)
  for (const period of periods) {
    const rows = await JournalEntry.aggregate([
      { $match: { entity_id: entityId, status: 'POSTED', period } },
      { $unwind: '$lines' },
      { $group: {
        _id: null,
        total_debit: { $sum: '$lines.debit' },
        total_credit: { $sum: '$lines.credit' },
        je_count: { $addToSet: '$_id' },
      } },
    ]);
    if (!rows.length) {
      findings.push({ scope: period, total_debit: 0, total_credit: 0, diff: 0, je_count: 0, ok: true });
      continue;
    }
    const r = rows[0];
    const diff = Math.abs((r.total_debit || 0) - (r.total_credit || 0));
    findings.push({
      scope: period,
      total_debit: r.total_debit || 0,
      total_credit: r.total_credit || 0,
      diff,
      je_count: r.je_count.length,
      ok: diff <= tolerance,
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 2 — Sub-ledger == control account (VAT + CWT)
//
// CUMULATIVE (all-time) only. Per-period recon is meaningless because GL writes
// VAT on Sale POST (accrual) and VatLedger writes on Collection POST (cash for
// 2550Q filing). Cumulatively, GL OUTPUT_VAT eventually equals VatLedger sum
// PLUS the VAT-portion of open A/R; we report the gap and let the operator
// confirm it matches their open-AR-VAT figure.
//
// `informational: true` — these findings DO NOT count as failures unless the
// admin flips `subledger_enforce: true` in ACCOUNTING_INTEGRITY_THRESHOLDS.
// ─────────────────────────────────────────────────────────────────────────────
async function checkSubLedger(entityId, coaMap, tolerance, enforce) {
  const JournalEntry = require('../models/JournalEntry');
  const findings = [];

  const VatLedger = (() => { try { return require('../models/VatLedger'); } catch { return null; } })();
  const CwtLedger = (() => { try { return require('../models/CwtLedger'); } catch { return null; } })();

  async function glNetForCode(code, normalBalance) {
    const gl = await JournalEntry.aggregate([
      { $match: { entity_id: entityId, status: 'POSTED' } },
      { $unwind: '$lines' },
      { $match: { 'lines.account_code': code } },
      { $group: {
        _id: null,
        total_debit: { $sum: '$lines.debit' },
        total_credit: { $sum: '$lines.credit' },
      } },
    ]);
    const glRow = gl[0] || { total_debit: 0, total_credit: 0 };
    return normalBalance === 'CREDIT'
      ? (glRow.total_credit || 0) - (glRow.total_debit || 0)
      : (glRow.total_debit || 0) - (glRow.total_credit || 0);
  }

  // OUTPUT VAT — normal balance CREDIT
  if (coaMap.OUTPUT_VAT && VatLedger) {
    const subAgg = await VatLedger.aggregate([
      { $match: { entity_id: entityId, vat_type: 'OUTPUT' } },
      { $group: { _id: null, total: { $sum: '$vat_amount' } } },
    ]);
    const subTotal = subAgg[0]?.total || 0;
    const glNet = await glNetForCode(coaMap.OUTPUT_VAT, 'CREDIT');
    const diff = Math.abs(subTotal - glNet);
    findings.push({
      ledger: 'OUTPUT_VAT',
      scope: 'cumulative',
      sub_ledger_total: subTotal,
      gl_net: glNet,
      diff,
      ok: !enforce || diff <= tolerance,
      informational: !enforce,
      coa_code: coaMap.OUTPUT_VAT,
    });
  }

  // INPUT VAT — normal balance DEBIT
  if (coaMap.INPUT_VAT && VatLedger) {
    const subAgg = await VatLedger.aggregate([
      { $match: { entity_id: entityId, vat_type: 'INPUT' } },
      { $group: { _id: null, total: { $sum: '$vat_amount' } } },
    ]);
    const subTotal = subAgg[0]?.total || 0;
    const glNet = await glNetForCode(coaMap.INPUT_VAT, 'DEBIT');
    const diff = Math.abs(subTotal - glNet);
    findings.push({
      ledger: 'INPUT_VAT',
      scope: 'cumulative',
      sub_ledger_total: subTotal,
      gl_net: glNet,
      diff,
      ok: !enforce || diff <= tolerance,
      informational: !enforce,
      coa_code: coaMap.INPUT_VAT,
    });
  }

  // CWT_RECEIVABLE — normal balance DEBIT
  if (coaMap.CWT_RECEIVABLE && CwtLedger) {
    const subAgg = await CwtLedger.aggregate([
      { $match: { entity_id: entityId } },
      { $group: { _id: null, total: { $sum: '$cwt_amount' } } },
    ]);
    const subTotal = subAgg[0]?.total || 0;
    const glNet = await glNetForCode(coaMap.CWT_RECEIVABLE, 'DEBIT');
    const diff = Math.abs(subTotal - glNet);
    findings.push({
      ledger: 'CWT_RECEIVABLE',
      scope: 'cumulative',
      sub_ledger_total: subTotal,
      gl_net: glNet,
      diff,
      ok: !enforce || diff <= tolerance,
      informational: !enforce,
      coa_code: coaMap.CWT_RECEIVABLE,
    });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 3 — JE math sanity (per-row total_debit == total_credit)
// ─────────────────────────────────────────────────────────────────────────────
async function checkJeMath(entityId, tolerance) {
  const JournalEntry = require('../models/JournalEntry');

  // Use stored total_debit/total_credit (computed on save); cross-check by
  // recomputing from lines. Anything off by more than tolerance = drift.
  const rows = await JournalEntry.find({
    entity_id: entityId,
    status: 'POSTED',
  }).select('je_number period total_debit total_credit lines is_reversal').lean();

  const findings = [];
  for (const je of rows) {
    const lineDebit = (je.lines || []).reduce((s, l) => s + (l.debit || 0), 0);
    const lineCredit = (je.lines || []).reduce((s, l) => s + (l.credit || 0), 0);
    const storedDiff = Math.abs((je.total_debit || 0) - (je.total_credit || 0));
    const recomputedDiff = Math.abs(lineDebit - lineCredit);
    const storedVsRecomputedDr = Math.abs(lineDebit - (je.total_debit || 0));
    const storedVsRecomputedCr = Math.abs(lineCredit - (je.total_credit || 0));

    if (storedDiff > tolerance || recomputedDiff > tolerance ||
        storedVsRecomputedDr > tolerance || storedVsRecomputedCr > tolerance) {
      findings.push({
        je_number: je.je_number,
        period: je.period,
        is_reversal: !!je.is_reversal,
        stored_debit: je.total_debit || 0,
        stored_credit: je.total_credit || 0,
        recomputed_debit: lineDebit,
        recomputed_credit: lineCredit,
        diff: Math.max(storedDiff, recomputedDiff, storedVsRecomputedDr, storedVsRecomputedCr),
      });
    }
  }
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 4 — Inter-entity (IC) imbalance
// ─────────────────────────────────────────────────────────────────────────────
async function checkIcBalance(entities, tolerance) {
  const IcTransfer = (() => { try { return require('../models/InterCompanyTransfer'); } catch { return null; } })();
  const IcSettlement = (() => { try { return require('../models/IcSettlement'); } catch { return null; } })();
  if (!IcTransfer || !IcSettlement) return [];

  const findings = [];
  // For every ordered pair (A, B) where A ≠ B:
  //   open_balance = Σ POSTED IcTransfer (A → B).total_amount
  //                  − Σ POSTED IcSettlement (creditor=A, debtor=B).settled_transfers.amount_settled
  // The same number, computed from B's perspective, must agree (IC's are zero-sum).
  for (const a of entities) {
    for (const b of entities) {
      if (String(a._id) === String(b._id)) continue;

      const transferAgg = await IcTransfer.aggregate([
        { $match: {
          source_entity_id: a._id,
          target_entity_id: b._id,
          status: 'POSTED',
        } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]);
      const transferTotal = transferAgg[0]?.total || 0;
      const transferCount = transferAgg[0]?.count || 0;

      const settlementAgg = await IcSettlement.aggregate([
        { $match: {
          creditor_entity_id: a._id,
          debtor_entity_id: b._id,
          status: 'POSTED',
        } },
        { $unwind: { path: '$settled_transfers', preserveNullAndEmptyArrays: false } },
        { $group: { _id: null, total: { $sum: '$settled_transfers.amount_settled' }, count: { $sum: 1 } } },
      ]);
      const settledTotal = settlementAgg[0]?.total || 0;

      // Skip pairs where there's been zero IC activity either way — most pairs are quiet
      if (transferCount === 0 && settledTotal === 0) continue;

      const open = (transferTotal - settledTotal);
      // For now we just emit the open balance per directed pair. The mirror check
      // (B→A) will produce its own row; admin compares the two manually until a
      // future Phase wires a "consolidated IC dashboard."
      findings.push({
        creditor: a.short_name || a.name || String(a._id),
        debtor: b.short_name || b.name || String(b._id),
        creditor_id: String(a._id),
        debtor_id: String(b._id),
        transfer_total: transferTotal,
        transfer_count: transferCount,
        settled_total: settledTotal,
        open_balance: open,
        ok: open >= -tolerance, // negative means over-settled (settlements > transfers) — that's a red flag
      });
    }
  }
  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 5 — Period-close readiness
// ─────────────────────────────────────────────────────────────────────────────
async function checkPeriodClose(entityId, period) {
  // For the period being closed, count any DRAFT / VALID / non-POSTED transactional
  // docs whose date falls in the period. Posting them is the gating action before
  // a period lock can be flipped.
  const findings = [];
  const [y, m] = period.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const collections = [
    {
      key: 'sales',
      modelPath: '../models/SalesLine',
      dateField: 'csi_date',
      statusFilter: { status: { $in: ['DRAFT', 'VALID', 'ERROR'] } },
    },
    {
      key: 'collections',
      modelPath: '../models/Collection',
      dateField: 'cr_date',
      statusFilter: { status: { $in: ['DRAFT'] } }, // Collection lifecycle: DRAFT → POSTED
    },
    {
      key: 'expenses_prfcalf',
      modelPath: '../models/PrfCalf',
      dateField: 'created_at',
      statusFilter: { status: { $in: ['DRAFT'] } },
    },
    {
      key: 'ic_transfers',
      modelPath: '../models/InterCompanyTransfer',
      dateField: 'transfer_date',
      statusFilter: { status: { $in: ['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED'] } },
      entityField: 'source_entity_id',
    },
    {
      key: 'ic_settlements',
      modelPath: '../models/IcSettlement',
      dateField: 'cr_date',
      statusFilter: { status: { $in: ['DRAFT'] } },
      entityField: 'debtor_entity_id',
    },
    {
      key: 'manual_journals',
      modelPath: '../models/JournalEntry',
      dateField: 'je_date',
      statusFilter: { status: 'DRAFT' },
    },
  ];

  for (const col of collections) {
    const Model = (() => { try { return require(col.modelPath); } catch { return null; } })();
    if (!Model) continue;

    const entityField = col.entityField || 'entity_id';
    const filter = {
      [entityField]: entityId,
      [col.dateField]: { $gte: start, $lt: end },
      ...col.statusFilter,
    };

    const count = await Model.countDocuments(filter);
    if (count > 0) {
      findings.push({ module: col.key, period, draft_count: count, ok: false });
    } else {
      findings.push({ module: col.key, period, draft_count: 0, ok: true });
    }
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure scan — used by the script and the agent. No console I/O. No process exits.
// ─────────────────────────────────────────────────────────────────────────────
async function scanAccountingIntegrity({ entityFilter = null, periodOverride = null, checkFilter = 'all' } = {}) {
  const Entity = require('../models/Entity');

  const tolerances = await loadThresholds();
  const coaMap = await loadCoaMap();

  const entityQuery = entityFilter ? { _id: entityFilter } : {};
  const entities = await Entity.find(entityQuery).select('_id name short_name entity_name').lean();
  if (!entities.length) {
    return { entities: [], periods: [], grandFailures: 0, error: 'no entities matched' };
  }

  const currentPeriod = nowYM();
  const previousPeriod = previousYM(currentPeriod);
  const periods = periodOverride ? [periodOverride] : [currentPeriod, previousPeriod];

  const out = [];
  let grandFailures = 0;

  for (const entity of entities) {
    const entityName = entity.short_name || entity.entity_name || entity.name || String(entity._id);
    const block = {
      entityId: String(entity._id),
      entityName,
      tb: [],
      subLedger: [],
      jeMath: [],
      periodClose: [],
      failures: 0,
    };

    if (checkFilter === 'all' || checkFilter === 'tb') {
      block.tb = await checkTrialBalance(entity._id, periods, tolerances.tb);
      block.failures += block.tb.filter((f) => !f.ok).length;
    }
    if (checkFilter === 'all' || checkFilter === 'subledger') {
      block.subLedger = await checkSubLedger(entity._id, coaMap, tolerances.subledger, tolerances.subledgerEnforce);
      // Informational findings (default: true) never count as failures even if
      // diff > tolerance. Admin enables strict recon by setting subledger_enforce.
      block.failures += block.subLedger.filter((f) => !f.ok && !f.informational).length;
    }
    if (checkFilter === 'all' || checkFilter === 'jemath') {
      block.jeMath = await checkJeMath(entity._id, tolerances.jeMath);
      block.failures += block.jeMath.length; // every entry is a failure
    }
    if (checkFilter === 'all' || checkFilter === 'periodclose') {
      block.periodClose = await checkPeriodClose(entity._id, previousPeriod);
      block.failures += block.periodClose.filter((f) => !f.ok).length;
    }

    grandFailures += block.failures;
    out.push(block);
  }

  let icFindings = [];
  if (checkFilter === 'all' || checkFilter === 'ic') {
    icFindings = await checkIcBalance(entities, tolerances.ic);
    // IC findings are informational unless `ok===false` (over-settled detection)
    grandFailures += icFindings.filter((f) => !f.ok).length;
  }

  return {
    entities: out,
    icFindings,
    periods,
    coaMap: { OUTPUT_VAT: coaMap.OUTPUT_VAT, INPUT_VAT: coaMap.INPUT_VAT, CWT_RECEIVABLE: coaMap.CWT_RECEIVABLE },
    tolerances,
    grandFailures,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Running accounting integrity sweep (check=${CHECK_FILTER})…\n`);

  const result = await scanAccountingIntegrity({
    entityFilter: ENTITY_FILTER && ENTITY_FILTER !== true ? ENTITY_FILTER : null,
    periodOverride: PERIOD_OVERRIDE && PERIOD_OVERRIDE !== true ? PERIOD_OVERRIDE : null,
    checkFilter: CHECK_FILTER,
  });

  if (result.error) {
    console.error('Failed:', result.error);
    await mongoose.disconnect();
    process.exit(2);
  }

  console.log(`Periods scanned: ${result.periods.join(', ')}`);
  console.log(`Tolerances: TB=${result.tolerances.tb} JE=${result.tolerances.jeMath} subLedger=${result.tolerances.subledger} IC=${result.tolerances.ic}\n`);

  const csvRows = [];

  for (const ent of result.entities) {
    console.log(`═══ ${ent.entityName} (${ent.failures} issue${ent.failures === 1 ? '' : 's'}) ═══`);

    if (ent.tb.length) {
      for (const f of ent.tb) {
        const status = f.ok ? '✓' : '⚠';
        console.log(`  [TB ${f.scope}] ${status} DR ${f.total_debit.toFixed(2)} | CR ${f.total_credit.toFixed(2)} | diff ${f.diff.toFixed(4)} | ${f.je_count} JEs`);
        if (EMIT_CSV && !f.ok) {
          csvRows.push([ent.entityName, 'TB', f.scope, f.total_debit, f.total_credit, f.diff].join(','));
        }
      }
    }

    if (ent.subLedger.length) {
      for (const f of ent.subLedger) {
        const status = f.informational ? 'ⓘ' : (f.ok ? '✓' : '⚠');
        const tag = f.informational ? ' (info; PH cash-vs-accrual basis split — see header note)' : '';
        console.log(`  [${f.ledger} ${f.scope}] ${status} sub-ledger=${f.sub_ledger_total.toFixed(2)} | GL=${f.gl_net.toFixed(2)} | diff ${f.diff.toFixed(2)} | COA ${f.coa_code}${tag}`);
        if (EMIT_CSV && (f.informational || !f.ok)) {
          csvRows.push([ent.entityName, f.ledger, f.scope, f.sub_ledger_total, f.gl_net, f.diff].join(','));
        }
      }
    }

    if (ent.jeMath.length) {
      for (const f of ent.jeMath) {
        console.log(`  [JE-MATH] ⚠ ${f.je_number} (${f.period}) DR ${f.stored_debit.toFixed(2)} ≠ CR ${f.stored_credit.toFixed(2)} | recomputed DR ${f.recomputed_debit.toFixed(2)} CR ${f.recomputed_credit.toFixed(2)}`);
        if (EMIT_CSV) {
          csvRows.push([ent.entityName, 'JE_MATH', f.je_number, f.stored_debit, f.stored_credit, f.diff].join(','));
        }
      }
    }

    if (ent.periodClose.length) {
      for (const f of ent.periodClose) {
        const status = f.ok ? '✓' : '⚠';
        console.log(`  [PERIOD-CLOSE ${f.period}] ${status} ${f.module}: ${f.draft_count} draft/unposted`);
        if (EMIT_CSV && !f.ok) {
          csvRows.push([ent.entityName, 'PERIOD_CLOSE', f.period, f.module, f.draft_count].join(','));
        }
      }
    }
    console.log('');
  }

  if (result.icFindings.length) {
    console.log('═══ Inter-entity (IC) balances ═══');
    for (const f of result.icFindings) {
      const status = f.ok ? '✓' : '⚠';
      console.log(`  ${status} ${f.creditor} → ${f.debtor}: open ₱${f.open_balance.toFixed(2)} (transfers ${f.transfer_count}, settled ₱${f.settled_total.toFixed(2)})`);
      if (EMIT_CSV) {
        csvRows.push([f.creditor, 'IC_OPEN', f.debtor, f.transfer_total, f.settled_total, f.open_balance].join(','));
      }
    }
    console.log('');
  }

  console.log(`═══ Total failures across all entities: ${result.grandFailures} ═══`);

  if (EMIT_CSV && csvRows.length) {
    console.log('\n--- CSV BEGIN ---');
    console.log('entity,check,scope,col1,col2,col3');
    for (const line of csvRows) console.log(line);
    console.log('--- CSV END ---');
  }

  if (result.grandFailures > 0) {
    console.log('\nRepair path:');
    console.log('  • TB unbalanced: search ErpAuditLog for direct-DB writes; recompute totals via JE.save()');
    console.log('  • Sub-ledger drift: rerun the source events JE engine, or re-tag VatLedger/CwtLedger entries');
    console.log('  • JE-math: open the offending JE, re-save (pre-save validator recomputes totals)');
    console.log('  • IC over-settled: void the excess IcSettlement, re-issue with correct settled_transfers');
    console.log('  • Period-close drafts: post (or void) every draft listed before flipping the PeriodLock');
  }

  await mongoose.disconnect();
  process.exit(result.grandFailures > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Failed:', err);
    process.exit(2);
  });
}

module.exports = {
  scanAccountingIntegrity,
  checkTrialBalance,
  checkSubLedger,
  checkJeMath,
  checkIcBalance,
  checkPeriodClose,
  loadThresholds,
  loadCoaMap,
  nowYM,
  previousYM,
  DEFAULTS: {
    DEFAULT_TB_TOLERANCE,
    DEFAULT_JE_MATH_TOLERANCE,
    DEFAULT_SUBLEDGER_TOLERANCE,
    DEFAULT_IC_TOLERANCE,
  },
};
