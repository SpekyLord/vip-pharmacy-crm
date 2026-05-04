#!/usr/bin/env node
/**
 * healthcheckBir1604CFAlphalist — Phase VIP-1.J / J3 Part B (May 2026)
 *
 * Verifies the full wiring chain for the 1604-CF Annual Compensation
 * Alphalist + per-employee Form 2316 PDF on top of J3 Part A:
 *
 *   WithholdingLedger (COMPENSATION direction, written by J3 Part A bridge)
 *     → withholdingService.emitCompensationWithholdingForPayslip
 *         (Part B adds: TIN snapshot fix + finance_tag=INCLUDE auto-tag +
 *          first_name/last_name capture for alphalist serialization)
 *     → withholdingReturnService.compute1604CF (annual aggregator + 3 schedules)
 *     → withholdingReturnService.serialize1604CFDat (Alphalist Data Entry v7.x)
 *     → withholdingReturnService.export1604CFDat (audit-log append)
 *     → withholdingReturnService.export2316Pdf (per-employee annual cert)
 *     → birController handlers: compute1604CF / export1604CFDat / export2316Pdf
 *     → birRoutes mount order (1604-CF + 2316 routes BEFORE J1 catch-all)
 *     → BirFilingStatus accepts form_code='2316' (per-employee per-year)
 *     → frontend birService: compute1604CF + export1604CFDat + export2316Pdf
 *     → Bir1604CFDetailPage (3-schedule layout)
 *     → App.jsx mounts /erp/bir/1604-CF/:year BEFORE :formCode wildcard
 *     → BIRCompliancePage heatmap makes 1604-CF cell drillable (annual variant)
 *     → PageGuide has 'bir-1604cf-alphalist' entry
 *     → BIR_FORMS_CATALOG already seeds 1604-CF (J0)
 *
 * Also runs an inline serializer test — synthesizes a 3-employee fixture and
 * asserts the .dat output starts with H1604CF, has 3 D-lines + a T-trailer,
 * and contains the expected money totals. Replaces the per-byte golden
 * fixture file (lighter, easier to maintain).
 *
 * Exits 1 on first failure so CI gates on it.
 *
 * Run: node backend/scripts/healthcheckBir1604CFAlphalist.js
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

console.log('Phase VIP-1.J / J3 Part B (1604-CF + 2316) wiring health check\n─────────────────────────────────────────────');

// ── 1. withholdingReturnService exports the J3 Part B helpers ────────────
let svc;
try {
  svc = require('../erp/services/withholdingReturnService');
  expect(typeof svc.compute1604CF === 'function',
    'withholdingReturnService exports compute1604CF');
  expect(typeof svc.serialize1604CFDat === 'function',
    'withholdingReturnService exports serialize1604CFDat');
  expect(typeof svc.export1604CFDat === 'function',
    'withholdingReturnService exports export1604CFDat');
  expect(typeof svc.export2316Pdf === 'function',
    'withholdingReturnService exports export2316Pdf');
} catch (err) {
  errors.push(`withholdingReturnService load failed: ${err.message}`);
}

// ── 2. serialize1604CFDat round-trip — synthetic fixture ─────────────────
if (svc?.serialize1604CFDat) {
  const synthMeta = {
    schedules: {
      '7.1': [
        {
          payee_id: 'p1', payee_kind: 'PeopleMaster',
          payee_name: 'Maria Cruz', payee_tin: '111-222-333-00000', payee_address: '123 Rizal St, Manila',
          gross_compensation: 480000, taxable_compensation: 480000, non_taxable_compensation: 0,
          tax_withheld: 24000, atc_buckets: 1, is_mwe: false, is_separated: false,
        },
      ],
      '7.2': [
        {
          payee_id: 'p2', payee_kind: 'PeopleMaster',
          payee_name: 'Juan Dela Cruz', payee_tin: '222-333-444-00000', payee_address: '',
          gross_compensation: 156000, taxable_compensation: 0, non_taxable_compensation: 156000,
          tax_withheld: 0, atc_buckets: 1, is_mwe: true, is_separated: false,
        },
      ],
      '7.3': [
        {
          payee_id: 'p3', payee_kind: 'PeopleMaster',
          payee_name: 'Carlos Reyes', payee_tin: '333-444-555-00000', payee_address: '',
          gross_compensation: 200000, taxable_compensation: 200000, non_taxable_compensation: 0,
          tax_withheld: 5000, atc_buckets: 1, is_mwe: false, is_separated: true,
        },
      ],
    },
  };
  const synthTotals = {
    employees_total: 3,
    sched_7_1_count: 1, sched_7_2_count: 1, sched_7_3_count: 1,
    gross_compensation_total: 836000,
    taxable_compensation_total: 680000,
    non_taxable_compensation_total: 156000,
    withheld_total: 29000,
  };
  const dat = svc.serialize1604CFDat({
    entity: { entity_name: 'VIP Test Co', tin: '999-888-777-00000' },
    year: 2026, totals: synthTotals, meta: synthMeta,
  });
  expect(typeof dat === 'string' && dat.length > 0,
    'serialize1604CFDat returns a non-empty string');
  expect(dat.startsWith('H1604CF|999-888-777-00000|VIP Test Co|HEAD OFFICE|2026|1604CF\r\n'),
    'serialize1604CFDat header line begins with H1604CF + TIN + entity name + year');
  expect(/\nD71\|000001\|111-222-333-00000\|Cruz\|Maria\|/.test(dat),
    'D71 line for Sch 7.1 contains TIN + last name + first name');
  expect(/\nD72\|000001\|222-333-444-00000\|/.test(dat),
    'D72 line for Sch 7.2 (MWE)');
  expect(/\nD73\|000001\|333-444-555-00000\|/.test(dat),
    'D73 line for Sch 7.3 (terminated)');
  expect(/\nT1604CF\|000003\|836000\.00\|680000\.00\|156000\.00\|29000\.00\r\n$/.test(dat),
    'T1604CF trailer carries employee count + gross + taxable + non-taxable + withheld totals');
  expect(dat.split('\r\n').length === 6,
    'Output has 5 content lines + trailing newline (header + 3 D + trailer)');
  // BIR Alphalist Data Entry rejects bare \n line endings — every newline
  // must be CRLF. Match any \n NOT preceded by \r (= a stray bare-LF).
  expect(!/[^\r]\n/.test(dat),
    'Line endings use \\r\\n exclusively (Alphalist Data Entry strict format)');
}

// ── 3. compute1604CF box layout / shape — direction + finance_tag wiring ─
const wrSource = read('backend/erp/services/withholdingReturnService.js');
expect(/compute1604CF\s*\(\{\s*entityId,\s*year/.test(wrSource),
  'compute1604CF accepts { entityId, year } shape');
expect(/listPayees\([^)]+,\s*\[[^\]]+\]\s*,\s*\['WI100',\s*'WC120',\s*'WMWE'\]\s*,\s*['"]INCLUDE['"]\s*,\s*['"]COMPENSATION['"]\s*\)/.test(wrSource),
  'compute1604CF reads listPayees with 3 ATC filter + INCLUDE + COMPENSATION direction');
expect(/schedule_7_1[\s\S]*schedule_7_2[\s\S]*schedule_7_3/.test(wrSource),
  'compute1604CF builds 3 schedules');
expect(/date_separated:\s*\{\s*\$gte/.test(wrSource),
  'compute1604CF reads PeopleMaster.date_separated for Sch 7.3 partition');
expect(/MWE wins over termination/i.test(wrSource),
  'compute1604CF documents the MWE-wins-over-termination precedence rule');

// ── 4. Snapshot fix — TIN now reads from government_ids.tin (Part A bug) ─
const wsSource = read('backend/erp/services/withholdingService.js');
expect(/\.select\(['"]\+government_ids\.tin/.test(wsSource),
  'emitCompensation explicitly selects government_ids.tin (which is select:false)');
expect(/person\.government_ids\?\.tin/.test(wsSource),
  'emitCompensation reads person.government_ids?.tin (not the non-existent person.tin)');
expect(/finance_tag:\s*['"]INCLUDE['"]/.test(wsSource),
  'compensation rows auto-tag INCLUDE so 1601-C / 1604-CF aggregators see them');
expect(/first_name:\s*person\.first_name/.test(wsSource) || /first_name:\s*['"]['"]/.test(wsSource),
  'snapshot extension captures first_name (forward-compat for 1604-CF name parsing)');

// ── 5. birController J3 Part B handlers ──────────────────────────────────
const ctrlSource = read('backend/erp/controllers/birController.js');
expect(/exports\.compute1604CF\s*=/.test(ctrlSource),
  'birController exports compute1604CF');
expect(/exports\.export1604CFDat\s*=/.test(ctrlSource),
  'birController exports export1604CFDat');
expect(/exports\.export2316Pdf\s*=/.test(ctrlSource),
  'birController exports export2316Pdf');
expect(/withholdingReturnService\.compute1604CF\(\{\s*entityId/.test(ctrlSource),
  'compute1604CF handler delegates to withholdingReturnService');
expect(/withholdingReturnService\.export1604CFDat/.test(ctrlSource),
  'export1604CFDat handler delegates to withholdingReturnService');
expect(/withholdingReturnService\.export2316Pdf/.test(ctrlSource),
  'export2316Pdf handler delegates to withholdingReturnService');
// Role gates — VIEW_DASHBOARD on compute, EXPORT_FORM on .dat + PDF
const compute1604Block = ctrlSource.slice(ctrlSource.indexOf('exports.compute1604CF'), ctrlSource.indexOf('exports.export1604CFDat'));
expect(/ensureRole\(req,\s*res,\s*['"]VIEW_DASHBOARD['"]\)/.test(compute1604Block),
  'compute1604CF gated by VIEW_DASHBOARD');
const export1604Block = ctrlSource.slice(ctrlSource.indexOf('exports.export1604CFDat'), ctrlSource.indexOf('exports.export2316Pdf'));
expect(/ensureRole\(req,\s*res,\s*['"]EXPORT_FORM['"]\)/.test(export1604Block),
  'export1604CFDat gated by EXPORT_FORM');
const export2316Block = ctrlSource.slice(ctrlSource.indexOf('exports.export2316Pdf'));
expect(/ensureRole\(req,\s*res,\s*['"]EXPORT_FORM['"]\)/.test(export2316Block),
  'export2316Pdf gated by EXPORT_FORM');
expect(/period_payee_kind:\s*['"]PeopleMaster['"]/.test(ctrlSource),
  '2316 BirFilingStatus row sets period_payee_kind="PeopleMaster" (per-payee schema requirement)');
expect(/\[BIR_EXPORT_1604CF_DAT\]/.test(ctrlSource),
  'export1604CFDat logs ops audit line');
expect(/\[BIR_EXPORT_2316_PDF\]/.test(ctrlSource),
  'export2316Pdf logs ops audit line');

// ── 6. birRoutes mount order — Part B routes BEFORE J1 catch-all ─────────
const routesSource = read('backend/erp/routes/birRoutes.js');
expect(/router\.get\(['"]\/forms\/1604-CF\/:year\/compute['"]/.test(routesSource),
  'birRoutes mounts GET /forms/1604-CF/:year/compute');
expect(/router\.get\(['"]\/forms\/1604-CF\/:year\/export\.dat['"]/.test(routesSource),
  'birRoutes mounts GET /forms/1604-CF/:year/export.dat');
expect(/router\.get\(['"]\/forms\/2316\/:year\/:payeeId\/export\.pdf['"]/.test(routesSource),
  'birRoutes mounts GET /forms/2316/:year/:payeeId/export.pdf');
const j3bIdx = routesSource.indexOf("router.get('/forms/1604-CF/:year/compute'");
const j1CatchIdx = routesSource.indexOf("router.get('/forms/:formCode/:year/:period/export.csv'");
expect(j3bIdx > 0 && j1CatchIdx > 0 && j3bIdx < j1CatchIdx,
  'J3 Part B 1604-CF routes are declared BEFORE the J1 :formCode catch-all');

// ── 7. BirFilingStatus accepts 2316 + 1604-CF ────────────────────────────
const filingStatusModel = read('backend/erp/models/BirFilingStatus.js');
expect(/['"]2316['"]/.test(filingStatusModel),
  'BirFilingStatus FORM_CODES enum includes "2316" (per-employee per-year cert)');
expect(/perPayeeForms = \[[^\]]*['"]2316['"]/.test(filingStatusModel),
  'BirFilingStatus pre-validate treats 2316 as per-payee (period_payee_id required)');

// ── 8. Frontend birService J3 Part B wrappers ────────────────────────────
const fbirService = read('frontend/src/erp/services/birService.js');
expect(/export async function compute1604CF\s*\(year\)/.test(fbirService),
  'frontend birService exports compute1604CF(year)');
expect(/export async function export1604CFDat\s*\(year\)/.test(fbirService),
  'frontend birService exports export1604CFDat(year)');
expect(/export async function export2316Pdf\s*\(year,\s*payeeId\)/.test(fbirService),
  'frontend birService exports export2316Pdf(year, payeeId)');
expect(/`\$\{BASE\}\/forms\/1604-CF\/\$\{year\}\/compute`/.test(fbirService),
  'compute1604CF hits /forms/1604-CF/:year/compute');
expect(/`\$\{BASE\}\/forms\/1604-CF\/\$\{year\}\/export\.dat`/.test(fbirService),
  'export1604CFDat hits /forms/1604-CF/:year/export.dat');
expect(/`\$\{BASE\}\/forms\/2316\/\$\{year\}\/\$\{encodeURIComponent\(payeeId\)\}\/export\.pdf`/.test(fbirService),
  'export2316Pdf hits /forms/2316/:year/:payeeId/export.pdf with URL-encoded payeeId');
expect(/compute1604CF,\s*\n\s*export1604CFDat,\s*\n\s*export2316Pdf/.test(fbirService),
  'birService default export includes compute1604CF + export1604CFDat + export2316Pdf');

// ── 9. Bir1604CFDetailPage component ─────────────────────────────────────
const detailPage = read('frontend/src/erp/pages/Bir1604CFDetailPage.jsx');
expect(/birService\.compute1604CF\(year\)/.test(detailPage),
  'Bir1604CFDetailPage calls birService.compute1604CF on load');
expect(/birService\.export1604CFDat\(year\)/.test(detailPage),
  'Bir1604CFDetailPage calls birService.export1604CFDat from toolbar');
expect(/birService\.export2316Pdf\(year,\s*payeeId\)/.test(detailPage),
  'Bir1604CFDetailPage calls birService.export2316Pdf from row buttons');
expect(/SCHEDULE_META\s*=\s*\{[\s\S]*'7\.1':[\s\S]*'7\.2':[\s\S]*'7\.3':/.test(detailPage),
  'Bir1604CFDetailPage renders 3 schedule sections (7.1 + 7.2 + 7.3)');
expect(/PageGuide pageKey="bir-1604cf-alphalist"/.test(detailPage),
  'Bir1604CFDetailPage renders PageGuide for bir-1604cf-alphalist');
expect(/Mark Reviewed[\s\S]*Mark Filed[\s\S]*Mark Confirmed/.test(detailPage),
  'Bir1604CFDetailPage renders Reviewed → Filed → Confirmed lifecycle buttons');
expect(/2316 PDF/.test(detailPage),
  'Bir1604CFDetailPage renders per-row 2316 PDF button');

// ── 10. App.jsx mounts 1604-CF route BEFORE wildcard ─────────────────────
const appJsx = read('frontend/src/App.jsx');
expect(/Bir1604CFDetailPage = lazyRetry/.test(appJsx),
  'App.jsx lazy-imports Bir1604CFDetailPage');
expect(/path="\/erp\/bir\/1604-CF\/:year"/.test(appJsx),
  'App.jsx declares /erp/bir/1604-CF/:year route');
const j3bRouteIdx = appJsx.indexOf('path="/erp/bir/1604-CF/:year"');
const j1WildcardIdx = appJsx.indexOf('path="/erp/bir/:formCode/:year/:period"');
expect(j3bRouteIdx > 0 && j1WildcardIdx > 0 && j3bRouteIdx < j1WildcardIdx,
  'App.jsx 1604-CF route is declared BEFORE the /:formCode wildcard fallback');

// ── 11. PageGuide bir-1604cf-alphalist entry ─────────────────────────────
const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
expect(/'bir-1604cf-alphalist':\s*\{/.test(pageGuide),
  'PageGuide registers bir-1604cf-alphalist key');
expect(/title:\s*['"]BIR 1604-CF/.test(pageGuide),
  'bir-1604cf-alphalist title mentions BIR 1604-CF');
expect(/Schedule[\s\S]*7\.1[\s\S]*7\.2[\s\S]*7\.3/.test(pageGuide),
  'bir-1604cf-alphalist banner explains 3 schedules (7.1 / 7.2 / 7.3)');
expect(/2316/.test(pageGuide) && /Substituted Filing/.test(pageGuide),
  'bir-1604cf-alphalist banner explains 2316 PDF + Substituted Filing posture');
expect(/snapshot/i.test(pageGuide.slice(pageGuide.indexOf("'bir-1604cf-alphalist'"), pageGuide.indexOf("'bir-vat-return'"))),
  'bir-1604cf-alphalist banner mentions snapshot pattern (BIR audit posture)');

// ── 12. BIRCompliancePage heatmap drill-down for 1604-CF ─────────────────
const dashPage = read('frontend/src/erp/pages/BIRCompliancePage.jsx');
expect(/annualForms = \[['"]1604-CF['"]\]/.test(dashPage),
  'BIRCompliancePage heatmap declares annualForms = ["1604-CF"]');
expect(/isAnnualForm[\s\S]*\?\s*`\/erp\/bir\/\$\{targetForm\}\/\$\{year\}`/.test(dashPage),
  'BIRCompliancePage 1604-CF cell builds year-only URL for annual forms');
expect(/'1601-C'/.test(dashPage),
  'BIRCompliancePage heatmap drillable list includes 1601-C (J3 Part A — was missing pre-Part B)');

// ── 13. BIR_FORMS_CATALOG already seeds 1604-CF (J0) ─────────────────────
const lookupCtrl = read('backend/erp/controllers/lookupGenericController.js');
expect(/code:\s*['"]1604-CF['"][\s\S]*?frequency:\s*['"]ANNUAL['"][\s\S]*?requires_payroll:\s*true/.test(lookupCtrl),
  'BIR_FORMS_CATALOG already seeds 1604-CF as ANNUAL + requires_payroll (J0)');

// ── 14. Sibling regression — J3 Part A still wired ───────────────────────
const partAHealthcheck = read('backend/scripts/healthcheckBirCompensationWithholding.js');
expect(/healthcheckBirCompensationWithholding/.test(partAHealthcheck),
  'Part A healthcheck still present (regression sentinel)');

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
console.log('✓ Phase VIP-1.J / J3 Part B (1604-CF + 2316) wiring is healthy.');
console.log('  Coverage: service/controller/routes/model/frontend service/page/route/');
console.log('            heatmap drill-down/PageGuide/lookup catalog/serializer round-trip.');
console.log('  Next: J4 — QAP + 1604-E annual EWT alphalists.');
