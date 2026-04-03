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
  source: { type: String, enum: ['SALES_LINE', 'OPENING_AR'] },
  commission_rate: { type: Number, default: 0 },
  commission_amount: { type: Number, default: 0 },
  partner_tags: [partnerTagSchema]
}, { _id: false });

const collectionSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // P5: One CR = One Hospital
  hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', required: true },

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
  payment_mode: { type: String, enum: ['CHECK', 'CASH', 'ONLINE'], default: 'CHECK' },
  check_no: String,
  check_date: Date,
  bank: String,
  deposit_date: Date,
  deposit_slip_url: String,

  // Hard gate document URLs
  cr_photo_url: String,
  csi_photo_urls: [String],

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

// Pre-save: auto-compute totals and commission/rebate amounts
collectionSchema.pre('save', function () {
  if (this.settled_csis?.length) {
    let totalCsi = 0, totalNet = 0, totalComm = 0, totalRebates = 0;

    for (const csi of this.settled_csis) {
      totalCsi += csi.invoice_amount || 0;
      // Compute net_of_vat from invoice_amount (12/112 PH VAT formula)
      csi.net_of_vat = Math.round((csi.invoice_amount || 0) * (100 / 112) * 100) / 100;
      totalNet += csi.net_of_vat;

      // Commission
      csi.commission_amount = Math.round(csi.net_of_vat * (csi.commission_rate || 0) * 100) / 100;
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
collectionSchema.index({ 'settled_csis.sales_line_id': 1 });
collectionSchema.index({ status: 1 });

module.exports = mongoose.model('Collection', collectionSchema);
