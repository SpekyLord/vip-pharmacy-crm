const Entity = require('../models/Entity');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * Entity CRUD Controller — Phase 24
 * Allows president/admin to manage entities (parent + subsidiaries).
 */

exports.getAll = catchAsync(async (req, res) => {
  const entities = await Entity.find()
    .populate('managed_by', 'full_name position person_type')
    .sort({ entity_type: 1, entity_name: 1 })
    .lean();
  res.json({ success: true, data: entities });
});

exports.getById = catchAsync(async (req, res) => {
  const entity = await Entity.findById(req.params.id).populate('managed_by', 'full_name position person_type').lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found' });
  res.json({ success: true, data: entity });
});

exports.create = catchAsync(async (req, res) => {
  const { entity_name, short_name, tin, address, vat_registered, entity_type, parent_entity_id, brand_color, brand_text_color, tagline, managed_by } = req.body;
  const entity = await Entity.create({
    entity_name, short_name, tin, address, vat_registered,
    entity_type: entity_type || 'SUBSIDIARY',
    parent_entity_id: parent_entity_id || null,
    managed_by: managed_by || null,
    brand_color, brand_text_color, tagline
  });
  res.status(201).json({ success: true, data: entity });
});

exports.update = catchAsync(async (req, res) => {
  const allowed = ['entity_name', 'short_name', 'tin', 'address', 'vat_registered', 'status', 'brand_color', 'brand_text_color', 'tagline', 'logo_url', 'managed_by'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  // Non-president users can only update their own entity
  const filter = { _id: req.params.id };
  if (!req.isPresident && req.entityId) {
    filter._id = req.entityId.toString() === req.params.id ? req.params.id : null;
    if (!filter._id) return res.status(403).json({ success: false, message: 'Cannot update another entity' });
  }
  const entity = await Entity.findByIdAndUpdate(filter._id, { $set: updates }, { new: true, runValidators: true });
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found' });
  res.json({ success: true, data: entity });
});
