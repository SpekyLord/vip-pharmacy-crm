/**
 * Insurance Policy Register — PRD-ERP Module 14
 *
 * Tracks all insurance policies per person:
 *   LIFE — life insurance for employees/BDMs
 *   KEYMAN — key man insurance for president/corporate secretary
 *   INCOME_LOSS — income loss / disability protection
 *   ACCIDENT — personal accident insurance for field BDMs
 *   VEHICLE_COMPREHENSIVE — comprehensive vehicle insurance (optional)
 *   VEHICLE_CTPL — Compulsory Third Party Liability (mandatory for all PH vehicles)
 *
 * One person can have multiple policies of the same type (different providers).
 * Expiry dates feed into documentExpiryAgent for renewal alerts.
 */
const mongoose = require('mongoose');

const insurancePolicySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  person_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PeopleMaster', required: true },

  policy_type: {
    type: String,
    required: true,
    enum: ['LIFE', 'KEYMAN', 'INCOME_LOSS', 'ACCIDENT', 'VEHICLE_COMPREHENSIVE', 'VEHICLE_CTPL']
  },

  // Policy details
  provider: { type: String, required: true, trim: true },   // Sun Life, AXA, Malayan, etc.
  policy_no: { type: String, trim: true },
  coverage_amount: { type: Number, default: 0 },
  premium_amount: { type: Number, default: 0 },
  premium_frequency: {
    type: String,
    enum: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'],
    default: 'ANNUAL'
  },

  // Dates
  effective_date: { type: Date },
  expiry_date: { type: Date },

  // Beneficiary (for LIFE / KEYMAN)
  beneficiary: { type: String, trim: true },

  // Vehicle fields (for VEHICLE_COMPREHENSIVE / VEHICLE_CTPL)
  vehicle_plate_no: { type: String, trim: true },
  vehicle_description: { type: String, trim: true },  // e.g. "2024 Toyota Vios Silver"

  // Status
  status: {
    type: String,
    enum: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING_RENEWAL'],
    default: 'ACTIVE'
  },

  notes: { type: String, trim: true },

  // Audit
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, {
  timestamps: true,
  collection: 'erp_insurance_policies'
});

insurancePolicySchema.index({ entity_id: 1, person_id: 1 });
insurancePolicySchema.index({ entity_id: 1, policy_type: 1 });
insurancePolicySchema.index({ expiry_date: 1, status: 1 });  // For expiry agent queries

module.exports = mongoose.model('InsurancePolicy', insurancePolicySchema);
