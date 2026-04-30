/**
 * NonMdPartnerRebateRule — Phase VIP-1.B / Phase R1 (Apr 2026)
 *
 * Preset rebate matrix for NON-MD partners (pharmacist staff, hospital admin
 * personnel, supply-chain reps). Replaces the error-prone manual entry of
 * `Collection.partner_tags[].rebate_pct` per CSI — admin pre-configures the
 * matrix once and the Collection bridge auto-fills `partner_tags` from rule
 * matches.
 *
 * Phase R1 (Apr 29 2026) — schema simplification:
 *   - `partner_id` now refs `Doctor` (not PeopleMaster). Non-MD partners are
 *     just Doctor rows whose `client_type !== 'Medical Doctor'`. The non-MD
 *     dropdown filters by client_type AND partnership_status='PARTNER' AND
 *     partner_agreement_date != null. Mirrors the Tier-A 3-gate logic.
 *   - `hospital_id` flips REQUIRED — every non-MD rebate is per-hospital.
 *     Auto-filled from the partner's Doctor.hospitals[] on the form.
 *   - `customer_id`, `product_code`, `priority` REMOVED — match grain is
 *     simply (entity, partner, hospital). Multiple rules at same key all
 *     earn (independent obligations to different non-MD partners).
 *   - `calculation_mode` added (lookup-driven via NONMD_REBATE_CALC_MODE):
 *       * EXCLUDE_MD_COVERED (default) — base = Σ collected lines NOT
 *         covered by an active MD Tier-A rule for the same hospital.
 *       * TOTAL_COLLECTION — base = collection.net_of_vat (gross − VAT − CWT)
 *         regardless of MD overlap. Doubles cost when MD rebate also fires
 *         on the same products; business policy permits this.
 *
 * Why a separate model from MdProductRebate:
 *   - Different legal posture: non-MD partners are NOT covered by RA 6675
 *     RA 9502 dispensing-prescription concerns. No 3-gate hard-lock at
 *     schema level (partner_agreement_date is enforced as a UI gate, not a
 *     pre-save hook — non-MD partners have looser legal posture).
 *   - Different match grain: per-(partner × hospital) only. MD rebates are
 *     per-(MD × hospital × product).
 *
 * Audit trail: non-MD goes through partner_tags + autoPrfRouting → PrfCalf.
 * BIR_FLAG = INTERNAL on the resulting JE (autoJournal Phase 0 invariant)
 * regardless of whether PRF is later disbursed to the partner — internal
 * cost allocation, never on BIR P&L.
 *
 * Subscription posture (Rule #19 + #3):
 *   - entity_id required (multi-tenant isolation).
 *   - calculation_mode default + label come from `NONMD_REBATE_CALC_MODE`
 *     lookup category — subscribers configure via Control Center.
 *   - Per-row is_active toggle.
 *   - effective_from/to mirror CreditRule.js for plan-versioning.
 */

const mongoose = require('mongoose');

const NON_MD_CALC_MODES = ['EXCLUDE_MD_COVERED', 'TOTAL_COLLECTION'];

const nonMdPartnerRebateRuleSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },
    // Phase R1 — partner_id is now a Doctor _id (the row whose client_type !=
    // 'Medical Doctor' and partnership_status === 'PARTNER').
    partner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'partner_id is required'],
      index: true,
    },
    partner_name: { type: String, trim: true }, // denormalized for matrix UI
    rule_name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },

    // ── Match dimension (REQUIRED in Phase R1) ─────────────────────────────
    // Hospital_id is auto-filled from Doctor.hospitals[] on the form. If the
    // partner has multiple hospitals, admin picks one. Same partner at
    // multiple hospitals = multiple rule rows.
    hospital_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: [true, 'hospital_id is required (Phase R1)'],
      index: true,
    },

    // ── Calculation mode (Phase R1) ────────────────────────────────────────
    // EXCLUDE_MD_COVERED → base = Σ lines not covered by MD Tier-A on the
    //                      same hospital (default — protects against double
    //                      paying on the same line item).
    // TOTAL_COLLECTION   → base = collection.net_of_vat (gross − VAT − CWT)
    //                      regardless of MD overlap. Used when admin wants
    //                      a flat partnership-wide pct on every CSI.
    calculation_mode: {
      type: String,
      enum: {
        values: NON_MD_CALC_MODES,
        message: `calculation_mode must be one of: ${NON_MD_CALC_MODES.join(', ')}`,
      },
      default: 'EXCLUDE_MD_COVERED',
      required: [true, 'calculation_mode is required'],
    },

    // ── Output ─────────────────────────────────────────────────────────────
    rebate_pct: {
      type: Number,
      required: [true, 'rebate_pct is required'],
      min: [0, 'rebate_pct cannot be negative'],
      max: [100, 'rebate_pct cannot exceed 100'],
    },

    // ── Versioning + activation ────────────────────────────────────────────
    is_active: { type: Boolean, default: true, index: true },
    effective_from: { type: Date, default: Date.now },
    effective_to: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 1000 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Composite index for the matrix walk:
// "Find active rules for (entity, partner, hospital) effective at csi_date".
// NOT unique — Phase R1 supports multiple active rules at the same key (e.g.
// effective-dated promo rate stacked with a base rate, or just an admin
// staging an upcoming change while the current rule still runs). Walker
// returns all matches, each earns full %.
nonMdPartnerRebateRuleSchema.index({
  entity_id: 1,
  partner_id: 1,
  hospital_id: 1,
  is_active: 1,
});

// Effective-dating sanity.
nonMdPartnerRebateRuleSchema.pre('save', function (next) {
  if (this.effective_to && this.effective_from && this.effective_to <= this.effective_from) {
    return next(new Error('NonMdPartnerRebateRule: effective_to must be after effective_from'));
  }
  next();
});

module.exports = mongoose.model('NonMdPartnerRebateRule', nonMdPartnerRebateRuleSchema);
module.exports.NON_MD_CALC_MODES = NON_MD_CALC_MODES;
