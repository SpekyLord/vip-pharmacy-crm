/**
 * OwnerEquityEntry Model — Owner infusions and drawings
 *
 * PRD v5 §11.11
 * INFUSION: DR Cash/Bank, CR 3000 Owner Capital
 * DRAWING:  DR 3100 Owner Drawings, CR Cash/Bank
 */
const mongoose = require('mongoose');

const ownerEquityEntrySchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  entry_type: {
    type: String,
    enum: ['INFUSION', 'DRAWING'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  bank_account: {
    type: String,
    trim: true
  },
  bank_coa_code: {
    type: String,
    trim: true
  },
  bir_flag: {
    type: String,
    enum: ['BOTH', 'INTERNAL', 'BIR'],
    default: 'BOTH'
  },
  description: {
    type: String,
    trim: true
  },
  entry_date: {
    type: Date,
    required: true
  },
  je_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JournalEntry'
  },
  recorded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_at: {
    type: Date,
    immutable: true,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'erp_owner_equity'
});

ownerEquityEntrySchema.index({ entity_id: 1, entry_date: -1 });
ownerEquityEntrySchema.index({ entity_id: 1, entry_type: 1 });

module.exports = mongoose.model('OwnerEquityEntry', ownerEquityEntrySchema);
