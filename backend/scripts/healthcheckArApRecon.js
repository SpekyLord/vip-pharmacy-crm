/**
 * Phase A.4 healthcheck — AR/AP Sub-Ledger Recon + JE-Asymmetry Repair
 *
 * Static contract verifier. Runs offline (no DB). Asserts the wiring for:
 *
 *   1. Schema fields: outstanding_amount + paid_amount + last_payment_at +
 *      je_status + je_failure_reason + je_attempts on SalesLine, Collection,
 *      PrfCalf, SupplierInvoice. Indexes for AR aging + FAILED-JE filters.
 *   2. arAgingService exports + recomputeOutstandingForCollection wired into
 *      collectionController POST/reopen/president-reverse + postSingleCollection.
 *   3. jeStatusTracker exports + markJePosted/markJeFailed wired into Sales/
 *      Collection/PrfCalf/SupplierInvoice POST controllers.
 *   4. Migration script exports + dry-run-by-default + idempotency guard.
 *   5. Integrity sweep adds checkArApSubLedger + checkJeStatusFailed +
 *      period-close gate counts JE-FAILED rows.
 *   6. Accounting Integrity Agent body builder renders the new findings +
 *      key-findings summary surfaces them.
 *   7. Backend retry endpoint mounted at /api/erp/integrity/{retry-je,recompute-ar}
 *      + role-gated via jeRetryAccess (JE_RETRY_ROLES lookup).
 *   8. Lookup seed JE_RETRY_ROLES (RETRY_JE + RECOMPUTE_AR codes) + invalidate
 *      hook in lookupGenericController for create/update/remove/seed paths.
 *   9. Frontend integrityService exports retryJe + recomputeAr.
 *  10. AccountsReceivable page renders the Refresh button + uses recomputeAr.
 *  11. WorkflowGuide ar-aging banner mentions Phase A.4 contract.
 *
 * Exit 0 = healthy. Exit 1 = assertion failure (line cited).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const failures = [];
let asserts = 0;

function assert(cond, msg) {
  asserts += 1;
  if (!cond) failures.push(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log('Phase A.4 — AR/AP Sub-Ledger Recon healthcheck\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema fields on the four source-doc models
// ─────────────────────────────────────────────────────────────────────────────
{
  const sl = read('backend/erp/models/SalesLine.js');
  assert(/outstanding_amount: \{ type: Number, default: null \}/.test(sl),
    'SalesLine.outstanding_amount default null missing');
  assert(/paid_amount: \{ type: Number, default: 0 \}/.test(sl),
    'SalesLine.paid_amount default 0 missing');
  assert(/last_payment_at: \{ type: Date, default: null \}/.test(sl),
    'SalesLine.last_payment_at default null missing');
  assert(/je_status: \{[\s\S]*?enum: \['PENDING', 'POSTED', 'FAILED', null\]/.test(sl),
    'SalesLine.je_status enum missing PENDING/POSTED/FAILED');
  assert(/je_failure_reason: \{ type: String, default: null \}/.test(sl),
    'SalesLine.je_failure_reason missing');
  assert(/je_attempts: \{ type: Number, default: 0 \}/.test(sl),
    'SalesLine.je_attempts missing');
  assert(/last_je_attempt_at: \{ type: Date, default: null \}/.test(sl),
    'SalesLine.last_je_attempt_at missing');
  assert(/this\.outstanding_amount === null[\s\S]*?this\.outstanding_amount = this\.invoice_total/.test(sl),
    'SalesLine pre-save outstanding_amount initialization missing');
  assert(/name: 'ar_aging_open'/.test(sl),
    'SalesLine ar_aging_open partial index missing');
  assert(/name: 'je_status_failed'/.test(sl),
    'SalesLine je_status_failed sparse index missing');
}

{
  const col = read('backend/erp/models/Collection.js');
  assert(/je_status: \{[\s\S]*?enum: \['PENDING', 'POSTED', 'FAILED', null\]/.test(col),
    'Collection.je_status enum missing');
  assert(/je_failure_reason: \{ type: String, default: null \}/.test(col),
    'Collection.je_failure_reason missing');
  assert(/name: 'je_status_failed'/.test(col),
    'Collection je_status_failed sparse index missing');
}

{
  const prf = read('backend/erp/models/PrfCalf.js');
  assert(/je_status: \{[\s\S]*?enum: \['PENDING', 'POSTED', 'FAILED', null\]/.test(prf),
    'PrfCalf.je_status enum missing');
  assert(/name: 'je_status_failed'/.test(prf),
    'PrfCalf je_status_failed sparse index missing');
}

{
  const si = read('backend/erp/models/SupplierInvoice.js');
  assert(/outstanding_amount: \{ type: Number, default: null \}/.test(si),
    'SupplierInvoice.outstanding_amount default null missing');
  assert(/this\.outstanding_amount = Math\.round\(/.test(si),
    'SupplierInvoice pre-save outstanding_amount sync missing');
  assert(/je_status: \{[\s\S]*?enum: \['PENDING', 'POSTED', 'FAILED', null\]/.test(si),
    'SupplierInvoice.je_status enum missing');
  assert(/name: 'ap_aging_open'/.test(si),
    'SupplierInvoice ap_aging_open partial index missing');
  assert(/name: 'je_status_failed'/.test(si),
    'SupplierInvoice je_status_failed sparse index missing');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. arAgingService.js + Collection wiring
// ─────────────────────────────────────────────────────────────────────────────
{
  assert(exists('backend/erp/services/arAgingService.js'),
    'arAgingService.js does not exist');
  const svc = read('backend/erp/services/arAgingService.js');
  assert(/recomputeOutstandingForSale/.test(svc) &&
         /recomputeOutstandingForCollection/.test(svc) &&
         /recomputeOutstandingForSupplierInvoice/.test(svc) &&
         /recomputeAllOutstandingForEntity/.test(svc) &&
         /isCashRoute/.test(svc),
    'arAgingService missing required exports');
  assert(/module\.exports[\s\S]*?recomputeOutstandingForSale/.test(svc),
    'arAgingService.recomputeOutstandingForSale not exported');

  const ctrl = read('backend/erp/controllers/collectionController.js');
  assert(/require\('\.\.\/services\/arAgingService'\)/.test(ctrl),
    'collectionController does not import arAgingService');
  // Three call sites: submitCollections POST, reopenCollections, presidentReverseCollection,
  // and postSingleCollection (approval hub).
  const callSites = (ctrl.match(/recomputeOutstandingForCollection/g) || []).length;
  assert(callSites >= 4,
    `collectionController expected ≥4 recomputeOutstandingForCollection call sites, found ${callSites}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. jeStatusTracker + controller wiring
// ─────────────────────────────────────────────────────────────────────────────
{
  assert(exists('backend/erp/services/jeStatusTracker.js'),
    'jeStatusTracker.js does not exist');
  const tr = read('backend/erp/services/jeStatusTracker.js');
  assert(/markJePosted/.test(tr) && /markJeFailed/.test(tr) && /STATUSES/.test(tr),
    'jeStatusTracker missing exports');

  const col = read('backend/erp/controllers/collectionController.js');
  assert(/require\('\.\.\/services\/jeStatusTracker'\)/.test(col),
    'collectionController does not import jeStatusTracker');
  assert(/markJePosted\('COLLECTION'/.test(col),
    'collectionController.submitCollections does not stamp je_status=POSTED');
  assert(/markJeFailed\('COLLECTION'/.test(col),
    'collectionController.submitCollections does not stamp je_status=FAILED');

  const sales = read('backend/erp/controllers/salesController.js');
  assert(/row\.je_status = 'POSTED'/.test(sales),
    'salesController does not pre-stamp je_status inside JE-TX');

  const ap = read('backend/erp/controllers/purchasingController.js');
  assert(/invoice\.je_status = 'POSTED'/.test(ap),
    'purchasingController does not pre-stamp je_status inside JE-TX');

  const exp = read('backend/erp/controllers/expenseController.js');
  assert(/doc\.je_status = 'POSTED'/.test(exp),
    'expenseController.postSinglePrfCalf does not pre-stamp je_status');
  assert(/doc\.je_status = 'FAILED'/.test(exp),
    'expenseController.postSinglePrfCalf does not flip je_status to FAILED on catch');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Migration script
// ─────────────────────────────────────────────────────────────────────────────
{
  assert(exists('backend/erp/scripts/migrateSubLedgerOutstanding.js'),
    'migrateSubLedgerOutstanding.js does not exist');
  const mig = read('backend/erp/scripts/migrateSubLedgerOutstanding.js');
  assert(/--apply/.test(mig) && /APPLY = !!flag\('apply'\)/.test(mig),
    'migration script does not implement dry-run-by-default + --apply gate');
  assert(/migrateAr/.test(mig) && /migrateAp/.test(mig),
    'migration script missing migrateAr / migrateAp');
  assert(/recomputeOutstandingForSale/.test(mig),
    'migration script does not call recomputeOutstandingForSale');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Integrity sweep extensions
// ─────────────────────────────────────────────────────────────────────────────
{
  const sweep = read('backend/erp/scripts/findAccountingIntegrityIssues.js');
  assert(/async function checkArApSubLedger/.test(sweep),
    'findAccountingIntegrityIssues.js missing checkArApSubLedger');
  assert(/async function checkJeStatusFailed/.test(sweep),
    'findAccountingIntegrityIssues.js missing checkJeStatusFailed');
  assert(/AR_TRADE/.test(sweep) && /AP_TRADE/.test(sweep),
    'sweep missing AR_TRADE / AP_TRADE COA references');
  assert(/checkFilter === 'arap'/.test(sweep),
    'scanAccountingIntegrity does not branch on arap filter');
  assert(/checkFilter === 'jestatus'/.test(sweep),
    'scanAccountingIntegrity does not branch on jestatus filter');
  assert(/sales_je_failed[\s\S]*?collections_je_failed[\s\S]*?prfcalf_je_failed[\s\S]*?supplier_invoice_je_failed/.test(sweep),
    'checkPeriodClose does not gate on JE-FAILED kinds');
  assert(/checkArApSubLedger,[\s\S]*?checkJeStatusFailed,/.test(sweep),
    'sweep module.exports missing checkArApSubLedger / checkJeStatusFailed');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Agent body + key findings rendering
// ─────────────────────────────────────────────────────────────────────────────
{
  const agent = read('backend/agents/accountingIntegrityAgent.js');
  assert(/arApSubLedger/.test(agent),
    'accountingIntegrityAgent body builder missing arApSubLedger render');
  assert(/jeStatusFailed/.test(agent) || /JE-FAILED/.test(agent),
    'accountingIntegrityAgent body builder missing JE-FAILED render');
  assert(/AR\/AP sub-ledger drift/.test(agent),
    'accountingIntegrityAgent key_findings does not summarize AR/AP drift');
  assert(/POSTED row\(s\) with je_status/.test(agent),
    'accountingIntegrityAgent key_findings does not summarize JE-FAILED rows');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Backend retry endpoint + jeRetryAccess
// ─────────────────────────────────────────────────────────────────────────────
{
  assert(exists('backend/erp/utils/jeRetryAccess.js'),
    'jeRetryAccess.js does not exist');
  const acc = read('backend/erp/utils/jeRetryAccess.js');
  assert(/JE_RETRY_ROLES/.test(acc),
    'jeRetryAccess does not query JE_RETRY_ROLES lookup');
  assert(/userCanRetryJe/.test(acc) && /userCanRecomputeAr/.test(acc),
    'jeRetryAccess missing exported helpers');
  assert(/DEFAULT_RETRY_JE = \[ROLES\.ADMIN, ROLES\.FINANCE, ROLES\.PRESIDENT\]/.test(acc),
    'jeRetryAccess defaults are not [admin, finance, president]');

  assert(exists('backend/erp/controllers/integrityController.js'),
    'integrityController.js does not exist');
  const ctrl = read('backend/erp/controllers/integrityController.js');
  assert(/retryJe/.test(ctrl) && /recomputeAr/.test(ctrl),
    'integrityController missing retryJe / recomputeAr');
  assert(/userCanRetryJe/.test(ctrl) && /userCanRecomputeAr/.test(ctrl),
    'integrityController does not gate via userCanRetryJe / userCanRecomputeAr');
  assert(/Document belongs to a different entity/.test(ctrl),
    'integrityController does not enforce entity scope (Rule #19)');

  assert(exists('backend/erp/routes/integrityRoutes.js'),
    'integrityRoutes.js does not exist');
  const routes = read('backend/erp/routes/integrityRoutes.js');
  assert(/router\.post\('\/retry-je', retryJe\)/.test(routes),
    'integrityRoutes does not mount retry-je');
  assert(/router\.post\('\/recompute-ar', recomputeAr\)/.test(routes),
    'integrityRoutes does not mount recompute-ar');

  const idx = read('backend/erp/routes/index.js');
  assert(/router\.use\('\/integrity', require\('\.\/integrityRoutes'\)\)/.test(idx),
    'integrity routes not mounted at /integrity');
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Lookup seed JE_RETRY_ROLES + invalidate hook
// ─────────────────────────────────────────────────────────────────────────────
{
  const lkp = read('backend/erp/controllers/lookupGenericController.js');
  assert(/JE_RETRY_ROLES: \[/.test(lkp),
    'JE_RETRY_ROLES seed missing in SEED_DEFAULTS');
  assert(/code: 'RETRY_JE'/.test(lkp),
    'JE_RETRY_ROLES.RETRY_JE seed missing');
  assert(/code: 'RECOMPUTE_AR'/.test(lkp),
    'JE_RETRY_ROLES.RECOMPUTE_AR seed missing');
  assert(/JE_RETRY_ROLES_CATEGORIES = new Set/.test(lkp),
    'JE_RETRY_ROLES_CATEGORIES set missing');
  assert(/invalidateJeRetryAccess/.test(lkp),
    'invalidateJeRetryAccess hook not wired into lookup CRUD paths');
  // Should fire in create / update / remove / seed (4 distinct branch-points).
  const invocations = (lkp.match(/invalidateJeRetryAccess\(/g) || []).length;
  assert(invocations >= 4,
    `invalidateJeRetryAccess expected ≥4 invocations (create/update/remove/seed), found ${invocations}`);
  assert(/insert_only_metadata: true,[\s\S]*?metadata: \{ roles: \['admin', 'finance', 'president'\] \}/.test(lkp),
    'JE_RETRY_ROLES seed does not use insert_only_metadata + role defaults');
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Frontend integrityService
// ─────────────────────────────────────────────────────────────────────────────
{
  assert(exists('frontend/src/erp/services/integrityService.js'),
    'integrityService.js does not exist');
  const svc = read('frontend/src/erp/services/integrityService.js');
  assert(/export async function retryJe/.test(svc),
    'integrityService missing retryJe export');
  assert(/export async function recomputeAr/.test(svc),
    'integrityService missing recomputeAr export');
  assert(/\/erp\/integrity/.test(svc),
    'integrityService BASE path mismatch');
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. AccountsReceivable page wiring
// ─────────────────────────────────────────────────────────────────────────────
{
  const page = read('frontend/src/erp/pages/AccountsReceivable.jsx');
  assert(/from '\.\.\/services\/integrityService'/.test(page),
    'AccountsReceivable does not import integrityService');
  assert(/recomputeAr/.test(page) && /handleRefresh/.test(page),
    'AccountsReceivable missing recomputeAr handler');
  assert(/data-testid="ar-recompute-button"/.test(page),
    'AccountsReceivable refresh button missing testid');
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. WorkflowGuide ar-aging banner
// ─────────────────────────────────────────────────────────────────────────────
{
  const wg = read('frontend/src/erp/components/WorkflowGuide.jsx');
  assert(/Phase A\.4 — Refresh AR\/AP/.test(wg),
    "WorkflowGuide ar-aging banner missing Phase A.4 'Refresh AR/AP' step");
  assert(/JE_RETRY_ROLES\.RECOMPUTE_AR/.test(wg),
    'WorkflowGuide ar-aging banner missing JE_RETRY_ROLES reference');
  assert(/outstanding_amount.*materialized/.test(wg),
    'WorkflowGuide ar-aging banner missing outstanding_amount-materialized note');
}

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${asserts - failures.length}/${asserts} assertions passed`);
if (failures.length) {
  console.error('\nFAILURES:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log('\n✓ Phase A.4 wiring contract intact.');
process.exit(0);
