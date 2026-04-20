/**
 * CarLogbookCycle — per-period+cycle wrapper over per-day CarLogbookEntry docs.
 *
 * One wrapper doc per (entity_id, bdm_id, period, cycle). It is the unit of
 * submission / approval / posting / reversal for car logbook — mirroring how
 * SmerEntry works per period+cycle — so the Approval Hub card renders a single
 * clean entry instead of 16× aggregated per-day rows.
 *
 * Per-day CarLogbookEntry documents remain the source of truth for odometer /
 * fuel / efficiency / anomaly computations — every downstream service
 * (incomeCalc, expenseSummary, fuelEfficiencyService, expenseAnomalyService,
 * performanceRankingService, dashboardService, etc.) continues to query the
 * per-day collection unchanged. The cycle wrapper only holds the submission /
 * approval / journal-posting state.
 *
 * Lifecycle: DRAFT → VALID → ERROR → POSTED → DELETION_REQUESTED
 */
const mongoose = require('mongoose');

const carLogbookCycleSchema = new mongoose.Schema({
  entity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true },
  bdm_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  period: { type: String, required: true, trim: true },   // "2026-04"
  cycle: { type: String, required: true },                // Lookup: CYCLE (C1 | C2)

  // Members: per-day CarLogbookEntry docs belonging to this cycle
  daily_entry_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'CarLogbookEntry' }],

  // Aggregated read-only totals (rebuilt on each submit/validate from per-day docs)
  working_days: { type: Number, default: 0 },
  total_km: { type: Number, default: 0 },
  total_official_km: { type: Number, default: 0 },
  total_personal_km: { type: Number, default: 0 },
  total_actual_liters: { type: Number, default: 0 },
  total_expected_liters: { type: Number, default: 0 },
  cycle_efficiency_variance: { type: Number, default: 0 },
  cycle_overconsumption_flag: { type: Boolean, default: false },
  total_fuel_amount: { type: Number, default: 0 },
  total_official_gas_amount: { type: Number, default: 0 },
  total_personal_gas_amount: { type: Number, default: 0 },

  // km_per_liter snapshot at cycle creation (CompProfile → Settings.FUEL_EFFICIENCY_DEFAULT)
  km_per_liter: { type: Number, default: 12 },

  // Lifecycle — mirrors CarLogbookEntry state but scoped to the cycle wrapper
  status: {
    type: String,
    default: 'DRAFT',
    enum: ['DRAFT', 'VALID', 'ERROR', 'POSTED', 'DELETION_REQUESTED']
  },
  posted_at: Date,
  posted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reopen_count: { type: Number, default: 0 },
  validation_errors: [String],
  rejection_reason: { type: String },
  event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },
  deletion_event_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TransactionEvent' },

  created_at: { type: Date, default: Date.now, immutable: true },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: false,
  collection: 'erp_car_logbook_cycles'
});

// Unique per-BDM cycle key (matches SmerEntry pattern)
carLogbookCycleSchema.index({ entity_id: 1, bdm_id: 1, period: 1, cycle: 1 }, { unique: true });
carLogbookCycleSchema.index({ entity_id: 1, bdm_id: 1, status: 1 });
carLogbookCycleSchema.index({ status: 1 });

/**
 * Recompute aggregated totals from the per-day CarLogbookEntry docs that belong
 * to this cycle. Called before validate/submit. Mutates `this` and returns it.
 */
carLogbookCycleSchema.methods.refreshTotalsFromDays = async function () {
  const CarLogbookEntry = mongoose.model('CarLogbookEntry');
  const days = await CarLogbookEntry.find({
    entity_id: this.entity_id,
    bdm_id: this.bdm_id,
    period: this.period,
    cycle: this.cycle,
  }).lean();

  this.daily_entry_ids = days.map(d => d._id);

  let workingDays = 0;
  let totalKm = 0, totalOfficialKm = 0, totalPersonalKm = 0;
  let totalActualLiters = 0, totalExpectedOfficial = 0, totalExpectedPersonal = 0;
  let totalFuelAmount = 0, totalOfficialGas = 0, totalPersonalGas = 0;

  for (const d of days) {
    if ((d.total_km || 0) > 0 || (d.total_fuel_amount || 0) > 0) workingDays += 1;
    totalKm += d.total_km || 0;
    totalOfficialKm += d.official_km || 0;
    totalPersonalKm += d.personal_km || 0;
    totalActualLiters += d.actual_liters || 0;
    totalExpectedOfficial += d.expected_official_liters || 0;
    totalExpectedPersonal += d.expected_personal_liters || 0;
    totalFuelAmount += d.total_fuel_amount || 0;
    totalOfficialGas += d.official_gas_amount || 0;
    totalPersonalGas += d.personal_gas_amount || 0;
  }

  this.working_days = workingDays;
  this.total_km = Math.round(totalKm * 100) / 100;
  this.total_official_km = Math.round(totalOfficialKm * 100) / 100;
  this.total_personal_km = Math.round(totalPersonalKm * 100) / 100;
  this.total_actual_liters = Math.round(totalActualLiters * 1000) / 1000;
  this.total_expected_liters = Math.round((totalExpectedOfficial + totalExpectedPersonal) * 1000) / 1000;
  this.cycle_efficiency_variance = Math.round((this.total_actual_liters - this.total_expected_liters) * 1000) / 1000;
  this.cycle_overconsumption_flag = this.cycle_efficiency_variance > 0;
  this.total_fuel_amount = Math.round(totalFuelAmount * 100) / 100;
  this.total_official_gas_amount = Math.round(totalOfficialGas * 100) / 100;
  this.total_personal_gas_amount = Math.round(totalPersonalGas * 100) / 100;

  return this;
};

module.exports = mongoose.model('CarLogbookCycle', carLogbookCycleSchema);
