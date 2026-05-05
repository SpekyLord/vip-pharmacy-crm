/**
 * Static healthcheck — guards the contract that prevents the
 * "Type: CALF (PARTNER_REBATE)" display leak from regressing.
 *
 * The original bug:
 *   - PrfCalf schema declared `prf_type: { type: String, default: 'PARTNER_REBATE' }`.
 *     The default fired on every PrfCalf doc, including CALFs.
 *   - autoCalfForSource (expenseController) creates CALFs without setting prf_type,
 *     so utilities/fuel/ACCESS expense CALFs inherited the wrong tag.
 *   - DocumentDetailPanel rendered `Type: {doc_type} ({prf_type})` unconditionally,
 *     so the Approval Hub showed "CALF (PARTNER_REBATE)" for non-rebate documents.
 *
 * The fix has three pieces; this script asserts all three remain in place.
 *
 * Run:  node backend/erp/scripts/healthcheckCalfPrfTypeLeak.js
 * Exit: 0 = green, 1 = at least one check failed.
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

// 1. Schema MUST NOT default prf_type — the default leaked PARTNER_REBATE onto every CALF.
check(
  'PrfCalf.prf_type has NO schema default',
  () => {
    const src = read('backend/erp/models/PrfCalf.js');
    // Match any default near prf_type — fail if present, regardless of value.
    return !/prf_type\s*:\s*\{[^}]*\bdefault\s*:/.test(src);
  },
  'Remove the `default: "PARTNER_REBATE"` from PrfCalf.prf_type. Callers that create PRFs (autoPrfRouting, POST /prf-calf) must set it explicitly; CALFs leave it unset.'
);

// 2. Schema still declares prf_type as a String (PRFs need it).
check(
  'PrfCalf.prf_type still declared as a String field',
  () => {
    const src = read('backend/erp/models/PrfCalf.js');
    return /prf_type\s*:\s*\{[^}]*type\s*:\s*String/.test(src);
  },
  'Do not delete the prf_type field — PRFs still need it. Just keep the declaration without a default.'
);

// 3. autoCalfForSource creates CALF docs and does NOT set prf_type.
//    (If a future change adds prf_type to the auto-CALF payload, that\'s a regression.)
check(
  'autoCalfForSource does NOT pass prf_type when creating a CALF',
  () => {
    const src = read('backend/erp/controllers/expenseController.js');
    const start = src.indexOf('async function autoCalfForSource');
    if (start < 0) throw new Error('autoCalfForSource not found');
    // Walk the body to its closing brace (same brace-counter pattern as other healthchecks).
    const openIdx = src.indexOf('{', start);
    let depth = 0;
    let i = openIdx;
    let inS = false, inD = false, inB = false, inBlk = false, inLn = false;
    for (; i < src.length; i++) {
      const ch = src[i], nx = src[i + 1];
      if (inLn) { if (ch === '\n') inLn = false; continue; }
      if (inBlk) { if (ch === '*' && nx === '/') { inBlk = false; i++; } continue; }
      if (inS) { if (ch === '\\') { i++; continue; } if (ch === "'") inS = false; continue; }
      if (inD) { if (ch === '\\') { i++; continue; } if (ch === '"') inD = false; continue; }
      if (inB) { if (ch === '\\') { i++; continue; } if (ch === '`') inB = false; continue; }
      if (ch === '/' && nx === '/') { inLn = true; i++; continue; }
      if (ch === '/' && nx === '*') { inBlk = true; i++; continue; }
      if (ch === "'") { inS = true; continue; }
      if (ch === '"') { inD = true; continue; }
      if (ch === '`') { inB = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    const body = src.slice(start, i);
    return !/\bprf_type\s*:/.test(body);
  },
  'autoCalfForSource must NOT set prf_type on the CALF payload. CALFs have no prf_type — that field is PRF-only.'
);

// 4. Frontend display gate: prf_type is shown ONLY when doc_type === "PRF".
check(
  'DocumentDetailPanel renders prf_type only when doc_type === "PRF"',
  () => {
    const src = read('frontend/src/erp/components/DocumentDetailPanel.jsx');
    // The fixed line keeps the doc_type/prf_type pair gated by doc_type === \'PRF\'.
    return /Type:\s*<\/strong>\s*\{[^}]*d\.doc_type[^}]*\}\s*\{[^}]*d\.doc_type\s*===\s*['"]PRF['"][^}]*d\.prf_type[^}]*\}/.test(src);
  },
  'In DocumentDetailPanel.jsx, the Type line must guard the prf_type render with `d.doc_type === "PRF" && d.prf_type`. Otherwise CALFs will display "(PARTNER_REBATE)" again.'
);

// 5. Frontend display gate: explicitly forbid the OLD pattern that leaked the tag.
check(
  'DocumentDetailPanel does NOT use the unguarded `{d.prf_type ? ...}` pattern next to doc_type',
  () => {
    const src = read('frontend/src/erp/components/DocumentDetailPanel.jsx');
    // The buggy pattern was:  {d.doc_type} {d.prf_type ? `(${d.prf_type})` : ''}
    // Match it without the doc_type === 'PRF' guard — fail if present.
    return !/Type:\s*<\/strong>\s*\{d\.doc_type\}\s*\{d\.prf_type\s*\?[\s\S]{0,40}\$\{d\.prf_type\}/.test(src);
  },
  'Do not restore the pre-fix `{d.doc_type} {d.prf_type ? ...}` shape — that leaked PARTNER_REBATE onto every CALF.'
);

// 6. Every PRF (auto-routing path) explicitly sets prf_type — the schema-default
//    removal would otherwise leave PRFs without a type.
check(
  'autoPrfRouting.ensurePrfForBucket explicitly sets prf_type: "PARTNER_REBATE"',
  () => {
    const src = read('backend/erp/services/autoPrfRouting.js');
    return /doc_type:\s*['"]PRF['"][\s\S]{0,80}prf_type:\s*['"]PARTNER_REBATE['"]/.test(src);
  },
  'autoPrfRouting must set prf_type explicitly now that the schema-default is gone, otherwise rebate-PRFs land naked and the validator on submit blocks them.'
);

// 7. PRF validation (controller) still gates on PERSONAL_REIMBURSEMENT vs default-rebate.
//    A naked PRF should fall into the rebate branch and require partner bank fields.
check(
  'PRF validator branches on prf_type === "PERSONAL_REIMBURSEMENT" with a partner-rebate fallback',
  () => {
    const src = read('backend/erp/controllers/expenseController.js');
    return /doc\.doc_type\s*===\s*['"]PRF['"][\s\S]{0,800}prf_type\s*===\s*['"]PERSONAL_REIMBURSEMENT['"]/.test(src);
  },
  'PRF validation must keep the prf_type === "PERSONAL_REIMBURSEMENT" branch so naked PRFs (legacy or buggy) still get caught at submit time.'
);

// 8. Migration script exists and targets the right collection.
check(
  'Backfill migration migrateClearCalfPrfType.js exists and targets erp_prf_calf',
  () => {
    const src = read('backend/scripts/migrateClearCalfPrfType.js');
    return /collection\(['"]erp_prf_calf['"]\)/.test(src)
      && /doc_type:\s*['"]CALF['"]/.test(src)
      && /\$unset:\s*\{\s*prf_type/.test(src);
  },
  'Keep backend/scripts/migrateClearCalfPrfType.js: it must connect to the erp_prf_calf collection and $unset prf_type on doc_type=CALF rows. Idempotent.'
);

// ── reporting ─────────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.ok);
const passed = checks.length - failed.length;
const HR = '─'.repeat(72);

console.log(HR);
console.log(`prf_type CALF leak — static healthcheck (${checks.length} checks)`);
console.log(HR);
for (const c of checks) {
  const tag = c.ok ? '  PASS' : '  FAIL';
  console.log(`${tag}  ${c.name}`);
  if (!c.ok) {
    if (c.error) console.log(`        error: ${c.error}`);
    if (c.hint) console.log(`        hint:  ${c.hint}`);
  }
}
console.log(HR);
console.log(`${passed}/${checks.length} PASS, ${failed.length} FAIL`);
console.log(HR);
process.exit(failed.length === 0 ? 0 : 1);
