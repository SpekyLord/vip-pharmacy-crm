/**
 * nonMdPartnerRebateRuleController — Phase VIP-1.B / Phase R1 (Apr 2026)
 *
 * CRUD for NonMdPartnerRebateRule (per-partner matrix for pharmacist /
 * hospital staff / non-MD partners). Lookup-driven role gate via
 * REBATE_ROLES.MANAGE_NONMD_MATRIX.
 *
 * Phase R1 (Apr 29 2026): match grain simplified to per-(partner ×
 * hospital). Customer / product_code / priority dimensions removed —
 * calculation_mode is the new variation axis (EXCLUDE_MD_COVERED default
 * vs TOTAL_COLLECTION). Multiple rules at the same key all earn full %
 * independently; the walker returns all matches.
 */

const mongoose = require('mongoose');
const NonMdPartnerRebateRule = require('../models/NonMdPartnerRebateRule');
const Doctor = require('../../models/Doctor');
const { catchAsync, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const { userHasRebateRole } = require('../../utils/rebateCommissionAccess');
// Phase E1 (May 2026) — referential consistency check: partner.entity_ids must
// contain rule.entity_id. Closes the cross-entity ghost-rule footgun (admin
// in entity A picks a partner only covered in entity B → rule never fires).
const { assertPartnerInEntity } = require('../utils/rebatePartnerEntityScope');

async function requireManage(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasRebateRole(req, 'MANAGE_NONMD_MATRIX');
    if (!ok) throw new ForbiddenError('MANAGE_NONMD_MATRIX role required');
  }
}

async function requireView(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasRebateRole(req, 'VIEW_PAYOUTS') ||
               await userHasRebateRole(req, 'MANAGE_NONMD_MATRIX');
    if (!ok) throw new ForbiddenError('VIEW_PAYOUTS or MANAGE_NONMD_MATRIX required');
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
  if (req.query.partner_id && mongoose.Types.ObjectId.isValid(req.query.partner_id)) {
    filter.partner_id = new mongoose.Types.ObjectId(req.query.partner_id);
  }
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const skip = parseInt(req.query.skip) || 0;
  // Phase R1: dropped 'priority' — sort by partner_id, then most-recent first.
  const [rows, total] = await Promise.all([
    NonMdPartnerRebateRule.find(filter).sort({ partner_id: 1, createdAt: -1 }).limit(limit).skip(skip).lean(),
    NonMdPartnerRebateRule.countDocuments(filter),
  ]);
  // Enrich partner names (Doctor model — partner_tags reuse the Doctor coll for non-MDs).
  const ids = [...new Set(rows.map(r => String(r.partner_id)))];
  const partners = ids.length
    ? await Doctor.find({ _id: { $in: ids } }).select('firstName lastName').lean()
    : [];
  const map = new Map(partners.map(p => [String(p._id), p]));
  res.json({
    success: true,
    data: rows.map(r => ({ ...r, partner: map.get(String(r.partner_id)) || null })),
    pagination: { total, limit, skip },
  });
});

const getById = catchAsync(async (req, res) => {
  await requireView(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await NonMdPartnerRebateRule.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

const create = catchAsync(async (req, res) => {
  await requireManage(req);
  const body = req.body || {};
  const entity_id = (req.isPresident || req.isAdmin || req.isFinance) && body.entity_id
    ? body.entity_id : req.entityId;

  // Phase E1 — referential consistency check (partner ↔ entity).
  // Throws ValidationError with structured `code` so the frontend modal can
  // surface a precise error message ("This partner has no BDM coverage in
  // your working entity"). Skipping the check would let an admin in entity
  // A save a rule against a partner whose only BDM works in entity B — the
  // rule would be saved with the right entity_id but the rebate engine
  // would never fire (Collection.entity_id ↔ rule.entity_id matches but
  // partner.entity_ids does not include rule.entity_id, so this is a
  // ghost rule that wastes admin time and is hard to diagnose later).
  try {
    await assertPartnerInEntity(body.partner_id, entity_id);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
      code: err.code || 'PARTNER_ENTITY_VALIDATION_FAILED',
      details: err.details,
    });
  }

  try {
    const row = await NonMdPartnerRebateRule.create({ ...body, entity_id, created_by: req.user._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

const update = catchAsync(async (req, res) => {
  await requireManage(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await NonMdPartnerRebateRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  // Phase R1: dropped customer_id / product_code / priority. Added calculation_mode.
  const allowed = ['rebate_pct', 'hospital_id', 'calculation_mode', 'effective_from', 'effective_to', 'is_active', 'notes', 'rule_name', 'description', 'partner_name'];
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
  const row = await NonMdPartnerRebateRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  row.is_active = false;
  row.effective_to = row.effective_to || new Date();
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

module.exports = { list, getById, create, update, deactivate };
