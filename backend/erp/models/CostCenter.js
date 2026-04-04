/**
 * Cost Center Model — SAP CO Cost Centers (Phase 15.5)
 */
const mongoose = require('mongoose');

const costCenterSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true },
  parent_cost_center: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter', default: null },
  description: { type: String, trim: true },
  is_active: { type: Boolean, default: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { timestamps: true, collection: 'erp_cost_centers' });

costCenterSchema.index({ entity_id: 1, code: 1 }, { unique: true });
costCenterSchema.index({ entity_id: 1, parent_cost_center: 1 });
costCenterSchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('CostCenter', costCenterSchema);
