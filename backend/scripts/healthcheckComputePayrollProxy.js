/**
 * Healthcheck: Phase G4.5cc Compute Payroll Proxy wiring (Apr 29 2026)
 *
 * Statically verifies the end-to-end contract for the clerk-run payroll
 * proxy: route gate → controller filter widening → gateApproval metadata →
 * cascade handler in universalApprovalController → MODULE_AUTO_POST hook
 * → frontend hook + button gating + WorkflowGuide step.
 *
 * Catches the same wiring-drift class that bit us on Apr 26 (silent
 * severance between backend resolver and frontend banner) and the
 * Apr 24 ghost-GRN class (handler exists but is never invoked).
 *
 * Usage:
 *   node backend/scripts/healthcheckComputePayrollProxy.js
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

// ── Sub-permission seed registered ──
const lookupCtrl = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'PAYROLL__RUN_PROXY sub-permission row registered in SEED_DEFAULTS',
  lookupCtrl && /code:\s*['"]PAYROLL__RUN_PROXY['"][^}]*key:\s*['"]run_proxy['"]/.test(lookupCtrl),
  "Add { code: 'PAYROLL__RUN_PROXY', label: '...', metadata: { module: 'payroll', key: 'run_proxy', sort_order: 6 } } to SEED_DEFAULTS.ERP_SUB_PERMISSION."
);

// ── MODULE_DEFAULT_ROLES.PAYROLL still present (Phase G4 layer) ──
check(
  'MODULE_DEFAULT_ROLES.PAYROLL row exists with admin/finance/president defaults',
  lookupCtrl && /code:\s*['"]PAYROLL['"][^}]*roles:\s*\[\s*['"]admin['"]\s*,\s*['"]finance['"]\s*,\s*['"]president['"]\s*\]/.test(lookupCtrl),
  "MODULE_DEFAULT_ROLES.PAYROLL must seed with metadata.roles = ['admin','finance','president'] so subscribers add 'staff' to onboard a clerk."
);

// ── Route gate ──
const payrollRoutes = readFile('backend/erp/routes/payrollRoutes.js');
check(
  'payrollRoutes.js declares payrollRunProxyGate function',
  payrollRoutes && /const\s+payrollRunProxyGate\s*=/.test(payrollRoutes),
  "Add the payrollRunProxyGate async middleware to payrollRoutes.js."
);
check(
  'payrollRunProxyGate checks privileged shortcut + run_proxy sub-perm',
  payrollRoutes
    && /req\.isAdmin\s*\|\|\s*req\.isFinance\s*\|\|\s*req\.isPresident/.test(payrollRoutes)
    && /sub_permissions\?\.payroll/.test(payrollRoutes)
    && /run_proxy/.test(payrollRoutes),
  'payrollRunProxyGate must short-circuit privileged callers and enforce sub_permissions.payroll.run_proxy. MODULE_DEFAULT_ROLES.PAYROLL is intentionally NOT in this gate — it is the AUTHORIZER list (who approves on the Hub), separate from the PROXY list (who can RUN the run). See payrollController.postPayroll for the forceApproval=true that guarantees Hub routing for non-privileged callers regardless of MODULE_DEFAULT_ROLES membership.'
);
check(
  'POST /compute uses payrollRunProxyGate (NOT roleCheck)',
  payrollRoutes
    && /router\.post\(\s*['"]\/compute['"]\s*,\s*payrollRunProxyGate\s*,\s*computePayroll/.test(payrollRoutes),
  "Change router.post('/compute', roleCheck(...)) to use payrollRunProxyGate instead."
);
check(
  'POST /post uses payrollRunProxyGate (NOT roleCheck)',
  payrollRoutes
    && /router\.post\(\s*['"]\/post['"]\s*,\s*payrollRunProxyGate\s*,\s*postPayroll/.test(payrollRoutes),
  "Change router.post('/post', roleCheck(...)) to use payrollRunProxyGate instead."
);
check(
  '/compute and /post no longer carry roleCheck literal',
  payrollRoutes
    && !/router\.post\(\s*['"]\/compute['"]\s*,\s*roleCheck/.test(payrollRoutes)
    && !/router\.post\(\s*['"]\/post['"]\s*,\s*roleCheck/.test(payrollRoutes),
  'Drop the legacy roleCheck() wrap on /compute and /post — payrollRunProxyGate is the new gate.'
);
check(
  'Per-line /:id/review and /:id/approve and /thirteenth-month KEEP roleCheck (statutory transitions)',
  payrollRoutes
    && /router\.post\(\s*['"]\/:id\/review['"]\s*,\s*roleCheck/.test(payrollRoutes)
    && /router\.post\(\s*['"]\/:id\/approve['"]\s*,\s*roleCheck/.test(payrollRoutes)
    && /router\.post\(\s*['"]\/thirteenth-month['"]\s*,\s*roleCheck/.test(payrollRoutes),
  'Per-payslip Review/Approve and 13th-month must remain admin-owned via roleCheck — clerks SUBMIT runs, admin OWNS line transitions.'
);

// ── Controller filter widening ──
const payrollCtrl = readFile('backend/erp/controllers/payrollController.js');
check(
  'postPayroll widens filter for non-privileged callers (COMPUTED|REVIEWED|APPROVED)',
  payrollCtrl
    && /isPrivileged\s*\?\s*['"]APPROVED['"]\s*:\s*\{\s*\$in:\s*\[\s*['"]COMPUTED['"]\s*,\s*['"]REVIEWED['"]\s*,\s*['"]APPROVED['"]\s*\]\s*\}/.test(payrollCtrl),
  'postPayroll must widen the candidate filter when the caller is non-privileged — gateApproval needs payslips to gate.'
);
check(
  'postPayroll threads run_period + run_cycle into gateApproval metadata',
  payrollCtrl
    && /run_period/.test(payrollCtrl)
    && /run_cycle/.test(payrollCtrl)
    && /metadata:\s*\{[\s\S]*run_period/.test(payrollCtrl),
  'postPayroll must pass metadata: { run_period, run_cycle, ... } to gateApproval so the cascade handler can re-resolve the run.'
);
check(
  'postPayroll passes forceApproval=true to gateApproval for non-privileged callers',
  payrollCtrl && /forceApproval:\s*!isPrivileged/.test(payrollCtrl),
  'Without forceApproval, adding staff to MODULE_DEFAULT_ROLES.PAYROLL would let clerks direct-post (gateApproval would treat them as authorized). forceApproval guarantees Hub routing.'
);
const universalSvc = readFile('backend/erp/services/universalApprovalService.js');
check(
  'MODULE_QUERIES.PAYROLL hides per-payslip rows when an active ApprovalRequest covers their run',
  universalSvc
    && /run-cover dedup/.test(universalSvc)
    && /coveredKeys\.has/.test(universalSvc),
  "Without the run-cover dedup, the Hub's existing doc_id dedup drops the run-level ApprovalRequest in favor of the per-payslip rows — admin sees per-line review/approve and never the single-tap run cascade. Update MODULE_QUERIES.PAYROLL.query to filter out payslips whose (period, cycle) is covered by a pending ApprovalRequest."
);

// ── Cascade handler + MODULE_AUTO_POST hook ──
const universalCtrl = readFile('backend/erp/controllers/universalApprovalController.js');
check(
  'MODULE_AUTO_POST.PAYROLL routes to payroll_run cascade',
  universalCtrl
    && /MODULE_AUTO_POST\s*=\s*\{[\s\S]*PAYROLL\s*:\s*\{\s*type:\s*['"]payroll_run['"]\s*,\s*action:\s*['"]post['"]\s*\}/.test(universalCtrl),
  "Add PAYROLL: { type: 'payroll_run', action: 'post' } to MODULE_AUTO_POST so admin's Hub approval dispatches to the cascade."
);
check(
  'TYPE_TO_MODULE map includes payroll_run → PAYROLL',
  universalCtrl
    && /payroll_run:\s*['"]PAYROLL['"]/.test(universalCtrl),
  "Add payroll_run: 'PAYROLL' to TYPE_TO_MODULE so sub-permission checks resolve when the type is dispatched directly."
);
check(
  'approvalHandlers.payroll_run handler defined',
  universalCtrl && /payroll_run:\s*async\s*\(\s*id\s*,\s*action\s*,\s*userId\s*,\s*reason\s*\)\s*=>/.test(universalCtrl),
  'Add a payroll_run async handler to approvalHandlers in universalApprovalController.js.'
);
check(
  'payroll_run handler imports transitionPayslipStatus + journal helpers',
  universalCtrl
    && /payroll_run[\s\S]*transitionPayslipStatus/.test(universalCtrl)
    && /payroll_run[\s\S]*journalFromPayroll/.test(universalCtrl)
    && /payroll_run[\s\S]*createAndPostJournal/.test(universalCtrl),
  'Cascade handler must drive the same state machine + JE emit pipeline as direct postPayroll.'
);
check(
  'payroll_run handler walks COMPUTED → REVIEWED → APPROVED → POSTED',
  universalCtrl
    && /payroll_run[\s\S]*COMPUTED[\s\S]*REVIEWED[\s\S]*APPROVED/.test(universalCtrl),
  'Cascade handler must transition each candidate through every state, not skip steps.'
);
check(
  'payroll_run handler queries siblings by entity_id + period + cycle',
  universalCtrl
    && /payroll_run[\s\S]*entity_id[\s\S]*period[\s\S]*cycle[\s\S]*COMPUTED.*REVIEWED.*APPROVED/.test(universalCtrl),
  "Cascade handler must re-resolve all siblings: { entity_id, period, cycle, status: { $in: ['COMPUTED','REVIEWED','APPROVED'] } }."
);
check(
  'payroll_run handler period-locks before mutating',
  universalCtrl && /payroll_run[\s\S]*checkPeriodOpen/.test(universalCtrl),
  'Cascade handler must call checkPeriodOpen before transitions — protects against post-close approval drift.'
);

// ── Frontend hook + button + banner ──
const usePayroll = readFile('frontend/src/erp/hooks/usePayroll.js');
check(
  'usePayroll exposes canRunPayroll / hasRunProxy / isPrivileged',
  usePayroll
    && /canRunPayroll/.test(usePayroll)
    && /hasRunProxy/.test(usePayroll)
    && /isPrivileged/.test(usePayroll),
  'usePayroll must export canRunPayroll, hasRunProxy, isPrivileged for PayrollRun.jsx button gating.'
);
check(
  'usePayroll derives hasRunProxy from sub_permissions.payroll.run_proxy',
  usePayroll && /sub_permissions\?\.payroll\?\.run_proxy/.test(usePayroll),
  'hasRunProxy must read from user.erp_access.sub_permissions.payroll.run_proxy.'
);

const payrollRun = readFile('frontend/src/erp/pages/PayrollRun.jsx');
check(
  'PayrollRun.jsx gates Compute + Post on canRunPayroll',
  payrollRun
    && /canRunPayroll\s*&&[\s\S]*Compute Payroll/.test(payrollRun)
    && /canRunPayroll\s*&&[\s\S]*handlePostAll/.test(payrollRun),
  'Compute + Post buttons must show when canRunPayroll is true (privileged OR run_proxy clerk).'
);
check(
  'PayrollRun.jsx renames Post button to "Submit Run for Approval" for non-privileged',
  payrollRun && /Submit Run for Approval/.test(payrollRun),
  'Non-privileged label clarifies that the action goes through the Approval Hub.'
);
check(
  'PayrollRun.jsx renders G4.5cc purple banner for run_proxy clerks',
  payrollRun
    && /hasRunProxy\s*&&\s*!isPrivileged/.test(payrollRun)
    && /Payroll Run Proxy/.test(payrollRun),
  'Add purple banner above the period bar explaining the clerk authority chain.'
);
check(
  'PayrollRun.jsx surfaces 202 approval_pending via showApprovalPending',
  payrollRun && /approval_pending[\s\S]*showApprovalPending/.test(payrollRun),
  'handlePostAll must check res?.approval_pending and call showApprovalPending(message) — clerk needs a clear toast.'
);

// ── WorkflowGuide step ──
const workflowGuide = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  "WorkflowGuide payroll-run includes G4.5cc step about run_proxy",
  workflowGuide
    && /'payroll-run'/.test(workflowGuide)
    && /G4\.5cc/.test(workflowGuide)
    && /run_proxy/.test(workflowGuide)
    && /MODULE_DEFAULT_ROLES\.PAYROLL/.test(workflowGuide),
  'Add a step to WORKFLOW_GUIDES["payroll-run"] explaining the clerk-run authority chain + lookup-driven authority.'
);

// ── Docs ──
const claudeErp = readFile('CLAUDE-ERP.md');
check(
  'CLAUDE-ERP.md mentions Phase G4.5cc',
  claudeErp && /G4\.5cc/.test(claudeErp),
  'Add a Phase G4.5cc paragraph to CLAUDE-ERP.md.'
);
const phaseTask = readFile('docs/PHASETASK-ERP.md');
check(
  'PHASETASK-ERP.md mentions Phase G4.5cc',
  phaseTask && /G4\.5cc/.test(phaseTask),
  'Append §G4.5cc to docs/PHASETASK-ERP.md.'
);
const runbook = readFile('docs/RUNBOOK.md');
check(
  'RUNBOOK.md SECTION 11 mentions run_proxy',
  runbook && /run_proxy/.test(runbook),
  'Extend docs/RUNBOOK.md SECTION 11 with the operational quickstart for granting payroll.run_proxy + widening MODULE_DEFAULT_ROLES.PAYROLL.'
);

// ── Summary ──
const passed = checks.filter(c => c.ok).length;
const failed = checks.filter(c => !c.ok);

console.log('Phase G4.5cc Compute Payroll Proxy — Healthcheck');
console.log('═'.repeat(60));
checks.forEach((c, i) => {
  const mark = c.ok ? '✓' : '✗';
  console.log(`${mark} ${String(i + 1).padStart(2)}. ${c.label}`);
  if (!c.ok && c.hint) {
    console.log(`     hint: ${c.hint}`);
  }
});
console.log('═'.repeat(60));
console.log(`${passed}/${checks.length} checks passed${failed.length ? `, ${failed.length} failed` : ''}.`);

process.exit(failed.length ? 1 : 0);
