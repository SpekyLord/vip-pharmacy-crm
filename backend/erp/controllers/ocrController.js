const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const { detectText } = require('../ocr/visionClient');
const { processOcr, SUPPORTED_DOC_TYPES } = require('../ocr/ocrProcessor');
const { uploadErpDocument } = require('../services/documentUpload');
const DocumentAttachment = require('../models/DocumentAttachment');

const processDocument = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Photo file is required.');
  }

  const docType = String(req.body.docType || '').trim();
  if (!docType) {
    throw new ApiError(400, 'docType is required.');
  }

  const feature = String(req.body.feature || '').trim() || undefined;
  const period = String(req.body.period || '').trim() || undefined;
  const cycle = String(req.body.cycle || '').trim() || undefined;

  const uploadResult = await uploadErpDocument(
    req.file.buffer,
    req.file.originalname,
    req.user?.name,
    period,
    cycle,
    docType,
    req.file.mimetype
  );

  const ocrResult = await detectText(req.file.buffer, { feature });

  // Pass EXIF datetime from frontend (fallback for photos without GPS stamp)
  const exifDateTime = String(req.body.exifDateTime || '').trim() || null;

  // Route through document-type parser for structured extraction
  const processed = await processOcr(docType, ocrResult, { exifDateTime });

  // Phase 9.1b: Create DocumentAttachment record for permanent audit trail
  let attachmentId = null;
  if (req.user?.entity_id) {
    try {
      const attachment = await DocumentAttachment.create({
        entity_id: req.user.entity_id,
        bdm_id: req.user._id,
        document_type: docType,
        ocr_applied: true,
        storage_url: uploadResult.url,
        s3_key: uploadResult.key,
        original_filename: req.file.originalname,
        uploaded_by: req.user._id
      });
      attachmentId = attachment._id;
    } catch (err) {
      // Non-blocking: log but don't fail OCR if attachment creation fails
      console.error('DocumentAttachment creation failed:', err.message);
    }
  }

  res.status(200).json({
    success: true,
    message: 'OCR processed successfully.',
    data: {
      s3_url: uploadResult.url,
      s3_key: uploadResult.key,
      attachment_id: attachmentId,
      doc_type: processed.doc_type,
      extracted: processed.extracted,
      classification: processed.classification,
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
