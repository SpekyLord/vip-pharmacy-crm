/**
 * Accounting Integrity Agent — Apr 2026 follow-up to Orphan Ledger Audit.
 *
 * Five strict + one informational checks per entity per scan:
 *   1. Trial balance balanced (cumulative + per-period) — STRICT
 *   2. Sub-ledger == control account (VAT/CWT cumulative) — INFORMATIONAL by
 *      default; the PH JE engine recognizes OUTPUT_VAT on Sale POST (accrual)
 *      but VatLedger writes on Collection POST (cash for 2550Q). Per-period
 *      equality is impossible by design. Admin flips
 *      `subledger_enforce: true` in the ACCOUNTING_INTEGRITY_THRESHOLDS lookup
 *      once their org commits to a single recognition basis end-to-end.
 *   3. JE-row math sanity (per-row total_debit == total_credit) — STRICT
 *   4. Inter-entity (IC) imbalance (over-settled = settlements > transfers) — STRICT
 *   5. Period-close readiness (DRAFT/VALID transactional docs in previous month) — STRICT
 *
 * Reuses the standalone script's pure scan in
 * `backend/erp/scripts/findAccountingIntegrityIssues.js` so the script and the
 * agent never drift apart in their findings.
 *
 * Notification — same plumbing as orphanLedgerAuditAgent:
 *   • PRESIDENT (in_app + email)
 *   • ALL_ADMINS (in_app) — already includes admin + finance + president + ceo
 *     via ROLE_SETS.ADMIN_LIKE in backend/constants/roles.js, so finance
 *     receives the alert without a third recipient resolver.
 * Priority: 'high' if TB out-of-balance OR JE-math drift > 0; 'important'
 * otherwise (period-close drafts, IC over-settled).
 *
 * Schedule: Daily 04:00 Asia/Manila — clean slot after orphan_ledger_audit (03:00).
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

const MAX_ROWS_PER_BLOCK_IN_BODY = 10;
const MAX_BODY_LINES = 160;

function tryRequire(modulePath) {
  try { return require(modulePath); } catch { return null; }
}

/**
 * Pure scan: delegates to the standalone script's exported helper. Keeps a
 * single source of truth for the integrity-check semantics.
 */
async function scanIntegrity({ entityFilter = null, periodOverride = null } = {}) {
  const script = tryRequire('../erp/scripts/findAccountingIntegrityIssues');
  if (!script || typeof script.scanAccountingIntegrity !== 'function') {
    return {
      entities: [],
      icFindings: [],
      periods: [],
      grandFailures: 0,
      error: 'findAccountingIntegrityIssues.js missing or no scanAccountingIntegrity export',
    };
  }
  return script.scanAccountingIntegrity({
    entityFilter,
    periodOverride,
    checkFilter: 'all',
  });
}

function fmtPeso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildNotificationBody(scan) {
  const lines = [];
  lines.push(`Accounting Integrity — ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Strict failures across all entities: ${scan.grandFailures}`);
  lines.push(`Periods scanned: ${(scan.periods || []).join(', ')}`);
  lines.push(`Tolerances — TB: ${scan.tolerances.tb} · JE-math: ${scan.tolerances.jeMath} · sub-ledger: ${scan.tolerances.subledger} (${scan.tolerances.subledgerEnforce ? 'STRICT' : 'INFO'}) · IC: ${scan.tolerances.ic}`);
  lines.push('');

  for (const ent of scan.entities) {
    if (lines.length > MAX_BODY_LINES) { lines.push('… (output truncated; rerun the script for full detail)'); break; }
    if (ent.failures === 0) continue; // body only includes entities with strict failures
    lines.push(`═══ ${ent.entityName} (${ent.failures} strict failure${ent.failures === 1 ? '' : 's'}) ═══`);

    // TB
    const tbBad = (ent.tb || []).filter((f) => !f.ok);
    for (const f of tbBad.slice(0, MAX_ROWS_PER_BLOCK_IN_BODY)) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  [TB ${f.scope}] ⚠ DR ${fmtPeso(f.total_debit)} ≠ CR ${fmtPeso(f.total_credit)} (diff ${fmtPeso(f.diff)})`);
    }

    // JE math
    const jeBad = ent.jeMath || [];
    for (const f of jeBad.slice(0, MAX_ROWS_PER_BLOCK_IN_BODY)) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  [JE-MATH] ⚠ ${f.je_number} (${f.period}) stored DR ${fmtPeso(f.stored_debit)} / CR ${fmtPeso(f.stored_credit)}; recomputed DR ${fmtPeso(f.recomputed_debit)} / CR ${fmtPeso(f.recomputed_credit)}`);
    }
    if (jeBad.length > MAX_ROWS_PER_BLOCK_IN_BODY) {
      lines.push(`  [JE-MATH] … (+${jeBad.length - MAX_ROWS_PER_BLOCK_IN_BODY} more JE rows hidden)`);
    }

    // Sub-ledger STRICT failures only (informational rows skipped here)
    const subBad = (ent.subLedger || []).filter((f) => !f.ok && !f.informational);
    for (const f of subBad.slice(0, MAX_ROWS_PER_BLOCK_IN_BODY)) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  [${f.ledger} ${f.scope}] ⚠ sub-ledger ${fmtPeso(f.sub_ledger_total)} ≠ GL ${fmtPeso(f.gl_net)} (diff ${fmtPeso(f.diff)}, COA ${f.coa_code})`);
    }

    // Period close
    const pcBad = (ent.periodClose || []).filter((f) => !f.ok);
    for (const f of pcBad) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  [PERIOD-CLOSE ${f.period}] ⚠ ${f.module}: ${f.draft_count} unposted draft(s)`);
    }

    lines.push('');
  }

  // IC failures (over-settled) — these are entity-pair findings, not per-entity
  const icBad = (scan.icFindings || []).filter((f) => !f.ok);
  if (icBad.length) {
    lines.push('═══ Inter-entity (IC) over-settled ═══');
    for (const f of icBad.slice(0, MAX_ROWS_PER_BLOCK_IN_BODY)) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  ⚠ ${f.creditor} → ${f.debtor}: settlements ${fmtPeso(f.settled_total)} > transfers ${fmtPeso(f.transfer_total)} (open ${fmtPeso(f.open_balance)})`);
    }
    lines.push('');
  }

  // Informational sub-ledger drift (always shown so finance has daily visibility,
  // even when the agent doesn't fail)
  const infoSub = scan.entities.flatMap((ent) => (ent.subLedger || [])
    .filter((f) => f.informational && f.diff > 0)
    .map((f) => ({ entity: ent.entityName, ...f })));
  if (infoSub.length) {
    lines.push('ⓘ VAT/CWT cumulative drift (PH cash-vs-accrual split; informational):');
    for (const f of infoSub.slice(0, MAX_ROWS_PER_BLOCK_IN_BODY)) {
      lines.push(`    ${f.entity} ${f.ledger}: GL ${fmtPeso(f.gl_net)} vs sub-ledger ${fmtPeso(f.sub_ledger_total)} (diff ${fmtPeso(f.diff)})`);
    }
    lines.push('  → drift = VAT-portion of open A/R (CSI issued, not yet collected). Verify against open-AR reports.');
    lines.push('  → To make strict, set ACCOUNTING_INTEGRITY_THRESHOLDS.DEFAULT.metadata.subledger_enforce = true.');
    lines.push('');
  }

  lines.push('Repair path:');
  lines.push('  • TB unbalanced — search ErpAuditLog for direct-DB writes; recompute via JE.save().');
  lines.push('  • JE-math drift — open the JE in /erp/journal, re-save (pre-save validator recomputes totals).');
  lines.push('  • IC over-settled — void the excess IcSettlement, re-issue with correct settled_transfers.');
  lines.push('  • Period-close drafts — post (or void) every draft listed before flipping the PeriodLock.');
  lines.push('');
  lines.push('Operator: run `node erp/scripts/findAccountingIntegrityIssues.js --csv` from backend/ for full detail.');

  return lines.join('\n');
}

function buildKeyFindings(scan) {
  const findings = [];
  findings.push(`${scan.grandFailures} strict failure(s) across ${scan.entities.length} entity(s)`);

  // Top failing entity
  const worst = (scan.entities || []).slice().sort((a, b) => b.failures - a.failures)[0];
  if (worst && worst.failures > 0) {
    findings.push(`${worst.entityName} — ${worst.failures} failure(s)`);
  }

  // TB summary
  const allTb = (scan.entities || []).flatMap((e) => e.tb || []);
  const tbBad = allTb.filter((f) => !f.ok);
  if (tbBad.length) {
    findings.push(`Trial balance unbalanced in ${tbBad.length} scope(s)`);
  }

  // JE-math summary
  const jeBad = (scan.entities || []).flatMap((e) => e.jeMath || []);
  if (jeBad.length) {
    findings.push(`${jeBad.length} JE row(s) with debit ≠ credit`);
  }

  // Period close
  const pcBad = (scan.entities || []).flatMap((e) => (e.periodClose || []).filter((f) => !f.ok));
  if (pcBad.length) {
    const totalDrafts = pcBad.reduce((s, f) => s + (f.draft_count || 0), 0);
    findings.push(`${totalDrafts} unposted draft(s) blocking period close`);
  }

  // IC over-settled
  const icBad = (scan.icFindings || []).filter((f) => !f.ok);
  if (icBad.length) {
    findings.push(`${icBad.length} IC pair(s) over-settled`);
  }

  return findings.slice(0, 6);
}

async function run({ entityFilter = null, periodOverride = null } = {}) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { status: 'error', summary: {}, message_ids: [], error_msg: 'mongoose not connected' };
    }

    const scan = await scanIntegrity({ entityFilter, periodOverride });

    if (scan.error) {
      return { status: 'error', summary: {}, message_ids: [], error_msg: scan.error };
    }

    if (scan.grandFailures === 0) {
      return {
        status: 'success',
        summary: {
          alerts_generated: 0,
          messages_sent: 0,
          key_findings: [
            `Trial balance balanced across ${scan.entities.length} entity(s) ✓`,
            `JE-row math clean ✓`,
            `Period-close ready (${(scan.periods || [])[1] || 'previous month'}) ✓`,
            `IC pairs in balance ✓`,
          ],
        },
        message_ids: [],
      };
    }

    const body = buildNotificationBody(scan);
    const allTb = (scan.entities || []).flatMap((e) => e.tb || []);
    const tbBad = allTb.filter((f) => !f.ok);
    const jeBad = (scan.entities || []).flatMap((e) => e.jeMath || []);
    // TB out-of-balance OR JE-math drift = books literally don't add up — high.
    // Period-close drafts + IC over-settled = important but not emergency.
    const priority = (tbBad.length > 0 || jeBad.length > 0) ? 'high' : 'important';

    const title = `Accounting Integrity — ${scan.grandFailures} strict failure(s) across ${scan.entities.length} entity(s)`;

    const presResults = await notify({
      recipient_id: 'PRESIDENT',
      title,
      body,
      category: 'compliance_alert',
      priority,
      channels: ['in_app', 'email'],
      agent: 'accounting_integrity',
    });
    const adminResults = await notify({
      recipient_id: 'ALL_ADMINS',
      title,
      body,
      category: 'compliance_alert',
      priority,
      channels: ['in_app'],
      agent: 'accounting_integrity',
    });

    return {
      status: 'success',
      summary: {
        alerts_generated: scan.grandFailures,
        messages_sent:
          countSuccessfulChannels(presResults, 'in_app') +
          countSuccessfulChannels(adminResults, 'in_app'),
        key_findings: buildKeyFindings(scan),
      },
      message_ids: [
        ...getInAppMessageIds(presResults),
        ...getInAppMessageIds(adminResults),
      ],
    };
  } catch (err) {
    console.error('[AccountingIntegrity] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = {
  run,
  scanIntegrity,
  buildNotificationBody,
  buildKeyFindings,
};
