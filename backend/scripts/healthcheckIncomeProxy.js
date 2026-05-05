/**
 * Healthcheck: Phase G4.5aa Income & Deduction Schedule Proxy wiring (Apr 29 2026)
 *
 * Statically verifies the end-to-end contract for the new BDM income / deduction
 * schedule proxy entry, plus the payslip deduction sub-permission gate. Catches
 * the same wiring-drift class that bit us on Apr 26 (silent severance between
 * backend resolver and frontend OwnerPicker).
 *
 * Usage:
 *   node backend/scripts/healthcheckIncomeProxy.js
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
  'PAYROLL__INCOME_PROXY sub-perm seeded',
  lookupCtrl && /code:\s*'PAYROLL__INCOME_PROXY'/.test(lookupCtrl),
  "Add { code: 'PAYROLL__INCOME_PROXY', ... } with metadata.module='payroll', metadata.key='income_proxy'."
);
check(
  'PAYROLL__DEDUCTION_SCHEDULE_PROXY sub-perm seeded',
  lookupCtrl && /code:\s*'PAYROLL__DEDUCTION_SCHEDULE_PROXY'/.test(lookupCtrl),
  "Add { code: 'PAYROLL__DEDUCTION_SCHEDULE_PROXY', ... } with metadata.module='payroll', metadata.key='deduction_schedule_proxy'."
);
check(
  'PAYROLL__PAYSLIP_DEDUCTION_WRITE sub-perm seeded',
  lookupCtrl && /code:\s*'PAYROLL__PAYSLIP_DEDUCTION_WRITE'/.test(lookupCtrl),
  "Add { code: 'PAYROLL__PAYSLIP_DEDUCTION_WRITE', ... } with metadata.module='payroll', metadata.key='payslip_deduction_write'."
);
check(
  "PROXY_ENTRY_ROLES.INCOME row seeded with insert_only_metadata",
  lookupCtrl && /code:\s*'INCOME'[^}]*insert_only_metadata:\s*true/.test(lookupCtrl),
  "Add { code: 'INCOME', insert_only_metadata: true, metadata: { roles: [...] } } to PROXY_ENTRY_ROLES."
);
check(
  "PROXY_ENTRY_ROLES.DEDUCTION_SCHEDULE row seeded with insert_only_metadata",
  lookupCtrl && /code:\s*'DEDUCTION_SCHEDULE'[^}]*insert_only_metadata:\s*true/.test(lookupCtrl),
  "Add { code: 'DEDUCTION_SCHEDULE', insert_only_metadata: true, metadata: { roles: [...] } } to PROXY_ENTRY_ROLES."
);

// ── Backend: incomeController ──
const incomeCtrl = readFile('backend/erp/controllers/incomeController.js');
check(
  'incomeController.js imports resolveOwnerForWrite + widenFilterForProxy + canProxyEntry',
  incomeCtrl && /require\('\.\.\/utils\/resolveOwnerScope'\)/.test(incomeCtrl)
            && /resolveOwnerForWrite/.test(incomeCtrl)
            && /widenFilterForProxy/.test(incomeCtrl)
            && /canProxyEntry/.test(incomeCtrl),
  "Add: const { resolveOwnerForWrite, widenFilterForProxy, canProxyEntry } = require('../utils/resolveOwnerScope');"
);
check(
  'incomeController defines INCOME_PROXY_OPTS with subKey + lookupCode',
  incomeCtrl && /INCOME_PROXY_OPTS\s*=\s*\{[^}]*subKey:\s*'income_proxy'[^}]*lookupCode:\s*'INCOME'/.test(incomeCtrl),
  "Add: const INCOME_PROXY_OPTS = { subKey: 'income_proxy', lookupCode: 'INCOME' };"
);
check(
  'incomeController.requestIncomeGeneration calls resolveOwnerForWrite',
  incomeCtrl && /requestIncomeGeneration[\s\S]{0,800}resolveOwnerForWrite\(req,\s*'payroll',\s*INCOME_PROXY_OPTS\)/.test(incomeCtrl),
  'requestIncomeGeneration must wrap resolveOwnerForWrite for proxy gating.'
);
check(
  'incomeController.addDeductionLine widens filter for proxy',
  incomeCtrl && /addDeductionLine[\s\S]{0,1000}widenFilterForProxy\(req,\s*'payroll',\s*INCOME_PROXY_OPTS\)/.test(incomeCtrl),
  'addDeductionLine must call widenFilterForProxy so eligible proxy can target other BDMs.'
);
check(
  'incomeController.removeDeductionLine widens filter for proxy',
  incomeCtrl && /removeDeductionLine[\s\S]{0,1000}widenFilterForProxy\(req,\s*'payroll',\s*INCOME_PROXY_OPTS\)/.test(incomeCtrl),
  'removeDeductionLine must call widenFilterForProxy.'
);
check(
  'incomeController.getIncomeList consults canProxyEntry for filter widening',
  incomeCtrl && /getIncomeList[\s\S]{0,800}canProxyEntry\(req,\s*'payroll',\s*INCOME_PROXY_OPTS\)/.test(incomeCtrl),
  'getIncomeList must check canProxyEntry to decide whether to drop bdm_id from filter.'
);
check(
  'incomeController.getIncomeBreakdown allows proxy to view target BDM breakdown',
  incomeCtrl && /getIncomeBreakdown[\s\S]{0,1600}canProxyEntry\(req,\s*'payroll',\s*INCOME_PROXY_OPTS\)/.test(incomeCtrl),
  'getIncomeBreakdown must consult canProxyEntry before 403-ing on cross-BDM read.'
);
check(
  'incomeController.getIncomeProjection honors ?bdm_id for proxy callers',
  // Without this, a staff proxy who picks a target BDM in OwnerPicker silently
  // falls through to req.bdmId (their own id) and the projection card renders
  // the proxy's own data — exactly the bug the user filed May 5 2026.
  incomeCtrl && /getIncomeProjection\s*=[\s\S]{0,2000}canProxyEntry\(req,\s*'payroll',\s*INCOME_PROXY_OPTS\)/.test(incomeCtrl),
  'getIncomeProjection must consult canProxyEntry so non-privileged proxies can view target BDM projection.'
);

// ── Backend: incomeCalc service ──
const incomeCalc = readFile('backend/erp/services/incomeCalc.js');
check(
  'projectIncome filters schedules by target_cycle (parity with generateIncomeReport)',
  // Without this, a one-time deduction created with target_cycle=C2 leaks into
  // the C1 projection of the same period — the BDM sees the deduction in BOTH
  // cycles even though generation correctly skips the wrong cycle.
  incomeCalc && /async function projectIncome[\s\S]{0,8000}status:\s*'ACTIVE',[\s\S]{0,800}target_cycle:\s*cycle[\s\S]{0,300}target_cycle:\s*\{\s*\$exists:\s*false\s*\}/.test(incomeCalc),
  'projectIncome schedule query must $or [{ target_cycle: cycle }, { target_cycle: { $exists: false } }] so non-installments do not appear in the wrong cycle projection.'
);

// ── Backend: deductionScheduleController ──
const dedCtrl = readFile('backend/erp/controllers/deductionScheduleController.js');
check(
  'deductionScheduleController imports resolveOwnerScope helpers',
  dedCtrl && /require\('\.\.\/utils\/resolveOwnerScope'\)/.test(dedCtrl)
          && /resolveOwnerForWrite/.test(dedCtrl)
          && /canProxyEntry/.test(dedCtrl),
  "Add: const { resolveOwnerForWrite, canProxyEntry } = require('../utils/resolveOwnerScope');"
);
check(
  'deductionScheduleController defines DEDUCTION_PROXY_OPTS',
  dedCtrl && /DEDUCTION_PROXY_OPTS\s*=\s*\{[^}]*subKey:\s*'deduction_schedule_proxy'[^}]*lookupCode:\s*'DEDUCTION_SCHEDULE'/.test(dedCtrl),
  "Add: const DEDUCTION_PROXY_OPTS = { subKey: 'deduction_schedule_proxy', lookupCode: 'DEDUCTION_SCHEDULE' };"
);
check(
  'deductionScheduleController.createSchedule calls resolveOwnerForWrite',
  dedCtrl && /createSchedule[\s\S]{0,1000}resolveOwnerForWrite\(req,\s*'payroll',\s*DEDUCTION_PROXY_OPTS\)/.test(dedCtrl),
  'createSchedule must wrap resolveOwnerForWrite for proxy gating.'
);
check(
  'deductionScheduleController.getMySchedules consults canProxyEntry',
  dedCtrl && /getMySchedules[\s\S]{0,500}canProxyEntry\(req,\s*'payroll',\s*DEDUCTION_PROXY_OPTS\)/.test(dedCtrl),
  'getMySchedules must drop bdm_id from filter when caller is proxy.'
);
check(
  'deductionScheduleController.withdrawSchedule peeks bdm_id for proxy',
  dedCtrl && /withdrawSchedule[\s\S]{0,500}canProxyEntry\(req,\s*'payroll',\s*DEDUCTION_PROXY_OPTS\)/.test(dedCtrl),
  'withdrawSchedule must peek schedule.bdm_id for proxy callers so service ownership check passes.'
);
check(
  'deductionScheduleController.editPendingSchedule peeks bdm_id for proxy',
  dedCtrl && /editPendingSchedule[\s\S]{0,500}canProxyEntry\(req,\s*'payroll',\s*DEDUCTION_PROXY_OPTS\)/.test(dedCtrl),
  'editPendingSchedule must peek schedule.bdm_id for proxy callers so service ownership check passes.'
);

// ── Backend: payrollRoutes ──
const payrollRoutes = readFile('backend/erp/routes/payrollRoutes.js');
check(
  'payrollRoutes defines payslipDeductionWriteGate middleware',
  payrollRoutes && /const\s+payslipDeductionWriteGate\s*=/.test(payrollRoutes),
  'Define payslipDeductionWriteGate inline (allows admin/finance/president OR payroll.payslip_deduction_write sub-perm).'
);
check(
  'payrollRoutes payslipDeductionWriteGate gates POST /:id/deduction-line',
  payrollRoutes && /router\.post\(['"]\/:id\/deduction-line['"]\s*,\s*payslipDeductionWriteGate\s*,\s*financeAddDeductionLine/.test(payrollRoutes),
  'Replace roleCheck on POST /:id/deduction-line with payslipDeductionWriteGate.'
);
check(
  'payrollRoutes payslipDeductionWriteGate gates POST /:id/deduction-line/:lineId/verify',
  payrollRoutes && /router\.post\(['"]\/:id\/deduction-line\/:lineId\/verify['"]\s*,\s*payslipDeductionWriteGate\s*,\s*verifyDeductionLine/.test(payrollRoutes),
  'Replace roleCheck on POST /:id/deduction-line/:lineId/verify with payslipDeductionWriteGate.'
);
check(
  'payrollRoutes payslipDeductionWriteGate gates DELETE /:id/deduction-line/:lineId',
  payrollRoutes && /router\.delete\(['"]\/:id\/deduction-line\/:lineId['"]\s*,\s*payslipDeductionWriteGate\s*,\s*removeDeductionLine/.test(payrollRoutes),
  'Replace roleCheck on DELETE /:id/deduction-line/:lineId with payslipDeductionWriteGate.'
);

// ── Frontend: MyIncome.jsx ──
const myIncome = readFile('frontend/src/erp/pages/MyIncome.jsx');
check(
  'MyIncome.jsx imports OwnerPicker',
  myIncome && /import\s+OwnerPicker\s+from\s+['"][^'"]+OwnerPicker['"]/.test(myIncome),
  "Add: import OwnerPicker from '../components/OwnerPicker';"
);
check(
  'MyIncome.jsx tracks targetBdmId state',
  myIncome && /const\s*\[targetBdmId,\s*setTargetBdmId\]\s*=\s*useState\(['"]['"]\)/.test(myIncome),
  "Add: const [targetBdmId, setTargetBdmId] = useState('');"
);
check(
  'MyIncome.jsx renders OwnerPicker for income_proxy on Payslips tab',
  myIncome && /OwnerPicker[\s\S]{0,300}subKey="income_proxy"[\s\S]{0,300}moduleLookupCode="INCOME"/.test(myIncome),
  'Render OwnerPicker module="payroll" subKey="income_proxy" moduleLookupCode="INCOME" on Payslips tab.'
);
check(
  'MyIncome.jsx renders OwnerPicker for deduction_schedule_proxy on Schedules tab',
  myIncome && /OwnerPicker[\s\S]{0,400}subKey="deduction_schedule_proxy"[\s\S]{0,300}moduleLookupCode="DEDUCTION_SCHEDULE"/.test(myIncome),
  'Render OwnerPicker module="payroll" subKey="deduction_schedule_proxy" moduleLookupCode="DEDUCTION_SCHEDULE" on Schedules tab.'
);
check(
  'MyIncome.jsx forwards targetBdmId on requestIncomeGeneration',
  // Order in source: payload.assigned_to = targetBdmId; THEN await inc.requestIncomeGeneration(payload).
  myIncome && /assigned_to\s*=\s*targetBdmId[\s\S]{0,400}requestIncomeGeneration/.test(myIncome),
  'When targetBdmId is set, include assigned_to: targetBdmId in the requestIncomeGeneration payload.'
);
check(
  'MyIncome.jsx forwards targetBdmId on createSchedule',
  // Order in source: createPayload = ... { ...payload, assigned_to: targetBdmId } THEN sched.createSchedule(createPayload).
  myIncome && /assigned_to:\s*targetBdmId[\s\S]{0,400}sched\.createSchedule/.test(myIncome),
  'When targetBdmId is set, include assigned_to in createSchedule payload.'
);
check(
  'MyIncome.jsx forwards targetBdmId on getIncomeList',
  myIncome && /params\.bdm_id\s*=\s*targetBdmId[\s\S]{0,300}inc\.getIncomeList/.test(myIncome),
  'loadReports should set params.bdm_id = targetBdmId before calling inc.getIncomeList.'
);

// ── Resolver dependency ──
const resolver = readFile('backend/erp/utils/resolveOwnerScope.js');
check(
  'resolveOwnerScope exposes the helpers Income/Deduction need',
  // Use AND of three independent regexes so export order doesn't matter.
  resolver
    && /module\.exports\s*=\s*\{[\s\S]*resolveOwnerForWrite/.test(resolver)
    && /module\.exports\s*=\s*\{[\s\S]*widenFilterForProxy/.test(resolver)
    && /module\.exports\s*=\s*\{[\s\S]*canProxyEntry/.test(resolver),
  'resolveOwnerScope.js must export resolveOwnerForWrite, widenFilterForProxy, canProxyEntry.'
);

// ── WorkflowGuide banners ──
const wfg = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  "WorkflowGuide myIncome banner mentions Phase G4.5aa proxy",
  wfg && /myIncome[\s\S]{0,3000}G4\.5aa/.test(wfg),
  'Add a step 8 to the myIncome banner explaining the Record on behalf of dropdown.'
);
check(
  "WorkflowGuide income (Finance) banner mentions Phase G4.5aa proxy",
  wfg && /'income':[\s\S]{0,3000}G4\.5aa/.test(wfg),
  'Add a step to the Finance income banner about eBDM proxy generation.'
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
