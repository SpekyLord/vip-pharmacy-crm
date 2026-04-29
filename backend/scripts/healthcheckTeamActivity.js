/**
 * Healthcheck: Team Activity Cockpit wiring (Apr 2026)
 *
 * Statically verifies the end-to-end contract for the Statistics → Team
 * Activity tab + the per-BDM bar-chart drill-down in the Overview tab.
 * Catches the wiring drift class that bit us on Apr 26 (silent severance
 * between backend route and frontend service).
 *
 * Usage:
 *   node backend/scripts/healthcheckTeamActivity.js
 *
 * Exit code 0 = green. Exit code 1 = at least one check failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const checks = [];

function check(label, condition, hint = '') {
  checks.push({ label, ok: !!condition, hint });
}

function readFile(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch (e) {
    return null;
  }
}

// ── Backend wiring ──
const controller = readFile('backend/controllers/scheduleController.js');
check(
  'scheduleController.js imports teamActivityThresholds helper',
  controller && controller.includes("require('../utils/teamActivityThresholds')"),
  "Add: const { getThresholds } = require('../utils/teamActivityThresholds');"
);
check(
  'scheduleController.js exports getTeamActivity',
  controller && /module\.exports\s*=\s*\{[\s\S]*getTeamActivity[\s\S]*\}/.test(controller),
  'Add getTeamActivity to module.exports.'
);
check(
  'scheduleController.js defines getTeamActivity controller',
  controller && /const getTeamActivity\s*=\s*catchAsync/.test(controller),
  'Define getTeamActivity = catchAsync(async (req, res) => { ... }).'
);

const routes = readFile('backend/routes/scheduleRoutes.js');
check(
  'scheduleRoutes.js destructures getTeamActivity',
  routes && /getTeamActivity\b/.test(routes),
  'Add getTeamActivity to the require destructure.'
);
check(
  'scheduleRoutes.js mounts /team-activity with adminOnly',
  routes && /router\.get\(['"]\/team-activity['"]\s*,\s*adminOnly\s*,\s*getTeamActivity/.test(routes),
  "router.get('/team-activity', adminOnly, getTeamActivity)"
);

const helper = readFile('backend/utils/teamActivityThresholds.js');
check(
  'teamActivityThresholds.js helper exists',
  helper && helper.length > 0,
  'Create backend/utils/teamActivityThresholds.js.'
);
check(
  'teamActivityThresholds.js exports getThresholds',
  helper && /module\.exports\s*=\s*\{[\s\S]*getThresholds[\s\S]*\}/.test(helper),
  'Export getThresholds and DEFAULTS.'
);
check(
  'teamActivityThresholds.js declares all 3 default keys',
  helper && /red_flag_consecutive_workdays/.test(helper)
         && /gap_warning_workdays/.test(helper)
         && /target_call_rate/.test(helper),
  'DEFAULTS must include red_flag_consecutive_workdays, gap_warning_workdays, target_call_rate.'
);

// ── Lookup seed ──
const lookupCtrl = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'TEAM_ACTIVITY_THRESHOLDS lookup category seeded in SEED_DEFAULTS',
  lookupCtrl && /TEAM_ACTIVITY_THRESHOLDS\s*:\s*\[/.test(lookupCtrl),
  "Add TEAM_ACTIVITY_THRESHOLDS: [ { code: 'DEFAULT', ... } ] to SEED_DEFAULTS."
);
check(
  'TEAM_ACTIVITY_THRESHOLDS seed is insert_only_metadata (admin tweaks survive re-seed)',
  (() => {
    if (!lookupCtrl) return false;
    const idx = lookupCtrl.indexOf('TEAM_ACTIVITY_THRESHOLDS:');
    if (idx < 0) return false;
    // Look at the next ~600 chars (the row definition) for insert_only_metadata: true
    const slice = lookupCtrl.slice(idx, idx + 600);
    return /insert_only_metadata:\s*true/.test(slice);
  })(),
  'Per Rule #3 / Rule #19 — admin overrides must survive seedAll re-runs.'
);

// ── Frontend service ──
const svc = readFile('frontend/src/services/scheduleService.js');
check(
  'scheduleService.getTeamActivity defined',
  svc && /getTeamActivity\s*:\s*async/.test(svc),
  'Add getTeamActivity: async () => api.get(\'/schedules/team-activity\') in scheduleService.'
);
check(
  'scheduleService hits /schedules/team-activity',
  svc && /\/schedules\/team-activity/.test(svc),
  'URL must match the route mounted in scheduleRoutes.js.'
);

// ── Frontend tab + drill-down wiring ──
const stats = readFile('frontend/src/pages/admin/StatisticsPage.jsx');
check(
  'StatisticsPage.jsx imports the Team Activity fetcher state',
  stats && /teamActivity[,\s]/.test(stats) && /setTeamActivity/.test(stats),
  'Declare teamActivity + setTeamActivity state in StatisticsPage.'
);
check(
  'StatisticsPage.jsx renders TeamActivityTab',
  stats && /<TeamActivityTab\b/.test(stats),
  'Add the TeamActivityTab JSX in the activeTab switch.'
);
check(
  'StatisticsPage.jsx defines TeamActivityTab component',
  stats && /const TeamActivityTab\s*=\s*\(/.test(stats),
  'Define const TeamActivityTab = ({ data, loading, onBdmDrillDown }) => { ... }.'
);
check(
  'StatisticsPage.jsx wires team-activity into lazy-load + refresh',
  stats && /activeTab\s*===\s*['"]team-activity['"]/.test(stats),
  "Lazy-load and refresh handlers must branch on activeTab === 'team-activity'.'"
);
check(
  'StatisticsPage.jsx Overview bar-chart drill-down handler defined',
  stats && /handleBdmDrillDown/.test(stats),
  'Add handleBdmDrillDown that sets selectedBdmId + activeTab=bdm-performance.'
);
check(
  'StatisticsPage.jsx forwards onBdmDrillDown into OverviewTab',
  stats && /<OverviewTab\b[\s\S]{0,200}onBdmDrillDown=/.test(stats),
  '<OverviewTab stats={...} onBdmDrillDown={handleBdmDrillDown} />'
);
check(
  'StatisticsPage.jsx forwards userId to bar chart payload',
  stats && /perBdmCallRates\.push\(\{[\s\S]{0,200}userId:/.test(stats),
  'fetchOverviewData must include userId on each perBdmCallRates entry so onClick has it.'
);

// ── Banner ──
const guide = readFile('frontend/src/components/common/PageGuide.jsx');
check(
  'PageGuide statistics-page banner mentions Team Activity',
  guide && /'statistics-page'[\s\S]*Team Activity/.test(guide),
  'Update PAGE_GUIDES[\'statistics-page\'].steps to include the Team Activity tab.'
);
check(
  'PageGuide tip references TEAM_ACTIVITY_THRESHOLDS',
  guide && /TEAM_ACTIVITY_THRESHOLDS/.test(guide),
  'Tip should reference the lookup category for subscription-readiness signaling.'
);

// ── Route guard parity ──
const app = readFile('frontend/src/App.jsx');
check(
  '/admin/statistics route guard is ADMIN_ONLY',
  app && /\/admin\/statistics[\s\S]{0,200}ROLE_SETS\.ADMIN_ONLY/.test(app),
  'Route gate and backend adminOnly middleware must both be admin-only — they currently ARE.'
);

// ── Output ──
let failed = 0;
console.log('\nTeam Activity Cockpit wiring healthcheck');
console.log('=========================================');
checks.forEach((c, i) => {
  const status = c.ok ? '✓' : '✗';
  const line = `${String(i + 1).padStart(2, ' ')}. ${status}  ${c.label}`;
  console.log(line);
  if (!c.ok) {
    failed += 1;
    if (c.hint) console.log(`     hint: ${c.hint}`);
  }
});
console.log('-----------------------------------------');
console.log(`${checks.length - failed} / ${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
