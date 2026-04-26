/**
 * MdProductRebate — Phase VIP-1.B Tier-A (Apr 2026)
 *
 * Per-(MD × product) rebate percentage. The "Tier-A" leg of the two-tier MD
 * rebate scheme — when a sale is collected for a product the MD has an active
 * rebate row for, that product subtotal is excluded from any partner_tags
 * (non-MD) rebate calc and routed instead to this MD via PRF.
 *
 * Authorization invariant — 3 GATES enforced at schema level:
 *   1. Doctor.partnership_status === 'PARTNER'
 *      (LEAD/CONTACTED/VISITED MDs cannot be rebate-eligible — VIP-1.A pipeline)
 *   2. Doctor.partner_agreement_date != null
 *      (signed agreement on file before any rebate accrues — legal guardrail)
 *   3. rebate_pct <= Settings.MAX_MD_REBATE_PCT (lookup-driven, default 25)
 *      (admin-controlled ceiling, configurable per-entity for subscribers)
 *
 * Strategy memo guardrail (Apr 26 2026, partially rescinded): per-product MD
 * rebate is allowed AS LONG AS the 3-gate is hard-locked at schema level.
 * Don't drift back to the over-strict capitation-only stance — the user
 * explicitly accepted the per-product scheme in the Apr 26 plan.
 *
 * BIR_FLAG invariant (downstream):
 *   Every rebate-sourced JE created from this matrix MUST stamp
 *   bir_flag: 'INTERNAL'. Rebates are an internal cost allocation, never on
 *   BIR P&L. The autoJournal.js journalFromPrfCalf default (post-VIP-1.B
 *   Phase 0 commit bc57fba) already enforces 'INTERNAL'; the rebate engine
 *   service in Phase 2 must continue stamping explicitly.
 *
 * Subscription posture:
 *   - entity_id required (Rule #19) — multi-tenant isolation.
 *   - MAX_MD_REBATE_PCT lives in Settings, configurable via Control Center.
 *   - Schema enums (3-gate, status fields) are validation gates; UI labels
 *     come from lookups. Same model shape ports cleanly to PostgreSQL
 *     schema-per-tenant SaaS (Year-2 spin-out per VIP-1 strategy memo).
 *
 * Effective-dating: effective_from / effective_to bound which rule applies on
 * a given collection's csi_date. Rules with no effective_to apply forever.
 *
 * Match priority for the rebate engine walk:
 *   (entity_id, doctor_id, product_id, is_active=true, csi_date in [from,to])
 *   exact-match only — no wildcard / pattern matching at this layer. Bulk
 *   rebate plans should be modeled as multiple rows.
 */

const mongoose = require('mongoose');

const mdProductRebateSchema = new mongoose.Schema(
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
    },
    // ProductMaster lives in the website DB; cross-DB ref by ObjectId only.
    // Validation that the product exists is the responsibility of the rebate
    // matrix admin UI (Phase 4) using getWebsiteProductModel(), not this model.
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'product_id is required'],
      index: true,
    },
    // Denormalized for quick display in the matrix UI without a cross-DB join.
    // Refreshed by the admin UI on save; not authoritative — the cross-DB
    // ProductMaster.brand_name + dosage_strength is canonical (Rule #4).
    product_label: {
      type: String,
      trim: true,
    },
    rebate_pct: {
      type: Number,
      required: [true, 'rebate_pct is required'],
      min: [0, 'rebate_pct cannot be negative'],
      // Upper bound is enforced by the pre-save validator against
      // Settings.MAX_MD_REBATE_PCT — not as a static schema max so subscribers
      // can configure their own ceiling.
    },
    effective_from: {
      type: Date,
      default: Date.now,
    },
    effective_to: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'notes cannot exceed 1000 characters'],
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Composite index for the rebate-engine match walk:
// "Find active row for (entity, doctor, product) effective at csi_date".
mdProductRebateSchema.index({
  entity_id: 1,
  doctor_id: 1,
  product_id: 1,
  is_active: 1,
});

// 3-gate validator. Runs on every save (incl. update via .save()). The
// findOneAndUpdate path is gated separately in the controller — Mongoose does
// NOT run document validators on findOneAndUpdate by default.
mdProductRebateSchema.pre('save', async function (next) {
  try {
    // Gate 1 + 2: partnership_status === 'PARTNER' AND partner_agreement_date != null.
    // Use the registered Doctor model, not require() — avoids circular import in test.
    const Doctor = mongoose.model('Doctor');
    const doc = await Doctor.findById(this.doctor_id)
      .select('partnership_status partner_agreement_date firstName lastName')
      .lean();
    if (!doc) {
      return next(new Error(`MdProductRebate: doctor_id ${this.doctor_id} not found`));
    }
    if (doc.partnership_status !== 'PARTNER') {
      return next(
        new Error(
          `MdProductRebate gate-1 failed: Dr. ${doc.firstName} ${doc.lastName} is ` +
            `${doc.partnership_status || 'unset'}, not PARTNER. ` +
            `Promote via /admin/md-leads (VIP-1.A) before adding rebate rows.`
        )
      );
    }
    if (!doc.partner_agreement_date) {
      return next(
        new Error(
          `MdProductRebate gate-2 failed: Dr. ${doc.firstName} ${doc.lastName} has no ` +
            `partner_agreement_date. Set the signed-agreement date in the MD profile first.`
        )
      );
    }

    // Gate 3: rebate_pct <= MAX_MD_REBATE_PCT (lookup-driven).
    // Lazy-import Settings to avoid a startup cycle.
    const Settings = mongoose.model('Settings');
    const setting = await Settings.findOne({
      entity_id: this.entity_id,
      key: 'MAX_MD_REBATE_PCT',
    })
      .select('value')
      .lean();
    const max = Number(setting?.value ?? 25); // sane default if the setting row hasn't been seeded
    if (this.rebate_pct > max) {
      return next(
        new Error(
          `MdProductRebate gate-3 failed: rebate_pct ${this.rebate_pct}% exceeds ` +
            `MAX_MD_REBATE_PCT (${max}%). Adjust the rebate or have admin raise the ceiling ` +
            `via Control Center → Settings → MAX_MD_REBATE_PCT.`
        )
      );
    }

    // Effective-dating sanity: effective_to must be after effective_from when set.
    if (this.effective_to && this.effective_from && this.effective_to <= this.effective_from) {
      return next(new Error('MdProductRebate: effective_to must be after effective_from'));
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('MdProductRebate', mdProductRebateSchema);
