/**
 * staffCommissionRuleController — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * CRUD for StaffCommissionRule (BDM + ECOMM_REP + AREA_BDM single matrix).
 * Lookup-driven role gate via COMMISSION_ROLES.MANAGE_RULES.
 *
 * Specificity walk happens at apply-time in matrixWalker.matchStaffCommissionRule.
 * This endpoint is a thin CRUD over the rule rows.
 */

const mongoose = require('mongoose');
const StaffCommissionRule = require('../models/StaffCommissionRule');
const User = require('../../models/User');
const { catchAsync, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const { userHasCommissionRole } = require('../../utils/rebateCommissionAccess');

async function requireManage(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasCommissionRole(req, 'MANAGE_RULES');
    if (!ok) throw new ForbiddenError('MANAGE_RULES role required (COMMISSION_ROLES)');
  }
}

async function requireView(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasCommissionRole(req, 'VIEW_PAYOUTS') ||
               await userHasCommissionRole(req, 'MANAGE_RULES');
    if (!ok) throw new ForbiddenError('VIEW_PAYOUTS or MANAGE_RULES required (COMMISSION_ROLES)');
  }
}

function buildEntityFilter(req) {
  const filter = {};
  if (req.query.entity_id && (req.isPresident || req.isAdmin || req.isFinance)) {
    if (!mongoose.Types.ObjectId.isValid(req.query.entity_id)) {
      throw new ForbiddenError('entity_id must be a valid ObjectId');
    }
    filter.entity_id = new mongoose.Types.ObjectId(req.query.entity_id);
  } else if (req.entityId) {
    filter.entity_id = req.entityId;
  }
  return filter;
}

const list = catchAsync(async (req, res) => {
  await requireView(req);
  const filter = buildEntityFilter(req);
  if (req.query.payee_role && ['BDM', 'ECOMM_REP', 'AREA_BDM'].includes(req.query.payee_role)) {
    filter.payee_role = req.query.payee_role;
  }
  if (req.query.payee_id && mongoose.Types.ObjectId.isValid(req.query.payee_id)) {
    filter.payee_id = new mongoose.Types.ObjectId(req.query.payee_id);
  }
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const skip = parseInt(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    StaffCommissionRule.find(filter).sort({ payee_role: 1, priority: 1, createdAt: -1 }).limit(limit).skip(skip).lean(),
    StaffCommissionRule.countDocuments(filter),
  ]);
  // Enrich payee names from User (BDM/ECOMM_REP/AREA_BDM are all User docs)
  const ids = [...new Set(rows.filter(r => r.payee_id).map(r => String(r.payee_id)))];
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('name email').lean() : [];
  const map = new Map(users.map(u => [String(u._id), u]));
  res.json({
    success: true,
    data: rows.map(r => ({ ...r, payee: r.payee_id ? map.get(String(r.payee_id)) || null : null })),
    pagination: { total, limit, skip },
  });
});

const getById = catchAsync(async (req, res) => {
  await requireView(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await StaffCommissionRule.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

const create = catchAsync(async (req, res) => {
  await requireManage(req);
  const body = req.body || {};
  const entity_id = (req.isPresident || req.isAdmin || req.isFinance) && body.entity_id
    ? body.entity_id : req.entityId;
  try {
    const row = await StaffCommissionRule.create({ ...body, entity_id, created_by: req.user._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

const update = catchAsync(async (req, res) => {
  await requireManage(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await StaffCommissionRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  const allowed = [
    'commission_pct', 'min_amount', 'max_amount', 'payee_id', 'payee_name', 'territory_id',
    'product_code', 'customer_code', 'hospital_id', 'priority', 'effective_from',
    'effective_to', 'is_active', 'notes',
  ];
  for (const k of allowed) if (k in req.body) row[k] = req.body[k];
  try {
    await row.save();
    res.json({ success: true, data: row.toObject() });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

const deactivate = catchAsync(async (req, res) => {
  await requireManage(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await StaffCommissionRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  row.is_active = false;
  row.effective_to = row.effective_to || new Date();
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

module.exports = { list, getById, create, update, deactivate };
