/**
 * Per Diem Calculator — MD count → tier → amount
 *
 * Tier logic from Settings:
 *   ≥ PERDIEM_MD_FULL (default 8) MDs → FULL (100% per diem)
 *   ≥ PERDIEM_MD_HALF (default 3) MDs → HALF (50% per diem)
 *   0–2 MDs → ZERO (0% per diem)
 *
 * Phase 1: MD count entered manually by BDM
 * Phase 3 (future): CRM visit logs auto-populate MD count
 */

const TIER_MULTIPLIER = {
  FULL: 1.0,
  HALF: 0.5,
  ZERO: 0.0
};

/**
 * Determine per diem tier from MD count
 * @param {Number} mdCount - Number of MDs covered that day
 * @param {Object} settings - ERP Settings document
 * @returns {String} 'FULL' | 'HALF' | 'ZERO'
 */
function computePerdiemTier(mdCount, settings) {
  const fullThreshold = settings?.PERDIEM_MD_FULL ?? 8;
  const halfThreshold = settings?.PERDIEM_MD_HALF ?? 3;

  if (mdCount >= fullThreshold) return 'FULL';
  if (mdCount >= halfThreshold) return 'HALF';
  return 'ZERO';
}

/**
 * Compute per diem amount for a day
 * @param {Number} mdCount
 * @param {Number} perdiemRate - BDM's per diem rate (from CompProfile or Settings default)
 * @param {Object} settings
 * @returns {{ tier: String, amount: Number }}
 */
function computePerdiemAmount(mdCount, perdiemRate, settings) {
  const tier = computePerdiemTier(mdCount, settings);
  const multiplier = TIER_MULTIPLIER[tier];
  const amount = Math.round(perdiemRate * multiplier * 100) / 100;
  return { tier, amount };
}

/**
 * Compute per diem for all daily entries in an SMER
 * @param {Array} dailyEntries - Array of daily entry objects with md_count
 * @param {Number} perdiemRate
 * @param {Object} settings
 * @returns {Array} Updated daily entries with perdiem_tier and perdiem_amount
 */
function computeSmerPerdiem(dailyEntries, perdiemRate, settings) {
  return dailyEntries.map(entry => {
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings);
    return {
      ...entry,
      perdiem_tier: tier,
      perdiem_amount: amount
    };
  });
}

module.exports = {
  computePerdiemTier,
  computePerdiemAmount,
  computeSmerPerdiem,
  TIER_MULTIPLIER
};
