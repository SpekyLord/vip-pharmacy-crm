/**
 * ChartOfAccounts Model — Full COA for double-entry accounting
 *
 * Account code ranges (PRD v5 §11.1):
 *   1000-1014: Cash & Bank
 *   1100-1220: Receivables (AR Trade, AR BDM, Input VAT, CWT Receivable)
 *   1200: Inventory
 *   1300: Fixed Assets & Accumulated Depreciation
 *   2000-2400: Liabilities (AP, Output VAT, Gov Payables, CC lines)
 *   3000-3200: Equity (Owner Capital, Drawings, Retained Earnings)
 *   4000-4200: Revenue (Sales Vatable, Sales Exempt, Other Income)
 *   5000-5300: Cost of Sales (COGS, BDM Commission, Profit Share)
 *   6000-7100: Operating Expenses
 *   8000-8200: BIR-Only accounts
 */
const mongoose = require('mongoose');

const chartOfAccountsSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  account_code: {
    type: String,
    required: true,
    trim: true
  },
  account_name: {
    type: String,
    required: true,
    trim: true
  },
  account_type: {
    type: String,
    enum: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
    required: true
  },
  account_subtype: {
    type: String,
    trim: true
  },
  normal_balance: {
    type: String,
    enum: ['DEBIT', 'CREDIT'],
    required: true
  },
  bir_flag: {
    type: String,
    enum: ['BOTH', 'INTERNAL', 'BIR'],
    default: 'BOTH'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  parent_code: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'erp_chart_of_accounts'
});

// Compound unique: one account_code per entity
chartOfAccountsSchema.index({ entity_id: 1, account_code: 1 }, { unique: true });
chartOfAccountsSchema.index({ entity_id: 1, account_type: 1 });
chartOfAccountsSchema.index({ entity_id: 1, is_active: 1 });

module.exports = mongoose.model('ChartOfAccounts', chartOfAccountsSchema);
