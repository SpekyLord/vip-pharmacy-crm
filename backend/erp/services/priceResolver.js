/**
 * Price Resolver — Phase CSI-X1 (April 2026)
 *
 * Resolves the unit_price for a (hospital, product) sale as of a given date.
 * Order of precedence (lookup-driven via PRICE_RESOLUTION_RULES, default
 * CONTRACT_FIRST):
 *   1. Most-recent ACTIVE HospitalContractPrice covering the as-of date
 *   2. ProductMaster.selling_price for the entity
 *   3. null with source NONE
 *
 * Subscribers can flip a different rule code via PRICE_RESOLUTION_RULES.RULE
 * lookup row; SRP_ONLY skips contract resolution entirely.
 *
 * In-memory 5-min cache keyed by entity+hospital+product+asOfBucket. Bust on
 * any HospitalContractPrice write (controller calls invalidatePriceCache).
 */

const HospitalContractPrice = require('../models/HospitalContractPrice');
const ProductMaster = require('../models/ProductMaster');
const Lookup = require('../models/Lookup');

const CACHE_TTL_MS = 5 * 60 * 1000;
const _priceCache = new Map();
const _ruleCache = new Map();

function _bucket(asOfDate) {
  // Bucket as-of date to start-of-day; cache hits across same-day calls
  const d = asOfDate ? new Date(asOfDate) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

async function getResolutionRule(entityId) {
  const cacheKey = String(entityId);
  const cached = _ruleCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.rule;
  let rule = 'CONTRACT_FIRST';
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'PRICE_RESOLUTION_RULES',
      is_active: true
    }).sort({ updatedAt: -1 }).lean();
    if (doc?.code) rule = doc.code;
  } catch (err) {
    // Lookup not seeded yet — fall back to CONTRACT_FIRST silently
  }
  _ruleCache.set(cacheKey, { ts: Date.now(), rule });
  return rule;
}

/**
 * Resolve contract price for (hospital, product) at the given date.
 *
 * @param {string|ObjectId} entityId
 * @param {string|ObjectId} hospitalId
 * @param {string|ObjectId} productId
 * @param {Date} [asOfDate] — defaults to now
 * @returns {Promise<{price: number|null, source: 'CONTRACT'|'SRP'|'NONE', contract_price_ref: ObjectId|null}>}
 */
async function resolveContractPrice(entityId, hospitalId, productId, asOfDate = null) {
  if (!entityId || !hospitalId || !productId) {
    return { price: null, source: 'NONE', contract_price_ref: null };
  }
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  const cacheKey = `${entityId}::${hospitalId}::${productId}::${_bucket(asOf)}`;
  const cached = _priceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  const rule = await getResolutionRule(entityId);

  let result = { price: null, source: 'NONE', contract_price_ref: null };

  if (rule === 'CONTRACT_FIRST') {
    const contract = await HospitalContractPrice.findOne({
      entity_id: entityId,
      hospital_id: hospitalId,
      product_id: productId,
      status: 'ACTIVE',
      effective_from: { $lte: asOf },
      $or: [
        { effective_to: null },
        { effective_to: { $gte: asOf } }
      ]
    }).sort({ effective_from: -1 }).lean();
    if (contract && typeof contract.contract_price === 'number') {
      result = {
        price: contract.contract_price,
        source: 'CONTRACT',
        contract_price_ref: contract._id
      };
      _priceCache.set(cacheKey, { ts: Date.now(), result });
      return result;
    }
  }

  // Fallback to SRP
  const product = await ProductMaster.findOne({
    entity_id: entityId,
    _id: productId
  }).select('selling_price').lean();
  if (product && typeof product.selling_price === 'number') {
    result = {
      price: product.selling_price,
      source: 'SRP',
      contract_price_ref: null
    };
  }

  _priceCache.set(cacheKey, { ts: Date.now(), result });
  return result;
}

/**
 * Bulk-resolve a list of (hospital_id, product_id) pairs. Used by frontends
 * that need to render a multi-line PO entry without N round-trips.
 */
async function resolveContractPricesBulk(entityId, items, asOfDate = null) {
  const results = await Promise.all(
    items.map(({ hospital_id, product_id }) =>
      resolveContractPrice(entityId, hospital_id, product_id, asOfDate)
        .then(r => ({ hospital_id, product_id, ...r }))
    )
  );
  return results;
}

function invalidatePriceCache(entityId = null, hospitalId = null, productId = null) {
  if (!entityId) {
    _priceCache.clear();
    _ruleCache.clear();
    return;
  }
  const prefix = String(entityId);
  _ruleCache.delete(prefix);
  for (const key of Array.from(_priceCache.keys())) {
    if (!key.startsWith(prefix + '::')) continue;
    if (hospitalId && !key.includes(`::${hospitalId}::`)) continue;
    if (productId && !key.includes(`::${productId}::`)) continue;
    _priceCache.delete(key);
  }
}

module.exports = {
  resolveContractPrice,
  resolveContractPricesBulk,
  invalidatePriceCache,
  getResolutionRule
};
