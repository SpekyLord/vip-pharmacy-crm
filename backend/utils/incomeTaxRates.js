/**
 * Income tax rate resolver — Phase VIP-1.J / J7 (May 2026).
 *
 * Lookup-driven per-entity tax rates for the 1702 (corporate) / 1701
 * (sole-prop) annual income tax helper. Mirrors the
 * teamActivityThresholds.js / clmPerformanceThresholds.js pattern: lazy
 * cache per (entity, code) with a 60-second TTL, lazy-seed-from-defaults
 * in the lookup controller, `insert_only_metadata: true` so admin overrides
 * survive future re-seeds (Rule #3 / Rule #19).
 *
 * Codes (BIR_INCOME_TAX_RATES):
 *   - CORP_REGULAR_RATE             — Regular Corporate Income Tax (RCIT)
 *                                     for domestic/resident foreign corps,
 *                                     CREATE Act 2021+ (default 0.25 = 25%).
 *   - CORP_SME_RATE                 — Lowered RCIT rate when both SME
 *                                     thresholds are met (default 0.20 = 20%).
 *   - CORP_SME_TAXABLE_THRESHOLD_PHP — Net taxable income ceiling for SME
 *                                     rate eligibility (default ₱5,000,000).
 *   - CORP_SME_ASSETS_THRESHOLD_PHP  — Total assets ceiling for SME rate
 *                                     eligibility — excludes land per CREATE
 *                                     IRR (default ₱100,000,000).
 *   - MCIT_RATE                     — Minimum Corporate Income Tax rate;
 *                                     applies starting 4th year of operations,
 *                                     compares against RCIT, takes the higher
 *                                     (default 0.02 = 2%; RR 5-2021 cut to 1%
 *                                     thru Jun 30 2023, then 2% thereafter).
 *   - MCIT_GRACE_YEARS              — Years of operations before MCIT kicks
 *                                     in (default 3 — i.e., MCIT applies from
 *                                     year 4 onward).
 *   - INDIVIDUAL_8PCT_FLAT_RATE     — Optional 8% flat-rate for sole-prop /
 *                                     freelancer with gross sales ≤ VAT
 *                                     threshold (default 0.08 = 8%).
 *
 * Note: 1701 graduated brackets are NOT lookup-driven today — TRAIN Act
 * brackets are statutory and rarely diverge across subscribers. They live
 * inline in `incomeTaxReturnService.js` as `INDIVIDUAL_GRADUATED_BRACKETS`
 * (default fallback). When BIR ratchets brackets next, edit that constant.
 */

const Lookup = require('../erp/models/Lookup');

const DEFAULTS = Object.freeze({
  CORP_REGULAR_RATE: 0.25,
  CORP_SME_RATE: 0.20,
  CORP_SME_TAXABLE_THRESHOLD_PHP: 5_000_000,
  CORP_SME_ASSETS_THRESHOLD_PHP: 100_000_000,
  MCIT_RATE: 0.02,
  MCIT_GRACE_YEARS: 3,
  INDIVIDUAL_8PCT_FLAT_RATE: 0.08,
});

const TTL_MS = 60_000;
const _cache = new Map();

function cacheKey(entityId, code) {
  return `${entityId || '__GLOBAL__'}::${code}`;
}

/**
 * Resolve a single rate by code, falling back to inline DEFAULTS if the
 * lookup row is absent or the value is non-numeric.
 */
async function getRate(entityId, code) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, code)) {
    throw new Error(`incomeTaxRates: unknown code ${code}`);
  }
  const key = cacheKey(entityId, code);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;

  let value = DEFAULTS[code];
  try {
    const filter = { category: 'BIR_INCOME_TAX_RATES', code, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    const raw = doc?.metadata?.value;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      value = raw;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[incomeTaxRates] lookup ${code} failed, using default ${DEFAULTS[code]}:`, err.message);
  }

  _cache.set(key, { ts: Date.now(), value });
  return value;
}

/**
 * Bulk fetch — used by the 1702 service to grab the full rate set in one
 * call. Returns an object keyed by code.
 */
async function getAllRates(entityId) {
  const out = {};
  for (const code of Object.keys(DEFAULTS)) {
    // eslint-disable-next-line no-await-in-loop
    out[code] = await getRate(entityId, code);
  }
  return out;
}

/**
 * Bust the cache. Wired into lookupGenericController so admin edits to
 * BIR_INCOME_TAX_RATES propagate within one cache cycle.
 */
function invalidate(entityId) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const k of Array.from(_cache.keys())) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

module.exports = {
  DEFAULTS,
  getRate,
  getAllRates,
  invalidate,
};
