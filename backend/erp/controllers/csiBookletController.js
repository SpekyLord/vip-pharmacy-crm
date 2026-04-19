/**
 * CSI Booklet Controller — Phase 15.2 (Monitoring + Traceability)
 *
 * Endpoints (see csiBookletRoutes.js for paths):
 *   GET  /              → list booklets (sub-permission gated)
 *   GET  /validate      → monitoring-only number check (sub-permission gated)
 *   GET  /available     → BDM self-service: my available CSI numbers
 *   POST /              → create booklet (sub-permission gated)
 *   POST /:id/allocate  → allocate a range to a BDM (sub-permission gated)
 *   POST /:id/allocations/:allocIdx/void → void a number with proof image (gated)
 *   GET  /:id/allocations/:allocIdx/voids/:voidIdx/proof → signed URL to proof image
 *
 * Rule #21 compliance: `/available` never falls back to req.user._id for
 * privileged callers — if bdm_id is absent AND caller is privileged, return
 * ALL available numbers in the entity (no silent self-filter).
 */
const { catchAsync } = require('../../middleware/errorHandler');
const {
  createBooklet,
  getBooklets,
  allocate,
  validateCsiNumber,
  voidNumber,
  getAvailableForBdm
} = require('../services/csiBookletService');
const CsiBooklet = require('../models/CsiBooklet');
const { getSignedDownloadUrl } = require('../../config/s3');

const isPrivileged = (req) =>
  Boolean(req.isPresident || req.isAdmin || req.isFinance || req.user?.role === 'admin' || req.user?.role === 'finance' || req.user?.role === 'president');

const create = catchAsync(async (req, res) => {
  const data = await createBooklet(req.entityId, req.body, req.user._id);
  res.status(201).json({ success: true, data });
});

const list = catchAsync(async (req, res) => {
  const data = await getBooklets(req.entityId, req.query);
  res.json({ success: true, data });
});

const allocateHandler = catchAsync(async (req, res) => {
  const data = await allocate(req.entityId, req.params.id, req.body, req.user._id);
  res.json({ success: true, data });
});

const validate = catchAsync(async (req, res) => {
  const { bdm_id, csi_number } = req.query;
  const data = await validateCsiNumber(req.entityId, bdm_id, csi_number);
  res.json({ success: true, data });
});

/**
 * GET /available — BDM sees their unused CSI numbers; admin/finance may pass
 * ?bdm_id= to look up any BDM, or omit to see the whole entity.
 *
 * Rule #21 compliance:
 *   - privileged && ?bdm_id= present → filter by that bdm_id
 *   - privileged && no ?bdm_id=     → null (all available, no silent fallback)
 *   - NOT privileged                → always filter by their own id
 */
const getAvailable = catchAsync(async (req, res) => {
  const privileged = isPrivileged(req);
  const bdmId = privileged ? (req.query.bdm_id || null) : req.user._id;
  const data = await getAvailableForBdm(req.entityId, bdmId);
  res.json({
    success: true,
    data,
    meta: { count: data.length, bdm_id: bdmId, privileged_view: privileged && !bdmId }
  });
});

/**
 * POST /:id/allocations/:allocIdx/void
 * Multipart body: proof (file), number, reason, reason_note
 * Upload middleware has populated req.uploadedProof = { url, key }.
 */
const voidNumberHandler = catchAsync(async (req, res) => {
  if (!req.uploadedProof || !req.uploadedProof.url) {
    return res.status(400).json({ success: false, message: 'Proof image upload failed or missing.' });
  }
  const { number, reason, reason_note } = req.body;
  const allocationIndex = parseInt(req.params.allocIdx, 10);

  const data = await voidNumber(
    req.entityId,
    req.params.id,
    allocationIndex,
    number,
    {
      reason,
      reason_note,
      proof_url: req.uploadedProof.url,
      proof_key: req.uploadedProof.key
    },
    req.user._id
  );

  res.status(201).json({ success: true, data });
});

/**
 * GET /:id/allocations/:allocIdx/voids/:voidIdx/proof
 * Returns a 1-hour signed S3 URL so the UI can display the proof image.
 */
const getVoidProof = catchAsync(async (req, res) => {
  const booklet = await CsiBooklet.findOne({
    _id: req.params.id,
    entity_id: req.entityId
  }).lean();
  if (!booklet) return res.status(404).json({ success: false, message: 'Booklet not found' });

  const alloc = booklet.allocations?.[parseInt(req.params.allocIdx, 10)];
  if (!alloc) return res.status(404).json({ success: false, message: 'Allocation not found' });

  const voided = alloc.voided_numbers?.[parseInt(req.params.voidIdx, 10)];
  if (!voided) return res.status(404).json({ success: false, message: 'Void record not found' });

  const key = voided.proof_key || (() => {
    try {
      return new URL(voided.proof_url).pathname.slice(1);
    } catch {
      return voided.proof_url;
    }
  })();

  const signedUrl = await getSignedDownloadUrl(key, 3600);
  res.json({ success: true, data: { url: signedUrl, expiresIn: 3600 } });
});

module.exports = {
  create,
  list,
  allocate: allocateHandler,
  validate,
  getAvailable,
  voidNumber: voidNumberHandler,
  getVoidProof
};
