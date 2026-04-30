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
 *   POST /:id/waybill                    Phase G4.5h-W — re-upload the waybill on
 *                                        a DRAFT or SUBMITTED UT, writing the new
 *                                        URL to BOTH the UT mirror AND the linked
 *                                        GRN. Recovery path for legacy GRN rows
 *                                        with a missing waybill (created before
 *                                        WAYBILL_REQUIRED enforcement) — the GRN
 *                                        has no edit endpoint of its own.
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
  if (!doc) return;
  const grn = doc?.linked_grn_id && typeof doc.linked_grn_id === 'object' ? doc.linked_grn_id : null;

  // Sign the linked-GRN proof URLs (source of truth) AND the UT's own mirror
  // (fallback used by the frontend when the populate is partial). Both must be
  // signed because the S3 bucket is private — raw URLs return AccessDenied.
  // Phase G4.5h-W: closes the "no waybill is attached" false-positive in the
  // Approval Hub when the GRN populate dropped the field but the UT mirror
  // (autoUndertakingForGrn copy) still has it.
  const ops = [];
  if (grn) {
    ops.push((async () => { grn.waybill_photo_url = await signUrl(grn.waybill_photo_url); })());
    ops.push((async () => { grn.undertaking_photo_url = await signUrl(grn.undertaking_photo_url); })());
  }
  ops.push((async () => { doc.waybill_photo_url = await signUrl(doc.waybill_photo_url); })());
  ops.push((async () => { doc.undertaking_photo_url = await signUrl(doc.undertaking_photo_url); })());
  await Promise.all(ops);
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
 *
 * Phase G4.5h Part A (Apr 30, 2026) — idempotent.
 *   - Atomic SUBMITTED → ACKNOWLEDGED claim via findOneAndUpdate, so two
 *     concurrent ack callers cannot both win (direct path + Approval Hub
 *     could otherwise race against the same UT).
 *   - GRN-status peek before approveGrnCore. If the linked GRN is already
 *     APPROVED (manual recovery path, future direct-approve, or a half-
 *     committed prior cascade), the ledger is already written; we skip
 *     the cascade and return the existing GRN. Closes the UT-002 orphan
 *     scenario from Phase G4.5g (Apr 24 ghost approval). The GRN's
 *     `event_id` is the secondary signal we surface in the audit note;
 *     it is never null on an APPROVED GRN written via approveGrnCore.
 *   - Concurrent ack returns `alreadyAcknowledged: true` so callers can
 *     report the truth without raising — the request was effectively a
 *     no-op against an already-acknowledged UT.
 *
 * @returns {Promise<{
 *   undertaking: Object,
 *   grn: Object|null,
 *   alreadyAcknowledged: boolean,
 *   cascadeSkipped: boolean
 * }>}
 */
async function postSingleUndertaking(doc, userId) {
  if (!doc) throw new Error('postSingleUndertaking: doc is required');

  const approveGrnCore = getApproveGrnCore();
  if (typeof approveGrnCore !== 'function') {
    throw new Error('postSingleUndertaking: inventoryController.approveGrnCore not exported');
  }

  const session = await mongoose.startSession();
  try {
    let updatedGrn = null;
    let alreadyAcknowledged = false;
    let cascadeSkipped = false;

    await session.withTransaction(async () => {
      // Atomic claim: only the caller that finds the UT in SUBMITTED state
      // wins the transition. The outer status checks at the two call sites
      // (acknowledgeUndertaking + approvalHandlers.undertaking) happen
      // OUTSIDE the txn, so without this atomic claim two concurrent acks
      // could both pass the outer gate and both try to cascade.
      const claimed = await Undertaking.findOneAndUpdate(
        { _id: doc._id, status: 'SUBMITTED' },
        {
          $set: {
            status: 'ACKNOWLEDGED',
            acknowledged_by: userId,
            acknowledged_at: new Date(),
          },
        },
        { new: true, session }
      );

      if (!claimed) {
        // Lost the race or the UT was never SUBMITTED on entry. Re-fetch to
        // tell the caller exactly what happened.
        // eslint-disable-next-line vip-tenant/require-entity-filter -- _id from caller-loaded doc; entity scope already enforced upstream
        const current = await Undertaking.findById(doc._id).session(session);
        if (!current) {
          throw new Error(`postSingleUndertaking: Undertaking ${doc._id} not found`);
        }
        if (current.status === 'ACKNOWLEDGED') {
          // Idempotent — caller's request is a no-op. Mirror the current
          // doc into the caller's reference so the response stays consistent.
          alreadyAcknowledged = true;
          Object.assign(doc, current.toObject());
          // Best-effort grab of the linked GRN for the response shape.
          if (current.linked_grn_id) {
            const GrnEntry = require('../models/GrnEntry');
            // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_grn_id from same-entity-scoped UT loaded above
            updatedGrn = await GrnEntry.findById(current.linked_grn_id).session(session);
          }
          return;
        }
        throw new Error(
          `postSingleUndertaking: Undertaking is ${current.status}, expected SUBMITTED`
        );
      }

      // We won the claim. Mirror the new state into the caller's reference.
      Object.assign(doc, claimed.toObject());

      // Idempotent cascade. If the linked GRN is already APPROVED, the
      // ledger + TransactionEvent rows already exist; calling approveGrnCore
      // again would throw `expected PENDING` (inventoryController.js:835).
      // Skip the cascade and let the audit note record the recovery path.
      const GrnEntry = require('../models/GrnEntry');
      // eslint-disable-next-line vip-tenant/require-entity-filter -- linked_grn_id from same-entity-scoped UT claim above
      const grnPeek = await GrnEntry.findById(doc.linked_grn_id)
        .select('status event_id')
        .session(session);
      if (!grnPeek) {
        throw new Error(
          `postSingleUndertaking: linked GRN ${doc.linked_grn_id} not found`
        );
      }
      if (grnPeek.status === 'APPROVED') {
        cascadeSkipped = true;
        // eslint-disable-next-line vip-tenant/require-entity-filter -- same-entity-scoped GRN already peeked in this txn
        updatedGrn = await GrnEntry.findById(doc.linked_grn_id).session(session);
      } else {
        updatedGrn = await approveGrnCore({
          grnId: doc.linked_grn_id,
          userId,
          session,
        });
      }
    });

    // Audit OUTSIDE the txn so audit failure does not roll back a committed
    // state change (matches the doctorMergeService.js pattern from A.5.5).
    // Skip when alreadyAcknowledged — the original ack already wrote the row.
    if (!alreadyAcknowledged) {
      const note = cascadeSkipped
        ? `Undertaking acknowledged — linked GRN ${updatedGrn?._id || doc.linked_grn_id} was already APPROVED (cascade skipped, idempotent path; GRN event_id=${updatedGrn?.event_id || 'null'})`
        : `Undertaking acknowledged — GRN ${updatedGrn?._id} auto-approved`;
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
        note,
      }).catch(err =>
        console.error('[postSingleUndertaking] audit failed (non-critical):', err.message)
      );
    }

    return { undertaking: doc, grn: updatedGrn, alreadyAcknowledged, cascadeSkipped };
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
    const { undertaking, grn, alreadyAcknowledged, cascadeSkipped } =
      await postSingleUndertaking(doc, req.user._id);
    // Phase G4.5h Part A — message reflects which idempotent path ran so the
    // operator can see whether stock was actually moved this click. The
    // cascade-skipped path matters for audit reviewers who otherwise wonder
    // why a UT acknowledge produced no new ledger rows.
    let message;
    if (alreadyAcknowledged) {
      message = 'Undertaking was already acknowledged — no change';
    } else if (cascadeSkipped) {
      message =
        'Undertaking acknowledged — linked GRN was already APPROVED (no new stock posted)';
    } else {
      message = 'Undertaking acknowledged — GRN auto-approved';
    }
    res.json({
      success: true,
      data: { undertaking, grn, alreadyAcknowledged, cascadeSkipped },
      message,
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

/**
 * POST /api/erp/undertaking/:id/waybill
 *
 * Phase G4.5h-W (Apr 29, 2026) — Re-upload the courier waybill on an existing
 * Undertaking. Recovery path for legacy GRN rows that genuinely lost their
 * waybill (data corruption, S3 deletion, or rows created before
 * WAYBILL_REQUIRED enforcement was flipped on). The GRN itself has no edit
 * endpoint, so this UT-side endpoint patches BOTH the UT mirror AND the linked
 * GRN — keeping the GRN as the single source of truth for the
 * approveGrnCore waybill gate.
 *
 * Body: { waybill_photo_url: <S3 URL from processDocument(file, 'WAYBILL')> }
 *
 * Authorization (Rule #20 + Rule #3 — lookup-driven, subscription-ready):
 *   - Owner BDM (doc.bdm_id == req.user._id) on a DRAFT UT — they captured the
 *     row and the GRN approval has not yet started.
 *   - Proxy entry caller — eBDM with inventory.undertaking_proxy + role in
 *     PROXY_ENTRY_ROLES.UNDERTAKING (canProxyEntry already vetted them when
 *     they originally proxied the GRN; reuse the same gate here so subscribers
 *     can configure WHO can recover without code changes).
 *   - Management role (admin/finance/president/CEO) anytime before
 *     ACKNOWLEDGED — finance/admin commonly close out legacy data.
 *
 * Status gate: only DRAFT or SUBMITTED. ACKNOWLEDGED + REJECTED + DELETION_*
 * are terminal and the GRN ledger is already written; re-uploading the waybill
 * after that point would only confuse the audit trail.
 *
 * Period lock: enforced against the doc's receipt_date so a closed period
 * cannot be retroactively patched (matches every other UT lifecycle endpoint).
 *
 * Audit: ErpAuditLog row of type FIELD_CHANGE on field `waybill_photo_url`.
 * old/new URLs are stored so president-reverse + integrity-audit agents can
 * trace the recovery.
 */
const reuploadWaybill = catchAsync(async (req, res) => {
  const { waybill_photo_url } = req.body || {};
  if (!waybill_photo_url || typeof waybill_photo_url !== 'string' || !waybill_photo_url.trim()) {
    return res.status(400).json({
      success: false,
      message: 'waybill_photo_url is required. Upload the waybill image first via /api/erp/ocr/process (docType=WAYBILL).'
    });
  }

  // Phase G4.5e — widen for proxy. Same proxy gate as submit.
  const scope = await widenFilterForProxy(req, 'inventory', UNDERTAKING_PROXY_OPTS);
  const filter = { _id: req.params.id, ...scope };
  const doc = await Undertaking.findOne(filter);
  if (!doc) return res.status(404).json({ success: false, message: 'Undertaking not found' });

  // Status gate — terminal docs are off-limits.
  if (!['DRAFT', 'SUBMITTED'].includes(doc.status)) {
    return res.status(400).json({
      success: false,
      message: `Cannot re-upload waybill on a ${doc.status} undertaking. Only DRAFT or SUBMITTED are eligible.`
    });
  }

  // Period lock by receipt_date (consistent with submit/acknowledge/reject).
  const period = dateToPeriod(doc.receipt_date || new Date());
  await checkPeriodOpen(doc.entity_id, period);

  // Authorization — owner / proxy / management. Mirrors submitUndertaking.
  const isOwner = String(doc.bdm_id) === String(req.user._id);
  const isManagement = req.isAdmin || req.isFinance || req.isPresident || req.user?.role === 'president' || req.user?.role === 'ceo';
  let allowed = isOwner || isManagement;
  if (!allowed) {
    // Lookup-driven proxy gate (PROXY_ENTRY_ROLES.UNDERTAKING + sub-perm).
    try {
      allowed = await canProxyEntry(req, 'inventory', UNDERTAKING_PROXY_OPTS);
    } catch { allowed = false; }
  }
  if (!allowed) {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to re-upload the waybill on this undertaking.'
    });
  }

  const oldUtUrl = doc.waybill_photo_url || null;

  // Patch BOTH the UT mirror AND the linked GRN. Lazy-require the GRN model to
  // avoid the circular-dep risk that already gated approveGrnCore.
  const GrnEntry = require('../models/GrnEntry');
  const session = await mongoose.startSession();
  let oldGrnUrl = null;
  let updatedGrn = null;
  try {
    await session.withTransaction(async () => {
      doc.waybill_photo_url = waybill_photo_url.trim();
      await doc.save({ session });

      if (doc.linked_grn_id) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- _id + entity_id pair
        const grn = await GrnEntry.findOne({ _id: doc.linked_grn_id, entity_id: doc.entity_id }).session(session);
        if (grn) {
          oldGrnUrl = grn.waybill_photo_url || null;
          grn.waybill_photo_url = waybill_photo_url.trim();
          await grn.save({ session });
          updatedGrn = grn;
        }
      }
    });
  } finally {
    await session.endSession();
  }

  await ErpAuditLog.logChange({
    entity_id: doc.entity_id,
    bdm_id: doc.bdm_id,
    // UPDATE per ErpAuditLog.log_type enum (FIELD_CHANGE is not whitelisted —
    // strict enum would silently swallow the audit row otherwise per Phase 35).
    log_type: 'UPDATE',
    target_ref: doc._id.toString(),
    target_model: 'Undertaking',
    field_changed: 'waybill_photo_url',
    old_value: oldUtUrl,
    new_value: waybill_photo_url.trim(),
    changed_by: req.user._id,
    note: `Waybill re-uploaded on ${doc.status} UT ${doc.undertaking_number}. Linked GRN ${doc.linked_grn_id} also patched (was: ${oldGrnUrl || 'null'}).`
  }).catch(err => console.error('[reuploadWaybill] audit failed (non-critical):', err.message));

  // Re-sign URLs before returning (mirrors getUndertakingById).
  doc.waybill_photo_url = await signUrl(doc.waybill_photo_url);

  res.json({
    success: true,
    data: {
      undertaking: { _id: doc._id, waybill_photo_url: doc.waybill_photo_url, status: doc.status },
      grn: updatedGrn ? { _id: updatedGrn._id, waybill_photo_url: await signUrl(updatedGrn.waybill_photo_url), status: updatedGrn.status } : null
    },
    message: 'Waybill re-uploaded. Linked GRN also patched.'
  });
});

module.exports = {
  getUndertakingList,
  getUndertakingById,
  submitUndertaking,
  acknowledgeUndertaking,
  rejectUndertaking,
  presidentReverseUndertaking,
  reuploadWaybill,
  // exported for Approval Hub dispatcher (universalApprovalController.approvalHandlers.undertaking)
  postSingleUndertaking
};
