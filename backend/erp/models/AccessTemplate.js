const mongoose = require('mongoose');

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
    // Module access levels — lookup-driven (Phase A)
    // Keys are ERP_MODULE codes (lowercase), values are NONE | VIEW | FULL
    // Stored as Mixed so new modules added via Lookup are accepted without schema change
    modules: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      validate: {
        validator: function (v) {
          if (!v || typeof v !== 'object') return true;
          return Object.values(v).every(val => ['NONE', 'VIEW', 'FULL'].includes(val));
        },
        message: 'Module access levels must be NONE, VIEW, or FULL',
      },
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
