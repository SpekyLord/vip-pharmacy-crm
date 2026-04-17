/**
 * CreditCard Controller — CRUD + assignment
 */
const CreditCard = require('../models/CreditCard');
const { catchAsync } = require('../../middleware/errorHandler');
const XLSX = require('xlsx');
const { validateCoaCode } = require('../utils/validateCoaCode');

const normalizeAssignments = (body = {}) => {
  const assignedUsers = Array.isArray(body.assigned_users)
    ? [...new Set(body.assigned_users.filter(Boolean).map(String))]
    : undefined;
  const legacyAssignedTo = body.assigned_to ? String(body.assigned_to) : null;

  if (assignedUsers !== undefined) {
    return {
      assigned_users: assignedUsers,
      assigned_to: assignedUsers[0] || legacyAssignedTo || null,
      assignmentTouched: true
    };
  }

  if (body.assigned_to !== undefined) {
    return {
      assigned_users: legacyAssignedTo ? [legacyAssignedTo] : [],
      assigned_to: legacyAssignedTo,
      assignmentTouched: true
    };
  }

  return { assignmentTouched: false };
};

// ═══ List all cards (optionally filter by assigned_to, card_type) ═══
const listCards = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.assigned_to) {
    filter.$or = [
      { assigned_to: req.query.assigned_to },
      { assigned_users: req.query.assigned_to }
    ];
  }
  if (req.query.card_type) filter.card_type = req.query.card_type;
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

  const cards = await CreditCard.find(filter)
    .populate('assigned_to', 'name email')
    .populate('assigned_users', 'name email')
    .sort({ card_code: 1 })
    .lean();

  res.json({ success: true, data: cards });
});

// ═══ Get cards accessible to current user ═══
// Admin/president/finance see all entity cards; BDMs see cards assigned to them
const getMyCards = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId, is_active: true };
  const privileged = ['admin', 'president', 'finance', 'ceo'].includes(req.user.role);
  if (!privileged) {
    filter.$or = [
      { assigned_to: req.user._id },
      { assigned_users: req.user._id }
    ];
  }
  const cards = await CreditCard.find(filter)
    .sort({ card_type: 1, card_name: 1 }).lean();

  res.json({ success: true, data: cards });
});

// ═══ Create card ═══
const createCard = catchAsync(async (req, res) => {
  // Validate COA code
  if (req.body.coa_code) {
    const coaCheck = await validateCoaCode(req.body.coa_code, req.entityId);
    if (!coaCheck.valid) return res.status(400).json({ success: false, message: coaCheck.message });
  }
  const assignment = normalizeAssignments(req.body);
  const card = await CreditCard.create({
    entity_id: req.entityId,
    ...req.body,
    ...(assignment.assignmentTouched ? assignment : {}),
    assigned_by: assignment.assignmentTouched && (assignment.assigned_users?.length || assignment.assigned_to) ? req.user._id : undefined,
    assigned_at: assignment.assignmentTouched && (assignment.assigned_users?.length || assignment.assigned_to) ? new Date() : undefined
  });
  res.status(201).json({ success: true, data: card });
});

// ═══ Update card ═══
const updateCard = catchAsync(async (req, res) => {
  const card = await CreditCard.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!card) return res.status(404).json({ success: false, message: 'Card not found' });

  // Validate COA code if being updated
  if (req.body.coa_code) {
    const coaCheck = await validateCoaCode(req.body.coa_code, req.entityId);
    if (!coaCheck.valid) return res.status(400).json({ success: false, message: coaCheck.message });
  }

  const allowed = ['card_name', 'card_holder', 'bank', 'card_type', 'card_brand', 'last_four', 'coa_code', 'credit_limit', 'statement_cycle_day', 'is_active'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) card[field] = req.body[field];
  }

  const assignment = normalizeAssignments(req.body);
  if (assignment.assignmentTouched) {
    card.assigned_users = assignment.assigned_users;
    card.assigned_to = assignment.assigned_to;
    if (assignment.assigned_users?.length || assignment.assigned_to) {
      card.assigned_by = req.user._id;
      card.assigned_at = new Date();
    } else {
      card.assigned_by = undefined;
      card.assigned_at = undefined;
    }
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

// ═══ Export Credit Cards (Excel) ═══
const exportCards = catchAsync(async (req, res) => {
  const cards = await CreditCard.find({ entity_id: req.entityId }).sort({ card_code: 1 }).lean();
  const rows = cards.map(c => ({
    'Card Code': c.card_code || '',
    'Card Name': c.card_name || '',
    'Card Holder': c.card_holder || '',
    'Bank': c.bank || '',
    'Card Type': c.card_type || '',
    'Card Brand': c.card_brand || '',
    'Last Four': c.last_four || '',
    'COA Code': c.coa_code || '',
    'Credit Limit': c.credit_limit || 0,
    'Statement Cycle Day': c.statement_cycle_day || '',
    'Active': c.is_active !== false ? 'YES' : 'NO'
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Credit Cards');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="credit-cards-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

module.exports = { listCards, getMyCards, createCard, updateCard, deleteCard, exportCards };
