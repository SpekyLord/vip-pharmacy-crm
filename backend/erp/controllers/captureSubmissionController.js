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
const DIGITAL_ONLY = (workflow_type, sub_type) =>
  workflow_type === 'SMER' ||
  (workflow_type === 'COLLECTION' && sub_type === 'PAID_CSI');

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

  // sub_type only valid for COLLECTION
  const VALID_SUB_TYPES = ['CR', 'DEPOSIT', 'PAID_CSI'];
  if (sub_type && (workflow_type !== 'COLLECTION' || !VALID_SUB_TYPES.includes(sub_type))) {
    return res.status(400).json({ success: false, message: `sub_type '${sub_type}' is invalid for workflow_type '${workflow_type}'` });
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
 */
const getProxyQueue = catchAsync(async (req, res) => {
  // Check if caller has proxy rights for at least one module
  const proxyModules = ['sales', 'collections', 'inventory', 'expenses'];
  let hasAnyProxy = false;
  for (const mod of proxyModules) {
    const { canProxy } = await canProxyEntry(req, mod, 'proxy_entry');
    if (canProxy) { hasAnyProxy = true; break; }
  }
  // President/admin/finance always see the queue
  const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
  if (!hasAnyProxy && !privileged) {
    return res.status(403).json({ success: false, message: 'Proxy entry rights required to view the queue' });
  }

  const { status, workflow_type, bdm_id, limit = 50, skip = 0, sort_by = 'created_at', sort_dir = 'asc' } = req.query;

  const filter = { entity_id: req.entityId };

  if (status) {
    filter.status = Array.isArray(status) ? { $in: status } : status;
  } else {
    // Default: show actionable items
    filter.status = { $in: ['PENDING_PROXY', 'IN_PROGRESS'] };
  }
  if (workflow_type) filter.workflow_type = workflow_type;
  if (bdm_id) filter.bdm_id = bdm_id;

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
  const { linked_doc_kind, linked_doc_id, proxy_notes, skip_review } = req.body;

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
  // Dashboard
  getQueueStats,
};
