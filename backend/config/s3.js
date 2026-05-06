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
 * Download an S3 object as a Buffer (server-side fetch — no CORS).
 *
 * Used by the OCR controller's capture-pull mode (Phase P1.2 Slice 7-extension
 * Round 2B, May 2026) so the proxy can re-OCR a BDM-uploaded photo without the
 * browser fetching the private signed URL (which the bucket's missing CORS
 * allowlist would block on `localhost:5173` and any non-S3-origin caller).
 *
 * Stream → Buffer via async iteration, which is the AWS SDK v3 idiom for
 * Node.js Readable streams returned by `GetObjectCommand`.
 *
 * @param {string} key - S3 object key
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
const downloadFromS3 = async (key) => {
  if (!isConfigured()) {
    throw new Error('S3 is not configured. Check AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and S3_BUCKET_NAME environment variables.');
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const response = await s3Client.send(command);

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return { buffer, contentType: response.ContentType || 'application/octet-stream' };
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
 * Upload a Capture Hub artifact (Phase P1.2 Slice 1, May 2026).
 *
 * S3 prefix: capture-submissions/<entity>/<bdm>/<yyyy-mm>/<uuid>.jpg
 *
 * Per-BDM × per-month folders make S3 lifecycle policies trivial later
 * (e.g. "expire any UNCATEGORIZED capture older than 18 months that was
 * never linked to an ERP doc"). Falls back to 'unscoped' when entityId
 * or bdmId is missing — never throw, since the upload must succeed even
 * when tenantFilter hasn't fully populated req (defensive).
 */
const uploadCaptureArtifact = async (buffer, entityId, bdmId, originalName, contentType) => {
  const now = new Date();
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const safeEntity = entityId ? String(entityId) : 'unscoped';
  const safeBdm = bdmId ? String(bdmId) : 'unscoped';
  const folder = `capture-submissions/${safeEntity}/${safeBdm}/${yyyymm}`;
  const key = generateS3Key(originalName, folder);
  const url = await uploadToS3(buffer, key, contentType);
  return { url, key };
};

/**
 * Sign captured_artifacts URLs on a CaptureSubmission document.
 *
 * Bucket is private, so the public URL stored in Mongo 403s when the
 * browser fetches it anonymously. Mirrors signVisitPhotos / signCommPhotos.
 * Skips data: URLs (legacy P1.1 placeholders) and non-S3 URLs (defensive,
 * never throws — capture queue must keep rendering even on a sign miss).
 */
const signCaptureArtifacts = async (submission) => {
  if (!submission || !submission.captured_artifacts || submission.captured_artifacts.length === 0) {
    return submission;
  }
  const subObj = submission.toObject ? submission.toObject() : { ...submission };
  subObj.captured_artifacts = await Promise.all(
    subObj.captured_artifacts.map(async (a) => {
      if (!a || !a.url) return a;
      if (a.url.startsWith('data:')) return a;
      if (!a.url.includes('.amazonaws.com/')) return a;
      try {
        const key = extractKeyFromUrl(a.url);
        const signedUrl = await getSignedDownloadUrl(key, 3600);
        return { ...a, url: signedUrl };
      } catch (err) {
        // Sign failure shouldn't blank the queue — surface the unsigned URL,
        // log so admin can reconcile (likely an out-of-bucket URL).
        console.warn('[signCaptureArtifacts] sign failed:', err.message);
        return a;
      }
    })
  );
  return subObj;
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

/**
 * Sign CLM branding logo URLs. Bucket is private — stored public-format URLs
 * 403 when the browser fetches them anonymously. Mirrors signVisitPhotos.
 * @param {Object} branding - Entity.clmBranding plain object
 * @returns {Promise<Object>} branding with logoCircleUrl + logoTrademarkUrl signed
 */
const signClmBranding = async (branding) => {
  if (!branding) return branding;
  const out = { ...branding };
  if (out.logoCircleUrl) {
    const key = extractKeyFromUrl(out.logoCircleUrl);
    out.logoCircleUrl = await getSignedDownloadUrl(key, 3600);
  }
  if (out.logoTrademarkUrl) {
    const key = extractKeyFromUrl(out.logoTrademarkUrl);
    out.logoTrademarkUrl = await getSignedDownloadUrl(key, 3600);
  }
  return out;
};

module.exports = {
  s3Client,
  bucketName,
  generateS3Key,
  uploadToS3,
  uploadVisitPhoto,
  uploadCommScreenshot,
  uploadCaptureArtifact,
  uploadProductImage,
  uploadAvatar,
  uploadClmBranding,
  deleteFromS3,
  deleteByUrl,
  getSignedDownloadUrl,
  downloadFromS3,
  extractKeyFromUrl,
  isConfigured,
  signVisitPhotos,
  signCommPhotos,
  signCaptureArtifacts,
  signClmBranding,
};
