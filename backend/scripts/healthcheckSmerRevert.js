/**
 * Healthcheck: SMER Revert (VALID → DRAFT) wiring — Apr 2026
 *
 * Statically verifies the wiring contract for the "Revert to DRAFT" action
 * that lets a BDM (or proxy) re-edit a SMER that has already been validated.
 *
 * Catches the wiring drift class from earlier phases: a frontend button with
 * no backend acceptance, a route mounted without period-lock, an audit log
 * with an enum value the model rejects, or a hook export the page doesn't
 * destructure.
 *
 * Usage:
 *   node backend/scripts/healthcheckSmerRevert.js
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

// ── 1. Backend controller: revertSmer exists and is correct ──
const ctrl = readFile('backend/erp/controllers/expenseController.js');
check(
  'expenseController defines revertSmer',
  ctrl && /const\s+revertSmer\s*=\s*catchAsync\(/.test(ctrl),
  'Add `const revertSmer = catchAsync(async (req, res) => { ... })` to expenseController.js.'
);
check(
  'revertSmer uses widenFilterForProxy with SMER_PROXY_OPTS',
  ctrl && /revertSmer[\s\S]{0,400}widenFilterForProxy\(req,\s*'expenses',\s*SMER_PROXY_OPTS\)/.test(ctrl),
  'revertSmer must scope via widenFilterForProxy so eligible proxies can revert on behalf.'
);
check(
  'revertSmer requires status: VALID (cannot revert DRAFT/ERROR/POSTED)',
  ctrl && /revertSmer[\s\S]{0,500}status:\s*'VALID'/.test(ctrl),
  'Filter must include status: VALID. POSTED uses reopenSmer; DRAFT/ERROR are already editable.'
);
check(
  'revertSmer flips status to DRAFT',
  ctrl && /revertSmer[\s\S]{0,800}smer\.status\s*=\s*'DRAFT'/.test(ctrl),
  'Set smer.status = DRAFT after the find succeeds.'
);
check(
  'revertSmer clears validation_errors snapshot',
  ctrl && /revertSmer[\s\S]{0,800}smer\.validation_errors\s*=\s*\[\]/.test(ctrl),
  'Clear validation_errors so the stale VALID snapshot does not bleed into the next validate pass.'
);
check(
  'revertSmer writes ErpAuditLog STATUS_CHANGE entry',
  ctrl && /revertSmer[\s\S]{0,1200}ErpAuditLog\.logChange[\s\S]{0,400}log_type:\s*'STATUS_CHANGE'/.test(ctrl),
  'Audit-log STATUS_CHANGE so the demotion is traceable (especially proxy reverts).'
);
check(
  'revertSmer audit captures old_value/new_value',
  ctrl && /revertSmer[\s\S]{0,1500}old_value:\s*oldStatus[\s\S]{0,200}new_value:\s*'DRAFT'/.test(ctrl),
  'Capture old/new status in the audit row so the ledger shows the transition cleanly.'
);
check(
  'revertSmer is exported from expenseController',
  ctrl && /module\.exports\s*=\s*\{[\s\S]*revertSmer[\s\S]*\}/.test(ctrl),
  'Add revertSmer to the module.exports block.'
);

// ── 2. Backend route: POST /smer/:id/revert with periodLockCheck ──
const routes = readFile('backend/erp/routes/expenseRoutes.js');
check(
  'expenseRoutes imports revertSmer from controller',
  routes && /require\('\.\.\/controllers\/expenseController'\)[\s\S]{0,2000}revertSmer/.test(routes),
  'Add revertSmer to the destructured import from ../controllers/expenseController.'
);
check(
  'expenseRoutes mounts POST /smer/:id/revert with periodLockCheck(EXPENSE)',
  routes && /router\.post\(\s*'\/smer\/:id\/revert'\s*,\s*periodLockCheck\('EXPENSE'\)\s*,\s*revertSmer\s*\)/.test(routes),
  'Mount the revert route with periodLockCheck so it cannot mutate within a closed period.'
);

// ── 3. Frontend hook: revertSmer exposed by useExpenses ──
const hook = readFile('frontend/src/erp/hooks/useExpenses.js');
check(
  'useExpenses defines revertSmer service method',
  hook && /const\s+revertSmer\s*=\s*\(id\)\s*=>\s*api\.post\(`\/expenses\/smer\/\$\{id\}\/revert`\)/.test(hook),
  'Add `const revertSmer = (id) => api.post(`/expenses/smer/${id}/revert`);` to useExpenses.'
);
check(
  'useExpenses returns revertSmer in the export',
  hook && /return\s*\{[\s\S]*revertSmer[\s\S]*\}/.test(hook),
  'Include revertSmer in the hook return object so pages can destructure it.'
);

// ── 4. Frontend page: handler + button + destructure ──
const page = readFile('frontend/src/erp/pages/Smer.jsx');
check(
  'Smer page destructures revertSmer from useExpenses',
  page && /useExpenses\(\)[\s\S]{0,400}revertSmer/.test(page) || /\{\s*[^}]*revertSmer[^}]*\}\s*=\s*useExpenses\(\)/.test(page),
  'Add revertSmer to the useExpenses() destructure on Smer.jsx.'
);
check(
  'Smer page defines handleRevert handler',
  page && /const\s+handleRevert\s*=\s*async\s*\(id\)\s*=>/.test(page),
  'Add a handleRevert(id) async handler that calls revertSmer(id) and reloads.'
);
check(
  'handleRevert respects canWrite gate (prevents read-only callers)',
  page && /handleRevert[\s\S]{0,200}!canWrite/.test(page),
  'Mirror handleDelete: refuse if canWrite is false (proxy must own write authority).'
);
check(
  'handleRevert confirms before mutating (irreversible state demotion)',
  page && /handleRevert[\s\S]{0,400}window\.confirm\(/.test(page),
  'Confirm prompt prevents accidental clicks that wipe the validation snapshot.'
);
check(
  'Revert button rendered when status === VALID',
  page && /s\.status\s*===\s*'VALID'[\s\S]{0,400}handleRevert\(s\._id\)/.test(page),
  'Render a Revert button in the Actions column gated to status === VALID rows only.'
);

// ── 5. ErpAuditLog enum accepts STATUS_CHANGE (silent-swallow guard) ──
const auditModel = readFile('backend/erp/models/ErpAuditLog.js');
check(
  'ErpAuditLog enum accepts STATUS_CHANGE log_type',
  auditModel && /enum:\s*\[[^\]]*'STATUS_CHANGE'/.test(auditModel),
  'STATUS_CHANGE must be in the log_type enum or audit writes silent-fail under .catch(() => {}).'
);

// ── Output ──
let failed = 0;
console.log('\nSMER Revert (VALID → DRAFT) wiring healthcheck');
console.log('===============================================');
checks.forEach((c, i) => {
  const status = c.ok ? '✓' : '✗';
  const line = `${String(i + 1).padStart(2, ' ')}. ${status}  ${c.label}`;
  console.log(line);
  if (!c.ok) {
    failed += 1;
    if (c.hint) console.log(`     hint: ${c.hint}`);
  }
});
console.log('-----------------------------------------------');
console.log(`${checks.length - failed} / ${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
