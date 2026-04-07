/**
 * Expense Classification Service (Phase 2.15)
 *
 * 4-step cascade to classify expenses from OCR-extracted fields:
 *   Step 1: EXACT_VENDOR  — supplier_name exact match in VendorMaster
 *   Step 2: ALIAS_MATCH   — fuzzy match against VendorMaster.vendor_aliases
 *   Step 3: KEYWORD        — keyword patterns (courier/fuel/parking/toll/hotel/food/office)
 *   Step 4: FALLBACK       — "Miscellaneous Expense" (6900) with LOW confidence
 *
 * Follows SAP automatic account determination pattern.
 */
const VendorMaster = require('../models/VendorMaster');
const Settings = require('../models/Settings');

// Keyword-to-COA patterns (moved from removed EXPENSE_COA_MAP in orParser.js)
const KEYWORD_RULES = [
  { keywords: ['AP CARGO', 'JRS', 'LBC', 'J&T', 'J AND T', '2GO', 'AIR21', 'NINJA VAN', 'GRAB EXPRESS', 'COURIER', 'SHIPPING'], coa_code: '6500', coa_name: 'Courier & Delivery', category: 'COURIER/SHIPPING' },
  { keywords: ['SHELL', 'PETRON', 'CALTEX', 'PHOENIX', 'SEAOIL', 'GASOLINE', 'FUEL', 'DIESEL'], coa_code: '6200', coa_name: 'Fuel & Gas', category: 'FUEL' },
  // Include OCR-noisy toll variants like "TESY" from Easytrip-style receipts.
  { keywords: ['PARKING', 'TOLL', 'NLEX', 'SLEX', 'TPLEX', 'SKYWAY', 'CAVITEX', 'EXPRESSWAY', 'EASYTRIP', 'EASY TRIP', 'AUTOSWEEP', 'AUTO SWEEP', 'RFID', 'TESY'], coa_code: '6600', coa_name: 'Parking & Tolls', category: 'PARKING/TOLL' },
  { keywords: ['HOTEL', 'INN', 'LODGE', 'PENSION', 'AIRBNB', 'ACCOMMODATION', 'RESORT'], coa_code: '6155', coa_name: 'Travel & Accommodation', category: 'TRAVEL/ACCOMMODATION' },
  { keywords: ['RESTAURANT', 'FOOD', 'MEAL', 'CAFE', 'JOLLIBEE', 'MCDONALDS', 'DINE', 'EATERY'], coa_code: '6350', coa_name: 'ACCESS Expense', category: 'ACCESS/MEALS' },
  { keywords: ['PRINTING', 'OFFICE', 'SUPPLIES', 'STATIONERY', 'NATIONAL BOOKSTORE'], coa_code: '6400', coa_name: 'Office Supplies', category: 'OFFICE SUPPLIES' },
  { keywords: ['GLOBE', 'SMART', 'PLDT', 'CONVERGE', 'MERALCO', 'WATER', 'ELECTRIC', 'UTILITY'], coa_code: '6460', coa_name: 'Utilities & Communication', category: 'UTILITIES/COMMUNICATION' },
  { keywords: ['GRAB', 'TAXI', 'ANGKAS', 'FERRY', 'BOAT'], coa_code: '6150', coa_name: 'Transport Expense', category: 'TRANSPORTATION' },
  { keywords: ['FDA', 'DOH', 'LGU', 'LICENSE', 'PERMIT', 'REGULATORY', 'REGISTRATION', 'RENEWAL'], coa_code: '6810', coa_name: 'Regulatory & Licensing', category: 'REGULATORY/LICENSING' },
  { keywords: ['SOFTWARE', 'SUBSCRIPTION', 'DOMAIN', 'HOSTING', 'CLOUD', 'APP', 'COMPUTER', 'LAPTOP', 'PRINTER', 'HARDWARE'], coa_code: '6820', coa_name: 'IT Hardware & Software', category: 'IT/SOFTWARE' },
  { keywords: ['REPAIR', 'MAINTENANCE', 'AIRCON', 'PLUMBING', 'ELECTRICAL', 'FIX'], coa_code: '6260', coa_name: 'Repairs & Maintenance', category: 'REPAIRS/MAINTENANCE' },
  { keywords: ['RENT', 'LEASE', 'BALAI LAWAAN'], coa_code: '6450', coa_name: 'Rent Expense', category: 'RENT' },
  { keywords: ['AUDIT', 'TAX', 'LEGAL', 'ATTORNEY', 'LAWYER', 'CPA', 'ACCOUNTANT', 'PHARMACIST', 'NOTARY'], coa_code: '6800', coa_name: 'Professional Fees', category: 'PROFESSIONAL FEES' },
  // F&B
  { keywords: ['GROCERY', 'MARKET', 'INGREDIENT', 'MEAT', 'VEGETABLE', 'FISH', 'SEAFOOD', 'RICE', 'COOKING', 'FOOD SUPPLY'], coa_code: '5400', coa_name: 'Food Cost', category: 'FOOD COST' },
  { keywords: ['BEVERAGE', 'DRINK', 'JUICE', 'SODA', 'COFFEE BEAN', 'TEA', 'LIQUOR', 'WINE', 'BEER'], coa_code: '5500', coa_name: 'Beverage Cost', category: 'BEVERAGE COST' },
  { keywords: ['TAKEOUT BOX', 'PACKAGING', 'CONTAINER', 'DISPOSABLE', 'NAPKIN', 'TISSUE', 'F&B SUPPLY'], coa_code: '6830', coa_name: 'F&B Supplies & Packaging', category: 'F&B SUPPLIES' },
  { keywords: ['KITCHEN', 'OVEN', 'STOVE', 'REFRIGERATOR', 'FREEZER', 'KITCHEN REPAIR'], coa_code: '6840', coa_name: 'Kitchen Equipment & Maintenance', category: 'KITCHEN EQUIPMENT' },
  // Rental / Property
  { keywords: ['PROPERTY TAX', 'REAL PROPERTY', 'AMILYAR', 'REALTY TAX'], coa_code: '6890', coa_name: 'Property Tax & Fees', category: 'PROPERTY TAX' },
  { keywords: ['INSURANCE', 'FIRE INSURANCE', 'PROPERTY INSURANCE', 'COMPREHENSIVE'], coa_code: '6880', coa_name: 'Property Insurance', category: 'PROPERTY INSURANCE' },
  { keywords: ['PROPERTY REPAIR', 'BUILDING MAINTENANCE', 'RENOVATION', 'PAINT', 'CONSTRUCTION'], coa_code: '6870', coa_name: 'Property Maintenance', category: 'PROPERTY MAINTENANCE' },
];

const FALLBACK = {
  vendor_id: null,
  vendor_name: null,
  coa_code: '6900',
  coa_name: 'Miscellaneous Expense',
  expense_category: 'MISCELLANEOUS',
  confidence: 'LOW',
  match_method: 'FALLBACK'
};

/**
 * Classify an expense from OCR-extracted fields.
 * @param {Object} extractedFields - { supplier_name: { value, confidence }, amount: { value }, vat_amount: { value } }
 * @returns {Object} { vendor_id, vendor_name, coa_code, coa_name, expense_category, confidence, match_method, vat_computed }
 */
async function classifyExpense(extractedFields) {
  const supplierName = extractedFields.supplier_name?.value?.trim();
  const amount = extractedFields.amount?.value;
  const vatAmount = extractedFields.vat_amount?.value;

  // VAT auto-computation if amount present but VAT missing
  const settings = await Settings.getSettings();
  const vatRate = settings?.VAT_RATE || 0.12;
  let vatComputed = false;
  let computedVat = vatAmount;
  if (amount != null && (vatAmount == null || vatAmount === 0)) {
    computedVat = parseFloat((amount * vatRate / (1 + vatRate)).toFixed(2));
    vatComputed = true;
  }

  if (!supplierName) {
    return { ...FALLBACK, vat_computed: vatComputed, vat_amount: computedVat };
  }

  const upperName = supplierName.toUpperCase();

  // Step 1: EXACT_VENDOR — exact match on vendor_name (case-insensitive)
  const exactMatch = await VendorMaster.findOne({
    vendor_name: { $regex: `^${escapeRegex(supplierName)}$`, $options: 'i' },
    is_active: true
  }).lean();

  if (exactMatch && exactMatch.default_coa_code) {
    return {
      vendor_id: exactMatch._id,
      vendor_name: exactMatch.vendor_name,
      coa_code: exactMatch.default_coa_code,
      coa_name: exactMatch.default_expense_category || exactMatch.default_coa_code,
      expense_category: exactMatch.default_expense_category,
      confidence: 'HIGH',
      match_method: 'EXACT_VENDOR',
      vat_computed: vatComputed,
      vat_amount: computedVat
    };
  }

  // Step 2: ALIAS_MATCH — substring match against vendor_aliases
  const aliasMatch = await VendorMaster.findOne({
    vendor_aliases: { $regex: escapeRegex(upperName), $options: 'i' },
    is_active: true
  }).lean();

  if (!aliasMatch) {
    // Also try: does any alias appear in the supplier name?
    const allVendors = await VendorMaster.find({ is_active: true }).select('vendor_name vendor_aliases default_coa_code default_expense_category').lean();
    for (const v of allVendors) {
      for (const alias of v.vendor_aliases) {
        if (upperName.includes(alias.toUpperCase())) {
          return {
            vendor_id: v._id,
            vendor_name: v.vendor_name,
            coa_code: v.default_coa_code,
            coa_name: v.default_expense_category || v.default_coa_code,
            expense_category: v.default_expense_category,
            confidence: 'MEDIUM',
            match_method: 'ALIAS_MATCH',
            vat_computed: vatComputed,
            vat_amount: computedVat
          };
        }
      }
    }
  } else if (aliasMatch.default_coa_code) {
    return {
      vendor_id: aliasMatch._id,
      vendor_name: aliasMatch.vendor_name,
      coa_code: aliasMatch.default_coa_code,
      coa_name: aliasMatch.default_expense_category || aliasMatch.default_coa_code,
      expense_category: aliasMatch.default_expense_category,
      confidence: 'MEDIUM',
      match_method: 'ALIAS_MATCH',
      vat_computed: vatComputed,
      vat_amount: computedVat
    };
  }

  // Step 3: KEYWORD — pattern-based detection
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (upperName.includes(kw)) {
        return {
          vendor_id: null,
          vendor_name: supplierName,
          coa_code: rule.coa_code,
          coa_name: rule.coa_name,
          expense_category: rule.category,
          confidence: 'MEDIUM',
          match_method: 'KEYWORD',
          vat_computed: vatComputed,
          vat_amount: computedVat
        };
      }
    }
  }

  // Step 4: FALLBACK
  return { ...FALLBACK, vendor_name: supplierName, vat_computed: vatComputed, vat_amount: computedVat };
}

/**
 * Get available expense categories (for frontend dropdown)
 */
function getCategories() {
  const categories = KEYWORD_RULES.map(r => ({
    value: r.category,
    label: `${r.coa_code} — ${r.coa_name}`,
    code: r.coa_code
  }));
  categories.push({ value: 'MISCELLANEOUS', label: '6900 — Miscellaneous Expense', code: '6900' });
  return categories;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { classifyExpense, getCategories, KEYWORD_RULES };
