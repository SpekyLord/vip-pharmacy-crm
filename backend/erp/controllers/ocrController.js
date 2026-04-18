const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const { compressImage } = require('../../middleware/upload');
const { detectText } = require('../ocr/visionClient');
const { processOcr, SUPPORTED_DOC_TYPES } = require('../ocr/ocrProcessor');
const { enhanceForOcr } = require('../ocr/imagePreprocessor');
const { uploadErpDocument } = require('../services/documentUpload');
const DocumentAttachment = require('../models/DocumentAttachment');
const OcrSettings = require('../models/OcrSettings');
const OcrUsageLog = require('../models/OcrUsageLog');

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
  if (!req.file) throw new ApiError(400, 'Photo file is required.');

  const docType = String(req.body.docType || '').trim();
  if (!docType) throw new ApiError(400, 'docType is required.');

  const feature = String(req.body.feature || '').trim() || undefined;
  const period = String(req.body.period || '').trim() || undefined;
  const cycle = String(req.body.cycle || '').trim() || undefined;
  const entityId = req.user?.entity_id || null;
  const userId = req.user?._id || null;
  const startedAt = Date.now();

  // ── Step 1: compress + upload (always — photo upload is the fallback) ──
  const { buffer: compressedBuffer, mimetype: compressedMime } = await compressImage(
    req.file.buffer, req.file.mimetype, { maxDim: 1920, quality: 80 }
  );
  const uploadResult = await uploadErpDocument(
    compressedBuffer,
    req.file.originalname,
    req.user?.name,
    period,
    cycle,
    docType,
    compressedMime
  );

  // ── Step 2: gate via OcrSettings (per-entity, subscription-ready) ──
  const settings = await OcrSettings.getForEntity(entityId);
  let skipReason = 'NONE';

  if (!settings.enabled) {
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
        original_filename: req.file.originalname,
        uploaded_by: userId,
      });
      return att._id;
    } catch (err) {
      console.error('[OCR] DocumentAttachment creation failed:', err.message);
      return null;
    }
  };

  const writeUsage = async ({ vision_called, ai_fallback_called, preprocessing_applied, ai_trigger_reason, vendor_auto_learn_action, success, classification, error_message }) => {
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

  // ── Step 5: Full OCR pipeline ──
  let processed = null;
  let ai_fallback_called = false;
  let preprocessing_applied = false;
  let ai_trigger_reason = 'NONE';
  let vendor_auto_learn_action = 'NONE';
  try {
    // Phase H4: enhance the image for Vision (auto-rotate, grayscale, contrast, sharpen).
    // Original buffer is preserved on S3 so the BDM still sees their actual photo;
    // the enhanced version is in-memory only and used purely as Vision input.
    let visionBuffer = req.file.buffer;
    if (settings.preprocessing_enabled) {
      const pre = await enhanceForOcr(req.file.buffer);
      visionBuffer = pre.buffer;
      preprocessing_applied = pre.applied;
    }

    const ocrResult = await detectText(visionBuffer, { feature });
    const exifDateTime = String(req.body.exifDateTime || '').trim() || null;
    processed = await processOcr(docType, ocrResult, {
      exifDateTime,
      imageBuffer: req.file.buffer,
      entityId,
      userId,
      aiFallbackEnabled: settings.ai_fallback_enabled,
      aiFieldCompletionEnabled: settings.ai_field_completion_enabled,
      vendorAutoLearnEnabled: settings.vendor_auto_learn_enabled,
    });
    ai_fallback_called = !!processed.ai_fallback_used;
    ai_trigger_reason = processed.ai_trigger_reason || 'NONE';
    vendor_auto_learn_action = processed.vendor_auto_learn?.action || 'NONE';

    const attachmentId = await writeAttachment(true);
    await writeUsage({
      vision_called: true,
      ai_fallback_called,
      preprocessing_applied,
      ai_trigger_reason,
      vendor_auto_learn_action,
      success: true,
      classification: processed.classification,
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
  } catch (err) {
    // OCR failed — still surface the uploaded photo so the user has the manual fallback
    const attachmentId = await writeAttachment(false);
    await writeUsage({
      vision_called: true,
      ai_fallback_called,
      preprocessing_applied,
      ai_trigger_reason,
      vendor_auto_learn_action,
      success: false,
      classification: null,
      error_message: err.message,
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
