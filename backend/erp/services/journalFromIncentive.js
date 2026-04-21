/**
 * journalFromIncentive — Phase SG-Q2 Week 2
 *
 * Produces two JE shapes for Sales Goal incentive payouts:
 *   - ACCRUAL: DR INCENTIVE_EXPENSE, CR INCENTIVE_ACCRUAL (timing = tier qualification)
 *   - SETTLEMENT: DR INCENTIVE_ACCRUAL, CR funding COA (timing = payout paid)
 *
 * Reversal reuses `reverseJournal()` from journalEngine.js (SAP Storno).
 *
 * Every code path reads COA_MAP via autoJournal.getCoaMap() — codes are lookup-
 * driven and subscriber-configurable via Control Center. Rule #19 compliance.
 */

const ChartOfAccounts = require('../models/ChartOfAccounts');
const { getCoaMap, resolveFundingCoa } = require('./autoJournal');
const { createAndPostJournal, reverseJournal } = require('./journalEngine');

// Phase 35 — first-digit heuristic for contra marking. Funding COA from Settings
// is typically a DEBIT-normal asset (1xxx cash/bank/CC). Crediting it is a reduction.
function isDebitNormalByCode(code) {
  const d = String(code || '').charAt(0);
  return d === '1' || d === '5' || d === '6';
}

function periodFromDate(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Validate a COA code against ChartOfAccounts for the given entity (Rule #19).
 * Returns { ok, name } — name falls back to the lookup label when COA row
 * exists but has no account_name. ok=false means the COA row is missing or
 * inactive — callers must surface an error instead of silently posting to
 * '9999'.
 */
async function validateCoa(entityId, code, fallbackName) {
  if (!code) return { ok: false, name: fallbackName || code };
  const row = await ChartOfAccounts.findOne({
    entity_id: entityId,
    account_code: code,
    is_active: true,
  }).select('account_name').lean();
  if (!row) return { ok: false, name: fallbackName || code };
  return { ok: true, name: row.account_name || fallbackName || code };
}

/**
 * Build + post the accrual JE for an IncentivePayout row.
 * @param {Object} payout    — IncentivePayout document (must include entity_id, tier_budget > 0)
 * @param {String} planRef   — SalesGoalPlan.reference (e.g. "SG-VIP2604-001")
 * @param {String} bdmLabel  — "full_name — bdm_code" or similar (for JE description)
 * @param {String} userId    — who is posting
 * @param {Object} [options] — { session } for transaction support
 * @returns {JournalEntry} the POSTED accrual journal
 */
async function postAccrualJournal(payout, planRef, bdmLabel, userId, options = {}) {
  const amount = Number(payout.tier_budget) || 0;
  if (amount <= 0) throw new Error('Cannot accrue zero-amount incentive payout');

  const coa = await getCoaMap();
  const expCode = coa.INCENTIVE_EXPENSE;
  const accrCode = coa.INCENTIVE_ACCRUAL;
  if (!expCode || !accrCode) {
    throw new Error('COA_MAP.INCENTIVE_EXPENSE / INCENTIVE_ACCRUAL not configured — set via Control Center → ERP Settings');
  }

  const [expCoa, accrCoa] = await Promise.all([
    validateCoa(payout.entity_id, expCode, 'Incentive Expense'),
    validateCoa(payout.entity_id, accrCode, 'Incentive Accrual Payable'),
  ]);
  if (!expCoa.ok) throw new Error(`COA ${expCode} (INCENTIVE_EXPENSE) not found/inactive in ChartOfAccounts for this entity`);
  if (!accrCoa.ok) throw new Error(`COA ${accrCode} (INCENTIVE_ACCRUAL) not found/inactive in ChartOfAccounts for this entity`);

  const now = new Date();
  const docRef = `INC-${planRef || payout.plan_id}-${payout.period}-${payout.tier_code}`;
  const description = `Incentive accrual — ${bdmLabel || 'BDM'} — ${payout.tier_label || payout.tier_code} — ${payout.period}`;

  return createAndPostJournal(payout.entity_id, {
    je_date: now,
    period: periodFromDate(now),
    description,
    source_module: 'SALES_GOAL',
    source_event_id: payout._id,
    source_doc_ref: docRef,
    bdm_id: payout.bdm_id || null,
    lines: [
      { account_code: expCode, account_name: expCoa.name, debit: amount, credit: 0, description },
      { account_code: accrCode, account_name: accrCoa.name, debit: 0, credit: amount, description },
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId,
  }, options);
}

/**
 * Build + post the settlement JE when an IncentivePayout is marked PAID.
 * DR INCENTIVE_ACCRUAL, CR funding COA (resolved from paid_via PAYMENT_MODE
 * via PaymentMode.coa_code, or CASH_ON_HAND fallback when paid_via is blank).
 */
async function postSettlementJournal(payout, planRef, bdmLabel, userId, paidViaDoc, options = {}) {
  const amount = Number(payout.tier_budget) || 0;
  if (amount <= 0) throw new Error('Cannot settle zero-amount incentive payout');

  const coa = await getCoaMap();
  const accrCode = coa.INCENTIVE_ACCRUAL;
  if (!accrCode) {
    throw new Error('COA_MAP.INCENTIVE_ACCRUAL not configured — set via Control Center → ERP Settings');
  }

  const accrCoa = await validateCoa(payout.entity_id, accrCode, 'Incentive Accrual Payable');
  if (!accrCoa.ok) throw new Error(`COA ${accrCode} (INCENTIVE_ACCRUAL) not found/inactive`);

  // Resolve funding COA — paidViaDoc is a PaymentMode record; fall back to cash.
  let funding;
  if (paidViaDoc?.coa_code) {
    funding = { coa_code: paidViaDoc.coa_code, coa_name: paidViaDoc.mode_name || paidViaDoc.coa_code };
  } else {
    funding = await resolveFundingCoa({}, coa.CASH_ON_HAND);
  }

  const now = new Date();
  const docRef = `INC-PAID-${planRef || payout.plan_id}-${payout.period}-${payout.tier_code}`;
  const description = `Incentive payout settlement — ${bdmLabel || 'BDM'} — ${payout.tier_label || payout.tier_code} — ${payout.period}`;

  return createAndPostJournal(payout.entity_id, {
    je_date: now,
    period: periodFromDate(now),
    description,
    source_module: 'SALES_GOAL',
    source_event_id: payout._id,
    source_doc_ref: docRef,
    bdm_id: payout.bdm_id || null,
    lines: [
      // DR INCENTIVE_ACCRUAL reduces a CREDIT-normal liability — contra.
      { account_code: accrCode, account_name: accrCoa.name, debit: amount, credit: 0, description, is_contra: true },
      // CR funding reduces the asset we're paying out of (cash/bank/CC/petty cash).
      { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: amount, description, is_contra: isDebitNormalByCode(funding.coa_code) },
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId,
  }, options);
}

/**
 * Reverse the accrual JE (SAP Storno via reverseJournal). Uses its own
 * transaction. Caller should also flip the IncentivePayout.status to REVERSED
 * AFTER this call succeeds.
 */
async function reverseAccrualJournal(journalId, reason, userId, entityId) {
  return reverseJournal(journalId, reason, userId, entityId);
}

module.exports = {
  postAccrualJournal,
  postSettlementJournal,
  reverseAccrualJournal,
};
