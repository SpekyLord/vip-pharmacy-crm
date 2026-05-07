/**
 * Healthcheck — Phase 15.3-fix CSI Draft Resource-First Access
 *
 * Static contract verifier for the May 07 2026 fix that switched
 * `generateCsiDraft` from working-entity-scoped lookup (which 404'd for
 * admins viewing a cross-entity sale via window.open()) to a resource-first
 * lookup gated by `assertResourceReadAccess`.
 *
 * Run: `node backend/scripts/healthcheckCsiDraftAccess.js`
 * Exit: 0 = clean, 1 = contract drift.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const RESOLVE_OWNER = path.join(REPO, 'backend/erp/utils/resolveOwnerScope.js');
const SALES_CTRL = path.join(REPO, 'backend/erp/controllers/salesController.js');
const SALES_ROUTES = path.join(REPO, 'backend/erp/routes/salesRoutes.js');
const USE_SALES = path.join(REPO, 'frontend/src/erp/hooks/useSales.js');

const results = [];
const fail = (label) => { results.push({ ok: false, label }); };
const pass = (label) => { results.push({ ok: true, label }); };

const read = (p) => fs.readFileSync(p, 'utf8');

// Section 1 — helper exists in resolveOwnerScope
{
  const src = read(RESOLVE_OWNER);
  src.includes('async function assertResourceReadAccess')
    ? pass('resolveOwnerScope.js exports assertResourceReadAccess function')
    : fail('resolveOwnerScope.js MISSING assertResourceReadAccess function');

  /assertResourceReadAccess[\s\S]*?if\s*\(req\.isPresident\)\s*return/m.test(src)
    ? pass('assertResourceReadAccess short-circuits for president')
    : fail('assertResourceReadAccess MUST short-circuit for req.isPresident');

  src.includes('user.entity_ids') && src.includes('user.entity_id')
    ? pass('assertResourceReadAccess builds entity allowlist from BOTH entity_id + entity_ids')
    : fail('assertResourceReadAccess MUST consult both entity_id and entity_ids');

  /err\.statusCode\s*=\s*403/m.test(src)
    ? pass('assertResourceReadAccess throws 403 on entity-mismatch (no silent fallback per Rule #21)')
    : fail('assertResourceReadAccess MUST throw 403 on entity mismatch');

  src.match(/module\.exports\s*=\s*\{[\s\S]*assertResourceReadAccess[\s\S]*\}/m)
    ? pass('assertResourceReadAccess listed in module.exports')
    : fail('assertResourceReadAccess NOT in module.exports');

  src.includes('canProxyEntry(req, opts.moduleKey,')
    ? pass('staff branch delegates proxy check to canProxyEntry (lookup-driven gate)')
    : fail('staff branch MUST delegate to canProxyEntry — no hardcoded role list');
}

// Section 2 — salesController.generateCsiDraft uses resource-first lookup
{
  const src = read(SALES_CTRL);
  src.includes('assertResourceReadAccess')
    ? pass('salesController imports assertResourceReadAccess')
    : fail('salesController MISSING assertResourceReadAccess import');

  // Extract generateCsiDraft body
  const fnMatch = src.match(/const generateCsiDraft = catchAsync\(async \(req, res\) => \{([\s\S]*?)\n\}\);/m);
  if (!fnMatch) {
    fail('Could not locate generateCsiDraft function body');
  } else {
    const body = fnMatch[1];

    body.includes('SalesLine.findById(req.params.id)')
      ? pass('generateCsiDraft uses findById (resource-first; no entity scope on lookup)')
      : fail('generateCsiDraft MUST use SalesLine.findById(req.params.id) for cross-entity lookup');

    !/SalesLine\.findOne\(\s*\{\s*_id:\s*req\.params\.id\s*,\s*\.\.\.scope/m.test(body)
      ? pass('generateCsiDraft no longer uses scope-restricted findOne (would re-introduce false 404)')
      : fail('generateCsiDraft STILL uses scope-restricted findOne — bug regression');

    body.includes('assertResourceReadAccess(req, sale')
      ? pass('generateCsiDraft calls assertResourceReadAccess with the looked-up sale')
      : fail('generateCsiDraft MUST gate access via assertResourceReadAccess(req, sale, ...)');

    body.includes("moduleKey: 'sales'")
      ? pass("assertResourceReadAccess called with moduleKey: 'sales' (proxy gate honored)")
      : fail("assertResourceReadAccess MUST pass moduleKey: 'sales' for staff proxy check");

    body.includes("subKey: 'proxy_entry'")
      ? pass("assertResourceReadAccess called with subKey: 'proxy_entry' (sub-permission honored)")
      : fail("assertResourceReadAccess MUST pass subKey: 'proxy_entry'");

    // The 404 for missing sale must still exist (real 404, not false 404)
    body.includes("'Sale not found'")
      ? pass('generateCsiDraft still returns 404 when sale truly does not exist')
      : fail('generateCsiDraft MUST still return 404 for non-existent sale ID');
  }
}

// Section 3 — route mount unchanged (no regression)
{
  const src = read(SALES_ROUTES);
  src.includes("router.get('/:id/csi-draft', c.generateCsiDraft)")
    ? pass('salesRoutes mounts /:id/csi-draft → generateCsiDraft')
    : fail('salesRoutes MUST mount GET /:id/csi-draft → generateCsiDraft');

  // /:id/csi-draft must come AFTER /drafts/pending-csi etc to avoid Express
  // pattern shadowing (the literal '/drafts/...' segments would never match
  // if the wildcard route came first).
  const csiDraftIdx = src.indexOf("/:id/csi-draft'");
  const draftsIdx = src.indexOf("/drafts/pending-csi'");
  csiDraftIdx > draftsIdx && draftsIdx > 0
    ? pass('csi-draft mounted AFTER literal /drafts/* routes (no Express shadowing)')
    : fail('csi-draft must come AFTER /drafts/* literal routes — pattern shadowing risk');
}

// Section 4 — frontend useSales hook unchanged (no URL parameter needed)
{
  const src = read(USE_SALES);
  src.includes('const csiDraftUrl = (id) => `/api/erp/sales/${id}/csi-draft`;')
    ? pass('useSales.csiDraftUrl(id) unchanged — fix is server-side only, no frontend churn')
    : fail('useSales.csiDraftUrl shape changed — verify CsiBooklets.jsx + SalesEntry.jsx call sites still work');
}

// Section 5 — call sites unchanged
{
  const csiBooklets = path.join(REPO, 'frontend/src/erp/pages/CsiBooklets.jsx');
  const salesEntry = path.join(REPO, 'frontend/src/erp/pages/SalesEntry.jsx');

  if (fs.existsSync(csiBooklets)) {
    const s = read(csiBooklets);
    s.includes('window.open(sales.csiDraftUrl(d._id)')
      ? pass('CsiBooklets.jsx unchanged — calls sales.csiDraftUrl(d._id) via window.open')
      : fail('CsiBooklets.jsx call site shape changed — review needed');
  }
  if (fs.existsSync(salesEntry)) {
    const s = read(salesEntry);
    s.includes('window.open(sales.csiDraftUrl(r._id)')
      ? pass('SalesEntry.jsx unchanged — calls sales.csiDraftUrl(r._id) via window.open')
      : fail('SalesEntry.jsx call site shape changed — review needed');
  }
}

// ── Report ─────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`\nPhase 15.3-fix CSI Draft Resource-First Access — healthcheck`);
console.log('─'.repeat(72));
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`));
console.log('─'.repeat(72));
console.log(`${passed}/${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
