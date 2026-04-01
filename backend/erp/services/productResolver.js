/**
 * Master Data Resolver Service
 *
 * Resolves OCR-extracted text to clean master data records using a
 * multi-step cascade (mirrors expenseClassifier pattern).
 */
const ProductMaster = require('../models/ProductMaster');
const Hospital = require('../models/Hospital');
const VendorMaster = require('../models/VendorMaster');
const { cleanName } = require('../utils/nameClean');

/**
 * Escape special regex characters
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve OCR text to a ProductMaster record.
 * 4-step cascade: EXACT → ALIAS → FUZZY → ITEM_KEY
 *
 * @param {string} ocrText - Raw text from OCR
 * @param {ObjectId|string} entityId - Tenant entity
 * @returns {{ product, confidence, match_method } | null}
 */
const resolveProduct = async (ocrText, entityId) => {
  if (!ocrText || !entityId) return null;

  const cleaned = cleanName(ocrText);
  if (!cleaned) return null;

  // Step 1: EXACT — brand_name_clean match
  let product = await ProductMaster.findOne({
    entity_id: entityId,
    brand_name_clean: cleaned,
    is_active: true
  }).lean();

  if (product) {
    return { product, confidence: 'HIGH', match_method: 'EXACT' };
  }

  // Step 2: ALIAS — check product_aliases array
  const aliasRegex = new RegExp(escapeRegex(cleaned), 'i');
  product = await ProductMaster.findOne({
    entity_id: entityId,
    product_aliases: aliasRegex,
    is_active: true
  }).lean();

  if (product) {
    return { product, confidence: 'MEDIUM', match_method: 'ALIAS' };
  }

  // Also check if any alias is a substring of the OCR text or vice versa
  const allProducts = await ProductMaster.find({
    entity_id: entityId,
    is_active: true,
    product_aliases: { $exists: true, $ne: [] }
  }).select('product_aliases brand_name generic_name item_key selling_price unit_code vat_status').lean();

  for (const p of allProducts) {
    for (const alias of p.product_aliases) {
      const cleanAlias = cleanName(alias);
      if (cleaned.includes(cleanAlias) || cleanAlias.includes(cleaned)) {
        return { product: p, confidence: 'MEDIUM', match_method: 'ALIAS_SUBSTRING' };
      }
    }
  }

  // Step 3: FUZZY — text index search
  try {
    product = await ProductMaster.findOne({
      entity_id: entityId,
      $text: { $search: ocrText },
      is_active: true
    }).lean();

    if (product) {
      return { product, confidence: 'MEDIUM', match_method: 'FUZZY' };
    }
  } catch (_) {
    // Text index may not exist yet — skip
  }

  // Step 4: ITEM_KEY — try parsing "BrandName|Dosage" format
  if (ocrText.includes('|')) {
    product = await ProductMaster.findOne({
      entity_id: entityId,
      item_key: ocrText.trim(),
      is_active: true
    }).lean();

    if (product) {
      return { product, confidence: 'MEDIUM', match_method: 'ITEM_KEY' };
    }
  }

  return null;
};

/**
 * Resolve OCR text to a Hospital record.
 * 2-step: hospital_name_clean match → fuzzy text search
 *
 * @param {string} ocrText - Raw hospital name from OCR
 * @param {ObjectId|string} entityId - Tenant entity
 * @returns {{ hospital, confidence, match_method } | null}
 */
const resolveHospital = async (ocrText, entityId) => {
  if (!ocrText || !entityId) return null;

  const cleaned = cleanName(ocrText);
  if (!cleaned) return null;

  // Step 1: EXACT — hospital_name_clean match
  let hospital = await Hospital.findOne({
    entity_id: entityId,
    hospital_name_clean: cleaned,
    status: 'ACTIVE'
  }).lean();

  if (hospital) {
    return { hospital, confidence: 'HIGH', match_method: 'EXACT' };
  }

  // Step 1b: Partial — check if cleaned text contains or is contained by any hospital_name_clean
  const hospitals = await Hospital.find({
    entity_id: entityId,
    status: 'ACTIVE'
  }).select('hospital_name hospital_name_clean').lean();

  for (const h of hospitals) {
    if (h.hospital_name_clean && (
      cleaned.includes(h.hospital_name_clean) ||
      h.hospital_name_clean.includes(cleaned)
    )) {
      return { hospital: h, confidence: 'MEDIUM', match_method: 'PARTIAL' };
    }
  }

  // Step 2: FUZZY — text index search
  try {
    hospital = await Hospital.findOne({
      entity_id: entityId,
      $text: { $search: ocrText },
      status: 'ACTIVE'
    }).lean();

    if (hospital) {
      return { hospital, confidence: 'MEDIUM', match_method: 'FUZZY' };
    }
  } catch (_) {
    // Text index may not exist yet
  }

  return null;
};

/**
 * Resolve OCR text to a VendorMaster record.
 * 3-step: exact name → alias → fuzzy text search
 *
 * @param {string} ocrText - Raw vendor/supplier name from OCR
 * @param {ObjectId|string} entityId - Tenant entity
 * @returns {{ vendor, confidence, match_method } | null}
 */
const resolveVendor = async (ocrText, entityId) => {
  if (!ocrText || !entityId) return null;

  const cleaned = cleanName(ocrText);
  if (!cleaned) return null;

  // Step 1: EXACT — vendor_name match (case-insensitive)
  let vendor = await VendorMaster.findOne({
    entity_id: entityId,
    vendor_name: new RegExp(`^${escapeRegex(ocrText.trim())}$`, 'i'),
    is_active: true
  }).lean();

  if (vendor) {
    return { vendor, confidence: 'HIGH', match_method: 'EXACT' };
  }

  // Step 2: ALIAS — check vendor_aliases
  const aliasRegex = new RegExp(escapeRegex(cleaned), 'i');
  vendor = await VendorMaster.findOne({
    entity_id: entityId,
    vendor_aliases: aliasRegex,
    is_active: true
  }).lean();

  if (vendor) {
    return { vendor, confidence: 'MEDIUM', match_method: 'ALIAS' };
  }

  // Step 2b: Check if any alias is a substring match
  const vendors = await VendorMaster.find({
    entity_id: entityId,
    is_active: true,
    vendor_aliases: { $exists: true, $ne: [] }
  }).select('vendor_name vendor_aliases default_coa_code default_expense_category').lean();

  for (const v of vendors) {
    for (const alias of v.vendor_aliases) {
      const cleanAlias = cleanName(alias);
      if (cleaned.includes(cleanAlias) || cleanAlias.includes(cleaned)) {
        return { vendor: v, confidence: 'MEDIUM', match_method: 'ALIAS_SUBSTRING' };
      }
    }
  }

  // Step 3: FUZZY — text index search
  try {
    vendor = await VendorMaster.findOne({
      entity_id: entityId,
      $text: { $search: ocrText },
      is_active: true
    }).lean();

    if (vendor) {
      return { vendor, confidence: 'MEDIUM', match_method: 'FUZZY' };
    }
  } catch (_) {
    // Text index may not exist yet
  }

  return null;
};

module.exports = { resolveProduct, resolveHospital, resolveVendor };
