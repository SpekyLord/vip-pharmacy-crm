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
const { uploadVisitPhoto, uploadProductImage, uploadAvatar } = require('../config/s3');

// Allowed MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// File size limit: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

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
    files: MAX_FILES,
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
      // Compute MD5 hash for duplicate detection
      const hash = crypto.createHash('md5').update(file.buffer).digest('hex');

      const result = await uploadVisitPhoto(
        file.buffer,
        file.originalname,
        file.mimetype
      );

      uploadedPhotos.push({
        url: result.url,
        key: result.key,
        capturedAt: now,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        hash, // MD5 hash for duplicate detection
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

    const result = await uploadProductImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
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

    const result = await uploadAvatar(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
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

    const result = await uploadProductImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
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

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  processVisitPhotos,
  processProductImage,
  processProductImageOptional,
  processAvatar,
  parseFormDataJson,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES,
};
