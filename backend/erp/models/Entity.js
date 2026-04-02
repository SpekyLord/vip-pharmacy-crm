const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema({
  entity_name: {
    type: String,
    required: [true, 'Entity name is required'],
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
  }
}, {
  timestamps: true
});

// Indexes
entitySchema.index({ entity_type: 1 });
entitySchema.index({ status: 1 });
entitySchema.index({ parent_entity_id: 1 });

module.exports = mongoose.model('Entity', entitySchema);
