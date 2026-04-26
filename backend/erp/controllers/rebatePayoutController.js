/**
 * rebatePayoutController — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * Read-only ledger + status-transition endpoints for RebatePayout.
 * Lookup-driven role gates:
 *   - VIEW_PAYOUTS                  → list / getById / summary
 *   - RUN_MONTHLY_CLOSE             → ACCRUING → READY_TO_PAY (period close)
 *   - MARK_PAID                     → READY_TO_PAY → PAID (after PRF posts)
 *   - All admin-like (admin/finance/president) bypass via isAdminLike fast path
 *
 * No create/update endpoints — RebatePayout rows are only ever written by
 * autoPrfRouting (Collection POST) or rebateAccrualEngine (Order.paid). Manual
 * adjustments must go through the void+re-accrue flow to preserve audit trail.
 */

const mongoose = require('mongoose');
const RebatePayout = require('../models/RebatePayout');
const Doctor = require('../../models/Doctor');
const { catchAsync, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const { userHasRebateRole } = require('../../utils/rebateCommissionAccess');

async function requireGate(req, code) {
  if (isAdminLike(req.user?.role)) return;
  const ok = await userHasRebateRole(req, code);
  if (!ok) throw new ForbiddenError(`${code} role required (REBATE_ROLES)`);
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
  if (req.query.status && ['ACCRUING', 'READY_TO_PAY', 'PAID', 'VOIDED'].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.payee_id && mongoose.Types.ObjectId.isValid(req.query.payee_id)) {
    filter.payee_id = new mongoose.Types.ObjectId(req.query.payee_id);
  }
  if (req.query.period) filter.period = req.query.period;
  if (req.query.payee_kind && ['MD', 'NON_MD'].includes(req.query.payee_kind)) {
    filter.payee_kind = req.query.payee_kind;
  }
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const skip = parseInt(req.query.skip) || 0;
  const [rows, total] = await Promise.all([
    RebatePayout.find(filter).sort({ period: -1, payee_id: 1, createdAt: -1 }).limit(limit).skip(skip).lean(),
    RebatePayout.countDocuments(filter),
  ]);
  // Enrich payee names (Doctor coll holds both MD + non-MD partners).
  const ids = [...new Set(rows.map(r => String(r.payee_id)))];
  const docs = ids.length ? await Doctor.find({ _id: { $in: ids } }).select('firstName lastName').lean() : [];
  const map = new Map(docs.map(d => [String(d._id), d]));
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
  const agg = await RebatePayout.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { status: '$status', payee_kind: '$payee_kind' },
        total_amount: { $sum: '$rebate_amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.status': 1, '_id.payee_kind': 1 } },
  ]);
  res.json({ success: true, data: agg });
});

const getById = catchAsync(async (req, res) => {
  await requireGate(req, 'VIEW_PAYOUTS');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await RebatePayout.findOne(filter).lean();
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: row });
});

const markReadyToPay = catchAsync(async (req, res) => {
  await requireGate(req, 'RUN_MONTHLY_CLOSE');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await RebatePayout.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  if (row.status !== 'ACCRUING') {
    return res.status(400).json({ success: false, message: `Cannot transition from ${row.status} to READY_TO_PAY` });
  }
  row.status = 'READY_TO_PAY';
  if (req.body.prf_id) row.prf_id = req.body.prf_id;
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

const markPaid = catchAsync(async (req, res) => {
  await requireGate(req, 'MARK_PAID');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await RebatePayout.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  if (row.status !== 'READY_TO_PAY') {
    return res.status(400).json({ success: false, message: `Cannot transition from ${row.status} to PAID` });
  }
  row.status = 'PAID';
  row.paid_at = new Date();
  if (req.body.journal_entry_id) row.journal_entry_id = req.body.journal_entry_id;
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

const voidPayout = catchAsync(async (req, res) => {
  await requireGate(req, 'MARK_PAID'); // void is paired with mark_paid authority
  const reason = (req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: 'reason required to void' });
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const row = await RebatePayout.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Not found' });
  if (row.status === 'VOIDED') {
    return res.status(400).json({ success: false, message: 'Already VOIDED' });
  }
  row.status = 'VOIDED';
  row.void_reason = reason;
  row.voided_by = req.user._id;
  row.voided_at = new Date();
  await row.save();
  res.json({ success: true, data: row.toObject() });
});

module.exports = { list, summary, getById, markReadyToPay, markPaid, voidPayout };
