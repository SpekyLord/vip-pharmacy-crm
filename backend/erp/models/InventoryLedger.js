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
  warehouse_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warehouse',
    // Optional during migration; new entries should always set this (Phase 17)
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
    type: String, // Lookup: OVERRIDE_REASON
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

// Normalize batch_lot_no + enforce immutability + auto-compute running_balance
inventoryLedgerSchema.pre('save', async function (next) {
  if (!this.isNew) {
    return next(new Error('InventoryLedger entries are immutable. Create a new entry instead.'));
  }
  if (this.batch_lot_no) {
    this.batch_lot_no = cleanBatchNo(this.batch_lot_no);
  }
  this.recorded_at = new Date();

  // Auto-compute running_balance if not explicitly set
  if (this.running_balance == null) {
    try {
      const filter = {
        entity_id: this.entity_id,
        product_id: this.product_id,
        batch_lot_no: this.batch_lot_no
      };
      if (this.warehouse_id) filter.warehouse_id = this.warehouse_id;

      const prev = await this.constructor.findOne(filter).sort({ recorded_at: -1 }).select('running_balance').lean();
      const prevBalance = prev?.running_balance ?? 0;
      this.running_balance = prevBalance + (this.qty_in || 0) - (this.qty_out || 0);
    } catch { /* fall through — balance stays null */ }
  }

  next();
});

// Indexes
inventoryLedgerSchema.index({ entity_id: 1, bdm_id: 1, product_id: 1, batch_lot_no: 1 });
inventoryLedgerSchema.index({ entity_id: 1, bdm_id: 1, product_id: 1, expiry_date: 1 });
inventoryLedgerSchema.index({ entity_id: 1, warehouse_id: 1, product_id: 1, batch_lot_no: 1 });
inventoryLedgerSchema.index({ entity_id: 1, warehouse_id: 1, product_id: 1, expiry_date: 1 });
inventoryLedgerSchema.index({ event_id: 1 });
inventoryLedgerSchema.index({ recorded_at: -1 });

module.exports = mongoose.model('InventoryLedger', inventoryLedgerSchema);
