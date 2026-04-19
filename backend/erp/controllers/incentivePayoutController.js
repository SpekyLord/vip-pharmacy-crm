const mongoose = require('mongoose');
const IncentivePayout = require('../models/IncentivePayout');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const SalesGoalTarget = require('../models/SalesGoalTarget');
const KpiSnapshot = require('../models/KpiSnapshot');
const PeopleMaster = require('../models/PeopleMaster');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const PaymentMode = require('../models/PaymentMode');
const Lookup = require('../models/Lookup');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { gateApproval } = require('../services/approvalService');
const { checkPeriodOpen } = require('../utils/periodLock');
const {
  postSettlementJournal,
  reverseAccrualJournal,
} = require('../services/journalFromIncentive');
const salesGoalService = require('../services/salesGoalService');
const { renderCompensationStatement } = require('../templates/compensationStatement');

/**
 * IncentivePayout controller — Phase SG-Q2 Week 2
 *
 * Lifecycle:  ACCRUED → APPROVED → PAID → (optional) REVERSED
 *   - Accrual is created automatically by salesGoalService.computeBdmSnapshot
 *     (no public create endpoint).
 *   - Approve/Pay/Reverse are gated by gateApproval (INCENTIVE_PAYOUT, financial),
 *     plus periodLockCheck on the current reporting period (settlement/reversal),
 *     plus erpSubAccessCheck on payout_{approve|pay|reverse} sub-perms.
 *
 * Route mount: /api/erp/incentive-payouts
 */

// Derive YYYY-MM from a Date for period-lock evaluation on settlement/reversal.
function currentPeriodString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ─── READ ────────────────────────────────────────────────────────────────

exports.listPayouts = catchAsync(async (req, res) => {
  const filter = {};

  if (req.query.bdm_id) filter.bdm_id = req.query.bdm_id;
  if (req.query.plan_id) filter.plan_id = req.query.plan_id;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);

  // Scope: president sees everything (respecting optional ?entity_id=).
  // Everyone else is scoped to their working entity. BDMs (contractors) who
  // aren't finance/admin see only their own payouts — guarded below.
  if (req.isPresident) {
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
    const nonFinancial = !req.isAdmin && !req.isFinance;
    if (nonFinancial) {
      filter.bdm_id = req.user._id;
    }
  }

  const rows = await IncentivePayout.find(filter)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code position')
    .populate('plan_id', 'plan_name fiscal_year reference')
    .populate('journal_id', 'je_number je_date status')
    .populate('settlement_journal_id', 'je_number je_date status')
    .populate('reversal_journal_id', 'je_number je_date status')
    .populate('entity_id', 'entity_name short_name')
    .sort({ period: -1, tier_code: 1, createdAt: -1 })
    .lean();

  // Aggregate summary for the ledger header card
  const summary = rows.reduce((acc, r) => {
    acc.count += 1;
    acc[(r.status || 'ACCRUED').toLowerCase()] =
      (acc[(r.status || 'ACCRUED').toLowerCase()] || 0) + (Number(r.tier_budget) || 0);
    acc.total += Number(r.tier_budget) || 0;
    return acc;
  }, { count: 0, total: 0 });

  res.json({ success: true, data: rows, summary });
});

exports.getPayoutById = catchAsync(async (req, res) => {
  const row = await IncentivePayout.findById(req.params.id)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code position')
    .populate('plan_id', 'plan_name fiscal_year reference')
    .populate('journal_id', 'je_number je_date status lines')
    .populate('settlement_journal_id', 'je_number je_date status lines')
    .populate('reversal_journal_id', 'je_number je_date status')
    .lean();
  if (!row) return res.status(404).json({ success: false, message: 'Payout not found' });

  // Non-privileged BDMs can only read their own payouts
  if (!req.isPresident && !req.isAdmin && !req.isFinance) {
    if (String(row.bdm_id?._id || row.bdm_id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
  }

  res.json({ success: true, data: row });
});

// BDM-facing list for "My Payouts" tab on SalesGoalBdmView.
exports.myPayouts = catchAsync(async (req, res) => {
  const filter = { bdm_id: req.user._id };
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.period) filter.period = req.query.period;
  if (req.query.status) filter.status = req.query.status;
  const rows = await IncentivePayout.find(filter)
    .populate('plan_id', 'plan_name fiscal_year reference')
    .populate('journal_id', 'je_number je_date')
    .populate('settlement_journal_id', 'je_number je_date')
    .sort({ period: -1 })
    .lean();
  res.json({ success: true, data: rows });
});

// Payroll-integration endpoint: unpaid accruals waiting to be batched into payslips.
exports.getPayable = catchAsync(async (req, res) => {
  const period = req.query.period;
  const filter = { status: { $in: ['ACCRUED', 'APPROVED'] } };
  if (period) filter.period = period;
  if (req.isPresident) {
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
  }

  const rows = await IncentivePayout.find(filter)
    .populate('bdm_id', 'name email')
    .populate('person_id', 'full_name bdm_code')
    .populate('plan_id', 'plan_name fiscal_year reference')
    .sort({ period: -1, bdm_id: 1 })
    .lean();

  const totalPayable = rows.reduce((s, r) => s + (Number(r.tier_budget) || 0), 0);

  res.json({ success: true, data: rows, total_payable: totalPayable, count: rows.length });
});

// ─── LIFECYCLE ACTIONS ───────────────────────────────────────────────────

exports.approvePayout = catchAsync(async (req, res) => {
  const payout = await IncentivePayout.findById(req.params.id);
  if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });
  if (payout.status !== 'ACCRUED') {
    return res.status(400).json({ success: false, message: `Cannot approve payout in status ${payout.status}` });
  }

  const gated = await gateApproval({
    entityId: payout.entity_id,
    module: 'INCENTIVE_PAYOUT',
    docType: 'PAYOUT_APPROVE',
    docId: payout._id,
    docRef: payout.journal_number || String(payout._id),
    amount: payout.tier_budget || 0,
    description: `Approve incentive payout — ${payout.tier_label || payout.tier_code} — ${payout.period}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const previousStatus = payout.status;
  payout.status = 'APPROVED';
  payout.approved_by = req.user._id;
  payout.approved_at = new Date();
  if (req.body?.notes) payout.notes = req.body.notes;
  await payout.save();

  await ErpAuditLog.logChange({
    entity_id: payout.entity_id,
    bdm_id: payout.bdm_id || null,
    log_type: 'STATUS_CHANGE',
    target_ref: payout._id.toString(),
    target_model: 'IncentivePayout',
    field_changed: 'status',
    old_value: previousStatus,
    new_value: 'APPROVED',
    changed_by: req.user._id,
    note: `Approved incentive payout ${payout.tier_label || payout.tier_code} for ${payout.period} — ₱${(payout.tier_budget || 0).toLocaleString()}`,
  });

  res.json({ success: true, data: payout, message: 'Payout approved' });
});

exports.payPayout = catchAsync(async (req, res) => {
  const payout = await IncentivePayout.findById(req.params.id);
  if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });
  if (!['ACCRUED', 'APPROVED'].includes(payout.status)) {
    return res.status(400).json({ success: false, message: `Cannot pay payout in status ${payout.status}` });
  }

  // periodLockCheck middleware runs on the current settlement period (derived
  // from req.body.period or now). Explicit safety check in case the middleware
  // can't resolve a period from the request body.
  try {
    await checkPeriodOpen(payout.entity_id, currentPeriodString());
  } catch (err) {
    if (err.code === 'PERIOD_LOCKED') {
      return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }

  const gated = await gateApproval({
    entityId: payout.entity_id,
    module: 'INCENTIVE_PAYOUT',
    docType: 'PAYOUT_PAY',
    docId: payout._id,
    docRef: payout.journal_number || String(payout._id),
    amount: payout.tier_budget || 0,
    description: `Pay incentive payout — ${payout.tier_label || payout.tier_code} — ${payout.period}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Resolve paid_via: accept either PaymentMode _id or code
  const { paid_via, paid_via_id, notes } = req.body || {};
  let paymentModeDoc = null;
  if (paid_via_id) {
    paymentModeDoc = await PaymentMode.findById(paid_via_id).lean();
  } else if (paid_via) {
    paymentModeDoc = await PaymentMode.findOne({ code: paid_via }).lean();
  }

  const person = payout.person_id
    ? await PeopleMaster.findById(payout.person_id).select('full_name bdm_code').lean()
    : null;
  const plan = await SalesGoalPlan.findById(payout.plan_id).select('reference plan_name').lean();
  const bdmLabel = person ? `${person.full_name}${person.bdm_code ? ` (${person.bdm_code})` : ''}` : 'BDM';

  // Post settlement JE — wrapped try/catch so we don't flip status unless the JE lands.
  let settlementJe;
  try {
    settlementJe = await postSettlementJournal(payout, plan?.reference, bdmLabel, req.user._id, paymentModeDoc);
  } catch (err) {
    return res.status(400).json({ success: false, message: `Settlement journal failed: ${err.message}` });
  }

  const previousStatus = payout.status;
  payout.status = 'PAID';
  payout.paid_by = req.user._id;
  payout.paid_at = new Date();
  payout.paid_via = paymentModeDoc?.code || paid_via || '';
  payout.settlement_journal_id = settlementJe._id;
  if (notes) payout.notes = notes;
  await payout.save();

  await ErpAuditLog.logChange({
    entity_id: payout.entity_id,
    bdm_id: payout.bdm_id || null,
    log_type: 'STATUS_CHANGE',
    target_ref: payout._id.toString(),
    target_model: 'IncentivePayout',
    field_changed: 'status',
    old_value: previousStatus,
    new_value: 'PAID',
    changed_by: req.user._id,
    note: `Paid incentive payout ${payout.tier_label || payout.tier_code} for ${payout.period} — ₱${(payout.tier_budget || 0).toLocaleString()} via ${payout.paid_via || 'cash'} — JE ${settlementJe.je_number}`,
  });

  res.json({ success: true, data: payout, message: 'Payout paid — settlement journal posted' });
});

exports.reversePayout = catchAsync(async (req, res) => {
  const payout = await IncentivePayout.findById(req.params.id);
  if (!payout) return res.status(404).json({ success: false, message: 'Payout not found' });
  if (payout.status === 'REVERSED') {
    return res.status(400).json({ success: false, message: 'Payout already reversed' });
  }
  if (!payout.journal_id) {
    return res.status(400).json({ success: false, message: 'Cannot reverse — no accrual journal linked to this payout' });
  }

  const reason = (req.body?.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ success: false, message: 'Reversal reason is required' });
  }

  // periodLockCheck on current period (reversal posts to now)
  try {
    await checkPeriodOpen(payout.entity_id, currentPeriodString());
  } catch (err) {
    if (err.code === 'PERIOD_LOCKED') {
      return res.status(err.status || 400).json({ success: false, message: err.message, code: err.code });
    }
    throw err;
  }

  const gated = await gateApproval({
    entityId: payout.entity_id,
    module: 'INCENTIVE_PAYOUT',
    docType: 'PAYOUT_REVERSE',
    docId: payout._id,
    docRef: payout.journal_number || String(payout._id),
    amount: payout.tier_budget || 0,
    description: `Reverse incentive payout — ${payout.tier_label || payout.tier_code} — ${payout.period} — ${reason}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  let reversalJe;
  try {
    reversalJe = await reverseAccrualJournal(payout.journal_id, reason, req.user._id, payout.entity_id);
  } catch (err) {
    return res.status(400).json({ success: false, message: `Reversal journal failed: ${err.message}` });
  }

  const previousStatus = payout.status;
  payout.status = 'REVERSED';
  payout.reversed_by = req.user._id;
  payout.reversed_at = new Date();
  payout.reversal_reason = reason;
  payout.reversal_journal_id = reversalJe._id;
  await payout.save();

  await ErpAuditLog.logChange({
    entity_id: payout.entity_id,
    bdm_id: payout.bdm_id || null,
    log_type: 'PRESIDENT_REVERSAL',
    target_ref: payout._id.toString(),
    target_model: 'IncentivePayout',
    field_changed: 'status',
    old_value: previousStatus,
    new_value: 'REVERSED',
    changed_by: req.user._id,
    note: `Reversed incentive payout ${payout.tier_label || payout.tier_code} for ${payout.period} — ₱${(payout.tier_budget || 0).toLocaleString()} — reason: ${reason} — reversal JE ${reversalJe.je_number}`,
  });

  res.json({ success: true, data: payout, message: 'Payout reversed — storno journal posted' });
});

// ─── COMPENSATION STATEMENT (Phase SG-Q2 Week 3) ────────────────────────
//
// "My Compensation" view + printable PDF. Composes a {earned, accrued,
// adjusted, paid} breakdown across all of a BDM's IncentivePayout rows for
// the chosen fiscal year, plus per-period rollups, current/projected tier,
// and the underlying ledger rows. BDMs see only their own; finance/admin/
// president can pass ?bdm_id= to view any BDM in scope.
//
// `period` is optional: when present, statement is scoped to that single
// period (YYYY-MM or fiscal year). When absent, full FY view is returned.
//
// Definitions (see CLAUDE-ERP.md Phase SG-Q2 W3):
//   earned   = SUM(tier_budget) for status ∈ {ACCRUED, APPROVED, PAID}
//              — total compensation BDM has been credited with this FY.
//   accrued  = SUM(tier_budget) for status = ACCRUED
//              — credited but not yet authority-approved.
//   adjusted = SUM(uncapped_budget - tier_budget) for cap-reduced rows
//              + SUM(tier_budget) for status = REVERSED
//              — visibility for cap clamps + post-hoc reversals.
//   paid     = SUM(tier_budget) for status = PAID
//              — settled with a settlement JE.

function _resolveStatementScope(req) {
  // Returns { bdmId, isAdminView, error? } — null bdmId means caller is privileged
  // and asked to see "all". For the statement endpoint we require an explicit
  // bdm_id (statement is per-BDM by definition); privileged users pass it.
  const isPrivileged = req.isPresident || req.isAdmin || req.isFinance;
  const requested = req.query.bdm_id || req.params.bdm_id;
  if (!isPrivileged) {
    if (requested && String(requested) !== String(req.user._id)) {
      return { bdmId: null, isAdminView: false, error: { status: 403, message: 'Forbidden — non-privileged users can only view their own statement' } };
    }
    return { bdmId: req.user._id, isAdminView: false };
  }
  // Privileged: explicit bdm_id required so we know whose statement to render.
  if (!requested) {
    return { bdmId: null, isAdminView: false, error: { status: 400, message: 'bdm_id is required (privileged callers must pass ?bdm_id=)' } };
  }
  return { bdmId: requested, isAdminView: true };
}

async function _composeStatement({ bdmId, fiscalYear, period, entityScope }) {
  // Build the IncentivePayout filter. fiscal_year is required so we always
  // bound the rollup; period further narrows when present (YYYY-MM or year).
  const filter = { bdm_id: bdmId, fiscal_year: fiscalYear };
  if (period) filter.period = period;
  if (entityScope) filter.entity_id = entityScope;

  const rows = await IncentivePayout.find(filter)
    .populate('plan_id', 'plan_name fiscal_year reference')
    .populate('journal_id', 'je_number je_date')
    .populate('settlement_journal_id', 'je_number je_date')
    .populate('reversal_journal_id', 'je_number je_date')
    .populate('approved_by', 'name email')
    .populate('paid_by', 'name email')
    .sort({ period: 1, createdAt: 1 })
    .lean();

  // Roll-up totals
  const summary = { earned: 0, accrued: 0, adjusted: 0, paid: 0, count: rows.length, reversed: 0, approved: 0 };
  const byPeriod = new Map();

  for (const r of rows) {
    const amt = Number(r.tier_budget) || 0;
    const uncapped = Number(r.uncapped_budget) || amt;
    const capDelta = Math.max(uncapped - amt, 0);

    const key = r.period || 'unknown';
    if (!byPeriod.has(key)) {
      byPeriod.set(key, {
        period: key, period_type: r.period_type,
        earned: 0, accrued: 0, approved: 0, paid: 0, adjusted: 0, reversed: 0, count: 0,
      });
    }
    const bucket = byPeriod.get(key);
    bucket.count += 1;

    if (['ACCRUED', 'APPROVED', 'PAID'].includes(r.status)) {
      summary.earned += amt;
      bucket.earned += amt;
    }
    if (r.status === 'ACCRUED') { summary.accrued += amt; bucket.accrued += amt; }
    if (r.status === 'APPROVED') { summary.approved += amt; bucket.approved += amt; }
    if (r.status === 'PAID') { summary.paid += amt; bucket.paid += amt; }
    if (r.status === 'REVERSED') { summary.reversed += amt; bucket.reversed += amt; summary.adjusted += amt; bucket.adjusted += amt; }
    summary.adjusted += capDelta;
    bucket.adjusted += capDelta;
  }

  // Round all totals to the nearest peso (PHP has no centavo display in our UI)
  const roundObj = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]));
  const periods = Array.from(byPeriod.values())
    .map(roundObj)
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));

  return { rows, summary: roundObj(summary), periods };
}

async function _resolveTierContext(entityId, planId, bdmId, fiscalYear) {
  // Pull the latest YTD KpiSnapshot for the BDM under the plan to surface
  // current tier + projected tier in the statement header. This is the same
  // data the dashboard ring shows; we just embed it in the statement.
  if (!planId) return null;
  const ytdSnap = await KpiSnapshot.findOne({
    plan_id: planId, bdm_id: bdmId, period: String(fiscalYear), period_type: 'YTD',
  }).sort({ computed_at: -1 }).lean();
  if (!ytdSnap) return null;

  const inc = (ytdSnap.incentive_status || [])[0] || {};
  return {
    sales_attainment_pct: Number(ytdSnap.sales_attainment_pct) || 0,
    sales_target: Number(ytdSnap.sales_target) || 0,
    sales_actual: Number(ytdSnap.sales_actual) || 0,
    current_tier_code: inc.tier_code || '',
    current_tier_label: inc.tier_label || '',
    current_tier_budget: Number(inc.tier_budget) || 0,
    projected_tier_code: inc.projected_tier_code || '',
    projected_tier_label: inc.projected_tier_label || '',
    projected_tier_budget: Number(inc.projected_tier_budget) || 0,
    qualifying_amount: Number(inc.qualifying_amount) || 0,
    actual_amount: Number(inc.actual_amount) || 0,
  };
}

exports.getCompensationStatement = catchAsync(async (req, res) => {
  const scope = _resolveStatementScope(req);
  if (scope.error) return res.status(scope.error.status).json({ success: false, message: scope.error.message });
  const bdmId = scope.bdmId;

  const fiscalYear = Number(req.query.fiscal_year) || new Date().getFullYear();
  const period = req.query.period ? String(req.query.period).trim() : null;

  // Entity scoping: privileged users with no explicit ?entity_id= see across
  // entities (consistent with listPayouts behavior); BDMs are scoped to their
  // working entity (req.entityId).
  let entityScope = null;
  if (req.isPresident) {
    if (req.query.entity_id) entityScope = req.query.entity_id;
  } else {
    entityScope = req.entityId;
  }

  // BDM identity for the header (full name + bdm_code)
  const userDoc = await User.findById(bdmId).select('name email').lean();
  const personDoc = await PeopleMaster.findOne({ user_id: bdmId, is_active: true }).select('full_name bdm_code position territory_id').lean();
  const bdmHeader = {
    bdm_id: bdmId,
    name: personDoc?.full_name || userDoc?.name || userDoc?.email || 'BDM',
    bdm_code: personDoc?.bdm_code || '',
    position: personDoc?.position || '',
    email: userDoc?.email || '',
  };

  // Resolve the active plan for this fiscal year + entity (best match)
  const planFilter = { fiscal_year: fiscalYear };
  if (entityScope) planFilter.entity_id = entityScope;
  // Prefer ACTIVE plan; fall back to most-recent of any status so closed years still print
  const plan = await SalesGoalPlan.findOne({ ...planFilter, status: 'ACTIVE' }).lean()
    || await SalesGoalPlan.findOne(planFilter).sort({ createdAt: -1 }).lean();

  const planHeader = plan ? {
    plan_id: plan._id,
    reference: plan.reference || '',
    plan_name: plan.plan_name || '',
    fiscal_year: plan.fiscal_year,
    status: plan.status,
    target_revenue: Number(plan.target_revenue) || 0,
  } : null;

  // Statement body
  const { rows, summary, periods } = await _composeStatement({
    bdmId, fiscalYear, period, entityScope,
  });

  // Tier context (current/projected) — uses the plan we resolved above
  const tier = plan ? await _resolveTierContext(plan.entity_id, plan._id, bdmId, fiscalYear) : null;

  // Entity branding (for print header)
  const entity = (entityScope || plan?.entity_id)
    ? await Entity.findById(entityScope || plan?.entity_id).select('entity_name short_name').lean()
    : null;

  res.json({
    success: true,
    data: {
      bdm: bdmHeader,
      plan: planHeader,
      entity: entity ? { _id: entity._id, name: entity.entity_name, short_name: entity.short_name } : null,
      fiscal_year: fiscalYear,
      period,
      summary,
      periods,
      tier,
      rows,
      generated_at: new Date(),
    },
  });
});

// Printable HTML statement — same data shape as getCompensationStatement,
// rendered through templates/compensationStatement.js. Browser-print or
// "Save as PDF" produces the PDF (matches existing printController pattern
// for sales receipts / petty cash forms — no extra PDF library needed).
exports.printCompensationStatement = catchAsync(async (req, res) => {
  // Re-use the same scope/composition logic
  const scope = _resolveStatementScope(req);
  if (scope.error) return res.status(scope.error.status).send(`<h1>${scope.error.message}</h1>`);
  const bdmId = scope.bdmId;

  const fiscalYear = Number(req.query.fiscal_year) || new Date().getFullYear();
  const period = req.query.period ? String(req.query.period).trim() : null;

  let entityScope = null;
  if (req.isPresident) {
    if (req.query.entity_id) entityScope = req.query.entity_id;
  } else {
    entityScope = req.entityId;
  }

  const userDoc = await User.findById(bdmId).select('name email').lean();
  const personDoc = await PeopleMaster.findOne({ user_id: bdmId, is_active: true }).select('full_name bdm_code position').lean();
  const bdmHeader = {
    bdm_id: bdmId,
    name: personDoc?.full_name || userDoc?.name || userDoc?.email || 'BDM',
    bdm_code: personDoc?.bdm_code || '',
    position: personDoc?.position || '',
    email: userDoc?.email || '',
  };

  const planFilter = { fiscal_year: fiscalYear };
  if (entityScope) planFilter.entity_id = entityScope;
  const plan = await SalesGoalPlan.findOne({ ...planFilter, status: 'ACTIVE' }).lean()
    || await SalesGoalPlan.findOne(planFilter).sort({ createdAt: -1 }).lean();

  const { rows, summary, periods } = await _composeStatement({
    bdmId, fiscalYear, period, entityScope,
  });
  const tier = plan ? await _resolveTierContext(plan.entity_id, plan._id, bdmId, fiscalYear) : null;
  const entity = (entityScope || plan?.entity_id)
    ? await Entity.findById(entityScope || plan?.entity_id).select('entity_name short_name').lean()
    : null;

  // Lookup-driven template metadata (subscriber-configurable header line,
  // disclaimer, signatory text) — falls back to safe defaults when missing.
  let templateOverrides = {};
  try {
    const tplRows = await Lookup.find({
      entity_id: plan?.entity_id || entityScope,
      category: 'COMP_STATEMENT_TEMPLATE',
      is_active: true,
    }).lean();
    for (const r of tplRows) {
      templateOverrides[r.code] = (r.metadata && r.metadata.value) || r.label || '';
    }
  } catch (err) {
    console.warn('[compensationStatement] template lookup unavailable:', err.message);
  }

  const html = renderCompensationStatement({
    bdm: bdmHeader,
    plan,
    entity,
    fiscalYear,
    period,
    summary,
    periods,
    tier,
    rows,
    template: templateOverrides,
    generatedAt: new Date(),
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

