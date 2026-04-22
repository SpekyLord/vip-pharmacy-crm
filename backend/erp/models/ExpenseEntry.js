/**
 * Expense Entry Model — ORE (Other Reimbursable Expenses) and ACCESS (Company-Mode Payments)
 *
 * ORE: cash-based reimbursable, NO CALF required
 * ACCESS: company-mode payments (credit card, GCash, bank transfer), CALF required for non-cash
 * Lifecycle: DRAFT → VALID → ERROR → POSTED
 */
const mongoose = require('mongoose');

const expenseLineSchema = new mongoose.Schema({
  expense_date: { type: Date, required: true },
  expense_type: { type: String, required: true }, // Lookup: EXPENSE_TYPE
  expense_category: { type: String, trim: true },  // courier, parking, toll, hotel, food, office, etc.
  coa_code: { type: String, trim: true },           // for future journal posting (Phase 11)
  establishment: { type: String, trim: true },
  particulars: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0 },
  vat_amount: { type: Number, default: 0 },
  net_of_vat: { type: Number, default: 0 },
  or_number: { type: String, trim: true },
  or_photo_url: String,
  or_attachment_id: String,
  or_ocr_data: { type: mongoose.Schema.Types.Mixed },
  payment_mode: { type: String, default: 'CASH' }, // Validated against PaymentMode lookup
  funding_card_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCard' },
  funding_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  calf_required: { type: Boolean, default: false },
  calf_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PrfCalf' },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorMaster' },
  // Phase 18: cost center allocation per expense line
  cost_center_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' },
  notes: { type: String, trim: true },
  // Batch upload fields
  bir_flag: { type: String, default: 'BOTH' }, // Lookup: BIR_FLAG
  is_assorted: { type: Boolean, default: false }
}, { _id: true });

const expenseEntrySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Phase 18: office staff can record expenses on behalf of president (no credential sharing)
  // Phase G4.5c.1 split — `recorded_on_behalf_of` is now pure proxy audit
  // (matches Sales/Collection/GRN shape). CALF bypass moves to its own
  // explicit field `calf_override` below. Previously conflated: proxy =
  // CALF bypass, which silently granted CALF-bypass to every admin/finance
  // /contractor proxy once the broader create-proxy path landed in G4.5c.1.
  recorded_on_behalf_of: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // President-only override of the CALF requirement (Phase G4.5c.1). Set
  // by `saveBatchExpenses` ONLY when `req.user.role === 'president'`. Pre-save
  // hook reads this flag (not `recorded_on_behalf_of`) so that admin/finance
  // /contractor proxies DO NOT inherit the CALF bypass — consistent with the
  // validate-time / submit-time gates which already enforce president-only.
  calf_override: { type: Boolean, default: false },

  // Period
  period: { type: String, required: true, trim: true },       // "2026-04"
  cycle: { type: String, required: true }, // Lookup: CYCLE

  // Expense lines
  lines: [expenseLineSchema],

  // Auto-computed totals (pre-save)
  total_ore: { type: Number, default: 0 },
  total_access: { type: Number, default: 0 },
  total_amount: { type: Number, default: 0 },
  total_vat: { type: Number, default: 0 },
  line_count: { type: Number, default: 0 },

  // BIR classification (set upfront by president for batch uploads)
  bir_flag: { type: String, default: 'BOTH' }, // Lookup: BIR_FLAG

  // Lifecycle
  status: {
    type: String,
    default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [String],
  rejection_reason: { type: String },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // SAP Storno reversal — set when expense is reversed; original stays POSTED for audit trail
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Audit
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_expense_entries'
});

// Pre-save: auto-compute totals, CALF flag, VAT
expenseEntrySchema.pre('save', async function () {
  const Settings = require('./Settings');
  const VAT_RATE = await Settings.getVatRate();
  let totalOre = 0, totalAccess = 0, totalVat = 0;

  for (const line of this.lines) {
    // VAT computation: if vat_amount not explicitly set, compute 12/112
    if (line.vat_amount === undefined || line.vat_amount === null || line.vat_amount === 0) {
      line.vat_amount = Math.round((line.amount || 0) * (VAT_RATE / (1 + VAT_RATE)) * 100) / 100;
    }
    line.net_of_vat = Math.round(((line.amount || 0) - (line.vat_amount || 0)) * 100) / 100;

    // CALF flag: ACCESS with non-cash payment requires CALF. ORE and cash ACCESS are always exempt.
    // Phase G4.5c.1 — explicit calf_override (set by president batch upload
    // flow only). Proxy audit (`recorded_on_behalf_of`) NO LONGER triggers
    // CALF bypass on its own — validate/submit still honor president role.
    if (this.calf_override) {
      line.calf_required = false;
    } else if (line.expense_type === 'ACCESS' && line.payment_mode !== 'CASH') {
      line.calf_required = true;
    } else {
      line.calf_required = false;
    }

    if (line.expense_type === 'ORE') {
      totalOre += line.amount || 0;
    } else {
      totalAccess += line.amount || 0;
    }
    totalVat += line.vat_amount || 0;
  }

  this.total_ore = Math.round(totalOre * 100) / 100;
  this.total_access = Math.round(totalAccess * 100) / 100;
  this.total_amount = Math.round((totalOre + totalAccess) * 100) / 100;
  this.total_vat = Math.round(totalVat * 100) / 100;
  this.line_count = this.lines.length;
});

// Indexes
expenseEntrySchema.index({ entity_id: 1, bdm_id: 1, period: 1, cycle: 1 });
expenseEntrySchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
expenseEntrySchema.index({ status: 1 });

module.exports = mongoose.model('ExpenseEntry', expenseEntrySchema);
