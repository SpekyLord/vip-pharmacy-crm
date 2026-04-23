/**
 * Undertaking Controller — Phase 32R (Apr 20, 2026)
 *
 * Read-only acknowledgement wrapper around the GRN. Capture happens on the
 * GRN page (batch, expiry, qty, waybill — validated in inventoryController).
 * The Undertaking exists so a BDM can review the captured data + waybill as
 * a single document and submit it for approval, and so an approver can
 * acknowledge-and-post the linked GRN from the Approval Hub in one click.
 *
 * Lifecycle: DRAFT (auto-created with GRN) → SUBMITTED (BDM validates & submits)
 *            → ACKNOWLEDGED (approver — cascades GRN APPROVED in same session)
 *          | REJECTED (approver rejects — terminal; GRN stays PENDING so BDM
 *            can reverse + recreate or approver can directly reject the GRN).
 *
 * Endpoints kept (exposed via undertakingRoutes.js):
 *   GET  /                               list
 *   GET  /:id                            detail (populated linked GRN)
 *   POST /:id/submit                     DRAFT → SUBMITTED (gateApproval; may return 202)
 *   POST /:id/acknowledge                SUBMITTED → ACKNOWLEDGED (cascade-approve GRN)
 *   POST /:id/reject                     SUBMITTED → REJECTED (terminal)
 *   POST /:id/president-reverse          danger — cascades linked GRN storno
 *
 * Removed in Phase 32R (data is owned by GRN now):
 *   PUT  /:id                            — no line edits (nothing to edit)
 *   POST /:id/match-barcode              — scanning moved to GRN capture
 */
const mongoose = require('mongoose');
const Undertaking = require('../models/Undertaking');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { buildPresidentReverseHandler } = require('../services/documentReversalService');
const { gateApproval } = require('../services/approvalService');
const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
const { getSignedDownloadUrl, extractKeyFromUrl } = require('../../config/s3');
// Phase G4.5e (Apr 23, 2026) — shared proxy-entry resolver. UT has no create
// path (GRN auto-creates UT inheriting bdm_id), so we only need the READ widener
// + a canProxy check on submit. `recorded_on_behalf_of` propagates automatically
// from the linked GRN in undertakingService.autoUndertakingForGrn (Phase G4.5b).
const { widenFilterForProxy, canProxyEntry } = require('../utils/resolveOwnerScope');
const UNDERTAKING_PROXY_OPTS = { subKey: 'undertaking_proxy', lookupCode: 'UNDERTAKING' };

// S3 bucket is private — raw object URLs return AccessDenied. Sign the waybill
// and undertaking-paper URLs on the linked GRN before returning to the client
// (mirrors the Approval Hub hydrator's signer block).
async function signUrl(url) {
  if (!url) return url;
  try {
    return await getSignedDownloadUrl(extractKeyFromUrl(url), 3600);
  } catch {
    return url;
  }
}

async function signLinkedGrnPhotos(doc) {
  const grn = doc?.linked_grn_id;
  if (!grn || typeof grn !== 'object') return;
  [grn.waybill_photo_url, grn.undertaking_photo_url] = await Promise.all([
    signUrl(grn.waybill_photo_url),
    signUrl(grn.undertaking_photo_url),
  ]);
}

// ── Lazy-require to avoid circular dep with inventoryController
function getApproveGrnCore() {
  return require('./inventoryController').approveGrnCore;
}

/**
 * GET /api/erp/undertaking
 * Privileged users (admin/finance/president) omit bdm_id to see everything in
 * entity scope. Contractors see only their own. No silent self-ID fallback
 * (global rule #21).
 */
const getUndertakingList = catchAsync(async (req, res) => {
  const { status, period, linked_grn_id, limit = 50, skip = 0 } = req.query;
  // Phase G4.5e — widen so eligible proxies see target BDMs' UT queue.
  // widenFilterForProxy returns tenantFilter without bdm_id for an eligible
  // proxy (contractor with inventory.undertaking_proxy ticked), or tenantFilter
  // as-is for admin/finance (bdm_id already absent) and for non-proxy BDMs
  // (bdm_id = self). Rule #21 narrowing via ?bdm_id= preserved.
  const filter = await widenFilterForProxy(req, 'inventory', UNDERTAKING_PROXY_OPTS);
  const privileged = req.isAdmin || req.isFinance || req.isPresident;

  // BDM scope — only applied for non-privileged + non-proxy users. After
  // widenFilterForProxy, non-proxy contractors still have filter.bdm_id = self
  // (from tenantFilter middleware); nothing to add. Privileged users may narrow.
  if (req.query.bdm_id) {
    filter.bdm_id = req.query.bdm_id;
  }

  if (status) filter.status = status;
  if (linked_grn_id) filter.linked_grn_id = linked_grn_id;
  if (period) {
    // period is "YYYY-MM" — filter by receipt_date month
    const [y, m] = period.split('-').map(Number);
    if (y && m) {
      filter.receipt_date = {
        $gte: new Date(y, m - 1, 1),
        $lt: new Date(y, m, 1)
      };
    }
  }

  const [rows, total] = await Promise.all([
    Undertaking.find(filter)
      .populate({
        path: 'linked_grn_id',
        select: 'grn_number grn_date source_type po_id po_number vendor_id waybill_photo_url undertaking_photo_url reassignment_id status',
        populate: { path: 'vendor_id', select: 'vendor_name' }
      })
      .populate('warehouse_id', 'warehouse_name warehouse_code')
      .populate('bdm_id', 'name email')
      .populate('recorded_on_behalf_of', 'name')
      .populate('acknowledged_by', 'name')
      .sort({ created_at: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .lean(),
    Undertaking.countDocuments(filter)
  ]);

  await Promise.all(rows.map(signLinkedGrnPhotos));

  res.json({ success: true, data: rows, pagination: { total, limit: Number(limit), skip: Number(skip) } });
});

/**
 * GET /api/erp/undertaking/:id
 * Returns full undertaking + linked GRN (for waybill + context).
 */
const getUndertakingById = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy reads.
  const scope = await widenFilterForProxy(req, 'inventory', UNDERTAKING_PROXY_OPTS);
  const filter = { _id: req.params.id, ...scope };
  const doc = await Undertaking.findOne(filter)
    .populate({
      path: 'linked_grn_id',
      populate: { path: 'vendor_id', select: 'vendor_name' }
    })
    .populate('warehouse_id', 'warehouse_name warehouse_code')
    .populate('bdm_id', 'name email')
    .populate('recorded_on_behalf_of', 'name')
    .populate('acknowledged_by', 'name')
    .populate('line_items.product_id', 'brand_name generic_name dosage_strength unit_code primary_barcode item_key')
    .lean();
  if (!doc) return res.status(404).json({ success: false, message: 'Undertaking not found' });

  // Phase G4.5e — scope gate is enforced by widenFilterForProxy via the find()
  // filter above. The earlier manual contractor check is redundant — eligible
  // proxies pass the widened filter; non-proxy BDMs are self-filtered by tenantFilter.
  await signLinkedGrnPhotos(doc);

  res.json({ success: true, data: doc });
});

/**
 * POST /api/erp/undertaking/:id/submit
 *
 * DRAFT → SUBMITTED. The Undertaking is a thin acknowledgement wrapper —
 * capture already happened on the GRN and the BDM just reviewed it on the
 * UT page. Runs through gateApproval so non-authorized submitters route
 * to the Approval Hub (HTTP 202 per global rule #20).
 */
const submitUndertaking = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy submit. An eBDM with inventory.undertaking_proxy
  // can submit UTs for BDMs they file on behalf of; non-proxy BDMs still only
  // submit their own (tenantFilter scopes them to bdm_id = self).
  const scope = await widenFilterForProxy(req, 'inventory', UNDERTAKING_PROXY_OPTS);
  const filter = { _id: req.params.id, ...scope };
  const doc = await Undertaking.findOne(filter);
  if (!doc) return res.status(404).json({ success: false, message: 'Undertaking not found' });

  if (doc.status !== 'DRAFT') {
    return res.status(400).json({
      success: false,
      message: `Undertaking is ${doc.status} — only DRAFT can be submitted`
    });
  }

  // Period lock (by receipt_date)
  const period = dateToPeriod(doc.receipt_date || new Date());
  await checkPeriodOpen(doc.entity_id, period);

  // Phase G4.5e — audit the proxy submit (submitter ≠ owner).
  const isProxySubmit = String(doc.bdm_id) !== String(req.user._id);
  if (isProxySubmit) {
    await ErpAuditLog.logChange({
      entity_id: doc.entity_id,
      bdm_id: doc.bdm_id,
      log_type: 'PROXY_SUBMIT',
      target_ref: doc._id.toString(),
      target_model: 'Undertaking',
      changed_by: req.user._id,
      note: `Proxy submit: Undertaking ${doc.undertaking_number} submitted by ${req.user.name || req.user._id} (${req.user.role}) on behalf of BDM ${doc.bdm_id}`
    }).catch(err => console.error('[submitUndertaking] PROXY_SUBMIT audit failed (non-critical):', err.message));
  }

  // gateApproval — routes non-authorized submitters through Approval Hub (202).
  // Phase G4.5e: force-route when proxy-created (Rule #20 four-eyes).
  const hasProxy = !!doc.recorded_on_behalf_of;
  const gated = await gateApproval({
    entityId: doc.entity_id,
    module: 'UNDERTAKING',
    docType: 'UNDERTAKING',
    docId: doc._id,
    docRef: doc.undertaking_number,
    amount: 0, // no monetary impact; matrix matches module-only rules
    description: `Undertaking ${doc.undertaking_number} — GRN receipt confirmation`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
    forceApproval: hasProxy,
    ownerBdmId: doc.bdm_id,
  }, res);
  if (gated) return;

  doc.status = 'SUBMITTED';
  await doc.save();

  await ErpAuditLog.logChange({
    entity_id: doc.entity_id,
    bdm_id: doc.bdm_id,
    log_type: 'STATUS_CHANGE',
    target_ref: doc._id.toString(),
    target_model: 'Undertaking',
    field_changed: 'status',
    old_value: 'DRAFT',
    new_value: 'SUBMITTED',
    changed_by: req.user._id,
    note: `Undertaking submitted for approval — ${doc.line_items.length} line(s)`
  });

  res.json({ success: true, data: doc, message: 'Undertaking submitted' });
});

/**
 * Acknowledge an Undertaking + auto-approve the linked GRN in one session.
 *
 * Used by:
 *   - POST /undertaking/:id/acknowledge (direct call by authorized user)
 *   - universalApprovalController approvalHandlers.undertaking (via Approval Hub)
 *
 * Per global rule #20: auto-submit with rollback. If GRN approval fails
 * (period lock, PO mismatch, etc.), the acknowledgement is rolled back too.
 */
async function postSingleUndertaking(doc, userId) {
  if (!doc) throw new Error('postSingleUndertaking: doc is required');
  if (doc.status !== 'SUBMITTED') {
    throw new Error(`postSingleUndertaking: expected SUBMITTED, got ${doc.status}`);
  }

  const approveGrnCore = getApproveGrnCore();
  if (typeof approveGrnCore !== 'function') {
    throw new Error('postSingleUndertaking: inventoryController.approveGrnCore not exported');
  }

  const session = await mongoose.startSession();
  try {
    let updatedGrn = null;
    await session.withTransaction(async () => {
      doc.status = 'ACKNOWLEDGED';
      doc.acknowledged_by = userId;
      doc.acknowledged_at = new Date();
      await doc.save({ session });

      // Cascade — auto-approve GRN using the refactored core
      updatedGrn = await approveGrnCore({
        grnId: doc.linked_grn_id,
        userId,
        session
      });
    });

    await ErpAuditLog.logChange({
      entity_id: doc.entity_id,
      bdm_id: doc.bdm_id,
      log_type: 'STATUS_CHANGE',
      target_ref: doc._id.toString(),
      target_model: 'Undertaking',
      field_changed: 'status',
      old_value: 'SUBMITTED',
      new_value: 'ACKNOWLEDGED',
      changed_by: userId,
      note: `Undertaking acknowledged — GRN ${updatedGrn?._id} auto-approved`
    });

    return { undertaking: doc, grn: updatedGrn };
  } finally {
    await session.endSession();
  }
}

/**
 * POST /api/erp/undertaking/:id/acknowledge
 * Direct acknowledge for authorized users (admin/finance/president, or BDM per
 * MODULE_DEFAULT_ROLES.UNDERTAKING). Non-authorized users get routed through
 * the Approval Hub at submit time, so this endpoint only hits the authorized path.
 */
const acknowledgeUndertaking = catchAsync(async (req, res) => {
  // Phase G4.5e — widen for proxy acknowledge. Acknowledge is usually an
  // approver action (admin/finance/president have tenantFilter without bdm_id
  // already), but keep the helper for consistency. The effective permission
  // gate for acknowledging is MODULE_DEFAULT_ROLES + UT's own approval path.
  const scope = await widenFilterForProxy(req, 'inventory', UNDERTAKING_PROXY_OPTS);
  const filter = { _id: req.params.id, ...scope };
  const doc = await Undertaking.findOne(filter);
  if (!doc) return res.status(404).json({ success: false, message: 'Undertaking not found' });

  if (doc.status !== 'SUBMITTED') {
    return res.status(400).json({
      success: false,
      message: `Undertaking is ${doc.status} — only SUBMITTED can be acknowledged`
    });
  }

  // Period lock (by receipt_date)
  const period = dateToPeriod(doc.receipt_date || new Date());
  await checkPeriodOpen(doc.entity_id, period);

  try {
    const { undertaking, grn } = await postSingleUndertaking(doc, req.user._id);
    res.json({
      success: true,
      data: { undertaking, grn },
      message: 'Undertaking acknowledged — GRN auto-approved'
    });
  } catch (err) {
    console.error('[undertakingController] acknowledge failed:', err);
    return res.status(500).json({
      success: false,
      message: `Acknowledge + GRN approval failed: ${err.message}`
    });
  }
});

/**
 * POST /api/erp/undertaking/:id/reject
 * Approver rejects a SUBMITTED Undertaking. Phase 32R: terminal REJECTED so
 * the GRN stays PENDING. BDM can either reverse the GRN via the Reversal
 * Console (cascades the UT to REJECTED via hard-delete path) and recreate,
 * or approver can directly reject the GRN.
 */
const rejectUndertaking = catchAsync(async (req, res) => {
  const { rejection_reason } = req.body || {};
  if (!rejection_reason || !String(rejection_reason).trim()) {
    return res.status(400).json({ success: false, message: 'rejection_reason is required' });
  }

  // Phase G4.5e — widen for proxy reject (same shape as acknowledge).
  const scope = await widenFilterForProxy(req, 'inventory', UNDERTAKING_PROXY_OPTS);
  const filter = { _id: req.params.id, ...scope };
  const doc = await Undertaking.findOne(filter);
  if (!doc) return res.status(404).json({ success: false, message: 'Undertaking not found' });

  if (doc.status !== 'SUBMITTED') {
    return res.status(400).json({
      success: false,
      message: `Undertaking is ${doc.status} — only SUBMITTED can be rejected`
    });
  }

  const oldStatus = doc.status;
  doc.status = 'REJECTED';
  doc.rejection_reason = rejection_reason;
  doc.reopen_count = (doc.reopen_count || 0) + 1;
  await doc.save();

  await ErpAuditLog.logChange({
    entity_id: doc.entity_id,
    bdm_id: doc.bdm_id,
    log_type: 'STATUS_CHANGE',
    target_ref: doc._id.toString(),
    target_model: 'Undertaking',
    field_changed: 'status',
    old_value: oldStatus,
    new_value: 'REJECTED',
    changed_by: req.user._id,
    note: `Rejected: ${rejection_reason}`
  });

  res.json({ success: true, data: doc, message: 'Undertaking rejected — GRN remains PENDING' });
});

/**
 * DELETE /api/erp/undertaking/:id/president-reverse
 * Cascade reverses the linked GRN if APPROVED (via REVERSAL_HANDLERS 'UNDERTAKING').
 * Gated at route layer via erpSubAccessCheck('inventory', 'reverse_undertaking').
 */
const presidentReverseUndertaking = buildPresidentReverseHandler('UNDERTAKING');

module.exports = {
  getUndertakingList,
  getUndertakingById,
  submitUndertaking,
  acknowledgeUndertaking,
  rejectUndertaking,
  presidentReverseUndertaking,
  // exported for Approval Hub dispatcher (universalApprovalController.approvalHandlers.undertaking)
  postSingleUndertaking
};
