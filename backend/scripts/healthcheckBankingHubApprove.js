/**
 * Healthcheck: Banking (Bank Recon Finalize) — Approval Hub Approve/Post
 * wiring (Phase G6.7-PC7, May 01 2026)
 *
 * Statically verifies the Approval Hub's `banking` handler can finalize a
 * BankStatement reconciliation through the Hub (closes the Group B
 * "approve throws → 500" regression for bank reconciliation).
 *
 * CAUTION: BankStatement.status === 'FINALIZED' is IMMUTABLE — finalize cannot
 * be undone without manual DB intervention. Idempotency is enforced via a
 * status peek BEFORE calling finalizeRecon (the helper itself throws on
 * FINALIZED, but we catch via a status peek for clean idempotent semantics).
 *
 * Mirrors the posture of PC1-PC6 healthchecks. Same bug class, same fix
 * pattern with extra idempotency caution.
 *
 * Usage:
 *   node backend/scripts/healthcheckBankingHubApprove.js
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

// ── universalApprovalController.js: banking handler branches on action ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.banking is no longer a bare buildGroupBReject delegate',
  univCtrl && !/banking:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "banking handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'banking handler still routes reject through buildGroupBReject',
  univCtrl && /banking:\s*async[\s\S]{0,2500}action\s*===\s*'reject'[\s\S]{0,1000}buildGroupBReject\(/.test(univCtrl),
  "banking handler must keep the reject path delegating to buildGroupBReject (terminal-state guard against FINALIZED)."
);
check(
  'banking handler routes approve OR post through finalizeRecon',
  univCtrl && /banking:\s*async[\s\S]{0,5000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,2500}finalizeRecon\(/.test(univCtrl),
  "banking handler must dereference ApprovalRequest.doc_id and call finalizeRecon(stmtId, userId) on approve/post."
);
check(
  'banking handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /banking:\s*async[\s\S]{0,5000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "banking handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the BankStatement _id)."
);
check(
  'banking handler peeks status BEFORE calling finalizeRecon (idempotency)',
  univCtrl && /banking:\s*async[\s\S]{0,5500}stmtPre\.status\s*===\s*'FINALIZED'/.test(univCtrl),
  "banking handler must peek BankStatement.status === 'FINALIZED' BEFORE calling finalizeRecon — re-clicking Approve from the Hub must not throw 'Already finalized'."
);
check(
  'banking handler returns already_finalized:true on idempotent re-fire',
  univCtrl && /banking:\s*async[\s\S]{0,6500}already_finalized:\s*true/.test(univCtrl),
  "banking handler must surface idempotent re-fire as already_finalized:true so the caller can distinguish first-fire from re-fire."
);
check(
  'banking handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /banking:\s*async[\s\S]{0,8000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "banking handler must explicitly close the ApprovalRequest with status=APPROVED + decided_by + decided_at + decision_reason."
);
check(
  'banking handler logs decision history on APPROVED',
  univCtrl && /banking:\s*async[\s\S]{0,9000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "banking handler must $push a history row when closing the request."
);
check(
  'banking handler throws on unsupported action',
  univCtrl && /banking:\s*async[\s\S]{0,10000}Unsupported action for banking:/.test(univCtrl),
  "banking handler must throw a clear error on actions other than approve/post/reject."
);

// ── bankReconService.js: finalizeRecon helper exists ──
const bankSvc = readFile('backend/erp/services/bankReconService.js');
check(
  'bankReconService.js exists',
  !!bankSvc,
  'Expected backend/erp/services/bankReconService.js to be present.'
);
check(
  'finalizeRecon helper exists',
  bankSvc && /async\s+function\s+finalizeRecon\s*\(\s*statementId\s*,\s*userId/.test(bankSvc),
  "Expected: async function finalizeRecon(statementId, userId) in services/bankReconService.js"
);
check(
  'finalizeRecon throws on already-FINALIZED state',
  bankSvc && /finalizeRecon[\s\S]{0,1500}Already finalized/.test(bankSvc)
          || (bankSvc && /finalizeRecon[\s\S]{0,1500}status\s*===\s*'FINALIZED'/.test(bankSvc)),
  "finalizeRecon must guard against re-finalizing a terminal statement (the Hub handler peeks BEFORE calling, but the service-layer guard is defense-in-depth)."
);
check(
  'finalizeRecon updates BankAccount.current_balance',
  bankSvc && /finalizeRecon[\s\S]{0,4000}current_balance/.test(bankSvc),
  "finalizeRecon must update BankAccount.current_balance to match closing_balance."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'BANKING module query still uses buildGapModulePendingItems',
  univSvc && /module:\s*'BANKING'[\s\S]{0,1500}buildGapModulePendingItems/.test(univSvc),
  "BANKING MODULE_QUERIES entry should still surface items via buildGapModulePendingItems (unchanged contract)."
);
check(
  'BANKING actionType stays "banking" (matches Hub handler key)',
  univSvc && /module:\s*'BANKING'[\s\S]{0,2000}actionType:\s*'banking'/.test(univSvc),
  "actionType must remain 'banking' so the Hub handler key stays in sync."
);
check(
  'approve_banking sub-key wired in MODULE_TO_SUB_KEY',
  univSvc && /BANKING[\s\S]{0,300}sub_key:\s*'approve_banking'/.test(univSvc),
  "BANKING MODULE_QUERIES entry must expose sub_key='approve_banking' so the sub-perm gate is wired."
);

// ── TYPE_TO_MODULE wiring ──
check(
  "TYPE_TO_MODULE.banking maps to 'BANKING'",
  univCtrl && /banking:\s*'BANKING'/.test(univCtrl),
  "TYPE_TO_MODULE.banking must map to 'BANKING' so the approve_banking sub-perm gate fires."
);

// ── Sibling healthchecks still present (no regression) ──
const siblings = [
  ['backend/scripts/healthcheckPettyCashHubApprove.js', 'G6.7-PC1 petty_cash'],
  ['backend/scripts/healthcheckJournalHubApprove.js', 'G6.7-PC2 journal'],
  ['backend/scripts/healthcheckIncentivePayoutHubApprove.js', 'G6.7-PC3 incentive_payout'],
  ['backend/scripts/healthcheckPurchasingHubApprove.js', 'G6.7-PC4 purchasing'],
  ['backend/scripts/healthcheckSalesGoalPlanHubApprove.js', 'G6.7-PC5 sales_goal_plan'],
  ['backend/scripts/healthcheckIcTransferHubApprove.js', 'G6.7-PC6 ic_transfer'],
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
