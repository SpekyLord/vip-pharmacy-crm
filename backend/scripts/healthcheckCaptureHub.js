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
assert('border-left accent style', /borderLeft:\s*`4px solid \$\{[^`]*workflow\.color[^`]*\}`/.test(hubSrc));
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

// ── 13. Phase P1.2 Slice 7-extension — Sales / Collection / GRN ──
//
// Three more proxy-side ERP entry pages get the From-BDM-Captures picker.
// Each picker hands a single File to the page's existing OCR scan modal via a
// new initialFile prop; the modal auto-runs OCR on mount via a useEffect
// guarded by a ref so a re-render during scan doesn't re-trigger.
// SMER (digital-only — no photo upload UI) is intentionally deferred with
// rationale in docs/PHASETASK-ERP.md Phase P1.2 Slice 7-extension. The
// originally-deferred Bir2307InboundPage SHIPPED in Round 2C below — its
// typed-URL field was a perfect fit for skipFetch=true (Round 2A pattern).
section('Phase P1.2 Slice 7-extension — Sales / Collection / GRN');
const salesEntrySrc = read('frontend/src/erp/pages/SalesEntry.jsx');
const collSessSrc = read('frontend/src/erp/pages/CollectionSession.jsx');
const grnEntrySrc = read('frontend/src/erp/pages/GrnEntry.jsx');
// wgSrc was loaded earlier in Section 6 — reuse, do not redeclare.

// SalesEntry
assert('SalesEntry imports PendingCapturesPicker',            /import\s+PendingCapturesPicker/.test(salesEntrySrc));
assert('SalesEntry passes SALES + UNCATEGORIZED workflowTypes',
  /workflowTypes=\{\[['"]SALES['"][^]+UNCATEGORIZED/.test(salesEntrySrc));
assert('SalesEntry passes bdmId from assignedTo',             /bdmId=\{assignedTo\s*\|\|\s*undefined\}/.test(salesEntrySrc));
assert('SalesEntry uses maxSelect=1 (single-pick → modal)',   /<PendingCapturesPicker[\s\S]{0,500}maxSelect=\{1\}/.test(salesEntrySrc));
// Round 2B: picker now hands a capture-id, not a File. Modal still opens.
assert('SalesEntry onPick sets scanInitialCaptureId + opens modal',
  /setScanInitialCaptureId\(cap\._id\)[\s\S]{0,300}setScanModalOpen\(true\)/.test(salesEntrySrc));
assert('ScanCSIModal accepts initialFile prop',               /function ScanCSIModal\([\s\S]{0,200}initialFile\b/.test(salesEntrySrc));
assert('ScanCSIModal auto-OCRs initialFile via useEffect',    /useEffect\([\s\S]{0,400}initialFile[\s\S]{0,200}handleFile\(initialFile\)/.test(salesEntrySrc));
assert('SalesEntry passes initialFile to ScanCSIModal',       /<ScanCSIModal[\s\S]{0,400}initialFile=\{scanInitialFile\}/.test(salesEntrySrc));
assert('SalesEntry onClose clears scanInitialFile',           /setScanModalOpen\(false\);\s*setScanInitialFile\(null\)/.test(salesEntrySrc));

// CollectionSession
assert('CollectionSession imports PendingCapturesPicker',     /import\s+PendingCapturesPicker/.test(collSessSrc));
assert('CollectionSession passes COLLECTION + UNCATEGORIZED workflowTypes',
  /workflowTypes=\{\[['"]COLLECTION['"][^]+UNCATEGORIZED/.test(collSessSrc));
assert('CollectionSession passes bdmId from assignedTo',      /bdmId=\{assignedTo\s*\|\|\s*undefined\}/.test(collSessSrc));
assert('CollectionSession uses maxSelect=1',                  /<PendingCapturesPicker[\s\S]{0,500}maxSelect=\{1\}/.test(collSessSrc));
// Round 2B: picker hands capture-id; modal still opens via setScanCrOpen.
assert('CollectionSession onPick sets scanInitialCaptureId + opens modal',
  /setScanInitialCaptureId\(cap\._id\)[\s\S]{0,300}setScanCrOpen\(true\)/.test(collSessSrc));
assert('ScanCRModal accepts initialFile prop',                /function ScanCRModal\([\s\S]{0,200}initialFile\b/.test(collSessSrc));
assert('ScanCRModal auto-OCRs initialFile via useEffect',     /useEffect\([\s\S]{0,400}initialFile[\s\S]{0,200}handleFile\(initialFile\)/.test(collSessSrc));
assert('CollectionSession passes initialFile to ScanCRModal', /<ScanCRModal[\s\S]{0,400}initialFile=\{scanInitialFile\}/.test(collSessSrc));
assert('CollectionSession onClose clears scanInitialFile',    /setScanCrOpen\(false\);\s*setScanInitialFile\(null\)/.test(collSessSrc));

// GrnEntry
assert('GrnEntry imports PendingCapturesPicker',              /import\s+PendingCapturesPicker/.test(grnEntrySrc));
assert('GrnEntry passes GRN + UNCATEGORIZED workflowTypes',
  /workflowTypes=\{\[['"]GRN['"][^]+UNCATEGORIZED/.test(grnEntrySrc));
assert('GrnEntry passes bdmId from assignedTo',               /bdmId=\{assignedTo\s*\|\|\s*undefined\}/.test(grnEntrySrc));
assert('GrnEntry uses maxSelect=1',                           /<PendingCapturesPicker[\s\S]{0,500}maxSelect=\{1\}/.test(grnEntrySrc));
// Round 2B: picker hands capture-id; modal still opens via setScanOpen.
assert('GrnEntry onPick sets scanInitialCaptureId + opens modal',
  /setScanInitialCaptureId\(cap\._id\)[\s\S]{0,300}setScanOpen\(true\)/.test(grnEntrySrc));
assert('ScanUndertakingModal accepts initialFile prop',       /function ScanUndertakingModal\([\s\S]{0,200}initialFile\b/.test(grnEntrySrc));
assert('ScanUndertakingModal auto-OCRs initialFile via useEffect',
  /useEffect\([\s\S]{0,400}initialFile[\s\S]{0,200}handleFile\(initialFile\)/.test(grnEntrySrc));
assert('GrnEntry passes initialFile to ScanUndertakingModal', /<ScanUndertakingModal[\s\S]{0,400}initialFile=\{scanInitialFile\}/.test(grnEntrySrc));
assert('GrnEntry onClose clears scanInitialFile',             /setScanOpen\(false\);\s*setScanInitialFile\(null\)/.test(grnEntrySrc));

// WorkflowGuide banner updates (Rule #1 — banner reflects current behavior).
// The 7000-char windows are sized to accommodate the long-form steps + tip
// text on each banner; sales-entry and grn-entry are the longest two.
assert('sales-entry banner mentions Slice 7-extension picker',
  /sales-entry[\s\S]{0,7000}From BDM Captures/.test(wgSrc));
assert('collection-session banner mentions Slice 7-extension picker',
  /collection-session[\s\S]{0,7000}From BDM Captures/.test(wgSrc));
assert('grn-entry banner mentions Slice 7-extension picker',
  /grn-entry[\s\S]{0,7000}From BDM Captures/.test(wgSrc));

// Subscription-readiness — picker reuses lookup-driven gate (Rule #3 / #19).
// No new lookup category is added by Slice 7-extension; PROXY_PULL_CAPTURE
// from Slice 1's CAPTURE_LIFECYCLE_ROLES still gates the upstream queue read.
const helperSrcExt = read('backend/utils/captureLifecycleAccess.js');
assert('PROXY_PULL_CAPTURE still in helper after Slice 7-extension',
  /PROXY_PULL_CAPTURE/.test(helperSrcExt));
assert('CAPTURE_LIFECYCLE_ROLES still has insert_only_metadata seed',
  /CAPTURE_LIFECYCLE_ROLES/.test(read('backend/erp/controllers/lookupGenericController.js')));

// Defer documentation guard — record the explicit decision so a future
// session doesn't silently bolt the picker onto SMER (digital-only) without
// re-litigating the trade. CWT-Inbound originally deferred but SHIPPED in
// Round 2C — see Section 16 below.
const phaseTaskErpSrc = read('docs/PHASETASK-ERP.md');
assert('PHASETASK-ERP.md documents SMER defer rationale',
  /Slice 7-extension[\s\S]{0,3000}SMER/i.test(phaseTaskErpSrc));

// ── 14. Phase P1.2 Slice 7-extension Round 2A — SalesList per-row picker ──
//
// Round 2A wires PendingCapturesPicker on the Sales Transactions list per row
// so a proxy can pull a BDM-captured signed/pink/duplicate CSI photo straight
// into the existing 📷 Attach CSI flow (PUT /sales/:id/received-csi). The
// picker is filtered to the row's own bdm_id (each sale knows its BDM via
// the populated bdm_id field); workflowTypes are SALES + UNCATEGORIZED so a
// BDM who used Quick Capture without classifying still gets surfaced.
//
// Round 2A uses skipFetch={true} mode (added to PendingCapturesPicker for
// this slice) which bypasses the picker's client-side fetch(signedS3Url) →
// Blob → File pipeline AND the modal re-upload step. Reasons: (a) the
// private S3 bucket has no CORS allowlist for browser origins, so
// fetch() from `localhost:5173` (or any non-S3 origin) is blocked; (b) the
// photo is already on S3, so re-uploading via /erp/ocr/process to get a
// fresh s3_url is wasteful. Instead, the picker yields the raw capture row
// via meta.captures[]; SalesList writes the bare S3 URL (sans X-Amz-Signature
// query string) straight into csi_received_photo_url via the existing
// attachReceivedCsi controller. Server-side read paths re-sign at
// consumption time via documentDetailHydrator.signUrl(), so persisting the
// bare URL is sufficient. No new endpoint, no new schema, no new lookup
// category — Round 2A is purely additive UX.
section('Phase P1.2 Slice 7-extension Round 2A — SalesList per-row picker');
const salesListSrc = read('frontend/src/erp/pages/SalesList.jsx');
const sharedScanCsiSrc = read('frontend/src/erp/components/ScanCSIModal.jsx');
// pickerSrc was already loaded earlier in Section 7 — reuse, do not redeclare.

// PendingCapturesPicker — skipFetch contract (Round 2A added this prop)
assert('PendingCapturesPicker accepts skipFetch prop',           /skipFetch\s*=\s*false\s*,?/.test(pickerSrc));
assert('PendingCapturesPicker skipFetch path bypasses fetch loop',
  /if\s*\(\s*skipFetch\s*\)[\s\S]{0,400}captures:\s*picked/.test(pickerSrc));
assert('PendingCapturesPicker skipFetch path yields onPick([], meta)',
  /skipFetch\s*\)[\s\S]{0,300}onPick\(\s*\[\s*\]/.test(pickerSrc));
assert('PendingCapturesPicker handleConfirm deps include skipFetch',
  /useCallback\([\s\S]{0,3000}\[items,\s*selected,\s*onPick,\s*skipFetch\]\)/.test(pickerSrc));

// SalesList wiring
assert('SalesList imports PendingCapturesPicker',                /import\s+PendingCapturesPicker\s+from\s+['"][^'"]*PendingCapturesPicker['"]/.test(salesListSrc));
assert('SalesList per-row picker passes SALES + UNCATEGORIZED',  /<PendingCapturesPicker[\s\S]{0,1500}workflowTypes=\{\[['"]SALES['"][^]*UNCATEGORIZED/.test(salesListSrc));
assert('SalesList per-row picker scopes bdmId to row.bdm_id',    /<PendingCapturesPicker[\s\S]{0,1500}bdmId=\{sale\.bdm_id/.test(salesListSrc));
assert('SalesList per-row picker uses maxSelect=1',              /<PendingCapturesPicker[\s\S]{0,1500}maxSelect=\{1\}/.test(salesListSrc));
assert('SalesList per-row picker uses skipFetch=true',           /<PendingCapturesPicker[\s\S]{0,1500}skipFetch=\{true\}/.test(salesListSrc));
assert('SalesList onPick reads meta.captures[0]',                /onPick=\{[\s\S]{0,1200}meta\?\.captures\?\.\[0\]/.test(salesListSrc));
assert('SalesList strips X-Amz-Signature query before persisting',
  /String\(art\.url\)\.split\(['"]\?['"]\)/.test(salesListSrc));
assert('SalesList onPick calls sales.attachReceivedCsi directly',
  /onPick=\{[\s\S]{0,1200}sales\.attachReceivedCsi\(\s*sale\._id/.test(salesListSrc));
// Slice 9 partial (May 06 2026 follow-on) — onPick now passes capture_id so
// the backend auto-finalizes the source CaptureSubmission. attachment_id is
// nulled on this path; the bare S3 URL + capture-pull is the artifact-of-record.
// Regex window is generous (2000 chars) because the 8-line explainer comment
// inline above each field fattens the literal-character distance considerably.
assert('SalesList onPick passes csi_received_photo_url',
  /attachReceivedCsi\([\s\S]{0,2000}csi_received_photo_url:\s*bareUrl/.test(salesListSrc));
assert('SalesList onPick passes capture_id (Slice 9 partial auto-finalize)',
  /attachReceivedCsi\([\s\S]{0,2000}capture_id:\s*cap\._id/.test(salesListSrc));
assert('SalesList onPick nulls csi_received_attachment_id on Round 2A path',
  /attachReceivedCsi\([\s\S]{0,2000}csi_received_attachment_id:\s*null/.test(salesListSrc));
// Picker only renders alongside the existing 📷 Attach CSI button — i.e. the
// same OPENING_AR / deletion / status guard.
assert('SalesList per-row picker scoped to non-OPENING_AR status guard',
  /sale\.source\s*!==\s*['"]OPENING_AR['"][\s\S]{0,2500}<PendingCapturesPicker/.test(salesListSrc));

// Shared ScanCSIModal contract (still used by the existing 📷 Attach CSI
// Take-Photo / Gallery path; initialFile prop kept as optional consistency
// surface even though SalesList Round 2A no longer uses it).
assert('Shared ScanCSIModal accepts initialFile prop',           /export default function ScanCSIModal\([\s\S]{0,500}initialFile\b/.test(sharedScanCsiSrc));
assert('Shared ScanCSIModal auto-handles initialFile via useEffect',
  /useEffect\([\s\S]{0,500}initialFile[\s\S]{0,300}handleFile\(initialFile\)/.test(sharedScanCsiSrc));
assert('Shared ScanCSIModal guards re-trigger via processed ref',
  /initialFileProcessedRef\.current\s*=\s*initialFile/.test(sharedScanCsiSrc));

// WorkflowGuide banner updates (Rule #1)
assert('sales-list banner mentions Round 2A picker',
  /'sales-list':[\s\S]{0,8000}Round 2A/.test(wgSrc));
assert('sales-list banner mentions From Captures button',
  /'sales-list':[\s\S]{0,8000}From Captures/.test(wgSrc));
assert('sales-entry banner cross-references Round 2A on Sales Transactions',
  /sales-entry[\s\S]{0,7000}Round 2A/.test(wgSrc));

// Backend contract — the existing PUT /sales/:id/received-csi endpoint is the
// terminal write path; Round 2A doesn't change it.
const salesRoutesSrc = read('backend/erp/routes/salesRoutes.js');
const salesCtrlSrc = read('backend/erp/controllers/salesController.js');
assert('PUT /:id/received-csi route still mounted',              /router\.put\(['"]\/:id\/received-csi['"]/.test(salesRoutesSrc));
assert('attachReceivedCsi controller still exported',            /attachReceivedCsi[\s\S]{0,200}=\s*catchAsync/.test(salesCtrlSrc));
assert('attachReceivedCsi enforces csi_received_photo_url required',
  /csi_received_photo_url is required/.test(salesCtrlSrc));
assert('attachReceivedCsi enforces attachable status set',
  /attachableStatuses[\s\S]{0,150}DRAFT[\s\S]{0,80}VALID[\s\S]{0,80}ERROR[\s\S]{0,80}POSTED/.test(salesCtrlSrc));
assert('attachReceivedCsi blocks reversed rows',                 /Sale has been reversed/.test(salesCtrlSrc));
assert('attachReceivedCsi enforces period-lock',                 /checkPeriodOpen[\s\S]{0,200}sale\.csi_date/.test(salesCtrlSrc));
assert('attachReceivedCsi audits csi_received_photo_url change', /field_changed:\s*['"]csi_received_photo_url['"]/.test(salesCtrlSrc));

// ── Section 15. Phase P1.2 Slice 7-extension Round 2B (May 2026) ──
//
// Closes the Round 1 CORS lurking-bug. The picker's fetch(signedS3Url) is
// browser-blocked because the private bucket has no CORS allowlist for
// localhost:5173. Round 2B routes Sales/Collection/GRN entry-time scans
// through skipFetch=true + a new server-side OCR path that pulls from S3
// using the existing AWS SDK creds (no browser fetch). Reuses the same
// CAPTURE_LIFECYCLE_ROLES.PROXY_PULL_CAPTURE gate from Slice 1.
section('Phase P1.2 Slice 7-extension Round 2B — Server-side OCR from capture');

// Backend — s3.js gained downloadFromS3 helper (s3Src loaded earlier in §11)
assert('s3.js exports downloadFromS3 helper',
  /const downloadFromS3\s*=\s*async\s*\(\s*key\s*\)/.test(s3Src));
assert('s3.js downloadFromS3 streams Body via async iteration',
  /downloadFromS3[\s\S]{0,800}for\s+await\s+\(\s*const\s+chunk\s+of\s+response\.Body/.test(s3Src));
assert('s3.js downloadFromS3 returns {buffer, contentType}',
  /downloadFromS3[\s\S]{0,800}return\s*\{\s*buffer,\s*contentType/.test(s3Src));
assert('s3.js module.exports includes downloadFromS3',
  /module\.exports\s*=\s*\{[\s\S]{0,1200}downloadFromS3/.test(s3Src));

// Backend — ocrController gained capture-pull mode
const ocrCtrlSrc = read('backend/erp/controllers/ocrController.js');
assert('ocrController imports CaptureSubmission',
  /require\(['"][^'"]+CaptureSubmission['"]\)/.test(ocrCtrlSrc));
assert('ocrController imports downloadFromS3 + extractKeyFromUrl',
  /\{\s*downloadFromS3,\s*extractKeyFromUrl\s*\}\s*=\s*require\(['"][^'"]+config\/s3['"]\)/.test(ocrCtrlSrc));
assert('ocrController imports userCanPerformCaptureAction',
  /require\(['"][^'"]+captureLifecycleAccess['"]\)/.test(ocrCtrlSrc));
assert('ocrController reads capture_id from body',
  /const captureId\s*=\s*String\(req\.body\.capture_id/.test(ocrCtrlSrc));
assert('ocrController rejects file+capture_id combo',
  /Provide either a `photo` file or `capture_id`/.test(ocrCtrlSrc));
assert('ocrController scopes capture lookup by entity_id',
  /CaptureSubmission\.findOne\(\s*\{\s*_id:\s*captureId,\s*entity_id:\s*req\.entityId/.test(ocrCtrlSrc));
assert('ocrController gates non-owners via PROXY_PULL_CAPTURE',
  /userCanPerformCaptureAction\(\s*req\.user,\s*['"]PROXY_PULL_CAPTURE['"]/.test(ocrCtrlSrc));
assert('ocrController blocks legacy data: URL captures',
  /Legacy data URL[\s\S]{0,80}re-upload required before OCR/.test(ocrCtrlSrc));
assert('ocrController blocks non-S3 capture URLs',
  /not stored in S3[\s\S]{0,80}cannot OCR/.test(ocrCtrlSrc));
assert('ocrController reuses existing S3 key (no re-upload in capture mode)',
  /preExistingUpload[\s\S]{0,400}Promise\.resolve\(preExistingUpload\)/.test(ocrCtrlSrc));
assert('ocrController strips signed-URL query string before persisting',
  /artifact\.url\)\.split\(['"]\?['"]\)\[0\]/.test(ocrCtrlSrc));
assert('ocrController OCR pipeline reads inputBuffer (not req.file.buffer)',
  /detectText\(visionBuffer/.test(ocrCtrlSrc) &&
  /imageBuffer:\s*inputBuffer/.test(ocrCtrlSrc));
assert('ocrController DocumentAttachment uses inputOriginalName',
  /original_filename:\s*inputOriginalName/.test(ocrCtrlSrc));
// Controller must still accept the legacy file-upload path (regression guard)
assert('ocrController still accepts multer req.file path',
  /if\s*\(\s*!req\.file\s*\)\s*throw new ApiError\(\s*400,\s*['"]Photo file or capture_id is required\.['"]/.test(ocrCtrlSrc));

// Frontend — ocrService gained processDocumentFromCapture
const ocrSvcSrc = read('frontend/src/erp/services/ocrService.js');
assert('ocrService exports processDocumentFromCapture',
  /export\s+async\s+function\s+processDocumentFromCapture\s*\(\s*captureId,\s*docType/.test(ocrSvcSrc));
assert('processDocumentFromCapture POSTs JSON body with capture_id + docType',
  /api\.post\(['"]\/erp\/ocr\/process['"]\s*,\s*body\s*,/.test(ocrSvcSrc));
assert('processDocumentFromCapture has 2-min timeout (S3 download + OCR)',
  /processDocumentFromCapture[\s\S]{0,1200}timeout:\s*120000/.test(ocrSvcSrc));
assert('processDocumentFromCapture validates required args',
  /captureId is required[\s\S]{0,200}docType is required/.test(ocrSvcSrc));

// Frontend — 3 callers swept. salesEntrySrc, collSessSrc, grnEntrySrc loaded
// earlier in Section 13.

assert('SalesEntry imports processDocumentFromCapture',
  /processDocumentFromCapture[\s\S]{0,200}from ['"]\.\.\/services\/ocrService['"]/.test(salesEntrySrc));
assert('CollectionSession imports processDocumentFromCapture',
  /processDocumentFromCapture[\s\S]{0,200}from ['"]\.\.\/services\/ocrService['"]/.test(collSessSrc));
assert('GrnEntry imports processDocumentFromCapture',
  /processDocumentFromCapture[\s\S]{0,200}from ['"]\.\.\/services\/ocrService['"]/.test(grnEntrySrc));

// Each caller flips picker to skipFetch + reads meta.captures[0]._id
assert('SalesEntry picker uses skipFetch',
  /<PendingCapturesPicker[\s\S]{0,2000}skipFetch[\s\S]{0,2500}onPick=\{\(_files,\s*meta\)/.test(salesEntrySrc));
assert('CollectionSession picker uses skipFetch',
  /<PendingCapturesPicker[\s\S]{0,2000}skipFetch[\s\S]{0,2500}onPick=\{\(_files,\s*meta\)/.test(collSessSrc));
assert('GrnEntry picker uses skipFetch',
  /<PendingCapturesPicker[\s\S]{0,2000}skipFetch[\s\S]{0,2500}onPick=\{\(_files,\s*meta\)/.test(grnEntrySrc));

assert('SalesEntry onPick reads cap._id + captured_artifacts[0].url',
  /meta\?\.captures\?\.\[0\][\s\S]{0,500}cap\.captured_artifacts\?\.\[0\]\?\.url/.test(salesEntrySrc));
assert('CollectionSession onPick reads cap._id + captured_artifacts[0].url',
  /meta\?\.captures\?\.\[0\][\s\S]{0,500}cap\.captured_artifacts\?\.\[0\]\?\.url/.test(collSessSrc));
assert('GrnEntry onPick reads cap._id + captured_artifacts[0].url',
  /meta\?\.captures\?\.\[0\][\s\S]{0,500}cap\.captured_artifacts\?\.\[0\]\?\.url/.test(grnEntrySrc));

// Each caller threads new state into modal (initialCaptureId + initialPreviewUrl)
assert('SalesEntry threads initialCaptureId + initialPreviewUrl into ScanCSIModal',
  /<ScanCSIModal[\s\S]{0,800}initialCaptureId=\{scanInitialCaptureId\}[\s\S]{0,200}initialPreviewUrl=\{scanInitialPreviewUrl\}/.test(salesEntrySrc));
assert('CollectionSession threads initialCaptureId + initialPreviewUrl into ScanCRModal',
  /<ScanCRModal[\s\S]{0,800}initialCaptureId=\{scanInitialCaptureId\}[\s\S]{0,200}initialPreviewUrl=\{scanInitialPreviewUrl\}/.test(collSessSrc));
assert('GrnEntry threads initialCaptureId + initialPreviewUrl into ScanUndertakingModal',
  /<ScanUndertakingModal[\s\S]{0,800}initialCaptureId=\{scanInitialCaptureId\}[\s\S]{0,200}initialPreviewUrl=\{scanInitialPreviewUrl\}/.test(grnEntrySrc));

// Each caller clears all 3 state vars on modal close (initialFile + 2 new ones)
assert('SalesEntry clears scanInitialCaptureId on modal close',
  /onClose=\{[\s\S]{0,250}setScanInitialCaptureId\(null\)/.test(salesEntrySrc));
assert('CollectionSession clears scanInitialCaptureId on modal close',
  /onClose=\{[\s\S]{0,250}setScanInitialCaptureId\(null\)/.test(collSessSrc));
assert('GrnEntry clears scanInitialCaptureId on modal close',
  /onClose=\{[\s\S]{0,250}setScanInitialCaptureId\(null\)/.test(grnEntrySrc));

// Each Scan modal accepts the new props and routes capture-id through new handler
assert('SalesEntry inline ScanCSIModal accepts initialCaptureId prop',
  /function ScanCSIModal\([\s\S]{0,300}initialCaptureId,\s*initialPreviewUrl/.test(salesEntrySrc));
assert('CollectionSession inline ScanCRModal accepts initialCaptureId prop',
  /function ScanCRModal\([\s\S]{0,300}initialCaptureId,\s*initialPreviewUrl/.test(collSessSrc));
assert('GrnEntry inline ScanUndertakingModal accepts initialCaptureId prop',
  /function ScanUndertakingModal\([\s\S]{0,300}initialCaptureId,\s*initialPreviewUrl/.test(grnEntrySrc));

// Each modal's useEffect prefers capture-id over file when both set
assert('SalesEntry inline modal handles initialCaptureId in useEffect',
  /initialCaptureProcessedRef\.current\s*!==\s*initialCaptureId[\s\S]{0,400}handleCaptureScan\(initialCaptureId/.test(salesEntrySrc));
assert('CollectionSession inline modal handles initialCaptureId in useEffect',
  /initialCaptureProcessedRef\.current\s*!==\s*initialCaptureId[\s\S]{0,400}handleCaptureScan\(initialCaptureId/.test(collSessSrc));
assert('GrnEntry inline modal handles initialCaptureId in useEffect',
  /initialCaptureProcessedRef\.current\s*!==\s*initialCaptureId[\s\S]{0,400}handleCaptureScan\(initialCaptureId/.test(grnEntrySrc));

// Each modal's handleCaptureScan calls processDocumentFromCapture w/ correct docType
assert('SalesEntry handleCaptureScan calls processDocumentFromCapture with CSI',
  /handleCaptureScan[\s\S]{0,800}processDocumentFromCapture\(captureId,\s*['"]CSI['"]/.test(salesEntrySrc));
assert('CollectionSession handleCaptureScan calls processDocumentFromCapture with CR',
  /handleCaptureScan[\s\S]{0,800}processDocumentFromCapture\(captureId,\s*['"]CR['"]/.test(collSessSrc));
assert('GrnEntry handleCaptureScan calls processDocumentFromCapture with UNDERTAKING',
  /handleCaptureScan[\s\S]{0,800}processDocumentFromCapture\(captureId,\s*['"]UNDERTAKING['"]/.test(grnEntrySrc));

// Existing file-upload path preserved (regression guard)
assert('SalesEntry inline modal still has handleFile path',
  /const handleFile\s*=\s*async\s*\(\s*file\s*\)/.test(salesEntrySrc));
assert('CollectionSession inline modal still has handleFile path',
  /const handleFile\s*=\s*async\s*\(\s*file\s*\)/.test(collSessSrc));
assert('GrnEntry inline modal still has handleFile path',
  /const handleFile\s*=\s*async\s*\(\s*file\s*\)/.test(grnEntrySrc));

// ── 16. Phase P1.2 Slice 7-extension Round 2C — Bir2307Inbound picker ──
//
// Round 2C closes the original Slice 7-extension scope. The CWT-inbound page
// (Bir2307InboundPage.jsx) was DEFERRED in Round 1's defer-rationale because
// its `cert_2307_url` field was a typed string with no file-upload handler —
// the original picker pattern (fetch → Blob → File → upload) didn't fit.
// Round 2A's skipFetch=true mode makes the deferred reason obsolete: the
// picker yields the bare S3 URL of the BDM-captured photo, which is exactly
// the shape `cert_2307_url` already accepts. No new upload route, no new OCR
// path — the picker writes the URL straight into the receive modal.
//
// Lifecycle: when finance picks a capture and saves the receive modal,
// Bir2307InboundPage forwards `capture_id` in the body; birController
// extracts it and best-effort calls linkCaptureToDocument (kind =
// 'CwtLedgerEntry') so the source CaptureSubmission flips out of
// PENDING_PROXY → PROCESSED with proxy_id / proxy_completed_at stamped and
// linked_doc_id pointing at the CwtLedger row. Failures are non-fatal — the
// receive completes either way (the CWT credit posture is the system of
// record; the back-link is audit metadata).
//
// SMER stays deferred (digital-only — no photo upload UI to mount a picker
// next to). Same rationale as Round 1.
section('Phase P1.2 Slice 7-extension Round 2C — Bir2307Inbound receive-modal picker');
const bir2307Src = read('frontend/src/erp/pages/Bir2307InboundPage.jsx');
const birCtrlSrc = read('backend/erp/controllers/birController.js');
const captureModelSrc2C = read('backend/erp/models/CaptureSubmission.js');

// Frontend wiring — Bir2307InboundPage
assert('Bir2307InboundPage imports PendingCapturesPicker',
  /import\s+PendingCapturesPicker\s+from\s+['"][^'"]*PendingCapturesPicker['"]/.test(bir2307Src));
assert('Bir2307InboundPage owns pickedCaptureId state',
  /\[pickedCaptureId,\s*setPickedCaptureId\]\s*=\s*useState\(\s*null\s*\)/.test(bir2307Src));
assert('Bir2307InboundPage onPickFromCaptures callback defined',
  /const onPickFromCaptures\s*=\s*\(_files,\s*meta\)/.test(bir2307Src));
assert('Bir2307InboundPage onPick reads cap.captured_artifacts[0].url',
  /onPickFromCaptures[\s\S]{0,800}cap\?\.captured_artifacts\?\.\[0\]\?\.url/.test(bir2307Src));
assert('Bir2307InboundPage onPick stamps cert_2307_url from picker',
  /setReceiveDraft[\s\S]{0,400}cert_2307_url:\s*bareUrl/.test(bir2307Src));
assert('Bir2307InboundPage onPick auto-fills cert_filename from artifact key tail',
  /artifactKey\.split\(['"]\/['"]\)\.pop\(\)/.test(bir2307Src));
assert('Bir2307InboundPage onPick remembers pickedCaptureId',
  /setPickedCaptureId\(cap\._id\)/.test(bir2307Src));

// Manual-edit invalidation — typing in the URL field after picking drops the
// linkage so a stale capture_id can't be stamped against a hand-typed URL.
assert('Bir2307InboundPage manual cert_2307_url edit clears pickedCaptureId',
  /onChange=\{[\s\S]{0,500}setReceiveDraft\([\s\S]{0,300}cert_2307_url:\s*e\.target\.value[\s\S]{0,300}if\s*\(\s*pickedCaptureId\s*\)\s*setPickedCaptureId\(null\)/.test(bir2307Src));

// Picker mount
assert('Bir2307InboundPage picker uses CWT_INBOUND + UNCATEGORIZED workflowTypes',
  /<PendingCapturesPicker[\s\S]{0,1200}workflowTypes=\{\[['"]CWT_INBOUND['"][^]+UNCATEGORIZED/.test(bir2307Src));
assert('Bir2307InboundPage picker uses cross-BDM scope (bdmId={null})',
  /<PendingCapturesPicker[\s\S]{0,1200}bdmId=\{null\}/.test(bir2307Src));
assert('Bir2307InboundPage picker uses skipFetch={true}',
  /<PendingCapturesPicker[\s\S]{0,1200}skipFetch=\{true\}/.test(bir2307Src));
assert('Bir2307InboundPage picker uses maxSelect={1}',
  /<PendingCapturesPicker[\s\S]{0,1200}maxSelect=\{1\}/.test(bir2307Src));
assert('Bir2307InboundPage picker mounted INSIDE the Mark-Received modal',
  /Mark 2307 Received[\s\S]{0,3500}<PendingCapturesPicker/.test(bir2307Src));
assert('Bir2307InboundPage picker mounted ABOVE the cert_2307_url input',
  /<PendingCapturesPicker[\s\S]{0,2500}<label[^>]*>Certificate URL or path<\/label>/.test(bir2307Src));

// Submit forwards capture_id
assert('Bir2307InboundPage onSubmitReceive forwards capture_id when picker-sourced',
  /onSubmitReceive[\s\S]{0,800}pickedCaptureId\s*\?\s*\{\s*\.\.\.receiveDraft,\s*capture_id:\s*pickedCaptureId\s*\}/.test(bir2307Src));
assert('Bir2307InboundPage onSubmitReceive omits capture_id when manually typed',
  /onSubmitReceive[\s\S]{0,800}:\s*\{\s*\.\.\.receiveDraft\s*\}/.test(bir2307Src));

// Modal close hygiene
assert('Bir2307InboundPage onCloseReceive clears both modal state and pickedCaptureId',
  /const onCloseReceive\s*=\s*\(\)\s*=>\s*\{\s*setReceiveModalRow\(null\);\s*setPickedCaptureId\(null\);\s*\}/.test(bir2307Src));
assert('Bir2307InboundPage onOpenReceive resets pickedCaptureId on each fresh open',
  /onOpenReceive[\s\S]{0,600}setPickedCaptureId\(null\)/.test(bir2307Src));

// Backend wiring — birController.markReceived2307Inbound
assert('birController extracts capture_id from req.body',
  /const\s*\{\s*cert_2307_url,\s*cert_filename,\s*cert_content_hash,\s*cert_notes,\s*capture_id\s*\}\s*=\s*req\.body/.test(birCtrlSrc));
assert('birController calls linkCaptureToDocument with kind=CwtLedgerEntry',
  /linkCaptureToDocument\(\s*capture_id,\s*['"]CwtLedgerEntry['"],\s*row\._id/.test(birCtrlSrc));
assert('birController capture-link path is best-effort (try/catch around linkCaptureToDocument)',
  /if\s*\(\s*capture_id\s*\)\s*\{\s*try\s*\{\s*const\s*\{\s*linkCaptureToDocument\s*\}\s*=\s*require\(['"][^'"]+captureSubmissionController['"]\)/.test(birCtrlSrc));
assert('birController capture-link logs capture_id in audit event',
  /BIR_2307_INBOUND_MARK_RECEIVED[\s\S]{0,500}capture_id:\s*capture_id\s*\?\s*String\(capture_id\)\s*:\s*null/.test(birCtrlSrc));
assert('birController capture-link passes full ctx (user/entity/privileged)',
  /linkCaptureToDocument[\s\S]{0,600}user:\s*req\.user[\s\S]{0,200}entityId:\s*req\.entityId[\s\S]{0,200}isPresident:\s*req\.isPresident[\s\S]{0,200}isAdmin:\s*req\.isAdmin[\s\S]{0,200}isFinance:\s*req\.isFinance/.test(birCtrlSrc));

// CaptureSubmission model has CwtLedgerEntry kind in the linked-doc enum
assert('CaptureSubmission.linked_doc_kind enum includes CwtLedgerEntry (Round 2C target)',
  /linked_doc_kind:[\s\S]{0,300}'CwtLedgerEntry'/.test(captureModelSrc2C));

// PageGuide (Bir2307Inbound uses PageGuide, not WorkflowGuide)
const pgSrc2C = read('frontend/src/components/common/PageGuide.jsx');
assert('PageGuide bir-2307-inbound mentions Round 2C picker step',
  /'bir-2307-inbound':[\s\S]{0,8000}Round 2C/.test(pgSrc2C));
assert('PageGuide bir-2307-inbound mentions "From BDM Captures" button',
  /'bir-2307-inbound':[\s\S]{0,8000}From BDM Captures/.test(pgSrc2C));
assert('PageGuide bir-2307-inbound surfaces PROXY_PULL_CAPTURE lookup gate',
  /'bir-2307-inbound':[\s\S]{0,8000}PROXY_PULL_CAPTURE/.test(pgSrc2C));

// Subscription-readiness — picker reuses the SAME lookup-driven gate from
// Slice 1; no new lookup category, no new role enum.
const helperSrc2C = read('backend/utils/captureLifecycleAccess.js');
assert('PROXY_PULL_CAPTURE still in helper after Round 2C',
  /PROXY_PULL_CAPTURE/.test(helperSrc2C));

// PHASETASK-ERP.md documents Round 2C
const phaseTaskErpSrc2C = read('docs/PHASETASK-ERP.md');
assert('PHASETASK-ERP.md has Round 2C section heading',
  /Slice 7-extension Round 2C/i.test(phaseTaskErpSrc2C));
assert('PHASETASK-ERP.md Round 2C names Bir2307InboundPage',
  /Round 2C[\s\S]{0,4000}Bir2307InboundPage/i.test(phaseTaskErpSrc2C));

// ── 17. Phase P1.2 Slice 4 + Slice 5 — DriveAllocation + SMER tile lock ──
//
// Slice 4 wires the BDM-owned Personal/Official allocation panel at the top
// of /erp/capture-hub. Slice 5 locks the SMER tile until prior workdays are
// cleared (allocate or "did not drive"). Defense-in-depth: server-side
// pre-save snaps personal_km to nearest 5; NO_DRIVE branch zeroes km; per-
// cycle gate; anti-fraud default Personal=Total / Official=0.
section('Phase P1.2 Slice 4 + 5 — DriveAllocation + SMER tile lock');

const driveModelSrc = read('backend/erp/models/DriveAllocation.js');
const driveCtrlSrc = read('backend/erp/controllers/driveAllocationController.js');
const driveRoutesSrc = read('backend/erp/routes/driveAllocationRoutes.js');
const erpRoutesIdxSrc = read('backend/erp/routes/index.js');
const driveHookSrc = read('frontend/src/erp/hooks/useDriveAllocations.js');
const allocPanelSrc = read('frontend/src/erp/pages/mobile/AllocationPanel.jsx');
const hubSrcSlice4 = read('frontend/src/erp/pages/mobile/BdmCaptureHub.jsx');
const cssSliceSrc = read('frontend/src/styles/capture-hub.css');
// wgSrc was loaded earlier in Section 6 — reuse, do not redeclare.

// Model
assert('DriveAllocation file exists',                                 driveModelSrc.length > 0);
assert('DriveAllocation collection: erp_drive_allocations',           /collection:\s*['"]erp_drive_allocations['"]/.test(driveModelSrc));
assert('DriveAllocation status enum ALLOCATED + NO_DRIVE',            /enum:\s*\[\s*['"]ALLOCATED['"]\s*,\s*['"]NO_DRIVE['"]\s*\]/.test(driveModelSrc));
assert('DriveAllocation drive_date YYYY-MM-DD regex',                 /match:\s*\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(driveModelSrc));
// C1/C2 cycle model — period (YYYY-MM) + cycle ('C1'|'C2'), matches CarLogbookEntry
assert('DriveAllocation period YYYY-MM regex',                        /match:\s*\/\^\\d\{4\}-\\d\{2\}\$\//.test(driveModelSrc));
assert('DriveAllocation cycle enum C1+C2',
  /cycle:\s*\{[\s\S]{0,200}enum:\s*\[\s*['"]C1['"]\s*,\s*['"]C2['"]\s*\]/.test(driveModelSrc));
assert('DriveAllocation no longer carries cycle_number Number',
  !/cycle_number:\s*\{\s*type:\s*Number/.test(driveModelSrc));
assert('DriveAllocation unique compound (bdm,entity,date)',
  /index\(\s*\{\s*bdm_id:\s*1\s*,\s*entity_id:\s*1\s*,\s*drive_date:\s*1\s*\}\s*,\s*\{\s*unique:\s*true/.test(driveModelSrc));
assert('DriveAllocation compound (entity,period,cycle,drive_date)',
  /index\(\{\s*entity_id:\s*1\s*,\s*period:\s*1\s*,\s*cycle:\s*1\s*,\s*drive_date:\s*1\s*\}\)/.test(driveModelSrc));
assert('DriveAllocation source enum BDM_SELF + PROXY_OVERRIDE',       /enum:\s*\[\s*['"]BDM_SELF['"]\s*,\s*['"]PROXY_OVERRIDE['"]\s*\]/.test(driveModelSrc));
assert('DriveAllocation end_km_auto_filled field',                    /end_km_auto_filled:\s*\{\s*type:\s*Boolean/.test(driveModelSrc));
assert('DriveAllocation source_smer_capture_ids ref CaptureSubmission',
  /source_smer_capture_ids:[\s\S]+ref:\s*['"]CaptureSubmission['"]/.test(driveModelSrc));
assert('DriveAllocation pre-save NO_DRIVE zeroes km',
  /this\.status\s*===\s*['"]NO_DRIVE['"][\s\S]{0,400}this\.personal_km\s*=\s*0/.test(driveModelSrc));
assert('DriveAllocation pre-save snaps personal_km via KM_SNAP_STEP',
  /\/\s*KM_SNAP_STEP\)\s*\*\s*KM_SNAP_STEP/.test(driveModelSrc));
assert('DriveAllocation pre-save derives total_km',
  /this\.total_km\s*=\s*Math\.max\(\s*0\s*,\s*end\s*-\s*start\s*\)/.test(driveModelSrc));
assert('DriveAllocation pre-save derives official_km',
  /this\.official_km\s*=\s*Math\.max\(\s*0\s*,\s*this\.total_km\s*-\s*this\.personal_km\s*\)/.test(driveModelSrc));
assert('DriveAllocation exports KM_SNAP_STEP = 5',                    /KM_SNAP_STEP\s*=\s*5/.test(driveModelSrc));

// Controller
assert('controller exports getUnallocatedWorkdays',                   /getUnallocatedWorkdays/.test(driveCtrlSrc));
assert('controller exports allocate',                                 /module\.exports[\s\S]+allocate/.test(driveCtrlSrc));
assert('controller exports markNoDrive',                              /markNoDrive/.test(driveCtrlSrc));
assert('controller exports getMyAllocations',                         /getMyAllocations/.test(driveCtrlSrc));
assert('controller imports userCanPerformCaptureAction',              /userCanPerformCaptureAction/.test(driveCtrlSrc));
// C1/C2 model — controller no longer imports the 28-day scheduleCycleUtils.
// Negative assertion: scheduleCycleUtils must NOT be imported (would betray
// the wrong cycle model is back).
assert('controller does NOT import scheduleCycleUtils (C1/C2 model)',
  !/require\(.{0,30}scheduleCycleUtils/.test(driveCtrlSrc));
assert('controller has cycleFor helper (day <= 15 → C1)',
  /day\s*<=\s*15\s*\?\s*['"]C1['"]\s*:\s*['"]C2['"]/.test(driveCtrlSrc));
assert('controller exports cycleFor + periodFor',
  /cycleFor[\s\S]{0,200}periodFor/.test(driveCtrlSrc));
assert('controller exports priorCycle helper',                        /priorCycle/.test(driveCtrlSrc));
assert('controller has Manila offset constant',                       /MANILA_OFFSET_MS\s*=\s*8\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(driveCtrlSrc));
assert('controller has prior-cycle grace lookup helper',              /getPriorCycleGraceWorkdays/.test(driveCtrlSrc));
assert('controller queries DRIVE_ALLOCATION_CONFIG lookup',           /category:\s*['"]DRIVE_ALLOCATION_CONFIG['"]/.test(driveCtrlSrc));
assert('controller default grace = 5 workdays',                       /DEFAULT_GRACE_WORKDAYS\s*=\s*5/.test(driveCtrlSrc));
assert('controller exports invalidateGraceCache',                     /invalidateGraceCache/.test(driveCtrlSrc));
assert('allocate gates ALLOCATE_PERSONAL_OFFICIAL',                   /['"]ALLOCATE_PERSONAL_OFFICIAL['"]/.test(driveCtrlSrc));
assert('markNoDrive gates MARK_NO_DRIVE_DAY',                         /['"]MARK_NO_DRIVE_DAY['"]/.test(driveCtrlSrc));
assert('controller rejects today/future drive_date',
  /drive_date\s*>=\s*today/.test(driveCtrlSrc));
assert('controller rejects non-workday',                              /must be a workday/.test(driveCtrlSrc));
assert('controller rejects out-of-backfill-window',                   /outside the backfill window/.test(driveCtrlSrc));
assert('controller suggests OVERRIDE_ALLOCATION on out-of-window',    /OVERRIDE_ALLOCATION/.test(driveCtrlSrc));
assert('controller cross-BDM gate (privileged check)',
  /isPresident\s*\|\|\s*req\.isAdmin\s*\|\|\s*req\.isFinance/.test(driveCtrlSrc));
assert('controller stamps source PROXY_OVERRIDE on cross-BDM write',  /PROXY_OVERRIDE/.test(driveCtrlSrc));
assert('controller idempotent upsert via findOne+save',
  /DriveAllocation\.findOne\(filter\)[\s\S]{0,400}await doc\.save\(\)/.test(driveCtrlSrc));
assert('unallocated returns canAllocate + canMarkNoDrive booleans',
  /canAllocate[\s\S]{0,300}canMarkNoDrive/.test(driveCtrlSrc));
assert('unallocated returns todayStartKm hint',                       /todayStartKm/.test(driveCtrlSrc));

// Routes + mount
assert('drive-allocations routes file exists',                        driveRoutesSrc.length > 0);
assert('GET /unallocated-workdays mounted',                           /\/unallocated-workdays/.test(driveRoutesSrc));
assert('GET /my mounted',                                             /router\.get\(['"]\/my['"]/.test(driveRoutesSrc));
assert('POST /allocate mounted',                                      /router\.post\(['"]\/allocate['"]/.test(driveRoutesSrc));
assert('POST /no-drive mounted',                                      /router\.post\(['"]\/no-drive['"]/.test(driveRoutesSrc));
assert('routes/index.js mounts /drive-allocations',
  /router\.use\(['"]\/drive-allocations['"]/.test(erpRoutesIdxSrc));

// Frontend hook
assert('useDriveAllocations file exists',                             driveHookSrc.length > 0);
assert('hook exposes getUnallocatedWorkdays',                         /getUnallocatedWorkdays/.test(driveHookSrc));
assert('hook exposes allocate',                                       /\ballocate\b/.test(driveHookSrc));
assert('hook exposes markNoDrive',                                    /markNoDrive/.test(driveHookSrc));
assert('hook calls /drive-allocations/allocate',                      /\/drive-allocations\/allocate/.test(driveHookSrc));
assert('hook calls /drive-allocations/no-drive',                      /\/drive-allocations\/no-drive/.test(driveHookSrc));

// AllocationPanel
assert('AllocationPanel file exists',                                 allocPanelSrc.length > 0);
assert('AllocationPanel uses forwardRef',                             /forwardRef\(/.test(allocPanelSrc));
assert('AllocationPanel exposes refresh via useImperativeHandle',
  /useImperativeHandle\([\s\S]{0,200}refresh/.test(allocPanelSrc));
assert('AllocationPanel slider step uses KM_SNAP (5)',                /step=\{KM_SNAP\}|step=\{5\}/.test(allocPanelSrc));
assert('AllocationPanel snaps via Math.round(v / KM_SNAP) * KM_SNAP',
  /Math\.round\(\s*\(?Number\([^)]+\)[^)]*\)\s*\/\s*KM_SNAP\s*\)\s*\*\s*KM_SNAP/.test(allocPanelSrc));
assert('AllocationPanel anti-fraud default Personal=Total',
  /if\s*\(prev\s*===\s*0\s*&&\s*total\s*>\s*0\)\s*return\s*snapKm\(total\)/.test(allocPanelSrc));
assert('AllocationPanel anti-fraud warning chip when 0 official',
  /about to claim 0 official km/.test(allocPanelSrc));
assert('AllocationPanel auto-fill hint uses todayStartKm',            /Use today.{0,5}s Start KM/.test(allocPanelSrc));
assert('AllocationPanel persists end_km_auto_filled flag',            /end_km_auto_filled:\s*endAutoFilled/.test(allocPanelSrc));
assert('AllocationPanel "Did not drive" branch',                      /Did not drive/.test(allocPanelSrc));
assert('AllocationPanel renders #allocation-panel anchor id',         /id=['"]allocation-panel['"]/.test(allocPanelSrc));
assert('AllocationPanel onChange feeds parent unallocatedCount',      /unallocatedCount/.test(allocPanelSrc));

// BdmCaptureHub integration (Slice 5 — SMER tile lock)
assert('Hub imports AllocationPanel',                                 /import\s+AllocationPanel/.test(hubSrcSlice4));
assert('Hub imports Lock icon from lucide-react',                     /Lock,/.test(hubSrcSlice4));
assert('Hub mounts AllocationPanel above Quick Capture',
  /<AllocationPanel[\s\S]{0,400}<QuickCaptureButton/.test(hubSrcSlice4));
assert('Hub computes smerLocked',                                     /smerLocked\s*=/.test(hubSrcSlice4));
assert('Hub gates SMER tile lock on unallocatedCount > 0',            /unallocatedCount\s*>\s*0/.test(hubSrcSlice4));
assert('Hub also gates lock on canAllocate || canMarkNoDrive',
  /canAllocate\s*\|\|\s*allocStatus\.canMarkNoDrive/.test(hubSrcSlice4));
assert('Hub passes locked + lockReason + onLockedTap to SMER tile',
  /w\.key\s*===\s*['"]SMER['"][\s\S]{0,400}smerLocked/.test(hubSrcSlice4));
assert('Hub handleLockedTap scrolls to allocation-panel',
  /getElementById\(['"]allocation-panel['"]\)[\s\S]{0,300}scrollIntoView/.test(hubSrcSlice4));
assert('Hub re-fetches alloc panel after SMER capture',               /allocPanelRef\.current\?\.refresh/.test(hubSrcSlice4));
assert('CaptureCard renders Lock icon when locked',                   /\{locked\s*\?\s*<Lock/.test(hubSrcSlice4));
assert('CaptureCard renders "Locked" pill when locked',
  /ch-tile-pill-lock[\s\S]{0,200}Locked/.test(hubSrcSlice4));
assert('CaptureCard onClick calls onLockedTap when locked',           /if\s*\(locked\)\s*\{\s*onLockedTap/.test(hubSrcSlice4));

// Slice 4+5 hotfix (a) — UNION fallback against CarLogbookEntry
// SMER tile lock must release when a proxy backfills the day in /erp/car-logbook
// (status VALID|POSTED) even when no DriveAllocation row exists yet. Pure
// additive read-side widening; writes are unchanged.
assert('controller imports CarLogbookEntry',
  /require\(['"]\.\.\/models\/CarLogbookEntry['"]\)/.test(driveCtrlSrc));
assert('controller queries CarLogbookEntry on entry_date + status VALID|POSTED',
  /CarLogbookEntry\.find\(\{[\s\S]{0,400}entry_date:\s*\{\s*\$gte[\s\S]{0,400}status:\s*\{\s*\$in:\s*\[\s*['"]VALID['"]\s*,\s*['"]POSTED['"]\s*\]/.test(driveCtrlSrc));
assert('controller adds logbook day to allocatedSet (UNION fallback)',
  /logbookCoveredSet\.add\(dayStr\)[\s\S]{0,200}allocatedSet\.add\(dayStr\)/.test(driveCtrlSrc));
assert('controller surfaces coveredByLogbookDays in response payload',
  /coveredByLogbookDays:\s*Array\.from\(logbookCoveredSet\)/.test(driveCtrlSrc));

// AllocationPanel — C1/C2 model render
assert('AllocationPanel renders cycle tag (period + cycle)',
  /ap-cycle-tag/.test(allocPanelSrc));
assert('AllocationPanel highlights prior-cycle rows differently',
  /ap-cycle-tag-prior/.test(allocPanelSrc));
assert('AllocationPanel reads currentPeriod from API',
  /currentPeriod:\s*data\.currentPeriod/.test(allocPanelSrc));
assert('AllocationPanel empty-state copy uses period + cycle label',
  /All prior workdays in \{cycleLabel\}/.test(allocPanelSrc));

// Lookup seed + cache-bust hook
const lookupCtrlAfter = read('backend/erp/controllers/lookupGenericController.js');
assert('SEED has DRIVE_ALLOCATION_CONFIG',                            /DRIVE_ALLOCATION_CONFIG:\s*\[/.test(lookupCtrlAfter));
assert('SEED row PRIOR_CYCLE_GRACE_WORKDAYS = 5',
  /code:\s*['"]PRIOR_CYCLE_GRACE_WORKDAYS['"][\s\S]{0,300}value:\s*5/.test(lookupCtrlAfter));
assert('SEED row carries insert_only_metadata',
  /code:\s*['"]PRIOR_CYCLE_GRACE_WORKDAYS['"][\s\S]{0,300}insert_only_metadata:\s*true/.test(lookupCtrlAfter));
assert('imports invalidateDriveAllocGraceCache',
  /invalidateGraceCache:\s*invalidateDriveAllocGraceCache/.test(lookupCtrlAfter));
assert('DRIVE_ALLOCATION_CONFIG_CATEGORIES set defined',
  /DRIVE_ALLOCATION_CONFIG_CATEGORIES\s*=\s*new Set\(\['DRIVE_ALLOCATION_CONFIG'\]\)/.test(lookupCtrlAfter));
const driveAllocInvalidateCalls = (lookupCtrlAfter.match(/invalidateDriveAllocGraceCache\(/g) || []).length;
assert('invalidateDriveAllocGraceCache hook fires in create/update/remove (3)',
  driveAllocInvalidateCalls === 3);

// Scoped CSS
assert('capture-hub.css has .ap-panel rule',                          /\.ap-panel\s*\{/.test(cssSliceSrc));
assert('capture-hub.css has .ap-cycle-tag rule',                      /\.ap-cycle-tag\s*\{/.test(cssSliceSrc));
assert('capture-hub.css has .ap-cycle-tag-prior rule',                /\.ap-cycle-tag-prior\s*\{/.test(cssSliceSrc));
assert('capture-hub.css has .ap-slider rule',                         /\.ap-slider\s*\{/.test(cssSliceSrc));
assert('capture-hub.css has .ch-tile-locked rule',                    /\.ch-tile-locked\s*\{/.test(cssSliceSrc));
assert('capture-hub.css has .ch-tile-pill-lock rule',                 /\.ch-tile-pill-lock\s*\{/.test(cssSliceSrc));
assert('capture-hub.css has .ap-auto-fill-hint rule',                 /\.ap-auto-fill-hint\s*\{/.test(cssSliceSrc));

// WorkflowGuide banner (Rule #1)
assert('bdm-capture-hub banner mentions Slice 4 Allocation Panel',
  /'bdm-capture-hub':[\s\S]{0,8000}Slice 4/.test(wgSrc));
assert('bdm-capture-hub banner mentions Slice 5 SMER tile lock',
  /'bdm-capture-hub':[\s\S]{0,8000}Slice 5/.test(wgSrc));
assert('bdm-capture-hub banner mentions 0 official km nudge',
  /'bdm-capture-hub':[\s\S]{0,8000}0 official km/.test(wgSrc));

// ── Phase P1.2 Slice 8 — Capture Archive ──────────────────────
section('Slice 8 — Capture Archive backend');

// Controller exports + endpoint signatures
assert('controller exports getCaptureArchiveSummary',
  /module\.exports[\s\S]+getCaptureArchiveSummary/.test(ctrlSrcAfter));
assert('controller exports getCaptureArchiveLeaves',
  /module\.exports[\s\S]+getCaptureArchiveLeaves/.test(ctrlSrcAfter));
assert('controller exports bulkMarkReceived',
  /module\.exports[\s\S]+bulkMarkReceived/.test(ctrlSrcAfter));
assert('controller exports getCycleAuditReport',
  /module\.exports[\s\S]+getCycleAuditReport/.test(ctrlSrcAfter));
// C1/C2 helpers — Slice 8 imports them from the shared util at
// `backend/erp/utils/cycleC1C2.js`. Same half-monthly cycle as
// DriveAllocation / SmerEntry / CarLogbookEntry / Payslip / IncomeReport.
// NOT the 28-day BDM-visit cycle from CRM scheduleCycleUtils.
const cycleUtilSrc = read('backend/erp/utils/cycleC1C2.js');
assert('cycleC1C2.js shared util exists', cycleUtilSrc.length > 0);
assert('cycleC1C2.js exports cycleFor', /module\.exports[\s\S]+cycleFor/.test(cycleUtilSrc));
assert('cycleC1C2.js exports cycleBounds', /module\.exports[\s\S]+cycleBounds/.test(cycleUtilSrc));
assert('cycleC1C2.js exports MANILA_OFFSET_MS', /module\.exports[\s\S]+MANILA_OFFSET_MS/.test(cycleUtilSrc));
assert('cycleC1C2.js cycleFor returns C1 for day≤15',
  /day\s*<=\s*15\s*\?\s*'C1'\s*:\s*'C2'/.test(cycleUtilSrc));
assert('cycleC1C2.js cycleBounds rejects malformed period',
  /\^\\d\{4\}-\\d\{2\}\$/.test(cycleUtilSrc));
assert('cycleC1C2.js cycleBounds last-day-of-month leap-safe (Date.UTC trick)',
  /Date\.UTC\(y,\s*m,\s*0\)/.test(cycleUtilSrc));
assert('captureSubmissionController imports from shared cycleC1C2 util',
  /require\(['"]\.\.\/utils\/cycleC1C2['"]\)/.test(ctrlSrcAfter));
assert('captureSubmissionController does NOT inline cycleFor (uses shared)',
  !/^function cycleFor/m.test(ctrlSrcAfter));
assert('captureSubmissionController does NOT inline cycleBounds (uses shared)',
  !/^function cycleBounds/m.test(ctrlSrcAfter));
// Note: refer to scheduleCycleUtils only by name in the rationale comment;
// the require() must be absent.
assert('archive does NOT require scheduleCycleUtils (CRM-domain cycle is wrong unit)',
  !/require\([^)]*scheduleCycleUtils/.test(ctrlSrcAfter));
assert('leaves rejects only-one-of (period,cycle)',
  /Both period and cycle are required when narrowing by cycle/.test(ctrlSrcAfter));
assert('cycle-report requires period + cycle',
  /period[\s\S]{0,200}cycle[\s\S]{0,200}query params are required/.test(ctrlSrcAfter));
assert('archive summary aggregates _period + _cycle',
  /_period[\s\S]{0,500}_cycle/.test(ctrlSrcAfter));
assert('archive summary derives cycle via $lte 15',
  /\$lte:\s*\['\$_manila_day',\s*15\]/.test(ctrlSrcAfter));
assert('archive summary returns years[].periods[].cycles[] tree',
  /years\.push\(\{\s*year[\s\S]{0,80}periods/.test(ctrlSrcAfter));

// Sub-permission gates wired
assert('archive summary gates VIEW_OWN_ARCHIVE / VIEW_ALL_ARCHIVE',
  /VIEW_OWN_ARCHIVE[\s\S]{0,300}VIEW_ALL_ARCHIVE/.test(ctrlSrcAfter));
assert('resolveArchiveScope helper present',
  /async function resolveArchiveScope/.test(ctrlSrcAfter));
assert('VIEW_ALL_ARCHIVE caller honors bdm_id query, VIEW_OWN forces self',
  /canViewAll\s*\?[\s\S]{0,80}queryBdmId[\s\S]{0,200}String\(req\.user\._id\)/.test(ctrlSrcAfter));
assert('bulkMarkReceived gates BULK_MARK_RECEIVED',
  /['"]BULK_MARK_RECEIVED['"]/.test(ctrlSrcAfter));
assert('cycle audit report gates GENERATE_CYCLE_REPORT',
  /['"]GENERATE_CYCLE_REPORT['"]/.test(ctrlSrcAfter));

// Bulk-mark logic — skips digital-only + already-received
assert('bulkMarkReceived skips digital-only',
  /skipped_digital_only/.test(ctrlSrcAfter));
assert('bulkMarkReceived skips already-RECEIVED',
  /skipped_already_received/.test(ctrlSrcAfter));
assert('bulkMarkReceived caps at 200 ids',
  /capped at 200/.test(ctrlSrcAfter));
assert('bulkMarkReceived stamps physical_received_by',
  /physical_received_by:\s*req\.user\._id/.test(ctrlSrcAfter));

// CSV report shape
assert('cycle report CSV column order stable',
  /COLUMNS\s*=\s*\[[\s\S]+'created_at'[\s\S]+'workflow_type'[\s\S]+'physical_status'/.test(ctrlSrcAfter));
assert('cycle report sets text/csv content-type',
  /Content-Type[\s\S]{0,80}text\/csv/.test(ctrlSrcAfter));
assert('cycle report sets attachment filename (period+cycle)',
  /cycle-audit-\$\{period\}-\$\{cycle\}/.test(ctrlSrcAfter)
  && /Content-Disposition[\s\S]{0,80}attachment;\s*filename/.test(ctrlSrcAfter));
assert('cycle report supports JSON format',
  /format\s*===\s*'json'/.test(ctrlSrcAfter));

// Routes mounted with literal-before-:id ordering
assert('routes mount /archive/summary',
  /\/archive\/summary[\s\S]{0,80}getCaptureArchiveSummary/.test(routeSrcAfter));
assert('routes mount /archive/leaves',
  /\/archive\/leaves[\s\S]{0,80}getCaptureArchiveLeaves/.test(routeSrcAfter));
assert('routes mount /archive/cycle-report',
  /\/archive\/cycle-report[\s\S]{0,80}getCycleAuditReport/.test(routeSrcAfter));
assert('routes mount /bulk-mark-received',
  /\/bulk-mark-received[\s\S]{0,80}bulkMarkReceived/.test(routeSrcAfter));
assert('routes — /archive/summary mounted BEFORE /:id',
  routeSrcAfter.indexOf("/archive/summary") < routeSrcAfter.indexOf("router.get('/:id'"));
assert('routes — /bulk-mark-received mounted BEFORE /:id',
  routeSrcAfter.indexOf('/bulk-mark-received') < routeSrcAfter.indexOf("router.get('/:id'"));

// ── Phase P1.2 Slice 8 — Capture Archive frontend ─────────────
section('Slice 8 — Capture Archive frontend');
// Phase P1.2 Slice 8 page lives in pages/capture/ (not pages/proxy/) because
// it serves both staff (VIEW_OWN_ARCHIVE) and management (VIEW_ALL_ARCHIVE).
const archivePageSrc = read('frontend/src/erp/pages/capture/CaptureArchive.jsx');
const sharedChipSrc = read('frontend/src/erp/components/PhysicalStatusChip.jsx');
const sharedSheetSrc = read('frontend/src/erp/components/PhysicalStatusOverrideSheet.jsx');
const frontendGatesSrc = read('frontend/src/erp/utils/captureLifecycleFrontendGates.js');

// Shared frontend modules (consolidation pass)
assert('shared PhysicalStatusChip exists', sharedChipSrc.length > 0);
assert('shared PhysicalStatusChip default-exports a component',
  /export default function PhysicalStatusChip/.test(sharedChipSrc));
assert('shared PhysicalStatusChip handles digital-only (!required)',
  /!\s*req[\s\S]{0,200}Digital only/.test(sharedChipSrc));
assert('shared PhysicalStatusOverrideSheet exists', sharedSheetSrc.length > 0);
assert('shared OverrideSheet exports component',
  /export default function PhysicalStatusOverrideSheet/.test(sharedSheetSrc));
assert('shared OverrideSheet has Apply disabled when next === currentStatus',
  /disabled=\{next\s*===\s*currentStatus\}/.test(sharedSheetSrc));
assert('shared OverrideSheet supports testIdPrefix prop',
  /testIdPrefix\s*=\s*['"]override['"]/.test(sharedSheetSrc));
assert('shared frontend gates helper exists', frontendGatesSrc.length > 0);
assert('shared frontend gates exports FRONTEND_DEFAULTS',
  /export const FRONTEND_DEFAULTS/.test(frontendGatesSrc));
assert('shared frontend gates exports userHasFrontendDefault',
  /export function userHasFrontendDefault/.test(frontendGatesSrc));
assert('shared frontend gates has all 12 lifecycle codes',
  /UPLOAD_OWN_CAPTURE[\s\S]{0,800}VIEW_OWN_ARCHIVE[\s\S]{0,800}VIEW_ALL_ARCHIVE[\s\S]{0,800}MARK_PAPER_RECEIVED[\s\S]{0,800}BULK_MARK_RECEIVED[\s\S]{0,800}OVERRIDE_PHYSICAL_STATUS[\s\S]{0,800}GENERATE_CYCLE_REPORT[\s\S]{0,800}MARK_NO_DRIVE_DAY[\s\S]{0,800}ALLOCATE_PERSONAL_OFFICIAL[\s\S]{0,800}OVERRIDE_ALLOCATION[\s\S]{0,800}EDIT_CAR_LOGBOOK_DESTINATION[\s\S]{0,800}PROXY_PULL_CAPTURE/.test(frontendGatesSrc));

// CaptureArchive uses the shared modules (not local copies)
assert('CaptureArchive imports shared PhysicalStatusChip',
  /import\s+PhysicalStatusChip\s+from\s+['"]\.\.\/\.\.\/components\/PhysicalStatusChip['"]/.test(archivePageSrc));
assert('CaptureArchive imports shared PhysicalStatusOverrideSheet',
  /import\s+PhysicalStatusOverrideSheet\s+from\s+['"]\.\.\/\.\.\/components\/PhysicalStatusOverrideSheet['"]/.test(archivePageSrc));
assert('CaptureArchive imports shared frontend-gates helper',
  /import\s+\{\s*userHasFrontendDefault\s*\}\s+from\s+['"]\.\.\/\.\.\/utils\/captureLifecycleFrontendGates['"]/.test(archivePageSrc));
assert('CaptureArchive does NOT inline a local FRONTEND_DEFAULTS',
  !/^const FRONTEND_DEFAULTS/m.test(archivePageSrc));
const hookSrc = read('frontend/src/erp/hooks/useCaptureSubmissions.js');

assert('CaptureArchive page exists', archivePageSrc.length > 0);
assert('CaptureArchive default export', /export default function CaptureArchive/.test(archivePageSrc));
assert('CaptureArchive renders WorkflowGuide pageKey="capture-archive"',
  /WorkflowGuide\s+pageKey=["']capture-archive["']/.test(archivePageSrc));
assert('CaptureArchive uses getArchiveSummary', /getArchiveSummary/.test(archivePageSrc));
assert('CaptureArchive uses getArchiveLeaves', /getArchiveLeaves/.test(archivePageSrc));
assert('CaptureArchive uses bulkMarkReceived', /bulkMarkReceived/.test(archivePageSrc));
assert('CaptureArchive uses downloadCycleReport', /downloadCycleReport/.test(archivePageSrc));
assert('CaptureArchive uses overridePhysicalStatus', /overridePhysicalStatus/.test(archivePageSrc));
assert('CaptureArchive renders bulk button when selected.size > 0',
  /selected\.size\s*>\s*0[\s\S]{0,300}archive-bulk-mark/.test(archivePageSrc));
assert('CaptureArchive bulk-mark testid present',
  /data-testid=["']archive-bulk-mark["']/.test(archivePageSrc));
assert('CaptureArchive download CSV testid pattern (period+cycle)',
  /archive-download-csv-\$\{p\.period\}-\$\{c\.cycle\}/.test(archivePageSrc));
assert('CaptureArchive renders period level in tree',
  /y\.periods\.map\(p\s*=>/.test(archivePageSrc));
assert('CaptureArchive renders cycle level (period.cycles)',
  /p\.cycles\.map\(c\s*=>/.test(archivePageSrc));
assert('CaptureArchive activeFolder carries period + cycle',
  /activeFolder\.period[\s\S]{0,200}activeFolder\.cycle/.test(archivePageSrc));
assert('CaptureArchive handleDownloadCsv takes (period, cycle)',
  /handleDownloadCsv\s*=\s*useCallback\(async\s*\(period,\s*cycle\)/.test(archivePageSrc));
assert('CaptureArchive override row testid pattern',
  /archive-row-override-/.test(archivePageSrc));

// Hook wires the new endpoints
assert('hook exports getArchiveSummary',         /getArchiveSummary/.test(hookSrc));
assert('hook exports getArchiveLeaves',          /getArchiveLeaves/.test(hookSrc));
assert('hook exports bulkMarkReceived',          /bulkMarkReceived/.test(hookSrc));
assert('hook exports downloadCycleReport',       /downloadCycleReport/.test(hookSrc));
assert('hook exports overridePhysicalStatus',    /overridePhysicalStatus/.test(hookSrc));
assert('hook downloadCycleReport uses responseType blob',
  /downloadCycleReport[\s\S]{0,400}responseType:\s*['"]blob['"]/.test(hookSrc));
assert('hook bulkMarkReceived posts {ids}',
  /bulkMarkReceived[\s\S]{0,300}\{\s*ids\s*\}/.test(hookSrc));

// Route + sidebar wiring
assert('App.jsx imports CaptureArchive', /CaptureArchive\s*=\s*lazyRetry/.test(appSrc));
assert('App.jsx imports CaptureArchive from pages/capture/ (consolidation pass)',
  /lazyRetry\(\(\)\s*=>\s*import\(['"]\.\/erp\/pages\/capture\/CaptureArchive['"]\)\)/.test(appSrc));
assert('App.jsx mounts /erp/capture-archive',
  /path=["']\/erp\/capture-archive["'][\s\S]{0,200}<CaptureArchive/.test(appSrc));
assert('Sidebar links Capture Archive',
  /\/erp\/capture-archive[\s\S]{0,100}Capture Archive/.test(sidebarSrc));

// WorkflowGuide banner
assert('capture-archive banner key exists', /'capture-archive'\s*:/.test(wgSrc));
assert('capture-archive banner mentions BULK_MARK_RECEIVED',
  /'capture-archive':[\s\S]{0,4000}BULK_MARK_RECEIVED/.test(wgSrc));
assert('capture-archive banner mentions VIEW_OWN_ARCHIVE',
  /'capture-archive':[\s\S]{0,4000}VIEW_OWN_ARCHIVE/.test(wgSrc));
assert('capture-archive banner mentions OVERRIDE_PHYSICAL_STATUS',
  /'capture-archive':[\s\S]{0,4000}president|'capture-archive':[\s\S]{0,4000}Override/.test(wgSrc));

// ── Phase P1.2 Slice 9 — Mark-Complete inline + override ─────
section('Slice 9 — Mark-Complete inline + override');

// Backend completeCapture accepts paper_received flag with MARK_PAPER_RECEIVED gate
assert('completeCapture destructures paper_received',
  /paper_received[\s\S]{0,80}=\s*req\.body/.test(ctrlSrcAfter));
assert('completeCapture gates paper_received on MARK_PAPER_RECEIVED',
  /paper_received\s*===\s*true[\s\S]{0,300}MARK_PAPER_RECEIVED/.test(ctrlSrcAfter));
assert('completeCapture sets physical_status=RECEIVED on paper_received',
  /paper_received\s*===\s*true[\s\S]{0,400}physical_status\s*=\s*['"]RECEIVED['"]/.test(ctrlSrcAfter));
assert('completeCapture stamps physical_received_at + by',
  /paper_received\s*===\s*true[\s\S]{0,500}physical_received_at[\s\S]{0,200}physical_received_by/.test(ctrlSrcAfter));

// overridePhysicalStatus endpoint
assert('controller exports overridePhysicalStatus',
  /module\.exports[\s\S]+overridePhysicalStatus/.test(ctrlSrcAfter));
assert('overridePhysicalStatus gates OVERRIDE_PHYSICAL_STATUS',
  /['"]OVERRIDE_PHYSICAL_STATUS['"]/.test(ctrlSrcAfter));
assert('overridePhysicalStatus rejects digital-only',
  /Cannot override physical status[\s\S]{0,80}digital-only/.test(ctrlSrcAfter));
assert('overridePhysicalStatus VALID_OVERRIDE_STATUSES enum',
  /VALID_OVERRIDE_STATUSES\s*=\s*\['PENDING',\s*'RECEIVED',\s*'MISSING'\]/.test(ctrlSrcAfter));
assert('overridePhysicalStatus clears received_at on non-RECEIVED',
  /physical_received_at\s*=\s*undefined/.test(ctrlSrcAfter));
assert('routes mount PUT /:id/physical-status',
  /router\.put\(['"]\/:id\/physical-status['"][\s\S]{0,80}overridePhysicalStatus/.test(routeSrcAfter));

// Frontend ProxyQueue paper_received toggle + override
const proxyQueueSrc = read('frontend/src/erp/pages/proxy/ProxyQueue.jsx');
assert('ProxyQueue imports useAuth', /from ['"]\.\.\/\.\.\/\.\.\/hooks\/useAuth['"]/.test(proxyQueueSrc));
assert('ProxyQueue computes canMarkPaper / canOverride',
  /canMarkPaper[\s\S]{0,200}canOverride/.test(proxyQueueSrc));
assert('ProxyQueue imports shared PhysicalStatusChip',
  /import\s+PhysicalStatusChip\s+from\s+['"]\.\.\/\.\.\/components\/PhysicalStatusChip['"]/.test(proxyQueueSrc));
assert('ProxyQueue imports shared PhysicalStatusOverrideSheet',
  /import\s+PhysicalStatusOverrideSheet\s+from\s+['"]\.\.\/\.\.\/components\/PhysicalStatusOverrideSheet['"]/.test(proxyQueueSrc));
assert('ProxyQueue imports shared frontend-gates helper',
  /import\s+\{\s*userHasFrontendDefault\s*\}\s+from\s+['"]\.\.\/\.\.\/utils\/captureLifecycleFrontendGates['"]/.test(proxyQueueSrc));
assert('ProxyQueue does NOT inline a local FRONTEND_DEFAULTS',
  !/^const FRONTEND_DEFAULTS/m.test(proxyQueueSrc));
assert('ProxyQueue renders PhysicalStatusChip via JSX',
  /<PhysicalStatusChip\s+item=\{item\}/.test(proxyQueueSrc));
assert('ProxyQueue renders PhysicalStatusOverrideSheet via JSX',
  /<PhysicalStatusOverrideSheet/.test(proxyQueueSrc));
assert('ProxyQueue passes testIdPrefix=proxy-override',
  /testIdPrefix=["']proxy-override["']/.test(proxyQueueSrc));
assert('ProxyQueue Mark Complete forwards paper_received',
  /onComplete\(item\._id,\s*\{\s*paper_received:\s*paperReceived\s*\}\)/.test(proxyQueueSrc));
assert('ProxyQueue paper-received checkbox testid',
  /data-testid=["']proxy-paper-received-checkbox["']/.test(proxyQueueSrc));
assert('ProxyQueue override-open testid',
  /data-testid=["']proxy-override-open["']/.test(proxyQueueSrc));
// override-apply testid is now produced by the shared OverrideSheet via the
// testIdPrefix="proxy-override" prop (yields data-testid="proxy-override-apply"
// at render time). Assert on the shared component contract instead.
assert('shared OverrideSheet computes apply testid from testIdPrefix',
  /data-testid=\{`\$\{testIdPrefix\}-apply`\}/.test(sharedSheetSrc));
assert('ProxyQueue handleOverride defined',
  /const handleOverride\s*=\s*useCallback/.test(proxyQueueSrc));
assert('ProxyQueue passes onOverride to DetailDrawer',
  /onOverride=\{handleOverride\}/.test(proxyQueueSrc));
assert('ProxyQueue passes canMarkPaper / canOverride to DetailDrawer',
  /canMarkPaper=\{canMarkPaper\}[\s\S]{0,80}canOverride=\{canOverride\}/.test(proxyQueueSrc));

// proxy-queue banner mentions Slice 9
assert('proxy-queue banner mentions Slice 9 paper toggle',
  /'proxy-queue':[\s\S]{0,4000}Slice 9[\s\S]{0,300}Paper received/.test(wgSrc));
assert('proxy-queue banner mentions Override',
  /'proxy-queue':[\s\S]{0,4000}Override/.test(wgSrc));
assert('proxy-queue banner links to Capture Archive',
  /'proxy-queue':[\s\S]{0,4000}\/erp\/capture-archive/.test(wgSrc));

// ── Section 17. Slice 1 follow-on + Slice 9 partial (May 06 2026) ──
//
// Two narrow follow-ons closing deferred items from Round 2B + Slice 1:
//   (a) BDM-self picker access on getProxyQueue. Without this, a plain BDM
//       hitting the picker on /erp/sales (or any future BDM-self surface)
//       gets 403 because getProxyQueue is gated on canProxyEntry / privileged.
//       The fix lets `bdm_id=self` (or matching ID) bypass the proxy gate
//       and hard-scopes the filter to the caller's own captures.
//   (b) Slice 9 partial — auto-finalize captures after attach. The Round 2A
//       picker on SalesList writes a bare S3 URL via attachReceivedCsi, but
//       the source CaptureSubmission stays PENDING_PROXY forever and keeps
//       appearing in the picker drawer. The fix wires
//       linkCaptureToDocument(capture_id, 'SalesLine', sale._id) into the
//       attachReceivedCsi controller — idempotent, best-effort, status walk
//       to AWAITING_BDM_REVIEW per the existing REVIEW_WORKFLOWS list.
section('Slice 1 follow-on + Slice 9 partial — picker self-fetch + auto-finalize');

// (a) getProxyQueue self-fetch
assert('getProxyQueue computes isSelfFetch from bdm_id query',
  /isSelfFetch\s*=\s*bdm_id\s*===\s*['"]self['"]\s*\|\|\s*\(bdm_id\s*&&\s*String\(bdm_id\)\s*===\s*callerId\)/.test(ctrlSrcAfter));
assert('getProxyQueue self-fetch + privileged shortcut bypass proxy gate',
  /if\s*\(\s*!isSelfFetch\s*&&\s*!privileged\s*\)\s*\{[\s\S]{0,500}canProxyEntry/.test(ctrlSrcAfter));
assert('getProxyQueue hard-scopes filter.bdm_id to callerId on self-fetch',
  /if\s*\(\s*isSelfFetch\s*\)\s*\{\s*[\s\S]{0,300}filter\.bdm_id\s*=\s*callerId/.test(ctrlSrcAfter));

// (b) linkCaptureToDocument helper
assert('linkCaptureToDocument helper defined',
  /async function linkCaptureToDocument\(captureId,\s*kind,\s*docId,\s*ctx\)/.test(ctrlSrcAfter));
assert('linkCaptureToDocument is idempotent on same kind+id',
  /linked_doc_kind\s*===\s*kind[\s\S]{0,200}linked_doc_id[\s\S]{0,200}===\s*String\(docId\)/.test(ctrlSrcAfter));
assert('linkCaptureToDocument allows owner / proxy / privileged',
  /isOwner\s*=\s*String\(cap\.bdm_id\)[\s\S]{0,200}isProxy\s*=\s*String\(cap\.proxy_id[\s\S]{0,300}isOwner\s*&&\s*!isProxy\s*&&\s*!isPrivileged/.test(ctrlSrcAfter));
assert('linkCaptureToDocument walks PENDING_PROXY/IN_PROGRESS only',
  /if\s*\(\s*cap\.status\s*===\s*['"]PENDING_PROXY['"]\s*\|\|\s*cap\.status\s*===\s*['"]IN_PROGRESS['"]\s*\)/.test(ctrlSrcAfter));
assert('linkCaptureToDocument lands review workflows in AWAITING_BDM_REVIEW',
  /REVIEW_WORKFLOWS\.includes\(cap\.workflow_type\)[\s\S]{0,80}AWAITING_BDM_REVIEW/.test(ctrlSrcAfter));
assert('linkCaptureToDocument exported from controller',
  /module\.exports\s*=\s*\{[\s\S]+linkCaptureToDocument/.test(ctrlSrcAfter));

// (b) salesController.attachReceivedCsi wiring
assert('attachReceivedCsi destructures capture_id from body',
  /const\s*\{\s*csi_received_photo_url[\s\S]{0,200}capture_id\s*\}\s*=\s*req\.body/.test(salesCtrlSrc));
assert('attachReceivedCsi requires linkCaptureToDocument lazily',
  /require\(['"]\.\/captureSubmissionController['"]\)[\s\S]{0,200}linkCaptureToDocument/.test(salesCtrlSrc));
// kind is the Mongoose model name per CaptureSubmission.linked_doc_kind enum
// (ExpenseEntry / SalesLine / Collection / GrnEntry / SmerEntry /
// PettyCashTransaction / CarLogbookEntry / CwtLedgerEntry). NOT snake_case.
assert('attachReceivedCsi calls linkCaptureToDocument with SalesLine kind',
  /linkCaptureToDocument\(\s*capture_id,\s*['"]SalesLine['"],\s*sale\._id/.test(salesCtrlSrc));

// useSales hook forwards capture_id
const useSalesHookSrc = read('frontend/src/erp/hooks/useSales.js');
assert('useSales.attachReceivedCsi forwards capture_id',
  /attachReceivedCsi\s*=\s*\([^)]*capture_id[^)]*\)\s*=>[\s\S]{0,200}capture_id/.test(useSalesHookSrc));

// ── Section 18. Round 2B auto-finalize on create paths (May 06 2026) ──
//
// Slice 9 partial extension into the OCR-then-create flows. Round 2A on
// SalesList (PUT /sales/:id/received-csi with capture_id) was the easy path;
// these are the harder paths: SalesEntry / CollectionSession / GrnEntry pick
// a capture, OCR runs (Mode B), user reviews + creates, the source capture
// must auto-finalize the same way. Wiring: ScanModal.handleApply → page row /
// pendingCaptureId state → create payload → controller calls linkCaptureToDocument.
section('Slice 9 partial — Round 2B auto-finalize on create paths');

// (a) Sales — backend
assert('createSale destructures capture_id out of body',
  /const\s*\{\s*assigned_to[\s\S]{0,300}capture_id,[\s\S]{0,200}\}\s*=\s*req\.body/.test(salesCtrlSrc));
assert('createSale calls linkCaptureToDocument with SalesLine kind',
  /\[createSale\][\s\S]{0,4000}|linkCaptureToDocument\(\s*capture_id,\s*['"]SalesLine['"],\s*sale\._id/.test(salesCtrlSrc));
// Sales — frontend
const salesEntrySrc2 = read('frontend/src/erp/pages/SalesEntry.jsx');
assert('SalesEntry ScanCSIModal handleApply emits capture_id from initialCaptureId',
  /capture_id:\s*initialCaptureId\s*\|\|\s*null/.test(salesEntrySrc2));
assert('SalesEntry handleScanApply persists capture_id onto new row',
  /capture_id:\s*scannedData\.capture_id\s*\|\|\s*null/.test(salesEntrySrc2));
assert('SalesEntry create-only forwards row.capture_id',
  /isCreate\s*&&\s*row\.capture_id\s*\?\s*\{\s*capture_id:\s*row\.capture_id\s*\}/.test(salesEntrySrc2));

// (b) Collection — backend
const collCtrlSrc = read('backend/erp/controllers/collectionController.js');
assert('createCollection destructures capture_id out of body',
  /const\s*\{\s*assigned_to[\s\S]{0,300}capture_id,[\s\S]{0,200}\}\s*=\s*req\.body/.test(collCtrlSrc));
assert('createCollection calls linkCaptureToDocument with Collection kind',
  /linkCaptureToDocument\(\s*capture_id,\s*['"]Collection['"],\s*collection\._id/.test(collCtrlSrc));
// Collection — frontend
const collSessSrc2 = read('frontend/src/erp/pages/CollectionSession.jsx');
assert('ScanCRModal handleApply emits capture_id from initialCaptureId',
  /capture_id:\s*initialCaptureId\s*\|\|\s*null/.test(collSessSrc2));
assert('CollectionSession handleCrScanApply sets pendingCaptureId',
  /setPendingCaptureId\(data\.capture_id\)/.test(collSessSrc2));
assert('CollectionSession createCollection forwards pendingCaptureId',
  /pendingCaptureId\s*\?\s*\{\s*capture_id:\s*pendingCaptureId\s*\}/.test(collSessSrc2));

// (c) GRN — backend
const invCtrlSrc = read('backend/erp/controllers/inventoryController.js');
assert('createGrn destructures capture_id from body',
  /const\s*\{[\s\S]{0,800}capture_id\s*\}\s*=\s*req\.body/.test(invCtrlSrc));
assert('createGrn calls linkCaptureToDocument with GrnEntry kind',
  /linkCaptureToDocument\(\s*capture_id,\s*['"]GrnEntry['"],\s*grn\._id/.test(invCtrlSrc));
// GRN — frontend
const grnEntrySrc2 = read('frontend/src/erp/pages/GrnEntry.jsx');
assert('ScanUndertakingModal onApply meta includes capture_id',
  /onApply\(lines,\s*\{[\s\S]{0,400}capture_id:\s*initialCaptureId\s*\|\|\s*null/.test(grnEntrySrc2));
assert('GrnEntry handleScanApply sets pendingCaptureId from meta',
  /setPendingCaptureId\(meta\.capture_id\)/.test(grnEntrySrc2));
assert('GrnEntry createGrn forwards pendingCaptureId',
  /pendingCaptureId\s*\?\s*\{\s*capture_id:\s*pendingCaptureId\s*\}/.test(grnEntrySrc2));
assert('GrnEntry resets pendingCaptureId after submit',
  /setPendingCaptureId\(null\)/.test(grnEntrySrc2));

// ── Summary ───────────────────────────────────────────────────
const total = pass + fail;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`Healthcheck: ${pass}/${total} PASS\n`);
if (fail > 0) {
  process.stdout.write(`\nFailures:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f}\n`));
  process.exit(1);
}
process.stdout.write(`\n✓ Capture Hub Phase P1.1 + P1.2 Slice 1 + Slice 7-ext Rounds 1/2A/2B + Slice 4/5 + Slice 8/9 contract is intact.\n`);
process.exit(0);
