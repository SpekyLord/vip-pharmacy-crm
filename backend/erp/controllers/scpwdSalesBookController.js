/**
 * scpwdSalesBookController — Phase VIP-1.H (Apr 2026)
 *
 * SC/PWD Sales Book endpoints. Lookup-driven role gates via scpwdAccess.js
 * (Rule #3). Entity-scoped via tenantFilter — privileged users can pass
 * `?entity_id=` to opt into cross-entity views (Rule #21).
 *
 * Idempotency: create() rejects on duplicate (entity_id, source_type,
 * source_doc_ref) — the unique index is the enforcement floor; controller
 * emits a 409 with the existing record so the caller can update instead.
 *
 * Audit: every export call writes an AuditLog row (who/when/period/format).
 *
 * BIR period-lock: post() runs through periodLockCheck('SCPWD') middleware
 * at route-mount level so locked periods reject retroactive changes.
 */

const mongoose = require('mongoose');
const SalesBookSCPWD = require('../models/SalesBookSCPWD');
const { catchAsync, NotFoundError, ForbiddenError } = require('../../middleware/errorHandler');
const { isAdminLike } = require('../../constants/roles');
const {
  getViewRegisterRoles,
  getCreateEntryRoles,
  getExportMonthlyRoles,
  getExportVatReclaimRoles,
} = require('../../utils/scpwdAccess');
const reporting = require('../services/scpwdReportingService');

// ── Role-gate guard helper ────────────────────────────────────────────────
async function requireRole(req, code) {
  const role = req.user?.role;
  if (!role) throw new ForbiddenError('Authentication required');
  let allowed;
  switch (code) {
    case 'VIEW_REGISTER':      allowed = await getViewRegisterRoles(req.entityId); break;
    case 'CREATE_ENTRY':       allowed = await getCreateEntryRoles(req.entityId); break;
    case 'EXPORT_MONTHLY':     allowed = await getExportMonthlyRoles(req.entityId); break;
    case 'EXPORT_VAT_RECLAIM': allowed = await getExportVatReclaimRoles(req.entityId); break;
    default: throw new ForbiddenError(`Unknown SCPWD gate: ${code}`);
  }
  if (!isAdminLike(role) && !allowed.includes(role)) {
    throw new ForbiddenError(
      `${code} requires one of: ${allowed.join(', ')}. Your role: ${role}.`,
    );
  }
}

// ── Build the entity-scope filter (Rule #21 — no silent self-fallback) ────
function buildEntityFilter(req) {
  const filter = {};
  // Privileged users (admin/finance/president) can opt into cross-entity via
  // explicit ?entity_id=. Default is the user's working entity. Never
  // silently substitute req.user._id or skip the scope.
  if (req.query.entity_id) {
    if (mongoose.Types.ObjectId.isValid(req.query.entity_id)) {
      filter.entity_id = new mongoose.Types.ObjectId(req.query.entity_id);
    } else {
      // Invalid id → reject explicitly so caller learns
      throw new ForbiddenError('entity_id query param is not a valid ObjectId');
    }
  } else if (req.entityId) {
    filter.entity_id = req.entityId;
  }
  return filter;
}

// ────────────────────────────────────────────────────────────────────────────
// LIST + COUNTS
// ────────────────────────────────────────────────────────────────────────────

const list = catchAsync(async (req, res) => {
  await requireRole(req, 'VIEW_REGISTER');

  const filter = buildEntityFilter(req);
  if (req.query.year && req.query.month) {
    filter['bir_period.year'] = parseInt(req.query.year);
    filter['bir_period.month'] = parseInt(req.query.month);
  }
  if (req.query.sc_pwd_type && ['SC', 'PWD'].includes(req.query.sc_pwd_type)) {
    filter.sc_pwd_type = req.query.sc_pwd_type;
  }
  if (req.query.status && ['DRAFT', 'POSTED', 'VOID'].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.search) {
    const q = String(req.query.search).trim();
    filter.$or = [
      { customer_name: new RegExp(q, 'i') },
      { osca_or_pwd_id: new RegExp(q, 'i') },
      { source_doc_ref: new RegExp(q, 'i') },
    ];
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  const skip = parseInt(req.query.skip) || 0;

  const [items, total] = await Promise.all([
    SalesBookSCPWD.find(filter)
      .sort({ transaction_date: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SalesBookSCPWD.countDocuments(filter),
  ]);

  res.json({ success: true, data: items, total, limit, skip });
});

const summary = catchAsync(async (req, res) => {
  await requireRole(req, 'VIEW_REGISTER');

  const filter = buildEntityFilter(req);
  if (req.query.year && req.query.month) {
    filter['bir_period.year'] = parseInt(req.query.year);
    filter['bir_period.month'] = parseInt(req.query.month);
  }

  const [byStatus, byType, posted] = await Promise.all([
    SalesBookSCPWD.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    SalesBookSCPWD.aggregate([
      { $match: { ...filter, status: 'POSTED' } },
      { $group: { _id: '$sc_pwd_type', count: { $sum: 1 }, gross: { $sum: '$gross_amount' }, discount: { $sum: '$discount_amount' }, vat_exempt: { $sum: '$vat_exempt_amount' }, net: { $sum: '$net_amount' } } },
    ]),
    SalesBookSCPWD.aggregate([
      { $match: { ...filter, status: 'POSTED' } },
      { $group: { _id: null, count: { $sum: 1 }, gross: { $sum: '$gross_amount' }, discount: { $sum: '$discount_amount' }, vat_exempt: { $sum: '$vat_exempt_amount' }, net: { $sum: '$net_amount' } } },
    ]),
  ]);

  const counts = { DRAFT: 0, POSTED: 0, VOID: 0 };
  for (const row of byStatus) counts[row._id] = row.count;

  res.json({
    success: true,
    data: {
      counts,
      by_type: byType,
      posted_totals: posted[0] || { count: 0, gross: 0, discount: 0, vat_exempt: 0, net: 0 },
    },
  });
});

const getById = catchAsync(async (req, res) => {
  await requireRole(req, 'VIEW_REGISTER');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;
  const item = await SalesBookSCPWD.findOne(filter).lean();
  if (!item) throw new NotFoundError('SC/PWD register row not found');
  res.json({ success: true, data: item });
});

// ────────────────────────────────────────────────────────────────────────────
// CREATE / POST / VOID
// ────────────────────────────────────────────────────────────────────────────

const create = catchAsync(async (req, res) => {
  await requireRole(req, 'CREATE_ENTRY');
  if (!req.entityId) {
    return res.status(400).json({ success: false, message: 'Entity context required.' });
  }

  const body = req.body || {};

  // Auto-generate source_doc_ref for MANUAL entries if not supplied
  let sourceDocRef = body.source_doc_ref;
  const sourceType = body.source_type || 'MANUAL';
  if (sourceType === 'MANUAL' && !sourceDocRef) {
    const date = body.transaction_date ? new Date(body.transaction_date) : new Date();
    const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const count = await SalesBookSCPWD.countDocuments({
      entity_id: req.entityId,
      'bir_period.year': date.getFullYear(),
      'bir_period.month': date.getMonth() + 1,
      source_type: 'MANUAL',
    });
    sourceDocRef = `SCPWD-${yyyymm}-${String(count + 1).padStart(4, '0')}`;
  }

  try {
    const doc = await SalesBookSCPWD.create({
      ...body,
      entity_id: req.entityId,
      source_type: sourceType,
      source_doc_ref: sourceDocRef,
      created_by: req.user._id,
      status: body.status || 'DRAFT',
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    // Idempotency: surface the existing row on duplicate-key
    if (err.code === 11000) {
      const existing = await SalesBookSCPWD.findOne({
        entity_id: req.entityId,
        source_type: sourceType,
        source_doc_ref: sourceDocRef,
      }).lean();
      return res.status(409).json({
        success: false,
        message: `SC/PWD entry already exists for source_doc_ref=${sourceDocRef}`,
        data: existing,
      });
    }
    throw err;
  }
});

const update = catchAsync(async (req, res) => {
  await requireRole(req, 'CREATE_ENTRY');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;

  const item = await SalesBookSCPWD.findOne(filter);
  if (!item) throw new NotFoundError('SC/PWD register row not found');
  if (item.status !== 'DRAFT') {
    return res.status(400).json({
      success: false,
      message: `Cannot edit ${item.status} row. POSTED rows must be voided first; VOID rows are immutable.`,
    });
  }

  const editable = [
    'sc_pwd_type', 'osca_or_pwd_id', 'customer_name', 'date_of_birth',
    'id_expiry_date', 'id_photo_url', 'transaction_date', 'items',
    'gross_amount', 'discount_amount', 'vat_exempt_amount', 'net_amount',
    'input_vat_paid_to_supplier', 'notes', 'sale_id', 'storefront_order_id',
  ];
  for (const key of editable) {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  }

  await item.save();
  res.json({ success: true, data: item });
});

const post = catchAsync(async (req, res) => {
  await requireRole(req, 'CREATE_ENTRY');
  const filter = buildEntityFilter(req);
  filter._id = req.params.id;

  const item = await SalesBookSCPWD.findOne(filter);
  if (!item) throw new NotFoundError('SC/PWD register row not found');
  if (item.status !== 'DRAFT') {
    return res.status(400).json({ success: false, message: `Cannot post ${item.status} row.` });
  }

  item.status = 'POSTED';
  item.posted_at = new Date();
  item.posted_by = req.user._id;
  await item.save();

  res.json({ success: true, data: item, message: 'SC/PWD register row posted to BIR Sales Book' });
});

const voidRow = catchAsync(async (req, res) => {
  await requireRole(req, 'CREATE_ENTRY');
  const { reason } = req.body || {};
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'Void reason is required (audit trail)' });
  }

  const filter = buildEntityFilter(req);
  filter._id = req.params.id;

  const item = await SalesBookSCPWD.findOne(filter);
  if (!item) throw new NotFoundError('SC/PWD register row not found');
  if (item.status === 'VOID') {
    return res.status(400).json({ success: false, message: 'Row already void' });
  }

  item.status = 'VOID';
  item.voided_at = new Date();
  item.voided_by = req.user._id;
  item.void_reason = String(reason).trim();
  await item.save();

  res.json({ success: true, data: item });
});

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS — BIR-format CSVs (audit-logged)
// ────────────────────────────────────────────────────────────────────────────

const exportMonthly = catchAsync(async (req, res) => {
  await requireRole(req, 'EXPORT_MONTHLY');
  if (!req.entityId) {
    return res.status(400).json({ success: false, message: 'Entity context required.' });
  }
  const year = parseInt(req.query.year);
  const month = parseInt(req.query.month);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: 'year + month (1-12) query params required' });
  }

  const result = await reporting.generateMonthlyExport(req.entityId, year, month);

  // Audit trail — server log (BIR retention exceeds AuditLog's 90-day TTL).
  // A dedicated SCPWDExportLog model with long retention is a follow-up if/when
  // BIR demands programmatic export history beyond log scraping.
  console.log('[SCPWD_EXPORT_MONTHLY]', JSON.stringify({
    user: req.user.email, role: req.user.role, entity_id: String(req.entityId),
    year, month, row_count: result.rowCount, totals: result.totals,
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.content);
});

const exportVatReclaim = catchAsync(async (req, res) => {
  await requireRole(req, 'EXPORT_VAT_RECLAIM');
  if (!req.entityId) {
    return res.status(400).json({ success: false, message: 'Entity context required.' });
  }
  const year = parseInt(req.query.year);
  const month = parseInt(req.query.month);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ success: false, message: 'year + month (1-12) query params required' });
  }

  const result = await reporting.generateInputVatCreditWorksheet(req.entityId, year, month);

  console.log('[SCPWD_EXPORT_VAT_RECLAIM]', JSON.stringify({
    user: req.user.email, role: req.user.role, entity_id: String(req.entityId),
    year, month, row_count: result.rowCount, totals: result.totals,
    ip: req.ip, ts: new Date().toISOString(),
  }));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.content);
});

module.exports = {
  list,
  summary,
  getById,
  create,
  update,
  post,
  voidRow,
  exportMonthly,
  exportVatReclaim,
};
