/**
 * Master Data Normalization Utilities
 *
 * Prevents phantom batches, fragmented inventory, and OCR-induced data quality
 * issues by canonicalizing batch numbers, expiry dates, units, and product names.
 */
const { cleanName } = require('./nameClean');

// ═══════════════════════════════════════════════════════════
// BATCH / LOT NUMBER
// ═══════════════════════════════════════════════════════════

/**
 * Normalize batch/lot number: uppercase, strip non-alphanumeric
 * "B-1234" → "B1234", "  lot 5678 " → "LOT5678", "N/A" → "NA"
 */
const cleanBatchNo = (raw) => {
  if (!raw) return '';
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
};

// ═══════════════════════════════════════════════════════════
// EXPIRY DATE
// ═══════════════════════════════════════════════════════════

const MONTH_MAP = {
  JAN: 0, JANUARY: 0,
  FEB: 1, FEBRUARY: 1,
  MAR: 2, MARCH: 2,
  APR: 3, APRIL: 3,
  MAY: 4,
  JUN: 5, JUNE: 5,
  JUL: 6, JULY: 6,
  AUG: 7, AUGUST: 7,
  SEP: 8, SEPT: 8, SEPTEMBER: 8,
  OCT: 9, OCTOBER: 9,
  NOV: 10, NOVEMBER: 10,
  DEC: 11, DECEMBER: 11
};

/**
 * Parse expiry date from various OCR formats → first-of-month Date.
 * FIFO only needs month/year granularity.
 *
 * Supported: "04/2027", "APR 2027", "2027-04", "04-27", "042027",
 *            "April 2027", "04/27", Date objects
 */
const parseExpiry = (raw) => {
  if (!raw) return null;

  // Already a Date
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : new Date(raw.getFullYear(), raw.getMonth(), 1);

  const s = String(raw).trim().toUpperCase();
  if (!s) return null;

  // "2027-04" or "2027/04" (ISO-ish)
  let m = s.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, 1);

  // "04/2027" or "04-2027"
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(parseInt(m[2]), parseInt(m[1]) - 1, 1);

  // "04/27" or "04-27" (2-digit year)
  m = s.match(/^(\d{1,2})[\/\-](\d{2})$/);
  if (m) {
    const year = parseInt(m[2]) + 2000;
    return new Date(year, parseInt(m[1]) - 1, 1);
  }

  // "042027" (MMYYYY, 6 digits)
  m = s.match(/^(\d{2})(\d{4})$/);
  if (m) return new Date(parseInt(m[2]), parseInt(m[1]) - 1, 1);

  // "APR 2027", "APRIL 2027", "APR2027"
  m = s.match(/^([A-Z]+)\s*(\d{4})$/);
  if (m && MONTH_MAP[m[1]] !== undefined) {
    return new Date(parseInt(m[2]), MONTH_MAP[m[1]], 1);
  }

  // "APR 27", "APRIL 27" (2-digit year with month name)
  m = s.match(/^([A-Z]+)\s*(\d{2})$/);
  if (m && MONTH_MAP[m[1]] !== undefined) {
    return new Date(parseInt(m[2]) + 2000, MONTH_MAP[m[1]], 1);
  }

  // Full date fallback: try native parse, then normalize to first-of-month
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1);

  return null;
};

// ═══════════════════════════════════════════════════════════
// UNIT / SOLD-PER
// ═══════════════════════════════════════════════════════════

const UNIT_MAP = {
  // Piece
  PIECE: 'PC', PCS: 'PC', PIECES: 'PC', EA: 'PC', PC: 'PC', EACH: 'PC',
  // Box
  BOX: 'BOX', BX: 'BOX', BOXES: 'BOX',
  // Bottle
  BOTTLE: 'BOTTLE', BOTTLES: 'BOTTLE', BTL: 'BOTTLE', BTLS: 'BOTTLE',
  // Vial
  VIAL: 'VIAL', VIALS: 'VIAL',
  // Tube
  TUBE: 'TUBE', TUBES: 'TUBE',
  // Sachet
  SACHET: 'SACHET', SACHETS: 'SACHET',
  // Strip
  STRIP: 'STRIP', STRIPS: 'STRIP',
  // Tablet
  TABLET: 'TABLET', TAB: 'TABLET', TABS: 'TABLET', TABLETS: 'TABLET',
  // Capsule
  CAPSULE: 'CAPSULE', CAP: 'CAPSULE', CAPS: 'CAPSULE', CAPSULES: 'CAPSULE',
  // Ampule
  AMPULE: 'AMPULE', AMP: 'AMPULE', AMPS: 'AMPULE', AMPULES: 'AMPULE', AMPOULE: 'AMPULE',
  // Pack
  PACK: 'PACK', PK: 'PACK', PACKS: 'PACK',
  // Roll
  ROLL: 'ROLL', ROLLS: 'ROLL',
  // Set
  SET: 'SET', SETS: 'SET',
  // Bag
  BAG: 'BAG', BAGS: 'BAG',
  // Can
  CAN: 'CAN', CANS: 'CAN',
  // Pair
  PAIR: 'PAIR', PAIRS: 'PAIR', PR: 'PAIR',
  // Pre-filled syringe
  PFS: 'PFS', PREFILLED: 'PFS', SYRINGE: 'PFS',
  // Jar / Tub
  JAR: 'JAR', TUB: 'JAR',
  // Yard / Length
  YARD: 'YARD', YARDS: 'YARD', YD: 'YARD'
};

/**
 * Normalize unit string to canonical form.
 * "PIECES" → "PC", "BTL" → "BOTTLE", "unknown" → "UNKNOWN"
 */
const normalizeUnit = (raw) => {
  if (!raw) return '';
  const key = String(raw).trim().toUpperCase().replace(/[^A-Z]/g, '');
  return UNIT_MAP[key] || key;
};

/**
 * List of all canonical unit codes (for enum validation)
 */
const UNIT_CODES = [...new Set(Object.values(UNIT_MAP))].sort();

// ═══════════════════════════════════════════════════════════
// PRODUCT NAME
// ═══════════════════════════════════════════════════════════

/**
 * Canonicalize product name for matching.
 * Reuses cleanName from nameClean.js.
 * "Dexavit (Multivitamins) 500mg" → "DEXAVIT MULTIVITAMINS 500MG"
 */
const cleanProductName = (raw) => {
  if (!raw) return '';
  return cleanName(raw);
};

module.exports = {
  cleanBatchNo,
  parseExpiry,
  normalizeUnit,
  cleanProductName,
  UNIT_MAP,
  UNIT_CODES,
  MONTH_MAP
};
