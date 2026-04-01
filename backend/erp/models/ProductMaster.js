const mongoose = require('mongoose');

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

// Auto-generate item_key if not provided
productMasterSchema.pre('save', function (next) {
  if (!this.item_key && this.brand_name && this.dosage_strength) {
    this.item_key = `${this.brand_name}|${this.dosage_strength}`;
  }
  next();
});

// Indexes
productMasterSchema.index({ entity_id: 1, item_key: 1 }, { unique: true });
productMasterSchema.index({ entity_id: 1, is_active: 1 });
productMasterSchema.index({ brand_name: 'text', generic_name: 'text' });

module.exports = mongoose.model('ProductMaster', productMasterSchema);
