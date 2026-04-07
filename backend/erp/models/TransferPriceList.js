const mongoose = require('mongoose');

const transferPriceListSchema = new mongoose.Schema({
  source_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Source entity is required']
  },
  target_entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: [true, 'Target entity is required']
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: [true, 'Product is required']
  },
  transfer_price: {
    type: Number,
    required: [true, 'Transfer price is required'],
    min: [0.01, 'Transfer price must be greater than 0']
  },
  effective_date: {
    type: Date,
    default: Date.now
  },
  set_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  notes: { type: String, trim: true }
}, {
  timestamps: true,
  collection: 'erp_transfer_price_list'
});

// One active price per product per entity pair
transferPriceListSchema.index(
  { source_entity_id: 1, target_entity_id: 1, product_id: 1 },
  { unique: true }
);
transferPriceListSchema.index({ source_entity_id: 1, is_active: 1 });
transferPriceListSchema.index({ target_entity_id: 1 });

module.exports = mongoose.model('TransferPriceList', transferPriceListSchema);
