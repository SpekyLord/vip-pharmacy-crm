/**
 * Customer Model — Non-hospital customer entities (persons, pharmacies, diagnostic centers, industrial)
 *
 * Mirrors Hospital model: GLOBAL master data, not entity-scoped reads. `entity_id` remains
 * as a "home entity" label (reports, defaults) but is NOT a visibility/uniqueness boundary.
 * Visibility is driven by `tagged_bdms` (the BDM tag → the BDMs who sell to this customer),
 * matching the Hospital + tagged_bdms pattern.
 *
 * Why global: a real customer (e.g. Dr. Sharon) is an organization-level record. When a BDM
 * tagged to her switches working entity (VIP → subsidiary), she must remain sellable under
 * the subsidiary's books. AR posting entity is sourced from Sale.entity_id (the selling
 * entity), NOT from Customer.entity_id — verified across arEngine/collections/creditNotes.
 *
 * Phase 18 — Service Revenue & Cost Center Expenses (original entity-scoped design)
 * Phase G5 — Customer globalization (mirror Hospital pattern) — Apr 2026
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
  // Home entity label — set on creation to the creator's working entity. Used for
  // reporting/defaults only, NOT as a read-filter. See header for design.
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity'
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

// Indexes — global uniqueness on customer_name_clean (mirror Hospital). The old
// per-entity compound unique index is dropped by erp/scripts/migrateCustomerGlobalUnique.js.
customerSchema.index({ customer_name_clean: 1 }, { unique: true });
customerSchema.index({ status: 1 });
customerSchema.index({ customer_type: 1 });
customerSchema.index({ entity_id: 1 }); // non-unique — home entity label for reports
customerSchema.index({ 'tagged_bdms.bdm_id': 1 });
customerSchema.index({ customer_name: 'text', customer_aliases: 'text' });

module.exports = mongoose.model('Customer', customerSchema);
