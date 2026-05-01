/**
 * Healthcheck: G6.7-PC4..PC7 — Approval Hub Approve/Post wiring (May 01 2026)
 *
 * Statically verifies the Approval Hub's purchasing / sales_goal_plan /
 * ic_transfer / banking handlers can post the underlying document (closes
 * the Group B "approve throws → 500" regression for the remaining 4 modules).
 *
 * Mirrors the posture of healthcheckJournalHubApprove.js (G6.7-PC2) and
 * healthcheckIncentivePayoutHubApprove.js (G6.7-PC3) — same bug class, same
 * fix template applied four ways.
 *
 * Usage:
 *   node backend/scripts/healthcheckG67Pc4Through7HubApprove.js
 *
 * Exit code 0 = green. Exit code 1 = at least one check failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const checks = [];

function check(label, condition, hint = '') {
  checks.push({ label, ok: !!condition, hint });
}

function readFile(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
const univSvc  = readFile('backend/erp/services/universalApprovalService.js');

check('universalApprovalController.js exists', !!univCtrl);
check('universalApprovalService.js exists', !!univSvc);

// ─────────────────────────────────────────────────────────────────────────
//  PC4 — purchasing (SupplierInvoice)
// ─────────────────────────────────────────────────────────────────────────
const purchCtrl = readFile('backend/erp/controllers/purchasingController.js');
check('purchasingController.js exists', !!purchCtrl);
check(
  'PC4: postSingleSupplierInvoice helper extracted',
  purchCtrl && /async\s+function\s+postSingleSupplierInvoice\s*\(\s*invoiceId\s*,\s*userId\s*\)/.test(purchCtrl),
  'Expected: async function postSingleSupplierInvoice(invoiceId, userId) in purchasingController.js'
);
check(
  'PC4: helper exported on module.exports',
  purchCtrl && /module\.exports\s*=\s*\{[\s\S]{0,2000}postSingleSupplierInvoice/.test(purchCtrl)
);
check(
  'PC4: helper short-circuits when invoice already POSTED (idempotent)',
  purchCtrl && /postSingleSupplierInvoice[\s\S]{0,800}invoice\.status\s*===\s*'POSTED'/.test(purchCtrl)
);
check(
  'PC4: helper period-locks against the invoice\'s OWN entity_id (cross-entity-safe)',
  purchCtrl && /postSingleSupplierInvoice[\s\S]{0,1500}checkPeriodOpen\(\s*invoice\.entity_id/.test(purchCtrl)
);
check(
  'PC4: helper posts JE atomically inside withTransaction',
  purchCtrl && /postSingleSupplierInvoice[\s\S]{0,2500}withTransaction\([\s\S]{0,800}createAndPostJournal\(/.test(purchCtrl)
);
check(
  'PC4: BDM-direct postInvoice route delegates to postSingleSupplierInvoice',
  purchCtrl && /postInvoice\s*=\s*catchAsync[\s\S]{0,1500}postSingleSupplierInvoice\(\s*invoicePre\._id/.test(purchCtrl)
);
check(
  'PC4: purchasing handler is no longer a bare buildGroupBReject delegate',
  univCtrl && !/purchasing:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  'purchasing handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post).'
);
check(
  'PC4: purchasing handler keeps reject path through buildGroupBReject',
  univCtrl && /purchasing:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,800}buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC4: purchasing handler routes approve/post through postSingleSupplierInvoice',
  univCtrl && /purchasing:\s*async[\s\S]{0,4500}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,3000}postSingleSupplierInvoice\(/.test(univCtrl)
);
check(
  'PC4: purchasing handler dereferences ApprovalRequest by id (Group B)',
  univCtrl && /purchasing:\s*async[\s\S]{0,4500}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl)
);
check(
  'PC4: purchasing handler closes ApprovalRequest to APPROVED',
  univCtrl && /purchasing:\s*async[\s\S]{0,5500}ApprovalRequest\.updateOne\([\s\S]{0,800}'APPROVED'/.test(univCtrl)
);
check(
  'PC4: purchasing handler throws on unsupported action',
  univCtrl && /Unsupported action for purchasing:/.test(univCtrl)
);

// ─────────────────────────────────────────────────────────────────────────
//  PC5 — sales_goal_plan (SalesGoalPlan)
// ─────────────────────────────────────────────────────────────────────────
const sgpCtrl = readFile('backend/erp/controllers/salesGoalController.js');
check('salesGoalController.js exists', !!sgpCtrl);
check(
  'PC5: postSingleSalesGoalPlan helper extracted',
  sgpCtrl && /async\s+function\s+postSingleSalesGoalPlan\s*\(\s*planId\s*,\s*userId\s*\)/.test(sgpCtrl)
);
check(
  'PC5: helper exported',
  sgpCtrl && /exports\.postSingleSalesGoalPlan\s*=\s*postSingleSalesGoalPlan/.test(sgpCtrl)
);
check(
  'PC5: helper short-circuits on plan.status === ACTIVE (cascade idempotency)',
  sgpCtrl && /postSingleSalesGoalPlan[\s\S]{0,800}plan\.status\s*===\s*'ACTIVE'/.test(sgpCtrl)
);
check(
  'PC5: helper runs the full activation cascade inside withTransaction',
  sgpCtrl && /postSingleSalesGoalPlan[\s\S]{0,4500}withTransaction\([\s\S]{0,3000}generateSalesGoalNumber[\s\S]{0,2000}autoEnrollEligibleBdms[\s\S]{0,1500}syncHeaderOnActivation/.test(sgpCtrl)
);
check(
  'PC5: BDM-direct activatePlan route delegates to postSingleSalesGoalPlan',
  sgpCtrl && /activatePlan\s*=\s*catchAsync[\s\S]{0,2500}postSingleSalesGoalPlan\(\s*planPre\._id/.test(sgpCtrl)
);
check(
  'PC5: sales_goal_plan handler is no longer a bare buildGroupBReject delegate',
  univCtrl && !/sales_goal_plan:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC5: sales_goal_plan handler routes approve/post through postSingleSalesGoalPlan',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,5000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,3000}postSingleSalesGoalPlan\(/.test(univCtrl)
);
check(
  'PC5: sales_goal_plan handler keeps reject path on buildGroupBReject',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,2000}action\s*===\s*'reject'[\s\S]{0,800}buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC5: sales_goal_plan handler short-circuits non-PLAN_ACTIVATE doc_types',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,5500}docType\s*!==\s*'PLAN_ACTIVATE'/.test(univCtrl)
);
check(
  'PC5: sales_goal_plan handler closes ApprovalRequest to APPROVED',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,7500}ApprovalRequest\.updateOne\([\s\S]{0,800}'APPROVED'/.test(univCtrl)
);

// ─────────────────────────────────────────────────────────────────────────
//  PC6 — ic_transfer (InterCompanyTransfer + IcSettlement, branch on doc_type)
// ─────────────────────────────────────────────────────────────────────────
const icCtrl  = readFile('backend/erp/controllers/interCompanyController.js');
const icsCtrl = readFile('backend/erp/controllers/icSettlementController.js');
check('interCompanyController.js exists', !!icCtrl);
check('icSettlementController.js exists', !!icsCtrl);
check(
  'PC6: approveSingleIcTransfer helper extracted',
  icCtrl && /async\s+function\s+approveSingleIcTransfer\s*\(\s*transferId\s*,\s*userId\s*\)/.test(icCtrl)
);
check(
  'PC6: approveSingleIcTransfer is idempotent on APPROVED|SHIPPED|RECEIVED|POSTED',
  icCtrl && /approveSingleIcTransfer[\s\S]{0,800}\['APPROVED',\s*'SHIPPED',\s*'RECEIVED',\s*'POSTED'\]/.test(icCtrl)
);
check(
  'PC6: approveSingleIcTransfer exported',
  icCtrl && /module\.exports\s*=\s*\{[\s\S]{0,2000}approveSingleIcTransfer/.test(icCtrl)
);
check(
  'PC6: approveTransfer route delegates to approveSingleIcTransfer',
  icCtrl && /approveTransfer\s*=\s*catchAsync[\s\S]{0,2000}approveSingleIcTransfer\(\s*transferPre\._id/.test(icCtrl)
);
check(
  'PC6: postSingleIcSettlement helper extracted',
  icsCtrl && /async\s+function\s+postSingleIcSettlement\s*\(\s*settlementId\s*,\s*userId\s*\)/.test(icsCtrl)
);
check(
  'PC6: postSingleIcSettlement is idempotent on POSTED',
  icsCtrl && /postSingleIcSettlement[\s\S]{0,800}settlement\.status\s*===\s*'POSTED'/.test(icsCtrl)
);
check(
  'PC6: postSingleIcSettlement period-locks against creditor_entity_id',
  icsCtrl && /postSingleIcSettlement[\s\S]{0,1800}checkPeriodOpen\(\s*settlement\.creditor_entity_id/.test(icsCtrl)
);
check(
  'PC6: postSingleIcSettlement creates TransactionEvent + flips status atomically',
  icsCtrl && /postSingleIcSettlement[\s\S]{0,2500}withTransaction\([\s\S]{0,1500}TransactionEvent\.create/.test(icsCtrl)
);
check(
  'PC6: postSingleIcSettlement exported',
  icsCtrl && /module\.exports\s*=\s*\{[\s\S]{0,2000}postSingleIcSettlement/.test(icsCtrl)
);
check(
  'PC6: postSettlement route delegates to postSingleIcSettlement',
  icsCtrl && /postSettlement\s*=\s*catchAsync[\s\S]{0,2500}postSingleIcSettlement\(\s*settlementPre\._id/.test(icsCtrl)
);
check(
  'PC6: ic_transfer handler is no longer a bare buildGroupBReject delegate',
  univCtrl && !/ic_transfer:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC6: ic_transfer handler keeps reject path on buildGroupBReject',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,800}buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC6: ic_transfer handler branches on request.doc_type IC_SETTLEMENT vs IC_TRANSFER',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,4000}docType\s*===\s*'IC_SETTLEMENT'[\s\S]{0,800}postSingleIcSettlement\(/.test(univCtrl)
        && /ic_transfer:\s*async[\s\S]{0,5000}approveSingleIcTransfer\(/.test(univCtrl)
);
check(
  'PC6: ic_transfer handler closes ApprovalRequest to APPROVED',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,6500}ApprovalRequest\.updateOne\([\s\S]{0,800}'APPROVED'/.test(univCtrl)
);

// ─────────────────────────────────────────────────────────────────────────
//  PC7 — banking (BankStatement → finalizeRecon)
// ─────────────────────────────────────────────────────────────────────────
const reconSvc = readFile('backend/erp/services/bankReconService.js');
check('bankReconService.js exists', !!reconSvc);
check(
  'PC7: finalizeRecon helper exported (existing — not changed)',
  reconSvc && /async\s+function\s+finalizeRecon\s*\(\s*statementId\s*,\s*userId\s*\)/.test(reconSvc)
        && /module\.exports\s*=\s*\{[\s\S]{0,500}finalizeRecon/.test(reconSvc)
);
check(
  'PC7: finalizeRecon throws on already-FINALIZED state (Hub guards before calling)',
  reconSvc && /finalizeRecon[\s\S]{0,500}Already finalized/.test(reconSvc)
);
check(
  'PC7: banking handler is no longer a bare buildGroupBReject delegate',
  univCtrl && !/banking:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC7: banking handler keeps reject path on buildGroupBReject',
  univCtrl && /banking:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,800}buildGroupBReject\(/.test(univCtrl)
);
check(
  'PC7: banking handler routes approve/post through finalizeRecon',
  univCtrl && /banking:\s*async[\s\S]{0,4000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,3000}finalizeRecon\(/.test(univCtrl)
);
check(
  'PC7: banking handler short-circuits when statement already FINALIZED (idempotent)',
  univCtrl && /banking:\s*async[\s\S]{0,5000}stmtPre\.status\s*===\s*'FINALIZED'/.test(univCtrl)
);
check(
  'PC7: banking handler closes ApprovalRequest to APPROVED',
  univCtrl && /banking:\s*async[\s\S]{0,6500}ApprovalRequest\.updateOne\([\s\S]{0,800}'APPROVED'/.test(univCtrl)
);
check(
  'PC7: banking handler throws on unsupported action',
  univCtrl && /Unsupported action for banking:/.test(univCtrl)
);

// ─────────────────────────────────────────────────────────────────────────
//  Sibling sanity — earlier G6.7 phases still wired
// ─────────────────────────────────────────────────────────────────────────
check(
  'Sibling sanity: G6.7-PC1 petty_cash healthcheck still present',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckPettyCashHubApprove.js'))
);
check(
  'Sibling sanity: G6.7-PC2 journal healthcheck still present',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckJournalHubApprove.js'))
);
check(
  'Sibling sanity: G6.7-PC3 incentive_payout healthcheck still present',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckIncentivePayoutHubApprove.js'))
);

// ─────────────────────────────────────────────────────────────────────────
//  Summary
// ─────────────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
for (const c of checks) {
  if (c.ok) {
    pass++;
    console.log(`  PASS  ${c.label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${c.label}`);
    if (c.hint) console.log(`        Hint: ${c.hint}`);
  }
}
console.log('');
console.log(`Healthcheck (G6.7-PC4..PC7): ${pass}/${checks.length} PASS`);
if (fail > 0) {
  console.log(`              ${fail} FAILED`);
  process.exit(1);
}
process.exit(0);
