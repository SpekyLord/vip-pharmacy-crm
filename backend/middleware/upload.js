/**
 * File Upload Middleware (Multer + AWS S3 Configuration)
 *
 * This file handles:
 * - File upload configuration using Multer
 * - File type validation (images only)
 * - File size limits
 * - Memory storage (for S3 upload)
 * - S3 integration for cloud storage
 */

const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { uploadVisitPhoto, uploadCommScreenshot, uploadProductImage, uploadAvatar } = require('../config/s3');
// Phase O — server-side EXIF + screenshot detection so the visit fraud
// surface no longer trusts client-supplied capturedAt. processVisitPhotos
// extracts metadata BEFORE compression so EXIF survives sharp's re-encode.
const { extractMetadata } = require('../utils/photoMetadata');
const visitPhotoValidation = require('../utils/visitPhotoValidation');

/**
 * Compress an image buffer using sharp.
 * Resizes to fit within maxDim x maxDim and converts to JPEG at given quality.
 * Returns { buffer, mimetype }.
 *
 * Fast-path: JPEGs under 1 MB were almost certainly pre-compressed by the
 * frontend (erp/utils/compressImage.js targets 1600px/70%, ~300-500 KB).
 * Re-encoding them with sharp+mozjpeg is 300-500ms of CPU that typically
 * GROWS the file (80% re-encode > 70% source) — pure waste on every OCR
 * call, every manual upload, every expense/visit photo. Skip and return
 * the incoming buffer as-is.
 */
const COMPRESS_FAST_PATH_MAX_BYTES = 1_000_000; // 1 MB

const compressImage = async (buffer, originalMimetype, { maxDim = 1920, quality = 80 } = {}) => {
  if (
    originalMimetype === 'image/jpeg'
    && Buffer.isBuffer(buffer)
    && buffer.length <= COMPRESS_FAST_PATH_MAX_BYTES
  ) {
    return { buffer, mimetype: 'image/jpeg' };
  }
  try {
    const compressed = await sharp(buffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    return { buffer: compressed, mimetype: 'image/jpeg' };
  } catch (err) {
    // If compression fails (corrupted image, unsupported format), upload original
    console.warn('Image compression failed, uploading original:', err.message);
    return { buffer, mimetype: originalMimetype || 'image/jpeg' };
  }
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// File size limit: 15MB — safety net for uncompressed phone photos
// (client-side compression reduces most photos to <1MB before upload)
const MAX_FILE_SIZE = 15 * 1024 * 1024;

// Maximum files per upload
const MAX_FILES = 10;

/**
 * File filter function
 * Validates file type against allowed MIME types
 */
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Only ${ALLOWED_MIME_TYPES.join(', ')} are allowed.`
      ),
      false
    );
  }
};

/**
 * Multer configuration with memory storage
 * Files are stored in memory buffer for S3 upload
 */
const storage = multer.memoryStorage();

/**
 * Base multer instance
 */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    // Per-route maxCount in upload.array(field, maxCount) enforces file count.
    // Removed global `files` cap — it was overriding batch upload's maxCount of 20.
  },
});

/**
 * Single file upload middleware
 * @param {string} fieldName - Form field name for the file
 */
const uploadSingle = (fieldName) => upload.single(fieldName);

/**
 * Multiple files upload middleware
 * @param {string} fieldName - Form field name for the files
 * @param {number} maxCount - Maximum number of files (default: 5)
 */
const uploadMultiple = (fieldName, maxCount = MAX_FILES) =>
  upload.array(fieldName, maxCount);

/**
 * Handle upload errors
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: `Too many files. Maximum is ${MAX_FILES} files.`,
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name for file upload.',
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }

  if (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  next();
};

/**
 * Middleware to upload visit photos to S3
 * Use after uploadMultiple('photos')
 * Computes MD5 hash of each photo for duplicate detection
 *
 * Phase O (May 2026) — EXIF Trust + Screenshot Block
 * --------------------------------------------------
 * Before S3 upload, extract EXIF + dimensions from the ORIGINAL buffer
 * (sharp's re-encode strips EXIF, so we must read first). Two outcomes:
 *
 *   1. Screenshot detected (no EXIF date/GPS + phone-screen-like dims)
 *      → 422 with redirect payload pointing at /bdm/comm-log. Lookup-driven
 *      via VISIT_PHOTO_VALIDATION_RULES.screenshot_block_enabled — admin
 *      can disable per-entity during BDM rollout.
 *
 *   2. Otherwise, attach the trusted server-side capturedAt + GPS + dims
 *      to req.uploadedPhotos[]. The controller uses these to derive
 *      Visit.visitDate (auto-anchored to the earliest photo) and run the
 *      late-log policy. Client-supplied photoMetadata.capturedAt is ignored
 *      when serverMetadata.capturedAt is present.
 */
const processVisitPhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one photo is required for visit proof.',
      });
    }

    // Phase O — Lookup-driven thresholds, scoped to current entity if known.
    // Falls back to inline DEFAULTS if Lookup row is missing or DB is offline,
    // so the upload never hard-fails on a config outage.
    const entityId = req.entity_id || req.user?.entity_id || null;
    const photoRules = await visitPhotoValidation.getThresholds(entityId);

    const uploadedPhotos = [];

    for (const file of req.files) {
      // Phase O — Extract EXIF + dimensions from the ORIGINAL buffer first.
      // Sharp's JPEG re-encode strips EXIF, so this MUST happen before any
      // compress step. Failure is non-fatal: the helper returns null fields,
      // controller treats them as "no EXIF".
      const serverMeta = await extractMetadata(file.buffer);

      // Phase O — Screenshot hard-block. Returns 422 with a redirect payload
      // so VisitLogger can jump the BDM to /bdm/comm-log without losing the
      // doctor selection. The 422 covers ALL photos in the upload: if even
      // ONE is a screenshot, the whole submit is rejected (mixed-screenshot
      // visits would be unsafe to partial-accept — admin can't reason about
      // them later).
      if (photoRules.screenshot_block_enabled && serverMeta.isLikelyScreenshot) {
        return res.status(422).json({
          success: false,
          code: 'SCREENSHOT_DETECTED',
          message: 'This looks like a screenshot, not a visit photo. Use Comm Log to record Messenger / Viber / chat interactions instead.',
          redirect: photoRules.screenshot_redirect_path,
          rejectedFile: file.originalname,
        });
      }

      // Only compress if file exceeds 500 KB — avoids CPU burn on small photos
      let compressed, compressedMime;
      if (file.size > 500 * 1024) {
        ({ buffer: compressed, mimetype: compressedMime } = await compressImage(file.buffer, file.mimetype));
      } else {
        compressed = file.buffer;
        compressedMime = file.mimetype;
      }

      // Compute MD5 hash on compressed buffer for duplicate detection
      const hash = crypto.createHash('md5').update(compressed).digest('hex');

      const result = await uploadVisitPhoto(
        compressed,
        file.originalname.replace(/\.\w+$/, '.jpg'),
        compressedMime
      );

      uploadedPhotos.push({
        url: result.url,
        key: result.key,
        // Phase O — Trust server-side EXIF over client claims. Falls through
        // to upload time if EXIF is absent (handled in controller's
        // resolveAggregateVisitDate). The capturedAt field below is
        // INTENTIONALLY null when EXIF is missing so the controller can
        // distinguish "trust this date" from "no signal, fall back".
        capturedAt: serverMeta.capturedAt, // null when no EXIF; controller decides
        originalName: file.originalname,
        size: compressed.length,
        mimetype: compressedMime,
        hash,
        // Phase O — Forward serverMeta to the controller so it can stamp
        // photo-level flags (no_exif_timestamp, gps_present_in_photo, etc).
        // Kept under a separate key so existing readers of req.uploadedPhotos
        // that only care about {url, hash, capturedAt} don't see the extra data.
        serverMeta: {
          exifPresent: serverMeta.exifPresent,
          exifGpsPresent: serverMeta.exifGpsPresent,
          gps: serverMeta.gps,
          dimensions: serverMeta.dimensions,
          isLikelyScreenshot: serverMeta.isLikelyScreenshot, // false here (we'd have 422'd above)
        },
      });
    }

    // Attach uploaded photos to request for controller
    req.uploadedPhotos = uploadedPhotos;
    // Phase O — Forward thresholds so the controller can make late-log
    // policy decisions without re-fetching the lookup.
    req.photoValidationRules = photoRules;
    next();
  } catch (error) {
    console.error('S3 upload error:', error);
    // Pass to global error handler for consistent error responses
    error.statusCode = 500;
    error.message = 'Failed to upload photos. Please try again.';
    next(error);
  }
};

/**
 * Middleware to upload product image to S3
 * Use after uploadSingle('image')
 */
const processProductImage = async (req, res, next) => {
  try {
    if (!req.file) {
      // Product image is required
      return res.status(400).json({
        success: false,
        message: 'Product image is required.',
      });
    }

    // Compress product image (keep higher quality for tablet showcase)
    const { buffer: compressed, mimetype: compressedMime } = await compressImage(req.file.buffer, req.file.mimetype, { maxDim: 1920, quality: 85 });

    const result = await uploadProductImage(
      compressed,
      req.file.originalname.replace(/\.\w+$/, '.jpg'),
      compressedMime
    );

    // Attach uploaded image URL to request
    req.uploadedImage = {
      url: result.url,
      key: result.key,
    };

    next();
  } catch (error) {
    console.error('S3 product image upload error:', error);
    error.statusCode = 500;
    error.message = 'Failed to upload product image. Please try again.';
    next(error);
  }
};

/**
 * Middleware to upload avatar to S3
 * Use after uploadSingle('avatar')
 */
const processAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      // Avatar is optional, continue without it
      return next();
    }

    // Compress avatar (small profile picture)
    const { buffer: compressed, mimetype: compressedMime } = await compressImage(req.file.buffer, req.file.mimetype, { maxDim: 512, quality: 80 });

    const result = await uploadAvatar(
      compressed,
      req.file.originalname.replace(/\.\w+$/, '.jpg'),
      compressedMime
    );

    // Attach uploaded avatar URL to request
    req.uploadedAvatar = {
      url: result.url,
      key: result.key,
    };

    next();
  } catch (error) {
    console.error('S3 avatar upload error:', error);
    error.statusCode = 500;
    error.message = 'Failed to upload avatar. Please try again.';
    next(error);
  }
};

/**
 * Middleware to optionally process product image
 * Use when updating product (image may not be included)
 */
const processProductImageOptional = async (req, res, next) => {
  try {
    if (!req.file) {
      // No new image, continue without uploading
      return next();
    }

    // Compress product image
    const { buffer: compressed, mimetype: compressedMime } = await compressImage(req.file.buffer, req.file.mimetype, { maxDim: 1920, quality: 85 });

    const result = await uploadProductImage(
      compressed,
      req.file.originalname.replace(/\.\w+$/, '.jpg'),
      compressedMime
    );

    // Attach uploaded image URL to request
    req.uploadedImage = {
      url: result.url,
      key: result.key,
    };

    next();
  } catch (error) {
    console.error('S3 product image upload error:', error);
    error.statusCode = 500;
    error.message = 'Failed to upload product image. Please try again.';
    next(error);
  }
};

/**
 * Middleware to parse JSON string fields in FormData before validation
 * This allows express-validator to validate nested properties like location.latitude
 */
const parseFormDataJson = (fields) => (req, res, next) => {
  fields.forEach((field) => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch (e) {
        // Leave as-is if not valid JSON, validation will catch it
      }
    }
  });
  next();
};

/**
 * Middleware to upload communication screenshots to S3
 * Use after uploadMultiple('photos')
 * Same as processVisitPhotos but uses communications/ S3 folder
 * and does not perform photo flag detection
 */
const processCommScreenshots = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one screenshot is required as proof of interaction.',
      });
    }

    const uploadedPhotos = [];
    const now = new Date();

    for (const file of req.files) {
      const { buffer: compressed, mimetype: compressedMime } = await compressImage(file.buffer, file.mimetype);
      const hash = crypto.createHash('md5').update(compressed).digest('hex');

      const result = await uploadCommScreenshot(
        compressed,
        file.originalname.replace(/\.\w+$/, '.jpg'),
        compressedMime
      );

      uploadedPhotos.push({
        url: result.url,
        key: result.key,
        capturedAt: now,
        originalName: file.originalname,
        size: compressed.length,
        mimetype: compressedMime,
        hash,
      });
    }

    req.uploadedPhotos = uploadedPhotos;
    next();
  } catch (error) {
    console.error('S3 comm screenshot upload error:', error);
    error.statusCode = 500;
    error.message = 'Failed to upload screenshots. Please try again.';
    next(error);
  }
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  compressImage,
  processVisitPhotos,
  processCommScreenshots,
  processProductImage,
  processProductImageOptional,
  processAvatar,
  parseFormDataJson,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES,
};
