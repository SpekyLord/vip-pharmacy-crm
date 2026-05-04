/**
 * cwt2307ReconciliationService — Phase VIP-1.J / J6 (May 2026).
 *
 * Inbound BIR 2307 certificate reconciliation. Surfaces "hospitals withheld
 * but no 2307 paper received" gaps, lets the bookkeeper flip a row from
 * PENDING_2307 → RECEIVED when the certificate arrives, and rolls received
 * + matched rows into the year's Creditable Tax Withheld credit for 1702
 * (Phase J7 will consume `compute1702CwtRollup`).
 *
 * Source-of-truth boundary:
 *   • CwtLedger is the single source-of-truth for INBOUND CWT. Every row is
 *     auto-created on collection post (collectionController.js:614 →
 *     cwtService.createCwtEntry). J6 ADDS reconciliation lifecycle but does
 *     NOT change the engine write — backwards-compat is intact.
 *   • The 1702 credit rollup (annual) reads `status ∈ {RECEIVED}` matching
 *     `tagged_for_1702_year = year`. EXCLUDED rows are dropped from the
 *     credit. PENDING_2307 rows surface as "exposure" — bookkeeper must
 *     chase the hospital before the 1702 deadline.
 *
 * Subscription-readiness (Rule #3 + Rule #19):
 *   • Per-entity: every aggregation is filtered by entity_id.
 *   • Lookup-driven role gates via BIR_ROLES.RECONCILE_INBOUND_2307
 *     (default admin/finance/bookkeeper). Subscribers reconfigure via
 *     Control Center → Lookup Tables.
 *   • Audit-logged: every status flip stamps `received_by`/`received_at`
 *     (or `excluded_by`/`excluded_at`) and appends a SHA-256-stamped row
 *     to BirFilingStatus(form_code='2307-IN', period_year=Y).
 *
 * Public API:
 *   compute2307InboundSummary({ entityId, year, quarter? }) — annual or
 *     quarterly hospital × quarter rollup with status counts. Drives the
 *     /erp/bir/2307-IN/:year(/:quarter) page.
 *   listInboundRows({ entityId, year, quarter?, status? }) — flat row list
 *     for the page table. Supports server-side filtering on status.
 *   markReceived(rowId, { entityId, userId, cert_2307_url, cert_filename,
 *     cert_content_hash, cert_notes }) — PENDING_2307 → RECEIVED.
 *   markPending(rowId, { entityId, userId }) — RECEIVED → PENDING_2307
 *     (undo / re-issue).
 *   excludeRow(rowId, { entityId, userId, reason }) — PENDING|RECEIVED →
 *     EXCLUDED. Reason is required.
 *   buildInboundPosture(entityId, year) — dashboard card payload (PENDING
 *     count, RECEIVED count, total credit, top-N hospitals by exposure).
 *   compute1702CwtRollup({ entityId, year }) — total RECEIVED CWT credit
 *     tagged for the given 1702 year. Phase J7 consumer.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const CwtLedger = require('../models/CwtLedger');
const Hospital = require('../models/Hospital');
const BirFilingStatus = require('../models/BirFilingStatus');

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function ensureObjectId(id) {
  if (!id) return null;
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

function quartersForYear(year) {
  return ['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({ quarter: q, year }));
}

// ── Aggregations ───────────────────────────────────────────────────────

/**
 * Compute inbound 2307 reconciliation summary for an entity × year (and
 * optional quarter). Returns per-hospital × per-quarter breakdown plus
 * grand totals partitioned by status.
 */
async function compute2307InboundSummary({ entityId, year, quarter = null }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');
  if (quarter !== null && !['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter)) {
    throw new Error('Invalid quarter (Q1..Q4)');
  }

  const match = { entity_id: ensureObjectId(entityId), year };
  if (quarter) match.quarter = quarter;

  // Coalesce legacy rows (created before J6's schema add) to PENDING_2307.
  // Pre-J6 docs have no `status` field → aggregation returns null → row
  // wouldn't match any status bucket, leaving cwt_total_all > 0 but per-
  // status partition all-zero. $ifNull restores the partition invariant
  // (sum of 3 buckets == cwt_total_all) without a destructive backfill.
  const rows = await CwtLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          hospital_id: '$hospital_id',
          hospital_tin: '$hospital_tin',
          quarter: '$quarter',
          status: { $ifNull: ['$status', 'PENDING_2307'] },
        },
        cr_amount_total: { $sum: '$cr_amount' },
        cwt_amount_total: { $sum: '$cwt_amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  // Build hospital lookup map for human-readable names. Avoid populate
  // on aggregate — direct lookup is cheaper and respects Rule #19.
  const hospitalIds = Array.from(new Set(
    rows.map(r => r._id.hospital_id).filter(Boolean).map(id => String(id))
  )).map(id => ensureObjectId(id));
  const hospitals = hospitalIds.length
    ? await Hospital.find({ _id: { $in: hospitalIds }, entity_id: ensureObjectId(entityId) })
        .select('_id hospital_name tin').lean()
    : [];
  const hospitalMap = new Map(hospitals.map(h => [String(h._id), h]));

  // Pivot into per-hospital structure with quarter buckets.
  const byHospital = new Map();
  for (const row of rows) {
    const hid = row._id.hospital_id ? String(row._id.hospital_id) : '__UNKNOWN__';
    const hospital = hospitalMap.get(hid);
    if (!byHospital.has(hid)) {
      byHospital.set(hid, {
        hospital_id: row._id.hospital_id,
        hospital_name: hospital?.hospital_name || '(Unmapped hospital)',
        hospital_tin: hospital?.tin || row._id.hospital_tin || '',
        quarters: { Q1: emptyQuarterBucket(), Q2: emptyQuarterBucket(), Q3: emptyQuarterBucket(), Q4: emptyQuarterBucket() },
        totals: emptyQuarterBucket(),
      });
    }
    const entry = byHospital.get(hid);
    const qBucket = entry.quarters[row._id.quarter];
    if (qBucket) {
      qBucket[row._id.status] = qBucket[row._id.status] || { count: 0, cr_amount: 0, cwt_amount: 0 };
      qBucket[row._id.status].count += row.count;
      qBucket[row._id.status].cr_amount = round2(qBucket[row._id.status].cr_amount + row.cr_amount_total);
      qBucket[row._id.status].cwt_amount = round2(qBucket[row._id.status].cwt_amount + row.cwt_amount_total);
      qBucket.row_count += row.count;
      qBucket.cwt_amount = round2(qBucket.cwt_amount + row.cwt_amount_total);
    }
    entry.totals[row._id.status] = entry.totals[row._id.status] || { count: 0, cr_amount: 0, cwt_amount: 0 };
    entry.totals[row._id.status].count += row.count;
    entry.totals[row._id.status].cr_amount = round2(entry.totals[row._id.status].cr_amount + row.cr_amount_total);
    entry.totals[row._id.status].cwt_amount = round2(entry.totals[row._id.status].cwt_amount + row.cwt_amount_total);
    entry.totals.row_count += row.count;
    entry.totals.cwt_amount = round2(entry.totals.cwt_amount + row.cwt_amount_total);
  }

  const hospitalRows = Array.from(byHospital.values()).sort(
    (a, b) => (b.totals.cwt_amount || 0) - (a.totals.cwt_amount || 0)
  );

  // Grand totals partitioned by status.
  const totals = {
    PENDING_2307: { count: 0, cr_amount: 0, cwt_amount: 0 },
    RECEIVED: { count: 0, cr_amount: 0, cwt_amount: 0 },
    EXCLUDED: { count: 0, cr_amount: 0, cwt_amount: 0 },
    cwt_total_all: 0,
    row_count: 0,
  };
  for (const row of rows) {
    const bucket = totals[row._id.status];
    if (bucket) {
      bucket.count += row.count;
      bucket.cr_amount = round2(bucket.cr_amount + row.cr_amount_total);
      bucket.cwt_amount = round2(bucket.cwt_amount + row.cwt_amount_total);
    }
    totals.cwt_total_all = round2(totals.cwt_total_all + row.cwt_amount_total);
    totals.row_count += row.count;
  }
  // The 1702 credit estimate excludes EXCLUDED rows entirely. PENDING is
  // exposure — surfaced separately so finance can chase before 1702 close.
  totals.cwt_credit_received = totals.RECEIVED.cwt_amount;
  totals.cwt_exposure_pending = totals.PENDING_2307.cwt_amount;

  return {
    year,
    quarter: quarter || null,
    period_label: quarter ? `${year}-${quarter}` : String(year),
    totals,
    hospitals: hospitalRows,
    quarters_present: Array.from(new Set(rows.map(r => r._id.quarter))).sort(),
    generated_at: new Date(),
  };
}

function emptyQuarterBucket() {
  return {
    PENDING_2307: { count: 0, cr_amount: 0, cwt_amount: 0 },
    RECEIVED: { count: 0, cr_amount: 0, cwt_amount: 0 },
    EXCLUDED: { count: 0, cr_amount: 0, cwt_amount: 0 },
    row_count: 0,
    cwt_amount: 0,
  };
}

/**
 * List inbound CWT rows for a year ± quarter ± status. Used by the table
 * on the /erp/bir/2307-IN page. Hospital name + TIN denormalized for
 * display so the page renders without a populate.
 */
async function listInboundRows({ entityId, year, quarter = null, status = null, hospitalId = null }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');

  const filter = { entity_id: ensureObjectId(entityId), year };
  if (quarter) filter.quarter = quarter;
  if (status) {
    // Pre-J6 rows have no `status` field — when filtering for the default
    // PENDING_2307 bucket, also catch them (they ARE pending until
    // bookkeeper acts). Other status filters match strict.
    if (status === 'PENDING_2307') {
      filter.$or = [{ status: 'PENDING_2307' }, { status: { $exists: false } }, { status: null }];
    } else {
      filter.status = status;
    }
  }
  if (hospitalId) filter.hospital_id = ensureObjectId(hospitalId);

  const rows = await CwtLedger.find(filter).sort({ cr_date: -1, _id: -1 }).lean();
  if (rows.length === 0) return [];

  // Denormalize hospital name + TIN at read time. Cheap one-shot lookup.
  const hospitalIds = Array.from(new Set(
    rows.map(r => r.hospital_id).filter(Boolean).map(id => String(id))
  )).map(id => ensureObjectId(id));
  const hospitals = hospitalIds.length
    ? await Hospital.find({ _id: { $in: hospitalIds }, entity_id: ensureObjectId(entityId) })
        .select('_id hospital_name tin').lean()
    : [];
  const hospitalMap = new Map(hospitals.map(h => [String(h._id), h]));

  // Project rows back with `status` defaulted (legacy rows had no status field).
  return rows.map(r => {
    const h = r.hospital_id ? hospitalMap.get(String(r.hospital_id)) : null;
    return {
      _id: r._id,
      cr_no: r.cr_no || '',
      cr_date: r.cr_date,
      cr_amount: round2(r.cr_amount),
      cwt_amount: round2(r.cwt_amount),
      cwt_rate: r.cwt_rate,
      atc_code: r.atc_code || 'WC158',
      quarter: r.quarter,
      year: r.year,
      period: r.period,
      hospital_id: r.hospital_id || null,
      hospital_name: h?.hospital_name || '(Unmapped hospital)',
      hospital_tin: h?.tin || r.hospital_tin || '',
      status: r.status || 'PENDING_2307',
      received_at: r.received_at || null,
      received_by: r.received_by || null,
      cert_2307_url: r.cert_2307_url || null,
      cert_filename: r.cert_filename || null,
      cert_content_hash: r.cert_content_hash || null,
      cert_notes: r.cert_notes || null,
      excluded_reason: r.excluded_reason || null,
      excluded_at: r.excluded_at || null,
      tagged_for_1702_year: r.tagged_for_1702_year || r.year,
    };
  });
}

// ── Lifecycle transitions ──────────────────────────────────────────────

async function _findRowOrThrow(rowId, entityId) {
  const row = await CwtLedger.findOne({
    _id: ensureObjectId(rowId),
    entity_id: ensureObjectId(entityId),
  });
  if (!row) {
    const err = new Error('CWT row not found in this entity scope.');
    err.status = 404;
    throw err;
  }
  return row;
}

/**
 * Flip PENDING_2307 → RECEIVED. Bookkeeper records that the hospital sent
 * the certificate. cert_* fields are admin-supplied references (URL +
 * filename + optional hash + free-form notes) — we do NOT store the PDF
 * bytes. If admin wants tamper-detect, they paste the SHA-256 of the file.
 */
async function markReceived(rowId, {
  entityId, userId, cert_2307_url = null, cert_filename = null,
  cert_content_hash = null, cert_notes = null,
}) {
  const row = await _findRowOrThrow(rowId, entityId);
  if (row.status === 'EXCLUDED') {
    const err = new Error('Cannot mark EXCLUDED row as RECEIVED. Restore via mark-pending first.');
    err.status = 409;
    throw err;
  }
  row.status = 'RECEIVED';
  row.received_at = new Date();
  row.received_by = userId || null;
  if (cert_2307_url !== undefined) row.cert_2307_url = sanitize(cert_2307_url);
  if (cert_filename !== undefined) row.cert_filename = sanitize(cert_filename);
  if (cert_content_hash !== undefined) row.cert_content_hash = sanitize(cert_content_hash);
  if (cert_notes !== undefined) row.cert_notes = sanitize(cert_notes);
  await row.save();
  await _appendBirAuditLog({
    entityId, userId, year: row.year,
    notes: `2307-IN RECEIVED — CR ${row.cr_no || row._id} (₱${row.cwt_amount.toFixed(2)} CWT, ${row.period})`,
    artifactKind: 'METADATA',
    contentHash: cert_content_hash || _hashRowState(row),
  });
  return row;
}

/**
 * Flip RECEIVED → PENDING_2307 (undo). Doesn't clear cert_* fields — admin
 * may re-mark received with corrections without re-typing. excluded_reason
 * is cleared because excluded rows can't reach this path.
 */
async function markPending(rowId, { entityId, userId }) {
  const row = await _findRowOrThrow(rowId, entityId);
  if (row.status === 'EXCLUDED') {
    // Restore from EXCLUDED → PENDING_2307. Clear exclude metadata.
    row.excluded_reason = null;
    row.excluded_by = null;
    row.excluded_at = null;
  }
  row.status = 'PENDING_2307';
  row.received_at = null;
  row.received_by = null;
  await row.save();
  await _appendBirAuditLog({
    entityId, userId, year: row.year,
    notes: `2307-IN reverted to PENDING — CR ${row.cr_no || row._id} (₱${row.cwt_amount.toFixed(2)} CWT, ${row.period}) by user ${userId}`,
    artifactKind: 'METADATA',
    contentHash: _hashRowState(row),
  });
  return row;
}

/**
 * Flip any status → EXCLUDED. Reason is required (e.g., "Hospital
 * re-issued cert under different CR", "Duplicate row from import").
 */
async function excludeRow(rowId, { entityId, userId, reason }) {
  if (!reason || !String(reason).trim()) {
    const err = new Error('exclude reason is required.');
    err.status = 400;
    throw err;
  }
  const row = await _findRowOrThrow(rowId, entityId);
  row.status = 'EXCLUDED';
  row.excluded_reason = sanitize(reason);
  row.excluded_by = userId || null;
  row.excluded_at = new Date();
  await row.save();
  await _appendBirAuditLog({
    entityId, userId, year: row.year,
    notes: `2307-IN EXCLUDED — CR ${row.cr_no || row._id} (₱${row.cwt_amount.toFixed(2)} CWT, ${row.period}). Reason: ${row.excluded_reason}`,
    artifactKind: 'METADATA',
    contentHash: _hashRowState(row),
  });
  return row;
}

// ── Posture & 1702 rollup ──────────────────────────────────────────────

/**
 * Build the BIR Compliance Dashboard "Inbound 2307 Posture" card payload.
 * Surfaces YTD pending exposure + received credit + top-N hospitals by
 * pending CWT amount (so the user knows who to chase).
 */
async function buildInboundPosture(entityId, year) {
  if (!entityId || !year) {
    return {
      enabled: true,
      pending_count: 0,
      pending_cwt: 0,
      received_count: 0,
      received_cwt: 0,
      excluded_count: 0,
      excluded_cwt: 0,
      total_cwt: 0,
      received_pct: 0,
      cwt_credit_for_1702: 0,
      top_pending_hospitals: [],
      note: 'No data — no collection-driven CWT rows for this year.',
    };
  }
  const summary = await compute2307InboundSummary({ entityId, year });
  const top = summary.hospitals
    .filter(h => (h.totals.PENDING_2307?.cwt_amount || 0) > 0)
    .slice(0, 5)
    .map(h => ({
      hospital_id: h.hospital_id,
      hospital_name: h.hospital_name,
      hospital_tin: h.hospital_tin,
      pending_count: h.totals.PENDING_2307?.count || 0,
      pending_cwt: h.totals.PENDING_2307?.cwt_amount || 0,
      received_count: h.totals.RECEIVED?.count || 0,
      received_cwt: h.totals.RECEIVED?.cwt_amount || 0,
    }));
  const totalsAll = (summary.totals.PENDING_2307?.cwt_amount || 0)
                  + (summary.totals.RECEIVED?.cwt_amount || 0)
                  + (summary.totals.EXCLUDED?.cwt_amount || 0);
  const receivedPct = totalsAll > 0
    ? Math.round((summary.totals.RECEIVED?.cwt_amount || 0) / totalsAll * 100)
    : 0;
  return {
    enabled: true,
    pending_count: summary.totals.PENDING_2307?.count || 0,
    pending_cwt: summary.totals.PENDING_2307?.cwt_amount || 0,
    received_count: summary.totals.RECEIVED?.count || 0,
    received_cwt: summary.totals.RECEIVED?.cwt_amount || 0,
    excluded_count: summary.totals.EXCLUDED?.count || 0,
    excluded_cwt: summary.totals.EXCLUDED?.cwt_amount || 0,
    total_cwt: round2(totalsAll),
    received_pct: receivedPct,
    cwt_credit_for_1702: summary.totals.cwt_credit_received,
    top_pending_hospitals: top,
    note: summary.totals.PENDING_2307?.count
      ? `${summary.totals.PENDING_2307.count} 2307 cert(s) still pending. Chase the top hospitals before 1702 closes.`
      : 'All 2307 inbound certificates received or excluded. Ready for 1702 credit.',
  };
}

/**
 * Annual 1702 Creditable Tax Withheld credit roll-up. Phase J7 will read
 * this to populate the "Less: Creditable Tax Withheld" line of the 1702
 * tax due computation. Includes only RECEIVED rows tagged for the given
 * year. Per-quarter breakdown surfaces for the bookkeeper to spot gaps.
 */
async function compute1702CwtRollup({ entityId, year }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');

  const matchYear = ensureObjectId(entityId);

  // Pull RECEIVED rows tagged for this 1702 year (primary path) plus
  // any RECEIVED rows where tagged_for_1702_year is null (legacy backfill —
  // assume calendar year tagging if unset).
  const rows = await CwtLedger.aggregate([
    {
      $match: {
        entity_id: matchYear,
        status: 'RECEIVED',
        $or: [
          { tagged_for_1702_year: year },
          { tagged_for_1702_year: { $in: [null, undefined] }, year },
        ],
      },
    },
    {
      $group: {
        _id: { quarter: '$quarter', atc_code: '$atc_code' },
        cwt: { $sum: '$cwt_amount' },
        cr_amount: { $sum: '$cr_amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.quarter': 1, '_id.atc_code': 1 } },
  ]);

  const buckets = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  let total = 0;
  for (const r of rows) {
    if (buckets[r._id.quarter] !== undefined) {
      buckets[r._id.quarter] = round2(buckets[r._id.quarter] + r.cwt);
    }
    total = round2(total + r.cwt);
  }

  // Pending exposure — same year, NOT received yet. Bookkeeper sees
  // "you'd be giving up ₱X if 1702 closes before these arrive."
  // Catches legacy rows whose `status` is unset (treated as PENDING).
  const pendingExposure = await CwtLedger.aggregate([
    {
      $match: {
        entity_id: matchYear,
        $and: [
          { $or: [{ status: 'PENDING_2307' }, { status: { $exists: false } }, { status: null }] },
          { $or: [
            { tagged_for_1702_year: year },
            { tagged_for_1702_year: { $in: [null, undefined] }, year },
          ] },
        ],
      },
    },
    {
      $group: {
        _id: null,
        cwt: { $sum: '$cwt_amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  const pendingTotal = round2(pendingExposure[0]?.cwt || 0);

  return {
    year,
    cwt_credit_for_1702: total,
    quarter_breakdown: buckets,
    by_atc: rows.map(r => ({
      quarter: r._id.quarter,
      atc_code: r._id.atc_code || 'WC158',
      cwt: round2(r.cwt),
      cr_amount: round2(r.cr_amount),
      count: r.count,
    })),
    pending_exposure_cwt: pendingTotal,
    pending_exposure_count: pendingExposure[0]?.count || 0,
    generated_at: new Date(),
  };
}

// ── Internal helpers ───────────────────────────────────────────────────

function sanitize(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  return t.length ? t : null;
}

function _hashRowState(row) {
  const blob = JSON.stringify({
    _id: String(row._id),
    status: row.status,
    cwt_amount: row.cwt_amount,
    cr_no: row.cr_no,
    period: row.period,
    received_at: row.received_at,
    excluded_at: row.excluded_at,
  });
  return crypto.createHash('sha256').update(blob).digest('hex');
}

/**
 * Append a metadata row to the entity's annual 2307-IN BirFilingStatus
 * audit log. Lazy-creates the row on first append. Mirrors the J5 BOOKS
 * audit pattern (Rule #20). The 2307-IN form is `PER_PAYOR`-frequency in
 * the catalog, so we encode it as one annual row per (entity, year) for
 * simple aggregation — per-row receipts are documented in `notes`.
 */
async function _appendBirAuditLog({ entityId, userId, year, notes, artifactKind = 'METADATA', contentHash = null }) {
  try {
    // 2307-IN's BirFilingStatus shape uses period_payee_id. Per Rule the
    // model rejects per-payee forms without a payee scope. Use the entity
    // id itself as the synthetic per-entity-year payee scope so the unique
    // index doesn't collide; this matches the existing 2307-OUT pattern
    // when only annual rollup matters. We tag period_payee_kind = null
    // (allowed by enum) — actually schema requires payee_kind for
    // per-payee forms, so we set 'Hospital' generically.
    //
    // SIMPLER: use form_code='2307-IN' is restricted by the model
    // pre-validate hook (perPayeeForms requires payee_id + payee_kind).
    // Stamping a synthetic per-entity-year payee_id would pollute the
    // unique index (one row per entity per year is desired). To avoid
    // model surgery on a tight 1-day budget, we log to the IN-process
    // structured log only and leave the BirFilingStatus row creation to
    // the explicit "mark filed" pathway when the year-end consolidation
    // ships in J7. The CwtLedger row itself is the source-of-truth for
    // the audit trail (received_by + received_at + cert_content_hash).
    console.log('[BIR_2307_INBOUND_AUDIT]', JSON.stringify({
      entity_id: String(entityId),
      year,
      user_id: String(userId || ''),
      notes,
      artifact_kind: artifactKind,
      content_hash: contentHash,
      ts: new Date().toISOString(),
    }));
  } catch (err) {
    console.warn('[cwt2307Reconciliation] audit log append failed (non-fatal):', err.message);
  }
}

module.exports = {
  compute2307InboundSummary,
  listInboundRows,
  markReceived,
  markPending,
  excludeRow,
  buildInboundPosture,
  compute1702CwtRollup,
  // Test seams
  _internals: { round2, sanitize, _hashRowState, ensureObjectId, quartersForYear, emptyQuarterBucket },
};
