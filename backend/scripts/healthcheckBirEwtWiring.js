#!/usr/bin/env node
/**
 * healthcheckBirEwtWiring — Phase VIP-1.J / J2 (Apr 2026)
 *
 * Verifies the full wiring chain for the 1601-EQ + 1606 + 2307-OUT + SAWT
 * EWT pages on top of the J0 dashboard + J1 VAT plumbing:
 *
 *   WithholdingLedger model + indexes
 *     → withholdingService (resolver + emit + reversal + posture)
 *     → withholdingReturnService (compute1601EQ + compute1606 + 2307 + SAWT)
 *     → birController (5 new endpoints + posture)
 *     → birRoutes mount order (specific routes BEFORE J1 catch-all)
 *     → CORS exposed-headers (still includes J1 headers + handles PDF/.dat)
 *     → frontend birService (J2 wrappers)
 *     → BirEwtReturnDetailPage rendered via App.jsx routes
 *     → BIRCompliancePage heatmap drill-down extension (1601-EQ + 1606 + SAWT)
 *     → PageGuide entry (bir-ewt-return)
 *     → ROLE_SETS.BIR_FILING populated (frontend + backend)
 *     → Engine wiring: postSingleExpense + postSinglePrfCalf + reopen path
 *     → ATC + withhold_active fields on PeopleMaster + Vendor
 *     → ATC seed in BIR_ATC_CODES lookup
 *
 * Exits 1 on first failure so CI gates on it.
 *
 * Run: node backend/scripts/healthcheckBirEwtWiring.js
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

console.log('Phase VIP-1.J / J2 wiring health check\n─────────────────────────────────────────────');

// ── 1. WithholdingLedger model loads + has expected enums + indexes ─────
let WithholdingLedger;
try {
  WithholdingLedger = require('../erp/models/WithholdingLedger');
  expect(typeof WithholdingLedger === 'function', 'WithholdingLedger model exports a Mongoose model');
  expect(Array.isArray(WithholdingLedger.DIRECTIONS) && WithholdingLedger.DIRECTIONS.includes('OUTBOUND'),
    'WithholdingLedger.DIRECTIONS exposes OUTBOUND');
  expect(WithholdingLedger.DIRECTIONS.includes('INBOUND') && WithholdingLedger.DIRECTIONS.includes('COMPENSATION'),
    'WithholdingLedger.DIRECTIONS reserves INBOUND + COMPENSATION for J3/J6');
  expect(WithholdingLedger.FINANCE_TAGS && WithholdingLedger.FINANCE_TAGS.includes('PENDING'),
    'WithholdingLedger.FINANCE_TAGS includes PENDING');
  expect(WithholdingLedger.FINANCE_TAGS.includes('INCLUDE') && WithholdingLedger.FINANCE_TAGS.includes('EXCLUDE'),
    'WithholdingLedger.FINANCE_TAGS mirror VatLedger semantics');
  expect(WithholdingLedger.PAYEE_KINDS && WithholdingLedger.PAYEE_KINDS.includes('VendorMaster'),
    'WithholdingLedger.PAYEE_KINDS includes VendorMaster');
  expect(WithholdingLedger.PAYEE_KINDS.includes('PeopleMaster'),
    'WithholdingLedger.PAYEE_KINDS includes PeopleMaster');
  // Indexes
  const indexes = WithholdingLedger.schema._indexes || WithholdingLedger.schema.indexes() || [];
  const indexKeys = indexes.map(i => Object.keys(i[0] || {}).join(',')).join(';');
  expect(indexKeys.includes('entity_id,period,direction,atc_code'),
    'WithholdingLedger has index { entity_id, period, direction, atc_code }');
  expect(indexKeys.includes('entity_id,payee_kind,payee_id,period'),
    'WithholdingLedger has index { entity_id, payee_kind, payee_id, period }');
  expect(indexKeys.includes('source_event_id'),
    'WithholdingLedger has index { source_event_id }');
} catch (err) {
  errors.push(`WithholdingLedger model load failed: ${err.message}`);
}

// ── 2. withholdingService loads + resolver API ──────────────────────────
let whSvc;
try {
  whSvc = require('../erp/services/withholdingService');
  ['resolveAtcCodeForExpenseLine', 'resolveAtcCodeForPrfRent',
   'createWithholdingEntries', 'deleteWithholdingEntriesForEvent',
   'getYtdGrossForPayee', 'getAtcMetadata', 'invalidateAtcCache',
   'buildPosture'].forEach(fn => {
    expect(typeof whSvc[fn] === 'function', `withholdingService.${fn} exported`);
  });
  expect(whSvc.DEFAULT_RATES && whSvc.DEFAULT_RATES.WI010 === 0.05, 'WI010 default rate is 0.05');
  expect(whSvc.DEFAULT_RATES.WI011 === 0.10, 'WI011 default rate is 0.10');
  expect(whSvc.DEFAULT_RATES.WI160 === 0.05, 'WI160 default rate is 0.05');
  expect(whSvc.DEFAULT_FORM_FOR_ATC.WI010 === '1601-EQ', 'WI010 maps to form 1601-EQ');
  expect(whSvc.DEFAULT_FORM_FOR_ATC.WI160 === '1606', 'WI160 maps to form 1606');
} catch (err) {
  errors.push(`withholdingService load failed: ${err.message}`);
}

// ── 3. withholdingReturnService loads + API contract ────────────────────
let wrSvc;
try {
  wrSvc = require('../erp/services/withholdingReturnService');
  ['compute1601EQ', 'compute1606', 'exportEwtCsv', 'export2307Pdf',
   'exportSawtDat', 'serializeSawtDat', 'getBoxLayout', 'listPayees'].forEach(fn => {
    expect(typeof wrSvc[fn] === 'function', `withholdingReturnService.${fn} exported`);
  });
  const layout1601 = wrSvc.getBoxLayout('1601-EQ');
  expect(Array.isArray(layout1601) && layout1601.length === 14,
    '1601-EQ box layout has 14 boxes (Sch1 8 + Sch2 4 + Total 2)');
  const layout1606 = wrSvc.getBoxLayout('1606');
  expect(Array.isArray(layout1606) && layout1606.length === 6,
    '1606 box layout has 6 boxes (WI160 + WC160 + total)');
  // Section grouping
  const sections1601 = new Set(layout1601.map(b => b.section));
  expect(sections1601.has('SCH1') && sections1601.has('SCH2') && sections1601.has('TOTAL'),
    '1601-EQ layout covers SCH1 / SCH2 / TOTAL sections');
  // Reject unsupported codes
  let rejected = false;
  try { wrSvc.getBoxLayout('1604-CF'); } catch { rejected = true; }
  expect(rejected, 'getBoxLayout rejects unsupported form codes');

  // SAWT serializer is a pure function — sanity-check the header line.
  const sample = wrSvc.serializeSawtDat({
    entity: { tin: '123-456-789-00000', entity_name: 'Test Co' },
    year: 2026, quarter: 2,
    schedule: [{ payee_kind: 'PeopleMaster', payee_id: '0', payee_name: 'Test Payee', payee_tin: '111', payee_address: '', atc_code: 'WI010', gross: 1000, withheld: 50, count: 1, first_period: '2026-04', last_period: '2026-04' }],
  });
  const lines = sample.split(/\r\n/).filter(Boolean);
  expect(lines[0].startsWith('H1|'), 'SAWT header line starts with H1');
  expect(lines[0].includes('|2026Q2|SAWT|2026|2'), 'SAWT header carries period + form code + year + quarter');
  expect(lines[1].startsWith('D1|') && lines[1].includes('|WI010|'),
    'SAWT detail line starts with D1 and carries ATC code');
  expect(lines[2].startsWith('T1|'), 'SAWT trailer line starts with T1');
} catch (err) {
  errors.push(`withholdingReturnService load failed: ${err.message}`);
}

// ── 4. birController exports new endpoints ──────────────────────────────
const ctrl = read('backend/erp/controllers/birController.js');
['compute1601EQ', 'compute1606', 'listEwtPayees', 'exportEwtCsv',
 'export2307Pdf', 'exportSawtDat', 'getWithholdingPosture'].forEach(m => {
  expect(new RegExp(`exports\\.${m}\\s*=`).test(ctrl), `birController exports ${m}`);
});
expect(ctrl.includes("require('../services/withholdingReturnService')"),
  'birController requires withholdingReturnService');
expect(ctrl.includes("require('../services/withholdingService')"),
  'birController requires withholdingService');
// Role gates: VIEW_DASHBOARD on compute, EXPORT_FORM on every export.
expect(/compute1601EQ[\s\S]{0,500}VIEW_DASHBOARD/.test(ctrl),
  'compute1601EQ enforces VIEW_DASHBOARD');
expect(/compute1606[\s\S]{0,500}VIEW_DASHBOARD/.test(ctrl),
  'compute1606 enforces VIEW_DASHBOARD');
expect(/exportEwtCsv[\s\S]{0,500}EXPORT_FORM/.test(ctrl),
  'exportEwtCsv enforces EXPORT_FORM');
expect(/export2307Pdf[\s\S]{0,500}EXPORT_FORM/.test(ctrl),
  'export2307Pdf enforces EXPORT_FORM');
expect(/exportSawtDat[\s\S]{0,500}EXPORT_FORM/.test(ctrl),
  'exportSawtDat enforces EXPORT_FORM');
expect(/getWithholdingPosture[\s\S]{0,500}VIEW_DASHBOARD/.test(ctrl),
  'getWithholdingPosture enforces VIEW_DASHBOARD');

// ── 5. Routes mounted in birRoutes ──────────────────────────────────────
const routes = read('backend/erp/routes/birRoutes.js');
[
  '/forms/1601-EQ/:year/:quarter/compute',
  '/forms/1606/:year/:month/compute',
  '/forms/1601-EQ/:year/:quarter/payees',
  '/forms/1601-EQ/:year/:quarter/export.csv',
  '/forms/1606/:year/:month/export.csv',
  '/forms/SAWT/:year/:quarter/export.dat',
  '/forms/2307-OUT/:year/:quarter/:payeeKind/:payeeId/export.pdf',
  '/withholding/posture',
].forEach(p => {
  expect(routes.includes(p), `birRoutes wires ${p}`);
});
// J2 routes MUST be declared BEFORE the J1 export.csv catch-all.
// Match the actual `router.get(...)` lines, not stray references inside the
// header comment (the comment contains the catch-all path verbatim).
const idxJ2EwtCsv = routes.indexOf("router.get('/forms/1601-EQ/:year/:quarter/export.csv'");
const idxCatchAllCsv = routes.indexOf("router.get('/forms/:formCode/:year/:period/export.csv'");
expect(idxJ2EwtCsv > 0 && idxCatchAllCsv > 0 && idxJ2EwtCsv < idxCatchAllCsv,
  'J2 EWT export.csv route declared BEFORE J1 catch-all export.csv');
// J2 specific compute routes BEFORE catch-all /forms/:id
const idxJ2Compute = routes.indexOf('/forms/1601-EQ/:year/:quarter/compute');
const idxIdCatch = routes.indexOf('ctrl.getFiling');
expect(idxJ2Compute > 0 && idxIdCatch > 0 && idxJ2Compute < idxIdCatch,
  '1601-EQ compute route declared BEFORE /forms/:id catch-all');

// ── 6. Engine triggers wired in expenseController ───────────────────────
const ec = read('backend/erp/controllers/expenseController.js');
expect(ec.includes("require('../services/withholdingService')"),
  'expenseController requires withholdingService');
expect(ec.includes("require('../models/Entity')"),
  'expenseController requires Entity model');
expect(ec.includes("require('../models/VendorMaster')"),
  'expenseController requires VendorMaster model');
expect(/async\s+function\s+emitEwtForExpense\(/.test(ec),
  'emitEwtForExpense helper defined');
expect(/async\s+function\s+emitEwtForPrfRent\(/.test(ec),
  'emitEwtForPrfRent helper defined');
// All 3 expense post paths invoke the emit
const emitExpCalls = (ec.match(/emitEwtForExpense\(/g) || []).length;
expect(emitExpCalls >= 4,
  `emitEwtForExpense called from ≥4 sites (definition + submit/postSingle/cascade); found ${emitExpCalls}`);
// PrfCalf rent emit
expect(ec.includes('emitEwtForPrfRent(doc, userId)'),
  'postSinglePrfCalf invokes emitEwtForPrfRent');
// Reopen invokes deleteWithholdingEntriesForEvent
expect(ec.includes('deleteWithholdingEntriesForEvent(entry.event_id)'),
  'reopenExpenses invokes deleteWithholdingEntriesForEvent for idempotent re-post');

// ── 7. ExpenseEntry + PrfCalf + PeopleMaster + Vendor schema fields ─────
const expenseModel = read('backend/erp/models/ExpenseEntry.js');
expect(/atc_code:\s*\{\s*type:\s*String/.test(expenseModel),
  'ExpenseEntry line schema has atc_code');
expect(expenseModel.includes('withholding_payee_kind'),
  'ExpenseEntry line snapshot field withholding_payee_kind present');

const prfModel = read('backend/erp/models/PrfCalf.js');
expect(/atc_code:\s*\{\s*type:\s*String/.test(prfModel),
  'PrfCalf has atc_code field');
expect(prfModel.includes('withholding_payee_kind'),
  'PrfCalf has withholding_payee_kind snapshot field');

const peopleModel = read('backend/erp/models/PeopleMaster.js');
expect(/withhold_active:\s*\{\s*type:\s*Boolean/.test(peopleModel),
  'PeopleMaster has withhold_active flag');
expect(/default_atc_code:\s*\{\s*type:\s*String/.test(peopleModel),
  'PeopleMaster has default_atc_code field');

const vendorModel = read('backend/erp/models/VendorMaster.js');
expect(/withhold_active:\s*\{\s*type:\s*Boolean/.test(vendorModel),
  'VendorMaster has withhold_active flag');
expect(vendorModel.includes('is_landlord'),
  'VendorMaster has is_landlord flag for 1606');
expect(vendorModel.includes("'INDIVIDUAL'") && vendorModel.includes("'CORPORATION'"),
  'VendorMaster.payee_kind enum covers individual + corporate');

// ── 8. ATC catalog seeded in BIR_ATC_CODES lookup defaults ──────────────
const lookupSeeds = read('backend/erp/controllers/lookupGenericController.js');
['WI010', 'WI011', 'WC010', 'WC011', 'WI160', 'WC160', 'WI080', 'WI081'].forEach(code => {
  expect(lookupSeeds.includes(`code: '${code}'`),
    `BIR_ATC_CODES seed includes ${code}`);
});

// ── 9. Frontend birService extensions ───────────────────────────────────
const fSvc = read('frontend/src/erp/services/birService.js');
['compute1601EQ', 'compute1606', 'listEwtPayees', 'getWithholdingPosture',
 'exportEwtCsv', 'exportSawtDat', 'export2307Pdf'].forEach(m => {
  expect(fSvc.includes(`export async function ${m}`), `birService exports ${m}`);
});

// ── 10. BirEwtReturnDetailPage exists + uses birService ─────────────────
const ewtPage = read('frontend/src/erp/pages/BirEwtReturnDetailPage.jsx');
expect(ewtPage.includes("import birService from '../../erp/services/birService'"),
  'BirEwtReturnDetailPage imports birService');
expect(ewtPage.includes('birService.compute1601EQ') && ewtPage.includes('birService.compute1606'),
  'BirEwtReturnDetailPage calls compute1601EQ + compute1606');
expect(ewtPage.includes('birService.exportEwtCsv'),
  'BirEwtReturnDetailPage calls exportEwtCsv');
expect(ewtPage.includes('birService.exportSawtDat'),
  'BirEwtReturnDetailPage calls exportSawtDat (toolbar SAWT button)');
expect(ewtPage.includes('birService.export2307Pdf'),
  'BirEwtReturnDetailPage calls export2307Pdf (per-row 2307 PDF)');
// Phase J3 (May 2026) — BirEwtReturnDetailPage now serves both EWT (1601-EQ
// + 1606) AND compensation (1601-C). pageKey switches via inline ternary on
// formCode; check both branches are referenced.
expect(/'bir-ewt-return'/.test(ewtPage) && /'bir-comp-return'/.test(ewtPage),
  'BirEwtReturnDetailPage renders PageGuide with bir-ewt-return (J2) + bir-comp-return (J3) keys');

// ── 11. App.jsx wires routes ────────────────────────────────────────────
const app = read('frontend/src/App.jsx');
expect(app.includes("import('./erp/pages/BirEwtReturnDetailPage')"),
  'App.jsx lazy-imports BirEwtReturnDetailPage');
expect(app.includes('path="/erp/bir/1601-EQ/:year/:period"'),
  'App.jsx wires /erp/bir/1601-EQ/:year/:period');
expect(app.includes('path="/erp/bir/1606/:year/:period"'),
  'App.jsx wires /erp/bir/1606/:year/:period');
// Route order check: explicit J2 routes BEFORE the wildcard J1 route
const idxJ2Route = app.indexOf('path="/erp/bir/1601-EQ/:year/:period"');
const idxJ1Wildcard = app.indexOf('path="/erp/bir/:formCode/:year/:period"');
expect(idxJ2Route > 0 && idxJ1Wildcard > 0 && idxJ2Route < idxJ1Wildcard,
  'J2 explicit routes declared BEFORE J1 :formCode wildcard');

// ── 12. BIRCompliancePage heatmap drill-down extended ───────────────────
const dashPage = read('frontend/src/erp/pages/BIRCompliancePage.jsx');
expect(dashPage.includes("'2550M', '2550Q', '1601-EQ', '1606'"),
  'BIRCompliancePage drillableForms includes 1601-EQ + 1606');
expect(dashPage.includes("f.form_code === 'SAWT'"),
  'BIRCompliancePage makes SAWT row clickable (drills to 1601-EQ)');
expect(dashPage.includes('Withholding Posture'),
  'BIRCompliancePage renders the Withholding Posture card');

// ── 13. PageGuide entry ─────────────────────────────────────────────────
const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
expect(pageGuide.includes("'bir-ewt-return':"),
  'PageGuide has bir-ewt-return entry');
expect(/'bir-ewt-return':[\s\S]{0,2000}1601-EQ/.test(pageGuide),
  'bir-ewt-return PageGuide covers 1601-EQ workflow');
expect(/'bir-ewt-return':[\s\S]{0,2500}1606/.test(pageGuide),
  'bir-ewt-return PageGuide covers 1606 workflow');
expect(/'bir-ewt-return':[\s\S]{0,2500}SAWT/.test(pageGuide),
  'bir-ewt-return PageGuide covers SAWT export');
expect(/'bir-ewt-return':[\s\S]{0,2500}2307/.test(pageGuide),
  'bir-ewt-return PageGuide covers 2307 PDF generation');

// ── 14. Frontend ROLE_SETS.BIR_FILING populated (latent J1 bug fix) ─────
const feRoles = read('frontend/src/constants/roles.js');
expect(/BIR_FILING:\s*\[/.test(feRoles),
  'frontend ROLE_SETS.BIR_FILING is now defined (was missing pre-J2)');
expect(/BOOKKEEPER:\s*'bookkeeper'/.test(feRoles),
  'frontend ROLES.BOOKKEEPER constant added');

// ── 15. Backend ROLE_SETS.BIR_FILING + bookkeeper role ──────────────────
const beRoles = read('backend/constants/roles.js');
expect(/BIR_FILING:\s*\[/.test(beRoles),
  'backend ROLE_SETS.BIR_FILING is defined');
expect(beRoles.includes("BOOKKEEPER: 'bookkeeper'"),
  'backend ROLES.BOOKKEEPER constant exists');

// ── 16. Dashboard service surfaces real Withholding Posture ─────────────
const dashSvc = read('backend/erp/services/birDashboardService.js');
expect(dashSvc.includes("require('./withholdingService')"),
  'birDashboardService imports withholdingService');
expect(dashSvc.includes('withholdingService.buildPosture'),
  'birDashboardService calls withholdingService.buildPosture');
expect(dashSvc.includes("require('../models/PeopleMaster')"),
  'birDashboardService imports PeopleMaster for not-withheld count');

// ── 17. CORS exposed-headers list still serves J2 PDF/.dat exports ──────
const server = read('backend/server.js');
expect(/exposedHeaders[\s\S]{0,200}Content-Disposition/.test(server),
  'CORS still exposes Content-Disposition (J1 + J2)');
expect(/exposedHeaders[\s\S]{0,200}X-Content-Hash/.test(server),
  'CORS still exposes X-Content-Hash');

// ── 18. pdfkit dependency available (for 2307 PDF generation) ───────────
try {
  require.resolve('pdfkit');
  process.stdout.write('.');
} catch {
  errors.push('FAIL: pdfkit dependency not resolvable from backend');
}

// ── Done ────────────────────────────────────────────────────────────────
console.log('\n');
warnings.forEach(w => console.warn(w));
if (errors.length) {
  console.error('\n✗ Phase VIP-1.J / J2 wiring health check FAILED:');
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}
console.log('✓ All Phase VIP-1.J / J2 wiring checks passed');
