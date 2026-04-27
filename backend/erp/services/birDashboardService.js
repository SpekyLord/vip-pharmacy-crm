/**
 * BIR Dashboard Service — Phase VIP-1.J (Apr 2026).
 *
 * Aggregates per-entity BIR compliance state into a single dashboard payload
 * for /erp/bir. Pure read-side; no writes. Cache TTL 60s per (entity, year).
 *
 * The shape returned drives BIRCompliancePage.jsx end-to-end:
 *   - Entity tax-config strip
 *   - Data Quality strip (last run summary + status)
 *   - 12-month form heatmap (rows = forms from BIR_FORMS_CATALOG lookup,
 *     columns = months, cells = BirFilingStatus rows)
 *   - Upcoming deadlines (next 30 days)
 *   - Withholding posture summary (contractors not withheld + est. payout)
 *   - Recent export audit log (across all forms this year)
 *
 * Lookup-driven: form catalog comes from BIR_FORMS_CATALOG (per-entity); if a
 * subscriber disables 1606 because they don't pay rent, the dashboard hides
 * the row without a code change.
 */

const Entity = require('../models/Entity');
const BirFilingStatus = require('../models/BirFilingStatus');
const BirDataQualityRun = require('../models/BirDataQualityRun');
const Lookup = require('../models/Lookup');

const TTL_MS = 60_000;
const _cache = new Map();

function cacheKey(entityId, year) {
  return `${String(entityId)}::${year}`;
}

function getCached(entityId, year) {
  const key = cacheKey(entityId, year);
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.payload;
  return null;
}

function setCached(entityId, year, payload) {
  _cache.set(cacheKey(entityId, year), { ts: Date.now(), payload });
}

function invalidate(entityId) {
  if (!entityId) {
    _cache.clear();
    return;
  }
  const prefix = `${String(entityId)}::`;
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(prefix)) _cache.delete(key);
  }
}

/**
 * Compute the next due date for a form catalog row + period combination.
 * Returns a Date or null if the form does not have a deterministic due date
 * (per-payee forms — 2307 is generated on demand).
 */
function computeDueDate(formMeta, year, monthOrQuarter) {
  if (!formMeta || !formMeta.frequency) return null;

  if (formMeta.frequency === 'MONTHLY') {
    // Due day of the FOLLOWING month for most monthly forms (2550M = 25th of next month).
    const nextMonth = monthOrQuarter === 12 ? 1 : monthOrQuarter + 1;
    const nextYear = monthOrQuarter === 12 ? year + 1 : year;
    return new Date(Date.UTC(nextYear, nextMonth - 1, formMeta.due_day || 25));
  }

  if (formMeta.frequency === 'QUARTERLY') {
    // Due day of the month FOLLOWING the quarter end.
    const quarterEndMonth = monthOrQuarter * 3;            // Q1 -> 3 (Mar)
    const dueMonth = quarterEndMonth === 12 ? 1 : quarterEndMonth + 1;
    const dueYear = quarterEndMonth === 12 ? year + 1 : year;
    return new Date(Date.UTC(dueYear, dueMonth - 1, formMeta.due_day || 31));
  }

  if (formMeta.frequency === 'ANNUAL') {
    const dueMonth = formMeta.due_month || 4;              // 1702 default April
    const dueDay = formMeta.due_day || 15;
    return new Date(Date.UTC(year + 1, dueMonth - 1, dueDay));
  }

  return null; // PER_PAYEE / PER_PAYOR have no deterministic period due date
}

/**
 * Derive the "effective status" for a heatmap cell. If the stored status is
 * not FILED/CONFIRMED and the due date has passed, surface OVERDUE without
 * mutating the stored row (so the indicator self-corrects when status flips).
 */
function deriveCellStatus(row, dueDate, dataQualityBlocked) {
  if (!row) {
    if (dataQualityBlocked) return 'DATA_INCOMPLETE';
    if (dueDate && dueDate < new Date()) return 'OVERDUE';
    return 'DRAFT';
  }
  if (row.status === 'CONFIRMED' || row.status === 'FILED') return row.status;
  if (dueDate && dueDate < new Date()) return 'OVERDUE';
  return row.status;
}

/**
 * Resolve the form catalog for a given entity, hydrating from BIR_FORMS_CATALOG
 * lookup. Falls back to empty list if the lookup is empty (subscriber turned
 * everything off) — caller should handle that gracefully.
 *
 * Filters out rows whose `tax_types` metadata does not include the entity's
 * tax_type (e.g., 1701 only shows for SOLE_PROP entities). Also filters out
 * rows whose `requires_*` flags don't match entity flags (e.g., 1606 hidden
 * unless rent_withholding_active = true).
 */
async function getFormCatalog(entity) {
  const filter = { category: 'BIR_FORMS_CATALOG', entity_id: entity._id, is_active: true };
  const rows = await Lookup.find(filter).sort({ sort_order: 1 }).lean();

  return rows.filter(row => {
    const meta = row.metadata || {};
    if (Array.isArray(meta.tax_types) && meta.tax_types.length > 0) {
      if (!meta.tax_types.includes(entity.tax_type || 'CORP')) return false;
    }
    if (meta.requires_vat && !entity.vat_registered) return false;
    if (meta.requires_rent && !entity.rent_withholding_active) return false;
    if (meta.requires_withholding && !entity.withholding_active) return false;
    // requires_payroll / requires_collections / requires_storefront are
    // soft signals — keep the row visible so the dashboard surfaces "no
    // payroll yet" rather than silently hiding obligations.
    return true;
  });
}

/**
 * Build the dashboard payload for a given entity + year.
 */
async function buildDashboard({ entityId, year }) {
  const cached = getCached(entityId, year);
  if (cached) return { ...cached, _cache: 'HIT' };

  const entity = await Entity.findById(entityId).lean();
  if (!entity) {
    const empty = {
      error: 'ENTITY_NOT_FOUND',
      entity: null, data_quality: null, forms: [], deadlines: [],
      withholding_posture: null, recent_exports: [], year,
    };
    return empty;
  }

  // ── 1. Entity tax-config ──
  const taxConfig = {
    _id: entity._id,
    entity_name: entity.entity_name,
    short_name: entity.short_name,
    tin: entity.tin || null,
    rdo_code: entity.rdo_code || null,
    tax_type: entity.tax_type || 'CORP',
    business_style: entity.business_style || null,
    vat_registered: !!entity.vat_registered,
    top_withholding_agent: !!entity.top_withholding_agent,
    withholding_active: !!entity.withholding_active,
    rent_withholding_active: !!entity.rent_withholding_active,
    tax_filing_email: entity.tax_filing_email || null,
    config_completeness: computeConfigCompleteness(entity),
  };

  // ── 2. Last Data Quality run ──
  const lastRun = await BirDataQualityRun
    .findOne({ entity_id: entityId })
    .sort({ started_at: -1 })
    .lean();

  const dataQuality = lastRun ? {
    status: lastRun.status,
    started_at: lastRun.started_at,
    completed_at: lastRun.completed_at,
    summary: lastRun.summary,
    blocked_forms_due_within_7d: lastRun.blocked_forms_due_within_7d || [],
    findings_count: (lastRun.findings || []).length,
  } : {
    status: 'NEVER_RUN',
    summary: null,
    findings_count: 0,
    blocked_forms_due_within_7d: [],
  };

  // ── 3. Form catalog + heatmap ──
  const catalog = await getFormCatalog(entity);
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const filingRows = await BirFilingStatus.find({
    entity_id: entityId,
    period_year: year,
  }).lean();

  const forms = catalog.map(catRow => {
    const meta = catRow.metadata || {};
    const cells = [];

    if (meta.frequency === 'MONTHLY') {
      for (let m = 1; m <= 12; m++) {
        const row = filingRows.find(r => r.form_code === catRow.code && r.period_month === m);
        const due = computeDueDate(meta, year, m);
        cells.push({
          period_label: `${year}-${String(m).padStart(2, '0')}`,
          period_month: m,
          period_quarter: null,
          status: deriveCellStatus(row, due, dataQuality.blocked_forms_due_within_7d.includes(catRow.code)),
          due_date: due,
          row_id: row?._id || null,
          totals_snapshot: row?.totals_snapshot || null,
        });
      }
    } else if (meta.frequency === 'QUARTERLY') {
      for (let q = 1; q <= 4; q++) {
        const row = filingRows.find(r => r.form_code === catRow.code && r.period_quarter === q);
        const due = computeDueDate(meta, year, q);
        cells.push({
          period_label: `${year}-Q${q}`,
          period_month: null,
          period_quarter: q,
          status: deriveCellStatus(row, due, dataQuality.blocked_forms_due_within_7d.includes(catRow.code)),
          due_date: due,
          row_id: row?._id || null,
          totals_snapshot: row?.totals_snapshot || null,
        });
      }
    } else if (meta.frequency === 'ANNUAL') {
      const row = filingRows.find(r => r.form_code === catRow.code);
      const due = computeDueDate(meta, year, null);
      cells.push({
        period_label: String(year),
        period_month: null,
        period_quarter: null,
        status: deriveCellStatus(row, due, dataQuality.blocked_forms_due_within_7d.includes(catRow.code)),
        due_date: due,
        row_id: row?._id || null,
        totals_snapshot: row?.totals_snapshot || null,
      });
    } else {
      // PER_PAYEE / PER_PAYOR — surface a count + drill-down link.
      const periodRows = filingRows.filter(r => r.form_code === catRow.code);
      cells.push({
        period_label: `${year} (per-payee)`,
        period_month: null,
        period_quarter: null,
        status: periodRows.length > 0 ? 'DRAFT' : 'NEVER_RUN',
        due_date: null,
        row_id: null,
        per_payee_count: periodRows.length,
      });
    }

    return {
      form_code: catRow.code,
      label: catRow.label,
      frequency: meta.frequency,
      channel: meta.channel,
      description: meta.description,
      cells,
    };
  });

  // ── 4. Upcoming deadlines (next 30 days) ──
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const deadlines = [];
  for (const form of forms) {
    for (const cell of form.cells) {
      if (!cell.due_date) continue;
      if (cell.due_date >= now && cell.due_date <= horizon) {
        if (cell.status !== 'FILED' && cell.status !== 'CONFIRMED') {
          deadlines.push({
            form_code: form.form_code,
            label: form.label,
            period_label: cell.period_label,
            due_date: cell.due_date,
            status: cell.status,
            days_remaining: Math.ceil((cell.due_date - now) / (24 * 60 * 60 * 1000)),
          });
        }
      }
    }
  }
  deadlines.sort((a, b) => a.due_date - b.due_date);

  // ── 5. Recent exports (last 20 across all forms this year) ──
  const recentExports = [];
  for (const row of filingRows) {
    for (const audit of (row.export_audit_log || [])) {
      recentExports.push({
        form_code: row.form_code,
        period_label: row.period_month
          ? `${row.period_year}-${String(row.period_month).padStart(2, '0')}`
          : row.period_quarter
            ? `${row.period_year}-Q${row.period_quarter}`
            : String(row.period_year),
        exported_at: audit.exported_at,
        artifact_kind: audit.artifact_kind,
        filename: audit.filename,
        byte_length: audit.byte_length,
      });
    }
  }
  recentExports.sort((a, b) => b.exported_at - a.exported_at);

  // ── 6. Withholding posture (Phase J2 will populate; J0 stub) ──
  const withholdingPosture = {
    enabled: !!entity.withholding_active,
    note: entity.withholding_active
      ? 'Withholding engine active. Phase J2 will populate per-contractor counts.'
      : 'Withholding engine OFF for this entity. Per-contractor exposure surfaces in Phase J2.',
    contractors_not_withheld: 0,
    estimated_ytd_payout: 0,
    estimated_annual_payout: 0,
    threshold_trip_at: 720_000,
  };

  const payload = {
    year,
    entity: taxConfig,
    data_quality: dataQuality,
    forms,
    deadlines,
    recent_exports: recentExports.slice(0, 20),
    withholding_posture: withholdingPosture,
    generated_at: new Date(),
  };

  setCached(entityId, year, payload);
  return { ...payload, _cache: 'MISS' };
}

/**
 * Score the entity's BIR config completeness (0-100).
 * Used by the dashboard banner to surface "fix me first" prompts.
 */
function computeConfigCompleteness(entity) {
  const checks = [
    !!entity.tin,
    !!entity.rdo_code,
    !!entity.tax_type,
    !!entity.business_style,
    !!entity.address,
    !!entity.tax_filing_email,
  ];
  const passed = checks.filter(Boolean).length;
  return Math.round((passed / checks.length) * 100);
}

module.exports = {
  buildDashboard,
  computeDueDate,
  deriveCellStatus,
  getFormCatalog,
  computeConfigCompleteness,
  invalidate,
};
