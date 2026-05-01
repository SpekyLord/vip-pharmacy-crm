/**
 * Healthcheck: Sales Goal Plan — Approval Hub Approve/Post wiring (Phase G6.7-PC5, May 01 2026)
 *
 * Statically verifies the Approval Hub's `sales_goal_plan` handler can drive
 * a SalesGoalPlan through DRAFT → ACTIVE with its full activation cascade
 * (closes the Group B "approve throws → 500" regression for sales goal plans).
 *
 * Mirrors the posture of the prior PC1-PC4 healthchecks. The activation cascade
 * is THE most cascade-heavy of the seven Group B modules — assertions cover:
 * status guard, transactional atomicity, plan reference assignment, target flip,
 * BDM auto-enroll, KPI variance threshold seed, IncentivePlan header sync,
 * lifecycle notification + integration event, and idempotency on ACTIVE.
 *
 * Usage:
 *   node backend/scripts/healthcheckSalesGoalPlanHubApprove.js
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

// ── universalApprovalController.js: sales_goal_plan handler branches on action ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.sales_goal_plan is no longer a bare buildGroupBReject delegate',
  univCtrl && !/sales_goal_plan:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "sales_goal_plan handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'sales_goal_plan handler still routes reject through buildGroupBReject',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,1500}buildGroupBReject\(/.test(univCtrl),
  "sales_goal_plan handler must keep the reject path delegating to buildGroupBReject (terminal-state guard against CLOSED/REVERSED)."
);
check(
  'sales_goal_plan handler routes approve OR post through postSingleSalesGoalPlan',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,5000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,3000}postSingleSalesGoalPlan\(/.test(univCtrl),
  "sales_goal_plan handler must dereference ApprovalRequest.doc_id and call postSingleSalesGoalPlan(planId, userId) on approve/post."
);
check(
  'sales_goal_plan handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,5000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "sales_goal_plan handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the plan _id)."
);
check(
  'sales_goal_plan handler reads request.doc_type for plan-adjacent doc_types',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,6000}docType\s*=\s*request\?\.doc_type/.test(univCtrl),
  "sales_goal_plan handler must read request.doc_type so plan-adjacent types (BULK_TARGETS_IMPORT / PLAN_NEW_VERSION / TARGET_REVISION) can short-circuit."
);
check(
  'sales_goal_plan handler short-circuits non-PLAN_ACTIVATE doc_types (no model-backed activation)',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,7000}docType\s*!==\s*'PLAN_ACTIVATE'\s*&&\s*docType\s*!==\s*'SALES_GOAL_PLAN'/.test(univCtrl),
  "sales_goal_plan handler must short-circuit plan-adjacent doc_types (BULK_TARGETS_IMPORT / PLAN_NEW_VERSION / TARGET_REVISION) — admin must trigger those via module-specific endpoints."
);
check(
  'sales_goal_plan handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,8000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "sales_goal_plan handler must explicitly close the ApprovalRequest with status=APPROVED + decided_by + decided_at + decision_reason."
);
check(
  'sales_goal_plan handler logs decision history on APPROVED',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,9000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "sales_goal_plan handler must $push a history row when closing the request."
);
check(
  'sales_goal_plan handler throws on unsupported action',
  univCtrl && /sales_goal_plan:\s*async[\s\S]{0,10000}Unsupported action for sales_goal_plan:/.test(univCtrl),
  "sales_goal_plan handler must throw a clear error on actions other than approve/post/reject."
);

// ── salesGoalController.js: postSingleSalesGoalPlan helper extracted + exported ──
const sgCtrl = readFile('backend/erp/controllers/salesGoalController.js');
check(
  'salesGoalController.js exists',
  !!sgCtrl,
  'Expected backend/erp/controllers/salesGoalController.js to be present.'
);
check(
  'postSingleSalesGoalPlan helper exists',
  sgCtrl && /async\s+function\s+postSingleSalesGoalPlan\s*\(\s*planId\s*,\s*userId/.test(sgCtrl),
  "Expected: async function postSingleSalesGoalPlan(planId, userId) in salesGoalController.js"
);
check(
  'postSingleSalesGoalPlan exported',
  sgCtrl && /exports\.postSingleSalesGoalPlan\s*=\s*postSingleSalesGoalPlan/.test(sgCtrl),
  "postSingleSalesGoalPlan must be exported so the Hub handler can require it."
);
check(
  'postSingleSalesGoalPlan is idempotent on ACTIVE',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,800}status\s*===\s*'ACTIVE'[\s\S]{0,200}already_active:\s*true/.test(sgCtrl),
  "postSingleSalesGoalPlan must short-circuit when plan.status === 'ACTIVE' — re-clicking Approve from the Hub must NOT re-run the activation cascade (would double-enroll BDMs / burn fresh reference number / re-emit lifecycle event)."
);
check(
  'postSingleSalesGoalPlan rejects non-DRAFT (idempotency boundary)',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,1200}Only DRAFT plans can be activated/.test(sgCtrl),
  "postSingleSalesGoalPlan must reject activation when status is anything other than DRAFT (idempotent on ACTIVE, throws on REVERSED/CLOSED)."
);
check(
  'postSingleSalesGoalPlan wraps cascade in mongoose.withTransaction',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,3000}session\.withTransaction\(/.test(sgCtrl),
  "postSingleSalesGoalPlan must wrap the entire activation cascade in a transaction so plan.reference is not burned on rollback."
);
check(
  'postSingleSalesGoalPlan generates plan.reference if blank (inside transaction)',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,3000}generateSalesGoalNumber\(/.test(sgCtrl),
  "postSingleSalesGoalPlan must call generateSalesGoalNumber to assign plan.reference on first activation."
);
check(
  'postSingleSalesGoalPlan flips DRAFT SalesGoalTargets to ACTIVE',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,4000}SalesGoalTarget\.updateMany\(\s*\{\s*plan_id:\s*plan\._id,\s*status:\s*'DRAFT'\s*\}/.test(sgCtrl),
  "postSingleSalesGoalPlan must cascade-flip SalesGoalTargets DRAFT → ACTIVE inside the same transaction."
);
check(
  'postSingleSalesGoalPlan auto-enrolls eligible BDMs',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,4500}autoEnrollEligibleBdms\(/.test(sgCtrl),
  "postSingleSalesGoalPlan must call autoEnrollEligibleBdms (BDM-level idempotent — skips already-enrolled set)."
);
check(
  'postSingleSalesGoalPlan seeds KPI_VARIANCE_THRESHOLDS.GLOBAL',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,5000}ensureKpiVarianceGlobalThreshold\(/.test(sgCtrl),
  "postSingleSalesGoalPlan must lazy-seed the KPI_VARIANCE_THRESHOLDS.GLOBAL row so subscribers don't have to manually configure it."
);
check(
  'postSingleSalesGoalPlan syncs IncentivePlan header (idempotent unique-index sync)',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,5500}syncHeaderOnActivation\(/.test(sgCtrl),
  "postSingleSalesGoalPlan must call incentivePlanService.syncHeaderOnActivation (O(1) via unique index — won't double-create)."
);
check(
  'postSingleSalesGoalPlan writes ErpAuditLog STATUS_CHANGE row',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,6500}ErpAuditLog\.logChange\([\s\S]{0,800}log_type:\s*'STATUS_CHANGE'/.test(sgCtrl),
  "postSingleSalesGoalPlan must write a STATUS_CHANGE ErpAuditLog row inside the transaction."
);
check(
  'postSingleSalesGoalPlan emits PLAN_ACTIVATED integration event post-commit',
  sgCtrl && /postSingleSalesGoalPlan[\s\S]{0,8000}INTEGRATION_EVENTS\.PLAN_ACTIVATED/.test(sgCtrl),
  "postSingleSalesGoalPlan must emit PLAN_ACTIVATED integration event AFTER the transaction commits (best-effort)."
);
check(
  'BDM-direct activatePlan route delegates to postSingleSalesGoalPlan',
  sgCtrl && /exports\.activatePlan\s*=\s*catchAsync[\s\S]{0,3500}postSingleSalesGoalPlan\(/.test(sgCtrl),
  "exports.activatePlan must delegate to postSingleSalesGoalPlan — single source of truth for activation cascade."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'SALES_GOAL_PLAN module query still uses buildGapModulePendingItems',
  univSvc && /module:\s*'SALES_GOAL_PLAN'[\s\S]{0,1500}buildGapModulePendingItems/.test(univSvc),
  "SALES_GOAL_PLAN MODULE_QUERIES entry should still surface items via buildGapModulePendingItems (unchanged contract)."
);
check(
  'SALES_GOAL_PLAN actionType stays "sales_goal_plan" (matches Hub handler key)',
  univSvc && /module:\s*'SALES_GOAL_PLAN'[\s\S]{0,2000}actionType:\s*'sales_goal_plan'/.test(univSvc),
  "actionType must remain 'sales_goal_plan' so the Hub handler key stays in sync."
);
check(
  'approve_sales_goal sub-key wired in MODULE_TO_SUB_KEY',
  univSvc && /SALES_GOAL_PLAN[\s\S]{0,300}sub_key:\s*'approve_sales_goal'/.test(univSvc),
  "SALES_GOAL_PLAN MODULE_QUERIES entry must expose sub_key='approve_sales_goal' so the sub-perm gate is wired."
);

// ── TYPE_TO_MODULE wiring ──
check(
  "TYPE_TO_MODULE.sales_goal_plan maps to 'SALES_GOAL_PLAN'",
  univCtrl && /sales_goal_plan:\s*'SALES_GOAL_PLAN'/.test(univCtrl),
  "TYPE_TO_MODULE.sales_goal_plan must map to 'SALES_GOAL_PLAN' so the approve_sales_goal sub-perm gate fires."
);

// ── Sibling healthchecks still present (no regression) ──
const siblings = [
  ['backend/scripts/healthcheckPettyCashHubApprove.js', 'G6.7-PC1 petty_cash'],
  ['backend/scripts/healthcheckJournalHubApprove.js', 'G6.7-PC2 journal'],
  ['backend/scripts/healthcheckIncentivePayoutHubApprove.js', 'G6.7-PC3 incentive_payout'],
  ['backend/scripts/healthcheckPurchasingHubApprove.js', 'G6.7-PC4 purchasing'],
];
for (const [p, label] of siblings) {
  check(
    `Phase ${label} healthcheck still present (sibling sanity)`,
    fs.existsSync(path.join(ROOT, p)),
    `${label} healthcheck file should remain — same bug class, parallel fix.`
  );
}

// ── Summary ──
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
console.log(`Healthcheck: ${pass}/${checks.length} PASS`);
if (fail > 0) {
  console.log(`              ${fail} FAILED`);
  process.exit(1);
}
process.exit(0);
