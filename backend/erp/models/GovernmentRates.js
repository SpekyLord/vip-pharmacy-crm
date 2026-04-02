const mongoose = require('mongoose');

const bracketSchema = new mongoose.Schema({
  min_salary: { type: Number, required: true },
  max_salary: { type: Number }, // null = no upper limit
  employee_share: { type: Number, required: true },
  employer_share: { type: Number, required: true },
  ec: { type: Number, default: 0 } // Employees Compensation (employer-only, SSS)
}, { _id: false });

const benefitLimitSchema = new mongoose.Schema({
  benefit_code: { type: String, required: true },
  description: { type: String },
  limit_amount: { type: Number, required: true },
  limit_period: { type: String } // e.g., 'MONTHLY', 'YEARLY'
}, { _id: false });

const governmentRatesSchema = new mongoose.Schema({
  rate_type: {
    type: String,
    enum: ['SSS', 'PHILHEALTH', 'PAGIBIG', 'WITHHOLDING_TAX', 'EC', 'DE_MINIMIS'],
    required: true
  },
  effective_date: {
    type: Date,
    required: true
  },
  expiry_date: {
    type: Date,
    default: null // null = currently active
  },

  // Bracket-based rates (SSS, withholding tax)
  brackets: [bracketSchema],

  // Flat-rate (PhilHealth, PagIBIG)
  flat_rate: { type: Number },
  employee_split: { type: Number }, // e.g., 0.50 for 50/50
  employer_split: { type: Number },
  min_contribution: { type: Number },
  max_contribution: { type: Number },

  // De minimis benefit limits
  benefit_limits: [benefitLimitSchema],

  // Metadata
  set_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: { type: String },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_government_rates'
});

// Indexes
governmentRatesSchema.index({ rate_type: 1, effective_date: -1 });
governmentRatesSchema.index({ rate_type: 1, expiry_date: 1 });

// Static: get currently active rate for a type
governmentRatesSchema.statics.getActiveRate = async function (rateType) {
  return this.findOne({
    rate_type: rateType,
    effective_date: { $lte: new Date() },
    $or: [
      { expiry_date: null },
      { expiry_date: { $gt: new Date() } }
    ]
  }).sort({ effective_date: -1 });
};

module.exports = mongoose.model('GovernmentRates', governmentRatesSchema);
