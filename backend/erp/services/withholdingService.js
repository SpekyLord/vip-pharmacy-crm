/**
 * withholdingService — Phase VIP-1.J / J2 (Apr 2026).
 *
 * Engine-side helpers that document-post controllers call to emit
 * WithholdingLedger rows. Mirrors the createVatEntry shape so a future
 * harness for sub-ledger reconciliation (`findAccountingIntegrityIssues`)
 * stays trivial to extend.
 *
 * Public API:
 *   • resolveAtcCodeForExpenseLine({ entity, line, vendor }) — returns
 *     { atc_code, rate, payee_kind, payee_id, payee_name, payee_tin,
 *       payee_address } or null when withholding does not apply. Bakes in
 *     the WI010 ↔ WI011 (5% ↔ 10%) YTD threshold flip and the TWA goods/
 *     services bucket choice.
 *
 *   • resolveAtcCodeForPrfRent({ entity, prf, vendor }) — same shape but
 *     for 1606 (rent) PRF lines. Distinguishes WI160 (individual lessor)
 *     vs WC160 (corporate lessor) using `vendor.payee_kind` (or
 *     `vendor.is_landlord && payee_kind` overrides).
 *
 *   • createWithholdingEntries(entries, opts) — bulk insert, idempotent on
 *     `source_event_id` (calling code may pass a session for the same
 *     transaction guarantees as the journal write).
 *
 *   • deleteWithholdingEntriesForEvent(eventId, opts) — reversal path.
 *     Mirrors VatLedger.deleteMany on reversal (journalEngine.js:168).
 *
 *   • getYtdGrossForPayee(entityId, payeeKind, payeeId, year) — used by
 *     the threshold-flip resolver and by the Withholding Posture card.
 *
 * Subscription-readiness:
 *   • ATC catalog comes from BIR_ATC_CODES lookup with sensible inline
 *     defaults. Subscribers can extend (e.g. WI105 for talent fees) without
 *     a code change. `metadata.rate` is honored if present, else falls back
 *     to the inline DEFAULT_RATES table.
 *   • Threshold (YTD ₱720k) is overridable per entity via Settings
 *     `WITHHOLDING_THRESHOLD_INDIVIDUAL_LOW` (defaults 720_000). Same for
 *     corporate (defaults 720_000 — same number historically; separate
 *     setting future-proofs subscriber jurisdictions).
 */

const mongoose = require('mongoose');
const WithholdingLedger = require('../models/WithholdingLedger');
const Lookup = require('../models/Lookup');
const Settings = require('../models/Settings');

// Inline fallbacks — used if BIR_ATC_CODES lookup is empty for the entity.
// Mirrors lookupGenericController SEED_DEFAULTS so behavior is identical
// whether the lookup has been seeded or not.
//
// Phase J3 (May 2026) — compensation buckets (WCOMP/W13TH/WMWE) are
// engine-internal codes, NOT BIR ATC codes. They never collide with the
// J2 EWT codes above because the COMPENSATION direction filter isolates
// them at every aggregator query. WMWE's rate=0 reflects the TRAIN-Law
// MWE exemption — gross is recorded for 1604-CF Schedule 7.2, withheld
// is forced to 0.
const DEFAULT_RATES = Object.freeze({
  WI010: 0.05, WI011: 0.10,
  WC010: 0.10, WC011: 0.15,
  WI160: 0.05, WC160: 0.05,
  WI080: 0.01, WI081: 0.02,
  WC158: 0.01,
  // J3 — compensation withholding (rate is computed via tax tables; this
  // is just a marker so the row passes validation. Actual withheld_amount
  // comes from Payslip.deductions.withholding_tax — never from rate × gross).
  WI100: 0,    // Regular taxable compensation — graduated tax table (form 1601-C)
  WC120: 0,    // 13th-month + bonuses excess of ₱90k taxable portion (form 1601-C)
  WMWE:  0,    // Minimum wage earner (exempt under TRAIN; reported on 1604-CF Sch 7.2)
});

const DEFAULT_FORM_FOR_ATC = Object.freeze({
  WI010: '1601-EQ', WI011: '1601-EQ',
  WC010: '1601-EQ', WC011: '1601-EQ',
  WI160: '1606',    WC160: '1606',
  WI080: '1601-EQ', WI081: '1601-EQ',
  WC158: '2307-IN',
  // J3 — compensation buckets (BIR-actual codes; reused via direction filter)
  WI100: '1601-C', WC120: '1601-C', WMWE: '1601-C',
});

// J3 — engine-internal codes for compensation withholding direction.
// Centralized so the bridge helper, the aggregator, and the alphalist
// all read the same source of truth. WI100 + WC120 mirror the BIR ATC
// catalog for compensation income (Filipino employee, 13th-month excess);
// WMWE is engine-internal — there is no BIR ATC for MWE because they are
// outright exempt, but we still record the gross for 1604-CF Sch 7.2.
const COMPENSATION_ATC_CODES = Object.freeze({
  REGULAR: 'WI100',
  THIRTEENTH_MONTH_EXCESS: 'WC120',
  MWE: 'WMWE',
});

// 13th-month + bonuses tax-free threshold under TRAIN Law (RA 10963).
// Configurable per entity via Settings — subscribers in jurisdictions with
// different thresholds (or future PH legislative changes) override without
// code deploy.
const DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP = 90_000;

const ATC_CACHE_TTL_MS = 60_000;
const _atcCache = new Map();

async function getAtcMetadata(entityId, code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  const cacheKey = `${entityId || '__GLOBAL__'}::${upper}`;
  const hit = _atcCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < ATC_CACHE_TTL_MS) return hit.meta;

  let meta = null;
  try {
    const filter = { category: 'BIR_ATC_CODES', code: upper, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const row = await Lookup.findOne(filter).lean();
    if (row) {
      meta = {
        rate: typeof row.metadata?.rate === 'number' ? row.metadata.rate : DEFAULT_RATES[upper] || 0,
        applies_to: row.metadata?.applies_to || null,
        form: row.metadata?.form || DEFAULT_FORM_FOR_ATC[upper] || null,
        label: row.label,
      };
    }
  } catch (err) {
    console.warn(`[withholdingService] BIR_ATC_CODES lookup failed for ${upper}:`, err.message);
  }
  if (!meta && DEFAULT_RATES[upper] !== undefined) {
    meta = { rate: DEFAULT_RATES[upper], applies_to: null, form: DEFAULT_FORM_FOR_ATC[upper] || null, label: upper };
  }
  _atcCache.set(cacheKey, { ts: Date.now(), meta });
  return meta;
}

function invalidateAtcCache(entityId) {
  if (!entityId) {
    _atcCache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_atcCache.keys())) {
    if (key.startsWith(prefix)) _atcCache.delete(key);
  }
}

// ── YTD running totals for threshold flip ───────────────────────────────
async function getYtdGrossForPayee(entityId, payeeKind, payeeId, year, beforePeriod = null) {
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const periodFilter = beforePeriod
    ? { $gte: yearStart, $lt: beforePeriod }
    : { $gte: yearStart, $lte: yearEnd };

  const result = await WithholdingLedger.aggregate([
    {
      $match: {
        entity_id: entityId,
        direction: 'OUTBOUND',
        payee_kind: payeeKind,
        payee_id: payeeId,
        period: periodFilter,
        finance_tag: { $ne: 'EXCLUDE' },
      },
    },
    {
      $group: {
        _id: null,
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  return result[0] || { gross: 0, withheld: 0, count: 0 };
}

async function getThreshold(entityId, key, fallback) {
  try {
    const val = await Settings.getValue?.(entityId, key);
    if (typeof val === 'number') return val;
  } catch { /* fall through */ }
  return fallback;
}

// ── ATC resolver for expense lines (1601-EQ scope) ──────────────────────
/**
 * Returns null if no withholding applies; otherwise returns the descriptor
 * the engine writes to WithholdingLedger.
 *
 * Decision tree:
 *   1) Explicit `line.atc_code` set → use it (subscriber-defined catalog wins).
 *   2) Vendor-tagged TWA bucket via `vendor.default_atc_code` (WI080/WI081).
 *   3) Vendor not flagged → no withholding (returns null).
 *
 * Threshold flip (WI010 → WI011, WC010 → WC011) only fires when the
 * starting bucket is one of {WI010, WC010} — explicit subscriber buckets
 * stay as-set so jurisdiction-specific ATC codes don't get mutated.
 */
async function resolveAtcCodeForExpenseLine({ entity, line, vendor, period }) {
  if (!entity?.withholding_active) return null;
  if (!line) return null;

  let atcCode = line.atc_code ? String(line.atc_code).toUpperCase() : null;
  let payee = null;

  if (vendor) {
    payee = {
      kind: 'VendorMaster',
      id: vendor._id,
      name: vendor.vendor_name,
      tin: vendor.tin || null,
      address: vendor.address || null,
    };
    if (!atcCode && vendor.withhold_active && vendor.default_atc_code) {
      atcCode = String(vendor.default_atc_code).toUpperCase();
    }
  }
  if (!atcCode) return null;

  // Threshold flip on individual / corporate professional fees only.
  const yearStr = String(period || '').slice(0, 4);
  const year = parseInt(yearStr, 10);
  if (Number.isInteger(year) && payee && (atcCode === 'WI010' || atcCode === 'WC010')) {
    const ytd = await getYtdGrossForPayee(entity._id, payee.kind, payee.id, year, period);
    const threshold = await getThreshold(entity._id, 'WITHHOLDING_THRESHOLD_INDIVIDUAL_LOW', 720_000);
    const after = ytd.gross + (line.amount || 0);
    if (after > threshold) atcCode = atcCode === 'WI010' ? 'WI011' : 'WC011';
  }

  const meta = await getAtcMetadata(entity._id, atcCode);
  if (!meta) return null;

  return {
    atc_code: atcCode,
    form_code: meta.form,
    rate: typeof meta.rate === 'number' ? meta.rate : 0,
    payee_kind: payee?.kind || 'Other',
    payee_id: payee?.id || null,
    payee_name_snapshot: payee?.name || null,
    payee_tin_snapshot: payee?.tin || null,
    payee_address_snapshot: payee?.address || null,
  };
}

// ── ATC resolver for PRF rent lines (1606 scope) ────────────────────────
async function resolveAtcCodeForPrfRent({ entity, prf, vendor }) {
  if (!entity?.rent_withholding_active) return null;
  if (!prf || prf.doc_type !== 'PRF') return null;

  let atcCode = prf.atc_code ? String(prf.atc_code).toUpperCase() : null;
  if (!atcCode && vendor?.is_landlord && vendor?.default_atc_code) {
    atcCode = String(vendor.default_atc_code).toUpperCase();
  }
  if (!atcCode && vendor?.is_landlord) {
    // Inferred default — individual landlord pattern is the most common.
    atcCode = vendor?.payee_kind === 'CORPORATION' ? 'WC160' : 'WI160';
  }
  if (!atcCode) return null;
  if (atcCode !== 'WI160' && atcCode !== 'WC160') {
    // Caller passed an EWT code (e.g. WI010) on a PRF — wrong form. Skip.
    return null;
  }

  const meta = await getAtcMetadata(entity._id, atcCode);
  if (!meta) return null;

  const payeeName = prf.payee_name || vendor?.vendor_name || 'Landlord';
  return {
    atc_code: atcCode,
    form_code: meta.form,
    rate: typeof meta.rate === 'number' ? meta.rate : 0.05,
    payee_kind: vendor ? 'VendorMaster' : 'Other',
    payee_id: vendor?._id || prf.partner_id || null,
    payee_name_snapshot: payeeName,
    payee_tin_snapshot: vendor?.tin || null,
    payee_address_snapshot: vendor?.address || null,
  };
}

// ── Bulk insert + reversal ──────────────────────────────────────────────
async function createWithholdingEntries(entries, opts = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const docs = entries.map(e => ({
    entity_id: e.entity_id,
    period: e.period,
    direction: e.direction || 'OUTBOUND',
    atc_code: e.atc_code,
    form_code: e.form_code || null,
    payee_kind: e.payee_kind,
    payee_id: e.payee_id,
    payee_name_snapshot: e.payee_name_snapshot || null,
    payee_tin_snapshot: e.payee_tin_snapshot || null,
    payee_address_snapshot: e.payee_address_snapshot || null,
    gross_amount: round2(e.gross_amount || 0),
    withholding_rate: e.withholding_rate || 0,
    withheld_amount: round2(e.withheld_amount ?? (e.gross_amount * (e.withholding_rate || 0))),
    source_module: e.source_module,
    source_doc_ref: e.source_doc_ref || null,
    source_event_id: e.source_event_id || null,
    source_line_id: e.source_line_id || null,
    bdm_id: e.bdm_id || null,
    finance_tag: e.finance_tag || 'PENDING',
    ytd_gross_at_post: e.ytd_gross_at_post || 0,
    ytd_withheld_at_post: e.ytd_withheld_at_post || 0,
    notes: e.notes || null,
  }));
  const session = opts.session || null;
  if (session) {
    return WithholdingLedger.insertMany(docs, { session });
  }
  return WithholdingLedger.insertMany(docs);
}

async function deleteWithholdingEntriesForEvent(eventId, opts = {}) {
  if (!eventId) return { deletedCount: 0 };
  const filter = { source_event_id: eventId };
  if (opts.session) {
    return WithholdingLedger.deleteMany(filter).session(opts.session);
  }
  return WithholdingLedger.deleteMany(filter);
}

// ── Posture metrics for dashboard ───────────────────────────────────────
async function buildPosture(entityId, year) {
  if (!entityId || !year) {
    return {
      enabled: false,
      contractors_not_withheld: 0,
      estimated_ytd_payout: 0,
      estimated_annual_payout: 0,
      threshold_trip_at: 720_000,
      breakdown: [],
    };
  }
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const rows = await WithholdingLedger.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(String(entityId)),
        direction: 'OUTBOUND',
        period: { $gte: yearStart, $lte: yearEnd },
        finance_tag: { $ne: 'EXCLUDE' },
      },
    },
    {
      $group: {
        _id: { atc_code: '$atc_code', payee_id: '$payee_id', payee_kind: '$payee_kind' },
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
        last_period: { $max: '$period' },
        payee_name: { $last: '$payee_name_snapshot' },
      },
    },
    { $sort: { gross: -1 } },
    { $limit: 50 },
  ]);

  const totals = rows.reduce((acc, r) => {
    acc.gross += r.gross;
    acc.withheld += r.withheld;
    return acc;
  }, { gross: 0, withheld: 0 });

  // Annualize YTD by linear extrapolation of months elapsed.
  const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
  const annualEstimate = Math.round((totals.gross / monthsElapsed) * 12);

  return {
    enabled: true,
    contractors_not_withheld: 0, // Filled by controller from PeopleMaster scan
    estimated_ytd_payout: round2(totals.gross),
    estimated_ytd_withheld: round2(totals.withheld),
    estimated_annual_payout: annualEstimate,
    threshold_trip_at: 720_000,
    breakdown: rows.map(r => ({
      atc_code: r._id.atc_code,
      payee_kind: r._id.payee_kind,
      payee_id: r._id.payee_id,
      payee_name: r.payee_name,
      gross: round2(r.gross),
      withheld: round2(r.withheld),
      count: r.count,
      last_period: r.last_period,
    })),
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ── J3 — Compensation withholding bridge (Payslip → WithholdingLedger) ──
/**
 * Emits one or more COMPENSATION-direction WithholdingLedger rows for a
 * POSTED Payslip. Called by payrollController + universalApprovalController
 * AFTER createAndPostJournal so the GL + sub-ledger commit together (no
 * orphan rows if the JE write fails).
 *
 * Row decomposition:
 *   • Always emits WCOMP (regular taxable compensation) — gross_amount =
 *     payslip.total_earnings minus the 13th-month excess and minus any MWE
 *     gross. withheld_amount = payslip.deductions.withholding_tax.
 *   • If payslip.earnings.thirteenth_month > exempt_threshold (₱90k by
 *     default), emits W13TH for the EXCESS — tax tables computed it inside
 *     payslip.deductions.withholding_tax already, so withheld_amount on
 *     this row is 0 (just a gross-reporting marker for 1604-CF Sch 7.x).
 *   • If person_type = 'MWE' (PeopleMaster.employment_type = MWE) emits
 *     WMWE with withheld_amount = 0 — the entire compensation goes on
 *     1604-CF Schedule 7.2 (MWE, exempt).
 *
 * Idempotency:
 *   Emit reads the Payslip's _id as `source_event_id` (NOT the JE event id —
 *   payslip is the source-of-truth document). Re-running emit for the same
 *   payslip is safe via the Reversal Console call to
 *   `deleteWithholdingEntriesForEvent(payslip._id)` before re-emit.
 *
 * @param {Object} payslip — full Payslip (must have entity_id, person_id,
 *                            period, total_earnings, deductions, earnings)
 * @param {Object} opts.session — optional Mongo session for transactional posting
 * @param {Object} opts.entity — optional Entity row (read once by caller); if
 *                                absent we lookup `withholding_active`-style flags lazily
 * @param {Object} opts.userId — posted_by, denormalized into `bdm_id`
 * @returns {{ written: Array, skipped: ?string }}
 */
async function emitCompensationWithholdingForPayslip(payslip, opts = {}) {
  if (!payslip) return { written: [], skipped: 'no payslip' };
  if (!payslip.entity_id) return { written: [], skipped: 'no entity_id on payslip' };
  if (!payslip.period || !/^\d{4}-\d{2}$/.test(payslip.period)) {
    return { written: [], skipped: `invalid payslip period: ${payslip.period}` };
  }
  if (!payslip.person_id) return { written: [], skipped: 'no person_id on payslip' };

  // Resolve threshold via Settings (subscriber override). Falls back to ₱90k.
  const exemptThreshold = await getThreshold(
    payslip.entity_id, 'COMPENSATION_13TH_MONTH_EXEMPT', DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP
  );

  const earnings = payslip.earnings || {};
  const deductions = payslip.deductions || {};
  const totalEarnings = Number(payslip.total_earnings) || sumEarnings(earnings);
  const withheldTax = Number(deductions.withholding_tax) || 0;
  const thirteenthMonth = Number(earnings.thirteenth_month) || 0;
  const thirteenthMonthExcess = Math.max(0, thirteenthMonth - exemptThreshold);

  // Snapshot the employee for the alphalist — read PeopleMaster lazily so
  // the bridge stays decoupled from full population.
  // J3 Part B (May 2026) — TIN lives at `government_ids.tin` and is `select:
  // false` on the schema, so the explicit .select('+government_ids.tin') is
  // mandatory. Reading `person.tin` (Part A's typo) always returned undefined
  // → empty snapshot → 1604-CF alphalist with no TINs, which BIR rejects.
  // PeopleMaster has no `address` field today; BIR Alphalist Data Entry
  // accepts empty employee address (the EMPLOYER address is the filing
  // address, captured via Entity.address). Future schema additions for an
  // employee home address would extend this snapshot.
  let personSnapshot = { name: '', tin: '', address: '', employment_type: null, first_name: '', last_name: '' };
  try {
    const PeopleMaster = require('../models/PeopleMaster');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- by-id lookup driven by payslip.person_id; payslip itself is entity-scoped at the caller
    const person = await PeopleMaster.findById(payslip.person_id)
      .select('+government_ids.tin full_name first_name last_name employment_type')
      .lean();
    if (person) {
      personSnapshot = {
        name: person.full_name || person.first_name || '(unnamed employee)',
        tin: person.government_ids?.tin || '',
        address: '', // PeopleMaster has no employee address field today
        employment_type: person.employment_type || null,
        first_name: person.first_name || '',
        last_name: person.last_name || '',
      };
    }
  } catch (err) {
    console.warn(`[withholdingService.emitCompensation] PeopleMaster lookup failed for payslip ${payslip._id}:`, err.message);
  }

  const isMwe = personSnapshot.employment_type === 'MWE';
  const entries = [];

  // Common row shape — direction COMPENSATION, source PAYROLL.
  // J3 Part B (May 2026) — compensation rows auto-tag INCLUDE because the
  // tax was determined upstream by payslipCalc's BIR graduated tax-table
  // math; there is no finance judgment call to make (unlike OUTBOUND rows
  // where finance may decide a contractor isn't subject to withholding).
  // Auto-INCLUDE makes the 1601-C and 1604-CF aggregators (which filter
  // strict INCLUDE) immediately visible after a payroll post — without it,
  // every entity would see "compensation totals always 0" until they
  // discovered the EWT-tagging UI. Subscribers can override per row via
  // finance UI; downstream filters use $ne 'EXCLUDE' so the override sticks.
  const baseRow = {
    entity_id: payslip.entity_id,
    period: payslip.period,
    direction: 'COMPENSATION',
    payee_kind: 'PeopleMaster',
    payee_id: payslip.person_id,
    payee_name_snapshot: personSnapshot.name,
    payee_tin_snapshot: personSnapshot.tin,
    payee_address_snapshot: personSnapshot.address,
    source_module: 'PAYROLL',
    source_doc_ref: `Payslip ${payslip.period} ${personSnapshot.name}`.trim(),
    source_event_id: payslip._id,
    bdm_id: opts.userId || payslip.posted_by || null,
    finance_tag: 'INCLUDE',
    notes: null,
  };

  if (isMwe) {
    // MWE: entire compensation is exempt (TRAIN Law). Withheld must be 0.
    entries.push({
      ...baseRow,
      atc_code: COMPENSATION_ATC_CODES.MWE,
      form_code: '1601-C',
      gross_amount: round2(totalEarnings),
      withholding_rate: 0,
      withheld_amount: 0,
      notes: 'MWE — exempt under TRAIN (RA 10963). Reports on 1604-CF Schedule 7.2.',
    });
  } else {
    // Regular taxable compensation — gross excludes the 13th-month excess so
    // the two row's gross_amounts sum to total_earnings (no double-count).
    const regularGross = round2(totalEarnings - thirteenthMonthExcess);
    if (regularGross > 0 || withheldTax > 0) {
      entries.push({
        ...baseRow,
        atc_code: COMPENSATION_ATC_CODES.REGULAR,
        form_code: '1601-C',
        gross_amount: regularGross,
        withholding_rate: 0, // tax-table computed; rate is meaningless on aggregate
        withheld_amount: round2(withheldTax),
        notes: thirteenthMonthExcess > 0
          ? `Regular comp; 13th-month excess of ₱${round2(thirteenthMonthExcess)} reported on separate W13TH row.`
          : null,
      });
    }
    if (thirteenthMonthExcess > 0) {
      entries.push({
        ...baseRow,
        atc_code: COMPENSATION_ATC_CODES.THIRTEENTH_MONTH_EXCESS,
        form_code: '1601-C',
        gross_amount: round2(thirteenthMonthExcess),
        withholding_rate: 0,
        withheld_amount: 0, // tax already counted in WCOMP row's withheld_amount
        notes: `13th-month + bonuses excess over ₱${exemptThreshold} TRAIN exemption (RA 10963). Tax included in WCOMP row's withheld total.`,
      });
    }
  }

  if (!entries.length) return { written: [], skipped: 'no taxable / reportable compensation' };

  // Idempotent re-emit support — caller may have run reversal first.
  if (opts.deletePrior !== false) {
    await deleteWithholdingEntriesForEvent(payslip._id, { session: opts.session });
  }
  const written = await createWithholdingEntries(entries, { session: opts.session });
  return { written, skipped: null };
}

function sumEarnings(earnings) {
  if (!earnings) return 0;
  let total = 0;
  for (const k of Object.keys(earnings)) {
    const v = Number(earnings[k]);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

// ── J3 — Compensation Posture (1601-C dashboard card) ───────────────────
/**
 * COMPENSATION-direction posture. Mirrors `buildPosture` (which is OUTBOUND-
 * only) but for the 1601-C surface. Surfaces YTD totals + per-employee
 * breakdown + simple flags ("N employees with no withholding YTD" — likely
 * MWE or under-paid).
 */
async function buildCompensationPosture(entityId, year) {
  if (!entityId || !year) {
    return {
      enabled: false,
      employees_count: 0,
      ytd_compensation: 0,
      ytd_withheld: 0,
      mwe_count: 0,
      breakdown: [],
    };
  }
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const rows = await WithholdingLedger.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(String(entityId)),
        direction: 'COMPENSATION',
        period: { $gte: yearStart, $lte: yearEnd },
        finance_tag: { $ne: 'EXCLUDE' },
      },
    },
    {
      $group: {
        _id: { payee_id: '$payee_id', atc_code: '$atc_code' },
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
        last_period: { $max: '$period' },
        payee_name: { $last: '$payee_name_snapshot' },
        payee_tin: { $last: '$payee_tin_snapshot' },
      },
    },
    { $sort: { gross: -1 } },
    { $limit: 200 },
  ]);

  const totals = rows.reduce((acc, r) => {
    acc.gross += r.gross;
    acc.withheld += r.withheld;
    if (r._id.atc_code === COMPENSATION_ATC_CODES.MWE) acc.mweEmployees.add(String(r._id.payee_id));
    acc.allEmployees.add(String(r._id.payee_id));
    return acc;
  }, { gross: 0, withheld: 0, mweEmployees: new Set(), allEmployees: new Set() });

  return {
    enabled: true,
    employees_count: totals.allEmployees.size,
    ytd_compensation: round2(totals.gross),
    ytd_withheld: round2(totals.withheld),
    mwe_count: totals.mweEmployees.size,
    breakdown: rows.map(r => ({
      atc_code: r._id.atc_code,
      payee_id: r._id.payee_id,
      payee_name: r.payee_name,
      payee_tin: r.payee_tin,
      gross: round2(r.gross),
      withheld: round2(r.withheld),
      months_present: r.count,
      last_period: r.last_period,
    })),
  };
}

module.exports = {
  resolveAtcCodeForExpenseLine,
  resolveAtcCodeForPrfRent,
  createWithholdingEntries,
  deleteWithholdingEntriesForEvent,
  getYtdGrossForPayee,
  getAtcMetadata,
  invalidateAtcCache,
  buildPosture,
  // J3 — compensation withholding
  emitCompensationWithholdingForPayslip,
  buildCompensationPosture,
  COMPENSATION_ATC_CODES,
  DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP,
  DEFAULT_RATES,
  DEFAULT_FORM_FOR_ATC,
  // Test seams
  _internals: { round2, sumEarnings },
};
