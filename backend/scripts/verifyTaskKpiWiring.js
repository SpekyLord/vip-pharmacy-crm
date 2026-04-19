/**
 * verifyTaskKpiWiring — Phase G10 integrity check.
 *
 * Mirrors verifyInboxWiring (G9.R8). Runs 8 structural assertions on
 * G10 artifacts without touching Mongo:
 *
 *   1. GROWTH_DRIVER defaults contain all 5 POA driver codes
 *   2. KPI_CODE defaults contain all 13 POA KPI codes
 *   3. RESPONSIBILITY_TAG defaults contain 4 POA tags
 *   4. Lazy-seed getters are null-safe (return defaults when entityId is null)
 *   5. taskController exports all G10 handlers (listDrivers, listKpiCodes,
 *      listByDriver, bulkUpdate, bulkDelete)
 *   6. taskRoutes.js mounts all 5 new routes
 *   7. Frontend components exist + TasksPage imports them
 *   8. Bulk-notify rollup + inbox:updated dispatch wiring in place
 *
 * Exit code 0 on pass, 1 on any failure. Run via:
 *   npm --prefix backend run verify:task-kpi-wiring
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FE = path.join(ROOT, '..', 'frontend', 'src');

let failed = 0;
const pass = (msg) => console.log(`PASS: ${msg}`);
const fail = (msg) => { console.error(`FAIL: ${msg}`); failed++; };

// Required POA codes (locked by 2026 Sales GOAL and POA.pdf)
const DRIVERS_EXPECTED = [
  'HOSPITAL_ACCREDITATION', 'PRODUCT_INCLUSION',
  'INVENTORY_OPTIMIZATION', 'DEMAND_PULL', 'PRICE_INCREASE',
];
const KPIS_EXPECTED = [
  'PCT_HOSP_ACCREDITED', 'TIME_TO_ACCREDITATION_DAYS', 'REV_PER_ACCREDITED_HOSP',
  'SKUS_LISTED_PER_HOSP', 'FORMULARY_APPROVAL_RATE', 'MONTHLY_REORDER_FREQ',
  'LOST_SALES_INCIDENTS', 'INVENTORY_TURNOVER', 'EXPIRY_RETURNS',
  'MD_ENGAGEMENT_COVERAGE', 'HOSP_REORDER_CYCLE_TIME',
  'VOLUME_RETENTION_POST_PI', 'GROSS_MARGIN_PER_SKU',
];
const TAGS_EXPECTED = ['BDM', 'PRESIDENT', 'EBDM', 'OM'];

// ── Check 1–3: lookup default presence ────────────────────────────────
let kpiLookups;
try {
  kpiLookups = require('../erp/utils/kpiLookups');
  pass('kpiLookups loads');
} catch (err) {
  fail(`kpiLookups require failed: ${err.message}`);
  process.exit(1);
}

for (const code of DRIVERS_EXPECTED) {
  const row = kpiLookups.GROWTH_DRIVER_DEFAULTS.find(d => d.code === code);
  if (!row) fail(`GROWTH_DRIVER_DEFAULTS missing ${code}`);
  else if (!row.metadata || !Number.isFinite(row.metadata.po_a_order)) fail(`${code} missing metadata.po_a_order`);
  else pass(`GROWTH_DRIVER ${code} (band ${row.metadata.revenue_band_min}-${row.metadata.revenue_band_max}M)`);
}
for (const code of KPIS_EXPECTED) {
  const row = kpiLookups.KPI_CODE_DEFAULTS.find(d => d.code === code);
  if (!row) fail(`KPI_CODE_DEFAULTS missing ${code}`);
  else if (!row.metadata?.driver || !DRIVERS_EXPECTED.includes(row.metadata.driver)) fail(`${code} has invalid metadata.driver`);
  else pass(`KPI_CODE ${code} → ${row.metadata.driver}`);
}
for (const code of TAGS_EXPECTED) {
  const row = kpiLookups.RESPONSIBILITY_TAG_DEFAULTS.find(d => d.code === code);
  if (!row) fail(`RESPONSIBILITY_TAG_DEFAULTS missing ${code}`);
  else pass(`RESPONSIBILITY_TAG ${code}`);
}
if (!kpiLookups.TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS || kpiLookups.TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS.length === 0) {
  fail('TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS is empty');
} else {
  const row = kpiLookups.TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS[0];
  if (!Number.isFinite(Number(row?.metadata?.value))) fail('TASK_BULK_NOTIFY_THRESHOLD.GLOBAL missing numeric metadata.value');
  else pass(`TASK_BULK_NOTIFY_THRESHOLD default=${row.metadata.value}`);
}

// ── Check 4: lazy-seed null safety ────────────────────────────────────
(async () => {
  try {
    const drivers = await kpiLookups.getDriversConfig(null);
    if (!Array.isArray(drivers) || drivers.length !== 5) fail(`getDriversConfig(null) returned ${drivers?.length ?? 'non-array'} rows`);
    else pass('getDriversConfig(null) returns 5 defaults without throw');
  } catch (err) {
    fail(`getDriversConfig(null) threw: ${err.message}`);
  }
  try {
    const kpis = await kpiLookups.getKpiCodesConfig(null);
    if (!Array.isArray(kpis) || kpis.length !== 13) fail(`getKpiCodesConfig(null) returned ${kpis?.length ?? 'non-array'} rows`);
    else pass('getKpiCodesConfig(null) returns 13 defaults without throw');
  } catch (err) {
    fail(`getKpiCodesConfig(null) threw: ${err.message}`);
  }
  try {
    const tags = await kpiLookups.getResponsibilityTagsConfig(null);
    if (!Array.isArray(tags) || tags.length !== 4) fail(`getResponsibilityTagsConfig(null) returned ${tags?.length ?? 'non-array'} rows`);
    else pass('getResponsibilityTagsConfig(null) returns 4 defaults without throw');
  } catch (err) {
    fail(`getResponsibilityTagsConfig(null) threw: ${err.message}`);
  }
  try {
    const t = await kpiLookups.getBulkNotifyThreshold(null);
    if (!Number.isFinite(t) || t <= 0) fail(`getBulkNotifyThreshold(null) returned ${t}`);
    else pass(`getBulkNotifyThreshold(null) = ${t}`);
  } catch (err) {
    fail(`getBulkNotifyThreshold(null) threw: ${err.message}`);
  }

  // ── Check 5: controller exports ─────────────────────────────────────
  let ctl;
  try {
    ctl = require('../erp/controllers/taskController');
    pass('taskController loads');
  } catch (err) {
    fail(`taskController require failed: ${err.message}`);
    return finish();
  }
  for (const fn of ['listTasks', 'listOverdue', 'createTask', 'updateTask', 'deleteTask',
                    'listDrivers', 'listKpiCodes', 'listByDriver', 'bulkUpdate', 'bulkDelete']) {
    if (typeof ctl[fn] !== 'function') fail(`taskController missing export: ${fn}`);
    else pass(`ctl.${fn}`);
  }

  // ── Check 6: route mounts ───────────────────────────────────────────
  const routesPath = path.join(ROOT, 'erp', 'routes', 'taskRoutes.js');
  if (!fs.existsSync(routesPath)) {
    fail('taskRoutes.js missing');
    return finish();
  }
  const routesSrc = fs.readFileSync(routesPath, 'utf8');
  for (const p of ['/drivers', '/kpi-codes', '/by-driver', '/bulk-update', '/bulk-delete']) {
    if (!routesSrc.includes(`'${p}'`)) fail(`taskRoutes.js missing route: ${p}`);
    else pass(`route ${p} mounted`);
  }
  // Route order sanity — bulk-update must appear before PATCH /:id
  const bulkIdx = routesSrc.indexOf("'/bulk-update'");
  const patchIdx = routesSrc.indexOf("'/:id'");
  if (bulkIdx > 0 && patchIdx > 0 && bulkIdx > patchIdx) {
    fail('route order: /bulk-update is registered AFTER /:id — PATCH /:id will shadow it');
  } else {
    pass('route order: static paths registered before /:id');
  }

  // ── Check 7: frontend components + imports ──────────────────────────
  const feFiles = {
    TasksGantt: path.join(FE, 'erp', 'components', 'TasksGantt.jsx'),
    TasksKanban: path.join(FE, 'erp', 'components', 'TasksKanban.jsx'),
    RevenueBridge: path.join(FE, 'erp', 'components', 'RevenueBridge.jsx'),
    TaskMiniEditor: path.join(FE, 'erp', 'components', 'TaskMiniEditor.jsx'),
  };
  for (const [name, p] of Object.entries(feFiles)) {
    if (!fs.existsSync(p)) fail(`${name}.jsx missing at ${p}`);
    else pass(`${name}.jsx exists`);
  }
  const tpPath = path.join(FE, 'erp', 'pages', 'TasksPage.jsx');
  if (!fs.existsSync(tpPath)) {
    fail('TasksPage.jsx missing');
  } else {
    const tp = fs.readFileSync(tpPath, 'utf8');
    for (const comp of ['TasksGantt', 'TasksKanban', 'RevenueBridge']) {
      if (!tp.includes(`import ${comp}`)) fail(`TasksPage does not import ${comp}`);
      else pass(`TasksPage imports ${comp}`);
    }
    // 4-tab view state
    if (!/setView/.test(tp) || !tp.includes("'gantt'") || !tp.includes("'kanban'") || !tp.includes("'bridge'")) {
      fail('TasksPage missing 4-tab view state (gantt/kanban/bridge)');
    } else {
      pass('TasksPage 4-tab view state present');
    }
  }

  // ── Check 8: rollup + inbox:updated dispatch wiring ─────────────────
  const ctlSrc = fs.readFileSync(path.join(ROOT, 'erp', 'controllers', 'taskController.js'), 'utf8');
  if (!ctlSrc.includes('getBulkNotifyThreshold')) fail('taskController missing bulk-notify rollup wiring (getBulkNotifyThreshold not referenced)');
  else pass('bulk-notify rollup wiring present');
  if (!ctlSrc.includes('dispatchMultiChannel')) fail('taskController missing dispatchMultiChannel (rollup cannot fan out)');
  else pass('dispatchMultiChannel imported in controller');

  const ganttSrc = fs.readFileSync(feFiles.TasksGantt, 'utf8');
  const kanbanSrc = fs.readFileSync(feFiles.TasksKanban, 'utf8');
  const tpSrc = fs.readFileSync(tpPath, 'utf8');
  if (!ganttSrc.includes('inbox:updated')) fail('TasksGantt.jsx does not dispatch inbox:updated');
  else pass('TasksGantt dispatches inbox:updated');
  if (!kanbanSrc.includes('inbox:updated')) fail('TasksKanban.jsx does not dispatch inbox:updated');
  else pass('TasksKanban dispatches inbox:updated');
  if (!tpSrc.includes('inbox:updated')) fail('TasksPage.jsx does not dispatch inbox:updated on bulk');
  else pass('TasksPage dispatches inbox:updated on bulk');

  return finish();
})();

function finish() {
  const total = failed === 0;
  console.log('\n' + (total ? '==== verify:task-kpi-wiring PASS ====' : `==== verify:task-kpi-wiring FAIL (${failed} error${failed === 1 ? '' : 's'}) ====`));
  process.exit(total ? 0 : 1);
}
