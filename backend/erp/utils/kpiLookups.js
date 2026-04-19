/**
 * Phase G10 — POA / KPI lookup helpers (GROWTH_DRIVER + KPI_CODE).
 *
 * Seeds and reads per-entity lookup rows for the 2026 Sales GOAL and POA
 * structure. Pattern mirrors `inboxLookups.js` (G9.A) — lazy-seed on first
 * read, admin can edit rows in Control Center without a code deploy.
 *
 * Categories managed here:
 *   - GROWTH_DRIVER — 5 POA drivers: HOSPITAL_ACCREDITATION,
 *                     PRODUCT_INCLUSION, INVENTORY_OPTIMIZATION,
 *                     DEMAND_PULL, PRICE_INCREASE. metadata carries
 *                     revenue_band_min/max, po_a_order, responsibility_tags
 *                     so Gantt + Revenue Bridge UI can drive everything
 *                     from the lookup alone (no hardcoded bands in code).
 *   - KPI_CODE     — 13 POA KPIs keyed to the drivers above. metadata
 *                     carries driver, auto_compute flag, direction
 *                     ('higher_better' / 'lower_better'), unit label.
 *                     auto_compute=false means salesGoalService.computeKpi
 *                     currently has no case for this KPI (manual data
 *                     source); flip to true when a case lands.
 *
 * Source of truth: 2026 Sales GOAL and POA.pdf
 *   C:\Users\LENOVO\OneDrive\Documents\2026\TRAINING\2026 Sales GOAL and POA.pdf
 *
 * Integrity contract:
 *   - isValidDriverCode()    gatekeeps Task.growth_driver_code on write
 *   - isValidKpiCode()        gatekeeps Task.kpi_code on write
 *   - getDriversConfig(eid)   powers /api/erp/tasks/drivers (Gantt + Bridge)
 *   - getKpiCodesConfig(eid)  powers /api/erp/tasks/kpi-codes (filter UI)
 */
'use strict';

const Lookup = require('../models/Lookup');

// ─── GROWTH_DRIVER defaults (POA Section II + III) ──────────────────────
// po_a_order = row order on the Gantt + Revenue Bridge (matches PDF).
// revenue_band_min/max = PHP millions (numeric, not strings).
const GROWTH_DRIVER_DEFAULTS = [
  {
    code: 'HOSPITAL_ACCREDITATION',
    label: 'Hospital Accreditation',
    sort_order: 1,
    metadata: {
      po_a_order: 1,
      revenue_band_min: 1.0,
      revenue_band_max: 2.0,
      responsibility_tags: ['BDM', 'EBDM', 'PRESIDENT'],
      objective: 'Become an accredited supplier to 100% of hospitals in the distribution territory.',
      rationale: 'No accreditation = zero revenue potential. Accreditation is the gatekeeper to growth.',
    },
  },
  {
    code: 'PRODUCT_INCLUSION',
    label: 'Pharmacy & CSR Inclusion',
    sort_order: 2,
    metadata: {
      po_a_order: 2,
      revenue_band_min: 2.0,
      revenue_band_max: 3.0,
      responsibility_tags: ['BDM', 'EBDM', 'PRESIDENT'],
      objective: 'Secure pharmacy and CSR listing for priority SKUs in every accredited hospital.',
      rationale: 'Accreditation enables entry; formulary inclusion drives repeat, institutionalized demand.',
    },
  },
  {
    code: 'INVENTORY_OPTIMIZATION',
    label: 'Inventory Optimization (Zero Lost Sales)',
    sort_order: 3,
    metadata: {
      po_a_order: 3,
      revenue_band_min: 0.5,
      revenue_band_max: 1.0,
      responsibility_tags: ['BDM'],
      objective: 'Eliminate lost sales due to stock-outs while reducing expiry risk.',
      rationale: 'Lost sales are invisible revenue leaks. Inventory excellence adds revenue without new customers.',
    },
  },
  {
    code: 'DEMAND_PULL',
    label: 'Strategic Partnerships (MD / Pharmacy / CSR)',
    sort_order: 4,
    metadata: {
      po_a_order: 4,
      revenue_band_min: 4.0,
      revenue_band_max: 5.0,
      responsibility_tags: ['BDM', 'EBDM'],
      objective: 'Create sustained demand pull and preferred-supplier status.',
      rationale: 'Hospitals buy systematically; doctors prescribe clinically. Stakeholder alignment multiplies demand.',
    },
  },
  {
    code: 'PRICE_INCREASE',
    label: 'Surgical Price Increases',
    sort_order: 5,
    metadata: {
      po_a_order: 5,
      revenue_band_min: 5.0,
      revenue_band_max: 6.0,
      responsibility_tags: ['BDM', 'PRESIDENT'],
      objective: 'Increase revenue through controlled, defensible price adjustments.',
      rationale: 'Strategic pricing — coordinated properly — improves topline and profitability.',
    },
  },
];

// ─── KPI_CODE defaults (POA KPIs per driver) ────────────────────────────
// auto_compute=true → salesGoalService.computeKpi already has a switch case
//   (verified by reading salesGoalService.js as of April 2026).
// auto_compute=false → manual data source. A future phase wires the case.
const KPI_CODE_DEFAULTS = [
  // HOSPITAL_ACCREDITATION
  { code: 'PCT_HOSP_ACCREDITED',      label: '% Hospitals Accredited',      sort_order: 1,  metadata: { driver: 'HOSPITAL_ACCREDITATION', auto_compute: true,  direction: 'higher_better', unit: '%' } },
  { code: 'TIME_TO_ACCREDITATION_DAYS',label:'Time-to-Accreditation (days)', sort_order: 2,  metadata: { driver: 'HOSPITAL_ACCREDITATION', auto_compute: false, direction: 'lower_better',  unit: 'days' } },
  { code: 'REV_PER_ACCREDITED_HOSP',  label: 'Revenue per Accredited Hospital', sort_order: 3, metadata: { driver: 'HOSPITAL_ACCREDITATION', auto_compute: true,  direction: 'higher_better', unit: 'PHP' } },
  // PRODUCT_INCLUSION
  { code: 'SKUS_LISTED_PER_HOSP',     label: 'SKUs Listed per Hospital',    sort_order: 4,  metadata: { driver: 'PRODUCT_INCLUSION', auto_compute: true,  direction: 'higher_better', unit: 'count' } },
  { code: 'FORMULARY_APPROVAL_RATE',  label: 'Formulary Approval Success Rate', sort_order: 5, metadata: { driver: 'PRODUCT_INCLUSION', auto_compute: false, direction: 'higher_better', unit: '%' } },
  { code: 'MONTHLY_REORDER_FREQ',     label: 'Monthly Reorder Frequency',   sort_order: 6,  metadata: { driver: 'PRODUCT_INCLUSION', auto_compute: false, direction: 'higher_better', unit: 'count' } },
  // INVENTORY_OPTIMIZATION
  { code: 'LOST_SALES_INCIDENTS',     label: 'Lost Sales Incidents',        sort_order: 7,  metadata: { driver: 'INVENTORY_OPTIMIZATION', auto_compute: false, direction: 'lower_better',  unit: 'count' } },
  { code: 'INVENTORY_TURNOVER',       label: 'Inventory Turnover',          sort_order: 8,  metadata: { driver: 'INVENTORY_OPTIMIZATION', auto_compute: false, direction: 'higher_better', unit: 'ratio' } },
  { code: 'EXPIRY_RETURNS',           label: 'Expiry Returns',              sort_order: 9,  metadata: { driver: 'INVENTORY_OPTIMIZATION', auto_compute: false, direction: 'lower_better',  unit: 'PHP' } },
  // DEMAND_PULL
  { code: 'MD_ENGAGEMENT_COVERAGE',   label: 'MD Engagement Coverage',      sort_order: 10, metadata: { driver: 'DEMAND_PULL', auto_compute: false, direction: 'higher_better', unit: '%' } },
  { code: 'HOSP_REORDER_CYCLE_TIME',  label: 'Hospital Reorder Cycle Time', sort_order: 11, metadata: { driver: 'DEMAND_PULL', auto_compute: false, direction: 'lower_better',  unit: 'days' } },
  // PRICE_INCREASE
  { code: 'VOLUME_RETENTION_POST_PI', label: 'Volume Retention Post-Price-Increase', sort_order: 12, metadata: { driver: 'PRICE_INCREASE', auto_compute: false, direction: 'higher_better', unit: '%' } },
  { code: 'GROSS_MARGIN_PER_SKU',     label: 'Gross Margin per SKU',        sort_order: 13, metadata: { driver: 'PRICE_INCREASE', auto_compute: false, direction: 'higher_better', unit: '%' } },
];

// ─── RESPONSIBILITY_TAG defaults (POA "(BDM + President)" notation) ────
// Admins can extend per entity (e.g., add 'QA' or 'SALES_OPS') without a code
// deploy. Used by the Task.responsibility_tags filter + importer validator.
const RESPONSIBILITY_TAG_DEFAULTS = [
  { code: 'BDM',       label: 'Business Development Manager', sort_order: 1, metadata: {} },
  { code: 'PRESIDENT', label: 'President',                    sort_order: 2, metadata: {} },
  { code: 'EBDM',      label: 'eBDM (Iloilo/Shared)',         sort_order: 3, metadata: {} },
  { code: 'OM',        label: 'Operations Manager',           sort_order: 4, metadata: {} },
];

// ─── TASK_BULK_NOTIFY_THRESHOLD (scalar config) ────────────────────────
// Single-row lookup. Above this threshold, bulk-update / bulk-delete
// collapse per-assignee notifications into one rollup row instead of N
// per-task rows. Default 5. Admin can raise/lower per entity.
const TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS = [
  { code: 'GLOBAL', label: 'Bulk notify rollup threshold', sort_order: 1, metadata: { value: 5, unit: 'count' } },
];

// ─── Generic lazy-seed helper ──────────────────────────────────────────
// Same shape as inboxLookups.seedAndLoad — duplicated intentionally to
// keep G10 self-contained. The two files stay in sync via convention,
// not shared module (so a bug in one can't silently corrupt the other).
async function seedAndLoad(category, defaults, entityId) {
  if (!entityId) {
    return defaults.map(d => ({ ...d, category, entity_id: null, is_active: true }));
  }
  try {
    let rows = await Lookup.find({ entity_id: entityId, category, is_active: true })
      .sort({ sort_order: 1 })
      .lean();
    if (rows.length === 0) {
      const ops = defaults.map(d => ({
        updateOne: {
          filter: { entity_id: entityId, category, code: d.code },
          update: {
            $setOnInsert: {
              entity_id: entityId,
              category,
              code: d.code,
              label: d.label,
              sort_order: d.sort_order,
              is_active: true,
              metadata: d.metadata || {},
            },
          },
          upsert: true,
        },
      }));
      try {
        await Lookup.bulkWrite(ops, { ordered: false });
      } catch (err) {
        console.warn(`[kpiLookups] ${category} lazy-seed failed:`, err.message);
      }
      rows = await Lookup.find({ entity_id: entityId, category, is_active: true })
        .sort({ sort_order: 1 })
        .lean();
    }
    if (rows.length === 0) return defaults.map(d => ({ ...d, category, entity_id: entityId, is_active: true }));
    return rows;
  } catch (err) {
    console.warn(`[kpiLookups] ${category} read failed:`, err.message);
    return defaults.map(d => ({ ...d, category, entity_id: entityId, is_active: true }));
  }
}

async function getDriversConfig(entityId)  { return seedAndLoad('GROWTH_DRIVER', GROWTH_DRIVER_DEFAULTS, entityId); }
async function getKpiCodesConfig(entityId) { return seedAndLoad('KPI_CODE',      KPI_CODE_DEFAULTS,      entityId); }
async function getResponsibilityTagsConfig(entityId) { return seedAndLoad('RESPONSIBILITY_TAG', RESPONSIBILITY_TAG_DEFAULTS, entityId); }

// Single-row config lookup (scalar, not a picklist). TASK_BULK_NOTIFY_THRESHOLD
// holds one row keyed GLOBAL with metadata.value = N. Used by bulkUpdate /
// bulkDelete to decide whether to roll up per-assignee notifications.
async function getBulkNotifyThreshold(entityId) {
  const rows = await seedAndLoad('TASK_BULK_NOTIFY_THRESHOLD', TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS, entityId);
  const row = rows.find(r => String(r.code).toUpperCase() === 'GLOBAL') || rows[0];
  const v = Number(row?.metadata?.value);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

// ─── Validators used by taskController on create/update ─────────────────
// Always return truthy when the code is null/empty (field is optional).
// Ignore inactive rows — admin can deactivate a driver/KPI and legacy
// tasks keep their value, but new tasks cannot reference it.
async function isValidDriverCode(entityId, code) {
  if (!code) return true;
  const rows = await getDriversConfig(entityId);
  return rows.some(r => String(r.code).toUpperCase() === String(code).toUpperCase() && r.is_active !== false);
}
async function isValidKpiCode(entityId, code) {
  if (!code) return true;
  const rows = await getKpiCodesConfig(entityId);
  return rows.some(r => String(r.code).toUpperCase() === String(code).toUpperCase() && r.is_active !== false);
}

// ─── Optional: driver ↔ KPI alignment check ────────────────────────────
// When a task has both a driver and a KPI, the KPI's metadata.driver
// should match. Returns { ok, reason } — controller surfaces the reason.
async function driverKpiAlignment(entityId, driverCode, kpiCode) {
  if (!driverCode || !kpiCode) return { ok: true };
  const kpis = await getKpiCodesConfig(entityId);
  const kpiRow = kpis.find(r => String(r.code).toUpperCase() === String(kpiCode).toUpperCase());
  if (!kpiRow) return { ok: false, reason: 'kpi_not_found' };
  const attachedDriver = kpiRow.metadata?.driver;
  if (!attachedDriver) return { ok: true }; // lookup row has no driver tag → skip check
  if (String(attachedDriver).toUpperCase() !== String(driverCode).toUpperCase()) {
    return { ok: false, reason: 'kpi_driver_mismatch' };
  }
  return { ok: true };
}

// ─── Responsibility-tag validator (uses RESPONSIBILITY_TAG lookup) ─────
// Returns null on success, or an array of unknown codes on failure.
// Called by the importer and by the TaskMiniEditor tag-save path. The
// taskController's sanitizeTags stays freeform (legacy tasks may have
// out-of-lookup tags); this validator is opt-in for strict contexts.
async function validateResponsibilityTags(entityId, tags) {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const rows = await getResponsibilityTagsConfig(entityId);
  const ok = new Set(rows.filter(r => r.is_active !== false).map(r => String(r.code).toUpperCase()));
  const unknown = tags.map(t => String(t || '').toUpperCase()).filter(t => t && !ok.has(t));
  return unknown.length ? unknown : null;
}

module.exports = {
  GROWTH_DRIVER_DEFAULTS,
  KPI_CODE_DEFAULTS,
  RESPONSIBILITY_TAG_DEFAULTS,
  TASK_BULK_NOTIFY_THRESHOLD_DEFAULTS,
  getDriversConfig,
  getKpiCodesConfig,
  getResponsibilityTagsConfig,
  getBulkNotifyThreshold,
  isValidDriverCode,
  isValidKpiCode,
  driverKpiAlignment,
  validateResponsibilityTags,
};
