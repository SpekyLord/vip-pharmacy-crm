const KpiTemplate = require('../models/KpiTemplate');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');

/**
 * KpiTemplate Controller — Phase SG-3R
 *
 * Admin curates reusable KPI defaults; `salesGoalController.createPlan`
 * consumes them via optional `template_id` on POST /plans. Every route is
 * entity-scoped (req.entityId fallback) and lookup-driven (kpi_code,
 * driver_code, unit_code all reference existing Lookup categories).
 *
 * Why no `gateApproval` here: templates are advisory defaults, not financial
 * documents. They become authoritative only when a plan copies them and is
 * then activated (which IS gated). Same posture as KPI library editing.
 */

function scopeForRequest(req) {
  // President can override entity via ?entity_id=; everyone else is pinned to
  // their own entity (Rule #19 isolation).
  if (req.isPresident && req.query.entity_id) return req.query.entity_id;
  return req.entityId;
}

// ─── List templates for the current entity ───────────────────────────────────
exports.listTemplates = catchAsync(async (req, res) => {
  const filter = { entity_id: scopeForRequest(req) };
  if (req.query.template_name) filter.template_name = req.query.template_name;
  if (req.query.driver_code) filter.driver_code = String(req.query.driver_code).toUpperCase();
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

  const rows = await KpiTemplate.find(filter)
    .sort({ template_name: 1, driver_code: 1, sort_order: 1, kpi_code: 1 })
    .lean();

  // Collapse into a list of template sets (one group per template_name), each with its rows.
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.template_name)) {
      groups.set(r.template_name, { template_name: r.template_name, kpi_count: 0, driver_count: new Set(), rows: [] });
    }
    const g = groups.get(r.template_name);
    g.rows.push(r);
    g.kpi_count += 1;
    g.driver_count.add(r.driver_code);
  }
  const sets = Array.from(groups.values()).map(g => ({
    template_name: g.template_name,
    kpi_count: g.kpi_count,
    driver_count: g.driver_count.size,
    rows: g.rows,
  }));

  res.json({ success: true, data: { sets, total_rows: rows.length } });
});

// ─── Fetch one row ───────────────────────────────────────────────────────────
exports.getTemplate = catchAsync(async (req, res) => {
  const t = await KpiTemplate.findOne({ _id: req.params.id, entity_id: scopeForRequest(req) }).lean();
  if (!t) return res.status(404).json({ success: false, message: 'Template row not found' });
  res.json({ success: true, data: t });
});

// ─── Create one row ──────────────────────────────────────────────────────────
exports.createTemplate = catchAsync(async (req, res) => {
  const body = req.body || {};
  if (!body.template_name || !body.driver_code || !body.kpi_code) {
    return res.status(400).json({ success: false, message: 'template_name, driver_code, and kpi_code are required' });
  }

  const row = await KpiTemplate.create({
    entity_id: scopeForRequest(req) || req.entityId,
    template_name: String(body.template_name).trim(),
    driver_code: String(body.driver_code).trim().toUpperCase(),
    kpi_code: String(body.kpi_code).trim(),
    kpi_label: body.kpi_label || '',
    default_target: Number(body.default_target) || 0,
    unit_code: body.unit_code || '',
    computation: body.computation || 'manual',
    direction: body.direction || 'higher_better',
    functional_roles: Array.isArray(body.functional_roles) ? body.functional_roles : [],
    sort_order: Number(body.sort_order) || 0,
    description: body.description || '',
    is_active: body.is_active !== false,
    created_by: req.user._id,
    updated_by: req.user._id,
  });

  // Audit — templates are low-risk but the paper trail helps when an entity
  // wonders "who added this default revenue target to driver X".
  try {
    await ErpAuditLog.logChange({
      entity_id: row.entity_id,
      log_type: 'CREATE',
      target_ref: row._id.toString(),
      target_model: 'KpiTemplate',
      new_value: { template_name: row.template_name, driver_code: row.driver_code, kpi_code: row.kpi_code },
      changed_by: req.user._id,
      note: `Created KPI template row ${row.template_name} / ${row.driver_code} / ${row.kpi_code}`,
    });
  } catch (err) {
    console.error('[kpiTemplate] audit log failed (non-blocking):', err.message);
  }

  res.status(201).json({ success: true, data: row, message: 'Template row created' });
});

// ─── Update one row ──────────────────────────────────────────────────────────
exports.updateTemplate = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id, entity_id: scopeForRequest(req) };
  const row = await KpiTemplate.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Template row not found' });

  const body = req.body || {};
  // Guard: changing the unique key would break the (entity, name, driver, kpi) invariant.
  // Disallow it silently — callers must delete and recreate to move a row.
  delete body.entity_id;
  delete body.created_by;
  Object.assign(row, body, { updated_by: req.user._id });
  if (body.driver_code) row.driver_code = String(body.driver_code).toUpperCase();
  await row.save();

  res.json({ success: true, data: row, message: 'Template row updated' });
});

// ─── Delete one row ──────────────────────────────────────────────────────────
exports.deleteTemplate = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id, entity_id: scopeForRequest(req) };
  const row = await KpiTemplate.findOneAndDelete(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Template row not found' });

  try {
    await ErpAuditLog.logChange({
      entity_id: row.entity_id,
      log_type: 'DELETE',
      target_ref: row._id.toString(),
      target_model: 'KpiTemplate',
      old_value: { template_name: row.template_name, driver_code: row.driver_code, kpi_code: row.kpi_code },
      changed_by: req.user._id,
      note: `Deleted KPI template row ${row.template_name} / ${row.driver_code} / ${row.kpi_code}`,
    });
  } catch (err) {
    console.error('[kpiTemplate] audit log failed (non-blocking):', err.message);
  }

  res.json({ success: true, message: 'Template row deleted' });
});

// ─── Delete an entire template set (all rows with same template_name) ────────
exports.deleteTemplateSet = catchAsync(async (req, res) => {
  const name = String(req.params.name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: 'Template name is required' });
  const filter = { entity_id: scopeForRequest(req), template_name: name };
  const { deletedCount } = await KpiTemplate.deleteMany(filter);
  res.json({ success: true, message: `Deleted ${deletedCount} row(s) from template set "${name}"`, deletedCount });
});
