/**
 * Fuel Efficiency Report Service — Per-BDM fuel tracking with variance detection
 * Phase 14.4
 */
const mongoose = require('mongoose');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const PeopleMaster = require('../models/PeopleMaster');
const Settings = require('../models/Settings');

/**
 * getFuelEfficiency — per-BDM actual vs expected gas cost
 */
async function getFuelEfficiency(entityId, period) {
  const eId = new mongoose.Types.ObjectId(entityId);
  const settings = await Settings.getSettings();
  const varianceThreshold = settings.EXPENSE_ANOMALY_THRESHOLD || 0.30;

  const result = await CarLogbookEntry.aggregate([
    { $match: { entity_id: eId, status: 'POSTED', period } },
    {
      $group: {
        _id: '$bdm_id',
        total_official_km: { $sum: '$official_km' },
        total_actual_liters: { $sum: '$actual_liters' },
        total_fuel_amount: { $sum: '$total_fuel_amount' },
        actual_gas_cost: { $sum: '$official_gas_amount' },
        avg_km_per_liter: { $avg: '$km_per_liter' },
        entries: { $sum: 1 }
      }
    },
    { $lookup: { from: 'erp_people_master', localField: '_id', foreignField: 'user_id', as: 'person' } },
    { $unwind: { path: '$person', preserveNullAndEmptyArrays: true } }
  ]);

  const items = result.map(r => {
    const kmPerLiter = r.avg_km_per_liter || settings.FUEL_EFFICIENCY_DEFAULT || 12;
    const avgPricePerLiter = r.total_actual_liters > 0
      ? r.total_fuel_amount / r.total_actual_liters
      : 0;
    const expectedLiters = kmPerLiter > 0 ? r.total_official_km / kmPerLiter : 0;
    const expected_gas_cost = Math.round(expectedLiters * avgPricePerLiter * 100) / 100;
    const actual_gas_cost = Math.round(r.actual_gas_cost * 100) / 100;
    const variance_amount = Math.round((actual_gas_cost - expected_gas_cost) * 100) / 100;
    const variance_pct = expected_gas_cost > 0
      ? Math.round((variance_amount / expected_gas_cost) * 10000) / 100
      : 0;

    return {
      bdm_id: r._id,
      bdm_name: r.person?.full_name || 'Unknown',
      total_official_km: Math.round(r.total_official_km * 100) / 100,
      total_actual_liters: Math.round(r.total_actual_liters * 100) / 100,
      avg_km_per_liter: Math.round(kmPerLiter * 100) / 100,
      actual_gas_cost,
      expected_gas_cost,
      variance_amount,
      variance_pct,
      entries: r.entries,
      flag: variance_pct > varianceThreshold * 100 ? 'OVER_30_PCT' : 'NORMAL'
    };
  });

  items.sort((a, b) => b.variance_pct - a.variance_pct);

  return { period, threshold: varianceThreshold * 100, items };
}

module.exports = {
  getFuelEfficiency
};
