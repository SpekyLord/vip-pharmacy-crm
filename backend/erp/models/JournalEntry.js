/**
 * JournalEntry Model — Double-entry accounting journal
 *
 * Every financial transaction is recorded as a balanced journal entry
 * where total_debit must equal total_credit (within 0.01 tolerance).
 *
 * JE numbers auto-increment per entity per year via DocSequence.
 * Reversals use SAP Storno pattern: new JE with flipped amounts,
 * original stays POSTED, corrects_je_id links reversal → original.
 */
const mongoose = require('mongoose');

const jeLineSchema = new mongoose.Schema({
  account_code: { type: String, required: true, trim: true },
  account_name: { type: String, required: true, trim: true },
  debit: { type: Number, default: 0, min: 0 },
  credit: { type: Number, default: 0, min: 0 },
  description: { type: String, trim: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cost_center: { type: String, trim: true }
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  je_number: {
    type: Number,
    required: true
  },
  je_date: {
    type: Date,
    required: true
  },
  period: {
    type: String,
    required: true,
    trim: true
    // Format: "YYYY-MM"
  },
  description: {
    type: String,
    trim: true
  },
  source_module: {
    type: String,
    enum: [
      'SALES', 'COLLECTION', 'EXPENSE', 'COMMISSION', 'AP',
      'PAYROLL', 'DEPRECIATION', 'INTEREST', 'PEOPLE_COMP',
      'VAT', 'OWNER', 'BANKING', 'MANUAL',
      'SERVICE_REVENUE', 'PETTY_CASH',
      'INVENTORY', 'IC_TRANSFER'
    ],
    required: true
  },
  source_event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent'
  },
  source_doc_ref: {
    type: String,
    trim: true
  },
  lines: {
    type: [jeLineSchema],
    validate: {
      validator: (v) => v && v.length >= 2,
      message: 'Journal entry must have at least 2 lines'
    }
  },
  bir_flag: {
    type: String,
    default: 'BOTH'
  }, // Lookup: BIR_FLAG
  vat_flag: {
    type: String,
    default: 'N/A'
  }, // Lookup: VAT_TYPE (with N/A option)
  total_debit: {
    type: Number,
    default: 0
  },
  total_credit: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['DRAFT', 'POSTED', 'VOID'],
    default: 'DRAFT'
  },
  posted_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  posted_at: {
    type: Date
  },
  corrects_je_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry'
  },
  is_reversal: {
    type: Boolean,
    default: false
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_journal_entries'
});

// Pre-save: auto-sum lines, validate balance, and verify COA codes when POSTED
journalEntrySchema.pre('save', async function (next) {
  if (this.lines && this.lines.length > 0) {
    this.total_debit = this.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    this.total_credit = this.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
  }

  // Enforce balance on POSTED status
  if (this.status === 'POSTED') {
    const diff = Math.abs(this.total_debit - this.total_credit);
    if (diff > 0.01) {
      return next(new Error(`Journal entry is unbalanced: DR ${this.total_debit.toFixed(2)} ≠ CR ${this.total_credit.toFixed(2)} (diff ${diff.toFixed(2)})`));
    }

    // Validate all account_codes exist in ChartOfAccounts
    const ChartOfAccounts = mongoose.model('ChartOfAccounts');
    const codes = [...new Set(this.lines.map(l => l.account_code))];
    const existing = await ChartOfAccounts.find(
      { entity_id: this.entity_id, account_code: { $in: codes } }
    ).select('account_code').lean();
    const existingCodes = new Set(existing.map(c => c.account_code));
    const invalid = codes.filter(c => !existingCodes.has(c));
    if (invalid.length) {
      return next(new Error(`Invalid COA codes: ${invalid.join(', ')}. Verify Settings → COA mapping.`));
    }
  }
  next();
});

// Indexes
journalEntrySchema.index({ entity_id: 1, je_number: 1 }, { unique: true });
journalEntrySchema.index({ entity_id: 1, period: 1, status: 1 });
journalEntrySchema.index({ entity_id: 1, source_module: 1 });
journalEntrySchema.index({ entity_id: 1, source_module: 1, source_event_id: 1 });
journalEntrySchema.index({ 'lines.account_code': 1, entity_id: 1 });
journalEntrySchema.index({ corrects_je_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
