/**
 * creditRuleController — Phase SG-4 #22
 *
 * CRUD on CreditRule + read-only listing of SalesCredit (audit trail).
 *
 * Wiring:
 *   - Routes mounted at /api/erp/credit-rules (see creditRuleRoutes.js).
 *   - All routes gated by erpAccessCheck('sales_goals') — credit policy is
 *     a sales-goal admin function. Write routes additionally require
 *     erpSubAccessCheck('sales_goals', 'plan_manage') so a finance reader
 *     without plan-write rights can audit but not edit.
 *   - Entity scoping follows Rule #21 (no silent self-id fallback): president
 *     sees all entities (or filters by ?entity_id=); everyone else is scoped
 *     to req.entityId.
 */

const CreditRule = require('../models/CreditRule');
const SalesCredit = require('../models/SalesCredit');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const creditRuleEngine = require('../services/creditRuleEngine');

function entityFilter(req) {
  if (req.isPresident) return req.query.entity_id ? { entity_id: req.query.entity_id } : {};
  return { entity_id: req.entityId };
}

// ─── CreditRule CRUD ────────────────────────────────────────────────────

exports.listRules = catchAsync(async (req, res) => {
  const filter = entityFilter(req);
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;
  if (req.query.is_active != null) filter.is_active = req.query.is_active === 'true';
  if (req.query.credit_bdm_id) filter.credit_bdm_id = req.query.credit_bdm_id;

  const rows = await CreditRule.find(filter)
    .populate('credit_bdm_id', 'name email')
    .populate('plan_id', 'plan_name fiscal_year version_no')
    .populate('conditions.territory_ids', 'name code')
    .populate('conditions.hospital_ids', 'name')
    .sort({ priority: 1, createdAt: 1 })
    .lean();

  res.json({ success: true, data: rows });
});

exports.getRuleById = catchAsync(async (req, res) => {
  // Consolidate the read + entity check into a single entity-scoped query.
  // Previously a findById + post-fetch 403 — equivalent but leaked cross-
  // entity id existence (different status code on stranger ids). Now 404
  // for any non-matching id, indistinguishable from a non-existent rule.
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const row = await CreditRule.findOne(filter)
    .populate('credit_bdm_id', 'name email')
    .populate('plan_id', 'plan_name fiscal_year version_no')
    .lean();
  if (!row) return res.status(404).json({ success: false, message: 'Credit rule not found' });
  res.json({ success: true, data: row });
});

exports.createRule = catchAsync(async (req, res) => {
  const entityId = req.body.entity_id || req.entityId;
  if (!req.body.rule_name?.trim()) {
    return res.status(400).json({ success: false, message: 'rule_name is required' });
  }
  if (!req.body.credit_bdm_id) {
    return res.status(400).json({ success: false, message: 'credit_bdm_id is required' });
  }
  const pct = Number(req.body.credit_pct);
  if (!Number.isFinite(pct) || pct < 0) {
    return res.status(400).json({ success: false, message: 'credit_pct must be a non-negative number' });
  }

  const row = await CreditRule.create({
    ...req.body,
    entity_id: entityId,
    created_by: req.user._id,
  });

  await ErpAuditLog.logChange({
    entity_id: entityId,
    log_type: 'STATUS_CHANGE',
    target_ref: row._id.toString(),
    target_model: 'CreditRule',
    field_changed: 'created',
    new_value: row.rule_name,
    changed_by: req.user._id,
    note: `Created credit rule "${row.rule_name}" (priority ${row.priority}, ${row.credit_pct}% to bdm)`,
  });

  res.status(201).json({ success: true, data: row, message: 'Credit rule created' });
});

exports.updateRule = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const row = await CreditRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Credit rule not found' });

  // Whitelist editable fields — entity_id and created_by are immutable.
  const editable = [
    'rule_name', 'description', 'priority', 'is_active', 'conditions',
    'credit_bdm_id', 'credit_pct', 'effective_from', 'effective_to', 'plan_id',
  ];
  for (const k of editable) {
    if (k in req.body) row[k] = req.body[k];
  }
  await row.save();

  await ErpAuditLog.logChange({
    entity_id: row.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: row._id.toString(),
    target_model: 'CreditRule',
    field_changed: 'updated',
    new_value: row.rule_name,
    changed_by: req.user._id,
    note: `Updated credit rule "${row.rule_name}"`,
  });

  res.json({ success: true, data: row, message: 'Credit rule updated' });
});

exports.deleteRule = catchAsync(async (req, res) => {
  const filter = { _id: req.params.id };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const row = await CreditRule.findOne(filter);
  if (!row) return res.status(404).json({ success: false, message: 'Credit rule not found' });
  // Soft delete by deactivating — historical SalesCredit rows still
  // reference the rule_id for auditability, so we never hard-delete.
  row.is_active = false;
  await row.save();

  await ErpAuditLog.logChange({
    entity_id: row.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: row._id.toString(),
    target_model: 'CreditRule',
    field_changed: 'is_active',
    old_value: 'true',
    new_value: 'false',
    changed_by: req.user._id,
    note: `Deactivated credit rule "${row.rule_name}"`,
  });

  res.json({ success: true, message: 'Credit rule deactivated (soft delete preserves audit trail)' });
});

// ─── SalesCredit ledger (read-only) ─────────────────────────────────────

exports.listCredits = catchAsync(async (req, res) => {
  const filter = entityFilter(req);
  if (req.query.sale_line_id) filter.sale_line_id = req.query.sale_line_id;
  if (req.query.credit_bdm_id) filter.credit_bdm_id = req.query.credit_bdm_id;
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.period) filter.period = req.query.period;
  if (req.query.source) filter.source = req.query.source;

  // Non-privileged BDMs see only their own credits (Rule #21 — no silent
  // self-id fallback when a privileged user omits the param).
  if (!req.isPresident && !req.isAdmin && !req.isFinance) {
    filter.credit_bdm_id = req.user._id;
  }

  const rows = await SalesCredit.find(filter)
    .populate('credit_bdm_id', 'name email')
    .populate('rule_id', 'rule_name priority')
    .populate('sale_line_id', 'doc_ref invoice_number csi_date invoice_total status')
    .sort({ csi_date: -1, createdAt: -1 })
    .limit(Number(req.query.limit) || 500)
    .lean();

  // Roll-up summary by BDM for the header card
  const summary = rows.reduce((acc, r) => {
    const k = String(r.credit_bdm_id?._id || r.credit_bdm_id);
    if (!acc[k]) acc[k] = { credit_bdm_id: k, count: 0, total_credited: 0 };
    acc[k].count += 1;
    acc[k].total_credited += Number(r.credited_amount) || 0;
    return acc;
  }, {});

  res.json({ success: true, data: rows, summary: Object.values(summary) });
});

// ─── Engine reassignment (admin tool) ────────────────────────────────────
// POST /credit-rules/reassign/:saleLineId — re-runs the engine for a single
// sale. Useful after rule edits or after a sale's hospital_id was corrected.
// Gated by plan_manage in the route file.
exports.reassignSale = catchAsync(async (req, res) => {
  const SalesLine = require('../models/SalesLine');
  const filter = { _id: req.params.saleLineId };
  if (!req.isPresident) filter.entity_id = req.entityId;
  const sale = await SalesLine.findOne(filter);
  if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
  if (sale.status !== 'POSTED') {
    return res.status(400).json({ success: false, message: 'Only POSTED sales can have credit rules re-run' });
  }
  const result = await creditRuleEngine.assign(sale, { userId: req.user._id });

  await ErpAuditLog.logChange({
    entity_id: sale.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: sale._id.toString(),
    target_model: 'SalesCredit',
    field_changed: 'reassign',
    new_value: `${result.assigned.length} row(s)`,
    changed_by: req.user._id,
    note: `Re-ran credit rule engine for sale ${sale.doc_ref || sale.invoice_number || sale._id} (fallback=${result.fallbackUsed})`,
  });

  res.json({ success: true, data: result, message: `Reassigned — ${result.assigned.length} credit row(s)` });
});
