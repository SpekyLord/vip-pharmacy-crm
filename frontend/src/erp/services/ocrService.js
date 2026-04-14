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
 * @returns {Promise<object>} { s3_url, doc_type, extracted, layout_family, review_required, review_reasons, validation_flags, raw_ocr_text }
 */
export async function processDocument(photo, docType, exifDateTime) {
  // Compress before upload — phone cameras produce 5-12MB files that exceed
  // the backend limit and are slow over mobile data. OCR-safe: 1600px / 70%.
  const compressed = await compressImageFile(photo);

  const formData = new FormData();
  formData.append('photo', compressed);
  formData.append('docType', docType);
  if (exifDateTime) {
    formData.append('exifDateTime', exifDateTime);
  }

  const response = await api.post('/erp/ocr/process', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 2 min for mobile uploads (default 30s too short)
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
