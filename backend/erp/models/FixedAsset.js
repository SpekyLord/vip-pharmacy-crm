/**
 * FixedAsset Model — Asset register for depreciation tracking
 *
 * PRD v5 §11.9 — Straight-line depreciation default.
 * Monthly depreciation = (acquisition_cost - salvage_value) / useful_life_months.
 */
const mongoose = require('mongoose');

const depreciationEntrySchema = new mongoose.Schema({
  period: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['STAGING', 'APPROVED', 'POSTED'], default: 'STAGING' },
  je_id: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry' },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },
  computed_at: { type: Date, default: Date.now }
}, { _id: true });

const fixedAssetSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  asset_code: {
    type: String,
    required: true,
    trim: true
  },
  asset_name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  acquisition_date: {
    type: Date,
    required: true
  },
  acquisition_cost: {
    type: Number,
    required: true,
    min: 0
  },
  useful_life_months: {
    type: Number,
    required: true,
    min: 1
  },
  salvage_value: {
    type: Number,
    default: 0,
    min: 0
  },
  depreciation_method: {
    type: String,
    enum: ['STRAIGHT_LINE'],
    default: 'STRAIGHT_LINE'
  },
  accumulated_depreciation: {
    type: Number,
    default: 0
  },
  net_book_value: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'DISPOSED', 'FULLY_DEPRECIATED'],
    default: 'ACTIVE'
  },
  depreciation_schedule: [depreciationEntrySchema]
}, {
  timestamps: true,
  collection: 'erp_fixed_assets'
});

// Pre-save: compute net book value
fixedAssetSchema.pre('save', function (next) {
  this.net_book_value = this.acquisition_cost - this.accumulated_depreciation;
  if (this.net_book_value <= this.salvage_value && this.status === 'ACTIVE') {
    this.status = 'FULLY_DEPRECIATED';
  }
  next();
});

fixedAssetSchema.index({ entity_id: 1, asset_code: 1 }, { unique: true });
fixedAssetSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('FixedAsset', fixedAssetSchema);
