/**
 * Phase G4.5h-W (Apr 29, 2026) — Static healthcheck for the Undertaking
 * waybill recovery wiring. Runs without a DB connection — purely verifies
 * the code is wired end-to-end so the Apr 29 false-positive ("no waybill is
 * attached" on Approval Hub when the linked GRN does have one) cannot regress.
 *
 * Run: node backend/erp/scripts/healthcheckWaybillRecovery.js
 * Exit code: 0 = green, 1 = at least one check failed.
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

// 1. buildUndertakingDetails falls back to item.waybill_photo_url
check(
  'buildUndertakingDetails falls back to UT mirror for waybill_photo_url',
  () => {
    const src = read('backend/erp/services/documentDetailBuilder.js');
    return /waybill_photo_url:\s*grn\?\.waybill_photo_url\s*\|\|\s*item\.waybill_photo_url/.test(src);
  },
  'Edit backend/erp/services/documentDetailBuilder.js — fallback chain must read grn → item → null'
);

// 2. buildUndertakingDetails falls back to item.undertaking_photo_url
check(
  'buildUndertakingDetails falls back to UT mirror for undertaking_photo_url',
  () => {
    const src = read('backend/erp/services/documentDetailBuilder.js');
    return /undertaking_photo_url:\s*grn\?\.undertaking_photo_url\s*\|\|\s*item\.undertaking_photo_url/.test(src);
  },
  'Edit backend/erp/services/documentDetailBuilder.js — undertaking_photo_url chain matches waybill_photo_url'
);

// 3. Undertaking model has undertaking_photo_url field
check(
  'Undertaking model declares undertaking_photo_url field',
  () => {
    const src = read('backend/erp/models/Undertaking.js');
    return /undertaking_photo_url:\s*\{\s*type:\s*String/.test(src);
  },
  'Add undertaking_photo_url: { type: String, default: null } to backend/erp/models/Undertaking.js'
);

// 4. autoUndertakingForGrn copies BOTH waybill + undertaking photo URLs
check(
  'autoUndertakingForGrn mirrors both waybill_photo_url AND undertaking_photo_url',
  () => {
    const src = read('backend/erp/services/undertakingService.js');
    return /waybill_photo_url:\s*grn\.waybill_photo_url/.test(src)
      && /undertaking_photo_url:\s*grn\.undertaking_photo_url/.test(src);
  },
  'Edit backend/erp/services/undertakingService.js — autoUndertakingForGrn must copy both proof fields'
);

// 5. signLinkedGrnPhotos signs UT mirror too (not just linked GRN)
check(
  'signLinkedGrnPhotos signs the UT\'s own waybill mirror',
  () => {
    const src = read('backend/erp/controllers/undertakingController.js');
    // Check that doc.waybill_photo_url is being signed in the helper
    const helperBlock = src.match(/async function signLinkedGrnPhotos[\s\S]*?\n\}/);
    if (!helperBlock) return false;
    return /doc\.waybill_photo_url\s*=\s*await\s+signUrl\(doc\.waybill_photo_url\)/.test(helperBlock[0]);
  },
  'Edit backend/erp/controllers/undertakingController.js signLinkedGrnPhotos — sign doc.waybill_photo_url too'
);

// 6. reuploadWaybill controller exists + exported
check(
  'reuploadWaybill controller is defined and exported',
  () => {
    const src = read('backend/erp/controllers/undertakingController.js');
    return /const\s+reuploadWaybill\s*=\s*catchAsync/.test(src)
      && /reuploadWaybill,/.test(src.split('module.exports')[1] || '');
  },
  'Add reuploadWaybill to backend/erp/controllers/undertakingController.js + module.exports'
);

// 7. Route mounted at POST /:id/waybill
check(
  'POST /:id/waybill route is registered',
  () => {
    const src = read('backend/erp/routes/undertakingRoutes.js');
    return /router\.post\(\s*['"]\/:id\/waybill['"]/.test(src);
  },
  'Add router.post(\'/:id/waybill\', protect, c.reuploadWaybill) to backend/erp/routes/undertakingRoutes.js'
);

// 8. Frontend service helper is exported
check(
  'frontend reuploadWaybill helper is exported',
  () => {
    const src = read('frontend/src/erp/services/undertakingService.js');
    return /export\s+async\s+function\s+reuploadWaybill\s*\(/.test(src);
  },
  'Add export async function reuploadWaybill(id, waybillPhotoUrl) to frontend/src/erp/services/undertakingService.js'
);

// 9. UndertakingDetail.jsx imports + uses reuploadWaybill
check(
  'UndertakingDetail page wires reuploadWaybill into the upload handler',
  () => {
    const src = read('frontend/src/erp/pages/UndertakingDetail.jsx');
    return /reuploadWaybill,?\s*$/m.test(src.split('from')[0] || '')  // import
      || (/import\s*\{[\s\S]*?reuploadWaybill[\s\S]*?\}\s*from\s*['"]\.\.\/services\/undertakingService['"]/.test(src)
          && /handleWaybillReupload/.test(src)
          && /processDocument\(file,\s*['"]WAYBILL['"]\)/.test(src));
  },
  'Wire reuploadWaybill + processDocument(file, "WAYBILL") into frontend/src/erp/pages/UndertakingDetail.jsx'
);

// 10. ApprovalManager warning is gated on waybillRequired
check(
  'ApprovalManager hides "approval will be blocked" warning when waybill not required',
  () => {
    const src = read('frontend/src/erp/pages/ApprovalManager.jsx');
    return /waybillRequired/.test(src)
      && /getGrnSettings/.test(src)
      && /!d\.waybill_photo_url\s*&&\s*waybillRequired/.test(src);
  },
  'Edit frontend/src/erp/pages/ApprovalManager.jsx — gate the warning on lookup-driven waybillRequired'
);

// 11. WorkflowGuide steps mention the recovery path
check(
  'WorkflowGuide undertaking-entry banner mentions waybill re-upload',
  () => {
    const src = read('frontend/src/erp/components/WorkflowGuide.jsx');
    const block = src.split("'undertaking-entry'")[1] || '';
    return /Upload Waybill/i.test(block) || /recovery uploader/i.test(block);
  },
  'Update WORKFLOW_GUIDES["undertaking-entry"] in frontend/src/erp/components/WorkflowGuide.jsx'
);

// 12. DOC_TYPE_HYDRATION.UNDERTAKING populates linked_grn_id with waybill_photo_url
//     selected — without this, gateApproval-held DRAFT UTs surface in the Hub
//     via the APPROVAL_REQUEST path with grn=null in buildUndertakingDetails,
//     the waybill fallback can't reach grn.waybill_photo_url, and the row shows
//     a false-positive "no waybill" warning. (Apr 30, 2026 follow-up.)
check(
  'DOC_TYPE_HYDRATION.UNDERTAKING populates linked_grn_id with waybill fields',
  () => {
    const src = read('backend/erp/services/universalApprovalService.js');
    const block = src.split('UNDERTAKING:')[2] || ''; // [0]=before MODULE_QUERIES, [1]=MODULE_QUERIES.UNDERTAKING, [2]=DOC_TYPE_HYDRATION.UNDERTAKING
    return /path:\s*['"]linked_grn_id['"]/.test(block)
      && /waybill_photo_url/.test(block)
      && /undertaking_photo_url/.test(block);
  },
  'Edit DOC_TYPE_HYDRATION.UNDERTAKING in backend/erp/services/universalApprovalService.js — must populate linked_grn_id with waybill_photo_url + undertaking_photo_url selected'
);

// 13. DOC_TYPE_HYDRATION.UNDERTAKING populates bdm_id (so Hub row shows BDM name,
//     not "—", for gateApproval-held UTs).
check(
  'DOC_TYPE_HYDRATION.UNDERTAKING populates bdm_id',
  () => {
    const src = read('backend/erp/services/universalApprovalService.js');
    const block = src.split('UNDERTAKING:')[2] || '';
    return /path:\s*['"]bdm_id['"]/.test(block);
  },
  'Add { path: "bdm_id", select: "name email" } to DOC_TYPE_HYDRATION.UNDERTAKING populate array'
);

// 14. buildApprovalRequestDetails uses object-form populate so nested populate
//     (linked_grn_id → vendor_id) is honored. The legacy two-arg form silently
//     dropped the nested populate field.
check(
  'buildApprovalRequestDetails uses object-form populate (supports nested)',
  () => {
    const src = read('backend/erp/services/universalApprovalService.js');
    // Match the for-loop body — must call query.populate(p) (single-arg object form),
    // not query.populate(p.path, p.select) which discards nested populate config.
    return /query\s*=\s*query\.populate\(\s*p\s*\)/.test(src)
      && !/query\s*=\s*query\.populate\(\s*p\.path\s*,\s*p\.select\s*\)/.test(src);
  },
  'In buildApprovalRequestDetails, change `query.populate(p.path, p.select)` to `query.populate(p)` so nested populate (e.g. linked_grn_id → vendor_id) fires'
);

// ── Report ──────────────────────────────────────────────────────────────────
let failed = 0;
console.log('\n— Phase G4.5h-W Waybill Recovery wiring healthcheck —\n');
for (const c of checks) {
  const tag = c.ok ? 'OK ' : 'FAIL';
  console.log(`[${tag}] ${c.name}`);
  if (!c.ok) {
    failed++;
    if (c.error) console.log(`       error: ${c.error}`);
    if (c.hint) console.log(`       hint:  ${c.hint}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.\n`);
process.exit(failed === 0 ? 0 : 1);
