/**
 * Healthcheck: Admin-driven scheduling wiring — Phase A.6 (May 05 2026)
 *
 * Statically verifies the end-to-end contract for:
 *   1. scheduleSlotMapper helper exports + alt-week + past-cycle rules.
 *   2. scheduleController exposes adminReschedule, adminGetUpcoming,
 *      adminGetUpcomingCounts AND adminCreate accepts {date} per entry.
 *   3. scheduleRoutes mounts PATCH /admin/:id, GET /admin/upcoming, and
 *      GET /admin/upcoming-counts behind adminOnly + protect.
 *   4. doctorController.createDoctor accepts initialSchedule + atomic
 *      Doctor + Schedule path with compensating delete fallback.
 *   5. Frontend scheduleService exposes adminReschedule, adminGetUpcoming,
 *      adminGetUpcomingCounts.
 *   6. ScheduleVisitsModal exists with the three modes.
 *   7. DoctorsPage wires modal + handleScheduleClick + bulk-fetch effect.
 *   8. DoctorManagement renders Needs-scheduling badge + Schedule action.
 *   9. EmployeeVisitReport renders Reschedule per row when onReschedule passed.
 *  10. ReportsPage imports ScheduleVisitsModal + handleEvrReschedule.
 *  11. PageGuide doctors-page + reports-page updated to mention scheduling.
 *
 * Usage:
 *   node backend/scripts/healthcheckAdminScheduling.js
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

// ─── 1. scheduleSlotMapper helper ──────────────────────────────────────────────
const mapper = readFile('backend/utils/scheduleSlotMapper.js');
check(
  'scheduleSlotMapper exports dateToSlot + slotToDate + validateAlternatingWeek + generateDefaultDates + rejectPastCycle',
  mapper
    && /module\.exports\s*=\s*\{[\s\S]*dateToSlot[\s\S]*slotToDate[\s\S]*validateAlternatingWeek[\s\S]*generateDefaultDates[\s\S]*rejectPastCycle[\s\S]*\}/.test(mapper),
  'All five helpers must be exported so the controller, doctor create, and frontend prefill share the same math.'
);
check(
  'scheduleSlotMapper.validateAlternatingWeek enforces W1+W3 / W2+W4',
  mapper
    && /validPair\s*=\s*\(a,\s*b\)\s*=>/.test(mapper)
    && /\(a\s*===\s*1\s*&&\s*b\s*===\s*3\)/.test(mapper)
    && /\(a\s*===\s*2\s*&&\s*b\s*===\s*4\)/.test(mapper),
  '2x/mo VIPs MUST alternate (W1+W3 or W2+W4). Pair check is the gate the modal + controller share.'
);
check(
  'scheduleSlotMapper.dateToSlot rejects non-work-days',
  mapper && /Schedule date must be a work day/i.test(mapper),
  'Mon-Fri rule is shared with validateWeeklyVisit; rejecting at Schedule planning time is the early gate.'
);
check(
  'scheduleSlotMapper.rejectPastCycle compares against current cycle',
  mapper && /Target cycle .* is in the past/.test(mapper),
  'Reschedule into a past cycle would silently bypass BDM visibility — must 400.'
);

// ─── 2. scheduleController endpoints ──────────────────────────────────────────
const sched = readFile('backend/controllers/scheduleController.js');
check(
  'scheduleController exports adminReschedule + adminGetUpcoming + adminGetUpcomingCounts',
  sched
    && /module\.exports\s*=\s*\{[\s\S]*adminReschedule[\s\S]*adminGetUpcoming[\s\S]*adminGetUpcomingCounts/.test(sched),
  'Three new admin endpoints power the scheduling UX.'
);
check(
  'scheduleController.adminCreate normalises {date} into slot tuple',
  sched
    && /if\s*\(\s*e\.date\s*\)\s*\{\s*slot\s*=\s*dateToSlot/.test(sched),
  'adminCreate must accept calendar dates so the modal can send YYYY-MM-DD.'
);
check(
  'scheduleController.adminReschedule rejects completed/missed entries',
  sched
    && /entry\.status\s*===\s*'completed'/.test(sched)
    && /entry\.status\s*===\s*'missed'/.test(sched),
  'completed = visit logged (immutable here); missed = past cycle. Both must 409.'
);
check(
  'scheduleController.adminReschedule uses validateAlternatingWeek for visitFrequency=2',
  sched
    && /doctor\?\.visitFrequency\s*===\s*2/.test(sched)
    && /validateAlternatingWeek\s*\(/.test(sched),
  'Alt-week rule must be enforced server-side, not just client-side.'
);
check(
  'scheduleController.adminReschedule maps E11000 to 409 with clear message',
  sched
    && /err\.code\s*===\s*11000/.test(sched)
    && /That slot is already taken/i.test(sched),
  'Unique-index collision must surface as a friendly 409, not a generic 500.'
);
check(
  'scheduleController.adminGetUpcomingCounts uses single $group aggregation',
  sched
    && /Schedule\.aggregate\(/.test(sched)
    && /\$group:\s*\{\s*_id:\s*'\$doctor',\s*count:\s*\{\s*\$sum:\s*1\s*\}\s*\}/.test(sched),
  'Bulk count must be one query so the badge fetch scales with page size.'
);

// ─── 3. scheduleRoutes mounts new endpoints ───────────────────────────────────
const routes = readFile('backend/routes/scheduleRoutes.js');
check(
  'scheduleRoutes mounts PATCH /admin/:id behind adminOnly',
  routes && /router\.patch\(['"]\/admin\/:id['"],\s*adminOnly,\s*adminReschedule\)/.test(routes),
  'Reschedule endpoint must be admin-gated.'
);
check(
  'scheduleRoutes mounts GET /admin/upcoming behind adminOnly',
  routes && /router\.get\(['"]\/admin\/upcoming['"],\s*adminOnly,\s*adminGetUpcoming\)/.test(routes),
  'Upcoming-list endpoint must be admin-gated.'
);
check(
  'scheduleRoutes mounts GET /admin/upcoming-counts behind adminOnly',
  routes && /router\.get\(['"]\/admin\/upcoming-counts['"],\s*adminOnly,\s*adminGetUpcomingCounts\)/.test(routes),
  'Bulk count endpoint must be admin-gated.'
);
check(
  'scheduleRoutes defines /admin/upcoming BEFORE PATCH /admin/:id',
  routes
    && (routes.indexOf("'/admin/upcoming'") < routes.indexOf("'/admin/:id'")),
  'Express matches the first registered route — /admin/:id with id=upcoming would shadow the upcoming endpoint otherwise.'
);

// ─── 4. doctorController.createDoctor — initialSchedule path ──────────────────
const doctor = readFile('backend/controllers/doctorController.js');
check(
  'doctorController.createDoctor accepts initialSchedule from req.body',
  doctor && /initialSchedule[\s\S]{0,40}=\s*req\.body/.test(doctor),
  'Add VIP / Upgrade to VIP modal sends initialSchedule; controller must destructure it.'
);
check(
  'doctorController.createDoctor uses Atlas transaction with replica-set fallback',
  doctor
    && /mongoose\.startSession/.test(doctor)
    && /session\.withTransaction/.test(doctor)
    && /Doctor\.deleteOne\(\{\s*_id:\s*doctor\._id\s*\}\)/.test(doctor),
  'Transaction is the primary path; compensating delete is the standalone-Mongo fallback so a Doctor never lingers without its Schedule rows.'
);
check(
  'doctorController.createDoctor pre-validates each slot before DB writes',
  doctor && /dateToSlot\(slot\.date\)/.test(doctor) && /seenSlotKeys/.test(doctor),
  'Validate everything client-side AND server-side before opening a transaction.'
);
check(
  'doctorController.createDoctor enforces alt-week rule across the proposed set',
  doctor && /validateAlternatingWeek\(\{\s*visitFrequency:\s*2\s*\}/.test(doctor),
  'Cross-row alt-week check on the modal\'s entire dates array.'
);

// ─── 5. Frontend scheduleService ──────────────────────────────────────────────
const svc = readFile('frontend/src/services/scheduleService.js');
check(
  'scheduleService exposes adminReschedule + adminGetUpcoming + adminGetUpcomingCounts',
  svc && /adminReschedule:/.test(svc) && /adminGetUpcoming:/.test(svc) && /adminGetUpcomingCounts:/.test(svc),
  'All three new admin verbs must be wired.'
);
check(
  'scheduleService.adminReschedule sends PATCH with date body',
  svc && /api\.patch\(`\/schedules\/admin\/\$\{id\}`,\s*\{\s*date\s*\}\)/.test(svc),
  'PATCH method + body shape must match the controller.'
);

// ─── 6. ScheduleVisitsModal exists with three modes ───────────────────────────
const modal = readFile('frontend/src/components/admin/ScheduleVisitsModal.jsx');
check(
  'ScheduleVisitsModal handles create/schedule/reschedule modes',
  modal
    && /mode\s*=\s*['"]create['"]/.test(modal)
    && /mode\s*=\s*['"]schedule['"]/.test(modal)
    && /mode\s*=\s*['"]reschedule['"]/.test(modal),
  'All three modes power Add VIP, schedule-existing, and reschedule flows.'
);
check(
  'ScheduleVisitsModal validates Mon-Fri + alt-week client-side',
  modal && /isWorkDayIso/.test(modal) && /alternat/i.test(modal),
  'Client-side validation surfaces errors before the user submits — backend remains the authority.'
);
check(
  'ScheduleVisitsModal carries data-testid="schedule-visits-modal" + svm-confirm',
  modal && /data-testid="schedule-visits-modal"/.test(modal) && /data-testid="svm-confirm"/.test(modal),
  'Stable testids power Playwright smokes.'
);

// ─── 7. DoctorsPage wires modal + bulk-fetch ──────────────────────────────────
const dpage = readFile('frontend/src/pages/admin/DoctorsPage.jsx');
check(
  'DoctorsPage imports ScheduleVisitsModal + scheduleService',
  dpage && /import\s+ScheduleVisitsModal/.test(dpage) && /import\s+scheduleService/.test(dpage),
  'Both imports needed for the modal + bulk-status fetch.'
);
check(
  'DoctorsPage handleUpgradeToVIP opens the schedule modal first',
  dpage && /pendingUpgradePayload/.test(dpage) && /setSchedModalState/.test(dpage),
  'Upgrade flow must route through the modal, not the legacy confirm.'
);
check(
  'DoctorsPage bulk-fetches upcoming-counts for displayed doctors',
  dpage && /adminGetUpcomingCounts/.test(dpage) && /useEffect/.test(dpage),
  'Badge requires bulk-fetch in a useEffect that watches doctors.'
);
check(
  'DoctorsPage passes onScheduleClick + schedStatusByDoctor to DoctorManagement',
  dpage && /onScheduleClick=\{handleScheduleClick\}/.test(dpage) && /schedStatusByDoctor=\{schedStatusByDoctor\}/.test(dpage),
  'Props must flow into the table component.'
);

// ─── 8. DoctorManagement renders badge + Schedule action ──────────────────────
const dmgmt = readFile('frontend/src/components/admin/DoctorManagement.jsx');
check(
  'DoctorManagement renders Needs-scheduling badge gated on schedStatusByDoctor[id] === "none"',
  dmgmt && /schedStatusByDoctor\[doctor\._id\]\s*===\s*'none'/.test(dmgmt) && /Needs scheduling/.test(dmgmt),
  'Badge must render only when the bulk-fetch confirms 0 upcoming entries.'
);
check(
  'DoctorManagement Schedule action button calls onScheduleClick(doctor)',
  dmgmt && /onScheduleClick\?\.\(doctor\)/.test(dmgmt) && /CalendarDays/.test(dmgmt),
  'Schedule/Reschedule button is the entry point to the modal.'
);

// ─── 9. EmployeeVisitReport reschedule wiring ─────────────────────────────────
const evr = readFile('frontend/src/components/admin/EmployeeVisitReport.jsx');
check(
  'EmployeeVisitReport accepts onReschedule prop',
  evr && /\(\s*\{\s*reportData,\s*monthYear,\s*onReschedule\s*\}\s*\)/.test(evr),
  'Optional callback prop — when omitted, the new column is hidden.'
);
check(
  'EmployeeVisitReport renders Reschedule button per VIP row when onReschedule supplied',
  evr && /onReschedule\s*&&\s*\(\s*<td>/.test(evr) && /onReschedule\(doctor\)/.test(evr),
  'Action cell + button hooked to the parent\'s handler.'
);

// ─── 10. ReportsPage wires modal + EVR prop ───────────────────────────────────
const rpage = readFile('frontend/src/pages/admin/ReportsPage.jsx');
check(
  'ReportsPage imports ScheduleVisitsModal',
  rpage && /import\s+ScheduleVisitsModal/.test(rpage),
  'Modal component must be imported.'
);
check(
  'ReportsPage passes onReschedule={handleEvrReschedule} to EmployeeVisitReport',
  rpage && /onReschedule=\{handleEvrReschedule\}/.test(rpage),
  'Wiring of the action prop closes the loop.'
);
check(
  'ReportsPage renders <ScheduleVisitsModal> at the page root',
  rpage && /<ScheduleVisitsModal/.test(rpage),
  'Modal must be rendered or it never opens.'
);

// ─── 11. PageGuide banners updated ────────────────────────────────────────────
const guide = readFile('frontend/src/components/common/PageGuide.jsx');
check(
  'PageGuide doctors-page mentions Schedule / Needs scheduling',
  guide && /'doctors-page'[\s\S]{0,1500}Needs scheduling/.test(guide),
  'Per Rule #1 — banner must reflect new behavior.'
);
check(
  'PageGuide reports-page mentions Reschedule on EVR rows',
  guide && /'reports-page'[\s\S]{0,800}Reschedule/.test(guide),
  'Per Rule #1 — banner must reflect new behavior.'
);

// ─── Report ───────────────────────────────────────────────────────────────────
let pass = 0;
let fail = 0;
for (const c of checks) {
  const status = c.ok ? '✔' : '✘';
  console.log(`${status} ${c.label}`);
  if (!c.ok && c.hint) console.log(`   ↳ hint: ${c.hint}`);
  if (c.ok) pass += 1;
  else fail += 1;
}
console.log('');
console.log(`${pass}/${checks.length} checks PASSED, ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
