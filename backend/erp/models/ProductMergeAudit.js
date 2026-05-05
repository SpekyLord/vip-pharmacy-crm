/**
 * ProductMergeAudit — Phase G7.A.0 forward-compat for G7.A.1 (May 05 2026).
 *
 * Mirror of [DoctorMergeAudit](../../models/DoctorMergeAudit.js) for ProductMaster
 * dedupe. Captures the full FK-cascade snapshot for every product merge so a
 * merge can be rolled back within the 30-day grace window.
 *
 * Schema is shipped in G7.A.0 alongside ProductMaster.mergedInto / .mergedAt
 * forward-compat fields; the merge SERVICE that writes rows here ships in
 * G7.A.1 (productMergeService.js + productMergeController.js + bulk merge tool).
 *
 * 30-day TTL on audit rows matches the soft-delete grace window. Cron purges
 * merged ProductMaster docs AND their audit rows in lock-step so rollback
 * never references a hard-deleted product.
 *
 * Integrity invariant: a ProductMaster doc with `mergedInto` set must have at
 * least one ProductMergeAudit row pointing at it as `loser_id` AND
 * `status='APPLIED'`. Healthcheck `healthcheckProductGlobalization.js` (G7.A.0)
 * verifies the schema; integrity verifier ships in G7.A.1.
 */
const mongoose = require('mongoose');

const cascadeEntrySchema = new mongoose.Schema(
  {
    model: { type: String, required: true },
    field: { type: String, required: true },
    db: { type: String, enum: ['crm', 'erp'], default: 'erp' },
    repointed_ids: [{ type: mongoose.Schema.Types.ObjectId }],
    collision_ids: [
      {
        _id: { type: mongoose.Schema.Types.ObjectId },
        original_value: mongoose.Schema.Types.Mixed,
        sentinel_value: mongoose.Schema.Types.Mixed,
      },
    ],
    deactivated_ids: [{ type: mongoose.Schema.Types.ObjectId }],
  },
  { _id: false },
);

const productMergeAuditSchema = new mongoose.Schema(
  {
    winner_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductMaster',
      required: true,
      index: true,
    },
    loser_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductMaster',
      required: true,
      index: true,
    },
    winner_snapshot: {
      brand_name: String,
      generic_name: String,
      dosage_strength: String,
      sold_per: String,
      unit_code: String,
      product_key_clean: String,
      entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity' },
      selling_price: Number,
      purchase_price: Number,
    },
    loser_snapshot: {
      brand_name: String,
      generic_name: String,
      dosage_strength: String,
      sold_per: String,
      unit_code: String,
      product_key_clean: String,
      entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity' },
      selling_price: Number,
      purchase_price: Number,
      is_active: Boolean,
    },
    cascade: [cascadeEntrySchema],
    reason: { type: String, required: true, maxlength: 1000 },
    actor_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    actor_ip: String,
    actor_user_agent: String,
    status: {
      type: String,
      enum: ['APPLIED', 'ROLLED_BACK', 'HARD_DELETED'],
      default: 'APPLIED',
      index: true,
    },
    rolled_back_at: { type: Date, default: null },
    rolled_back_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    hard_deleted_at: { type: Date, default: null },
  },
  { timestamps: true, collection: 'erp_product_merge_audit' },
);

// 30-day TTL (mirrors DoctorMergeAudit grace window)
productMergeAuditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('ProductMergeAudit', productMergeAuditSchema);
