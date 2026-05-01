/**
 * Healthcheck: Incentive Payout — Approval Hub Approve/Post wiring (Phase G6.7-PC3, Apr 30 2026)
 *
 * Statically verifies the Approval Hub's `incentive_payout` handler can drive
 * an IncentivePayout through approve / pay / reverse based on the underlying
 * ApprovalRequest.doc_type (closes the Group B "approve throws → 500"
 * regression for incentive payouts).
 *
 * Mirrors the posture of healthcheckPettyCashHubApprove.js (G6.7-PC1) and
 * healthcheckJournalHubApprove.js (G6.7-PC2) — same bug class, same fix
 * pattern with an extra doc_type branch (PAYOUT_APPROVE / PAYOUT_PAY /
 * PAYOUT_REVERSE / STATEMENT_DISPATCH).
 *
 * Usage:
 *   node backend/scripts/healthcheckIncentivePayoutHubApprove.js
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

// ── universalApprovalController.js: incentive_payout handler branches on action ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.incentive_payout is no longer a bare buildGroupBReject delegate',
  univCtrl && !/incentive_payout:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "incentive_payout handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'incentive_payout handler still routes reject through buildGroupBReject',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,3000}action\s*===\s*'reject'[\s\S]{0,1500}buildGroupBReject\(/.test(univCtrl),
  "incentive_payout handler must keep the reject path delegating to buildGroupBReject (terminal-state guard against PAID/REVERSED)."
);
check(
  'incentive_payout handler routes approve OR post through the lifecycle helpers',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,5000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'/.test(univCtrl),
  "incentive_payout handler must accept both 'approve' and 'post' actions on the happy path."
);
check(
  'incentive_payout handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,5000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "incentive_payout handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the payout _id)."
);
check(
  'incentive_payout handler reads request.doc_type to branch on lifecycle action',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,5000}request\?\.doc_type/.test(univCtrl),
  "incentive_payout handler must read request.doc_type to dispatch to the correct lifecycle helper (PAYOUT_APPROVE / PAYOUT_PAY / PAYOUT_REVERSE)."
);
check(
  'incentive_payout handler invokes postSinglePayoutApproval on PAYOUT_APPROVE doc_type',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,6000}docType\s*===\s*'PAYOUT_APPROVE'[\s\S]{0,500}postSinglePayoutApproval\(/.test(univCtrl),
  "incentive_payout handler must call postSinglePayoutApproval(payoutId, userId) when request.doc_type === 'PAYOUT_APPROVE'."
);
check(
  'incentive_payout handler invokes postSinglePayoutPayment on PAYOUT_PAY (default) doc_type',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,6500}postSinglePayoutPayment\(\s*payoutId/.test(univCtrl),
  "incentive_payout handler must call postSinglePayoutPayment(payoutId, userId) on PAYOUT_PAY (default fallthrough)."
);
check(
  'incentive_payout handler invokes postSinglePayoutReversal on PAYOUT_REVERSE doc_type',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,6500}docType\s*===\s*'PAYOUT_REVERSE'[\s\S]{0,800}postSinglePayoutReversal\(/.test(univCtrl),
  "incentive_payout handler must call postSinglePayoutReversal(payoutId, userId, reason) when request.doc_type === 'PAYOUT_REVERSE'."
);
check(
  'incentive_payout handler short-circuits STATEMENT_DISPATCH (no payout state change)',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,7000}docType\s*===\s*'STATEMENT_DISPATCH'/.test(univCtrl),
  "incentive_payout handler must short-circuit STATEMENT_DISPATCH — there's no underlying IncentivePayout to mutate; just close the request."
);
check(
  'incentive_payout handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,8000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "incentive_payout handler must explicitly close the ApprovalRequest (the shared auto-resolve at L1130-1160 keys on doc_id, which never matches Group B items)."
);
check(
  'incentive_payout handler logs decision history on APPROVED',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,9000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "incentive_payout handler must $push a history row when closing the request — keeps the Approval History tab honest."
);
check(
  'incentive_payout handler throws on unsupported action',
  univCtrl && /incentive_payout:\s*async[\s\S]{0,10000}Unsupported action for incentive_payout:/.test(univCtrl),
  "incentive_payout handler must throw a clear error on actions other than approve/post/reject."
);

// ── incentivePayoutController.js: lifecycle helpers exported ──
const ipCtrl = readFile('backend/erp/controllers/incentivePayoutController.js');
check(
  'incentivePayoutController.js exists',
  !!ipCtrl,
  'Expected backend/erp/controllers/incentivePayoutController.js to be present.'
);
check(
  'postSinglePayoutApproval helper exists',
  ipCtrl && /async\s+function\s+postSinglePayoutApproval\s*\(\s*payoutId\s*,\s*userId/.test(ipCtrl),
  "Expected: async function postSinglePayoutApproval(payoutId, userId, notes) in incentivePayoutController.js"
);
check(
  'postSinglePayoutPayment helper exists',
  ipCtrl && /async\s+function\s+postSinglePayoutPayment\s*\(\s*payoutId\s*,\s*userId/.test(ipCtrl),
  "Expected: async function postSinglePayoutPayment(payoutId, userId, paidViaOpts) in incentivePayoutController.js"
);
check(
  'postSinglePayoutReversal helper exists',
  ipCtrl && /async\s+function\s+postSinglePayoutReversal\s*\(\s*payoutId\s*,\s*userId\s*,\s*reason/.test(ipCtrl),
  "Expected: async function postSinglePayoutReversal(payoutId, userId, reason) in incentivePayoutController.js"
);
check(
  'helpers exported as module.exports',
  ipCtrl && /exports\.postSinglePayoutApproval\s*=\s*postSinglePayoutApproval/.test(ipCtrl)
         && /exports\.postSinglePayoutPayment\s*=\s*postSinglePayoutPayment/.test(ipCtrl)
         && /exports\.postSinglePayoutReversal\s*=\s*postSinglePayoutReversal/.test(ipCtrl),
  "All three lifecycle helpers must be exported so the Hub handler can require them."
);
check(
  'postSinglePayoutPayment is idempotent on PAID',
  ipCtrl && /postSinglePayoutPayment[\s\S]{0,1500}payout\.status\s*===\s*'PAID'[\s\S]{0,200}already_paid:\s*true/.test(ipCtrl),
  "postSinglePayoutPayment must short-circuit when payout.status === 'PAID' — re-approve from Hub must not double-post settlement JE."
);
check(
  'postSinglePayoutApproval is idempotent on APPROVED|PAID',
  ipCtrl && /postSinglePayoutApproval[\s\S]{0,1500}status\s*===\s*'APPROVED'\s*\|\|\s*payout\.status\s*===\s*'PAID'/.test(ipCtrl),
  "postSinglePayoutApproval must short-circuit when payout is already APPROVED or PAID — never demote a paid row."
);
check(
  'postSinglePayoutReversal is idempotent on REVERSED',
  ipCtrl && /postSinglePayoutReversal[\s\S]{0,1500}status\s*===\s*'REVERSED'[\s\S]{0,200}already_reversed:\s*true/.test(ipCtrl),
  "postSinglePayoutReversal must short-circuit when payout.status === 'REVERSED' — re-firing must not double-reverse."
);
check(
  'postSinglePayoutPayment period-locks against the payout\'s own entity_id',
  ipCtrl && /postSinglePayoutPayment[\s\S]{0,2000}checkPeriodOpen\(\s*payout\.entity_id/.test(ipCtrl),
  "postSinglePayoutPayment must call checkPeriodOpen(payout.entity_id, currentPeriodString()) — Hub approvers may be cross-entity privileged users."
);
check(
  'postSinglePayoutPayment posts a settlement JE via postSettlementJournal',
  ipCtrl && /postSinglePayoutPayment[\s\S]{0,3000}postSettlementJournal\(\s*payout\s*,/.test(ipCtrl),
  "postSinglePayoutPayment must call postSettlementJournal(payout, plan?.reference, bdmLabel, userId, paymentModeDoc) — the JE landing is the hard-fail boundary."
);
check(
  'postSinglePayoutReversal posts a storno via reverseAccrualJournal',
  ipCtrl && /postSinglePayoutReversal[\s\S]{0,2000}reverseAccrualJournal\(\s*payout\.journal_id/.test(ipCtrl),
  "postSinglePayoutReversal must call reverseAccrualJournal(payout.journal_id, reason, userId, payout.entity_id)."
);
check(
  'postSinglePayoutPayment writes ErpAuditLog STATUS_CHANGE row',
  ipCtrl && /postSinglePayoutPayment[\s\S]{0,4000}ErpAuditLog\.logChange\(\{[\s\S]{0,800}log_type:\s*'STATUS_CHANGE'/.test(ipCtrl),
  "postSinglePayoutPayment must write an ErpAuditLog row so the BDM-direct and Hub paths produce identical audit trails."
);
check(
  'BDM-direct payPayout route delegates to postSinglePayoutPayment',
  ipCtrl && /exports\.payPayout\s*=\s*catchAsync[\s\S]{0,3000}postSinglePayoutPayment\(/.test(ipCtrl),
  "exports.payPayout must delegate to postSinglePayoutPayment — keeps BDM-direct and Hub paths in lockstep."
);
check(
  'BDM-direct approvePayout route delegates to postSinglePayoutApproval',
  ipCtrl && /exports\.approvePayout\s*=\s*catchAsync[\s\S]{0,3000}postSinglePayoutApproval\(/.test(ipCtrl),
  "exports.approvePayout must delegate to postSinglePayoutApproval — single source of truth for ACCRUED→APPROVED."
);
check(
  'BDM-direct reversePayout route delegates to postSinglePayoutReversal',
  ipCtrl && /exports\.reversePayout\s*=\s*catchAsync[\s\S]{0,3000}postSinglePayoutReversal\(/.test(ipCtrl),
  "exports.reversePayout must delegate to postSinglePayoutReversal — single source of truth for ACCRUED|APPROVED|PAID → REVERSED."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'INCENTIVE_PAYOUT module query still uses buildGapModulePendingItems',
  univSvc && /module:\s*'INCENTIVE_PAYOUT'[\s\S]{0,1500}buildGapModulePendingItems/.test(univSvc),
  "INCENTIVE_PAYOUT MODULE_QUERIES entry should still surface items via buildGapModulePendingItems (unchanged contract)."
);
check(
  'INCENTIVE_PAYOUT actionType stays "incentive_payout" (matches Hub handler key)',
  univSvc && /module:\s*'INCENTIVE_PAYOUT'[\s\S]{0,2000}actionType:\s*'incentive_payout'/.test(univSvc),
  "actionType must remain 'incentive_payout' so the Hub handler key stays in sync."
);
check(
  'approve_incentive_payout sub-key wired in MODULE_TO_SUB_KEY',
  univSvc && /INCENTIVE_PAYOUT[\s\S]{0,300}sub_key:\s*'approve_incentive_payout'/.test(univSvc),
  "INCENTIVE_PAYOUT MODULE_QUERIES entry must expose sub_key='approve_incentive_payout' so the sub-perm gate is wired."
);

// ── TYPE_TO_MODULE wiring ──
check(
  "TYPE_TO_MODULE.incentive_payout maps to 'INCENTIVE_PAYOUT'",
  univCtrl && /incentive_payout:\s*'INCENTIVE_PAYOUT'/.test(univCtrl),
  "TYPE_TO_MODULE.incentive_payout must map to 'INCENTIVE_PAYOUT' so the approve_incentive_payout sub-perm gate fires."
);

// ── Sibling healthchecks still present (no regression) ──
check(
  'Phase G6.7-PC1 petty_cash healthcheck still present (sibling sanity)',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckPettyCashHubApprove.js')),
  "G6.7-PC1 healthcheck file should remain — same bug class, parallel fix."
);
check(
  'Phase G6.7-PC2 journal healthcheck still present (sibling sanity)',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckJournalHubApprove.js')),
  "G6.7-PC2 healthcheck file should remain — same bug class, parallel fix."
);

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
