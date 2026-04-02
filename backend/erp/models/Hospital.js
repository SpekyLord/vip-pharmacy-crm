const mongoose = require('mongoose');
const { cleanName } = require('../utils/nameClean');

const taggedBdmSchema = new mongoose.Schema({
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tagged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tagged_at: { type: Date, default: Date.now },
  is_active: { type: Boolean, default: true }
}, { _id: false });

const hospitalSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity'
    // Optional — hospitals are globally shared across all entities (Phase 4A.3)
  },
  hospital_name: {
    type: String,
    required: [true, 'Hospital name is required'],
    trim: true
  },
  hospital_name_clean: {
    type: String
    // Indexed via schema.index() below — do NOT use `index: true` here to avoid duplicate warning
  },

  // Aliases for OCR fuzzy matching (same pattern as VendorMaster.vendor_aliases, ProductMaster.product_aliases)
  hospital_aliases: { type: [String], default: [] },

  // Financial fields
  tin: { type: String, trim: true },
  payment_terms: { type: Number, default: 30 },
  vat_status: {
    type: String,
    enum: ['VATABLE', 'EXEMPT', 'ZERO'],
    default: 'VATABLE'
  },
  cwt_rate: { type: Number, default: 0.01 },
  atc_code: { type: String, default: 'WC158' },
  credit_limit: { type: Number, default: null },
  credit_limit_action: {
    type: String,
    enum: ['WARN', 'BLOCK'],
    default: 'WARN'
  },
  is_top_withholding_agent: { type: Boolean, default: false },

  // HEAT fields (Hospital Engagement Assessment Tool)
  hospital_type: { type: String, trim: true },
  bed_capacity: { type: Number },
  level: { type: String, trim: true },
  purchaser_name: { type: String, trim: true },
  purchaser_phone: { type: String, trim: true },
  chief_pharmacist_name: { type: String, trim: true },
  chief_pharmacist_phone: { type: String, trim: true },
  key_decision_maker: { type: String, trim: true },
  engagement_level: { type: Number, min: 1, max: 5 },
  major_events: {
    type: [String],
    validate: [arr => arr.length <= 3, 'Maximum 3 major events']
  },
  programs_to_level_5: { type: String, trim: true },

  // Address
  address: { type: String, trim: true },
  contact_person: { type: String, trim: true },

  // BDM tagging
  tagged_bdms: [taggedBdmSchema],

  // Status
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE'
  }
}, {
  timestamps: true,
  collection: 'erp_hospitals'
});

// Auto-generate hospital_name_clean on save
hospitalSchema.pre('save', function (next) {
  if (this.isModified('hospital_name')) {
    this.hospital_name_clean = cleanName(this.hospital_name);
  }
  next();
});

hospitalSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.$set?.hospital_name || update.hospital_name) {
    const name = update.$set?.hospital_name || update.hospital_name;
    if (update.$set) update.$set.hospital_name_clean = cleanName(name);
    else update.hospital_name_clean = cleanName(name);
  }
  next();
});

// Indexes — hospital_name_clean is globally unique (Phase 4A.3)
hospitalSchema.index({ status: 1 });
hospitalSchema.index({ hospital_name_clean: 1 }, { unique: true });
hospitalSchema.index({ 'tagged_bdms.bdm_id': 1 });
hospitalSchema.index({ hospital_name: 'text', hospital_aliases: 'text' });

module.exports = mongoose.model('Hospital', hospitalSchema);
