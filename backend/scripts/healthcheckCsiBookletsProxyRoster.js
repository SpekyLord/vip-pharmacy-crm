#!/usr/bin/env node
/**
 * Healthcheck — Phase G4.5gg CSI Booklets proxy-roster wiring (May 5, 2026).
 *
 * Static contract verifier — does NOT hit the live cluster. Run before/after
 * any edit that touches the CSI Booklets management surface.
 *
 *   node backend/scripts/healthcheckCsiBookletsProxyRoster.js
 *
 * Exits 0 on PASS, 1 on FAIL. Each section reports PASS / FAIL counts.
 *
 * What this verifies (the wiring contract):
 *   1. Lookup seeds for PROXY_ENTRY_ROLES.CSI_BOOKLETS + VALID_OWNER_ROLES.CSI_BOOKLETS
 *      exist with insert_only_metadata so admin overrides survive re-seeds.
 *   2. csiBookletService.allocate validates `assigned_to` against
 *      VALID_OWNER_ROLES.CSI_BOOKLETS (lookup-driven) AND same-entity (Rule #21).
 *   3. Frontend CsiBooklets.jsx dropdown sources /erp/proxy-roster (not /erp/people)
 *      and passes the right moduleKey/subKey/lookupCode triplet.
 *   4. WorkflowGuide csi-booklets banner mentions the lookup-driven proxy roster
 *      so admin discovers tunability (Rule #1 + Rule #3).
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

console.log('\n═══ Section 1 — Lookup seeds (PROXY_ENTRY_ROLES + VALID_OWNER_ROLES) ═══');
const lookupCtrl = readFile('backend/erp/controllers/lookupGenericController.js');
check('lookupGenericController.js readable', !!lookupCtrl);
check(
  'PROXY_ENTRY_ROLES.CSI_BOOKLETS seed row present',
  /PROXY_ENTRY_ROLES[\s\S]*?{[^}]*code:\s*'CSI_BOOKLETS'[^}]*}/.test(lookupCtrl || ''),
  'add a row under PROXY_ENTRY_ROLES seed array',
);
check(
  'VALID_OWNER_ROLES.CSI_BOOKLETS seed row present',
  /VALID_OWNER_ROLES[\s\S]*?{[^}]*code:\s*'CSI_BOOKLETS'[^}]*}/.test(lookupCtrl || ''),
  'add a row under VALID_OWNER_ROLES seed array',
);
check(
  'CSI_BOOKLETS rows use insert_only_metadata: true (admin edits survive re-seed)',
  (lookupCtrl?.match(/code:\s*'CSI_BOOKLETS'[^}]*insert_only_metadata:\s*true/g) || []).length >= 2,
  'both CSI_BOOKLETS seed rows must set insert_only_metadata: true',
);
check(
  'VALID_OWNER_ROLES.CSI_BOOKLETS defaults to BDM-shaped (\'staff\')',
  /code:\s*'CSI_BOOKLETS'[^}]*roles:\s*\[\s*'staff'\s*\]/.test(lookupCtrl || ''),
  'metadata.roles for VALID_OWNER_ROLES.CSI_BOOKLETS should be [\'staff\']',
);
check(
  'PROXY_ENTRY_ROLES_CATEGORIES set still triggers cache bust on edit',
  /PROXY_ENTRY_ROLES_CATEGORIES[\s\S]*?'PROXY_ENTRY_ROLES'/.test(lookupCtrl || ''),
);
check(
  'VALID_OWNER_ROLES_CATEGORIES set still triggers cache bust on edit',
  /VALID_OWNER_ROLES_CATEGORIES[\s\S]*?'VALID_OWNER_ROLES'/.test(lookupCtrl || ''),
);

console.log('\n═══ Section 2 — Service-side allocate guard (defense-in-depth) ═══');
const svc = readFile('backend/erp/services/csiBookletService.js');
check('csiBookletService.js readable', !!svc);
check(
  'service imports getValidOwnerRolesForModule',
  svc?.includes('getValidOwnerRolesForModule') && svc?.includes('resolveOwnerScope'),
  'add: const { getValidOwnerRolesForModule } = require(\'../utils/resolveOwnerScope\')',
);
check('service imports User model', svc?.includes("require('../../models/User')"));
check(
  'allocate() validates assignee role against VALID_OWNER_ROLES.CSI_BOOKLETS',
  svc?.includes('CSI_BOOKLETS') && svc?.includes('validRoles') && /validRoles\.includes\(assignee\.role\)/.test(svc),
  'reject when assignee.role not in lookup-driven allowlist',
);
check(
  'allocate() rejects deactivated assignees',
  svc?.includes('isActive === false') || svc?.includes('isActive: false'),
);
check(
  'allocate() rejects cross-entity assignees (Rule #21)',
  svc?.includes('Cross-entity allocation') || svc?.includes('does not belong to this entity'),
);

console.log('\n═══ Section 3 — Frontend dropdown sourced from /erp/proxy-roster ═══');
const page = readFile('frontend/src/erp/pages/CsiBooklets.jsx');
check('CsiBooklets.jsx readable', !!page);
check(
  'loadBdms uses people.getProxyRoster (NOT getPeopleList)',
  page?.includes("getProxyRoster('CSI_BOOKLETS'") && !/people\.getPeopleList\(\{[^}]*has_login/.test(page || ''),
  'replace getPeopleList call with getProxyRoster(\'CSI_BOOKLETS\', { subKey: \'csi_booklets\', moduleKey: \'inventory\' })',
);
check(
  'getProxyRoster call passes subKey: \'csi_booklets\'',
  /getProxyRoster\([^)]*subKey:\s*'csi_booklets'/.test(page || ''),
);
check(
  'getProxyRoster call passes moduleKey: \'inventory\'',
  /getProxyRoster\([^)]*moduleKey:\s*'inventory'/.test(page || ''),
);
check(
  'desktop dropdown drops the .filter(p => p.user_id) deref guard (roster is User docs)',
  !/bdms\.filter\(p\s*=>\s*p\.user_id\)/.test(page || ''),
  'roster returns User docs so p._id IS the user id; remove the guard',
);
check(
  'dropdown options use String(p._id) for value (no .user_id deref)',
  /value=\{String\(p\._id\)\}/.test(page || '') && !/value=\{typeof p\.user_id/.test(page || ''),
);
check(
  'dropdown labels use p.name (proxy roster shape)',
  />\{p\.name\}</.test(page || ''),
);

console.log('\n═══ Section 4 — Reused proxy-roster infrastructure (sanity) ═══');
const usePeople = readFile('frontend/src/erp/hooks/usePeople.js');
check('usePeople still exposes getProxyRoster', usePeople?.includes('getProxyRoster'));
const proxyCtrl = readFile('backend/erp/controllers/proxyRosterController.js');
check(
  'proxyRosterController honours moduleKey override (so CSI_BOOKLETS routes to `inventory` namespace)',
  proxyCtrl?.includes('req.query.moduleKey'),
  'CSI_BOOKLETS lookupCode toLowerCase() = csi_booklets which is NOT a real module — moduleKey override must work',
);
const erpIndex = readFile('backend/erp/routes/index.js');
check('routes/index.js still mounts /proxy-roster', erpIndex?.includes("router.use('/proxy-roster'"));

console.log('\n═══ Section 5 — WorkflowGuide banner mentions lookup tunability (Rule #1 + Rule #3) ═══');
const guide = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check('WorkflowGuide.jsx readable', !!guide);
check(
  'csi-booklets entry mentions VALID_OWNER_ROLES.CSI_BOOKLETS so admin discovers config',
  guide?.includes("'csi-booklets'") && guide?.includes('VALID_OWNER_ROLES.CSI_BOOKLETS'),
);
check(
  'csi-booklets entry mentions PROXY_ENTRY_ROLES.CSI_BOOKLETS for back-office BDM grants',
  guide?.includes('PROXY_ENTRY_ROLES.CSI_BOOKLETS'),
);

console.log('\n═══ Summary ═══');
console.log(`  PASS: ${pass}`);
console.log(`  FAIL: ${fail}`);
if (fail > 0) {
  console.log('\nFailing checks:');
  fails.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log('\n  All checks PASS — Phase G4.5gg wiring contract intact.');
process.exit(0);
