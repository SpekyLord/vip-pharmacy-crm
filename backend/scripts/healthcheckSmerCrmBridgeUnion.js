#!/usr/bin/env node
/**
 * Phase G1.7 SMER ↔ CRM Bridge Union — static contract verifier
 *
 * Asserts the May 05 2026 yes-equal-weight wiring is intact end-to-end:
 *   - smerCrmBridge.js requires Visit + ClientVisit + Doctor + Client
 *   - getDailyMdCount sums VIP + EXTRA distinct counts (toggle-aware)
 *   - getDailyMdCounts unions Visit + ClientVisit aggregations (toggle-aware)
 *   - getDailyVisitDetails unions Visit + ClientVisit drill-down (toggle-aware)
 *   - aggregateDailyByCollection helper exists with the (Model, fkField, ...) signature
 *   - perdiemCalc.js resolvePerdiemConfig surfaces include_extra_calls (default true)
 *   - PERDIEM_RATES seed defaults carry include_extra_calls for BDM + ECOMMERCE_BDM
 *   - expenseController.getSmerCrmMdCounts pipes include_extra_calls through to bridge
 *   - expenseController.getSmerCrmVisitDetail pipes include_extra_calls through
 *   - expenseController response surfaces include_extra_calls for the UI
 *   - WorkflowGuide SMER tip mentions yes-equal-weight (Rule #1)
 *
 * Run:   node backend/scripts/healthcheckSmerCrmBridgeUnion.js
 * Exit:  0 = clean, 1 = issues
 *
 * Rule #5 — every behavioral change ships with a healthcheck so a future
 * cross-cutting refactor can't silently un-wire the union.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const checks = [];
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function check(label, ok, detail = '') {
  checks.push({ label, ok, detail });
  if (!ok) failed += 1;
}

// ── 1. Bridge imports ────────────────────────────────────────────────────────
const bridge = read('backend/erp/services/smerCrmBridge.js');
check(
  'smerCrmBridge requires Visit',
  /require\(['"]\.\.\/\.\.\/models\/Visit['"]\)/.test(bridge)
);
check(
  'smerCrmBridge requires ClientVisit (EXTRA stream)',
  /require\(['"]\.\.\/\.\.\/models\/ClientVisit['"]\)/.test(bridge)
);
check(
  'smerCrmBridge requires Doctor',
  /require\(['"]\.\.\/\.\.\/models\/Doctor['"]\)/.test(bridge)
);
check(
  'smerCrmBridge requires Client (EXTRA master records)',
  /require\(['"]\.\.\/\.\.\/models\/Client['"]\)/.test(bridge)
);

// ── 2. getDailyMdCount (singular) — dual-stream + toggle ─────────────────────
check(
  'getDailyMdCount accepts opts with includeExtraCalls',
  /async function getDailyMdCount\([^)]*opts[^)]*\)[\s\S]*?includeExtraCalls\s*=\s*true/.test(bridge)
);
check(
  'getDailyMdCount queries Visit.distinct(\'doctor\', ...)',
  /Visit\.distinct\(['"]doctor['"]/.test(bridge)
);
check(
  'getDailyMdCount queries ClientVisit.distinct(\'client\', ...)',
  /ClientVisit\.distinct\(['"]client['"]/.test(bridge)
);

// ── 3. getDailyMdCounts (range) — union pipeline + toggle ────────────────────
check(
  'getDailyMdCounts accepts includeExtraCalls in opts',
  /async function getDailyMdCounts\([\s\S]*?const\s*\{[^}]*includeExtraCalls\s*=\s*true/.test(bridge)
);
check(
  'getDailyMdCounts dispatches Visit aggregation',
  /aggregateDailyByCollection\(Visit,\s*['"]doctor['"]/.test(bridge)
);
check(
  'getDailyMdCounts conditionally dispatches ClientVisit aggregation',
  /includeExtraCalls\s*\?\s*aggregateDailyByCollection\(ClientVisit,\s*['"]client['"]/.test(bridge)
);
check(
  'aggregateDailyByCollection helper defined with (Model, fkField, userObjectId, dateRange) signature',
  /async function aggregateDailyByCollection\(Model,\s*fkField,\s*userObjectId,\s*dateRange\)/.test(bridge)
);
check(
  'getDailyMdCounts merges per-day buckets across both streams (allDayKeys union)',
  /allDayKeys\s*=\s*new Set\(\[\.\.\.vipResults\.map[\s\S]*?\.\.\.extraResults\.map/.test(bridge)
);
check(
  'getDailyMdCounts batch-fetches Doctor + Client master records for locations',
  /Doctor\.find\([\s\S]*?Client\.find\(/.test(bridge)
);

// ── 4. getDailyVisitDetails — union drill-down + toggle ──────────────────────
check(
  'getDailyVisitDetails accepts includeExtraCalls in opts',
  /async function getDailyVisitDetails\([\s\S]*?const\s*\{[^}]*includeExtraCalls\s*=\s*true/.test(bridge)
);
check(
  'getDailyVisitDetails populates Visit.doctor + ClientVisit.client',
  /populate\(['"]doctor['"][\s\S]*?populate\(['"]client['"]/.test(bridge)
);
check(
  'getDailyVisitDetails adapts EXTRA rows so client appears under .doctor key (universalApprovalService contract)',
  /doctor:\s*v\.client/.test(bridge)
);
check(
  'getDailyVisitDetails short-circuits ClientVisit fetch when includeExtraCalls=false',
  /includeExtraCalls\s*\?\s*ClientVisit\.find/.test(bridge)
);

// ── 5. perdiemCalc resolver — surfaces include_extra_calls (default true) ────
const perdiem = read('backend/erp/services/perdiemCalc.js');
check(
  'perdiemCalc.resolvePerdiemConfig returns include_extra_calls (default true)',
  /include_extra_calls:\s*m\.include_extra_calls\s*!==\s*false/.test(perdiem)
);

// ── 6. PERDIEM_RATES seed defaults carry the new metadata key ────────────────
const lookups = read('backend/erp/controllers/lookupGenericController.js');
check(
  'PERDIEM_RATES.BDM seed includes include_extra_calls: true',
  /code:\s*['"]BDM['"][\s\S]{0,500}?include_extra_calls:\s*true/.test(lookups)
);
check(
  'PERDIEM_RATES.ECOMMERCE_BDM seed includes include_extra_calls: true',
  /code:\s*['"]ECOMMERCE_BDM['"][\s\S]{0,500}?include_extra_calls:\s*true/.test(lookups)
);

// ── 7. expenseController pipes the toggle into both bridge calls ─────────────
const expCtrl = read('backend/erp/controllers/expenseController.js');
check(
  'expenseController.getSmerCrmMdCounts passes includeExtraCalls to getDailyMdCounts',
  /getDailyMdCounts\([\s\S]{0,500}?includeExtraCalls:\s*perdiemConfig\.include_extra_calls/.test(expCtrl)
);
check(
  'expenseController.getSmerCrmVisitDetail passes includeExtraCalls to getDailyVisitDetails',
  /getDailyVisitDetails\([\s\S]{0,500}?includeExtraCalls:\s*drillConfig\.include_extra_calls/.test(expCtrl)
);
check(
  'expenseController response surfaces include_extra_calls flag',
  /include_extra_calls:\s*!!perdiemConfig\.include_extra_calls/.test(expCtrl)
);

// ── 8. WorkflowGuide banner mentions Phase G1.7 yes-equal-weight (Rule #1) ───
const wf = read('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  'WorkflowGuide SMER tip mentions G1.7 / yes-equal-weight',
  /yes-equal-weight/i.test(wf) && /Phase G1\.7|May 05 2026/.test(wf)
);
check(
  'WorkflowGuide SMER tip mentions include_extra_calls subscriber toggle',
  /include_extra_calls/.test(wf)
);

// ── 9. Bridge module exports stay intact ─────────────────────────────────────
check(
  'smerCrmBridge exports all 4 functions (getDailyMdCount, getDailyMdCounts, getDailyLogbookCounts, getDailyVisitDetails)',
  /module\.exports\s*=\s*\{[\s\S]*?getDailyMdCount,[\s\S]*?getDailyMdCounts,[\s\S]*?getDailyLogbookCounts,[\s\S]*?getDailyVisitDetails[\s\S]*?\}/.test(bridge)
);

// ── 10. Backwards-compat: the existing universalApprovalService caller path ──
const uas = read('backend/erp/services/universalApprovalService.js');
check(
  'universalApprovalService still imports getDailyVisitDetails',
  /const\s*\{\s*getDailyVisitDetails\s*\}\s*=\s*require\(['"]\.\/smerCrmBridge['"]\)/.test(uas)
);
check(
  'universalApprovalService reads v.doctor?.clinicOfficeAddress (drill-down adapter contract)',
  /v\.doctor\?\.clinicOfficeAddress/.test(uas)
);

// ── Report ────────────────────────────────────────────────────────────────────
const total = checks.length;
const passed = total - failed;
console.log('Phase G1.7 SMER ↔ CRM Bridge Union (yes-equal-weight) healthcheck');
console.log('===================================================================');
checks.forEach((c, i) => {
  const idx = String(i + 1).padStart(2);
  const mark = c.ok ? '✓' : '✗';
  const detail = c.detail ? ` — ${c.detail}` : '';
  console.log(`${idx}. ${mark}  ${c.label}${detail}`);
});
console.log('-------------------------------------------------------------------');
console.log(`${passed} / ${total} checks passed`);
if (failed) {
  console.log(`\n${failed} check(s) failed — wiring is incomplete.`);
  process.exit(1);
}
process.exit(0);
