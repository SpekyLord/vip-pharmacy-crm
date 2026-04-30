/**
 * Healthcheck: Petty Cash — Approval Hub Approve/Post wiring (Apr 30 2026)
 *
 * Statically verifies that the Approval Hub's `petty_cash` handler can post
 * a PENDING PettyCashTransaction (closes the Group B "approve throws"
 * regression where universalApprove returned 500 because buildGroupBReject
 * rejected any action ≠ 'reject').
 *
 * Mirrors the healthcheck posture of sibling phases (G4.5dd / Income Proxy /
 * BIR VAT) — catches the same "controller wired but Hub handler unaware →
 * runtime 500" wiring drift.
 *
 * Usage:
 *   node backend/scripts/healthcheckPettyCashHubApprove.js
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

// ── pettyCashController.js: shared post helper exists + is exported ──
const pcCtrl = readFile('backend/erp/controllers/pettyCashController.js');
check(
  'pettyCashController.js exists',
  !!pcCtrl,
  'Expected backend/erp/controllers/pettyCashController.js to be present.'
);
check(
  'postSinglePettyCashTransaction helper defined',
  pcCtrl && /async\s+function\s+postSinglePettyCashTransaction\s*\(\s*txnId\s*,\s*userId\s*\)/.test(pcCtrl),
  "Add: async function postSinglePettyCashTransaction(txnId, userId) { ... }"
);
check(
  'postSinglePettyCashTransaction exported on module.exports',
  pcCtrl && /module\.exports\s*=\s*\{[\s\S]*postSinglePettyCashTransaction[\s\S]*\}/.test(pcCtrl),
  "Add postSinglePettyCashTransaction to the module.exports object."
);
check(
  'helper enforces period lock via checkPeriodOpen against txn.entity_id',
  pcCtrl && /postSinglePettyCashTransaction[\s\S]{0,3000}checkPeriodOpen\(\s*precheck\.entity_id/.test(pcCtrl),
  "Helper must call checkPeriodOpen(precheck.entity_id, period) — Hub approvers may be cross-entity privileged users."
);
check(
  'helper opens a Mongo session + uses session.withTransaction',
  pcCtrl && /postSinglePettyCashTransaction[\s\S]{0,3000}mongoose\.startSession\(\)/.test(pcCtrl)
        && /postSinglePettyCashTransaction[\s\S]{0,3000}session\.withTransaction/.test(pcCtrl),
  "Helper must wrap balance change + status flip in session.withTransaction for atomicity."
);
check(
  'helper guards against insufficient balance on DISBURSEMENT',
  pcCtrl && /postSinglePettyCashTransaction[\s\S]{0,3000}txn_type\s*===\s*'DISBURSEMENT'[\s\S]{0,300}Insufficient balance/.test(pcCtrl),
  "Helper must throw 400 on DISBURSEMENT when amount > fund.current_balance."
);
check(
  'helper is idempotent on POSTED (early return with already_posted: true)',
  pcCtrl && /postSinglePettyCashTransaction[\s\S]{0,3000}status\s*===\s*'POSTED'[\s\S]{0,200}already_posted:\s*true/.test(pcCtrl),
  "Helper must short-circuit when txn is already POSTED — re-approve from the Hub must not double-post."
);
check(
  'helper sets posted_by, posted_at, approved_by, running_balance',
  pcCtrl && /postSinglePettyCashTransaction[\s\S]{0,3000}posted_by\s*=\s*userId/.test(pcCtrl)
        && /postSinglePettyCashTransaction[\s\S]{0,3000}posted_at\s*=\s*new Date\(\)/.test(pcCtrl)
        && /postSinglePettyCashTransaction[\s\S]{0,3000}approved_by/.test(pcCtrl)
        && /postSinglePettyCashTransaction[\s\S]{0,3000}running_balance\s*=\s*fund\.current_balance/.test(pcCtrl),
  "Helper must stamp posted_by/posted_at/approved_by + freeze running_balance on the txn."
);
check(
  'helper fires ceiling-breach notification (best-effort, non-throwing)',
  pcCtrl && /postSinglePettyCashTransaction[\s\S]{0,5000}balance_ceiling[\s\S]{0,1500}notify\(/.test(pcCtrl),
  "Helper must run the ceiling-breach notify() block post-commit (custodian + president)."
);

// ── pettyCashController.js: postTransaction refactored to call the helper ──
check(
  'postTransaction calls gateApproval before the helper',
  pcCtrl && /const\s+postTransaction\s*=\s*catchAsync[\s\S]{0,2000}gateApproval\([\s\S]{0,1500}postSinglePettyCashTransaction\(/.test(pcCtrl),
  "postTransaction must call gateApproval (Authority Matrix) BEFORE delegating to postSinglePettyCashTransaction."
);
check(
  'postTransaction handles statusCode-tagged errors',
  pcCtrl && /const\s+postTransaction\s*=\s*catchAsync[\s\S]{0,3000}err\.statusCode[\s\S]{0,300}res\.status\(err\.statusCode\)/.test(pcCtrl),
  "postTransaction must surface helper's statusCode-tagged errors back to the client."
);

// ── universalApprovalController.js: Hub handler wires approve + post + reject ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.petty_cash is no longer a bare buildGroupBReject delegate',
  univCtrl && !/petty_cash:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "petty_cash handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'petty_cash handler still routes reject through buildGroupBReject',
  univCtrl && /petty_cash:\s*async[\s\S]{0,1500}action\s*===\s*'reject'[\s\S]{0,800}buildGroupBReject\(/.test(univCtrl),
  "petty_cash handler must keep the reject path delegating to buildGroupBReject (terminal-state guard + REJECTED stamp)."
);
check(
  'petty_cash handler routes approve OR post through postSinglePettyCashTransaction',
  univCtrl && /petty_cash:\s*async[\s\S]{0,3000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,2000}postSinglePettyCashTransaction\(/.test(univCtrl),
  "petty_cash handler must dereference ApprovalRequest.doc_id and call postSinglePettyCashTransaction(txnId, userId) on approve/post."
);
check(
  'petty_cash handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /petty_cash:\s*async[\s\S]{0,3000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "petty_cash handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the txn _id)."
);
check(
  'petty_cash handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /petty_cash:\s*async[\s\S]{0,4000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "petty_cash handler must explicitly close the ApprovalRequest (the shared auto-resolve at L1130-1160 keys on doc_id, which never matches Group B items)."
);
check(
  'petty_cash handler logs decision history on APPROVED',
  univCtrl && /petty_cash:\s*async[\s\S]{0,5000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "petty_cash handler must $push a history row when closing the request — keeps the Approval History tab honest."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'PETTY_CASH module query still uses buildGapModulePendingItems',
  univSvc && /module:\s*'PETTY_CASH'[\s\S]{0,800}buildGapModulePendingItems/.test(univSvc),
  "PETTY_CASH MODULE_QUERIES entry should still surface items via buildGapModulePendingItems (unchanged contract)."
);
check(
  'PETTY_CASH approve_data.type stays "petty_cash" (matches Hub handler key)',
  univSvc && /module:\s*'PETTY_CASH'[\s\S]{0,1500}actionType:\s*'petty_cash'/.test(univSvc),
  "actionType must remain 'petty_cash' so the Hub handler key stays in sync."
);
check(
  "approve_petty_cash sub-key wired in MODULE_TO_SUB_KEY",
  univCtrl && /MODULE_TO_SUB_KEY|MODULE_TO_SUB_KEY/.test(univCtrl), // sanity
  "Approver gate uses approvals.approve_petty_cash sub-permission via universalApprovalService MODULE_TO_SUB_KEY."
);

// ── Routes: BDM-direct path still mounted ──
const pcRoutes = readFile('backend/erp/routes/pettyCashRoutes.js');
check(
  '/transactions/:id/post route still mounts postTransaction',
  pcRoutes && /router\.post\(\s*['"]\/transactions\/:id\/post['"][\s\S]{0,200}postTransaction\b/.test(pcRoutes),
  "BDM-direct post route must remain mounted at POST /transactions/:id/post → c.postTransaction."
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
