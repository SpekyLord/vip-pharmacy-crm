/**
 * EntityProductCarry — Phase G7.A.0 (May 05 2026).
 *
 * Per-entity carry list for the global ProductMaster catalog. Each row says
 * "this entity is authorized to transact this product, at this price."
 *
 * Relationship to other layers (price-resolver order):
 *   1. HospitalContractPrice (per entity × hospital × product, time-bounded)
 *   2. EntityProductCarry.selling_price (per entity default — populated here)
 *   3. (future) CustomerTierPrice — not modelled today
 *
 * Replaces the band-aid `PRODUCT_CATALOG_ACCESS.INHERIT_PARENT` lookup pattern
 * (where subsidiaries see parent products via inheritance). Carry-list is
 * explicit grant — no implicit inheritance — so admin can see exactly which
 * entities are authorized to sell each SKU.
 *
 * Phase rollout:
 *   - G7.A.0 (THIS SESSION): schema + backfill from existing (entity, product) pairs.
 *     Validators NOT YET reading carry rows; rows are populated but unused.
 *   - G7.A.1: dedupe ProductMaster (collapse cross-entity duplicates by canonical key).
 *   - G7.A.2: validators flip — GRN, Sales, IC transfer, Hospital PO, etc.
 *     replace `entity_id: req.entityId` filter on ProductMaster with
 *     `find on EntityProductCarry where entity_id=req.entityId AND is_active=true`.
 *     Helper: backend/erp/utils/assertProductsCarried.js (G7.A.2).
 *   - G7.A.3: drop ProductMaster.entity_id and pricing-on-canonical fields.
 *   - G7.A.4: admin Carry-List Manager UI (grant / revoke / set price).
 *
 * Forward-compat for Phase G7.B (Territory Exclusivity):
 *   - territory_id is nullable today (interpreted as "all territories of this entity").
 *   - G7.B adds Territory master + populates territory_id rows + adds the unique
 *     partial index `{ product_id, territory_id, is_active: true }` to enforce
 *     "at most one entity carries this product in a given territory."
 *   - Schema is stable across G7.A and G7.B — no re-flip needed.
 *
 * Approval gate: lifecycle-role-driven via PRODUCT_LIFECYCLE_ROLES Lookup
 * (see backend/utils/resolveProductLifecycleRole.js).
 */
const mongoose = require('mongoose');

const STATUS = ['ACTIVE', 'SUSPENDED', 'EXPIRED', 'SUPERSEDED'];

const entityProductCarrySchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: [true, 'Entity is required'],
      index: true,
    },
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductMaster',
      required: [true, 'Product is required'],
      index: true,
    },
    // Phase G7.B forward-compat — null means "all territories of this entity"
    // until G7.B populates and enforces the unique-per-territory invariant.
    territory_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Territory',
      default: null,
    },
    is_active: { type: Boolean, default: true, index: true },

    // Per-entity pricing — moves OFF ProductMaster in G7.A.3.
    selling_price: { type: Number, default: 0, min: 0 },
    purchase_price: { type: Number, default: 0, min: 0 },

    // Per-entity warehouse policy fields. Today these mirror ProductMaster's
    // values during backfill; admin can override per entity going forward.
    reorder_min_qty: { type: Number, default: null, min: 0 },
    reorder_qty: { type: Number, default: null, min: 1 },
    safety_stock_qty: { type: Number, default: null, min: 0 },
    lead_time_days: { type: Number, default: null, min: 0 },

    // VAT override — null means use canonical ProductMaster.vat_status (Lock 3).
    // Populated only for the rare per-entity-VAT-regime exception (PEZA, etc.).
    vat_override: { type: String, default: null },

    // Audit trail (mirrors HospitalContractPrice shape)
    effective_from: { type: Date, default: Date.now },
    effective_to: { type: Date, default: null },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approved_at: { type: Date, default: null },
    change_reason: { type: String, trim: true },
    status: { type: String, enum: STATUS, default: 'ACTIVE', index: true },

    // Forward-compat: link to ApprovalRequest when gated
    approval_request_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApprovalRequest',
      default: null,
    },

    notes: { type: String, trim: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'erp_entity_product_carry' },
);

// Indexes
// Most-recent-active lookup for the price resolver
entityProductCarrySchema.index({ entity_id: 1, product_id: 1, is_active: 1, effective_from: -1 });

// At most one ACTIVE carry per (entity, product, territory). With territory_id=null
// in G7.A, this means at most one active carry per (entity, product) — exactly the
// invariant we want before G7.B layers on territory exclusivity. The partial filter
// allows multiple SUPERSEDED rows to coexist (audit history).
entityProductCarrySchema.index(
  { entity_id: 1, product_id: 1, territory_id: 1, is_active: 1 },
  { unique: true, partialFilterExpression: { is_active: true } },
);

// G7.B pre-baked index — at most one entity carries a product in a given territory.
// Won't fire today because territory_id is null on backfill rows; G7.B populates it
// and this index then enforces channel exclusivity.
entityProductCarrySchema.index(
  { product_id: 1, territory_id: 1, is_active: 1 },
  {
    unique: true,
    partialFilterExpression: { is_active: true, territory_id: { $type: 'objectId' } },
  },
);

entityProductCarrySchema.statics.STATUS = STATUS;

module.exports = mongoose.model('EntityProductCarry', entityProductCarrySchema);
