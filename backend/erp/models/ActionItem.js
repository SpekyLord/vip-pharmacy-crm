const mongoose = require('mongoose');

/**
 * ActionItem — Tracked action items tied to growth drivers.
 * Created by president for BDMs or by BDMs for themselves.
 * Links to specific hospitals, products, or doctors via polymorphic ref.
 */

const actionNoteSchema = new mongoose.Schema({
  text:       { type: String, required: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
}, { _id: false });

const actionItemSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Entity is required'],
  },
  plan_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SalesGoalPlan',
    required: [true, 'Plan is required'],
  },
  fiscal_year: { type: Number, required: true },

  // Assigned BDM
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'BDM is required'],
  },
  person_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeopleMaster',
  },

  // Growth driver link
  driver_code: { type: String, default: '' },  // From Lookup GROWTH_DRIVER
  action_type: { type: String, default: '' },  // From Lookup ACTION_TYPE

  // Description
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },
  description: { type: String, trim: true, default: '' },

  // Polymorphic reference (Hospital, ProductMaster, Doctor)
  ref_model: { type: String, default: '' },
  ref_id:    { type: mongoose.Schema.Types.ObjectId },
  ref_label: { type: String, default: '' },  // Denormalized name for display

  // Priority & timeline
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
  },
  due_date: { type: Date },

  // Status
  status: {
    type: String,
    enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'CANCELLED'],
    default: 'TODO',
  },
  completed_at: { type: Date },
  completed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Revenue impact
  estimated_revenue: { type: Number, default: 0 },
  actual_revenue:    { type: Number, default: 0 },

  // Notes thread
  notes: [actionNoteSchema],

  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true,
  collection: 'erp_action_items',
});

actionItemSchema.index({ entity_id: 1, plan_id: 1, bdm_id: 1, status: 1 });
actionItemSchema.index({ entity_id: 1, driver_code: 1, status: 1 });
actionItemSchema.index({ bdm_id: 1, status: 1, due_date: 1 });
actionItemSchema.index({ ref_model: 1, ref_id: 1 });

module.exports = mongoose.model('ActionItem', actionItemSchema);
