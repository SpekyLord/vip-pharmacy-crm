/**
 * Vendor Learning Controller — Phase H5
 *
 * Admin review queue for vendors auto-learned by the OCR pipeline from Claude wins.
 * Lets admin/finance/president approve (vendor becomes first-class), reject
 * (deactivated), or leave pending. Strictly entity-scoped.
 */
const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const VendorMaster = require('../models/VendorMaster');

const requireEntity = (req) => {
  if (!req.entityId && !req.isPresident) {
    throw new ApiError(400, 'Entity context required.');
  }
  return req.entityId || null;
};

const baseScope = (req) => {
  const scope = { auto_learned_from_ocr: true };
  if (!req.isPresident) scope.entity_id = req.entityId;
  else if (req.query.entity_id) scope.entity_id = req.query.entity_id;
  return scope;
};

// GET /api/erp/vendor-learnings?status=UNREVIEWED|APPROVED|REJECTED&limit=100
exports.list = catchAsync(async (req, res) => {
  requireEntity(req);
  const scope = baseScope(req);

  const status = (req.query.status || '').toUpperCase();
  if (['UNREVIEWED', 'APPROVED', 'REJECTED'].includes(status)) {
    scope.learning_status = status;
  }
  if (req.query.doc_type) {
    scope['learning_meta.source_doc_type'] = String(req.query.doc_type).toUpperCase();
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const rows = await VendorMaster.find(scope)
    .sort({ learned_at: -1 })
    .limit(limit)
    .populate('created_by', 'name email')
    .populate('updated_by', 'name email')
    .lean();

  const counts = await VendorMaster.aggregate([
    { $match: baseScope(req) },
    { $group: { _id: '$learning_status', count: { $sum: 1 } } },
  ]);
  const summary = counts.reduce((acc, r) => ({ ...acc, [r._id || 'UNKNOWN']: r.count }), {});

  res.json({ success: true, data: { rows, summary } });
});

// GET /api/erp/vendor-learnings/:id
exports.getOne = catchAsync(async (req, res) => {
  requireEntity(req);
  const scope = { _id: req.params.id, auto_learned_from_ocr: true };
  if (!req.isPresident) scope.entity_id = req.entityId;

  const vendor = await VendorMaster.findOne(scope)
    .populate('created_by', 'name email')
    .populate('updated_by', 'name email')
    .lean();
  if (!vendor) throw new ApiError(404, 'Auto-learned vendor not found.');
  res.json({ success: true, data: vendor });
});

// PATCH /api/erp/vendor-learnings/:id
//   body: { action: 'APPROVE'|'REJECT'|'UNREVIEW', vendor_name?, default_coa_code?, default_expense_category?, vendor_aliases? }
// APPROVE:  marks learning_status=APPROVED. Admin may edit the name/aliases/coa before approving.
// REJECT:   marks learning_status=REJECTED + is_active=false (so classifier stops matching it).
// UNREVIEW: resets to UNREVIEWED (undo).
exports.review = catchAsync(async (req, res) => {
  requireEntity(req);
  const scope = { _id: req.params.id, auto_learned_from_ocr: true };
  if (!req.isPresident) scope.entity_id = req.entityId;

  const action = String(req.body.action || '').toUpperCase();
  if (!['APPROVE', 'REJECT', 'UNREVIEW'].includes(action)) {
    throw new ApiError(400, 'action must be APPROVE, REJECT, or UNREVIEW');
  }

  const updates = { updated_by: req.user?._id || null };

  // Optional inline edits — applied before status transition so admin can fix
  // Claude's suggestion without a separate save.
  if (typeof req.body.vendor_name === 'string' && req.body.vendor_name.trim()) {
    updates.vendor_name = req.body.vendor_name.trim();
  }
  if (typeof req.body.default_coa_code === 'string') {
    updates.default_coa_code = req.body.default_coa_code.trim();
  }
  if (typeof req.body.default_expense_category === 'string') {
    updates.default_expense_category = req.body.default_expense_category.trim();
  }
  if (Array.isArray(req.body.vendor_aliases)) {
    updates.vendor_aliases = req.body.vendor_aliases
      .map(a => String(a || '').trim().toUpperCase())
      .filter(Boolean);
  }

  if (action === 'APPROVE') {
    updates.learning_status = 'APPROVED';
    updates.is_active = true;
  } else if (action === 'REJECT') {
    updates.learning_status = 'REJECTED';
    updates.is_active = false;
  } else {
    updates.learning_status = 'UNREVIEWED';
  }

  const vendor = await VendorMaster.findOneAndUpdate(scope, { $set: updates }, { new: true });
  if (!vendor) throw new ApiError(404, 'Auto-learned vendor not found.');

  res.json({ success: true, data: vendor, message: `Learning ${action.toLowerCase()}d.` });
});
