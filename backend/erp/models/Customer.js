/**
 * Customer Model — Non-hospital customer entities (persons, pharmacies, diagnostic centers, industrial)
 *
 * Separate from Hospital model (which has HEAT-specific fields and global uniqueness).
 * Customers are entity-scoped master data. Admin creates, then tags which BDM/eBDM can access.
 * Same BDM tagging pattern as Hospital.
 *
 * Phase 18 — Service Revenue & Cost Center Expenses
 */
const mongoose = require('mongoose');
const { cleanName } = require('../utils/nameClean');

const taggedBdmSchema = new mongoose.Schema({
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tagged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tagged_at: { type: Date, default: Date.now },
  is_active: { type: Boolean, default: true }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  customer_name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  customer_name_clean: { type: String },

  // Aliases for search/matching
  customer_aliases: { type: [String], default: [] },

  // Optional classification for filtering/reporting
  customer_type: {
    type: String,
    default: null
  }, // Lookup: CUSTOMER_TYPE

  // Default sale document type — pre-fills SalesEntry form to avoid errors
  default_sale_type: {
    type: String,
    default: 'CASH_RECEIPT'
  }, // Lookup: SALE_TYPE

  // Financial fields
  tin: { type: String, trim: true },
  vat_status: {
    type: String,
    default: 'VATABLE'
  }, // Lookup: VAT_TYPE
  payment_terms: { type: Number, default: 30 },
  credit_limit: { type: Number, default: null },
  credit_limit_action: {
    type: String,
    default: 'WARN'
  }, // Lookup: CREDIT_LIMIT_ACTION

  // Contact
  address: { type: String, trim: true },
  contact_person: { type: String, trim: true },
  contact_phone: { type: String, trim: true },
  contact_email: { type: String, trim: true },

  // BDM tagging (same pattern as Hospital)
  tagged_bdms: [taggedBdmSchema],

  // Status
  status: {
    type: String,
    default: 'ACTIVE'
  } // Lookup: ENTITY_STATUS (ACTIVE/INACTIVE)
}, {
  timestamps: true,
  collection: 'erp_customers'
});

// Auto-generate customer_name_clean on save
customerSchema.pre('save', function (next) {
  if (this.isModified('customer_name')) {
    this.customer_name_clean = cleanName(this.customer_name);
  }
  next();
});

customerSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.$set?.customer_name || update.customer_name) {
    const name = update.$set?.customer_name || update.customer_name;
    if (update.$set) update.$set.customer_name_clean = cleanName(name);
    else update.customer_name_clean = cleanName(name);
  }
  next();
});

// Indexes
customerSchema.index({ entity_id: 1, customer_name_clean: 1 }, { unique: true });
customerSchema.index({ entity_id: 1, status: 1 });
customerSchema.index({ entity_id: 1, customer_type: 1 });
customerSchema.index({ 'tagged_bdms.bdm_id': 1 });
customerSchema.index({ customer_name: 'text', customer_aliases: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
