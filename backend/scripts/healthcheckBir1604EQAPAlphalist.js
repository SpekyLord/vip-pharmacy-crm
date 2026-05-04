#!/usr/bin/env node
/**
 * healthcheckBir1604EQAPAlphalist — Phase VIP-1.J / J4 (May 2026)
 *
 * Verifies the full wiring chain for the 1604-E Annual EWT Alphalist + QAP
 * Quarterly Alphalist of Payees (the 1601-EQ companion):
 *
 *   WithholdingLedger (OUTBOUND direction, written by J2 expense / PRF / PRF-rent paths)
 *     → withholdingReturnService.compute1604E (annual aggregator)
 *     → withholdingReturnService.computeQAP   (quarterly aggregator)
 *     → withholdingReturnService.serialize1604EDat (Alphalist Data Entry v7.x annual)
 *     → withholdingReturnService.serializeQAPDat   (Alphalist Data Entry v7.x quarterly)
 *     → withholdingReturnService.export1604EDat / exportQAPDat (audit-log appends)
 *     → birController handlers: compute1604E / export1604EDat / computeQAP / exportQAPDat
 *     → birRoutes mount order (J4 routes BEFORE J1 catch-all)
 *     → BirFilingStatus already accepts form_code='1604-E' (annualForms) + 'QAP' (quarterlyForms) — J0
 *     → frontend birService: compute1604E / export1604EDat / computeQAP / exportQAPDat
 *     → BirAlphalistEwtPage (formCodeOverride switches annual/quarterly URL + title)
 *     → App.jsx mounts /erp/bir/1604-E/:year + /erp/bir/QAP/:year/:quarter BEFORE :formCode wildcard
 *     → BIRCompliancePage heatmap makes 1604-E + QAP cells drillable
 *     → PageGuide has 'bir-1604e-alphalist' + 'bir-qap-alphalist' entries
 *     → BIR_FORMS_CATALOG already seeds 1604-E + QAP (J0)
 *
 * Also runs two inline serializer round-trips — synthesizes a 3-payee fixture
 * for each form and asserts the .dat output starts with the right header
 * tag (H1604E / HQAP), has the expected D1 lines + a T-trailer with money
 * totals, and uses CRLF strict line endings.
 *
 * Exits 1 on first failure so CI gates on it.
 *
 * Run: node backend/scripts/healthcheckBir1604EQAPAlphalist.js
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

console.log('Phase VIP-1.J / J4 (1604-E + QAP) wiring health check\n─────────────────────────────────────────────');

// ── 1. withholdingReturnService exports the J4 helpers ───────────────────
let svc;
try {
  svc = require('../erp/services/withholdingReturnService');
  expect(typeof svc.compute1604E === 'function',
    'withholdingReturnService exports compute1604E');
  expect(typeof svc.serialize1604EDat === 'function',
    'withholdingReturnService exports serialize1604EDat');
  expect(typeof svc.export1604EDat === 'function',
    'withholdingReturnService exports export1604EDat');
  expect(typeof svc.computeQAP === 'function',
    'withholdingReturnService exports computeQAP');
  expect(typeof svc.serializeQAPDat === 'function',
    'withholdingReturnService exports serializeQAPDat');
  expect(typeof svc.exportQAPDat === 'function',
    'withholdingReturnService exports exportQAPDat');
} catch (err) {
  errors.push(`withholdingReturnService load failed: ${err.message}`);
}

// ── 2. serialize1604EDat round-trip — synthetic 3-payee fixture ──────────
if (svc?.serialize1604EDat) {
  const synthMeta = {
    schedule: [
      // Big-ticket vendor (corp) under WC011
      { payee_kind: 'VendorMaster', payee_id: 'v1', atc_code: 'WC011',
        payee_name: 'Acme Distributors Inc', payee_tin: '111-222-333-00000',
        payee_address: '123 EDSA, Quezon City',
        gross: 800000, withheld: 120000, count: 4,
        first_period: '2026-01', last_period: '2026-12' },
      // Individual contractor under WI010
      { payee_kind: 'PeopleMaster', payee_id: 'p2', atc_code: 'WI010',
        payee_name: 'Maria Cruz', payee_tin: '222-333-444-00000',
        payee_address: '456 Rizal St, Manila',
        gross: 480000, withheld: 24000, count: 12,
        first_period: '2026-01', last_period: '2026-12' },
      // TWA goods vendor (WI080 — 1%)
      { payee_kind: 'VendorMaster', payee_id: 'v3', atc_code: 'WI080',
        payee_name: 'Bagong Pamilihan Supplies', payee_tin: '333-444-555-00000',
        payee_address: '',
        gross: 1500000, withheld: 15000, count: 6,
        first_period: '2026-02', last_period: '2026-11' },
    ],
  };
  const synthTotals = {
    payee_lines: 3, distinct_payees: 3,
    gross_total: 2780000, withheld_total: 159000,
  };
  const dat = svc.serialize1604EDat({
    entity: { entity_name: 'VIP Test Co', tin: '999-888-777-00000' },
    year: 2026, totals: synthTotals, meta: synthMeta,
  });
  expect(typeof dat === 'string' && dat.length > 0,
    'serialize1604EDat returns a non-empty string');
  expect(dat.startsWith('H1604E|999-888-777-00000|VIP Test Co|HEAD OFFICE|2026|1604E\r\n'),
    'serialize1604EDat header line begins with H1604E + TIN + entity name + year');
  expect(/\nD1\|000001\|111-222-333-00000\|Acme Distributors Inc\|\|/.test(dat),
    'D1 line for VendorMaster payee carries TIN + RegName (vendor name in column 4) + empty FirstName');
  expect(/\nD1\|000002\|222-333-444-00000\|\|Maria Cruz\|/.test(dat),
    'D1 line for PeopleMaster payee carries TIN + empty RegName + FirstName (individual name in column 5)');
  expect(/\|WC011\|800000\.00\|/.test(dat),
    'D1 line carries ATC code + gross with 2-decimal money formatting');
  expect(/\nT1604E\|000003\|2780000\.00\|159000\.00\r\n$/.test(dat),
    'T1604E trailer carries record count + total gross + total withheld');
  expect(dat.split('\r\n').length === 6,
    '1604-E output has 5 content lines + trailing newline (header + 3 D + trailer)');
  expect(!/[^\r]\n/.test(dat),
    '1604-E line endings use \\r\\n exclusively (Alphalist Data Entry strict format)');
}

// ── 3. serializeQAPDat round-trip — synthetic 2-payee fixture ────────────
if (svc?.serializeQAPDat) {
  const synthMeta = {
    schedule: [
      { payee_kind: 'Hospital', payee_id: 'h1', atc_code: 'WC010',
        payee_name: 'Iloilo Mission Hospital', payee_tin: '444-555-666-00000',
        payee_address: '',
        gross: 250000, withheld: 25000, count: 3,
        first_period: '2026-01', last_period: '2026-03' },
      { payee_kind: 'Doctor', payee_id: 'd1', atc_code: 'WI010',
        payee_name: 'Juan Dela Cruz MD', payee_tin: '555-666-777-00000',
        payee_address: '',
        gross: 60000, withheld: 3000, count: 1,
        first_period: '2026-02', last_period: '2026-02' },
    ],
  };
  const synthTotals = {
    payee_lines: 2, distinct_payees: 2,
    gross_total: 310000, withheld_total: 28000,
  };
  const dat = svc.serializeQAPDat({
    entity: { entity_name: 'VIP Test Co', tin: '999-888-777-00000' },
    year: 2026, quarter: 1, totals: synthTotals, meta: synthMeta,
  });
  expect(typeof dat === 'string' && dat.length > 0,
    'serializeQAPDat returns a non-empty string');
  expect(dat.startsWith('HQAP|999-888-777-00000|VIP Test Co|HEAD OFFICE|2026Q1|QAP|2026|1\r\n'),
    'serializeQAPDat header line begins with HQAP + TIN + entity name + year-quarter encoding');
  expect(/\nD1\|000001\|444-555-666-00000\|Iloilo Mission Hospital\|\|/.test(dat),
    'D1 line for Hospital payee carries vendor-style RegName placement (column 4)');
  expect(/\nD1\|000002\|555-666-777-00000\|\|Juan Dela Cruz MD\|/.test(dat),
    'D1 line for Doctor payee carries individual-style FirstName placement (column 5)');
  expect(/\nTQAP\|000002\|310000\.00\|28000\.00\r\n$/.test(dat),
    'TQAP trailer carries record count + total gross + total withheld');
  expect(!/[^\r]\n/.test(dat),
    'QAP line endings use \\r\\n exclusively');
}

// ── 4. compute1604E shape — direction default + ATC subset + finance_tag ─
const wrSource = read('backend/erp/services/withholdingReturnService.js');
expect(/compute1604E\s*\(\{\s*entityId,\s*year/.test(wrSource),
  'compute1604E accepts { entityId, year } shape');
expect(/J4_OUTBOUND_ATCS\s*=\s*\[\s*['"]WI010['"],\s*['"]WI011['"],\s*['"]WC010['"],\s*['"]WC011['"],\s*['"]WI080['"],\s*['"]WI081['"]\s*\]/.test(wrSource),
  'J4_OUTBOUND_ATCS catalog covers the 6 1601-EQ EWT codes (rent excluded)');
expect(/listPayees\([^)]+,\s*periods,\s*J4_OUTBOUND_ATCS\)/.test(wrSource),
  'compute1604E + computeQAP read listPayees with J4_OUTBOUND_ATCS — direction defaults to OUTBOUND, finance_tag to INCLUDE');
expect(/12\s*monthly\s*periods/i.test(wrSource) && /for \(let m = 1; m <= 12; m\+\+\)/.test(wrSource),
  'compute1604E builds 12 monthly periods (full year)');
expect(/computeQAP\s*\(\{\s*entityId,\s*year,\s*quarter/.test(wrSource),
  'computeQAP accepts { entityId, year, quarter } shape');
expect(/quarterPeriods\(year,\s*quarter\)/.test(wrSource),
  'computeQAP reuses quarterPeriods helper');
expect(/distinctPayees = new Set\(schedule\.map\(r => `\$\{r\.payee_kind\}:\$\{r\.payee_id\}\`\)\)\.size/.test(wrSource),
  'distinct_payees counts each (payee_kind, payee_id) pair once across multi-ATC roll-up');
expect(/form_code:\s*['"]1604-E['"]/.test(wrSource) && /form_code:\s*['"]QAP['"]/.test(wrSource),
  'compute1604E meta.form_code === "1604-E"; computeQAP meta.form_code === "QAP"');

// ── 5. exporters wire BirFilingStatus + audit log ────────────────────────
expect(/export1604EDat[\s\S]*?form_code:\s*['"]1604-E['"][\s\S]*?period_year:\s*year[\s\S]*?period_month:\s*null[\s\S]*?period_quarter:\s*null/.test(wrSource),
  'export1604EDat upserts BirFilingStatus row with form_code=1604-E + null period_month + null period_quarter (annual)');
expect(/exportQAPDat[\s\S]*?form_code:\s*['"]QAP['"][\s\S]*?period_year:\s*year[\s\S]*?period_quarter:\s*quarter[\s\S]*?period_month:\s*null/.test(wrSource),
  'exportQAPDat upserts BirFilingStatus row with form_code=QAP + period_quarter set + period_month null');
expect(/artifact_kind:\s*['"]DAT['"][\s\S]*?content_hash:\s*contentHash[\s\S]*?byte_length:\s*Buffer\.byteLength\(datContent/.test(wrSource),
  'J4 exporters append SHA-256 hash + byte length to export_audit_log');
expect(/filename = `1604E_\$\{year\}\.dat`/.test(wrSource),
  'export1604EDat filename = `1604E_${year}.dat`');
expect(/filename = `QAP_\$\{year\}_Q\$\{quarter\}\.dat`/.test(wrSource),
  'exportQAPDat filename = `QAP_${year}_Q${quarter}.dat`');

// ── 6. Module exports list mentions J4 functions ─────────────────────────
expect(/compute1604E,\s*\n\s*serialize1604EDat,\s*\n\s*export1604EDat,\s*\n\s*computeQAP,\s*\n\s*serializeQAPDat,\s*\n\s*exportQAPDat/.test(wrSource),
  'module.exports lists all 6 J4 functions');

// ── 7. birController J4 handlers ─────────────────────────────────────────
const ctrlSource = read('backend/erp/controllers/birController.js');
expect(/exports\.compute1604E\s*=/.test(ctrlSource),
  'birController exports compute1604E');
expect(/exports\.export1604EDat\s*=/.test(ctrlSource),
  'birController exports export1604EDat');
expect(/exports\.computeQAP\s*=/.test(ctrlSource),
  'birController exports computeQAP');
expect(/exports\.exportQAPDat\s*=/.test(ctrlSource),
  'birController exports exportQAPDat');
expect(/withholdingReturnService\.compute1604E\(\{\s*entityId/.test(ctrlSource),
  'compute1604E handler delegates to service');
expect(/withholdingReturnService\.export1604EDat/.test(ctrlSource),
  'export1604EDat handler delegates to service');
expect(/withholdingReturnService\.computeQAP\(\{\s*entityId/.test(ctrlSource),
  'computeQAP handler delegates to service');
expect(/withholdingReturnService\.exportQAPDat/.test(ctrlSource),
  'exportQAPDat handler delegates to service');

const compute1604EBlock = ctrlSource.slice(ctrlSource.indexOf('exports.compute1604E'), ctrlSource.indexOf('exports.export1604EDat'));
expect(/ensureRole\(req,\s*res,\s*['"]VIEW_DASHBOARD['"]\)/.test(compute1604EBlock),
  'compute1604E gated by VIEW_DASHBOARD');
const export1604EBlock = ctrlSource.slice(ctrlSource.indexOf('exports.export1604EDat'), ctrlSource.indexOf('exports.computeQAP'));
expect(/ensureRole\(req,\s*res,\s*['"]EXPORT_FORM['"]\)/.test(export1604EBlock),
  'export1604EDat gated by EXPORT_FORM');
const computeQAPBlock = ctrlSource.slice(ctrlSource.indexOf('exports.computeQAP'), ctrlSource.indexOf('exports.exportQAPDat'));
expect(/ensureRole\(req,\s*res,\s*['"]VIEW_DASHBOARD['"]\)/.test(computeQAPBlock),
  'computeQAP gated by VIEW_DASHBOARD');
const exportQAPBlock = ctrlSource.slice(ctrlSource.indexOf('exports.exportQAPDat'), ctrlSource.indexOf('exports.exportQAPDat') + 4000);
expect(/ensureRole\(req,\s*res,\s*['"]EXPORT_FORM['"]\)/.test(exportQAPBlock),
  'exportQAPDat gated by EXPORT_FORM');

expect(/\[BIR_EXPORT_1604E_DAT\]/.test(ctrlSource),
  'export1604EDat logs ops audit line');
expect(/\[BIR_EXPORT_QAP_DAT\]/.test(ctrlSource),
  'exportQAPDat logs ops audit line');

// Year+quarter parsing on QAP handlers
expect(/parseYear\(req\.params\.year\)[\s\S]*?parseQuarter\(req\.params\.quarter\)/.test(computeQAPBlock),
  'computeQAP parses year + quarter');
expect(/parseYear\(req\.params\.year\)[\s\S]*?parseQuarter\(req\.params\.quarter\)/.test(exportQAPBlock),
  'exportQAPDat parses year + quarter');

// ── 8. birRoutes mount order — J4 routes BEFORE J1 catch-all ─────────────
const routesSource = read('backend/erp/routes/birRoutes.js');
expect(/router\.get\(['"]\/forms\/1604-E\/:year\/compute['"]/.test(routesSource),
  'birRoutes mounts GET /forms/1604-E/:year/compute');
expect(/router\.get\(['"]\/forms\/1604-E\/:year\/export\.dat['"]/.test(routesSource),
  'birRoutes mounts GET /forms/1604-E/:year/export.dat');
expect(/router\.get\(['"]\/forms\/QAP\/:year\/:quarter\/compute['"]/.test(routesSource),
  'birRoutes mounts GET /forms/QAP/:year/:quarter/compute');
expect(/router\.get\(['"]\/forms\/QAP\/:year\/:quarter\/export\.dat['"]/.test(routesSource),
  'birRoutes mounts GET /forms/QAP/:year/:quarter/export.dat');

const j41604EIdx = routesSource.indexOf("router.get('/forms/1604-E/:year/compute'");
const j4QAPIdx = routesSource.indexOf("router.get('/forms/QAP/:year/:quarter/compute'");
const j1CatchIdx = routesSource.indexOf("router.get('/forms/:formCode/:year/:period/export.csv'");
expect(j41604EIdx > 0 && j1CatchIdx > 0 && j41604EIdx < j1CatchIdx,
  'J4 1604-E routes are declared BEFORE the J1 :formCode catch-all');
expect(j4QAPIdx > 0 && j1CatchIdx > 0 && j4QAPIdx < j1CatchIdx,
  'J4 QAP routes are declared BEFORE the J1 :formCode catch-all');

// ── 9. BirFilingStatus model already supports 1604-E + QAP (J0) ──────────
const filingStatusModel = read('backend/erp/models/BirFilingStatus.js');
expect(/['"]1604-E['"]/.test(filingStatusModel),
  'BirFilingStatus FORM_CODES enum includes "1604-E" (J0 already pre-wired this)');
expect(/['"]QAP['"]/.test(filingStatusModel),
  'BirFilingStatus FORM_CODES enum includes "QAP" (J0 already pre-wired this)');
expect(/annualForms = \[[^\]]*['"]1604-E['"]/.test(filingStatusModel),
  'BirFilingStatus pre-validate treats 1604-E as annual (period_year only)');
expect(/quarterlyForms = \[[^\]]*['"]QAP['"]/.test(filingStatusModel),
  'BirFilingStatus pre-validate treats QAP as quarterly (period_year + period_quarter)');

// ── 10. Frontend birService J4 wrappers ──────────────────────────────────
const fbirService = read('frontend/src/erp/services/birService.js');
expect(/export async function compute1604E\s*\(year\)/.test(fbirService),
  'frontend birService exports compute1604E(year)');
expect(/export async function export1604EDat\s*\(year\)/.test(fbirService),
  'frontend birService exports export1604EDat(year)');
expect(/export async function computeQAP\s*\(year,\s*quarter\)/.test(fbirService),
  'frontend birService exports computeQAP(year, quarter)');
expect(/export async function exportQAPDat\s*\(year,\s*quarter\)/.test(fbirService),
  'frontend birService exports exportQAPDat(year, quarter)');
expect(/`\$\{BASE\}\/forms\/1604-E\/\$\{year\}\/compute`/.test(fbirService),
  'compute1604E hits /forms/1604-E/:year/compute');
expect(/`\$\{BASE\}\/forms\/1604-E\/\$\{year\}\/export\.dat`/.test(fbirService),
  'export1604EDat hits /forms/1604-E/:year/export.dat');
expect(/`\$\{BASE\}\/forms\/QAP\/\$\{year\}\/\$\{quarter\}\/compute`/.test(fbirService),
  'computeQAP hits /forms/QAP/:year/:quarter/compute');
expect(/`\$\{BASE\}\/forms\/QAP\/\$\{year\}\/\$\{quarter\}\/export\.dat`/.test(fbirService),
  'exportQAPDat hits /forms/QAP/:year/:quarter/export.dat');
expect(/compute1604E,\s*\n\s*export1604EDat,\s*\n\s*computeQAP,\s*\n\s*exportQAPDat/.test(fbirService),
  'birService default export includes all 4 J4 functions');

// ── 11. BirAlphalistEwtPage component handles both forms ─────────────────
const detailPage = read('frontend/src/erp/pages/BirAlphalistEwtPage.jsx');
expect(/export default function BirAlphalistEwtPage\(\{\s*formCodeOverride/.test(detailPage),
  'BirAlphalistEwtPage accepts formCodeOverride prop');
expect(/birService\.compute1604E\(year\)/.test(detailPage),
  'BirAlphalistEwtPage calls birService.compute1604E for annual variant');
expect(/birService\.export1604EDat\(year\)/.test(detailPage),
  'BirAlphalistEwtPage calls birService.export1604EDat from toolbar');
expect(/birService\.computeQAP\(year,\s*quarter\)/.test(detailPage),
  'BirAlphalistEwtPage calls birService.computeQAP for quarterly variant');
expect(/birService\.exportQAPDat\(year,\s*quarter\)/.test(detailPage),
  'BirAlphalistEwtPage calls birService.exportQAPDat from toolbar');
expect(/PageGuide pageKey=\{guideKey\}/.test(detailPage),
  'BirAlphalistEwtPage renders PageGuide with dynamic guideKey (1604-E vs QAP)');
expect(/Mark Reviewed[\s\S]*Mark Filed[\s\S]*Mark Confirmed/.test(detailPage),
  'BirAlphalistEwtPage renders Reviewed → Filed → Confirmed lifecycle buttons');
expect(/ATC_ORDER\s*=\s*\[\s*['"]WI010['"],\s*['"]WI011['"],\s*['"]WC010['"],\s*['"]WC011['"],\s*['"]WI080['"],\s*['"]WI081['"]\s*\]/.test(detailPage),
  'BirAlphalistEwtPage iterates the 6 EWT ATCs for the per-ATC breakdown card');
expect(/payee × ATC schedule/i.test(detailPage),
  'BirAlphalistEwtPage renders the per-(payee × ATC) schedule heading');

// ── 12. App.jsx mounts J4 routes BEFORE wildcard ─────────────────────────
const appJsx = read('frontend/src/App.jsx');
expect(/BirAlphalistEwtPage = lazyRetry/.test(appJsx),
  'App.jsx lazy-imports BirAlphalistEwtPage');
expect(/path="\/erp\/bir\/1604-E\/:year"/.test(appJsx),
  'App.jsx declares /erp/bir/1604-E/:year route');
expect(/path="\/erp\/bir\/QAP\/:year\/:quarter"/.test(appJsx),
  'App.jsx declares /erp/bir/QAP/:year/:quarter route');
expect(/<BirAlphalistEwtPage formCodeOverride="1604-E"/.test(appJsx),
  'App.jsx 1604-E route renders BirAlphalistEwtPage with formCodeOverride="1604-E"');
expect(/<BirAlphalistEwtPage formCodeOverride="QAP"/.test(appJsx),
  'App.jsx QAP route renders BirAlphalistEwtPage with formCodeOverride="QAP"');
const j41604ERouteIdx = appJsx.indexOf('path="/erp/bir/1604-E/:year"');
const j4QAPRouteIdx = appJsx.indexOf('path="/erp/bir/QAP/:year/:quarter"');
const j1WildcardIdx = appJsx.indexOf('path="/erp/bir/:formCode/:year/:period"');
expect(j41604ERouteIdx > 0 && j1WildcardIdx > 0 && j41604ERouteIdx < j1WildcardIdx,
  'App.jsx 1604-E route is declared BEFORE the /:formCode wildcard fallback');
expect(j4QAPRouteIdx > 0 && j1WildcardIdx > 0 && j4QAPRouteIdx < j1WildcardIdx,
  'App.jsx QAP route is declared BEFORE the /:formCode wildcard fallback');

// ── 13. PageGuide bir-1604e-alphalist + bir-qap-alphalist entries ────────
const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
expect(/'bir-1604e-alphalist':\s*\{/.test(pageGuide),
  'PageGuide registers bir-1604e-alphalist key');
expect(/'bir-qap-alphalist':\s*\{/.test(pageGuide),
  'PageGuide registers bir-qap-alphalist key');
expect(/title:\s*['"]BIR 1604-E/.test(pageGuide),
  'bir-1604e-alphalist title mentions BIR 1604-E');
expect(/title:\s*['"]BIR QAP/.test(pageGuide),
  'bir-qap-alphalist title mentions BIR QAP');
const j4GuideSlice = pageGuide.slice(pageGuide.indexOf("'bir-1604e-alphalist'"), pageGuide.indexOf("'bir-vat-return'"));
expect(/snapshot/i.test(j4GuideSlice),
  'J4 banners mention snapshot pattern (BIR audit posture)');
expect(/INCLUDE/.test(j4GuideSlice),
  'J4 banners explain finance_tag INCLUDE strict gate');
expect(/Alphalist Data Entry/.test(j4GuideSlice),
  'J4 banners reference BIR Alphalist Data Entry tooling');

// ── 14. BIRCompliancePage heatmap drill-down for 1604-E + QAP ────────────
const dashPage = read('frontend/src/erp/pages/BIRCompliancePage.jsx');
expect(/annualForms = \[[^\]]*['"]1604-E['"]/.test(dashPage),
  'BIRCompliancePage heatmap declares annualForms with "1604-E"');
expect(/monthlyOrQuarterlyForms = \[[^\]]*['"]QAP['"]/.test(dashPage),
  'BIRCompliancePage heatmap declares monthlyOrQuarterlyForms with "QAP"');

// ── 15. BIR_FORMS_CATALOG already seeds 1604-E + QAP (J0) ────────────────
const lookupCtrl = read('backend/erp/controllers/lookupGenericController.js');
expect(/code:\s*['"]1604-E['"][\s\S]*?frequency:\s*['"]ANNUAL['"]/.test(lookupCtrl),
  'BIR_FORMS_CATALOG already seeds 1604-E as ANNUAL (J0)');
expect(/code:\s*['"]QAP['"][\s\S]*?frequency:\s*['"]QUARTERLY['"]/.test(lookupCtrl),
  'BIR_FORMS_CATALOG already seeds QAP as QUARTERLY (J0)');

// ── 16. Sibling regression sentinels — J3 Part B + J2 still wired ────────
const partBHealthcheck = read('backend/scripts/healthcheckBir1604CFAlphalist.js');
expect(/healthcheckBir1604CFAlphalist/.test(partBHealthcheck),
  'J3 Part B healthcheck still present (regression sentinel)');
const j2Healthcheck = read('backend/scripts/healthcheckBirEwtWiring.js');
warn(j2Healthcheck.length > 0,
  'J2 EWT healthcheck present at backend/scripts/healthcheckBirEwtWiring.js');

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
console.log('✓ Phase VIP-1.J / J4 (1604-E + QAP) wiring is healthy.');
console.log('  Coverage: service/controller/routes/model/frontend service/page/route/');
console.log('            heatmap drill-down/PageGuide/lookup catalog/dual serializer round-trip.');
console.log('  Next: J5 — Books of Accounts loose-leaf PDFs.');
