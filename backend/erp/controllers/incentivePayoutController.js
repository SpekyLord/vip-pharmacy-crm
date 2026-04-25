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
// Phase SG-Q2 W3 follow-up #3 — lookup-driven binary PDF (puppeteer optional).
const {
  resolvePdfPreference,
  htmlToPdf,
  PDF_UNAVAILABLE_ERR,
} = require('../services/pdfRenderer');

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
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const row = await IncentivePayout.findOne({ _id: req.params.id, ...entityScope })
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
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payout = await IncentivePayout.findOne({ _id: req.params.id, ...entityScope });
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

  // Phase SG-6 #32 — fire integration event (non-blocking).
  try {
    const { emit, INTEGRATION_EVENTS } = require('../services/integrationHooks');
    emit(INTEGRATION_EVENTS.PAYOUT_APPROVED, {
      entity_id: payout.entity_id,
      actor_id: req.user._id,
      ref: String(payout._id),
      data: {
        bdm_id: payout.bdm_id ? String(payout.bdm_id) : null,
        period: payout.period,
        tier_code: payout.tier_code,
        tier_budget: payout.tier_budget,
      },
    });
  } catch (err) { console.warn('[approvePayout] integrationHooks emit skipped:', err.message); }

  res.json({ success: true, data: payout, message: 'Payout approved' });
});

exports.payPayout = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payout = await IncentivePayout.findOne({ _id: req.params.id, ...entityScope });
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
    // eslint-disable-next-line vip-tenant/require-entity-filter -- person_id is unique; payout fetched with entityScope above
    ? await PeopleMaster.findById(payout.person_id).select('full_name bdm_code').lean()
    : null;
  // eslint-disable-next-line vip-tenant/require-entity-filter -- plan_id is unique; payout fetched with entityScope above
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

  // Phase SG-6 #32 — fire integration event (payroll/accounting subscribers).
  try {
    const { emit, INTEGRATION_EVENTS } = require('../services/integrationHooks');
    emit(INTEGRATION_EVENTS.PAYOUT_PAID, {
      entity_id: payout.entity_id,
      actor_id: req.user._id,
      ref: String(payout._id),
      data: {
        bdm_id: payout.bdm_id ? String(payout.bdm_id) : null,
        period: payout.period,
        tier_code: payout.tier_code,
        tier_budget: payout.tier_budget,
        paid_via: payout.paid_via,
        settlement_je: settlementJe.je_number,
      },
    });
  } catch (err) { console.warn('[payPayout] integrationHooks emit skipped:', err.message); }

  res.json({ success: true, data: payout, message: 'Payout paid — settlement journal posted' });
});

exports.reversePayout = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const payout = await IncentivePayout.findOne({ _id: req.params.id, ...entityScope });
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

  // Phase SG-6 #32 — fire integration event.
  try {
    const { emit, INTEGRATION_EVENTS } = require('../services/integrationHooks');
    emit(INTEGRATION_EVENTS.PAYOUT_REVERSED, {
      entity_id: payout.entity_id,
      actor_id: req.user._id,
      ref: String(payout._id),
      data: {
        bdm_id: payout.bdm_id ? String(payout.bdm_id) : null,
        period: payout.period,
        tier_code: payout.tier_code,
        tier_budget: payout.tier_budget,
        reason,
        reversal_je: reversalJe.je_number,
      },
    });
  } catch (err) { console.warn('[reversePayout] integrationHooks emit skipped:', err.message); }

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
  // entityId may be null when caller is president without entity context — fall through unscoped.
  const entityFilter = entityId ? { entity_id: entityId } : {};
  const ytdSnap = await KpiSnapshot.findOne({
    ...entityFilter,
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
  const personEntityScope = entityScope ? { entity_id: entityScope } : {};
  const personDoc = await PeopleMaster.findOne({ ...personEntityScope, user_id: bdmId, is_active: true }).select('full_name bdm_code position territory_id').lean();
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
  const personEntityScope = entityScope ? { entity_id: entityScope } : {};
  const personDoc = await PeopleMaster.findOne({ ...personEntityScope, user_id: bdmId, is_active: true }).select('full_name bdm_code position').lean();
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

  // Phase SG-Q2 W3 follow-up #3 — Binary PDF rendering.
  // Precedence: ?format=pdf query > PDF_RENDERER.BINARY_ENABLED lookup > html.
  // Graceful fallback: if puppeteer is not installed, emit the HTML (unchanged
  // behavior) plus an X-PDF-Fallback header so the UI can warn the admin.
  const pdfEntityScope = plan?.entity_id || entityScope;
  const preference = await resolvePdfPreference(pdfEntityScope, req.query.format);

  if (preference === 'pdf') {
    try {
      const buffer = await htmlToPdf(html);
      const safeName = (bdmHeader.name || 'bdm').replace(/[^a-z0-9\-_]+/gi, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="compensation-${safeName}-FY${fiscalYear}.pdf"`
      );
      return res.send(buffer);
    } catch (err) {
      if (err?.code === PDF_UNAVAILABLE_ERR) {
        // Puppeteer not installed — transparent fallback to HTML with a
        // signal so the client (or admin) sees what happened.
        console.warn('[compensationStatement] PDF requested but renderer unavailable; returning HTML');
        res.setHeader('X-PDF-Fallback', 'html');
        res.setHeader('X-PDF-Fallback-Reason', 'puppeteer_not_installed');
      } else {
        // Real PDF engine error — log, surface, fall back so the user still
        // sees their statement.
        console.error('[compensationStatement] PDF render failed:', err.message);
        res.setHeader('X-PDF-Fallback', 'html');
        res.setHeader('X-PDF-Fallback-Reason', 'render_error');
      }
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ─── BDM Statement Archive (Phase SG-4 #23 ext) ─────────────────────────
//
// Lightweight rollup of every prior period for which the BDM had IncentivePayout
// activity. Used by the "My Compensation → Past Statements" tab. Returns a
// tabular summary; clicking a row deep-links to the existing `/statement` and
// `/statement/print` endpoints which already do the heavy rendering.
//
// Authority follows the same rules as listPayouts:
//   - BDMs see only their own (Rule #21 — no privileged self-id fallback).
//   - admin/finance/president can pass ?bdm_id= to view any BDM in scope.
exports.getStatementArchive = catchAsync(async (req, res) => {
  const scope = _resolveStatementScope(req);
  if (scope.error) return res.status(scope.error.status).json({ success: false, message: scope.error.message });
  const bdmId = scope.bdmId;

  const filter = { bdm_id: bdmId };
  if (req.query.entity_id && req.isPresident) filter.entity_id = req.query.entity_id;
  else if (!req.isPresident) filter.entity_id = req.entityId;

  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.from_year || req.query.to_year) {
    filter.fiscal_year = filter.fiscal_year || {};
    if (typeof filter.fiscal_year !== 'object') filter.fiscal_year = { $eq: filter.fiscal_year };
    if (req.query.from_year) filter.fiscal_year.$gte = Number(req.query.from_year);
    if (req.query.to_year) filter.fiscal_year.$lte = Number(req.query.to_year);
  }

  // Group by (fiscal_year, period) and aggregate totals + last activity.
  // eslint-disable-next-line vip-tenant/require-entity-filter -- $match: filter where filter is built above with entity_id (L725-726); rule can't see through Identifier
  const archive = await IncentivePayout.aggregate([
    { $match: filter },
    {
      $group: {
        _id: { fiscal_year: '$fiscal_year', period: '$period', period_type: '$period_type' },
        count: { $sum: 1 },
        earned: {
          $sum: {
            $cond: [
              { $in: ['$status', ['ACCRUED', 'APPROVED', 'PAID']] },
              { $ifNull: ['$tier_budget', 0] },
              0,
            ],
          },
        },
        accrued: { $sum: { $cond: [{ $eq: ['$status', 'ACCRUED'] }, { $ifNull: ['$tier_budget', 0] }, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, { $ifNull: ['$tier_budget', 0] }, 0] } },
        paid: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, { $ifNull: ['$tier_budget', 0] }, 0] } },
        reversed: { $sum: { $cond: [{ $eq: ['$status', 'REVERSED'] }, { $ifNull: ['$tier_budget', 0] }, 0] } },
        last_activity: { $max: '$updatedAt' },
      },
    },
    {
      $project: {
        _id: 0,
        fiscal_year: '$_id.fiscal_year',
        period: '$_id.period',
        period_type: '$_id.period_type',
        count: 1,
        earned: { $round: ['$earned', 0] },
        accrued: { $round: ['$accrued', 0] },
        approved: { $round: ['$approved', 0] },
        paid: { $round: ['$paid', 0] },
        reversed: { $round: ['$reversed', 0] },
        last_activity: 1,
      },
    },
    { $sort: { fiscal_year: -1, period: -1 } },
  ]);

  res.json({
    success: true,
    data: archive,
    meta: {
      bdm_id: bdmId,
      total_periods: archive.length,
      lifetime_earned: Math.round(archive.reduce((s, r) => s + (r.earned || 0), 0)),
      lifetime_paid: Math.round(archive.reduce((s, r) => s + (r.paid || 0), 0)),
    },
  });
});

// POST /incentive-payouts/statements/dispatch — Phase SG-4 #23 ext.
// Email the compensation statement to every BDM with payout activity in the
// given period. Idempotent at the email layer (the email backend dedupes
// against EmailLog history; re-running won't double-send within the same
// period+template combo).
//
// Gated by gateApproval('INCENTIVE_PAYOUT', 'STATEMENT_DISPATCH') so only
// authority can mass-mail. Body: { period: 'YYYY-MM' | 'YYYY', entity_id? }.
//
// Designed to be called manually from Control Center "Send Statements" or
// chained from the month-end close finalize step (a future PR — out of SG-4
// scope to keep this commit reviewable).
exports.dispatchStatementsForPeriod = catchAsync(async (req, res) => {
  const period = String(req.body?.period || '').trim();
  if (!period) return res.status(400).json({ success: false, message: 'period is required (YYYY-MM or YYYY)' });

  // Scope: president can target any entity via body.entity_id; everyone else
  // is locked to req.entityId.
  let entityScope = req.entityId;
  if (req.isPresident && req.body?.entity_id) entityScope = req.body.entity_id;
  if (!entityScope) return res.status(400).json({ success: false, message: 'entity_id missing — pass in body when president' });

  const gated = await gateApproval({
    entityId: entityScope,
    module: 'INCENTIVE_PAYOUT',
    docType: 'STATEMENT_DISPATCH',
    docId: req.user._id,
    docRef: `STMT-${period}`,
    description: `Dispatch compensation statements for ${period}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  // Find every distinct BDM with payout activity in the requested period.
  const distinctBdms = await IncentivePayout.distinct('bdm_id', { entity_id: entityScope, period });
  if (distinctBdms.length === 0) {
    return res.json({ success: true, message: `No BDMs with payout activity for ${period}`, dispatched: 0 });
  }

  const fiscalYear = period.includes('-') ? Number(period.split('-')[0]) : Number(period);
  const { notifyCompensationStatement } = require('../services/erpNotificationService');

  let dispatched = 0;
  const failures = [];
  for (const bdmId of distinctBdms) {
    if (!bdmId) continue;
    try {
      // Compose totals once per BDM (re-uses the same aggregation as the
      // single-statement endpoint to keep numbers in lockstep).
      const { summary } = await _composeStatement({
        bdmId, fiscalYear, period, entityScope,
      });
      const personDoc = await PeopleMaster.findOne({ entity_id: entityScope, user_id: bdmId, is_active: true })
        .select('full_name bdm_code').lean();
      const userDoc = await User.findById(bdmId).select('name email').lean();
      const bdmName = personDoc?.full_name || userDoc?.name || 'BDM';

      await notifyCompensationStatement({
        entityId: entityScope,
        bdmId,
        bdmName,
        fiscalYear,
        period,
        totals: { earned: summary.earned, paid: summary.paid, accrued: summary.accrued },
      });
      dispatched++;
    } catch (e) {
      failures.push({ bdm_id: bdmId, error: e.message });
    }
  }

  await ErpAuditLog.logChange({
    entity_id: entityScope,
    log_type: 'STATUS_CHANGE',
    target_ref: `STMT-${period}`,
    target_model: 'IncentivePayout',
    field_changed: 'statement_dispatch',
    new_value: `${dispatched}/${distinctBdms.length}`,
    changed_by: req.user._id,
    note: `Dispatched comp statements for ${period} — ${dispatched} sent, ${failures.length} failed`,
  });

  res.json({
    success: true,
    message: `Dispatched ${dispatched} of ${distinctBdms.length} statements`,
    dispatched,
    failed: failures.length,
    failures,
  });
});

