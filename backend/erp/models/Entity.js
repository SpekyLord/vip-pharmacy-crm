const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
  entity_name: {
    type: String,
    required: [true, 'Entity name is required'],
    trim: true
  },
  short_name: {
    type: String,
    trim: true
  },
  tin: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  vat_registered: {
    type: Boolean,
    default: false
  },
  entity_type: {
    type: String,
    enum: ['PARENT', 'SUBSIDIARY'],
    required: true
  },
  parent_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    default: null
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE'
  },

  // Entity management — who runs this entity
  managed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
    default: null,
  },

  // Branding (Phase 4B.7)
  brand_color: { type: String, default: '#6B7280' },
  brand_text_color: { type: String, default: '#FFFFFF' },
  logo_url: { type: String },
  tagline: { type: String, trim: true }
}, {
  timestamps: true
});

// Indexes
entitySchema.index({ entity_type: 1 });
entitySchema.index({ status: 1 });
entitySchema.index({ parent_entity_id: 1 });

module.exports = mongoose.model('Entity', entitySchema);
