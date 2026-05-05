/**
 * Healthcheck: Phase G4.5dd Internal Stock Reassignment Proxy wiring
 * (Apr 30 2026)
 *
 * Statically verifies the end-to-end contract for cross-BDM internal stock
 * reassignment proxy entry. Mirrors the healthcheckIncomeProxy.js posture from
 * Phase G4.5aa — catches the same "lookup row missing → controller silently
 * permissive → frontend surfaces button → 403 / 500 at runtime" wiring drift
 * that bit us on Apr 26 (Phase N JE-TX) and Apr 30 (Phase R2 createSale).
 *
 * Usage:
 *   node backend/scripts/healthcheckInternalTransferProxy.js
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
  } catch {
    return null;
  }
}

// ── Lookup seeds ──
const lookupCtrl = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'INVENTORY__INTERNAL_TRANSFER_PROXY sub-perm seeded',
  lookupCtrl && /code:\s*'INVENTORY__INTERNAL_TRANSFER_PROXY'/.test(lookupCtrl),
  "Add { code: 'INVENTORY__INTERNAL_TRANSFER_PROXY', metadata: { module: 'inventory', key: 'internal_transfer_proxy', sort_order: 9.3 } } to SUB_PERMISSION SEED_DEFAULTS."
);
check(
  'INVENTORY__INTERNAL_TRANSFER_PROXY metadata.module=inventory + key=internal_transfer_proxy',
  lookupCtrl && /'INVENTORY__INTERNAL_TRANSFER_PROXY'[^}]*module:\s*'inventory'[^}]*key:\s*'internal_transfer_proxy'/.test(lookupCtrl),
  "metadata.module must be 'inventory' and metadata.key must be 'internal_transfer_proxy' (used by canProxyEntry sub-perm lookup)."
);
check(
  "PROXY_ENTRY_ROLES.INTERNAL_TRANSFER row seeded with insert_only_metadata",
  lookupCtrl && /code:\s*'INTERNAL_TRANSFER',\s*label:\s*'Internal Stock Reassignment[^']*'[^}]*insert_only_metadata:\s*true/.test(lookupCtrl),
  "Add { code: 'INTERNAL_TRANSFER', insert_only_metadata: true, metadata: { roles: ['admin','finance','president'] } } to PROXY_ENTRY_ROLES."
);
check(
  "VALID_OWNER_ROLES.INTERNAL_TRANSFER row seeded with insert_only_metadata",
  lookupCtrl && /code:\s*'INTERNAL_TRANSFER',\s*label:\s*'Valid proxy targets — Internal Stock Reassignment'[^}]*insert_only_metadata:\s*true/.test(lookupCtrl),
  "Add { code: 'INTERNAL_TRANSFER', insert_only_metadata: true, metadata: { roles: ['staff'] } } to VALID_OWNER_ROLES."
);

// ── Backend: interCompanyController ──
const icCtrl = readFile('backend/erp/controllers/interCompanyController.js');
check(
  'interCompanyController.js imports canProxyEntry + getValidOwnerRolesForModule',
  icCtrl && /require\('\.\.\/utils\/resolveOwnerScope'\)/.test(icCtrl)
        && /canProxyEntry/.test(icCtrl)
        && /getValidOwnerRolesForModule/.test(icCtrl),
  "Add: const { canProxyEntry, getValidOwnerRolesForModule } = require('../utils/resolveOwnerScope');"
);
check(
  'interCompanyController defines INTERNAL_TRANSFER_PROXY_OPTS with subKey + lookupCode',
  icCtrl && /INTERNAL_TRANSFER_PROXY_OPTS\s*=\s*\{[^}]*subKey:\s*'internal_transfer_proxy'[^}]*lookupCode:\s*'INTERNAL_TRANSFER'/.test(icCtrl),
  "Add: const INTERNAL_TRANSFER_PROXY_OPTS = { subKey: 'internal_transfer_proxy', lookupCode: 'INTERNAL_TRANSFER' };"
);
check(
  'createReassignment calls canProxyEntry with INTERNAL_TRANSFER_PROXY_OPTS',
  icCtrl && /createReassignment[\s\S]{0,3000}canProxyEntry\(req,\s*'inventory',\s*INTERNAL_TRANSFER_PROXY_OPTS\)/.test(icCtrl),
  "createReassignment must call canProxyEntry(req, 'inventory', INTERNAL_TRANSFER_PROXY_OPTS) for non-privileged callers."
);
check(
  'createReassignment validates source + target via getValidOwnerRolesForModule',
  icCtrl && /createReassignment[\s\S]{0,4000}getValidOwnerRolesForModule\(\s*entityId\s*,\s*'inventory'\s*,\s*'INTERNAL_TRANSFER'\s*\)/.test(icCtrl),
  "createReassignment must call getValidOwnerRolesForModule(entityId, 'inventory', 'INTERNAL_TRANSFER') and validate both BDM roles + same-entity."
);
check(
  'createReassignment denies non-privileged caller without proxy with 403',
  icCtrl && /createReassignment[\s\S]{0,4000}res\.status\(403\)[\s\S]{0,400}internal[_.]transfer_proxy/i.test(icCtrl),
  "createReassignment must return 403 with a message naming inventory.internal_transfer_proxy when proxy denied."
);
check(
  'approveReassignment enforces explicit admin/finance/president gate',
  icCtrl && /approveReassignment[\s\S]{0,800}isAdmin\s*\|\|\s*req\.isFinance\s*\|\|\s*req\.isPresident[\s\S]{0,200}res\.status\(403\)/.test(icCtrl),
  "approveReassignment must short-circuit non-admin/finance/president with 403 (two-person rule on stock-ownership change)."
);

// ── Backend: docNumbering wiring on StockReassignment (Phase G4.5dd-r1) ──
const stockReassignmentModel = readFile('backend/erp/models/StockReassignment.js');
check(
  'StockReassignment pre-save hook auto-generates reassignment_ref via docNumbering',
  stockReassignmentModel
    && /pre\(\s*'save'[\s\S]{0,800}generateDocNumber\(/.test(stockReassignmentModel),
  "StockReassignment pre-save hook must call generateDocNumber({ prefix: 'IST', bdmId, entityId, ... }) — mirrors InterCompanyTransfer pattern."
);
check(
  'StockReassignment ref uses prefix IST + bdmId + entityId fallback',
  stockReassignmentModel
    && /prefix:\s*'IST'/.test(stockReassignmentModel)
    && /bdmId:\s*this\.source_bdm_id/.test(stockReassignmentModel)
    && /entityId:\s*this\.entity_id/.test(stockReassignmentModel),
  "Pass prefix:'IST', bdmId:this.source_bdm_id, entityId:this.entity_id so docNumbering resolves territory→entity→fallback in priority order."
);
check(
  'createReassignment no longer accepts territory_code from request body',
  icCtrl
    && !/const\s*\{[^}]*territory_code[^}]*\}\s*=\s*req\.body/.test(icCtrl),
  "Drop territory_code from the createReassignment destructure — the field is owned by docNumbering now."
);
check(
  'createReassignment no longer hand-builds reassignment_ref',
  icCtrl
    && !/reassignment_ref\s*=\s*`\$\{prefix\}-\$\{dateCode\}-\$\{seq\}`/.test(icCtrl),
  "Remove the legacy 'TERRITORY-MMDDYY-SEQ' hand-built ref block — pre-save hook owns this now."
);

// ── Backend: ensure resolveOwnerScope exports the helpers we depend on ──
const resolveOwnerScope = readFile('backend/erp/utils/resolveOwnerScope.js');
check(
  'resolveOwnerScope exports canProxyEntry + getValidOwnerRolesForModule',
  resolveOwnerScope && /module\.exports[\s\S]{0,400}canProxyEntry[\s\S]{0,400}getValidOwnerRolesForModule/.test(resolveOwnerScope),
  'resolveOwnerScope.js must export canProxyEntry and getValidOwnerRolesForModule.'
);

// ── Backend: route still mounted with inventory.transfers gate ──
const icRoutes = readFile('backend/erp/routes/interCompanyRoutes.js');
check(
  'POST /reassign route mounted',
  icRoutes && /router\.post\(\s*'\/reassign'/.test(icRoutes),
  "Confirm POST /reassign in interCompanyRoutes.js still goes through createReassignment."
);
check(
  'POST /reassign/:id/approve route mounted',
  icRoutes && /router\.post\(\s*'\/reassign\/:id\/approve'/.test(icRoutes),
  "Confirm POST /reassign/:id/approve in interCompanyRoutes.js still goes through approveReassignment."
);

// ── Frontend: TransferOrders surfaces the proxy button ──
const transferPage = readFile('frontend/src/erp/pages/TransferOrders.jsx');
check(
  'TransferOrders reads internal_transfer_proxy sub-perm',
  transferPage && /erp_access\?\.sub_permissions\?\.inventory\?\.internal_transfer_proxy/.test(transferPage),
  "TransferOrders.jsx must read user.erp_access.sub_permissions.inventory.internal_transfer_proxy."
);
check(
  'TransferOrders + Reassign Stock button uses canCreateReassign (not isPresidentOrAdmin alone)',
  transferPage && /\{canCreateReassign\s*&&\s*activeTab\s*===\s*'internal'\s*&&\s*\(\s*<button[\s\S]{0,200}\+\s*Reassign Stock/.test(transferPage),
  "Replace the {isPresidentOrAdmin && activeTab === 'internal' && ...} guard on the Reassign Stock button with canCreateReassign."
);
check(
  'TransferOrders shows Proxy mode chip for staff with proxy',
  transferPage && /Proxy mode\s*—\s*create only/.test(transferPage),
  "Add a 'Proxy mode — create only' chip when !isPresidentOrAdmin && canProxyInternalTransfer."
);
check(
  'TransferOrders Approve/Reject button still gated by isFinanceOrAdmin (two-person rule)',
  transferPage && /isFinanceOrAdmin\s*&&\s*\([\s\S]{0,400}handleReassignAction\([^)]*'APPROVED'\)/.test(transferPage),
  "Approve/Reject buttons MUST keep isFinanceOrAdmin gate — proxy is create-only by design."
);

// ── Phase G4.5dd-r1 frontend: territory_code input dropped from the modal ──
check(
  'TransferOrders reassign form state no longer contains territory_code',
  transferPage && !/reassignForm[\s\S]{0,200}useState\(\{[^}]*territory_code/.test(transferPage),
  "Remove territory_code from the reassignForm initial state object — docNumbering owns the prefix."
);
check(
  'TransferOrders modal no longer renders Territory Code label',
  transferPage && !/<label>\s*Territory Code\s*<\/label>/.test(transferPage),
  "Remove the <label>Territory Code</label> form-group from the Internal Reassignment modal."
);
check(
  'TransferOrders modal explains auto-assigned IST ref to the user',
  transferPage && /IST-/.test(transferPage) && /auto-assigned on submit/i.test(transferPage),
  "Add a small helper note under the Date/Notes row explaining the auto-assigned IST-{...} ref scheme."
);

// ── Phase G4.5dd-r2 same-custodian rebalance ──
check(
  'createReassignment allows same-custodian when warehouses differ',
  icCtrl
    && /sameCustodian\s*=\s*String\(source_bdm_id\)\s*===\s*String\(target_bdm_id\)/.test(icCtrl)
    && !/source_bdm_id\s*===\s*target_bdm_id[\s\S]{0,200}must be different/.test(icCtrl),
  "createReassignment must compute sameCustodian and DROP the old strict 'Source and target must be different' block. Same-custodian is allowed when warehouses differ."
);
check(
  'createReassignment requires distinct warehouses on same-custodian rebalance',
  icCtrl && /sameCustodian[\s\S]{0,500}requires different source and target warehouses/.test(icCtrl),
  "createReassignment must 400 when sameCustodian && source_warehouse_id === target_warehouse_id."
);
check(
  'createReassignment self-source bypasses proxy gate (isSelfMove)',
  icCtrl
    && /isSelfMove\s*=\s*sameCustodian\s*&&\s*String\(source_bdm_id\)\s*===\s*String\(req\.user\._id\)/.test(icCtrl)
    && /!privileged\s*&&\s*!isSelfMove/.test(icCtrl),
  "createReassignment must compute isSelfMove and skip the canProxyEntry call when (sameCustodian && source_bdm_id === req.user._id)."
);
check(
  'approveReassignment writes TRANSFER_IN to target warehouse on same-custodian',
  icCtrl
    && /isSameCustodian\s*=\s*String\(reassignment\.source_bdm_id\)\s*===\s*String\(reassignment\.target_bdm_id\)/.test(icCtrl)
    && /if\s*\(\s*isSameCustodian\s*\)[\s\S]{0,800}transaction_type:\s*'TRANSFER_IN'/.test(icCtrl),
  "approveReassignment must compute isSameCustodian and, when true, write a TRANSFER_IN ledger row to the target warehouse alongside TRANSFER_OUT from source."
);
check(
  'approveReassignment closes same-custodian doc directly to COMPLETED (skips AWAITING_GRN)',
  icCtrl && /reassignment\.status\s*=\s*isSameCustodian\s*\?\s*'COMPLETED'\s*:\s*'AWAITING_GRN'/.test(icCtrl),
  "approveReassignment must transition same-custodian reassignments straight to COMPLETED (skipping the AWAITING_GRN waiting state — same person on both sides)."
);

// ── Frontend: same-custodian UX ──
check(
  "TransferOrders modal target dropdown allows the source custodian (no .filter exclusion)",
  transferPage
    && !/entityBdms\.filter\(u\s*=>\s*u\._id\s*!==\s*reassignForm\.source_bdm_id\)/.test(transferPage),
  "Drop the entityBdms.filter(u => u._id !== reassignForm.source_bdm_id) on the Target Custodian <SelectField> — same-custodian rebalance is now legal."
);
check(
  'TransferOrders modal explains the same-custodian rebalance path',
  transferPage && /same custodian on both sides[\s\S]{0,200}rebalance/i.test(transferPage),
  "Add a one-liner under the modal title explaining that picking the same custodian on both sides triggers a warehouse-rebalance flow that skips the GRN step."
);

// ── Frontend: WorkflowGuide banner mentions the proxy ──
const workflowGuide = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  "WorkflowGuide 'transfers' banner mentions inventory.internal_transfer_proxy",
  workflowGuide && /'transfers'[\s\S]{0,3000}inventory\.internal_transfer_proxy/.test(workflowGuide),
  "Add a tip/step in the 'transfers' WorkflowGuide entry mentioning the inventory.internal_transfer_proxy sub-perm + PROXY_ENTRY_ROLES.INTERNAL_TRANSFER lookup."
);
check(
  "WorkflowGuide 'transfers' banner mentions two-person rule on approval",
  workflowGuide && /'transfers'[\s\S]{0,3000}two-person rule/i.test(workflowGuide),
  "Add a step in the 'transfers' WorkflowGuide entry calling out the two-person rule (proxy creates, admin/finance approves)."
);

// ── Report ──
const passed = checks.filter(c => c.ok).length;
const failed = checks.length - passed;

console.log('\nPhase G4.5dd Internal Stock Reassignment Proxy — wiring healthcheck');
console.log('═══════════════════════════════════════════════════════════════════');
for (const c of checks) {
  const mark = c.ok ? '✓' : '✗';
  const color = c.ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`${color}${mark}\x1b[0m ${c.label}`);
  if (!c.ok && c.hint) console.log(`    ↳ ${c.hint}`);
}
console.log('───────────────────────────────────────────────────────────────────');
console.log(`${passed}/${checks.length} checks passed${failed ? ` (${failed} failed)` : ''}`);
process.exit(failed ? 1 : 0);
