const mongoose = require('mongoose');
const { ROLE_SETS } = require('../../constants/roles');

const settingsSchema = new mongoose.Schema({
  version: {
    type: Number,
    default: 1
  },

  // Per Diem
  PERDIEM_RATE_DEFAULT: { type: Number, default: 800 },
  PERDIEM_MD_FULL: { type: Number, default: 8 },
  PERDIEM_MD_HALF: { type: Number, default: 3 },

  // Fuel
  FUEL_EFFICIENCY_DEFAULT: { type: Number, default: 12 },
  REVOLVING_FUND_AMOUNT: { type: Number, default: 8000 },

  // Tax & Finance
  VAT_RATE: { type: Number, default: 0.12 },
  CWT_RATE_WC158: { type: Number, default: 0.01 },
  SCPWD_DISCOUNT_RATE: { type: Number, default: 0.20 },

  // Profit Sharing
  PROFIT_SHARE_BDM_PCT: { type: Number, default: 0.30 },
  PROFIT_SHARE_VIP_PCT: { type: Number, default: 0.70 },
  PROFIT_SHARE_MIN_PRODUCTS: { type: Number, default: 5 },
  PROFIT_SHARE_MIN_HOSPITALS: { type: Number, default: 2 },
  PS_CONSECUTIVE_MONTHS: { type: Number, default: 3 },

  // Inventory
  NEAR_EXPIRY_DAYS: { type: Number, default: 120 },

  // Collections
  DEFAULT_PAYMENT_TERMS: { type: Number, default: 30 },
  COLLECTION_OK_THRESHOLD: { type: Number, default: 0.70 },
  COMMISSION_RATES: { type: [Number], default: [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05] },
  PARTNER_REBATE_RATES: { type: [Number], default: [1, 2, 3, 5, 20, 25] },

  // Products
  MD_MAX_PRODUCT_TAGS: { type: Number, default: 3 },

  // Consignment
  CONSIGNMENT_AGING_DEFAULT: { type: Number, default: 90 },

  // Authority & Compliance
  ENFORCE_AUTHORITY_MATRIX: { type: Boolean, default: false },
  EXPENSE_ANOMALY_THRESHOLD: { type: Number, default: 0.30 },

  // Notification — which roles receive ERP document notifications
  NOTIFICATION_RECIPIENT_ROLES: {
    type: [String],
    default: ROLE_SETS.MANAGEMENT,
  },

  // COA Mapping — configurable account codes for auto-journal posting
  COA_MAP: {
    AR_TRADE:            { type: String, default: '1100' },
    AR_BDM:              { type: String, default: '1110' },
    IC_RECEIVABLE:       { type: String, default: '1150' },
    CASH_ON_HAND:        { type: String, default: '1000' },
    PETTY_CASH:          { type: String, default: '1015' },
    INVENTORY:           { type: String, default: '1200' },
    INPUT_VAT:           { type: String, default: '1210' },
    CWT_RECEIVABLE:      { type: String, default: '1220' },
    ACCUM_DEPRECIATION:  { type: String, default: '1350' },
    AP_TRADE:            { type: String, default: '2000' },
    IC_PAYABLE:          { type: String, default: '2050' },
    OUTPUT_VAT:          { type: String, default: '2100' },
    LOANS_PAYABLE:       { type: String, default: '2300' },
    OWNER_CAPITAL:       { type: String, default: '3000' },
    OWNER_DRAWINGS:      { type: String, default: '3100' },
    SALES_REVENUE:       { type: String, default: '4000' },
    SERVICE_REVENUE:     { type: String, default: '4100' },
    INTEREST_INCOME:     { type: String, default: '4200' },
    COGS:                { type: String, default: '5000' },
    BDM_COMMISSION:      { type: String, default: '5100' },
    PARTNER_REBATE:      { type: String, default: '5200' },
    PER_DIEM:            { type: String, default: '6100' },
    TRANSPORT:           { type: String, default: '6150' },
    SPECIAL_TRANSPORT:   { type: String, default: '6160' },
    OTHER_REIMBURSABLE:  { type: String, default: '6170' },
    FUEL_GAS:            { type: String, default: '6200' },
    INVENTORY_WRITEOFF:  { type: String, default: '6850' },
    INVENTORY_ADJ_GAIN:  { type: String, default: '6860' },
    MISC_EXPENSE:        { type: String, default: '6900' },
    DEPRECIATION:        { type: String, default: '7000' },
    INTEREST_EXPENSE:    { type: String, default: '7050' },
    BANK_CHARGES:        { type: String, default: '7100' },
  },

  // Partner Graduation Criteria
  GRADUATION_CRITERIA: {
    type: [{
      key: String,
      label: String,
      target: Number,
      comparator: { type: String, enum: ['gte', 'lte'], default: 'gte' },
    }],
    default: [
      { key: 'min_months_active', label: 'Months Active', target: 6, comparator: 'gte' },
      { key: 'min_clients', label: 'VIP Clients Assigned', target: 15, comparator: 'gte' },
      { key: 'min_monthly_sales', label: 'Monthly Sales (₱)', target: 50000, comparator: 'gte' },
      { key: 'min_collection_rate', label: 'Collection Rate (%)', target: 70, comparator: 'gte' },
      { key: 'max_expense_ratio', label: 'Expense/Sales Ratio (%)', target: 30, comparator: 'lte' },
      { key: 'min_compliance', label: 'Visit Compliance (%)', target: 80, comparator: 'gte' },
      { key: 'min_engagement', label: 'Avg Engagement Level', target: 3.0, comparator: 'gte' },
    ],
  },

  // Scorecard Score Weights (must sum to 100)
  SCORECARD_WEIGHTS: {
    visits: { type: Number, default: 25 },
    sales: { type: Number, default: 25 },
    collections: { type: Number, default: 20 },
    efficiency: { type: Number, default: 15 },
    engagement: { type: Number, default: 15 },
  },

  // Updated by
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'erp_settings'
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Cached VAT rate — avoids DB hit on every pre-save hook.
// Cache TTL: 5 minutes. Refreshed on Settings update.
let _cachedVatRate = null;
let _vatCacheExpiry = 0;
settingsSchema.statics.getVatRate = async function () {
  const now = Date.now();
  if (_cachedVatRate !== null && now < _vatCacheExpiry) return _cachedVatRate;
  const s = await this.findOne().select('VAT_RATE').lean();
  _cachedVatRate = s?.VAT_RATE ?? 0.12;
  _vatCacheExpiry = now + 5 * 60 * 1000;
  return _cachedVatRate;
};
settingsSchema.statics.clearVatCache = function () { _cachedVatRate = null; _vatCacheExpiry = 0; };

module.exports = mongoose.model('ErpSettings', settingsSchema);
