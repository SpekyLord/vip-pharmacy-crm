/**
 * Document Numbering Service — Central engine for all ERP document numbers
 *
 * Format: {DOC_PREFIX}-{TERRITORY_CODE}{MMDDYY}-{NNN}
 * Example: CALF-ILO040326-001 = CALF + Iloilo + April 3 2026 + sequence 1
 *
 * Used by: CALF, PRF, and future documents (PO, transfers, etc.)
 * Territory code from Territory collection (admin-managed, not hardcoded).
 * Sequence from DocSequence collection (atomic increment, collision-safe).
 */
const DocSequence = require('../models/DocSequence');
const Territory = require('../models/Territory');

/**
 * Format date as MMDDYY
 * @param {Date} date
 * @returns {String} e.g., "040326" for April 3 2026
 */
function formatMMDDYY(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}${dd}${yy}`;
}

/**
 * Generate a document number using territory code + date + sequence
 *
 * @param {Object} options
 * @param {String} options.prefix — document type prefix (CALF, PRF, PO, ICT, etc.)
 * @param {ObjectId|String} options.bdmId — BDM user ID (to look up territory)
 * @param {String} [options.territoryCode] — override territory code (skip lookup)
 * @param {Date} [options.date] — document date (default: now)
 * @param {String} [options.fallbackCode] — fallback if no territory found (default: 'XXX')
 * @returns {Promise<String>} e.g., "CALF-ILO040326-001"
 */
async function generateDocNumber({ prefix, bdmId, territoryCode, date, fallbackCode = 'XXX' }) {
  // Resolve territory code
  let code = territoryCode;
  if (!code && bdmId) {
    code = await Territory.getCodeForBdm(bdmId);
  }
  if (!code) code = fallbackCode;

  // Format date
  const dateStr = formatMMDDYY(date || new Date());

  // Get next sequence atomically
  const seqKey = `${prefix}-${code}-${dateStr}`;
  const seq = await DocSequence.getNext(seqKey);
  const seqStr = String(seq).padStart(3, '0');

  return `${prefix}-${code}${dateStr}-${seqStr}`;
}

module.exports = { generateDocNumber, formatMMDDYY };
