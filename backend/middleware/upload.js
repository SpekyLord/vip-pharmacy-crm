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

/**
 * Compress an image buffer using sharp.
 * Resizes to fit within maxDim x maxDim and converts to JPEG at given quality.
 * Returns { buffer, mimetype }.
 */
const compressImage = async (buffer, originalMimetype, { maxDim = 1920, quality = 80 } = {}) => {
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
 */
const processVisitPhotos = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one photo is required for visit proof.',
      });
    }

    const uploadedPhotos = [];
    const now = new Date();

    for (const file of req.files) {
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
        capturedAt: now,
        originalName: file.originalname,
        size: compressed.length,
        mimetype: compressedMime,
        hash,
      });
    }

    // Attach uploaded photos to request for controller
    req.uploadedPhotos = uploadedPhotos;
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
