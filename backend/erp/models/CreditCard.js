/**
 * CreditCard Model — Company-issued credit/fleet/debit cards
 *
 * Each card has a COA code (e.g., 2301 SBC CC Payable, 2302 Shell Fleet Payable).
 * Cards are assigned to individual BDMs/employees — the expense form shows
 * only cards assigned to the logged-in user.
 *
 * Card types:
 *   CREDIT_CARD — company credit cards (SBC MC, RCBC Corp MC, BDO MC)
 *   FLEET_CARD  — fuel fleet cards (RCBC Platinum MC for Shell)
 *   DEBIT_CARD  — company debit cards (future)
 */
const mongoose = require('mongoose');

const creditCardSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true
  },
  card_code: {
    type: String,
    required: true,
    trim: true
  },
  card_name: {
    type: String,
    required: true,
    trim: true
  },
  card_holder: {
    type: String,
    trim: true
  },
  bank: {
    type: String,
    trim: true
  },
  card_type: {
    type: String,
    enum: ['CREDIT_CARD', 'FLEET_CARD', 'DEBIT_CARD'],
    required: true
  },
  card_brand: {
    type: String,
    enum: ['VISA', 'MASTERCARD', 'JCB', 'AMEX', 'FLEET'],
    default: 'MASTERCARD'
  },
  last_four: {
    type: String,
    trim: true
  },
  coa_code: {
    type: String,
    required: true,
    trim: true
  },
  credit_limit: {
    type: Number,
    default: 0
  },
  statement_cycle_day: {
    type: Number,
    min: 1,
    max: 31
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assigned_at: {
    type: Date
  },
  assigned_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'erp_credit_cards'
});

creditCardSchema.index({ entity_id: 1, card_code: 1 }, { unique: true });
creditCardSchema.index({ entity_id: 1, assigned_to: 1 });
creditCardSchema.index({ entity_id: 1, card_type: 1 });

module.exports = mongoose.model('CreditCard', creditCardSchema);
