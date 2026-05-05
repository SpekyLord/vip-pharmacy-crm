const mongoose = require('mongoose');
const { cleanName } = require('../utils/nameClean');
const { normalizeUnit, UNIT_CODES } = require('../utils/normalize');

const productMasterSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
    // Phase G7.A (May 2026): kept for backwards compatibility during the multi-phase
    // canonicalization rollout. G7.A.0 adds `product_key_clean` and EntityProductCarry
    // alongside this field; G7.A.1 dedupes; G7.A.2 flips validators to read carry rows;
    // G7.A.3 drops this field. Until G7.A.3, all transactional code keeps using entity_id.
  },
  item_key: {
    type: String,
    trim: true
    // Auto-generated: "BrandName|DosageStrength" — unique per entity (see compound index)
    // Not marked required — generated in pre('validate') hook before validation runs
  },
  // Phase G7.A.0 (May 05 2026) — Canonical key, mirrors Doctor.vip_client_name_clean +
  // Customer.customer_name_clean + Hospital.hospital_name_clean.
  // Shape: cleanName(brand_name) + '|' + cleanName(generic_name) + '|' +
  //        cleanName(dosage_strength) + '|' + normalizeUnit(unit_code || sold_per).
  // Includes generic + UOM so genuine UOM splits ("Viprazole 40mg VIAL" vs "Viprazole 40mg AMP")
  // resolve to different keys. Auto-maintained by pre('validate') and pre('findOneAndUpdate').
  // Index is non-unique today; G7.A.1 dedupes and adds unique partial index after.
  product_key_clean: {
    type: String,
    index: true,
  },
  // Phase G7.A.0 (forward-compat for G7.A.1 dedupe) — soft-delete + rollback-grace
  // shape mirrors Doctor.mergedInto / Customer.mergedInto.
  mergedInto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    default: null,
    index: true,
  },
  mergedAt: { type: Date, default: null },
  generic_name: {
    type: String,
    required: [true, 'Generic name is required'],
    trim: true
  },
  brand_name: {
    type: String,
    required: [true, 'Brand name is required'],
    trim: true
  },
  dosage_strength: {
    type: String,
    required: [true, 'Dosage/strength is required'],
    trim: true
  },
  sold_per: { type: String, trim: true },

  // Data quality fields
  product_aliases: { type: [String], default: [] },
  brand_name_clean: { type: String, index: true },
  unit_code: {
    type: String,
    // No enum restriction — validated via Lookup table (UNIT_CODE category)
    trim: true,
  },

  // UOM Conversion: 1 purchase_uom = conversion_factor × selling_uom
  // e.g., 1 CASE = 10 BOX
  purchase_uom: { type: String, trim: true },   // unit supplier sells in (e.g., CASE)
  selling_uom: { type: String, trim: true },     // unit we sell/track inventory in (e.g., BOX)
  conversion_factor: { type: Number, default: 1, min: 1 },  // multiplier from purchase to selling units

  // Pricing
  purchase_price: { type: Number, default: 0 },
  selling_price: { type: Number, default: 0 },
  vat_status: {
    type: String,
    default: 'VATABLE'
  }, // Lookup: VAT_TYPE

  // SAP-level reorder fields (null = not configured)
  reorder_min_qty: { type: Number, default: null, min: 0 },
  reorder_qty: { type: Number, default: null, min: 1 },
  safety_stock_qty: { type: Number, default: null, min: 0 },
  lead_time_days: { type: Number, default: null, min: 0 },

  // Classification
  stock_type: {
    type: String,
    default: 'PHARMA'
  }, // Lookup: STOCK_TYPE
  category: { type: String, trim: true },
  is_active: { type: Boolean, default: true },

  // Display / detail
  description: { type: String },
  key_benefits: { type: String },
  image_url: { type: String },

  // Audit
  added_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  added_at: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'erp_product_master'
});

// Build item_key from brand_name + dosage_strength (both required)
function buildItemKey(brandName, dosageStrength) {
  if (!brandName || !dosageStrength) return null;
  return `${brandName}|${dosageStrength}`;
}

// Phase G7.A.0 — Build canonical product key (global, cross-entity).
// Shape: BRAND|GENERIC|DOSAGE|UNIT (cleanName-normalized). All four required;
// returns null if any is missing so the field stays unset and the partial
// index doesn't trip on incomplete rows.
function buildProductKeyClean({ brand_name, generic_name, dosage_strength, unit_code, sold_per }) {
  if (!brand_name || !generic_name || !dosage_strength) return null;
  const unit = normalizeUnit(unit_code || sold_per);
  if (!unit) return null;
  const parts = [
    cleanName(brand_name),
    cleanName(generic_name),
    cleanName(dosage_strength),
    unit,
  ];
  if (parts.some((p) => !p)) return null;
  return parts.join('|');
}

// Auto-generate item_key, brand_name_clean, unit_code, UOM defaults, product_key_clean.
// Uses pre('validate') so item_key is set BEFORE Mongoose required-field validation runs.
productMasterSchema.pre('validate', function (next) {
  // Generate item_key if missing or if brand_name/dosage changed
  if (!this.item_key || this.isModified('brand_name') || this.isModified('dosage_strength')) {
    const key = buildItemKey(this.brand_name, this.dosage_strength);
    if (key) this.item_key = key;
  }
  if (this.isModified('brand_name') && this.brand_name) {
    this.brand_name_clean = cleanName(this.brand_name);
  }
  if (this.sold_per && !this.unit_code) {
    this.unit_code = normalizeUnit(this.sold_per);
  }
  // Default selling_uom to unit_code, purchase_uom to selling_uom
  if (!this.selling_uom && this.unit_code) {
    this.selling_uom = this.unit_code;
  }
  if (!this.purchase_uom && this.selling_uom) {
    this.purchase_uom = this.selling_uom;
  }

  // Phase G7.A.0 — maintain product_key_clean. Recompute when any of the four
  // identity fields change, when the field is empty (back-compat for legacy rows),
  // or on insert (this.isNew). Backfill script handles bulk one-time population.
  const identityChanged = this.isModified('brand_name') || this.isModified('generic_name')
    || this.isModified('dosage_strength') || this.isModified('unit_code')
    || this.isModified('sold_per');
  if (this.isNew || !this.product_key_clean || identityChanged) {
    const computed = buildProductKeyClean({
      brand_name: this.brand_name,
      generic_name: this.generic_name,
      dosage_strength: this.dosage_strength,
      unit_code: this.unit_code,
      sold_per: this.sold_per,
    });
    if (computed) this.product_key_clean = computed;
  }
  next();
});

// Mirror normalization for findOneAndUpdate (pre-save doesn't run on updates).
// Phase G7.A.0 (May 2026) — also recomputes product_key_clean on identity-field updates.
productMasterSchema.pre('findOneAndUpdate', async function (next) {
  const upd = this.getUpdate() || {};
  const $set = upd.$set || {};

  // Regenerate item_key when brand_name or dosage_strength is in the $set
  // Frontend always sends both fields, but be defensive for partial updates
  if ($set.brand_name !== undefined || $set.dosage_strength !== undefined) {
    const key = buildItemKey(
      $set.brand_name,   // will be present — frontend sends full form
      $set.dosage_strength
    );
    if (key) {
      if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
      this.getUpdate().$set.item_key = key;
    }
  }
  if ($set.brand_name) {
    if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
    this.getUpdate().$set.brand_name_clean = cleanName($set.brand_name);
  }
  if ($set.sold_per && !$set.unit_code) {
    if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
    this.getUpdate().$set.unit_code = normalizeUnit($set.sold_per);
  }

  // Phase G7.A.0 — recompute product_key_clean if any identity field is in the
  // update. Need all four parts; fetch missing ones from the existing doc so
  // partial updates never produce a stale or null canonical key.
  const identityKeys = ['brand_name', 'generic_name', 'dosage_strength', 'unit_code', 'sold_per'];
  const identityTouched = identityKeys.some((k) => $set[k] !== undefined || upd[k] !== undefined);
  if (identityTouched) {
    let snapshot = {};
    const allPresent = identityKeys.every((k) => $set[k] !== undefined || upd[k] !== undefined);
    if (!allPresent) {
      try {
        snapshot = await this.model.findOne(this.getFilter())
          .select('brand_name generic_name dosage_strength unit_code sold_per').lean() || {};
      } catch (_) { /* defensive — leave snapshot empty, key may stay unset */ }
    }
    const merged = {};
    for (const k of identityKeys) {
      merged[k] = $set[k] !== undefined ? $set[k]
        : (upd[k] !== undefined ? upd[k] : snapshot[k]);
    }
    const computed = buildProductKeyClean(merged);
    if (computed) {
      if (!upd.$set) this.setUpdate({ ...upd, $set: {} });
      this.getUpdate().$set.product_key_clean = computed;
    }
  }
  next();
});

// Indexes
productMasterSchema.index({ entity_id: 1, item_key: 1 }, { unique: true });
productMasterSchema.index({ entity_id: 1, is_active: 1 });
productMasterSchema.index({ entity_id: 1, stock_type: 1 });
productMasterSchema.index({ entity_id: 1, brand_name_clean: 1 });
productMasterSchema.index({ brand_name: 'text', generic_name: 'text', product_aliases: 'text' });

module.exports = mongoose.model('ProductMaster', productMasterSchema);
