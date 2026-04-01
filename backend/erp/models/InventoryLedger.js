const mongoose = require('mongoose');
const { cleanBatchNo } = require('../utils/normalize');

const inventoryLedgerSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  bdm_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMaster',
    required: true
  },
  batch_lot_no: {
    type: String,
    required: [true, 'Batch/lot number is required'],
    trim: true
  },
  expiry_date: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  transaction_type: {
    type: String,
    enum: [
      'OPENING_BALANCE', 'GRN', 'CSI',
      'DR_SAMPLING', 'DR_CONSIGNMENT',
      'RETURN_IN', 'TRANSFER_OUT', 'TRANSFER_IN',
      'ADJUSTMENT'
    ],
    required: true
  },
  qty_in: { type: Number, default: 0, min: 0 },
  qty_out: { type: Number, default: 0, min: 0 },
  running_balance: { type: Number },

  event_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionEvent'
  },

  fifo_override: { type: Boolean, default: false },
  override_reason: {
    type: String,
    enum: ['HOSPITAL_POLICY', 'QA_REPLACEMENT', 'DAMAGED_BATCH', 'BATCH_RECALL'],
    validate: {
      validator: function () {
        return !this.fifo_override || !!this.override_reason;
      },
      message: 'Override reason is required when FIFO override is enabled'
    }
  },

  recorded_at: {
    type: Date,
    immutable: true,
    default: Date.now
  },
  recorded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: false,
  collection: 'erp_inventory_ledger'
});

// Normalize batch_lot_no + enforce immutability
inventoryLedgerSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('InventoryLedger entries are immutable. Create a new entry instead.'));
  }
  if (this.batch_lot_no) {
    this.batch_lot_no = cleanBatchNo(this.batch_lot_no);
  }
  this.recorded_at = new Date();
  next();
});

// Indexes
inventoryLedgerSchema.index({ entity_id: 1, bdm_id: 1, product_id: 1, batch_lot_no: 1 });
inventoryLedgerSchema.index({ entity_id: 1, bdm_id: 1, product_id: 1, expiry_date: 1 });
inventoryLedgerSchema.index({ event_id: 1 });
inventoryLedgerSchema.index({ recorded_at: -1 });

module.exports = mongoose.model('InventoryLedger', inventoryLedgerSchema);
