const Lookup = require('../models/Lookup');
const { catchAsync } = require('../../middleware/errorHandler');
const { ROLES } = require('../../constants/roles');

/**
 * Generic Lookup Controller — Phase 24
 * CRUD for configurable dropdown values (replaces hardcoded frontend arrays).
 */

// Default seed data for each category — mirrors current hardcoded arrays
const SEED_DEFAULTS = {
  EXPENSE_CATEGORY: [
    'Transportation', 'Travel/Accommodation', 'Fuel & Gas', 'Parking/Toll',
    'Courier/Shipping', 'ACCESS/Meals', 'Office Supplies',
    'Utilities/Communication', 'Rent', 'Marketing — HCP/Doctor', 'Marketing — Hospital',
    'Marketing — Retail', 'Vehicle Maintenance', 'Repairs/Maintenance', 'Professional Fees',
    'Regulatory/Licensing', 'IT/Software', 'Miscellaneous'
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
    { code: 'ACCESS_MEALS', label: 'ACCESS Expense', metadata: { coa_code: '6350', keywords: ['RESTAURANT', 'FOOD', 'MEAL', 'CAFE', 'JOLLIBEE', 'MCDONALDS', 'DINE', 'EATERY'] } },
    { code: 'OFFICE_SUPPLIES', label: 'Office Supplies', metadata: { coa_code: '6400', keywords: ['PRINTING', 'OFFICE', 'SUPPLIES', 'STATIONERY', 'NATIONAL BOOKSTORE'] } },
    { code: 'UTILITIES_COMMUNICATION', label: 'Utilities & Communication', metadata: { coa_code: '6460', keywords: ['GLOBE', 'SMART', 'PLDT', 'CONVERGE', 'MERALCO', 'WATER', 'ELECTRIC', 'UTILITY'] } },
    { code: 'TRANSPORTATION', label: 'Transport Expense', metadata: { coa_code: '6150', keywords: ['GRAB', 'TAXI', 'ANGKAS', 'FERRY', 'BOAT'] } },
    { code: 'REGULATORY_LICENSING', label: 'Regulatory & Licensing', metadata: { coa_code: '6810', keywords: ['FDA', 'DOH', 'LGU', 'LICENSE', 'PERMIT', 'REGULATORY', 'REGISTRATION', 'RENEWAL'] } },
    { code: 'IT_SOFTWARE', label: 'IT Hardware & Software', metadata: { coa_code: '6820', keywords: ['SOFTWARE', 'SUBSCRIPTION', 'DOMAIN', 'HOSTING', 'CLOUD', 'APP', 'COMPUTER', 'LAPTOP', 'PRINTER', 'HARDWARE'] } },
    { code: 'REPAIRS_MAINTENANCE', label: 'Repairs & Maintenance', metadata: { coa_code: '6260', keywords: ['REPAIR', 'MAINTENANCE', 'AIRCON', 'PLUMBING', 'ELECTRICAL', 'FIX'] } },
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
  ],
  GROWTH_DRIVER: [
    { code: 'HOSP_ACCRED', label: 'Hospital Accreditation' },
    { code: 'PHARMACY_CSR', label: 'Pharmacy & CSR Inclusion' },
    { code: 'ZERO_LOST_SALES', label: 'Inventory Optimization / Zero Lost Sales' },
    { code: 'STRATEGIC_MD', label: 'Strategic Partnerships with MDs' },
    { code: 'PRICE_INCREASE', label: 'Surgical Price Increases' },
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
  INCENTIVE_TIER: [
    { code: 'TIER_1', label: 'Platinum', metadata: { attainment_min: 100, budget_per_bdm: 150000, reward_description: '', sort_order: 1, bg_color: '#fef3c7', text_color: '#92400e' } },
    { code: 'TIER_2', label: 'Gold', metadata: { attainment_min: 90, budget_per_bdm: 80000, reward_description: '', sort_order: 2, bg_color: '#fef9c3', text_color: '#854d0e' } },
    { code: 'TIER_3', label: 'Silver', metadata: { attainment_min: 80, budget_per_bdm: 50000, reward_description: '', sort_order: 3, bg_color: '#f1f5f9', text_color: '#475569' } },
    { code: 'TIER_4', label: 'Bronze', metadata: { attainment_min: 70, budget_per_bdm: 30000, reward_description: '', sort_order: 4, bg_color: '#fed7aa', text_color: '#9a3412' } },
    { code: 'TIER_5', label: 'Participant', metadata: { attainment_min: 50, budget_per_bdm: 15000, reward_description: '', sort_order: 5, bg_color: '#dbeafe', text_color: '#1e40af' } },
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
    { code: 'FINANCIAL', label: 'Financial', metadata: { description: 'Involves money movement — requires president/finance approval', modules: ['EXPENSES', 'PURCHASING', 'PAYROLL', 'JOURNAL', 'BANKING', 'PETTY_CASH', 'IC_TRANSFER', 'INCOME', 'PRF_CALF', 'PERDIEM_OVERRIDE', 'DEDUCTION_SCHEDULE'] } },
    { code: 'OPERATIONAL', label: 'Operational', metadata: { description: 'Document processing & verification — can be delegated to admin/finance', modules: ['SALES', 'COLLECTIONS', 'INVENTORY', 'KPI', 'SMER', 'CAR_LOGBOOK', 'COLLECTION'] } },
  ],
  APPROVAL_MODULE: [
    // Authority Matrix modules (Phase 29) — with financial/operational category
    { code: 'SALES', label: 'Sales', metadata: { category: 'OPERATIONAL' } },
    { code: 'COLLECTIONS', label: 'Collections', metadata: { category: 'OPERATIONAL' } },
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
    { code: 'PRF_CALF', label: 'PRF / CALF', metadata: { category: 'FINANCIAL' } },
    { code: 'APPROVAL_REQUEST', label: 'Authority Matrix Approvals', metadata: { category: 'FINANCIAL' } },
    { code: 'PERDIEM_OVERRIDE', label: 'Per Diem Override', metadata: { category: 'FINANCIAL' } },
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
  ],
  ERP_SUB_PERMISSION: [
    // Sales
    { code: 'SALES__REOPEN', label: 'Re-open Posted Sales', metadata: { module: 'sales', key: 'reopen', sort_order: 1 } },
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
    // Accounting
    { code: 'ACCOUNTING__JOURNAL_ENTRY', label: 'Journal Entries & COA', metadata: { module: 'accounting', key: 'journal_entry', sort_order: 1 } },
    { code: 'ACCOUNTING__CHECK_WRITING', label: 'Check Writing / Payments', metadata: { module: 'accounting', key: 'check_writing', sort_order: 2 } },
    { code: 'ACCOUNTING__MONTH_END', label: 'Month-End Close', metadata: { module: 'accounting', key: 'month_end', sort_order: 3 } },
    { code: 'ACCOUNTING__VAT_FILING', label: 'VAT/CWT Compliance', metadata: { module: 'accounting', key: 'vat_filing', sort_order: 4 } },
    { code: 'ACCOUNTING__FIXED_ASSETS', label: 'Fixed Assets & Depreciation', metadata: { module: 'accounting', key: 'fixed_assets', sort_order: 5 } },
    { code: 'ACCOUNTING__LOANS', label: 'Loan Management', metadata: { module: 'accounting', key: 'loans', sort_order: 6 } },
    { code: 'ACCOUNTING__OWNER_EQUITY', label: 'Owner Equity', metadata: { module: 'accounting', key: 'owner_equity', sort_order: 7 } },
    { code: 'ACCOUNTING__PETTY_CASH', label: 'Petty Cash', metadata: { module: 'accounting', key: 'petty_cash', sort_order: 8 } },
    { code: 'ACCOUNTING__OFFICE_SUPPLIES', label: 'Office Supplies', metadata: { module: 'accounting', key: 'office_supplies', sort_order: 9 } },
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
    // Approvals
    { code: 'APPROVALS__RULE_MANAGE', label: 'Create/Edit Approval Rules', metadata: { module: 'approvals', key: 'rule_manage', sort_order: 1 } },
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
    { code: 'EXPENSES', label: 'Expenses (ORE/ACCESS)', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated expense entries' } },
    { code: 'PRF_CALF', label: 'PRF / CALF', metadata: { roles: ['admin', 'finance', 'president'], description: 'Post validated PRF/CALF documents' } },
    { code: 'PERDIEM_OVERRIDE', label: 'Per Diem Override', metadata: { roles: ['admin', 'finance', 'president'], description: 'Approve BDM per diem override requests' } },
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

  // Product Catalog Access — controls which subsidiary entities can browse parent entity products
  // When a subsidiary user opens PO creation (catalog=true), the system checks this lookup to decide
  // whether to include parent entity products alongside the subsidiary's own products.
  // metadata.parent_entity_id = the parent whose products are shared. metadata.access_mode = FULL (all products) or ACTIVE_ONLY (only is_active:true).
  // Admin/President configures per subsidiary via Control Center → Lookup Tables.
  PRODUCT_CATALOG_ACCESS: [
    { code: 'INHERIT_PARENT', label: 'Inherit Parent Entity Products', metadata: { access_mode: 'ACTIVE_ONLY', description: 'Subsidiary can browse parent entity products for PO creation and catalog views' } },
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
function buildSeedOps(defaults, category, entityId, userId) {
  return defaults.map((item, i) => {
    const isObj = typeof item === 'object';
    const label = isObj ? item.label : item;
    const code = isObj ? item.code.toUpperCase() : label.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return {
      updateOne: {
        filter: { entity_id: entityId, category, code },
        update: { $setOnInsert: { label, sort_order: i * 10, is_active: true, metadata: isObj ? (item.metadata || {}) : {}, created_by: userId } },
        upsert: true
      }
    };
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
  const item = await Lookup.create({
    entity_id: req.entityId,
    category: category.toUpperCase(),
    code: code.toUpperCase(),
    label,
    sort_order: sort_order || 0,
    metadata: metadata || {},
    created_by: req.user._id
  });
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
  res.json({ success: true, data: item });
});

// Delete a lookup item (soft — set is_active=false)
exports.remove = catchAsync(async (req, res) => {
  const item = await Lookup.findByIdAndUpdate(req.params.id, { $set: { is_active: false } }, { new: true });
  if (!item) return res.status(404).json({ success: false, message: 'Lookup item not found' });
  res.json({ success: true, data: item, message: 'Item deactivated' });
});

// Seed defaults for a category (upsert — won't overwrite existing)
exports.seedCategory = catchAsync(async (req, res) => {
  if (!req.entityId) return res.status(400).json({ success: false, message: 'Entity context required. President must select a working entity first.' });
  const category = req.params.category.toUpperCase();
  const defaults = SEED_DEFAULTS[category];
  if (!defaults) return res.status(400).json({ success: false, message: `No defaults for category: ${category}` });

  const ops = buildSeedOps(defaults, category, req.entityId, req.user._id);
  await Lookup.bulkWrite(ops);
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
