const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');
const { invalidateRulesCache } = require('../services/expenseClassifier');
const { invalidateOrParserCache } = require('../ocr/parsers/orParser');
const { invalidateGuardrailCache } = require('../services/vendorAutoLearner');
const { invalidateDangerCache } = require('../services/dangerSubPermissions');
const { invalidateEditableStatuses } = require('../services/approvalService');
const { invalidateProxyRolesCache, invalidateValidOwnerRolesCache } = require('../utils/resolveOwnerScope');
const { invalidateCrossEntityRolesCache } = require('../utils/resolveEntityScope');
const { invalidate: invalidateScpwdRolesCache } = require('../../utils/scpwdAccess');
const { invalidate: invalidateRebateCommissionCache } = require('../../utils/rebateCommissionAccess');
const { invalidate: invalidateBirRolesCache } = require('../../utils/birAccess');

// Categories whose changes must bust the OR parser's lookup cache (couriers/payment keywords)
const OR_PARSER_LOOKUP_CATEGORIES = new Set(['OCR_COURIER_ALIASES', 'OCR_PAYMENT_KEYWORDS']);
// Categories whose changes must bust the expense classifier's keyword-rules cache
const EXPENSE_CLASSIFIER_CATEGORIES = new Set(['OCR_EXPENSE_RULES', 'EXPENSE_CATEGORY']);
// Categories whose changes must bust the vendor auto-learn guardrail cache (blocklist/thresholds)
const VENDOR_AUTO_LEARN_CATEGORIES = new Set(['VENDOR_AUTO_LEARN_BLOCKLIST', 'VENDOR_AUTO_LEARN_THRESHOLDS']);
// Categories whose changes must bust the danger-sub-perm cache (explicit-grant allowlist)
const DANGER_SUB_PERM_CATEGORIES = new Set(['ERP_DANGER_SUB_PERMISSIONS']);
// Categories whose changes must bust the editable-statuses cache (controller write-guards)
const REJECTION_CONFIG_CATEGORIES = new Set(['MODULE_REJECTION_CONFIG']);

// Phase G4.5a — bust proxy-entry role cache when admin edits PROXY_ENTRY_ROLES.
// Cache default is 60s TTL in resolveOwnerScope.js; this makes the edit take
// effect instantly across all running instances for the entity.
const PROXY_ENTRY_ROLES_CATEGORIES = new Set(['PROXY_ENTRY_ROLES']);

// Phase G4.5a follow-up — Rule #3 alignment for the proxy-target role guard.
// VALID_OWNER_ROLES per module controls which roles may be assigned as the
// owner of a proxied record (default ['staff'] — BDM-shaped; was ['contractor','employee'] before Phase S2).
// Subscribers with different org models (director who also sells, branch
// manager carrying a territory) extend the list via Control Center without
// a code change. Matching invalidator in resolveOwnerScope.js (60s TTL).
const VALID_OWNER_ROLES_CATEGORIES = new Set(['VALID_OWNER_ROLES']);

// Phase G6 (Apr 26, 2026) — bust cross-entity-view role cache when admin
// edits CROSS_ENTITY_VIEW_ROLES. Cache TTL is 60s in resolveEntityScope.js;
// busting on lookup write makes role-allowlist edits take effect instantly.
// Without this, a subsidiary admin granting their CFO cross-entity People
// Master visibility would have to wait up to 60s per running instance.
const CROSS_ENTITY_VIEW_ROLES_CATEGORIES = new Set(['CROSS_ENTITY_VIEW_ROLES']);

// Phase VIP-1.H (Apr 2026) — bust the SC/PWD register's role cache when admin
// edits SCPWD_ROLES. Cache TTL is 60s in scpwdAccess.js; without this hook,
// a finance role added to EXPORT_VAT_RECLAIM would wait up to 60s before
// being able to download the BIR Form 2306 worksheet.
const SCPWD_ROLES_CATEGORIES = new Set(['SCPWD_ROLES']);

// Phase VIP-1.B (Apr 2026) — bust the rebate/commission role caches when admin
// edits REBATE_ROLES or COMMISSION_ROLES. Same 60s TTL invariant as SCPWD/MD
// Partner — without this hook, a fresh role addition would wait up to 60s
// before propagating to the rebate matrix or commission matrix UI gates.
const REBATE_COMMISSION_ROLES_CATEGORIES = new Set(['REBATE_ROLES', 'COMMISSION_ROLES']);

// Phase VIP-1.J (Apr 2026) — bust the BIR compliance role cache when admin
// edits BIR_ROLES. Same 60s TTL invariant; without this hook a fresh role
// addition (e.g., adding bookkeeper to MARK_FILED) would wait up to 60s
// before being honored by the BIR dashboard.
const BIR_ROLES_CATEGORIES = new Set(['BIR_ROLES']);

// Phase G6.10/G7 — categories whose seeded rows must default is_active: false so
// subscribers explicitly opt in (Anthropic-billable features, spend caps that
// could surprise-block in-flight calls). Without this, the first AgentSettings
// load auto-seeds via getByCategory → buildSeedOps → is_active: true and the
// President Copilot / Daily Briefing / spend cap go live before the president
// has a chance to review prompts and budget.
const SUBSCRIPTION_OPT_IN_CATEGORIES = new Set(['AI_COWORK_FEATURES', 'AI_SPEND_CAPS']);

// Categories whose metadata is engineer-owned — buildSeedOps uses $set so
// central code updates (new COA codes, new OCR keywords) propagate to every
// subscriber on the next page load. Everything NOT in this set defaults to
// admin-owned ($setOnInsert), so subscriber admins can edit metadata via the
// Lookup Manager without their changes being silently reverted.
//
// Rule of thumb: add here only if the metadata *must* stay in sync with code
// (accounting standards, parser tuning). Admin-configurable values (roles,
// thresholds, flags) stay out so Rule #3 (subscriber-configurable without a
// code change) actually holds.
const CODE_AUTHORITATIVE_METADATA_CATEGORIES = new Set([
  'EXPENSE_CATEGORY',      // coa_code tracks ChartOfAccounts mapping
  'OCR_EXPENSE_RULES',     // keywords — OCR classifier tuning
  'OCR_COURIER_ALIASES',   // aliases — OCR parser tuning
  'OCR_PAYMENT_KEYWORDS',  // aliases + mode_code — OCR parser tuning
]);

/**
 * Generic Lookup Controller — Phase 24
 * CRUD for configurable dropdown values (replaces hardcoded frontend arrays).
 */

// Default seed data for each category — mirrors current hardcoded arrays
const SEED_DEFAULTS = {
  EXPENSE_CATEGORY: [
    { code: 'TRANSPORTATION', label: 'Transportation', metadata: { coa_code: '6150' } },
    { code: 'TRANSPORT_P2P', label: 'Transport — P2P (Jeepney/Bus/Tricycle)', metadata: { coa_code: '6150', or_optional: true } },
    { code: 'TRANSPORT_SPECIAL', label: 'Transport — Grab/Taxi (Stock Delivery)', metadata: { coa_code: '6160', or_optional: true } },
    { code: 'TRAVEL_ACCOMMODATION', label: 'Travel/Accommodation', metadata: { coa_code: '6155' } },
    { code: 'FUEL_GAS', label: 'Fuel & Gas', metadata: { coa_code: '6200' } },
    { code: 'PARKING_TOLL', label: 'Parking/Toll', metadata: { coa_code: '6600' } },
    { code: 'COURIER_SHIPPING', label: 'Courier/Shipping', metadata: { coa_code: '6500' } },
    { code: 'ACCESS_MEALS', label: 'ACCESS/Meals', metadata: { coa_code: '6350' } },
    { code: 'OFFICE_SUPPLIES', label: 'Office Supplies', metadata: { coa_code: '6400' } },
    { code: 'UTILITIES_COMMUNICATION', label: 'Utilities/Communication', metadata: { coa_code: '6460' } },
    { code: 'RENT', label: 'Rent', metadata: { coa_code: '6450' } },
    { code: 'MARKETING_HCP', label: 'Marketing — HCP/Doctor', metadata: { coa_code: '6300' } },
    { code: 'MARKETING_HOSPITAL', label: 'Marketing — Hospital', metadata: { coa_code: '6300' } },
    { code: 'MARKETING_RETAIL', label: 'Marketing — Retail', metadata: { coa_code: '6300' } },
    { code: 'VEHICLE_MAINTENANCE', label: 'Vehicle Maintenance', metadata: { coa_code: '6260' } },
    { code: 'REPAIRS_MAINTENANCE', label: 'Repairs/Maintenance', metadata: { coa_code: '6260' } },
    { code: 'PROFESSIONAL_FEES', label: 'Professional Fees', metadata: { coa_code: '6800' } },
    { code: 'REGULATORY_LICENSING', label: 'Regulatory/Licensing', metadata: { coa_code: '6810' } },
    { code: 'IT_SOFTWARE', label: 'IT/Software', metadata: { coa_code: '6820' } },
    { code: 'MISCELLANEOUS', label: 'Miscellaneous', metadata: { coa_code: '6900' } },
  ],
  PERSON_TYPE: ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'CONSULTANT', 'DIRECTOR'],
  EMPLOYMENT_TYPE: ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CONSULTANT', 'PARTNERSHIP'],
  CARD_TYPE: ['CREDIT_CARD', 'FLEET_CARD', 'DEBIT_CARD'],
  CARD_BRAND: ['VISA', 'MASTERCARD', 'JCB', 'AMEX', 'FLEET'],
  FUEL_TYPE: ['UNLEADED', 'DIESEL', 'PREMIUM', 'V-POWER', 'XCS', 'OTHER'],
  COLLATERAL_TYPE: ['BROCHURE', 'SAMPLE', 'MERCHANDISE', 'BANNER', 'FLYER', 'OTHER'],
  ACTIVITY_TYPE: ['Office', 'Field', 'Other', 'No Work'],
  VEHICLE_TYPE: ['CAR', 'MOTORCYCLE', 'COMPANY_CAR', 'NONE'],
  BIR_FLAG: ['BOTH', 'INTERNAL', 'BIR'],
  OFFICE_SUPPLY_CATEGORY: ['PAPER', 'INK_TONER', 'CLEANING', 'STATIONERY', 'ELECTRONICS', 'OTHER'],
  CUSTOMER_TYPE: ['PERSON', 'PHARMACY', 'DIAGNOSTIC_CENTER', 'INDUSTRIAL', 'OTHER'],
  DR_TYPE: ['DR_CONSIGNMENT', 'DR_SAMPLING', 'DR_DONATION'],
  STOCK_TYPE: ['PHARMA', 'FNB', 'OFFICE'],
  FNB_CATEGORY: ['FOOD', 'BEVERAGE', 'DESSERT', 'SNACK', 'INGREDIENT', 'PACKAGING', 'OTHER'],
  DEPARTMENT: ['SALES', 'ADMIN', 'FINANCE', 'OPERATIONS', 'LOGISTICS', 'MARKETING', 'EXECUTIVE'],
  POSITION: ['BDM', 'eBDM', 'Sales Rep', 'Sales Manager', 'Admin Staff', 'Finance Staff', 'President', 'Operations Head'],
  // Phase 24B — new categories
  ENGAGEMENT_TYPE: [
    { code: 'TXT_PROMATS', label: 'TXT/PROMATS' },
    { code: 'MES_VIBER_GIF', label: 'MES/VIBER GIF' },
    { code: 'PICTURE', label: 'PICTURE' },
    { code: 'SIGNED_CALL', label: 'SIGNED CALL' },
    { code: 'VOICE_CALL', label: 'VOICE CALL' },
    { code: 'WHATSAPP_CALL', label: 'WhatsApp Call' },
    { code: 'WHATSAPP_MSG', label: 'WhatsApp Message' },
    { code: 'VIBER_CALL', label: 'Viber Call' },
    { code: 'VIBER_MSG', label: 'Viber Message' },
    { code: 'EMAIL_FOLLOWUP', label: 'Email Follow-up' },
    { code: 'SMS_FOLLOWUP', label: 'SMS Follow-up' },
  ],
  COMM_CHANNEL: [
    { code: 'VIBER', label: 'Viber' },
    { code: 'MESSENGER', label: 'Messenger' },
    { code: 'WHATSAPP', label: 'WhatsApp' },
    { code: 'EMAIL', label: 'Email' },
    { code: 'GOOGLE_CHAT', label: 'Google Chat' },
  ],
  COMM_DIRECTION: [
    { code: 'OUTBOUND', label: 'Outbound (BDM to Client)' },
    { code: 'INBOUND', label: 'Inbound (Client to BDM)' },
  ],
  MSG_TEMPLATE_CATEGORY: [
    { code: 'follow_up', label: 'Follow-up' },
    { code: 'appointment', label: 'Appointment' },
    { code: 'product_info', label: 'Product Information' },
    { code: 'greeting', label: 'Greeting' },
    { code: 'reminder', label: 'Reminder' },
    { code: 'thank_you', label: 'Thank You' },
  ],
  ENGAGEMENT_LEVEL: [
    { code: '1', label: '1 - Visited 4 times' },
    { code: '2', label: '2 - Knows BDM/products' },
    { code: '3', label: '3 - Tried products' },
    { code: '4', label: '4 - In group chat' },
    { code: '5', label: '5 - Active partner' },
  ],
  DOC_TYPE: [
    { code: 'CSI', label: 'Charge Sales Invoice (CSI)' },
    { code: 'CR', label: 'Collection Receipt (CR)' },
    { code: 'CWT_2307', label: 'BIR 2307 (Withholding Tax)' },
    { code: 'GAS_RECEIPT', label: 'Gas Station Receipt' },
    { code: 'ODOMETER', label: 'Odometer' },
    { code: 'OR', label: 'Expense Receipt / OR' },
    { code: 'UNDERTAKING', label: 'Undertaking of Receipt (GRN)' },
    { code: 'DR', label: 'Delivery Receipt (DR)' },
  ],
  // OCR Expense Classification Rules — lookup-driven keyword→COA mapping (Phase H2)
  OCR_EXPENSE_RULES: [
    { code: 'COURIER_SHIPPING', label: 'Courier & Delivery', metadata: { coa_code: '6500', keywords: ['AP CARGO', 'JRS', 'LBC', 'J&T', 'J AND T', '2GO', 'AIR21', 'NINJA VAN', 'GRAB EXPRESS', 'COURIER', 'SHIPPING', 'XEND', 'ENTREGO', 'FLASH EXPRESS', 'DHL', 'FEDEX', 'UPS', 'PHLPOST', 'LALAMOVE', 'ABEST'] } },
    { code: 'FUEL', label: 'Fuel & Gas', metadata: { coa_code: '6200', keywords: ['SHELL', 'PETRON', 'CALTEX', 'PHOENIX', 'SEAOIL', 'GASOLINE', 'FUEL', 'DIESEL'] } },
    { code: 'PARKING_TOLL', label: 'Parking & Tolls', metadata: { coa_code: '6600', keywords: ['PARKING', 'TOLL', 'NLEX', 'SLEX', 'TPLEX', 'SKYWAY', 'CAVITEX', 'EXPRESSWAY', 'EASYTRIP', 'EASY TRIP', 'AUTOSWEEP', 'AUTO SWEEP', 'RFID', 'TESY'] } },
    { code: 'TRAVEL_ACCOMMODATION', label: 'Travel & Accommodation', metadata: { coa_code: '6155', keywords: ['HOTEL', 'INN', 'LODGE', 'PENSION', 'AIRBNB', 'ACCOMMODATION', 'RESORT'] } },
    { code: 'ACCESS_MEALS', label: 'ACCESS Expense', metadata: { coa_code: '6350', keywords: ['RESTAURANT', 'FOOD', 'MEAL', 'CAFE', 'JOLLIBEE', 'MCDONALDS', 'DINE', 'EATERY', 'CHOWKING', 'MANG INASAL', 'KFC', 'GREENWICH', 'PIZZA HUT', 'STARBUCKS', 'MAX\'S'] } },
    { code: 'OFFICE_SUPPLIES', label: 'Office Supplies', metadata: { coa_code: '6400', keywords: ['PRINTING', 'OFFICE', 'SUPPLIES', 'STATIONERY', 'NATIONAL BOOKSTORE', 'LANDERS', 'S&R', 'SNR', 'SM STORE', 'ROBINSONS', 'WILCON', 'HANDYMAN', 'TRUE VALUE', 'ACE HARDWARE', 'MERCURY DRUG', 'WATSONS'] } },
    { code: 'UTILITIES_COMMUNICATION', label: 'Utilities & Communication', metadata: { coa_code: '6460', keywords: ['GLOBE', 'SMART', 'PLDT', 'CONVERGE', 'MERALCO', 'WATER', 'ELECTRIC', 'UTILITY'] } },
    { code: 'TRANSPORTATION', label: 'Transport Expense', metadata: { coa_code: '6150', keywords: ['GRAB', 'TAXI', 'ANGKAS', 'FERRY', 'BOAT'] } },
    { code: 'REGULATORY_LICENSING', label: 'Regulatory & Licensing', metadata: { coa_code: '6810', keywords: ['FDA', 'DOH', 'LGU', 'LICENSE', 'PERMIT', 'REGULATORY', 'REGISTRATION', 'RENEWAL'] } },
    { code: 'IT_SOFTWARE', label: 'IT Hardware & Software', metadata: { coa_code: '6820', keywords: ['SOFTWARE', 'SUBSCRIPTION', 'DOMAIN', 'HOSTING', 'CLOUD', 'APP', 'COMPUTER', 'LAPTOP', 'PRINTER', 'HARDWARE'] } },
    { code: 'REPAIRS_MAINTENANCE', label: 'Repairs & Maintenance', metadata: { coa_code: '6260', keywords: ['REPAIR', 'MAINTENANCE', 'AIRCON', 'PLUMBING', 'ELECTRICAL', 'FIX', 'TOYOTA', 'HONDA', 'MITSUBISHI', 'FORD', 'ISUZU', 'NISSAN', 'HYUNDAI', 'KIA', 'AUTO SHOP', 'VULCANIZING', 'TIRE'] } },
    { code: 'RENT', label: 'Rent Expense', metadata: { coa_code: '6450', keywords: ['RENT', 'LEASE', 'BALAI LAWAAN'] } },
    { code: 'PROFESSIONAL_FEES', label: 'Professional Fees', metadata: { coa_code: '6800', keywords: ['AUDIT', 'TAX', 'LEGAL', 'ATTORNEY', 'LAWYER', 'CPA', 'ACCOUNTANT', 'PHARMACIST', 'NOTARY'] } },
    { code: 'FOOD_COST', label: 'Food Cost', metadata: { coa_code: '5400', keywords: ['GROCERY', 'MARKET', 'INGREDIENT', 'MEAT', 'VEGETABLE', 'FISH', 'SEAFOOD', 'RICE', 'COOKING', 'FOOD SUPPLY'] } },
    { code: 'BEVERAGE_COST', label: 'Beverage Cost', metadata: { coa_code: '5500', keywords: ['BEVERAGE', 'DRINK', 'JUICE', 'SODA', 'COFFEE BEAN', 'TEA', 'LIQUOR', 'WINE', 'BEER'] } },
    { code: 'FNB_SUPPLIES', label: 'F&B Supplies & Packaging', metadata: { coa_code: '6830', keywords: ['TAKEOUT BOX', 'PACKAGING', 'CONTAINER', 'DISPOSABLE', 'NAPKIN', 'TISSUE', 'F&B SUPPLY'] } },
    { code: 'KITCHEN_EQUIPMENT', label: 'Kitchen Equipment & Maintenance', metadata: { coa_code: '6840', keywords: ['KITCHEN', 'OVEN', 'STOVE', 'REFRIGERATOR', 'FREEZER', 'KITCHEN REPAIR'] } },
    { code: 'PROPERTY_TAX', label: 'Property Tax & Fees', metadata: { coa_code: '6890', keywords: ['PROPERTY TAX', 'REAL PROPERTY', 'AMILYAR', 'REALTY TAX'] } },
    { code: 'PROPERTY_INSURANCE', label: 'Property Insurance', metadata: { coa_code: '6880', keywords: ['INSURANCE', 'FIRE INSURANCE', 'PROPERTY INSURANCE', 'COMPREHENSIVE'] } },
    { code: 'PROPERTY_MAINTENANCE', label: 'Property Maintenance', metadata: { coa_code: '6870', keywords: ['PROPERTY REPAIR', 'BUILDING MAINTENANCE', 'RENOVATION', 'PAINT', 'CONSTRUCTION'] } },
  ],
  // OCR Courier/Shipping aliases — used by orParser.js to detect supplier as a courier
  // (separate from OCR_EXPENSE_RULES so admin can edit "what looks like a courier" without touching COA mapping)
  OCR_COURIER_ALIASES: [
    { code: 'AP_CARGO', label: 'AP Cargo', metadata: { aliases: ['AP CARGO', 'AP-CARGO', 'APCARGO'] } },
    { code: 'JRS_EXPRESS', label: 'JRS Express', metadata: { aliases: ['JRS EXPRESS', 'JRS'] } },
    { code: 'LBC', label: 'LBC Express', metadata: { aliases: ['LBC'] } },
    { code: 'JNT', label: 'J&T Express', metadata: { aliases: ['J&T', 'J AND T', 'JNT'] } },
    { code: '2GO', label: '2GO Express', metadata: { aliases: ['2GO'] } },
    { code: 'AIR21', label: 'Air21', metadata: { aliases: ['AIR21', 'AIR 21'] } },
    { code: 'ABEST', label: 'Abest Express', metadata: { aliases: ['ABEST'] } },
    { code: 'GRAB_EXPRESS', label: 'Grab Express', metadata: { aliases: ['GRAB EXPRESS'] } },
    { code: 'LALAMOVE', label: 'Lalamove', metadata: { aliases: ['LALAMOVE'] } },
    { code: 'XEND', label: 'Xend', metadata: { aliases: ['XEND'] } },
    { code: 'ENTREGO', label: 'Entrego', metadata: { aliases: ['ENTREGO'] } },
    { code: 'NINJA_VAN', label: 'Ninja Van', metadata: { aliases: ['NINJA VAN', 'NINJAVAN'] } },
    { code: 'FLASH_EXPRESS', label: 'Flash Express', metadata: { aliases: ['FLASH EXPRESS'] } },
    { code: 'DHL', label: 'DHL', metadata: { aliases: ['DHL'] } },
    { code: 'FEDEX', label: 'FedEx', metadata: { aliases: ['FEDEX', 'FED EX'] } },
    { code: 'UPS', label: 'UPS', metadata: { aliases: ['UPS'] } },
    { code: 'PHLPOST', label: 'PHLPost', metadata: { aliases: ['PHLPOST', 'PHL POST', 'PHILPOST'] } },
  ],
  // OCR Payment-mode keyword detection — used by orParser.js to detect payment mode from receipt text
  // metadata.aliases = lowercase keyword variants found on receipts; metadata.mode_code references PaymentMode.mode_code
  // Admin can add/customize per-entity payment keywords (e.g. new e-wallets) without code changes.
  OCR_PAYMENT_KEYWORDS: [
    { code: 'CASH', label: 'Cash', metadata: { aliases: ['cash'], mode_code: 'CASH' } },
    { code: 'GCASH', label: 'GCash', metadata: { aliases: ['gcash', 'g-cash', 'g cash'], mode_code: 'GCASH' } },
    { code: 'MAYA', label: 'Maya', metadata: { aliases: ['maya', 'paymaya'], mode_code: 'MAYA' } },
    { code: 'CREDIT_CARD', label: 'Credit Card', metadata: { aliases: ['credit card', 'creditcard'], mode_code: 'CC_RCBC' } },
    { code: 'DEBIT_CARD', label: 'Debit Card', metadata: { aliases: ['debit card', 'debitcard'], mode_code: 'CC_RCBC' } },
    { code: 'CHECK', label: 'Check', metadata: { aliases: ['check', 'cheque'], mode_code: 'CHECK' } },
    { code: 'BANK_TRANSFER', label: 'Bank Transfer', metadata: { aliases: ['bank transfer', 'banktransfer', 'fund transfer'], mode_code: 'BANK_TRANSFER' } },
    { code: 'ONLINE', label: 'Online Payment', metadata: { aliases: ['online', 'cashless'], mode_code: 'BANK_TRANSFER' } },
    { code: 'PREPAID', label: 'Prepaid', metadata: { aliases: ['prepaid'], mode_code: 'CASH' } },
  ],
  SALE_TYPE: ['CSI', 'SERVICE_INVOICE', 'CASH_RECEIPT'],
  VAT_TYPE: ['VATABLE', 'EXEMPT', 'ZERO'],
  EXPENSE_TYPE: ['ORE', 'ACCESS'],
  OFFICE_SUPPLY_TXN_TYPE: ['PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT'],
  PAYMENT_MODE_TYPE: ['CASH', 'CHECK', 'BANK_TRANSFER', 'GCASH', 'CARD', 'OTHER'],
  PEOPLE_STATUS: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED'],
  ACCOUNT_TYPE: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
  PO_STATUS: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'],
  GOV_RATE_TYPE: [
    { code: 'SSS', label: 'SSS' },
    { code: 'PHILHEALTH', label: 'PhilHealth' },
    { code: 'PAGIBIG', label: 'PagIBIG' },
    { code: 'WITHHOLDING_TAX', label: 'Withholding Tax' },
    { code: 'EC', label: 'EC' },
    { code: 'DE_MINIMIS', label: 'De Minimis' },
  ],
  GOV_RATE_BRACKET_TYPE: ['SSS', 'WITHHOLDING_TAX', 'EC'],
  GOV_RATE_FLAT_TYPE: ['PHILHEALTH', 'PAGIBIG'],
  KPI_DIRECTION: [
    { code: 'higher_better', label: 'Higher is better' },
    { code: 'lower_better', label: 'Lower is better' },
  ],
  KPI_UNIT: ['%', 'count', 'days', 'PHP', 'ratio', 'score'],
  KPI_COMPUTATION: [
    { code: 'manual', label: 'Self-reported (manual)' },
    { code: 'auto', label: 'Auto-computed from ERP data' },
  ],
  UNIT_CODE: [
    'PC', 'BOX', 'VIAL', 'BOTTLE', 'TUBE', 'SACHET', 'STRIP',
    'TABLET', 'CAPSULE', 'AMPULE', 'PACK', 'ROLL', 'SET',
    'BAG', 'CAN', 'PAIR', 'PFS', 'JAR', 'YARD',
    'CASE', 'DRUM', 'CARTON', 'REAM', 'DOZEN',
  ],
  // Gap 9 — VIP Client type (Doctor model clientType field)
  VIP_CLIENT_TYPE: [
    { code: 'MD', label: 'Medical Doctor' },
    { code: 'PHARMACIST', label: 'Pharmacist' },
    { code: 'PURCHASER', label: 'Purchaser' },
    { code: 'ADMINISTRATOR', label: 'Administrator' },
    { code: 'KEY_DECISION_MAKER', label: 'Key Decision Maker' },
    { code: 'OTHER', label: 'Other' },
  ],
  // Phase 28 — Sales Goals & KPI
  GOAL_CONFIG: [
    { code: 'COLLECTION_TARGET_PCT', label: 'Default Collection Target %', metadata: { value: 70 } },
    { code: 'FISCAL_START_MONTH', label: 'Fiscal Year Start Month', metadata: { value: 1 } },
    { code: 'ATTAINMENT_GREEN', label: 'On Track Threshold %', metadata: { value: 90 } },
    { code: 'ATTAINMENT_YELLOW', label: 'Needs Attention Threshold %', metadata: { value: 70 } },
    { code: 'ATTAINMENT_RED', label: 'At Risk Threshold %', metadata: { value: 50 } },
    { code: 'SNAPSHOT_AUTO_COMPUTE', label: 'Auto-Compute Monthly Snapshots', metadata: { value: true } },
    { code: 'LOST_SALES_THRESHOLD_DAYS', label: 'Stock-Out Threshold (days)', metadata: { value: 3 } },
    { code: 'ACCREDITATION_LEVEL', label: 'Hospital Accreditation Engagement Level', metadata: { value: 4 } },
    // Phase SG-Q2 — defaults used by auto-enrollment of BDMs from PeopleMaster on plan activation.
    // 0 means "create target rows with zero sales_target — president will fill in per-BDM manually".
    // Set a non-zero value if your subsidiary wants every BDM to start with the same baseline target.
    { code: 'DEFAULT_TARGET_REVENUE', label: 'Default BDM Sales Target (auto-enroll)', metadata: { value: 0 } },
    // Phase SG-6 #30 — policy for what to do with OPEN IncentivePayout rows
    // when a BDM is deactivated or leaves the eligible role set (PeopleMaster
    // lifecycle hook). `finalize_accrued` (default) keeps accruals intact so
    // authority finishes the lifecycle; `reverse_accrued` flags them REJECTED
    // so authority can post a reversal JE via the payout ledger UI.
    // Lifecycle hook NEVER posts a reversal JE automatically — always human-in-loop.
    {
      code: 'DEACTIVATION_PAYOUT_POLICY',
      label: 'Lifecycle Deactivation Payout Policy',
      metadata: {
        value: 'finalize_accrued',
        allowed_values: ['finalize_accrued', 'reverse_accrued'],
        description:
          'When a BDM is deactivated or their role leaves SALES_GOAL_ELIGIBLE_ROLES, ' +
          'what happens to open ACCRUED IncentivePayout rows? ' +
          '`finalize_accrued` (default) = leave as ACCRUED, authority finishes. ' +
          '`reverse_accrued` = flag REJECTED, authority posts reversal JE from ledger.',
      },
    },
  ],
  // Phase SG-3R — growth driver master promotion.
  // `metadata.default_kpi_codes[]` and `metadata.default_weight` are consumed by
  // `createPlan` (salesGoalController) when the client passes `use_driver_defaults: true`
  // and does not supply explicit `kpi_definitions`. Subscribers re-map KPIs per driver
  // via Control Center → Lookup Tables (zero code change). Weight is a relative
  // emphasis hint the setup UI can use to pre-fill revenue_target share; plan math
  // never blocks on it, so leaving it zero is safe.
  GROWTH_DRIVER: [
    { code: 'HOSP_ACCRED', label: 'Hospital Accreditation', metadata: { default_kpi_codes: ['PCT_HOSP_ACCREDITED', 'TIME_TO_ACCREDITATION', 'REV_PER_ACCREDITED_HOSP'], default_weight: 0.30, description: 'Drive formulary penetration in target hospitals' } },
    { code: 'PHARMACY_CSR', label: 'Pharmacy & CSR Inclusion', metadata: { default_kpi_codes: ['SKUS_LISTED_PER_HOSP', 'FORMULARY_APPROVAL_RATE', 'MONTHLY_REORDER_FREQ'], default_weight: 0.20, description: 'Expand pharmacy/CSR SKU coverage and reorder cadence' } },
    { code: 'ZERO_LOST_SALES', label: 'Inventory Optimization / Zero Lost Sales', metadata: { default_kpi_codes: ['LOST_SALES_INCIDENTS', 'INVENTORY_TURNOVER', 'EXPIRY_RETURNS'], default_weight: 0.15, description: 'Eliminate stockouts and expiry write-offs' } },
    { code: 'STRATEGIC_MD', label: 'Strategic Partnerships with MDs', metadata: { default_kpi_codes: ['MD_ENGAGEMENT_COVERAGE', 'HOSP_REORDER_CYCLE_TIME'], default_weight: 0.20, description: 'Build decision-maker relationships that drive prescriptions' } },
    { code: 'PRICE_INCREASE', label: 'Surgical Price Increases', metadata: { default_kpi_codes: ['VOLUME_RETENTION_POST_INCREASE', 'GROSS_MARGIN_PER_SKU'], default_weight: 0.15, description: 'Protect margin without losing volume' } },
  ],
  KPI_CODE: [
    // ═══ SALES KPIs (existing, extended with functional_roles) ═══
    { code: 'PCT_HOSP_ACCREDITED', label: '% Hospitals Accredited', metadata: { unit: '%', direction: 'higher_better', computation: 'auto', source_model: 'Hospital', functional_roles: ['SALES'], description: 'Percentage of target hospitals successfully accredited' } },
    { code: 'TIME_TO_ACCREDITATION', label: 'Time to Accreditation (days)', metadata: { unit: 'days', direction: 'lower_better', computation: 'manual', functional_roles: ['SALES'], description: 'Average number of days from initial contact to accreditation approval' } },
    { code: 'REV_PER_ACCREDITED_HOSP', label: 'Revenue per Accredited Hospital', metadata: { unit: 'PHP', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Average monthly revenue generated per accredited hospital' } },
    { code: 'SKUS_LISTED_PER_HOSP', label: 'SKUs Listed per Hospital', metadata: { unit: 'count', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Average number of product SKUs listed per hospital formulary' } },
    { code: 'FORMULARY_APPROVAL_RATE', label: 'Formulary Approval Success Rate', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['SALES'], description: 'Percentage of formulary listing applications approved' } },
    { code: 'MONTHLY_REORDER_FREQ', label: 'Monthly Reorder Frequency', metadata: { unit: 'count', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Average number of reorders per hospital per month' } },
    { code: 'LOST_SALES_INCIDENTS', label: 'Lost Sales Incidents', metadata: { unit: 'count', direction: 'lower_better', computation: 'auto', functional_roles: ['SALES'], description: 'Number of stock-out events that resulted in lost sales' } },
    { code: 'INVENTORY_TURNOVER', label: 'Inventory Turnover', metadata: { unit: 'ratio', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Rate at which inventory is sold and replaced over a period' } },
    { code: 'EXPIRY_RETURNS', label: 'Expiry Returns', metadata: { unit: 'count', direction: 'lower_better', computation: 'auto', functional_roles: ['SALES'], description: 'Number of products returned due to expiry' } },
    { code: 'MD_ENGAGEMENT_COVERAGE', label: 'MD Engagement Coverage', metadata: { unit: '%', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Percentage of target medical doctors actively engaged' } },
    { code: 'HOSP_REORDER_CYCLE_TIME', label: 'Hospital Reorder Cycle Time', metadata: { unit: 'days', direction: 'lower_better', computation: 'manual', functional_roles: ['SALES'], description: 'Average days between hospital reorders' } },
    { code: 'VOLUME_RETENTION_POST_INCREASE', label: 'Volume Retention Post Price Increase', metadata: { unit: '%', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Percentage of sales volume retained after a price increase' } },
    { code: 'GROSS_MARGIN_PER_SKU', label: 'Gross Margin per SKU', metadata: { unit: '%', direction: 'higher_better', computation: 'auto', functional_roles: ['SALES'], description: 'Average gross margin percentage per product SKU' } },

    // ═══ PURCHASING KPIs (Phase 32) ═══
    { code: 'PO_PROCESSING_TIME', label: 'PO Processing Time (days)', metadata: { unit: 'days', direction: 'lower_better', computation: 'manual', functional_roles: ['PURCHASING'], description: 'Process all purchase orders within 3 business days of receipt' } },
    { code: 'VENDOR_PAYMENT_COMPLIANCE', label: 'Vendor Payment Compliance %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['PURCHASING'], description: 'Percentage of vendor payments made on or before due date' } },
    { code: 'COST_SAVINGS_PCT', label: 'Cost Savings vs Budget %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['PURCHASING'], description: 'Percentage of cost savings achieved versus allocated budget' } },

    // ═══ ACCOUNTING KPIs (Phase 32) ═══
    { code: 'CLOSE_TIMELINESS', label: 'Month-End Close Timeliness (days)', metadata: { unit: 'days', direction: 'lower_better', computation: 'manual', functional_roles: ['ACCOUNTING'], description: 'Complete month-end close within 5 business days after period end' } },
    { code: 'JOURNAL_ACCURACY', label: 'Journal Entry Accuracy %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['ACCOUNTING'], description: 'Percentage of journal entries posted without corrections needed' } },
    { code: 'RECONCILIATION_RATE', label: 'Bank Reconciliation Completion %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['ACCOUNTING'], description: 'Percentage of bank accounts fully reconciled by month-end' } },

    // ═══ COLLECTIONS KPIs (Phase 32) ═══
    { code: 'COLLECTION_EFFICIENCY', label: 'Collection Efficiency %', metadata: { unit: '%', direction: 'higher_better', computation: 'auto', functional_roles: ['COLLECTIONS'], description: 'Percentage of outstanding receivables collected within terms' } },
    { code: 'AGING_REDUCTION', label: 'AR Aging Reduction %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['COLLECTIONS'], description: 'Percentage reduction in accounts receivable aging over 90 days' } },

    // ═══ INVENTORY KPIs (Phase 32) ═══
    { code: 'STOCKOUT_RATE', label: 'Stockout Rate %', metadata: { unit: '%', direction: 'lower_better', computation: 'auto', functional_roles: ['INVENTORY'], description: 'Percentage of SKUs with zero available stock during the period' } },
    { code: 'CYCLE_COUNT_ACCURACY', label: 'Cycle Count Accuracy %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['INVENTORY'], description: 'Percentage of cycle count items matching system quantity' } },

    // ═══ UNIVERSAL KPIs (apply to ALL functions) ═══
    { code: 'ATTENDANCE_RATE', label: 'Attendance Rate %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['ALL'], description: 'Percentage of scheduled work days attended' } },
    { code: 'TASK_COMPLETION', label: 'Task Completion Rate %', metadata: { unit: '%', direction: 'higher_better', computation: 'manual', functional_roles: ['ALL'], description: 'Percentage of assigned tasks completed on or before deadline' } },
  ],
  // Phase SG-5 #25 — accelerator_factor per tier (commission multiplier).
  // Defaults to 1.0 on every seed row so existing accruals keep the same math.
  // Admins opt a tier into acceleration via Control Center → Lookup Tables →
  // INCENTIVE_TIER → set metadata.accelerator_factor (e.g. 1.25 for 125% payout
  // at Platinum). salesGoalService.applyTierAccelerator clamps negatives to 1.0.
  INCENTIVE_TIER: [
    { code: 'TIER_1', label: 'Platinum', metadata: { attainment_min: 100, budget_per_bdm: 150000, accelerator_factor: 1.0, reward_description: '', sort_order: 1, bg_color: '#fef3c7', text_color: '#92400e' } },
    { code: 'TIER_2', label: 'Gold', metadata: { attainment_min: 90, budget_per_bdm: 80000, accelerator_factor: 1.0, reward_description: '', sort_order: 2, bg_color: '#fef9c3', text_color: '#854d0e' } },
    { code: 'TIER_3', label: 'Silver', metadata: { attainment_min: 80, budget_per_bdm: 50000, accelerator_factor: 1.0, reward_description: '', sort_order: 3, bg_color: '#f1f5f9', text_color: '#475569' } },
    { code: 'TIER_4', label: 'Bronze', metadata: { attainment_min: 70, budget_per_bdm: 30000, accelerator_factor: 1.0, reward_description: '', sort_order: 4, bg_color: '#fed7aa', text_color: '#9a3412' } },
    { code: 'TIER_5', label: 'Participant', metadata: { attainment_min: 50, budget_per_bdm: 15000, accelerator_factor: 1.0, reward_description: '', sort_order: 5, bg_color: '#dbeafe', text_color: '#1e40af' } },
  ],
  // Phase 28 — Status palette for sales-goal attainment buckets.
  // Codes match the bucket emitted by salesGoalController.getGoalDashboard()
  // (ON_TRACK / NEEDS_ATTENTION / AT_RISK). Subscribers can rebrand colors
  // and labels per entity via Control Center → Lookup Tables — zero code change.
  // bar_color drives progress fills; bg_color/text_color drive badges.
  STATUS_PALETTE: [
    { code: 'ON_TRACK',         label: 'On Track', metadata: { bar_color: '#22c55e', bg_color: '#dcfce7', text_color: '#166534', sort_order: 1 } },
    { code: 'NEEDS_ATTENTION',  label: 'At Risk',  metadata: { bar_color: '#f59e0b', bg_color: '#fef3c7', text_color: '#92400e', sort_order: 2 } },
    { code: 'AT_RISK',          label: 'Behind',   metadata: { bar_color: '#ef4444', bg_color: '#fee2e2', text_color: '#991b1b', sort_order: 3 } },
  ],
  ACTION_TYPE: [
    { code: 'ACCREDITATION', label: 'Hospital Accreditation' },
    { code: 'FORMULARY_LISTING', label: 'Formulary/CSR Listing' },
    { code: 'MD_ENGAGEMENT', label: 'MD Engagement Activity' },
    { code: 'PRICE_ADJUSTMENT', label: 'Price Adjustment' },
    { code: 'STOCK_REPLENISH', label: 'Stock Replenishment' },
    { code: 'GENERAL', label: 'General Action' },
  ],
  INCENTIVE_PROGRAM: [
    { code: 'JAPAN_TRIP_2026', label: 'Japan Trip 2026', metadata: { fiscal_year: 2026, qualification_metric: 'sales', use_tiers: true } },
  ],
  // Phase 29 — Approval Workflow
  APPROVER_TYPE: [
    { code: 'ROLE', label: 'By Role' },
    { code: 'USER', label: 'Specific Users' },
    { code: 'REPORTS_TO', label: 'Direct Manager' },
  ],
  APPROVER_ROLE: [
    { code: 'ADMIN', label: 'Admin' },
    { code: 'FINANCE', label: 'Finance' },
    { code: 'PRESIDENT', label: 'President' },
  ],
  // Financial vs Operational segregation — president approves financial, can delegate operational later
  APPROVAL_CATEGORY: [
    { code: 'FINANCIAL', label: 'Financial', metadata: { description: 'Involves money movement — requires president/finance approval', modules: ['EXPENSES', 'PURCHASING', 'PAYROLL', 'JOURNAL', 'BANKING', 'PETTY_CASH', 'IC_TRANSFER', 'INCOME', 'PRF_CALF', 'PERDIEM_OVERRIDE', 'DEDUCTION_SCHEDULE', 'INCENTIVE_PAYOUT', 'OPENING_AR'] } },
    { code: 'OPERATIONAL', label: 'Operational', metadata: { description: 'Document processing & verification — can be delegated to admin/finance', modules: ['SALES', 'INVENTORY', 'KPI', 'SMER', 'CAR_LOGBOOK', 'FUEL_ENTRY', 'COLLECTION', 'SALES_GOAL_PLAN', 'UNDERTAKING', 'CREDIT_NOTE', 'INCENTIVE_DISPUTE'] } },
  ],
  APPROVAL_MODULE: [
    // Authority Matrix modules (Phase 29) — with financial/operational category.
    // Collection entry lives below under the Universal Approval Hub block
    // (Phase F.1) as the singular canonical key 'COLLECTION' — that's what
    // gateApproval() sends, so rules must be filed under that code.
    { code: 'SALES', label: 'Sales', metadata: { category: 'OPERATIONAL' } },
    // OPENING_AR — Pre-cutover historical AR. salesController.js splits batches
    // so Opening AR gates on its OWN module key (higher fraud risk than regular
    // SALES). Exposed here so Control Center → Approval Rules dropdown lists it
    // and admin can configure separate matrix rules (e.g., president-only over
    // ₱1M). Subscribers adjust category to OPERATIONAL in low-risk verticals.
    { code: 'OPENING_AR', label: 'Opening AR (Pre-Cutover)', metadata: { category: 'FINANCIAL' } },
    { code: 'EXPENSES', label: 'Expenses', metadata: { category: 'FINANCIAL' } },
    { code: 'PURCHASING', label: 'Purchasing', metadata: { category: 'FINANCIAL' } },
    { code: 'PAYROLL', label: 'Payroll', metadata: { category: 'FINANCIAL' } },
    { code: 'INVENTORY', label: 'Inventory', metadata: { category: 'OPERATIONAL' } },
    // Phase 32 — Undertaking (GRN receipt confirmation). Auto-created on GRN create.
    // Acknowledge auto-approves the linked GRN (rule #20).
    { code: 'UNDERTAKING', label: 'Undertaking (Receipt Confirmation)', metadata: { category: 'OPERATIONAL' } },
    { code: 'JOURNAL', label: 'Journal Entries', metadata: { category: 'FINANCIAL' } },
    { code: 'BANKING', label: 'Banking', metadata: { category: 'FINANCIAL' } },
    { code: 'PETTY_CASH', label: 'Petty Cash', metadata: { category: 'FINANCIAL' } },
    { code: 'IC_TRANSFER', label: 'Inter-Company Transfers', metadata: { category: 'FINANCIAL' } },
    { code: 'INCOME', label: 'Income', metadata: { category: 'FINANCIAL' } },
    // Universal Approval Hub modules (Phase F.1)
    { code: 'DEDUCTION_SCHEDULE', label: 'Deduction Schedules', metadata: { category: 'FINANCIAL' } },
    { code: 'KPI', label: 'KPI Ratings', metadata: { category: 'OPERATIONAL' } },
    { code: 'COLLECTION', label: 'Collection (Posting)', metadata: { category: 'OPERATIONAL' } },
    { code: 'SMER', label: 'SMER', metadata: { category: 'OPERATIONAL' } },
    { code: 'CAR_LOGBOOK', label: 'Car Logbook', metadata: { category: 'OPERATIONAL' } },
    // Phase 33 — per-fuel-entry approval (mirrors per-diem override). Held under
    // module:'EXPENSES' at gateApproval time but surfaced as its own row in the Hub.
    { code: 'FUEL_ENTRY', label: 'Fuel Entry (per-receipt)', metadata: { category: 'OPERATIONAL' } },
    // Phase 31R follow-up — CreditNote (returns) surfaces under its own module key
    // so pending CN approvals appear in the Approval Hub. Category=OPERATIONAL
    // because returns are a sales-operations flow, not a finance approval.
    { code: 'CREDIT_NOTE', label: 'Credit Notes / Returns', metadata: { category: 'OPERATIONAL' } },
    { code: 'PRF_CALF', label: 'PRF / CALF', metadata: { category: 'FINANCIAL' } },
    { code: 'APPROVAL_REQUEST', label: 'Authority Matrix Approvals', metadata: { category: 'FINANCIAL' } },
    { code: 'PERDIEM_OVERRIDE', label: 'Per Diem Override', metadata: { category: 'FINANCIAL' } },
    // Phase SG-Q2 — Sales Goal plan lifecycle (activate/close/reopen/bulk-target/compute)
    // gateApproval() key for the Default-Roles Gate. Category=OPERATIONAL so admins
    // can delegate posting without full financial authority.
    { code: 'SALES_GOAL_PLAN', label: 'Sales Goal Plan Lifecycle', metadata: { category: 'OPERATIONAL' } },
    // Phase SG-Q2 W2 — Incentive payout lifecycle (accrue/approve/pay/reverse)
    // Category=FINANCIAL — moves money (DR Incentive Expense / CR Incentive Accrual),
    // settlement debits the accrual and credits cash/bank. Default roles president/finance.
    { code: 'INCENTIVE_PAYOUT', label: 'Incentive Payout Lifecycle', metadata: { category: 'FINANCIAL' } },
    // Phase SG-4 #24 — Incentive dispute lifecycle (file → take-review →
    // resolve → close). Operational (no money moves on file/take/close;
    // RESOLVED_APPROVED may cascade a reversal but that hits INCENTIVE_PAYOUT
    // which has its own gate).
    { code: 'INCENTIVE_DISPUTE', label: 'Incentive Dispute Workflow', metadata: { category: 'OPERATIONAL' } },
  ],
  // Phase 30 — PersonDetail dropdowns (migrated from hardcoded arrays)
  CIVIL_STATUS: ['SINGLE', 'MARRIED', 'WIDOWED', 'SEPARATED'],
  PERSON_STATUS: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED'],
  SALARY_TYPE: [
    { code: 'FIXED_SALARY', label: 'Fixed Salary' },
    { code: 'COMMISSION_BASED', label: 'Commission Based' },
    { code: 'HYBRID', label: 'Hybrid (Fixed + Commission)' },
    { code: 'PROFESSIONAL_FEE', label: 'Consultation / Professional Fee', metadata: { description: 'Flat fee with no statutory deductions; pair with consultation_fee_amount + consultation_fee_frequency on CompProfile.' } },
  ],
  PROFESSIONAL_FEE_FREQUENCY: [
    { code: 'ONE_TIME', label: 'One-Time', metadata: { description: 'Pays full fee_amount once; subsequent payroll runs skip this person.' } },
    { code: 'MONTHLY', label: 'Monthly', metadata: { description: 'fee_amount per month. On SEMI_MONTHLY payroll cycle, split 50/50 across both slips.' } },
    { code: 'SEMI_MONTHLY', label: 'Semi-Monthly', metadata: { description: 'fee_amount per half-month. On MONTHLY payroll cycle, sums both halves into one slip.' } },
  ],
  TAX_STATUS: ['S', 'S1', 'S2', 'ME', 'ME1', 'ME2', 'ME3', 'ME4'],
  INCENTIVE_TYPE: ['CASH', 'IN_KIND', 'COMMISSION', 'NONE'],
  INSURANCE_TYPE: ['LIFE', 'KEYMAN', 'INCOME_LOSS', 'ACCIDENT', 'VEHICLE_COMPREHENSIVE', 'VEHICLE_CTPL'],
  INSURANCE_FREQUENCY: ['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'],
  INSURANCE_STATUS: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'PENDING_RENEWAL'],
  // Phase 30 — Role Centralization
  BDM_STAGE: [
    { code: 'CONTRACTOR', label: 'Contractor', metadata: { sort_order: 1, description: 'Starting stage — independent contractor' } },
    { code: 'PS_ELIGIBLE', label: 'Profit-Sharing Eligible', metadata: { sort_order: 2, description: 'Proven performer, eligible for profit sharing partnership' } },
    { code: 'TRANSITIONING', label: 'Transitioning to Subsidiary', metadata: { sort_order: 3, description: 'Moving toward autonomy, managing subsidiary operations' } },
    { code: 'SUBSIDIARY', label: 'Subsidiary Owner', metadata: { sort_order: 4, description: 'Operating own legal entity under VIP' } },
    { code: 'SHAREHOLDER', label: 'Shareholder', metadata: { sort_order: 5, description: 'Equity stakeholder in parent company' } },
  ],
  ROLE_MAPPING: [
    { code: 'BDM', label: 'BDM → Staff', metadata: { person_type: 'BDM', system_role: ROLES.STAFF } },
    { code: 'ECOMMERCE_BDM', label: 'eBDM → Staff', metadata: { person_type: 'ECOMMERCE_BDM', system_role: ROLES.STAFF } },
    { code: 'CONSULTANT', label: 'Consultant → Staff', metadata: { person_type: 'CONSULTANT', system_role: ROLES.STAFF } },
    { code: 'EMPLOYEE', label: 'Employee → Staff', metadata: { person_type: 'EMPLOYEE', system_role: ROLES.STAFF } },
    { code: 'DIRECTOR', label: 'Director → President', metadata: { person_type: 'DIRECTOR', system_role: ROLES.PRESIDENT } },
  ],
  SYSTEM_ROLE: [
    { code: 'ADMIN', label: 'Admin', metadata: { description: 'System administrator' } },
    { code: 'STAFF', label: 'Staff', metadata: { description: 'Non-management workers — BDMs, consultants, pharmacists, IT, cleaners, actual employees. Employment type lives on PeopleMaster.employment_type.' } },
    { code: 'FINANCE', label: 'Finance', metadata: { description: 'Finance/accounting manager' } },
    { code: 'PRESIDENT', label: 'President', metadata: { description: 'Company president — full cross-entity access' } },
    { code: 'CEO', label: 'CEO', metadata: { description: 'Chief Executive — view-only on ERP' } },
  ],
  // Phase 31 — Functional Role Assignment
  FUNCTIONAL_ROLE: [
    { code: 'PURCHASING', label: 'Purchasing' },
    { code: 'ACCOUNTING', label: 'Accounting' },
    { code: 'COLLECTIONS', label: 'Collections' },
    { code: 'INVENTORY', label: 'Inventory Management' },
    { code: 'SALES', label: 'Sales' },
    { code: 'ADMIN', label: 'Administration' },
    { code: 'AUDIT', label: 'Audit' },
    { code: 'PAYROLL', label: 'Payroll' },
    { code: 'LOGISTICS', label: 'Logistics & Distribution' },
  ],
  // Phase 32 — KPI Self-Rating & Performance Review
  RATING_SCALE: [
    { code: '1', label: '1 — Needs Improvement', metadata: { sort_order: 1 } },
    { code: '2', label: '2 — Below Expectations', metadata: { sort_order: 2 } },
    { code: '3', label: '3 — Meets Expectations', metadata: { sort_order: 3 } },
    { code: '4', label: '4 — Exceeds Expectations', metadata: { sort_order: 4 } },
    { code: '5', label: '5 — Outstanding', metadata: { sort_order: 5 } },
  ],
  COMPETENCY: [
    { code: 'COMMUNICATION', label: 'Communication' },
    { code: 'TEAMWORK', label: 'Teamwork & Collaboration' },
    { code: 'LEADERSHIP', label: 'Leadership' },
    { code: 'PROBLEM_SOLVING', label: 'Problem Solving' },
    { code: 'TIME_MANAGEMENT', label: 'Time Management' },
    { code: 'CUSTOMER_FOCUS', label: 'Customer Focus' },
    { code: 'INITIATIVE', label: 'Initiative & Proactiveness' },
    { code: 'ADAPTABILITY', label: 'Adaptability' },
  ],
  REVIEW_PERIOD_TYPE: [
    { code: 'MONTHLY', label: 'Monthly' },
    { code: 'QUARTERLY', label: 'Quarterly' },
    { code: 'SEMI_ANNUAL', label: 'Semi-Annual' },
    { code: 'ANNUAL', label: 'Annual' },
  ],
  // Phase A — ERP Access Templates (was hardcoded MODULES arrays in AccessTemplateManager + ErpAccessManager)
  ERP_MODULE: [
    { code: 'SALES', label: 'Sales', metadata: { key: 'sales', short_label: 'Sales', sort_order: 1 } },
    { code: 'INVENTORY', label: 'Inventory', metadata: { key: 'inventory', short_label: 'Inv', sort_order: 2 } },
    { code: 'COLLECTIONS', label: 'Collections', metadata: { key: 'collections', short_label: 'Coll', sort_order: 3 } },
    { code: 'EXPENSES', label: 'Expenses', metadata: { key: 'expenses', short_label: 'Exp', sort_order: 4 } },
    { code: 'REPORTS', label: 'Reports', metadata: { key: 'reports', short_label: 'Rep', sort_order: 5 } },
    { code: 'PEOPLE', label: 'People', metadata: { key: 'people', short_label: 'People', sort_order: 6 } },
    { code: 'PAYROLL', label: 'Payroll', metadata: { key: 'payroll', short_label: 'Payroll', sort_order: 7 } },
    { code: 'ACCOUNTING', label: 'Accounting', metadata: { key: 'accounting', short_label: 'Acctg', sort_order: 8 } },
    { code: 'PURCHASING', label: 'Purchasing', metadata: { key: 'purchasing', short_label: 'Purch', sort_order: 9 } },
    { code: 'BANKING', label: 'Banking', metadata: { key: 'banking', short_label: 'Bank', sort_order: 10 } },
    { code: 'SALES_GOALS', label: 'Sales Goals', metadata: { key: 'sales_goals', short_label: 'Goals', sort_order: 11 } },
    { code: 'APPROVALS', label: 'Approvals', metadata: { key: 'approvals', short_label: 'Appr', sort_order: 12 } },
    // Phase 3c — Master Data governance (customers, hospitals, territories, products).
    // Distinct from `purchasing` (which is workflow: PO, vendor, AP). `master` is the
    // governance surface — who can deactivate/delete master records that other modules consume.
    { code: 'MASTER', label: 'Master Data', metadata: { key: 'master', short_label: 'Master', sort_order: 13 } },
    // Phase 3c — ERP Access Templates module. Owns delegation of access itself
    // (template CRUD). Kept separate so admins can grant template-edit without
    // bundling it with another functional module.
    { code: 'ERP_ACCESS', label: 'ERP Access', metadata: { key: 'erp_access', short_label: 'Access', sort_order: 14 } },
    // Phase G9.R3 — Unified Operational Inbox messaging module.
    // Sub-permissions gate two-way DM, broadcast, cross-entity send, and
    // impersonate-reply. Default-roles fallback in MESSAGE_ACCESS_ROLES
    // lookup (per-entity). President always bypasses.
    { code: 'MESSAGING', label: 'Messaging / Inbox', metadata: { key: 'messaging', short_label: 'Inbox', sort_order: 15 } },
  ],
  ERP_SUB_PERMISSION: [
    // Sales
    { code: 'SALES__REOPEN', label: 'Re-open Posted Sales', metadata: { module: 'sales', key: 'reopen', sort_order: 1 } },
    { code: 'SALES__CREDIT_NOTES', label: 'Returns / Credit Notes', metadata: { module: 'sales', key: 'credit_notes', sort_order: 2 } },
    { code: 'SALES__OPENING_AR', label: 'Opening AR Entry (pre-go-live CSIs)', metadata: { module: 'sales', key: 'opening_ar', sort_order: 3 } },
    // Option B split (Apr 2026) — separate read-only sub-perm so subscribers can
    // keep the Opening AR Transactions history visible after revoking `opening_ar`
    // (which hides the Entry page) post-cutover. Frontend lazily falls back to
    // `opening_ar` if this new code is not yet seeded for the entity.
    { code: 'SALES__OPENING_AR_LIST', label: 'Opening AR Transactions (read-only history)', metadata: { module: 'sales', key: 'opening_ar_list', sort_order: 4 } },
    // Phase G4.5a — Proxy Entry (April 2026). Lets admin/finance/back-office contractor
    // record CSIs on behalf of another BDM. Eligible role set is lookup-driven via
    // PROXY_ENTRY_ROLES.SALES (default admin/finance/president). Tick this sub-perm to
    // surface the OwnerPicker on Sales Entry and widen read/update to all BDMs in the
    // entity. See backend/erp/utils/resolveOwnerScope.js + Phase G4.5a in PHASETASK-ERP.
    { code: 'SALES__PROXY_ENTRY', label: 'Record CSI on behalf of another BDM', metadata: { module: 'sales', key: 'proxy_entry', sort_order: 5 } },
    { code: 'SALES__OPENING_AR_PROXY', label: 'Record Opening AR on behalf of another BDM', metadata: { module: 'sales', key: 'opening_ar_proxy', sort_order: 6 } },
    // Messaging (Phase G9.R8 — Apr 2026)
    // Gates the admin Inbox Retention Settings page + the Run-Now / Preview
    // retention endpoints. Lookup-driven so subscribers can delegate storage
    // hygiene to a finance operator without widening erp_access.
    { code: 'MESSAGING__RETENTION_MANAGE', label: 'Manage inbox retention settings', metadata: { module: 'messaging', key: 'retention_manage', sort_order: 10 } },
    // Collections
    { code: 'COLLECTIONS__REOPEN', label: 'Re-open Posted Collections', metadata: { module: 'collections', key: 'reopen', sort_order: 1 } },
    // Phase G4.5b — Proxy Entry for Collections. Paired with PROXY_ENTRY_ROLES.COLLECTIONS
    // lookup (default admin/finance/president). Tick surfaces the OwnerPicker on the
    // Collection Session + widens read/update to all BDMs in the entity. See
    // backend/erp/utils/resolveOwnerScope.js + Phase G4.5b in PHASETASK-ERP.
    { code: 'COLLECTIONS__PROXY_ENTRY', label: 'Record Collection Receipt on behalf of another BDM', metadata: { module: 'collections', key: 'proxy_entry', sort_order: 2 } },
    // Expenses
    { code: 'EXPENSES__BATCH_UPLOAD', label: 'Batch OR Upload (OCR)', metadata: { module: 'expenses', key: 'batch_upload', sort_order: 1 } },
    { code: 'EXPENSES__REOPEN', label: 'Re-open Posted Expenses', metadata: { module: 'expenses', key: 'reopen', sort_order: 2 } },
    // Phase G4.5c.1 — Proxy Entry for single-entry Expenses (OR-based). Paired
    // with PROXY_ENTRY_ROLES.EXPENSES lookup (default admin/finance/president).
    // Tick surfaces OwnerPicker on Expenses Entry + widens list/update to all
    // BDMs in the entity. Batch OR Upload is a separate sub-perm above
    // (batch_upload) because it uses a different audit code path and the
    // president-only CALF override flow (calf_override on ExpenseEntry).
    { code: 'EXPENSES__PROXY_ENTRY', label: 'Record Expense on behalf of another BDM', metadata: { module: 'expenses', key: 'proxy_entry', sort_order: 3 } },
    // Phase G4.5e — Proxy Entry for Car Logbook (also covers per-fuel approval).
    // Paired with PROXY_ENTRY_ROLES.CAR_LOGBOOK + VALID_OWNER_ROLES.CAR_LOGBOOK
    // lookups. Separate sub-perm from single-entry Expenses because Car Logbook
    // has its own approval flow (per-cycle LOGBOOK-{period}-{cycle} in the Hub)
    // and per-fuel sub-approvals. Unblocks the BDMs→CRM-only policy by letting
    // office-based eBDMs (Judy / Jay Ann) file logbooks on behalf of field BDMs.
    // See backend/erp/utils/resolveOwnerScope.js + Phase G4.5e in PHASETASK-ERP.
    { code: 'EXPENSES__CAR_LOGBOOK_PROXY', label: 'Record Car Logbook on behalf of another BDM', metadata: { module: 'expenses', key: 'car_logbook_proxy', sort_order: 4 } },
    // Phase G4.5e — Proxy Entry for PRF/CALF. Lets eligible proxy roles create
    // and submit PRF (partner rebate) and CALF (company advance liquidation)
    // documents on behalf of a BDM. Paired with PROXY_ENTRY_ROLES.PRF_CALF +
    // VALID_OWNER_ROLES.PRF_CALF lookups. Separate from expenses.proxy_entry
    // because CALFs auto-cascade to link expenses/logbooks on post — subscribers
    // may want CALF-only delegation for Finance operators.
    { code: 'EXPENSES__PRF_CALF_PROXY', label: 'Record PRF/CALF on behalf of another BDM', metadata: { module: 'expenses', key: 'prf_calf_proxy', sort_order: 5 } },
    // Phase G4.5f (Apr 23, 2026) — Proxy Entry for SMER + Per-Diem Override.
    // Paired with PROXY_ENTRY_ROLES.SMER + VALID_OWNER_ROLES.SMER. Distinct
    // from EXPENSES__PROXY_ENTRY (single-entry expenses) because per-diem is
    // a different funding flow (advance liquidation vs OR reimbursement) and
    // subscribers may delegate one without the other. SMER proxy submits also
    // require a `bdm_phone_instruction` authorization tag enforced by the
    // controller. Closes the BDMs→CRM-only / eBDMs→ERP-proxy policy locked
    // Apr 23 2026 — last monthly touchpoint before BDMs can drop ERP.
    { code: 'EXPENSES__SMER_PROXY', label: 'Record SMER + per-diem override on behalf of another BDM', metadata: { module: 'expenses', key: 'smer_proxy', sort_order: 6 } },
    // Purchasing
    { code: 'PURCHASING__PO_CREATE', label: 'Create/Edit Purchase Orders', metadata: { module: 'purchasing', key: 'po_create', sort_order: 1 } },
    { code: 'PURCHASING__PO_APPROVE', label: 'Approve Purchase Orders', metadata: { module: 'purchasing', key: 'po_approve', sort_order: 2 } },
    { code: 'PURCHASING__VENDOR_MANAGE', label: 'Manage Vendors', metadata: { module: 'purchasing', key: 'vendor_manage', sort_order: 3 } },
    { code: 'PURCHASING__SUPPLIER_INVOICE', label: 'Supplier Invoices', metadata: { module: 'purchasing', key: 'supplier_invoice', sort_order: 4 } },
    { code: 'PURCHASING__AP_PAYMENT', label: 'AP Payments', metadata: { module: 'purchasing', key: 'ap_payment', sort_order: 5 } },
    { code: 'PURCHASING__PRODUCT_MANAGE', label: 'Add/Edit Products', metadata: { module: 'purchasing', key: 'product_manage', sort_order: 6 } },
    // Inventory
    { code: 'INVENTORY__CSI_BOOKLETS', label: 'CSI Booklets', metadata: { module: 'inventory', key: 'csi_booklets', sort_order: 1 } },
    { code: 'INVENTORY__OFFICE_SUPPLIES', label: 'Office Supplies', metadata: { module: 'inventory', key: 'office_supplies', sort_order: 2 } },
    { code: 'INVENTORY__COLLATERALS', label: 'Collaterals', metadata: { module: 'inventory', key: 'collaterals', sort_order: 3 } },
    { code: 'INVENTORY__TRANSFERS', label: 'Stock Transfers', metadata: { module: 'inventory', key: 'transfers', sort_order: 4 } },
    // Phase 3c — Inventory danger sub-permissions
    { code: 'INVENTORY__TRANSFER_PRICE_SET', label: 'Set/Bulk-Set Inter-Company Transfer Prices (DANGER)', metadata: { module: 'inventory', key: 'transfer_price_set', sort_order: 5 } },
    { code: 'INVENTORY__WAREHOUSE_MANAGE', label: 'Create/Edit Warehouses (DANGER)', metadata: { module: 'inventory', key: 'warehouse_manage', sort_order: 6 } },
    // Phase G4.5b — Proxy Entry for GRN. Paired with PROXY_ENTRY_ROLES.GRN lookup
    // (default admin/finance/president). Tick surfaces the OwnerPicker on GRN Entry
    // and widens read/update to all BDMs in the entity. Note the sub-perm sits under
    // the `inventory` module namespace (key 'grn_proxy_entry') because GRN does not
    // have its own ERP access module. See backend/erp/utils/resolveOwnerScope.js.
    { code: 'INVENTORY__GRN_PROXY_ENTRY', label: 'Record GRN on behalf of another BDM', metadata: { module: 'inventory', key: 'grn_proxy_entry', sort_order: 7 } },
    // Phase G4.5e — Proxy Entry for Undertaking. Undertaking's bdm_id is
    // inherited from its linked GRN (autoUndertakingForGrn), so the proxy
    // applies only to READ (list/detail) and SUBMIT (DRAFT→SUBMITTED). No
    // create path exists on the UT controller — UT creation rides on GRN
    // creation, whose proxy is already gated by inventory.grn_proxy_entry.
    // Paired with PROXY_ENTRY_ROLES.UNDERTAKING + VALID_OWNER_ROLES.UNDERTAKING.
    { code: 'INVENTORY__UNDERTAKING_PROXY', label: 'Submit Undertaking on behalf of another BDM', metadata: { module: 'inventory', key: 'undertaking_proxy', sort_order: 8 } },
    // Accounting
    { code: 'ACCOUNTING__JOURNAL_ENTRY', label: 'Journal Entries & COA', metadata: { module: 'accounting', key: 'journal_entry', sort_order: 1 } },
    { code: 'ACCOUNTING__CHECK_WRITING', label: 'Check Writing / Payments', metadata: { module: 'accounting', key: 'check_writing', sort_order: 2 } },
    { code: 'ACCOUNTING__MONTH_END', label: 'Month-End Close', metadata: { module: 'accounting', key: 'month_end', sort_order: 3 } },
    { code: 'ACCOUNTING__VAT_FILING', label: 'VAT/CWT Compliance', metadata: { module: 'accounting', key: 'vat_filing', sort_order: 4 } },
    { code: 'ACCOUNTING__FIXED_ASSETS', label: 'Fixed Assets & Depreciation', metadata: { module: 'accounting', key: 'fixed_assets', sort_order: 5 } },
    { code: 'ACCOUNTING__LOANS', label: 'Loan Management', metadata: { module: 'accounting', key: 'loans', sort_order: 6 } },
    { code: 'ACCOUNTING__OWNER_EQUITY', label: 'Owner Equity', metadata: { module: 'accounting', key: 'owner_equity', sort_order: 7 } },
    { code: 'ACCOUNTING__PETTY_CASH', label: 'Petty Cash', metadata: { module: 'accounting', key: 'petty_cash', sort_order: 8 } },
    // President-only reversal capability — delegable via Access Template (default: only President)
    // Grants the per-module "President Delete" button to reverse + delete POSTED/ERROR/DRAFT transactions
    // across every module (Sales, Collections, Expenses, Petty Cash, Journal, Transfers, GRN, etc.)
    // SAP Storno pattern: original stays in original period, reversal entries post to current period.
    { code: 'ACCOUNTING__REVERSE_POSTED', label: 'President Reverse — Delete & Reverse Posted Transactions (DANGER)', metadata: { module: 'accounting', key: 'reverse_posted', sort_order: 9 } },
    { code: 'ACCOUNTING__REVERSAL_CONSOLE', label: 'President Console — View Cross-Module Reversal History', metadata: { module: 'accounting', key: 'reversal_console', sort_order: 10 } },
    // Phase 3c — Accounting danger sub-permissions
    { code: 'ACCOUNTING__PERIOD_FORCE_UNLOCK', label: 'Force-Unlock Period / Open-Close Periods (DANGER)', metadata: { module: 'accounting', key: 'period_force_unlock', sort_order: 11 } },
    { code: 'ACCOUNTING__YEAR_END_CLOSE', label: 'Execute Year-End Close JE Cascade (DANGER)', metadata: { module: 'accounting', key: 'year_end_close', sort_order: 12 } },
    { code: 'ACCOUNTING__SETTINGS_WRITE', label: 'Write ERP Settings — COA_MAP, VAT, Module Config (DANGER)', metadata: { module: 'accounting', key: 'settings_write', sort_order: 13 } },
    { code: 'ACCOUNTING__APPROVE_DELETION', label: 'Approve Document Deletion Requests — legacy path (DANGER)', metadata: { module: 'accounting', key: 'approve_deletion', sort_order: 14 } },
    { code: 'ACCOUNTING__LOOKUP_DELETE', label: 'Delete Lookup Rows — bank accounts, payment modes, components (DANGER)', metadata: { module: 'accounting', key: 'lookup_delete', sort_order: 15 } },
    { code: 'ACCOUNTING__CARD_DELETE', label: 'Delete Credit Card Records (DANGER)', metadata: { module: 'accounting', key: 'card_delete', sort_order: 16 } },
    // ACCOUNTING__OFFICE_SUPPLIES moved → INVENTORY__OFFICE_SUPPLIES (sub-permission gated)
    // Banking
    { code: 'BANKING__BANK_ACCOUNTS', label: 'Bank Accounts', metadata: { module: 'banking', key: 'bank_accounts', sort_order: 1 } },
    { code: 'BANKING__BANK_RECON', label: 'Bank Reconciliation', metadata: { module: 'banking', key: 'bank_recon', sort_order: 2 } },
    { code: 'BANKING__STATEMENT_IMPORT', label: 'Statement Import', metadata: { module: 'banking', key: 'statement_import', sort_order: 3 } },
    { code: 'BANKING__CREDIT_CARD', label: 'Credit Card Ledger', metadata: { module: 'banking', key: 'credit_card', sort_order: 4 } },
    { code: 'BANKING__CASHFLOW', label: 'Cashflow Statement', metadata: { module: 'banking', key: 'cashflow', sort_order: 5 } },
    { code: 'BANKING__PAYMENTS', label: 'Payment Processing', metadata: { module: 'banking', key: 'payments', sort_order: 6 } },
    // Sales Goals
    { code: 'SALES_GOALS__PLAN_MANAGE', label: 'Create/Edit Plans & Targets', metadata: { module: 'sales_goals', key: 'plan_manage', sort_order: 1 } },
    { code: 'SALES_GOALS__KPI_COMPUTE', label: 'Trigger KPI Computation', metadata: { module: 'sales_goals', key: 'kpi_compute', sort_order: 2 } },
    { code: 'SALES_GOALS__ACTION_MANAGE_ALL', label: 'Create Actions for Any BDM', metadata: { module: 'sales_goals', key: 'action_manage_all', sort_order: 3 } },
    { code: 'SALES_GOALS__INCENTIVE_MANAGE', label: 'Manage Incentive Programs', metadata: { module: 'sales_goals', key: 'incentive_manage', sort_order: 4 } },
    { code: 'SALES_GOALS__MANUAL_KPI_ALL', label: 'Enter Manual KPIs for Any BDM', metadata: { module: 'sales_goals', key: 'manual_kpi_all', sort_order: 5 } },
    // Phase SG-Q2 W2 — IncentivePayout lifecycle sub-permissions.
    // Delegable via Access Template ticks so Finance can run the ledger without
    // blanket FULL access to Sales Goals. President always bypasses.
    { code: 'SALES_GOALS__PAYOUT_VIEW', label: 'View Incentive Payout Ledger', metadata: { module: 'sales_goals', key: 'payout_view', sort_order: 6 } },
    { code: 'SALES_GOALS__PAYOUT_APPROVE', label: 'Approve Incentive Payouts', metadata: { module: 'sales_goals', key: 'payout_approve', sort_order: 7 } },
    { code: 'SALES_GOALS__PAYOUT_PAY', label: 'Mark Incentive Payouts Paid (posts settlement JE)', metadata: { module: 'sales_goals', key: 'payout_pay', sort_order: 8 } },
    { code: 'SALES_GOALS__PAYOUT_REVERSE', label: 'Reverse Incentive Payout (posts reversal JE) (DANGER)', metadata: { module: 'sales_goals', key: 'payout_reverse', sort_order: 9 } },
    // Approvals
    { code: 'APPROVALS__RULE_MANAGE', label: 'Create/Edit Approval Rules', metadata: { module: 'approvals', key: 'rule_manage', sort_order: 1 } },
    // Phase 34 — Per-module approval sub-permissions
    { code: 'APPROVALS__APPROVE_SALES', label: 'Approve Sales / CSI / Credit Notes', metadata: { module: 'approvals', key: 'approve_sales', sort_order: 2 } },
    { code: 'APPROVALS__APPROVE_COLLECTIONS', label: 'Approve Collection Receipts', metadata: { module: 'approvals', key: 'approve_collections', sort_order: 3 } },
    { code: 'APPROVALS__APPROVE_INVENTORY', label: 'Approve GRN (Goods Receipt)', metadata: { module: 'approvals', key: 'approve_inventory', sort_order: 4 } },
    { code: 'APPROVALS__APPROVE_EXPENSES', label: 'Approve SMER / Car Logbook / Expenses / PRF-CALF', metadata: { module: 'approvals', key: 'approve_expenses', sort_order: 5 } },
    { code: 'APPROVALS__APPROVE_PURCHASING', label: 'Approve Supplier Invoices', metadata: { module: 'approvals', key: 'approve_purchasing', sort_order: 6 } },
    { code: 'APPROVALS__APPROVE_PAYROLL', label: 'Approve Payslips', metadata: { module: 'approvals', key: 'approve_payroll', sort_order: 7 } },
    { code: 'APPROVALS__APPROVE_JOURNAL', label: 'Approve Journal / Depreciation / Interest', metadata: { module: 'approvals', key: 'approve_journal', sort_order: 8 } },
    { code: 'APPROVALS__APPROVE_BANKING', label: 'Approve Bank Reconciliation', metadata: { module: 'approvals', key: 'approve_banking', sort_order: 9 } },
    { code: 'APPROVALS__APPROVE_PETTY_CASH', label: 'Approve Petty Cash', metadata: { module: 'approvals', key: 'approve_petty_cash', sort_order: 10 } },
    { code: 'APPROVALS__APPROVE_IC_TRANSFER', label: 'Approve IC Transfers / Settlements', metadata: { module: 'approvals', key: 'approve_ic_transfer', sort_order: 11 } },
    { code: 'APPROVALS__APPROVE_INCOME', label: 'Approve Income Reports', metadata: { module: 'approvals', key: 'approve_income', sort_order: 12 } },
    { code: 'APPROVALS__APPROVE_DEDUCTIONS', label: 'Approve Deduction Schedules', metadata: { module: 'approvals', key: 'approve_deductions', sort_order: 13 } },
    { code: 'APPROVALS__APPROVE_KPI', label: 'Approve KPI Ratings', metadata: { module: 'approvals', key: 'approve_kpi', sort_order: 14 } },
    { code: 'APPROVALS__APPROVE_PERDIEM', label: 'Approve Per Diem Overrides', metadata: { module: 'approvals', key: 'approve_perdiem', sort_order: 15 } },
    // Phase G4.3 — Incentive Dispute (SG-4 lifecycle: take review / resolve / close)
    { code: 'APPROVALS__APPROVE_INCENTIVE_DISPUTE', label: 'Approve Incentive Disputes', metadata: { module: 'approvals', key: 'approve_incentive_dispute', sort_order: 16 } },
    // Phase 3c — People danger sub-permissions (separate from PeopleMaster CRUD which inherits FULL)
    { code: 'PEOPLE__TERMINATE', label: 'Terminate / Separate / Deactivate Person (DANGER)', metadata: { module: 'people', key: 'terminate', sort_order: 1 } },
    { code: 'PEOPLE__MANAGE_LOGIN', label: 'Manage Login — Disable/Unlink/Change-Role/Bulk-Change-Role (DANGER)', metadata: { module: 'people', key: 'manage_login', sort_order: 2 } },
    // Phase 3c — Payroll danger sub-permission
    { code: 'PAYROLL__GOV_RATE_DELETE', label: 'Delete Government Tax/BIR Rate Row (DANGER)', metadata: { module: 'payroll', key: 'gov_rate_delete', sort_order: 1 } },
    { code: 'PAYROLL__INSURANCE_DELETE', label: 'Delete Insurance Policy (DANGER)', metadata: { module: 'payroll', key: 'insurance_delete', sort_order: 2 } },
    // Phase 3c — Master Data sub-permissions. All gated through the danger layer (baseline OR
    // ERP_DANGER_SUB_PERMISSIONS lookup) so module-FULL does NOT inherit them — explicit grant required.
    { code: 'MASTER__PRODUCT_DELETE', label: 'Hard-Delete Product Master Row (DANGER)', metadata: { module: 'master', key: 'product_delete', sort_order: 1 } },
    { code: 'MASTER__PRODUCT_DEACTIVATE', label: 'Deactivate Product Master Row (DANGER)', metadata: { module: 'master', key: 'product_deactivate', sort_order: 2 } },
    { code: 'MASTER__CUSTOMER_DEACTIVATE', label: 'Deactivate Customer Record (DANGER)', metadata: { module: 'master', key: 'customer_deactivate', sort_order: 3 } },
    { code: 'MASTER__HOSPITAL_DEACTIVATE', label: 'Deactivate Hospital Record (DANGER)', metadata: { module: 'master', key: 'hospital_deactivate', sort_order: 4 } },
    { code: 'MASTER__HOSPITAL_ALIAS_DELETE', label: 'Delete Hospital Alias (DANGER)', metadata: { module: 'master', key: 'hospital_alias_delete', sort_order: 5 } },
    { code: 'MASTER__TERRITORY_DELETE', label: 'Delete Territory Record (DANGER)', metadata: { module: 'master', key: 'territory_delete', sort_order: 6 } },
    // Phase 3c — ERP Access governance (delegating the delegator is intentionally NOT here —
    // user access GET/SET is still admin/president-only; only template-delete is delegable.)
    { code: 'ERP_ACCESS__TEMPLATE_DELETE', label: 'Delete ERP Access Template (DANGER)', metadata: { module: 'erp_access', key: 'template_delete', sort_order: 1 } },
    // Phase G9.R3 — Messaging / Inbox sub-permissions. President always bypasses.
    // Defaults (MODULE_DEFAULT_ROLES.MESSAGING) grant DM-any to admin/finance/president,
    // broadcast to admin/president, DM-direct-reports to contractor.
    { code: 'MESSAGING__DM_ANY_ROLE',       label: 'Direct-message any role',                              metadata: { module: 'messaging', key: 'dm_any_role',       sort_order: 1 } },
    { code: 'MESSAGING__DM_DIRECT_REPORTS', label: 'Direct-message your direct reports',                   metadata: { module: 'messaging', key: 'dm_direct_reports', sort_order: 2 } },
    { code: 'MESSAGING__BROADCAST',         label: 'Broadcast to a role group (no specific recipient)',    metadata: { module: 'messaging', key: 'broadcast',         sort_order: 3 } },
    { code: 'MESSAGING__CROSS_ENTITY',      label: 'Send messages across entities',                        metadata: { module: 'messaging', key: 'cross_entity',      sort_order: 4 } },
    { code: 'MESSAGING__IMPERSONATE_REPLY', label: 'Reply on behalf of another sender (admin tool)',       metadata: { module: 'messaging', key: 'impersonate_reply', sort_order: 5 } },
  ],
  // Phase 3a — Danger sub-permissions that require EXPLICIT grant.
  // Even users with module-level FULL access do NOT inherit these keys — the
  // Access Template must tick the specific sub-permission box. President always
  // bypasses. Subscribers can add their own danger keys here without code changes
  // (e.g., vendor_master.delete, user_master.demote_admin, integration.wipe).
  // The baseline floor is also enforced in code (services/dangerSubPermissions.js)
  // so deactivating these lookup rows does NOT weaken the baseline safety net.
  // Each entry's metadata.module + metadata.key must exactly match a key in
  // ERP_SUB_PERMISSION (or erp_access.sub_permissions[module]) to take effect.
  ERP_DANGER_SUB_PERMISSIONS: [
    // ── Baseline keys (also enforced in code; lookup row exposes them in editor) ──
    {
      code: 'ACCOUNTING__REVERSE_POSTED',
      label: 'President Reverse — Destructive ledger/inventory/fund rollback',
      metadata: { module: 'accounting', key: 'reverse_posted' },
    },
    // Phase 3c — Tier 1 baseline danger keys (mirrored in BASELINE_DANGER_SUB_PERMS)
    {
      code: 'ACCOUNTING__PERIOD_FORCE_UNLOCK',
      label: 'Force-unlock period — open/close any financial period',
      metadata: { module: 'accounting', key: 'period_force_unlock' },
    },
    {
      code: 'ACCOUNTING__YEAR_END_CLOSE',
      label: 'Execute year-end JE cascade (irreversible without manual reversal)',
      metadata: { module: 'accounting', key: 'year_end_close' },
    },
    {
      code: 'ACCOUNTING__SETTINGS_WRITE',
      label: 'Write ERP settings — COA_MAP, VAT, module config (cache-invalidating)',
      metadata: { module: 'accounting', key: 'settings_write' },
    },
    {
      code: 'PEOPLE__TERMINATE',
      label: 'Terminate / separate / deactivate person (cascading login disable)',
      metadata: { module: 'people', key: 'terminate' },
    },
    {
      code: 'PEOPLE__MANAGE_LOGIN',
      label: 'Manage login — disable / unlink / change / bulk-change system role',
      metadata: { module: 'people', key: 'manage_login' },
    },
    {
      code: 'ERP_ACCESS__TEMPLATE_DELETE',
      label: 'Delete ERP Access Template (orphans every user previously assigned)',
      metadata: { module: 'erp_access', key: 'template_delete' },
    },
    {
      code: 'PAYROLL__GOV_RATE_DELETE',
      label: 'Delete government tax/BIR rate row (impacts payroll computation)',
      metadata: { module: 'payroll', key: 'gov_rate_delete' },
    },
    {
      code: 'INVENTORY__TRANSFER_PRICE_SET',
      label: 'Set or bulk-set inter-company transfer prices (cross-entity P&L impact)',
      metadata: { module: 'inventory', key: 'transfer_price_set' },
    },
    // Phase 32 — President-reverse an Undertaking (cascades to storno-reverse the
    // linked GRN if APPROVED; negating InventoryLedger entries; depletion blocker).
    {
      code: 'INVENTORY__REVERSE_UNDERTAKING',
      label: 'President Reverse — Undertaking (cascades to GRN + InventoryLedger)',
      metadata: { module: 'inventory', key: 'reverse_undertaking' },
    },
    {
      code: 'MASTER__PRODUCT_DELETE',
      label: 'Hard-delete ProductMaster row (irreversible; breaks historical references)',
      metadata: { module: 'master', key: 'product_delete' },
    },
    // ── Tier 2 lookup-only danger keys (not in BASELINE; subscriber-removable) ──
    // These are visible in the editor and subscriber admins can deactivate the row to drop them
    // from the danger gate (an unusual choice, but it's their entity to govern).
    {
      code: 'PAYROLL__INSURANCE_DELETE',
      label: 'Delete insurance policy row (closes Phase 3a residual)',
      metadata: { module: 'payroll', key: 'insurance_delete' },
    },
    {
      code: 'ACCOUNTING__CARD_DELETE',
      label: 'Delete credit card record (audit-visible, may have linked txns)',
      metadata: { module: 'accounting', key: 'card_delete' },
    },
    {
      code: 'MASTER__CUSTOMER_DEACTIVATE',
      label: 'Deactivate customer record (downstream invoices/AR remain)',
      metadata: { module: 'master', key: 'customer_deactivate' },
    },
    {
      code: 'MASTER__HOSPITAL_DEACTIVATE',
      label: 'Deactivate hospital record (downstream visits/SMERs remain)',
      metadata: { module: 'master', key: 'hospital_deactivate' },
    },
    {
      code: 'MASTER__HOSPITAL_ALIAS_DELETE',
      label: 'Delete hospital alias (impacts OCR matching)',
      metadata: { module: 'master', key: 'hospital_alias_delete' },
    },
    {
      code: 'MASTER__PRODUCT_DEACTIVATE',
      label: 'Deactivate product master row (stock/price history retained)',
      metadata: { module: 'master', key: 'product_deactivate' },
    },
    {
      code: 'MASTER__TERRITORY_DELETE',
      label: 'Delete territory record (BDM/customer assignments orphaned)',
      metadata: { module: 'master', key: 'territory_delete' },
    },
    {
      code: 'ACCOUNTING__APPROVE_DELETION',
      label: 'Approve document deletion request (legacy; use President Reverse for full cleanup)',
      metadata: { module: 'accounting', key: 'approve_deletion' },
    },
    {
      code: 'ACCOUNTING__LOOKUP_DELETE',
      label: 'Delete lookup rows (bank accounts / payment modes / components / generic categories)',
      metadata: { module: 'accounting', key: 'lookup_delete' },
    },
    {
      code: 'INVENTORY__WAREHOUSE_MANAGE',
      label: 'Create/edit warehouse rows (impacts stock segregation)',
      metadata: { module: 'inventory', key: 'warehouse_manage' },
    },
    // Phase SG-Q2 W2 — reversing an IncentivePayout posts a SAP-Storno JE against
    // the original accrual. Subscriber-removable (Tier 2) so admins who want
    // unrestricted reversal can deactivate the row, but default = gated.
    {
      code: 'SALES_GOALS__PAYOUT_REVERSE',
      label: 'Reverse Sales Goal incentive payout (posts reversal JE)',
      metadata: { module: 'sales_goals', key: 'payout_reverse' },
    },
  ],
  // Phase 15.2 (softened) — CSI Void reasons (contractor marks a physical CSI as unused)
  // Lookup-driven so subscribers can add new reasons without code changes.
  ERP_CSI_VOID_REASONS: [
    { code: 'WRONG_ENTRY', label: 'Wrong Entry' },
    { code: 'CANCELLED', label: 'Cancelled Sale' },
    { code: 'TORN', label: 'Torn / Damaged' },
    { code: 'MISPRINT', label: 'Misprint' },
    { code: 'OTHER', label: 'Other' },
  ],
  // Phase 30 — Credit Note lookups (was hardcoded in CreditNotes.jsx)
  RETURN_REASON: [
    { code: 'DAMAGED', label: 'Damaged' },
    { code: 'EXPIRED', label: 'Expired' },
    { code: 'WRONG_ITEM', label: 'Wrong Item' },
    { code: 'EXCESS_STOCK', label: 'Excess Stock' },
    { code: 'QUALITY_ISSUE', label: 'Quality Issue' },
    { code: 'RECALL', label: 'Recall' },
    { code: 'OTHER', label: 'Other' },
  ],
  RETURN_CONDITION: [
    { code: 'RESALEABLE', label: 'Resaleable' },
    { code: 'DAMAGED', label: 'Damaged' },
    { code: 'EXPIRED', label: 'Expired' },
    { code: 'QUARANTINE', label: 'Quarantine' },
  ],
  // Phase C — New lookup categories (was hardcoded as Mongoose enum constraints)
  CYCLE: [
    { code: 'C1', label: 'Cycle 1' },
    { code: 'C2', label: 'Cycle 2' },
    { code: 'MONTHLY', label: 'Monthly' },
  ],
  BANK_ACCOUNT_TYPE: ['SAVINGS', 'CHECKING', 'CURRENT'],
  STATEMENT_IMPORT_FORMAT: ['CSV', 'OFX', 'MT940'],
  WAREHOUSE_TYPE: ['MAIN', 'TERRITORY', 'VIRTUAL'],
  OVERRIDE_REASON: ['HOSPITAL_POLICY', 'QA_REPLACEMENT', 'DAMAGED_BATCH', 'BATCH_RECALL'],
  PETTY_CASH_TXN_TYPE: ['DEPOSIT', 'DISBURSEMENT', 'REMITTANCE', 'REPLENISHMENT', 'ADJUSTMENT'],
  PETTY_CASH_FUND_TYPE: [
    { code: 'REVOLVING', label: 'Revolving (deposits + disbursements)' },
    { code: 'EXPENSE_ONLY', label: 'Expense Only (disbursements)' },
    { code: 'DEPOSIT_ONLY', label: 'Deposit Only (collections)' },
  ],
  PETTY_CASH_FUND_STATUS: [
    { code: 'ACTIVE', label: 'Active' },
    { code: 'SUSPENDED', label: 'Suspended' },
    { code: 'CLOSED', label: 'Closed' },
  ],
  REMITTANCE_TYPE: ['REMITTANCE', 'REPLENISHMENT'],
  PRF_DOC_TYPE: ['PRF', 'CALF'],
  PRF_TYPE: ['PARTNER_REBATE', 'PERSONAL_REIMBURSEMENT'],
  PAYEE_TYPE: ['MD', 'NON_MD', 'EMPLOYEE'],
  OWNER_EQUITY_TYPE: ['INFUSION', 'DRAWING'],
  CREDIT_LIMIT_ACTION: ['WARN', 'BLOCK'],
  PERDIEM_TIER: ['FULL', 'HALF', 'ZERO'],
  BUDGET_ALLOCATION_TYPE: ['BDM', 'DEPARTMENT', 'EMPLOYEE'],
  CONSIGNMENT_AGING_STATUS: ['OPEN', 'OVERDUE', 'COLLECTED', 'FORCE_CSI'],
  CONSIGNMENT_STATUS: ['ACTIVE', 'FULLY_CONSUMED', 'RETURNED', 'EXPIRED'],
  SALE_SOURCE: ['SALES_LINE', 'OPENING_AR'],
  ENTITY_STATUS: ['ACTIVE', 'INACTIVE'],
  VISIT_TYPE: ['regular', 'follow-up', 'emergency'],
  PHOTO_SOURCE: ['camera', 'gallery', 'clipboard'],
  PHOTO_FLAG: ['date_mismatch', 'duplicate_photo'],
  // Phase G4.5f (Apr 23, 2026) — added 'PERDIEM_SUMMARY' (proxy-posted SMER receipt)
  // and 'PERDIEM_OVERRIDE_DECISION' (Hub decision receipt for proxied per-diem
  // overrides). Both fire as best-effort, must_acknowledge=false courtesy
  // notifications routed by writeProxyReceipt() in expenseController +
  // universalApprovalController.perdiem_override.
  MESSAGE_CATEGORY: ['announcement', 'payroll', 'leave', 'policy', 'system', 'compliance_alert', 'other', 'ai_coaching', 'ai_schedule', 'ai_alert', 'PERDIEM_SUMMARY', 'PERDIEM_OVERRIDE_DECISION'],
  MESSAGE_PRIORITY: ['normal', 'important', 'high'],
  // Phase G9.R8 — Inbox retention (Apr 2026)
  // Lookup-driven per-entity retention settings consumed by
  // backend/erp/services/messageRetentionAgent.js. Seeded with sensible
  // defaults; admin edits via Control Center → Inbox Retention Settings.
  // Each row's `metadata.value` is the effective value (number/bool). The
  // retention agent lazy-seeds this category on first run if no rows exist
  // for the entity — so new subscribers inherit defaults automatically.
  INBOX_RETENTION: [
    { code: 'ENABLED', label: 'Retention agent enabled for this entity', metadata: { value: true } },
    { code: 'ARCHIVED_DAYS', label: 'Days to keep archived messages', metadata: { value: 90, unit: 'days', min: 7, max: 3650 } },
    { code: 'READ_DAYS', label: 'Days to keep read messages (non-approval folders)', metadata: { value: 180, unit: 'days', min: 30, max: 3650 } },
    { code: 'UNREAD_DAYS', label: 'Days to keep unread messages (safety net)', metadata: { value: 365, unit: 'days', min: 90, max: 3650 } },
    { code: 'AI_AGENT_DAYS', label: 'Days to keep acknowledged AI agent reports', metadata: { value: 30, unit: 'days', min: 7, max: 3650 } },
    { code: 'BROADCAST_DAYS', label: 'Days to keep broadcasts after read', metadata: { value: 60, unit: 'days', min: 7, max: 3650 } },
    { code: 'GRACE_PERIOD_DAYS', label: 'Soft-delete grace period before hard purge', metadata: { value: 7, unit: 'days', min: 1, max: 90 } },
  ],
  // Phase G9.R8 — Inbox acknowledgement defaults (Apr 2026)
  // Consumed by backend/erp/utils/inboxAckDefaults.js. Rules evaluated in
  // order; first match flips must_acknowledge=true on the new message.
  // Admin override at compose time always wins.
  INBOX_ACK_DEFAULTS: [
    { code: 'CATEGORY_AI_AGENT_REPORT', label: 'Require ack for AI agent reports', metadata: { value: true, folders: ['AI_AGENT_REPORTS'] } },
    { code: 'CATEGORY_BROADCAST', label: 'Require ack for broadcasts (recipientUserId=null)', metadata: { value: true, categories: ['announcement', 'policy', 'system'] } },
    { code: 'REQUIRES_ACTION', label: 'Require ack when requires_action is true', metadata: { value: true } },
    { code: 'BROADCAST_ROLES', label: 'Sender roles whose broadcasts need ack', metadata: { value: ['president', 'admin'] } },
  ],
  // Phase G9.R9 — Per-role hidden-folders matrix (Apr 2026)
  // Consumed by backend/erp/utils/inboxLookups.js → getHiddenFoldersForRole().
  // President's APPROVALS folder is duplicate of /erp/approvals (Approval Hub),
  // so it's hidden by default. Admin can extend per Control Center: e.g. add
  // a `ceo` row, hide TASKS for finance, etc. `metadata.hidden_folders` is the
  // authoritative array; missing/empty → role sees every folder.
  // insert_only_metadata: admin edits to hidden_folders are preserved across re-seeds.
  INBOX_HIDDEN_FOLDERS_BY_ROLE: [
    { code: 'president', label: 'President', insert_only_metadata: true, metadata: { hidden_folders: ['APPROVALS'], description: 'President uses Approval Hub (/erp/approvals); APPROVALS folder would duplicate.' } },
  ],
  // Name cleanup rules — used by backend/utils/nameCleanup.js
  NAME_PARTICLE: [
    { code: 'DE', label: 'de', metadata: { position: 'any' } },
    { code: 'DEL', label: 'del', metadata: { position: 'any' } },
    { code: 'DELA', label: 'dela', metadata: { position: 'any' } },
    { code: 'DELOS', label: 'delos', metadata: { position: 'any' } },
    { code: 'NG', label: 'ng', metadata: { position: 'any' } },
    { code: 'LA', label: 'la', metadata: { after: 'DE' } },
    { code: 'LOS', label: 'los', metadata: { after: 'DE' } },
    { code: 'LAS', label: 'las', metadata: { after: 'DE' } },
  ],
  NAME_SUFFIX: [
    { code: 'JR', label: 'Jr.', metadata: {} },
    { code: 'SR', label: 'Sr.', metadata: {} },
    { code: 'II', label: 'II', metadata: {} },
    { code: 'III', label: 'III', metadata: {} },
    { code: 'IV', label: 'IV', metadata: {} },
    { code: 'V', label: 'V', metadata: {} },
  ],
  NAME_PREFIX: [
    { code: 'MC', label: 'Mc', metadata: { min_length: 3 } },
    { code: 'MAC', label: 'Mac', metadata: { min_length: 4 } },
    { code: 'O_APOSTROPHE', label: "O'", metadata: { min_length: 3 } },
  ],
  // Phase E — BDM Income Deduction Types (lookup-driven, admin-scalable)
  INCOME_DEDUCTION_TYPE: [
    { code: 'CASH_ADVANCE', label: 'Cash Advance', metadata: { auto_source: 'CALF', sort: 1 } },
    { code: 'CC_PERSONAL', label: 'Credit Card (Personal Use)', metadata: { sort: 2 } },
    { code: 'CREDIT_PAYMENT', label: 'Credit Payment', metadata: { sort: 3 } },
    { code: 'PURCHASED_GOODS', label: 'Purchased Goods', metadata: { sort: 4 } },
    { code: 'LOAN_REPAYMENT', label: 'Loan Repayment', metadata: { sort: 5 } },
    { code: 'UNIFORM', label: 'Uniform Deduction', metadata: { sort: 6 } },
    { code: 'OVERPAYMENT', label: 'Over Payment', metadata: { sort: 7 } },
    { code: 'PERSONAL_GAS', label: 'Personal Gas Usage', metadata: { auto_source: 'PERSONAL_GAS', sort: 8 } },
    { code: 'OTHER', label: 'Other Deduction', metadata: { sort: 9 } },
  ],
  // Phase G1.3 — Employee Payslip deduction types. Kept separate from
  // INCOME_DEDUCTION_TYPE because employees carry statutory deductions (SSS,
  // PhilHealth, PagIBIG, Withholding Tax) that contractors do not, and
  // contractors carry CALF / credit-card / purchased-goods that employees do
  // not. Subscribers can extend each list independently via Control Center.
  EMPLOYEE_DEDUCTION_TYPE: [
    { code: 'SSS', label: 'SSS (Employee Share)', metadata: { auto_source: 'SSS', sort: 1 } },
    { code: 'PHILHEALTH', label: 'PhilHealth (Employee Share)', metadata: { auto_source: 'PHILHEALTH', sort: 2 } },
    { code: 'PAGIBIG', label: 'Pag-IBIG (Employee Share)', metadata: { auto_source: 'PAGIBIG', sort: 3 } },
    { code: 'WITHHOLDING_TAX', label: 'Withholding Tax', metadata: { auto_source: 'WITHHOLDING_TAX', sort: 4 } },
    { code: 'CASH_ADVANCE', label: 'Cash Advance', metadata: { sort: 5 } },
    { code: 'LOAN', label: 'Loan Payment', metadata: { sort: 6 } },
    { code: 'PERSONAL_GAS', label: 'Personal Gas Usage', metadata: { auto_source: 'PERSONAL_GAS', sort: 7 } },
    { code: 'OTHER', label: 'Other Deduction', metadata: { sort: 8 } },
  ],
  DEDUCTION_LINE_STATUS: ['PENDING', 'VERIFIED', 'CORRECTED', 'REJECTED'],
  DEDUCTION_SCHEDULE_STATUS: ['PENDING_APPROVAL', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REJECTED'],
  // Phase F — Universal Approval Hub action labels (lookup-driven)
  UNIVERSAL_APPROVAL_ACTION: [
    { code: 'REVIEW', label: 'Review', metadata: { color: '#2563eb' } },
    { code: 'APPROVE', label: 'Approve', metadata: { color: '#16a34a' } },
    { code: 'CREDIT', label: 'Credit', metadata: { color: '#047857' } },
    { code: 'REJECT', label: 'Reject', metadata: { color: '#dc2626' } },
  ],
  // Phase F.1 — Universal Approval Hub default roles (replaces hardcoded allowed_roles in universalApprovalService)
  // Admin can change who sees which posting/approval modules in the Approval Hub before ApprovalRules are configured.
  // metadata.roles = null means open (anyone can see). metadata.roles = [...] restricts by role.
  MODULE_DEFAULT_ROLES: [
    { code: 'APPROVAL_REQUEST', label: 'Authority Matrix', metadata: { roles: null, description: 'Open to all — visibility governed by ApprovalRule resolution' } },
    { code: 'DEDUCTION_SCHEDULE', label: 'Deduction Schedules', metadata: { roles: ['admin', 'finance', 'president'], description: 'Approve recurring/one-time BDM deductions' } },
    { code: 'INCOME', label: 'Income Reports', metadata: { roles: ['admin', 'finance', 'president'], description: 'Review and credit BDM income/payslips' } },
    { code: 'INVENTORY', label: 'GRN (Goods Receipt)', metadata: { roles: ['admin', 'finance'], description: 'Approve goods receipt notes' } },
    { code: 'PAYROLL', label: 'Payslips', metadata: { roles: ['admin', 'finance', 'president'], description: 'Review and approve employee payslips' } },
    { code: 'KPI', label: 'KPI Ratings', metadata: { roles: ['admin', 'president'], description: 'Review and approve KPI self-ratings' } },
    { code: 'SALES', label: 'Sales / CSI', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated sales invoices' } },
    // Opening AR is pre-cutover historical receivables — higher fraud risk than
    // regular sales (fabricated balances, self-assigned commissions). Kept as a
    // separate module key so subscribers can open-post regular SALES while
    // keeping Opening AR gated. Setting metadata.roles = null opens it up.
    { code: 'OPENING_AR', label: 'Opening AR (Pre-Cutover)', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post pre-cutover historical CSI entries (Opening AR). Kept separate from regular SALES gate so subscribers can tighten or loosen each independently.' } },
    { code: 'COLLECTION', label: 'Collections / CR', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated collection receipts' } },
    { code: 'SMER', label: 'SMER', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated travel/expense reimbursements' } },
    { code: 'CAR_LOGBOOK', label: 'Car Logbook', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated car logbook cycle (period+cycle wrapper over per-day docs)' } },
    // Phase 33 — per-fuel-entry approval default roles. Subscribers can tighten or
    // set null for open-post (any BDM can auto-approve their own fuel receipts).
    { code: 'FUEL_ENTRY', label: 'Fuel Entry (per-receipt)', metadata: { roles: ['admin', 'finance', 'president'], description: 'Approve individual fuel receipts (non-CASH) before cycle submit' } },
    // Phase 31R follow-up — CreditNote posting authority. Subscribers can set
    // metadata.roles = null for open-post (any BDM can post returns without approval).
    { code: 'CREDIT_NOTE', label: 'Credit Notes / Returns', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post product returns / sales-returns credit notes' } },
    // Phase 32 — Undertaking acknowledgement. Authorized roles can acknowledge directly
    // (which auto-approves the linked GRN). Non-authorized submitters route to the
    // Approval Hub. BDM is included by default because receipt confirmation is a
    // BDM-first workflow; subscribers can tighten by removing 'bdm' from roles.
    { code: 'UNDERTAKING', label: 'Undertaking (Receipt Confirmation)', metadata: { roles: ['admin', 'finance', 'staff', 'president'], description: 'Acknowledge goods receipt. Acknowledge auto-approves the linked GRN and writes InventoryLedger. `staff` here means the BDM who receives the stock (Phase S2 renamed contractor/bdm → staff).' } },
    { code: 'EXPENSES', label: 'Expenses (ORE/ACCESS)', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated expense entries' } },
    { code: 'PRF_CALF', label: 'PRF / CALF', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated PRF/CALF documents' } },
    { code: 'PERDIEM_OVERRIDE', label: 'Per Diem Override', metadata: { roles: ['admin', 'finance', 'president'], description: 'Approve BDM per diem override requests' } },
    // Phase G4 — Default-Roles Gate coverage for remaining wired controllers (gateApproval).
    // Without these entries the default-roles gate is a no-op for the module.
    // Subscribers may set metadata.roles = null to disable gating per module (open-post).
    { code: 'JOURNAL', label: 'Journal Entries', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated journal entries (manual JE, depreciation, interest)' } },
    { code: 'BANKING', label: 'Banking', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post bank reconciliations and deposits' } },
    { code: 'PETTY_CASH', label: 'Petty Cash', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post petty cash transactions' } },
    { code: 'IC_TRANSFER', label: 'Inter-Company Transfer', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post inter-company transfers and settlements' } },
    { code: 'PURCHASING', label: 'Purchasing', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post supplier invoices' } },
    // Phase SG-Q2 — Default-Roles Gate for Sales Goal plan lifecycle.
    // "Any person can CREATE a plan (DRAFT), but authority ACTIVATES/CLOSES/REOPENS."
    // Non-authorized submitters are held in the Approval Hub (HTTP 202).
    // Subscribers: set metadata.roles = null to open-post this module (anyone can activate).
    { code: 'SALES_GOAL_PLAN', label: 'Sales Goal Plan', metadata: { roles: ['president', 'finance'], description: 'Activate/close/reopen annual sales plans; run KPI snapshots; bulk-create targets' } },
    // Phase SG-Q2 W2 — Default-Roles Gate for IncentivePayout lifecycle.
    // "Any authorized snapshot-run may ACCRUE, but only authority APPROVES/PAYS/REVERSES."
    // Accrual is automatic inside computeBdmSnapshot (no gate — it's the system writing).
    // Approve/Pay/Reverse route through gateApproval — default president/finance only.
    // Subscribers: set metadata.roles = null for open-post (anyone with payout_process can pay).
    { code: 'INCENTIVE_PAYOUT', label: 'Incentive Payouts', metadata: { roles: ['president', 'finance'], description: 'Approve, pay, and reverse Sales Goal incentive payouts (Accrued → Approved → Paid → Reversed)' } },
    // Phase SG-4 #24 — Incentive dispute workflow gate. BDMs can FILE (no
    // gate, just an authenticated request); take-review / resolve / close go
    // through gateApproval. Default roles cover finance + president; admin
    // gets it via Access Templates. Subscribers can null this to let any
    // qualified user resolve disputes (e.g. a People Ops manager).
    { code: 'INCENTIVE_DISPUTE', label: 'Incentive Disputes', metadata: { roles: ['president', 'finance', 'admin'], description: 'Take review on filed disputes, resolve them (approved or denied), and close. Filing itself requires no gate.' } },
    // Phase G9.R3 — Default-Roles fallback for Messaging module sub-permissions.
    // Used when a user has no Access Template grant for `messaging.*` sub-perms;
    // the inbox controller checks whether req.user.role ∈ metadata.roles before
    // allowing DM/broadcast. Set metadata.roles = null to open-message
    // (anyone can DM anyone). Combine with MESSAGE_ACCESS_ROLES lookup for
    // per-role can_dm_roles / can_broadcast / can_cross_entity rules.
    { code: 'MESSAGING', label: 'Messaging / Inbox', metadata: { roles: ['president', 'ceo', 'admin', 'finance', 'staff'], description: 'Allow this role to use the unified Inbox. Per-role DM matrix lives in MESSAGE_ACCESS_ROLES; sub-perm grants in ERP_SUB_PERMISSION (messaging.*).' } },
  ],
  // Phase 32R (Apr 2026) — GRN capture thresholds. Per-entity configurable via
  // Control Center → Lookup Tables → GRN_SETTINGS. The service reads
  // metadata.value (numeric) and falls back to defaults baked into
  // undertakingService.js on miss. Legacy UNDERTAKING_SETTINGS rows are still
  // consulted by getGrnSetting for back-compat with Phase 32 (Apr 20, 2026)
  // deploys that have not been renamed yet.
  //
  // Subscribers tune these without code changes:
  //   - MIN_EXPIRY_DAYS: reject GRN create if any line's expiry is within N days.
  //     Tightens the near-expiry guard for pharmacies with strict shelf policies.
  //   - VARIANCE_TOLERANCE_PCT: flag a line as QTY_UNDER/QTY_OVER when received
  //     qty differs from expected by more than this percentage (advisory — surfaces
  //     in the Approval Hub for approver review).
  //   - WAYBILL_REQUIRED: gate GRN creation on the waybill photo being attached
  //     (default on). Set to 0 to allow waybill-free receipts (e.g. intra-entity
  //     internal transfers that don't use couriers).
  GRN_SETTINGS: [
    { code: 'MIN_EXPIRY_DAYS', label: 'Minimum Expiry Floor (days)', metadata: { value: 30, description: 'Expiry must be at least this many days in the future. GRN capture is blocked otherwise.' } },
    { code: 'VARIANCE_TOLERANCE_PCT', label: 'Qty Variance Tolerance (%)', metadata: { value: 10, description: 'Variance above this percent (received vs expected qty) flags the line yellow in the Approval Hub.' } },
    { code: 'WAYBILL_REQUIRED', label: 'Require Waybill Upload', metadata: { value: 1, description: 'Set to 1 to require a waybill photo on every GRN; set to 0 to make it optional.' } },
    // Phase 32R-S1 — subscription scalability. Default 1 preserves pharmacy behavior;
    // non-pharmacy subscribers (services, electronics, industrial supplies) flip to 0.
    // Backend normalizes blanks to safe sentinels (batch='N/A', expiry=9999-12-31) so
    // FIFO grouping + $gt-new-Date() match + Undertaking mirror all stay intact.
    { code: 'REQUIRE_BATCH', label: 'Require Batch/Lot # on GRN Lines', metadata: { value: 1, description: 'Set to 1 (default) for pharmacy/FDA tracking. Set to 0 for verticals where batch tracking is not needed. When 0, blank batches are stored as "N/A" to preserve FIFO grouping.' } },
    { code: 'REQUIRE_EXPIRY', label: 'Require Expiry Date on GRN Lines', metadata: { value: 1, description: 'Set to 1 (default) for pharmacy. Set to 0 for non-perishable inventory. When 0, blank expiries are stored as 9999-12-31 so FIFO still sorts real-expiry stock first. MIN_EXPIRY_DAYS floor still applies when the user voluntarily enters an expiry.' } },
  ],
  // Per-entity Sales Entry / Opening AR thresholds. Read by `getSalesSetting`
  // in salesController.js; subscribers tune via Control Center → Lookup Tables
  // without a code change.
  //
  // Why two codes instead of one: the signed CSI is captured at different
  // times for live Sales vs Opening AR, so the enforcement points differ.
  //
  //   - REQUIRE_CSI_PHOTO_OPENING_AR (default 1): gate Validate for historical
  //     OPENING_AR rows. Any proof is accepted (csi_photo_url OR
  //     csi_received_photo_url) — signed CSI already exists at entry time.
  //
  //   - REQUIRE_CSI_PHOTO_SALES_LINE (default 0): reserved. Live Sales have
  //     NO gate today — the signed CSI arrives post-delivery and is attached
  //     via PUT /sales/:id/received-csi on SalesList. Flipping to 1 is a
  //     future Submit-gate hook if a subscriber wants to block posting until
  //     delivery proof is attached (non-default; inverts the normal calendar).
  SALES_SETTINGS: [
    { code: 'REQUIRE_CSI_PHOTO_OPENING_AR', label: 'Require CSI Photo on Opening AR Validate', metadata: { value: 1, description: 'Set to 1 (default) to block Validate for Opening AR (historical) rows with no photo attached. Either the OCR-source image (csi_photo_url) OR the received-CSI (csi_received_photo_url) is accepted. Set to 0 to allow Opening AR entries with no photo.' } },
    { code: 'REQUIRE_CSI_PHOTO_SALES_LINE', label: 'Require Received CSI Photo on Live Sales Submit (reserved)', metadata: { value: 0, description: 'Set to 1 to block Submit on live Sales rows until the signed received-CSI photo is attached. Default 0 — live Sales typically post at invoice issuance and the signed copy arrives post-delivery. Flip on only if your workflow waits for delivery confirmation before posting.' } },
  ],
  // Phase SG-Q2 — Period lock modules. UI (Period Locks page) reads this to render
  // toggle rows per module. Each code becomes a lockable unit. Subscribers can add
  // their own modules via Control Center → Lookup Tables (no code change).
  // The actual lock state lives in MonthlyArchive; this lookup is the module registry.
  PERIOD_LOCK_MODULES: [
    { code: 'SALES', label: 'Sales (CSI)', metadata: { description: 'Posting new sales in a closed period' } },
    { code: 'COLLECTION', label: 'Collections (CR)', metadata: { description: 'Posting new collections in a closed period' } },
    { code: 'EXPENSE', label: 'Expenses', metadata: { description: 'Posting new expenses in a closed period' } },
    { code: 'INCOME', label: 'Income Reports / Payslips', metadata: { description: 'Income reports + payslip posting' } },
    { code: 'PAYROLL', label: 'Payroll', metadata: { description: 'Payroll journal entries' } },
    { code: 'INVENTORY', label: 'Inventory / GRN', metadata: { description: 'GRN, transfers, adjustments' } },
    { code: 'IC_TRANSFER', label: 'Inter-Company Transfers', metadata: { description: 'ICT/ICS documents' } },
    { code: 'PETTY_CASH', label: 'Petty Cash', metadata: { description: 'PCV + replenishments' } },
    { code: 'JOURNAL', label: 'Journal Entries', metadata: { description: 'Manual JEs + depreciation' } },
    { code: 'SALES_GOAL', label: 'Sales Goal Snapshots', metadata: { description: 'KPI snapshot compute per period (plan lifecycle itself is annual, not period-locked)' } },
    { code: 'INCENTIVE_PAYOUT', label: 'Incentive Payouts', metadata: { description: 'Accrue/Approve/Pay/Reverse — period derived from payout.period for accrual, current date for settlement' } },
  ],
  // Phase SG-Q2 — Sales Goal auto-enrollment role registry (subscription-ready).
  // On plan activation, the system enumerates PeopleMaster where `person_type ∈ codes`
  // AND `is_active = true` AND `entity_id = plan.entity_id`, then upserts BDM targets
  // using GOAL_CONFIG.DEFAULT_TARGET_REVENUE / DEFAULT_COLLECTION_TARGET_PCT.
  // Default (seeded): only BDM. Subscribers add ECOMMERCE_BDM, SALES_MANAGER,
  // TERRITORY_MANAGER, etc. via Control Center → Lookup Tables — zero code change
  // required. Codes MUST exactly match PERSON_TYPE lookup codes.
  SALES_GOAL_ELIGIBLE_ROLES: [
    { code: 'BDM', label: 'BDM (Business Development Manager)', metadata: { description: 'Primary field sales role. Seeded as default enrollment target.' } },
  ],

  // Phase SG-6 #31 — Mid-period target revision feature toggle.
  // DISABLED by default: the canonical adjustment path is "reopen plan → edit
  // target → reactivate". Enabling this lookup row opens the POST
  // /sales-goal-targets/:id/revise endpoint, which appends a TargetRevision
  // sub-doc and preserves historical snapshot accuracy. Gated by
  // gateApproval(module='SALES_GOAL_PLAN', docType='TARGET_REVISION') when on.
  MID_PERIOD_REVISION_ENABLED: [
    {
      code: 'DEFAULT',
      label: 'Enable Mid-Period Target Revision',
      metadata: {
        enabled: false,
        value: false,
        description:
          'When enabled, admins can adjust individual SalesGoalTarget rows ' +
          'mid-period without reopening the whole plan. Revisions are logged ' +
          'as TargetRevision sub-docs; historical snapshots remain immutable. ' +
          'Disabled by default — flip to true to opt in.',
      },
    },
  ],

  // Phase SG-6 #32 — Integration event registry. Other ERP modules
  // (payroll, accounting close, HR, future integrations) subscribe to these
  // events via integrationHooks.on(); Sales Goal never imports consumers.
  // Admins see this registry in the SOX Control Matrix to confirm which
  // events are wired + how many listeners each has.
  INTEGRATION_EVENTS: [
    { code: 'plan.activated',    label: 'Sales Goal Plan Activated',    metadata: { description: 'Plan transitioned to ACTIVE. Payload: plan_id, plan_name, fiscal_year, enrolled_count, target_revenue.' } },
    { code: 'plan.closed',       label: 'Sales Goal Plan Closed',       metadata: { description: 'Plan transitioned to CLOSED. Payload: plan_id, plan_name, fiscal_year.' } },
    { code: 'plan.reopened',     label: 'Sales Goal Plan Reopened',     metadata: { description: 'Plan transitioned back to DRAFT. Payload: plan_id, plan_name, fiscal_year.' } },
    { code: 'plan.versioned',    label: 'Plan New Version Created',     metadata: { description: 'SG-4 #21 — v(N+1) of logical IncentivePlan header minted. Payload: basis_plan_id, new_plan_id, version_no.' } },
    { code: 'payout.accrued',    label: 'Incentive Payout Accrued',     metadata: { description: 'Tier qualification posted DR Incentive Expense / CR Incentive Accrual. Payload: plan_id, bdm_id, period, tier_code, tier_budget, journal_number.' } },
    { code: 'payout.approved',   label: 'Incentive Payout Approved',    metadata: { description: 'Authority confirmed accrued amount. Payload: bdm_id, period, tier_code, tier_budget.' } },
    { code: 'payout.paid',       label: 'Incentive Payout Paid',        metadata: { description: 'Settlement JE posted DR Incentive Accrual / CR funding COA. Payload: bdm_id, period, tier_code, tier_budget, paid_via, settlement_je.' } },
    { code: 'payout.reversed',   label: 'Incentive Payout Reversed',    metadata: { description: 'SAP-Storno reversal posted on accrual. Payload: bdm_id, period, tier_code, tier_budget, reason, reversal_je.' } },
    { code: 'dispute.filed',     label: 'Incentive Dispute Filed',      metadata: { description: 'BDM filed against payout or credit. Payload: reference_model, reference_id, claim_amount.' } },
    { code: 'dispute.resolved',  label: 'Incentive Dispute Resolved',   metadata: { description: 'Reviewer approved or denied dispute. Payload: state, outcome, reference_model, reference_id, claim_amount.' } },
    { code: 'target.revised',    label: 'Target Mid-Period Revised',    metadata: { description: 'SG-6 #31 — TargetRevision sub-doc appended. Payload: plan_id, target_type, target_label, prior_sales_target, new_sales_target.' } },
    { code: 'person.auto_enrolled',     label: 'Person Auto-Enrolled (SG-6 #30)',        metadata: { description: 'PeopleMaster lifecycle hook created a BDM target. Payload: plan_id, person_name, role.' } },
    { code: 'person.lifecycle_closed',  label: 'Person Lifecycle Closed (SG-6 #30)',     metadata: { description: 'PeopleMaster deactivated or left eligible role. Payload: plan_id, person_name, policy, open_payouts_affected, prior_role, new_role.' } },
  ],

  // Phase SG-4 #22 — Credit rule presets. Each row is a starter template that
  // appears in the CreditRuleManager dropdown so admins don't have to invent
  // common rule shapes from scratch. Subscribers add their own rows freely.
  // Metadata schema (rendered into a CreditRule on "Use template"):
  //   priority: number — execution order (lower = earlier)
  //   conditions: { territory_codes?, product_codes?, customer_codes?, hospital_codes? }
  //   credit_pct: number (0-100)  — share of the sale that goes to the matched BDM
  //   description: string
  CREDIT_RULE_TEMPLATES: [
    {
      code: 'TERRITORY_PRIMARY',
      label: 'Territory Primary BDM (100%)',
      metadata: {
        priority: 100,
        conditions: { territory_codes: [], product_codes: [], customer_codes: [], hospital_codes: [] },
        credit_pct: 100,
        description: 'Default — full credit goes to the BDM whose territory the sale belongs to.',
      },
    },
    {
      code: 'PRODUCT_SPLIT',
      label: 'Product specialist split (70/30)',
      metadata: {
        priority: 50,
        conditions: { product_codes: [] },
        credit_pct: 70,
        description: '70% to the BDM credited on the sale, 30% reserved for a product specialist (configure a sibling rule with the specialist BDM and the same product list).',
      },
    },
    {
      code: 'KEY_ACCOUNT_OVERRIDE',
      label: 'Key account override (100% to account owner)',
      metadata: {
        priority: 25,
        conditions: { customer_codes: [], hospital_codes: [] },
        credit_pct: 100,
        description: 'Full credit goes to the named account owner regardless of territory. Use for strategic hospital relationships.',
      },
    },
  ],

  // Phase SG-4 #23 ext — Compensation statement template overrides per entity.
  // Already used by incentivePayoutController.printCompensationStatement —
  // SG-4 promotes the schema to a stable lookup so admins can edit brand
  // chrome from Control Center without touching code or templates.
  // Code = field name in the rendered HTML; metadata.value = override.
  // (Pre-existing rows from SG-Q2 W3 follow-ups continue to work — this is a
  // documented re-seed of defaults for new subsidiaries.)
  COMP_STATEMENT_TEMPLATE: [
    { code: 'HEADER_TITLE',    label: 'Compensation Statement', metadata: { value: 'Compensation Statement' } },
    { code: 'HEADER_SUBTITLE', label: 'Earned commission breakdown', metadata: { value: 'Earned commission breakdown for the period' } },
    { code: 'DISCLAIMER',      label: 'Disclaimer', metadata: { value: 'This statement reflects the system-of-record snapshot as of the issue date. Disputes must be raised in writing within 30 days via the Dispute Center.' } },
    { code: 'SIGNATORY_LINE',  label: 'Signatory line', metadata: { value: 'Authorized by Finance' } },
    { code: 'SIGNATORY_TITLE', label: 'Signatory title', metadata: { value: 'Compensation & Benefits Lead' } },
    { code: 'EMAIL_ON_PERIOD_CLOSE', label: 'Auto-email statement when period closes', metadata: { value: 'true', enabled: true, description: 'When true, finalized statements are emailed to BDMs on the period-close trigger.' } },
  ],

  // Phase SG-5 #27 — Cooldown window (days) before the same
  // (plan, bdm, kpi, severity) breach is allowed to re-fire. Prevents
  // kpiVarianceAgent spamming persistent low performers every run. A single
  // GLOBAL row is enough; admins may add per-severity rows (WARNING / CRITICAL)
  // if they want tighter cadence on criticals. Zero (0) disables dedup for
  // that severity — every breach fires.
  VARIANCE_ALERT_COOLDOWN_DAYS: [
    { code: 'GLOBAL', label: 'Default cooldown for all KPIs + severities', metadata: { days: 7, description: 'Skip re-firing the same breach within this many days.' } },
  ],

  // Phase SG-5 #27 — Digest aggregation window (days) for the weekly digest
  // agent (#VD). One GLOBAL row per entity — admins tighten (e.g. daily) or
  // loosen (bi-weekly) as needed. The cron runs Monday 07:00 Manila; changing
  // this value does not change the cron, only what date range is pulled on
  // each run.
  VARIANCE_ALERT_DIGEST_WINDOW_DAYS: [
    { code: 'GLOBAL', label: 'Rolling window for weekly variance digest', metadata: { days: 7, description: 'kpiVarianceDigestAgent pulls alerts fired in this window.' } },
  ],

  // Phase SG-4 #24 — Dispute SLA per stage (days). Drives auto-escalation
  // in disputeSlaAgent. Per-entity overrides supported. When no row exists
  // for a stage, the agent uses 7 days as the floor.
  DISPUTE_SLA_DAYS: [
    { code: 'OPEN',          label: 'Open (BDM filed, awaiting reviewer pickup)', metadata: { sla_days: 3, escalate_to_role: 'finance', description: 'Reviewer must take ownership within N days or escalate to finance.' } },
    { code: 'UNDER_REVIEW',  label: 'Under review (reviewer working it)',          metadata: { sla_days: 7, escalate_to_role: 'president', description: 'Reviewer must resolve or kick to president within N days.' } },
    { code: 'RESOLVED_APPROVED', label: 'Approved (awaiting finance posting)',    metadata: { sla_days: 5, escalate_to_role: 'finance', description: 'Finance must post the corrective journal within N days.' } },
    { code: 'RESOLVED_DENIED',   label: 'Denied (awaiting BDM acknowledgement)',  metadata: { sla_days: 14, escalate_to_role: 'president', description: 'BDM may appeal within N days; otherwise auto-closed.' } },
  ],

  // Phase SG-4 #24 — Dispute typology. Drives the "Reason" dropdown in
  // DisputeCenter and informs which artifact (payout / credit) the dispute
  // attaches to. Subscribers can add types without code change.
  INCENTIVE_DISPUTE_TYPE: [
    { code: 'WRONG_TIER',       label: 'Wrong tier qualified', metadata: { artifact: 'payout', description: 'BDM believes they qualified for a higher tier than was credited.' } },
    { code: 'MISSING_CREDIT',   label: 'Missing sales credit', metadata: { artifact: 'credit', description: 'BDM believes a sale was credited to the wrong person or not credited at all.' } },
    { code: 'CAP_DISPUTE',      label: 'CompProfile cap dispute', metadata: { artifact: 'payout', description: 'Cap reduced the payout; BDM believes the cap was applied incorrectly.' } },
    { code: 'PERIOD_MISMATCH',  label: 'Period mismatch', metadata: { artifact: 'payout', description: 'Sale was attributed to the wrong period.' } },
    { code: 'OTHER',            label: 'Other (free-text)',  metadata: { artifact: 'payout', description: 'Catch-all for issues that don\'t fit the standard types.' } },
  ],

  // Phase G3 — Editable fields per module in the Universal Approval Hub (quick-edit for typo fixes)
  // Admin can configure which fields are editable per module. metadata.fields = array of field names on the document model.
  APPROVAL_EDITABLE_FIELDS: [
    { code: 'DEDUCTION_SCHEDULE', label: 'Deduction Schedule', metadata: { fields: ['description', 'deduction_label', 'total_amount'] } },
    { code: 'INCOME_REPORT', label: 'Income Report', metadata: { fields: ['notes'] } },
    { code: 'SALES_LINE', label: 'Sales / CSI', metadata: { fields: ['invoice_number', 'service_description'] } },
    { code: 'COLLECTION', label: 'Collection / CR', metadata: { fields: ['check_no', 'notes'] } },
    { code: 'SMER_ENTRY', label: 'SMER', metadata: { fields: ['notes'] } },
    { code: 'CAR_LOGBOOK', label: 'Car Logbook', metadata: { fields: ['notes'] } },
    { code: 'EXPENSE_ENTRY', label: 'Expenses (ORE/ACCESS)', metadata: { fields: ['notes'] } },
    { code: 'PRF_CALF', label: 'PRF / CALF', metadata: { fields: ['purpose', 'check_no', 'notes'] } },
    { code: 'GRN', label: 'GRN', metadata: { fields: ['notes'] } },
  ],

  // Phase G6 — Rejection feedback config per module (subscription-ready, per-entity).
  // Drives the contractor-side <RejectionBanner> and "Fix & Resubmit" deep-link across
  // every module that routes through gateApproval(). One row per canonical module key.
  //
  // Keys MUST match MODULE_DEFAULT_ROLES codes (Phase G4) so the G4 gate and the G6
  // rejection surface stay aligned. The verifyRejectionWiring script (G6.9) enforces
  // this on CI — drift between the two lookups causes a build-break.
  //
  // metadata.rejected_status — the terminal status value the banner reacts to. Varies
  //   per module because distinct semantics are preserved (see design decision #2 in
  //   the plan). ERROR = validation + approver reject; REJECTED = approver-only reject;
  //   RETURNED = reviewer returned for edit.
  // metadata.reason_field — `rejection_reason` for most, `return_reason` for modules
  //   that historically used that field name (Income, KPI). Lookup indirection avoids a
  //   migration.
  // metadata.resubmit_allowed — when true, banner renders a "Fix & Resubmit" button.
  //   Set false for terminal/embedded docs that cannot be independently re-submitted
  //   (PERDIEM_OVERRIDE is an embedded entry inside SmerEntry).
  // metadata.editable_statuses — which status values the module's existing edit flow
  //   accepts. Banner's resubmit handler only navigates when row.status is in this list.
  MODULE_REJECTION_CONFIG: [
    // ── Group A — modules with dedicated reject handlers in universalApprovalController ──
    { code: 'SALES',             label: 'Sales / CSI — Rejection Config',   metadata: { rejected_status: 'ERROR',    reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'Sales line items rejected from Approval Hub' } },
    { code: 'OPENING_AR',        label: 'Opening AR — Rejection Config',    metadata: { rejected_status: 'ERROR',    reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'Opening AR entries rejected from Approval Hub (same SalesLine status flow as SALES)' } },
    { code: 'COLLECTION',        label: 'Collections / CR — Rejection Config', metadata: { rejected_status: 'ERROR', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'Collection receipts rejected from Approval Hub' } },
    { code: 'CREDIT_NOTE',       label: 'Credit Notes / Returns — Rejection Config', metadata: { rejected_status: 'ERROR', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'ERROR'],       banner_tone: 'danger', description: 'Credit notes rejected from Approval Hub (returns to DRAFT/ERROR for correction)' } },
    { code: 'SMER',              label: 'SMER — Rejection Config',            metadata: { rejected_status: 'ERROR',  reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'SMER documents rejected from Approval Hub' } },
    { code: 'CAR_LOGBOOK',       label: 'Car Logbook — Rejection Config',     metadata: { rejected_status: 'ERROR',  reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'Car logbook entries rejected from Approval Hub (batch reject affects entire period+cycle)' } },
    // Phase G4.3 — Per-fuel rejection config. Fuel entries are embedded subdocs
    // on CarLogbookEntry; rejection reasons surface on the Car Logbook page
    // (the parent doc). The BDM edits the fuel entry and resubmits for approval
    // via the per-fuel gate (Phase 33).
    { code: 'FUEL_ENTRY',        label: 'Fuel Entry (per-receipt) — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['PENDING', 'REJECTED'], banner_tone: 'warning', description: 'Per-fuel rejections surface on the Car Logbook page. BDM edits the fuel entry and resubmits for approval.' } },
    { code: 'EXPENSES',          label: 'Expenses (ORE/ACCESS) — Rejection Config', metadata: { rejected_status: 'ERROR', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'ERROR'],      banner_tone: 'danger', description: 'Expense entries rejected from Approval Hub' } },
    { code: 'PRF_CALF',          label: 'PRF / CALF — Rejection Config',      metadata: { rejected_status: 'ERROR',  reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'PRF/CALF documents rejected from Approval Hub' } },
    { code: 'INVENTORY',         label: 'GRN (Goods Receipt) — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'PENDING', 'REJECTED'], banner_tone: 'danger', description: 'GRN entries rejected from Approval Hub' } },
    { code: 'PAYROLL',           label: 'Payslips — Rejection Config',        metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['COMPUTED', 'REJECTED'],     banner_tone: 'danger', description: 'Payslips rejected from Approval Hub (reopens for recomputation)' } },
    { code: 'INCOME',            label: 'Income Reports — Rejection Config',  metadata: { rejected_status: 'RETURNED', reason_field: 'return_reason',    resubmit_allowed: true,  editable_statuses: ['GENERATED', 'RETURNED'],    banner_tone: 'warning', description: 'Income reports returned by reviewer for edit (RETURNED status preserves prior review chain)' } },
    { code: 'KPI',               label: 'KPI Ratings — Rejection Config',     metadata: { rejected_status: 'RETURNED', reason_field: 'return_reason',    resubmit_allowed: true,  editable_statuses: ['SUBMITTED', 'RETURNED'],    banner_tone: 'warning', description: 'KPI self-ratings returned by reviewer for edit' } },
    { code: 'DEDUCTION_SCHEDULE', label: 'Deduction Schedules — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'reject_reason', resubmit_allowed: true, editable_statuses: ['PENDING_APPROVAL', 'REJECTED'], banner_tone: 'danger', description: 'Deduction schedules rejected from Approval Hub' } },
    { code: 'PERDIEM_OVERRIDE',  label: 'Per Diem Override — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'decision_reason', resubmit_allowed: false, editable_statuses: [],                          banner_tone: 'warning', description: 'Per diem overrides are embedded entries inside SMER — reason surfaces on the parent SMER, no standalone resubmit' } },
    { code: 'APPROVAL_REQUEST',  label: 'Authority Matrix Request — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'decision_reason', resubmit_allowed: false, editable_statuses: [],                      banner_tone: 'warning', description: 'ApprovalRequest itself — lives in Approval Hub history, not resubmitted directly' } },
    // Phase G4.3 — Incentive Dispute lifecycle transitions. Rejection means the
    // approver declined to make the transition; the dispute stays in its current
    // state and the filer/reviewer can re-request or take a different path. No
    // banner on the dispute itself — reason surfaces in Approval History.
    { code: 'INCENTIVE_DISPUTE', label: 'Incentive Dispute — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'decision_reason', resubmit_allowed: false, editable_statuses: [],                          banner_tone: 'warning', description: 'Dispute transition rejection — dispute stays in its prior state, reason lives in Approval History. Filer/reviewer re-calls the lifecycle endpoint to retry or choose a different path.' } },

    // ── Group B — dedicated reject handlers (Phase G6.7, live). Matching
    // `rejection_reason` fields verified on Phase G4.3 (JournalEntry /
    // BankStatement / PettyCashTransaction / InterCompanyTransfer /
    // IcSettlement / SupplierInvoice / SalesGoalPlan / IncentivePayout all
    // carry the field). Handlers live at
    // [universalApprovalController.js](../../backend/erp/controllers/universalApprovalController.js).
    { code: 'JOURNAL',           label: 'Journal Entries — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Journal entries rejected from Approval Hub' } },
    { code: 'BANKING',           label: 'Banking — Rejection Config',         metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Bank transactions rejected from Approval Hub' } },
    { code: 'PETTY_CASH',        label: 'Petty Cash — Rejection Config',      metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Petty cash transactions rejected from Approval Hub' } },
    { code: 'IC_TRANSFER',       label: 'Inter-Company Transfer — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'REJECTED'], banner_tone: 'danger', description: 'Inter-company transfers and settlements rejected from Approval Hub' } },
    { code: 'PURCHASING',        label: 'Purchasing — Rejection Config',      metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Purchase orders / supplier invoices rejected from Approval Hub' } },
    { code: 'SALES_GOAL_PLAN',   label: 'Sales Goal Plan — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Annual sales goal plans rejected from Approval Hub' } },
    { code: 'INCENTIVE_PAYOUT',  label: 'Incentive Payouts — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['ACCRUED', 'REJECTED'],      banner_tone: 'danger', description: 'Incentive payouts rejected from Approval Hub' } },
  ],

  // ── Phase G6.10 — AI Cowork Features (president-managed, lookup-driven) ──
  // Each row defines one Claude-powered assist surface. President can toggle is_active,
  // edit prompt/model/role/limits per-entity from Control Center → AI Cowork tab.
  // Adding a new AI cowork surface = new row, no code change. The runtime
  // (`approvalAiService`) reads metadata at request time — Rule #3 compliant.
  //
  // metadata schema:
  //   surface: 'approver' | 'staff'        — which side renders the button
  //   endpoint_key: string                 — reserved for future routing variations
  //   system_prompt: string                — full Claude system prompt (editable)
  //   user_template: string                — Mustache-style {{var}} placeholders
  //   model: string                        — Anthropic model id
  //   max_tokens: number
  //   temperature: number
  //   allowed_roles: string[]              — who sees the button
  //   rate_limit_per_min: number
  //   button_label: string
  //   fallback_behavior: 'hide_button'|'show_error'
  //   description: string                  — admin-facing tooltip
  //
  // Cost note: each row carries its own model. Cost is logged to AiUsageLog with
  // feature_code = row.code (per-feature attribution). G7.8 spend caps enforce per
  // feature/per entity budgets. NEW SUBSIDIARIES INHERIT NOTHING until president seeds.
  AI_COWORK_FEATURES: [
    {
      code: 'APPROVAL_REJECT_SUGGEST',
      label: 'AI: Suggest Rejection Reason',
      metadata: {
        surface: 'approver',
        endpoint_key: 'approval-reject-suggest',
        system_prompt: 'You are an ERP approver assistant. Given a document summary and any validation errors, draft 2-3 short professional rejection reasons (≤30 words each). Use a constructive tone — explain what to fix, not just what is wrong. Output as a JSON array of strings.',
        user_template: 'Module: {{module}}\nDoc: {{doc_ref}} (status={{status}})\nSummary: {{summary}}\nValidation errors:\n{{errors}}\n\nDraft 2-3 rejection reasons.',
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        temperature: 0.4,
        allowed_roles: ['approver', 'president', 'admin', 'finance'],
        rate_limit_per_min: 10,
        button_label: '✨ AI Suggest',
        fallback_behavior: 'hide_button',
        description: 'In the Approval Hub reject dialog, suggests 2-3 phrasings the approver can pick from.',
      },
    },
    {
      code: 'APPROVAL_FIX_HELPER',
      label: 'AI: Help Me Fix This',
      metadata: {
        surface: 'staff',
        endpoint_key: 'approval-fix-helper',
        system_prompt: 'You are an ERP submission assistant. Given a rejected document and the approver\'s reason, explain in 1-2 short sentences what needs to change, then list the specific edits as bullet points. Be concrete — reference actual fields. End with a one-line summary of the resubmit checklist.',
        user_template: 'Module: {{module}}\nDoc: {{doc_ref}}\nRejection reason: {{reason}}\nDoc summary: {{summary}}\n\nExplain what to fix and how.',
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        temperature: 0.3,
        allowed_roles: ['staff', 'admin', 'finance', 'president'],
        rate_limit_per_min: 6,
        button_label: '🤝 Help Me Fix',
        fallback_behavior: 'hide_button',
        description: 'In RejectionBanner, explains the rejection in plain language with concrete edit suggestions.',
      },
    },
    {
      code: 'APPROVAL_FIX_CHECK',
      label: 'AI: Check My Fix Before Resubmit',
      metadata: {
        surface: 'staff',
        endpoint_key: 'approval-fix-check',
        system_prompt: 'You are an ERP pre-submit reviewer. Compare the original rejection reason against the document\'s current state. Reply with: PASS or FAIL on the first line, then 1-2 sentences explaining what still needs work (or confirming the fix addresses the original feedback).',
        user_template: 'Module: {{module}}\nDoc: {{doc_ref}}\nOriginal rejection reason: {{reason}}\nCurrent doc state: {{summary}}\n\nDoes the fix address the rejection?',
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        temperature: 0.2,
        allowed_roles: ['staff', 'admin', 'finance', 'president'],
        rate_limit_per_min: 6,
        button_label: '🔎 Check My Fix',
        fallback_behavior: 'hide_button',
        description: 'In RejectionBanner before Resubmit, verifies edits address the original reason.',
      },
    },
    // ── Phase G7 — President's Copilot system prompt (chat widget + Cmd+K) ──
    // copilotService renders this row as the system prompt for every chat turn.
    // President can edit prompt/model/role gates without code change.
    {
      code: 'PRESIDENT_COPILOT',
      label: 'President Copilot — Chat Widget',
      metadata: {
        surface: 'copilot',
        endpoint_key: 'copilot-chat',
        system_prompt:
          "You are the President's operations copilot for the VIP ERP. Answer concisely (≤4 sentences unless explicitly asked for detail). " +
          "When the user asks to find/filter/navigate, CALL A TOOL — don't describe what you'd do. " +
          "For any write action, use a write_confirm tool so the user reviews before executing. " +
          "Respect entity scoping — never leak data across entities. " +
          "Pharmaceutical context: VIP is parent; subsidiaries like MG AND CO. access via transfer pricing. " +
          "Phase G8 capabilities you can invoke: " +
          "Secretary — CREATE_TASK, LIST_OVERDUE_ITEMS, DRAFT_DECISION_BRIEF, DRAFT_ANNOUNCEMENT, WEEKLY_SUMMARY. " +
          "HR — SUGGEST_KPI_TARGETS, DRAFT_COMP_ADJUSTMENT, AUDIT_SELF_RATINGS, RANK_PEOPLE, RECOMMEND_HR_ACTION " +
          "(the last always returns a recommendation only — never auto-executes). " +
          "Background ops signals (Treasury cash, FP&A forecast, Procurement scorecard, Compliance deadlines, " +
          "SoD/internal audit, Data Quality, FEFO expiry, Expansion readiness) run as scheduled agents and post " +
          "to the inbox — use SEARCH_DOCUMENTS or SUMMARIZE_MODULE if the user asks about their output. " +
          "If a user request can't be served by an enabled tool, say so and suggest the closest option.",
        // Cmd+K quick-mode addendum — appended to system_prompt when the request
        // arrives with mode='quick' (CommandPalette).
        quick_mode_prompt:
          "QUICK MODE: interpret the user's terse phrase as a command. " +
          "Prefer NAVIGATE_TO or SEARCH_DOCUMENTS tools. Respond with ≤1 sentence + the tool action.",
        user_template: '', // chat uses raw messages array; template unused
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        temperature: 0.3,
        allowed_roles: ['president', 'ceo'],
        rate_limit_per_min: 30,
        button_label: '✨ Copilot',
        fallback_behavior: 'hide_button',
        description: 'Floating Copilot chat widget on every ERP page. Cmd+K opens it in quick mode.',
        max_chat_turns: 8,           // safety cap on the tool-use loop
        history_persist: 'session',  // session | local | none
      },
    },
    // ── Phase G7.9 — Daily Briefing scheduled Copilot turn ──
    // agentScheduler triggers a Copilot run with this prompt; output posts to
    // MessageInbox (category=briefing) and the ERP dashboard "Today's Briefing" card.
    {
      code: 'PRESIDENT_DAILY_BRIEFING',
      label: 'Daily Briefing — Morning Copilot',
      metadata: {
        surface: 'scheduled',
        endpoint_key: 'copilot-briefing',
        system_prompt:
          'You are the President\'s morning operations briefer. Use the available tools to gather facts (LIST_PENDING_APPROVALS, SUMMARIZE_MODULE, COMPARE_ENTITIES), then write a concise markdown briefing.',
        user_template:
          'Generate the {{date}} morning briefing for entity {{entity_name}}. Include: ' +
          '1) Pending approvals count + top 3 oldest; ' +
          '2) Yesterday\'s collections vs target; ' +
          '3) Period-lock warnings (any module with an upcoming lock in 3 days); ' +
          '4) Any anomalies flagged by free agents in the last 24h. ' +
          'Keep under 200 words. Use bullet points. End with one suggested action.',
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        temperature: 0.4,
        allowed_roles: ['president', 'ceo'],
        rate_limit_per_min: 2,
        button_label: '☀️ Daily Briefing',
        fallback_behavior: 'hide_button',
        description: 'Scheduled morning briefing posted to MessageInbox + dashboard. Counts toward Copilot spend cap.',
        // Cron schedule (Asia/Manila) — agentScheduler reads this on init.
        // Subscribers can change without code change.
        schedule_cron: '0 7 * * 1-5',  // weekdays 7:00 AM Manila
      },
    },
  ],

  // ── Phase G7.1 — Copilot tool registry (lookup-driven capability list) ──
  //
  // Each row = one capability the Copilot can call. Adding a new tool = new row +
  // register one handler in copilotToolRegistry.js. President toggles per entity.
  //
  // metadata shape:
  //   tool_type: 'read' | 'write_confirm'
  //   handler_key: string                  — must match a key in copilotToolRegistry
  //   json_schema: { name, description, input_schema } — Claude tool-use shape
  //   allowed_roles: string[]
  //   description_for_claude: string       — one-line hint Claude sees
  //   confirmation_template: string        — empty for read; mustache for write_confirm
  //   entity_scoped: boolean               — handler asserts req.entityId
  //   rate_limit_per_min: number           — per user
  //
  // Defaults seed as is_active: true so the Copilot is functional out of the box,
  // but the parent PRESIDENT_COPILOT feature is is_active: false until president
  // opts in (subscription-safe — same pattern as AI_COWORK_FEATURES).
  COPILOT_TOOLS: [
    {
      code: 'LIST_PENDING_APPROVALS',
      label: 'List my pending approvals',
      metadata: {
        tool_type: 'read',
        handler_key: 'listPendingApprovals',
        json_schema: {
          name: 'list_pending_approvals',
          description: 'Lists documents pending the current user\'s approval across all modules in their entities.',
          input_schema: {
            type: 'object',
            properties: {
              limit: { type: 'integer', description: 'Max items to return (default 20).' },
            },
          },
        },
        allowed_roles: ['president', 'admin', 'finance', 'ceo'],
        description_for_claude: 'Returns the Approval Hub items the current user can act on, newest first. Use when the user asks "what needs my approval".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 30,
      },
    },
    {
      code: 'SEARCH_DOCUMENTS',
      label: 'Search documents across modules',
      metadata: {
        tool_type: 'read',
        handler_key: 'searchDocuments',
        json_schema: {
          name: 'search_documents',
          description: 'Cross-module document search by free-text query. Returns matching docs with module, ref, status, owner, date.',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Free-text to match against doc_ref, vendor, customer, notes.' },
              modules: { type: 'array', items: { type: 'string' }, description: 'Module keys to scope search (SALES, COLLECTION, EXPENSES, ...). Empty = all.' },
              status: { type: 'string', description: 'Optional status filter (DRAFT, SUBMITTED, REJECTED, POSTED, ...).' },
              limit: { type: 'integer' },
            },
            required: ['query'],
          },
        },
        allowed_roles: ['president', 'admin', 'finance', 'ceo'],
        description_for_claude: 'Use when the user asks to find a specific document by name, number, or vendor — e.g. "Jake Montero rejected SMERs in March".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 30,
      },
    },
    {
      code: 'SUMMARIZE_MODULE',
      label: 'Summarize a module',
      metadata: {
        tool_type: 'read',
        handler_key: 'summarizeModule',
        json_schema: {
          name: 'summarize_module',
          description: 'Returns aggregate counts/totals for a module over a date range (today, week, month, ytd, custom).',
          input_schema: {
            type: 'object',
            properties: {
              module: { type: 'string', description: 'COLLECTION | SALES | EXPENSES | SMER | CAR_LOGBOOK | PETTY_CASH | INCOME | PURCHASING | BANKING | INCENTIVE' },
              range: { type: 'string', description: 'today | week | month | ytd | custom' },
              from: { type: 'string', description: 'ISO date — required if range=custom' },
              to:   { type: 'string', description: 'ISO date — required if range=custom' },
            },
            required: ['module', 'range'],
          },
        },
        allowed_roles: ['president', 'admin', 'finance', 'ceo'],
        description_for_claude: 'Use when the user asks for a quick number — "today\'s collections", "Q1 sales", "expenses this week".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 30,
      },
    },
    {
      code: 'EXPLAIN_REJECTION',
      label: 'Explain a rejection',
      metadata: {
        tool_type: 'read',
        handler_key: 'explainRejection',
        json_schema: {
          name: 'explain_rejection',
          description: 'Given a doc_id (or approval_request id), returns the full chain of why it was rejected: original reason, approver, audit trail, and any prior submissions.',
          input_schema: {
            type: 'object',
            properties: {
              doc_id: { type: 'string', description: 'Source document id OR ApprovalRequest id.' },
              module: { type: 'string', description: 'Optional hint of which module this doc lives in.' },
            },
            required: ['doc_id'],
          },
        },
        allowed_roles: ['president', 'admin', 'finance', 'ceo'],
        description_for_claude: 'Use when the user asks "why was X rejected" or "what happened to doc Y".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 30,
      },
    },
    {
      code: 'NAVIGATE_TO',
      label: 'Navigate to a page',
      metadata: {
        tool_type: 'read',
        handler_key: 'navigateTo',
        json_schema: {
          name: 'navigate_to',
          description: 'Returns a target URL with filters pre-applied. The frontend will navigate the user there.',
          input_schema: {
            type: 'object',
            properties: {
              page: { type: 'string', description: 'Page key — sales | collections | expenses | smer | approvals | incentives | etc.' },
              filters: { type: 'object', description: 'Key-value filters appended as query params.' },
            },
            required: ['page'],
          },
        },
        allowed_roles: ['president', 'admin', 'finance', 'ceo'],
        description_for_claude: 'Use when the user asks to "go to" or "open" a page. Always prefer this over describing the URL.',
        confirmation_template: '',
        entity_scoped: false, // path-only; no data leak
        rate_limit_per_min: 60,
      },
    },
    {
      code: 'COMPARE_ENTITIES',
      label: 'Compare entities',
      metadata: {
        tool_type: 'read',
        handler_key: 'compareEntities',
        json_schema: {
          name: 'compare_entities',
          description: 'Cross-entity reporting — given a metric and date range, returns the metric per active entity. Only entities the user has access to are included.',
          input_schema: {
            type: 'object',
            properties: {
              metric: { type: 'string', description: 'sales | collections | expenses | gross_profit | pending_approvals' },
              range:  { type: 'string', description: 'today | week | month | ytd' },
            },
            required: ['metric', 'range'],
          },
        },
        allowed_roles: ['president', 'ceo'],
        description_for_claude: 'Use when the user asks "VIP vs MG AND CO." or compares performance across entities. Hidden for users without multi-entity access.',
        confirmation_template: '',
        entity_scoped: false, // operates ACROSS entities, gated by user.entity_ids
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'DRAFT_REJECTION_REASON',
      label: 'Draft a rejection reason',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'draftRejectionReason',
        json_schema: {
          name: 'draft_rejection_reason',
          description: 'Drafts a rejection reason for an approval. RETURNS A DRAFT — does not execute. The user must confirm before the rejection is applied.',
          input_schema: {
            type: 'object',
            properties: {
              approval_request_id: { type: 'string', description: 'ApprovalRequest id to reject.' },
              reason: { type: 'string', description: 'Draft rejection reason text.' },
            },
            required: ['approval_request_id', 'reason'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin', 'finance'],
        description_for_claude: 'Use when the user asks to reject an approval. Always returns a draft — the UI shows a confirmation card before the rejection is committed.',
        confirmation_template: 'Reject {{doc_ref}} ({{module}}) with reason: "{{reason}}"?',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'DRAFT_MESSAGE',
      label: 'Draft a message to a user',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'draftMessage',
        json_schema: {
          name: 'draft_message',
          description: 'Drafts a message to a recipient (BDM, approver). Returns the draft text — does not send. User confirms before send.',
          input_schema: {
            type: 'object',
            properties: {
              recipient_id: { type: 'string', description: 'User id to receive the message.' },
              subject:      { type: 'string' },
              body:         { type: 'string' },
              category:     { type: 'string', description: 'general | approval | task | briefing' },
            },
            required: ['recipient_id', 'subject', 'body'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin'],
        description_for_claude: 'Use when the user asks to send a message to a BDM or staff member.',
        confirmation_template: 'Send to {{recipient_name}}: "{{subject}}"?',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      // Phase G9.R8 — Reply to an existing inbox message via Copilot.
      // Routes through messageInboxController.replyToMessage so threading,
      // entity scoping, and audience guards are enforced exactly once
      // (Rule #20: never reimplement the reply path).
      code: 'DRAFT_REPLY_TO_MESSAGE',
      label: 'Draft a reply to an inbox message',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'draftReplyToMessage',
        json_schema: {
          name: 'draft_reply_to_message',
          description: 'Drafts a reply to an existing MessageInbox row. Returns the draft for confirmation; on execute, posts via the canonical /messages/:id/reply endpoint so the reply is threaded with the parent.',
          input_schema: {
            type: 'object',
            properties: {
              message_id: { type: 'string', description: 'Parent MessageInbox _id to reply to.' },
              body:       { type: 'string', description: 'Reply text (max 5000 chars).' },
            },
            required: ['message_id', 'body'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin', 'finance', 'staff'],
        description_for_claude: 'Use when the user asks Claude to reply to a notification or message they already received. The Copilot will offer the draft for confirmation; the user clicks Execute to send.',
        confirmation_template: 'Send reply to "{{parent_title}}"?',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'DRAFT_NEW_ENTRY',
      label: 'Pre-fill a new entry form',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'draftNewEntry',
        json_schema: {
          name: 'draft_new_entry',
          description: 'Pre-fills a new module entry (expense, smer, sales) with proposed values. Returns the target route + values — the UI navigates to the form with values pre-loaded for the user to review and submit.',
          input_schema: {
            type: 'object',
            properties: {
              module: { type: 'string', description: 'EXPENSES | SMER | SALES | COLLECTION | PETTY_CASH' },
              values: { type: 'object', description: 'Field values to pre-fill.' },
            },
            required: ['module', 'values'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin', 'finance'],
        description_for_claude: 'Use when the user asks to "create a new" expense/smer/sales/etc. with specific values. Always returns a pre-fill route — the user submits via the existing form.',
        confirmation_template: 'Open new {{module}} form pre-filled with these values?',
        entity_scoped: true,
        rate_limit_per_min: 20,
      },
    },

    // ─────────────────────────────────────────────────────────────────────
    // Phase G8 (P2-10 through P2-19) — HR + Secretary Copilot tools (10 new)
    //
    // All 10 pay-per-use. Each row defines the json_schema Claude sees, the
    // handler_key in copilotToolRegistry.js, and the role gate. Adding a new
    // tool = add one row here + register one handler + verify:copilot-wiring
    // grows from 25 to 35 passes. All write_confirm tools route through
    // existing controllers (Rule #20) — never bypass gateApproval.
    // ─────────────────────────────────────────────────────────────────────

    // ── Secretary tools (5) ──
    {
      code: 'CREATE_TASK',
      label: 'Create a task',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'createTask',
        json_schema: {
          name: 'create_task',
          description: 'Creates a task in the Task collection for the current user or an assignee. Returns a draft first; user confirms before save.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short task title (≤200 chars).' },
              description: { type: 'string', description: 'Optional longer description.' },
              assignee_user_id: { type: 'string', description: 'Optional user id to assign to. Omit = assign to self.' },
              due_date: { type: 'string', description: 'Optional ISO date (YYYY-MM-DD) or "friday" / "next week" — the handler normalises relative dates.' },
              priority: { type: 'string', description: 'low | normal | high | urgent. Default normal.' },
            },
            required: ['title'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin', 'finance', 'staff'],
        description_for_claude: 'Use when the user says "remind me to", "add a task", "create a task to". Always returns a draft — user confirms before the task is saved.',
        confirmation_template: 'Create task "{{title}}" due {{due_date}} for {{assignee_name}}?',
        entity_scoped: true,
        rate_limit_per_min: 20,
      },
    },
    {
      code: 'LIST_OVERDUE_ITEMS',
      label: 'List overdue items',
      metadata: {
        tool_type: 'read',
        handler_key: 'listOverdueItems',
        json_schema: {
          name: 'list_overdue_items',
          description: 'Returns overdue tasks AND overdue approval requests for the current user (or all, if privileged). Sorted by how late they are.',
          input_schema: {
            type: 'object',
            properties: {
              scope: { type: 'string', description: 'tasks | approvals | both (default both)' },
              assignee: { type: 'string', description: 'me (default) | all (privileged only)' },
              limit: { type: 'integer' },
            },
          },
        },
        allowed_roles: ['president', 'ceo', 'admin', 'finance', 'staff'],
        description_for_claude: 'Use when the user asks "what\'s overdue", "what\'s late", "what\'s on my plate". Aggregates overdue tasks + overdue approval requests.',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 30,
      },
    },
    {
      code: 'DRAFT_DECISION_BRIEF',
      label: 'Draft a 1-page decision brief',
      metadata: {
        tool_type: 'read',
        handler_key: 'draftDecisionBrief',
        json_schema: {
          name: 'draft_decision_brief',
          description: 'Generates a concise decision brief (1 page) on a subject. Internally uses SEARCH_DOCUMENTS to gather facts then synthesises a Background / Options / Recommendation structure.',
          input_schema: {
            type: 'object',
            properties: {
              subject: { type: 'string', description: 'Free-text subject, e.g. "transfer pricing for MG AND CO."' },
              modules: { type: 'array', items: { type: 'string' }, description: 'Optional list of module keys to scope the fact-gathering search.' },
            },
            required: ['subject'],
          },
        },
        allowed_roles: ['president', 'ceo'],
        description_for_claude: 'Use when the user asks for a "brief", "memo", "1-pager", "background on", or "decision on". Returns a read-only document — no writes.',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 6,
      },
    },
    {
      code: 'DRAFT_ANNOUNCEMENT',
      label: 'Draft a broadcast announcement',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'draftAnnouncement',
        json_schema: {
          name: 'draft_announcement',
          description: 'Drafts a broadcast MessageInbox announcement scoped by recipient role + optional entity. Returns a draft first; user picks scope and confirms before send.',
          input_schema: {
            type: 'object',
            properties: {
              scope_type: { type: 'string', description: 'by_role (broadcast to all users in a role) | by_entity (users in a specific entity, all roles) | both (role ∩ entity)' },
              recipient_role: { type: 'string', description: 'admin | finance | contractor | president — required when scope_type includes by_role.' },
              target_entity_id: { type: 'string', description: 'Entity id to scope by — required when scope_type includes by_entity.' },
              subject: { type: 'string' },
              body: { type: 'string' },
              priority: { type: 'string', description: 'normal | important | high. Default normal.' },
            },
            required: ['subject', 'body', 'scope_type'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin'],
        description_for_claude: 'Use when the user asks to "broadcast", "announce", "notify everyone", or "send to all BDMs". Always returns a draft with recipient count preview.',
        confirmation_template: 'Broadcast "{{subject}}" to {{recipient_count}} recipient(s) ({{scope_summary}})?',
        entity_scoped: true,
        rate_limit_per_min: 5,
      },
    },
    {
      code: 'WEEKLY_SUMMARY',
      label: 'Weekly ops summary',
      metadata: {
        tool_type: 'read',
        handler_key: 'weeklySummary',
        json_schema: {
          name: 'weekly_summary',
          description: 'Rolls up key weekly ops signals: approval throughput, sales vs collections, top anomalies, overdue tasks, agent alerts. Read-only.',
          input_schema: {
            type: 'object',
            properties: {
              week_offset: { type: 'integer', description: '0 = this week (default), -1 = last week, etc.' },
            },
          },
        },
        allowed_roles: ['president', 'ceo'],
        description_for_claude: 'Use when the user asks "how was the week", "weekly summary", "last week\'s numbers".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 6,
      },
    },

    // ── HR tools (5) ──
    {
      code: 'SUGGEST_KPI_TARGETS',
      label: 'Suggest KPI targets for a person',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'suggestKpiTargets',
        json_schema: {
          name: 'suggest_kpi_targets',
          description: 'Proposes KPI targets for a specific person based on peer performance (same role + same entity by default). Returns a draft target list — user confirms before writing to SalesGoalTarget DRAFT.',
          input_schema: {
            type: 'object',
            properties: {
              person_id: { type: 'string', description: 'PeopleMaster id to set targets for.' },
              period: { type: 'string', description: 'Period code (e.g. 2026-Q3).' },
              peer_scope: { type: 'string', description: 'same_role_same_entity (default) | same_role_all_entities — lookup-configurable' },
            },
            required: ['person_id', 'period'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin'],
        description_for_claude: 'Use when the user asks "suggest KPI for X" or "propose Q3 targets for Y". Always returns a draft — user confirms before the SalesGoalTarget DRAFT is created.',
        confirmation_template: 'Create DRAFT SalesGoalTargets for {{person_name}} ({{period}}) with these numbers?',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'DRAFT_COMP_ADJUSTMENT',
      label: 'Draft compensation adjustment',
      metadata: {
        tool_type: 'write_confirm',
        handler_key: 'draftCompAdjustment',
        json_schema: {
          name: 'draft_comp_adjustment',
          description: 'Drafts a compensation adjustment (salary/allowance) for a person. Returns a draft — user confirms before the PersonComp update endpoint is called (which goes through gateApproval).',
          input_schema: {
            type: 'object',
            properties: {
              person_id: { type: 'string' },
              component: { type: 'string', description: 'base_salary | allowance | bonus_plan — must match a PersonComp component code' },
              new_amount: { type: 'number' },
              effective_date: { type: 'string', description: 'ISO date' },
              reason: { type: 'string', description: 'Human-readable rationale written to the audit trail.' },
            },
            required: ['person_id', 'component', 'new_amount', 'effective_date'],
          },
        },
        allowed_roles: ['president', 'ceo'],
        description_for_claude: 'Use when the user asks to "adjust salary", "give a raise", "change allowance". Always write_confirm — PersonComp update routes through gateApproval.',
        confirmation_template: 'Adjust {{component}} for {{person_name}} to ₱{{new_amount}} effective {{effective_date}}?',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'AUDIT_SELF_RATINGS',
      label: 'Audit self-ratings vs performance',
      metadata: {
        tool_type: 'read',
        handler_key: 'auditSelfRatings',
        json_schema: {
          name: 'audit_self_ratings',
          description: 'Compares KPI self-ratings against actual performance snapshots and flags variance (self-rated HIGH but actuals LOW, or vice versa).',
          input_schema: {
            type: 'object',
            properties: {
              period: { type: 'string' },
              person_id: { type: 'string', description: 'Optional — omit to audit all people with self-ratings this period.' },
            },
            required: ['period'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin'],
        description_for_claude: 'Use when the user asks "who is over-rating themselves" or "check self-ratings against actuals".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'RANK_PEOPLE',
      label: 'Rank people by composite performance',
      metadata: {
        tool_type: 'read',
        handler_key: 'rankPeople',
        json_schema: {
          name: 'rank_people',
          description: 'Ranks active people by a composite of KPI attainment, collections discipline, variance history, and engagement signals. Returns ranked list with rationale.',
          input_schema: {
            type: 'object',
            properties: {
              role: { type: 'string', description: 'Optional person_type code to restrict to a role (e.g. BDM).' },
              period: { type: 'string' },
              direction: { type: 'string', description: 'top (default) | bottom' },
              limit: { type: 'integer' },
            },
            required: ['period'],
          },
        },
        allowed_roles: ['president', 'ceo', 'admin'],
        description_for_claude: 'Use when the user asks "rank BDMs", "top 5 performers", "worst performers".',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
    {
      code: 'RECOMMEND_HR_ACTION',
      label: 'Recommend HR action for a person',
      metadata: {
        tool_type: 'read',
        handler_key: 'recommendHrAction',
        json_schema: {
          name: 'recommend_hr_action',
          description: 'Returns an HR action recommendation for one person (coach | warn | PIP | manage_out | promote | no_action) with supporting signals. Bluntness level comes from HR_ACTION_BLUNTNESS lookup (conservative | balanced | blunt). Always human-reviewed — never auto-executed.',
          input_schema: {
            type: 'object',
            properties: {
              person_id: { type: 'string' },
              period: { type: 'string', description: 'Period to evaluate against (e.g. 2026-Q2).' },
            },
            required: ['person_id', 'period'],
          },
        },
        allowed_roles: ['president', 'ceo'],
        description_for_claude: 'Use when the user asks "what should I do about X" or "recommendation on Y". Read-only — outputs a recommendation, never writes. Flags HR/legal sign-off needed for serious actions.',
        confirmation_template: '',
        entity_scoped: true,
        rate_limit_per_min: 10,
      },
    },
  ],

  // ─────────────────────────────────────────────────────────────────────
  // Phase G8 (P2-20 through P2-22) — AI toggle + HR bluntness lookups
  //
  // Three lookup categories that let subscribers flip individual agent AI
  // modes without a code change. Defaults ship as rule-based / balanced so
  // no entity is surprised with Claude bills on day one.
  // ─────────────────────────────────────────────────────────────────────
  TREASURY_AGENT_AI_MODE: [
    {
      code: 'DEFAULT',
      label: 'Treasury Agent AI Mode',
      metadata: {
        value: 'rule', // 'rule' (free, rule-based) | 'ai' (Claude-assisted)
        description:
          'Treasury & Cash Flow agent execution mode. rule = pure aggregation over bank accounts + upcoming PRF/CALF; ' +
          'ai = append a Claude-generated narrative on risks and suggested transfers. AI mode counts against AI_SPEND_CAPS.',
      },
    },
  ],
  FPA_FORECAST_AI_MODE: [
    {
      code: 'DEFAULT',
      label: 'FP&A Forecast Agent AI Mode',
      metadata: {
        value: 'rule',
        description:
          'FP&A Rolling Forecast agent execution mode. rule = quarter-pacing + variance drivers from SalesLine/Collection; ' +
          'ai = add a Claude-generated scenario-projection commentary. AI mode counts against AI_SPEND_CAPS.',
      },
    },
  ],
  HR_ACTION_BLUNTNESS: [
    {
      code: 'DEFAULT',
      label: 'HR Recommendation Bluntness',
      metadata: {
        value: 'balanced', // 'conservative' | 'balanced' | 'blunt'
        description:
          'Tone profile for RECOMMEND_HR_ACTION output. conservative = only coaching/warning ever suggested (manage_out is flagged as "needs HR review" even for worst cases); ' +
          'balanced = default; includes manage_out as an option but always flags requires_hr_legal_review=true. ' +
          'blunt = same options, less hedging — still always flags HR/legal review. No setting ever auto-executes an HR action.',
      },
    },
  ],

  // ── Phase G7.8 — AI spend caps (per-entity, lookup-driven) ──
  //
  // checkSpendCap() is called by approvalAiService, copilotService, and the OCR
  // controller BEFORE every Claude call. At cap with action_when_reached='disable',
  // the call returns 429 and feature buttons hide via fallback_behavior. Defaults
  // ship as is_active: false so existing entities don't get a surprise cap on
  // first deploy — president opts in via Control Center → Lookup Tables or the
  // AgentSettings AI Budget tab.
  AI_SPEND_CAPS: [
    {
      code: 'MONTHLY',
      label: 'Monthly AI Spend Cap',
      metadata: {
        monthly_budget_usd: 150,
        notify_at_pct: 80,
        action_when_reached: 'disable', // 'disable' | 'warn_only'
        notify_channels: ['dashboard_banner'], // 'email:president' | 'dashboard_banner' | 'inbox:president'
        // Per-feature overrides — keys are AI_COWORK_FEATURES.code or 'OCR' or COPILOT_TOOLS.code
        // Example: { OCR: { monthly_budget_usd: 30, action_when_reached: 'disable' } }
        feature_overrides: {},
        description: 'Total Anthropic API spend cap per calendar month for this entity. Resets on month rollover. Per-feature overrides take precedence.',
      },
    },
  ],

  // Phase 34 — Editable line-item fields per module in the Approval Hub
  // Approver can edit individual line items (qty, price, etc.) before approving
  APPROVAL_EDITABLE_LINE_FIELDS: [
    { code: 'SALES_LINE', label: 'Sales Line Items', metadata: { fields: ['qty', 'unit_price'] } },
    { code: 'GRN', label: 'GRN Line Items', metadata: { fields: ['qty', 'batch_lot_no', 'expiry_date'] } },
    { code: 'EXPENSE_ENTRY', label: 'Expense Lines', metadata: { fields: ['amount', 'expense_category'] } },
  ],

  // Product Catalog Access — controls which subsidiary entities can browse parent entity products
  // When a subsidiary user opens PO creation (catalog=true), the system checks this lookup to decide
  // whether to include parent entity products alongside the subsidiary's own products.
  // metadata.parent_entity_id = the parent whose products are shared. metadata.access_mode = FULL (all products) or ACTIVE_ONLY (only is_active:true).
  // Admin/President configures per subsidiary via Control Center → Lookup Tables.
  PRODUCT_CATALOG_ACCESS: [
    { code: 'INHERIT_PARENT', label: 'Inherit Parent Entity Products', metadata: { access_mode: 'ACTIVE_ONLY', description: 'Subsidiary can browse parent entity products for PO creation and catalog views' } },
  ],

  // OCR Vendor Auto-Learn guardrails — Phase H5.10 (subscription-ready)
  // Words Claude sometimes returns as supplier_name that should never become learned vendors.
  // Admin can add/remove per-entity (e.g. local slang, store types that aren't real vendors).
  // Uppercased metadata.blocked_value is what the learner actually matches against.
  VENDOR_AUTO_LEARN_BLOCKLIST: [
    { code: 'RECEIPT', label: 'Receipt', metadata: { blocked_value: 'RECEIPT' } },
    { code: 'OFFICIAL_RECEIPT', label: 'Official Receipt', metadata: { blocked_value: 'OFFICIAL RECEIPT' } },
    { code: 'OR', label: 'OR', metadata: { blocked_value: 'OR' } },
    { code: 'INVOICE', label: 'Invoice', metadata: { blocked_value: 'INVOICE' } },
    { code: 'UNKNOWN', label: 'Unknown', metadata: { blocked_value: 'UNKNOWN' } },
    { code: 'NA_SLASH', label: 'N/A', metadata: { blocked_value: 'N/A' } },
    { code: 'NA', label: 'NA', metadata: { blocked_value: 'NA' } },
    { code: 'SUPPLIER', label: 'Supplier', metadata: { blocked_value: 'SUPPLIER' } },
    { code: 'VENDOR', label: 'Vendor', metadata: { blocked_value: 'VENDOR' } },
    { code: 'ESTABLISHMENT', label: 'Establishment', metadata: { blocked_value: 'ESTABLISHMENT' } },
    { code: 'STORE', label: 'Store', metadata: { blocked_value: 'STORE' } },
    { code: 'SHOP', label: 'Shop', metadata: { blocked_value: 'SHOP' } },
    { code: 'CUSTOMER', label: 'Customer', metadata: { blocked_value: 'CUSTOMER' } },
    { code: 'CASH', label: 'Cash', metadata: { blocked_value: 'CASH' } },
    { code: 'SALES', label: 'Sales', metadata: { blocked_value: 'SALES' } },
    { code: 'CASHIER', label: 'Cashier', metadata: { blocked_value: 'CASHIER' } },
    { code: 'THANK_YOU', label: 'Thank You', metadata: { blocked_value: 'THANK YOU' } },
    { code: 'THANK', label: 'Thank', metadata: { blocked_value: 'THANK' } },
    { code: 'NONE', label: 'None', metadata: { blocked_value: 'NONE' } },
    { code: 'NULL', label: 'Null', metadata: { blocked_value: 'NULL' } },
    { code: 'GAS_STATION', label: 'Gas Station', metadata: { blocked_value: 'GAS STATION' } },
    { code: 'STATION', label: 'Station', metadata: { blocked_value: 'STATION' } },
    { code: 'PUMP', label: 'Pump', metadata: { blocked_value: 'PUMP' } },
  ],
  // OCR Vendor Auto-Learn size thresholds — admin-tunable without code deploy.
  // metadata.value = integer. Admin can tighten MIN_NAME_LEN if too many 3-char false positives,
  // or loosen MAX_RAW_SNIPPET for larger audit context.
  VENDOR_AUTO_LEARN_THRESHOLDS: [
    { code: 'MIN_NAME_LEN', label: 'Minimum vendor name length (chars)', metadata: { value: 3 } },
    { code: 'MAX_NAME_LEN', label: 'Maximum vendor name length (chars)', metadata: { value: 120 } },
    { code: 'MAX_RAW_SNIPPET', label: 'Max raw OCR snippet stored (chars)', metadata: { value: 300 } },
  ],

  // Phase 31b — Chart of Accounts default template (Rule #3, lookup-driven).
  // Each entry materializes one row in ChartOfAccounts when the COA seed runs.
  // Subscribers can add/remove/edit accounts here per entity via Control Center →
  // Lookup Tables before triggering "Sync from Template" on the COA page.
  // Source-of-truth: backend/erp/scripts/seedCOA.js → COA_TEMPLATE_LOOKUP_SHAPE
  // (kept in code so new accounts auto-propagate to existing entities on next read).
  COA_TEMPLATE: require('../scripts/seedCOA').COA_TEMPLATE_LOOKUP_SHAPE,

  // ── Phase 24-C fix (Apr 2026) — reconcile SEED_DEFAULTS with runtime lazy-seed ──
  // These 7 categories were previously only lazy-seeded on first agent run, which
  // made Foundation Health show >100% (numerator exceeded denominator). Listing
  // them here keeps the seed list authoritative: `seedAll` pre-populates them for
  // new subscriber entities, and lazy-seed writes in services/agents remain as a
  // safety net for initial metadata defaults.
  //
  // Metadata routing (see buildSeedOps):
  //   - `insert_only_metadata: true` → $setOnInsert. Use for admin-tunable values
  //     (enabled flags, threshold knobs). Seed once, admin edits preserved forever.
  //   - default (no flag) → $set on every seed. Use for code-authoritative values
  //     (statutory BIR dates, OCR keyword maps) where engineers own the truth.

  // erp/services/erpNotificationService.js → getChannelConfig()
  // EMAIL/IN_APP default ON, SMS opt-in (requires SEMAPHORE_API_KEY + user.phone).
  NOTIFICATION_CHANNELS: [
    { code: 'EMAIL', label: 'Email notifications (master kill-switch, sits above per-user prefs)', insert_only_metadata: true, metadata: { enabled: true } },
    { code: 'IN_APP', label: 'In-app notifications (master kill-switch, sits above per-user prefs)', insert_only_metadata: true, metadata: { enabled: true } },
    { code: 'SMS', label: 'SMS notifications (opt-in, requires SEMAPHORE_API_KEY + user.phone)', insert_only_metadata: true, metadata: { enabled: false } },
  ],

  // erp/services/erpNotificationService.js → getEscalationConfig()
  // Default 3 hops up the reports_to chain; admin raises for deeper orgs.
  NOTIFICATION_ESCALATION: [
    { code: 'REPORTS_TO_MAX_HOPS', label: 'Max hops up the reports_to chain when escalating notifications (1..10)', insert_only_metadata: true, metadata: { value: 3 } },
  ],

  // erp/services/pdfRenderer.js → resolvePdfPreference()
  // Stays HTML-preview until admin flips enabled=true AND runs
  // `npm install puppeteer` in backend/. Heavyweight dep is opt-in per entity.
  PDF_RENDERER: [
    { code: 'BINARY_ENABLED', label: 'Enable binary PDF rendering for printable statements (requires puppeteer install)', insert_only_metadata: true, metadata: { enabled: false, engine: 'puppeteer', note: 'Flip enabled=true AND run "npm install puppeteer" in backend/ to emit real PDFs. Otherwise /statement/print emits HTML that the browser prints via Save-as-PDF.' } },
  ],

  // agents/taskOverdueAgent.js → loadCooldownDays()
  // GLOBAL applies to all tasks. 0 = no dedup (test only). Negative clamps to default.
  TASK_OVERDUE_COOLDOWN_DAYS: [
    { code: 'GLOBAL', label: 'Cooldown days between overdue notifications for the same task (0 = no dedup)', insert_only_metadata: true, metadata: { days: 1, value: 1 } },
  ],

  // agents/complianceDeadlineAgent.js → loadDeadlines()
  // STRUCTURAL metadata (statutory filing dates don't drift per entity) — re-sync
  // on seedAll is desirable so engineering can correct baseline data centrally.
  // Subscribers add entity-specific rows (DOH LTO, local permits) as NEW codes;
  // those are preserved because buildSeedOps only touches codes listed here.
  COMPLIANCE_DEADLINES: [
    { code: 'BIR_1601E', label: 'BIR 1601-E (monthly withholding)', metadata: { day_of_month: 10, months: 'every', description: 'Expanded withholding tax return, filed monthly' } },
    { code: 'BIR_2550M', label: 'BIR 2550-M (monthly VAT)', metadata: { day_of_month: 20, months: 'every', description: 'Monthly VAT declaration' } },
    { code: 'BIR_1701Q', label: 'BIR 1701-Q (quarterly income tax)', metadata: { day_of_month: 15, months: [5, 8, 11], description: 'Quarterly income tax return' } },
    { code: 'SSS_REMIT', label: 'SSS contribution remittance', metadata: { day_of_month: 10, months: 'every', description: 'SSS employer remittance' } },
    { code: 'PHIC_REMIT', label: 'PhilHealth remittance', metadata: { day_of_month: 15, months: 'every', description: 'PhilHealth employer remittance' } },
    { code: 'HDMF_REMIT', label: 'HDMF (Pag-IBIG) remittance', metadata: { day_of_month: 15, months: 'every', description: 'Pag-IBIG employer remittance' } },
  ],

  // agents/expansionReadinessAgent.js → loadConfig()
  // Defaults: PHP 500k monthly sales × 3 consecutive months to flag BDM for
  // graduation to subsidiary ownership. Admin raises the bar to slow promotion.
  EXPANSION_READINESS_CONFIG: [
    { code: 'DEFAULT', label: 'BDM graduation thresholds (monthly sales floor + consecutive months required)', insert_only_metadata: true, metadata: { bdm_graduation_monthly_sales_min: 500000, bdm_graduation_months_required: 3 } },
  ],

  // agents/kpiVarianceAgent.js → loadThresholds()
  // GLOBAL fallback. Per-KPI overrides are additional rows with code = KPI_CODE.
  KPI_VARIANCE_THRESHOLDS: [
    { code: 'GLOBAL', label: 'Fallback variance thresholds (applied when no per-KPI row exists)', insert_only_metadata: true, metadata: { warning_pct: 20, critical_pct: 40 } },
  ],

  // Phase G1.5 (Apr 2026) + Phase G1.6 — Per-Diem Rates per-role, subscription-ready.
  // Replaces Settings.PERDIEM_RATE_DEFAULT. Rule #3 + Rule #19: no hardcoded rates;
  // non-pharma subscribers seed their own rows without touching code.
  // Missing row for a role → resolvePerdiemConfig throws → payroll blocks loudly (Rule #21 "no silent fallbacks").
  //
  // eligibility_source (Phase G1.6 — all wired):
  //   visit   = CRM Visit model (pharma BDMs, default)
  //   logbook = CarLogbookEntry (POSTED + official_km>0 → 1 worked-day credit per day)
  //   manual  = user logs md_count by hand on the SMER (no auto-pull)
  //   none    = per-diem disabled for this role
  // skip_flagged:    true = visits flagged by admin (duplicate photo, bad GPS) do NOT earn per-diem
  // allow_weekend:   false = weekend visits do NOT earn per-diem (pharma default); true = count Sat/Sun
  // full_tier_threshold / half_tier_threshold:
  //   null   = defer to CompProfile → Settings chain (backward compat)
  //   number = per-role override. Precedence: CompProfile > PERDIEM_RATES > Settings.
  //            Example: delivery driver with full_tier_threshold=1 → any worked day
  //            (any POSTED CarLogbookEntry with official_km>0) triggers FULL per-diem.
  PERDIEM_RATES: [
    { code: 'BDM', label: 'BDM (pharma field rep) — visit-driven per-diem', insert_only_metadata: true, metadata: { rate_php: 800, eligibility_source: 'visit', skip_flagged: true, allow_weekend: false, full_tier_threshold: null, half_tier_threshold: null } },
    { code: 'ECOMMERCE_BDM', label: 'E-commerce BDM — visit-driven per-diem', insert_only_metadata: true, metadata: { rate_php: 800, eligibility_source: 'visit', skip_flagged: true, allow_weekend: false, full_tier_threshold: null, half_tier_threshold: null } },
    // Phase G1.6 — non-pharma example template. Delivery driver: any POSTED logbook
    // day with official_km > 0 triggers full per-diem (threshold=1). Weekends allowed.
    // Admin copies this row and adjusts rate/thresholds per subsidiary.
    { code: 'DELIVERY_DRIVER', label: 'Delivery driver — logbook-driven per-diem (example template)', insert_only_metadata: true, metadata: { rate_php: 500, eligibility_source: 'logbook', skip_flagged: false, allow_weekend: true, full_tier_threshold: 1, half_tier_threshold: 1 } },
  ],

  // Phase G1.5 — Philippine provinces (82 rows) for structured Doctor address.
  // code = ISO 3166-2:PH-like province code; label = human name; metadata.region = Luzon/Visayas/Mindanao macro bucket.
  PH_PROVINCES: [
    { code: 'ABR', label: 'Abra', metadata: { region: 'LUZON' } },
    { code: 'AGN', label: 'Agusan del Norte', metadata: { region: 'MINDANAO' } },
    { code: 'AGS', label: 'Agusan del Sur', metadata: { region: 'MINDANAO' } },
    { code: 'AKL', label: 'Aklan', metadata: { region: 'VISAYAS' } },
    { code: 'ALB', label: 'Albay', metadata: { region: 'LUZON' } },
    { code: 'ANT', label: 'Antique', metadata: { region: 'VISAYAS' } },
    { code: 'APA', label: 'Apayao', metadata: { region: 'LUZON' } },
    { code: 'AUR', label: 'Aurora', metadata: { region: 'LUZON' } },
    { code: 'BAS', label: 'Basilan', metadata: { region: 'MINDANAO' } },
    { code: 'BAN', label: 'Bataan', metadata: { region: 'LUZON' } },
    { code: 'BTN', label: 'Batanes', metadata: { region: 'LUZON' } },
    { code: 'BTG', label: 'Batangas', metadata: { region: 'LUZON' } },
    { code: 'BEN', label: 'Benguet', metadata: { region: 'LUZON' } },
    { code: 'BIL', label: 'Biliran', metadata: { region: 'VISAYAS' } },
    { code: 'BOH', label: 'Bohol', metadata: { region: 'VISAYAS' } },
    { code: 'BUK', label: 'Bukidnon', metadata: { region: 'MINDANAO' } },
    { code: 'BUL', label: 'Bulacan', metadata: { region: 'LUZON' } },
    { code: 'CAG', label: 'Cagayan', metadata: { region: 'LUZON' } },
    { code: 'CAN', label: 'Camarines Norte', metadata: { region: 'LUZON' } },
    { code: 'CAS', label: 'Camarines Sur', metadata: { region: 'LUZON' } },
    { code: 'CAM', label: 'Camiguin', metadata: { region: 'MINDANAO' } },
    { code: 'CAP', label: 'Capiz', metadata: { region: 'VISAYAS' } },
    { code: 'CAT', label: 'Catanduanes', metadata: { region: 'LUZON' } },
    { code: 'CAV', label: 'Cavite', metadata: { region: 'LUZON' } },
    { code: 'CEB', label: 'Cebu', metadata: { region: 'VISAYAS' } },
    { code: 'COM', label: 'Davao de Oro', metadata: { region: 'MINDANAO' } },
    { code: 'DAV', label: 'Davao del Norte', metadata: { region: 'MINDANAO' } },
    { code: 'DAS', label: 'Davao del Sur', metadata: { region: 'MINDANAO' } },
    { code: 'DVO', label: 'Davao Occidental', metadata: { region: 'MINDANAO' } },
    { code: 'DAO', label: 'Davao Oriental', metadata: { region: 'MINDANAO' } },
    { code: 'DIN', label: 'Dinagat Islands', metadata: { region: 'MINDANAO' } },
    { code: 'EAS', label: 'Eastern Samar', metadata: { region: 'VISAYAS' } },
    { code: 'GUI', label: 'Guimaras', metadata: { region: 'VISAYAS' } },
    { code: 'IFU', label: 'Ifugao', metadata: { region: 'LUZON' } },
    { code: 'ILN', label: 'Ilocos Norte', metadata: { region: 'LUZON' } },
    { code: 'ILS', label: 'Ilocos Sur', metadata: { region: 'LUZON' } },
    { code: 'ILI', label: 'Iloilo', metadata: { region: 'VISAYAS' } },
    { code: 'ISA', label: 'Isabela', metadata: { region: 'LUZON' } },
    { code: 'KAL', label: 'Kalinga', metadata: { region: 'LUZON' } },
    { code: 'LUN', label: 'La Union', metadata: { region: 'LUZON' } },
    { code: 'LAG', label: 'Laguna', metadata: { region: 'LUZON' } },
    { code: 'LAN', label: 'Lanao del Norte', metadata: { region: 'MINDANAO' } },
    { code: 'LAS', label: 'Lanao del Sur', metadata: { region: 'MINDANAO' } },
    { code: 'LEY', label: 'Leyte', metadata: { region: 'VISAYAS' } },
    { code: 'MAG', label: 'Maguindanao del Norte', metadata: { region: 'MINDANAO' } },
    { code: 'MGS', label: 'Maguindanao del Sur', metadata: { region: 'MINDANAO' } },
    { code: 'MAD', label: 'Marinduque', metadata: { region: 'LUZON' } },
    { code: 'MAS', label: 'Masbate', metadata: { region: 'LUZON' } },
    { code: 'MDC', label: 'Mindoro Occidental', metadata: { region: 'LUZON' } },
    { code: 'MDR', label: 'Mindoro Oriental', metadata: { region: 'LUZON' } },
    { code: 'MSC', label: 'Misamis Occidental', metadata: { region: 'MINDANAO' } },
    { code: 'MSR', label: 'Misamis Oriental', metadata: { region: 'MINDANAO' } },
    { code: 'MOU', label: 'Mountain Province', metadata: { region: 'LUZON' } },
    { code: 'NEC', label: 'Negros Occidental', metadata: { region: 'VISAYAS' } },
    { code: 'NER', label: 'Negros Oriental', metadata: { region: 'VISAYAS' } },
    { code: 'NSA', label: 'Northern Samar', metadata: { region: 'VISAYAS' } },
    { code: 'NUE', label: 'Nueva Ecija', metadata: { region: 'LUZON' } },
    { code: 'NUV', label: 'Nueva Vizcaya', metadata: { region: 'LUZON' } },
    { code: 'PLW', label: 'Palawan', metadata: { region: 'LUZON' } },
    { code: 'PAM', label: 'Pampanga', metadata: { region: 'LUZON' } },
    { code: 'PAN', label: 'Pangasinan', metadata: { region: 'LUZON' } },
    { code: 'QUE', label: 'Quezon', metadata: { region: 'LUZON' } },
    { code: 'QUI', label: 'Quirino', metadata: { region: 'LUZON' } },
    { code: 'RIZ', label: 'Rizal', metadata: { region: 'LUZON' } },
    { code: 'ROM', label: 'Romblon', metadata: { region: 'LUZON' } },
    { code: 'WSA', label: 'Samar', metadata: { region: 'VISAYAS' } },
    { code: 'SAR', label: 'Sarangani', metadata: { region: 'MINDANAO' } },
    { code: 'SIQ', label: 'Siquijor', metadata: { region: 'VISAYAS' } },
    { code: 'SOR', label: 'Sorsogon', metadata: { region: 'LUZON' } },
    { code: 'SCO', label: 'South Cotabato', metadata: { region: 'MINDANAO' } },
    { code: 'SLE', label: 'Southern Leyte', metadata: { region: 'VISAYAS' } },
    { code: 'SUK', label: 'Sultan Kudarat', metadata: { region: 'MINDANAO' } },
    { code: 'SLU', label: 'Sulu', metadata: { region: 'MINDANAO' } },
    { code: 'SUN', label: 'Surigao del Norte', metadata: { region: 'MINDANAO' } },
    { code: 'SUR', label: 'Surigao del Sur', metadata: { region: 'MINDANAO' } },
    { code: 'TAR', label: 'Tarlac', metadata: { region: 'LUZON' } },
    { code: 'TAW', label: 'Tawi-Tawi', metadata: { region: 'MINDANAO' } },
    { code: 'ZMB', label: 'Zambales', metadata: { region: 'LUZON' } },
    { code: 'ZAN', label: 'Zamboanga del Norte', metadata: { region: 'MINDANAO' } },
    { code: 'ZAS', label: 'Zamboanga del Sur', metadata: { region: 'MINDANAO' } },
    { code: 'ZSI', label: 'Zamboanga Sibugay', metadata: { region: 'MINDANAO' } },
    { code: 'MNL', label: 'Metro Manila', metadata: { region: 'LUZON' } },
    { code: 'NCR', label: 'NCR (National Capital Region)', metadata: { region: 'LUZON' } },
  ],

  // Phase G1.5 — Starter Philippine localities (cities + municipalities). Admin adds more via Control Center.
  // code = SLUG derived from label+province; metadata.type = 'city'|'municipality'; metadata.province_code matches PH_PROVINCES.code.
  // Seeded with major cities in VIP's market (Western Visayas, Mindanao) + Metro Manila. ~50 rows starter set.
  PH_LOCALITIES: [
    // Iloilo
    { code: 'ILOILO_CITY_ILI', label: 'Iloilo City', metadata: { type: 'city', province_code: 'ILI' } },
    { code: 'PASSI_ILI', label: 'Passi City', metadata: { type: 'city', province_code: 'ILI' } },
    { code: 'OTON_ILI', label: 'Oton', metadata: { type: 'municipality', province_code: 'ILI' } },
    { code: 'POTOTAN_ILI', label: 'Pototan', metadata: { type: 'municipality', province_code: 'ILI' } },
    { code: 'SANTA_BARBARA_ILI', label: 'Santa Barbara', metadata: { type: 'municipality', province_code: 'ILI' } },
    // Guimaras
    { code: 'JORDAN_GUI', label: 'Jordan', metadata: { type: 'municipality', province_code: 'GUI' } },
    // Capiz
    { code: 'ROXAS_CITY_CAP', label: 'Roxas City', metadata: { type: 'city', province_code: 'CAP' } },
    // Aklan
    { code: 'KALIBO_AKL', label: 'Kalibo', metadata: { type: 'municipality', province_code: 'AKL' } },
    // Antique
    { code: 'SAN_JOSE_ANT', label: 'San Jose de Buenavista', metadata: { type: 'municipality', province_code: 'ANT' } },
    // Negros Occidental
    { code: 'BACOLOD_CITY_NEC', label: 'Bacolod City', metadata: { type: 'city', province_code: 'NEC' } },
    { code: 'SILAY_NEC', label: 'Silay City', metadata: { type: 'city', province_code: 'NEC' } },
    { code: 'BAGO_NEC', label: 'Bago City', metadata: { type: 'city', province_code: 'NEC' } },
    { code: 'KABANKALAN_NEC', label: 'Kabankalan City', metadata: { type: 'city', province_code: 'NEC' } },
    // Negros Oriental
    { code: 'DUMAGUETE_NER', label: 'Dumaguete City', metadata: { type: 'city', province_code: 'NER' } },
    // Cebu
    { code: 'CEBU_CITY_CEB', label: 'Cebu City', metadata: { type: 'city', province_code: 'CEB' } },
    { code: 'MANDAUE_CEB', label: 'Mandaue City', metadata: { type: 'city', province_code: 'CEB' } },
    { code: 'LAPU_LAPU_CEB', label: 'Lapu-Lapu City', metadata: { type: 'city', province_code: 'CEB' } },
    { code: 'TOLEDO_CEB', label: 'Toledo City', metadata: { type: 'city', province_code: 'CEB' } },
    // Bohol
    { code: 'TAGBILARAN_BOH', label: 'Tagbilaran City', metadata: { type: 'city', province_code: 'BOH' } },
    // Leyte
    { code: 'TACLOBAN_LEY', label: 'Tacloban City', metadata: { type: 'city', province_code: 'LEY' } },
    { code: 'ORMOC_LEY', label: 'Ormoc City', metadata: { type: 'city', province_code: 'LEY' } },
    // Davao del Sur
    { code: 'DIGOS_DAS', label: 'Digos City', metadata: { type: 'city', province_code: 'DAS' } },
    // Davao del Norte
    { code: 'TAGUM_DAV', label: 'Tagum City', metadata: { type: 'city', province_code: 'DAV' } },
    { code: 'PANABO_DAV', label: 'Panabo City', metadata: { type: 'city', province_code: 'DAV' } },
    // Davao City is its own "province" equivalent but commonly grouped with Davao del Sur
    { code: 'DAVAO_CITY_DAS', label: 'Davao City', metadata: { type: 'city', province_code: 'DAS' } },
    // Misamis Oriental
    { code: 'CAGAYAN_DE_ORO_MSR', label: 'Cagayan de Oro City', metadata: { type: 'city', province_code: 'MSR' } },
    // Misamis Occidental
    { code: 'OZAMIZ_MSC', label: 'Ozamiz City', metadata: { type: 'city', province_code: 'MSC' } },
    // Zamboanga del Sur
    { code: 'ZAMBOANGA_CITY_ZAS', label: 'Zamboanga City', metadata: { type: 'city', province_code: 'ZAS' } },
    { code: 'PAGADIAN_ZAS', label: 'Pagadian City', metadata: { type: 'city', province_code: 'ZAS' } },
    // South Cotabato
    { code: 'GENSAN_SCO', label: 'General Santos City', metadata: { type: 'city', province_code: 'SCO' } },
    { code: 'KORONADAL_SCO', label: 'Koronadal City', metadata: { type: 'city', province_code: 'SCO' } },
    // Bukidnon
    { code: 'MALAYBALAY_BUK', label: 'Malaybalay City', metadata: { type: 'city', province_code: 'BUK' } },
    { code: 'VALENCIA_BUK', label: 'Valencia City', metadata: { type: 'city', province_code: 'BUK' } },
    // Agusan del Norte
    { code: 'BUTUAN_AGN', label: 'Butuan City', metadata: { type: 'city', province_code: 'AGN' } },
    // Surigao del Norte
    { code: 'SURIGAO_CITY_SUN', label: 'Surigao City', metadata: { type: 'city', province_code: 'SUN' } },
    // Metro Manila (selected — admin adds rest as needed)
    { code: 'MANILA_MNL', label: 'Manila', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'QUEZON_CITY_MNL', label: 'Quezon City', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'MAKATI_MNL', label: 'Makati', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'PASIG_MNL', label: 'Pasig', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'TAGUIG_MNL', label: 'Taguig', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'MANDALUYONG_MNL', label: 'Mandaluyong', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'PASAY_MNL', label: 'Pasay', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'PARANAQUE_MNL', label: 'Parañaque', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'LAS_PINAS_MNL', label: 'Las Piñas', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'MUNTINLUPA_MNL', label: 'Muntinlupa', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'CALOOCAN_MNL', label: 'Caloocan', metadata: { type: 'city', province_code: 'MNL' } },
    { code: 'MARIKINA_MNL', label: 'Marikina', metadata: { type: 'city', province_code: 'MNL' } },
    // Cavite/Laguna/Batangas starter cities
    { code: 'IMUS_CAV', label: 'Imus City', metadata: { type: 'city', province_code: 'CAV' } },
    { code: 'BACOOR_CAV', label: 'Bacoor City', metadata: { type: 'city', province_code: 'CAV' } },
    { code: 'STA_ROSA_LAG', label: 'Santa Rosa City', metadata: { type: 'city', province_code: 'LAG' } },
    { code: 'CALAMBA_LAG', label: 'Calamba City', metadata: { type: 'city', province_code: 'LAG' } },
    { code: 'BATANGAS_CITY_BTG', label: 'Batangas City', metadata: { type: 'city', province_code: 'BTG' } },
    { code: 'LIPA_BTG', label: 'Lipa City', metadata: { type: 'city', province_code: 'BTG' } },
  ],
  // Phase G4.5a — Proxy Entry eligible roles per module (April 2026).
  // Subscribers add/remove role codes from metadata.roles to delegate proxy entry
  // without code changes (Rule #3). Tick accompanies `<module>.proxy_entry` sub-perm
  // on the Access Template. Admin/finance/president are the pragmatic default.
  // Add 'staff' to allow a back-office clerk (staff role) to proxy.
  // CEO is always denied regardless of this list — view-only role.
  // Cache: 60s TTL in resolveOwnerScope.js; bust on lookup write.
  // `insert_only_metadata: true` is load-bearing — without it, buildSeedOps
  // $set's metadata.roles on every page load and silently reverts admin edits
  // (breaking Rule #3: subscribers must be able to configure via Control Center).
  PROXY_ENTRY_ROLES: [
    { code: 'SALES', label: 'Sales Entry (live CSI)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 1 } },
    { code: 'OPENING_AR', label: 'Opening AR Entry (pre-cutover CSI)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 2 } },
    { code: 'COLLECTIONS', label: 'Collection Receipts', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 3 } },
    { code: 'EXPENSES', label: 'Expense Entry / OR', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 4 } },
    { code: 'GRN', label: 'Goods Receipt (GRN)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 5 } },
    // Phase G4.5e (Apr 23, 2026) — Car Logbook, PRF/CALF, Undertaking. Unblocks
    // the BDMs→CRM-only / eBDMs→ERP-proxy policy. Car Logbook covers per-fuel
    // submits (fuel lives as a subdoc inside CarLogbookEntry). Undertaking is
    // submit-only (create path inherits from GRN). Subscribers with different
    // org models extend via Control Center → Lookup Tables → PROXY_ENTRY_ROLES.
    { code: 'CAR_LOGBOOK', label: 'Car Logbook (incl. per-fuel approval)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 6 } },
    { code: 'PRF_CALF', label: 'PRF (partner rebate) / CALF (company advance liquidation)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 7 } },
    { code: 'UNDERTAKING', label: 'Undertaking (GRN receipt confirmation)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 8 } },
    // Phase G4.5f (Apr 23, 2026) — SMER cycle + per-diem override. Append
    // 'staff' to metadata.roles in Control Center so eBDMs (Judy / Jay
    // Ann) with the EXPENSES__SMER_PROXY sub-perm can proxy.
    { code: 'SMER', label: 'SMER (per-diem cycle + per-day override)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 9 } },
  ],
  // Phase G4.5a follow-up — which roles are valid OWNERS of a proxied record
  // per module. Defaults to BDM-shaped roles (['staff']); admin/
  // finance/president/ceo are never per-BDM record owners (reports would break).
  // Subscribers with different org models extend via Control Center. Matches
  // the VALID_OWNER_ROLES cache in resolveOwnerScope.js.
  // `insert_only_metadata: true` — see PROXY_ENTRY_ROLES comment above. Same
  // revert-on-page-load bug applies here: without the flag, admin edits to
  // metadata.roles are clobbered every time getByCategory auto-seeds.
  VALID_OWNER_ROLES: [
    { code: 'SALES', label: 'Valid proxy targets — Sales', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 1 } },
    { code: 'OPENING_AR', label: 'Valid proxy targets — Opening AR', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 2 } },
    { code: 'COLLECTIONS', label: 'Valid proxy targets — Collections', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 3 } },
    { code: 'EXPENSES', label: 'Valid proxy targets — Expenses', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 4 } },
    { code: 'GRN', label: 'Valid proxy targets — GRN', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 5 } },
    // Phase G4.5e — matching owner-role allowlists for the three new proxy
    // modules. Defaults to BDM-shaped roles; subscribers extend via Control
    // Center (e.g. to add a supervisor/branch-manager role that also owns
    // per-territory Car Logbook records).
    { code: 'CAR_LOGBOOK', label: 'Valid proxy targets — Car Logbook', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 6 } },
    { code: 'PRF_CALF', label: 'Valid proxy targets — PRF / CALF', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 7 } },
    { code: 'UNDERTAKING', label: 'Valid proxy targets — Undertaking', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 8 } },
    // Phase G4.5f — SMER ownership stays BDM-shaped. Per-BDM per-diem reports,
    // CompProfile thresholds, and revolving-fund draws all key on bdm_id —
    // letting an admin or finance be a SMER owner would corrupt these.
    { code: 'SMER', label: 'Valid proxy targets — SMER', insert_only_metadata: true, metadata: { roles: ['staff'], sort_order: 9 } },
  ],
  // Phase P1 — Proxy SLA thresholds. Lookup-driven so subscribers can tune
  // without code changes. pending_alert_hours = when to alert office lead;
  // auto_ack_hours = when to auto-acknowledge stale BDM reviews.
  PROXY_SLA_THRESHOLDS: [
    { code: 'DEFAULT', label: 'Default Proxy SLA Thresholds', metadata: { pending_alert_hours: 24, auto_ack_hours: 72, description: 'Hours before SLA alert (pending) and auto-acknowledgment (review)' }, insert_only_metadata: true },
  ],
  // Phase G6 (Apr 26, 2026) — Cross-entity read allowlist per master-data
  // module. President-likes default to scope-by-selector (entity dropdown);
  // ?cross_entity=true on a list endpoint widens to all entities ONLY when the
  // caller's role appears in metadata.roles. Subscribers grant a consolidating
  // CFO/group-finance role cross-entity visibility via Control Center without
  // a code change (Rule #3). Matching cache busted in resolveEntityScope.js
  // (60s TTL) on lookup write. `insert_only_metadata: true` so admin edits to
  // metadata.roles survive auto-seed (same fix as PROXY_ENTRY_ROLES).
  CROSS_ENTITY_VIEW_ROLES: [
    { code: 'PEOPLE_MASTER', label: 'People Master — cross-entity view (?cross_entity=true)', insert_only_metadata: true, metadata: { roles: ['president', 'ceo'], sort_order: 1 } },
  ],
  // Phase VIP-1.A (Apr 26, 2026) — MD Partner Lead Pipeline.
  // Schema enum on Doctor.partnership_status is the validation gate; the lookup
  // drives display labels + pill colors so subscribers can rename / recolor
  // without a deploy (Rule #3). Codes match the schema enum 1-to-1 — adding a
  // new lookup row with an unrecognized code is harmless (UI shows it, but the
  // Doctor model rejects it on save).
  // `insert_only_metadata: true` — admin edits to color/description survive
  // lazy re-seeds (same posture as PROXY_ENTRY_ROLES).
  DOCTOR_PARTNERSHIP_STATUS: [
    { code: 'LEAD',      label: 'Lead',      insert_only_metadata: true, metadata: { bg: '#dbeafe', fg: '#1d4ed8', sort_order: 1, description: 'Discovered MD; not yet contacted.' } },
    { code: 'CONTACTED', label: 'Contacted', insert_only_metadata: true, metadata: { bg: '#cffafe', fg: '#0891b2', sort_order: 2, description: 'BDM has reached out (call / Viber / Messenger).' } },
    { code: 'VISITED',   label: 'Visited',   insert_only_metadata: true, metadata: { bg: '#fef3c7', fg: '#b45309', sort_order: 3, description: 'In-person meeting completed; partnership pitched.' } },
    { code: 'PARTNER',   label: 'Partner',   insert_only_metadata: true, metadata: { bg: '#dcfce7', fg: '#15803d', sort_order: 4, description: 'Signed partnership agreement on file (rebate gate #2).' } },
    { code: 'INACTIVE',  label: 'Inactive',  insert_only_metadata: true, metadata: { bg: '#f3f4f6', fg: '#6b7280', sort_order: 5, description: 'Dormant / declined / out-of-network.' } },
  ],
  DOCTOR_LEAD_SOURCE: [
    { code: 'BDM_MANUAL',          label: 'BDM Manual Entry',           insert_only_metadata: true, metadata: { sort_order: 1, description: 'BDM added the MD directly through the CRM.' } },
    { code: 'CUSTOMER_ATTESTATION', label: 'Customer Attestation',       insert_only_metadata: true, metadata: { sort_order: 2, description: 'Patient told the storefront which MD prescribed (VIP-1.D).' } },
    { code: 'RX_PARSE',             label: 'Prescription OCR',           insert_only_metadata: true, metadata: { sort_order: 3, description: 'Storefront Rx OCR matched a doctor signature (VIP-1.D).' } },
    { code: 'IMPORT',               label: 'Bulk Import',                insert_only_metadata: true, metadata: { sort_order: 4, description: 'Loaded via Excel / CPT / migration script.' } },
    { code: 'OTHER',                label: 'Other',                      insert_only_metadata: true, metadata: { sort_order: 5, description: 'Catch-all — note the actual source in partnership_notes.' } },
  ],
  // mdPartnerAccess.js reads metadata.roles for each code with 60s TTL cache.
  // Keep in lock-step with DEFAULT_VIEW_LEADS / DEFAULT_MANAGE_PARTNERSHIP /
  // DEFAULT_SET_AGREEMENT_DATE in backend/utils/mdPartnerAccess.js — the helper
  // falls back to those constants if the lookup is missing/unreadable.
  MD_PARTNER_ROLES: [
    { code: 'VIEW_LEADS',         label: 'View MD Lead pipeline',                 insert_only_metadata: true, metadata: { roles: ['admin', 'president'], sort_order: 1, description: 'See /admin/md-leads + counts. BDMs view their own assignees from VIP Client list regardless.' } },
    { code: 'MANAGE_PARTNERSHIP', label: 'Drive LEAD/CONTACTED/VISITED transitions', insert_only_metadata: true, metadata: { roles: ['admin', 'president'], sort_order: 2, description: 'Cross-record management. BDM-on-own-record bypass enforced separately in controller.' } },
    { code: 'SET_AGREEMENT_DATE', label: 'Promote to PARTNER (rebate gate #2)',   insert_only_metadata: true, metadata: { roles: ['admin', 'president'], sort_order: 3, description: 'Locks rebate eligibility — keep narrow. President-only is a safer posture once VIP-1.B ships.' } },
  ],
  // ── Phase VIP-1.H (Apr 2026) — SC/PWD Sales Book + BIR Sales Book exports ──
  // scpwdAccess.js reads metadata.roles for each code with 60s TTL cache.
  // Default posture is admin + finance (NOT president) — BIR audit-reportable
  // exports should travel through accountability roles for traceability.
  // Subscribers in jurisdictions outside PH can repurpose this category for
  // their own discount-register access gates without code changes.
  SCPWD_ROLES: [
    { code: 'VIEW_REGISTER',      label: 'View SC/PWD Sales Book register',          insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 1, description: 'Read-only access to the SC/PWD register page + filters. Wider than CREATE/EXPORT because executives review without writing.' } },
    { code: 'CREATE_ENTRY',       label: 'Create / ingest SC/PWD entries',           insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 2, description: 'Manual entry posting + idempotent ingest from ERP Sale POSTED. Storefront ingest (VIP-1.D) uses the same gate.' } },
    { code: 'EXPORT_MONTHLY',     label: 'Export monthly BIR register (RR 7-2010)',  insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 3, description: 'CSV/PDF export of the monthly SC/PWD sales book. Audit-logged with period + who exported.' } },
    { code: 'EXPORT_VAT_RECLAIM', label: 'Export Input VAT Credit Worksheet (Form 2306)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 4, description: 'BIR Form 2306 input-VAT reclaim worksheet — narrow gate; first-time exports should be reviewed by accountant before filing.' } },
  ],
  // ID-format regex per jurisdiction. PH defaults seeded; subscribers in other
  // markets override per-entity. Pre-save in SalesBookSCPWD.js validates the
  // ID against this regex (permissive fallback if lookup unreachable).
  SCPWD_ID_FORMATS: [
    { code: 'OSCA_PH', label: 'PH OSCA Senior Citizen ID',  insert_only_metadata: true, metadata: { regex: '^[A-Z0-9-]{4,20}$', sort_order: 1, description: 'OSCA-issued IDs vary by LGU; permissive 4-20 alphanumeric/dash range covers most LGU formats. Tighten per municipality if needed.' } },
    { code: 'PWD_PH',  label: 'PH DSWD PWD ID',             insert_only_metadata: true, metadata: { regex: '^[A-Z0-9-]{4,20}$', sort_order: 2, description: 'DSWD-issued PWD IDs (RA 7277/9442). Some LGUs use 13-character formats; admin can tighten per municipality.' } },
  ],
  // ── Phase VIP-1.B (Apr 2026) — Rebate + Commission Engine role gates ───
  // rebateCommissionAccess.js reads metadata.roles for each code with 60s
  // TTL cache. Defaults reflect the Apr 26 strategy memo: MD-rebate matrix
  // management is admin/president (senior decision); non-MD matrix +
  // payout ops are admin/finance; views include president for executive
  // oversight. Subscribers reconfigure via Control Center → Lookup Tables.
  REBATE_ROLES: [
    { code: 'MANAGE_MD_MATRIX',    label: 'Manage MD rebate matrix (Tier-A + Tier-B)',     insert_only_metadata: true, metadata: { roles: ['admin', 'president'], sort_order: 1, description: 'Edit MdProductRebate + MdCapitationRule rows. Senior gate — these decisions lock rebate eligibility per the 3-gate.' } },
    { code: 'MANAGE_NONMD_MATRIX', label: 'Manage non-MD partner rebate matrix',           insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 2, description: 'Edit NonMdPartnerRebateRule rows. Replaces error-prone manual partner_tags rebate_pct entry per CSI.' } },
    { code: 'VIEW_PAYOUTS',        label: 'View rebate payout ledger',                     insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 3, description: 'Read-only access to RebatePayout ledger. Includes ACCRUING / READY_TO_PAY / PAID / VOIDED states.' } },
    { code: 'RUN_MONTHLY_CLOSE',   label: 'Run monthly close (ACCRUING → READY_TO_PAY)',   insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 4, description: 'Trigger period-close that flips ACCRUING payouts to READY_TO_PAY and generates PRFs in batch.' } },
    { code: 'MARK_PAID',           label: 'Mark payout PAID (after PRF posts)',            insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 5, description: 'Manual PAID status flip — usually auto-set when PRF.status → POSTED. Manual gate exists for exceptional cases.' } },
    { code: 'EXPORT_BIR_2307',     label: 'Export BIR Form 2307 (CWT for partner rebates)', insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 6, description: 'CWT certificate generation for partner rebates if jurisdiction requires withholding. Audit-logged.' } },
  ],
  COMMISSION_ROLES: [
    { code: 'MANAGE_RULES',        label: 'Manage staff commission matrix',                insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 1, description: 'Edit StaffCommissionRule (BDM + ECOMM_REP + AREA_BDM). Compensation policy gate — wider than rebate matrix because finance owns it.' } },
    { code: 'VIEW_PAYOUTS',        label: 'View commission payout ledger',                 insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president'], sort_order: 2, description: 'Read-only access to CommissionPayout ledger across all payee_role tabs.' } },
    { code: 'OVERRIDE_AUTO_RATES', label: 'Override auto-filled rates on Collection',      insert_only_metadata: true, metadata: { roles: ['admin', 'finance'], sort_order: 3, description: 'Manual override of Collection.settled_csis[].commission_rate when admin disagrees with the matrix walk. Audit-logged with reason.' } },
  ],
  // ── UI label categories (no role gates; just labels + colors for badges) ──
  REBATE_PAYOUT_STATUS: [
    { code: 'ACCRUING',     label: 'Accruing',        insert_only_metadata: true, metadata: { bg: '#fef3c7', fg: '#92400e', sort_order: 1, description: 'Computed from a Collection POST or Order.paid; awaiting period close.' } },
    { code: 'READY_TO_PAY', label: 'Ready to Pay',    insert_only_metadata: true, metadata: { bg: '#dbeafe', fg: '#1e40af', sort_order: 2, description: 'Period closed and PRF generated; awaiting Finance posting.' } },
    { code: 'PAID',         label: 'Paid',            insert_only_metadata: true, metadata: { bg: '#dcfce7', fg: '#15803d', sort_order: 3, description: 'PRF POSTED → cash sent → JE landed.' } },
    { code: 'VOIDED',       label: 'Voided',          insert_only_metadata: true, metadata: { bg: '#f3f4f6', fg: '#6b7280', sort_order: 4, description: 'Cancelled (Collection reopened, reversed, etc.). Terminal — re-accrue creates a new row.' } },
  ],
  STAFF_COMMISSION_PAYEE_ROLE: [
    { code: 'BDM',        label: 'BDM (ERP collection)', insert_only_metadata: true, metadata: { sort_order: 1, description: 'Existing pre-VIP-1.B flow. Commission accrues from Collection POSTED. Falls back to CompProfile.commission_rate when no rule matches.' } },
    { code: 'ECOMM_REP',  label: 'E-commerce Rep',       insert_only_metadata: true, metadata: { sort_order: 2, description: 'Storefront Order.paid → commission accrual via Order.ecomm_rep_id. No fallback — explicit rule required.' } },
    { code: 'AREA_BDM',   label: 'Area BDM (territory)',  insert_only_metadata: true, metadata: { sort_order: 3, description: 'Storefront geographic territory commission. Resolved by Order.shipping_address.province ↔ Territory.provinces[].' } },
  ],
  REBATE_SOURCE_KIND: [
    { code: 'TIER_A_PRODUCT',    label: 'Tier-A (per-product %)',  insert_only_metadata: true, metadata: { sort_order: 1, description: 'MdProductRebate matched on Collection CSI line. High-value, audit-gated by 3-gate.' } },
    { code: 'TIER_B_CAPITATION', label: 'Tier-B (per-patient capitation)', insert_only_metadata: true, metadata: { sort_order: 2, description: 'MdCapitationRule matched on storefront Order, frequency-windowed.' } },
    { code: 'NON_MD',            label: 'Non-MD partner',          insert_only_metadata: true, metadata: { sort_order: 3, description: 'NonMdPartnerRebateRule matched. Pharmacist staff, hospital admin, etc. Not 3-gated.' } },
  ],
  MD_CAPITATION_FREQUENCY: [
    { code: 'PER_PATIENT_PER_MONTH',   label: 'Per patient per month',   insert_only_metadata: true, metadata: { sort_order: 1, description: 'One accrual per (patient, MD) per calendar month.' } },
    { code: 'PER_PATIENT_PER_QUARTER', label: 'Per patient per quarter', insert_only_metadata: true, metadata: { sort_order: 2, description: 'One accrual per (patient, MD) per calendar quarter.' } },
    { code: 'PER_PATIENT_PER_YEAR',    label: 'Per patient per year',    insert_only_metadata: true, metadata: { sort_order: 3, description: 'One accrual per (patient, MD) per calendar year.' } },
    { code: 'PER_ORDER',               label: 'Every qualifying order',  insert_only_metadata: true, metadata: { sort_order: 4, description: 'No window — every Order.paid that matches accrues. Use sparingly.' } },
  ],
  PATIENT_MD_ATTRIBUTION_SOURCE: [
    { code: 'RX_PARSE',             label: 'Prescription OCR',     insert_only_metadata: true, metadata: { sort_order: 1, description: 'Storefront Rx OCR matched a doctor signature (VIP-1.D).' } },
    { code: 'CUSTOMER_ATTESTATION', label: 'Customer Attestation', insert_only_metadata: true, metadata: { sort_order: 2, description: 'Patient told the storefront which MD prescribed.' } },
    { code: 'STAFF_ENTRY',          label: 'Staff Entry',          insert_only_metadata: true, metadata: { sort_order: 3, description: 'Pharmacist tagged the order with the MD post-fact.' } },
    { code: 'IMPORT',               label: 'Bulk Import',          insert_only_metadata: true, metadata: { sort_order: 4, description: 'Loaded via migration script.' } },
    { code: 'OTHER',                label: 'Other',                insert_only_metadata: true, metadata: { sort_order: 5, description: 'Catch-all — note the actual source in attribution notes.' } },
  ],

  // Phase N offline-first sprint — list of URL prefixes the OfflineRouteGuard
  // blocks when the device is offline. Each `code` is treated as a prefix.
  // Subscribers can add/remove rows via Control Center → Lookup Tables
  // without a code deployment (Rule #3, subscription-readiness). Frontend
  // falls back to DEFAULT_OFFLINE_REQUIRED in OfflineRouteGuard.jsx if the
  // category is empty/missing — no risk of silently letting financial pages
  // through during a Lookup outage.
  //
  // Rationale for blocking each prefix is on the row's metadata.description.
  // Lookup-driven so the future Pharmacy SaaS spin-out can start with a
  // narrower or wider set per tenant.
  OFFLINE_REQUIRED_PATHS: [
    { code: '/erp/expenses',          label: 'Expenses (financial — needs Approval Hub)',   insert_only_metadata: true, metadata: { sort_order: 10,  description: 'Expense submission goes through the Approval Hub authority gate. Queueing offline would break period-lock + double-posting guarantees.' } },
    { code: '/erp/prfcalf',           label: 'PRF / CALF (financial)',                       insert_only_metadata: true, metadata: { sort_order: 20,  description: 'Petty cash + cash advance liquidations route through the same approval engine as expenses. Online-only.' } },
    { code: '/erp/smer',              label: 'SMER (financial — per-diem)',                  insert_only_metadata: true, metadata: { sort_order: 30,  description: 'Per-diem cycles emit JEs and trigger BIR / payroll touches on submit. Online-only.' } },
    { code: '/erp/car-logbook',       label: 'Car Logbook (fuel reimbursement)',             insert_only_metadata: true, metadata: { sort_order: 40,  description: 'Fuel receipts post to the per-month car-logbook ledger; queueing is incompatible with monthly close.' } },
    { code: '/erp/approvals',         label: 'Approval Hub',                                 insert_only_metadata: true, metadata: { sort_order: 50,  description: 'Approve / reject decisions ratify financial postings. Must be done with the authoritative server state.' } },
    { code: '/erp/control-center',    label: 'ERP Control Center',                           insert_only_metadata: true, metadata: { sort_order: 60,  description: 'Settings / lookups / agent config change shared state. Online-only to keep cache invalidation deterministic.' } },
    { code: '/erp/people',            label: 'HR — People records',                          insert_only_metadata: true, metadata: { sort_order: 70,  description: 'PII updates need server validation + audit logging.' } },
    { code: '/erp/payroll',           label: 'Payroll runs',                                 insert_only_metadata: true, metadata: { sort_order: 80,  description: 'Payroll posts JEs + BIR + government contributions. Online-only.' } },
    { code: '/erp/banking',           label: 'Banking / Bank Accounts',                      insert_only_metadata: true, metadata: { sort_order: 90,  description: 'Bank reconciliation requires live snapshots.' } },
    { code: '/erp/journal-entries',   label: 'Manual Journal Entries',                       insert_only_metadata: true, metadata: { sort_order: 100, description: 'Custom JEs hit the GL directly.' } },
    { code: '/erp/period-locks',      label: 'Period Locks',                                 insert_only_metadata: true, metadata: { sort_order: 110, description: 'Lock / unlock decisions affect every poster.' } },
    { code: '/erp/sales/entry',       label: 'Sales — New CSI',                              insert_only_metadata: true, metadata: { sort_order: 120, description: 'Sales submission posts inventory + AR + JE in one transaction.' } },
    { code: '/erp/sales/opening-ar',  label: 'Opening AR entry',                             insert_only_metadata: true, metadata: { sort_order: 130, description: 'Opening balances need server-side validation against the entity\'s chart of accounts.' } },
    { code: '/erp/grn',               label: 'GRN — Goods Receipt',                          insert_only_metadata: true, metadata: { sort_order: 140, description: 'GRN posts inventory + AP. Approval-gated.' } },
    { code: '/erp/undertaking',       label: 'Undertaking Hub',                              insert_only_metadata: true, metadata: { sort_order: 150, description: 'Undertaking approvals shift stock between BDMs.' } },
    { code: '/erp/dr',                label: 'Delivery Receipts',                            insert_only_metadata: true, metadata: { sort_order: 160, description: 'DR converts to invoice; needs live customer state.' } },
    { code: '/erp/collections',       label: 'Collections session / AR',                     insert_only_metadata: true, metadata: { sort_order: 170, description: 'Receipts post to AR + bank ledger.' } },
    { code: '/erp/transfer-orders',   label: 'IC Transfer Orders',                           insert_only_metadata: true, metadata: { sort_order: 180, description: 'Inter-company transfers cross entity boundaries.' } },
    { code: '/erp/credit-notes',      label: 'Credit Notes',                                 insert_only_metadata: true, metadata: { sort_order: 190, description: 'Credit notes reverse AR + recompute VAT chain.' } },
    { code: '/erp/customers',         label: 'Customer Master',                              insert_only_metadata: true, metadata: { sort_order: 200, description: 'Master data writes need entity-scoped validation.' } },
    { code: '/erp/vendors',           label: 'Vendor Master',                                insert_only_metadata: true, metadata: { sort_order: 210, description: 'Master data writes need entity-scoped validation.' } },
    { code: '/erp/purchase-orders',   label: 'Purchase Orders',                              insert_only_metadata: true, metadata: { sort_order: 220, description: 'PO posts AP commitments.' } },
    { code: '/erp/petty-cash',        label: 'Petty Cash',                                   insert_only_metadata: true, metadata: { sort_order: 230, description: 'Cash float reconciliation needs live state.' } },
    { code: '/erp/income',            label: 'Income (BDM)',                                 insert_only_metadata: true, metadata: { sort_order: 240, description: 'Income posting drives payroll and KPIs.' } },
    { code: '/admin/control-center',  label: 'Admin Control Center (CRM)',                   insert_only_metadata: true, metadata: { sort_order: 300, description: 'CRM settings change shared state across all BDMs.' } },
    { code: '/admin/settings',        label: 'CRM Settings',                                 insert_only_metadata: true, metadata: { sort_order: 310, description: 'Same rationale as Control Center — admin writes affect every user.' } },
  ],

  // Phase N offline-first sprint — title/body templates for the self-DM
  // system-event endpoint (POST /api/messages/system-event). When an entity
  // wants to localize the wording or add a custom event_type, edit the rows
  // here. Server falls back to inline DEFAULT_EVENT_TEMPLATES in
  // backend/controllers/messageInboxController.js if the lookup is missing.
  //
  // Templates use {variable} substitution; the renderer fills:
  //   {synced} {bytes} {bytes_human} {megabytes} {remaining}
  //   {draft_id} {reason} {kind_label} {completed_at}
  // Unknown variables render empty.
  SYSTEM_EVENT_TEMPLATES: [
    { code: 'SYNC_COMPLETE', label: 'Auto-sync completed', insert_only_metadata: true, metadata: { sort_order: 10, category: 'system', priority: 'low', titleTemplate: 'Synced {synced} {kind_label} (~{megabytes} MB)', bodyTemplate: 'Your offline drafts replayed automatically when connectivity returned.\n\nItems synced: {synced}\nApprox data used: {megabytes} MB ({bytes_human}).\nPending: {remaining}\nCompleted at: {completed_at}', description: 'Fired after every non-empty replay run. Drives the auto-sync inbox audit trail so BDMs can audit data spend.' } },
    { code: 'SYNC_ERROR', label: 'Sync error (generic)', insert_only_metadata: true, metadata: { sort_order: 20, category: 'system', priority: 'normal', titleTemplate: 'Offline sync error — {kind_label} could not replay', bodyTemplate: 'A queued offline item could not be restored or accepted by the server.\n\nKind: {kind_label}\nReason: {reason}\nReference: {draft_id}\n\nOpen the Sync Errors tray on your dashboard to retry or discard.', description: 'Generic catch-all for sync failures other than visit-photos-lost.' } },
    { code: 'VISIT_DRAFT_LOST', label: 'Visit draft photos lost', insert_only_metadata: true, metadata: { sort_order: 30, category: 'system', priority: 'normal', titleTemplate: 'Visit draft photos lost — please re-capture', bodyTemplate: 'A queued offline visit could not be replayed because its photos are no longer available locally (browser storage may have been cleared).\n\nReference: {draft_id}\nReason: {reason}\n\nOpen the Sync Errors tray on your dashboard to dismiss this entry.', description: 'Specifically the VIP_VISIT_DRAFT_LOST path from sw.js when rebuildVisitFormData returns null.' } },
  ],

  // ── Phase VIP-1.J (Apr 2026) — BIR Compliance Suite (J0 foundation) ──
  // Four lookup categories drive the BIR Compliance Dashboard at /erp/bir.
  // Subscribers configure per-entity via Control Center → Lookup Tables; the
  // birAccess.js helper falls back to inline DEFAULTS if the lookup is
  // unreachable so the dashboard never goes dark on a Lookup outage.
  //
  // BIR_FORMS_CATALOG — every BIR form the dashboard tracks. Subscribers in
  // jurisdictions outside PH disable rows by setting is_active: false; new
  // jurisdictions add rows with their own form codes (RA-pillar-portable).
  BIR_FORMS_CATALOG: [
    { code: '2550M',    label: 'BIR 2550M — Monthly VAT Declaration',           insert_only_metadata: true, metadata: { sort_order: 10,  frequency: 'MONTHLY',   due_day: 25, channel: 'eBIRForms_typed', requires_vat: true,          tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Monthly VAT — vatable, zero-rated, exempt sales + input VAT credit. Phase J1.' } },
    { code: '2550Q',    label: 'BIR 2550Q — Quarterly VAT Return',              insert_only_metadata: true, metadata: { sort_order: 20,  frequency: 'QUARTERLY', due_day: 25, channel: 'eBIRForms_typed', requires_vat: true,          tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Quarterly VAT consolidating three monthly 2550M filings. Phase J1.' } },
    { code: '1601-EQ',  label: 'BIR 1601-EQ — Quarterly Expanded Withholding',  insert_only_metadata: true, metadata: { sort_order: 30,  frequency: 'QUARTERLY', due_day: 31, channel: 'eBIRForms_typed', requires_withholding: true,  tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'EWT on professional fees, rent, contractor payments. Phase J2.' } },
    { code: '1601-C',   label: 'BIR 1601-C — Monthly Compensation Withholding', insert_only_metadata: true, metadata: { sort_order: 40,  frequency: 'MONTHLY',   due_day: 10, channel: 'eBIRForms_typed', requires_payroll: true,      tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Withholding on regular employee compensation. Phase J3.' } },
    { code: '1606',     label: 'BIR 1606 — Withholding on Real Property',       insert_only_metadata: true, metadata: { sort_order: 50,  frequency: 'MONTHLY',   due_day: 10, channel: 'eBIRForms_typed', requires_rent: true,         tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: '5% withholding on rent paid to landlords. Phase J2.' } },
    { code: '2307-OUT', label: 'BIR 2307 (outbound) — CWT Certificate to Payee', insert_only_metadata: true, metadata: { sort_order: 60, frequency: 'PER_PAYEE', due_day: 20, channel: 'PDF',             requires_withholding: true,  tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'PDF certificate issued to each payee from whom we withheld. Phase J2.' } },
    { code: '2307-IN',  label: 'BIR 2307 (inbound) — CWT Certificates Received', insert_only_metadata: true, metadata: { sort_order: 70, frequency: 'PER_PAYOR', due_day: 0,  channel: 'INTERNAL',         requires_collections: true,  tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Tracking 2307s received from hospitals; rolled into 1702 income tax credit. Phase J6.' } },
    { code: 'SAWT',     label: 'SAWT — Summary Alphalist of Withholding Tax',   insert_only_metadata: true, metadata: { sort_order: 80,  frequency: 'QUARTERLY', due_day: 31, channel: 'ADE_dat',          requires_withholding: true,  tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Quarterly alphalist .dat file imported into Alphalist Data Entry. Phase J2.' } },
    { code: 'QAP',      label: 'QAP — Quarterly Alphalist of Payees',           insert_only_metadata: true, metadata: { sort_order: 90,  frequency: 'QUARTERLY', due_day: 31, channel: 'ADE_dat',          requires_withholding: true,  tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Quarterly alphalist of all payees from whom we withheld. Phase J4.' } },
    { code: '1604-CF',  label: 'BIR 1604-CF — Annual Compensation Alphalist',   insert_only_metadata: true, metadata: { sort_order: 100, frequency: 'ANNUAL',    due_month: 1, due_day: 31, channel: 'ADE_dat', requires_payroll: true, tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Annual alphalist for employees (Schedules 7.1, 7.2, 7.3). Phase J3.' } },
    { code: '1604-E',   label: 'BIR 1604-E — Annual Expanded Alphalist',        insert_only_metadata: true, metadata: { sort_order: 110, frequency: 'ANNUAL',    due_month: 3, due_day: 1,  channel: 'ADE_dat', requires_withholding: true, tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Annual alphalist for non-employee payees (vendors, contractors, hospitals). Phase J4.' } },
    { code: 'SCPWD',    label: 'SC/PWD Sales Book (RR 7-2010)',                  insert_only_metadata: true, metadata: { sort_order: 120, frequency: 'MONTHLY',   due_day: 25, channel: 'BIR_LOOSELEAF',    requires_storefront: true,   tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'], description: 'Already shipped in VIP-1.H. Surfaced on dashboard for status visibility.' } },
    { code: '1702',     label: 'BIR 1702 — Annual Income Tax Return (Corp)',    insert_only_metadata: true, metadata: { sort_order: 200, frequency: 'ANNUAL',    due_month: 4, due_day: 15, channel: 'eBIRForms_typed', tax_types: ['CORP', 'OPC', 'PARTNERSHIP'],                description: 'Annual income tax for corporations. Phase J7.' } },
    { code: '1701',     label: 'BIR 1701 — Annual Income Tax Return (Indiv)',   insert_only_metadata: true, metadata: { sort_order: 210, frequency: 'ANNUAL',    due_month: 4, due_day: 15, channel: 'eBIRForms_typed', tax_types: ['SOLE_PROP'],                                description: 'Annual income tax for sole proprietorships. Phase J7 (stub if no SOLE_PROP entity).' } },
    { code: 'BOOKS',    label: 'Books of Accounts (Loose-Leaf)',                 insert_only_metadata: true, metadata: { sort_order: 300, frequency: 'ANNUAL',    due_month: 12, due_day: 31, channel: 'BIR_LOOSELEAF', tax_types: ['CORP', 'OPC', 'SOLE_PROP', 'PARTNERSHIP'],   description: 'Sales / Purchase / GJ / GL / Cash Receipts / Cash Disbursements PDFs. Phase J5.' } },
  ],

  // BIR_FILING_STATUS — status colors + transitions for the dashboard heatmap.
  // Editable so subscribers can localize labels.
  BIR_FILING_STATUS: [
    { code: 'DATA_INCOMPLETE', label: 'Data Incomplete', insert_only_metadata: true, metadata: { sort_order: 10, bg: '#fef2f2', fg: '#991b1b', description: 'TIN/address blockers prevent export. Run the Data Quality scan.' } },
    { code: 'DRAFT',           label: 'Draft',           insert_only_metadata: true, metadata: { sort_order: 20, bg: '#fef9c3', fg: '#854d0e', description: 'Numbers computed; awaiting president review before export.' } },
    { code: 'REVIEWED',        label: 'Reviewed',        insert_only_metadata: true, metadata: { sort_order: 30, bg: '#dbeafe', fg: '#1e40af', description: 'President signed off; bookkeeper may export and file.' } },
    { code: 'FILED',           label: 'Filed',           insert_only_metadata: true, metadata: { sort_order: 40, bg: '#e0e7ff', fg: '#3730a3', description: 'Bookkeeper marked filed. Awaiting BIR confirmation email.' } },
    { code: 'CONFIRMED',       label: 'Confirmed',       insert_only_metadata: true, metadata: { sort_order: 50, bg: '#dcfce7', fg: '#15803d', description: 'BIR confirmation email parsed; reference number stored. Period locked.' } },
    { code: 'OVERDUE',         label: 'Overdue',         insert_only_metadata: true, metadata: { sort_order: 60, bg: '#fee2e2', fg: '#b91c1c', description: 'Past due date and not FILED. Surfaced for escalation.' } },
  ],

  // BIR_ATC_CODES — the BIR Alphanumeric Tax Code catalog. Drives ATC selection
  // on WithholdingLedger entries (Phase J2). Subscribers can extend per their
  // own jurisdiction; the inline list covers the most common pharma/distribution
  // touch points. Rate is the standard percentage (override per-payee allowed
  // when a payee certifies a different rate via BIR Form 1901/1902/1905).
  BIR_ATC_CODES: [
    { code: 'WC158', label: 'WC158 — Income payments to medical practitioners (1%)',                    insert_only_metadata: true, metadata: { sort_order: 10,  rate: 0.01,  applies_to: 'HOSPITAL', form: '2307', description: 'Hospital pays VIP for products → hospital withholds 1% of payment. INBOUND for VIP.' } },
    { code: 'WI010', label: 'WI010 — Professional fees (individual, ≤ ₱720k YTD: 5%)',                   insert_only_metadata: true, metadata: { sort_order: 20,  rate: 0.05,  applies_to: 'CONTRACTOR_INDIV_LOW',  form: '1601-EQ', description: 'BDMs, pharmacists, individual consultants below threshold. Phase J2.' } },
    { code: 'WI011', label: 'WI011 — Professional fees (individual, > ₱720k YTD: 10%)',                  insert_only_metadata: true, metadata: { sort_order: 30,  rate: 0.10,  applies_to: 'CONTRACTOR_INDIV_HIGH', form: '1601-EQ', description: 'Same payee crossing the YTD threshold flips to 10%.' } },
    { code: 'WC010', label: 'WC010 — Professional fees (juridical, ≤ ₱720k YTD: 10%)',                   insert_only_metadata: true, metadata: { sort_order: 40,  rate: 0.10,  applies_to: 'CONTRACTOR_CORP_LOW',   form: '1601-EQ', description: 'Corporate consultant payee.' } },
    { code: 'WC011', label: 'WC011 — Professional fees (juridical, > ₱720k YTD: 15%)',                   insert_only_metadata: true, metadata: { sort_order: 50,  rate: 0.15,  applies_to: 'CONTRACTOR_CORP_HIGH',  form: '1601-EQ', description: 'Corporate payee above the threshold.' } },
    { code: 'WI160', label: 'WI160 — Rent (real property, individual lessor: 5%)',                       insert_only_metadata: true, metadata: { sort_order: 60,  rate: 0.05,  applies_to: 'LANDLORD_INDIV',        form: '1606',     description: 'Office/warehouse/retail space rent paid to an individual landlord.' } },
    { code: 'WC160', label: 'WC160 — Rent (real property, corporate lessor: 5%)',                        insert_only_metadata: true, metadata: { sort_order: 70,  rate: 0.05,  applies_to: 'LANDLORD_CORP',         form: '1606',     description: 'Rent paid to a corporate landlord.' } },
    { code: 'WI100', label: 'WI100 — Compensation (regular employee — graduated table)',                 insert_only_metadata: true, metadata: { sort_order: 80,  rate: 'GRADUATED', applies_to: 'EMPLOYEE',          form: '1601-C',   description: 'Compensation withholding via BIR graduated tax table. Computed in payslipCalc.js.' } },
    { code: 'WC120', label: 'WC120 — 13th-month + bonuses exceeding ₱90,000',                            insert_only_metadata: true, metadata: { sort_order: 90,  rate: 'GRADUATED', applies_to: 'EMPLOYEE_BONUS',    form: '1601-C',   description: 'Excess over the 13th-month exemption is taxable compensation income.' } },
    { code: 'WI080', label: 'WI080 — Goods purchased from top-withholding-agent payees (1%)',            insert_only_metadata: true, metadata: { sort_order: 100, rate: 0.01,  applies_to: 'TWA_GOODS',             form: '1601-EQ', description: 'Only applies if Entity.top_withholding_agent = true.' } },
    { code: 'WI081', label: 'WI081 — Services purchased from top-withholding-agent payees (2%)',         insert_only_metadata: true, metadata: { sort_order: 110, rate: 0.02,  applies_to: 'TWA_SERVICES',          form: '1601-EQ', description: 'Only applies if Entity.top_withholding_agent = true.' } },
  ],

  // BIR_ROLES — lookup-driven access gates per scope. Mirrors SCPWD_ROLES
  // pattern (lazy-seed-from-defaults, 60s TTL cache, lookup edits invalidate).
  // Default posture: admin + finance own everything; president has VIEW; the
  // new bookkeeper role is added per-entity via the Lookup Manager when a
  // subscriber hires a bookkeeper. Subscribers can add bookkeeper to MARK_FILED
  // without granting them any payroll/commission access (those gates are
  // separate; see BIR_FILING role-set in roles.js for sidebar visibility).
  BIR_ROLES: [
    { code: 'VIEW_DASHBOARD',    label: 'View BIR Compliance Dashboard',                  insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president', 'bookkeeper'], sort_order: 1, description: 'Read-only access to /erp/bir + form detail pages. Wider than FILED/CONFIRMED gates.' } },
    { code: 'EXPORT_FORM',       label: 'Export BIR form (CSV / PDF / .dat)',             insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'bookkeeper'],              sort_order: 2, description: 'Download form artifacts. Audit-logged with content hash so re-exports are detectable.' } },
    { code: 'MARK_REVIEWED',     label: 'Mark form REVIEWED (president sign-off)',         insert_only_metadata: true, metadata: { roles: ['admin', 'president'],                          sort_order: 3, description: 'President-style review gate before bookkeeper files. Subscriber can collapse to admin-only.' } },
    { code: 'MARK_FILED',        label: 'Mark form FILED (after eBIR submission)',         insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'bookkeeper'],              sort_order: 4, description: 'Bookkeeper records that they submitted via eBIR Forms. Stores BIR reference number.' } },
    { code: 'MARK_CONFIRMED',    label: 'Mark form CONFIRMED (manual override)',           insert_only_metadata: true, metadata: { roles: ['admin', 'finance'],                            sort_order: 5, description: 'Manual confirmation when the email-parser bridge cannot match (e.g., subject-line variance).' } },
    { code: 'RUN_DATA_AUDIT',    label: 'Trigger Data Quality scan on demand',             insert_only_metadata: true, metadata: { roles: ['admin', 'finance', 'president', 'bookkeeper'], sort_order: 6, description: 'Run the TIN + address completeness sweep ad-hoc. Nightly cron always runs regardless.' } },
    { code: 'MANAGE_TAX_CONFIG', label: 'Edit per-entity tax config (TIN, RDO, tax_type)', insert_only_metadata: true, metadata: { roles: ['admin', 'president'],                          sort_order: 7, description: 'Senior gate — wrong TIN/RDO breaks every export and every alphalist row.' } },
  ],
};

// List all distinct categories for current entity
exports.getCategories = catchAsync(async (req, res) => {
  const filter = {};
  if (req.entityId) filter.entity_id = req.entityId;
  const categories = await Lookup.distinct('category', filter);
  // Merge with seed defaults to show all available categories
  const allCategories = [...new Set([...categories, ...Object.keys(SEED_DEFAULTS)])].sort();
  res.json({ success: true, data: allCategories });
});

// Helper: build bulkWrite ops from seed defaults (supports string or {code,label} items)
// Label/sort_order are $setOnInsert so admin customizations survive.
//
// Metadata routing (admin-owned by default as of the scalability flip):
//   1. item.code_authoritative_metadata: true (per-item override) → $set
//      Use when a row inside an admin-owned category is engineer-tuned.
//   2. item.insert_only_metadata: true (per-item override) → $setOnInsert
//      Use when a row inside an engineer-owned category is admin-tunable
//      (carve-out). Also used as explicit documentation of admin intent;
//      functionally equivalent to the default now.
//   3. category ∈ CODE_AUTHORITATIVE_METADATA_CATEGORIES → $set
//      Engineer owns the metadata for all rows; central code updates
//      propagate on next page load.
//   4. default → $setOnInsert
//      Admin edits survive re-seeds. This is the Rule #3-aligned default
//      (subscribers configure via Control Center without code changes).
//
// The old default was $set. It was flipped when PROXY_ENTRY_ROLES.metadata.roles
// was silently reverted on every page load, blocking eBDMs from being added as
// proxy-entry roles. Every SEED_DEFAULTS row was audited; engineer-owned rows
// stayed $set via the category allowlist above.
function buildSeedOps(defaults, category, entityId, userId) {
  // Phase G6.10/G7 — billable AI features default OFF so the president must
  // explicitly enable them after reviewing prompts/budgets. All other lookup
  // categories keep the original is_active:true default so dropdowns work
  // immediately on first load.
  const defaultActive = !SUBSCRIPTION_OPT_IN_CATEGORIES.has(category);
  const categoryIsCodeAuthoritative = CODE_AUTHORITATIVE_METADATA_CATEGORIES.has(category);
  return defaults.map((item, i) => {
    const isObj = typeof item === 'object';
    const label = isObj ? item.label : item;
    const code = isObj ? item.code.toUpperCase() : label.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const metadata = isObj ? (item.metadata || {}) : {};
    const adminOwnedOverride = isObj && item.insert_only_metadata === true;
    const engineerOwnedOverride = isObj && item.code_authoritative_metadata === true;
    // Resolution order: per-item override > category default > global default (admin-owned).
    const useSetSemantics = engineerOwnedOverride
      || (categoryIsCodeAuthoritative && !adminOwnedOverride);
    const op = {
      updateOne: {
        filter: { entity_id: entityId, category, code },
        update: {
          $setOnInsert: { label, sort_order: i * 10, is_active: defaultActive, created_by: userId },
        },
        upsert: true
      }
    };
    if (Object.keys(metadata).length > 0) {
      if (useSetSemantics) {
        // Engineer owns: dot-notation $set so code-owned keys propagate while
        // admin-added keys (if any) are preserved.
        op.updateOne.update.$set = {};
        for (const [k, v] of Object.entries(metadata)) {
          op.updateOne.update.$set[`metadata.${k}`] = v;
        }
      } else {
        // Admin owns: seed defaults on first insert only. Admin edits via the
        // Lookup Manager survive subsequent page loads and seedAll runs.
        op.updateOne.update.$setOnInsert.metadata = metadata;
      }
    }
    return op;
  });
}

// List items in a category (auto-seeds if empty and defaults exist)
exports.getByCategory = catchAsync(async (req, res) => {
  const filter = { category: req.params.category.toUpperCase() };
  if (req.entityId) filter.entity_id = req.entityId;
  if (req.query.active_only === 'true') filter.is_active = true;
  let items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();

  // Auto-seed: merge missing defaults (uses $setOnInsert so existing entries are never overwritten)
  if (req.entityId && SEED_DEFAULTS[filter.category]) {
    const ops = buildSeedOps(SEED_DEFAULTS[filter.category], filter.category, req.entityId, req.user?._id);
    if (ops.length > 0) {
      await Lookup.bulkWrite(ops);
      if (items.length === 0 || ops.length > items.length) {
        items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();
      }
    }
  }

  res.json({ success: true, data: items });
});

// Batch fetch — multiple categories in one request
// GET /erp/lookup-values-batch?categories=CAT1,CAT2,CAT3&active_only=true
exports.getBatch = catchAsync(async (req, res) => {
  const raw = req.query.categories || '';
  const categories = raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (categories.length === 0) return res.status(400).json({ success: false, message: 'categories query param required' });

  const result = {};
  for (const category of categories) {
    const filter = { category };
    if (req.entityId) filter.entity_id = req.entityId;
    if (req.query.active_only === 'true') filter.is_active = true;
    let items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();

    // Auto-seed: merge missing defaults
    if (req.entityId && SEED_DEFAULTS[category]) {
      const ops = buildSeedOps(SEED_DEFAULTS[category], category, req.entityId, req.user?._id);
      if (ops.length > 0) {
        await Lookup.bulkWrite(ops);
        if (items.length === 0 || ops.length > items.length) {
          items = await Lookup.find(filter).sort({ sort_order: 1, label: 1 }).lean();
        }
      }
    }
    result[category] = items;
  }

  res.json({ success: true, data: result });
});

// Create a lookup item
exports.create = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required. President must select a working entity first.' });
  const { category, code, label, sort_order, metadata } = req.body;
  const cat = category.toUpperCase();
  const item = await Lookup.create({
    entity_id: req.entityId,
    category: cat,
    code: code.toUpperCase(),
    label,
    sort_order: sort_order || 0,
    metadata: metadata || {},
    created_by: req.user._id
  });
  if (EXPENSE_CLASSIFIER_CATEGORIES.has(cat)) invalidateRulesCache();
  if (OR_PARSER_LOOKUP_CATEGORIES.has(cat)) invalidateOrParserCache();
  if (VENDOR_AUTO_LEARN_CATEGORIES.has(cat)) invalidateGuardrailCache();
  if (DANGER_SUB_PERM_CATEGORIES.has(cat)) invalidateDangerCache(req.entityId);
  if (REJECTION_CONFIG_CATEGORIES.has(cat)) invalidateEditableStatuses(req.entityId, item.code);
  if (PROXY_ENTRY_ROLES_CATEGORIES.has(cat)) invalidateProxyRolesCache(req.entityId);
  if (VALID_OWNER_ROLES_CATEGORIES.has(cat)) invalidateValidOwnerRolesCache(req.entityId);
  if (CROSS_ENTITY_VIEW_ROLES_CATEGORIES.has(cat)) invalidateCrossEntityRolesCache(req.entityId);
  if (SCPWD_ROLES_CATEGORIES.has(cat)) invalidateScpwdRolesCache(req.entityId);
  if (REBATE_COMMISSION_ROLES_CATEGORIES.has(cat)) invalidateRebateCommissionCache(req.entityId);
  if (BIR_ROLES_CATEGORIES.has(cat)) invalidateBirRolesCache(req.entityId);
  res.status(201).json({ success: true, data: item });
});

// Update a lookup item
exports.update = catchAsync(async (req, res) => {
  const allowed = ['label', 'sort_order', 'is_active', 'metadata'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  // Entity-scope the update — without it, admin at entity A could mutate
  // entity B's lookup row (label/metadata/is_active) by guessing the id.
  // Lookup rows govern dropdowns, role lists, COA codes, danger sub-perms,
  // proxy roles — Rule #3 anchor surface, high blast radius. President
  // bypass for cross-entity admin tooling.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const item = await Lookup.findOneAndUpdate(filter, { $set: updates }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  if (EXPENSE_CLASSIFIER_CATEGORIES.has(item.category)) invalidateRulesCache();
  if (OR_PARSER_LOOKUP_CATEGORIES.has(item.category)) invalidateOrParserCache();
  if (VENDOR_AUTO_LEARN_CATEGORIES.has(item.category)) invalidateGuardrailCache();
  if (DANGER_SUB_PERM_CATEGORIES.has(item.category)) invalidateDangerCache(item.entity_id);
  if (REJECTION_CONFIG_CATEGORIES.has(item.category)) invalidateEditableStatuses(item.entity_id, item.code);
  if (PROXY_ENTRY_ROLES_CATEGORIES.has(item.category)) invalidateProxyRolesCache(item.entity_id);
  if (VALID_OWNER_ROLES_CATEGORIES.has(item.category)) invalidateValidOwnerRolesCache(item.entity_id);
  if (CROSS_ENTITY_VIEW_ROLES_CATEGORIES.has(item.category)) invalidateCrossEntityRolesCache(item.entity_id);
  if (SCPWD_ROLES_CATEGORIES.has(item.category)) invalidateScpwdRolesCache(item.entity_id);
  if (REBATE_COMMISSION_ROLES_CATEGORIES.has(item.category)) invalidateRebateCommissionCache(item.entity_id);
  if (BIR_ROLES_CATEGORIES.has(item.category)) invalidateBirRolesCache(item.entity_id);
  res.json({ success: true, data: item });
});

// Delete a lookup item (soft — set is_active=false)
exports.remove = catchAsync(async (req, res) => {
  // Entity-scope the soft-delete — same risk as update (cross-entity lookup
  // tampering). President bypass for admin tooling.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const item = await Lookup.findOneAndUpdate(filter, { $set: { is_active: false } }, { new: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  if (EXPENSE_CLASSIFIER_CATEGORIES.has(item.category)) invalidateRulesCache();
  if (OR_PARSER_LOOKUP_CATEGORIES.has(item.category)) invalidateOrParserCache();
  if (VENDOR_AUTO_LEARN_CATEGORIES.has(item.category)) invalidateGuardrailCache();
  if (DANGER_SUB_PERM_CATEGORIES.has(item.category)) invalidateDangerCache(item.entity_id);
  if (REJECTION_CONFIG_CATEGORIES.has(item.category)) invalidateEditableStatuses(item.entity_id, item.code);
  if (PROXY_ENTRY_ROLES_CATEGORIES.has(item.category)) invalidateProxyRolesCache(item.entity_id);
  if (VALID_OWNER_ROLES_CATEGORIES.has(item.category)) invalidateValidOwnerRolesCache(item.entity_id);
  if (CROSS_ENTITY_VIEW_ROLES_CATEGORIES.has(item.category)) invalidateCrossEntityRolesCache(item.entity_id);
  if (SCPWD_ROLES_CATEGORIES.has(item.category)) invalidateScpwdRolesCache(item.entity_id);
  if (REBATE_COMMISSION_ROLES_CATEGORIES.has(item.category)) invalidateRebateCommissionCache(item.entity_id);
  if (BIR_ROLES_CATEGORIES.has(item.category)) invalidateBirRolesCache(item.entity_id);
  res.json({ success: true, data: item, message: 'Item deactivated' });
});

// Seed defaults for a category (upsert — won't overwrite existing; merges metadata)
exports.seedCategory = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required. President must select a working entity first.' });
  const category = req.params.category.toUpperCase();
  const defaults = SEED_DEFAULTS[category];
  if (!defaults) return res.status(400).json({ success: false, message: `No defaults for category: ${category}` });

  const ops = buildSeedOps(defaults, category, req.entityId, req.user._id);
  await Lookup.bulkWrite(ops);
  // Bust caches when OCR-related or permission-gating categories change
  if (EXPENSE_CLASSIFIER_CATEGORIES.has(category)) invalidateRulesCache();
  if (OR_PARSER_LOOKUP_CATEGORIES.has(category)) invalidateOrParserCache();
  if (VENDOR_AUTO_LEARN_CATEGORIES.has(category)) invalidateGuardrailCache();
  if (DANGER_SUB_PERM_CATEGORIES.has(category)) invalidateDangerCache(req.entityId);
  if (REJECTION_CONFIG_CATEGORIES.has(category)) invalidateEditableStatuses(req.entityId);
  if (PROXY_ENTRY_ROLES_CATEGORIES.has(category)) invalidateProxyRolesCache(req.entityId);
  if (VALID_OWNER_ROLES_CATEGORIES.has(category)) invalidateValidOwnerRolesCache(req.entityId);
  if (CROSS_ENTITY_VIEW_ROLES_CATEGORIES.has(category)) invalidateCrossEntityRolesCache(req.entityId);
  if (SCPWD_ROLES_CATEGORIES.has(category)) invalidateScpwdRolesCache(req.entityId);
  if (REBATE_COMMISSION_ROLES_CATEGORIES.has(category)) invalidateRebateCommissionCache(req.entityId);
  if (BIR_ROLES_CATEGORIES.has(category)) invalidateBirRolesCache(req.entityId);
  const items = await Lookup.find({ entity_id: req.entityId, category }).sort({ sort_order: 1 }).lean();
  res.json({ success: true, data: items, message: `Seeded ${defaults.length} defaults for ${category}` });
});

// Seed ALL categories at once
exports.seedAll = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required. President must select a working entity first.' });
  const results = {};
  for (const [category, defaults] of Object.entries(SEED_DEFAULTS)) {
    const ops = buildSeedOps(defaults, category, req.entityId, req.user._id);
    const result = await Lookup.bulkWrite(ops);
    results[category] = { defaults: defaults.length, inserted: result.upsertedCount };
  }
  // Bust expense classifier + OR parser + vendor auto-learn caches after bulk seed
  invalidateRulesCache();
  invalidateOrParserCache();
  invalidateGuardrailCache();
  // Phase 3c — bulk seed adds Tier 2 danger keys that need to be picked up immediately
  // (without waiting for the 5-minute TTL). Per-category seed already invalidates; mirror
  // that for seedAll so a fresh entity gets the Access Template editor working right away.
  invalidateDangerCache(req.entityId);
  invalidateEditableStatuses(req.entityId);
  invalidateProxyRolesCache(req.entityId);
  invalidateValidOwnerRolesCache(req.entityId);
  invalidateCrossEntityRolesCache(req.entityId);
  const populated = await Lookup.distinct('category', { entity_id: req.entityId });
  res.json({ success: true, data: results, message: `Seeded ${populated.length}/${Object.keys(SEED_DEFAULTS).length} categories` });
});

// Get seed defaults (for frontend to show available categories)
exports.getSeedDefaults = catchAsync(async (req, res) => {
  const summary = {};
  for (const [cat, items] of Object.entries(SEED_DEFAULTS)) {
    summary[cat] = { count: items.length, sample: items.slice(0, 3) };
  }
  res.json({ success: true, data: summary });
});

// Export for use by controlCenterController health check
exports.SEED_DEFAULTS = SEED_DEFAULTS;
