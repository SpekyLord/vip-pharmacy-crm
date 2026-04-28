/**
 * HospitalContractPrice — Phase CSI-X1 (April 2026)
 *
 * Per-hospital BDM-negotiated contract pricing. Resolves before
 * ProductMaster.selling_price for sales to that hospital.
 *
 * Multiple historic rows per (hospital, product) are required for audit;
 * the price resolver picks the most-recent ACTIVE row whose effective window
 * covers the as-of date. Renegotiation = new row (status SUPERSEDED on the
 * old row), never an in-place edit of an active row.
 *
 * Subscription-readiness (Rule #19): entity-scoped throughout. SaaS spin-out
 * generalizes to tenant_id without schema rewrite.
 *
 * Approval gate: changes flow through gateApproval('PRICE_LIST'). Default
 * roles are MODULE_DEFAULT_ROLES.PRICE_LIST = ['admin', 'finance', 'president'].
 * BDMs propose; finance/admin approves. Surgical price adjustments are NOT
 * BDM-self-service.
 */

const mongoose = require('mongoose');

const STATUS = ['ACTIVE', 'SUPERSEDED', 'EXPIRED', 'CANCELLED'];

const hospitalContractPriceSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
    index: true
  },
  hospital_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hospital',
    required: [true, 'Hospital is required']
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: [true, 'Product is required']
  },
  contract_price: {
    type: Number,
    required: [true, 'Contract price is required'],
    min: [0, 'Contract price must be >= 0']
  },
  effective_from: {
    type: Date,
    required: true,
    default: Date.now
  },
  effective_to: {
    type: Date,
    default: null  // null = open-ended
  },
  // Audit / proposal trail
  negotiated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Negotiating BDM is required']
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approved_at: { type: Date, default: null },
  change_reason: { type: String, trim: true },
  status: {
    type: String,
    enum: STATUS,
    default: 'ACTIVE',
    index: true
  },
  // Forward-compat: link to ApprovalRequest when gated
  approval_request_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ApprovalRequest',
    default: null
  },
  notes: { type: String, trim: true },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'erp_hospital_contract_prices'
});

// Most-recent active lookup (the resolver hits this index)
hospitalContractPriceSchema.index(
  { entity_id: 1, hospital_id: 1, product_id: 1, status: 1, effective_from: -1 }
);
// Hospital-scoped admin browse
hospitalContractPriceSchema.index({ entity_id: 1, hospital_id: 1, status: 1 });
// Product-scoped admin browse (which hospitals have a contract on this SKU)
hospitalContractPriceSchema.index({ entity_id: 1, product_id: 1, status: 1 });

hospitalContractPriceSchema.statics.STATUS = STATUS;

module.exports = mongoose.model('HospitalContractPrice', hospitalContractPriceSchema);
