/**
 * Sales Discount config helper — Phase R2 (Apr 2026).
 *
 * Lookup-driven discount caps for Sales / CSI line items. Mirrors the
 * lazy-cache-with-inline-defaults pattern used by teamActivityThresholds.js
 * + resolveOwnerScope.js + mdPartnerAccess.js so subscribers can tune the
 * caps per-entity via Control Center → Lookup Tables → SALES_DISCOUNT_CONFIG
 * without a code deployment (Rule #3, Rule #19).
 *
 * Config:
 *   - max_percent           default 100
 *       Hard ceiling on per-line discount %. Schema also enforces 0..100;
 *       this lets admin lower the bar (e.g. 30) so BDMs cannot apply more
 *       aggressive discounts than agreed without escalation.
 *   - default_percent       default 0
 *       Auto-applied default for new line items. Phase R3 (Hospital Discount
 *       Master) will allow per-hospital overrides — until then it's a flat
 *       per-entity default.
 *   - require_reason_above  default 0  (0 = never require a reason)
 *       Reserved for Phase R3: any line discount > this triggers a
 *       Lookup-driven reason picker (analogous to FIFO override reason).
 *
 * Privileged users (president / admin / finance) BYPASS max_percent — see
 * canBypassDiscountCap() — so a one-off bigger contract doesn't need a
 * lookup edit. Bypass is logged through the same audit channel as posting.
 *
 * Caching: 60s TTL keyed by entityId. Bust via invalidate() when admin
 * edits the lookup row (wire into Lookup Manager save path if not already).
 */

const Lookup = require('../erp/models/Lookup');

const DEFAULTS = Object.freeze({
  max_percent: 100,
  default_percent: 0,
  require_reason_above: 0,
});

const TTL_MS = 60_000;
const _cache = new Map();

async function getDiscountConfig(entityId) {
  const cacheKey = entityId || '__GLOBAL__';
  const hit = _cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.values;

  let values = { ...DEFAULTS };
  try {
    const filter = { category: 'SALES_DISCOUNT_CONFIG', code: 'DEFAULT', is_active: true };
    if (entityId) filter.entity_id = entityId;
    const doc = await Lookup.findOne(filter).lean();
    if (doc?.metadata) {
      values = {
        max_percent: Number.isFinite(doc.metadata.max_percent)
          ? Math.max(0, Math.min(100, doc.metadata.max_percent))
          : DEFAULTS.max_percent,
        default_percent: Number.isFinite(doc.metadata.default_percent)
          ? Math.max(0, Math.min(100, doc.metadata.default_percent))
          : DEFAULTS.default_percent,
        require_reason_above: Number.isFinite(doc.metadata.require_reason_above)
          ? Math.max(0, Math.min(100, doc.metadata.require_reason_above))
          : DEFAULTS.require_reason_above,
      };
    }
  } catch (err) {
    console.warn('[salesDiscountConfig] lookup failed, using defaults:', err.message);
  }

  _cache.set(cacheKey, { ts: Date.now(), values });
  return values;
}

function invalidate(entityId) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  _cache.delete(entityId);
}

// Privileged users skip the configurable cap. Schema's hard 0..100 still
// applies via Mongoose validators in SalesLine.js. Mirrors the same
// privileged-bypass pattern used elsewhere (Rule #21 cross-scope view roles).
function canBypassDiscountCap(req) {
  return Boolean(req?.isPresident || req?.isAdmin || req?.isFinance);
}

module.exports = {
  getDiscountConfig,
  invalidate,
  canBypassDiscountCap,
  DEFAULTS,
};
