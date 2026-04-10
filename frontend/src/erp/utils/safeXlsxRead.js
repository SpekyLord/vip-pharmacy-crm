/**
 * Safe XLSX Read Wrapper (browser-side)
 *
 * Mitigates Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and limits
 * file size to reduce ReDoS (GHSA-5pgg-2g8v-p4x9) attack surface.
 */
import * as XLSX from 'xlsx';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function safeXlsxRead(data, opts = {}) {
  // File size guard
  const byteLength = data instanceof ArrayBuffer
    ? data.byteLength
    : data?.length || 0;

  if (byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `Excel file too large (${(byteLength / 1024 / 1024).toFixed(1)} MB). Maximum allowed is 10 MB.`
    );
  }

  // Prototype pollution guard
  const protoBefore = Object.getOwnPropertyNames(Object.prototype);

  let workbook;
  try {
    workbook = XLSX.read(data, opts);
  } finally {
    const protoAfter = Object.getOwnPropertyNames(Object.prototype);
    for (const key of protoAfter) {
      if (!protoBefore.includes(key)) {
        delete Object.prototype[key];
      }
    }
  }

  return workbook;
}
