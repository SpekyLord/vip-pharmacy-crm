const mongoose = require('mongoose');

const paymentModeSchema = new mongoose.Schema({
  mode_code: { type: String, required: true, trim: true, unique: true },
  mode_label: { type: String, required: true, trim: true },
  mode_type: { type: String, required: true }, // Lookup: PAYMENT_MODE_TYPE
  coa_code: { type: String, trim: true },
  requires_calf: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true }
}, { timestamps: true, collection: 'erp_payment_modes' });

module.exports = mongoose.model('PaymentMode', paymentModeSchema);
