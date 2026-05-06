#!/usr/bin/env node
/**
 * Phase A.5.3 + A.5.6 — Static contract verifier
 *
 * Run: `node backend/scripts/healthcheckPhaseA5_3_6.js`
 * Exit code 0 = clean, 1 = at least one assertion failed.
 *
 * This is a finer-grained sibling of scripts/check-system-health.js section 11.
 * The system-wide check counts files; this script counts assertions, prints
 * each PASS/FAIL line, and groups them by surface so a regression points at
 * the exact part of the contract that broke.
 *
 * Sections:
 *   1. Doctor model         — canonical key, mergedInto, indexes, hooks
 *   2. errorHandler         — friendly 409 fallback for non-modal callers
 *   3. doctorController     — DUPLICATE_VIP_CLIENT helper + create + update + joinCoverage
 *   4. doctorRoutes         — POST /:id/join-coverage mounted
 *   5. visitController      — A.5.6 mergedInto resolver + merge_redirected response
 *   6. resolveVipClientLifecycleRole — exports + lookup category
 *   7. lookupGenericController       — VIP_CLIENT_LIFECYCLE_ROLES seed (JOIN_COVERAGE_AUTO + APPROVAL)
 *   8. Frontend modal       — DuplicateVipClientModal contract
 *   9. Frontend service     — doctorService.joinCoverage helper
 *  10. DoctorsPage          — modal wiring + 409 intercept on save + upgrade flow
 *  11. PageGuide banner     — doctors-page tip mentions Phase A.5.3 + A.5.6
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0;
let fail = 0;

function readFile(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf-8');
}

function check(label, condition) {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}`);
  }
}

function section(title) {
  console.log(`\n── ${title}`);
}

console.log('Phase A.5.3 + A.5.6 — Canonical VIP Client + Merge Resolver');
console.log('═'.repeat(60));

// ── 1. Doctor model ────────────────────────────────────────────────────
section('1. Doctor model — canonical key + mergedInto + hooks');
{
  const c = readFile('backend/models/Doctor.js') || '';
  check('vip_client_name_clean field defined', c.includes('vip_client_name_clean:'));
  check('mergedInto field defined', c.includes('mergedInto:'));
  check('mergedAt field defined', c.includes('mergedAt:'));
  check('vip_client_name_clean has an index declaration', c.includes('doctorSchema.index({ vip_client_name_clean: 1 })'));
  check('mergedInto index exists for cron sweeps', c.includes('doctorSchema.index({ mergedInto: 1 })'));
  check('pre-save hook recomputes canonical key', c.includes('this.vip_client_name_clean ='));
  check('pre-findOneAndUpdate hook mirrors canonical key', c.includes("doctorSchema.pre('findOneAndUpdate'"));
  check("pre-update updates vip_client_name_clean via $set", c.includes('$set.vip_client_name_clean'));
}

// ── 2. errorHandler — friendly 409 fallback ────────────────────────────
section('2. errorHandler — fallback friendly 409');
{
  const c = readFile('backend/middleware/errorHandler.js') || '';
  check('errorHandler maps E11000 on vip_client_name_clean', c.includes('vip_client_name_clean'));
  check('Fallback message is actionable (not raw field name)', c.includes('A VIP Client with this name already exists'));
  check('Status code is 409, not 400', /new ApiError\(\s*409,/.test(c));
}

// ── 3. doctorController — DUPLICATE_VIP_CLIENT contract ────────────────
section('3. doctorController — 409 helper + create/update intercept + joinCoverage');
{
  const c = readFile('backend/controllers/doctorController.js') || '';
  check('Imports MessageInbox for approval-mode posts', c.includes("require('../models/MessageInbox')"));
  check('Imports lookup-driven role helper', c.includes("require('../utils/resolveVipClientLifecycleRole')"));
  check('buildDuplicateVipClient409 helper defined', c.includes('async function buildDuplicateVipClient409'));
  check('isVipClientNameCleanDuplicate predicate defined', c.includes('function isVipClientNameCleanDuplicate'));
  check('computeCanonicalKey fallback defined', c.includes('function computeCanonicalKey'));
  check("409 carries code: 'DUPLICATE_VIP_CLIENT'", c.includes("code: 'DUPLICATE_VIP_CLIENT'"));
  check('409 carries can_join_auto', c.includes('can_join_auto'));
  check('409 carries can_join_approval', c.includes('can_join_approval'));
  check('409 carries existing.visitCount', c.includes('visitCount'));
  check('409 carries suggested_action', c.includes("suggested_action: 'rename_or_join_coverage'"));
  check('createDoctor wraps Doctor.create with try/catch for 11000', /try\s*\{\s*doctor\s*=\s*await Doctor\.create/.test(c));
  check('createDoctor txn fallback also calls buildDuplicateVipClient409', (c.match(/buildDuplicateVipClient409/g) || []).length >= 3);
  check('updateDoctor wraps doctor.save() in try/catch for 11000', /await doctor\.save\(\);[^}]*?\}\s*catch\s*\(err\)/s.test(c) || c.includes('await doctor.save();\n  } catch'));
  check('joinCoverage controller exists + exported', c.includes('const joinCoverage = catchAsync') && c.includes('joinCoverage,'));
  check('joinCoverage uses $addToSet on assignedTo', c.includes('$addToSet: { assignedTo: req.user._id }'));
  check('joinCoverage rejects merged-loser docs (DOCTOR_MERGED 409)', c.includes("code: 'DOCTOR_MERGED'"));
  check('joinCoverage idempotent on already-assigned (already_assigned: true)', c.includes('already_assigned: true'));
  check('joinCoverage approval-mode posts MessageInbox with category=approval_request', c.includes("category: 'approval_request'"));
  check("joinCoverage gates on JOIN_COVERAGE_AUTO lookup code", c.includes("'JOIN_COVERAGE_AUTO'"));
  check("joinCoverage gates on JOIN_COVERAGE_APPROVAL lookup code", c.includes("'JOIN_COVERAGE_APPROVAL'"));
}

// ── 4. doctorRoutes — endpoint mount ───────────────────────────────────
section('4. doctorRoutes — POST /:id/join-coverage mounted');
{
  const c = readFile('backend/routes/doctorRoutes.js') || '';
  check('joinCoverage imported from controller', c.includes('joinCoverage,'));
  check("router.post('/:id/join-coverage' mounted", c.includes("router.post('/:id/join-coverage'"));
  check('Mount is BEFORE generic /:id update', c.indexOf("router.post('/:id/join-coverage'") < c.indexOf("router.put('/:id'"));
}

// ── 5. visitController — A.5.6 merge resolver ──────────────────────────
section('5. visitController — Phase A.5.6 merge resolver');
{
  const c = readFile('backend/controllers/visitController.js') || '';
  check('Destructures rawDoctorId (resolver renames before use)', c.includes('doctor: rawDoctorId'));
  check('Walks merge chain via mergedInto', c.includes('mergedInto'));
  check('Caps walks at MAX_MERGE_HOPS', c.includes('MAX_MERGE_HOPS'));
  check('Sets doctorMergeRedirected flag for response', c.includes('doctorMergeRedirected'));
  check('Tracks originalDoctorId for audit log', c.includes('originalDoctorId'));
  check('Console-logs the redirect for ops visibility', c.includes('[Phase A.5.6]'));
  check('Response carries merge_redirected on success', c.includes('merge_redirected'));
  check('Resolver sits BEFORE canVisitDoctor access check', c.indexOf('doctorMergeRedirected') < c.indexOf('canVisitDoctor(doctorId'));
}

// ── 6. resolveVipClientLifecycleRole helper ────────────────────────────
section('6. resolveVipClientLifecycleRole — exports + lookup category');
{
  const c = readFile('backend/utils/resolveVipClientLifecycleRole.js') || '';
  check("Reads from VIP_CLIENT_LIFECYCLE_ROLES category", c.includes("category: 'VIP_CLIENT_LIFECYCLE_ROLES'"));
  check('getJoinCoverageAutoRoles export', c.includes('getJoinCoverageAutoRoles'));
  check('getJoinCoverageApprovalRoles export', c.includes('getJoinCoverageApprovalRoles'));
  check('userCanPerformLifecycleAction export', c.includes('userCanPerformLifecycleAction'));
  check('invalidate export for hot config (Rule #19)', c.includes('function invalidate'));
  check('Has 60s TTL cache (mirrors mdPartnerAccess.js shape)', c.includes('TTL_MS'));
  check('Defaults are [admin, president] for both gates', c.includes('DEFAULT_JOIN_COVERAGE_AUTO') && c.includes('DEFAULT_JOIN_COVERAGE_APPROVAL'));
}

// ── 7. lookupGenericController seed for VIP_CLIENT_LIFECYCLE_ROLES ─────
section('7. lookupGenericController — VIP_CLIENT_LIFECYCLE_ROLES seed presence');
{
  const c = readFile('backend/erp/controllers/lookupGenericController.js') || '';
  check('VIP_CLIENT_LIFECYCLE_ROLES seed key exists', c.includes('VIP_CLIENT_LIFECYCLE_ROLES:'));
  check("Seed includes JOIN_COVERAGE_AUTO row", c.includes("code: 'JOIN_COVERAGE_AUTO'"));
  check("Seed includes JOIN_COVERAGE_APPROVAL row", c.includes("code: 'JOIN_COVERAGE_APPROVAL'"));
  check('JOIN_COVERAGE_AUTO uses insert_only_metadata so admin overrides survive re-seed', /JOIN_COVERAGE_AUTO[^}]*insert_only_metadata:\s*true/.test(c));
  check('JOIN_COVERAGE_APPROVAL uses insert_only_metadata so admin overrides survive re-seed', /JOIN_COVERAGE_APPROVAL[^}]*insert_only_metadata:\s*true/.test(c));
}

// ── 8. Frontend modal — DuplicateVipClientModal ────────────────────────
section('8. Frontend modal — DuplicateVipClientModal');
{
  const c = readFile('frontend/src/components/admin/DuplicateVipClientModal.jsx') || '';
  check('Imports memo for prop-stability', c.includes("memo"));
  check('Renders Rename / Join / Request buttons via testids', c.includes('data-testid="dvc-rename"') && c.includes('data-testid="dvc-join-auto"') && c.includes('data-testid="dvc-join-approval"'));
  check('Reads can_join_auto from duplicate prop', c.includes('can_join_auto: canAuto'));
  check('Reads can_join_approval from duplicate prop', c.includes('can_join_approval: canApproval'));
  check('Approval-mode shows notes textarea', c.includes('!canAuto && canApproval'));
  check('Rename button does not require permission', /onClick={onRename}/.test(c));
  check('Notes maxLength capped (DoS guard)', c.includes('maxLength={500}'));
  check('Z-index above add/edit modal (1100 > 1000)', c.includes('z-index: 1100'));
}

// ── 9. Frontend service — doctorService.joinCoverage ───────────────────
section('9. Frontend service — doctorService.joinCoverage');
{
  const c = readFile('frontend/src/services/doctorService.js') || '';
  check('joinCoverage method exposed', c.includes('joinCoverage:'));
  check('Posts to /doctors/:id/join-coverage', c.includes('/doctors/${doctorId}/join-coverage'));
  check('Sends notes only when truthy (avoids empty-body 400)', c.includes('notes ? { notes } : {}'));
}

// ── 10. DoctorsPage — modal mount + 409 intercept ──────────────────────
section('10. DoctorsPage — modal mount + 409 intercept on save + upgrade');
{
  const c = readFile('frontend/src/pages/admin/DoctorsPage.jsx') || '';
  check('Imports DuplicateVipClientModal', c.includes("import DuplicateVipClientModal"));
  check('duplicateVipClient state added', c.includes('useState(null)') && c.includes('duplicateVipClient'));
  check("handleSaveDoctor catches code === 'DUPLICATE_VIP_CLIENT'", c.includes("code === 'DUPLICATE_VIP_CLIENT'"));
  check('handleDuplicateRename callback exists', c.includes('handleDuplicateRename'));
  check('handleDuplicateJoinAuto callback exists', c.includes('handleDuplicateJoinAuto'));
  check('handleDuplicateJoinApproval callback exists', c.includes('handleDuplicateJoinApproval'));
  // performUpgrade is the Regular→VIP upgrade path. It calls doctorService.create
  // and must catch the structured 409 the same way handleSaveDoctor does so the
  // duplicate modal opens on collision (vs. swallowing into a toast).
  // Regex uses lazy [\s\S]*? to allow nested braces in the function body.
  check('performUpgrade also intercepts DUPLICATE_VIP_CLIENT 409', /const performUpgrade[\s\S]*?DUPLICATE_VIP_CLIENT[\s\S]*?setDuplicateVipClient/.test(c));
  check('Modal rendered conditionally on duplicateVipClient state', c.includes('{duplicateVipClient && ('));
  check('Modal mounted as sibling of DoctorManagement', c.indexOf('DuplicateVipClientModal') > c.indexOf('DoctorManagement'));
}

// ── 11. PageGuide — doctors-page banner mentions A.5.3 + A.5.6 ─────────
section('11. PageGuide — doctors-page banner');
{
  const c = readFile('frontend/src/components/common/PageGuide.jsx') || '';
  check("'doctors-page' banner present", c.includes("'doctors-page'"));
  check('Banner mentions Phase A.5.3', c.includes('Phase A.5.3'));
  check('Banner mentions Phase A.5.6', c.includes('Phase A.5.6'));
  check('Banner mentions VIP_CLIENT_LIFECYCLE_ROLES (subscription-readiness disclosure)', c.includes('VIP_CLIENT_LIFECYCLE_ROLES'));
  check('Banner mentions JOIN_COVERAGE_AUTO', c.includes('JOIN_COVERAGE_AUTO'));
  check('Banner mentions JOIN_COVERAGE_APPROVAL', c.includes('JOIN_COVERAGE_APPROVAL'));
}

console.log('\n' + '═'.repeat(60));
console.log(`Result: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
