/**
 * Phase G4.5h Part A (Apr 30, 2026) — Static healthcheck for the idempotent
 * postSingleUndertaking wiring contract. Closes the UT-002 orphan class of
 * bug from G4.5g (linked GRN already APPROVED, UT stuck SUBMITTED forever
 * because approveGrnCore throws `expected PENDING`).
 *
 * Runs without a DB connection — purely greps the source so the contract
 * cannot regress when this controller is touched in future phases (B, C,
 * or unrelated proxy widening).
 *
 * Run: node backend/erp/scripts/healthcheckPostSingleUndertakingIdempotency.js
 * Exit code: 0 = green, 1 = at least one check failed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const checks = [];
function check(name, predicate, hint) {
  let ok = false;
  let err = null;
  try { ok = !!predicate(); } catch (e) { err = e; }
  checks.push({ name, ok, hint: ok ? null : hint, error: err?.message || null });
}
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// Slice the postSingleUndertaking body once so individual checks can scan it.
// Brace-counter walker — a lazy regex picks the first nested `}` instead of
// the function's own closing brace, so we have to scan manually.
function postBody() {
  const src = read('backend/erp/controllers/undertakingController.js');
  const start = src.indexOf('async function postSingleUndertaking');
  if (start < 0) throw new Error('postSingleUndertaking declaration not found');
  const openIdx = src.indexOf('{', start);
  if (openIdx < 0) throw new Error('postSingleUndertaking opening brace not found');
  let depth = 0;
  let i = openIdx;
  let inSingle = false, inDouble = false, inBacktick = false, inBlock = false, inLine = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    const prev = src[i - 1];
    if (inLine) { if (ch === '\n') inLine = false; continue; }
    if (inBlock) { if (ch === '*' && next === '/') { inBlock = false; i++; } continue; }
    if (inSingle) { if (ch === '\\') { i++; continue; } if (ch === "'") inSingle = false; continue; }
    if (inDouble) { if (ch === '\\') { i++; continue; } if (ch === '"') inDouble = false; continue; }
    if (inBacktick) { if (ch === '\\') { i++; continue; } if (ch === '`') inBacktick = false; continue; }
    if (ch === '/' && next === '/') { inLine = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlock = true; i++; continue; }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inBacktick = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return src.slice(start, i);
}

// 1. Outer SUBMITTED check removed — atomic findOneAndUpdate is the gate now.
check(
  'postSingleUndertaking does NOT have the brittle outer SUBMITTED status check',
  () => {
    const body = postBody();
    return !/if\s*\(\s*doc\.status\s*!==\s*['"]SUBMITTED['"]\s*\)\s*\{[\s\S]{0,80}throw\s+new\s+Error\(\s*['`]postSingleUndertaking:\s*expected\s+SUBMITTED/.test(body);
  },
  'Drop the synchronous `if (doc.status !== "SUBMITTED") throw ...` at the top of postSingleUndertaking — the atomic findOneAndUpdate replaces it'
);

// 2. Atomic SUBMITTED → ACKNOWLEDGED claim via findOneAndUpdate inside txn.
check(
  'Atomic SUBMITTED → ACKNOWLEDGED transition via findOneAndUpdate',
  () => {
    const body = postBody();
    return /Undertaking\.findOneAndUpdate\(\s*\{\s*_id:\s*doc\._id,\s*status:\s*['"]SUBMITTED['"]\s*\}/.test(body)
      && /\$set:\s*\{[\s\S]{0,200}status:\s*['"]ACKNOWLEDGED['"]/.test(body)
      && /acknowledged_by:\s*userId/.test(body)
      && /acknowledged_at:\s*new Date\(\)/.test(body);
  },
  'Replace the manual `doc.status = "ACKNOWLEDGED" + doc.save({session})` pair with Undertaking.findOneAndUpdate({_id, status: "SUBMITTED"}, {$set: {...}}, {session, new: true})'
);

// 3. Concurrent-ack handler — null result re-fetches and sets alreadyAcknowledged.
check(
  'Concurrent-ack handler returns alreadyAcknowledged: true instead of throwing',
  () => {
    const body = postBody();
    return /if\s*\(\s*!claimed\s*\)/.test(body)
      && /alreadyAcknowledged\s*=\s*true/.test(body)
      && /current\.status\s*===\s*['"]ACKNOWLEDGED['"]/.test(body);
  },
  'When findOneAndUpdate returns null, re-fetch the doc; if status is ACKNOWLEDGED, set alreadyAcknowledged=true and return the current doc to the caller'
);

// 4. Non-ACKNOWLEDGED, non-SUBMITTED state on entry throws with current status.
check(
  'Concurrent-ack handler throws with the actual current status (not stale doc.status)',
  () => {
    const body = postBody();
    return /Undertaking is \$\{current\.status\}/.test(body)
      || /current\.status[\s\S]{0,80}expected SUBMITTED/.test(body);
  },
  'When the claim is null AND current.status is not ACKNOWLEDGED, throw `Undertaking is ${current.status}, expected SUBMITTED` — never silently swallow REJECTED / DELETION_REQUESTED state'
);

// 5. GRN status peek before approveGrnCore (cascade idempotency).
check(
  'GRN status peek before approveGrnCore (cascade idempotency)',
  () => {
    const body = postBody();
    return /GrnEntry\.findById\(doc\.linked_grn_id\)/.test(body)
      && /\.select\(['"]status event_id['"]\)/.test(body)
      && /grnPeek\.status\s*===\s*['"]APPROVED['"]/.test(body);
  },
  'Before calling approveGrnCore, peek the linked GRN with .select("status event_id"). If status is APPROVED, skip the cascade (ledger already written)'
);

// 6. Cascade-skipped path sets cascadeSkipped: true.
check(
  'Cascade-skipped path sets cascadeSkipped flag and does NOT call approveGrnCore',
  () => {
    const body = postBody();
    // The if-APPROVED branch must set cascadeSkipped = true. The else branch
    // calls approveGrnCore. Verify both arms exist.
    return /cascadeSkipped\s*=\s*true/.test(body)
      && /else\s*\{\s*\n?\s*updatedGrn\s*=\s*await\s+approveGrnCore/.test(body);
  },
  'Inside the if (grnPeek.status === "APPROVED") branch, set cascadeSkipped = true and load updatedGrn from the existing GRN. The else branch calls approveGrnCore as before'
);

// 7. Audit OUTSIDE the txn (matches A.5.5 doctorMergeService.js pattern).
check(
  'Audit log write happens AFTER session.withTransaction (not inside)',
  () => {
    const body = postBody();
    // Walk braces from `await session.withTransaction(` to find the matching
    // `});` — anything after that point is OUTSIDE the txn.
    const txnStart = body.indexOf('await session.withTransaction');
    if (txnStart < 0) return false;
    const openParen = body.indexOf('(', txnStart);
    if (openParen < 0) return false;
    let depth = 0;
    let i = openParen;
    let inS = false, inD = false, inB = false, inL = false, inBl = false;
    for (; i < body.length; i++) {
      const ch = body[i];
      const nx = body[i + 1];
      if (inL) { if (ch === '\n') inL = false; continue; }
      if (inBl) { if (ch === '*' && nx === '/') { inBl = false; i++; } continue; }
      if (inS) { if (ch === '\\') { i++; continue; } if (ch === "'") inS = false; continue; }
      if (inD) { if (ch === '\\') { i++; continue; } if (ch === '"') inD = false; continue; }
      if (inB) { if (ch === '\\') { i++; continue; } if (ch === '`') inB = false; continue; }
      if (ch === '/' && nx === '/') { inL = true; i++; continue; }
      if (ch === '/' && nx === '*') { inBl = true; i++; continue; }
      if (ch === "'") { inS = true; continue; }
      if (ch === '"') { inD = true; continue; }
      if (ch === '`') { inB = true; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const txnAfter = body.slice(i);
    // After the txn, there must be a `if (!alreadyAcknowledged)` guard followed
    // by an ErpAuditLog.logChange call. Order matters: audit must come after txn.
    return /if\s*\(\s*!alreadyAcknowledged\s*\)/.test(txnAfter)
      && /ErpAuditLog\.logChange/.test(txnAfter);
  },
  'Move ErpAuditLog.logChange OUTSIDE session.withTransaction — audit failure must not roll back a committed cascade. Skip the audit when alreadyAcknowledged is true (the original ack already wrote a row)'
);

// 8. Audit note distinguishes the cascade-skipped recovery path.
check(
  'Audit note explicitly mentions "cascade skipped" + "idempotent path" on the recovery branch',
  () => {
    const body = postBody();
    return /cascadeSkipped\s*\?[\s\S]{0,200}cascade skipped/.test(body)
      && /idempotent path/.test(body);
  },
  'When cascadeSkipped is true, the audit note must say "linked GRN ... was already APPROVED (cascade skipped, idempotent path...)" so reviewers can tell why no new ledger rows landed'
);

// 9. Return shape includes alreadyAcknowledged + cascadeSkipped.
check(
  'postSingleUndertaking return shape includes alreadyAcknowledged + cascadeSkipped flags',
  () => {
    const body = postBody();
    return /return\s*\{\s*undertaking:\s*doc,\s*grn:\s*updatedGrn,\s*alreadyAcknowledged,\s*cascadeSkipped\s*\}/.test(body);
  },
  'Return { undertaking: doc, grn: updatedGrn, alreadyAcknowledged, cascadeSkipped } so callers can format messages and the Approval Hub dispatcher can stay unchanged'
);

// 10. acknowledgeUndertaking response message branches on the new flags.
check(
  'acknowledgeUndertaking response message reflects alreadyAcknowledged / cascadeSkipped',
  () => {
    const src = read('backend/erp/controllers/undertakingController.js');
    // Slice acknowledgeUndertaking body via brace counter (lazy regex picks
    // the wrong `})`). Same pattern as postBody() above.
    const start = src.indexOf('const acknowledgeUndertaking');
    if (start < 0) return false;
    const openParen = src.indexOf('(', start);
    if (openParen < 0) return false;
    let depth = 0;
    let i = openParen;
    let inS = false, inD = false, inB = false, inL = false, inBl = false;
    for (; i < src.length; i++) {
      const ch = src[i];
      const nx = src[i + 1];
      if (inL) { if (ch === '\n') inL = false; continue; }
      if (inBl) { if (ch === '*' && nx === '/') { inBl = false; i++; } continue; }
      if (inS) { if (ch === '\\') { i++; continue; } if (ch === "'") inS = false; continue; }
      if (inD) { if (ch === '\\') { i++; continue; } if (ch === '"') inD = false; continue; }
      if (inB) { if (ch === '\\') { i++; continue; } if (ch === '`') inB = false; continue; }
      if (ch === '/' && nx === '/') { inL = true; i++; continue; }
      if (ch === '/' && nx === '*') { inBl = true; i++; continue; }
      if (ch === "'") { inS = true; continue; }
      if (ch === '"') { inD = true; continue; }
      if (ch === '`') { inB = true; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const block = src.slice(start, i);
    return /alreadyAcknowledged/.test(block)
      && /cascadeSkipped/.test(block)
      && /already acknowledged|was already APPROVED|no change|no new stock posted/i.test(block);
  },
  'Edit acknowledgeUndertaking to destructure alreadyAcknowledged + cascadeSkipped from postSingleUndertaking and choose a message that reflects which idempotent path ran'
);

// 11. universalApprovalController.approvalHandlers.undertaking still works
//     unchanged — it consumes only `undertaking` from the destructured return.
check(
  'universalApprovalController approvalHandlers.undertaking destructures only `undertaking`',
  () => {
    const src = read('backend/erp/controllers/universalApprovalController.js');
    return /const\s*\{\s*undertaking\s*\}\s*=\s*await\s+postSingleUndertaking/.test(src);
  },
  'The Approval Hub dispatcher still expects `{ undertaking }` from postSingleUndertaking. The new return shape is a superset; do not change this consumer'
);

// 12. approveGrnCore status-PENDING gate still raises (unchanged) — guards
//     against accidental removal of the throw that the cascade-skip branch
//     was designed to dodge.
check(
  'approveGrnCore still throws when GRN.status !== "PENDING"',
  () => {
    const src = read('backend/erp/controllers/inventoryController.js');
    return /if\s*\(\s*grn\.status\s*!==\s*['"]PENDING['"]\s*\)\s*\{\s*\n[\s\S]{0,200}throw\s+Object\.assign\(\s*new\s+Error\(\s*`GRN is \$\{grn\.status\}, expected PENDING/.test(src);
  },
  'Do NOT relax approveGrnCore — postSingleUndertaking dodges the throw by peeking first. Removing this gate would let a future caller double-write the ledger'
);

// 13. Both call-sites still gate-check status BEFORE calling postSingleUndertaking.
//     The atomic claim is defense-in-depth, not a substitute for the outer
//     gate (the outer gate gives a clean 400 to the user, the atomic gate
//     handles the race window).
check(
  'acknowledgeUndertaking still has the outer SUBMITTED gate (clean 400 for the user)',
  () => {
    const src = read('backend/erp/controllers/undertakingController.js');
    const block = src.match(/const acknowledgeUndertaking\s*=\s*catchAsync[\s\S]*?postSingleUndertaking/);
    if (!block) return false;
    return /doc\.status\s*!==\s*['"]SUBMITTED['"]/.test(block[0]);
  },
  'Keep the outer `if (doc.status !== "SUBMITTED")` check in acknowledgeUndertaking — it gives the user a clean 400 instead of a generic transaction error'
);

check(
  'approvalHandlers.undertaking still has the outer SUBMITTED gate (clean throw for the Hub)',
  () => {
    const src = read('backend/erp/controllers/universalApprovalController.js');
    const block = src.match(/undertaking:\s*async[\s\S]*?postSingleUndertaking/);
    if (!block) return false;
    return /doc\.status\s*!==\s*['"]SUBMITTED['"]/.test(block[0]);
  },
  'Keep the outer SUBMITTED check in universalApprovalController.approvalHandlers.undertaking — the Hub dispatcher needs a clean throw with the actual current status'
);

// ── Report ──────────────────────────────────────────────────────────────────
let failed = 0;
console.log('\n— Phase G4.5h Part A — postSingleUndertaking idempotency wiring healthcheck —\n');
for (const c of checks) {
  const tag = c.ok ? 'OK ' : 'FAIL';
  console.log(`[${tag}] ${c.name}`);
  if (!c.ok) {
    failed++;
    if (c.error) console.log(`       error: ${c.error}`);
    if (c.hint) console.log(`       hint:  ${c.hint}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.\n`);
process.exit(failed === 0 ? 0 : 1);
