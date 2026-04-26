/**
 * NonMdPartnerRebateRule — Phase VIP-1.B (Apr 2026)
 *
 * Preset rebate matrix for NON-MD partners (pharmacist staff, hospital admin
 * personnel, supply-chain reps). Replaces the error-prone manual entry of
 * `Collection.partner_tags[].rebate_pct` per CSI — admin pre-configures the
 * matrix once and the Collection bridge auto-fills `partner_tags` from rule
 * matches.
 *
 * Why a separate model from MdProductRebate:
 *   - Different legal posture: non-MD partners are NOT covered by the
 *     RA 6675 / RA 9502 dispensing-prescription concerns. No 3-gate.
 *   - Different match grain: non-MD rebates can be entity-wide OR scoped by
 *     hospital/customer/product. MD rebates are always per-(MD × product).
 *   - Different audit trail: non-MD goes through partner_tags + PRF; MD goes
 *     through md_rebate_lines + PRF (Phase 2 Collection.js bridge).
 *
 * Match priority (most-specific wins, then priority asc):
 *   1. (partner_id, hospital_id, customer_id, product_code) — full-tuple
 *   2. (partner_id, hospital_id, product_code)
 *   3. (partner_id, customer_id, product_code)
 *   4. (partner_id, product_code)
 *   5. (partner_id, hospital_id) — any product
 *   6. (partner_id, customer_id) — any product
 *   7. (partner_id) — global rule for this partner
 *
 * Conditions are AND-combined within a row. Empty fields = no constraint on
 * that dimension. The matrix walker (matrixWalker.js, Phase 2) iterates
 * by (priority asc, specificity desc) and short-circuits on first match.
 *
 * Subscription posture:
 *   - entity_id required (Rule #19).
 *   - Per-row is_active toggle so subscribers can pause without deletion.
 *   - effective_from/to mirror CreditRule.js pattern for plan-versioning
 *     compatibility (Phase SG-4).
 */

const mongoose = require('mongoose');

const nonMdPartnerRebateRuleSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },
    // Partner is a PeopleMaster row tagged as a non-MD rebate-eligible person
    // (pharmacist staff, hospital admin, etc.). The PeopleMaster.position +
    // metadata.is_non_md_partner gate is enforced by the admin UI, not here.
    partner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PeopleMaster',
      required: [true, 'partner_id is required'],
      index: true,
    },
    partner_name: { type: String, trim: true }, // denormalized for matrix UI
    rule_name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // ── Match conditions (AND-combined, all optional) ───────────────────────
    hospital_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    // Product matched by code (string), not _id, so the rule survives
    // ProductMaster _id changes during catalog re-imports. Empty string =
    // matches every product.
    product_code: { type: String, trim: true, default: '' },

    // ── Output ─────────────────────────────────────────────────────────────
    rebate_pct: {
      type: Number,
      required: [true, 'rebate_pct is required'],
      min: [0, 'rebate_pct cannot be negative'],
      max: [100, 'rebate_pct cannot exceed 100'],
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

// Composite index for the matrix walk (matrixWalker.js Phase 2):
// "Find active rules for (entity, partner) effective at csi_date,
// optionally narrowed by hospital/customer/product".
nonMdPartnerRebateRuleSchema.index({
  entity_id: 1,
  partner_id: 1,
  is_active: 1,
  priority: 1,
});

// Effective-dating sanity.
nonMdPartnerRebateRuleSchema.pre('save', function (next) {
  if (this.effective_to && this.effective_from && this.effective_to <= this.effective_from) {
    return next(new Error('NonMdPartnerRebateRule: effective_to must be after effective_from'));
  }
  next();
});

module.exports = mongoose.model('NonMdPartnerRebateRule', nonMdPartnerRebateRuleSchema);
