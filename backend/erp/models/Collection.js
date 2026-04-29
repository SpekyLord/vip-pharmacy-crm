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
  rebate_amount: { type: Number, default: 0 },
  // Phase VIP-1.B — provenance from NonMdPartnerRebateRule auto-fill (when set,
  // the rebate_pct was sourced from this rule, not manually overridden by the
  // BDM at entry time). Used by the Collections UI to show a "from rule X"
  // tooltip + by future audit reports to flag manual vs auto rates.
  rule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NonMdPartnerRebateRule', default: null },
  // Phase R1 (Apr 29 2026) — denormalized calculation_mode from the matched
  // NonMdPartnerRebateRule. Drives the rebate_amount math at save time
  // (EXCLUDE_MD_COVERED → exclude Tier-A-covered net; TOTAL_COLLECTION →
  // pct of full net_of_vat). Captured per-tag (not per-collection) so two
  // partners on the same CSI can use different modes independently.
  calculation_mode: { type: String, default: 'EXCLUDE_MD_COVERED' }
}, { _id: false });

// Phase VIP-1.B — Tier-A MD rebate line. One row per (CSI, MD, line_item.product_id)
// where the MD has an active MdProductRebate row covering that product. Populated
// by Collection.js pre-save bridge (matrix walk against PARTNER MDs assigned to bdm_id).
// IMPORTANT: a CSI's net_of_vat that is covered here is EXCLUDED from partner_tags
// rebate base — Tier-A wins over Non-MD partner rebates per Apr 26 strategy memo.
const mdRebateLineSchema = new mongoose.Schema({
  md_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  md_name: { type: String, trim: true },
  product_id: { type: mongoose.Schema.Types.ObjectId, required: true },
  product_label: { type: String, trim: true },
  // Phase R1 (Apr 29 2026) — captures the hospital that anchored this Tier-A
  // match (sourced from SalesLine.hospital_id || Collection.hospital_id during
  // the bridge walk). Audit trail: lets reports show "MD X earned ₱Y from
  // hospital Z's rule" when the same MD has different rates per institution.
  hospital_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
  rebate_pct: { type: Number, default: 0 },
  rebate_amount: { type: Number, default: 0 },
  base_amount: { type: Number, default: 0 }, // line_item.net_of_vat
  rule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MdProductRebate', default: null }
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
  // Phase VIP-1.B — provenance from StaffCommissionRule auto-fill (when set,
  // commission_rate was sourced from this rule, not from CompProfile fallback).
  commission_rule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffCommissionRule', default: null },
  partner_tags: [partnerTagSchema],
  // Phase VIP-1.B — Tier-A MD rebate lines (per-product). See mdRebateLineSchema.
  md_rebate_lines: [mdRebateLineSchema]
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
  // Phase VIP-1.B — Tier-A MD rebate roll-up (sum of settled_csis[].md_rebate_lines[].rebate_amount).
  // Surfaced separately from total_partner_rebates so admin reports can split
  // the two payee classes (MD partners vs non-MD partners). PNL Internal view
  // shows both; PNL BIR view shows neither (both stamped bir_flag: INTERNAL).
  total_md_rebates: { type: Number, default: 0 },

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
  rejection_reason: { type: String },
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Audit
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Phase G4.5b — Proxy Entry. Present when the caller (created_by) keyed the
  // row on behalf of another BDM. Value = the proxy's User._id. bdm_id is the
  // owner (assigned_to). Absence means self-entry. See resolveOwnerScope.js.
  recorded_on_behalf_of: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: undefined
  },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_collections'
});

// Pre-save: validate customer reference + auto-compute totals and commission/rebate amounts
//
// Phase VIP-1.B (Apr 2026) — Matrix-walk bridge.
// BEFORE the totals loop runs, we walk three lookup matrices to auto-fill:
//   1. md_rebate_lines  ← MdProductRebate matrix (Tier-A per-MD per-product %)
//   2. commission_rate  ← StaffCommissionRule matrix (when csi.commission_rate
//                          is unset/0; falls back to CompProfile.commission_rate
//                          when no rule matches — preserves pre-VIP-1.B behavior)
//   3. partner_tags[].rebate_pct ← NonMdPartnerRebateRule matrix (when 0)
//
// Idempotency: re-walking is safe — md_rebate_lines is cleared first; auto-fill
// only fires when the field is 0/unset (manual overrides at entry are preserved).
//
// Tier-A exclusion: when computing partner_tags rebate_amount, the line_items
// covered by md_rebate_lines (same product_id) are subtracted from the base.
// Apr 26 strategy memo: Tier-A wins over Non-MD partner rebates per product.
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
    const SalesLine = require('./SalesLine');
    const Doctor = require('../../models/Doctor');
    const {
      matchAllMdProductRebates,
      matchAllNonMdPartnerRebateRules,
      matchStaffCommissionRule,
    } = require('../services/matrixWalker');
    let CompProfile;
    try { CompProfile = require('./CompProfile'); } catch (_) { CompProfile = null; }

    const vatRate = await Settings.getVatRate();

    // Hoist PARTNER MDs assigned to bdm_id once per save (cheap cache).
    // VIP-1.B v1 attribution: any PARTNER MD assigned to the collection's
    // bdm_id with a signed agreement on file is a candidate for Tier-A
    // rebate accrual on the products they have an active rule for. VIP-1.D
    // will replace this with PatientMdAttribution.
    const candidateMds = await Doctor.find({
      assignedTo: this.bdm_id,
      partnership_status: 'PARTNER',
      partner_agreement_date: { $ne: null },
      isActive: true,
    }).select('_id firstName lastName').lean();

    // Pre-fetch all SalesLines referenced in this CR in one round-trip.
    const slIds = this.settled_csis.map(c => c.sales_line_id).filter(Boolean);
    const salesLines = slIds.length
      ? await SalesLine.find({ _id: { $in: slIds } })
          .select('product_id line_items hospital_id customer_id')
          .lean()
      : [];
    const slMap = new Map(salesLines.map(sl => [String(sl._id), sl]));

    let totalCsi = 0, totalNet = 0, totalComm = 0, totalRebates = 0, totalMdRebates = 0;

    for (const csi of this.settled_csis) {
      const invoiceAmt = csi.invoice_amount || 0;
      totalCsi += invoiceAmt;
      // Always recompute net_of_vat from invoice_amount — guards against null/stale values
      csi.net_of_vat = invoiceAmt > 0
        ? Math.round(invoiceAmt / (1 + vatRate) * 100) / 100
        : 0;
      totalNet += csi.net_of_vat;

      const sl = slMap.get(String(csi.sales_line_id));
      const lineItems = sl?.line_items || [];

      // ── Tier-A walk: md_rebate_lines per (MD × hospital × product_id) ────
      // Phase R1 (Apr 29 2026): hospital_id is the additional match dimension.
      // The collection's hospital (or the SalesLine's, if present) scopes the
      // Tier-A rules eligible to fire. Same MD at a different hospital with a
      // different rate must NOT fire on this CSI — different MOA, different
      // institution.
      //
      // Multiple matches at the same (MD × hospital × product) all earn full %
      // independently — `matchAllMdProductRebates` returns the array, the
      // bridge pushes one md_rebate_lines entry per matched rule.
      //
      // Re-walk every time so admin matrix edits + reopen-resubmit cycles
      // pick up rule changes. (Manual edits to md_rebate_lines are not a
      // supported workflow — admin owns the matrix, BDM sees the result.)
      csi.md_rebate_lines = [];
      const tierAExcludedNet = new Map(); // product_id_str → cumulative net_of_vat covered
      const csiHospitalId = sl?.hospital_id || this.hospital_id || null;

      if (csiHospitalId && sl && candidateMds.length && lineItems.length) {
        for (const item of lineItems) {
          if (!item.product_id) continue;
          const itemNet = Number(item.net_of_vat || 0);
          if (!(itemNet > 0)) continue;
          for (const md of candidateMds) {
            const rules = await matchAllMdProductRebates({
              entity_id: this.entity_id,
              doctor_id: md._id,
              hospital_id: csiHospitalId,
              product_id: item.product_id,
              asOfDate: this.cr_date,
            });
            if (!rules.length) continue;
            for (const rule of rules) {
              const rebateAmt = Math.round(itemNet * (Number(rule.rebate_pct || 0) / 100) * 100) / 100;
              if (!(rebateAmt > 0)) continue;
              csi.md_rebate_lines.push({
                md_id: md._id,
                md_name: `${md.firstName || ''} ${md.lastName || ''}`.trim(),
                product_id: item.product_id,
                product_label: rule.product_label || '',
                hospital_id: csiHospitalId,
                rebate_pct: rule.rebate_pct,
                rebate_amount: rebateAmt,
                base_amount: itemNet,
                rule_id: rule._id,
              });
              totalMdRebates += rebateAmt;
            }
            // Track the line_item.net_of_vat covered by Tier-A so partner_tags
            // (calculation_mode=EXCLUDE_MD_COVERED) can subtract it.
            // Multiple matches against the same product still only consume the
            // line_item.net_of_vat once toward the EXCLUDE base — admin pays
            // the multiple-rule cost on the rebate side, not by inflating the
            // exclude base.
            const key = String(item.product_id);
            if (!tierAExcludedNet.has(key)) tierAExcludedNet.set(key, itemNet);
          }
        }
      }

      // ── Commission auto-fill (StaffCommissionRule) ────────────────────────
      // Only auto-fill when the BDM (or admin proxy) didn't manually set a rate.
      if (!csi.commission_rate || csi.commission_rate === 0) {
        // Use the SalesLine's first line_item's product_id as the rule-walk
        // dimension. Mixed-product CSIs land on the first product's rule —
        // good enough for v1; per-line commission would require a deeper
        // schema change (defer to a future phase if requested).
        const firstProductId = lineItems[0]?.product_id || null;
        let commRule = null;
        try {
          commRule = await matchStaffCommissionRule({
            entity_id: this.entity_id,
            payee_role: 'BDM',
            payee_id: this.bdm_id,
            product_code: firstProductId ? String(firstProductId) : undefined,
            customer_code: this.customer_id ? String(this.customer_id) : undefined,
            hospital_id: this.hospital_id || undefined,
            amount: csi.net_of_vat,
            asOfDate: this.cr_date,
          });
        } catch (err) {
          // Defensive — matrix walk failure shouldn't block the save. Fall
          // through to CompProfile fallback.
          console.warn('[Collection bridge] StaffCommissionRule walk failed:', err.message);
        }
        if (commRule) {
          // StaffCommissionRule.commission_pct is stored as percent (e.g. 5
          // means 5%); Collection schema stores as decimal (0.05).
          csi.commission_rate = Number(commRule.commission_pct || 0) / 100;
          csi.commission_rule_id = commRule._id;
        } else if (CompProfile) {
          // Pre-VIP-1.B fallback: per-BDM CompProfile.commission_rate.
          try {
            const profile = await CompProfile.findOne({
              person_id: this.bdm_id,
              entity_id: this.entity_id,
            }).select('commission_rate').lean();
            csi.commission_rate = Number(profile?.commission_rate || 0);
            csi.commission_rule_id = null;
          } catch (err) {
            console.warn('[Collection bridge] CompProfile fallback failed:', err.message);
          }
        }
      }

      // ── partner_tags rebate_pct + calculation_mode auto-fill ─────────────
      // Phase R1 (Apr 29 2026): each partner_tag carries its own
      // calculation_mode (sourced from its NonMdPartnerRebateRule), and
      // hospital_id is the only match dimension besides partner. Multiple
      // partners at the same hospital each earn full % independently per
      // their own mode (no winner-take-all).
      if (csi.partner_tags?.length) {
        for (const tag of csi.partner_tags) {
          if (tag.rebate_pct && tag.rebate_pct > 0 && tag.calculation_mode) continue; // manual override respected
          if (!tag.doctor_id) continue;
          let partnerRule = null;
          try {
            // matchNonMdPartnerRebateRule returns the most-recently-created
            // active rule. matchAllNonMdPartnerRebateRules returns all of
            // them — but partner_tags is keyed by doctor_id (one tag per
            // partner), so the single-match API is the right shape here.
            // For multiple effective-dated rules at the same key, the
            // most-recent wins on the tag.
            const { matchNonMdPartnerRebateRule } = require('../services/matrixWalker');
            partnerRule = await matchNonMdPartnerRebateRule({
              entity_id: this.entity_id,
              partner_id: tag.doctor_id,
              hospital_id: csiHospitalId || undefined,
              asOfDate: this.cr_date,
            });
          } catch (err) {
            console.warn('[Collection bridge] NonMdPartnerRebateRule walk failed:', err.message);
          }
          if (partnerRule) {
            if (!tag.rebate_pct || tag.rebate_pct === 0) {
              tag.rebate_pct = partnerRule.rebate_pct;
            }
            tag.rule_id = partnerRule._id;
            // Phase R1: capture the rule's calculation_mode on the tag so the
            // amount math below knows which base to use. Default safety:
            // EXCLUDE_MD_COVERED if the rule somehow lacks the field (legacy
            // rows pre-migration script).
            tag.calculation_mode = partnerRule.calculation_mode || 'EXCLUDE_MD_COVERED';
          }
        }
      }

      // ── Compute commission amount (after rate auto-fill) ─────────────────
      csi.commission_amount = csi.net_of_vat > 0
        ? Math.round(csi.net_of_vat * (csi.commission_rate || 0) * 100) / 100
        : 0;
      totalComm += csi.commission_amount;

      // ── Compute partner_tags rebate amount (per-tag calculation_mode) ────
      // Phase R1 branching:
      //   EXCLUDE_MD_COVERED → base = net_of_vat − Σ tierAExcludedNet
      //   TOTAL_COLLECTION   → base = net_of_vat (regardless of MD overlap)
      // Locked design (Apr 29 2026): both modes can coexist on the same CSI;
      // each non-MD partner earns full % per its own mode. Doubled cost on
      // overlap with TOTAL_COLLECTION is accepted business policy.
      const tierAExcludedTotal = Array.from(tierAExcludedNet.values())
        .reduce((s, v) => s + v, 0);
      const partnerBaseExclude = Math.max(0, csi.net_of_vat - tierAExcludedTotal);
      const partnerBaseTotal = Math.max(0, csi.net_of_vat);
      if (csi.partner_tags?.length) {
        for (const tag of csi.partner_tags) {
          const mode = tag.calculation_mode || 'EXCLUDE_MD_COVERED';
          const base = mode === 'TOTAL_COLLECTION' ? partnerBaseTotal : partnerBaseExclude;
          tag.rebate_amount = Math.round(base * ((tag.rebate_pct || 0) / 100) * 100) / 100;
          totalRebates += tag.rebate_amount;
        }
      }
    }

    this.total_csi_amount = Math.round(totalCsi * 100) / 100;
    this.total_net_of_vat = Math.round(totalNet * 100) / 100;
    this.total_commission = Math.round(totalComm * 100) / 100;
    this.total_partner_rebates = Math.round(totalRebates * 100) / 100;
    this.total_md_rebates = Math.round(totalMdRebates * 100) / 100;
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
