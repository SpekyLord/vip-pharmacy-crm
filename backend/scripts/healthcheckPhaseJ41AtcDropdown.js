/**
 * Phase J4.1 — Expense ATC Dropdown UI Healthcheck (May 06 2026)
 *
 * Static-contract verifier for the ATC selection dropdown wired into
 * `frontend/src/erp/pages/Expenses.jsx`. Closes the gap that J2 left:
 * the engine reads `line.atc_code` at POST and emits a WithholdingLedger
 * row, but no UI surface let proxies/BDMs tag a line during data entry —
 * `atc_code` could only be set via direct DB writes or `Vendor.default_atc_code`.
 *
 * What this asserts:
 *   1. Frontend renders the dropdown filtered by applies_to (excludes
 *      HOSPITAL inbound + EMPLOYEE_* compensation codes).
 *   2. addLine initializes atc_code: null (non-EWT default).
 *   3. The line's atc_code flows backend via the existing safeBody spread
 *      (no controller change needed).
 *   4. ExpenseEntry.expenseLineSchema retains its J2 atc_code field intact.
 *   5. BIR_ATC_CODES seed contains the 8+ outbound codes the filter keeps,
 *      AND the 4 codes the filter excludes (so the filter has something to
 *      filter against — proves the lookup data is the source of truth).
 *   6. autoClassifyLines doesn't mutate atc_code (orthogonal to category/COA).
 *   7. WorkflowGuide expenses banner mentions the ATC step (Rule #1).
 *   8. Subscription-readiness: the ATC seed is `insert_only_metadata: true`
 *      so subscriber edits to label/description/rate survive future re-seeds
 *      (Rule #3 / Rule #19).
 *
 * Run: node backend/scripts/healthcheckPhaseJ41AtcDropdown.js
 * Exit 0 = pass. Exit 1 = first failed assertion.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

let failures = 0;
let passes = 0;

function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

function assert(label, cond) {
  if (cond) {
    passes += 1;
    process.stdout.write('.');
  } else {
    failures += 1;
    console.error(`\n  ✗ ${label}`);
  }
}

console.log('Phase J4.1 — Expense ATC Dropdown UI healthcheck');
console.log('─────────────────────────────────────────────────');

// ─── 1. Frontend: Expenses.jsx wires the ATC dropdown ───────────────────────
const expensesJsx = read('frontend/src/erp/pages/Expenses.jsx');

assert('Expenses.jsx imports useLookupOptions',
  /from '\.\.\/hooks\/useLookups'/.test(expensesJsx));

assert('Expenses.jsx imports SelectField',
  /from '\.\.\/\.\.\/components\/common\/Select'/.test(expensesJsx));

assert('Expenses.jsx calls useLookupOptions("BIR_ATC_CODES")',
  /useLookupOptions\(['"]BIR_ATC_CODES['"]\)/.test(expensesJsx));

assert('Expenses.jsx filter EXCLUDES applies_to === "HOSPITAL"',
  /applies_to[^\n]*!==\s*['"]HOSPITAL['"]/.test(expensesJsx)
  || /a\s*!==\s*['"]HOSPITAL['"]/.test(expensesJsx));

assert('Expenses.jsx filter EXCLUDES applies_to.startsWith("EMPLOYEE")',
  /!a\.startsWith\(['"]EMPLOYEE['"]\)/.test(expensesJsx));

assert('Expenses.jsx defines expenseAtcOpts (filtered list)',
  /const\s+expenseAtcOpts\s*=/.test(expensesJsx));

assert('Expenses.jsx addLine() initializes atc_code: null',
  /addLine\s*=\s*\(\)\s*=>\s*\{[\s\S]*?atc_code:\s*null/.test(expensesJsx));

assert('Expenses.jsx renders SelectField bound to line.atc_code',
  /value=\{line\.atc_code\s*\|\|\s*['"]['"]\}/.test(expensesJsx));

assert('Expenses.jsx onChange writes back as null when empty',
  /updateLine\(idx,\s*['"]atc_code['"],\s*e\.target\.value\s*\|\|\s*null\)/.test(expensesJsx));

assert('Expenses.jsx ATC dropdown has placeholder "ATC..." option',
  /<option\s+value=['"]['"]>ATC\.\.\.<\/option>/.test(expensesJsx));

assert('Expenses.jsx ATC dropdown iterates expenseAtcOpts',
  /expenseAtcOpts\.map\(/.test(expensesJsx));

assert('Expenses.jsx ATC dropdown title attribute (tooltip) explains purpose',
  /title=['"][^'"]*EWT[^'"]*withholding/i.test(expensesJsx)
  || /title=['"][^'"]*ATC[^'"]*EWT/i.test(expensesJsx));

// ─── 2. Backend Model: ExpenseEntry retains J2 atc_code field ───────────────
const expenseEntryModel = read('backend/erp/models/ExpenseEntry.js');

assert('ExpenseEntry.expenseLineSchema has atc_code field',
  /atc_code:\s*\{\s*type:\s*String/.test(expenseEntryModel));

assert('ExpenseEntry.atc_code has trim: true',
  /atc_code:\s*\{[^}]*trim:\s*true/.test(expenseEntryModel));

assert('ExpenseEntry.atc_code has uppercase: true (BIR codes are upper)',
  /atc_code:\s*\{[^}]*uppercase:\s*true/.test(expenseEntryModel));

assert('ExpenseEntry.atc_code has default: null (non-EWT default)',
  /atc_code:\s*\{[^}]*default:\s*null/.test(expenseEntryModel));

// ─── 3. Backend Controller: data flow path is intact ────────────────────────
const expenseController = read('backend/erp/controllers/expenseController.js');

assert('createExpense uses ...safeBody spread (atc_code passes through)',
  /ExpenseEntry\.create\(\{\s*\.\.\.safeBody/.test(expenseController));

assert('autoClassifyLines does NOT mutate line.atc_code',
  !/(line|l)\.atc_code\s*=/.test(
    expenseController.match(/async function autoClassifyLines[\s\S]+?^}/m)?.[0] || ''
  ));

assert('emitWithholdingForExpense reads doc.atc_code (J2 chain intact)',
  /doc\.atc_code/.test(expenseController));

assert('emit guard: skips when atc_code is missing (NO_ATC short-circuit)',
  /reason:\s*['"]NO_ATC['"]/.test(expenseController));

// ─── 4. Backend Lookup: BIR_ATC_CODES seed contract ─────────────────────────
const lookupSeed = read('backend/erp/controllers/lookupGenericController.js');

const atcSection = lookupSeed.match(/BIR_ATC_CODES[\s\S]+?\][^,]*?,/)?.[0] || '';

assert('BIR_ATC_CODES seed exists in lookupGenericController',
  /\bBIR_ATC_CODES\b/.test(lookupSeed));

assert('Seed includes WI010 (CONTRACTOR_INDIV_LOW — outbound, kept by filter)',
  /code:\s*['"]WI010['"][\s\S]{0,250}applies_to:\s*['"]CONTRACTOR_INDIV_LOW['"]/.test(atcSection));

assert('Seed includes WI160 (LANDLORD_INDIV — outbound rent, kept)',
  /code:\s*['"]WI160['"][\s\S]{0,250}applies_to:\s*['"]LANDLORD_INDIV['"]/.test(atcSection));

assert('Seed includes WI080 (TWA_GOODS — outbound, kept)',
  /code:\s*['"]WI080['"][\s\S]{0,250}applies_to:\s*['"]TWA_GOODS['"]/.test(atcSection));

assert('Seed includes WC158 (HOSPITAL — inbound, filtered OUT)',
  /code:\s*['"]WC158['"][\s\S]{0,250}applies_to:\s*['"]HOSPITAL['"]/.test(atcSection));

assert('Seed includes WI100 (EMPLOYEE — compensation 1601-C, filtered OUT)',
  /code:\s*['"]WI100['"][\s\S]{0,250}applies_to:\s*['"]EMPLOYEE['"]/.test(atcSection));

assert('Seed uses insert_only_metadata: true (subscription-ready — Rule #3)',
  /insert_only_metadata:\s*true/.test(atcSection));

// ─── 5. Banner update (Rule #1) ─────────────────────────────────────────────
const workflowGuide = read('frontend/src/erp/components/WorkflowGuide.jsx');
const expensesBlock = workflowGuide.match(/['"]expenses['"]:\s*\{[\s\S]+?next:/)?.[0] || '';

assert('WorkflowGuide expenses block mentions ATC',
  /\bATC\b/.test(expensesBlock));

assert('WorkflowGuide expenses block mentions EWT-eligible categories',
  /(rent|professional fees|TWA)/i.test(expensesBlock));

assert('WorkflowGuide expenses block notes the HOSPITAL/EMPLOYEE filter',
  /HOSPITAL[\s\S]{0,200}EMPLOYEE/i.test(expensesBlock)
  || /1601-C[\s\S]{0,200}2307/.test(expensesBlock));

// ─── 6. useLookups hook returns metadata (frontend filter contract) ─────────
const useLookups = read('frontend/src/erp/hooks/useLookups.js');

assert('useLookupOptions returns metadata field (filter dependency)',
  /metadata:\s*item\.metadata/.test(useLookups));

assert('useLookupOptions caches per (entityId:category) key',
  /\$\{entityId\}:\$\{category\}/.test(useLookups));

// ─── 7. Withholding engine sanity (J2 chain — must still work) ──────────────
const withholdingService = read('backend/erp/services/withholdingService.js');

assert('withholdingService reads metadata.applies_to (filter alignment)',
  /metadata\?\.applies_to|metadata\.applies_to/.test(withholdingService));

console.log('\n');
if (failures === 0) {
  console.log(`✓ All Phase J4.1 healthcheck assertions passed (${passes}/${passes})`);
  process.exit(0);
} else {
  console.log(`✗ ${failures} assertion(s) failed (${passes}/${passes + failures} passed)`);
  process.exit(1);
}
