/**
 * commissionPayoutController — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * Read-only ledger + status-transition endpoints for CommissionPayout.
 * Lookup-driven role gates via COMMISSION_ROLES.VIEW_PAYOUTS / MANAGE_RULES /
 * OVERRIDE_AUTO_RATES. No create — rows are written by ecommCommissionEngine
 * and (future) collectionController commission-bridge writes.
 */

const mongoose = require('mongoose');
const CommissionPayout = require('../models/CommissionPayout');
const User = require('../../models/User');
const { catchAsync, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const { userHasCommissionRole } = require('../../utils/rebateCommissionAccess');

async function requireGate(req, code) {
  if (isAdminLike(req.user?.role)) return;
  const ok = await userHasCommissionRole(req, code);
  if (!ok) throw new ForbiddenError(`${code} role required (COMMISSION_ROLES)`);
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
  await requireGate(req, 'VIEW_PAYOUTS');
  const filter = buildEntityFilter(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.payee_id && mongoose.Types.ObjectId.isValid(req.query.payee_id)) {
    filter.payee_id = new mongoose.Types.ObjectId(req.query.payee_id);
  }
  if (req.query.payee_role) filter.payee_role = req.query.payee_role;
  if (req.query.period) filter.period = req.query.period;
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const skip = parseInt(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    CommissionPayout.find(filter).sort({ period: -1, payee_id: 1, createdAt: -1 }).limit(limit).skip(skip).lean(),
    CommissionPayout.countDocuments(filter),
  ]);
  const ids = [...new Set(rows.map(r => String(r.payee_id)))];
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('name email').lean() : [];
  const map = new Map(users.map(u => [String(u._id), u]));
  res.json({
    success: true,
    data: rows.map(r => ({ ...r, payee: map.get(String(r.payee_id)) || null })),
    pagination: { total, limit, skip },
  });
});

const summary = catchAsync(async (req, res) => {
  await requireGate(req, 'VIEW_PAYOUTS');
  const filter = buildEntityFilter(req);
  if (req.query.period) filter.period = req.query.period;
  const agg = await CommissionPayout.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { status: '$status', payee_role: '$payee_role' },
        total_amount: { $sum: '$commission_amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.status': 1, '_id.payee_role': 1 } },
  ]);
  res.json({ success: true, data: agg });
});

const getById = catchAsync(async (req, res) => {
  await requireGate(req, 'VIEW_PAYOUTS');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await CommissionPayout.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

module.exports = { list, summary, getById };
