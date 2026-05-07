/**
 * Phase 32R-GRN-Approve-UX Healthcheck (May 07 2026)
 *
 * Static-contract verifier for the GRN approve-UX hardening that closes the
 * "click Approve, nothing happens, error swallowed in console" bug. The Phase
 * 32R approval rule (UT must be ACKNOWLEDGED before direct GRN approve, except
 * for president bypass) was correct on the backend but invisible on the
 * frontend — the row's Approve button was always enabled and clicking it
 * triggered a 400 that handleApprove logged to console only.
 *
 * What this asserts:
 *   1. Backend getGrnList enriches each row with `undertaking` summary
 *      (id + number + status + acknowledged_at) skipping reversed UTs.
 *   2. Approve handler still returns the Phase 32R 400 with `data.undertaking_id`
 *      so frontend can deep-link.
 *   3. Frontend handleApprove surfaces real errors via showError + showSuccess
 *      on success (no more silent console.error).
 *   4. Frontend renders a grnApproveState() gate that disables the button when
 *      the linked UT is not ACKNOWLEDGED, with hint + Open Undertaking link.
 *   5. President role is the only frontend bypass — mirrors the controller.
 *   6. Undertaking column shows UT# + status (vs the legacy "View →" only).
 *   7. WorkflowGuide grn-entry banner mentions the gating + president bypass
 *      (Rule #1).
 *   8. Subscription-readiness: no new lookup categories — still relies on
 *      MODULE_DEFAULT_ROLES.INVENTORY (Phase G4) + president-bypass invariant.
 *
 * Run: node backend/scripts/healthcheckGrnApproveUx.js
 * Exit 0 = pass. Exit 1 on first failed assertion category.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

let failures = 0;
let passes = 0;

function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

function assert(label, cond) {
  if (cond) {
    passes += 1;
    process.stdout.write('.');
  } else {
    failures += 1;
    console.error(`\n  ✗ ${label}`);
  }
}

console.log('Phase 32R-GRN-Approve-UX healthcheck');
console.log('────────────────────────────────────');

// ─── 0. Backend: getGrnSetting hoisted to module scope (THE root cause) ──
const inventoryCtl = read('backend/erp/controllers/inventoryController.js');

// Module-scope require — must appear before the first function declaration.
const moduleHoist = inventoryCtl.match(/^const \{ getGrnSetting \} = require\('\.\.\/services\/undertakingService'\);/m);
assert('inventoryController hoists `getGrnSetting` at module scope (top of file)',
  !!moduleHoist);

// No function-scope re-import inside createGrn (that was the bug).
assert('inventoryController has NO function-scope `const { getGrnSetting } = require(...)` (would mask the module hoist for static analysis)',
  (inventoryCtl.match(/const \{ getGrnSetting \} = require\(/g) || []).length === 1);

// approveGrnCore uses the hoisted symbol (still references it as `getGrnSetting`).
assert('approveGrnCore still references getGrnSetting (now resolved via module hoist)',
  /async function approveGrnCore[\s\S]*?await getGrnSetting\(/.test(inventoryCtl));

// ─── 1. Backend: getGrnList enrichment ────────────────────────────────────

assert('inventoryController.getGrnList requires Undertaking model on enrichment',
  /getGrnList[\s\S]*?const Undertaking = require\(['"]\.\.\/models\/Undertaking['"]\)/.test(inventoryCtl));

assert('getGrnList queries linked_grn_id by $in over the page',
  /Undertaking\.find\(\{\s*linked_grn_id:\s*\{\s*\$in:\s*grnIds\s*\}/.test(inventoryCtl));

assert('getGrnList selects undertaking_number + status + acknowledged_at + deletion_event_id',
  /\.select\(['"]linked_grn_id undertaking_number status acknowledged_at deletion_event_id['"]\)/.test(inventoryCtl));

assert('getGrnList skips reversed (deletion_event_id present) UTs in the map',
  /if \(ut\.deletion_event_id\) continue/.test(inventoryCtl));

assert('getGrnList stamps each row with `undertaking` (null when none)',
  /g\.undertaking = utByGrn\.get\(g\._id\.toString\(\)\) \|\| null/.test(inventoryCtl));

// ─── 2. Backend: Phase 32R guard still ships undertaking_id in 400 body ──
assert('approveGrn 400 body carries data.undertaking_id for deep-link',
  /undertaking_id:\s*ut\._id,\s*undertaking_number:\s*ut\.undertaking_number,\s*undertaking_status:\s*ut\.status/.test(inventoryCtl));

assert('approveGrn checks UT status !== ACKNOWLEDGED for non-president',
  /if \(!req\.isPresident\)[\s\S]*?ut\.status\s*!==\s*['"]ACKNOWLEDGED['"]/.test(inventoryCtl));

// ─── 3. Frontend: handleApprove surfaces real errors ─────────────────────
const grnPage = read('frontend/src/erp/pages/GrnEntry.jsx');

assert('GrnEntry handleApprove no longer silently console.errors',
  !/console\.error\(['"]GRN approve error/.test(grnPage));

assert('GrnEntry handleApprove calls showSuccess on success',
  /handleApprove[\s\S]*?showSuccess\(res\?.message/.test(grnPage));

assert('GrnEntry handleApprove calls showError on failure',
  /handleApprove[\s\S]*?showError\(err, msg\)/.test(grnPage));

assert('GrnEntry handleApprove deep-links to UT when 400 carries undertaking_id',
  /data\?\.data\?\.undertaking_id[\s\S]*?navigate\(`\/erp\/undertaking\/\$\{data\.data\.undertaking_id\}`\)/.test(grnPage));

assert('GrnEntry handleApprove still respects approval_pending (HTTP 202)',
  /handleApprove[\s\S]*?approval_pending[\s\S]*?showApprovalPending/.test(grnPage));

// ─── 4. Frontend: button gate ────────────────────────────────────────────
assert('GrnEntry defines grnApproveState() gate helper',
  /const grnApproveState = \(g\) =>/.test(grnPage));

assert('grnApproveState bypasses for president',
  /grnApproveState[\s\S]*?if \(isPresident\) return \{ canApprove: true/.test(grnPage));

assert('grnApproveState requires UT.status === ACKNOWLEDGED for non-president',
  /grnApproveState[\s\S]*?ut\.status === ['"]ACKNOWLEDGED['"][\s\S]*?canApprove: true/.test(grnPage));

assert('grnApproveState returns undertaking_id for the deep-link CTA when blocked',
  /grnApproveState[\s\S]*?undertaking_id:\s*ut\._id/.test(grnPage));

assert('Approve button uses disabled={!gate.canApprove}',
  /disabled=\{!gate\.canApprove\}/.test(grnPage));

assert('Approve button hint surfaces gate.hint via title attr',
  /title=\{gate\.hint \|\| ['"]['"]\}/.test(grnPage));

assert('Open Undertaking → CTA renders when gate blocks with undertaking_id',
  /Open Undertaking →/.test(grnPage));

// ─── 5. Frontend: president-only bypass mirrors controller ───────────────
assert('GrnEntry defines isPresident gate from user.role === "president"',
  /const isPresident = user\?\.role === ['"]president['"]/.test(grnPage));

// ─── 6. Frontend: Undertaking column shows UT# + status pill ────────────
assert('Undertaking column renders g.undertaking.undertaking_number link',
  /\{g\.undertaking\.undertaking_number\} →/.test(grnPage));

assert('Undertaking column renders status text colored by ACK / REJECTED',
  /g\.undertaking\.status === ['"]ACKNOWLEDGED['"] \?\s*['"]#166534['"]/.test(grnPage));

// ─── 7. WorkflowGuide banner mentions the gate (Rule #1) ────────────────
const banner = read('frontend/src/erp/components/WorkflowGuide.jsx');

assert("WorkflowGuide grn-entry banner mentions 'gated on the linked Undertaking being ACKNOWLEDGED'",
  /grn-entry[\s\S]*?gated on the linked Undertaking being ACKNOWLEDGED/.test(banner));

assert("WorkflowGuide grn-entry banner mentions 'President bypass'",
  /grn-entry[\s\S]*?President bypass/.test(banner));

assert("WorkflowGuide grn-entry banner mentions 'Open Undertaking →'",
  /grn-entry[\s\S]*?Open Undertaking →/.test(banner));

// ─── 8. Subscription-readiness ──────────────────────────────────────────
// No new lookup categories — fix is purely UX-routing for an existing
// authorization gate. Assert there's no inline role hardcoding regression in
// the controller's approve gate.
assert('approveGrn controller still routes through gateApproval (lookup-driven)',
  /approveGrn = catchAsync[\s\S]*?gateApproval\(\{/.test(inventoryCtl));

assert('approveGrn module remains INVENTORY (existing MODULE_DEFAULT_ROLES key)',
  /approveGrn = catchAsync[\s\S]*?module:\s*['"]INVENTORY['"]/.test(inventoryCtl));

console.log(`\n\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
