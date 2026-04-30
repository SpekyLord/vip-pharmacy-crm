/**
 * Healthcheck: Journal — Approval Hub Approve/Post wiring (Phase G6.7-PC2, Apr 30 2026)
 *
 * Statically verifies the Approval Hub's `journal` handler can post a PENDING
 * JournalEntry (closes the Group B "approve throws → 500" regression).
 *
 * Mirrors the posture of healthcheckPettyCashHubApprove.js (G6.7-PC1) — same
 * bug class, same fix pattern. Catches "Hub handler unaware → runtime 500"
 * wiring drift.
 *
 * Usage:
 *   node backend/scripts/healthcheckJournalHubApprove.js
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

// ── universalApprovalController.js: journal handler branches on action ──
const univCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'universalApprovalController.js exists',
  !!univCtrl,
  'Expected backend/erp/controllers/universalApprovalController.js to be present.'
);
check(
  'approvalHandlers.journal is no longer a bare buildGroupBReject delegate',
  univCtrl && !/journal:\s*async\s*\([^)]*\)\s*=>\s*buildGroupBReject\(/.test(univCtrl),
  "journal handler must branch on action — not unconditionally call buildGroupBReject (which throws on approve/post)."
);
check(
  'journal handler still routes reject through buildGroupBReject',
  univCtrl && /journal:\s*async[\s\S]{0,2000}action\s*===\s*'reject'[\s\S]{0,800}buildGroupBReject\(/.test(univCtrl),
  "journal handler must keep the reject path delegating to buildGroupBReject (terminal-state guard + REJECTED stamp)."
);
check(
  'journal handler routes approve OR post through journalEngine.postJournal',
  univCtrl && /journal:\s*async[\s\S]{0,4000}action\s*===\s*'approve'\s*\|\|\s*action\s*===\s*'post'[\s\S]{0,3000}postJournal\(/.test(univCtrl),
  "journal handler must dereference ApprovalRequest.doc_id and call postJournal(jeId, userId, jePre.entity_id) on approve/post."
);
check(
  'journal handler dereferences ApprovalRequest by id (Group B id-semantics)',
  univCtrl && /journal:\s*async[\s\S]{0,4000}ApprovalRequest\.findById\(id\)\.lean\(\)/.test(univCtrl),
  "journal handler must look up ApprovalRequest by id and read doc_id (id is the request _id, not the JE _id)."
);
check(
  'journal handler is idempotent on POSTED (skips post when already POSTED)',
  univCtrl && /journal:\s*async[\s\S]{0,4000}jePre\.status\s*!==\s*'POSTED'/.test(univCtrl),
  "journal handler must short-circuit when JE is already POSTED — re-approve from the Hub must not double-post."
);
check(
  'journal handler period-locks against the JE\'s own entity_id',
  univCtrl && /journal:\s*async[\s\S]{0,4000}checkPeriodOpen\(\s*jePre\.entity_id/.test(univCtrl),
  "journal handler must call checkPeriodOpen(jePre.entity_id, jePre.period) — Hub approvers may be cross-entity privileged users."
);
check(
  'journal handler closes the originating ApprovalRequest to APPROVED',
  univCtrl && /journal:\s*async[\s\S]{0,5000}ApprovalRequest\.updateOne\(\s*\{\s*_id:\s*id,\s*status:\s*'PENDING'\s*\}[\s\S]{0,800}'APPROVED'/.test(univCtrl),
  "journal handler must explicitly close the ApprovalRequest (the shared auto-resolve at L1130-1160 keys on doc_id, which never matches Group B items)."
);
check(
  'journal handler logs decision history on APPROVED',
  univCtrl && /journal:\s*async[\s\S]{0,6000}\$push:\s*\{\s*history:\s*\{\s*status:\s*'APPROVED'/.test(univCtrl),
  "journal handler must $push a history row when closing the request — keeps the Approval History tab honest."
);
check(
  'journal handler throws on unsupported action',
  univCtrl && /journal:\s*async[\s\S]{0,7000}Unsupported action for journal:/.test(univCtrl),
  "journal handler must throw a clear error on actions other than approve/post/reject."
);

// ── journalEngine.js: postJournal helper exists with the expected signature ──
const jeEngine = readFile('backend/erp/services/journalEngine.js');
check(
  'journalEngine.js postJournal helper exists',
  jeEngine && /async\s+function\s+postJournal\s*\(\s*jeId\s*,\s*userId\s*,\s*entityId/.test(jeEngine),
  "Expected: async function postJournal(jeId, userId, entityId, options = {}) in services/journalEngine.js"
);
check(
  'postJournal stamps posted_by + posted_at + status=POSTED',
  jeEngine && /postJournal[\s\S]{0,800}status\s*=\s*'POSTED'/.test(jeEngine)
           && /postJournal[\s\S]{0,800}posted_by\s*=\s*userId/.test(jeEngine)
           && /postJournal[\s\S]{0,800}posted_at\s*=\s*new Date\(\)/.test(jeEngine),
  "postJournal must stamp status=POSTED + posted_by + posted_at and trigger pre-save DR=CR validation."
);
check(
  'postJournal throws on non-DRAFT status (idempotency guard for non-Hub callers)',
  jeEngine && /postJournal[\s\S]{0,800}Cannot post JE in status:/.test(jeEngine),
  "postJournal must guard against non-DRAFT status; the Hub handler short-circuits POSTED before calling, so this guard catches genuinely invalid transitions."
);

// ── BDM-direct route (postJournalEndpoint) still wired ──
const acctCtrl = readFile('backend/erp/controllers/accountingController.js');
check(
  'BDM-direct postJournalEndpoint still calls gateApproval first',
  acctCtrl && /postJournalEndpoint\s*=\s*catchAsync[\s\S]{0,1500}gateApproval\(/.test(acctCtrl)
           && /postJournalEndpoint\s*=\s*catchAsync[\s\S]{0,2000}postJournal\(/.test(acctCtrl),
  "postJournalEndpoint must keep its gateApproval → postJournal flow (the BDM-direct path isn't being changed by G6.7-PC2)."
);

// ── universalApprovalService.js: hub item shape unchanged ──
const univSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'JOURNAL module query still uses buildGapModulePendingItems',
  univSvc && /module:\s*'JOURNAL'[\s\S]{0,1500}buildGapModulePendingItems/.test(univSvc),
  "JOURNAL MODULE_QUERIES entry should still surface items via buildGapModulePendingItems (unchanged contract)."
);
check(
  'JOURNAL approve_data.type stays "journal" (matches Hub handler key)',
  univSvc && /module:\s*'JOURNAL'[\s\S]{0,2000}actionType:\s*'journal'/.test(univSvc),
  "actionType must remain 'journal' so the Hub handler key stays in sync."
);

// ── TYPE_TO_MODULE wiring ──
check(
  "TYPE_TO_MODULE.journal still maps to 'JOURNAL'",
  univCtrl && /journal:\s*'JOURNAL'/.test(univCtrl),
  "TYPE_TO_MODULE.journal must map to 'JOURNAL' so the approve_journal sub-perm gate fires."
);
check(
  "approve_journal sub-key wired in MODULE_TO_SUB_KEY",
  univSvc && /JOURNAL[\s\S]{0,300}sub_key:\s*'approve_journal'/.test(univSvc),
  "JOURNAL MODULE_QUERIES entry must expose sub_key='approve_journal' so the sub-perm gate is wired."
);

// ── Phase G6.7-PC1 healthcheck still present (no regression) ──
check(
  'Phase G6.7-PC1 petty_cash healthcheck still present (sibling sanity)',
  fs.existsSync(path.join(ROOT, 'backend/scripts/healthcheckPettyCashHubApprove.js')),
  "G6.7-PC1 healthcheck file should remain — same bug class, parallel fix."
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
