#!/usr/bin/env node
/**
 * Phase EC-1 — Executive Cockpit Wiring Health Check
 *
 * Static (no-DB) verification that the cockpit's contract is intact:
 *
 *   1. backend/utils/executiveCockpitAccess.js exists and exports the
 *      requireCockpitRole + invalidate + 3 getter functions.
 *   2. lookupGenericController.js imports invalidateCockpitRolesCache,
 *      defines EXECUTIVE_COCKPIT_ROLES_CATEGORIES, and wires it into all
 *      4 invalidation sites (create/update/remove/seedCategory).
 *   3. lookupGenericController.SEED_DEFAULTS contains EXECUTIVE_COCKPIT_ROLES
 *      with the 3 expected codes (VIEW_COCKPIT, VIEW_FINANCIAL, VIEW_OPERATIONAL).
 *   4. backend/erp/services/cockpitService.js exists and exports getCockpit
 *      plus 10 individual tile getters.
 *   5. backend/erp/controllers/cockpitController.js exists and exports
 *      getCockpitData.
 *   6. backend/erp/routes/cockpitRoutes.js exists and mounts requireCockpitRole.
 *   7. backend/erp/routes/index.js mounts /cockpit.
 *   8. frontend/src/erp/pages/ExecutiveCockpit.jsx exists.
 *   9. frontend/src/erp/hooks/useCockpit.js exists.
 *  10. frontend/src/App.jsx imports ExecutiveCockpit and registers /erp/cockpit.
 *  11. frontend/src/components/common/Sidebar.jsx links /erp/cockpit for MANAGEMENT.
 *  12. frontend/src/erp/components/WorkflowGuide.jsx has 'cockpit' entry in WORKFLOW_GUIDES.
 *
 * Run: node backend/scripts/healthcheckExecutiveCockpit.js
 * Exit code 0 = clean, 1 = issues found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');

let issues = 0;
let checked = 0;

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function check(label, fn) {
  checked++;
  try {
    const ok = fn();
    if (ok === true) {
      console.log(`  ✓ ${label}`);
    } else {
      issues++;
      console.log(`  ✗ ${label}${ok ? ` — ${ok}` : ''}`);
    }
  } catch (err) {
    issues++;
    console.log(`  ✗ ${label} — ${err.message}`);
  }
}

console.log('\n=== Phase EC-1: Executive Cockpit Wiring Health Check ===\n');

// 1. Access helper
console.log('[1/12] Backend access helper');
const accessHelper = readSafe(path.join(BACKEND, 'utils', 'executiveCockpitAccess.js'));
check('executiveCockpitAccess.js exists', () => accessHelper !== null);
check('exports requireCockpitRole', () => accessHelper && /module\.exports\s*=\s*\{[\s\S]*requireCockpitRole/.test(accessHelper));
check('exports invalidate', () => accessHelper && /module\.exports\s*=\s*\{[\s\S]*\binvalidate\b/.test(accessHelper));
check('exports VIEW_COCKPIT / VIEW_FINANCIAL / VIEW_OPERATIONAL getters', () =>
  accessHelper &&
  /getViewCockpitRoles/.test(accessHelper) &&
  /getViewFinancialRoles/.test(accessHelper) &&
  /getViewOperationalRoles/.test(accessHelper));

// 2. Lookup controller wiring
console.log('\n[2/12] Lookup controller invalidation wiring');
const lookupCtrl = readSafe(path.join(BACKEND, 'erp', 'controllers', 'lookupGenericController.js'));
check('imports invalidateCockpitRolesCache', () => lookupCtrl && /invalidateCockpitRolesCache.*executiveCockpitAccess/.test(lookupCtrl));
check('declares EXECUTIVE_COCKPIT_ROLES_CATEGORIES', () => lookupCtrl && /const EXECUTIVE_COCKPIT_ROLES_CATEGORIES\s*=\s*new Set\(\['EXECUTIVE_COCKPIT_ROLES'\]\)/.test(lookupCtrl));
const invalidationSites = (lookupCtrl || '').match(/EXECUTIVE_COCKPIT_ROLES_CATEGORIES\.has\([^)]+\)\)\s*invalidateCockpitRolesCache/g) || [];
check(`wires invalidator at all 4 mutation sites (found ${invalidationSites.length}/4)`, () => invalidationSites.length === 4 || `found ${invalidationSites.length}`);

// 3. SEED_DEFAULTS
console.log('\n[3/12] SEED_DEFAULTS entry');
check('EXECUTIVE_COCKPIT_ROLES present in SEED_DEFAULTS', () => lookupCtrl && /EXECUTIVE_COCKPIT_ROLES:\s*\[/.test(lookupCtrl));
check('VIEW_COCKPIT seed row', () => lookupCtrl && /code:\s*['"]VIEW_COCKPIT['"]/.test(lookupCtrl));
check('VIEW_FINANCIAL seed row', () => lookupCtrl && /code:\s*['"]VIEW_FINANCIAL['"]/.test(lookupCtrl));
check('VIEW_OPERATIONAL seed row', () => lookupCtrl && /code:\s*['"]VIEW_OPERATIONAL['"]/.test(lookupCtrl));

// 4. Service
console.log('\n[4/12] Backend service');
const cockpitSvc = readSafe(path.join(BACKEND, 'erp', 'services', 'cockpitService.js'));
check('cockpitService.js exists', () => cockpitSvc !== null);
check('exports getCockpit', () => cockpitSvc && /module\.exports\s*=\s*\{[\s\S]*getCockpit/.test(cockpitSvc));
check('uses Promise.allSettled (per-tile error containment)', () => cockpitSvc && /Promise\.allSettled/.test(cockpitSvc));
const tileFns = ['getCash', 'getArAgingRollup', 'getApAgingRollup', 'getPeriodCloseStatus', 'getApprovalSla', 'getAgentHealth', 'getMargin', 'getInventoryTurns', 'getPartnershipFunnel', 'getBirCalendar'];
tileFns.forEach((fn) => check(`tile getter ${fn}`, () => cockpitSvc && new RegExp(`async function ${fn}\\b|${fn}:\\s*\\(`).test(cockpitSvc)));

// 5. Controller
console.log('\n[5/12] Backend controller');
const cockpitCtrl = readSafe(path.join(BACKEND, 'erp', 'controllers', 'cockpitController.js'));
check('cockpitController.js exists', () => cockpitCtrl !== null);
check('exports getCockpitData', () => cockpitCtrl && /exports\.getCockpitData/.test(cockpitCtrl));
check('resolves VIEW_FINANCIAL / VIEW_OPERATIONAL via userHasCockpitRole', () =>
  cockpitCtrl && /userHasCockpitRole\(req, ['"]VIEW_FINANCIAL['"]\)/.test(cockpitCtrl) && /userHasCockpitRole\(req, ['"]VIEW_OPERATIONAL['"]\)/.test(cockpitCtrl));

// 6. Route
console.log('\n[6/12] Backend route');
const cockpitRoute = readSafe(path.join(BACKEND, 'erp', 'routes', 'cockpitRoutes.js'));
check('cockpitRoutes.js exists', () => cockpitRoute !== null);
check('applies requireCockpitRole(VIEW_COCKPIT) gate', () => cockpitRoute && /requireCockpitRole\(['"]VIEW_COCKPIT['"]\)/.test(cockpitRoute));

// 7. Routes barrel mount
console.log('\n[7/12] Routes barrel mount');
const routesIdx = readSafe(path.join(BACKEND, 'erp', 'routes', 'index.js'));
check("routes/index.js mounts '/cockpit'", () => routesIdx && /router\.use\(['"]\/cockpit['"]\s*,\s*require\(['"]\.\/cockpitRoutes['"]\)\)/.test(routesIdx));

// 8. Frontend page
console.log('\n[8/12] Frontend page');
const cockpitPage = readSafe(path.join(FRONTEND, 'src', 'erp', 'pages', 'ExecutiveCockpit.jsx'));
check('ExecutiveCockpit.jsx exists', () => cockpitPage !== null);
check('renders WorkflowGuide pageKey="cockpit"', () => cockpitPage && /<WorkflowGuide pageKey="cockpit"/.test(cockpitPage));
check('has Tier-1 + Tier-2 grouping', () => cockpitPage && /Tier 1/.test(cockpitPage) && /Tier 2/.test(cockpitPage));
check('handles per-tile error rendering', () => cockpitPage && /cp-error-tile/.test(cockpitPage));

// 9. Frontend hook
console.log('\n[9/12] Frontend hook');
const cockpitHook = readSafe(path.join(FRONTEND, 'src', 'erp', 'hooks', 'useCockpit.js'));
check('useCockpit.js exists', () => cockpitHook !== null);
check("hits api.get('/cockpit')", () => cockpitHook && /api\.get\(['"]\/cockpit['"]\)/.test(cockpitHook));

// 10. App.jsx route
console.log('\n[10/12] App.jsx route registration');
const appJsx = readSafe(path.join(FRONTEND, 'src', 'App.jsx'));
check('lazy import of ExecutiveCockpit', () => appJsx && /import\(['"]\.\/erp\/pages\/ExecutiveCockpit['"]\)/.test(appJsx));
check("Route path='/erp/cockpit' wired", () => appJsx && /path="\/erp\/cockpit"/.test(appJsx));
check('Route uses ROLE_SETS.MANAGEMENT', () => appJsx && /<Route path="\/erp\/cockpit"[\s\S]*ROLE_SETS\.MANAGEMENT/.test(appJsx));

// 11. Sidebar link
console.log('\n[11/12] Sidebar link');
const sidebar = readSafe(path.join(FRONTEND, 'src', 'components', 'common', 'Sidebar.jsx'));
check("Sidebar links '/erp/cockpit'", () => sidebar && /['"]\/erp\/cockpit['"]/.test(sidebar));
check("Sidebar gates with ROLE_SETS.MANAGEMENT", () => sidebar && /ROLE_SETS\.MANAGEMENT\.includes\(role\)[\s\S]{0,200}\/erp\/cockpit/.test(sidebar));

// 12. WorkflowGuide
console.log('\n[12/12] WorkflowGuide entry');
const wfg = readSafe(path.join(FRONTEND, 'src', 'erp', 'components', 'WorkflowGuide.jsx'));
check("WORKFLOW_GUIDES['cockpit']", () => wfg && /['"]cockpit['"]:\s*\{/.test(wfg));

// 13. Phase EC-1.1 — Persona taxonomy (CFO/CEO/COO tags on each tile).
// Forward-compat for SaaS Year-2 role-filtered views.
console.log('\n[13/13] Persona taxonomy (Phase EC-1.1)');
const tileCodes = ['cash', 'ar_aging', 'ap_aging', 'period_close', 'approval_sla', 'agent_health', 'margin', 'inventory_turns', 'partnership_funnel', 'bir_calendar'];
tileCodes.forEach((code) => {
  check(`cockpitService TILES row '${code}' has personas array`, () => {
    if (!cockpitSvc) return 'service file missing';
    // Match the tile row line plus the inline `personas:` field.
    const re = new RegExp(`code:\\s*['"]${code}['"][^\\n]*personas:\\s*\\[`);
    return re.test(cockpitSvc) || `personas not declared on row ${code}`;
  });
});
check('cockpit response includes personas in tile result', () =>
  cockpitSvc && /tiles\[tile\.code\]\s*=\s*\{[^}]*personas:\s*tile\.personas/.test(cockpitSvc));
check('SEED_DEFAULTS has EXECUTIVE_COCKPIT_TILE_PERSONAS', () =>
  lookupCtrl && /EXECUTIVE_COCKPIT_TILE_PERSONAS:\s*\[/.test(lookupCtrl));
tileCodes.forEach((code) => {
  const upper = code.toUpperCase();
  check(`SEED_DEFAULTS persona row '${upper}'`, () => {
    if (!lookupCtrl) return 'lookup controller missing';
    // Look for the row's code + a personas array inside metadata.
    const re = new RegExp(`code:\\s*['"]${upper}['"][^\\n]*personas:\\s*\\[`);
    return re.test(lookupCtrl) || `row ${upper} or personas missing`;
  });
});

console.log(`\n=== Result: ${issues === 0 ? '✓ ALL CLEAN' : `✗ ${issues} ISSUE(S) FOUND`} (${checked} checks) ===\n`);
process.exit(issues === 0 ? 0 : 1);
