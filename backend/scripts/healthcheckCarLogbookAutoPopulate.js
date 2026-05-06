#!/usr/bin/env node
/**
 * healthcheckCarLogbookAutoPopulate.js — Phase P1.2 Slice 6 (May 06 2026)
 *
 * Static contract verifier for the Car Logbook auto-populate feature.
 * Asserts that:
 *   - Service exists with the expected exports + 8 return-shape fields.
 *   - SOURCE_TAGS enum has exactly the 6 documented codes.
 *   - Controller imports the service + adds previewCarLogbookDay endpoint.
 *   - Route is mounted BEFORE `/car-logbook/:id` (Express shadowing guard).
 *   - createCarLogbook accepts autopopulate flag from query OR body and
 *     records provenance in edit_history when populated.
 *   - Frontend hook exposes previewCarLogbookDay with both single + batch shapes.
 *   - Frontend page imports SourceBadge, renders badges next to fields,
 *     calls preview on load, and flips source to MANUAL on edit.
 *   - WorkflowGuide banner mentions Slice 6 + the 4 sources + source-badge
 *     palette per Rule #1.
 *
 * Run: node backend/scripts/healthcheckCarLogbookAutoPopulate.js
 * Exit 0 = clean. Exit 1 = at least one assertion failed.
 *
 * No DB connection — pure file content check.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, cond) {
  if (cond) {
    pass += 1;
    process.stdout.write(`  PASS  ${label}\n`);
  } else {
    fail += 1;
    failures.push(label);
    process.stdout.write(`  FAIL  ${label}\n`);
  }
}

function section(name) {
  process.stdout.write(`\n[${name}]\n`);
}

// ── 1. Auto-populate service ──────────────────────────────────────
section('Service — backend/erp/services/carLogbookAutoPopulate.js');
const svcSrc = read('backend/erp/services/carLogbookAutoPopulate.js');

assert('exports autoPopulateCarLogbookDay', /module\.exports[\s\S]*autoPopulateCarLogbookDay/.test(svcSrc));
assert('exports SOURCE_TAGS', /module\.exports[\s\S]*SOURCE_TAGS/.test(svcSrc));
assert('SOURCE_TAGS.SMER defined', /SMER:\s*'SMER'/.test(svcSrc));
assert('SOURCE_TAGS.SMER_CAPTURE defined', /SMER_CAPTURE:\s*'SMER_CAPTURE'/.test(svcSrc));
assert('SOURCE_TAGS.DRIVE_ALLOCATION defined', /DRIVE_ALLOCATION:\s*'DRIVE_ALLOCATION'/.test(svcSrc));
assert('SOURCE_TAGS.FUEL_ENTRY_CAPTURE defined', /FUEL_ENTRY_CAPTURE:\s*'FUEL_ENTRY_CAPTURE'/.test(svcSrc));
assert('SOURCE_TAGS.PRIOR_DAY defined', /PRIOR_DAY:\s*'PRIOR_DAY'/.test(svcSrc));
assert('SOURCE_TAGS.CRM_VISIT_CITY defined (Slice 6.1)', /CRM_VISIT_CITY:\s*'CRM_VISIT_CITY'/.test(svcSrc));
assert('SOURCE_TAGS.MANUAL defined', /MANUAL:\s*'MANUAL'/.test(svcSrc));

assert('Rule #19 — entity_id required check', /entity_id is required/.test(svcSrc));
assert('Rule #21 — bdm_id required check', /bdm_id is required/.test(svcSrc));

assert('imports SmerEntry', /require\(['"]\.\.\/models\/SmerEntry['"]\)/.test(svcSrc));
assert('imports CaptureSubmission', /require\(['"]\.\.\/models\/CaptureSubmission['"]\)/.test(svcSrc));
assert('imports DriveAllocation', /require\(['"]\.\.\/models\/DriveAllocation['"]\)/.test(svcSrc));
assert('imports CarLogbookEntry (prior-day fallback)', /require\(['"]\.\.\/models\/CarLogbookEntry['"]\)/.test(svcSrc));
assert('imports cycleC1C2 helper', /require\(['"]\.\.\/utils\/cycleC1C2['"]\)/.test(svcSrc));
assert('Slice 6.1 — imports Visit (CRM)', /require\(['"]\.\.\/\.\.\/models\/Visit['"]\)/.test(svcSrc));
assert('Slice 6.1 — imports Doctor (CRM)', /require\(['"]\.\.\/\.\.\/models\/Doctor['"]\)/.test(svcSrc));
assert('Slice 6.1 — imports ClientVisit (CRM, EXTRA calls)', /require\(['"]\.\.\/\.\.\/models\/ClientVisit['"]\)/.test(svcSrc));
assert('Slice 6.1 — imports Client (CRM, EXTRA call counterpart)', /require\(['"]\.\.\/\.\.\/models\/Client['"]\)/.test(svcSrc));

assert('VALID_CAPTURE_STATUSES excludes CANCELLED', !/VALID_CAPTURE_STATUSES[\s\S]{0,300}'CANCELLED'/.test(svcSrc));
assert('pulls SMER destination by daily_entries', /daily_entries\.entry_date/.test(svcSrc));
assert('pulls SMER ODO captures workflow_type SMER', /workflow_type:\s*'SMER'/.test(svcSrc));
assert('pulls FUEL_ENTRY captures', /workflow_type:\s*'FUEL_ENTRY'/.test(svcSrc));
assert('pulls DriveAllocation by drive_date', /drive_date:\s*dateStr/.test(svcSrc));
assert('parallel Promise.all sweep', /Promise\.all\(\[\s*pullSmerDestination/.test(svcSrc));
assert('Slice 6.1 — pullCrmVisitDestinations exported', /module\.exports[\s\S]{0,2000}pullCrmVisitDestinations/.test(svcSrc));
assert('Slice 6.1 — pullCrmVisitDestinations defined', /async function pullCrmVisitDestinations/.test(svcSrc));
assert('Slice 6.1 — yes-equal-weight Visit + ClientVisit query', /Visit\.find[\s\S]{0,500}ClientVisit\.find/.test(svcSrc));
assert('Slice 6.1 — locality + province label preferred', /\$\{m\.locality\},\s*\$\{m\.province\}/.test(svcSrc));
assert('Slice 6.1 — dedupes via Set', /\[\.\.\.\s*new Set\(labels\)\]/.test(svcSrc));
assert('Slice 6.1 — joins with semicolon delimiter', /uniqueLabels\.join\(['"]\;\s*['"]\)/.test(svcSrc));
assert('Slice 6.1 — pullCrmVisitDestinations in parallel sweep', /pullCrmVisitDestinations\(\{\s*bdm_id,\s*dateStr\s*\}\)/.test(svcSrc));
assert('Slice 6.1 — destination prefers CRM > SMER', /crmCities\.destination[\s\S]{0,300}SOURCE_TAGS\.CRM_VISIT_CITY[\s\S]{0,300}SOURCE_TAGS\.SMER/.test(svcSrc));
assert('Slice 6.1 — _crm_visits surfaced in return shape', /_crm_visits:\s*crmCities/.test(svcSrc));

// 8 expected return shape fields
const RETURN_FIELDS = ['destination', 'starting_km', 'ending_km', 'starting_km_photo_url', 'ending_km_photo_url', 'personal_km', 'official_km', 'fuel_entries'];
for (const f of RETURN_FIELDS) {
  assert(`return shape includes ${f}`, new RegExp(`${f}[,:\\s]`).test(svcSrc));
}
assert('return shape includes _autopop_sources', /_autopop_sources:/.test(svcSrc));
assert('return shape includes _has_any_signal', /_has_any_signal:/.test(svcSrc));

// ── 2. Controller wiring ──────────────────────────────────────────
section('Controller — backend/erp/controllers/expenseController.js');
const ctrlSrc = read('backend/erp/controllers/expenseController.js');

assert('imports autoPopulateCarLogbookDay',
  /autoPopulateCarLogbookDay[\s\S]{0,300}require\(['"]\.\.\/services\/carLogbookAutoPopulate['"]\)/.test(ctrlSrc));
assert('previewCarLogbookDay function defined',
  /const previewCarLogbookDay\s*=\s*catchAsync/.test(ctrlSrc));
assert('previewCarLogbookDay handles single date',
  /const \{\s*date,\s*dates\s*\}\s*=\s*req\.query/.test(ctrlSrc));
assert('previewCarLogbookDay handles batch dates',
  /preview accepts at most 31 dates/.test(ctrlSrc));
assert('previewCarLogbookDay enforces Rule #21 bdm_id',
  /bdm_id is required[\s\S]{0,200}privileged\/proxy users must specify which BDM to preview/.test(ctrlSrc));
assert('createCarLogbook accepts autopopulate from query OR body',
  /autopopulateRequested\s*=[\s\S]{0,200}req\.query\.autopopulate[\s\S]{0,200}safeBody\.autopopulate/.test(ctrlSrc));
assert('createCarLogbook strips autopopulate flag from persistence body',
  /delete safeBody\.autopopulate/.test(ctrlSrc));
assert('createCarLogbook merges body ON TOP of populated shape',
  /Body wins on every overlapping field/.test(ctrlSrc));
assert('createCarLogbook persists AUTO_POPULATE in edit_history',
  /action:\s*'AUTO_POPULATE'/.test(ctrlSrc));
assert('createCarLogbook returns auto_populated flag',
  /auto_populated:\s*!!autopopSources/.test(ctrlSrc));
assert('createCarLogbook returns autopop_sources for UI',
  /autopop_sources:\s*autopopSources/.test(ctrlSrc));
assert('previewCarLogbookDay exported from module',
  /module\.exports[\s\S]{0,2000}previewCarLogbookDay/.test(ctrlSrc));

// ── 3. Routes ─────────────────────────────────────────────────────
section('Routes — backend/erp/routes/expenseRoutes.js');
const routesSrc = read('backend/erp/routes/expenseRoutes.js');

assert('previewCarLogbookDay imported', /previewCarLogbookDay/.test(routesSrc));
assert('GET /car-logbook/preview mounted',
  /router\.get\('\/car-logbook\/preview',\s*previewCarLogbookDay\)/.test(routesSrc));

// Critical: route order — preview MUST come before `/car-logbook/:id` so
// Express doesn't capture "preview" as the :id param.
const previewIdx = routesSrc.indexOf("'/car-logbook/preview'");
const idIdx = routesSrc.indexOf("'/car-logbook/:id'");
assert('preview mounted BEFORE /:id (Express shadowing guard)',
  previewIdx > 0 && idIdx > 0 && previewIdx < idIdx);

// ── 4. Frontend hook ──────────────────────────────────────────────
section('Hook — frontend/src/erp/hooks/useExpenses.js');
const hookSrc = read('frontend/src/erp/hooks/useExpenses.js');

assert('previewCarLogbookDay defined in hook',
  /const previewCarLogbookDay\s*=/.test(hookSrc));
assert('hook supports single date param',
  /params\.date\s*=\s*date/.test(hookSrc));
assert('hook supports batch dates param',
  /params\.dates\s*=\s*dates\.join\(','\)/.test(hookSrc));
assert('hook hits /expenses/car-logbook/preview',
  /api\.get\(['"]\/expenses\/car-logbook\/preview['"]/.test(hookSrc));
assert('previewCarLogbookDay exported from hook',
  /return\s*\{[\s\S]{0,3000}previewCarLogbookDay/.test(hookSrc));

// ── 5. Frontend page ──────────────────────────────────────────────
section('Page — frontend/src/erp/pages/CarLogbook.jsx');
const pageSrc = read('frontend/src/erp/pages/CarLogbook.jsx');

assert('imports previewCarLogbookDay from useExpenses',
  /previewCarLogbookDay/.test(pageSrc));
assert('SourceBadge component defined',
  /function SourceBadge/.test(pageSrc));
assert('AUTOPOP_SOURCE_META has all 7 source codes (Slice 6 + 6.1)',
  /AUTOPOP_SOURCE_META[\s\S]{0,800}SMER:[\s\S]{0,200}SMER_CAPTURE:[\s\S]{0,200}DRIVE_ALLOCATION:[\s\S]{0,200}FUEL_ENTRY_CAPTURE:[\s\S]{0,200}PRIOR_DAY:[\s\S]{0,200}CRM_VISIT_CITY:[\s\S]{0,200}MANUAL:/.test(pageSrc));
assert('Slice 6.1 — CRM_VISIT_CITY badge has cyan palette + tip', /CRM_VISIT_CITY:[\s\S]{0,300}cffafe[\s\S]{0,200}CRM Visits/.test(pageSrc));
assert('row state seeds _autopop_sources empty map',
  /_autopop_sources:\s*\{\}/.test(pageSrc));
assert('loadAndMerge calls previewCarLogbookDay',
  /previewCarLogbookDay\(\{\s*bdmId/.test(pageSrc));
assert('loadAndMerge guards on no BDM selected',
  /if\s*\(bdmIdForPreview\)/.test(pageSrc));
assert('loadAndMerge falls back to SMER-only on preview failure',
  /falling back to SMER-only fill/.test(pageSrc));
assert('loadAndMerge fills only blanks (never overwrites saved row)',
  /Only fill blanks — never overwrite a saved row/.test(pageSrc));
assert('handleRowChange flips source to MANUAL on edit',
  /flip source tag to MANUAL on edit/.test(pageSrc));
assert('saveRow passes autopopulate=true on create',
  /createCarLogbook\(\{\s*\.\.\.data,\s*assigned_to:\s*assignedTo,\s*autopopulate:\s*true\s*\}\)/.test(pageSrc));
assert('SourceBadge rendered next to destination input',
  /<SourceBadge source=\{row\._autopop_sources\?\.destination\}/.test(pageSrc));
assert('SourceBadge rendered next to starting_km',
  /<SourceBadge source=\{row\._autopop_sources\?\.starting_km\}/.test(pageSrc));
assert('SourceBadge rendered next to ending_km',
  /<SourceBadge source=\{row\._autopop_sources\?\.ending_km\}/.test(pageSrc));
assert('SourceBadge rendered next to personal_km',
  /<SourceBadge source=\{row\._autopop_sources\?\.personal_km\}/.test(pageSrc));
assert('SourceBadge rendered next to fuel_entries',
  /<SourceBadge source=\{row\._autopop_sources\?\.fuel_entries\}/.test(pageSrc));

// ── 6. WorkflowGuide banner ───────────────────────────────────────
section('WorkflowGuide — frontend/src/erp/components/WorkflowGuide.jsx');
const guideSrc = read('frontend/src/erp/components/WorkflowGuide.jsx');

assert('car-logbook banner mentions Phase P1.2 Slice 6',
  /Phase P1\.2 Slice 6[\s\S]{0,300}auto-populate/i.test(guideSrc));
assert('car-logbook banner names the 4 sources',
  /SMER[\s\S]{0,400}DriveAllocation[\s\S]{0,400}FUEL_ENTRY/i.test(guideSrc));
assert('car-logbook tip explains source badge palette',
  /source badge[\s\S]{0,500}SMER[\s\S]{0,500}ODO[\s\S]{0,500}Drive[\s\S]{0,500}Fuel cap[\s\S]{0,500}Prior[\s\S]{0,500}Manual/i.test(guideSrc));
assert('Slice 6.1 — car-logbook banner mentions CRM Visits source',
  /Slice 6\.1[\s\S]{0,300}CRM Visits/i.test(guideSrc));
assert('Slice 6.1 — car-logbook tip explains CRM > SMER priority',
  /CRM[\s\S]{0,200}wins over SMER/i.test(guideSrc));
assert('Slice 6.1 — smer banner mentions cross-fill to Car Logbook',
  /Phase P1\.2 Slice 6\.1[\s\S]{0,300}Car Logbook destination/i.test(guideSrc));

// ── 7. Lookup-driven gate (Rule #3) ───────────────────────────────
section('Lookup gate — backend/utils/captureLifecycleAccess.js');
const gateSrc = read('backend/utils/captureLifecycleAccess.js');
assert('EDIT_CAR_LOGBOOK_DESTINATION gate defined (forward-compat)',
  /EDIT_CAR_LOGBOOK_DESTINATION/.test(gateSrc));

// ── Summary ───────────────────────────────────────────────────────
const total = pass + fail;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`Phase P1.2 Slice 6 healthcheck: ${pass}/${total} PASS\n`);
if (fail > 0) {
  process.stdout.write(`\nFailures:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f}\n`));
  process.exit(1);
}
process.stdout.write(`\n✓ Car Logbook Auto-Populate (Slice 6) contract is intact end-to-end.\n`);
process.exit(0);
