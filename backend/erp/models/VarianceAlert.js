const mongoose = require('mongoose');

/**
 * VarianceAlert — Phase SG-5 #27 (persisted audit trail of KPI variance alerts)
 *
 * Each time `kpiVarianceAgent` detects a threshold breach for a BDM+KPI, it
 * writes one row here. Multiple rows per (bdm, kpi, period) are allowed (one
 * per fire); the agent uses the VARIANCE_ALERT_COOLDOWN_DAYS lookup to skip
 * re-firing on the same breach within a cooldown window (default 7 days). The
 * digest agent rolls these up into a weekly per-manager email.
 *
 * `status` lifecycle:
 *   OPEN      — agent fired; no one has acknowledged yet
 *   RESOLVED  — BDM/manager clicked "Resolve" on the Variance Alert Center UI
 *               (or the next snapshot recomputed the KPI back above threshold
 *               — autoResolveOnRecovery is a SG-6 follow-up, not in SG-5)
 *
 * Why a separate model instead of reusing MessageInbox / ErpAuditLog:
 *   - MessageInbox is a notification surface; its delivery lifecycle doesn't
 *     map to "alert still open vs resolved". We want idempotent dedup by
 *     (plan_id, bdm_id, kpi_code, severity, period).
 *   - ErpAuditLog is append-only by design; updating `resolved_at` would
 *     violate that contract.
 *
 * Subscription posture: entity_id scoped; no hardcoded thresholds. Cooldown +
 * severity thresholds are resolved at read-time from Lookup
 * (`VARIANCE_ALERT_COOLDOWN_DAYS`, `KPI_VARIANCE_THRESHOLDS`) so admins tune
 * per entity from Control Center.
 */
const varianceAlertSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true, index: true },
  plan_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'SalesGoalPlan', required: true, index: true },
  bdm_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  person_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster', default: null },
  fiscal_year: { type: Number, required: true },
  period:      { type: String, required: true },   // same semantics as KpiSnapshot.period (YTD → "2026")

  kpi_code:    { type: String, required: true, uppercase: true, trim: true },
  kpi_label:   { type: String, default: '' },
  severity:    { type: String, enum: ['warning', 'critical'], required: true, index: true },

  actual_value:   { type: Number, default: 0 },
  target_value:   { type: Number, default: 0 },
  deviation_pct:  { type: Number, default: 0 },
  threshold_pct:  { type: Number, default: 0 },

  status:       { type: String, enum: ['OPEN', 'RESOLVED'], default: 'OPEN', index: true },
  fired_at:     { type: Date, default: Date.now, index: true },
  resolved_at:  { type: Date, default: null },
  resolved_by:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolution_note: { type: String, default: '' },

  // Digest bookkeeping — set when kpiVarianceDigestAgent includes this row in
  // a weekly roll-up so we don't double-count across digest runs.
  digested_at:  { type: Date, default: null, index: true },
}, {
  timestamps: true,
});

// Compound indexes for cooldown lookups and digest aggregation.
varianceAlertSchema.index({ entity_id: 1, plan_id: 1, bdm_id: 1, kpi_code: 1, severity: 1, fired_at: -1 });
varianceAlertSchema.index({ entity_id: 1, status: 1, fired_at: -1 });
varianceAlertSchema.index({ entity_id: 1, digested_at: 1, fired_at: -1 });

module.exports = mongoose.model('VarianceAlert', varianceAlertSchema);
