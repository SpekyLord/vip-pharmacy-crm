#!/usr/bin/env node
/**
 * healthcheckBirVatReturnWiring — Phase VIP-1.J / J1 (Apr 2026)
 *
 * Verifies the full wiring chain for the 2550M / 2550Q VAT return
 * compute + CSV export pages on top of the J0 dashboard:
 *   service → controller → routes → frontend service → page → App.jsx
 *   route → BIRCompliancePage cell-click navigation → PageGuide entry →
 *   CORS exposed-headers list.
 *
 * Exits 1 on first failure so it doubles as a CI gate.
 *
 * Run: node backend/scripts/healthcheckBirVatReturnWiring.js
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

console.log('Phase VIP-1.J / J1 wiring health check\n─────────────────────────────────────────────');

// ── 1. vatReturnService loads and exports expected API ──────────────────
let svc;
try {
  svc = require('../erp/services/vatReturnService');
  expect(typeof svc.compute2550M === 'function', 'vatReturnService.compute2550M exported');
  expect(typeof svc.compute2550Q === 'function', 'vatReturnService.compute2550Q exported');
  expect(typeof svc.exportFormCsv === 'function', 'vatReturnService.exportFormCsv exported');
  expect(typeof svc.getBoxLayout === 'function', 'vatReturnService.getBoxLayout exported');
  expect(svc.getBoxLayout('2550M').length === 10, '2550M layout has 10 BIR boxes');
  expect(svc.getBoxLayout('2550Q').length === 10, '2550Q layout has 10 BIR boxes');
  // Layout enforces section grouping (SALES / OUTPUT / INPUT / PAYABLE)
  const sections = new Set(svc.getBoxLayout('2550M').map(b => b.section));
  expect(['SALES', 'OUTPUT', 'INPUT', 'PAYABLE'].every(s => sections.has(s)),
    '2550M layout covers SALES, OUTPUT, INPUT, PAYABLE sections');
  // Reject unsupported form codes
  let rejected = false;
  try { svc.getBoxLayout('1601-EQ'); } catch { rejected = true; }
  expect(rejected, 'getBoxLayout rejects unsupported form codes');
} catch (err) {
  errors.push(`vatReturnService load failed: ${err.message}`);
}

// ── 2. birController exports new endpoints ──────────────────────────────
const ctrl = read('backend/erp/controllers/birController.js');
['compute2550M', 'compute2550Q', 'exportVatReturnCsv'].forEach(m => {
  expect(new RegExp(`exports\\.${m}\\s*=`).test(ctrl), `birController exports ${m}`);
});
expect(ctrl.includes("require('../services/vatReturnService')"), 'birController requires vatReturnService');
// EXPORT_FORM gate is on the CSV path
expect(/exportVatReturnCsv[\s\S]{0,400}EXPORT_FORM/.test(ctrl),
  'exportVatReturnCsv enforces EXPORT_FORM scope');
// VIEW_DASHBOARD gates the compute paths
expect(/compute2550M[\s\S]{0,400}VIEW_DASHBOARD/.test(ctrl),
  'compute2550M enforces VIEW_DASHBOARD scope');

// ── 3. Routes mounted in birRoutes ──────────────────────────────────────
const routes = read('backend/erp/routes/birRoutes.js');
expect(routes.includes("/forms/2550M/:year/:month/compute"), 'birRoutes wires 2550M compute');
expect(routes.includes("/forms/2550Q/:year/:quarter/compute"), 'birRoutes wires 2550Q compute');
expect(routes.includes("/forms/:formCode/:year/:period/export.csv"), 'birRoutes wires export.csv');
// CRITICAL: specific routes MUST be declared BEFORE the catch-all /forms/:id
const idxCompute = routes.indexOf("compute2550M");
const idxCatchAll = routes.indexOf("ctrl.getFiling");
expect(idxCompute > 0 && idxCatchAll > 0 && idxCompute < idxCatchAll,
  '2550M/Q routes declared BEFORE /forms/:id catch-all');

// ── 4. CORS exposes Content-Disposition + X-Content-Hash ─────────────────
const server = read('backend/server.js');
expect(/exposedHeaders[\s\S]{0,200}Content-Disposition/.test(server),
  'CORS exposes Content-Disposition');
expect(/exposedHeaders[\s\S]{0,200}X-Content-Hash/.test(server),
  'CORS exposes X-Content-Hash');

// ── 5. Frontend service has compute + export functions ─────────────────
const fSvc = read('frontend/src/erp/services/birService.js');
['compute2550M', 'compute2550Q', 'exportVatReturnCsv'].forEach(m => {
  expect(fSvc.includes(`export async function ${m}`), `birService exports ${m}`);
});
// Default export bundle includes them
expect(/export default[\s\S]+compute2550M[\s\S]+compute2550Q[\s\S]+exportVatReturnCsv/.test(fSvc),
  'birService default export includes J1 functions');

// ── 6. Frontend page exists and uses PageGuide ───────────────────────────
const pageJsx = read('frontend/src/erp/pages/BirVatReturnDetailPage.jsx');
expect(pageJsx.includes('export default function BirVatReturnDetailPage'),
  'BirVatReturnDetailPage default-exports the component');
expect(pageJsx.includes("pageKey=\"bir-vat-return\""),
  'BirVatReturnDetailPage renders PageGuide with bir-vat-return key');
expect(pageJsx.includes('birService.compute2550M') && pageJsx.includes('birService.compute2550Q'),
  'BirVatReturnDetailPage calls compute2550M + compute2550Q via service');
expect(pageJsx.includes('birService.exportVatReturnCsv'),
  'BirVatReturnDetailPage calls exportVatReturnCsv via service');

// ── 7. App.jsx route + lazy import ──────────────────────────────────────
const appJsx = read('frontend/src/App.jsx');
expect(appJsx.includes("BirVatReturnDetailPage = lazyRetry"),
  'App.jsx lazy-imports BirVatReturnDetailPage');
expect(appJsx.includes('"/erp/bir/:formCode/:year/:period"'),
  'App.jsx wires /erp/bir/:formCode/:year/:period route');
expect(/path="\/erp\/bir\/:formCode[\s\S]{0,400}ROLE_SETS\.BIR_FILING/.test(appJsx),
  'BirVatReturnDetailPage route guard is BIR_FILING role-set');

// ── 8. BIRCompliancePage heatmap cells navigate to detail page ──────────
const dashJsx = read('frontend/src/erp/pages/BIRCompliancePage.jsx');
expect(dashJsx.includes("import { useNavigate }") || dashJsx.includes("useNavigate }"),
  'BIRCompliancePage imports useNavigate for cell-click drill-down');
expect(dashJsx.includes("'2550M'") && dashJsx.includes("'2550Q'") && dashJsx.includes('isClickable'),
  'BIRCompliancePage gates cell-click to 2550M/Q only (other forms wait on J2+)');

// ── 9. PageGuide entry exists ────────────────────────────────────────────
const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
expect(pageGuide.includes("'bir-vat-return':"),
  "PageGuide registers 'bir-vat-return' entry");

// ── 10. BIR_FORMS_CATALOG describes 2550M and 2550Q with frequency  ──────
const lookupCtrl = read('backend/erp/controllers/lookupGenericController.js');
expect(/2550M[\s\S]{0,200}frequency:\s*'MONTHLY'/.test(lookupCtrl),
  '2550M registered as MONTHLY in BIR_FORMS_CATALOG');
expect(/2550Q[\s\S]{0,200}frequency:\s*'QUARTERLY'/.test(lookupCtrl),
  '2550Q registered as QUARTERLY in BIR_FORMS_CATALOG');

// ── 11. PeriodLock model accepts BIR_FILING module (J0 prereq) ──────────
const periodLockModel = read('backend/erp/models/PeriodLock.js');
expect(/'BIR_FILING'/.test(periodLockModel), "PeriodLock module enum includes 'BIR_FILING'");

// ── 12. BirFilingStatus has export_audit_log support ────────────────────
const filingModel = read('backend/erp/models/BirFilingStatus.js');
expect(filingModel.includes('export_audit_log'), 'BirFilingStatus has export_audit_log array');
expect(filingModel.includes('content_hash'), 'BirFilingStatus.export_audit_log includes content_hash');

console.log('\n─────────────────────────────────────────────');

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warnings:`);
  warnings.forEach(w => console.log('  ' + w));
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} FAILURES:`);
  errors.forEach(e => console.log('  ' + e));
  process.exit(1);
}

console.log('\n✓ All Phase VIP-1.J / J1 wiring checks passed');
process.exit(0);
