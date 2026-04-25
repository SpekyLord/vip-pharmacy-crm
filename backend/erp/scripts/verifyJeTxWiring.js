/**
 * verifyJeTxWiring — static verifier for Phase JE-TX wiring.
 *
 * Asserts that auto-journal posting in transactional flows is wrapped in
 * MongoDB transactions and threads `{ session }` to every JE call. Catches
 * regressions where a refactor accidentally drops session plumbing.
 *
 * Read-only: parses source files, no DB connection. Safe to run anywhere.
 *
 * Exit code 1 on any failure. Use in CI / pre-commit.
 *
 * Usage: node backend/erp/scripts/verifyJeTxWiring.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let pass = 0;
let fail = 0;
const failures = [];

function ok(label) { pass++; console.log(`  PASS  ${label}`); }
function bad(label, detail) {
  fail++;
  failures.push({ label, detail });
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
}

function readSrc(rel) {
  const abs = path.join(ROOT, rel);
  return { abs, src: fs.readFileSync(abs, 'utf8') };
}

// Find the byte ranges of every `withTransaction(async ...)` callback body.
// Returns array of [startIdx, endIdx) into src.
function findTransactionRanges(src) {
  const ranges = [];
  const sig = 'session.withTransaction(';
  let i = 0;
  while (true) {
    const start = src.indexOf(sig, i);
    if (start === -1) break;
    // Find the opening '{' of the callback body, accounting for `async () => {` or `async function () {`
    let cursor = start + sig.length;
    let arrowOrFn = src.indexOf('{', cursor);
    if (arrowOrFn === -1) break;
    // Walk balanced braces from arrowOrFn
    let depth = 0;
    let end = arrowOrFn;
    for (let p = arrowOrFn; p < src.length; p++) {
      const c = src[p];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) { end = p; break; }
      }
    }
    ranges.push([arrowOrFn, end]);
    i = end + 1;
  }
  return ranges;
}

function isInsideAnyRange(idx, ranges) {
  return ranges.some(([s, e]) => idx >= s && idx <= e);
}

// ── Test 1: journalEngine.postJournal accepts session ─────────────
console.log('\n== journalEngine.postJournal supports session ==');
{
  const { src } = readSrc('erp/services/journalEngine.js');
  const sigMatch = src.match(/async function postJournal\(([^)]+)\)/);
  if (!sigMatch) {
    bad('postJournal signature found');
  } else {
    const params = sigMatch[1];
    if (/options\s*=\s*\{\}/.test(params)) ok('postJournal accepts options arg');
    else bad('postJournal accepts options arg', `signature: ${params.trim()}`);
  }
  if (/\.save\(options\.session\s*\?\s*\{\s*session:\s*options\.session\s*\}/.test(src)) {
    ok('postJournal threads session into save()');
  } else {
    bad('postJournal threads session into save()', 'expected je.save({ session: options.session })');
  }
}

// ── Test 2: salesController createAndPostJournal calls inside transaction ─────
console.log('\n== salesController JE calls are transactional ==');
{
  const { src } = readSrc('erp/controllers/salesController.js');
  const ranges = findTransactionRanges(src);
  if (ranges.length < 2) {
    bad('found at least 2 withTransaction blocks', `found ${ranges.length}`);
  } else {
    ok(`found ${ranges.length} withTransaction blocks`);
  }

  const callRe = /createAndPostJournal\s*\(/g;
  let m;
  let total = 0, transactional = 0, withSession = 0;
  while ((m = callRe.exec(src)) !== null) {
    total++;
    const idx = m.index;
    const inTx = isInsideAnyRange(idx, ranges);
    if (inTx) transactional++;
    // Inspect the call body to see if `{ session }` is in args
    const open = src.indexOf('(', idx);
    let depth = 1;
    let close = open;
    for (let p = open + 1; p < src.length; p++) {
      const c = src[p];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) { close = p; break; } }
    }
    const args = src.slice(open + 1, close);
    const hasSession = /\{\s*session\s*\}/.test(args) || /\bsession:\s*session\b/.test(args);
    if (hasSession) withSession++;
    const lineNum = src.slice(0, idx).split('\n').length;
    if (!inTx) {
      bad(`createAndPostJournal call inside transaction (L${lineNum})`, 'call is OUTSIDE withTransaction block');
    }
    if (!hasSession) {
      bad(`createAndPostJournal call threads session (L${lineNum})`, `args: ${args.trim().slice(0, 200)}`);
    }
  }
  if (total === 0) {
    bad('found at least one createAndPostJournal call', 'expected 4 in salesController');
  } else if (total === transactional && total === withSession) {
    ok(`all ${total} createAndPostJournal calls are inside transaction AND thread session`);
  }
}

// ── Test 3: no remaining JE-failure swallow in submit/post paths ──
//    The pattern we removed: a try/catch around createAndPostJournal that
//    logs `auto_journal` to ErpAuditLog and swallows the error. Other
//    LEDGER_ERROR uses (e.g., fund-deleted-on-reopen) are unrelated and OK.
console.log('\n== no swallowed JE failures ==');
{
  const { src } = readSrc('erp/controllers/salesController.js');
  const jeSwallow = /catch\s*\(\s*jeErr\s*\)\s*\{[\s\S]*?LEDGER_ERROR[\s\S]*?auto_journal[\s\S]*?\}\)\.catch\(\(\)\s*=>\s*\{\s*\}\)/g;
  const swallows = (src.match(jeSwallow) || []).length;
  if (swallows === 0) {
    ok('no JE-failure swallow blocks remain in salesController');
  } else {
    bad('JE-failure swallow blocks removed', `${swallows} occurrence(s) still present`);
  }
}

// ── Test 4: COGS cost lookup in submit path uses session ──
console.log('\n== COGS cost lookup is session-aware ==');
{
  const { src } = readSrc('erp/controllers/salesController.js');
  // Specifically the COGS path: lookup that selects purchase_price from a $in:productIds list.
  const matches = src.match(/ProductMaster\.find\(\{\s*_id:\s*\{\s*\$in:\s*productIds\s*\}\s*\}\)\s*\.select\('purchase_price'\)[^;]*/g) || [];
  if (matches.length === 0) {
    bad('found COGS cost lookup', 'no ProductMaster.find({_id:{$in:productIds}}).select("purchase_price") match');
  } else {
    let allSession = true;
    matches.forEach(m => {
      if (!/\.session\(session\)/.test(m)) {
        allSession = false;
        bad('COGS cost lookup threads session', m.trim().slice(0, 200));
      }
    });
    if (allSession) ok(`all ${matches.length} COGS cost lookup(s) thread session`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('────────────────────────────────────────');
process.exit(fail === 0 ? 0 : 1);
