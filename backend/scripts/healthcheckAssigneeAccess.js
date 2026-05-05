/**
 * Phase A.5.4 — Static healthcheck for the Doctor.assignedTo scalar→array flip.
 *
 * Asserts the wiring contract end-to-end without touching the database:
 *   - Doctor schema declares assignedTo as an array
 *   - Doctor schema has assigneeIds virtual + primaryAssignee scalar + sync hook
 *   - assigneeAccess.js helper exports the expected functions
 *   - Frontend assigneeDisplay.js helper exports the expected functions
 *   - Migration script exists for the data flip
 *   - Every backend caller that reads doctor.assignedTo for access checks uses
 *     the helper, not the legacy `doctor.assignedTo?._id || doctor.assignedTo`
 *     ternary
 *
 * Run: node backend/scripts/healthcheckAssigneeAccess.js
 * Exit: 0 = clean; 1 = at least one assertion failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BE = path.join(ROOT, 'backend');
const FE = path.join(ROOT, 'frontend', 'src');

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, label) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
  }
}

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

console.log('Phase A.5.4 — Doctor.assignedTo scalar→array healthcheck');
console.log('========================================================');

// --- 1. Doctor model schema ---
console.log('\n[1] Doctor model schema:');
const doctorModel = readFile(path.join(BE, 'models', 'Doctor.js'));
assert(doctorModel !== null, 'Doctor.js exists');
assert(/assignedTo:\s*\[\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/.test(doctorModel),
  'assignedTo declared as array of ObjectId refs');
assert(/primaryAssignee:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId/.test(doctorModel),
  'primaryAssignee declared as scalar ObjectId');
assert(/doctorSchema\.virtual\('assigneeIds'\)/.test(doctorModel),
  'assigneeIds virtual declared');
assert(/Phase A\.5\.4 — keep primaryAssignee in sync/.test(doctorModel),
  'pre-save hook syncs primaryAssignee with assignedTo[]');

// --- 2. assigneeAccess.js helper ---
console.log('\n[2] backend/utils/assigneeAccess.js helper:');
const helper = readFile(path.join(BE, 'utils', 'assigneeAccess.js'));
assert(helper !== null, 'assigneeAccess.js exists');
assert(/exports\.normalizeUserId|module\.exports\s*=\s*\{[^}]*normalizeUserId/.test(helper) ||
  /normalizeUserId,/.test(helper), 'exports normalizeUserId');
assert(/getAssigneeIds/.test(helper) && /isAssignedTo/.test(helper) &&
  /getPrimaryAssigneeId/.test(helper) && /getPrimaryAssigneeObject/.test(helper),
  'exports getAssigneeIds, isAssignedTo, getPrimaryAssigneeId, getPrimaryAssigneeObject');

// --- 3. Frontend helper ---
console.log('\n[3] frontend/src/utils/assigneeDisplay.js helper:');
const feHelper = readFile(path.join(FE, 'utils', 'assigneeDisplay.js'));
assert(feHelper !== null, 'assigneeDisplay.js exists');
assert(/getPrimaryAssigneeName/.test(feHelper) &&
  /getPrimaryAssigneeId/.test(feHelper) &&
  /getAllAssigneeNames/.test(feHelper),
  'exports getPrimaryAssigneeName, getPrimaryAssigneeId, getAllAssigneeNames');

// --- 4. Migration script ---
console.log('\n[4] Migration script:');
const migration = readFile(path.join(BE, 'scripts', 'migrateAssignedToArray.js'));
assert(migration !== null, 'migrateAssignedToArray.js exists');
assert(/--apply/.test(migration), 'supports --apply flag');
assert(/Array\.isArray\(d\.assignedTo\)/.test(migration), 'detects current shape per-doc');

// --- 5. doctorController callers use the helper ---
console.log('\n[5] doctorController.js access checks use isAssignedTo:');
const ctrl = readFile(path.join(BE, 'controllers', 'doctorController.js'));
assert(ctrl !== null, 'doctorController.js exists');
assert(/require\('\.\.\/utils\/assigneeAccess'\)/.test(ctrl),
  'imports from utils/assigneeAccess');
assert(/isAssignedTo\(doctor, req\.user\._id\)/.test(ctrl),
  'uses isAssignedTo for BDM access checks');
// Negative: legacy ternary should not appear in executable code (only in comments)
const ternaryHits = (ctrl.match(/doctor\.assignedTo\?\._id\s*\|\|\s*doctor\.assignedTo/g) || []);
const commentTernaryHits = (ctrl.match(/\/\/.*doctor\.assignedTo\?\._id\s*\|\|\s*doctor\.assignedTo/g) || []);
assert(ternaryHits.length === commentTernaryHits.length,
  'no executable legacy ternary remains in doctorController');

// --- 6. Peripheral readers use the helper ---
console.log('\n[6] Peripheral readers use isAssignedTo / getPrimaryAssigneeId:');
const peripherals = [
  ['middleware/roleCheck.js', /isAssignedTo\(doctor, req\.user\._id\)/],
  ['utils/validateWeeklyVisit.js', /isAssignedTo\(doctor, /],
  ['utils/optOut.js', /getPrimaryAssigneeId\(doctor\)/],
  ['controllers/inviteController.js', /isAssignedTo\(doctor, req\.user\._id\)/],
  ['controllers/communicationLogController.js', /isAssignedTo\(/],
  ['controllers/messageTemplateController.js', /isAssignedTo\(targetDoc, req\.user\._id\)/],
  ['agents/engagementDecayAgent.js', /getPrimaryAssigneeId\(doctor\)/],
  ['routes/webhookRoutes.js', /getPrimaryAssigneeId\(doctor\)/],
];
for (const [rel, pat] of peripherals) {
  const code = readFile(path.join(BE, rel));
  assert(code && pat.test(code), `${rel} uses helper`);
}

// --- 7. Frontend display sites use the helper ---
console.log('\n[7] Frontend display sites use assigneeDisplay helpers:');
const fePeripherals = [
  ['components/admin/DoctorManagement.jsx', /getPrimaryAssigneeName\(doctor\)/],
  ['pages/admin/DoctorsPage.jsx', /getPrimaryAssigneeId\(doctor\)/],
  ['pages/admin/MdLeadsPage.jsx', /getPrimaryAssigneeName\(d\)/],
  ['pages/employee/DoctorDetailPage.jsx', /getPrimaryAssigneeName\(doctor\)/],
];
for (const [rel, pat] of fePeripherals) {
  const code = readFile(path.join(FE, rel));
  assert(code && pat.test(code), `${rel} uses helper`);
}

// --- 8. Tests exist for the helper ---
console.log('\n[8] Helper unit test:');
const test = readFile(path.join(BE, 'tests', 'unit', 'assigneeAccess.test.js'));
assert(test !== null, 'assigneeAccess.test.js exists');
assert(/getAssigneeIds/.test(test) && /isAssignedTo/.test(test) &&
  /getPrimaryAssigneeId/.test(test),
  'covers getAssigneeIds, isAssignedTo, getPrimaryAssigneeId');

// --- Summary ---
console.log('\n========================================================');
console.log(`Result: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
process.exit(0);
