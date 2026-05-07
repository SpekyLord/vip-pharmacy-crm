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
  'getDailyMdCounts merges per-day buckets across all streams (allDayKeys union: VIP + EXTRA + CommLog)',
  /allDayKeys\s*=\s*new\s+Set\([\s\S]*?vipResults\.map[\s\S]*?extraResults\.map[\s\S]*?commLogResults\.map/.test(bridge)
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

// ── 11. Phase G1.7.1 — date-column lockstep + Pull-from-CRM defense ──────────
// Without these, a user who changes period/cycle AFTER opening the form sees
// the row dates stay on the original period. Pull-from-CRM then matches by
// entry_date, finds no overlap, and silently leaves md_count at 0. Codifying
// the fix wiring so a future refactor can't silently un-wire it.
const smerPage = read('frontend/src/erp/pages/Smer.jsx');
check(
  'Smer.jsx auto-regenerates dailyEntries when period/cycle change while creating new (G1.7.1)',
  /useEffect\(\s*\(\)\s*=>\s*\{\s*if\s*\(\s*!showForm\s*\|\|\s*editingSmer\s*\)\s*return;\s*setDailyEntries\(\s*generateDays\(\)\s*\);[\s\S]{0,400}\}\s*,\s*\[\s*period\s*,\s*cycle\s*\]\s*\)/.test(smerPage)
);
check(
  'Smer.jsx handlePullFromCrm has the no-overlap fallback that rebuilds rows from backend (G1.7.1 defense in depth)',
  /const\s+prevKeys\s*=\s*new\s+Set\(\s*prev\.map\(/.test(smerPage)
  && /const\s+overlap\s*=\s*crmEntries\.filter\(/.test(smerPage)
  && /prevKeys\.has\(\s*e\.entry_date\s*\)/.test(smerPage)
  && /if\s*\(\s*overlap\s*===\s*0\s*&&\s*prev\.length\s*>\s*0\s*\)/.test(smerPage)
);
check(
  'Smer.jsx fallback returns rows carrying md_count + perdiem_tier + perdiem_amount + locations from the CRM response',
  /md_count:\s*crm\.md_count[\s\S]{0,400}perdiem_tier:\s*crm\.perdiem_tier[\s\S]{0,400}perdiem_amount:\s*crm\.perdiem_amount[\s\S]{0,400}notes:\s*crm\.locations/.test(smerPage)
);
check(
  'WorkflowGuide SMER tip mentions Phase G1.7.1 date-column lockstep (Rule #1 banner)',
  /G1\.7\.1[\s\S]{0,200}date-column lockstep/i.test(wf)
);

// ── 12. Phase SMER-CL — CommLog per-diem inclusion contract ─────────────────
// Manual-source CommunicationLog screenshots count toward MD threshold when
// admin enables `include_comm_log` on PERDIEM_RATES.<role>. Trust model:
// admin-in-chat — fraud bounded by Messenger spot-check. One CommLog row =
// one MD credit. Same-day same-MD across Visit + CommLog dedups at merge
// (Set-based). Phase O 14-day photo cutoff inherits (server enforces at the
// bridge). No daily cap by default; lookup-tunable.
check(
  'smerCrmBridge requires CommunicationLog (Phase SMER-CL chat stream)',
  /require\(['"]\.\.\/\.\.\/models\/CommunicationLog['"]\)/.test(bridge)
);
check(
  'aggregateCommLogDaily helper defined with (userObjectId, dateRange, opts) signature',
  /async function aggregateCommLogDaily\(userObjectId,\s*dateRange,\s*opts\s*=\s*\{\}\)/.test(bridge)
);
check(
  'aggregateCommLogDaily groups by contactedAt (NOT visitDate) — CommLog\'s date field',
  /\$dateToString:\s*\{[^}]*date:\s*['"]\$contactedAt['"]/.test(bridge)
);
check(
  'aggregateCommLogDaily filters source by allowedSources whitelist (default [\'manual\'])',
  /source:\s*\{\s*\$in:\s*allowedSources\s*\}/.test(bridge)
);
check(
  'aggregateCommLogDaily inherits Phase O 14-day cutoff via createdAt - photos[0].capturedAt',
  /COMM_LOG_MAX_AGE_MS/.test(bridge) && /\$subtract:\s*\[\s*['"]\$createdAt['"]/.test(bridge)
);
check(
  'getDailyMdCounts batches CommLog aggregation in the same Promise.all (when includeCommLog=true)',
  /includeCommLog\s*\?\s*aggregateCommLogDaily\(/.test(bridge)
);
check(
  'getDailyMdCounts merge uses Set<string> for cross-stream dedup (Phase SMER-CL)',
  /const\s+setAll\s*=\s*new\s+Set\(\s*\)/.test(bridge) && /setAll\.add\(\s*id\.toString\(\s*\)\s*\)/.test(bridge)
);
check(
  'getDailyMdCounts per-day output carries comm_log_count (chat-only post-dedup contribution)',
  /comm_log_count:\s*chatOnlySet\.size/.test(bridge)
);
check(
  'smerCrmBridge exports aggregateCommLogDaily',
  /module\.exports\s*=\s*\{[\s\S]*?aggregateCommLogDaily/.test(bridge)
);

check(
  'perdiemCalc.resolvePerdiemConfig returns include_comm_log (default false unless explicitly enabled)',
  /include_comm_log:\s*m\.include_comm_log\s*===\s*true/.test(perdiem)
);
check(
  'perdiemCalc.resolvePerdiemConfig returns comm_log_daily_cap (null = no cap)',
  /comm_log_daily_cap:\s*\(m\.comm_log_daily_cap\s*!=\s*null\)/.test(perdiem)
);
check(
  'perdiemCalc.resolvePerdiemConfig returns comm_log_allowed_sources (default [\'manual\'])',
  /comm_log_allowed_sources:[\s\S]{0,160}\['manual'\]/.test(perdiem)
);

check(
  'PERDIEM_RATES.BDM seed includes include_comm_log: true (VIP entity default ON)',
  /code:\s*['"]BDM['"][\s\S]{0,800}?include_comm_log:\s*true/.test(lookups)
);
check(
  'PERDIEM_RATES.ECOMMERCE_BDM seed includes include_comm_log: true',
  /code:\s*['"]ECOMMERCE_BDM['"][\s\S]{0,800}?include_comm_log:\s*true/.test(lookups)
);
check(
  'PERDIEM_RATES.DELIVERY_DRIVER seed has include_comm_log: false (SaaS-template OFF)',
  /code:\s*['"]DELIVERY_DRIVER['"][\s\S]{0,800}?include_comm_log:\s*false/.test(lookups)
);

check(
  'expenseController.getSmerCrmMdCounts forwards includeCommLog to getDailyMdCounts',
  /getDailyMdCounts\([\s\S]{0,800}?includeCommLog:\s*perdiemConfig\.include_comm_log/.test(expCtrl)
);
check(
  'expenseController response surfaces include_comm_log + comm_log_count per entry',
  /include_comm_log:\s*!!perdiemConfig\.include_comm_log/.test(expCtrl)
  && /comm_log_count:\s*crmData\.comm_log_count/.test(expCtrl)
);

check(
  'WorkflowGuide SMER tip mentions Phase SMER-CL + include_comm_log toggle',
  /Phase SMER-CL/.test(wf) && /include_comm_log/.test(wf)
);

const pageGuide = read('frontend/src/components/common/PageGuide.jsx');
check(
  'PageGuide \'communication-log\' tip mentions Phase SMER-CL per-diem inclusion',
  /Phase SMER-CL/.test(pageGuide) && /include_comm_log/.test(pageGuide)
);

// ── Report ────────────────────────────────────────────────────────────────────
const total = checks.length;
const passed = total - failed;
console.log('Phase G1.7 + SMER-CL — SMER ↔ CRM Bridge Union (yes-equal-weight + chat-screenshot inclusion + date lockstep) healthcheck');
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
