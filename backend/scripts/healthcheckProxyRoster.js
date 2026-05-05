#!/usr/bin/env node
/**
 * Healthcheck — Phase G4.5ff Proxy Roster wiring (May 5, 2026).
 *
 * Static contract verifier — does NOT hit the live cluster. Run before/after
 * any edit that touches the proxy-entry stack.
 *
 *   node backend/scripts/healthcheckProxyRoster.js
 *
 * Exits 0 on PASS, 1 on FAIL. Each section reports PASS / FAIL counts.
 *
 * Sections:
 *   1. Backend controller exports getProxyRoster + uses canProxyEntry
 *   2. Backend route mounted at /proxy-roster BEFORE erpAccessCheck('people')
 *   3. resolveOwnerScope.js exports the helpers we depend on
 *   4. Frontend usePeople hook exposes getProxyRoster
 *   5. OwnerPicker uses getProxyRoster (not getPeopleList) and gate is lookup-only
 *   6. WorkflowGuide sales-entry banner mentions proxy + lookup-driven config
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let pass = 0;
let fail = 0;
const fails = [];

function check(label, condition, hint) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    const msg = hint ? `  ❌ ${label} — ${hint}` : `  ❌ ${label}`;
    console.log(msg);
    fails.push(label);
  }
}

function readFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

console.log('\n═══ Section 1 — proxyRosterController ═══');
const ctrl = readFile('backend/erp/controllers/proxyRosterController.js');
check('controller file exists', !!ctrl);
check('exports getProxyRoster', ctrl?.includes('module.exports') && ctrl.includes('getProxyRoster'));
check('imports canProxyEntry from resolveOwnerScope', ctrl?.includes('canProxyEntry') && ctrl.includes('resolveOwnerScope'));
check('imports getValidOwnerRolesForModule', ctrl?.includes('getValidOwnerRolesForModule'));
check('returns 403 when canProxy=false', ctrl?.includes('403') && ctrl?.includes('Proxy entry not authorized'));
check('entity-scopes the User query', ctrl?.includes('entity_id: req.entityId') || ctrl?.includes('entity_ids: req.entityId'));
check('filters by validOwnerRoles', ctrl?.includes('validOwnerRoles') && ctrl?.includes('role:') && ctrl?.includes('$in'));
check('excludes the caller', ctrl?.includes('callerId') && ctrl?.includes('!==') );
check('selects minimal PII (no email/phone/comp)', !ctrl?.match(/select.*email|select.*phone|compensation_history/));

console.log('\n═══ Section 2 — proxyRosterRoutes + index.js mount ═══');
const route = readFile('backend/erp/routes/proxyRosterRoutes.js');
check('route file exists', !!route);
check('route imports getProxyRoster', route?.includes('getProxyRoster'));
check('route mounts GET /:moduleLookup', route?.includes("router.get('/:moduleLookup'"));
const erpIndex = readFile('backend/erp/routes/index.js');
check('routes/index.js mounts /proxy-roster', erpIndex?.includes("router.use('/proxy-roster'"));
// Ensure mount comes BEFORE erpAccessCheck('people') so the gate doesn't apply
const proxyMountIdx = erpIndex?.indexOf("router.use('/proxy-roster'") ?? -1;
const peopleMountIdx = erpIndex?.indexOf("router.use('/people'") ?? -1;
check(
  'proxy-roster mounted BEFORE /people (so erpAccessCheck people is bypassed)',
  proxyMountIdx > 0 && peopleMountIdx > 0 && proxyMountIdx < peopleMountIdx,
  `proxy idx=${proxyMountIdx}, people idx=${peopleMountIdx}`,
);

console.log('\n═══ Section 3 — resolveOwnerScope helpers ═══');
const scope = readFile('backend/erp/utils/resolveOwnerScope.js');
check('resolveOwnerScope exports canProxyEntry', scope?.match(/canProxyEntry\b/));
check('resolveOwnerScope exports getValidOwnerRolesForModule', scope?.includes('getValidOwnerRolesForModule'));
check('resolveOwnerForWrite blocks cross-entity targets (Rule #21)', scope?.includes('Cross-entity proxy is not permitted'));

console.log('\n═══ Section 4 — usePeople hook ═══');
const hook = readFile('frontend/src/erp/hooks/usePeople.js');
check('usePeople defines getProxyRoster', hook?.includes('const getProxyRoster'));
check('usePeople hits /proxy-roster/${moduleLookup}', hook?.match(/proxy-roster\/\$\{moduleLookup\}/));
check('usePeople returns getProxyRoster', hook?.match(/getProxyRoster[\s,]/));

console.log('\n═══ Section 5 — OwnerPicker render gate + endpoint ═══');
const picker = readFile('frontend/src/erp/components/OwnerPicker.jsx');
check('OwnerPicker imports getProxyRoster', picker?.includes('getProxyRoster'));
check('OwnerPicker no longer calls getPeopleList', !picker?.includes('getPeopleList('));
check(
  'OwnerPicker render gate is lookup-only (showPicker = canProxy)',
  picker?.match(/const showPicker = canProxy\s*[;\n]/),
  'expected `const showPicker = canProxy;`',
);
check('OwnerPicker fetches roster on mount', picker?.includes('await getProxyRoster(lookupCode'));
check('OwnerPicker still filters by validOwnerRoles defensively', picker?.includes('validOwnerRoles.includes(p.role)'));

console.log('\n═══ Section 6a — useErpSubAccess proxy-key contract ═══');
const subAccessHook = readFile('frontend/src/erp/hooks/useErpSubAccess.js');
check('useErpSubAccess defines isProxySubKey helper', subAccessHook?.includes('function isProxySubKey'));
check('useErpSubAccess regex covers _proxy_entry suffix', subAccessHook?.includes('proxy(?:_entry)?$'));
check('useErpSubAccess applies isProxySubKey before FULL fallback grant', subAccessHook?.includes('if (isProxySubKey(subKey))'));
// Quick eval: ensure regex behaves as expected for known variants
try {
  const m = subAccessHook?.match(/function isProxySubKey\([\s\S]*?\n\}/);
  if (m) {
    // eslint-disable-next-line no-eval
    eval(m[0]);
    const variants = [
      'proxy_entry', 'opening_ar_proxy', 'grn_proxy_entry', 'smer_proxy',
      'car_logbook_proxy', 'prf_calf_proxy', 'deduction_schedule_proxy',
      'batch_metadata_proxy', 'physical_count_proxy', 'internal_transfer_proxy',
    ];
    // eslint-disable-next-line no-undef
    const bad = variants.filter((v) => !isProxySubKey(v));
    check(`isProxySubKey matches all ${variants.length} known proxy variants`, bad.length === 0, bad.length ? `missing: ${bad.join(',')}` : '');
    // negatives
    // eslint-disable-next-line no-undef
    const fp = ['hospital_manage', 'product_delete', 'reverse_posted'].filter((k) => isProxySubKey(k));
    check('isProxySubKey does NOT match non-proxy keys', fp.length === 0, fp.length ? `false-positives: ${fp.join(',')}` : '');
  } else {
    check('isProxySubKey extractable for static eval', false);
  }
} catch (e) {
  check('isProxySubKey static eval', false, e.message);
}

console.log('\n═══ Section 6 — WorkflowGuide sales-entry banner ═══');
const guide = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check('sales-entry banner exists', guide?.includes("'sales-entry':"));
check('banner mentions proxy entry', guide?.includes('Record on behalf of') || guide?.includes('Proxy entry'));
check('banner mentions PROXY_ENTRY_ROLES.SALES (lookup-driven)', guide?.includes('PROXY_ENTRY_ROLES.SALES'));
check('banner mentions Phase G4.5ff', guide?.includes('G4.5ff'));
check('banner mentions /erp/proxy-roster endpoint', guide?.includes('/erp/proxy-roster'));

console.log('\n═══ Summary ═══');
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
  console.log('\nFailed checks:');
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('\n✅ All checks passed.');
process.exit(0);
