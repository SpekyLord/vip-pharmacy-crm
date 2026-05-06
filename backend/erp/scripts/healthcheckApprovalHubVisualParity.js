/**
 * Phase 32R-VP (May 6, 2026) — Static healthcheck for the Approval Hub
 * visual-parity wiring (proxy badge + Linked Undertaking badge on the GRN
 * card; proxy badge on the UT card). Runs without a DB connection — purely
 * verifies the code is wired end-to-end so the May 6 visual asymmetry between
 * the GRN and UT approval cards cannot regress.
 *
 * Run: node backend/erp/scripts/healthcheckApprovalHubVisualParity.js
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

// ────────────────────────────────────────────────────────────────────────────
// Section 1 — universalApprovalService.js: hub query populates the proxy +
// undertaking_id back-ref so the detail builder has the data to surface.
// ────────────────────────────────────────────────────────────────────────────

const svc = read('backend/erp/services/universalApprovalService.js');

check(
  'INVENTORY MODULE_QUERIES populates recorded_on_behalf_of',
  () => {
    // Slice the INVENTORY block specifically so we don't false-pass on the
    // EXPENSES populate at L641.
    const m = svc.match(/module:\s*['"]INVENTORY['"][\s\S]{0,2000}?return\s+items\.map/);
    if (!m) return false;
    return /\.populate\(\s*['"]recorded_on_behalf_of['"]\s*,\s*['"]name['"]\s*\)/.test(m[0]);
  },
  'Add .populate("recorded_on_behalf_of", "name") to the INVENTORY MODULE_QUERIES query in universalApprovalService.js'
);

check(
  'INVENTORY MODULE_QUERIES populates undertaking_id back-ref with line_items',
  () => {
    const m = svc.match(/module:\s*['"]INVENTORY['"][\s\S]{0,2000}?return\s+items\.map/);
    if (!m) return false;
    return /\.populate\(\{\s*path:\s*['"]undertaking_id['"][\s\S]{0,200}?select:\s*['"][^'"]*undertaking_number[^'"]*line_items[^'"]*['"]/.test(m[0]);
  },
  'Add .populate({ path: "undertaking_id", select: "undertaking_number receipt_date status line_items" }) to INVENTORY query'
);

check(
  'UNDERTAKING MODULE_QUERIES populates recorded_on_behalf_of',
  () => {
    const m = svc.match(/module:\s*['"]UNDERTAKING['"][\s\S]{0,2000}?return\s+items\.map/);
    if (!m) return false;
    return /\.populate\(\s*['"]recorded_on_behalf_of['"]\s*,\s*['"]name['"]\s*\)/.test(m[0]);
  },
  'Add .populate("recorded_on_behalf_of", "name") to the UNDERTAKING MODULE_QUERIES query'
);

// ────────────────────────────────────────────────────────────────────────────
// Section 2 — documentDetailBuilder.js: emit recorded_on_behalf_of and
// linked_undertaking so the panel has the fields to render.
// ────────────────────────────────────────────────────────────────────────────

const builder = read('backend/erp/services/documentDetailBuilder.js');

check(
  'buildInventoryDetails emits recorded_on_behalf_of',
  () => {
    const m = builder.match(/function\s+buildInventoryDetails[\s\S]*?\n\}/);
    if (!m) return false;
    return /recorded_on_behalf_of:\s*item\.recorded_on_behalf_of\?\.name/.test(m[0]);
  },
  'Edit buildInventoryDetails — emit `recorded_on_behalf_of: item.recorded_on_behalf_of?.name || null`'
);

check(
  'buildInventoryDetails emits structured linked_undertaking with undertaking_number',
  () => {
    const m = builder.match(/function\s+buildInventoryDetails[\s\S]*?\n\}/);
    if (!m) return false;
    return /linked_undertaking:\s*ut\s*\?\s*\{[\s\S]*?undertaking_number/.test(m[0])
      && /scan_total_count/.test(m[0])
      && /variance_count/.test(m[0]);
  },
  'Edit buildInventoryDetails — emit linked_undertaking object with undertaking_number, scan_total_count, variance_count'
);

check(
  'buildInventoryDetails still emits raw undertaking_id (back-compat for cascade chips)',
  () => {
    const m = builder.match(/function\s+buildInventoryDetails[\s\S]*?\n\}/);
    if (!m) return false;
    return /undertaking_id:\s*ut\?\._id\s*\|\|\s*item\.undertaking_id/.test(m[0]);
  },
  'Keep emitting `undertaking_id` raw — downstream consumers (reversal cascade) read the bare ID'
);

check(
  'buildUndertakingDetails emits recorded_on_behalf_of',
  () => {
    const m = builder.match(/function\s+buildUndertakingDetails[\s\S]*?\n\}/);
    if (!m) return false;
    return /recorded_on_behalf_of:\s*item\.recorded_on_behalf_of\?\.name/.test(m[0]);
  },
  'Edit buildUndertakingDetails — emit `recorded_on_behalf_of: item.recorded_on_behalf_of?.name || null`'
);

// ────────────────────────────────────────────────────────────────────────────
// Section 3 — DocumentDetailPanel.jsx: INVENTORY + UNDERTAKING blocks render
// the new fields, and the old `Undertaking` truncated chip is gone.
// ────────────────────────────────────────────────────────────────────────────

const panel = read('frontend/src/erp/components/DocumentDetailPanel.jsx');

// Slice the INVENTORY block (between `module === 'INVENTORY'` and `module ===
// 'UNDERTAKING'`) so we don't false-pass on the EXPENSE block which already
// has recorded_on_behalf_of since before this phase.
function inventoryBlock() {
  const start = panel.indexOf("module === 'INVENTORY'");
  const end = panel.indexOf("module === 'UNDERTAKING'", start);
  if (start < 0 || end < 0) return '';
  return panel.slice(start, end);
}
function undertakingBlock() {
  const start = panel.indexOf("module === 'UNDERTAKING'");
  if (start < 0) return '';
  // Crude but sufficient: end at the next `module === '` (next branch).
  const end = panel.indexOf("module === '", start + 25);
  return panel.slice(start, end > 0 ? end : panel.length);
}

check(
  'INVENTORY block renders recorded_on_behalf_of pill',
  () => /d\.recorded_on_behalf_of\s*&&\s*\(\s*<span[\s\S]{0,400}?On behalf of\s*\{?\s*d\.recorded_on_behalf_of/.test(inventoryBlock()),
  'Add the violet "On behalf of" pill to the INVENTORY block in DocumentDetailPanel.jsx'
);

check(
  'INVENTORY block renders linked_undertaking structured badge',
  () => {
    const ib = inventoryBlock();
    return /d\.linked_undertaking\s*&&/.test(ib)
      && /Linked Undertaking:/.test(ib)
      && /d\.linked_undertaking\.undertaking_number/.test(ib);
  },
  'Add the "Linked Undertaking" accent-soft badge to the INVENTORY block'
);

check(
  'INVENTORY block no longer renders the truncated [Undertaking, d.undertaking_id] chip via LinkedRefsLine',
  () => {
    const ib = inventoryBlock();
    // The old chip was: ['Undertaking', d.undertaking_id] inside LinkedRefsLine.
    // We now route Undertaking through the structured badge instead.
    return !/\[\s*['"]Undertaking['"],\s*d\.undertaking_id/.test(ib);
  },
  'Remove the ["Undertaking", d.undertaking_id] entry from INVENTORY LinkedRefsLine refs — now rendered via the new linked_undertaking badge'
);

check(
  'INVENTORY block still keeps StockReassignment in LinkedRefsLine (different relationship, unrelated to UT)',
  () => /\[\s*['"]StockReassignment['"],\s*d\.reassignment_id/.test(inventoryBlock()),
  'Keep ["StockReassignment", d.reassignment_id, "internal-transfer"] in INVENTORY LinkedRefsLine refs'
);

check(
  'UNDERTAKING block renders recorded_on_behalf_of pill',
  () => /d\.recorded_on_behalf_of\s*&&\s*\(\s*<span[\s\S]{0,400}?On behalf of\s*\{?\s*d\.recorded_on_behalf_of/.test(undertakingBlock()),
  'Add the violet "On behalf of" pill to the UNDERTAKING block in DocumentDetailPanel.jsx'
);

check(
  'UNDERTAKING block keeps Linked GRN block intact (regression guard)',
  () => /d\.linked_grn\s*&&/.test(undertakingBlock()) && /Linked GRN:/.test(undertakingBlock()),
  'Do not break the existing UT-side Linked GRN block'
);

// ────────────────────────────────────────────────────────────────────────────
// Section 4 — Model fields exist (regression guard against schema drift).
// ────────────────────────────────────────────────────────────────────────────

check(
  'GrnEntry model declares recorded_on_behalf_of',
  () => /recorded_on_behalf_of:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/.test(read('backend/erp/models/GrnEntry.js')),
  'GrnEntry.recorded_on_behalf_of must remain on the schema (Phase G4.5b proxy field)'
);

check(
  'GrnEntry model declares undertaking_id back-ref',
  () => /undertaking_id:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/.test(read('backend/erp/models/GrnEntry.js')),
  'GrnEntry.undertaking_id must remain on the schema (Phase 32 back-ref)'
);

check(
  'Undertaking model declares recorded_on_behalf_of',
  () => /recorded_on_behalf_of:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/.test(read('backend/erp/models/Undertaking.js')),
  'Undertaking.recorded_on_behalf_of must remain on the schema (Phase G4.5b proxy field)'
);

// ────────────────────────────────────────────────────────────────────────────
// Report
// ────────────────────────────────────────────────────────────────────────────

const passed = checks.filter(c => c.ok).length;
const failed = checks.length - passed;

console.log('\n=== Approval Hub Visual Parity Healthcheck (Phase 32R-VP) ===\n');
checks.forEach((c, i) => {
  const mark = c.ok ? 'PASS' : 'FAIL';
  console.log(`  ${String(i + 1).padStart(2)}. [${mark}] ${c.name}`);
  if (!c.ok) {
    if (c.error) console.log(`        ERROR: ${c.error}`);
    if (c.hint)  console.log(`        HINT:  ${c.hint}`);
  }
});
console.log(`\n  Total: ${checks.length} | Passed: ${passed} | Failed: ${failed}\n`);

process.exit(failed === 0 ? 0 : 1);
