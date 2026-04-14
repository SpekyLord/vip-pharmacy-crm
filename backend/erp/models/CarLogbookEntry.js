/**
 * Car Logbook Entry Model — Daily vehicle usage log
 *
 * Two captures per day: morning (starting_km) + night (ending_km)
 * Fuel entries per fill-up, efficiency tracking, personal vs official km split
 * Lifecycle: DRAFT → VALID → ERROR → POSTED
 */
const mongoose = require('mongoose');

const fuelEntrySchema = new mongoose.Schema({
  station_name: { type: String, trim: true },
  fuel_type: { type: String, trim: true },
  liters: { type: Number, default: 0 },
  price_per_liter: { type: Number, default: 0 },
  total_amount: { type: Number, default: 0 },
  receipt_url: String,
  receipt_attachment_id: String,
  receipt_ocr_data: { type: mongoose.Schema.Types.Mixed },
  receipt_date: { type: String, trim: true }, // OCR-extracted date for cross-check against entry_date
  payment_mode: { type: String, default: 'CASH' }, // Validated against PaymentMode lookup
  funding_card_id: { type: mongoose.Schema.Types.ObjectId, ref: 'CreditCard' },
  calf_required: { type: Boolean, default: false },
  calf_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PrfCalf' }
}, { _id: true });

const carLogbookEntrySchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Period
  period: { type: String, required: true, trim: true },       // "2026-04"
  cycle: { type: String, required: true }, // Lookup: CYCLE
  entry_date: { type: Date, required: true },

  // Odometer readings
  starting_km: { type: Number, default: 0 },
  starting_km_photo_url: String,
  ending_km: { type: Number, default: 0 },
  ending_km_photo_url: String,

  // KM split
  total_km: { type: Number, default: 0 },
  personal_km: { type: Number, default: 0 },
  official_km: { type: Number, default: 0 },

  // Fuel entries
  fuel_entries: [fuelEntrySchema],

  // Fuel efficiency (computed)
  km_per_liter: { type: Number, default: 12 },  // BDM's rate from CompProfile or Settings
  expected_official_liters: { type: Number, default: 0 },
  expected_personal_liters: { type: Number, default: 0 },
  actual_liters: { type: Number, default: 0 },
  efficiency_variance: { type: Number, default: 0 },
  overconsumption_flag: { type: Boolean, default: false },

  // Gasoline split
  total_fuel_amount: { type: Number, default: 0 },
  personal_gas_amount: { type: Number, default: 0 },
  official_gas_amount: { type: Number, default: 0 },

  notes: { type: String, trim: true },

  // Lifecycle
  status: {
    type: String,
    default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [String],
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  // Audit
  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  edit_history: [{ type: mongoose.Schema.Types.Mixed }]
}, {
  timestamps: false,
  collection: 'erp_car_logbook_entries'
});

// Pre-save: auto-compute km and fuel fields
carLogbookEntrySchema.pre('save', function (next) {
  // KM computations
  this.total_km = Math.max(0, (this.ending_km || 0) - (this.starting_km || 0));
  this.official_km = Math.max(0, this.total_km - (this.personal_km || 0));

  // Fuel totals
  let actualLiters = 0, totalFuelAmount = 0;
  for (const fuel of this.fuel_entries) {
    fuel.total_amount = Math.round((fuel.liters || 0) * (fuel.price_per_liter || 0) * 100) / 100;
    // Auto-set CALF required for non-cash fuel (company funds)
    fuel.calf_required = fuel.payment_mode && fuel.payment_mode !== 'CASH';
    actualLiters += fuel.liters || 0;
    totalFuelAmount += fuel.total_amount;
  }
  this.actual_liters = Math.round(actualLiters * 1000) / 1000;
  this.total_fuel_amount = Math.round(totalFuelAmount * 100) / 100;

  // Efficiency
  const kpl = this.km_per_liter || 12;
  this.expected_official_liters = Math.round((this.official_km / kpl) * 1000) / 1000;
  this.expected_personal_liters = Math.round(((this.personal_km || 0) / kpl) * 1000) / 1000;
  this.efficiency_variance = Math.round((this.actual_liters - (this.expected_official_liters + this.expected_personal_liters)) * 1000) / 1000;
  this.overconsumption_flag = this.efficiency_variance > 0;

  // Gasoline split: personal gas = personal liters × avg price
  const avgPrice = this.actual_liters > 0 ? totalFuelAmount / this.actual_liters : 0;
  this.personal_gas_amount = Math.round(this.expected_personal_liters * avgPrice * 100) / 100;
  this.official_gas_amount = Math.round((totalFuelAmount - this.personal_gas_amount) * 100) / 100;

  next();
});

// Indexes
carLogbookEntrySchema.index({ entity_id: 1, bdm_id: 1, entry_date: -1 });
carLogbookEntrySchema.index({ entity_id: 1, bdm_id: 1, period: 1, cycle: 1 });
carLogbookEntrySchema.index({ status: 1 });

module.exports = mongoose.model('CarLogbookEntry', carLogbookEntrySchema);
