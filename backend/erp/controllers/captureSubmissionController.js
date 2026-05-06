/**
 * CaptureSubmission Controller — Phase P1 (April 23, 2026).
 *
 * BDM mobile capture → office proxy queue → BDM review.
 * Expenses is the pilot workflow; framework supports all 8 workflow types.
 *
 * Rule #3:  SLA thresholds lookup-driven (PROXY_SLA_THRESHOLDS).
 * Rule #19: entity_id stamped at create; cross-entity blocked.
 * Rule #20: Option B — proxy enters, never approves (enforced downstream).
 * Rule #21: bdm_id explicit — no silent self-scope fallback.
 */

const CaptureSubmission = require('../models/CaptureSubmission');
const { catchAsync } = require('../../middleware/errorHandler');
const { canProxyEntry } = require('../utils/resolveOwnerScope');
const { dispatchMultiChannel } = require('../services/erpNotificationService');
const User = require('../../models/User');
const { signCaptureArtifacts } = require('../../config/s3');
const { userCanPerformCaptureAction } = require('../../utils/captureLifecycleAccess');

// ── C1/C2 half-monthly cycle helpers (Phase P1.2 Slice 8) ──────────
// Shared util in `backend/erp/utils/cycleC1C2.js`. Same convention as
// CarLogbookEntry / SmerEntry / IncomeReport / Payslip / DeductionSchedule /
// DriveAllocation. C1 = day 1–15, C2 = day 16–end-of-month. Manila local
// time (UTC+8) governs all bucket boundaries.
//
// Do NOT inline a copy here — the parallel session's driveAllocationController.js
// shipped its own inline copy first; this file lifts the math to the shared
// util to remove the duplication risk before a third controller arrives.
const { MANILA_OFFSET_MS, cycleBounds } = require('../utils/cycleC1C2');

// ── Allowed status transitions ──
const TRANSITIONS = {
  PENDING_PROXY:       ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS:         ['PROCESSED', 'PENDING_PROXY'],   // release back if proxy can't finish
  PROCESSED:           ['AWAITING_BDM_REVIEW'],
  AWAITING_BDM_REVIEW: ['ACKNOWLEDGED', 'DISPUTED', 'AUTO_ACKNOWLEDGED'],
  // Terminal states — no further transitions
  ACKNOWLEDGED:        [],
  DISPUTED:            [],
  CANCELLED:           [],
  AUTO_ACKNOWLEDGED:   [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

// ═══════════════════════════════════════════════════════════════════
// BDM-side endpoints
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /capture-submissions
 * BDM creates a capture submission from the mobile capture hub.
 */
// Captures with NO paper expected. Slice 3 reconciliation skips these.
//   SMER:                   ODO photos are device-clock evidence, no paper
//   COLLECTION/PAID_CSI:    photo of CSI marked paid; the original CSI copy
//                           travels with collection paperwork separately
//   GRN/BATCH_PHOTO:        photo of vial/box labels for OCR batch+expiry —
//                           the physical product itself is the source, no
//                           paper to send. (Phase P1.2 Slice 6.2 — May 06 2026)
const DIGITAL_ONLY = (workflow_type, sub_type) =>
  workflow_type === 'SMER' ||
  (workflow_type === 'COLLECTION' && sub_type === 'PAID_CSI') ||
  (workflow_type === 'GRN' && sub_type === 'BATCH_PHOTO');

// Per-workflow sub_type whitelist. Phase P1.2 Slice 6.2 (May 06 2026) splits
// GRN into BATCH_PHOTO (D — digital-only OCR feed) vs WAYBILL (M — paper
// arrives with the courier). COLLECTION whitelist unchanged from Phase P1.
// Subscribers loosen via lookup row CAPTURE_SUB_TYPE_RULES (Rule #3) — defaults
// ship with the binary so a Lookup outage never goes dark.
const VALID_SUB_TYPES_BY_WORKFLOW = {
  COLLECTION: ['CR', 'DEPOSIT', 'PAID_CSI'],
  GRN:        ['BATCH_PHOTO', 'WAYBILL'],
};

const createCapture = catchAsync(async (req, res) => {
  const {
    workflow_type, sub_type, captured_artifacts, bdm_notes,
    amount_declared, payment_mode, access_for,
  } = req.body;

  if (!workflow_type) {
    return res.status(400).json({ success: false, message: 'workflow_type is required' });
  }

  const VALID_TYPES = [
    'SMER', 'EXPENSE', 'SALES', 'OPENING_AR',
    'COLLECTION', 'GRN', 'PETTY_CASH', 'FUEL_ENTRY',
    'CWT_INBOUND',
    'UNCATEGORIZED',  // P1.2 Slice 1 — zero-typing capture; proxy classifies later
  ];
  if (!VALID_TYPES.includes(workflow_type)) {
    return res.status(400).json({ success: false, message: `Invalid workflow_type. Must be one of: ${VALID_TYPES.join(', ')}` });
  }

  // sub_type whitelist is per-workflow (COLLECTION + GRN today).
  if (sub_type) {
    const allowed = VALID_SUB_TYPES_BY_WORKFLOW[workflow_type];
    if (!allowed || !allowed.includes(sub_type)) {
      const allowedHint = allowed
        ? ` Expected one of: ${allowed.join(', ')}`
        : ` workflow_type '${workflow_type}' does not accept sub_type.`;
      return res.status(400).json({
        success: false,
        message: `sub_type '${sub_type}' is invalid for workflow_type '${workflow_type}'.${allowedHint}`,
      });
    }
  }

  if (!captured_artifacts || !Array.isArray(captured_artifacts) || captured_artifacts.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one captured artifact is required' });
  }

  const isDigitalOnly = DIGITAL_ONLY(workflow_type, sub_type);

  const doc = await CaptureSubmission.create({
    bdm_id: req.bdmId || req.user._id,
    entity_id: req.entityId,
    created_by: req.user._id,
    workflow_type,
    sub_type: sub_type || null,
    status: 'PENDING_PROXY',
    captured_artifacts,
    bdm_notes,
    amount_declared,
    payment_mode,
    access_for,
    physical_required: !isDigitalOnly,
    physical_status: isDigitalOnly ? 'N_A' : 'PENDING',
  });

  res.status(201).json({ success: true, data: doc });
});

/**
 * POST /capture-submissions/upload-artifact
 *
 * Phase P1.2 Slice 1 (May 2026) — multipart photo upload that returns S3
 * URLs the caller then embeds into a subsequent createCapture() POST.
 *
 * Replaces the data-URL-stuffing path that lived at BdmCaptureHub.jsx:270
 * since Phase P1 shipped. With volume going wide (9 BDMs × ~30 photos/day)
 * base64 inside the Mongo doc would hit the 16 MB cap within a week.
 *
 * Returns: { artifacts: [{ url, key, gps, capturedAt, photoFlags, hash }] }
 *
 * The caller (BdmCaptureHub Quick Capture / classic modal) takes that array
 * and POSTs it as captured_artifacts in the createCapture body.
 *
 * Sub-permission gates (Rule #3 lookup-driven via CAPTURE_LIFECYCLE_ROLES):
 *   - Self-upload: caller must have UPLOAD_OWN_CAPTURE
 *   - Cross-BDM upload (req.body.bdm_id ≠ caller): also requires PROXY_PULL_CAPTURE
 *
 * Defaults: UPLOAD_OWN_CAPTURE = [staff], PROXY_PULL_CAPTURE = [admin, finance].
 * President bypasses (global Rule #20).
 */
const uploadArtifact = catchAsync(async (req, res) => {
  const canUploadOwn = await userCanPerformCaptureAction(
    req.user, 'UPLOAD_OWN_CAPTURE', req.entityId,
  );
  const canProxyUpload = await userCanPerformCaptureAction(
    req.user, 'PROXY_PULL_CAPTURE', req.entityId,
  );

  if (!canUploadOwn && !canProxyUpload) {
    return res.status(403).json({
      success: false,
      message: 'Capture upload requires UPLOAD_OWN_CAPTURE or PROXY_PULL_CAPTURE permission.',
    });
  }

  // Cross-BDM gate: if body specifies a different bdm_id than the caller,
  // require PROXY_PULL_CAPTURE. President short-circuits (handled inside
  // userCanPerformCaptureAction by always returning true).
  const bodyBdmId = req.body.bdm_id;
  if (bodyBdmId && String(bodyBdmId) !== String(req.user._id) && !canProxyUpload) {
    return res.status(403).json({
      success: false,
      message: 'Cross-BDM upload requires PROXY_PULL_CAPTURE permission.',
    });
  }

  const artifacts = req.uploadedCaptureArtifacts || [];
  if (artifacts.length === 0) {
    // Defensive — middleware should have 400'd already, but if it didn't
    // attach the array (transient error path), fail explicitly here.
    return res.status(400).json({
      success: false,
      message: 'No artifacts were uploaded.',
    });
  }

  res.status(201).json({
    success: true,
    data: {
      artifacts: artifacts.map(a => ({
        url: a.url,
        key: a.key,
        capturedAt: a.capturedAt,
        gps: a.gps,
        dimensions: a.dimensions,
        photoFlags: a.photoFlags,
        hash: a.hash,
        size: a.size,
        mimetype: a.mimetype,
      })),
    },
  });
});

/**
 * GET /capture-submissions/my
 * BDM's own submissions — mobile review queue.
 */
const getMyCaptures = catchAsync(async (req, res) => {
  const { status, workflow_type, limit = 50, skip = 0 } = req.query;
  const filter = {
    bdm_id: req.bdmId || req.user._id,
    entity_id: req.entityId,
  };
  if (status) filter.status = status;
  if (workflow_type) filter.workflow_type = workflow_type;

  const [data, total] = await Promise.all([
    CaptureSubmission.find(filter)
      .sort({ created_at: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .populate('proxy_id', 'name role')
      .lean(),
    CaptureSubmission.countDocuments(filter),
  ]);

  // Phase P1.2 Slice 1 — sign S3 URLs in captured_artifacts so the BDM's
  // mobile review can render thumbnails on a private bucket.
  const signed = await Promise.all(data.map(d => signCaptureArtifacts(d)));

  res.json({ success: true, data: signed, total });
});

/**
 * GET /capture-submissions/my/review
 * BDM review queue — proxied entries awaiting confirmation.
 */
const getMyReviewQueue = catchAsync(async (req, res) => {
  const { days = 30, limit = 50, skip = 0 } = req.query;
  const since = new Date();
  since.setDate(since.getDate() - Number(days));

  const filter = {
    bdm_id: req.bdmId || req.user._id,
    entity_id: req.entityId,
    status: { $in: ['AWAITING_BDM_REVIEW', 'PROCESSED'] },
    created_at: { $gte: since },
  };

  const [data, total] = await Promise.all([
    CaptureSubmission.find(filter)
      .sort({ created_at: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .populate('proxy_id', 'name role')
      .lean(),
    CaptureSubmission.countDocuments(filter),
  ]);

  // Phase P1.2 Slice 1 — sign S3 URLs so review-queue thumbnails load
  // on a private bucket.
  const signed = await Promise.all(data.map(d => signCaptureArtifacts(d)));

  res.json({ success: true, data: signed, total });
});

/**
 * PUT /capture-submissions/:id/acknowledge
 * BDM confirms a proxied entry.
 */
const acknowledgeCapture = catchAsync(async (req, res) => {
  const doc = await CaptureSubmission.findOne({
    _id: req.params.id,
    bdm_id: req.bdmId || req.user._id,
    entity_id: req.entityId,
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Capture submission not found' });
  }

  if (!canTransition(doc.status, 'ACKNOWLEDGED')) {
    return res.status(400).json({
      success: false,
      message: `Cannot acknowledge from status '${doc.status}'. Must be AWAITING_BDM_REVIEW.`,
    });
  }

  doc.status = 'ACKNOWLEDGED';
  doc.bdm_acknowledged_at = new Date();
  await doc.save();

  res.json({ success: true, data: doc });
});

/**
 * PUT /capture-submissions/:id/dispute
 * BDM disputes a proxied entry.
 */
const disputeCapture = catchAsync(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Dispute reason is required' });
  }

  const doc = await CaptureSubmission.findOne({
    _id: req.params.id,
    bdm_id: req.bdmId || req.user._id,
    entity_id: req.entityId,
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Capture submission not found' });
  }

  if (!canTransition(doc.status, 'DISPUTED')) {
    return res.status(400).json({
      success: false,
      message: `Cannot dispute from status '${doc.status}'. Must be AWAITING_BDM_REVIEW.`,
    });
  }

  doc.status = 'DISPUTED';
  doc.disputed_at = new Date();
  doc.dispute_reason = reason.trim();
  await doc.save();

  // Notify proxy + management about the dispute
  const recipients = [];
  if (doc.proxy_id) {
    const proxyUser = await User.findById(doc.proxy_id).select('name email role').lean();
    if (proxyUser) recipients.push(proxyUser);
  }
  if (recipients.length) {
    dispatchMultiChannel(recipients, {
      subject: `Capture Disputed — ${doc.workflow_type}`,
      text: `BDM disputed a proxied ${doc.workflow_type} entry. Reason: ${reason.trim()}`,
      category: 'capture_dispute',
      entityId: doc.entity_id,
      priority: 'high',
    }).catch(err => console.error('[disputeCapture] notification failed:', err.message));
  }

  res.json({ success: true, data: doc });
});

/**
 * PUT /capture-submissions/:id/cancel
 * BDM or admin cancels a submission before processing.
 */
const cancelCapture = catchAsync(async (req, res) => {
  const filter = {
    _id: req.params.id,
    entity_id: req.entityId,
  };
  // BDMs can only cancel their own; admin/finance/president can cancel any
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!privileged) {
    filter.bdm_id = req.bdmId || req.user._id;
  }

  const doc = await CaptureSubmission.findOne(filter);
  if (!doc) {
    return res.status(404).json({ success: false, message: 'Capture submission not found' });
  }

  if (!canTransition(doc.status, 'CANCELLED')) {
    return res.status(400).json({
      success: false,
      message: `Cannot cancel from status '${doc.status}'. Only PENDING_PROXY submissions can be cancelled.`,
    });
  }

  doc.status = 'CANCELLED';
  await doc.save();

  res.json({ success: true, data: doc });
});

// ═══════════════════════════════════════════════════════════════════
// Proxy-side endpoints
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /capture-submissions/queue
 * Office proxy queue — all PENDING_PROXY + IN_PROGRESS for this entity.
 * Gated by proxy eligibility (canProxyEntry for at least one module).
 *
 * Slice 1 follow-on (May 06 2026): plain-BDM self-fetch. When `bdm_id`
 * resolves to the caller's own _id (or the literal 'self'), the proxy gate
 * is bypassed and the filter is hard-scoped to that BDM. This unlocks the
 * picker's zero-typing benefit for BDMs reviewing their own pending
 * captures without granting them PROXY_PULL_CAPTURE (which would expose
 * other BDMs' rows).
 */
const getProxyQueue = catchAsync(async (req, res) => {
  const { status, workflow_type, bdm_id, limit = 50, skip = 0, sort_by = 'created_at', sort_dir = 'asc' } = req.query;

  // Self-fetch intent — 'self' is the explicit form; matching ID is also
  // honored so callers passing the user's own _id work unchanged.
  const callerId = String(req.user._id);
  const isSelfFetch = bdm_id === 'self' || (bdm_id && String(bdm_id) === callerId);

  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);

  // Self-fetch + privileged both skip the proxy-gate scan. Anyone else
  // still needs canProxyEntry on at least one module (existing behavior).
  if (!isSelfFetch && !privileged) {
    const proxyModules = ['sales', 'collections', 'inventory', 'expenses'];
    let hasAnyProxy = false;
    for (const mod of proxyModules) {
      const { canProxy } = await canProxyEntry(req, mod, 'proxy_entry');
      if (canProxy) { hasAnyProxy = true; break; }
    }
    if (!hasAnyProxy) {
      return res.status(403).json({ success: false, message: 'Proxy entry rights required to view the queue' });
    }
  }

  const filter = { entity_id: req.entityId };

  if (status) {
    filter.status = Array.isArray(status) ? { $in: status } : status;
  } else {
    // Default: show actionable items
    filter.status = { $in: ['PENDING_PROXY', 'IN_PROGRESS'] };
  }
  if (workflow_type) filter.workflow_type = workflow_type;

  if (isSelfFetch) {
    // Hard-scope to caller's own captures — no leak even if a future caller
    // forgets to set bdm_id explicitly. 'self' resolves here.
    filter.bdm_id = callerId;
  } else if (bdm_id) {
    filter.bdm_id = bdm_id;
  }

  const sortObj = {};
  sortObj[sort_by] = sort_dir === 'desc' ? -1 : 1;

  const [data, total] = await Promise.all([
    CaptureSubmission.find(filter)
      .sort(sortObj)
      .skip(Number(skip))
      .limit(Number(limit))
      .populate('bdm_id', 'name role')
      .populate('proxy_id', 'name role')
      .lean(),
    CaptureSubmission.countDocuments(filter),
  ]);

  // Compute SLA age for each item, then sign S3 URLs so the proxy queue
  // (and the upcoming PendingCapturesPicker drawer on ERP entry pages) can
  // render thumbnails on a private bucket.
  const now = Date.now();
  const enriched = await Promise.all(data.map(async d => {
    const signed = await signCaptureArtifacts(d);
    return {
      ...signed,
      age_hours: Math.round((now - new Date(d.created_at).getTime()) / (1000 * 60 * 60) * 10) / 10,
    };
  }));

  res.json({ success: true, data: enriched, total });
});

/**
 * GET /capture-submissions/:id
 * Single submission detail — proxy or BDM owner.
 */
const getCaptureById = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id, entity_id: req.entityId };
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!privileged) {
    // Check proxy eligibility or ownership
    const proxyModules = ['sales', 'collections', 'inventory', 'expenses'];
    let hasAnyProxy = false;
    for (const mod of proxyModules) {
      const { canProxy } = await canProxyEntry(req, mod, 'proxy_entry');
      if (canProxy) { hasAnyProxy = true; break; }
    }
    if (!hasAnyProxy) {
      filter.bdm_id = req.bdmId || req.user._id;
    }
  }

  const doc = await CaptureSubmission.findOne(filter)
    .populate('bdm_id', 'name role')
    .populate('proxy_id', 'name role')
    .populate('created_by', 'name role')
    // Phase P1.2 Slice 9 — drawer renders "Received {date} by {name}" when
    // paper has been attested. Without this populate the name slot was
    // silently empty (ObjectId→.name = undefined).
    .populate('physical_received_by', 'name role')
    .lean();

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Capture submission not found' });
  }

  // Phase P1.2 Slice 1 — sign S3 URLs for the detail render path.
  const signed = await signCaptureArtifacts(doc);

  res.json({ success: true, data: signed });
});

/**
 * PUT /capture-submissions/:id/pickup
 * Proxy picks up a submission — transitions PENDING_PROXY → IN_PROGRESS.
 */
const pickupCapture = catchAsync(async (req, res) => {
  const doc = await CaptureSubmission.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    status: 'PENDING_PROXY',
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Submission not found or already picked up' });
  }

  doc.status = 'IN_PROGRESS';
  doc.proxy_id = req.user._id;
  doc.proxy_started_at = new Date();
  await doc.save();

  res.json({ success: true, data: doc });
});

/**
 * PUT /capture-submissions/:id/release
 * Proxy releases a submission back to the queue — IN_PROGRESS → PENDING_PROXY.
 */
const releaseCapture = catchAsync(async (req, res) => {
  const doc = await CaptureSubmission.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    status: 'IN_PROGRESS',
    proxy_id: req.user._id,
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Submission not found or not assigned to you' });
  }

  doc.status = 'PENDING_PROXY';
  doc.proxy_id = undefined;
  doc.proxy_started_at = undefined;
  await doc.save();

  res.json({ success: true, data: doc });
});

/**
 * PUT /capture-submissions/:id/complete
 * Proxy marks processing complete — links the created ERP doc.
 * IN_PROGRESS → PROCESSED (or AWAITING_BDM_REVIEW if workflow warrants review).
 */
const completeCapture = catchAsync(async (req, res) => {
  const { linked_doc_kind, linked_doc_id, proxy_notes, skip_review, paper_received } = req.body;

  const doc = await CaptureSubmission.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
    status: 'IN_PROGRESS',
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Submission not found or not in progress' });
  }

  // Ensure the proxy completing is the one who picked it up (or privileged)
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!privileged && String(doc.proxy_id) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the assigned proxy can complete this submission' });
  }

  doc.proxy_completed_at = new Date();
  doc.proxy_notes = proxy_notes;

  if (linked_doc_kind) doc.linked_doc_kind = linked_doc_kind;
  if (linked_doc_id) doc.linked_doc_id = linked_doc_id;

  // Phase P1.2 Slice 9 — inline "paper received" attestation. Lookup-gated
  // (MARK_PAPER_RECEIVED) so a proxy can flip physical_status atomically with
  // the lifecycle transition rather than walking back to the archive page.
  // Silently ignored on digital-only captures (physical_required=false) and
  // when the flag wasn't passed. President bypasses via userCanPerformCaptureAction.
  if (paper_received === true && doc.physical_required) {
    const canMark = await userCanPerformCaptureAction(
      req.user, 'MARK_PAPER_RECEIVED', req.entityId,
    );
    if (!canMark) {
      return res.status(403).json({
        success: false,
        message: 'paper_received attestation requires MARK_PAPER_RECEIVED permission.',
      });
    }
    doc.physical_status = 'RECEIVED';
    doc.physical_received_at = new Date();
    doc.physical_received_by = req.user._id;
  }

  // Workflows that need BDM review before final acknowledgment.
  // SMER review = personal-vs-official gas split (per business rule).
  // COLLECTION + CWT_INBOUND review = money/tax reconciliation.
  const REVIEW_WORKFLOWS = [
    'EXPENSE', 'SALES', 'FUEL_ENTRY', 'SMER',
    'COLLECTION', 'CWT_INBOUND',
  ];
  if (!skip_review && REVIEW_WORKFLOWS.includes(doc.workflow_type)) {
    doc.status = 'AWAITING_BDM_REVIEW';
  } else {
    doc.status = 'PROCESSED';
  }

  await doc.save();

  // Notify BDM about the processed entry
  if (doc.status === 'AWAITING_BDM_REVIEW') {
    const bdmUser = await User.findById(doc.bdm_id).select('name email role').lean();
    if (bdmUser) {
      dispatchMultiChannel([bdmUser], {
        subject: `Proxied ${doc.workflow_type} Ready for Review`,
        text: `Your ${doc.workflow_type.toLowerCase()} capture has been processed by the office team. Please review and confirm.`,
        category: 'capture_review',
        entityId: doc.entity_id,
        priority: 'normal',
      }).catch(err => console.error('[completeCapture] notification failed:', err.message));
    }
  }

  res.json({ success: true, data: doc });
});

// ═══════════════════════════════════════════════════════════════════
// Phase P1.2 Slice 9 partial — auto-finalize on attach
// ═══════════════════════════════════════════════════════════════════

/**
 * Best-effort link from a capture-submission to the ERP doc it became.
 *
 * Called by attach/create endpoints (e.g. salesController.attachReceivedCsi
 * in the Round 2A picker path) so a capture used by a downstream document
 * automatically transitions out of PENDING_PROXY/IN_PROGRESS and carries
 * a back-reference for the audit trail.
 *
 * Contract:
 *   - Idempotent: re-linking the same kind+id is a no-op.
 *   - Silent on missing/access-denied — does NOT throw. The attach flow
 *     should not fail because of a stale or out-of-scope capture_id.
 *   - Status walk: PENDING_PROXY/IN_PROGRESS only. Terminal states stay
 *     where they are (the row is already linked elsewhere or cancelled).
 *   - Workflow-aware terminal: the same REVIEW_WORKFLOWS list as
 *     completeCapture so SALES/COLLECTION/etc. land in AWAITING_BDM_REVIEW
 *     and SMER lands directly in PROCESSED.
 *
 * Auth: BDM owner OR proxy (current proxy_id) OR privileged (admin/finance/
 * president). A picker caller without any of those is silently ignored.
 *
 * @param {String|ObjectId} captureId
 * @param {String} kind            e.g. 'sales_line', 'expense', 'grn'
 * @param {String|ObjectId} docId  the just-saved ERP doc's _id
 * @param {Object} ctx             { user, entityId, isPresident, isAdmin, isFinance }
 * @returns {Promise<Object|null>} the saved capture, or null if no-op
 */
async function linkCaptureToDocument(captureId, kind, docId, ctx) {
  if (!captureId) return null;

  let cap;
  try {
    cap = await CaptureSubmission.findOne({
      _id: captureId,
      entity_id: ctx.entityId,
    });
  } catch (err) {
    // Bad ObjectId etc. — silent, attach already succeeded.
    return null;
  }
  if (!cap) return null;

  // Idempotent: already pointed at the same doc, nothing to do.
  if (
    cap.linked_doc_kind === kind &&
    String(cap.linked_doc_id || '') === String(docId)
  ) {
    return cap;
  }

  // Access guard. The attach endpoint above this helper has already
  // authenticated; this is a defense-in-depth check that the user actually
  // has a relationship to the capture they're claiming to finalize.
  const userId = String(ctx.user._id);
  const isOwner = String(cap.bdm_id) === userId;
  const isProxy = String(cap.proxy_id || '') === userId;
  const isPrivileged = !!(ctx.isPresident || ctx.isAdmin || ctx.isFinance);
  if (!isOwner && !isProxy && !isPrivileged) return null;

  // Stamp link + proxy fingerprint (so the audit trail records who closed it).
  cap.linked_doc_kind = kind;
  cap.linked_doc_id = docId;
  if (!cap.proxy_id) cap.proxy_id = ctx.user._id;
  if (!cap.proxy_started_at) cap.proxy_started_at = new Date();
  cap.proxy_completed_at = new Date();

  // Status walk — only flip if currently actionable. Terminal states
  // (ACKNOWLEDGED/DISPUTED/CANCELLED/AUTO_ACKNOWLEDGED/PROCESSED already)
  // stay where they are. PROCESSED here is intentional: don't re-trigger
  // a BDM review notification on a capture the BDM already saw.
  if (cap.status === 'PENDING_PROXY' || cap.status === 'IN_PROGRESS') {
    const REVIEW_WORKFLOWS = [
      'EXPENSE', 'SALES', 'FUEL_ENTRY', 'SMER',
      'COLLECTION', 'CWT_INBOUND',
    ];
    cap.status = REVIEW_WORKFLOWS.includes(cap.workflow_type)
      ? 'AWAITING_BDM_REVIEW'
      : 'PROCESSED';
  }

  try {
    await cap.save();
  } catch (err) {
    // Validation/concurrency — log but don't break the attach.
    console.error('[linkCaptureToDocument] save failed:', err.message);
    return null;
  }
  return cap;
}

// ═══════════════════════════════════════════════════════════════════
// Phase P1.2 Slice 8 — Capture Archive (browseable history)
// Phase P1.2 Slice 9 — Override controls (RECEIVED ↔ MISSING)
// ═══════════════════════════════════════════════════════════════════

// Resolve archive scope from sub-permissions. Centralized so the four
// archive endpoints (summary / leaves / bulk-mark / report) share one rule:
//   - VIEW_ALL_ARCHIVE  → any bdm_id query param honored; null = all BDMs
//   - VIEW_OWN_ARCHIVE  → bdm_id forced to req.user._id, query param ignored
//   - neither           → 403
async function resolveArchiveScope(req) {
  const canViewAll = await userCanPerformCaptureAction(
    req.user, 'VIEW_ALL_ARCHIVE', req.entityId,
  );
  const canViewOwn = await userCanPerformCaptureAction(
    req.user, 'VIEW_OWN_ARCHIVE', req.entityId,
  );
  if (!canViewAll && !canViewOwn) {
    return { allowed: false };
  }
  const queryBdmId = req.query.bdm_id;
  const bdmFilter = canViewAll
    ? (queryBdmId || null)
    : String(req.user._id);
  return { allowed: true, canViewAll, bdmFilter };
}

/**
 * GET /capture-submissions/archive/summary
 *
 * Counts grouped by period (YYYY-MM) × cycle (C1/C2) × workflow_type ×
 * physical_status. Drives the folder tree on /erp/capture-archive. Cycle
 * model matches DriveAllocation / SmerEntry / CarLogbookEntry / Payslip
 * (half-monthly) so a CSV cycle audit dropped here lines up exactly with
 * the per-diem and drive-allocation reports for the same window.
 *
 * Optional filters: bdm_id (only honored if caller has VIEW_ALL_ARCHIVE),
 * year (numeric, narrows by Manila-local year of created_at).
 */
const getCaptureArchiveSummary = catchAsync(async (req, res) => {
  const scope = await resolveArchiveScope(req);
  if (!scope.allowed) {
    return res.status(403).json({
      success: false,
      message: 'Capture Archive requires VIEW_OWN_ARCHIVE or VIEW_ALL_ARCHIVE permission.',
    });
  }

  const match = { entity_id: req.entityId };
  if (scope.bdmFilter) match.bdm_id = new (require('mongoose').Types.ObjectId)(scope.bdmFilter);

  const yearFilter = req.query.year ? Number(req.query.year) : null;

  // Project Manila-local year + period 'YYYY-MM' + day-of-month + cycle once.
  // dateAdd → MANILA_OFFSET_MS shift, then $year/$month/$dayOfMonth on the
  // shifted Date. cycle is C1 if day ≤ 15 else C2.
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        _manila_dt: {
          $dateAdd: { startDate: '$created_at', unit: 'millisecond', amount: MANILA_OFFSET_MS },
        },
      },
    },
    {
      $addFields: {
        _manila_year: { $year: '$_manila_dt' },
        _manila_month: { $month: '$_manila_dt' },
        _manila_day: { $dayOfMonth: '$_manila_dt' },
      },
    },
    {
      $addFields: {
        _period: {
          $concat: [
            { $toString: '$_manila_year' },
            '-',
            { $cond: [{ $lt: ['$_manila_month', 10] }, '0', ''] },
            { $toString: '$_manila_month' },
          ],
        },
        _cycle: { $cond: [{ $lte: ['$_manila_day', 15] }, 'C1', 'C2'] },
      },
    },
    ...(yearFilter ? [{ $match: { _manila_year: yearFilter } }] : []),
    {
      $facet: {
        byPeriodWorkflow: [
          {
            $group: {
              _id: {
                year: '$_manila_year',
                period: '$_period',
                cycle: '$_cycle',
                workflow_type: '$workflow_type',
                sub_type: '$sub_type',
              },
              total: { $sum: 1 },
              pending: { $sum: { $cond: [{ $eq: ['$physical_status', 'PENDING'] }, 1, 0] } },
              received: { $sum: { $cond: [{ $eq: ['$physical_status', 'RECEIVED'] }, 1, 0] } },
              missing: { $sum: { $cond: [{ $eq: ['$physical_status', 'MISSING'] }, 1, 0] } },
              na: { $sum: { $cond: [{ $eq: ['$physical_status', 'N_A'] }, 1, 0] } },
            },
          },
          // Sort newest-first by (year DESC, period DESC, cycle DESC = C2 before C1)
          { $sort: { '_id.year': -1, '_id.period': -1, '_id.cycle': -1, '_id.workflow_type': 1 } },
        ],
        byBdm: scope.canViewAll
          ? [
              { $group: { _id: '$bdm_id', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ]
          // VIEW_OWN_ARCHIVE caller doesn't need the BDM picker.
          // $limit: 0 is invalid in Mongo so we use an impossible $match
          // that returns an empty pipeline result without erroring.
          : [{ $match: { _id: null } }],
      },
    },
  ];

  const [aggResult] = await CaptureSubmission.aggregate(pipeline);
  const byPeriodWorkflow = aggResult?.byPeriodWorkflow || [];
  const byBdm = aggResult?.byBdm || [];

  // Roll the flat aggregate up into year → period → cycle → workflows[].
  const yearsMap = new Map();
  for (const row of byPeriodWorkflow) {
    const { year, period, cycle, workflow_type, sub_type } = row._id;
    if (!yearsMap.has(year)) yearsMap.set(year, new Map());
    const periodsMap = yearsMap.get(year);
    if (!periodsMap.has(period)) periodsMap.set(period, new Map());
    const cyclesMap = periodsMap.get(period);
    if (!cyclesMap.has(cycle)) {
      const bounds = cycleBounds(period, cycle);
      cyclesMap.set(cycle, {
        cycle,
        period,
        // Display label "C1 (1–15)" / "C2 (16–EOM)"
        label: cycle === 'C1' ? 'C1 (1–15)' : 'C2 (16–EOM)',
        startDate: bounds?.start,
        endDate: bounds?.end,
        workflows: [],
        total: 0, pending: 0, received: 0, missing: 0, na: 0,
      });
    }
    const cycleEntry = cyclesMap.get(cycle);
    cycleEntry.workflows.push({
      workflow_type,
      sub_type: sub_type || null,
      total: row.total,
      pending: row.pending,
      received: row.received,
      missing: row.missing,
      na: row.na,
    });
    cycleEntry.total    += row.total;
    cycleEntry.pending  += row.pending;
    cycleEntry.received += row.received;
    cycleEntry.missing  += row.missing;
    cycleEntry.na       += row.na;
  }

  // Sort: years DESC, periods DESC within year, cycles DESC within period (C2 before C1)
  const years = [];
  for (const [year, periodsMap] of [...yearsMap.entries()].sort((a, b) => b[0] - a[0])) {
    const periods = [];
    for (const [period, cyclesMap] of [...periodsMap.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      const cycles = [...cyclesMap.values()].sort((a, b) => b.cycle.localeCompare(a.cycle));
      periods.push({ period, cycles });
    }
    years.push({ year, periods });
  }

  // Resolve BDM names if cross-BDM mode
  let bdmList = [];
  if (scope.canViewAll && byBdm.length) {
    const ids = byBdm.map(r => r._id);
    const users = await User.find({ _id: { $in: ids } })
      .select('name role')
      .lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));
    bdmList = byBdm.map(r => ({
      _id: r._id,
      name: userMap.get(String(r._id))?.name || '(unknown)',
      role: userMap.get(String(r._id))?.role || null,
      count: r.count,
    }));
  }

  res.json({
    success: true,
    data: {
      scope: { canViewAll: !!scope.canViewAll, bdmFilter: scope.bdmFilter },
      years,
      bdmList,
    },
  });
});

/**
 * GET /capture-submissions/archive/leaves
 *
 * Paginated row list filtered by period (YYYY-MM) + cycle (C1|C2) +
 * workflow_type + (optional) sub_type + (optional) bdm_id + (optional)
 * physical_status. Returns signed S3 URLs so the FE can render thumbnails
 * on a private bucket.
 */
const getCaptureArchiveLeaves = catchAsync(async (req, res) => {
  const scope = await resolveArchiveScope(req);
  if (!scope.allowed) {
    return res.status(403).json({
      success: false,
      message: 'Capture Archive requires VIEW_OWN_ARCHIVE or VIEW_ALL_ARCHIVE permission.',
    });
  }

  const {
    period, cycle, workflow_type, sub_type, physical_status,
    limit = 50, skip = 0, sort_dir = 'desc',
  } = req.query;

  const filter = { entity_id: req.entityId };
  if (scope.bdmFilter) filter.bdm_id = new (require('mongoose').Types.ObjectId)(scope.bdmFilter);
  if (workflow_type) filter.workflow_type = workflow_type;
  if (sub_type) filter.sub_type = sub_type;
  if (physical_status) filter.physical_status = physical_status;

  // (period, cycle) bound — both required when narrowing.
  if (period && cycle) {
    const bounds = cycleBounds(period, cycle);
    if (!bounds) {
      return res.status(400).json({
        success: false,
        message: `Invalid period+cycle: period must be 'YYYY-MM' and cycle must be 'C1' or 'C2'`,
      });
    }
    filter.created_at = { $gte: bounds.start, $lte: bounds.end };
  } else if (period || cycle) {
    return res.status(400).json({
      success: false,
      message: 'Both period and cycle are required when narrowing by cycle.',
    });
  }

  const sortObj = { created_at: sort_dir === 'asc' ? 1 : -1 };

  const [data, total] = await Promise.all([
    CaptureSubmission.find(filter)
      .sort(sortObj)
      .skip(Number(skip))
      .limit(Math.min(Number(limit), 200))
      .populate('bdm_id', 'name role')
      .populate('proxy_id', 'name role')
      .populate('physical_received_by', 'name role')
      .lean(),
    CaptureSubmission.countDocuments(filter),
  ]);

  const signed = await Promise.all(data.map(d => signCaptureArtifacts(d)));

  res.json({ success: true, data: signed, total });
});

/**
 * POST /capture-submissions/bulk-mark-received
 * Body: { ids: [String, ...] }
 *
 * Multi-select bulk attestation. Skips digital-only (physical_required=false),
 * already-RECEIVED, and rows outside the caller's entity/scope. Returns per-id
 * outcomes so the FE can render a granular toast.
 */
const bulkMarkReceived = catchAsync(async (req, res) => {
  const canBulk = await userCanPerformCaptureAction(
    req.user, 'BULK_MARK_RECEIVED', req.entityId,
  );
  if (!canBulk) {
    return res.status(403).json({
      success: false,
      message: 'Bulk mark received requires BULK_MARK_RECEIVED permission.',
    });
  }

  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids[] is required and must be non-empty.' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ success: false, message: 'Bulk mark capped at 200 ids per call.' });
  }

  const docs = await CaptureSubmission.find({
    _id: { $in: ids },
    entity_id: req.entityId,
  }).select('_id physical_required physical_status bdm_id');

  const foundIds = new Set(docs.map(d => String(d._id)));
  const outcomes = ids.map(id => {
    const found = foundIds.has(String(id));
    if (!found) return { id, outcome: 'not_found' };
    const doc = docs.find(d => String(d._id) === String(id));
    if (!doc.physical_required) return { id, outcome: 'skipped_digital_only' };
    if (doc.physical_status === 'RECEIVED') return { id, outcome: 'skipped_already_received' };
    return { id, outcome: 'marked' };
  });

  const toMark = outcomes
    .filter(o => o.outcome === 'marked')
    .map(o => o.id);

  let modified = 0;
  if (toMark.length > 0) {
    const result = await CaptureSubmission.updateMany(
      { _id: { $in: toMark }, entity_id: req.entityId },
      {
        $set: {
          physical_status: 'RECEIVED',
          physical_received_at: new Date(),
          physical_received_by: req.user._id,
        },
      },
    );
    modified = result.modifiedCount || 0;
  }

  res.json({
    success: true,
    data: {
      requested: ids.length,
      marked: modified,
      skipped: outcomes.filter(o => o.outcome.startsWith('skipped')).length,
      not_found: outcomes.filter(o => o.outcome === 'not_found').length,
      outcomes,
    },
  });
});

/**
 * PUT /capture-submissions/:id/physical-status
 * Body: { physical_status: 'RECEIVED'|'MISSING'|'PENDING' }
 *
 * Phase P1.2 Slice 9 — president-only override. Default lookup row is
 * [president]; subscriber loosens to admin if needed. RECEIVED stamps
 * received_at + received_by; MISSING/PENDING clears those.
 */
const VALID_OVERRIDE_STATUSES = ['PENDING', 'RECEIVED', 'MISSING'];

const overridePhysicalStatus = catchAsync(async (req, res) => {
  const canOverride = await userCanPerformCaptureAction(
    req.user, 'OVERRIDE_PHYSICAL_STATUS', req.entityId,
  );
  if (!canOverride) {
    return res.status(403).json({
      success: false,
      message: 'Physical status override requires OVERRIDE_PHYSICAL_STATUS permission (president by default).',
    });
  }

  const { physical_status } = req.body || {};
  if (!VALID_OVERRIDE_STATUSES.includes(physical_status)) {
    return res.status(400).json({
      success: false,
      message: `physical_status must be one of: ${VALID_OVERRIDE_STATUSES.join(', ')}`,
    });
  }

  const doc = await CaptureSubmission.findOne({
    _id: req.params.id,
    entity_id: req.entityId,
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Capture submission not found' });
  }

  if (!doc.physical_required) {
    return res.status(400).json({
      success: false,
      message: 'Cannot override physical status on a digital-only capture (physical_required=false).',
    });
  }

  doc.physical_status = physical_status;
  if (physical_status === 'RECEIVED') {
    doc.physical_received_at = new Date();
    doc.physical_received_by = req.user._id;
  } else {
    // MISSING or PENDING — clear the receipt fingerprint so the audit trail
    // reflects the override.
    doc.physical_received_at = undefined;
    doc.physical_received_by = undefined;
  }
  await doc.save();

  // Return only the physical_* fields the FE needs to merge into the open
  // drawer. Returning the full doc would clobber the caller's populated
  // bdm_id/proxy_id refs with raw ObjectIds (the saved Mongoose doc isn't
  // populated). The FE merges via { ...prev, ...res.data } so only listing
  // the changed fields keeps the drawer's display intact.
  res.json({
    success: true,
    data: {
      _id: doc._id,
      physical_status: doc.physical_status,
      physical_received_at: doc.physical_received_at || null,
      physical_received_by: doc.physical_received_by
        ? { _id: doc.physical_received_by, name: req.user.name }
        : null,
    },
  });
});

/**
 * GET /capture-submissions/archive/cycle-report
 * Query: period (YYYY-MM), cycle (C1|C2), [bdm_id], [format=csv|json]
 *
 * Cycle audit export. CSV is the default (fast, no PDF dep). JSON returned
 * structurally for the FE to render an in-page preview. Same C1/C2 cycle
 * convention as DriveAllocation/SmerEntry/CarLogbookEntry/Payslip so a
 * cycle audit dropped here lines up exactly with their reports.
 */
const getCycleAuditReport = catchAsync(async (req, res) => {
  const canReport = await userCanPerformCaptureAction(
    req.user, 'GENERATE_CYCLE_REPORT', req.entityId,
  );
  if (!canReport) {
    return res.status(403).json({
      success: false,
      message: 'Cycle audit report requires GENERATE_CYCLE_REPORT permission.',
    });
  }

  const scope = await resolveArchiveScope(req);
  if (!scope.allowed) {
    // Defensive — anyone with GENERATE_CYCLE_REPORT also has VIEW_ALL_ARCHIVE
    // by default, but keep the gate explicit so the lookup-driven contract
    // stays clean if subscribers split them later.
    return res.status(403).json({
      success: false,
      message: 'Cycle audit report requires VIEW_ALL_ARCHIVE or VIEW_OWN_ARCHIVE permission.',
    });
  }

  const { period, cycle } = req.query;
  if (!period || !cycle) {
    return res.status(400).json({
      success: false,
      message: 'period (YYYY-MM) and cycle (C1|C2) query params are required',
    });
  }
  const bounds = cycleBounds(period, cycle);
  if (!bounds) {
    return res.status(400).json({
      success: false,
      message: `Invalid period+cycle: period must be 'YYYY-MM' and cycle must be 'C1' or 'C2'`,
    });
  }

  const filter = {
    entity_id: req.entityId,
    created_at: { $gte: bounds.start, $lte: bounds.end },
  };
  if (scope.bdmFilter) filter.bdm_id = new (require('mongoose').Types.ObjectId)(scope.bdmFilter);

  const rows = await CaptureSubmission.find(filter)
    .sort({ created_at: 1 })
    .populate('bdm_id', 'name role')
    .populate('proxy_id', 'name role')
    .populate('physical_received_by', 'name role')
    .lean();

  const format = (req.query.format || 'csv').toLowerCase();

  if (format === 'json') {
    return res.json({
      success: true,
      data: {
        period,
        cycle,
        startDate: bounds.start,
        endDate: bounds.end,
        rows: rows.map(r => ({
          id: r._id,
          created_at: r.created_at,
          bdm: r.bdm_id?.name || '(unknown)',
          workflow_type: r.workflow_type,
          sub_type: r.sub_type,
          status: r.status,
          physical_required: r.physical_required,
          physical_status: r.physical_status,
          physical_received_at: r.physical_received_at,
          physical_received_by: r.physical_received_by?.name || null,
          amount_declared: r.amount_declared,
          linked_doc_kind: r.linked_doc_kind,
          linked_doc_id: r.linked_doc_id,
        })),
      },
    });
  }

  // CSV — keep the column order stable; auditors will diff cycle reports
  // across months and unstable column ordering destroys diff legibility.
  const COLUMNS = [
    'id', 'created_at', 'bdm', 'workflow_type', 'sub_type',
    'status', 'physical_required', 'physical_status',
    'physical_received_at', 'physical_received_by',
    'amount_declared', 'payment_mode',
    'linked_doc_kind', 'linked_doc_id',
    'proxy', 'proxy_completed_at', 'bdm_acknowledged_at',
  ];
  const escapeCsv = (v) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push([
      r._id,
      r.created_at,
      r.bdm_id?.name || '',
      r.workflow_type,
      r.sub_type || '',
      r.status,
      r.physical_required,
      r.physical_status,
      r.physical_received_at || '',
      r.physical_received_by?.name || '',
      r.amount_declared ?? '',
      r.payment_mode || '',
      r.linked_doc_kind || '',
      r.linked_doc_id || '',
      r.proxy_id?.name || '',
      r.proxy_completed_at || '',
      r.bdm_acknowledged_at || '',
    ].map(escapeCsv).join(','));
  }
  const csv = lines.join('\n');

  const filename = `cycle-audit-${period}-${cycle}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// ═══════════════════════════════════════════════════════════════════
// Dashboard / metrics endpoints
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /capture-submissions/stats
 * Aggregated stats for the proxy queue dashboard.
 */
const getQueueStats = catchAsync(async (req, res) => {
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!privileged) {
    return res.status(403).json({ success: false, message: 'Admin/finance/president only' });
  }

  const entityId = req.entityId;
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const [
    pendingTotal,
    pendingOver24h,
    pendingOver48h,
    inProgress,
    awaitingReview,
    processedToday,
    byWorkflow,
  ] = await Promise.all([
    CaptureSubmission.countDocuments({ entity_id: entityId, status: 'PENDING_PROXY' }),
    CaptureSubmission.countDocuments({ entity_id: entityId, status: 'PENDING_PROXY', created_at: { $lt: h24 } }),
    CaptureSubmission.countDocuments({ entity_id: entityId, status: 'PENDING_PROXY', created_at: { $lt: h48 } }),
    CaptureSubmission.countDocuments({ entity_id: entityId, status: 'IN_PROGRESS' }),
    CaptureSubmission.countDocuments({ entity_id: entityId, status: 'AWAITING_BDM_REVIEW' }),
    CaptureSubmission.countDocuments({
      entity_id: entityId,
      status: { $in: ['PROCESSED', 'AWAITING_BDM_REVIEW', 'ACKNOWLEDGED'] },
      proxy_completed_at: { $gte: new Date(now.toISOString().slice(0, 10)) },
    }),
    CaptureSubmission.aggregate([
      { $match: { entity_id: entityId, status: { $in: ['PENDING_PROXY', 'IN_PROGRESS'] } } },
      { $group: { _id: '$workflow_type', count: { $sum: 1 } } },
    ]),
  ]);

  // Average turnaround (last 30 days)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const turnaroundAgg = await CaptureSubmission.aggregate([
    {
      $match: {
        entity_id: entityId,
        proxy_completed_at: { $exists: true, $gte: thirtyDaysAgo },
        proxy_started_at: { $exists: true },
      },
    },
    {
      $group: {
        _id: '$workflow_type',
        avg_turnaround_ms: { $avg: { $subtract: ['$proxy_completed_at', '$proxy_started_at'] } },
        count: { $sum: 1 },
      },
    },
  ]);

  res.json({
    success: true,
    data: {
      pending: { total: pendingTotal, over_24h: pendingOver24h, over_48h: pendingOver48h },
      in_progress: inProgress,
      awaiting_review: awaitingReview,
      processed_today: processedToday,
      by_workflow: byWorkflow.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {}),
      turnaround: turnaroundAgg.map(r => ({
        workflow_type: r._id,
        avg_hours: Math.round(r.avg_turnaround_ms / (1000 * 60 * 60) * 10) / 10,
        count: r.count,
      })),
    },
  });
});

module.exports = {
  // BDM
  createCapture,
  uploadArtifact,
  getMyCaptures,
  getMyReviewQueue,
  acknowledgeCapture,
  disputeCapture,
  cancelCapture,
  // Proxy
  getProxyQueue,
  getCaptureById,
  pickupCapture,
  releaseCapture,
  completeCapture,
  // Phase P1.2 Slice 8 — Capture Archive
  getCaptureArchiveSummary,
  getCaptureArchiveLeaves,
  bulkMarkReceived,
  getCycleAuditReport,
  // Phase P1.2 Slice 9 — Override controls
  overridePhysicalStatus,
  // Phase P1.2 Slice 9 partial — auto-finalize on attach
  linkCaptureToDocument,
  // Dashboard
  getQueueStats,
};
