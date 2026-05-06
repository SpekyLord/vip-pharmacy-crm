/**
 * DriveAllocation — Phase P1.2 Slice 4 (May 06 2026).
 *
 * BDM-owned daily reflection of "yesterday's drive" — Personal vs Official km
 * split. One row per (bdm × workday × entity). Status is binary:
 *   ALLOCATED — BDM did drive; Personal/Official totals captured
 *   NO_DRIVE  — BDM did not drive that day (vacation, sick, off-territory)
 *
 * Cycle model (May 06 2026 correction): half-monthly C1 / C2 reporting cycles
 * aligned to calendar months — same convention as `CarLogbookEntry`,
 * `SmerEntry`, `IncomeReport`, `Payslip`, `DeductionSchedule`. **Not** the
 * 28-day BDM-visit cycle (`scheduleCycleUtils.getCycleNumber` from CRM).
 *
 *   C1 = day 1–15 of `period: 'YYYY-MM'`
 *   C2 = day 16–end of month
 *
 * Initial slice mistakenly stored `cycle_number: Number` (28-day cycle); that
 * row shape would not join cleanly to CarLogbookEntry's `{period, cycle}`
 * pair. Refactored before any rows shipped to a non-test cluster.
 *
 * Rationale (from the locked Phase P1.2 plan, May 05 2026 evening):
 *   - The Capture Hub SMER tile is locked when prior workdays are unallocated
 *     so the BDM can't keep snapping ODO photos without acknowledging the
 *     drive that just happened (Slice 5).
 *   - Default at the slider is Personal=Total, Official=0 — anti-fraud nudge:
 *     forces an active reallocation rather than an "auto-claim" of official km.
 *   - Slider snaps to 5 km. server-side pre-save snaps personal_km to nearest 5
 *     so the contract holds even if a future client bypasses the UI snap.
 *   - "Did not drive" creates a NO_DRIVE row that closes the gate cleanly. No
 *     per-diem accrues, no fuel attributable.
 *   - Missing-EndODO recovery: if yesterday's end_km is missing AND today's
 *     start_km is captured, the allocation panel pre-fills end_km = today's
 *     start_km (car parked overnight, delta zero). The auto-fill flag is
 *     persisted on `end_km_auto_filled` so an admin override (Phase 2 Slice
 *     OVERRIDE_ALLOCATION) can spot the case.
 *
 * Backfill window (May 06 2026 design lock): the panel surfaces unallocated
 * workdays from BOTH the current C1/C2 and the immediately-prior cycle,
 * subject to a lookup-driven `DRIVE_ALLOCATION_PRIOR_CYCLE_GRACE_WORKDAYS`
 * (default 5). This handles the operational reality of a BDM reconciling
 * yesterday's drive in the first week of a new cycle (e.g., May 6 backfilling
 * Apr 30). Once the grace window expires, prior-cycle rows are admin-only via
 * `OVERRIDE_ALLOCATION` (Slice 9 — deferred).
 *
 * Forward-compat with Slice 6 (Car Logbook auto-populate, ~1 day):
 *   The proxy CarLogbookEntry is populated by joining DriveAllocation rows ×
 *   CRM Visit destinations × FUEL_ENTRY captures × cycle days. DriveAllocation
 *   is the source-of-truth for the BDM's reflection on personal/official km.
 *   CarLogbookEntry remains the proxy-posted document with its own pre-save
 *   fuel-efficiency math. The shared `{period, cycle}` shape now joins them
 *   cleanly; under the previous `cycle_number` model the join would have
 *   required a translation layer.
 *
 * Why a separate collection (not extend CarLogbookEntry):
 *   1. CarLogbookEntry has a complex pre-save that auto-computes fuel+gas
 *      splits — adding the BDM-side allocation would entangle two responsibility
 *      surfaces.
 *   2. The BDM may save allocations independently of any logbook posting cycle.
 *   3. Tests + healthchecks stay narrower.
 *   4. Subscription-readiness: a SaaS tenant that doesn't want fuel-efficiency
 *      tracking can disable CarLogbookEntry but still keep DriveAllocation.
 *
 * Rule #19: entity_id stamped at create; cross-entity blocked.
 * Rule #21: bdm_id explicit — no silent self-scope fallback.
 * Rule #3:  role gates lookup-driven via CAPTURE_LIFECYCLE_ROLES.
 */

const mongoose = require('mongoose');

const KM_SNAP_STEP = 5; // snap personal_km to nearest 5 km (matches slider granularity)

const driveAllocationSchema = new mongoose.Schema({
  // ── Ownership ──
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },
  allocated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Drive day (Manila local YYYY-MM-DD; period/cycle derived) ──
  drive_date: {
    type: String, // 'YYYY-MM-DD' Manila local — string is intentional, comparable + JSON-safe
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/,
  },
  period: {
    type: String, // 'YYYY-MM' — calendar month of drive_date (Manila local)
    required: true,
    match: /^\d{4}-\d{2}$/,
    index: true,
  },
  cycle: {
    type: String, // 'C1' (day 1-15) | 'C2' (day 16-end of month)
    enum: ['C1', 'C2'],
    required: true,
    index: true,
  },

  // ── Allocation state ──
  status: {
    type: String,
    enum: ['ALLOCATED', 'NO_DRIVE'],
    required: true,
    index: true,
  },

  // ── KM readings (only meaningful when status=ALLOCATED) ──
  start_km: { type: Number, default: 0, min: 0 },
  end_km:   { type: Number, default: 0, min: 0 },
  end_km_auto_filled: { type: Boolean, default: false },
  total_km: { type: Number, default: 0, min: 0 },        // server-derived: max(0, end-start)
  personal_km: { type: Number, default: 0, min: 0 },     // BDM-driven via slider
  official_km: { type: Number, default: 0, min: 0 },     // server-derived: max(0, total - personal)

  // ── Trace + notes ──
  source_smer_capture_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CaptureSubmission',
  }],
  notes: { type: String, maxlength: 500 },
  source: {
    type: String,
    enum: ['BDM_SELF', 'PROXY_OVERRIDE'],
    default: 'BDM_SELF',
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'erp_drive_allocations',
});

// One allocation per (bdm × entity × drive_date) — second insert is an
// idempotent upsert via the controller; the unique index defends the contract.
driveAllocationSchema.index(
  { bdm_id: 1, entity_id: 1, drive_date: 1 },
  { unique: true },
);
driveAllocationSchema.index({ entity_id: 1, period: 1, cycle: 1, drive_date: 1 });
driveAllocationSchema.index({ bdm_id: 1, period: 1, cycle: 1, drive_date: 1 });

// Pre-save: snap personal_km to nearest 5; recompute total_km / official_km.
// Anti-fraud: when status=NO_DRIVE, all km fields are zeroed regardless of
// what the body sent (defends against a hostile client posting bogus km on a
// no-drive row).
driveAllocationSchema.pre('save', function (next) {
  if (this.status === 'NO_DRIVE') {
    this.start_km = 0;
    this.end_km = 0;
    this.total_km = 0;
    this.personal_km = 0;
    this.official_km = 0;
    this.end_km_auto_filled = false;
    return next();
  }

  // ALLOCATED branch — derive totals
  const start = Number(this.start_km) || 0;
  const end = Number(this.end_km) || 0;
  this.total_km = Math.max(0, end - start);

  // Snap personal_km to nearest 5; clamp to [0, total_km]
  const snapped = Math.round((Number(this.personal_km) || 0) / KM_SNAP_STEP) * KM_SNAP_STEP;
  this.personal_km = Math.max(0, Math.min(this.total_km, snapped));
  this.official_km = Math.max(0, this.total_km - this.personal_km);
  next();
});

module.exports = mongoose.model('DriveAllocation', driveAllocationSchema);
module.exports.KM_SNAP_STEP = KM_SNAP_STEP;
