const mongoose = require('mongoose');

const vendorMasterSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  vendor_code: {
    type: String,
    trim: true
  },
  vendor_name: {
    type: String,
    required: [true, 'Vendor name is required'],
    trim: true
  },
  // OCR name variations for fuzzy matching (SAP vendor search terms)
  vendor_aliases: {
    type: [String],
    default: []
  },
  tin: { type: String, trim: true },
  address: { type: String, trim: true },
  contact_person: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },

  // Default COA for automatic account determination (SAP XK01 pattern)
  default_coa_code: { type: String, trim: true },
  default_expense_category: { type: String, trim: true },

  payment_terms_days: { type: Number, default: 0 },
  vat_status: {
    type: String,
    default: 'VATABLE'
  }, // Lookup: VAT_TYPE
  bank_account: {
    bank: { type: String },
    account_no: { type: String },
    account_name: { type: String }
  },
  is_active: { type: Boolean, default: true },

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  collection: 'erp_vendors'
});

// Indexes
vendorMasterSchema.index({ entity_id: 1, vendor_code: 1 }, { unique: true, partialFilterExpression: { vendor_code: { $type: 'string' } } });
vendorMasterSchema.index({ entity_id: 1, is_active: 1 });
vendorMasterSchema.index({ vendor_name: 'text', vendor_aliases: 'text' });

module.exports = mongoose.model('VendorMaster', vendorMasterSchema);
