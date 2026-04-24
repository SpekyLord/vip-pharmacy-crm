/**
 * AWS S3 Configuration
 *
 * This file handles:
 * - AWS S3 client initialization
 * - Upload and delete operations
 * - Signed URL generation
 * - Folder structure management
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.S3_BUCKET_NAME;

/**
 * Generate a unique filename with folder structure
 * @param {string} originalName - Original filename
 * @param {string} folder - Folder path (e.g., 'visits/2024/12', 'products', 'avatars')
 * @returns {string} Full S3 key
 */
const generateS3Key = (originalName, folder = 'uploads') => {
  const ext = path.extname(originalName).toLowerCase();
  const filename = `${uuidv4()}${ext}`;
  return `${folder}/${filename}`;
};

/**
 * Upload a file buffer to S3
 * @param {Buffer} buffer - File buffer
 * @param {string} key - S3 object key
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} Public URL of uploaded file
 */
const uploadToS3 = async (buffer, key, contentType) => {
  if (!isConfigured()) {
    throw new Error('S3 is not configured. Check AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME environment variables.');
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    // ACL: 'public-read', // Uncomment if bucket allows public access
  });

  await s3Client.send(command);

  // Return the public URL
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
};

/**
 * Upload a visit photo
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, key: string}>}
 */
const uploadVisitPhoto = async (buffer, originalName, contentType) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = `visits/${year}/${month}`;
  const key = generateS3Key(originalName, folder);
  const url = await uploadToS3(buffer, key, contentType);
  return { url, key };
};

/**
 * Upload a product image
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, key: string}>}
 */
const uploadProductImage = async (buffer, originalName, contentType) => {
  const key = generateS3Key(originalName, 'products');
  const url = await uploadToS3(buffer, key, contentType);
  return { url, key };
};

/**
 * Upload a user avatar
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, key: string}>}
 */
const uploadAvatar = async (buffer, originalName, contentType) => {
  const key = generateS3Key(originalName, 'avatars');
  const url = await uploadToS3(buffer, key, contentType);
  return { url, key };
};

/**
 * Upload a CLM branding asset (logo). Per-entity folder so cleanup + audit
 * are straightforward. Kind is 'logoCircle' or 'logoTrademark'.
 * @param {Buffer} buffer - Image buffer
 * @param {string} entityId - Entity ObjectId (stringifiable)
 * @param {string} kind - 'logoCircle' | 'logoTrademark'
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, key: string}>}
 */
const uploadClmBranding = async (buffer, entityId, kind, contentType) => {
  const safeKind = kind === 'logoTrademark' ? 'logoTrademark' : 'logoCircle';
  const folder = `clm-branding/${entityId}`;
  const key = generateS3Key(`${safeKind}.jpg`, folder);
  const url = await uploadToS3(buffer, key, contentType);
  return { url, key };
};

/**
 * Delete a file from S3
 * @param {string} key - S3 object key
 * @returns {Promise<void>}
 */
const deleteFromS3 = async (key) => {
  if (!isConfigured()) {
    throw new Error('S3 is not configured. Check AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME environment variables.');
  }

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Delete a file by URL
 * @param {string} url - Full S3 URL
 * @returns {Promise<void>}
 */
const deleteByUrl = async (url) => {
  try {
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1); // Remove leading slash
    await deleteFromS3(key);
  } catch (error) {
    if (error.message.includes('S3 is not configured')) throw error;
    throw new Error(`Invalid S3 URL: ${url}`);
  }
};

/**
 * Generate a signed URL for private file access
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration time in seconds (default: 3600)
 * @returns {Promise<string>} Signed URL
 */
const getSignedDownloadUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

/**
 * Extract S3 key from a full URL
 * @param {string} url - Full S3 URL
 * @returns {string} S3 key
 */
const extractKeyFromUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.slice(1); // Remove leading slash
  } catch {
    return url; // Return as-is if not a valid URL
  }
};

/**
 * Check if S3 configuration is valid
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  );
};

/**
 * Sign all photo URLs in a visit object
 * Replaces public S3 URLs with temporary signed URLs for private bucket access
 * @param {Object} visit - Visit document (or plain object)
 * @returns {Promise<Object>} Visit with signed photo URLs
 */
const signVisitPhotos = async (visit) => {
  if (!visit || !visit.photos || visit.photos.length === 0) {
    return visit;
  }

  const visitObj = visit.toObject ? visit.toObject() : { ...visit };

  visitObj.photos = await Promise.all(
    visitObj.photos.map(async (photo) => {
      const key = extractKeyFromUrl(photo.url);
      const signedUrl = await getSignedDownloadUrl(key, 3600); // 1 hour expiry (security best practice)
      return { ...photo, url: signedUrl };
    })
  );

  return visitObj;
};

/**
 * Upload a communication screenshot
 * @param {Buffer} buffer - Image buffer
 * @param {string} originalName - Original filename
 * @param {string} contentType - MIME type
 * @returns {Promise<{url: string, key: string}>}
 */
const uploadCommScreenshot = async (buffer, originalName, contentType) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const folder = `communications/${year}/${month}`;
  const key = generateS3Key(originalName, folder);
  const url = await uploadToS3(buffer, key, contentType);
  return { url, key };
};

/**
 * Sign all photo URLs in a communication log object
 * @param {Object} log - CommunicationLog document (or plain object)
 * @returns {Promise<Object>} Log with signed photo URLs
 */
const signCommPhotos = async (log) => {
  if (!log || !log.photos || log.photos.length === 0) {
    return log;
  }

  const logObj = log.toObject ? log.toObject() : { ...log };

  logObj.photos = await Promise.all(
    logObj.photos.map(async (photo) => {
      const key = extractKeyFromUrl(photo.url);
      const signedUrl = await getSignedDownloadUrl(key, 3600);
      return { ...photo, url: signedUrl };
    })
  );

  return logObj;
};

module.exports = {
  s3Client,
  bucketName,
  generateS3Key,
  uploadToS3,
  uploadVisitPhoto,
  uploadCommScreenshot,
  uploadProductImage,
  uploadAvatar,
  uploadClmBranding,
  deleteFromS3,
  deleteByUrl,
  getSignedDownloadUrl,
  extractKeyFromUrl,
  isConfigured,
  signVisitPhotos,
  signCommPhotos,
};
