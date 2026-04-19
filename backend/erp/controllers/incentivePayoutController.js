const mongoose = require('mongoose');
const IncentivePayout = require('../models/IncentivePayout');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const PeopleMaster = require('../models/PeopleMaster');
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
