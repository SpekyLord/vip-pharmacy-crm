/**
 * SalesBookSCPWD — Phase VIP-1.H (Apr 2026)
 *
 * BIR-mandated Senior Citizen / PWD sales register per RR 7-2010 + RR 5-2017.
 * One row per qualifying transaction, denormalized for fast monthly export and
 * audit-binder printing.
 *
 * Statutes:
 *   RA 9994 (Expanded Senior Citizens Act of 2010) — 20% discount + 12% VAT
 *     exemption on medicines + defined product list. Requires OSCA ID.
 *   RA 7277 + RA 9442 (Magna Carta for PWD) — same 20% + VAT exemption.
 *   BIR RR 7-2010 — establishments must maintain a separate Sales Book —
 *     Senior Citizen / PWD register with per-transaction detail.
 *   BIR Form 2306 — Input VAT credit claim worksheet (pharmacy reclaims input
 *     VAT lost to SC/PWD-exempt sales).
 *
 * Data Privacy carve-out: per RA 10173 §13 legal-mandate exception, this
 * register MUST be printable / exportable / producible on BIR demand, even
 * though the default data-privacy posture for pharma data is consent-based
 * view-only. Don't conflate with VIP-2 prescription-data sharing.
 *
 * Source feed:
 *   v1 (this phase) — manual entry via admin UI; idempotent ingestion API for
 *     ERP Sale POSTED → register row, keyed on source_doc_ref.
 *   v2 (when storefront launches per VIP-1.D listener) — Order.paid handler
 *     extends the same ingest endpoint.
 *
 * Subscription-readiness:
 *   - entity_id required on every row (Rule #19)
 *   - ID format regex sourced from SCPWD_ID_FORMATS lookup (Rule #3)
 *   - role gates from SCPWD_ROLES lookup via backend/utils/scpwdAccess.js
 *   - Same model shape ports cleanly to PostgreSQL schema-per-tenant SaaS.
 */

const mongoose = require('mongoose');

const ITEM_SUBSCHEMA = new mongoose.Schema({
  product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductMaster' },
  product_name: { type: String, required: true, trim: true },
  product_code: { type: String, trim: true },
  qty: { type: Number, required: true, min: 0 },
  unit_price: { type: Number, required: true, min: 0 },
  line_subtotal: { type: Number, required: true, min: 0 },     // qty * unit_price (gross)
  line_discount: { type: Number, required: true, min: 0 },     // 20% of line_subtotal
  line_vat_exempt: { type: Number, required: true, min: 0 },   // 12% of (line_subtotal - line_discount)
  line_net: { type: Number, required: true, min: 0 },          // line_subtotal - line_discount - line_vat_exempt
  is_eligible: { type: Boolean, default: true },               // RA 9994 §4 eligibility flag
}, { _id: false });

const salesBookSCPWDSchema = new mongoose.Schema({
  // ── Tenant scope (Rule #19) ─────────────────────────────────────────────
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },

  // ── Customer SC/PWD identity (BIR RR 7-2010 column requirements) ────────
  sc_pwd_type: {
    type: String,
    enum: ['SC', 'PWD'],
    required: true,
  },
  osca_or_pwd_id: {
    type: String,
    required: true,
    trim: true,
    // Format validation runs in pre-save against SCPWD_ID_FORMATS lookup
  },
  customer_name: { type: String, required: true, trim: true },
  date_of_birth: { type: Date },                  // optional; SC = 60+ check if present
  id_expiry_date: { type: Date },                 // optional; PWD/SC ID renewal
  id_photo_url: { type: String, trim: true },    // S3 URL — audit support per RR 5-2017

  // ── Transaction context ─────────────────────────────────────────────────
  transaction_date: { type: Date, required: true, index: true },
  bir_period: {
    year: { type: Number, required: true },       // 2026
    month: { type: Number, required: true, min: 1, max: 12 },
  },

  // Source-doc backreferences (for audit trail + idempotent re-sync)
  // Exactly ONE of these should be populated; source_type discriminates.
  source_type: {
    type: String,
    enum: ['MANUAL', 'ERP_SALE', 'STOREFRONT_ORDER'],
    required: true,
    default: 'MANUAL',
  },
  source_doc_ref: {
    type: String,
    required: true,
    trim: true,
    // For MANUAL: auto-generated like "SCPWD-{ENTITY}-{YYYYMM}-{NNN}"
    // For ERP_SALE: Sale.csi_number (e.g. "CSI-VIP-12345")
    // For STOREFRONT_ORDER: Order._id as string (cross-DB convention)
  },
  sale_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale' },        // when source_type='ERP_SALE'
  storefront_order_id: { type: String, trim: true },                     // when source_type='STOREFRONT_ORDER'

  // ── Items + amounts ─────────────────────────────────────────────────────
  items: {
    type: [ITEM_SUBSCHEMA],
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'SC/PWD sales book row must have at least 1 line item',
    },
  },
  gross_amount: { type: Number, required: true, min: 0 },        // sum of line_subtotal
  discount_amount: { type: Number, required: true, min: 0 },     // sum of line_discount (20% of gross)
  vat_exempt_amount: { type: Number, required: true, min: 0 },   // sum of line_vat_exempt (12% of net of discount)
  net_amount: { type: Number, required: true, min: 0 },          // gross - discount - vat_exempt

  // BIR Form 2306 input VAT credit reclaim — pharmacy paid this much input VAT
  // to suppliers on goods sold under SC/PWD exemption; claimable back from BIR.
  // Computed at posting from supplier-paid VAT prorated by line gross.
  input_vat_paid_to_supplier: { type: Number, default: 0, min: 0 },

  // ── Lifecycle ───────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['DRAFT', 'POSTED', 'VOID'],
    default: 'DRAFT',
  },
  posted_at: { type: Date },
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  voided_at: { type: Date },
  voided_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  void_reason: { type: String, trim: true },

  // ── Audit ───────────────────────────────────────────────────────────────
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String, trim: true },
}, {
  timestamps: true,
  collection: 'erp_sales_book_scpwd',
});

// ── Indexes ────────────────────────────────────────────────────────────────
// Monthly-export hot path
salesBookSCPWDSchema.index({ entity_id: 1, 'bir_period.year': 1, 'bir_period.month': 1, status: 1 });
// SC/PWD type filter on the page
salesBookSCPWDSchema.index({ entity_id: 1, sc_pwd_type: 1, transaction_date: -1 });
// Idempotency — same source-doc shouldn't double-write
salesBookSCPWDSchema.index({ entity_id: 1, source_type: 1, source_doc_ref: 1 }, { unique: true });

// ── Pre-validate: derive bir_period + sums + validate math + ID format ────
// Use pre('validate') so derived fields (bir_period.year/month auto-from
// transaction_date) are populated BEFORE schema-level required-field checks
// run. pre('save') would fire too late — required-field validators reject
// before the hook can fill the gap.
const TOLERANCE = 0.01;

salesBookSCPWDSchema.pre('validate', async function (next) {
  try {
    // 1. Auto-derive bir_period from transaction_date if not set explicitly
    if (this.transaction_date && (!this.bir_period || !this.bir_period.year)) {
      const d = new Date(this.transaction_date);
      this.bir_period = { year: d.getFullYear(), month: d.getMonth() + 1 };
    }

    // 2. Auto-sum totals from items if items present and totals not pre-stamped
    if (Array.isArray(this.items) && this.items.length > 0) {
      const sumGross = this.items.reduce((s, i) => s + (i.line_subtotal || 0), 0);
      const sumDiscount = this.items.reduce((s, i) => s + (i.line_discount || 0), 0);
      const sumVatExempt = this.items.reduce((s, i) => s + (i.line_vat_exempt || 0), 0);
      const sumNet = this.items.reduce((s, i) => s + (i.line_net || 0), 0);

      // If the caller didn't set totals, derive them. If they did, validate parity.
      if (!this.gross_amount) this.gross_amount = sumGross;
      if (!this.discount_amount) this.discount_amount = sumDiscount;
      if (!this.vat_exempt_amount) this.vat_exempt_amount = sumVatExempt;
      if (!this.net_amount) this.net_amount = sumNet;

      if (Math.abs(this.gross_amount - sumGross) > TOLERANCE) {
        return next(new Error(`gross_amount ${this.gross_amount.toFixed(2)} ≠ sum(line_subtotal) ${sumGross.toFixed(2)}`));
      }
      if (Math.abs(this.discount_amount - sumDiscount) > TOLERANCE) {
        return next(new Error(`discount_amount ${this.discount_amount.toFixed(2)} ≠ sum(line_discount) ${sumDiscount.toFixed(2)}`));
      }
      if (Math.abs(this.vat_exempt_amount - sumVatExempt) > TOLERANCE) {
        return next(new Error(`vat_exempt_amount ${this.vat_exempt_amount.toFixed(2)} ≠ sum(line_vat_exempt) ${sumVatExempt.toFixed(2)}`));
      }
    }

    // 3. Validate the RA 9994 + 12% VAT-exemption math at the header level.
    //    discount_amount must be 20% of gross_amount (RA 9994 §4)
    //    vat_exempt_amount must be 12% of (gross_amount - discount_amount)
    if (this.gross_amount > 0) {
      const expectedDiscount = this.gross_amount * 0.20;
      if (Math.abs(this.discount_amount - expectedDiscount) > TOLERANCE) {
        return next(new Error(
          `RA 9994 violation: discount_amount ${this.discount_amount.toFixed(2)} must be 20% of gross_amount ${this.gross_amount.toFixed(2)} (expected ${expectedDiscount.toFixed(2)})`
        ));
      }
      const expectedVatExempt = (this.gross_amount - this.discount_amount) * 0.12;
      if (Math.abs(this.vat_exempt_amount - expectedVatExempt) > TOLERANCE) {
        return next(new Error(
          `BIR VAT-exemption violation: vat_exempt_amount ${this.vat_exempt_amount.toFixed(2)} must be 12% of (gross - discount) ${(this.gross_amount - this.discount_amount).toFixed(2)} (expected ${expectedVatExempt.toFixed(2)})`
        ));
      }
      const expectedNet = this.gross_amount - this.discount_amount - this.vat_exempt_amount;
      if (Math.abs(this.net_amount - expectedNet) > TOLERANCE) {
        return next(new Error(
          `net_amount ${this.net_amount.toFixed(2)} ≠ gross - discount - vat_exempt (expected ${expectedNet.toFixed(2)})`
        ));
      }
    }

    // 4. Validate ID format against the lookup-driven regex (Rule #3).
    //    Falls back to permissive check if lookup unreachable so the register
    //    never goes dark on a Lookup outage.
    if (this.isModified('osca_or_pwd_id') || this.isNew) {
      const Lookup = mongoose.model('Lookup');
      const code = this.sc_pwd_type === 'SC' ? 'OSCA_PH' : 'PWD_PH';
      const idFormat = await Lookup.findOne({
        category: 'SCPWD_ID_FORMATS',
        code,
        is_active: true,
        ...(this.entity_id ? { entity_id: this.entity_id } : {}),
      }).lean().catch(() => null);
      const regexStr = idFormat?.metadata?.regex;
      if (regexStr) {
        try {
          const regex = new RegExp(regexStr);
          if (!regex.test(this.osca_or_pwd_id)) {
            return next(new Error(
              `${this.sc_pwd_type} ID "${this.osca_or_pwd_id}" does not match expected format. Configure via Control Center → Lookup Tables → SCPWD_ID_FORMATS → ${code}.`
            ));
          }
        } catch (regexErr) {
          // Bad regex in lookup — log and continue (don't block writes on admin misconfig)
          console.warn(`[SalesBookSCPWD] Invalid regex in SCPWD_ID_FORMATS.${code}: ${regexStr}`, regexErr.message);
        }
      } // else: no lookup row → permissive, accept anything trimmed-non-empty
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('SalesBookSCPWD', salesBookSCPWDSchema);
