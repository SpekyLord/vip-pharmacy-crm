/**
 * withholdingService — Phase VIP-1.J / J2 (Apr 2026).
 *
 * Engine-side helpers that document-post controllers call to emit
 * WithholdingLedger rows. Mirrors the createVatEntry shape so a future
 * harness for sub-ledger reconciliation (`findAccountingIntegrityIssues`)
 * stays trivial to extend.
 *
 * Public API:
 *   • resolveAtcCodeForExpenseLine({ entity, line, vendor }) — returns
 *     { atc_code, rate, payee_kind, payee_id, payee_name, payee_tin,
 *       payee_address } or null when withholding does not apply. Bakes in
 *     the WI010 ↔ WI011 (5% ↔ 10%) YTD threshold flip and the TWA goods/
 *     services bucket choice.
 *
 *   • resolveAtcCodeForPrfRent({ entity, prf, vendor }) — same shape but
 *     for 1606 (rent) PRF lines. Distinguishes WI160 (individual lessor)
 *     vs WC160 (corporate lessor) using `vendor.payee_kind` (or
 *     `vendor.is_landlord && payee_kind` overrides).
 *
 *   • createWithholdingEntries(entries, opts) — bulk insert, idempotent on
 *     `source_event_id` (calling code may pass a session for the same
 *     transaction guarantees as the journal write).
 *
 *   • deleteWithholdingEntriesForEvent(eventId, opts) — reversal path.
 *     Mirrors VatLedger.deleteMany on reversal (journalEngine.js:168).
 *
 *   • getYtdGrossForPayee(entityId, payeeKind, payeeId, year) — used by
 *     the threshold-flip resolver and by the Withholding Posture card.
 *
 * Subscription-readiness:
 *   • ATC catalog comes from BIR_ATC_CODES lookup with sensible inline
 *     defaults. Subscribers can extend (e.g. WI105 for talent fees) without
 *     a code change. `metadata.rate` is honored if present, else falls back
 *     to the inline DEFAULT_RATES table.
 *   • Threshold (YTD ₱720k) is overridable per entity via Settings
 *     `WITHHOLDING_THRESHOLD_INDIVIDUAL_LOW` (defaults 720_000). Same for
 *     corporate (defaults 720_000 — same number historically; separate
 *     setting future-proofs subscriber jurisdictions).
 */

const mongoose = require('mongoose');
const WithholdingLedger = require('../models/WithholdingLedger');
const Lookup = require('../models/Lookup');
const Settings = require('../models/Settings');

// Inline fallbacks — used if BIR_ATC_CODES lookup is empty for the entity.
// Mirrors lookupGenericController SEED_DEFAULTS so behavior is identical
// whether the lookup has been seeded or not.
const DEFAULT_RATES = Object.freeze({
  WI010: 0.05, WI011: 0.10,
  WC010: 0.10, WC011: 0.15,
  WI160: 0.05, WC160: 0.05,
  WI080: 0.01, WI081: 0.02,
  WC158: 0.01,
});

const DEFAULT_FORM_FOR_ATC = Object.freeze({
  WI010: '1601-EQ', WI011: '1601-EQ',
  WC010: '1601-EQ', WC011: '1601-EQ',
  WI160: '1606',    WC160: '1606',
  WI080: '1601-EQ', WI081: '1601-EQ',
  WC158: '2307-IN',
});

const ATC_CACHE_TTL_MS = 60_000;
const _atcCache = new Map();

async function getAtcMetadata(entityId, code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  const cacheKey = `${entityId || '__GLOBAL__'}::${upper}`;
  const hit = _atcCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < ATC_CACHE_TTL_MS) return hit.meta;

  let meta = null;
  try {
    const filter = { category: 'BIR_ATC_CODES', code: upper, is_active: true };
    if (entityId) filter.entity_id = entityId;
    const row = await Lookup.findOne(filter).lean();
    if (row) {
      meta = {
        rate: typeof row.metadata?.rate === 'number' ? row.metadata.rate : DEFAULT_RATES[upper] || 0,
        applies_to: row.metadata?.applies_to || null,
        form: row.metadata?.form || DEFAULT_FORM_FOR_ATC[upper] || null,
        label: row.label,
      };
    }
  } catch (err) {
    console.warn(`[withholdingService] BIR_ATC_CODES lookup failed for ${upper}:`, err.message);
  }
  if (!meta && DEFAULT_RATES[upper] !== undefined) {
    meta = { rate: DEFAULT_RATES[upper], applies_to: null, form: DEFAULT_FORM_FOR_ATC[upper] || null, label: upper };
  }
  _atcCache.set(cacheKey, { ts: Date.now(), meta });
  return meta;
}

function invalidateAtcCache(entityId) {
  if (!entityId) {
    _atcCache.clear();
    return;
  }
  const prefix = `${entityId}::`;
  for (const key of Array.from(_atcCache.keys())) {
    if (key.startsWith(prefix)) _atcCache.delete(key);
  }
}

// ── YTD running totals for threshold flip ───────────────────────────────
async function getYtdGrossForPayee(entityId, payeeKind, payeeId, year, beforePeriod = null) {
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const periodFilter = beforePeriod
    ? { $gte: yearStart, $lt: beforePeriod }
    : { $gte: yearStart, $lte: yearEnd };

  const result = await WithholdingLedger.aggregate([
    {
      $match: {
        entity_id: entityId,
        direction: 'OUTBOUND',
        payee_kind: payeeKind,
        payee_id: payeeId,
        period: periodFilter,
        finance_tag: { $ne: 'EXCLUDE' },
      },
    },
    {
      $group: {
        _id: null,
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  return result[0] || { gross: 0, withheld: 0, count: 0 };
}

async function getThreshold(entityId, key, fallback) {
  try {
    const val = await Settings.getValue?.(entityId, key);
    if (typeof val === 'number') return val;
  } catch { /* fall through */ }
  return fallback;
}

// ── ATC resolver for expense lines (1601-EQ scope) ──────────────────────
/**
 * Returns null if no withholding applies; otherwise returns the descriptor
 * the engine writes to WithholdingLedger.
 *
 * Decision tree:
 *   1) Explicit `line.atc_code` set → use it (subscriber-defined catalog wins).
 *   2) Vendor-tagged TWA bucket via `vendor.default_atc_code` (WI080/WI081).
 *   3) Vendor not flagged → no withholding (returns null).
 *
 * Threshold flip (WI010 → WI011, WC010 → WC011) only fires when the
 * starting bucket is one of {WI010, WC010} — explicit subscriber buckets
 * stay as-set so jurisdiction-specific ATC codes don't get mutated.
 */
async function resolveAtcCodeForExpenseLine({ entity, line, vendor, period }) {
  if (!entity?.withholding_active) return null;
  if (!line) return null;

  let atcCode = line.atc_code ? String(line.atc_code).toUpperCase() : null;
  let payee = null;

  if (vendor) {
    payee = {
      kind: 'VendorMaster',
      id: vendor._id,
      name: vendor.vendor_name,
      tin: vendor.tin || null,
      address: vendor.address || null,
    };
    if (!atcCode && vendor.withhold_active && vendor.default_atc_code) {
      atcCode = String(vendor.default_atc_code).toUpperCase();
    }
  }
  if (!atcCode) return null;

  // Threshold flip on individual / corporate professional fees only.
  const yearStr = String(period || '').slice(0, 4);
  const year = parseInt(yearStr, 10);
  if (Number.isInteger(year) && payee && (atcCode === 'WI010' || atcCode === 'WC010')) {
    const ytd = await getYtdGrossForPayee(entity._id, payee.kind, payee.id, year, period);
    const threshold = await getThreshold(entity._id, 'WITHHOLDING_THRESHOLD_INDIVIDUAL_LOW', 720_000);
    const after = ytd.gross + (line.amount || 0);
    if (after > threshold) atcCode = atcCode === 'WI010' ? 'WI011' : 'WC011';
  }

  const meta = await getAtcMetadata(entity._id, atcCode);
  if (!meta) return null;

  return {
    atc_code: atcCode,
    form_code: meta.form,
    rate: typeof meta.rate === 'number' ? meta.rate : 0,
    payee_kind: payee?.kind || 'Other',
    payee_id: payee?.id || null,
    payee_name_snapshot: payee?.name || null,
    payee_tin_snapshot: payee?.tin || null,
    payee_address_snapshot: payee?.address || null,
  };
}

// ── ATC resolver for PRF rent lines (1606 scope) ────────────────────────
async function resolveAtcCodeForPrfRent({ entity, prf, vendor }) {
  if (!entity?.rent_withholding_active) return null;
  if (!prf || prf.doc_type !== 'PRF') return null;

  let atcCode = prf.atc_code ? String(prf.atc_code).toUpperCase() : null;
  if (!atcCode && vendor?.is_landlord && vendor?.default_atc_code) {
    atcCode = String(vendor.default_atc_code).toUpperCase();
  }
  if (!atcCode && vendor?.is_landlord) {
    // Inferred default — individual landlord pattern is the most common.
    atcCode = vendor?.payee_kind === 'CORPORATION' ? 'WC160' : 'WI160';
  }
  if (!atcCode) return null;
  if (atcCode !== 'WI160' && atcCode !== 'WC160') {
    // Caller passed an EWT code (e.g. WI010) on a PRF — wrong form. Skip.
    return null;
  }

  const meta = await getAtcMetadata(entity._id, atcCode);
  if (!meta) return null;

  const payeeName = prf.payee_name || vendor?.vendor_name || 'Landlord';
  return {
    atc_code: atcCode,
    form_code: meta.form,
    rate: typeof meta.rate === 'number' ? meta.rate : 0.05,
    payee_kind: vendor ? 'VendorMaster' : 'Other',
    payee_id: vendor?._id || prf.partner_id || null,
    payee_name_snapshot: payeeName,
    payee_tin_snapshot: vendor?.tin || null,
    payee_address_snapshot: vendor?.address || null,
  };
}

// ── Bulk insert + reversal ──────────────────────────────────────────────
async function createWithholdingEntries(entries, opts = {}) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const docs = entries.map(e => ({
    entity_id: e.entity_id,
    period: e.period,
    direction: e.direction || 'OUTBOUND',
    atc_code: e.atc_code,
    form_code: e.form_code || null,
    payee_kind: e.payee_kind,
    payee_id: e.payee_id,
    payee_name_snapshot: e.payee_name_snapshot || null,
    payee_tin_snapshot: e.payee_tin_snapshot || null,
    payee_address_snapshot: e.payee_address_snapshot || null,
    gross_amount: round2(e.gross_amount || 0),
    withholding_rate: e.withholding_rate || 0,
    withheld_amount: round2(e.withheld_amount ?? (e.gross_amount * (e.withholding_rate || 0))),
    source_module: e.source_module,
    source_doc_ref: e.source_doc_ref || null,
    source_event_id: e.source_event_id || null,
    source_line_id: e.source_line_id || null,
    bdm_id: e.bdm_id || null,
    finance_tag: e.finance_tag || 'PENDING',
    ytd_gross_at_post: e.ytd_gross_at_post || 0,
    ytd_withheld_at_post: e.ytd_withheld_at_post || 0,
    notes: e.notes || null,
  }));
  const session = opts.session || null;
  if (session) {
    return WithholdingLedger.insertMany(docs, { session });
  }
  return WithholdingLedger.insertMany(docs);
}

async function deleteWithholdingEntriesForEvent(eventId, opts = {}) {
  if (!eventId) return { deletedCount: 0 };
  const filter = { source_event_id: eventId };
  if (opts.session) {
    return WithholdingLedger.deleteMany(filter).session(opts.session);
  }
  return WithholdingLedger.deleteMany(filter);
}

// ── Posture metrics for dashboard ───────────────────────────────────────
async function buildPosture(entityId, year) {
  if (!entityId || !year) {
    return {
      enabled: false,
      contractors_not_withheld: 0,
      estimated_ytd_payout: 0,
      estimated_annual_payout: 0,
      threshold_trip_at: 720_000,
      breakdown: [],
    };
  }
  const yearStart = `${year}-01`;
  const yearEnd = `${year}-12`;
  const rows = await WithholdingLedger.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(String(entityId)),
        direction: 'OUTBOUND',
        period: { $gte: yearStart, $lte: yearEnd },
        finance_tag: { $ne: 'EXCLUDE' },
      },
    },
    {
      $group: {
        _id: { atc_code: '$atc_code', payee_id: '$payee_id', payee_kind: '$payee_kind' },
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
        last_period: { $max: '$period' },
        payee_name: { $last: '$payee_name_snapshot' },
      },
    },
    { $sort: { gross: -1 } },
    { $limit: 50 },
  ]);

  const totals = rows.reduce((acc, r) => {
    acc.gross += r.gross;
    acc.withheld += r.withheld;
    return acc;
  }, { gross: 0, withheld: 0 });

  // Annualize YTD by linear extrapolation of months elapsed.
  const monthsElapsed = Math.max(1, new Date().getMonth() + 1);
  const annualEstimate = Math.round((totals.gross / monthsElapsed) * 12);

  return {
    enabled: true,
    contractors_not_withheld: 0, // Filled by controller from PeopleMaster scan
    estimated_ytd_payout: round2(totals.gross),
    estimated_ytd_withheld: round2(totals.withheld),
    estimated_annual_payout: annualEstimate,
    threshold_trip_at: 720_000,
    breakdown: rows.map(r => ({
      atc_code: r._id.atc_code,
      payee_kind: r._id.payee_kind,
      payee_id: r._id.payee_id,
      payee_name: r.payee_name,
      gross: round2(r.gross),
      withheld: round2(r.withheld),
      count: r.count,
      last_period: r.last_period,
    })),
  };
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

module.exports = {
  resolveAtcCodeForExpenseLine,
  resolveAtcCodeForPrfRent,
  createWithholdingEntries,
  deleteWithholdingEntriesForEvent,
  getYtdGrossForPayee,
  getAtcMetadata,
  invalidateAtcCache,
  buildPosture,
  DEFAULT_RATES,
  DEFAULT_FORM_FOR_ATC,
  // Test seams
  _internals: { round2 },
};
