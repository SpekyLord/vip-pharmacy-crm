/**
 * mdProductRebateController — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * CRUD for MdProductRebate (Tier-A per-MD per-product %). Role-gated via
 * lookup-driven REBATE_ROLES.MANAGE_MD_MATRIX (rebateCommissionAccess.js).
 * The schema's 3-gate validator (PARTNER status + agreement date + max-pct
 * ceiling) runs on every save; we surface its error message verbatim back
 * to the admin UI so the failure mode is self-explanatory.
 */

const mongoose = require('mongoose');
const MdProductRebate = require('../models/MdProductRebate');
const Doctor = require('../../models/Doctor');
const { catchAsync, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const { userHasRebateRole } = require('../../utils/rebateCommissionAccess');

async function requireManage(req) {
  if (!isAdminLike(req.user?.role)) {
    const ok = await userHasRebateRole(req, 'MANAGE_MD_MATRIX');
    if (!ok) {
      throw new ForbiddenError(
        'MANAGE_MD_MATRIX role required. Configure via Control Center → Lookup Tables → REBATE_ROLES.'
      );
    }
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
  // Privileged users may pass ?entity_id= to view another tenant's matrix
  // (Rule #21 — explicit opt-in, never silent fallback to caller's id).
  const filter = {};
  if (req.query.entity_id && (req.isPresident || req.isAdmin || req.isFinance)) {
    if (!mongoose.Types.ObjectId.isValid(req.query.entity_id)) {
      throw new ForbiddenError('entity_id query param must be a valid ObjectId');
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
  if (req.query.product_id && mongoose.Types.ObjectId.isValid(req.query.product_id)) {
    filter.product_id = new mongoose.Types.ObjectId(req.query.product_id);
  }
  if (req.query.is_active !== undefined) {
    filter.is_active = req.query.is_active === 'true';
  }
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const skip = parseInt(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    MdProductRebate.find(filter).sort({ doctor_id: 1, createdAt: -1 }).limit(limit).skip(skip).lean(),
    MdProductRebate.countDocuments(filter),
  ]);
  // Enrich with doctor names for UI without forcing a populate (cross-doc).
  const docIds = [...new Set(rows.map(r => String(r.doctor_id)))];
  const docs = docIds.length
    ? await Doctor.find({ _id: { $in: docIds } })
        .select('firstName lastName partnership_status partner_agreement_date')
        .lean()
    : [];
  const docMap = new Map(docs.map(d => [String(d._id), d]));
  const enriched = rows.map(r => ({
    ...r,
    doctor: docMap.get(String(r.doctor_id)) || null,
  }));
  res.json({ success: true, data: enriched, pagination: { total, limit, skip } });
});

const getById = catchAsync(async (req, res) => {
  await requireView(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await MdProductRebate.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

const create = catchAsync(async (req, res) => {
  await requireManage(req);
  const body = req.body || {};
  // Force entity_id from req scope (privileged callers may pass it explicitly)
  const entity_id = (req.isPresident || req.isAdmin || req.isFinance) && body.entity_id
    ? body.entity_id : req.entityId;
  try {
    const row = await MdProductRebate.create({
      ...body,
      entity_id,
      created_by: req.user._id,
    });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    // Schema 3-gate errors are user-facing; surface as 400.
    return res.status(400).json({ success: false, message: err.message });
  }
});

const update = catchAsync(async (req, res) => {
  await requireManage(req);
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await MdProductRebate.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  // Only allow safe fields to be updated; never touch entity/doctor/product
  // (those define the matrix slot — change = deactivate + re-create).
  const allowed = ['rebate_pct', 'effective_from', 'effective_to', 'is_active', 'notes', 'product_label'];
  for (const k of allowed) {
    if (k in req.body) row[k] = req.body[k];
  }
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
  const row = await MdProductRebate.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  row.is_active = false;
  row.effective_to = row.effective_to || new Date();
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

module.exports = { list, getById, create, update, deactivate };
