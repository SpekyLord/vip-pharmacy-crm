/**
 * CreditCard Controller — CRUD + assignment
 */
const CreditCard = require('../models/CreditCard');
const { catchAsync } = require('../../middleware/errorHandler');

// ═══ List all cards (optionally filter by assigned_to, card_type) ═══
const listCards = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.assigned_to) filter.assigned_to = req.query.assigned_to;
  if (req.query.card_type) filter.card_type = req.query.card_type;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

  const cards = await CreditCard.find(filter)
    .populate('assigned_to', 'name email')
    .sort({ card_code: 1 })
    .lean();

  res.json({ success: true, data: cards });
});

// ═══ Get cards accessible to current user ═══
// Admin/president/finance see all entity cards; BDMs see only assigned cards
const getMyCards = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId, is_active: true };
  const privileged = ['admin', 'president', 'finance', 'ceo'].includes(req.user.role);
  if (!privileged) {
    filter.assigned_to = req.user._id;
  }
  const cards = await CreditCard.find(filter)
    .sort({ card_type: 1, card_name: 1 }).lean();

  res.json({ success: true, data: cards });
});

// ═══ Create card ═══
const createCard = catchAsync(async (req, res) => {
  const card = await CreditCard.create({
    entity_id: req.entityId,
    ...req.body,
    assigned_by: req.body.assigned_to ? req.user._id : undefined,
    assigned_at: req.body.assigned_to ? new Date() : undefined
  });
  res.status(201).json({ success: true, data: card });
});

// ═══ Update card ═══
const updateCard = catchAsync(async (req, res) => {
  const card = await CreditCard.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!card) return res.status(404).json({ success: false, message: 'Card not found' });

  const allowed = ['card_name', 'card_holder', 'bank', 'card_type', 'card_brand', 'last_four', 'coa_code', 'credit_limit', 'statement_cycle_day', 'is_active'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) card[field] = req.body[field];
  }

  // Handle assignment change
  if (req.body.assigned_to !== undefined) {
    card.assigned_to = req.body.assigned_to || null;
    card.assigned_by = req.user._id;
    card.assigned_at = new Date();
  }

  await card.save();
  res.json({ success: true, data: card });
});

// ═══ Delete (deactivate) card ═══
const deleteCard = catchAsync(async (req, res) => {
  const card = await CreditCard.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!card) return res.status(404).json({ success: false, message: 'Card not found' });

  card.is_active = false;
  await card.save();
  res.json({ success: true, message: `Card ${card.card_code} deactivated` });
});

module.exports = { listCards, getMyCards, createCard, updateCard, deleteCard };
