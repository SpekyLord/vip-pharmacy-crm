const mongoose = require('mongoose');

const peopleMasterSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
    },
    person_type: {
      type: String,
      enum: ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'SALES_REP', 'CONSULTANT', 'DIRECTOR'],
      required: [true, 'Person type is required'],
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ═══ Name ═══
    full_name: { type: String, required: [true, 'Full name is required'], trim: true },
    first_name: { type: String, required: [true, 'First name is required'], trim: true },
    last_name: { type: String, required: [true, 'Last name is required'], trim: true },

    // ═══ Position ═══
    position: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },

    // ═══ Employment ═══
    employment_type: {
      type: String,
      enum: ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CONSULTANT', 'PARTNERSHIP'],
      default: 'PROBATIONARY',
    },
    date_hired: { type: Date },
    date_regularized: { type: Date },
    date_separated: { type: Date },
    date_of_birth: { type: Date },

    // ═══ Civil Status ═══
    civil_status: {
      type: String,
      enum: ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'],
      default: 'SINGLE',
    },

    // ═══ Government IDs (sensitive) ═══
    government_ids: {
      sss_no: { type: String, select: false },
      philhealth_no: { type: String, select: false },
      pagibig_no: { type: String, select: false },
      tin: { type: String, select: false },
    },

    // ═══ Bank Account (sensitive) ═══
    bank_account: {
      bank: { type: String, select: false },
      account_no: { type: String, select: false },
      account_name: { type: String, select: false },
    },

    // ═══ Compensation Link ═══
    comp_profile_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompProfile',
      default: null,
    },

    // ═══ Status ═══
    is_active: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED'],
      default: 'ACTIVE',
    },

    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    collection: 'erp_people_master',
  }
);

peopleMasterSchema.index({ entity_id: 1, person_type: 1 });
peopleMasterSchema.index({ entity_id: 1, is_active: 1 });
peopleMasterSchema.index({ user_id: 1 }, { sparse: true });
peopleMasterSchema.index({ entity_id: 1, full_name: 'text' });

module.exports = mongoose.model('PeopleMaster', peopleMasterSchema);
