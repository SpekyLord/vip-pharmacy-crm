const mongoose = require('mongoose');
const { cleanName } = require('../utils/nameClean');
const { normalizeUnit, UNIT_CODES } = require('../utils/normalize');

const productMasterSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  item_key: {
    type: String,
    required: [true, 'Item key is required'],
    trim: true
    // Format: "BrandName|DosageStrength" — unique per entity (see compound index)
  },
  generic_name: {
    type: String,
    required: [true, 'Generic name is required'],
    trim: true
  },
  brand_name: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true
  },
  dosage_strength: { type: String, trim: true },
  sold_per: { type: String, trim: true },

  // Data quality fields
  product_aliases: { type: [String], default: [] },
  brand_name_clean: { type: String, index: true },
  unit_code: {
    type: String,
    enum: UNIT_CODES
  },

  // Pricing
  purchase_price: {
    type: Number,
    required: [true, 'Purchase price is required']
  },
  selling_price: {
    type: Number,
    required: [true, 'Selling price is required']
  },
  vat_status: {
    type: String,
    enum: ['VATABLE', 'EXEMPT', 'ZERO'],
    default: 'VATABLE'
  },

  // SAP-level reorder fields (null = not configured)
  reorder_min_qty: { type: Number, default: null, min: 0 },
  reorder_qty: { type: Number, default: null, min: 1 },
  safety_stock_qty: { type: Number, default: null, min: 0 },
  lead_time_days: { type: Number, default: null, min: 0 },

  // Classification
  category: { type: String, trim: true },
  is_active: { type: Boolean, default: true },

  // Display / detail
  description: { type: String },
  key_benefits: { type: String },
  image_url: { type: String },

  // Audit
  added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  added_at: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'erp_product_master'
});

// Auto-generate item_key, brand_name_clean, unit_code
productMasterSchema.pre('save', function (next) {
  if (!this.item_key && this.brand_name && this.dosage_strength) {
    this.item_key = `${this.brand_name}|${this.dosage_strength}`;
  }
  if (this.isModified('brand_name') && this.brand_name) {
    this.brand_name_clean = cleanName(this.brand_name);
  }
  if (this.sold_per && !this.unit_code) {
    this.unit_code = normalizeUnit(this.sold_per);
  }
  next();
});

// Indexes
productMasterSchema.index({ entity_id: 1, item_key: 1 }, { unique: true });
productMasterSchema.index({ entity_id: 1, is_active: 1 });
productMasterSchema.index({ entity_id: 1, brand_name_clean: 1 });
productMasterSchema.index({ brand_name: 'text', generic_name: 'text', product_aliases: 'text' });

module.exports = mongoose.model('ProductMaster', productMasterSchema);
