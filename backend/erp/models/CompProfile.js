const mongoose = require('mongoose');

const compProfileSchema = new mongoose.Schema(
  {
    person_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PeopleMaster',
      required: [true, 'Person is required'],
    },
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
    },
    effective_date: {
      type: Date,
      required: [true, 'Effective date is required'],
    },

    // ═══ Salary Type ═══
    salary_type: {
      type: String,
      enum: ['FIXED_SALARY', 'COMMISSION_BASED', 'HYBRID'],
      required: [true, 'Salary type is required'],
    },

    // ═══ Fixed Salary Components ═══
    basic_salary: { type: Number, default: 0 },
    rice_allowance: { type: Number, default: 0 },
    clothing_allowance: { type: Number, default: 0 },
    medical_allowance: { type: Number, default: 0 },
    laundry_allowance: { type: Number, default: 0 },
    transport_allowance: { type: Number, default: 0 },
    monthly_gross: { type: Number, default: 0 }, // computed pre-save

    // ═══ Incentive Components ═══
    incentive_type: {
      type: String,
      enum: ['CASH', 'IN_KIND', 'COMMISSION', 'NONE'],
      default: 'NONE',
    },
    incentive_rate: { type: Number, default: 0 },
    incentive_description: { type: String, default: '' },
    incentive_cap: { type: Number, default: 0 },

    // ═══ BDM-Specific ═══
    perdiem_rate: { type: Number, default: 0 },
    perdiem_days: { type: Number, default: 22 },
    km_per_liter: { type: Number, default: 0 },
    fuel_overconsumption_threshold: { type: Number, default: 1.30 },

    // ═══ Expense Eligibility Flags ═══
    smer_eligible: { type: Boolean, default: false },
    perdiem_engagement_threshold_full: { type: Number, default: 8 },
    perdiem_engagement_threshold_half: { type: Number, default: 3 },
    logbook_eligible: { type: Boolean, default: false },
    vehicle_type: {
      type: String,
      enum: ['CAR', 'MOTORCYCLE', 'COMPANY_CAR', 'NONE'],
      default: 'NONE',
    },
    ore_eligible: { type: Boolean, default: false },
    access_eligible: { type: Boolean, default: false },
    calf_override: { type: Boolean, default: false },    // Bypass CALF requirement
    crm_linked: { type: Boolean, default: false },

    // ═══ Tax Status ═══
    tax_status: {
      type: String,
      enum: ['S', 'S1', 'S2', 'ME', 'ME1', 'ME2', 'ME3', 'ME4'],
      default: 'S',
    },

    // ═══ Lifecycle ═══
    status: {
      type: String,
      enum: ['ACTIVE', 'SUPERSEDED'],
      default: 'ACTIVE',
    },
    set_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'erp_comp_profiles',
  }
);

// Pre-save: compute monthly_gross from fixed components
compProfileSchema.pre('save', function (next) {
  this.monthly_gross = Math.round(
    ((this.basic_salary || 0) +
    (this.rice_allowance || 0) +
    (this.clothing_allowance || 0) +
    (this.medical_allowance || 0) +
    (this.laundry_allowance || 0) +
    (this.transport_allowance || 0)) * 100
  ) / 100;
  next();
});

// Static: get active comp profile for a person
compProfileSchema.statics.getActiveProfile = async function (personId) {
  return this.findOne({ person_id: personId, status: 'ACTIVE' })
    .sort({ effective_date: -1 })
    .lean();
};

compProfileSchema.index({ person_id: 1, effective_date: -1 });
compProfileSchema.index({ entity_id: 1, status: 1 });

module.exports = mongoose.model('CompProfile', compProfileSchema);
