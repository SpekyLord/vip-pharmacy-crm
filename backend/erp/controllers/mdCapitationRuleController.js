/**
 * mdCapitationRuleController — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * CRUD for MdCapitationRule (Tier-B per-MD per-patient capitation, frequency-windowed).
 * Lookup-driven role gate via REBATE_ROLES.MANAGE_MD_MATRIX (capitation is
 * the same payee class as Tier-A, so they share a gate by design).
 *
 * Excluded products view: GET /:id/excluded-products returns the active
 * MdProductRebate product_ids for the same (entity, doctor) — this is the
 * union the rebateAccrualEngine checks at apply-time. Stored
 * excluded_product_ids on the rule itself is denormalized convenience and
 * NOT used by Phase 4 (Phase 2.5 will add a sync job).
 */

const mongoose = require('mongoose');
const MdCapitationRule = require('../models/MdCapitationRule');
const MdProductRebate = require('../models/MdProductRebate');
const Doctor = require('../../models/Doctor');
const { catchAsync, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const { userHasRebateRole } = require('../../utils/rebateCommissionAccess');
const { getActiveTierAProductIds } = require('../services/matrixWalker');

async function requireManage(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasRebateRole(req, 'MANAGE_MD_MATRIX');
    if (!ok) throw new ForbiddenError('MANAGE_MD_MATRIX role required');
  }
}

async function requireView(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasRebateRole(req, 'VIEW_PAYOUTS') ||
               await userHasRebateRole(req, 'MANAGE_MD_MATRIX');
    if (!ok) throw new ForbiddenError('VIEW_PAYOUTS or MANAGE_MD_MATRIX required');
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
  if (req.query.doctor_id && mongoose.Types.ObjectId.isValid(req.query.doctor_id)) {
    filter.doctor_id = new mongoose.Types.ObjectId(req.query.doctor_id);
  }
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const skip = parseInt(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    MdCapitationRule.find(filter).sort({ doctor_id: 1, createdAt: -1 }).limit(limit).skip(skip).lean(),
    MdCapitationRule.countDocuments(filter),
  ]);
  const ids = [...new Set(rows.map(r => String(r.doctor_id)))];
  const docs = ids.length
    ? await Doctor.find({ _id: { $in: ids } })
        .select('firstName lastName partnership_status partner_agreement_date')
        .lean()
    : [];
  const map = new Map(docs.map(d => [String(d._id), d]));
  res.json({
    success: true,
    data: rows.map(r => ({ ...r, doctor: map.get(String(r.doctor_id)) || null })),
    pagination: { total, limit, skip },
  });
});

const getById = catchAsync(async (req, res) => {
  await requireView(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await MdCapitationRule.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

const getExcludedProducts = catchAsync(async (req, res) => {
  await requireView(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await MdCapitationRule.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  const productIds = await getActiveTierAProductIds({
    entity_id: row.entity_id,
    doctor_id: row.doctor_id,
    asOfDate: new Date(),
  });
  // Pull labels from the associated MdProductRebate rows (cached denormalized
  // product_label is the user-facing display per Rule #4 fallback).
  const rebateRows = await MdProductRebate.find({
    entity_id: row.entity_id,
    doctor_id: row.doctor_id,
    product_id: { $in: productIds },
    is_active: true,
  }).select('product_id product_label rebate_pct').lean();
  res.json({ success: true, data: { excluded_product_ids: productIds, products: rebateRows } });
});

const create = catchAsync(async (req, res) => {
  await requireManage(req);
  const body = req.body || {};
  const entity_id = (req.isPresident || req.isAdmin || req.isFinance) && body.entity_id
    ? body.entity_id : req.entityId;
  try {
    const row = await MdCapitationRule.create({ ...body, entity_id, created_by: req.user._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

const update = catchAsync(async (req, res) => {
  await requireManage(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await MdCapitationRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  const allowed = ['rule_name', 'capitation_amount', 'capitation_pct', 'frequency_window', 'effective_from', 'effective_to', 'is_active', 'notes'];
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
  const row = await MdCapitationRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  row.is_active = false;
  row.effective_to = row.effective_to || new Date();
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

module.exports = { list, getById, getExcludedProducts, create, update, deactivate };
