const mongoose = require('mongoose');

/**
 * Generic Lookup Model — Phase 24
 *
 * Stores configurable dropdown values by category.
 * Replaces hardcoded frontend arrays with database-driven lookups.
 * Entity-scoped so each entity can customize its own lookups.
 */
const lookupSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    uppercase: true,
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Code is required'],
    uppercase: true,
    trim: true
  },
  label: {
    type: String,
    required: [true, 'Label is required'],
    trim: true
  },
  sort_order: {
    type: Number,
    default: 0
  },
  is_active: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'erp_lookups'
});

lookupSchema.index({ entity_id: 1, category: 1, code: 1 }, { unique: true });
lookupSchema.index({ entity_id: 1, category: 1, is_active: 1, sort_order: 1 });

module.exports = mongoose.model('Lookup', lookupSchema);
