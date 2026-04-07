/**
 * Fuel Tracker Service — KM split, efficiency, overconsumption detection
 *
 * Computes:
 * - Total KM = ending_km - starting_km
 * - Official KM = total_km - personal_km
 * - Expected liters = km ÷ km_per_liter
 * - Actual liters = sum of fuel entries
 * - Efficiency variance = actual - expected
 * - Personal gas amount = expected_personal_liters × avg_price
 * - Overconsumption flag if actual exceeds expected by threshold
 */

/**
 * Compute fuel efficiency and split for a car logbook entry
 * @param {Object} entry - Car logbook entry data
 * @param {Number} kmPerLiter - BDM's km/liter rate (from CompProfile or Settings default)
 * @param {Number} overconsumptionThreshold - % over expected that flags overconsumption (from Settings)
 * @returns {Object} Computed fields
 */
function computeFuelEfficiency(entry, kmPerLiter = 12, overconsumptionThreshold = 0.30) {
  const startingKm = entry.starting_km || 0;
  const endingKm = entry.ending_km || 0;
  const personalKm = entry.personal_km || 0;

  const totalKm = Math.max(0, endingKm - startingKm);
  const officialKm = Math.max(0, totalKm - personalKm);

  // Fuel totals
  let actualLiters = 0;
  let totalFuelAmount = 0;
  const fuelEntries = entry.fuel_entries || [];

  for (const fuel of fuelEntries) {
    actualLiters += fuel.liters || 0;
    totalFuelAmount += (fuel.liters || 0) * (fuel.price_per_liter || 0);
  }

  actualLiters = Math.round(actualLiters * 1000) / 1000;
  totalFuelAmount = Math.round(totalFuelAmount * 100) / 100;

  // Expected liters
  const expectedOfficialLiters = Math.round((officialKm / kmPerLiter) * 1000) / 1000;
  const expectedPersonalLiters = Math.round((personalKm / kmPerLiter) * 1000) / 1000;
  const totalExpected = expectedOfficialLiters + expectedPersonalLiters;

  // Variance
  const efficiencyVariance = Math.round((actualLiters - totalExpected) * 1000) / 1000;
  const overconsumptionFlag = totalExpected > 0 && (actualLiters / totalExpected) > (1 + overconsumptionThreshold);

  // Gas split
  const avgPrice = actualLiters > 0 ? totalFuelAmount / actualLiters : 0;
  const personalGasAmount = Math.round(expectedPersonalLiters * avgPrice * 100) / 100;
  const officialGasAmount = Math.round((totalFuelAmount - personalGasAmount) * 100) / 100;

  return {
    total_km: totalKm,
    official_km: officialKm,
    actual_liters: actualLiters,
    total_fuel_amount: totalFuelAmount,
    expected_official_liters: expectedOfficialLiters,
    expected_personal_liters: expectedPersonalLiters,
    efficiency_variance: efficiencyVariance,
    overconsumption_flag: overconsumptionFlag,
    personal_gas_amount: personalGasAmount,
    official_gas_amount: officialGasAmount
  };
}

/**
 * Compute summary for all car logbook entries in a period
 * @param {Array} entries - Car logbook entry documents
 * @returns {Object} Period summary
 */
function computePeriodFuelSummary(entries) {
  let totalKm = 0, officialKm = 0, personalKm = 0;
  let totalLiters = 0, totalFuelAmount = 0, personalGasTotal = 0;
  let overconsumptionDays = 0;

  for (const entry of entries) {
    totalKm += entry.total_km || 0;
    officialKm += entry.official_km || 0;
    personalKm += entry.personal_km || 0;
    totalLiters += entry.actual_liters || 0;
    totalFuelAmount += entry.total_fuel_amount || 0;
    personalGasTotal += entry.personal_gas_amount || 0;
    if (entry.overconsumption_flag) overconsumptionDays++;
  }

  return {
    total_km: totalKm,
    official_km: officialKm,
    personal_km: personalKm,
    total_liters: Math.round(totalLiters * 1000) / 1000,
    total_fuel_amount: Math.round(totalFuelAmount * 100) / 100,
    personal_gas_total: Math.round(personalGasTotal * 100) / 100,
    official_gas_total: Math.round((totalFuelAmount - personalGasTotal) * 100) / 100,
    overconsumption_days: overconsumptionDays,
    entry_count: entries.length,
    avg_km_per_liter: totalLiters > 0 ? Math.round((totalKm / totalLiters) * 100) / 100 : 0
  };
}

module.exports = {
  computeFuelEfficiency,
  computePeriodFuelSummary
};
