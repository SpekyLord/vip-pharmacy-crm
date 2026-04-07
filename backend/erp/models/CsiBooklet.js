/**
 * CSI Booklet Model — CSI Allocation Control (Phase 15.2)
 * Tracks booklet series, weekly allocation, and number validation
 */
const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  week_start: { type: Date, required: true },
  week_end: { type: Date, required: true },
  range_start: { type: Number, required: true },
  range_end: { type: Number, required: true },
  allocated_count: { type: Number, default: 0 },
  used_numbers: [Number],
  status: { type: String, enum: ['ALLOCATED', 'EXHAUSTED', 'RETURNED'], default: 'ALLOCATED' }
}, { _id: true });

const csiBookletSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  booklet_code: { type: String, required: true, trim: true },
  series_start: { type: Number, required: true },
  series_end: { type: Number, required: true },
  total_numbers: { type: Number, default: 0 },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster' },
  assigned_at: Date,
  allocations: [allocationSchema],
  used_count: { type: Number, default: 0 },
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
  // Count all used numbers across allocations
  let totalUsed = 0;
  for (const alloc of (this.allocations || [])) {
    alloc.allocated_count = alloc.range_end - alloc.range_start + 1;
    totalUsed += (alloc.used_numbers || []).length;
    if (alloc.used_numbers?.length >= alloc.allocated_count) {
      alloc.status = 'EXHAUSTED';
    }
  }
  this.used_count = totalUsed;
  this.remaining_count = this.total_numbers - totalUsed;
  if (this.remaining_count <= 0) this.status = 'EXHAUSTED';
  next();
});

module.exports = mongoose.model('CsiBooklet', csiBookletSchema);
