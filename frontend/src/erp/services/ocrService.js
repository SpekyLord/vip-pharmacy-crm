import EXIF from 'exif-js';
import api from '../../services/api';
import { compressImageFile } from '../utils/compressImage';

/**
 * Extract EXIF date/time from a photo file.
 * Returns ISO string or null if unavailable.
 */
export function extractExifDateTime(file) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith('image/')) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const img = new Image();
        img.onload = function () {
          EXIF.getData(img, function () {
            const dateStr = EXIF.getTag(this, 'DateTimeOriginal')
              || EXIF.getTag(this, 'DateTimeDigitized')
              || EXIF.getTag(this, 'DateTime');

            if (dateStr) {
              // EXIF format: "2026:03:26 07:33:00" → "2026-03-26T07:33:00"
              const iso = dateStr
                .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
                .replace(' ', 'T');
              resolve(iso);
            } else {
              resolve(null);
            }
          });
        };
        img.src = e.target.result;
      } catch {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Send a document photo for OCR processing.
 *
 * @param {File}   photo    – Image file from input or camera capture.
 * @param {string} docType  – One of: CSI, CR, CWT_2307, GAS_RECEIPT, ODOMETER, OR, UNDERTAKING, DR
 * @param {string} [exifDateTime] – EXIF timestamp extracted from photo (optional)
 * @param {object} [opts]
 * @param {boolean} [opts.skipOcr] – When true, backend uploads to S3 and
 *   returns `{s3_url, attachment_id}` without running the Vision + AI pipeline.
 *   Used for photo-only attach paths (re-upload after rejection, proof-only
 *   upload) where the 10-30s OCR cost is pure waste.
 * @returns {Promise<object>} { s3_url, doc_type, extracted, layout_family, review_required, review_reasons, validation_flags, raw_ocr_text }
 */
export async function processDocument(photo, docType, exifDateTime, opts = {}) {
  // Compress before upload — phone cameras produce 5-12MB files that exceed
  // the backend limit and are slow over mobile data. OCR-safe: 1600px / 70%.
  const compressed = await compressImageFile(photo);

  const formData = new FormData();
  formData.append('photo', compressed);
  formData.append('docType', docType);
  if (exifDateTime) {
    formData.append('exifDateTime', exifDateTime);
  }
  if (opts.skipOcr) {
    formData.append('skip_ocr', 'true');
  }

  const response = await api.post('/erp/ocr/process', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 min for mobile uploads (default 30s too short)
  });

  return response.data.data;
}

/**
 * Run OCR against an already-uploaded BDM capture (Phase P1.2 Slice 7-extension
 * Round 2B, May 2026).
 *
 * Closes the CORS lurking-bug from Round 1 — instead of the picker fetching
 * the signed S3 URL into a Blob (which the private bucket's missing CORS
 * allowlist blocks on `localhost:5173` and any non-S3-origin caller), the
 * proxy hands the CaptureSubmission `_id` to the backend and the server
 * downloads the buffer S3-side, runs the same OCR pipeline, and returns the
 * same response shape as `processDocument`.
 *
 * @param {string} captureId - CaptureSubmission._id (from picker.meta.captures[0]._id)
 * @param {string} docType - One of: CSI, CR, CWT_2307, GAS_RECEIPT, ODOMETER, OR, UNDERTAKING, DR
 * @param {object} [opts]
 * @param {string} [opts.feature] - Optional Vision feature override
 * @param {string} [opts.period] - Optional period segment for storage path
 * @param {string} [opts.cycle] - Optional cycle segment for storage path
 * @param {boolean} [opts.skipOcr] - When true, just pull the photo without running OCR
 * @returns {Promise<object>} Same shape as processDocument: { s3_url, doc_type, extracted, ... }
 */
export async function processDocumentFromCapture(captureId, docType, opts = {}) {
  if (!captureId) throw new Error('captureId is required');
  if (!docType) throw new Error('docType is required');

  const body = {
    capture_id: captureId,
    docType,
  };
  if (opts.feature) body.feature = opts.feature;
  if (opts.period) body.period = opts.period;
  if (opts.cycle) body.cycle = opts.cycle;
  if (opts.skipOcr) body.skip_ocr = true;

  const response = await api.post('/erp/ocr/process', body, {
    timeout: 120000, // 2 min — server-side S3 download + OCR can be slow
  });

  return response.data.data;
}

/**
 * Fetch the list of supported document types.
 */
export async function getSupportedTypes() {
  const response = await api.get('/erp/ocr/types');
  return response.data.data;
}

// ── OCR Settings (per-entity, subscription-ready) — Phase H3 ──

/** GET current entity's OCR settings (enabled, ai_fallback, allowed doc types, quota). */
export async function getOcrSettings() {
  const response = await api.get('/erp/ocr-settings');
  return response.data.data;
}

/** PUT update OCR settings for current entity. Admin/finance/president only. */
export async function updateOcrSettings(updates) {
  const response = await api.put('/erp/ocr-settings', updates);
  return response.data.data;
}

/** GET aggregated usage stats for current entity (group_by: doc_type | user_id | skipped_reason). */
export async function getOcrUsage(params = {}) {
  const response = await api.get('/erp/ocr-settings/usage', { params });
  return response.data.data;
}

/** GET recent per-call OCR audit log for current entity. */
export async function getOcrUsageRecent(limit = 50) {
  const response = await api.get('/erp/ocr-settings/usage/recent', { params: { limit } });
  return response.data.data;
}

// ── Vendor Auto-Learn Review (admin queue for Claude-learned vendors) — Phase H5 ──

/** GET vendors auto-learned from Claude wins. Filter: status=UNREVIEWED|APPROVED|REJECTED */
export async function listVendorLearnings(params = {}) {
  const response = await api.get('/erp/vendor-learnings', { params });
  return response.data.data;
}

/** GET a single auto-learned vendor (with populated audit fields). */
export async function getVendorLearning(id) {
  const response = await api.get(`/erp/vendor-learnings/${id}`);
  return response.data.data;
}

/**
 * PATCH review an auto-learned vendor.
 * @param {string} id
 * @param {'APPROVE'|'REJECT'|'UNREVIEW'} action
 * @param {Object} [edits] — optional inline edits: vendor_name, default_coa_code, default_expense_category, vendor_aliases
 */
export async function reviewVendorLearning(id, action, edits = {}) {
  const response = await api.patch(`/erp/vendor-learnings/${id}`, { action, ...edits });
  return response.data.data;
}
