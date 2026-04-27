/**
 * DoctorMergeAudit — Phase A.5.5 (Apr 2026).
 *
 * Captures the full FK-cascade snapshot for every Doctor (VIP-Client) merge so
 * that a merge can be rolled back within the 30-day grace window. Each row
 * represents a single merge operation: one winner absorbs one loser. If admin
 * merges three duplicates into one master record, that is three rows.
 *
 * Why a dedicated model (not AuditLog):
 *   - AuditLog is security-event-shaped (fixed enum, 90-day TTL, no payload
 *     beyond ip/userAgent). Merge cascade snapshots carry per-model id arrays
 *     and per-collision sentinel maps — too noisy for the security stream.
 *   - Rollback queries need structured per-model arrays, not free-form JSON.
 *   - 30-day TTL deliberately matches the soft-delete grace window in the
 *     cron hard-delete job. Cron purges merged Doctors AND their audit rows
 *     in lock-step so rollback never references a hard-deleted Doctor.
 *
 * Integrity invariant: a Doctor with `mergedInto` set must have at least one
 * MergeAudit row pointing at it as `loser_id` AND `status='APPLIED'`. Health
 * check `backend/scripts/healthcheckMdMergeAudit.js` (future) verifies this.
 */

const mongoose = require('mongoose');

const cascadeEntrySchema = new mongoose.Schema(
  {
    model: {
      type: String,
      required: true,
    },
    field: {
      type: String,
      required: true,
    },
    // Cross-DB indicator — `crm` (default Mongoose connection) vs `erp`. ERP
    // models live on the same Atlas cluster but a future Pharmacy SaaS spin-out
    // (Year-2 per global Rule 0d) may split them, so the field is recorded
    // even though it is informational today.
    db: {
      type: String,
      enum: ['crm', 'erp'],
      default: 'crm',
    },
    // IDs of records repointed from loser → winner. updateMany result IDs.
    repointed_ids: [{ type: mongoose.Schema.Types.ObjectId }],
    // IDs of records that hit a uniqueness collision and were defused with a
    // sentinel marker on the loser side (e.g. yearWeekKey = '<orig>__MERGED_<loserId>').
    // For these rows, rollback restores the original key value.
    collision_ids: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId },
        original_value: { type: String },
        sentinel_value: { type: String },
      },
    ],
    // ProductAssignment-specific: IDs deactivated because winner already had
    // an active assignment for the same product. Rollback re-activates these
    // ONLY if the winner's matching row is still in the same status.
    deactivated_ids: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { _id: false },
);

const doctorMergeAuditSchema = new mongoose.Schema(
  {
    winner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    loser_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    // Snapshot of identity fields on both sides at merge time — for the rollback
    // diff UI and for reconciling after-the-fact even if Doctor docs were edited
    // post-merge.
    winner_snapshot: {
      firstName: String,
      lastName: String,
      vip_client_name_clean: String,
      primaryAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      partnership_status: String,
      prc_license_number: String,
    },
    loser_snapshot: {
      firstName: String,
      lastName: String,
      vip_client_name_clean: String,
      primaryAssignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      partnership_status: String,
      prc_license_number: String,
      isActive: Boolean,
    },
    // Per-model cascade results.
    cascade: [cascadeEntrySchema],
    // Free-form merge reason — required by controller (no merge without a
    // reason — auditable).
    reason: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    actor_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actor_ip: { type: String },
    actor_user_agent: { type: String },
    // Lifecycle:
    //   APPLIED      — merge committed, loser soft-deleted, eligible for rollback
    //   ROLLED_BACK  — admin rolled back; loser restored. Terminal.
    //   HARD_DELETED — 30-day cron purged the loser; rollback no longer possible.
    status: {
      type: String,
      enum: ['APPLIED', 'ROLLED_BACK', 'HARD_DELETED'],
      default: 'APPLIED',
      index: true,
    },
    rolled_back_at: { type: Date, default: null },
    rolled_back_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rollback_reason: { type: String, maxlength: 1000, default: null },
  },
  {
    collection: 'doctor_merge_audits',
    timestamps: true,
  },
);

// Hot path: looking up "did we already merge this loser?" and "rollback queue".
doctorMergeAuditSchema.index({ status: 1, createdAt: -1 });
// Cron hard-delete sweep: status=APPLIED + createdAt older than 30 days.
doctorMergeAuditSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('DoctorMergeAudit', doctorMergeAuditSchema);
