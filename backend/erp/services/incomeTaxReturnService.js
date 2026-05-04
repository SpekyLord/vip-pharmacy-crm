/**
 * incomeTaxReturnService — Phase VIP-1.J / J7 (May 2026).
 *
 * Annual Income Tax Return aggregator for BIR Form 1702 (Corporation /
 * One-Person Corp / Partnership) and Form 1701 (Sole Proprietorship /
 * Individual). Reads POSTED JournalEntry rows tagged for the BIR view
 * (bir_flag IN [BOTH, BIR]) for the calendar year, partitions them by
 * COA account_type into the BIR-mandated buckets, then derives Tax Due
 * minus Creditable Tax Withheld (via J6 compute1702CwtRollup) plus
 * admin-supplied manual credits (1702-Q paid YTD, foreign tax credit).
 *
 * Source-of-truth boundary:
 *   • POSTED JournalEntry is the source of truth for everything below
 *     the Net Taxable Income line. Rule: do not double-count by reading
 *     source documents (Sales / Expenses) directly — they are already
 *     summed into the GL via auto-journal hooks. Reading both surfaces
 *     would produce drift if a JE was reversed.
 *   • Manual fields (1702-Q paid YTD, foreign tax credit, MCIT applies,
 *     prior year overpayment) live in BirFilingStatus.totals_snapshot.
 *     They are admin-supplied; the service never auto-fills them.
 *
 * 1702 vs 1701:
 *   • 1702-RT (Regular Rate, default): 25% RCIT (CREATE Act 2021+),
 *     20% SME rate when both ceilings met (≤₱5M taxable income AND ≤₱100M
 *     total assets excluding land).
 *   • 1701 (Sole Prop): TRAIN Act graduated brackets 0/15/20/25/30/35%
 *     OR optional 8% flat rate on gross sales/receipts (admin election;
 *     stored on Entity.tax_election_8pct).
 *   • MCIT: 2% of gross income, applies from year 4 of operations
 *     onward, compare against RCIT, take higher. The 4-year clock starts
 *     from Entity.bir_registration_date — falls back to disabled if
 *     unset (subscriber must elect via Tax Config edit).
 *
 * Subscription-readiness:
 *   • Per-entity scoped via entity_id on every aggregation (Rule #19).
 *   • Tax rates lookup-driven via BIR_INCOME_TAX_RATES (Rule #3).
 *   • Account-code ranges classifying lines into Revenue / COGS / OPEX /
 *     Non-Opex / BIR-only follow PRD §11.6 — subscribers whose CoA uses
 *     a different range pattern would override via a future
 *     BIR_INCOME_TAX_ACCOUNT_RANGES lookup (deferred until first non-VIP
 *     subscriber needs it; falls back to the inline ranges today).
 */

const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const Entity = require('../models/Entity');
const cwt2307ReconciliationService = require('./cwt2307ReconciliationService');
const incomeTaxRates = require('../../utils/incomeTaxRates');

// ── Constants ──────────────────────────────────────────────────────────

// Default account-code ranges per PRD §11.6. Subscribers using a different
// CoA scheme should configure this via BIR_INCOME_TAX_ACCOUNT_RANGES
// lookup (deferred until first non-VIP subscriber requests it).
const ACCOUNT_RANGES = Object.freeze({
  REVENUE:        { from: 4000, to: 4999 },
  COST_OF_SALES:  { from: 5000, to: 5999 },
  OPEX:           { from: 6000, to: 6999 },
  NON_OPEX:       { from: 7000, to: 7999 },
  BIR_ONLY:       { from: 8000, to: 8999 },
});

// Individual graduated brackets per TRAIN Act (RA 10963, RA 10963-IRR).
// Effective Jan 1 2023 onward — these are the "permanent" brackets after
// the 2018-2022 transitional table. Apply to 1701 returns when
// entity.tax_election_8pct = false (or unset).
const INDIVIDUAL_GRADUATED_BRACKETS = Object.freeze([
  { from: 0,        to: 250_000,    rate: 0.00, base: 0,         excess_from: 0 },
  { from: 250_001,  to: 400_000,    rate: 0.15, base: 0,         excess_from: 250_000 },
  { from: 400_001,  to: 800_000,    rate: 0.20, base: 22_500,    excess_from: 400_000 },
  { from: 800_001,  to: 2_000_000,  rate: 0.25, base: 102_500,   excess_from: 800_000 },
  { from: 2_000_001, to: 8_000_000, rate: 0.30, base: 402_500,   excess_from: 2_000_000 },
  { from: 8_000_001, to: Infinity,  rate: 0.35, base: 2_202_500, excess_from: 8_000_000 },
]);

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function ensureObjectId(id) {
  if (!id) return null;
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

// ── Aggregations ───────────────────────────────────────────────────────

/**
 * Pull all POSTED JE lines for a fiscal year tagged for BIR view.
 * Returns the per-account-code aggregation with COA metadata joined.
 *
 * Aggregation rules:
 *   • Match: entity_id + status='POSTED' + period IN [Y-01..Y-12] + bir_flag IN [BOTH, BIR]
 *   • Group: by lines.account_code, sum debit + credit
 *   • Then join COA for account_type / account_subtype / account_name
 *
 * Note: we filter by `period` (string YYYY-MM) NOT by `posted_at` Date
 * because period is the BIR-relevant accounting bucket; a JE posted on
 * Jan 5 2027 for period 2026-12 belongs to the 2026 1702.
 */
async function aggregateAnnualBirJEs({ entityId, year }) {
  const periodFrom = `${year}-01`;
  const periodTo   = `${year}-12`;

  const pipeline = [
    {
      $match: {
        entity_id: ensureObjectId(entityId),
        status: 'POSTED',
        period: { $gte: periodFrom, $lte: periodTo },
        bir_flag: { $in: ['BOTH', 'BIR'] },
      },
    },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.account_code',
        account_name: { $first: '$lines.account_name' },
        total_debit: { $sum: '$lines.debit' },
        total_credit: { $sum: '$lines.credit' },
        entry_count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  const aggregated = await JournalEntry.aggregate(pipeline);

  // Join COA metadata
  const coa = await ChartOfAccounts.find({
    entity_id: ensureObjectId(entityId),
    is_active: true,
  }).select('account_code account_name account_type account_subtype normal_balance').lean();
  const coaMap = new Map(coa.map(a => [a.account_code, a]));

  return aggregated.map(row => {
    const meta = coaMap.get(row._id) || {};
    return {
      account_code: row._id,
      account_name: row.account_name || meta.account_name || '',
      account_type: meta.account_type || '',
      account_subtype: meta.account_subtype || '',
      normal_balance: meta.normal_balance || (row.total_credit > row.total_debit ? 'CREDIT' : 'DEBIT'),
      total_debit: round2(row.total_debit),
      total_credit: round2(row.total_credit),
      net_balance: round2(row.total_debit - row.total_credit),
      entry_count: row.entry_count,
    };
  });
}

function inRange(code, range) {
  const numeric = parseInt(code, 10);
  if (!Number.isFinite(numeric)) return false;
  return numeric >= range.from && numeric <= range.to;
}

/**
 * Partition aggregated rows into BIR 1702 buckets. Net amounts use the
 * normal-balance convention:
 *   • Revenue (4000-4999): credit-normal → net = credit - debit
 *   • Costs/Expenses (5000-8999): debit-normal → net = debit - credit
 *
 * Negative numbers indicate ABNORMAL balances (e.g., revenue with net
 * debit, or expense with net credit). They are surfaced in the response
 * so finance can investigate before filing.
 */
function partitionByBucket(rows) {
  const buckets = {
    revenue: [],
    cost_of_sales: [],
    opex: [],
    non_opex: [],
    bir_only: [],
    other: [], // 1000s/2000s/3000s — balance-sheet, never touch P&L
  };
  for (const r of rows) {
    if (inRange(r.account_code, ACCOUNT_RANGES.REVENUE)) {
      // Revenue is credit-normal — net = credit - debit
      const amount = round2(r.total_credit - r.total_debit);
      buckets.revenue.push({ ...r, amount, abnormal: amount < 0 });
    } else if (inRange(r.account_code, ACCOUNT_RANGES.COST_OF_SALES)) {
      const amount = round2(r.total_debit - r.total_credit);
      buckets.cost_of_sales.push({ ...r, amount, abnormal: amount < 0 });
    } else if (inRange(r.account_code, ACCOUNT_RANGES.OPEX)) {
      const amount = round2(r.total_debit - r.total_credit);
      buckets.opex.push({ ...r, amount, abnormal: amount < 0 });
    } else if (inRange(r.account_code, ACCOUNT_RANGES.NON_OPEX)) {
      const amount = round2(r.total_debit - r.total_credit);
      buckets.non_opex.push({ ...r, amount, abnormal: amount < 0 });
    } else if (inRange(r.account_code, ACCOUNT_RANGES.BIR_ONLY)) {
      const amount = round2(r.total_debit - r.total_credit);
      buckets.bir_only.push({ ...r, amount, abnormal: amount < 0 });
    } else {
      // Balance-sheet account — should not normally appear in a BIR-flag P&L
      // aggregate (auto-journal hooks tag balance-sheet-only JEs as INTERNAL,
      // not BOTH/BIR). Surface it so finance can flag mis-tagged JEs.
      buckets.other.push({ ...r, amount: round2(Math.abs(r.total_debit - r.total_credit)) });
    }
  }
  return buckets;
}

function sumBucket(rows) {
  return round2(rows.reduce((s, r) => s + (r.amount || 0), 0));
}

// ── Tax computation ────────────────────────────────────────────────────

/**
 * Apply the 1701 graduated bracket table. Returns the income tax due.
 */
function applyIndividualBrackets(taxableIncome) {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;
  for (const b of INDIVIDUAL_GRADUATED_BRACKETS) {
    if (taxableIncome >= b.from && taxableIncome <= b.to) {
      const excess = taxableIncome - b.excess_from;
      return round2(b.base + excess * b.rate);
    }
  }
  // Should never hit — last bracket has Infinity upper bound.
  return 0;
}

/**
 * Determine the applicable corporate rate. SME rate kicks in only when
 * BOTH the taxable-income ceiling AND the assets ceiling are met.
 *
 * Currently `entity.total_assets_php` is admin-supplied (Tax Config — when
 * unset, we conservatively assume the entity is OVER the threshold and
 * apply the regular rate). This means a small subscriber must explicitly
 * record their assets to get the SME rate, which matches BIR audit
 * posture (the burden of proof is on the taxpayer claiming the lower
 * rate).
 */
function determineCorpRate({ taxableIncome, entity, rates }) {
  const assets = Number(entity?.total_assets_php) || null;
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) {
    return { rate: rates.CORP_REGULAR_RATE, basis: 'NO_TAX_DUE_TAXABLE_INCOME_NEGATIVE_OR_ZERO' };
  }
  if (
    taxableIncome <= rates.CORP_SME_TAXABLE_THRESHOLD_PHP
    && assets !== null
    && assets <= rates.CORP_SME_ASSETS_THRESHOLD_PHP
  ) {
    return { rate: rates.CORP_SME_RATE, basis: 'CORP_SME_RATE' };
  }
  return { rate: rates.CORP_REGULAR_RATE, basis: 'CORP_REGULAR_RATE' };
}

/**
 * MCIT applies from year 4 of operations onward. Compare RCIT (rate ×
 * taxable income) against MCIT (rate × gross income), take the higher.
 *
 * If `entity.bir_registration_date` is unset, MCIT is disabled (returns
 * { applies: false }) and admin must elect MCIT manually via Tax Config.
 */
function determineMcit({ rcitTaxDue, grossIncome, entity, rates, year }) {
  const regDate = entity?.bir_registration_date ? new Date(entity.bir_registration_date) : null;
  if (!regDate || Number.isNaN(regDate.getTime())) {
    return {
      applies: false,
      mcit_amount: 0,
      higher_of: rcitTaxDue,
      basis: 'MCIT_DISABLED_NO_REGISTRATION_DATE',
    };
  }
  const yearsOfOperation = year - regDate.getUTCFullYear();
  if (yearsOfOperation <= rates.MCIT_GRACE_YEARS) {
    return {
      applies: false,
      mcit_amount: 0,
      higher_of: rcitTaxDue,
      basis: `MCIT_GRACE_YEAR_${yearsOfOperation}_OF_${rates.MCIT_GRACE_YEARS}`,
    };
  }
  const mcitAmount = round2(Math.max(0, grossIncome) * rates.MCIT_RATE);
  const higher = Math.max(rcitTaxDue, mcitAmount);
  return {
    applies: true,
    mcit_amount: mcitAmount,
    higher_of: higher,
    basis: mcitAmount > rcitTaxDue ? 'MCIT_HIGHER_THAN_RCIT' : 'RCIT_HIGHER_THAN_MCIT',
    years_of_operation: yearsOfOperation,
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Compute the BIR Form 1702 (Corporation) annual income tax return for
 * the given entity × year. Reads POSTED JEs (bir_flag in [BOTH, BIR])
 * for periods Y-01..Y-12, partitions into Revenue / COGS / OPEX / Non-
 * Opex / BIR-only, derives Tax Due, applies MCIT comparison, then
 * subtracts Creditable Tax Withheld (via J6 compute1702CwtRollup) and
 * admin-supplied manual credits.
 *
 * Returns the full 1702-RT box layout the frontend renders. Manual
 * fields (1702-Q paid YTD, foreign tax credit, prior-year overpayment)
 * default to 0 and are stamped into BirFilingStatus.totals_snapshot when
 * admin saves them via update1702Manual.
 */
async function compute1702({ entityId, year, manualOverrides = {} }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');

  const entity = await Entity.findById(entityId).lean();
  if (!entity) throw new Error('Entity not found');

  if (entity.tax_type === 'SOLE_PROP') {
    throw new Error('Use compute1701 for sole-proprietorship entities. 1702 is for CORP/OPC/PARTNERSHIP only.');
  }

  const rates = await incomeTaxRates.getAllRates(entityId);

  // ── 1. Aggregate POSTED JEs for fiscal year ──
  const rows = await aggregateAnnualBirJEs({ entityId, year });
  const buckets = partitionByBucket(rows);

  // ── 2. Compute Gross Income / Net Taxable Income ──
  const totalRevenue       = sumBucket(buckets.revenue);
  const totalCostOfSales   = sumBucket(buckets.cost_of_sales);
  const grossIncome        = round2(totalRevenue - totalCostOfSales);
  const totalOpex          = sumBucket(buckets.opex);
  const totalNonOpex       = sumBucket(buckets.non_opex);
  const totalBirOnly       = sumBucket(buckets.bir_only);
  const allowableDeductions = round2(totalOpex + totalNonOpex + totalBirOnly);
  const netTaxableIncome   = round2(grossIncome - allowableDeductions);

  // ── 3. Compute Tax Due (RCIT vs MCIT) ──
  const corpRate = determineCorpRate({ taxableIncome: netTaxableIncome, entity, rates });
  const rcitTaxDue = round2(Math.max(0, netTaxableIncome) * corpRate.rate);
  const mcit = determineMcit({ rcitTaxDue, grossIncome, entity, rates, year });
  const taxDue = round2(mcit.applies ? mcit.higher_of : rcitTaxDue);

  // ── 4. Pull Creditable Tax Withheld rollup (J6 endpoint) ──
  const cwtRollup = await cwt2307ReconciliationService.compute1702CwtRollup({ entityId, year });

  // ── 5. Apply manual credits + compute Net Payable ──
  const manualCwt          = Number(manualOverrides?.manual_cwt_override || 0); // optional override (defaults to J6 number)
  const cwtCredit          = manualCwt > 0 ? round2(manualCwt) : round2(cwtRollup.cwt_credit_for_1702);
  const quarterlyPaidYtd   = round2(Number(manualOverrides?.quarterly_paid_ytd_php || 0));
  const foreignTaxCredit   = round2(Number(manualOverrides?.foreign_tax_credit_php || 0));
  const priorYearOverpayment = round2(Number(manualOverrides?.prior_year_overpayment_php || 0));
  const otherCredits       = round2(Number(manualOverrides?.other_credits_php || 0));
  const totalCredits       = round2(cwtCredit + quarterlyPaidYtd + foreignTaxCredit + priorYearOverpayment + otherCredits);
  const netPayable         = round2(taxDue - totalCredits);

  // Trial-balance sanity — we surface DR/CR totals so the page can flag
  // "books didn't balance" before the user files.
  const totalDebit  = rows.reduce((s, r) => s + r.total_debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.total_credit, 0);
  const isBalanced  = Math.abs(totalDebit - totalCredit) <= 0.01;

  return {
    form_code: '1702',
    year,
    entity: {
      _id: entity._id,
      entity_name: entity.entity_name,
      tin: entity.tin || '',
      rdo_code: entity.rdo_code || '',
      tax_type: entity.tax_type || 'CORP',
      business_style: entity.business_style || '',
      address: entity.address || '',
      total_assets_php: entity.total_assets_php || null,
      bir_registration_date: entity.bir_registration_date || null,
    },
    rates_used: {
      corp_regular_rate: rates.CORP_REGULAR_RATE,
      corp_sme_rate: rates.CORP_SME_RATE,
      corp_sme_taxable_threshold_php: rates.CORP_SME_TAXABLE_THRESHOLD_PHP,
      corp_sme_assets_threshold_php: rates.CORP_SME_ASSETS_THRESHOLD_PHP,
      mcit_rate: rates.MCIT_RATE,
      mcit_grace_years: rates.MCIT_GRACE_YEARS,
      applied_rate: corpRate.rate,
      applied_rate_basis: corpRate.basis,
    },
    boxes: {
      // Part IV — Computation of Tax (per BIR 1702-RT v2018)
      gross_sales: totalRevenue,
      cost_of_sales: totalCostOfSales,
      gross_income: grossIncome,
      total_opex: totalOpex,
      total_non_opex: totalNonOpex,
      total_bir_only_deductions: totalBirOnly,
      allowable_deductions: allowableDeductions,
      net_taxable_income: netTaxableIncome,
      // Part IV — Tax Due
      rcit_rate_pct: round2(corpRate.rate * 100),
      rcit_tax_due: rcitTaxDue,
      mcit_rate_pct: round2(rates.MCIT_RATE * 100),
      mcit_amount: mcit.mcit_amount,
      mcit_applies: mcit.applies,
      mcit_basis: mcit.basis,
      tax_due: taxDue,
      // Part IV — Tax Credits / Payments
      cwt_credit: cwtCredit,
      cwt_quarterly_breakdown: cwtRollup.quarter_breakdown,
      cwt_pending_exposure: cwtRollup.pending_exposure_cwt,
      quarterly_paid_ytd: quarterlyPaidYtd,
      foreign_tax_credit: foreignTaxCredit,
      prior_year_overpayment: priorYearOverpayment,
      other_credits: otherCredits,
      total_credits: totalCredits,
      // Bottom line
      net_payable: netPayable,
    },
    schedules: {
      revenue_lines: buckets.revenue,
      cost_of_sales_lines: buckets.cost_of_sales,
      opex_lines: buckets.opex,
      non_opex_lines: buckets.non_opex,
      bir_only_lines: buckets.bir_only,
      other_lines_warning: buckets.other,    // Mis-tagged JEs to flag before filing
    },
    integrity: {
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      is_balanced: isBalanced,
      abnormal_count: [
        ...buckets.revenue, ...buckets.cost_of_sales, ...buckets.opex,
        ...buckets.non_opex, ...buckets.bir_only,
      ].filter(r => r.abnormal).length,
      other_lines_count: buckets.other.length,
    },
    cwt_rollup: cwtRollup,
    manual_overrides_in: manualOverrides,
    generated_at: new Date(),
  };
}

/**
 * Compute the BIR Form 1701 (Sole Prop / Individual) return. Same shape
 * as 1702 but uses TRAIN graduated brackets (or 8% flat rate per
 * `entity.tax_election_8pct`).
 *
 * Note: 1701 is a stub today — VIP entities are CORP. The full 1701
 * implementation is gated behind `entity.tax_type === 'SOLE_PROP'`.
 * Returns a clearly-flagged stub payload if called for a non-SOLE_PROP
 * entity (so the dashboard heatmap drill-down doesn't crash).
 */
async function compute1701({ entityId, year, manualOverrides = {} }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');

  const entity = await Entity.findById(entityId).lean();
  if (!entity) throw new Error('Entity not found');
  if (entity.tax_type !== 'SOLE_PROP') {
    return {
      form_code: '1701',
      year,
      stub: true,
      reason: `Entity tax_type=${entity.tax_type || 'CORP'} is not SOLE_PROP. 1701 is for sole-proprietorship / freelancer / individual taxpayers only — use 1702 instead.`,
      entity: { _id: entity._id, entity_name: entity.entity_name, tax_type: entity.tax_type || 'CORP' },
      generated_at: new Date(),
    };
  }

  const rates = await incomeTaxRates.getAllRates(entityId);
  const rows = await aggregateAnnualBirJEs({ entityId, year });
  const buckets = partitionByBucket(rows);

  const totalRevenue        = sumBucket(buckets.revenue);
  const totalCostOfSales    = sumBucket(buckets.cost_of_sales);
  const grossIncome         = round2(totalRevenue - totalCostOfSales);
  const totalOpex           = sumBucket(buckets.opex);
  const totalNonOpex        = sumBucket(buckets.non_opex);
  const totalBirOnly        = sumBucket(buckets.bir_only);
  const allowableDeductions = round2(totalOpex + totalNonOpex + totalBirOnly);
  const netTaxableIncome    = round2(grossIncome - allowableDeductions);

  const electedFlat8 = !!entity.tax_election_8pct;
  let taxDue = 0;
  let basis = '';
  let appliedRate = 0;
  if (electedFlat8) {
    taxDue = round2(Math.max(0, totalRevenue) * rates.INDIVIDUAL_8PCT_FLAT_RATE);
    basis = 'INDIVIDUAL_8PCT_FLAT_ON_GROSS_SALES';
    appliedRate = rates.INDIVIDUAL_8PCT_FLAT_RATE;
  } else {
    taxDue = applyIndividualBrackets(netTaxableIncome);
    basis = 'INDIVIDUAL_TRAIN_GRADUATED_BRACKETS';
    appliedRate = INDIVIDUAL_GRADUATED_BRACKETS.find(
      b => netTaxableIncome >= b.from && netTaxableIncome <= b.to
    )?.rate || 0;
  }

  const cwtRollup = await cwt2307ReconciliationService.compute1702CwtRollup({ entityId, year });
  const cwtCredit          = round2(cwtRollup.cwt_credit_for_1702);
  const quarterlyPaidYtd   = round2(Number(manualOverrides?.quarterly_paid_ytd_php || 0));
  const foreignTaxCredit   = round2(Number(manualOverrides?.foreign_tax_credit_php || 0));
  const priorYearOverpayment = round2(Number(manualOverrides?.prior_year_overpayment_php || 0));
  const otherCredits       = round2(Number(manualOverrides?.other_credits_php || 0));
  const totalCredits       = round2(cwtCredit + quarterlyPaidYtd + foreignTaxCredit + priorYearOverpayment + otherCredits);
  const netPayable         = round2(taxDue - totalCredits);

  return {
    form_code: '1701',
    year,
    entity: {
      _id: entity._id,
      entity_name: entity.entity_name,
      tin: entity.tin || '',
      rdo_code: entity.rdo_code || '',
      tax_type: 'SOLE_PROP',
    },
    election: { eight_pct_flat: electedFlat8, basis },
    rates_used: { applied_rate: appliedRate, individual_8pct_flat_rate: rates.INDIVIDUAL_8PCT_FLAT_RATE, brackets: INDIVIDUAL_GRADUATED_BRACKETS },
    boxes: {
      gross_sales: totalRevenue,
      cost_of_sales: totalCostOfSales,
      gross_income: grossIncome,
      total_opex: totalOpex,
      total_non_opex: totalNonOpex,
      total_bir_only_deductions: totalBirOnly,
      allowable_deductions: allowableDeductions,
      net_taxable_income: netTaxableIncome,
      tax_due: taxDue,
      cwt_credit: cwtCredit,
      quarterly_paid_ytd: quarterlyPaidYtd,
      foreign_tax_credit: foreignTaxCredit,
      prior_year_overpayment: priorYearOverpayment,
      other_credits: otherCredits,
      total_credits: totalCredits,
      net_payable: netPayable,
    },
    schedules: {
      revenue_lines: buckets.revenue,
      cost_of_sales_lines: buckets.cost_of_sales,
      opex_lines: buckets.opex,
      non_opex_lines: buckets.non_opex,
      bir_only_lines: buckets.bir_only,
    },
    cwt_rollup: cwtRollup,
    manual_overrides_in: manualOverrides,
    generated_at: new Date(),
  };
}

module.exports = {
  compute1702,
  compute1701,
  // Test seams
  _internals: {
    aggregateAnnualBirJEs,
    partitionByBucket,
    sumBucket,
    inRange,
    determineCorpRate,
    determineMcit,
    applyIndividualBrackets,
    ACCOUNT_RANGES,
    INDIVIDUAL_GRADUATED_BRACKETS,
  },
};
