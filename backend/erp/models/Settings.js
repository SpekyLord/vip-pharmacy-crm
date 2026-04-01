const mongoose = require('mongoose');

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

  // Products
  MD_MAX_PRODUCT_TAGS: { type: Number, default: 3 },

  // Consignment
  CONSIGNMENT_AGING_DEFAULT: { type: Number, default: 90 },

  // Authority & Compliance
  ENFORCE_AUTHORITY_MATRIX: { type: Boolean, default: false },
  EXPENSE_ANOMALY_THRESHOLD: { type: Number, default: 0.30 },

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

module.exports = mongoose.model('ErpSettings', settingsSchema);
