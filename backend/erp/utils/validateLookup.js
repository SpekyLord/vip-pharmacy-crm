/**
 * validateLookup.js — Phase C (Rule #3 Cleanup)
 *
 * App-layer validation against Lookup categories.
 * Replaces Mongoose schema `enum:` constraints so business values
 * are governed by the database-driven Lookup table, not hardcoded arrays.
 *
 * Usage in controllers:
 *   const { assertLookup, assertLookups } = require('../utils/validateLookup');
 *
 *   // Single field
 *   await assertLookup(entityId, 'VAT_TYPE', body.vat_type, 'vat_type');
 *
 *   // Multiple fields at once (batched — one DB query per category)
 *   await assertLookups(entityId, {
 *     VAT_TYPE:  { value: body.vat_type,  field: 'vat_type' },
 *     SALE_TYPE: { value: body.sale_type, field: 'sale_type' },
 *   });
 */

const Lookup = require('../models/Lookup');
const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');

/**
 * Fetch valid codes for a lookup category.
 * Falls back to SEED_DEFAULTS if no DB rows exist yet (pre-seed scenario).
 */
async function getValidCodes(entityId, category) {
  const filter = { category, is_active: true };
  if (entityId) filter.entity_id = entityId;

  const items = await Lookup.find(filter).select('code').lean();

  if (items.length > 0) {
    return new Set(items.map(i => i.code));
  }

  // Fallback to seed defaults (handles pre-seed or entity-less scenarios)
  const defaults = SEED_DEFAULTS[category];
  if (!defaults) return null; // unknown category — skip validation

  const codes = defaults.map(d => (typeof d === 'object' ? d.code : d));
  return new Set(codes);
}

/**
 * Validate a single value against a lookup category.
 * Throws a descriptive error if the value is not valid.
 *
 * @param {ObjectId|string} entityId
 * @param {string} category  - Lookup category (e.g. 'VAT_TYPE')
 * @param {*} value          - The value to validate
 * @param {string} fieldName - Field name for error messages
 * @param {object} [opts]
 * @param {boolean} [opts.allowEmpty=true] - Allow null/undefined/''
 */
async function assertLookup(entityId, category, value, fieldName, opts = {}) {
  const { allowEmpty = true } = opts;

  if (value == null || value === '') {
    if (allowEmpty) return;
    throw Object.assign(
      new Error(`${fieldName} is required`),
      { statusCode: 400, field: fieldName }
    );
  }

  const validCodes = await getValidCodes(entityId, category);
  if (!validCodes) return; // unknown category — no validation

  const code = String(value).toUpperCase();
  if (!validCodes.has(code) && !validCodes.has(value)) {
    throw Object.assign(
      new Error(`Invalid ${fieldName}: "${value}". Valid values: ${[...validCodes].join(', ')}`),
      { statusCode: 400, field: fieldName }
    );
  }
}

/**
 * Validate multiple fields against their lookup categories in one call.
 * Each entry: { [CATEGORY]: { value, field, allowEmpty? } }
 *
 * @param {ObjectId|string} entityId
 * @param {object} fieldMap - { CATEGORY: { value, field, allowEmpty? }, ... }
 */
async function assertLookups(entityId, fieldMap) {
  const errors = [];

  for (const [category, { value, field, allowEmpty }] of Object.entries(fieldMap)) {
    try {
      await assertLookup(entityId, category, value, field, { allowEmpty });
    } catch (err) {
      errors.push({ field: err.field || field, message: err.message });
    }
  }

  if (errors.length > 0) {
    const err = new Error('Validation failed: ' + errors.map(e => e.message).join('; '));
    err.statusCode = 400;
    err.errors = errors;
    throw err;
  }
}

module.exports = { assertLookup, assertLookups, getValidCodes };
