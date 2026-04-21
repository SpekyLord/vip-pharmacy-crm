/**
 * SMER Entry Model — Sales & Marketing Expense Report
 *
 * Each document = one BDM's SMER for a period+cycle.
 * Contains daily entries with per diem tiers, transport, and totals.
 * Lifecycle: DRAFT → VALID → ERROR → POSTED
 *
 * Per diem logic:
 *   ≥ PERDIEM_MD_FULL (default 8) MDs → 100% per diem
 *   ≥ PERDIEM_MD_HALF (default 3) MDs → 50% per diem
 *   0-2 MDs → 0% per diem
 */
const mongoose = require('mongoose');

const dailyEntrySchema = new mongoose.Schema({
  day: { type: Number, required: true, min: 1, max: 31 },
  day_of_week: { type: String, enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] },
  entry_date: { type: Date, required: true },
  activity_type: { type: String, trim: true }, // Lookup: ACTIVITY_TYPE
  hospital_covered: { type: String, trim: true },  // auto-filled: comma-joined hospital names
  hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },  // legacy single — kept for backward compat
  hospital_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],  // multi-hospital picker (Field days)
  md_count: { type: Number, default: 0, min: 0 },          // CRM actual count — always preserved for audit
  perdiem_tier: { type: String, default: 'ZERO' },  // Lookup: PERDIEM_TIER — effective tier (CRM-computed or override)
  perdiem_amount: { type: Number, default: 0 },             // effective amount (CRM-computed or override)
  transpo_p2p: { type: Number, default: 0 },
  transpo_special: { type: Number, default: 0 },
  // @deprecated 2026-04 — ORE flows through ExpenseEntry.expense_type='ORE' only.
  // Kept in schema for historical audit on pre-retirement POSTED docs.
  // Pre-save guard below rejects any non-zero write.
  ore_amount: { type: Number, default: 0 },
  car_logbook_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CarLogbookEntry' },
  notes: { type: String, trim: true },

  // Per diem override — Finance/Manager/President can override the CRM-computed tier
  // When perdiem_override=true, perdiem_tier and perdiem_amount use override_tier instead of md_count
  // CRM md_count stays as-is for audit trail
  // Example: Jake had 2 MDs (ZERO) but was in a meeting with President → override to FULL
  perdiem_override: { type: Boolean, default: false },
  override_tier: { type: String },  // Lookup: PERDIEM_TIER — only FULL or HALF (no point overriding to ZERO)
  override_reason: { type: String, trim: true },             // "Meeting with President", "Training day", etc.
  overridden_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  overridden_at: { type: Date },

  // Approval tracking — links override request to Universal Approval system
  override_status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'] },  // null = no request
  approval_request_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ApprovalRequest' },
  requested_override_tier: { type: String },  // stores what tier was requested while PENDING
}, { _id: true });

const smerEntrySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Period
  period: { type: String, required: true, trim: true },       // "2026-04"
  cycle: { type: String, required: true }, // Lookup: CYCLE

  // Per diem rate (snapshot from CompProfile or Settings at creation)
  perdiem_rate: { type: Number, required: true },

  // Daily entries
  daily_entries: [dailyEntrySchema],

  // Travel advance reconciliation
  travel_advance: { type: Number, default: 0 },

  // Auto-computed totals (pre-save)
  total_perdiem: { type: Number, default: 0 },
  total_transpo: { type: Number, default: 0 },
  total_special_cases: { type: Number, default: 0 },
  // @deprecated 2026-04 — see daily_entries.ore_amount. Historical POSTED SMERs
  // may carry a non-zero value; new SMERs always persist 0 via the pre-save hook.
  total_ore: { type: Number, default: 0 },
  total_reimbursable: { type: Number, default: 0 },
  balance_on_hand: { type: Number, default: 0 },
  working_days: { type: Number, default: 0 },

  // Lifecycle
  status: {
    type: String,
    default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [String],
  rejection_reason: { type: String },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Audit
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_smer_entries'
});

// Pre-save: auto-compute totals.
// ORE retired 2026-04: on NEW docs, any daily_entries.ore_amount > 0 is rejected
// (ORE flows via ExpenseEntry.expense_type='ORE' only). Existing docs with
// legacy non-zero values pass through unchanged — historical POSTED SMERs must
// still save (e.g., status updates, reversal) without corrupting audit.
smerEntrySchema.pre('save', function (next) {
  let totalPerdiem = 0, totalTranspo = 0, totalSpecial = 0, totalOre = 0;
  let workingDays = 0;
  const isNewDoc = this.isNew;

  for (const entry of this.daily_entries) {
    if (isNewDoc && entry.ore_amount && entry.ore_amount > 0) {
      return next(new Error(
        `SmerEntry.daily_entries.ore_amount is retired (day ${entry.day}, amount ${entry.ore_amount}). ` +
        `Enter ORE via the Expenses module (expense_type='ORE').`
      ));
    }
    totalPerdiem += entry.perdiem_amount || 0;
    totalTranspo += entry.transpo_p2p || 0;
    totalSpecial += entry.transpo_special || 0;
    totalOre += entry.ore_amount || 0;
    if ((entry.md_count > 0 || entry.activity_type || entry.hospital_covered || entry.perdiem_override) && entry.activity_type !== 'NO_WORK') workingDays++;
  }

  this.total_perdiem = Math.round(totalPerdiem * 100) / 100;
  this.total_transpo = Math.round(totalTranspo * 100) / 100;
  this.total_special_cases = Math.round(totalSpecial * 100) / 100;
  this.total_ore = Math.round(totalOre * 100) / 100; // 0 on new docs, preserved on legacy
  this.working_days = workingDays;
  this.total_reimbursable = Math.round((totalPerdiem + totalTranspo + totalSpecial + totalOre) * 100) / 100;
  this.balance_on_hand = Math.round(((this.travel_advance || 0) - this.total_reimbursable) * 100) / 100;

  next();
});

// Indexes
// Plain unique on (entity_id, bdm_id, period, cycle). Reversed SMERs must NOT
// occupy this key — the create controller archive-renames a reversed collision's
// period to `${period}::REV::${_id}` before creating the new row, preserving
// audit (deletion_event_id + daily entries + TransactionEvent reversal) while
// freeing the key. Partial-filter-on-$exists-false was tried first and abandoned
// (MongoDB rejects it: "Expression not supported in partial index: $not…").
smerEntrySchema.index({ entity_id: 1, bdm_id: 1, period: 1, cycle: 1 }, { unique: true });
smerEntrySchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
smerEntrySchema.index({ status: 1 });

module.exports = mongoose.model('SmerEntry', smerEntrySchema);
