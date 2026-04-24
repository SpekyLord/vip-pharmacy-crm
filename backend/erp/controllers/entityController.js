const Entity = require('../models/Entity');
const { catchAsync } = require('../../middleware/errorHandler');
const { invalidateEntityCodeCache } = require('../services/docNumbering');
const { compressImage } = require('../../middleware/upload');
const { uploadClmBranding } = require('../../config/s3');

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
  // Sanitize ObjectId fields — empty string → null
  if (updates.managed_by === '' || updates.managed_by === 'null') updates.managed_by = null;
  // Non-president users can only update their own entity
  const filter = { _id: req.params.id };
  if (!req.isPresident && req.entityId) {
    filter._id = req.entityId.toString() === req.params.id ? req.params.id : null;
    if (!filter._id) return res.status(403).json({ success: false, message: 'Cannot update another entity' });
  }
  const entity = await Entity.findByIdAndUpdate(filter._id, { $set: updates }, { new: true, runValidators: true });
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found' });
  // Bust the JE-number code cache if short_name changed — new JEs must pick
  // up the renamed code immediately instead of waiting for process restart.
  if ('short_name' in updates) invalidateEntityCodeCache(entity._id);
  res.json({ success: true, data: entity });
});

// ─────────────────────────────────────────────────────────────────────
// Phase 5 / PR1 — CLM Branding (per-entity pitch deck identity + slides)
// ─────────────────────────────────────────────────────────────────────

exports.getClmBranding = catchAsync(async (req, res) => {
  const entity = await Entity.findById(req.params.id).select('clmBranding').lean();
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found' });
  res.json({ success: true, data: entity.clmBranding || {} });
});

exports.updateClmBranding = catchAsync(async (req, res) => {
  const entity = await Entity.findById(req.params.id);
  if (!entity) return res.status(404).json({ success: false, message: 'Entity not found' });
  entity.clmBranding = entity.clmBranding || {};

  // Non-president users can only update their own entity (match `update` policy).
  if (!req.isPresident && req.entityId && req.entityId.toString() !== req.params.id) {
    return res.status(403).json({ success: false, message: 'Cannot update branding of another entity' });
  }

  // Identity text fields (validated by Mongoose maxlength + match on save).
  const identityKeys = ['primaryColor', 'companyName', 'websiteUrl', 'salesEmail', 'phone'];
  for (const key of identityKeys) {
    if (req.body[key] !== undefined) {
      entity.clmBranding[key] = req.body[key] || undefined;
    }
  }

  // Slide body text arrives as a JSON-stringified `slides` field because
  // FormData can't represent nested objects natively.
  if (req.body.slides !== undefined) {
    try {
      const parsed = typeof req.body.slides === 'string' ? JSON.parse(req.body.slides) : req.body.slides;
      entity.clmBranding.slides = parsed || undefined;
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid slides payload — must be valid JSON.' });
    }
  }

  // Logo uploads — logoCircle + logoTrademark (multer `upload.fields`).
  const circle = req.files?.logoCircle?.[0];
  const trademark = req.files?.logoTrademark?.[0];
  if (circle) {
    const { buffer, mimetype } = await compressImage(circle.buffer, circle.mimetype, { maxDim: 600, quality: 85 });
    const { url } = await uploadClmBranding(buffer, entity._id.toString(), 'logoCircle', mimetype);
    entity.clmBranding.logoCircleUrl = url;
  }
  if (trademark) {
    const { buffer, mimetype } = await compressImage(trademark.buffer, trademark.mimetype, { maxDim: 600, quality: 85 });
    const { url } = await uploadClmBranding(buffer, entity._id.toString(), 'logoTrademark', mimetype);
    entity.clmBranding.logoTrademarkUrl = url;
  }

  await entity.save();
  res.json({ success: true, data: entity.clmBranding });
});
