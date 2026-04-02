/**
 * Shared name canonicalization for OCR fuzzy matching.
 * Used by Hospital model pre-save hook and smart dropdown search.
 */
const cleanName = (name) =>
  name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

module.exports = { cleanName };
