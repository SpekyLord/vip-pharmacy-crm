/**
 * StaffCommissionRule — Phase VIP-1.B (Apr 2026)
 *
 * Single-matrix model for ERP and storefront staff commissions:
 *   - BDM        — ERP collection-driven commission (existing flow)
 *   - ECOMM_REP  — Storefront e-commerce rep (Order.paid → commission accrual)
 *   - AREA_BDM   — Storefront geographic territory commission, resolved by
 *                  Order.shipping_address.province ↔ Territory.provinces[]
 *
 * Why a single model (vs. three separate ones per payee_role): the match-walk
 * logic is identical (territory + product + customer + payee), only the trigger
 * source differs (Collection POSTED vs. Order paid). Keeping all three in one
 * matrix lets the admin UI present a single "Commission Rules" page (Phase 4)
 * with payee_role tabs, and lets the engine reuse one walker.
 *
 * Match priority (most-specific wins, then priority asc):
 *   (payee_id, territory_id, product_code, customer_code) → ... → (payee_id)
 *   Conditions are AND-combined. Empty fields = no constraint.
 *
 * Fallback for BDM payee_role:
 *   When no rule matches a CSI for an ERP collection, the engine falls back
 *   to CompProfile.commission_rate (existing pre-VIP-1.B behavior). This
 *   preserves the current ledger for unconfigured BDMs.
 *
 * Fallback for ECOMM_REP / AREA_BDM:
 *   No fallback. If no rule matches, no commission accrues. (Storefront flow
 *   is greenfield — no legacy behavior to preserve.)
 *
 * BIR_FLAG: Commissions ARE BIR-deductible expense, so commission JEs stamp
 * 'BOTH' (not INTERNAL like rebates). The engine in Phase 2 must explicitly
 * pass bir_flag: 'BOTH' for commission JEs (not rely on the autoJournal
 * default which has been flipped to INTERNAL for PRF/CALF flows post-bc57fba).
 *
 * Subscription posture:
 *   - entity_id required (Rule #19).
 *   - Per-row is_active toggle.
 *   - effective_from/to mirror CreditRule.js.
 */

const mongoose = require('mongoose');

const staffCommissionRuleSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },

    // ── Payee dimensions ───────────────────────────────────────────────────
    // payee_role drives which trigger source uses this rule.
    payee_role: {
      type: String,
      enum: {
        values: ['BDM', 'ECOMM_REP', 'AREA_BDM'],
        message: 'payee_role must be BDM, ECOMM_REP, or AREA_BDM',
      },
      required: [true, 'payee_role is required'],
      index: true,
    },
    // payee_id is the User _id for BDM and ECOMM_REP, or a User _id with
    // role=staff serving as area-BDM for AREA_BDM. May be null for territory-
    // level rules where any AREA_BDM in that territory qualifies (then the
    // engine resolves the actual payee from the Territory model).
    payee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    payee_name: { type: String, trim: true }, // denormalized for UI

    rule_name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // ── Match conditions (AND-combined, all optional) ──────────────────────
    territory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Territory',
      default: null,
    },
    product_code: { type: String, trim: true, default: '' },
    customer_code: { type: String, trim: true, default: '' },
    hospital_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
    },
    // Order amount band (storefront): rule only applies when order net falls
    // within this band. min=0, max=null both default to "no constraint".
    min_amount: { type: Number, default: 0, min: 0 },
    max_amount: { type: Number, default: null }, // null = unbounded

    // ── Output ─────────────────────────────────────────────────────────────
    commission_pct: {
      type: Number,
      required: [true, 'commission_pct is required'],
      min: [0, 'commission_pct cannot be negative'],
      max: [100, 'commission_pct cannot exceed 100'],
    },

    // ── Versioning + activation ────────────────────────────────────────────
    priority: { type: Number, default: 100, min: 0 },
    is_active: { type: Boolean, default: true, index: true },
    effective_from: { type: Date, default: Date.now },
    effective_to: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 1000 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Composite index for the matrix walk: by entity, role, active state.
staffCommissionRuleSchema.index({
  entity_id: 1,
  payee_role: 1,
  is_active: 1,
  priority: 1,
});

// Optional payee-specific lookup
staffCommissionRuleSchema.index({
  entity_id: 1,
  payee_id: 1,
  is_active: 1,
});

staffCommissionRuleSchema.pre('save', function (next) {
  if (this.effective_to && this.effective_from && this.effective_to <= this.effective_from) {
    return next(new Error('StaffCommissionRule: effective_to must be after effective_from'));
  }
  if (this.max_amount != null && this.min_amount != null && this.max_amount <= this.min_amount) {
    return next(new Error('StaffCommissionRule: max_amount must be greater than min_amount'));
  }
  next();
});

module.exports = mongoose.model('StaffCommissionRule', staffCommissionRuleSchema);
