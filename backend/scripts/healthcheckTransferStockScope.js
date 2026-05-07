#!/usr/bin/env node
/**
 * Phase 32R-Transfer-Stock-Scope (May 07 2026) — static contract verifier.
 *
 * Closes the bug where the IST / ICT product dropdown rendered empty even
 * after picking a Source Custodian + Source Warehouse. Two coupled changes:
 *   (a) fifoEngine.buildStockMatch was XOR (warehouse_id wins, bdm_id ignored)
 *       and is now AND (both filters intersect when both provided). Required
 *       so shared warehouses don't cross-leak BDMs into each other's stock.
 *   (b) TransferOrders.jsx now passes entity_id + source_warehouse_id to
 *       getMyStock / getBatches and re-fetches on warehouse change. Product
 *       picker is disabled until both source BDM and source warehouse are set.
 *   (c) WorkflowGuide 'transfers' banner explains the gate.
 *
 * Run: `node backend/scripts/healthcheckTransferStockScope.js`
 * Exit 0 = clean. Exit 1 = at least one assertion failed.
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
  if (condition) { pass += 1; console.log(`  ✓ ${label}`); }
  else { fail += 1; console.log(`  ✗ ${label}`); }
}

function section(title) { console.log(`\n── ${title}`); }

console.log('Phase 32R-Transfer-Stock-Scope — IST/ICT Product Dropdown Contract');
console.log('═'.repeat(70));

// ── 1. fifoEngine.buildStockMatch: XOR → AND ─────────────────────────────
section('1. fifoEngine.buildStockMatch — AND mode when both filters present');
{
  const f = readFile('backend/erp/services/fifoEngine.js');
  check('fifoEngine.js readable', !!f);
  if (f) {
    // Locate the buildStockMatch body.
    const bodyMatch = f.match(/const buildStockMatch[\s\S]*?\n\};/);
    check('buildStockMatch declaration found', !!bodyMatch);
    if (bodyMatch) {
      const body = bodyMatch[0];
      // Old XOR shape was `if (opts?.warehouseId) {...} else if (bdmId) {...}`.
      // New AND shape is two independent ifs (no `else if`).
      check('no `else if (bdmId)` branch (XOR removed)', !/else if\s*\(\s*bdmId\s*\)/.test(body));
      check('no `else if (opts?.warehouseId)` branch (XOR removed)', !/else if\s*\(\s*opts\?\.warehouseId\s*\)/.test(body));
      check('top-level `if (bdmId)` sets bdm_id', /if\s*\(\s*bdmId\s*\)\s*\{[\s\S]*?match\.bdm_id\s*=/.test(body));
      check('top-level `if (opts?.warehouseId)` sets warehouse_id', /if\s*\(\s*opts\?\.warehouseId\s*\)\s*\{[\s\S]*?match\.warehouse_id\s*=/.test(body));
      check('entity_id always set', /match\s*=\s*\{\s*entity_id/.test(body));
    }
    check('Phase 32R rationale comment present', /Phase 32R-Transfer-Stock-Scope/.test(f));
  }
}

// ── 2. inventoryController endpoints accept warehouse_id ────────────────
section('2. inventoryController.getMyStock + getBatches accept warehouse_id');
{
  const f = readFile('backend/erp/controllers/inventoryController.js');
  check('inventoryController.js readable', !!f);
  if (f) {
    check('getMyStock reads req.query.warehouse_id', /getMyStock[\s\S]{0,1500}req\.query\.warehouse_id/.test(f));
    check('getBatches reads req.query.warehouse_id', /getBatches[\s\S]{0,1500}req\.query\.warehouse_id/.test(f));
    check('getMyStock honors privileged ?bdm_id=', /widenScope\s*\?\s*\(req\.query\.bdm_id\s*\|\|\s*null\)\s*:\s*req\.bdmId/.test(f));
    check('getMyStock honors privileged ?entity_id= cross-entity', /privileged\s*&&\s*req\.query\.entity_id/.test(f));
  }
}

// ── 3. Frontend hook forwards entity_id + warehouse_id ───────────────────
section('3. useInventory hook forwards entity_id + warehouse_id');
{
  const f = readFile('frontend/src/erp/hooks/useInventory.js');
  check('useInventory.js readable', !!f);
  if (f) {
    check('getMyStock signature: (bdmId, entityId, warehouseId)', /const\s+getMyStock\s*=\s*\(bdmId,\s*entityId,\s*warehouseId\)/.test(f));
    check('getBatches signature: (productId, bdmId, entityId, warehouseId)', /const\s+getBatches\s*=\s*\(productId,\s*bdmId,\s*entityId,\s*warehouseId\)/.test(f));
    check('getMyStock forwards warehouse_id param', /getMyStock[\s\S]{0,300}warehouse_id:\s*warehouseId/.test(f));
    check('getBatches forwards warehouse_id param', /getBatches[\s\S]{0,300}warehouse_id:\s*warehouseId/.test(f));
  }
}

// ── 4. TransferOrders.jsx — IC modal contract ────────────────────────────
section('4. TransferOrders.jsx — IC modal forwards warehouse_id + gates picker');
{
  const f = readFile('frontend/src/erp/pages/TransferOrders.jsx');
  check('TransferOrders.jsx readable', !!f);
  if (f) {
    check('icSourceReady gate present', /icSourceReady\s*=\s*!!\(form\.source_bdm_id\s*&&\s*form\.source_warehouse_id\)/.test(f));
    check('IC useEffect refetches stock on (bdm, warehouse, entity) change', /useEffect\([\s\S]{0,1000}getMyStock\(\s*form\.source_bdm_id,\s*form\.source_entity_id,\s*form\.source_warehouse_id\s*\)/.test(f));
    check('IC useEffect resets sourceStock + batchCache when not ready', /if\s*\(!ready\)\s*\{\s*setSourceStock\(\[\]\);\s*setBatchCache\(\{\}\)/.test(f));
    check('IC getBatches forwards warehouse_id', /getBatches\(val,\s*form\.source_bdm_id,\s*form\.source_entity_id,\s*form\.source_warehouse_id\)/.test(f));
    check('IC Product SelectField has disabled={!icSourceReady}', /SelectField[\s\S]{0,400}value=\{li\.product_id\}[\s\S]{0,200}disabled=\{!icSourceReady\}/.test(f));
    check('IC banner copy: "Pick Source Entity, Source Custodian and Source Warehouse first"', /Pick Source Entity, Source Custodian and Source Warehouse first/.test(f));
  }
}

// ── 5. TransferOrders.jsx — Internal modal contract ──────────────────────
section('5. TransferOrders.jsx — Internal modal forwards warehouse_id + gates picker');
{
  const f = readFile('frontend/src/erp/pages/TransferOrders.jsx');
  if (f) {
    check('internalSourceReady gate present', /internalSourceReady\s*=\s*!!\(reassignForm\.source_bdm_id\s*&&\s*reassignForm\.source_warehouse_id\)/.test(f));
    check('Internal useEffect refetches stock on (bdm, warehouse, entity) change', /useEffect\([\s\S]{0,1000}getMyStock\(\s*reassignForm\.source_bdm_id,\s*user\?\.entity_id,\s*reassignForm\.source_warehouse_id\s*\)/.test(f));
    check('Internal useEffect resets reassignStock + reassignBatchCache when not ready', /if\s*\(!ready\)\s*\{\s*setReassignStock\(\[\]\);\s*setReassignBatchCache\(\{\}\)/.test(f));
    check('Internal getBatches forwards entity_id + warehouse_id', /getBatches\(val,\s*reassignForm\.source_bdm_id,\s*user\?\.entity_id,\s*reassignForm\.source_warehouse_id\)/.test(f));
    check('Internal cacheKey includes warehouse_id', /r_\$\{val\}_\$\{reassignForm\.source_bdm_id\}_\$\{reassignForm\.source_warehouse_id\s*\|\|\s*'nowh'\}/.test(f));
    check('Internal Product SelectField has disabled={!internalSourceReady}', /SelectField[\s\S]{0,400}value=\{li\.product_id\}[\s\S]{0,200}disabled=\{!internalSourceReady\}/.test(f));
    check('Internal banner copy: "Pick Source Custodian and Source Warehouse first"', /Pick Source Custodian and Source Warehouse first/.test(f));
  }
}

// ── 6. WorkflowGuide banner ──────────────────────────────────────────────
section('6. WorkflowGuide \'transfers\' banner mentions Phase 32R + warehouse gate');
{
  const f = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
  check('WorkflowGuide.jsx readable', !!f);
  if (f) {
    check('banner mentions Phase 32R-Transfer-Stock-Scope', /Phase 32R-Transfer-Stock-Scope/.test(f));
    check('banner mentions warehouse-scoped product picker', /scoped to the Source Custodian.{0,2}s stock at the Source Warehouse/.test(f));
    check('banner explains BDM ∩ warehouse intersection', /BDM ∩ warehouse/.test(f));
  }
}

// ── 7. No regression on consume-side callers ────────────────────────────
section('7. Consume-side callers still pass (bdmId, opts) — AND mode is a strict-superset safety improvement');
{
  const sales = readFile('backend/erp/controllers/salesController.js');
  const cons = readFile('backend/erp/controllers/consignmentController.js');
  const ic = readFile('backend/erp/controllers/interCompanyController.js');
  check('salesController consumeFIFO still passes (entity, bdm, ..., opts)', /consumeFIFO\(\s*[a-zA-Z_.]+,\s*[a-zA-Z_.]+,/.test(sales || ''));
  check('salesController consumeSpecificBatch still passes (entity, bdm, ..., opts)', /consumeSpecificBatch\(\s*[a-zA-Z_.]+,\s*[a-zA-Z_.]+,/.test(sales || ''));
  check('consignmentController still passes (entity, bdm, ..., opts)', /consume(?:FIFO|SpecificBatch)\(req\.entityId,\s*req\.bdmId,/.test(cons || ''));
  check('interCompanyController still passes (entity, bdm, ..., opts)', /consumeSpecificBatch\(/.test(ic || ''));
}

console.log('\n' + '═'.repeat(70));
console.log(`Result: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
