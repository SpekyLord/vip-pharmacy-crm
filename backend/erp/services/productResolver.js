/**
 * Master Data Resolver Service
 *
 * Resolves OCR-extracted text to clean master data records using a
 * multi-step cascade (mirrors expenseClassifier pattern).
 */
const ProductMaster = require('../models/ProductMaster');
const Hospital = require('../models/Hospital');
const Customer = require('../models/Customer');
const VendorMaster = require('../models/VendorMaster');
const { cleanName, expandAbbreviations } = require('../utils/nameClean');

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
 * 5-step cascade: EXACT → ABBREVIATION_EXPAND → ALIAS → ALIAS_SUBSTRING → PARTIAL → FUZZY
 *
 * Hospitals are globally shared (Phase 4A.3) — no entity_id filter.
 *
 * @param {string} ocrText - Raw hospital name from OCR
 * @param {ObjectId|string} entityId - Tenant entity (unused — kept for API compat)
 * @returns {{ hospital, confidence, match_method } | null}
 */
const resolveHospital = async (ocrText, _entityId) => {
  if (!ocrText) return null;

  const cleaned = cleanName(ocrText);
  if (!cleaned) return null;

  // Step 1: EXACT — hospital_name_clean match
  let hospital = await Hospital.findOne({
    hospital_name_clean: cleaned,
    status: 'ACTIVE'
  }).lean();

  if (hospital) {
    return { hospital, confidence: 'HIGH', match_method: 'EXACT' };
  }

  // Step 2: ABBREVIATION_EXPAND — expand PH abbreviations and try exact match on each variant
  // e.g. "SAINT JUDE HOSPITAL" → also try "ST JUDE HOSPITAL"
  const variants = expandAbbreviations(cleaned);
  if (variants.length > 1) {
    for (const variant of variants) {
      if (variant === cleaned) continue; // already tried
      hospital = await Hospital.findOne({
        hospital_name_clean: variant,
        status: 'ACTIVE'
      }).lean();
      if (hospital) {
        return { hospital, confidence: 'HIGH', match_method: 'ABBREVIATION_EXPAND' };
      }
    }
  }

  // Step 3: ALIAS — check hospital_aliases array (exact match on cleaned alias)
  const aliasRegex = new RegExp(escapeRegex(cleaned), 'i');
  hospital = await Hospital.findOne({
    hospital_aliases: aliasRegex,
    status: 'ACTIVE'
  }).lean();

  if (hospital) {
    return { hospital, confidence: 'MEDIUM', match_method: 'ALIAS' };
  }

  // Step 3b: ALIAS_SUBSTRING — substring match on aliases
  const hospitalsWithAliases = await Hospital.find({
    status: 'ACTIVE',
    hospital_aliases: { $exists: true, $ne: [] }
  }).select('hospital_name hospital_name_clean hospital_aliases').lean();

  for (const h of hospitalsWithAliases) {
    for (const alias of h.hospital_aliases) {
      const cleanAlias = cleanName(alias);
      if (cleaned.includes(cleanAlias) || cleanAlias.includes(cleaned)) {
        return { hospital: h, confidence: 'MEDIUM', match_method: 'ALIAS_SUBSTRING' };
      }
      // Also try abbreviation expansion on the alias
      const aliasVariants = expandAbbreviations(cleanAlias);
      for (const av of aliasVariants) {
        if (av === cleanAlias) continue;
        if (cleaned.includes(av) || av.includes(cleaned)) {
          return { hospital: h, confidence: 'MEDIUM', match_method: 'ALIAS_ABBREVIATION' };
        }
      }
    }
  }

  // Step 4: PARTIAL — check if cleaned text contains or is contained by any hospital_name_clean
  // Also try abbreviation-expanded variants
  const allHospitals = await Hospital.find({
    status: 'ACTIVE'
  }).select('hospital_name hospital_name_clean').lean();

  for (const h of allHospitals) {
    if (!h.hospital_name_clean) continue;

    // Direct substring
    if (cleaned.includes(h.hospital_name_clean) || h.hospital_name_clean.includes(cleaned)) {
      return { hospital: h, confidence: 'MEDIUM', match_method: 'PARTIAL' };
    }

    // Abbreviation-expanded partial: try all variants of OCR text against hospital name
    for (const variant of variants) {
      if (variant === cleaned) continue;
      if (variant.includes(h.hospital_name_clean) || h.hospital_name_clean.includes(variant)) {
        return { hospital: h, confidence: 'MEDIUM', match_method: 'PARTIAL_ABBREVIATION' };
      }
    }
  }

  // Step 5: FUZZY — text index search
  try {
    hospital = await Hospital.findOne({
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

/**
 * Resolve customer name from OCR text — Phase 18 (globalized Phase G5).
 * Same cascade pattern as resolveHospital. Customer model is now globally shared
 * (Phase G5 — mirror Hospital), so entity_id is no longer a read-filter. The
 * entityId arg is retained for API compatibility but is unused here.
 * Falls back to resolveHospital if no Customer match found (unified search).
 *
 * @param {string} ocrText - Raw customer/hospital name from OCR
 * @param {ObjectId|string} entityId - Tenant entity (unused — kept for signature stability)
 * @returns {{ customer, customer_type: 'customer'|'hospital', confidence, match_method } | null}
 */
const resolveCustomer = async (ocrText, entityId) => {
  if (!ocrText) return null;

  const cleaned = cleanName(ocrText);
  if (!cleaned) return null;

  // Step 1: Try Customer model (global — Phase G5).
  // EXACT match
  let customer = await Customer.findOne({
    customer_name_clean: cleaned,
    status: 'ACTIVE'
  }).lean();
  if (customer) {
    return { customer, customer_type: 'customer', confidence: 'HIGH', match_method: 'EXACT' };
  }

  // ALIAS match
  const aliasRegex = new RegExp(escapeRegex(cleaned), 'i');
  customer = await Customer.findOne({
    customer_aliases: aliasRegex,
    status: 'ACTIVE'
  }).lean();
  if (customer) {
    return { customer, customer_type: 'customer', confidence: 'MEDIUM', match_method: 'ALIAS' };
  }

  // PARTIAL match (starts with)
  const partialRegex = new RegExp(`^${escapeRegex(cleaned.substring(0, Math.min(cleaned.length, 20)))}`, 'i');
  customer = await Customer.findOne({
    customer_name_clean: partialRegex,
    status: 'ACTIVE'
  }).lean();
  if (customer) {
    return { customer, customer_type: 'customer', confidence: 'LOW', match_method: 'PARTIAL' };
  }

  // TEXT SEARCH
  try {
    const textResults = await Customer.find(
      { status: 'ACTIVE', $text: { $search: ocrText } },
      { score: { $meta: 'textScore' } }
    ).sort({ score: { $meta: 'textScore' } }).limit(1).lean();

    if (textResults.length && textResults[0].score > 1.5) {
      return { customer: textResults[0], customer_type: 'customer', confidence: 'LOW', match_method: 'TEXT_SEARCH' };
    }
  } catch (_) { /* text index may not exist */ }

  // Step 2: Fall back to Hospital resolution (global)
  const hospitalResult = await resolveHospital(ocrText, entityId);
  if (hospitalResult) {
    return {
      customer: hospitalResult.hospital,
      customer_type: 'hospital',
      confidence: hospitalResult.confidence,
      match_method: hospitalResult.match_method
    };
  }

  return null;
};

module.exports = { resolveProduct, resolveHospital, resolveVendor, resolveCustomer };
