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

// ── Summary ───────────────────────────────────────────────────
const total = pass + fail;
process.stdout.write(`\n${'═'.repeat(60)}\n`);
process.stdout.write(`Healthcheck: ${pass}/${total} PASS\n`);
if (fail > 0) {
  process.stdout.write(`\nFailures:\n`);
  failures.forEach(f => process.stdout.write(`  - ${f}\n`));
  process.exit(1);
}
process.stdout.write(`\n✓ Capture Hub Phase P1.1 contract is intact.\n`);
process.exit(0);
