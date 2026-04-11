/**
 * ProductMapping Model — Gap 9 (Rx Correlation)
 *
 * Maps CRM products (CrmProduct) to ERP products (ProductMaster).
 * Required because CRM and ERP use separate product collections with
 * different field naming conventions. Admin controls mappings; auto-map
 * handles obvious matches by brand_name/generic_name.
 *
 * Collection: erp_product_mappings
 */

const mongoose = require('mongoose');

const productMappingSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: true,
    },
    crm_product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrmProduct',
      required: true,
    },
    erp_product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductMaster',
      required: true,
    },
    // How was this mapping established
    match_method: {
      type: String,
      trim: true,
      default: 'MANUAL',
    },
    // Confidence level for auto-matched items
    confidence: {
      type: String,
      trim: true,
      default: 'HIGH',
    },
    mapped_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'erp_product_mappings',
  }
);

// One active mapping per CRM product per entity
productMappingSchema.index(
  { entity_id: 1, crm_product_id: 1, erp_product_id: 1 },
  { unique: true }
);
// Fast CRM→ERP lookup
productMappingSchema.index({ entity_id: 1, crm_product_id: 1 });
// Reverse ERP→CRM lookup
productMappingSchema.index({ entity_id: 1, erp_product_id: 1 });

module.exports = mongoose.model('ProductMapping', productMappingSchema);
