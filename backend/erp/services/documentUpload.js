const path = require('path');
const { generateS3Key, uploadToS3 } = require('../../config/s3');

function sanitizeSegment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return cleaned || fallback;
}

function getDefaultPeriod() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

async function uploadErpDocument(
  fileBuffer,
  fileName,
  bdmName,
  period,
  cycle,
  docType,
  contentType
) {
  const safeBdm = sanitizeSegment(bdmName, 'unknown-user');
  const safePeriod = sanitizeSegment(period, getDefaultPeriod());
  const safeCycle = sanitizeSegment(cycle, 'ad-hoc');
  const safeDocType = sanitizeSegment(docType, 'unknown');

  const ext = path.extname(fileName || '').toLowerCase() || '.jpg';
  const baseName = path.basename(fileName || `upload${ext}`, ext);
  const safeName = sanitizeSegment(baseName, 'document') + ext;

  const folder = `erp-documents/${safeBdm}/${safePeriod}/${safeCycle}/${safeDocType}`;
  const key = generateS3Key(safeName, folder);
  const url = await uploadToS3(fileBuffer, key, contentType);

  return { url, key };
}

module.exports = {
  uploadErpDocument,
};
