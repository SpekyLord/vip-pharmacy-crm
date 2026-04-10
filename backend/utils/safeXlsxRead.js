/**
 * Safe XLSX Read Wrapper
 *
 * Mitigates two known vulnerabilities in SheetJS (xlsx) v0.18.5:
 *   1. Prototype Pollution (GHSA-4r6h-8v6p-xvw6) — snapshots and restores
 *      Object.prototype properties around every parse call.
 *   2. ReDoS (GHSA-5pgg-2g8v-p4x9) — enforces a max file size to limit
 *      the input surface for regex-based attacks.
 *
 * Usage:
 *   const { safeXlsxRead } = require('../utils/safeXlsxRead');
 *   const wb = safeXlsxRead(buffer, { type: 'buffer' });
 */

const XLSX = require('xlsx');

// Default max file size: 10 MB (adjustable via env)
const MAX_FILE_SIZE = parseInt(process.env.XLSX_MAX_FILE_SIZE || String(10 * 1024 * 1024), 10);

/**
 * Read an Excel file with prototype-pollution and ReDoS mitigations.
 *
 * @param {Buffer|ArrayBuffer|string} data - The file data to parse
 * @param {object} [opts] - Options forwarded to XLSX.read()
 * @returns {object} The parsed workbook
 * @throws {Error} If the file exceeds the size limit or parsing fails
 */
function safeXlsxRead(data, opts = {}) {
  // --- Mitigation 1: File size guard (reduces ReDoS attack surface) ---
  const byteLength = Buffer.isBuffer(data)
    ? data.length
    : data instanceof ArrayBuffer
      ? data.byteLength
      : typeof data === 'string'
        ? Buffer.byteLength(data, 'utf8')
        : 0;

  if (byteLength > MAX_FILE_SIZE) {
    throw new Error(
      `Excel file too large (${(byteLength / 1024 / 1024).toFixed(1)} MB). ` +
      `Maximum allowed is ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(1)} MB.`
    );
  }

  // --- Mitigation 2: Prototype pollution guard ---
  // Snapshot current Object.prototype keys before parsing
  const protoBefore = Object.getOwnPropertyNames(Object.prototype);

  let workbook;
  try {
    workbook = XLSX.read(data, opts);
  } finally {
    // Remove any properties that were injected into Object.prototype
    const protoAfter = Object.getOwnPropertyNames(Object.prototype);
    for (const key of protoAfter) {
      if (!protoBefore.includes(key)) {
        delete Object.prototype[key];
      }
    }
  }

  return workbook;
}

module.exports = { safeXlsxRead };
