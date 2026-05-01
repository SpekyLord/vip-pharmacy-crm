/**
 * Healthcheck: IC Transfer + IC Settlement — Approval Hub Approve/Post wiring
 * (Phase G6.7-PC6, May 01 2026)
 *
 * Statically verifies the Approval Hub's `ic_transfer` handler can drive BOTH
 * physical models that share this hub key:
 *   - InterCompanyTransfer (DRAFT → APPROVED, no JE) via approveSingleIcTransfer
 *   - IcSettlement         (DRAFT → POSTED + IC_SETTLEMENT TransactionEvent) via postSingleIcSettlement
 *
 * Closes the Group B "approve throws → 500" regression for the cross-entity
 * transfer + settlement surface. The handler MUST branch on `request.doc_type`
 * (IC_TRANSFER vs IC_SETTLEMENT) — the two share a module key but have
 * completely different lifecycles and different physical models.
 *
 * Mirrors the posture of PC1-PC5 healthchecks. Same bug class, same fix
 * pattern with one additional doc_type branch.
 *
 * Usage:
 *   node backend/scripts/healthcheckIcTransferHubApprove.js
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

// ── universalApprovalController.js: ic_transfer handler branches on action AND doc_type ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.ic_transfer is no longer a bare buildGroupBReject delegate',
  univCtrl && !/ic_transfer:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "ic_transfer handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'ic_transfer handler still routes reject through buildGroupBReject',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,1500}buildGroupBReject\(/.test(univCtrl),
  "ic_transfer handler must keep the reject path delegating to buildGroupBReject (terminal-state guard against POSTED/CANCELLED/RECEIVED)."
);
check(
  'ic_transfer handler routes approve OR post on the happy path',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,4000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'/.test(univCtrl),
  "ic_transfer handler must accept both 'approve' and 'post' on the happy path."
);
check(
  'ic_transfer handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,5000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "ic_transfer handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the transfer/settlement _id)."
);
check(
  'ic_transfer handler reads request.doc_type to dispatch on IC_TRANSFER vs IC_SETTLEMENT',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,5500}docType\s*=\s*request\?\.doc_type/.test(univCtrl),
  "ic_transfer handler must read request.doc_type — IC_TRANSFER and IC_SETTLEMENT are TWO different physical models."
);
check(
  'ic_transfer handler dispatches IC_SETTLEMENT to postSingleIcSettlement',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,6500}docType\s*===\s*'IC_SETTLEMENT'[\s\S]{0,500}postSingleIcSettlement\(/.test(univCtrl),
  "ic_transfer handler must call postSingleIcSettlement(docId, userId) when request.doc_type === 'IC_SETTLEMENT'."
);
check(
  'ic_transfer handler dispatches IC_TRANSFER (default) to approveSingleIcTransfer',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,7000}approveSingleIcTransfer\(/.test(univCtrl),
  "ic_transfer handler must call approveSingleIcTransfer(docId, userId) when request.doc_type === 'IC_TRANSFER' (the default fallthrough)."
);
check(
  'ic_transfer handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,8000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "ic_transfer handler must explicitly close the ApprovalRequest with status=APPROVED + decided_by + decided_at + decision_reason."
);
check(
  'ic_transfer handler logs decision history on APPROVED',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,9000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "ic_transfer handler must $push a history row when closing the request."
);
check(
  'ic_transfer handler throws on unsupported action',
  univCtrl && /ic_transfer:\s*async[\s\S]{0,10000}Unsupported action for ic_transfer:/.test(univCtrl),
  "ic_transfer handler must throw a clear error on actions other than approve/post/reject."
);

// ── interCompanyController.js: approveSingleIcTransfer helper extracted + exported ──
const icCtrl = readFile('backend/erp/controllers/interCompanyController.js');
check(
  'interCompanyController.js exists',
  !!icCtrl,
  'Expected backend/erp/controllers/interCompanyController.js to be present.'
);
check(
  'approveSingleIcTransfer helper exists',
  icCtrl && /async\s+function\s+approveSingleIcTransfer\s*\(\s*transferId\s*,\s*userId/.test(icCtrl),
  "Expected: async function approveSingleIcTransfer(transferId, userId) in interCompanyController.js"
);
check(
  'approveSingleIcTransfer exported',
  icCtrl && /module\.exports\s*=\s*\{[\s\S]{0,3000}approveSingleIcTransfer/.test(icCtrl),
  "approveSingleIcTransfer must be exported so the Hub handler can require it."
);
check(
  'approveSingleIcTransfer is idempotent on APPROVED + downstream states',
  icCtrl && /approveSingleIcTransfer[\s\S]{0,1500}\['APPROVED',\s*'SHIPPED',\s*'RECEIVED',\s*'POSTED'\][\s\S]{0,200}already_approved:\s*true/.test(icCtrl),
  "approveSingleIcTransfer must short-circuit on APPROVED/SHIPPED/RECEIVED/POSTED — re-approve from Hub must never demote a shipped transfer."
);
check(
  'approveSingleIcTransfer rejects non-DRAFT (idempotency boundary)',
  icCtrl && /approveSingleIcTransfer[\s\S]{0,1800}Cannot approve transfer in/.test(icCtrl),
  "approveSingleIcTransfer must reject approval when status is anything other than DRAFT."
);
check(
  'approveSingleIcTransfer writes ErpAuditLog STATUS_CHANGE row',
  icCtrl && /approveSingleIcTransfer[\s\S]{0,2500}ErpAuditLog\.logChange\(\{[\s\S]{0,500}log_type:\s*'STATUS_CHANGE'/.test(icCtrl),
  "approveSingleIcTransfer must write a STATUS_CHANGE ErpAuditLog row."
);
check(
  'BDM-direct approveTransfer route delegates to approveSingleIcTransfer',
  icCtrl && /const\s+approveTransfer\s*=\s*catchAsync[\s\S]{0,2500}approveSingleIcTransfer\(/.test(icCtrl),
  "approveTransfer route must delegate to approveSingleIcTransfer — keeps BDM-direct and Hub paths in lockstep."
);

// ── icSettlementController.js: postSingleIcSettlement helper extracted + exported ──
const settlCtrl = readFile('backend/erp/controllers/icSettlementController.js');
check(
  'icSettlementController.js exists',
  !!settlCtrl,
  'Expected backend/erp/controllers/icSettlementController.js to be present.'
);
check(
  'postSingleIcSettlement helper exists',
  settlCtrl && /async\s+function\s+postSingleIcSettlement\s*\(\s*settlementId\s*,\s*userId/.test(settlCtrl),
  "Expected: async function postSingleIcSettlement(settlementId, userId) in icSettlementController.js"
);
check(
  'postSingleIcSettlement exported',
  settlCtrl && /module\.exports\s*=\s*\{[\s\S]{0,3000}postSingleIcSettlement/.test(settlCtrl),
  "postSingleIcSettlement must be exported so the Hub handler can require it."
);
check(
  'postSingleIcSettlement is idempotent on POSTED',
  settlCtrl && /postSingleIcSettlement[\s\S]{0,1500}status\s*===\s*'POSTED'[\s\S]{0,200}already_posted:\s*true/.test(settlCtrl),
  "postSingleIcSettlement must short-circuit when settlement.status === 'POSTED' — re-post from Hub must not double-emit IC_SETTLEMENT event."
);
check(
  'postSingleIcSettlement period-locks against the creditor entity',
  settlCtrl && /postSingleIcSettlement[\s\S]{0,2500}checkPeriodOpen\(\s*settlement\.creditor_entity_id/.test(settlCtrl),
  "postSingleIcSettlement must call checkPeriodOpen against the CREDITOR entity (the side recording the receipt)."
);
check(
  'postSingleIcSettlement guards against empty settled_transfers',
  settlCtrl && /postSingleIcSettlement[\s\S]{0,2000}settled_transfers\?\.length/.test(settlCtrl),
  "postSingleIcSettlement must reject post when settled_transfers is empty."
);
check(
  'postSingleIcSettlement creates IC_SETTLEMENT TransactionEvent atomically',
  settlCtrl && /postSingleIcSettlement[\s\S]{0,4500}withTransaction\(/.test(settlCtrl)
            && /postSingleIcSettlement[\s\S]{0,4500}TransactionEvent\.create\(\[\{[\s\S]{0,500}event_type:\s*'IC_SETTLEMENT'/.test(settlCtrl),
  "postSingleIcSettlement must create the IC_SETTLEMENT TransactionEvent inside withTransaction (status flip + event creation atomic)."
);
check(
  'BDM-direct postSettlement route delegates to postSingleIcSettlement',
  settlCtrl && /const\s+postSettlement\s*=\s*catchAsync[\s\S]{0,3500}postSingleIcSettlement\(/.test(settlCtrl),
  "postSettlement route must delegate to postSingleIcSettlement — single source of truth."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'IC_TRANSFER module query still uses buildGapModulePendingItems with both doc_types',
  univSvc && /docTypeToModel:\s*\{[^}]*IC_TRANSFER:\s*'InterCompanyTransfer'[^}]*IC_SETTLEMENT:\s*'IcSettlement'/.test(univSvc),
  "IC_TRANSFER MODULE_QUERIES entry must hydrate both InterCompanyTransfer (IC_TRANSFER) and IcSettlement (IC_SETTLEMENT) doc_types."
);
check(
  'approve_ic_transfer sub-key wired in MODULE_TO_SUB_KEY',
  univSvc && /IC_TRANSFER[\s\S]{0,300}sub_key:\s*'approve_ic_transfer'/.test(univSvc),
  "IC_TRANSFER MODULE_QUERIES entry must expose sub_key='approve_ic_transfer' so the sub-perm gate is wired."
);

// ── TYPE_TO_MODULE wiring ──
check(
  "TYPE_TO_MODULE.ic_transfer maps to 'IC_TRANSFER'",
  univCtrl && /ic_transfer:\s*'IC_TRANSFER'/.test(univCtrl),
  "TYPE_TO_MODULE.ic_transfer must map to 'IC_TRANSFER' so the approve_ic_transfer sub-perm gate fires."
);

// ── Sibling healthchecks still present (no regression) ──
const siblings = [
  ['backend/scripts/healthcheckPettyCashHubApprove.js', 'G6.7-PC1 petty_cash'],
  ['backend/scripts/healthcheckJournalHubApprove.js', 'G6.7-PC2 journal'],
  ['backend/scripts/healthcheckIncentivePayoutHubApprove.js', 'G6.7-PC3 incentive_payout'],
  ['backend/scripts/healthcheckPurchasingHubApprove.js', 'G6.7-PC4 purchasing'],
  ['backend/scripts/healthcheckSalesGoalPlanHubApprove.js', 'G6.7-PC5 sales_goal_plan'],
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
