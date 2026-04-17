/**
 * Per Diem Calculator — MD count → tier → amount
 *
 * Threshold resolution (per-person override → global fallback):
 *   1. CompProfile.perdiem_engagement_threshold_full / _half (per-BDM)
 *   2. Settings.PERDIEM_MD_FULL / PERDIEM_MD_HALF (global defaults)
 *
 * Tier logic:
 *   ≥ fullThreshold MDs → FULL (100% per diem)
 *   ≥ halfThreshold MDs → HALF (50% per diem)
 *   below halfThreshold  → ZERO (0% per diem)
 *
 * Follows the revolving_fund_amount pattern:
 *   CompProfile value takes precedence; Settings is the fallback.
 *   Unlike revolving fund (where 0 = use global), thresholds treat
 *   null/undefined as "use global" — 0 IS a valid value (means
 *   "always at least HALF, regardless of MD count").
 */

const TIER_MULTIPLIER = {
  FULL: 1.0,
  HALF: 0.5,
  ZERO: 0.0
};

/**
 * Resolve per diem thresholds from CompProfile → Settings fallback.
 * null/undefined in CompProfile = use global. 0 is a valid override.
 * @param {Object} settings - ERP Settings document (global defaults)
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @returns {{ fullThreshold: Number, halfThreshold: Number, source: String }}
 */
function resolvePerdiemThresholds(settings, compProfile) {
  const globalFull = settings?.PERDIEM_MD_FULL ?? 8;
  const globalHalf = settings?.PERDIEM_MD_HALF ?? 3;

  const personFull = compProfile?.perdiem_engagement_threshold_full;
  const personHalf = compProfile?.perdiem_engagement_threshold_half;

  // null/undefined = use global; any number (including 0) = person override
  const fullThreshold = (personFull != null) ? personFull : globalFull;
  const halfThreshold = (personHalf != null) ? personHalf : globalHalf;

  const source = (personFull != null || personHalf != null) ? 'COMP_PROFILE' : 'SETTINGS';

  return { fullThreshold, halfThreshold, source };
}

/**
 * Determine per diem tier from MD count
 * @param {Number} mdCount - Number of MDs covered that day
 * @param {Object} settings - ERP Settings document
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @returns {String} 'FULL' | 'HALF' | 'ZERO'
 */
function computePerdiemTier(mdCount, settings, compProfile) {
  const { fullThreshold, halfThreshold } = resolvePerdiemThresholds(settings, compProfile);

  if (mdCount >= fullThreshold) return 'FULL';
  if (mdCount >= halfThreshold) return 'HALF';
  return 'ZERO';
}

/**
 * Compute per diem amount for a day
 * @param {Number} mdCount
 * @param {Number} perdiemRate - BDM's per diem rate (from CompProfile or Settings default)
 * @param {Object} settings
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @returns {{ tier: String, amount: Number }}
 */
function computePerdiemAmount(mdCount, perdiemRate, settings, compProfile) {
  const tier = computePerdiemTier(mdCount, settings, compProfile);
  const multiplier = TIER_MULTIPLIER[tier];
  const amount = Math.round(perdiemRate * multiplier * 100) / 100;
  return { tier, amount };
}

/**
 * Compute per diem for all daily entries in an SMER
 * @param {Array} dailyEntries - Array of daily entry objects with md_count
 * @param {Number} perdiemRate
 * @param {Object} settings
 * @param {Object} [compProfile] - BDM's active CompProfile (optional)
 * @returns {Array} Updated daily entries with perdiem_tier and perdiem_amount
 */
function computeSmerPerdiem(dailyEntries, perdiemRate, settings, compProfile) {
  return dailyEntries.map(entry => {
    const { tier, amount } = computePerdiemAmount(entry.md_count || 0, perdiemRate, settings, compProfile);
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
  resolvePerdiemThresholds,
  TIER_MULTIPLIER
};
