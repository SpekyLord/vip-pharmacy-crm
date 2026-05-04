#!/usr/bin/env node
/**
 * healthcheckBir1702 — Phase VIP-1.J / J7 (May 2026)
 *
 * Static wiring contract for the Annual Income Tax Return (1702 / 1701)
 * helper. Verifies controller / route / service / model / lookup /
 * frontend / docs are wired end-to-end. Mirrors the J5/J6 healthcheck
 * style: assert sets per section, count pass/fail, exit code 1 on any fail.
 *
 * Run:  node backend/scripts/healthcheckBir1702.js
 *
 * Sections (14):
 *   1.  incomeTaxRates helper — exports + DEFAULTS + lazy-cache pattern
 *   2.  incomeTaxReturnService — public exports + internal seams
 *   3.  Bucket math — partitionByBucket + sumBucket + inRange
 *   4.  Corp rate selection — RCIT vs SME thresholds
 *   5.  MCIT logic — grace years + higher-of pick
 *   6.  Individual brackets — TRAIN graduated table
 *   7.  BirFilingStatus model — 1702/1701 annual + 2307-IN annual-or-per-payee
 *   8.  birController — compute1702/1701, update1702Manual, mark1702Filed
 *   9.  birRoutes — J7 routes BEFORE J1 catch-all + cwt-rollup unchanged
 *   10. birAccess — EDIT_1702_MANUAL gate added to switch + exports
 *   11. Lookup seed defaults — BIR_INCOME_TAX_RATES + BIR_ROLES.EDIT_1702_MANUAL
 *   12. Lookup invalidation — BIR_INCOME_TAX_RATES_CATEGORIES wired at all 4 sites
 *   13. Frontend — service helpers + lazy import + route + drill-down
 *   14. PageGuide — bir-1702 entry exists with required keys
 */

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label) {
  pass++;
  process.stdout.write(`  ✓ ${label}\n`);
}

function bad(label, why) {
  fail++;
  failures.push(`${label} — ${why}`);
  process.stdout.write(`  ✗ ${label} — ${why}\n`);
}

function assert(cond, label, why = 'assertion failed') {
  if (cond) ok(label);
  else bad(label, why);
}

function readSrc(rel) {
  return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
}

function section(title) {
  process.stdout.write(`\n— ${title} —\n`);
}

// ═══════════════════════════════════════════════════════════════════════
// 1. incomeTaxRates helper
// ═══════════════════════════════════════════════════════════════════════
section('1. incomeTaxRates helper');

const ratesSrc = readSrc('backend/utils/incomeTaxRates.js');
const ratesMod = require('../utils/incomeTaxRates');

assert(typeof ratesMod.getRate === 'function', 'getRate exported');
assert(typeof ratesMod.getAllRates === 'function', 'getAllRates exported');
assert(typeof ratesMod.invalidate === 'function', 'invalidate exported');
assert(ratesMod.DEFAULTS && Object.isFrozen(ratesMod.DEFAULTS), 'DEFAULTS frozen');

const requiredKeys = [
  'CORP_REGULAR_RATE', 'CORP_SME_RATE',
  'CORP_SME_TAXABLE_THRESHOLD_PHP', 'CORP_SME_ASSETS_THRESHOLD_PHP',
  'MCIT_RATE', 'MCIT_GRACE_YEARS', 'INDIVIDUAL_8PCT_FLAT_RATE',
];
for (const k of requiredKeys) {
  assert(Object.prototype.hasOwnProperty.call(ratesMod.DEFAULTS, k), `DEFAULTS has ${k}`);
}
assert(ratesMod.DEFAULTS.CORP_REGULAR_RATE === 0.25, 'CORP_REGULAR_RATE default 0.25');
assert(ratesMod.DEFAULTS.CORP_SME_RATE === 0.20, 'CORP_SME_RATE default 0.20');
assert(ratesMod.DEFAULTS.MCIT_RATE === 0.02, 'MCIT_RATE default 0.02');
assert(ratesMod.DEFAULTS.MCIT_GRACE_YEARS === 3, 'MCIT_GRACE_YEARS default 3');
assert(ratesMod.DEFAULTS.INDIVIDUAL_8PCT_FLAT_RATE === 0.08, 'INDIVIDUAL_8PCT_FLAT_RATE default 0.08');
assert(/category: 'BIR_INCOME_TAX_RATES'/.test(ratesSrc), 'queries BIR_INCOME_TAX_RATES lookup');
assert(/TTL_MS = 60_000/.test(ratesSrc) || /TTL_MS = 60000/.test(ratesSrc), '60s cache TTL');
assert(/_cache\.set\(.*ts:/.test(ratesSrc.replace(/\s+/g, ' ')), 'cache set on miss');

// ═══════════════════════════════════════════════════════════════════════
// 2. incomeTaxReturnService
// ═══════════════════════════════════════════════════════════════════════
section('2. incomeTaxReturnService');

const svcSrc = readSrc('backend/erp/services/incomeTaxReturnService.js');
const svcMod = require('../erp/services/incomeTaxReturnService');

assert(typeof svcMod.compute1702 === 'function', 'compute1702 exported');
assert(typeof svcMod.compute1701 === 'function', 'compute1701 exported');
assert(svcMod._internals, '_internals seam exported');
assert(typeof svcMod._internals.aggregateAnnualBirJEs === 'function', 'aggregateAnnualBirJEs internal');
assert(typeof svcMod._internals.partitionByBucket === 'function', 'partitionByBucket internal');
assert(typeof svcMod._internals.sumBucket === 'function', 'sumBucket internal');
assert(typeof svcMod._internals.determineCorpRate === 'function', 'determineCorpRate internal');
assert(typeof svcMod._internals.determineMcit === 'function', 'determineMcit internal');
assert(typeof svcMod._internals.applyIndividualBrackets === 'function', 'applyIndividualBrackets internal');
assert(svcMod._internals.ACCOUNT_RANGES && Object.isFrozen(svcMod._internals.ACCOUNT_RANGES), 'ACCOUNT_RANGES frozen');
assert(svcMod._internals.INDIVIDUAL_GRADUATED_BRACKETS && svcMod._internals.INDIVIDUAL_GRADUATED_BRACKETS.length === 6, 'TRAIN brackets table length 6');
assert(/bir_flag: \{ \$in: \['BOTH', 'BIR'\] \}/.test(svcSrc), 'aggregator filters bir_flag IN [BOTH, BIR]');
assert(/period: \{ \$gte: periodFrom, \$lte: periodTo \}/.test(svcSrc), 'aggregator filters period range');
assert(/status: 'POSTED'/.test(svcSrc), 'aggregator filters POSTED only');
assert(/cwt2307ReconciliationService\.compute1702CwtRollup/.test(svcSrc), 'consumes J6 compute1702CwtRollup');
assert(/incomeTaxRates\.getAllRates\(entityId\)/.test(svcSrc), 'reads per-entity tax rates');
assert(/'CORP\/OPC\/PARTNERSHIP only'/.test(svcSrc) || /1701 for sole-proprietorship/.test(svcSrc), '1702 rejects SOLE_PROP entity');

// ═══════════════════════════════════════════════════════════════════════
// 3. Bucket math (synthetic JE rows)
// ═══════════════════════════════════════════════════════════════════════
section('3. Bucket math');

const { partitionByBucket, sumBucket, inRange, ACCOUNT_RANGES } = svcMod._internals;

assert(inRange('4000', ACCOUNT_RANGES.REVENUE), '4000 ∈ REVENUE');
assert(inRange('4999', ACCOUNT_RANGES.REVENUE), '4999 ∈ REVENUE');
assert(!inRange('5000', ACCOUNT_RANGES.REVENUE), '5000 ∉ REVENUE');
assert(inRange('5000', ACCOUNT_RANGES.COST_OF_SALES), '5000 ∈ COGS');
assert(inRange('6500', ACCOUNT_RANGES.OPEX), '6500 ∈ OPEX');
assert(inRange('7050', ACCOUNT_RANGES.NON_OPEX), '7050 ∈ NON_OPEX');
assert(inRange('8000', ACCOUNT_RANGES.BIR_ONLY), '8000 ∈ BIR_ONLY');
assert(!inRange('1000', ACCOUNT_RANGES.REVENUE), '1000 (asset) ∉ REVENUE');

const fixtureRows = [
  // Revenue (credit-normal): credit > debit → positive amount
  { account_code: '4000', account_name: 'Sales', total_debit: 100, total_credit: 1000, normal_balance: 'CREDIT' },
  // Abnormal revenue (debit > credit) → negative
  { account_code: '4900', account_name: 'Sales Returns', total_debit: 200, total_credit: 100, normal_balance: 'CREDIT' },
  // COGS (debit-normal): debit > credit → positive
  { account_code: '5000', account_name: 'COGS', total_debit: 600, total_credit: 50, normal_balance: 'DEBIT' },
  // OPEX
  { account_code: '6100', account_name: 'Per Diem', total_debit: 200, total_credit: 0, normal_balance: 'DEBIT' },
  // Non-Opex
  { account_code: '7050', account_name: 'Interest Expense', total_debit: 50, total_credit: 0, normal_balance: 'DEBIT' },
  // BIR-only
  { account_code: '8000', account_name: 'NOLCO Adjustment', total_debit: 30, total_credit: 0, normal_balance: 'DEBIT' },
  // Mis-tagged balance-sheet (should land in 'other')
  { account_code: '1000', account_name: 'Cash', total_debit: 500, total_credit: 500, normal_balance: 'DEBIT' },
];
const buckets = partitionByBucket(fixtureRows);
assert(buckets.revenue.length === 2, 'partition: 2 revenue lines');
assert(buckets.cost_of_sales.length === 1, 'partition: 1 COGS line');
assert(buckets.opex.length === 1, 'partition: 1 OPEX line');
assert(buckets.non_opex.length === 1, 'partition: 1 non-opex line');
assert(buckets.bir_only.length === 1, 'partition: 1 BIR-only line');
assert(buckets.other.length === 1, 'partition: 1 mis-tagged balance-sheet line');
assert(buckets.revenue[0].amount === 900, '4000 net amount = 900 (credit-normal)');
assert(buckets.revenue[1].amount === -100, '4900 abnormal amount = -100 (debit-normal failure)');
assert(buckets.revenue[1].abnormal === true, '4900 flagged abnormal');
assert(buckets.cost_of_sales[0].amount === 550, '5000 net amount = 550 (debit-normal)');
assert(sumBucket(buckets.opex) === 200, 'sumBucket OPEX = 200');
assert(sumBucket(buckets.bir_only) === 30, 'sumBucket BIR-only = 30');

// ═══════════════════════════════════════════════════════════════════════
// 4. Corp rate selection
// ═══════════════════════════════════════════════════════════════════════
section('4. Corp rate selection');

const { determineCorpRate } = svcMod._internals;
const RATES = ratesMod.DEFAULTS;

const r0 = determineCorpRate({ taxableIncome: -100, entity: {}, rates: RATES });
assert(r0.basis === 'NO_TAX_DUE_TAXABLE_INCOME_NEGATIVE_OR_ZERO', 'negative taxable income → NO_TAX_DUE basis');

const r1 = determineCorpRate({ taxableIncome: 1_000_000, entity: { total_assets_php: 50_000_000 }, rates: RATES });
assert(r1.rate === 0.20 && r1.basis === 'CORP_SME_RATE', 'SME conditions met → 20%');

const r2 = determineCorpRate({ taxableIncome: 10_000_000, entity: { total_assets_php: 50_000_000 }, rates: RATES });
assert(r2.rate === 0.25 && r2.basis === 'CORP_REGULAR_RATE', 'taxable > 5M → 25% regular');

const r3 = determineCorpRate({ taxableIncome: 1_000_000, entity: { total_assets_php: 200_000_000 }, rates: RATES });
assert(r3.rate === 0.25 && r3.basis === 'CORP_REGULAR_RATE', 'assets > 100M → 25% regular');

const r4 = determineCorpRate({ taxableIncome: 1_000_000, entity: {}, rates: RATES });
assert(r4.rate === 0.25, 'unknown total_assets → conservatively regular rate');

// ═══════════════════════════════════════════════════════════════════════
// 5. MCIT logic
// ═══════════════════════════════════════════════════════════════════════
section('5. MCIT logic');

const { determineMcit } = svcMod._internals;

const m0 = determineMcit({ rcitTaxDue: 100_000, grossIncome: 5_000_000, entity: {}, rates: RATES, year: 2026 });
assert(m0.applies === false && m0.basis === 'MCIT_DISABLED_NO_REGISTRATION_DATE', 'no reg date → MCIT disabled');

const m1 = determineMcit({
  rcitTaxDue: 100_000, grossIncome: 5_000_000,
  entity: { bir_registration_date: new Date('2025-01-01') },
  rates: RATES, year: 2026,
});
assert(m1.applies === false && /MCIT_GRACE_YEAR/.test(m1.basis), 'year 1 of operations → grace');

const m2 = determineMcit({
  rcitTaxDue: 50_000, grossIncome: 5_000_000,
  entity: { bir_registration_date: new Date('2020-01-01') },
  rates: RATES, year: 2026,
});
// MCIT = 5,000,000 × 0.02 = 100,000; RCIT = 50,000 → MCIT wins
assert(m2.applies === true && m2.mcit_amount === 100_000 && m2.higher_of === 100_000, 'MCIT > RCIT → MCIT wins');
assert(m2.basis === 'MCIT_HIGHER_THAN_RCIT', 'MCIT_HIGHER_THAN_RCIT basis');

const m3 = determineMcit({
  rcitTaxDue: 200_000, grossIncome: 5_000_000,
  entity: { bir_registration_date: new Date('2020-01-01') },
  rates: RATES, year: 2026,
});
assert(m3.applies === true && m3.higher_of === 200_000, 'RCIT > MCIT → RCIT wins');
assert(m3.basis === 'RCIT_HIGHER_THAN_MCIT', 'RCIT_HIGHER_THAN_MCIT basis');

// ═══════════════════════════════════════════════════════════════════════
// 6. Individual brackets (1701)
// ═══════════════════════════════════════════════════════════════════════
section('6. Individual TRAIN brackets');

const { applyIndividualBrackets } = svcMod._internals;

assert(applyIndividualBrackets(0) === 0, '₱0 → 0 tax');
assert(applyIndividualBrackets(250_000) === 0, '₱250k → 0 tax (top of 0% bracket)');
assert(applyIndividualBrackets(400_000) === 22_500, '₱400k → ₱22,500 (top of 15% bracket)');
// ₱500,000 → 22,500 + (500,000 - 400,000) × 0.20 = 22,500 + 20,000 = 42,500
assert(applyIndividualBrackets(500_000) === 42_500, '₱500k → ₱42,500');
// ₱2,000,000 → top of 25% bracket = 102,500 + (2,000,000 - 800,000) × 0.25 = 102,500 + 300,000 = 402,500
assert(applyIndividualBrackets(2_000_000) === 402_500, '₱2M → ₱402,500');
// ₱10,000,000 → top bracket: 2,202,500 + (10,000,000 - 8,000,000) × 0.35 = 2,202,500 + 700,000 = 2,902,500
assert(applyIndividualBrackets(10_000_000) === 2_902_500, '₱10M → ₱2,902,500 (top bracket 35%)');

// ═══════════════════════════════════════════════════════════════════════
// 7. BirFilingStatus model
// ═══════════════════════════════════════════════════════════════════════
section('7. BirFilingStatus model');

const modelSrc = readSrc('backend/erp/models/BirFilingStatus.js');
assert(/'1702'/.test(modelSrc) && /'1701'/.test(modelSrc), '1702 + 1701 in FORM_CODES');
// J7 relax: 2307-IN moved out of perPayeeForms, into annualOrPerPayeeForms
assert(/perPayeeForms = \['2307-OUT', '2316'\]/.test(modelSrc), '2307-IN removed from perPayeeForms');
assert(/annualOrPerPayeeForms = \['2307-IN'\]/.test(modelSrc), '2307-IN in annualOrPerPayeeForms');
assert(/annualForms = \['1604-CF', '1604-E', '1702', '1701', 'BOOKS'\]/.test(modelSrc), '1702/1701 in annualForms validator');

// ═══════════════════════════════════════════════════════════════════════
// 8. birController J7 exports
// ═══════════════════════════════════════════════════════════════════════
section('8. birController J7 exports');

const ctrlSrc = readSrc('backend/erp/controllers/birController.js');
assert(/exports\.compute1702 = catchAsync/.test(ctrlSrc), 'compute1702 exported');
assert(/exports\.compute1701 = catchAsync/.test(ctrlSrc), 'compute1701 exported');
assert(/exports\.update1702Manual = catchAsync/.test(ctrlSrc), 'update1702Manual exported');
assert(/exports\.mark1702Filed = catchAsync/.test(ctrlSrc), 'mark1702Filed exported');
assert(/incomeTaxReturnService = require/.test(ctrlSrc), 'incomeTaxReturnService imported');
assert(/'EDIT_1702_MANUAL'/.test(ctrlSrc), 'update1702Manual gated by EDIT_1702_MANUAL');
assert(/'MARK_FILED'/.test(ctrlSrc), 'mark1702Filed gated by MARK_FILED');
// Lazy-create 2307-IN closure at 1702 close
assert(/form_code: '2307-IN'/.test(ctrlSrc), 'mark1702Filed lazy-creates 2307-IN row');
assert(/cwt_credit_for_1702: cwtRollup\.cwt_credit_for_1702/.test(ctrlSrc), '2307-IN closure stamps cwt_credit_for_1702');
assert(/tagged_for_1702_year: year/.test(ctrlSrc), '2307-IN closure stamps tagged_for_1702_year');
// Validation
assert(/Invalid year\. Year ≥ 2024/.test(ctrlSrc), 'year validation present');
assert(/USE_1701/.test(ctrlSrc), 'compute1702 returns USE_1701 for SOLE_PROP');
// Audit logging
assert(/\[BIR_1702_UPDATE_MANUAL\]/.test(ctrlSrc), 'BIR_1702_UPDATE_MANUAL audit log');
assert(/\[BIR_1702_MARK_FILED\]/.test(ctrlSrc), 'BIR_1702_MARK_FILED audit log');

// ═══════════════════════════════════════════════════════════════════════
// 9. birRoutes — order matters
// ═══════════════════════════════════════════════════════════════════════
section('9. birRoutes ordering');

const routesSrc = readSrc('backend/erp/routes/birRoutes.js');
assert(/router\.get\('\/forms\/1702\/:year\/compute', ctrl\.compute1702\)/.test(routesSrc), '1702 compute route');
assert(/router\.get\('\/forms\/1701\/:year\/compute', ctrl\.compute1701\)/.test(routesSrc), '1701 compute route');
assert(/router\.patch\('\/forms\/1702\/:year\/manual', ctrl\.update1702Manual\)/.test(routesSrc), '1702 manual PATCH route');
assert(/router\.patch\('\/forms\/1701\/:year\/manual'/.test(routesSrc), '1701 manual PATCH route (formCode injected)');
assert(/router\.post\('\/forms\/1702\/:year\/mark-filed', ctrl\.mark1702Filed\)/.test(routesSrc), '1702 mark-filed POST');
assert(/router\.post\('\/forms\/1701\/:year\/mark-filed'/.test(routesSrc), '1701 mark-filed POST (formCode injected)');

// J7 routes must precede the J1 catch-all `/forms/:formCode/:year/:period/export.csv`
const j7ComputeIdx = routesSrc.indexOf("'/forms/1702/:year/compute'");
const j1CatchallIdx = routesSrc.indexOf("'/forms/:formCode/:year/:period/export.csv'");
const formsByIdIdx = routesSrc.indexOf("'/forms/:id'");
assert(j7ComputeIdx > 0 && j1CatchallIdx > j7ComputeIdx, 'J7 routes BEFORE J1 catch-all');
assert(formsByIdIdx > j7ComputeIdx, 'J7 routes BEFORE generic /forms/:id GET');
// J6 cwt-rollup endpoint still present (1702 helper depends on it)
assert(/router\.get\('\/forms\/1702\/:year\/cwt-rollup', ctrl\.compute1702CwtRollup\)/.test(routesSrc), 'J6 cwt-rollup endpoint preserved');

// ═══════════════════════════════════════════════════════════════════════
// 10. birAccess EDIT_1702_MANUAL
// ═══════════════════════════════════════════════════════════════════════
section('10. birAccess EDIT_1702_MANUAL gate');

const accessSrc = readSrc('backend/utils/birAccess.js');
const accessMod = require('../utils/birAccess');
assert(/DEFAULT_EDIT_1702_MANUAL = \[ROLES\.ADMIN, ROLES\.FINANCE, ROLES\.BOOKKEEPER\]/.test(accessSrc), 'EDIT_1702_MANUAL default [admin, finance, bookkeeper]');
assert(typeof accessMod.getEdit1702ManualRoles === 'function', 'getEdit1702ManualRoles exported');
assert(Array.isArray(accessMod.DEFAULT_EDIT_1702_MANUAL), 'DEFAULT_EDIT_1702_MANUAL exported');
assert(/case 'EDIT_1702_MANUAL':/.test(accessSrc), 'switch case for EDIT_1702_MANUAL');

// ═══════════════════════════════════════════════════════════════════════
// 11. Lookup seed defaults
// ═══════════════════════════════════════════════════════════════════════
section('11. Lookup seed defaults');

const lookupSrc = readSrc('backend/erp/controllers/lookupGenericController.js');
assert(/BIR_INCOME_TAX_RATES: \[/.test(lookupSrc), 'BIR_INCOME_TAX_RATES seed array');
const txRateLines = (lookupSrc.match(/code: 'CORP_REGULAR_RATE'/g) || []).length;
assert(txRateLines >= 1, 'CORP_REGULAR_RATE seeded');
assert(/code: 'CORP_SME_RATE'/.test(lookupSrc), 'CORP_SME_RATE seeded');
assert(/code: 'CORP_SME_TAXABLE_THRESHOLD_PHP'/.test(lookupSrc), 'CORP_SME_TAXABLE_THRESHOLD_PHP seeded');
assert(/code: 'CORP_SME_ASSETS_THRESHOLD_PHP'/.test(lookupSrc), 'CORP_SME_ASSETS_THRESHOLD_PHP seeded');
assert(/code: 'MCIT_RATE'/.test(lookupSrc), 'MCIT_RATE seeded');
assert(/code: 'MCIT_GRACE_YEARS'/.test(lookupSrc), 'MCIT_GRACE_YEARS seeded');
assert(/code: 'INDIVIDUAL_8PCT_FLAT_RATE'/.test(lookupSrc), 'INDIVIDUAL_8PCT_FLAT_RATE seeded');
const insertOnlyTaxRates = (lookupSrc.match(/insert_only_metadata: true,\s*metadata: \{ value:/g) || []).length;
assert(insertOnlyTaxRates >= 7, 'all 7 rate rows insert_only_metadata: true');
// BIR_ROLES.EDIT_1702_MANUAL row
assert(/code: 'EDIT_1702_MANUAL'/.test(lookupSrc), 'EDIT_1702_MANUAL row in BIR_ROLES seed');

// ═══════════════════════════════════════════════════════════════════════
// 12. Lookup invalidation hooks
// ═══════════════════════════════════════════════════════════════════════
section('12. Lookup invalidation hooks');

assert(/BIR_INCOME_TAX_RATES_CATEGORIES = new Set\(\['BIR_INCOME_TAX_RATES'\]\)/.test(lookupSrc), 'category set defined');
assert(/invalidate: invalidateIncomeTaxRatesCache/.test(lookupSrc), 'invalidateIncomeTaxRatesCache imported');
const invalidateSites = (lookupSrc.match(/BIR_INCOME_TAX_RATES_CATEGORIES\.has/g) || []).length;
assert(invalidateSites >= 4, `invalidation wired at all 4 sites (got ${invalidateSites})`);

// ═══════════════════════════════════════════════════════════════════════
// 13. Frontend wiring
// ═══════════════════════════════════════════════════════════════════════
section('13. Frontend wiring');

const fsvcSrc = readSrc('frontend/src/erp/services/birService.js');
assert(/export async function compute1702\(year\)/.test(fsvcSrc), 'birService.compute1702 helper');
assert(/export async function compute1701\(year\)/.test(fsvcSrc), 'birService.compute1701 helper');
assert(/export async function update1702Manual\(year, payload, formCode/.test(fsvcSrc), 'birService.update1702Manual helper');
assert(/export async function mark1702Filed\(year, payload, formCode/.test(fsvcSrc), 'birService.mark1702Filed helper');
assert(/compute1702,\s*\n\s*compute1701,\s*\n\s*update1702Manual,\s*\n\s*mark1702Filed,/.test(fsvcSrc), 'default export includes J7 helpers');

const appSrc = readSrc('frontend/src/App.jsx');
assert(/Bir1702DetailPage = lazyRetry/.test(appSrc), 'Bir1702DetailPage lazy import');
assert(/path="\/erp\/bir\/1702\/:year"/.test(appSrc), '1702 route registered');
assert(/path="\/erp\/bir\/1701\/:year"/.test(appSrc), '1701 route registered');
const j7RouteIdx = appSrc.indexOf('path="/erp/bir/1702/:year"');
const wildcardIdx = appSrc.indexOf('path="/erp/bir/:formCode/:year/:period"');
assert(j7RouteIdx > 0 && wildcardIdx > j7RouteIdx, '1702/1701 routes BEFORE wildcard');
assert(/<Bir1702DetailPage formCodeOverride="1701" \/>/.test(appSrc), '1701 page reuses Bir1702DetailPage with override');

const dashSrc = readSrc('frontend/src/erp/pages/BIRCompliancePage.jsx');
assert(/annualForms = \['1604-CF', '1604-E', 'BOOKS', '1702', '1701'\]/.test(dashSrc), '1702/1701 in heatmap drill-down annualForms');

const pageSrc = readSrc('frontend/src/erp/pages/Bir1702DetailPage.jsx');
assert(/PageGuide pageKey="bir-1702"/.test(pageSrc), 'Bir1702DetailPage renders PageGuide bir-1702');
assert(/birService\.compute1702\(year\)/.test(pageSrc) && /birService\.compute1701\(year\)/.test(pageSrc), 'page calls compute1702 + compute1701 conditionally');
assert(/birService\.update1702Manual/.test(pageSrc), 'page calls update1702Manual');
assert(/birService\.mark1702Filed/.test(pageSrc), 'page calls mark1702Filed');
assert(/cwt_credit/.test(pageSrc), 'page renders CWT credit box');
assert(/manual_cwt_override/.test(pageSrc), 'page exposes manual CWT override field');
assert(/Trial balance does NOT balance/.test(pageSrc), 'page surfaces trial-balance integrity banner');

// ═══════════════════════════════════════════════════════════════════════
// 14. PageGuide entry
// ═══════════════════════════════════════════════════════════════════════
section('14. PageGuide bir-1702 entry');

const guideSrc = readSrc('frontend/src/components/common/PageGuide.jsx');
assert(/'bir-1702': \{/.test(guideSrc), "'bir-1702' entry exists");
const guideIdx = guideSrc.indexOf("'bir-1702': {");
const guideEnd = guideSrc.indexOf("'bir-boa-books': {");
const guideEntry = guideSrc.slice(guideIdx, guideEnd);
assert(/title:/.test(guideEntry), 'bir-1702 has title');
assert(/steps: \[/.test(guideEntry), 'bir-1702 has steps');
assert(/next: \[/.test(guideEntry), 'bir-1702 has next links');
assert(/tip:/.test(guideEntry), 'bir-1702 has tip');
assert(/BIR_INCOME_TAX_RATES/.test(guideEntry), 'tip mentions tax-rates lookup');
assert(/2307-IN annual-closure/.test(guideEntry) || /2307-IN annual closure/.test(guideEntry), 'tip mentions 2307-IN closure');
assert(/MCIT/.test(guideEntry), 'tip mentions MCIT');

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════
process.stdout.write('\n────────────────────────────────────────────────\n');
process.stdout.write(`Total: ${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write('All J7 wiring assertions passed.\n');
process.exit(0);
