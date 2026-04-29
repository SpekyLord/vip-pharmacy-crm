/**
 * Healthcheck: Phase G4.5bb Payslip Person-ID Proxy Roster wiring (Apr 29 2026)
 *
 * Statically verifies the end-to-end contract for the per-clerk payslip
 * deduction-write roster. Catches the same wiring-drift class that bit us on
 * Apr 26 (silent severance between backend resolver and frontend banner).
 *
 * Usage:
 *   node backend/scripts/healthcheckPayslipProxyRoster.js
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

// ── Resolver helper exists + exports the contract ──
const resolver = readFile('backend/erp/utils/resolvePayslipProxy.js');
check(
  'resolvePayslipProxy.js exists',
  !!resolver,
  'Create backend/erp/utils/resolvePayslipProxy.js with the canWritePayslipDeduction + buildRosterFilterFragment helpers.'
);
check(
  'resolvePayslipProxy.js exports canWritePayslipDeduction',
  resolver && /module\.exports\s*=\s*\{[\s\S]*canWritePayslipDeduction/.test(resolver),
  "Export canWritePayslipDeduction from resolvePayslipProxy.js."
);
check(
  'resolvePayslipProxy.js exports buildRosterFilterFragment',
  resolver && /module\.exports\s*=\s*\{[\s\S]*buildRosterFilterFragment/.test(resolver),
  "Export buildRosterFilterFragment from resolvePayslipProxy.js (used by getPayrollStaging)."
);
check(
  'resolvePayslipProxy.js exports getEffectiveRoster',
  resolver && /module\.exports\s*=\s*\{[\s\S]*getEffectiveRoster/.test(resolver),
  "Export getEffectiveRoster (used by getMyPayslipProxyRoster controller)."
);
check(
  'resolvePayslipProxy.js exports invalidatePayslipRosterCache',
  resolver && /module\.exports\s*=\s*\{[\s\S]*invalidatePayslipRosterCache/.test(resolver),
  "Export invalidatePayslipRosterCache for lookup hot-reload integration."
);
check(
  'resolvePayslipProxy.js implements scope_mode ALL / PERSON_IDS / PERSON_TYPES branches',
  resolver
    && /scope_mode\s*===\s*['"]ALL['"]/.test(resolver)
    && /scope_mode\s*===\s*['"]PERSON_IDS['"]/.test(resolver)
    && /scope_mode\s*===\s*['"]PERSON_TYPES['"]/.test(resolver),
  'Helper must handle all three scope_mode branches with the spelling ALL / PERSON_IDS / PERSON_TYPES.'
);

// ── Lookup category seed + cache hooks ──
const lookupCtrl = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'lookupGenericController imports invalidatePayslipRosterCache',
  lookupCtrl && /require\('\.\.\/utils\/resolvePayslipProxy'\)/.test(lookupCtrl)
            && /invalidatePayslipRosterCache/.test(lookupCtrl),
  "Add: const { invalidatePayslipRosterCache } = require('../utils/resolvePayslipProxy');"
);
check(
  'lookupGenericController defines PAYSLIP_PROXY_ROSTER_CATEGORIES set',
  lookupCtrl && /PAYSLIP_PROXY_ROSTER_CATEGORIES\s*=\s*new Set\(\['PAYSLIP_PROXY_ROSTER'\]\)/.test(lookupCtrl),
  "Add: const PAYSLIP_PROXY_ROSTER_CATEGORIES = new Set(['PAYSLIP_PROXY_ROSTER']);"
);
check(
  'PAYSLIP_PROXY_ROSTER seeded as empty array in SEED_DEFAULTS',
  lookupCtrl && /PAYSLIP_PROXY_ROSTER:\s*\[\]/.test(lookupCtrl),
  "Add PAYSLIP_PROXY_ROSTER: [] to SEED_DEFAULTS — admin creates rows on demand (one per clerk)."
);
check(
  'lookupGenericController busts PAYSLIP_PROXY_ROSTER cache in create handler',
  lookupCtrl && /PAYSLIP_PROXY_ROSTER_CATEGORIES\.has\(cat\)\s*\)\s*invalidatePayslipRosterCache\(req\.entityId,\s*item\.code\)/.test(lookupCtrl),
  'Add invalidatePayslipRosterCache call inside the create handler for PAYSLIP_PROXY_ROSTER changes.'
);
check(
  'lookupGenericController busts PAYSLIP_PROXY_ROSTER cache in update handler',
  lookupCtrl && (lookupCtrl.match(/PAYSLIP_PROXY_ROSTER_CATEGORIES\.has\(item\.category\)\)\s*invalidatePayslipRosterCache\(item\.entity_id,\s*item\.code\)/g) || []).length >= 2,
  'Add invalidatePayslipRosterCache calls inside the update + remove handlers (item.category + item.entity_id + item.code).'
);
check(
  'lookupGenericController busts PAYSLIP_PROXY_ROSTER cache in seedAll',
  lookupCtrl && /invalidatePayslipRosterCache\(req\.entityId\)/.test(lookupCtrl),
  'Add invalidatePayslipRosterCache(req.entityId) inside the seedAll handler.'
);

// ── Routes: payrollRoutes ──
const routes = readFile('backend/erp/routes/payrollRoutes.js');
check(
  'payrollRoutes imports canWritePayslipDeduction from resolver',
  routes && /require\('\.\.\/utils\/resolvePayslipProxy'\)/.test(routes)
        && /canWritePayslipDeduction/.test(routes),
  "Add: const { canWritePayslipDeduction, getEffectiveRoster } = require('../utils/resolvePayslipProxy');"
);
check(
  'payrollRoutes payslipDeductionWriteGate is async (uses await for roster check)',
  routes && /const\s+payslipDeductionWriteGate\s*=\s*async/.test(routes),
  'payslipDeductionWriteGate must be async so it can await canWritePayslipDeduction(req, peek).'
);
check(
  'payrollRoutes gate calls canWritePayslipDeduction',
  routes && /canWritePayslipDeduction\(req,\s*peek\)/.test(routes),
  'Inside payslipDeductionWriteGate, peek payslip then call canWritePayslipDeduction(req, peek).'
);
check(
  'payrollRoutes registers GET /proxy-roster/me BEFORE /:id',
  routes
    && /router\.get\(['"]\/proxy-roster\/me['"]/.test(routes)
    && routes.indexOf("router.get('/proxy-roster/me'") < routes.indexOf("router.get('/:id'"),
  'GET /proxy-roster/me must precede GET /:id so Express resolves the literal first.'
);
check(
  'payrollRoutes still gates the 3 deduction-line routes via payslipDeductionWriteGate',
  routes
    && /router\.post\(['"]\/:id\/deduction-line['"][\s\S]{0,80}payslipDeductionWriteGate/.test(routes)
    && /router\.post\(['"]\/:id\/deduction-line\/:lineId\/verify['"][\s\S]{0,80}payslipDeductionWriteGate/.test(routes)
    && /router\.delete\(['"]\/:id\/deduction-line\/:lineId['"][\s\S]{0,80}payslipDeductionWriteGate/.test(routes),
  'All three deduction-line routes (POST /:id/deduction-line, POST /:id/deduction-line/:lineId/verify, DELETE /:id/deduction-line/:lineId) must still pass through payslipDeductionWriteGate.'
);

// ── Controller: payrollController ──
const controller = readFile('backend/erp/controllers/payrollController.js');
check(
  'payrollController imports buildRosterFilterFragment + getEffectiveRoster',
  controller && /require\('\.\.\/utils\/resolvePayslipProxy'\)/.test(controller)
            && /buildRosterFilterFragment/.test(controller)
            && /getEffectiveRoster/.test(controller),
  "Add: const { buildRosterFilterFragment, getEffectiveRoster } = require('../utils/resolvePayslipProxy');"
);
check(
  'payrollController.getPayrollStaging calls buildRosterFilterFragment',
  controller && /getPayrollStaging[\s\S]{0,2500}buildRosterFilterFragment\(req\)/.test(controller),
  'getPayrollStaging must merge buildRosterFilterFragment(req) into the query (PERSON_IDS branch) and post-filter for PERSON_TYPES.'
);
check(
  'payrollController.getPayrollStaging post-filters person_types when sentinel returned',
  controller && /__scope_mode:\s*'PERSON_TYPES'/.test(resolver)
            && /postFilterPersonTypes/.test(controller),
  'Resolver returns __scope_mode + __person_types sentinel for PERSON_TYPES so the controller can post-filter populated person_id.person_type.'
);
check(
  'payrollController defines getMyPayslipProxyRoster',
  controller && /const\s+getMyPayslipProxyRoster\s*=\s*catchAsync/.test(controller),
  'Add getMyPayslipProxyRoster catchAsync controller — calls getEffectiveRoster(req) and hydrates people for PERSON_IDS scope.'
);
check(
  'payrollController exports getMyPayslipProxyRoster',
  controller && /module\.exports\s*=\s*\{[\s\S]*getMyPayslipProxyRoster/.test(controller),
  'Export getMyPayslipProxyRoster from payrollController.js.'
);

// ── Frontend: usePayroll hook ──
const hook = readFile('frontend/src/erp/hooks/usePayroll.js');
check(
  'usePayroll exposes getMyPayslipProxyRoster',
  hook && /getMyPayslipProxyRoster\s*=\s*\(\)\s*=>\s*api\.get\(['"]\/payroll\/proxy-roster\/me['"]\)/.test(hook),
  "Add: const getMyPayslipProxyRoster = () => api.get('/payroll/proxy-roster/me');"
);

// ── Frontend: PayrollRun chip ──
const payrollRun = readFile('frontend/src/erp/pages/PayrollRun.jsx');
check(
  'PayrollRun fetches roster on mount',
  payrollRun && /api\.getMyPayslipProxyRoster\(\)/.test(payrollRun),
  'PayrollRun must call api.getMyPayslipProxyRoster() in a useEffect on mount.'
);
check(
  'PayrollRun renders the roster chip when scope_mode is restrictive',
  payrollRun && /showRosterChip[\s\S]{0,1500}Payslip Proxy Roster/.test(payrollRun),
  'Render an info chip with header "Payslip Proxy Roster:" when scope_mode is PERSON_IDS or PERSON_TYPES.'
);

// ── Frontend: PayslipView read-only banner ──
const payslipView = readFile('frontend/src/erp/pages/PayslipView.jsx');
check(
  'PayslipView fetches roster',
  payslipView && /api\.getMyPayslipProxyRoster\(\)/.test(payslipView),
  'PayslipView must call api.getMyPayslipProxyRoster() in a useEffect on mount.'
);
check(
  'PayslipView computes blockedByRoster',
  payslipView && /const\s+blockedByRoster\s*=/.test(payslipView),
  'Compute blockedByRoster: !isFinance && hasSubPerm && rosterAllowsThisPayslip === false && payslip is COMPUTED|REVIEWED.'
);
check(
  'PayslipView renders the read-only banner',
  payslipView && /blockedByRoster[\s\S]{0,1500}Read-only[\s\S]{0,30}not on your payslip-proxy roster/.test(payslipView),
  'When blockedByRoster, render a yellow banner explaining the gating + how admin fixes it.'
);
check(
  'PayslipView canEdit honors hasSubPerm + roster',
  payslipView && /canEdit\s*=[\s\S]{0,400}hasSubPerm[\s\S]{0,200}rosterAllowsThisPayslip\s*!==\s*false/.test(payslipView),
  'canEdit must include the staff-with-sub-perm + roster-allows path so non-Finance clerks can use the action buttons when on roster.'
);

// ── Frontend: WorkflowGuide steps ──
const wfg = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  "WorkflowGuide payroll-run banner mentions Phase G4.5bb",
  wfg && /'payroll-run':[\s\S]{0,3000}G4\.5bb/.test(wfg),
  'Add a step to the payroll-run banner explaining the per-clerk PAYSLIP_PROXY_ROSTER.'
);
check(
  "WorkflowGuide payslip-view banner mentions Phase G4.5bb",
  wfg && /'payslip-view':[\s\S]{0,3000}G4\.5bb/.test(wfg),
  'Add a step to the payslip-view banner explaining the read-only banner / roster.'
);

// ── Run + report ──
let failed = 0;
for (const c of checks) {
  if (c.ok) {
    console.log(`  ok   ${c.label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${c.label}`);
    if (c.hint) console.log(`       hint: ${c.hint}`);
  }
}
console.log(`\n${checks.length - failed} / ${checks.length} checks passed.`);
process.exit(failed === 0 ? 0 : 1);
