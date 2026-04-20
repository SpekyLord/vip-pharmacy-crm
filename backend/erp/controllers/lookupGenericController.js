const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');
const { invalidateRulesCache } = require('../services/expenseClassifier');
const { invalidateOrParserCache } = require('../ocr/parsers/orParser');
const { invalidateGuardrailCache } = require('../services/vendorAutoLearner');
const { invalidateDangerCache } = require('../services/dangerSubPermissions');

// Categories whose changes must bust the OR parser's lookup cache (couriers/payment keywords)
const OR_PARSER_LOOKUP_CATEGORIES = new Set(['OCR_COURIER_ALIASES', 'OCR_PAYMENT_KEYWORDS']);
// Categories whose changes must bust the expense classifier's keyword-rules cache
const EXPENSE_CLASSIFIER_CATEGORIES = new Set(['OCR_EXPENSE_RULES', 'EXPENSE_CATEGORY']);
// Categories whose changes must bust the vendor auto-learn guardrail cache (blocklist/thresholds)
const VENDOR_AUTO_LEARN_CATEGORIES = new Set(['VENDOR_AUTO_LEARN_BLOCKLIST', 'VENDOR_AUTO_LEARN_THRESHOLDS']);
// Categories whose changes must bust the danger-sub-perm cache (explicit-grant allowlist)
const DANGER_SUB_PERM_CATEGORIES = new Set(['ERP_DANGER_SUB_PERMISSIONS']);

// Phase G6.10/G7 — categories whose seeded rows must default is_active: false so
// subscribers explicitly opt in (Anthropic-billable features, spend caps that
// could surprise-block in-flight calls). Without this, the first AgentSettings
// load auto-seeds via getByCategory → buildSeedOps → is_active: true and the
// President Copilot / Daily Briefing / spend cap go live before the president
// has a chance to review prompts and budget.
const SUBSCRIPTION_OPT_IN_CATEGORIES = new Set(['AI_COWORK_FEATURES', 'AI_SPEND_CAPS']);

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
  PERSON_TYPE: ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'SALES_REP', 'CONSULTANT', 'DIRECTOR'],
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
  POSITION: ['BDM', 'eBDM', 'Sales Manager', 'Admin Staff', 'Finance Staff', 'President', 'Operations Head'],
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
    { code: 'FINANCIAL', label: 'Financial', metadata: { description: 'Involves money movement — requires president/finance approval', modules: ['EXPENSES', 'PURCHASING', 'PAYROLL', 'JOURNAL', 'BANKING', 'PETTY_CASH', 'IC_TRANSFER', 'INCOME', 'PRF_CALF', 'PERDIEM_OVERRIDE', 'DEDUCTION_SCHEDULE', 'INCENTIVE_PAYOUT'] } },
    { code: 'OPERATIONAL', label: 'Operational', metadata: { description: 'Document processing & verification — can be delegated to admin/finance', modules: ['SALES', 'INVENTORY', 'KPI', 'SMER', 'CAR_LOGBOOK', 'COLLECTION', 'SALES_GOAL_PLAN'] } },
  ],
  APPROVAL_MODULE: [
    // Authority Matrix modules (Phase 29) — with financial/operational category.
    // Collection entry lives below under the Universal Approval Hub block
    // (Phase F.1) as the singular canonical key 'COLLECTION' — that's what
    // gateApproval() sends, so rules must be filed under that code.
    { code: 'SALES', label: 'Sales', metadata: { category: 'OPERATIONAL' } },
    { code: 'EXPENSES', label: 'Expenses', metadata: { category: 'FINANCIAL' } },
    { code: 'PURCHASING', label: 'Purchasing', metadata: { category: 'FINANCIAL' } },
    { code: 'PAYROLL', label: 'Payroll', metadata: { category: 'FINANCIAL' } },
    { code: 'INVENTORY', label: 'Inventory', metadata: { category: 'OPERATIONAL' } },
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
  SALARY_TYPE: ['FIXED_SALARY', 'COMMISSION_BASED', 'HYBRID'],
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
    { code: 'BDM', label: 'BDM → Contractor', metadata: { person_type: 'BDM', system_role: ROLES.CONTRACTOR } },
    { code: 'ECOMMERCE_BDM', label: 'eBDM → Contractor', metadata: { person_type: 'ECOMMERCE_BDM', system_role: ROLES.CONTRACTOR } },
    { code: 'SALES_REP', label: 'Sales Rep → Contractor', metadata: { person_type: 'SALES_REP', system_role: ROLES.CONTRACTOR } },
    { code: 'CONSULTANT', label: 'Consultant → Contractor', metadata: { person_type: 'CONSULTANT', system_role: ROLES.CONTRACTOR } },
    { code: 'EMPLOYEE', label: 'Employee → Contractor', metadata: { person_type: 'EMPLOYEE', system_role: ROLES.CONTRACTOR } },
    { code: 'DIRECTOR', label: 'Director → President', metadata: { person_type: 'DIRECTOR', system_role: ROLES.PRESIDENT } },
  ],
  SYSTEM_ROLE: [
    { code: 'ADMIN', label: 'Admin', metadata: { description: 'System administrator' } },
    { code: 'CONTRACTOR', label: 'Contractor', metadata: { description: 'BDMs, IT, cleaners, pharmacists, consultants — all non-management workers' } },
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
    // Collections
    { code: 'COLLECTIONS__REOPEN', label: 'Re-open Posted Collections', metadata: { module: 'collections', key: 'reopen', sort_order: 1 } },
    // Expenses
    { code: 'EXPENSES__BATCH_UPLOAD', label: 'Batch OR Upload (OCR)', metadata: { module: 'expenses', key: 'batch_upload', sort_order: 1 } },
    { code: 'EXPENSES__REOPEN', label: 'Re-open Posted Expenses', metadata: { module: 'expenses', key: 'reopen', sort_order: 2 } },
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
  MESSAGE_CATEGORY: ['announcement', 'payroll', 'leave', 'policy', 'system', 'compliance_alert', 'other', 'ai_coaching', 'ai_schedule', 'ai_alert'],
  MESSAGE_PRIORITY: ['normal', 'important', 'high'],
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
    { code: 'COLLECTION', label: 'Collections / CR', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated collection receipts' } },
    { code: 'SMER', label: 'SMER', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated travel/expense reimbursements' } },
    { code: 'CAR_LOGBOOK', label: 'Car Logbook', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated car logbook entries' } },
    // Phase 31R follow-up — CreditNote posting authority. Subscribers can set
    // metadata.roles = null for open-post (any BDM can post returns without approval).
    { code: 'CREDIT_NOTE', label: 'Credit Notes / Returns', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post product returns / sales-returns credit notes' } },
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
    { code: 'MESSAGING', label: 'Messaging / Inbox', metadata: { roles: ['president', 'ceo', 'admin', 'finance', 'contractor', 'employee'], description: 'Allow this role to use the unified Inbox. Per-role DM matrix lives in MESSAGE_ACCESS_ROLES; sub-perm grants in ERP_SUB_PERMISSION (messaging.*).' } },
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
  // Default (seeded): only BDM. Subscribers add ECOMMERCE_BDM, SALES_REP,
  // Sales Manager, Territory Manager, etc. via Control Center → Lookup Tables —
  // zero code change required. Codes MUST exactly match PERSON_TYPE lookup codes.
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
    { code: 'COLLECTION',        label: 'Collections / CR — Rejection Config', metadata: { rejected_status: 'ERROR', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'Collection receipts rejected from Approval Hub' } },
    { code: 'SMER',              label: 'SMER — Rejection Config',            metadata: { rejected_status: 'ERROR',  reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'SMER documents rejected from Approval Hub' } },
    { code: 'CAR_LOGBOOK',       label: 'Car Logbook — Rejection Config',     metadata: { rejected_status: 'ERROR',  reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'Car logbook entries rejected from Approval Hub (batch reject affects entire period+cycle)' } },
    { code: 'EXPENSES',          label: 'Expenses (ORE/ACCESS) — Rejection Config', metadata: { rejected_status: 'ERROR', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'ERROR'],      banner_tone: 'danger', description: 'Expense entries rejected from Approval Hub' } },
    { code: 'PRF_CALF',          label: 'PRF / CALF — Rejection Config',      metadata: { rejected_status: 'ERROR',  reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'ERROR'],            banner_tone: 'danger', description: 'PRF/CALF documents rejected from Approval Hub' } },
    { code: 'INVENTORY',         label: 'GRN (Goods Receipt) — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'PENDING', 'REJECTED'], banner_tone: 'danger', description: 'GRN entries rejected from Approval Hub' } },
    { code: 'PAYROLL',           label: 'Payslips — Rejection Config',        metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['COMPUTED', 'REJECTED'],     banner_tone: 'danger', description: 'Payslips rejected from Approval Hub (reopens for recomputation)' } },
    { code: 'INCOME',            label: 'Income Reports — Rejection Config',  metadata: { rejected_status: 'RETURNED', reason_field: 'return_reason',    resubmit_allowed: true,  editable_statuses: ['GENERATED', 'RETURNED'],    banner_tone: 'warning', description: 'Income reports returned by reviewer for edit (RETURNED status preserves prior review chain)' } },
    { code: 'KPI',               label: 'KPI Ratings — Rejection Config',     metadata: { rejected_status: 'RETURNED', reason_field: 'return_reason',    resubmit_allowed: true,  editable_statuses: ['SUBMITTED', 'RETURNED'],    banner_tone: 'warning', description: 'KPI self-ratings returned by reviewer for edit' } },
    { code: 'DEDUCTION_SCHEDULE', label: 'Deduction Schedules — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'reject_reason', resubmit_allowed: true, editable_statuses: ['PENDING_APPROVAL', 'REJECTED'], banner_tone: 'danger', description: 'Deduction schedules rejected from Approval Hub' } },
    { code: 'PERDIEM_OVERRIDE',  label: 'Per Diem Override — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'decision_reason', resubmit_allowed: false, editable_statuses: [],                          banner_tone: 'warning', description: 'Per diem overrides are embedded entries inside SMER — reason surfaces on the parent SMER, no standalone resubmit' } },
    { code: 'APPROVAL_REQUEST',  label: 'Authority Matrix Request — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'decision_reason', resubmit_allowed: false, editable_statuses: [],                      banner_tone: 'warning', description: 'ApprovalRequest itself — lives in Approval Hub history, not resubmitted directly' } },

    // ── Group B — placeholders pending G6.7 dedicated reject handlers ──
    // G6.7 adds matching `rejection_reason` fields + handlers in universalApprovalController.
    // These rows are seeded now so the lookup is complete; they activate when G6.7 lands.
    { code: 'JOURNAL',           label: 'Journal Entries — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Journal entries rejected from Approval Hub (pending G6.7 handler wiring)' } },
    { code: 'BANKING',           label: 'Banking — Rejection Config',         metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Bank transactions rejected from Approval Hub (pending G6.7 handler wiring)' } },
    { code: 'PETTY_CASH',        label: 'Petty Cash — Rejection Config',      metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Petty cash transactions rejected from Approval Hub (pending G6.7 handler wiring)' } },
    { code: 'IC_TRANSFER',       label: 'Inter-Company Transfer — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['DRAFT', 'REJECTED'], banner_tone: 'danger', description: 'Inter-company transfers and settlements rejected from Approval Hub (pending G6.7 handler wiring)' } },
    { code: 'PURCHASING',        label: 'Purchasing — Rejection Config',      metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Purchase orders / supplier invoices rejected from Approval Hub (pending G6.7 handler wiring)' } },
    { code: 'SALES_GOAL_PLAN',   label: 'Sales Goal Plan — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true,  editable_statuses: ['DRAFT', 'REJECTED'],         banner_tone: 'danger', description: 'Annual sales goal plans rejected from Approval Hub (pending G6.7 handler wiring)' } },
    { code: 'INCENTIVE_PAYOUT',  label: 'Incentive Payouts — Rejection Config', metadata: { rejected_status: 'REJECTED', reason_field: 'rejection_reason', resubmit_allowed: true, editable_statuses: ['ACCRUED', 'REJECTED'],      banner_tone: 'danger', description: 'Incentive payouts rejected from Approval Hub (pending G6.7 handler wiring)' } },
  ],

  // ── Phase G6.10 — AI Cowork Features (president-managed, lookup-driven) ──
  // Each row defines one Claude-powered assist surface. President can toggle is_active,
  // edit prompt/model/role/limits per-entity from Control Center → AI Cowork tab.
  // Adding a new AI cowork surface = new row, no code change. The runtime
  // (`approvalAiService`) reads metadata at request time — Rule #3 compliant.
  //
  // metadata schema:
  //   surface: 'approver' | 'contractor'   — which side renders the button
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
        surface: 'contractor',
        endpoint_key: 'approval-fix-helper',
        system_prompt: 'You are an ERP submission assistant. Given a rejected document and the approver\'s reason, explain in 1-2 short sentences what needs to change, then list the specific edits as bullet points. Be concrete — reference actual fields. End with a one-line summary of the resubmit checklist.',
        user_template: 'Module: {{module}}\nDoc: {{doc_ref}}\nRejection reason: {{reason}}\nDoc summary: {{summary}}\n\nExplain what to fix and how.',
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        temperature: 0.3,
        allowed_roles: ['employee', 'contractor', 'bdm', 'admin', 'finance', 'president'],
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
        surface: 'contractor',
        endpoint_key: 'approval-fix-check',
        system_prompt: 'You are an ERP pre-submit reviewer. Compare the original rejection reason against the document\'s current state. Reply with: PASS or FAIL on the first line, then 1-2 sentences explaining what still needs work (or confirming the fix addresses the original feedback).',
        user_template: 'Module: {{module}}\nDoc: {{doc_ref}}\nOriginal rejection reason: {{reason}}\nCurrent doc state: {{summary}}\n\nDoes the fix address the rejection?',
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        temperature: 0.2,
        allowed_roles: ['employee', 'contractor', 'bdm', 'admin', 'finance', 'president'],
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
        allowed_roles: ['president', 'ceo', 'admin', 'finance', 'contractor'],
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
        allowed_roles: ['president', 'ceo', 'admin', 'finance', 'contractor'],
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
        allowed_roles: ['president', 'ceo', 'admin', 'finance', 'contractor'],
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
// Metadata is always merged ($set) so updated defaults propagate to existing entries.
// Label/sort_order are only set on insert ($setOnInsert) to preserve user customizations.
function buildSeedOps(defaults, category, entityId, userId) {
  // Phase G6.10/G7 — billable AI features default OFF so the president must
  // explicitly enable them after reviewing prompts/budgets. All other lookup
  // categories keep the original is_active:true default so dropdowns work
  // immediately on first load.
  const defaultActive = !SUBSCRIPTION_OPT_IN_CATEGORIES.has(category);
  return defaults.map((item, i) => {
    const isObj = typeof item === 'object';
    const label = isObj ? item.label : item;
    const code = isObj ? item.code.toUpperCase() : label.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const metadata = isObj ? (item.metadata || {}) : {};
    const op = {
      updateOne: {
        filter: { entity_id: entityId, category, code },
        update: {
          $setOnInsert: { label, sort_order: i * 10, is_active: defaultActive, created_by: userId },
        },
        upsert: true
      }
    };
    // Merge metadata fields into existing entries (e.g. coa_code, keywords)
    // Uses dot notation so only seed keys are set — user-added metadata keys are preserved
    if (Object.keys(metadata).length > 0) {
      op.updateOne.update.$set = {};
      for (const [k, v] of Object.entries(metadata)) {
        op.updateOne.update.$set[`metadata.${k}`] = v;
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
  res.status(201).json({ success: true, data: item });
});

// Update a lookup item
exports.update = catchAsync(async (req, res) => {
  const allowed = ['label', 'sort_order', 'is_active', 'metadata'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  const item = await Lookup.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  if (EXPENSE_CLASSIFIER_CATEGORIES.has(item.category)) invalidateRulesCache();
  if (OR_PARSER_LOOKUP_CATEGORIES.has(item.category)) invalidateOrParserCache();
  if (VENDOR_AUTO_LEARN_CATEGORIES.has(item.category)) invalidateGuardrailCache();
  if (DANGER_SUB_PERM_CATEGORIES.has(item.category)) invalidateDangerCache(item.entity_id);
  res.json({ success: true, data: item });
});

// Delete a lookup item (soft — set is_active=false)
exports.remove = catchAsync(async (req, res) => {
  const item = await Lookup.findByIdAndUpdate(req.params.id, { $set: { is_active: false } }, { new: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  if (EXPENSE_CLASSIFIER_CATEGORIES.has(item.category)) invalidateRulesCache();
  if (OR_PARSER_LOOKUP_CATEGORIES.has(item.category)) invalidateOrParserCache();
  if (VENDOR_AUTO_LEARN_CATEGORIES.has(item.category)) invalidateGuardrailCache();
  if (DANGER_SUB_PERM_CATEGORIES.has(item.category)) invalidateDangerCache(item.entity_id);
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
