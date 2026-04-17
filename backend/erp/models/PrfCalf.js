/**
 * PRF/CALF Model — Payment Requisition Form / Cash Advance & Liquidation Form
 *
 * ═══ PRF (Payment Requisition Form) ═══
 * SAP equivalent: Payment Request (F-58). NetSuite: Vendor Bill + Vendor Payment.
 * Purpose: Payment instruction for partner rebates. BDM submits PRF so Finance
 *   can process rebate payment to the partner (MD or Non-MD).
 * Hard gate: Partner does NOT receive rebate until BDM submits PRF with bank details.
 * Flow: BDM creates PRF → validates → submits → Finance posts (= payment processed).
 * Links upstream: Collection (which computed the rebate) + CRM Doctor (partner).
 * Links downstream: Future Phase 11 journal entry (DR: Partner Rebate Expense, CR: Cash/Bank).
 * BIR_FLAG = INTERNAL (not reported to BIR — internal company payment to partners).
 *
 * ═══ CALF (Cash Advance & Liquidation Form) ═══
 * SAP equivalent: FI-TV Travel Advance + Expense Report clearing.
 * NetSuite: Employee Advance + Expense Report offset.
 * Purpose: Two-phase document tracking company funds advanced to BDM and their liquidation.
 *   Phase 1 (Advance): Company releases funds (credit card, GCash, bank transfer) to BDM.
 *   Phase 2 (Liquidation): BDM submits expense ORs that consume the advance.
 * Required as attachment when BDM submits expense ORs paid with company funds (not revolving/cash).
 * NOT required for: cash/revolving fund, President entries, ORE.
 * Variance: advance_amount - liquidation_amount
 *   Positive = BDM returns excess to company.
 *   Negative = company reimburses BDM for shortfall.
 * Links upstream: ExpenseEntry lines (which ORs used company funds).
 * Links downstream: Future Phase 11 journal entry (clearing employee advance account).
 *
 * President override: CALF never required, can override any gate.
 *
 * Lifecycle: DRAFT → VALID → ERROR → POSTED
 *   (PRD Section 5.5 & 8.3 — same SAP Park→Check→Post as all transactional docs)
 */
const mongoose = require('mongoose');

const prfCalfSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Document type
  doc_type: { type: String, required: true }, // Lookup: PRF_DOC_TYPE

  // Period
  period: { type: String, required: true, trim: true },       // "2026-04"
  cycle: { type: String, required: true }, // Lookup: CYCLE

  // ═══════════════════════════════════════════
  // PRF fields — payment instruction for Finance
  // ═══════════════════════════════════════════
  prf_number: { type: String, trim: true },
  prf_type: { type: String, default: 'PARTNER_REBATE' }, // Lookup: PRF_TYPE
  // PARTNER_REBATE: pay partner (MD/Non-MD) their rebate — requires partner bank details
  // PERSONAL_REIMBURSEMENT: reimburse BDM/employee who paid with own money — requires OR photo, payee = self
  purpose: { type: String, trim: true },                       // e.g., "Partner rebate — CSI #004719" or "Personal reimbursement — hotel, parking"

  // Payee identification (partner for PARTNER_REBATE, employee for PERSONAL_REIMBURSEMENT)
  payee_name: { type: String, trim: true },                    // partner name or employee name
  payee_type: { type: String }, // Lookup: PAYEE_TYPE
  partner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },  // CRM Doctor ref

  // Partner bank account — Finance needs this to send payment
  partner_bank: { type: String, trim: true },                  // bank name (BPI, BDO, GCash, UnionBank, etc.)
  partner_account_name: { type: String, trim: true },          // account holder name
  partner_account_no: { type: String, trim: true },            // account number

  // Rebate details
  rebate_amount: { type: Number, default: 0 },                 // total rebate to pay this partner
  linked_collection_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },

  // ═══════════════════════════════════════════
  // CALF fields — company fund advance + liquidation
  // ═══════════════════════════════════════════
  calf_number: { type: String, trim: true },
  advance_amount: { type: Number, default: 0 },                // company funds advanced to BDM
  liquidation_amount: { type: Number, default: 0 },            // total expense ORs that consumed the advance
  balance: { type: Number, default: 0 },                       // advance - liquidation (+ return to company, - reimburse BDM)

  // Which expense ORs used company funds (linked to ExpenseEntry)
  linked_expense_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseEntry' },
  linked_expense_line_ids: [{ type: mongoose.Schema.Types.ObjectId }],

  // ═══════════════════════════════════════════
  // Shared fields
  // ═══════════════════════════════════════════
  amount: { type: Number, required: true, min: 0 },            // PRF: rebate_amount, CALF: advance_amount
  payment_mode: { type: String, default: 'CASH' }, // Validated against PaymentMode lookup
  funding_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  funding_card_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCard' },
  petty_cash_fund_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashFund' },
  check_no: String,
  bank: String,

  // Document photos (S3 URLs — no OCR, photo as proof only)
  photo_urls: [String],

  // BIR flag
  bir_flag: { type: String, default: 'INTERNAL' }, // Lookup: BIR_FLAG

  notes: { type: String, trim: true },

  // Lifecycle: DRAFT → VALID → ERROR → POSTED
  // POSTED = Finance approved and payment sent (PRF) / liquidation confirmed (CALF)
  status: {
    type: String,
    default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [String],
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Audit
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_prf_calf'
});

// Pre-save: auto-number + compute CALF balance
prfCalfSchema.pre('save', async function (next) {
  // Auto-generate document number on creation
  // #16 Hardening: throw on generateDocNumber failure instead of saving with null number
  if (this.isNew) {
    const { generateDocNumber } = require('../services/docNumbering');
    if (this.doc_type === 'CALF' && !this.calf_number) {
      try {
        this.calf_number = await generateDocNumber({
          prefix: 'CALF', bdmId: this.bdm_id, date: this.created_at || new Date()
        });
      } catch (err) {
        return next(new Error(`Failed to generate CALF number: ${err.message}. Check Territory setup for this BDM.`));
      }
      if (!this.calf_number) {
        return next(new Error('CALF number generation returned empty. Check DocSequence and Territory configuration.'));
      }
    }
    if (this.doc_type === 'PRF' && !this.prf_number) {
      try {
        this.prf_number = await generateDocNumber({
          prefix: 'PRF', bdmId: this.bdm_id, date: this.created_at || new Date()
        });
      } catch (err) {
        return next(new Error(`Failed to generate PRF number: ${err.message}. Check Territory setup for this BDM.`));
      }
      if (!this.prf_number) {
        return next(new Error('PRF number generation returned empty. Check DocSequence and Territory configuration.'));
      }
    }
  }

  // Compute CALF balance
  if (this.doc_type === 'CALF') {
    this.balance = Math.round(((this.advance_amount || 0) - (this.liquidation_amount || 0)) * 100) / 100;
  }
  next();
});

// Indexes
prfCalfSchema.index({ entity_id: 1, bdm_id: 1, doc_type: 1, period: 1 });
prfCalfSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
prfCalfSchema.index({ doc_type: 1, status: 1 });
prfCalfSchema.index({ linked_collection_id: 1 });

module.exports = mongoose.model('PrfCalf', prfCalfSchema);
