#!/usr/bin/env node
/**
 * Phase 32R-Sales-Validate-Proxy-Scope (May 08 2026) — static contract verifier.
 *
 * Closes the regression where clicking Validate on a Proxied sale (or a sale
 * whose row owner differs from the requester's bdm_id) reported
 * "Insufficient stock for product X: available 0, requested N" even when the
 * row owner had the stock at the row's warehouse.
 *
 * Root cause: validateSales built ONE InventoryLedger snapshot keyed off
 * req.bdmId + rows[0].warehouse_id. After Phase 32R-Transfer-Stock-Scope
 * (May 07 2026) flipped fifoEngine.buildStockMatch from XOR to AND, the
 * (req.bdmId ∩ warehouse_id) intersection collapsed to zero rows for proxied
 * entries — req.bdmId is the proxy/data-entry user, NOT the row owner whose
 * stock is debited. The same-day Phase 32R-Validate-Privileged-Snapshot patch
 * dropped bdm_id to null for privileged callers — that fixed president/admin/
 * finance but left the non-privileged proxy case broken AND introduced a
 * validate-pass / submit-fail risk (submit uses row.bdm_id, not null).
 *
 * Fix: per-(effectiveBdmId, warehouseId) snapshots keyed off ROW attributes,
 * mirroring submitSales line ~1146-1147 verbatim:
 *   effectiveBdmId = (privileged && !row.warehouse_id) ? null : row.bdm_id
 *
 * Plus per-group deducted Map so cross-row deduction in a multi-row Validate
 * batch doesn't leak across (bdm, warehouse) pools.
 *
 * Run: `node backend/scripts/healthcheckSalesValidateProxyScope.js`
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

console.log('Phase 32R-Sales-Validate-Proxy-Scope — Per-Row Stock Snapshot Contract');
console.log('═'.repeat(72));

// Extract the validateSales function body once for repeated probes.
const ctrl = readFile('backend/erp/controllers/salesController.js');
check('salesController.js readable', !!ctrl);

const validateMatch = ctrl
  ? ctrl.match(/const\s+validateSales\s*=\s*catchAsync\([\s\S]*?\n\}\);/)
  : null;
const validateBody = validateMatch ? validateMatch[0] : '';
check('validateSales function block located', !!validateBody);

// ── 1. Old single-pool primitives are GONE ───────────────────────────────
section('1. Old single-pool primitives removed from validateSales');
{
  check(
    'no `const firstWarehouseId = rows[0]` (replaced by per-row scoping)',
    !/const\s+firstWarehouseId\s*=\s*rows\[0\]/.test(validateBody)
  );
  check(
    'no top-level `const deducted = new Map()` (replaced by deductedCache)',
    !/^\s*const\s+deducted\s*=\s*new Map\(\);\s*\/\/\s*productId/m.test(validateBody)
  );
  check(
    'no single buildStockSnapshot call against req.bdmId (proxy-broken)',
    !/buildStockSnapshot\(req\.entityId,\s*bdmId,\s*snapOpts\)/.test(validateBody)
  );
}

// ── 2. New per-(bdm, warehouse) snapshot cache wired ────────────────────
section('2. Per-(bdm_id, warehouse_id) snapshot cache + deducted-cache present');
{
  check(
    'snapshotCache Map declared',
    /const\s+snapshotCache\s*=\s*new Map\(\)/.test(validateBody)
  );
  check(
    'deductedCache Map declared',
    /const\s+deductedCache\s*=\s*new Map\(\)/.test(validateBody)
  );
  check(
    'getStockGroupForRow helper defined',
    /getStockGroupForRow\s*=\s*async\s*\(row\)\s*=>/.test(validateBody)
  );
  check(
    'cacheKey shape `${effectiveBdmId || \'\'}|${wh}`',
    /cacheKey\s*=\s*`\$\{effectiveBdmId\s*\|\|\s*''\}\|\$\{wh\}`/.test(validateBody)
  );
}

// ── 3. effectiveBdmId mirrors submitSales contract ──────────────────────
section('3. effectiveBdmId formula matches submitSales line ~1146');
{
  // Validate-side
  check(
    'validate uses (privileged && !row.warehouse_id) ? null : row.bdm_id',
    /effectiveBdmId\s*=\s*\(isPrivilegedCaller\s*&&\s*!row\.warehouse_id\)\s*\?\s*null\s*:\s*ownerBdm/.test(validateBody)
  );
  // Submit-side baseline (we MUST stay aligned with this)
  check(
    'submit-side baseline: (privileged && !row.warehouse_id) ? null : row.bdm_id',
    /submitBdmId\s*=\s*\(req\.isPresident\s*\|\|\s*req\.isAdmin\s*\|\|\s*req\.isFinance\)\s*&&\s*!row\.warehouse_id\s*\?\s*null\s*:\s*row\.bdm_id/.test(ctrl || '')
  );
}

// ── 4. Per-row stock check uses the per-group snapshot ──────────────────
section('4. Per-row line-item stock check pulls from group snapshot');
{
  check(
    'stockGroup retrieval inside non-OPENING_AR branch',
    /const\s+stockGroup\s*=\s*await\s+getStockGroupForRow\(row\)/.test(validateBody)
  );
  check(
    'available = stockGroup.productTotals.get(pid) - stockGroup.deducted.get(pid)',
    /stockGroup\.productTotals\.get\(pid\)[\s\S]{0,80}stockGroup\.deducted\.get\(pid\)/.test(validateBody)
  );
  check(
    'deduction writes back to stockGroup.deducted (not a global Map)',
    /stockGroup\.deducted\.set\(pid,/.test(validateBody)
  );
  // Confirm OPENING_AR / SERVICE_INVOICE branch still skips inventory
  check(
    'OPENING_AR / SERVICE_INVOICE skip-inventory guard preserved',
    /if\s*\(saleType\s*===\s*'SERVICE_INVOICE'\s*\|\|\s*row\.source\s*===\s*'OPENING_AR'\)/.test(validateBody)
  );
}

// ── 5. Sharper insufficient-stock diagnostic ────────────────────────────
section('5. Insufficient-stock error includes warehouse + BDM scope context');
{
  check(
    'scopeBits array constructed before error throw',
    /const\s+scopeBits\s*=\s*\[\];/.test(validateBody)
  );
  check(
    'warehouse appended to scope when present',
    /scopeBits\.push\(`warehouse \$\{stockGroup\.warehouseId\}`\)/.test(validateBody)
  );
  check(
    'BDM appended to scope when present',
    /scopeBits\.push\(`BDM \$\{stockGroup\.effectiveBdmId\}`\)/.test(validateBody)
  );
  check(
    'final error string carries optional `${scopeSuffix}` tail',
    /Insufficient stock for product[\s\S]{0,120}\$\{scopeSuffix\}/.test(validateBody)
  );
}

// ── 6. fifoEngine still in AND mode (no regression on Phase 32R-Transfer) ─
section('6. fifoEngine.buildStockMatch still AND mode (no regression)');
{
  const f = readFile('backend/erp/services/fifoEngine.js');
  check('fifoEngine.js readable', !!f);
  if (f) {
    const body = (f.match(/const buildStockMatch[\s\S]*?\n\};/) || [''])[0];
    check('no `else if (bdmId)` branch', !/else if\s*\(\s*bdmId\s*\)/.test(body));
    check('no `else if (opts?.warehouseId)` branch', !/else if\s*\(\s*opts\?\.warehouseId\s*\)/.test(body));
    check('Phase 32R rationale still cited', /Phase 32R-Transfer-Stock-Scope/.test(f));
  }
}

// ── 7. submitSales row.bdm_id consume path unchanged ────────────────────
section('7. submitSales still consumes via row.bdm_id (validate now harmonized)');
{
  check(
    'submit calls consumeFIFO with submitBdmId not req.bdmId',
    /consumeFIFO\(\s*row\.entity_id,\s*submitBdmId,/.test(ctrl || '')
  );
  check(
    'submit calls consumeSpecificBatch with submitBdmId not req.bdmId',
    /consumeSpecificBatch\(\s*row\.entity_id,\s*submitBdmId,/.test(ctrl || '')
  );
}

// ── 8. CLAUDE-ERP and PHASETASK-ERP doc trail ───────────────────────────
section('8. Documentation trail');
{
  const claude = readFile('CLAUDE-ERP.md');
  check('CLAUDE-ERP.md mentions Phase 32R-Sales-Validate-Proxy-Scope', /Phase 32R-Sales-Validate-Proxy-Scope/.test(claude || ''));
  const phaseTask = readFile('docs/PHASETASK-ERP.md');
  check('PHASETASK-ERP.md mentions Phase 32R-Sales-Validate-Proxy-Scope', /Phase 32R-Sales-Validate-Proxy-Scope/.test(phaseTask || ''));
}

// ── Summary ─────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(72));
console.log(`Result: ${pass} pass, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
