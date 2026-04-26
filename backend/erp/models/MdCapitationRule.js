/**
 * MdCapitationRule — Phase VIP-1.B Tier-B (Apr 2026)
 *
 * Per-MD per-patient capitation rebate. The "Tier-B" leg of the two-tier MD
 * scheme — when a storefront patient attributed to an MD purchases a product
 * that is NOT covered by an active MdProductRebate row, this Tier-B rule
 * applies (frequency-windowed) instead.
 *
 * Why two tiers (locked Apr 26 strategy memo):
 *   - Tier-A (per-product %) is high-margin: rewards MDs for product-specific
 *     loyalty. Audit gate: 3-gate from MdProductRebate.js.
 *   - Tier-B (per-patient capitation) is low-margin floor: ensures attributed
 *     patient flow generates rebate even when no per-product rule matches.
 *     Caps via frequency_window prevent gaming (e.g., one patient buying 10x
 *     in a month doesn't trigger 10 capitation events).
 *
 * Excluded products:
 *   excluded_product_ids[] is auto-synced from active MdProductRebate rows
 *   for the same doctor_id (sync runs in the rebateAccrualEngine on apply,
 *   AND nightly via a Phase 2 maintenance job). The intent is "if Tier-A
 *   covers it, Tier-B doesn't double-pay" — strict exclusion, not preference.
 *
 * Authorization invariant — same 3-gate as Tier-A:
 *   Pre-save validates partnership_status === 'PARTNER' AND
 *   partner_agreement_date != null. Tier-B doesn't have a per-product %
 *   ceiling — it's a flat amount or pct of order — but the engine layer
 *   may still respect Settings.MAX_MD_CAPITATION_AMOUNT ceiling (Phase 2).
 *
 * BIR_FLAG: same as Tier-A — every Tier-B-sourced JE stamps INTERNAL.
 *
 * Frequency window enforcement:
 *   Engine logic in rebateAccrualEngine.js (Phase 2) is responsible for
 *   counting prior accruals in the window. This model defines the rule;
 *   it does NOT count prior usage at save time.
 */

const mongoose = require('mongoose');

const mdCapitationRuleSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'entity_id is required'],
      index: true,
    },
    doctor_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'doctor_id is required'],
      index: true,
      unique: false, // intentionally NOT unique — admin may inactivate + supersede
    },
    rule_name: { type: String, required: true, trim: true },

    // ── Capitation amount: pick ONE of the two ─────────────────────────────
    // capitation_amount = flat amount per qualifying patient event.
    // capitation_pct = percentage of qualifying order total.
    // Pre-save validator enforces exactly one is non-zero.
    capitation_amount: { type: Number, default: 0, min: 0 },
    capitation_pct: { type: Number, default: 0, min: 0, max: 100 },

    // ── Frequency window ───────────────────────────────────────────────────
    // PER_PATIENT_PER_MONTH (default) — one accrual per (patient, month)
    // PER_PATIENT_PER_QUARTER
    // PER_PATIENT_PER_YEAR
    // PER_ORDER — every qualifying order accrues (no cap)
    frequency_window: {
      type: String,
      enum: {
        values: ['PER_PATIENT_PER_MONTH', 'PER_PATIENT_PER_QUARTER', 'PER_PATIENT_PER_YEAR', 'PER_ORDER'],
        message: 'frequency_window must be PER_PATIENT_PER_MONTH/QUARTER/YEAR or PER_ORDER',
      },
      default: 'PER_PATIENT_PER_MONTH',
    },

    // ── Excluded products (Tier-A union) ───────────────────────────────────
    // Auto-synced by rebateAccrualEngine on apply; admin-readable only in UI.
    // The active set of MdProductRebate rows for this (entity, doctor) becomes
    // the excluded list — strict exclusion, no double-pay between tiers.
    excluded_product_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        // No ref: ProductMaster lives in website DB; cross-DB lookup-by-id only.
      },
    ],
    excluded_synced_at: { type: Date, default: null },

    // ── Versioning + activation ────────────────────────────────────────────
    is_active: { type: Boolean, default: true, index: true },
    effective_from: { type: Date, default: Date.now },
    effective_to: { type: Date, default: null },

    notes: { type: String, trim: true, maxlength: 1000 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

mdCapitationRuleSchema.index({
  entity_id: 1,
  doctor_id: 1,
  is_active: 1,
});

// Pre-save: enforce exactly-one-output + 3-gate (mirror Tier-A).
mdCapitationRuleSchema.pre('save', async function (next) {
  try {
    // Output sanity: exactly one of capitation_amount / capitation_pct.
    const hasAmount = (this.capitation_amount || 0) > 0;
    const hasPct = (this.capitation_pct || 0) > 0;
    if (hasAmount === hasPct) {
      return next(
        new Error(
          'MdCapitationRule: set exactly one of capitation_amount (flat) or capitation_pct (percent)'
        )
      );
    }

    // Effective-dating sanity.
    if (this.effective_to && this.effective_from && this.effective_to <= this.effective_from) {
      return next(new Error('MdCapitationRule: effective_to must be after effective_from'));
    }

    // 3-gate (Gate 1 + 2) — same as Tier-A. Gate 3 (max-pct ceiling) is not
    // enforced here because Tier-B rules are per-patient flat/pct, not the
    // same ceiling semantics; the engine layer can apply MAX_MD_CAPITATION_PCT
    // separately in Phase 2 if the user sets it.
    const Doctor = mongoose.model('Doctor');
    const doc = await Doctor.findById(this.doctor_id)
      .select('partnership_status partner_agreement_date firstName lastName')
      .lean();
    if (!doc) {
      return next(new Error(`MdCapitationRule: doctor_id ${this.doctor_id} not found`));
    }
    if (doc.partnership_status !== 'PARTNER') {
      return next(
        new Error(
          `MdCapitationRule gate-1 failed: Dr. ${doc.firstName} ${doc.lastName} is ` +
            `${doc.partnership_status || 'unset'}, not PARTNER. ` +
            `Promote via /admin/md-leads (VIP-1.A) before adding capitation rules.`
        )
      );
    }
    if (!doc.partner_agreement_date) {
      return next(
        new Error(
          `MdCapitationRule gate-2 failed: Dr. ${doc.firstName} ${doc.lastName} has no ` +
            `partner_agreement_date. Set the signed-agreement date in the MD profile first.`
        )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('MdCapitationRule', mdCapitationRuleSchema);
