#!/usr/bin/env node
/**
 * healthcheckRebateCommissionWiring — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * Verifies the full wiring chain for the rebate + commission matrices and
 * payout ledgers: route mount → controller export → schema field presence →
 * Sidebar/PageGuide entries → idempotency index. Exits 1 on first failure
 * so it can serve as a CI gate.
 *
 * Run: node backend/scripts/healthcheckRebateCommissionWiring.js
 *
 * Health-check coverage:
 *   - 6 routes mounted in backend/erp/routes/index.js
 *   - 6 controllers export the methods their routes reference
 *   - Collection.js has md_rebate_lines + total_md_rebates + commission_rule_id
 *   - PrfCalf.js has metadata field + autoPrfRouting_idem index name
 *   - autoPrfRouting populates linked_collection_id + partner_id
 *   - collectionController submitCollections + postSingleCollection wire routePrfsForCollection
 *   - 5 Sidebar entries present
 *   - 5 PageGuide entries present
 *   - 5 App.jsx route definitions present
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
const warnings = [];

function read(file) {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch (err) {
    errors.push(`MISSING FILE: ${file} — ${err.message}`);
    return '';
  }
}

function expect(condition, message) {
  if (!condition) errors.push(`FAIL: ${message}`);
  else process.stdout.write('.');
}

function warn(condition, message) {
  if (!condition) warnings.push(`WARN: ${message}`);
}

console.log('Phase VIP-1.B Phase 4 wiring health check\n─────────────────────────────────────────────');

// ── 1. Routes mounted in routes/index.js ─────────────────────────────────
const routesIdx = read('backend/erp/routes/index.js');
[
  ['/md-product-rebates', 'mdProductRebateRoutes'],
  ['/non-md-partner-rebate-rules', 'nonMdPartnerRebateRuleRoutes'],
  ['/md-capitation-rules', 'mdCapitationRuleRoutes'],
  ['/staff-commission-rules', 'staffCommissionRuleRoutes'],
  ['/rebate-payouts', 'rebatePayoutRoutes'],
  ['/commission-payouts', 'commissionPayoutRoutes'],
].forEach(([path, file]) => {
  expect(routesIdx.includes(path) && routesIdx.includes(file), `Route ${path} mounted (${file})`);
});

// ── 2. Controllers export expected methods ───────────────────────────────
const ctrlExpect = {
  'backend/erp/controllers/mdProductRebateController.js': ['list', 'getById', 'create', 'update', 'deactivate'],
  'backend/erp/controllers/nonMdPartnerRebateRuleController.js': ['list', 'getById', 'create', 'update', 'deactivate'],
  'backend/erp/controllers/mdCapitationRuleController.js': ['list', 'getById', 'getExcludedProducts', 'create', 'update', 'deactivate'],
  'backend/erp/controllers/staffCommissionRuleController.js': ['list', 'getById', 'create', 'update', 'deactivate'],
  'backend/erp/controllers/rebatePayoutController.js': ['list', 'summary', 'getById', 'markReadyToPay', 'markPaid', 'voidPayout'],
  'backend/erp/controllers/commissionPayoutController.js': ['list', 'summary', 'getById'],
};
for (const [file, methods] of Object.entries(ctrlExpect)) {
  const src = read(file);
  for (const m of methods) {
    expect(new RegExp(`(const|exports\\.|^module\\.exports.*\\b${m}\\b)`, 'm').test(src) && src.includes(m), `${path.basename(file)} exports ${m}`);
  }
}

// ── 3. Collection.js bridge fields ───────────────────────────────────────
const collection = read('backend/erp/models/Collection.js');
expect(collection.includes('md_rebate_lines'), 'Collection.md_rebate_lines field present');
expect(collection.includes('mdRebateLineSchema'), 'Collection.mdRebateLineSchema declared');
expect(collection.includes('total_md_rebates'), 'Collection.total_md_rebates roll-up present');
expect(collection.includes('commission_rule_id'), 'Collection.settled_csis.commission_rule_id provenance present');
expect(collection.includes('matchMdProductRebate'), 'Collection pre-save calls matchMdProductRebate');
expect(collection.includes('matchStaffCommissionRule'), 'Collection pre-save calls matchStaffCommissionRule');
expect(collection.includes('matchNonMdPartnerRebateRule'), 'Collection pre-save calls matchNonMdPartnerRebateRule');
expect(collection.includes('tierAExcludedNet'), 'Collection pre-save tracks Tier-A exclusion');

// ── 4. PrfCalf metadata field + idempotency index ──────────────────────
const prfCalf = read('backend/erp/models/PrfCalf.js');
expect(prfCalf.includes('metadata: { type: mongoose.Schema.Types.Mixed'), 'PrfCalf.metadata: Mixed field present');
expect(prfCalf.includes('autoPrfRouting_idem'), 'PrfCalf autoPrfRouting_idem index present');

// ── 5. autoPrfRouting populates first-class fields ──────────────────────
const autoPrf = read('backend/erp/services/autoPrfRouting.js');
expect(autoPrf.includes('partner_id: bucket.payee_id'), 'autoPrfRouting writes partner_id');
expect(autoPrf.includes('linked_collection_id: collection_id'), 'autoPrfRouting writes linked_collection_id');
expect(autoPrf.includes("bir_flag: 'INTERNAL'"), 'autoPrfRouting stamps bir_flag INTERNAL');
expect(autoPrf.includes('payee_type:'), 'autoPrfRouting writes payee_type');

// ── 6. collectionController wires routePrfsForCollection ────────────────
const collCtrl = read('backend/erp/controllers/collectionController.js');
const submitMatches = (collCtrl.match(/routePrfsForCollection/g) || []).length;
expect(submitMatches >= 2, `collectionController calls routePrfsForCollection (found ${submitMatches}, expect >= 2: submit + postSingle)`);
expect(collCtrl.includes("'metadata.auto_generated_by': 'autoPrfRouting'"), 'collectionController reopen path cleans DRAFT auto-PRFs');

// ── 7. Frontend App.jsx routes ──────────────────────────────────────────
const appJsx = read('frontend/src/App.jsx');
[
  '/admin/rebate-matrix',
  '/admin/non-md-rebate-matrix',
  '/admin/capitation-rules',
  '/admin/commission-matrix',
  '/admin/payout-ledger',
].forEach(p => expect(appJsx.includes(`path="${p}"`), `App.jsx route ${p}`));
[
  'RebateMatrixPage',
  'NonMdRebateMatrixPage',
  'CapitationRulesPage',
  'CommissionMatrixPage',
  'PayoutLedgerPage',
].forEach(c => expect(appJsx.includes(c), `App.jsx imports ${c}`));

// ── 8. Sidebar entries ──────────────────────────────────────────────────
const sidebar = read('frontend/src/components/common/Sidebar.jsx');
[
  '/admin/rebate-matrix',
  '/admin/non-md-rebate-matrix',
  '/admin/capitation-rules',
  '/admin/commission-matrix',
  '/admin/payout-ledger',
].forEach(p => expect(sidebar.includes(p), `Sidebar links ${p}`));

// ── 9. PageGuide entries ────────────────────────────────────────────────
const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
[
  "'rebate-matrix':",
  "'non-md-rebate-matrix':",
  "'capitation-rules':",
  "'commission-matrix':",
  "'payout-ledger':",
].forEach(k => expect(pageGuide.includes(k), `PageGuide entry ${k}`));

// ── 10. Frontend service ────────────────────────────────────────────────
const svc = read('frontend/src/erp/services/rebateCommissionService.js');
[
  'listMdProductRebates',
  'createMdProductRebate',
  'listNonMdRules',
  'createNonMdRule',
  'listCapitationRules',
  'getExcludedProducts',
  'listCommissionRules',
  'listRebatePayouts',
  'markRebatePayoutPaid',
  'listCommissionPayouts',
].forEach(m => expect(svc.includes(`export async function ${m}`), `rebateCommissionService exports ${m}`));

// ── 11. Lookup-driven gates wired ───────────────────────────────────────
const access = read('backend/utils/rebateCommissionAccess.js');
expect(access.includes('userHasRebateRole'), 'rebateCommissionAccess.userHasRebateRole exported');
expect(access.includes('userHasCommissionRole'), 'rebateCommissionAccess.userHasCommissionRole exported');

// ── 12. lookupGenericController has SEED_DEFAULTS for new categories ────
const lookupCtrl = read('backend/erp/controllers/lookupGenericController.js');
['REBATE_ROLES', 'COMMISSION_ROLES', 'REBATE_PAYOUT_STATUS', 'STAFF_COMMISSION_PAYEE_ROLE', 'MD_CAPITATION_FREQUENCY'].forEach(cat => {
  warn(lookupCtrl.includes(cat), `lookupGenericController seeds ${cat}`);
});

console.log('\n─────────────────────────────────────────────');

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warnings:`);
  warnings.forEach(w => console.log('  ' + w));
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} FAILURES:`);
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}

console.log('\n✓ All Phase VIP-1.B Phase 4 wiring checks passed');
process.exit(0);
