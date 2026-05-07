/**
 * Healthcheck — Phase 15.3-fix-2 Print Controller Resource-First Access
 *
 * Static contract verifier for the May 07 2026 sweep that switched every
 * authenticated `printController` endpoint from working-entity-scoped lookup
 * (which 404'd for admin/finance viewing a cross-entity resource via
 * window.open()) to a resource-first lookup gated by `assertResourceReadAccess`.
 *
 * Endpoints covered (5):
 *   - getReceiptHtml          → /api/erp/print/receipt/:id            (sales)
 *   - getPettyCashFormHtml    → /api/erp/print/petty-cash/:id         (entity-only)
 *   - getGrnHtml              → /api/erp/print/grn/:id                (inventory)
 *   - getCreditNoteHtml       → /api/erp/print/credit-note/:id        (sales)
 *   - getPurchaseOrderHtml    → /api/erp/print/purchase-order/:id     (purchasing)
 *
 * Public `getSharedPOHtml` (`/erp/po/share/:token`) is intentionally exempt —
 * the share_token IS the auth, cross-entity by design.
 *
 * Run: `node backend/scripts/healthcheckPrintControllerAccess.js`
 * Exit: 0 = clean, 1 = contract drift.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const PRINT_CTRL = path.join(REPO, 'backend/erp/controllers/printController.js');
const PRINT_ROUTES = path.join(REPO, 'backend/erp/routes/printRoutes.js');
const ROUTES_INDEX = path.join(REPO, 'backend/erp/routes/index.js');
const RESOLVE_OWNER = path.join(REPO, 'backend/erp/utils/resolveOwnerScope.js');
const WORKFLOW_GUIDE = path.join(REPO, 'frontend/src/erp/components/WorkflowGuide.jsx');

const results = [];
const fail = (label) => { results.push({ ok: false, label }); };
const pass = (label) => { results.push({ ok: true, label }); };
const read = (p) => fs.readFileSync(p, 'utf8');

const SRC = read(PRINT_CTRL);

// ── Section 1: helper exists and is imported ──────────────────────
{
  const helperSrc = read(RESOLVE_OWNER);
  helperSrc.includes('async function assertResourceReadAccess')
    ? pass('resolveOwnerScope.js exports assertResourceReadAccess (Phase 15.3-fix dependency)')
    : fail('resolveOwnerScope.js MISSING assertResourceReadAccess — run Phase 15.3-fix first');

  SRC.includes("require('../utils/resolveOwnerScope')") && SRC.includes('assertResourceReadAccess')
    ? pass('printController imports assertResourceReadAccess from resolveOwnerScope')
    : fail('printController MUST import assertResourceReadAccess');
}

// ── Section 2: every authenticated endpoint uses findById (not entity-scoped findOne) ──
const ENDPOINTS = [
  {
    fn: 'getReceiptHtml',
    findCall: 'SalesLine.findById(req.params.id)',
    moduleKey: "moduleKey: 'sales'",
    subKey: "subKey: 'proxy_entry'",
    label: "resourceLabel: 'sale'",
    notFoundMsg: "'Sale not found'",
  },
  {
    fn: 'getGrnHtml',
    findCall: 'GrnEntry.findById(req.params.id)',
    moduleKey: "moduleKey: 'inventory'",
    subKey: "subKey: 'grn_proxy_entry'",
    label: "resourceLabel: 'GRN'",
    notFoundMsg: "'GRN not found'",
  },
  {
    fn: 'getCreditNoteHtml',
    findCall: 'CreditNote.findById(req.params.id)',
    moduleKey: "moduleKey: 'sales'",
    subKey: "subKey: 'proxy_entry'",
    label: "resourceLabel: 'credit note'",
    notFoundMsg: "'Credit note not found'",
  },
  {
    fn: 'getPurchaseOrderHtml',
    findCall: 'PurchaseOrder.findById(req.params.id)',
    moduleKey: "moduleKey: 'purchasing'",
    subKey: "subKey: 'proxy_entry'",
    label: "resourceLabel: 'purchase order'",
    notFoundMsg: "'Purchase order not found'",
  },
];

for (const e of ENDPOINTS) {
  const fnRe = new RegExp(`const ${e.fn} = catchAsync\\(async \\(req, res\\) => \\{([\\s\\S]*?)\\n\\}\\);`, 'm');
  const m = SRC.match(fnRe);
  if (!m) {
    fail(`${e.fn}: function body NOT found`);
    continue;
  }
  const body = m[1];

  body.includes(e.findCall)
    ? pass(`${e.fn}: uses ${e.findCall} (resource-first; cross-entity safe)`)
    : fail(`${e.fn}: MUST use ${e.findCall} (no entity-scoped findOne)`);

  // No regression to the old pattern
  !/findOne\(\s*\{\s*_id:\s*req\.params\.id\s*,\s*\.\.\.req\.tenantFilter/m.test(body)
    ? pass(`${e.fn}: no longer uses scope-restricted findOne (fragility removed)`)
    : fail(`${e.fn}: STILL uses {_id, ...req.tenantFilter} — false-404 fragility back`);

  body.includes('await assertResourceReadAccess(')
    ? pass(`${e.fn}: gates access via assertResourceReadAccess`)
    : fail(`${e.fn}: MUST call assertResourceReadAccess(req, doc, ...)`);

  body.includes(e.moduleKey)
    ? pass(`${e.fn}: passes ${e.moduleKey}`)
    : fail(`${e.fn}: MUST pass ${e.moduleKey} for proxy gate`);

  body.includes(e.subKey)
    ? pass(`${e.fn}: passes ${e.subKey}`)
    : fail(`${e.fn}: MUST pass ${e.subKey}`);

  body.includes(e.label)
    ? pass(`${e.fn}: passes ${e.label} (friendly 403 message)`)
    : fail(`${e.fn}: MUST pass ${e.label}`);

  body.includes(e.notFoundMsg)
    ? pass(`${e.fn}: still returns 404 ${e.notFoundMsg} for non-existent id`)
    : fail(`${e.fn}: MUST preserve real 404 for non-existent id`);
}

// ── Section 3: getPettyCashFormHtml — special-cased (custodian_id alias) ──
{
  const m = SRC.match(/const getPettyCashFormHtml = catchAsync\(async \(req, res\) => \{([\s\S]*?)\n\}\);/m);
  if (!m) {
    fail('getPettyCashFormHtml: function body NOT found');
  } else {
    const body = m[1];
    body.includes('PettyCashRemittance.findById(req.params.id)')
      ? pass('getPettyCashFormHtml: uses findById (resource-first; cross-entity safe)')
      : fail('getPettyCashFormHtml: MUST use PettyCashRemittance.findById(req.params.id)');

    !/findOne\(\s*\{[\s\S]*?entity_id:\s*req\.entityId/m.test(body)
      ? pass('getPettyCashFormHtml: no longer uses {entity_id: req.entityId} on lookup')
      : fail('getPettyCashFormHtml: STILL uses {entity_id: req.entityId} on findOne — false-404 fragility back');

    body.includes('await assertResourceReadAccess(')
      ? pass('getPettyCashFormHtml: gates access via assertResourceReadAccess')
      : fail('getPettyCashFormHtml: MUST call assertResourceReadAccess');

    body.includes('bdm_id: custodianId')
      ? pass('getPettyCashFormHtml: aliases custodian_id → bdm_id for shared helper (preserves staff custodian access)')
      : fail('getPettyCashFormHtml: MUST alias custodian_id onto bdm_id field');

    body.includes("resourceLabel: 'petty cash document'")
      ? pass('getPettyCashFormHtml: passes friendly resourceLabel')
      : fail('getPettyCashFormHtml: MUST pass resourceLabel');
  }
}

// ── Section 4: getSharedPOHtml unchanged (public share_token endpoint) ──
{
  const m = SRC.match(/const getSharedPOHtml = catchAsync\(async \(req, res\) => \{([\s\S]*?)\n\}\);/m);
  if (!m) {
    fail('getSharedPOHtml: function body NOT found');
  } else {
    const body = m[1];
    body.includes('PurchaseOrder.findOne({ share_token: req.params.token })')
      ? pass('getSharedPOHtml: still uses share_token lookup (public-share contract intact)')
      : fail('getSharedPOHtml: share_token lookup MUST remain unchanged (public contract)');

    !body.includes('assertResourceReadAccess')
      ? pass('getSharedPOHtml: does NOT call assertResourceReadAccess (correct — public route, share_token IS auth)')
      : fail('getSharedPOHtml: must NOT call assertResourceReadAccess (public route would always 401)');
  }
}

// ── Section 5: route mounts unchanged ──────────────────────────────
{
  const routesSrc = read(PRINT_ROUTES);
  routesSrc.includes("router.get('/receipt/:id', printCtrl.getReceiptHtml)")
    ? pass("printRoutes mounts /receipt/:id → getReceiptHtml")
    : fail('printRoutes /receipt/:id route mount changed');

  routesSrc.includes("router.get('/petty-cash/:id', printCtrl.getPettyCashFormHtml)")
    ? pass("printRoutes mounts /petty-cash/:id → getPettyCashFormHtml")
    : fail('printRoutes /petty-cash/:id route mount changed');

  routesSrc.includes("router.get('/grn/:id', printCtrl.getGrnHtml)")
    ? pass("printRoutes mounts /grn/:id → getGrnHtml")
    : fail('printRoutes /grn/:id route mount changed');

  routesSrc.includes("router.get('/credit-note/:id', printCtrl.getCreditNoteHtml)")
    ? pass("printRoutes mounts /credit-note/:id → getCreditNoteHtml")
    : fail('printRoutes /credit-note/:id route mount changed');

  routesSrc.includes("router.get('/purchase-order/:id', printCtrl.getPurchaseOrderHtml)")
    ? pass("printRoutes mounts /purchase-order/:id → getPurchaseOrderHtml")
    : fail('printRoutes /purchase-order/:id route mount changed');

  const indexSrc = read(ROUTES_INDEX);
  indexSrc.includes("router.get('/po/share/:token', require('../controllers/printController').getSharedPOHtml)")
    ? pass('routes/index.js mounts public /po/share/:token BEFORE protect/tenantFilter wall')
    : fail('public /po/share/:token mount changed — public-share contract at risk');

  // /print mount must remain BEHIND protect (auth required for non-share endpoints)
  const printMountIdx = indexSrc.indexOf("router.use('/print', require('./printRoutes'))");
  const protectIdx = indexSrc.indexOf("router.use(protect, tenantFilter)");
  printMountIdx > protectIdx && protectIdx > 0
    ? pass('routes/index.js mounts /print AFTER protect/tenantFilter (auth + entity context guaranteed)')
    : fail('/print mount must come AFTER protect/tenantFilter — auth/entity context required');
}

// ── Section 6: WorkflowGuide banner reflects current behavior (Rule #1) ──
{
  const guideSrc = read(WORKFLOW_GUIDE);
  guideSrc.includes('Phase 15.3-fix-2') || guideSrc.includes('resource-first access')
    ? pass('WorkflowGuide purchase-orders banner mentions resource-first access')
    : fail('WorkflowGuide MUST update purchase-orders tip to mention resource-first access (Rule #1)');
}

// ── Section 7: subscription-readiness — no new lookup categories needed ──
{
  // We reuse existing PROXY_ENTRY_ROLES.{SALES,INVENTORY,PURCHASING} rows. None
  // need new seeds. This is just an assertion that the helper resolves them.
  const helperSrc = read(RESOLVE_OWNER);
  helperSrc.includes("category: 'PROXY_ENTRY_ROLES'")
    ? pass('PROXY_ENTRY_ROLES resolver intact — subscribers retune via Control Center → Lookup Tables (Rule #3)')
    : fail('PROXY_ENTRY_ROLES lookup resolver missing in resolveOwnerScope');
}

// ── Section 8: Rule #21 — no silent self-fill on denial ────────────
{
  const helperSrc = read(RESOLVE_OWNER);
  /assertResourceReadAccess[\s\S]*?err\.statusCode\s*=\s*403/m.test(helperSrc)
    ? pass('assertResourceReadAccess throws 403 on denial (Rule #21 — no silent self-fill)')
    : fail('assertResourceReadAccess MUST throw 403 on entity mismatch (Rule #21)');
}

// ── Report ─────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log('\nPhase 15.3-fix-2 Print Controller Resource-First Access — healthcheck');
console.log('─'.repeat(72));
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`));
console.log('─'.repeat(72));
console.log(`${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
