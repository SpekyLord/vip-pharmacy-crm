#!/usr/bin/env node
/**
 * healthcheckBirCompensationWithholding — Phase VIP-1.J / J3 Part A (May 2026)
 *
 * Verifies the full wiring chain for the 1601-C Monthly Compensation
 * Withholding return on top of the J2 EWT plumbing:
 *
 *   WithholdingLedger model (COMPENSATION direction reserved in J2, used by J3)
 *     → withholdingService.emitCompensationWithholdingForPayslip (Payslip → ledger bridge)
 *     → withholdingService.buildCompensationPosture (1601-C dashboard card source)
 *     → withholdingReturnService.compute1601C (monthly aggregator + box layout)
 *     → withholdingReturnService.exportEwtCsv extended for 1601-C
 *     → birController.compute1601C + getCompensationPosture handlers
 *     → birRoutes mount order (1601-C routes BEFORE J1 catch-all)
 *     → payrollController.postPayroll wires emit AFTER createAndPostJournal
 *     → universalApprovalController.payroll_run cascade wires emit AFTER JE
 *     → BirFilingStatus FORM_CODES allow 1601-C (J0 schema)
 *     → BIR_ATC_CODES lookup seeds WI100 + WC120 + WMWE
 *     → frontend birService.compute1601C + getCompensationPosture
 *     → BirEwtReturnDetailPage handles formCode '1601-C'
 *     → App.jsx mounts /erp/bir/1601-C/:year/:period BEFORE wildcard
 *     → PageGuide has 'bir-comp-return' entry
 *
 * Exits 1 on first failure so CI gates on it.
 *
 * Run: node backend/scripts/healthcheckBirCompensationWithholding.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const errors = [];
const warnings = [];

function read(file) {
  try {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch (err) {
    errors.push(`MISSING FILE: ${file} — ${err.message}`);
    return '';
  }
}

function expect(condition, message) {
  if (!condition) errors.push(`FAIL: ${message}`);
  else process.stdout.write('.');
}

function warn(condition, message) {
  if (!condition) warnings.push(`WARN: ${message}`);
}

console.log('Phase VIP-1.J / J3 Part A (1601-C Compensation Withholding) wiring health check\n─────────────────────────────────────────────');

// ── 1. withholdingService exports the J3 helpers ─────────────────────────
let withholdingService;
try {
  withholdingService = require('../erp/services/withholdingService');
  expect(typeof withholdingService.emitCompensationWithholdingForPayslip === 'function',
    'withholdingService exports emitCompensationWithholdingForPayslip');
  expect(typeof withholdingService.buildCompensationPosture === 'function',
    'withholdingService exports buildCompensationPosture');
  expect(withholdingService.COMPENSATION_ATC_CODES && typeof withholdingService.COMPENSATION_ATC_CODES === 'object',
    'withholdingService exports COMPENSATION_ATC_CODES object');
  expect(withholdingService.COMPENSATION_ATC_CODES?.REGULAR === 'WI100',
    'COMPENSATION_ATC_CODES.REGULAR = "WI100" (BIR ATC for Filipino employee compensation)');
  expect(withholdingService.COMPENSATION_ATC_CODES?.THIRTEENTH_MONTH_EXCESS === 'WC120',
    'COMPENSATION_ATC_CODES.THIRTEENTH_MONTH_EXCESS = "WC120" (BIR ATC for 13th-month excess)');
  expect(withholdingService.COMPENSATION_ATC_CODES?.MWE === 'WMWE',
    'COMPENSATION_ATC_CODES.MWE = "WMWE" (engine-internal — no BIR ATC for MWE because they are exempt)');
  expect(typeof withholdingService.DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP === 'number'
    && withholdingService.DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP === 90_000,
    'withholdingService exports DEFAULT_THIRTEENTH_MONTH_EXEMPT_PHP = 90_000 (TRAIN Law)');
  expect(withholdingService.DEFAULT_RATES?.WI100 === 0,
    'DEFAULT_RATES.WI100 = 0 (graduated tax table; rate field is a marker only)');
  expect(withholdingService.DEFAULT_RATES?.WC120 === 0,
    'DEFAULT_RATES.WC120 = 0 (graduated tax table)');
  expect(withholdingService.DEFAULT_RATES?.WMWE === 0,
    'DEFAULT_RATES.WMWE = 0 (MWE is exempt under TRAIN)');
  expect(withholdingService.DEFAULT_FORM_FOR_ATC?.WI100 === '1601-C',
    'DEFAULT_FORM_FOR_ATC.WI100 = "1601-C"');
  expect(withholdingService.DEFAULT_FORM_FOR_ATC?.WC120 === '1601-C',
    'DEFAULT_FORM_FOR_ATC.WC120 = "1601-C"');
  expect(withholdingService.DEFAULT_FORM_FOR_ATC?.WMWE === '1601-C',
    'DEFAULT_FORM_FOR_ATC.WMWE = "1601-C"');
} catch (err) {
  errors.push(`withholdingService load failed: ${err.message}`);
}

// ── 2. withholdingReturnService exports + 1601-C box layout ──────────────
let withholdingReturnService;
try {
  withholdingReturnService = require('../erp/services/withholdingReturnService');
  expect(typeof withholdingReturnService.compute1601C === 'function',
    'withholdingReturnService exports compute1601C');
  // getBoxLayout supports 1601-C
  const layout = withholdingReturnService.getBoxLayout('1601-C');
  expect(Array.isArray(layout) && layout.length >= 10,
    'getBoxLayout("1601-C") returns 10+ box rows (Sch 1, Sch 2, Sch 3, Totals)');
  const boxCodes = new Set(layout.map(b => b.code));
  expect(boxCodes.has('wi100_gross') && boxCodes.has('wi100_tax'),
    'BOX_LAYOUT_1601_C has wi100_gross + wi100_tax (Sch 1)');
  expect(boxCodes.has('wc120_gross') && boxCodes.has('wc120_tax'),
    'BOX_LAYOUT_1601_C has wc120_gross + wc120_tax (Sch 2)');
  expect(boxCodes.has('wmwe_gross') && boxCodes.has('wmwe_tax'),
    'BOX_LAYOUT_1601_C has wmwe_gross + wmwe_tax (Sch 3)');
  expect(boxCodes.has('total_gross') && boxCodes.has('total_taxable')
    && boxCodes.has('total_withheld') && boxCodes.has('employee_count'),
    'BOX_LAYOUT_1601_C has 4-key TOTAL section');
  // Sections present
  const sections = new Set(layout.map(b => b.section));
  expect(sections.has('COMP') && sections.has('BNS') && sections.has('MWE') && sections.has('TOTAL'),
    'BOX_LAYOUT_1601_C uses COMP/BNS/MWE/TOTAL section codes');
} catch (err) {
  errors.push(`withholdingReturnService load failed: ${err.message}`);
}

// ── 3. withholdingReturnService.js source — direction parameter wired ────
const wrSource = read('backend/erp/services/withholdingReturnService.js');
expect(/sumByAtcCode\s*\([^)]*direction\s*=\s*['"]OUTBOUND['"]/.test(wrSource),
  'sumByAtcCode signature accepts `direction` parameter (J3 backward-compat default OUTBOUND)');
expect(/listPayees\s*\([^)]*direction\s*=\s*['"]OUTBOUND['"]/.test(wrSource),
  'listPayees signature accepts `direction` parameter (J3 backward-compat default OUTBOUND)');
expect(/sumByAtcCode\s*\([^)]+,\s*\[[^\]]*period[^\]]*\]\s*,\s*['"]INCLUDE['"]\s*,\s*['"]COMPENSATION['"]\s*\)/.test(wrSource),
  'compute1601C calls sumByAtcCode with direction="COMPENSATION"');
expect(/listPayees\s*\([^)]+,\s*\[[^\]]+\]\s*,\s*\[[^\]]+\]\s*,\s*['"]INCLUDE['"]\s*,\s*['"]COMPENSATION['"]\s*\)/.test(wrSource),
  'compute1601C calls listPayees with atc filter + direction="COMPENSATION"');
expect(/formCode === ['"]1601-C['"]/.test(wrSource),
  'exportEwtCsv branches on formCode === "1601-C"');
expect(/compute1601C\(\{[^}]*entityId/.test(wrSource),
  'exportEwtCsv calls compute1601C internally for 1601-C exports');

// ── 4. withholdingService.js source — bridge + posture written correctly ─
const wsSource = read('backend/erp/services/withholdingService.js');
expect(/direction:\s*['"]COMPENSATION['"]/.test(wsSource),
  'emitCompensationWithholdingForPayslip writes direction="COMPENSATION"');
expect(/source_module:\s*['"]PAYROLL['"]/.test(wsSource),
  'emitCompensationWithholdingForPayslip writes source_module="PAYROLL"');
expect(/payee_kind:\s*['"]PeopleMaster['"]/.test(wsSource),
  'emitCompensationWithholdingForPayslip writes payee_kind="PeopleMaster"');
expect(/source_event_id:\s*payslip\._id/.test(wsSource),
  'emitCompensationWithholdingForPayslip uses payslip._id as source_event_id (idempotent reversal key)');
expect(/deleteWithholdingEntriesForEvent\s*\(payslip\._id/.test(wsSource),
  'emitCompensationWithholdingForPayslip calls deleteWithholdingEntriesForEvent(payslip._id) for idempotent re-emit');
expect(/COMPENSATION_13TH_MONTH_EXEMPT/.test(wsSource),
  'emit reads Settings.COMPENSATION_13TH_MONTH_EXEMPT for the per-entity threshold (subscription-ready)');
expect(/employment_type === ['"]MWE['"]/.test(wsSource),
  'emit checks PeopleMaster.employment_type === "MWE" for MWE classification');
expect(/buildCompensationPosture/.test(wsSource),
  'withholdingService.js defines buildCompensationPosture');
expect(/direction:\s*['"]COMPENSATION['"][^}]*period:\s*\{[^}]*\$gte/.test(wsSource),
  'buildCompensationPosture aggregates COMPENSATION direction within YTD period');

// ── 5. birController J3 handlers ─────────────────────────────────────────
const ctrlSource = read('backend/erp/controllers/birController.js');
expect(/exports\.compute1601C\s*=/.test(ctrlSource),
  'birController exports compute1601C');
expect(/exports\.getCompensationPosture\s*=/.test(ctrlSource),
  'birController exports getCompensationPosture');
expect(/withholdingReturnService\.compute1601C\(\s*\{\s*entityId/.test(ctrlSource),
  'compute1601C handler delegates to withholdingReturnService.compute1601C');
expect(/withholdingService\.buildCompensationPosture/.test(ctrlSource),
  'getCompensationPosture handler delegates to withholdingService.buildCompensationPosture');
expect(/formCode !== ['"]1601-EQ['"][^&]*&&[^&]*formCode !== ['"]1606['"][^&]*&&[^&]*formCode !== ['"]1601-C['"]/.test(ctrlSource),
  'exportEwtCsv allows formCode in {1601-EQ, 1606, 1601-C}');
expect(/formCode === ['"]1606['"]\s*\|\|\s*formCode === ['"]1601-C['"]/.test(ctrlSource),
  'exportEwtCsv parses month for both 1606 AND 1601-C (monthly forms)');
expect(/ensureRole\(req,\s*res,\s*['"]VIEW_DASHBOARD['"]\)/.test(ctrlSource),
  'compute1601C gated by VIEW_DASHBOARD birAccess role');
expect(/ensureRole\(req,\s*res,\s*['"]EXPORT_FORM['"]\)/.test(ctrlSource),
  'export gated by EXPORT_FORM birAccess role');

// ── 6. birRoutes mount order — J3 routes BEFORE catch-all ────────────────
const routesSource = read('backend/erp/routes/birRoutes.js');
expect(/router\.get\(['"]\/forms\/1601-C\/:year\/:month\/compute['"]/.test(routesSource),
  'birRoutes mounts GET /forms/1601-C/:year/:month/compute');
expect(/router\.get\(['"]\/forms\/1601-C\/:year\/:month\/export\.csv['"]/.test(routesSource),
  'birRoutes mounts GET /forms/1601-C/:year/:month/export.csv');
expect(/router\.get\(['"]\/withholding\/comp-posture['"]/.test(routesSource),
  'birRoutes mounts GET /withholding/comp-posture');
// Mount-order: 1601-C routes BEFORE the J1 catch-all /forms/:formCode/:year/:period/export.csv
// Search for the actual `router.get(` definition lines (not comments referencing the path).
const j3ComputeIdx = routesSource.indexOf("router.get('/forms/1601-C/:year/:month/compute'");
const j1CatchIdx = routesSource.indexOf("router.get('/forms/:formCode/:year/:period/export.csv'");
expect(j3ComputeIdx > 0 && j1CatchIdx > 0 && j3ComputeIdx < j1CatchIdx,
  'J3 1601-C routes are declared BEFORE the J1 /:formCode catch-all (route definitions, ignoring comments)');
const j3FormsIdGetIdx = routesSource.indexOf("router.get('/forms/:id'", j1CatchIdx);
expect(j3FormsIdGetIdx > j1CatchIdx,
  '/forms/:id getter still trails the J3 specific routes (Express priority)');

// ── 7. payrollController + universalApprovalController emit wiring ───────
const payrollCtrl = read('backend/erp/controllers/payrollController.js');
expect(/emitCompensationWithholdingForPayslip/.test(payrollCtrl),
  'payrollController calls emitCompensationWithholdingForPayslip');
expect(/J3_COMPENSATION_EMIT_FAILURE/.test(payrollCtrl),
  'payrollController logs LEDGER_ERROR with [J3_COMPENSATION_EMIT_FAILURE] tag on failure');
// Emit must happen AFTER the JE wiring inside the same outer try-catch — best
// approximation: the emit text appears AFTER the createAndPostJournal call.
const payrollJeIdx = payrollCtrl.indexOf('createAndPostJournal(');
const payrollEmitIdx = payrollCtrl.indexOf('emitCompensationWithholdingForPayslip', payrollJeIdx);
expect(payrollJeIdx > 0 && payrollEmitIdx > payrollJeIdx,
  'payrollController emit happens AFTER createAndPostJournal in the same loop iteration');

const cascadeCtrl = read('backend/erp/controllers/universalApprovalController.js');
expect(/emitCompensationWithholdingForPayslip/.test(cascadeCtrl),
  'universalApprovalController cascade calls emitCompensationWithholdingForPayslip');
expect(/CASCADE J3_COMPENSATION_EMIT_FAILURE/.test(cascadeCtrl),
  'cascade logs LEDGER_ERROR with [G4.5cc CASCADE J3_COMPENSATION_EMIT_FAILURE] tag on failure');
const cascadeJeIdx = cascadeCtrl.indexOf('createAndPostJournal(', cascadeCtrl.indexOf('payroll_run:'));
const cascadeEmitIdx = cascadeCtrl.indexOf('emitCompensationWithholdingForPayslip', cascadeJeIdx);
expect(cascadeJeIdx > 0 && cascadeEmitIdx > cascadeJeIdx,
  'cascade payroll_run handler emit happens AFTER createAndPostJournal');

// ── 8. BirFilingStatus model recognizes 1601-C (J0-shipped) ──────────────
const filingStatusModel = read('backend/erp/models/BirFilingStatus.js');
expect(/['"]1601-C['"]/.test(filingStatusModel),
  'BirFilingStatus FORM_CODES enum includes "1601-C"');
expect(/monthlyForms = \[[^\]]*['"]1601-C['"]/.test(filingStatusModel),
  'BirFilingStatus pre-validate treats 1601-C as monthly (period_month required)');

// ── 9. BIR_ATC_CODES lookup seeds for J3 ─────────────────────────────────
const lookupCtrl = read('backend/erp/controllers/lookupGenericController.js');
expect(/code:\s*['"]WI100['"][\s\S]+?form:\s*['"]1601-C['"]/.test(lookupCtrl),
  'BIR_ATC_CODES seeds WI100 with form="1601-C"');
expect(/code:\s*['"]WC120['"][\s\S]+?form:\s*['"]1601-C['"]/.test(lookupCtrl),
  'BIR_ATC_CODES seeds WC120 with form="1601-C"');
expect(/code:\s*['"]WMWE['"][\s\S]+?form:\s*['"]1601-C['"]/.test(lookupCtrl),
  'BIR_ATC_CODES seeds WMWE with form="1601-C" (engine-internal exempt code)');

// ── 10. Frontend birService J3 wrappers ──────────────────────────────────
const fbirService = read('frontend/src/erp/services/birService.js');
expect(/export async function compute1601C\s*\(year,\s*month\)/.test(fbirService),
  'frontend birService exports compute1601C(year, month)');
expect(/export async function getCompensationPosture/.test(fbirService),
  'frontend birService exports getCompensationPosture');
expect(/`\$\{BASE\}\/forms\/1601-C\/\$\{year\}\/\$\{month\}\/compute`/.test(fbirService),
  'compute1601C hits /forms/1601-C/:year/:month/compute');
expect(/`\$\{BASE\}\/withholding\/comp-posture`/.test(fbirService),
  'getCompensationPosture hits /withholding/comp-posture');
// Default export
expect(/compute1601C,\s*\n\s*getCompensationPosture/.test(fbirService),
  'birService default export includes compute1601C + getCompensationPosture');

// ── 11. BirEwtReturnDetailPage handles 1601-C ────────────────────────────
const ewtPage = read('frontend/src/erp/pages/BirEwtReturnDetailPage.jsx');
expect(/formCode !== ['"]1601-EQ['"]\s*&&\s*formCode !== ['"]1606['"]\s*&&\s*formCode !== ['"]1601-C['"]/.test(ewtPage),
  'validParams allows 1601-C');
expect(/birService\.compute1601C\(year,\s*period\)/.test(ewtPage),
  'page.load() calls birService.compute1601C for 1601-C formCode');
expect(/scheduleLabel\s*\(formCode\)/.test(ewtPage),
  'page renders schedule label via scheduleLabel(formCode) helper');
expect(/'1601-C'\s*\?\s*'bir-comp-return'/.test(ewtPage),
  'page swaps PageGuide pageKey to bir-comp-return for 1601-C');
expect(/Per-Employee Schedule/.test(ewtPage),
  'scheduleLabel returns "Per-Employee Schedule" for 1601-C');
expect(/SECTION_LABELS = \{[\s\S]*COMP:[\s\S]*BNS:[\s\S]*MWE:/.test(ewtPage),
  'SECTION_LABELS has COMP / BNS / MWE entries for 1601-C box sections');

// ── 12. App.jsx mounts 1601-C route BEFORE wildcard ──────────────────────
const appJsx = read('frontend/src/App.jsx');
expect(/path="\/erp\/bir\/1601-C\/:year\/:period"/.test(appJsx),
  'App.jsx declares /erp/bir/1601-C/:year/:period route');
expect(/formCodeOverride="1601-C"/.test(appJsx),
  'App.jsx passes formCodeOverride="1601-C" to BirEwtReturnDetailPage');
// Match the actual <Route path="..."> declaration, not the comment text mentioning the path.
const j3RouteIdx = appJsx.indexOf('path="/erp/bir/1601-C/:year/:period"');
const j1WildcardIdx = appJsx.indexOf('path="/erp/bir/:formCode/:year/:period"');
expect(j3RouteIdx > 0 && j1WildcardIdx > 0 && j3RouteIdx < j1WildcardIdx,
  'App.jsx 1601-C route is declared BEFORE the /:formCode wildcard fallback');

// ── 13. PageGuide bir-comp-return entry ──────────────────────────────────
const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
expect(/'bir-comp-return':\s*\{/.test(pageGuide),
  'PageGuide registers bir-comp-return key');
expect(/title:\s*['"]BIR 1601-C/.test(pageGuide),
  'bir-comp-return title mentions BIR 1601-C');
expect(/COMPENSATION_13TH_MONTH_EXEMPT/.test(pageGuide),
  'bir-comp-return banner mentions per-entity threshold setting (subscription-ready discoverability)');
expect(/MWE/.test(pageGuide) && /TRAIN/.test(pageGuide),
  'bir-comp-return banner explains MWE / TRAIN exemption posture');

// ── 14. ROLE_SETS.BIR_FILING includes the 1601-C surface implicitly ──────
// 1601-C reuses the shared route-guard ROLE_SETS.BIR_FILING (same as 1601-EQ
// + 1606 + 2550M/Q). No new role needed; backend birAccess handles per-scope
// gating via VIEW_DASHBOARD / EXPORT_FORM.
const rolesSource = read('frontend/src/constants/roles.js');
expect(/BIR_FILING/.test(rolesSource),
  'roles.js defines ROLE_SETS.BIR_FILING (shared with J1/J2)');

// ── Done ─────────────────────────────────────────────────────────────────
console.log('\n');
if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach(w => console.log('  ' + w));
  console.log('');
}
if (errors.length) {
  console.log(`✗ ${errors.length} failure${errors.length === 1 ? '' : 's'}:`);
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}
console.log('✓ Phase VIP-1.J / J3 Part A wiring is healthy.');
console.log('  Coverage: model/service/controller/routes/payroll-bridge/cascade/seed/');
console.log('            frontend service/page/route/PageGuide/role-set.');
console.log('  Next: Part B — 1604-CF annual alphalist (.dat writer + 3 schedules).');
