const { catchAsync, ApiError } = require('../../middleware/errorHandler');
const { detectText } = require('../ocr/visionClient');
const { uploadErpDocument } = require('../services/documentUpload');

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

  res.status(200).json({
    success: true,
    message: 'OCR processed successfully.',
    data: {
      docType,
      sourceImageUrl: uploadResult.url,
      sourceImageKey: uploadResult.key,
      featureUsed: ocrResult.featureUsed,
      fullText: ocrResult.fullText,
      words: ocrResult.words,
      raw: ocrResult.raw,
    },
  });
});

module.exports = {
  processDocument,
};
