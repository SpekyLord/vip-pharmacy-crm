/**
 * CSI Booklet Model — CSI Allocation Control (Phase 15.2)
 * Tracks booklet series, weekly allocation, and number validation
 */
const mongoose = require('mongoose');

const voidedNumberSchema = new mongoose.Schema({
  number: { type: Number, required: true },
  reason: { type: String, required: true, trim: true },
  reason_note: { type: String, trim: true },
  proof_url: { type: String, required: true },
  proof_key: { type: String },
  voided_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  voided_at: { type: Date, default: Date.now }
}, { _id: true });

const allocationSchema = new mongoose.Schema({
  // One physical BIR booklet is often sliced into small ranges (3–7 numbers)
  // for different BDMs. Allocation-level assigned_to identifies the receiving
  // BDM. If left null, falls back to booklet-level assigned_to.
  // Refs User (login account) — must match SalesLine.bdm_id and req.user._id.
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Legacy/optional week window — kept for backward compatibility. Not required.
  week_start: { type: Date },
  week_end: { type: Date },
  range_start: { type: Number, required: true },
  range_end: { type: Number, required: true },
  allocated_count: { type: Number, default: 0 },
  used_numbers: [Number],
  voided_numbers: [voidedNumberSchema],
  status: { type: String, enum: ['ALLOCATED', 'EXHAUSTED', 'RETURNED'], default: 'ALLOCATED' }
}, { _id: true });

const csiBookletSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  booklet_code: { type: String, required: true, trim: true },
  // BIR-required metadata for the "Authority to Print" permit (ATP). All optional
  // for backward compatibility, but future subscribers can fill these out to
  // satisfy BIR inspection without code changes.
  atp_number: { type: String, trim: true },
  bir_registration_address: { type: String, trim: true },
  issued_at: { type: Date },
  // Optional physical-location hint: which warehouse physically stores the
  // booklet (e.g., HQ vault in Iloilo). Does NOT participate in validation —
  // BDM ownership is the sole ownership signal. Provided for reporting and
  // multi-warehouse subscription scenarios where management wants to know
  // "what booklets live where."
  source_warehouse_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' },
  series_start: { type: Number, required: true },
  series_end: { type: Number, required: true },
  total_numbers: { type: Number, default: 0 },
  // Refs User (login account) — must match SalesLine.bdm_id and req.user._id.
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assigned_at: Date,
  allocations: [allocationSchema],
  used_count: { type: Number, default: 0 },
  voided_count: { type: Number, default: 0 },
  remaining_count: { type: Number, default: 0 },
  status: { type: String, enum: ['ACTIVE', 'EXHAUSTED', 'VOID'], default: 'ACTIVE' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: true, collection: 'erp_csi_booklets' });

csiBookletSchema.index({ entity_id: 1, booklet_code: 1 }, { unique: true });
csiBookletSchema.index({ entity_id: 1, assigned_to: 1 });
csiBookletSchema.index({ entity_id: 1, status: 1 });

csiBookletSchema.pre('save', function (next) {
  this.total_numbers = this.series_end - this.series_start + 1;
  let totalUsed = 0;
  let totalVoided = 0;
  for (const alloc of (this.allocations || [])) {
    alloc.allocated_count = alloc.range_end - alloc.range_start + 1;
    const usedCount = (alloc.used_numbers || []).length;
    const voidedCount = (alloc.voided_numbers || []).length;
    totalUsed += usedCount;
    totalVoided += voidedCount;
    // A number cannot be both used and voided — defensive check
    const usedSet = new Set(alloc.used_numbers || []);
    for (const v of (alloc.voided_numbers || [])) {
      if (usedSet.has(v.number)) {
        return next(new Error(`CSI number ${v.number} cannot be both used and voided in allocation ${alloc._id}`));
      }
    }
    if ((usedCount + voidedCount) >= alloc.allocated_count) {
      alloc.status = 'EXHAUSTED';
    }
  }
  this.used_count = totalUsed;
  this.voided_count = totalVoided;
  this.remaining_count = this.total_numbers - totalUsed - totalVoided;
  if (this.remaining_count <= 0) this.status = 'EXHAUSTED';
  next();
});

module.exports = mongoose.model('CsiBooklet', csiBookletSchema);
