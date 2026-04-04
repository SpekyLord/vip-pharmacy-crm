const mongoose = require('mongoose');

const MODULE_ACCESS_ENUM = ['NONE', 'VIEW', 'FULL'];

const modulesSchema = new mongoose.Schema({
  sales:       { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  inventory:   { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  collections: { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  expenses:    { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  reports:     { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  people:      { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  payroll:     { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  accounting:  { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  purchasing:  { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
  banking:     { type: String, enum: MODULE_ACCESS_ENUM, default: 'NONE' },
}, { _id: false });

const accessTemplateSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
    },
    template_name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    modules: {
      type: modulesSchema,
      default: () => ({}),
    },
    can_approve: {
      type: Boolean,
      default: false,
    },
    // Sub-Module Permissions (Phase 16)
    // Dynamic map: { [module]: { [subKey]: Boolean } }
    // When applied to a user, populates user.erp_access.sub_permissions
    sub_permissions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    is_system: {
      type: Boolean,
      default: false,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'erp_access_templates',
  }
);

accessTemplateSchema.index({ entity_id: 1, template_name: 1 }, { unique: true });
accessTemplateSchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('AccessTemplate', accessTemplateSchema);
