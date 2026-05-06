const path = require('path');
const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const { compressImage } = require('../../middleware/upload');
const { detectText } = require('../ocr/visionClient');
const { processOcr, SUPPORTED_DOC_TYPES } = require('../ocr/ocrProcessor');
const { enhanceForOcr } = require('../ocr/imagePreprocessor');
const { uploadErpDocument } = require('../services/documentUpload');
const DocumentAttachment = require('../models/DocumentAttachment');
const OcrSettings = require('../models/OcrSettings');
const OcrUsageLog = require('../models/OcrUsageLog');
const CaptureSubmission = require('../models/CaptureSubmission');
const { downloadFromS3, extractKeyFromUrl } = require('../../config/s3');
const { userCanPerformCaptureAction } = require('../../utils/captureLifecycleAccess');

/**
 * OCR Controller — Phase H3 (subscription-ready)
 *
 * Flow per call:
 *   1. Validate inputs (file + docType).
 *   2. Compress + upload to S3 (always — manual photo is the fallback).
 *   3. Resolve per-entity OcrSettings (cached). If OCR is gated, return the
 *      photo-only response so the frontend's existing fallback path keeps
 *      working without modification.
 *   4. If allowed, run Vision + parser + classifier.
 *   5. Always create DocumentAttachment + OcrUsageLog (non-blocking).
 *
 * The frontend's catch-block fallback (URL.createObjectURL) is preserved by
 * returning HTTP 200 even when OCR is skipped — only `extracted`/`classification`
 * are null and `ocr_skipped_reason` indicates why.
 */
const processDocument = catchAsync(async (req, res) => {
  const docType = String(req.body.docType || '').trim();
  if (!docType) throw new ApiError(400, 'docType is required.');

  // ── Phase P1.2 Slice 7-extension Round 2B (May 2026) — capture-pull mode ──
  // Two input shapes, one OCR pipeline:
  //   Mode A (existing): multipart/form-data with `photo` File — gallery /
  //     camera capture. Multer parses → req.file.{buffer,mimetype,originalname}.
  //     The pipeline compresses + uploads to a fresh erp-documents/ key.
  //   Mode B (new): JSON body with `capture_id` referencing a CaptureSubmission
  //     uploaded by a BDM via Quick Capture. The proxy reuses the existing
  //     capture-submissions/ S3 object — no re-upload, no client-side fetch.
  //     Closes the CORS lurking-bug from Round 1 (private bucket has no
  //     allowlist for browser origins, so picker's fetch(signedS3Url) is
  //     silently blocked on localhost:5173).
  //
  // Auth gate (capture mode): caller must own the capture OR have
  // PROXY_PULL_CAPTURE (lookup-driven via CAPTURE_LIFECYCLE_ROLES, defaults
  // [admin, finance, president]). Mirrors getCaptureById's existing gate.
  const captureId = String(req.body.capture_id || '').trim();
  let inputBuffer;
  let inputOriginalName;
  let inputMimetype;
  let preExistingUpload = null; // when set, skip the re-upload step entirely

  if (captureId) {
    if (req.file) {
      throw new ApiError(400, 'Provide either a `photo` file or `capture_id`, not both.');
    }
    const capture = await CaptureSubmission.findOne({
      _id: captureId,
      entity_id: req.entityId,
    }).lean();
    if (!capture) throw new ApiError(404, 'Capture not found.');

    const privileged = !!(req.isPresident || req.isAdmin || req.isFinance);
    const isOwner = String(capture.bdm_id) === String(req.user._id);
    if (!privileged && !isOwner) {
      const canProxy = await userCanPerformCaptureAction(
        req.user, 'PROXY_PULL_CAPTURE', req.entityId,
      );
      if (!canProxy) {
        throw new ApiError(403, 'OCR on another BDM\'s capture requires PROXY_PULL_CAPTURE permission.');
      }
    }

    const artifact = (capture.captured_artifacts || []).find((a) => a && a.url);
    if (!artifact) throw new ApiError(400, 'Capture has no usable artifact to OCR.');
    if (String(artifact.url).startsWith('data:')) {
      throw new ApiError(400, 'Legacy data URL — re-upload required before OCR.');
    }
    if (!String(artifact.url).includes('.amazonaws.com/')) {
      throw new ApiError(400, 'Capture artifact is not stored in S3 — cannot OCR.');
    }

    const s3Key = artifact.key || extractKeyFromUrl(artifact.url);
    if (!s3Key) throw new ApiError(400, 'Capture artifact has no resolvable S3 key.');

    const downloaded = await downloadFromS3(s3Key);
    inputBuffer = downloaded.buffer;
    inputMimetype = downloaded.contentType || 'image/jpeg';
    inputOriginalName = path.basename(s3Key) || `capture-${captureId}.jpg`;

    // Reuse the existing capture-submissions/ key — no need to re-upload to
    // erp-documents/. Strip any signed-URL query string so we persist the
    // bare URL (read-time signing handles authorization).
    preExistingUpload = {
      url: String(artifact.url).split('?')[0],
      key: s3Key,
    };
  } else {
    if (!req.file) throw new ApiError(400, 'Photo file or capture_id is required.');
    inputBuffer = req.file.buffer;
    inputMimetype = req.file.mimetype;
    inputOriginalName = req.file.originalname;
  }

  const feature = String(req.body.feature || '').trim() || undefined;
  const period = String(req.body.period || '').trim() || undefined;
  const cycle = String(req.body.cycle || '').trim() || undefined;
  const entityId = req.user?.entity_id || null;
  const userId = req.user?._id || null;
  const startedAt = Date.now();

  // ── Step 1: resolve OcrSettings + skipReason FIRST so we can fork S3 upload
  //           and OCR work in parallel (they both read req.file.buffer and have
  //           no ordering dependency). Serially: ~upload + ~ocr. In parallel:
  //           max(upload, ocr). Saves 1.5–3s on every Scan CSI call.
  const settings = await OcrSettings.getForEntity(entityId);
  let skipReason = 'NONE';

  // Caller-opt-out: photo-only uploads (re-upload after rejection, proof-only
  // attachments) pass skip_ocr=true to avoid the Vision + AI pipeline entirely.
  const skipByRequest = String(req.body.skip_ocr || '').toLowerCase() === 'true';

  if (skipByRequest) {
    skipReason = 'SKIPPED_BY_REQUEST';
  } else if (!settings.enabled) {
    skipReason = 'OCR_DISABLED';
  } else if (Array.isArray(settings.allowed_doc_types) && settings.allowed_doc_types.length > 0
             && !settings.allowed_doc_types.includes(docType.toUpperCase())) {
    skipReason = 'DOC_TYPE_NOT_ALLOWED';
  } else if (entityId && settings.monthly_call_quota > 0) {
    const monthlyCount = await OcrUsageLog.countMonthlyForEntity(entityId);
    if (monthlyCount >= settings.monthly_call_quota) {
      skipReason = 'MONTHLY_QUOTA_EXCEEDED';
    }
  }

  // ── Step 2: fork S3 upload + OCR work in parallel. ──
  // Capture mode reuses the existing S3 object — no re-upload, just a
  // resolved promise carrying the existing url+key.
  const uploadPromise = preExistingUpload
    ? Promise.resolve(preExistingUpload)
    : (async () => {
        const { buffer, mimetype } = await compressImage(
          inputBuffer, inputMimetype, { maxDim: 1920, quality: 80 }
        );
        return uploadErpDocument(
          buffer, inputOriginalName, req.user?.name, period, cycle, docType, mimetype
        );
      })();

  // OCR state that needs to survive a partial failure so OcrUsageLog reflects
  // how far the pipeline got (e.g. preprocessing ran but Vision timed out).
  const ocrState = {
    preprocessing_applied: false,
    ai_fallback_called: false,
    ai_trigger_reason: 'NONE',
    vendor_auto_learn_action: 'NONE',
    ai_skipped_reason: 'NONE',
    cost_usd: 0,
  };

  const shouldRunOcr = skipReason === 'NONE';
  const ocrPromise = shouldRunOcr ? (async () => {
    // Phase H4: enhance the image for Vision (auto-rotate, grayscale, contrast, sharpen).
    // Original buffer is preserved on S3 so the BDM still sees their actual photo;
    // the enhanced version is in-memory only and used purely as Vision input.
    let visionBuffer = inputBuffer;
    if (settings.preprocessing_enabled) {
      const pre = await enhanceForOcr(inputBuffer);
      visionBuffer = pre.buffer;
      ocrState.preprocessing_applied = pre.applied;
    }
    const ocrResult = await detectText(visionBuffer, { feature });
    const exifDateTime = String(req.body.exifDateTime || '').trim() || null;
    const processed = await processOcr(docType, ocrResult, {
      exifDateTime,
      imageBuffer: inputBuffer,
      entityId,
      userId,
      aiFallbackEnabled: settings.ai_fallback_enabled,
      aiFieldCompletionEnabled: settings.ai_field_completion_enabled,
      vendorAutoLearnEnabled: settings.vendor_auto_learn_enabled,
    });
    ocrState.ai_fallback_called = !!processed.ai_fallback_used;
    ocrState.ai_trigger_reason = processed.ai_trigger_reason || 'NONE';
    ocrState.vendor_auto_learn_action = processed.vendor_auto_learn?.action || 'NONE';
    ocrState.ai_skipped_reason = processed.ai_skipped_reason || 'NONE';
    ocrState.cost_usd = typeof processed.ai_cost_usd === 'number' ? processed.ai_cost_usd : 0;
    return processed;
  })() : Promise.resolve(null);

  const [uploadSettled, ocrSettled] = await Promise.allSettled([uploadPromise, ocrPromise]);

  // S3 upload failing is a hard error — there is no photo and no fallback.
  if (uploadSettled.status === 'rejected') throw uploadSettled.reason;
  const uploadResult = uploadSettled.value;

  // ── Step 3: persist DocumentAttachment + log usage (non-blocking on failure) ──
  const writeAttachment = async (ocrApplied) => {
    if (!entityId) return null;
    try {
      const att = await DocumentAttachment.create({
        entity_id: entityId,
        bdm_id: userId,
        document_type: docType,
        ocr_applied: ocrApplied,
        storage_url: uploadResult.url,
        s3_key: uploadResult.key,
        original_filename: inputOriginalName,
        uploaded_by: userId,
      });
      return att._id;
    } catch (err) {
      console.error('[OCR] DocumentAttachment creation failed:', err.message);
      return null;
    }
  };

  const writeUsage = async ({ vision_called, ai_fallback_called, preprocessing_applied, ai_trigger_reason, vendor_auto_learn_action, success, classification, error_message, ai_skipped_reason, cost_usd }) => {
    if (!entityId || !settings.usage_logging_enabled) return;
    try {
      const action = vendor_auto_learn_action || 'NONE';
      await OcrUsageLog.create({
        entity_id: entityId,
        user_id: userId,
        doc_type: docType,
        vision_called,
        ai_fallback_called,
        preprocessing_applied: !!preprocessing_applied,
        ai_trigger_reason: ai_trigger_reason || 'NONE',
        vendor_auto_learn_action: action,
        vendor_auto_learned: action === 'CREATED' || action === 'ALIAS_ADDED',
        success,
        classification_confidence: classification?.confidence || null,
        match_method: classification?.match_method || null,
        latency_ms: Date.now() - startedAt,
        error_message: error_message || null,
        skipped_reason: skipReason,
        // Phase H6 — AI spend-cap visibility + cost attribution for AI Budget
        ai_skipped_reason: ai_skipped_reason || 'NONE',
        cost_usd: typeof cost_usd === 'number' && cost_usd > 0 ? cost_usd : 0,
      });
    } catch (err) {
      console.error('[OCR] OcrUsageLog write failed:', err.message);
    }
  };

  // ── Step 4: Skipped path — return photo-only response, preserving frontend fallback contract ──
  if (skipReason !== 'NONE') {
    const attachmentId = await writeAttachment(false);
    await writeUsage({ vision_called: false, ai_fallback_called: false, preprocessing_applied: false, ai_trigger_reason: 'NONE', vendor_auto_learn_action: 'NONE', success: true, classification: null });
    return res.status(200).json({
      success: true,
      message: `OCR skipped (${skipReason}). Photo uploaded — please fill in the form manually.`,
      data: {
        s3_url: uploadResult.url,
        s3_key: uploadResult.key,
        attachment_id: attachmentId,
        doc_type: docType,
        extracted: null,
        layout_family: null,
        review_required: true,
        review_reasons: [skipReason],
        preprocessing: null,
        classification: null,
        resolved: {},
        validation_flags: [{ type: 'OCR_SKIPPED', message: skipReason }],
        raw_ocr_text: '',
        ocr_skipped_reason: skipReason,
      },
    });
  }

  // ── Step 5: Full OCR pipeline — consume the already-resolved OCR work. ──
  if (ocrSettled.status === 'rejected') {
    // OCR failed — still surface the uploaded photo so the user has the manual fallback.
    const err = ocrSettled.reason;
    const attachmentId = await writeAttachment(false);
    await writeUsage({
      vision_called: true,
      ai_fallback_called: ocrState.ai_fallback_called,
      preprocessing_applied: ocrState.preprocessing_applied,
      ai_trigger_reason: ocrState.ai_trigger_reason,
      vendor_auto_learn_action: ocrState.vendor_auto_learn_action,
      success: false,
      classification: null,
      error_message: err.message,
      ai_skipped_reason: ocrState.ai_skipped_reason,
      cost_usd: ocrState.cost_usd,
    });
    return res.status(200).json({
      success: true,
      message: 'OCR failed — photo uploaded. Please fill in the form manually.',
      data: {
        s3_url: uploadResult.url,
        s3_key: uploadResult.key,
        attachment_id: attachmentId,
        doc_type: docType,
        extracted: null,
        layout_family: null,
        review_required: true,
        review_reasons: ['OCR_ERROR'],
        preprocessing: null,
        classification: null,
        resolved: {},
        validation_flags: [{ type: 'OCR_ERROR', message: err.message }],
        raw_ocr_text: '',
        ocr_error: err.message,
      },
    });
  }

  const processed = ocrSettled.value;
  const attachmentId = await writeAttachment(true);
  await writeUsage({
    vision_called: true,
    ai_fallback_called: ocrState.ai_fallback_called,
    preprocessing_applied: ocrState.preprocessing_applied,
    ai_trigger_reason: ocrState.ai_trigger_reason,
    vendor_auto_learn_action: ocrState.vendor_auto_learn_action,
    success: true,
    classification: processed.classification,
    ai_skipped_reason: ocrState.ai_skipped_reason,
    cost_usd: ocrState.cost_usd,
  });

  return res.status(200).json({
    success: true,
    message: 'OCR processed successfully.',
    data: {
      s3_url: uploadResult.url,
      s3_key: uploadResult.key,
      attachment_id: attachmentId,
      doc_type: processed.doc_type,
      extracted: processed.extracted,
      layout_family: processed.layout_family,
      review_required: processed.review_required,
      review_reasons: processed.review_reasons,
      preprocessing: processed.preprocessing,
      classification: processed.classification,
      resolved: processed.resolved || {},
      vendor_auto_learn: processed.vendor_auto_learn || null,
      validation_flags: processed.validation_flags,
      raw_ocr_text: processed.raw_ocr_text,
    },
  });
});

const getSupportedTypes = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: SUPPORTED_DOC_TYPES,
  });
});

module.exports = {
  processDocument,
  getSupportedTypes,
};
