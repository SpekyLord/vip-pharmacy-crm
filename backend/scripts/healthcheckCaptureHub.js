#!/usr/bin/env node
/**
 * healthcheckCaptureHub.js — Phase P1.1 (May 05 2026)
 *
 * Static contract verifier for the BDM Capture Hub + Review Queue surface.
 * Asserts that:
 *   - Backend model accepts the new workflow_type, sub_type, and physical_*
 *     fields, and the new artifact kinds.
 *   - Backend controller validates the new workflow_type, gates sub_type to
 *     COLLECTION, and derives physical_required at create time.
 *   - REVIEW_WORKFLOWS includes the new types that need BDM confirmation.
 *   - Frontend Capture Hub renders all 10 tiles with composite keys + sub_type
 *     forwarding to the API payload.
 *   - Frontend Review Queue resolves icons/colors/labels via composite key.
 *   - WorkflowGuide banners exist for both pages with cycle + paper-expectation
 *     tips per Rule #1.
 *   - Sidebar links visible to staff role; routes mounted under ERP_ALL gate.
 *
 * Run: node backend/scripts/healthcheckCaptureHub.js
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

// ── 1. Backend model ────────────────────────────────────────────
section('Model — backend/erp/models/CaptureSubmission.js');
const modelSrc = read('backend/erp/models/CaptureSubmission.js');

assert('artifact kind: paid_csi_scan', /'paid_csi_scan'/.test(modelSrc));
assert('artifact kind: cr_scan', /'cr_scan'/.test(modelSrc));
assert('artifact kind: deposit_slip', /'deposit_slip'/.test(modelSrc));
assert('artifact kind: cwt_scan', /'cwt_scan'/.test(modelSrc));
assert('workflow_type: CWT_INBOUND', /'CWT_INBOUND'/.test(modelSrc));
assert('sub_type field with 3 values', /sub_type:[\s\S]+'CR'[\s\S]+'DEPOSIT'[\s\S]+'PAID_CSI'/.test(modelSrc));
assert('physical_required field', /physical_required:[\s\S]+Boolean/.test(modelSrc));
assert('physical_status enum', /physical_status:[\s\S]+'PENDING'[\s\S]+'RECEIVED'[\s\S]+'MISSING'[\s\S]+'N_A'/.test(modelSrc));
assert('physical_received_at field', /physical_received_at:\s*\{\s*type:\s*Date/.test(modelSrc));
assert('physical_received_by ref User', /physical_received_by:[\s\S]+ref:\s*'User'/.test(modelSrc));
assert('linked_doc_kind: CwtLedgerEntry', /'CwtLedgerEntry'/.test(modelSrc));
assert('reconciliation index', /index\(\{\s*bdm_id:\s*1,\s*physical_status:\s*1,\s*created_at:\s*1\s*\}\)/.test(modelSrc));

// ── 2. Backend controller ──────────────────────────────────────
section('Controller — backend/erp/controllers/captureSubmissionController.js');
const ctrlSrc = read('backend/erp/controllers/captureSubmissionController.js');

assert('VALID_TYPES includes CWT_INBOUND', /VALID_TYPES\s*=\s*\[[\s\S]+'CWT_INBOUND'/.test(ctrlSrc));
assert('VALID_SUB_TYPES has all three', /VALID_SUB_TYPES\s*=\s*\['CR',\s*'DEPOSIT',\s*'PAID_CSI'\]/.test(ctrlSrc));
assert('sub_type rejected for non-COLLECTION', /sub_type[\s\S]+'COLLECTION'/.test(ctrlSrc));
assert('DIGITAL_ONLY helper defined', /const DIGITAL_ONLY/.test(ctrlSrc));
assert('digital-only: SMER', /workflow_type === 'SMER'/.test(ctrlSrc));
assert('digital-only: COLLECTION/PAID_CSI', /'COLLECTION'[\s\S]+'PAID_CSI'/.test(ctrlSrc));
assert('physical_required derived at create', /physical_required:\s*!isDigitalOnly/.test(ctrlSrc));
assert('physical_status N_A for digital-only', /physical_status:\s*isDigitalOnly\s*\?\s*'N_A'\s*:\s*'PENDING'/.test(ctrlSrc));
assert('REVIEW_WORKFLOWS includes COLLECTION', /REVIEW_WORKFLOWS\s*=\s*\[[\s\S]+'COLLECTION'/.test(ctrlSrc));
assert('REVIEW_WORKFLOWS includes CWT_INBOUND', /REVIEW_WORKFLOWS\s*=\s*\[[\s\S]+'CWT_INBOUND'/.test(ctrlSrc));

// ── 3. Frontend Capture Hub ────────────────────────────────────
section('Frontend — frontend/src/erp/pages/mobile/BdmCaptureHub.jsx');
const hubSrc = read('frontend/src/erp/pages/mobile/BdmCaptureHub.jsx');

assert('imports ReceiptText', /ReceiptText/.test(hubSrc));
assert('imports Landmark', /Landmark/.test(hubSrc));
assert('imports HandCoins', /HandCoins/.test(hubSrc));
assert('imports FileBadge', /FileBadge/.test(hubSrc));
assert('SALES tile relabeled', /Scan CSI \(Delivery Copy\)/.test(hubSrc));
assert('CR tile present', /Scan Collection Receipt \(CR\)/.test(hubSrc));
assert('Deposit Slip tile present', /Scan Deposit Slip/.test(hubSrc));
assert('CSI Being Paid tile present', /Scan CSI Being Paid/.test(hubSrc));
assert('CWT tile present', /Scan CWT \(BIR 2307\)/.test(hubSrc));
assert('sub_type: CR', /sub_type:\s*'CR'/.test(hubSrc));
assert('sub_type: DEPOSIT', /sub_type:\s*'DEPOSIT'/.test(hubSrc));
assert('sub_type: PAID_CSI', /sub_type:\s*'PAID_CSI'/.test(hubSrc));
assert('digitalOnly flag on SMER', /key:\s*'SMER'[\s\S]+digitalOnly:\s*true/.test(hubSrc));
assert('digitalOnly flag on PAID_CSI', /sub_type:\s*'PAID_CSI'[\s\S]+digitalOnly:\s*true/.test(hubSrc));
assert('payload forwards sub_type', /payload\.sub_type\s*=\s*workflow\.sub_type/.test(hubSrc));
assert('composite map key', /\$\{w\.key\}_\$\{w\.sub_type\s*\|\|\s*'main'\}/.test(hubSrc));
assert('digital-only hint banner', /Digital-only:[\s\S]+No paper expected/.test(hubSrc));
assert('access_for label is contextual', /Customer \/ Hospital/.test(hubSrc));

// ── 3b. Frontend Capture Hub — sectioned layout polish ─────────
section('Frontend Capture Hub — sectioned layout');
assert('SECTIONS array defined', /const SECTIONS\s*=\s*\[/.test(hubSrc));
assert('section: vehicle', /id:\s*'vehicle'/.test(hubSrc));
assert('section: cash_out', /id:\s*'cash_out'/.test(hubSrc));
assert('section: customer', /id:\s*'customer'/.test(hubSrc));
assert('section: collection', /id:\s*'collection'/.test(hubSrc));
assert('section: inventory', /id:\s*'inventory'/.test(hubSrc));
assert('SectionHeader component', /function SectionHeader/.test(hubSrc));
assert('grouped render — SECTIONS map filter', /SECTIONS\.map[\s\S]+filter\(g => g\.workflows\.length > 0\)/.test(hubSrc));
assert('Digital only pill on tile', /Digital only/.test(hubSrc));
assert('border-left accent style', /borderLeft:\s*`4px solid \$\{workflow\.color\}`/.test(hubSrc));
assert('header shows tile count', /\$\{totalActiveTiles\}|totalActiveTiles/.test(hubSrc));

// ── 3c. capture-hub.css — scoped styles actually load ─────────
section('Scoped CSS — frontend/src/styles/capture-hub.css');
const cssSrc = read('frontend/src/styles/capture-hub.css');
assert('imports capture-hub.css in CaptureHub',  /import\s+['"]\.\.\/\.\.\/\.\.\/styles\/capture-hub\.css['"]/.test(hubSrc));
assert('.ch-page rule', /\.ch-page\s*\{/.test(cssSrc));
assert('.ch-tile rule with display:flex', /\.ch-tile\s*\{[\s\S]*?display:\s*flex/.test(cssSrc));
assert('.ch-section-header rule', /\.ch-section-header\s*\{/.test(cssSrc));
assert('.ch-tile-pill rule (digital-only badge)', /\.ch-tile-pill\s*\{/.test(cssSrc));
assert('.ch-modal-backdrop rule', /\.ch-modal-backdrop\s*\{/.test(cssSrc));
assert('.rq-card rule', /\.rq-card\s*\{/.test(cssSrc));
assert('.rq-action.confirm rule', /\.rq-action\.confirm\s*\{/.test(cssSrc));
assert('@keyframes spin', /@keyframes\s+spin/.test(cssSrc));

// ── 4. Frontend Review Queue ───────────────────────────────────
section('Frontend — frontend/src/erp/pages/mobile/BdmReviewQueue.jsx');
const rqSrc = read('frontend/src/erp/pages/mobile/BdmReviewQueue.jsx');

assert('icons map: COLLECTION_CR', /COLLECTION_CR:\s*ReceiptText/.test(rqSrc));
assert('icons map: COLLECTION_DEPOSIT', /COLLECTION_DEPOSIT:\s*Landmark/.test(rqSrc));
assert('icons map: COLLECTION_PAID_CSI', /COLLECTION_PAID_CSI:\s*HandCoins/.test(rqSrc));
assert('icons map: CWT_INBOUND', /CWT_INBOUND:\s*FileBadge/.test(rqSrc));
assert('labels map exists', /WORKFLOW_LABELS\s*=/.test(rqSrc));
assert('label: CSI Delivery Copy', /'CSI Delivery Copy'/.test(rqSrc));
assert('label: Collection Receipt', /'Collection Receipt \(CR\)'/.test(rqSrc));
assert('label: Deposit Slip', /'Deposit Slip'/.test(rqSrc));
assert('label: CSI Being Paid', /'CSI Being Paid'/.test(rqSrc));
assert('label: CWT', /'CWT \(BIR 2307\)'/.test(rqSrc));
assert('resolveKey helper', /function resolveKey/.test(rqSrc));
assert('empty-state explainer card', /How this works/.test(rqSrc));
assert('ReviewCard uses composite icon', /WORKFLOW_ICONS\[composite\]/.test(rqSrc));
assert('imports capture-hub.css in ReviewQueue', /import\s+['"]\.\.\/\.\.\/\.\.\/styles\/capture-hub\.css['"]/.test(rqSrc));
assert('Review uses .rq-card class', /className="rq-card"/.test(rqSrc));
assert('Review uses .rq-action class', /className="rq-action confirm"/.test(rqSrc));

// ── 5. WorkflowGuide banners (Rule #1) ─────────────────────────
section('WorkflowGuide — frontend/src/erp/components/WorkflowGuide.jsx');
const wgSrc = read('frontend/src/erp/components/WorkflowGuide.jsx');

assert('bdm-capture-hub key exists', /'bdm-capture-hub'\s*:/.test(wgSrc));
assert('bdm-review-queue key exists', /'bdm-review-queue'\s*:/.test(wgSrc));
assert('capture banner mentions cycle C1/C2', /C1\s*=\s*day 1.{0,3}15[\s\S]+C2\s*=\s*day 16/.test(wgSrc));
assert('capture banner mentions ODO daily', /ODO is a daily capture/.test(wgSrc));
assert('capture banner mentions PAID_CSI digital-only', /CSI Being Paid is digital-only/.test(wgSrc));
assert('capture banner mentions paper consequence', /SAME cycle next month may be blocked/.test(wgSrc));
assert('review banner mentions empty state', /Empty queue is normal/.test(wgSrc));
assert('review banner mentions SMER split', /personal-vs-official gas split/.test(wgSrc));

// ── 6. Routes + Sidebar (Rule #2 wiring) ───────────────────────
section('Routes + Sidebar wiring');
const appSrc = read('frontend/src/App.jsx');
assert('App.jsx mounts /erp/capture-hub', /\/erp\/capture-hub/.test(appSrc));
assert('App.jsx mounts /erp/review-queue', /\/erp\/review-queue/.test(appSrc));

const sidebarSrc = read('frontend/src/components/common/Sidebar.jsx');
assert('Sidebar links to capture-hub', /\/erp\/capture-hub/.test(sidebarSrc));
assert('Sidebar links to review-queue', /\/erp\/review-queue/.test(sidebarSrc));

// ── 7. Phase P1.2 Slice 1 — UNCATEGORIZED workflow_type ─────────
section('Phase P1.2 Slice 1 — UNCATEGORIZED workflow_type');
assert('Model enum: UNCATEGORIZED', /'UNCATEGORIZED'/.test(modelSrc));
assert('Controller VALID_TYPES: UNCATEGORIZED', /VALID_TYPES\s*=\s*\[[\s\S]+'UNCATEGORIZED'/.test(ctrlSrc));
// Confirm UNCATEGORIZED is NOT digital-only (paper expected by default; proxy
// reclassification later flips physical_required atomically when needed).
assert('DIGITAL_ONLY does not match UNCATEGORIZED',
  !/UNCATEGORIZED/.test(
    (ctrlSrc.match(/const DIGITAL_ONLY[\s\S]+?\n;/m) ||
     ctrlSrc.match(/const DIGITAL_ONLY[\s\S]+?paid_csi[^\n]*/i) || [''])[0]
  )
);

// ── 8. Phase P1.2 Slice 1 — captureLifecycleAccess helper ───────
section('Phase P1.2 Slice 1 — captureLifecycleAccess helper');
const helperPath = 'backend/utils/captureLifecycleAccess.js';
const helperSrc = read(helperPath);

assert('helper file exists',                                    helperSrc.length > 0);
assert('helper imports Lookup model',                           /require\(['"]\.\.\/erp\/models\/Lookup['"]\)/.test(helperSrc));
assert('helper imports ROLES constants',                        /require\(['"]\.\.\/constants\/roles['"]\)/.test(helperSrc));
assert('helper has 60s TTL',                                    /TTL_MS\s*=\s*60_?000/.test(helperSrc));
assert('helper queries CAPTURE_LIFECYCLE_ROLES category',       /category:\s*'CAPTURE_LIFECYCLE_ROLES'/.test(helperSrc));
assert('helper has DEFAULTS_BY_CODE map',                       /DEFAULTS_BY_CODE/.test(helperSrc));
assert('helper exports invalidate fn',                          /exports[\s\S]*invalidate[\s\S]*}/.test(helperSrc) || /module\.exports\s*=[\s\S]+invalidate,/.test(helperSrc));
assert('helper exports userCanPerformCaptureAction',            /userCanPerformCaptureAction/.test(helperSrc));

// 12 default-arrays, 12 getters, 12 codes — strict count parity.
const codes = [
  'UPLOAD_OWN_CAPTURE', 'VIEW_OWN_ARCHIVE', 'VIEW_ALL_ARCHIVE',
  'MARK_PAPER_RECEIVED', 'BULK_MARK_RECEIVED', 'OVERRIDE_PHYSICAL_STATUS',
  'GENERATE_CYCLE_REPORT', 'MARK_NO_DRIVE_DAY', 'ALLOCATE_PERSONAL_OFFICIAL',
  'OVERRIDE_ALLOCATION', 'EDIT_CAR_LOGBOOK_DESTINATION', 'PROXY_PULL_CAPTURE',
];
codes.forEach(code => {
  assert(`helper DEFAULT_${code}`, new RegExp(`DEFAULT_${code}\\s*=`).test(helperSrc));
  assert(`helper DEFAULTS_BY_CODE.${code}`, new RegExp(`${code}:\\s*DEFAULT_${code}`).test(helperSrc));
});

// Default role narrowness — sanity check critical gates didn't accidentally
// open up. UPLOAD/VIEW_OWN/MARK_NO_DRIVE/ALLOCATE: staff. OVERRIDE_PHYSICAL_
// STATUS: president-only (irreversible-blast-radius gate). BULK_MARK_RECEIVED:
// admin-only. PROXY_PULL_CAPTURE: admin+finance (proxy clerks).
assert('default UPLOAD_OWN_CAPTURE = [staff]',           /DEFAULT_UPLOAD_OWN_CAPTURE\s*=\s*\[ROLES\.STAFF\]/.test(helperSrc));
assert('default VIEW_OWN_ARCHIVE = [staff]',             /DEFAULT_VIEW_OWN_ARCHIVE\s*=\s*\[ROLES\.STAFF\]/.test(helperSrc));
assert('default OVERRIDE_PHYSICAL_STATUS = [president]', /DEFAULT_OVERRIDE_PHYSICAL_STATUS\s*=\s*\[ROLES\.PRESIDENT\]/.test(helperSrc));
assert('default BULK_MARK_RECEIVED = [admin]',           /DEFAULT_BULK_MARK_RECEIVED\s*=\s*\[ROLES\.ADMIN\]/.test(helperSrc));
assert('default PROXY_PULL_CAPTURE = [admin, finance]',  /DEFAULT_PROXY_PULL_CAPTURE\s*=\s*\[ROLES\.ADMIN,\s*ROLES\.FINANCE\]/.test(helperSrc));

// ── 9. Phase P1.2 Slice 1 — Lookup SEED + invalidate wiring ─────
section('Phase P1.2 Slice 1 — Lookup SEED + invalidate wiring');
const lookupCtrlSrc = read('backend/erp/controllers/lookupGenericController.js');

assert('SEED has CAPTURE_LIFECYCLE_ROLES', /CAPTURE_LIFECYCLE_ROLES:\s*\[/.test(lookupCtrlSrc));
codes.forEach(code => {
  assert(`SEED row: ${code}`, new RegExp(`code:\\s*'${code}'`).test(lookupCtrlSrc));
});
// Every seed row must carry insert_only_metadata: true so admin role-array
// edits survive future re-seeds (Phase A.5 / G7.A.0 / VIP-1.A pattern).
const captureBlock = (lookupCtrlSrc.match(/CAPTURE_LIFECYCLE_ROLES:\s*\[[\s\S]+?\n\s*\]/m) || [''])[0];
assert('SEED block found',                                  captureBlock.length > 0);
const insertOnlyCount = (captureBlock.match(/insert_only_metadata:\s*true/g) || []).length;
assert(`SEED rows = 12 with insert_only_metadata`,          insertOnlyCount === 12);

// Invalidate hook must fire on create + update + remove, mirroring the
// 17 other lookup-driven role helpers (mdPartnerAccess, scpwdAccess,
// rebateCommissionAccess, etc.). Without this, admin saves would wait
// up to 60s before the gate honored the new row.
assert('imports invalidateCaptureLifecycleRolesCache',     /invalidate:\s*invalidateCaptureLifecycleRolesCache/.test(lookupCtrlSrc));
assert('CAPTURE_LIFECYCLE_ROLES_CATEGORIES set defined',   /CAPTURE_LIFECYCLE_ROLES_CATEGORIES\s*=\s*new Set\(\['CAPTURE_LIFECYCLE_ROLES'\]\)/.test(lookupCtrlSrc));
const invalidateCalls = (lookupCtrlSrc.match(/invalidateCaptureLifecycleRolesCache\(/g) || []).length;
assert('invalidate hook fires in create/update/remove (3)', invalidateCalls === 3);

// ── 10. Phase P1.2 Slice 1 — S3 upload pipeline ─────────────────
section('Phase P1.2 Slice 1 — S3 upload pipeline');
const s3Src = read('backend/config/s3.js');
const uploadMwSrc = read('backend/middleware/upload.js');

assert('s3.js exports uploadCaptureArtifact',                 /uploadCaptureArtifact/.test(s3Src));
assert('s3.js exports signCaptureArtifacts',                  /signCaptureArtifacts/.test(s3Src));
assert('uploadCaptureArtifact uses capture-submissions/ prefix',
  /capture-submissions\/\$\{safeEntity\}\/\$\{safeBdm\}\/\$\{yyyymm\}/.test(s3Src));
assert('signCaptureArtifacts skips data: URLs',               /a\.url\.startsWith\(['"]data:['"]\)/.test(s3Src));
assert('signCaptureArtifacts uses 3600s expiry',              /getSignedDownloadUrl\([^,]+,\s*3600\)/.test(s3Src));

assert('upload.js imports uploadCaptureArtifact',             /uploadCaptureArtifact/.test(uploadMwSrc));
assert('upload.js exports processCaptureArtifacts',           /processCaptureArtifacts/.test(uploadMwSrc));
assert('processCaptureArtifacts honors screenshot_block_enabled',
  /processCaptureArtifacts[\s\S]+screenshot_block_enabled[\s\S]+isLikelyScreenshot/.test(uploadMwSrc));
assert('processCaptureArtifacts returns 422 SCREENSHOT_DETECTED',
  /processCaptureArtifacts[\s\S]+422[\s\S]+SCREENSHOT_DETECTED/.test(uploadMwSrc));
assert('processCaptureArtifacts attaches req.uploadedCaptureArtifacts',
  /req\.uploadedCaptureArtifacts\s*=/.test(uploadMwSrc));
assert('processCaptureArtifacts emits no_exif_timestamp flag', /no_exif_timestamp/.test(uploadMwSrc));
assert('processCaptureArtifacts emits gps_in_photo flag',     /gps_in_photo/.test(uploadMwSrc));

// ── 11. Phase P1.2 Slice 1 — uploadArtifact controller + route ─
section('Phase P1.2 Slice 1 — uploadArtifact controller + route');
const ctrlSrcAfter = read('backend/erp/controllers/captureSubmissionController.js');
const routeSrcAfter = read('backend/erp/routes/captureSubmissionRoutes.js');

assert('controller imports signCaptureArtifacts',             /signCaptureArtifacts/.test(ctrlSrcAfter));
assert('controller imports userCanPerformCaptureAction',      /userCanPerformCaptureAction/.test(ctrlSrcAfter));
assert('controller exports uploadArtifact',                   /module\.exports[\s\S]+uploadArtifact/.test(ctrlSrcAfter));
assert('uploadArtifact gates UPLOAD_OWN_CAPTURE',             /['"]UPLOAD_OWN_CAPTURE['"]/.test(ctrlSrcAfter));
assert('uploadArtifact gates PROXY_PULL_CAPTURE',             /['"]PROXY_PULL_CAPTURE['"]/.test(ctrlSrcAfter));
assert('uploadArtifact handles cross-BDM body bdm_id',        /req\.body\.bdm_id/.test(ctrlSrcAfter));
// Read paths now sign captured_artifacts URLs.
const signCalls = (ctrlSrcAfter.match(/signCaptureArtifacts\(/g) || []).length;
assert('signCaptureArtifacts called in 4 read paths (my, my/review, queue, :id)',
  signCalls >= 4);

assert('route /upload-artifact mounted',                      /\/upload-artifact/.test(routeSrcAfter));
assert('route uses uploadMultiple multer',                    /uploadMultiple\(['"]photos['"]/.test(routeSrcAfter));
assert('route uses processCaptureArtifacts middleware',       /processCaptureArtifacts/.test(routeSrcAfter));

// ── 12. Phase P1.2 Slice 1 — Frontend Quick Capture + Picker ───
section('Phase P1.2 Slice 1 — Frontend Quick Capture + Picker');
const hookSrcP12 = read('frontend/src/erp/hooks/useCaptureSubmissions.js');
const hubSrcP12 = read('frontend/src/erp/pages/mobile/BdmCaptureHub.jsx');
const pickerSrc = read('frontend/src/erp/components/PendingCapturesPicker.jsx');
const expensesSrc = read('frontend/src/erp/pages/Expenses.jsx');
const pickerCss = read('frontend/src/styles/pending-captures-picker.css');
const hubCssP12 = read('frontend/src/styles/capture-hub.css');

// Hook
assert('hook exposes uploadArtifact',                         /uploadArtifact/.test(hookSrcP12));
assert('hook posts to /upload-artifact',                      /\/capture-submissions\/upload-artifact/.test(hookSrcP12));
assert('hook builds FormData with photos field',              /fd\.append\(['"]photos['"]/.test(hookSrcP12));
assert('hook sets multipart/form-data header',                /multipart\/form-data/.test(hookSrcP12));

// BdmCaptureHub — Quick Capture button
assert('BdmCaptureHub renders QuickCaptureButton',            /<QuickCaptureButton/.test(hubSrcP12));
assert('QuickCaptureButton uses workflow_type=UNCATEGORIZED', /workflow_type:\s*['"]UNCATEGORIZED['"]/.test(hubSrcP12));
assert('QuickCaptureButton uses uploadArtifact then createCapture',
  /uploadArtifact[\s\S]+createCapture/.test(hubSrcP12));
assert('QuickCaptureButton handles SCREENSHOT_DETECTED',      /SCREENSHOT_DETECTED/.test(hubSrcP12));

// CaptureModal — replaced data-URL stuffing
assert('CaptureModal accepts onUpload prop',                  /CaptureModal[\s\S]+onUpload/.test(hubSrcP12));
assert('CaptureModal handleSubmit calls onUpload',            /onUpload\(files/.test(hubSrcP12));
// Negative: the legacy "url: previews[i]" data-URL stuffing must be gone.
assert('CaptureModal no longer uses previews[i] as artifact url',
  !/url:\s*previews\[i\]/.test(hubSrcP12));

// Scoped CSS for Quick Capture
assert('capture-hub.css has .ch-quick-capture',               /\.ch-quick-capture\b/.test(hubCssP12));

// PendingCapturesPicker
assert('PendingCapturesPicker file exists',                   pickerSrc.length > 0);
assert('Picker uses useCaptureSubmissions',                   /useCaptureSubmissions/.test(pickerSrc));
assert('Picker calls getProxyQueue with workflow_type',       /getProxyQueue\([\s\S]+workflow_type/.test(pickerSrc));
assert('Picker fetches signed URL → File',                    /new File\(\[blob\]/.test(pickerSrc));
assert('Picker exposes onPick(files, meta) contract',         /onPick\(files,\s*\{[^}]*capture_ids/.test(pickerSrc));
assert('Picker scoped CSS file exists',                       pickerCss.length > 0);
assert('pcp- prefix used (no host-page collision)',           /\.pcp-/.test(pickerCss));

// Expenses page integration
assert('Expenses imports PendingCapturesPicker',              /PendingCapturesPicker/.test(expensesSrc));
assert('Expenses passes EXPENSE/FUEL_ENTRY/UNCATEGORIZED workflowTypes',
  /workflowTypes=\{\[['"]EXPENSE['"][^]+FUEL_ENTRY[^]+UNCATEGORIZED/.test(expensesSrc));
assert('Expenses onPick merges into batchFiles[]',
  /setBatchFiles\(\(prev\)\s*=>[\s\S]{0,200}files/.test(expensesSrc));

// ── Summary ───────────────────────────────────────────────────
const total = pass + fail;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`Healthcheck: ${pass}/${total} PASS\n`);
if (fail > 0) {
  process.stdout.write(`\nFailures:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f}\n`));
  process.exit(1);
}
process.stdout.write(`\n✓ Capture Hub Phase P1.1 + P1.2 Slice 1 contract is intact.\n`);
process.exit(0);
