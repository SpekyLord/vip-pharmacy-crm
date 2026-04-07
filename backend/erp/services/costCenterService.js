/**
 * Cost Center Service — SAP CO Cost Centers (Phase 15.5)
 */
const mongoose = require('mongoose');
const CostCenter = require('../models/CostCenter');

/**
 * Create a cost center
 */
async function createCostCenter(entityId, data, userId) {
  const eId = new mongoose.Types.ObjectId(entityId);

  // Validate parent exists if specified
  if (data.parent_cost_center) {
    const parent = await CostCenter.findOne({
      _id: data.parent_cost_center,
      entity_id: eId
    });
    if (!parent) {
      throw Object.assign(new Error('Parent cost center not found'), { statusCode: 400 });
    }
  }

  const cc = await CostCenter.create({
    entity_id: eId,
    code: data.code,
    name: data.name,
    parent_cost_center: data.parent_cost_center || null,
    description: data.description || '',
    created_by: userId
  });

  return cc;
}

/**
 * Get all cost centers (flat list)
 */
async function getCostCenters(entityId, filters = {}) {
  const query = { entity_id: new mongoose.Types.ObjectId(entityId) };
  if (!filters.include_inactive) query.is_active = true;

  const centers = await CostCenter.find(query)
    .populate('parent_cost_center', 'code name')
    .sort({ code: 1 })
    .lean();

  return centers;
}

/**
 * Update a cost center
 */
async function updateCostCenter(costCenterId, updates, userId) {
  const allowedFields = ['name', 'parent_cost_center', 'description', 'is_active'];
  const updateData = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) updateData[field] = updates[field];
  }

  const cc = await CostCenter.findByIdAndUpdate(costCenterId, updateData, { new: true }).lean();
  if (!cc) throw Object.assign(new Error('Cost center not found'), { statusCode: 404 });
  return cc;
}

/**
 * Get hierarchical tree structure
 */
async function getCostCenterTree(entityId) {
  const centers = await CostCenter.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    is_active: true
  }).sort({ code: 1 }).lean();

  // Build tree
  const map = new Map(centers.map(c => [c._id.toString(), { ...c, children: [] }]));
  const roots = [];

  for (const c of centers) {
    const node = map.get(c._id.toString());
    if (c.parent_cost_center) {
      const parent = map.get(c.parent_cost_center.toString());
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

module.exports = {
  createCostCenter,
  getCostCenters,
  updateCostCenter,
  getCostCenterTree
};
