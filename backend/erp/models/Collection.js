/**
 * Collection Model — Collection Receipt (CR) for settling CSI invoices
 *
 * P5 Rule: One CR = One Hospital (hard enforced via required hospital_id)
 * Lifecycle: DRAFT → VALID → POSTED (same as SalesLine)
 * AR is computed on-read (POSTED SalesLines minus POSTED Collections)
 */
const mongoose = require('mongoose');

const partnerTagSchema = new mongoose.Schema({
  doctor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  doctor_name: { type: String, trim: true },
  rebate_pct: { type: Number, default: 0 },
  rebate_amount: { type: Number, default: 0 }
}, { _id: false });

const settledCsiSchema = new mongoose.Schema({
  sales_line_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesLine', required: true },
  doc_ref: { type: String, trim: true },
  csi_date: Date,
  invoice_amount: { type: Number, default: 0 },
  net_of_vat: { type: Number, default: 0 },
  source: { type: String }, // Lookup: SALE_SOURCE
  commission_rate: { type: Number, default: 0 },
  commission_amount: { type: Number, default: 0 },
  partner_tags: [partnerTagSchema]
}, { _id: false });

const collectionSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // P5: One CR = One Hospital or One Customer
  hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  // Phase 18: non-hospital customer support
  customer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  // Phase 19: cash collections can route to petty cash fund instead of bank
  petty_cash_fund_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PettyCashFund' },

  // CR header
  cr_no: { type: String, required: true, trim: true },
  cr_date: { type: Date, required: true },
  cr_amount: { type: Number, required: true },

  // Settled CSIs
  settled_csis: [settledCsiSchema],

  // Auto-computed totals
  total_csi_amount: { type: Number, default: 0 },
  total_net_of_vat: { type: Number, default: 0 },
  total_commission: { type: Number, default: 0 },
  total_partner_rebates: { type: Number, default: 0 },

  // CWT
  cwt_rate: { type: Number, default: 0 },
  cwt_amount: { type: Number, default: 0 },
  cwt_na: { type: Boolean, default: false },
  cwt_certificate_url: String,

  // Payment
  payment_mode: { type: String, default: 'CHECK' }, // Validated against PaymentMode lookup
  check_no: String,
  check_date: Date,
  bank: String,
  bank_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' },
  deposit_date: Date,
  deposit_slip_url: String,

  // Hard gate document URLs
  cr_photo_url: String,
  csi_photo_urls: [String],
  attachment_ids: [String],

  // Notes
  notes: { type: String, trim: true },

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
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Audit
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: false,
  collection: 'erp_collections'
});

// Pre-save: validate customer reference + auto-compute totals and commission/rebate amounts
collectionSchema.pre('save', async function () {
  // Phase 18: at least one customer reference required
  if (!this.hospital_id && !this.customer_id) {
    throw new Error('Either hospital_id or customer_id is required');
  }
  // Phase 19: bank_account_id and petty_cash_fund_id are mutually exclusive
  if (this.bank_account_id && this.petty_cash_fund_id) {
    throw new Error('Cannot set both bank_account_id and petty_cash_fund_id — choose one payment destination');
  }
  if (this.settled_csis?.length) {
    const Settings = require('./Settings');
    const vatRate = await Settings.getVatRate();
    let totalCsi = 0, totalNet = 0, totalComm = 0, totalRebates = 0;

    for (const csi of this.settled_csis) {
      const invoiceAmt = csi.invoice_amount || 0;
      totalCsi += invoiceAmt;
      // Always recompute net_of_vat from invoice_amount — guards against null/stale values
      csi.net_of_vat = invoiceAmt > 0
        ? Math.round(invoiceAmt / (1 + vatRate) * 100) / 100
        : 0;
      totalNet += csi.net_of_vat;

      // Commission — requires valid net_of_vat
      csi.commission_amount = csi.net_of_vat > 0
        ? Math.round(csi.net_of_vat * (csi.commission_rate || 0) * 100) / 100
        : 0;
      totalComm += csi.commission_amount;

      // Partner rebates
      if (csi.partner_tags?.length) {
        for (const tag of csi.partner_tags) {
          tag.rebate_amount = Math.round(csi.net_of_vat * ((tag.rebate_pct || 0) / 100) * 100) / 100;
          totalRebates += tag.rebate_amount;
        }
      }
    }

    this.total_csi_amount = Math.round(totalCsi * 100) / 100;
    this.total_net_of_vat = Math.round(totalNet * 100) / 100;
    this.total_commission = Math.round(totalComm * 100) / 100;
    this.total_partner_rebates = Math.round(totalRebates * 100) / 100;
  }
});

// Indexes
collectionSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
collectionSchema.index({ entity_id: 1, hospital_id: 1, cr_date: -1 });
collectionSchema.index({ entity_id: 1, customer_id: 1, cr_date: -1 });
collectionSchema.index({ petty_cash_fund_id: 1 });
collectionSchema.index({ 'settled_csis.sales_line_id': 1 });
collectionSchema.index({ status: 1 });

module.exports = mongoose.model('Collection', collectionSchema);
