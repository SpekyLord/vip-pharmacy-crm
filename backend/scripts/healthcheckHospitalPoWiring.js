#!/usr/bin/env node
/**
 * Healthcheck — Phase CSI-X1 Hospital PO + Hospital Contract Price wiring
 *
 * Static end-to-end verification: models load, controllers export every
 * documented function, routes mount, frontend services + pages exist,
 * sidebar entries present, WORKFLOW_GUIDES seeded, lookup categories
 * registered. Exit code 1 on any miss.
 *
 * Run: node backend/scripts/healthcheckHospitalPoWiring.js
 */
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const issues = [];
function fail(msg) { issues.push(msg); console.error('✗', msg); }
function pass(msg) { console.log('✓', msg); }

// ─── Backend: models ───────────────────────────────────────────────────────
try {
  const HCP = require(path.join(ROOT, 'backend/erp/models/HospitalContractPrice'));
  if (!HCP || !HCP.modelName) fail('HospitalContractPrice model did not load');
  else pass(`HospitalContractPrice model loaded (${HCP.modelName})`);
} catch (e) {
  fail(`HospitalContractPrice model crashed: ${e.message}`);
}

try {
  const { HospitalPO, HospitalPOLine } = require(path.join(ROOT, 'backend/erp/models/HospitalPO'));
  if (!HospitalPO || !HospitalPO.modelName) fail('HospitalPO model did not load');
  else pass(`HospitalPO model loaded (${HospitalPO.modelName})`);
  if (!HospitalPOLine || !HospitalPOLine.modelName) fail('HospitalPOLine model did not load');
  else pass(`HospitalPOLine model loaded (${HospitalPOLine.modelName})`);
  if (typeof HospitalPO.recomputeFromLines !== 'function') fail('HospitalPO.recomputeFromLines static missing');
  else pass('HospitalPO.recomputeFromLines static present');
  if (typeof HospitalPO.cleanPoNumber !== 'function') fail('HospitalPO.cleanPoNumber static missing');
  else pass('HospitalPO.cleanPoNumber static present');
} catch (e) {
  fail(`HospitalPO models crashed: ${e.message}`);
}

// ─── Backend: SalesLine extension ──────────────────────────────────────────
try {
  const SalesLine = require(path.join(ROOT, 'backend/erp/models/SalesLine'));
  const paths = SalesLine.schema.paths;
  if (!paths.po_id) fail('SalesLine.po_id missing');
  else pass('SalesLine.po_id present');
  const lineSchema = paths.line_items?.schema?.paths || {};
  if (!lineSchema.po_line_id) fail('SalesLine.line_items.po_line_id missing');
  else pass('SalesLine.line_items.po_line_id present');
} catch (e) {
  fail(`SalesLine extension check crashed: ${e.message}`);
}

// ─── Backend: priceResolver service ────────────────────────────────────────
try {
  const pr = require(path.join(ROOT, 'backend/erp/services/priceResolver'));
  for (const fn of ['resolveContractPrice', 'resolveContractPricesBulk', 'invalidatePriceCache', 'getResolutionRule']) {
    if (typeof pr[fn] !== 'function') fail(`priceResolver.${fn} missing`);
    else pass(`priceResolver.${fn} exported`);
  }
} catch (e) {
  fail(`priceResolver crashed: ${e.message}`);
}

// ─── Backend: controllers ──────────────────────────────────────────────────
try {
  const c = require(path.join(ROOT, 'backend/erp/controllers/hospitalContractPriceController'));
  for (const fn of ['listContractPrices', 'getContractPriceById', 'createContractPrice', 'updateContractPrice', 'cancelContractPrice', 'resolvePrice', 'resolvePricesBulk']) {
    if (typeof c[fn] !== 'function') fail(`hospitalContractPriceController.${fn} missing`);
    else pass(`hospitalContractPriceController.${fn} exported`);
  }
} catch (e) {
  fail(`hospitalContractPriceController crashed: ${e.message}`);
}

try {
  const c = require(path.join(ROOT, 'backend/erp/controllers/hospitalPoController'));
  for (const fn of ['listHospitalPos', 'getHospitalPoById', 'createHospitalPo', 'cancelHospitalPo', 'cancelHospitalPoLine', 'getBacklogSummary', 'expireStalePos']) {
    if (typeof c[fn] !== 'function') fail(`hospitalPoController.${fn} missing`);
    else pass(`hospitalPoController.${fn} exported`);
  }
} catch (e) {
  fail(`hospitalPoController crashed: ${e.message}`);
}

// ─── Backend: route mounts ─────────────────────────────────────────────────
const indexJs = fs.readFileSync(path.join(ROOT, 'backend/erp/routes/index.js'), 'utf8');
if (!/hospital-contract-prices/.test(indexJs)) fail('routes/index.js missing /hospital-contract-prices mount');
else pass('routes/index.js mounts /hospital-contract-prices');
if (!/hospital-pos/.test(indexJs)) fail('routes/index.js missing /hospital-pos mount');
else pass('routes/index.js mounts /hospital-pos');

const hcpRoutes = fs.readFileSync(path.join(ROOT, 'backend/erp/routes/hospitalContractPriceRoutes.js'), 'utf8');
for (const re of [/router\.get\(['"]\/['"]/, /router\.get\(['"]\/resolve['"]/, /router\.post\(['"]\/['"]/]) {
  if (!re.test(hcpRoutes)) fail(`hospitalContractPriceRoutes missing route matching ${re}`);
}
pass('hospitalContractPriceRoutes routes scaffolded');

const poRoutes = fs.readFileSync(path.join(ROOT, 'backend/erp/routes/hospitalPoRoutes.js'), 'utf8');
for (const re of [/summary\/backlog/, /maintenance\/expire-stale/, /lines\/:lineId\/cancel/]) {
  if (!re.test(poRoutes)) fail(`hospitalPoRoutes missing route matching ${re}`);
}
pass('hospitalPoRoutes routes scaffolded');

// ─── Backend: salesController hook for HPO decrement ───────────────────────
const salesCtrl = fs.readFileSync(path.join(ROOT, 'backend/erp/controllers/salesController.js'), 'utf8');
if (!/HospitalPOLine/.test(salesCtrl)) fail('salesController.js missing HospitalPOLine require — HPO decrement not wired');
else pass('salesController.js wires HospitalPOLine');
if (!/recomputeFromLines/.test(salesCtrl)) fail('salesController.js missing recomputeFromLines call');
else pass('salesController.js calls HospitalPO.recomputeFromLines');
// post path
if (!/Phase CSI-X1 — Hospital PO line decrement/.test(salesCtrl)) fail('salesController.js postSaleRow missing CSI-X1 decrement block');
else pass('salesController.js postSaleRow has CSI-X1 decrement block');
// reopen path
if (!/Phase CSI-X1 — Hospital PO line giveback on reopen/.test(salesCtrl)) fail('salesController.js reopenSales missing CSI-X1 giveback block');
else pass('salesController.js reopenSales has CSI-X1 giveback block');
// approveDeletion path
if (!/Phase CSI-X1 — Hospital PO line giveback on deletion-approve/.test(salesCtrl)) fail('salesController.js approveDeletion missing CSI-X1 giveback block');
else pass('salesController.js approveDeletion has CSI-X1 giveback block');

// ─── Backend: lookup seeds ─────────────────────────────────────────────────
const lookups = fs.readFileSync(path.join(ROOT, 'backend/erp/controllers/lookupGenericController.js'), 'utf8');
const requiredCategories = [
  'PRICE_RESOLUTION_RULES',
  'PO_EXPIRY_DAYS',
  'HOSPITAL_PO_STATUS',
  'HOSPITAL_PO_SOURCE_KIND',
];
for (const cat of requiredCategories) {
  if (!new RegExp(`\\b${cat}:`).test(lookups)) fail(`lookupGenericController.js missing SEED_DEFAULTS.${cat}`);
  else pass(`lookupGenericController.js seeds ${cat}`);
}
if (!/PRICE_LIST/.test(lookups)) fail('MODULE_DEFAULT_ROLES.PRICE_LIST missing');
else pass('MODULE_DEFAULT_ROLES.PRICE_LIST seeded');
if (!/code: 'HOSPITAL_PO'/.test(lookups)) fail('PROXY_ENTRY_ROLES.HOSPITAL_PO + VALID_OWNER_ROLES.HOSPITAL_PO missing');
else pass('PROXY_ENTRY_ROLES.HOSPITAL_PO + VALID_OWNER_ROLES.HOSPITAL_PO seeded');
if (!/PRICE_RESOLVER_CATEGORIES/.test(lookups)) fail('PRICE_RESOLVER_CATEGORIES cache invalidation set missing');
else pass('PRICE_RESOLVER_CATEGORIES cache invalidation set wired');

// ─── Frontend: services ────────────────────────────────────────────────────
for (const f of [
  'frontend/src/erp/services/hospitalContractPriceService.js',
  'frontend/src/erp/services/hospitalPoService.js'
]) {
  if (!fs.existsSync(path.join(ROOT, f))) fail(`Missing ${f}`);
  else pass(`Frontend service present: ${f}`);
}

// ─── Frontend: pages ───────────────────────────────────────────────────────
for (const f of [
  'frontend/src/erp/pages/HospitalContractPrices.jsx',
  'frontend/src/erp/pages/HospitalPoBacklog.jsx',
  'frontend/src/erp/pages/HospitalPoEntry.jsx',
  'frontend/src/erp/pages/HospitalPoDetail.jsx'
]) {
  if (!fs.existsSync(path.join(ROOT, f))) fail(`Missing ${f}`);
  else pass(`Frontend page present: ${f}`);
}

// ─── Frontend: App.jsx routes ──────────────────────────────────────────────
const appJsx = fs.readFileSync(path.join(ROOT, 'frontend/src/App.jsx'), 'utf8');
for (const route of [
  '/erp/hospital-contract-prices',
  '/erp/hospital-pos/backlog',
  '/erp/hospital-pos/entry',
  '/erp/hospital-pos/:id'
]) {
  if (!appJsx.includes(route)) fail(`App.jsx missing route ${route}`);
  else pass(`App.jsx mounts ${route}`);
}
for (const lazy of ['HospitalContractPrices', 'HospitalPoBacklog', 'HospitalPoEntry', 'HospitalPoDetail']) {
  if (!new RegExp(`const ${lazy}\\s*=`).test(appJsx)) fail(`App.jsx missing lazy import for ${lazy}`);
  else pass(`App.jsx lazy-imports ${lazy}`);
}

// ─── Frontend: Sidebar entries ─────────────────────────────────────────────
const sidebar = fs.readFileSync(path.join(ROOT, 'frontend/src/components/common/Sidebar.jsx'), 'utf8');
for (const path_ of ['/erp/hospital-pos/backlog', '/erp/hospital-pos/entry', '/erp/hospital-contract-prices']) {
  if (!sidebar.includes(path_)) fail(`Sidebar.jsx missing entry for ${path_}`);
  else pass(`Sidebar.jsx links ${path_}`);
}

// ─── Frontend: WORKFLOW_GUIDES banners ─────────────────────────────────────
const wfg = fs.readFileSync(path.join(ROOT, 'frontend/src/erp/components/WorkflowGuide.jsx'), 'utf8');
for (const key of ['hospital-po-backlog', 'hospital-po-entry', 'hospital-po-detail', 'hospital-contract-prices']) {
  if (!new RegExp(`'${key}':`).test(wfg)) fail(`WorkflowGuide.jsx missing WORKFLOW_GUIDES['${key}']`);
  else pass(`WorkflowGuide.jsx has banner for ${key}`);
}

// ─── Summary ───────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
if (issues.length === 0) {
  console.log(`✅ Phase CSI-X1 wiring healthcheck PASSED`);
  process.exit(0);
} else {
  console.error(`❌ Phase CSI-X1 wiring healthcheck FAILED — ${issues.length} issue(s):`);
  for (const i of issues) console.error('  ' + i);
  process.exit(1);
}
