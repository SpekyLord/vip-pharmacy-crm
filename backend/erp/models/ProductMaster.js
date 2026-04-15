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
    trim: true
    // Auto-generated: "BrandName|DosageStrength" — unique per entity (see compound index)
    // Not marked required — generated in pre('validate') hook before validation runs
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
  dosage_strength: {
    type: String,
    required: [true, 'Dosage/strength is required'],
    trim: true
  },
  sold_per: { type: String, trim: true },

  // Data quality fields
  product_aliases: { type: [String], default: [] },
  brand_name_clean: { type: String, index: true },
  unit_code: {
    type: String,
    // No enum restriction — validated via Lookup table (UNIT_CODE category)
    trim: true,
  },

  // UOM Conversion: 1 purchase_uom = conversion_factor × selling_uom
  // e.g., 1 CASE = 10 BOX
  purchase_uom: { type: String, trim: true },   // unit supplier sells in (e.g., CASE)
  selling_uom: { type: String, trim: true },     // unit we sell/track inventory in (e.g., BOX)
  conversion_factor: { type: Number, default: 1, min: 1 },  // multiplier from purchase to selling units

  // Pricing
  purchase_price: { type: Number, default: 0 },
  selling_price: { type: Number, default: 0 },
  vat_status: {
    type: String,
    default: 'VATABLE'
  }, // Lookup: VAT_TYPE

  // SAP-level reorder fields (null = not configured)
  reorder_min_qty: { type: Number, default: null, min: 0 },
  reorder_qty: { type: Number, default: null, min: 1 },
  safety_stock_qty: { type: Number, default: null, min: 0 },
  lead_time_days: { type: Number, default: null, min: 0 },

  // Classification
  stock_type: {
    type: String,
    default: 'PHARMA'
  }, // Lookup: STOCK_TYPE
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

// Build item_key from brand_name + dosage_strength (both required)
function buildItemKey(brandName, dosageStrength) {
  if (!brandName || !dosageStrength) return null;
  return `${brandName}|${dosageStrength}`;
}

// Auto-generate item_key, brand_name_clean, unit_code, UOM defaults
// Uses pre('validate') so item_key is set BEFORE Mongoose required-field validation runs
productMasterSchema.pre('validate', function (next) {
  // Generate item_key if missing or if brand_name/dosage changed
  if (!this.item_key || this.isModified('brand_name') || this.isModified('dosage_strength')) {
    const key = buildItemKey(this.brand_name, this.dosage_strength);
    if (key) this.item_key = key;
  }
  if (this.isModified('brand_name') && this.brand_name) {
    this.brand_name_clean = cleanName(this.brand_name);
  }
  if (this.sold_per && !this.unit_code) {
    this.unit_code = normalizeUnit(this.sold_per);
  }
  // Default selling_uom to unit_code, purchase_uom to selling_uom
  if (!this.selling_uom && this.unit_code) {
    this.selling_uom = this.unit_code;
  }
  if (!this.purchase_uom && this.selling_uom) {
    this.purchase_uom = this.selling_uom;
  }
  next();
});

// Mirror normalization for findOneAndUpdate (pre-save doesn't run on updates)
productMasterSchema.pre('findOneAndUpdate', function (next) {
  const upd = this.getUpdate() || {};
  const $set = upd.$set || {};

  // Regenerate item_key when brand_name or dosage_strength is in the $set
  // Frontend always sends both fields, but be defensive for partial updates
  if ($set.brand_name !== undefined || $set.dosage_strength !== undefined) {
    const key = buildItemKey(
      $set.brand_name,   // will be present — frontend sends full form
      $set.dosage_strength
    );
    if (key) {
      if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
      this.getUpdate().$set.item_key = key;
    }
  }
  if ($set.brand_name) {
    if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
    this.getUpdate().$set.brand_name_clean = cleanName($set.brand_name);
  }
  if ($set.sold_per && !$set.unit_code) {
    if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
    this.getUpdate().$set.unit_code = normalizeUnit($set.sold_per);
  }
  next();
});

// Indexes
productMasterSchema.index({ entity_id: 1, item_key: 1 }, { unique: true });
productMasterSchema.index({ entity_id: 1, is_active: 1 });
productMasterSchema.index({ entity_id: 1, stock_type: 1 });
productMasterSchema.index({ entity_id: 1, brand_name_clean: 1 });
productMasterSchema.index({ brand_name: 'text', generic_name: 'text', product_aliases: 'text' });

module.exports = mongoose.model('ProductMaster', productMasterSchema);
