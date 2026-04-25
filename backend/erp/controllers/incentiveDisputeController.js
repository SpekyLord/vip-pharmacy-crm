/**
 * incentiveDisputeController — Phase SG-4 #24
 *
 * Implements the dispute lifecycle:
 *   OPEN → UNDER_REVIEW → RESOLVED_APPROVED → CLOSED
 *                       ↘ RESOLVED_DENIED   → CLOSED
 *
 * Authority gates (Rule #20 — gateApproval enforced on every transition):
 *   - file()           — open: any authenticated user can file. No gate
 *                        (filing is *requesting* review, not posting).
 *   - takeReview()     — OPEN → UNDER_REVIEW: gateApproval('INCENTIVE_DISPUTE',
 *                        'DISPUTE_TAKE_REVIEW'). Any reviewer in roles can take it.
 *   - resolve()        — UNDER_REVIEW → RESOLVED_*: gateApproval(... 'DISPUTE_RESOLVE').
 *                        APPROVED outcome optionally cascades a journal/credit reversal.
 *   - close()          — RESOLVED_* → CLOSED: gateApproval(... 'DISPUTE_CLOSE').
 *                        Closing finalizes; SLA agent stops walking the clock.
 *
 * Entity scope (Rule #21):
 *   - Reads default to req.entityId for non-presidents (no silent fallback).
 *   - Filer + affected BDM + assigned reviewer always get read access; non-
 *     privileged users see ONLY disputes where they meet one of those criteria.
 *
 * Notifications fired on every state change via erpNotificationService —
 * filer, affected BDM, current reviewer, and the entity's president chain.
 */

const mongoose = require('mongoose');
const IncentiveDispute = require('../models/IncentiveDispute');
const IncentivePayout = require('../models/IncentivePayout');
const SalesCredit = require('../models/SalesCredit');
const SalesLine = require('../models/SalesLine');
const SalesGoalPlan = require('../models/SalesGoalPlan');
const User = require('../../models/User');
const PeopleMaster = require('../models/PeopleMaster');
const Lookup = require('../models/Lookup');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const { gateApproval } = require('../services/approvalService');
const { reverseAccrualJournal } = require('../services/journalFromIncentive');

const TERMINAL_STATES = new Set(['RESOLVED_APPROVED', 'RESOLVED_DENIED', 'CLOSED']);

function periodFromDate(d) {
  const dt = d ? new Date(d) : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function _resolveArtifactContext(body) {
  // Hydrate denormalized period/fiscal_year from the linked artifact when
  // possible, so dashboards can group disputes without re-joining payouts.
  // Cross-entity check below (filer's entity_id vs each artifact.entity_id)
  // enforces the entity bind explicitly — these by-id lookups are intentionally
  // unscoped so that mismatches surface as a 403 rather than a confusing 404.
  let payout = null, credit = null, sale = null, plan = null;
  if (body.payout_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id validated post-fetch in fileDispute (L150-154)
    payout = await IncentivePayout.findById(body.payout_id).select('entity_id bdm_id period period_type fiscal_year plan_id tier_budget').lean();
  }
  if (body.sales_credit_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id validated post-fetch in fileDispute (L150-154)
    credit = await SalesCredit.findById(body.sales_credit_id).select('entity_id credit_bdm_id period fiscal_year sale_line_id credited_amount').lean();
  }
  if (body.sale_line_id || credit?.sale_line_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id validated post-fetch in fileDispute (L150-154)
    sale = await SalesLine.findById(body.sale_line_id || credit?.sale_line_id).select('entity_id bdm_id csi_date invoice_total').lean();
  }
  if (body.plan_id || payout?.plan_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- entity_id validated post-fetch in fileDispute (L150-154)
    plan = await SalesGoalPlan.findById(body.plan_id || payout?.plan_id).select('entity_id fiscal_year').lean();
  }

  const fiscal_year = payout?.fiscal_year || credit?.fiscal_year || plan?.fiscal_year
    || (sale?.csi_date ? new Date(sale.csi_date).getFullYear() : new Date().getFullYear());
  const period = payout?.period || credit?.period
    || (sale?.csi_date ? periodFromDate(sale.csi_date) : periodFromDate(new Date()));

  return { payout, credit, sale, plan, fiscal_year, period };
}

function _canRead(req, dispute) {
  if (req.isPresident || req.isAdmin || req.isFinance) return true;
  const uid = String(req.user._id);
  return [dispute.filed_by, dispute.affected_bdm_id, dispute.reviewer_id]
    .filter(Boolean).map(id => String(id)).includes(uid);
}

async function _logAndPushHistory(dispute, fromState, toState, userId, reason, extras = {}) {
  // Push immutable history row + write ErpAuditLog. Caller persists.
  const role = (await User.findById(userId).select('role').lean())?.role || '';
  dispute.history.push({
    from_state: fromState,
    to_state: toState,
    by: userId,
    by_role: role,
    at: new Date(),
    reason: reason || '',
    reversal_journal_id: extras.reversal_journal_id || null,
    reversal_credit_id: extras.reversal_credit_id || null,
  });
  dispute.current_state = toState;
  dispute.state_changed_at = new Date();
  await ErpAuditLog.logChange({
    entity_id: dispute.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: dispute._id.toString(),
    target_model: 'IncentiveDispute',
    field_changed: 'current_state',
    old_value: fromState || '',
    new_value: toState,
    changed_by: userId,
    note: `Dispute ${dispute._id} ${fromState || 'NEW'} → ${toState}${reason ? ` — ${reason}` : ''}`,
  });
}

// ─── CREATE / READ ─────────────────────────────────────────────────────

exports.fileDispute = catchAsync(async (req, res) => {
  const body = req.body || {};
  if (!body.dispute_type) return res.status(400).json({ success: false, message: 'dispute_type is required' });
  if (!body.reason?.trim()) return res.status(400).json({ success: false, message: 'reason is required' });

  // Resolve the artifact-type from the lookup row (subscriber-configurable).
  // Defaults to 'payout' when no row exists (graceful for fresh entities).
  let artifactType = 'payout';
  try {
    const tplRow = await Lookup.findOne({
      entity_id: req.entityId,
      category: 'INCENTIVE_DISPUTE_TYPE',
      code: String(body.dispute_type).toUpperCase(),
      is_active: true,
    }).lean();
    if (tplRow?.metadata?.artifact) artifactType = tplRow.metadata.artifact;
  } catch (lookupErr) {
    console.warn('[fileDispute] dispute_type lookup unavailable:', lookupErr.message);
  }

  // Resolve affected BDM. Filer files for themselves by default; admins/
  // finance/president can file on behalf of another BDM via body.affected_bdm_id.
  let affectedBdmId = body.affected_bdm_id || req.user._id;
  const isPrivileged = req.isPresident || req.isAdmin || req.isFinance;
  if (!isPrivileged && String(affectedBdmId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only privileged users can file on behalf of another BDM' });
  }

  // Hydrate context (period, fiscal_year, denormalized links)
  const ctx = await _resolveArtifactContext({
    payout_id: body.payout_id,
    sales_credit_id: body.sales_credit_id,
    sale_line_id: body.sale_line_id,
    plan_id: body.plan_id,
  });

  // Cross-check entity scope on linked artifacts (defense in depth — prevents
  // disputes filed across entities by manipulating ids in the body).
  for (const [name, art] of Object.entries({ payout: ctx.payout, credit: ctx.credit, sale: ctx.sale, plan: ctx.plan })) {
    if (art && String(art.entity_id) !== String(req.entityId)) {
      return res.status(403).json({ success: false, message: `Linked ${name} belongs to a different entity` });
    }
  }

  const filerName = req.user.name || (await User.findById(req.user._id).select('name').lean())?.name || '';

  const dispute = await IncentiveDispute.create({
    entity_id: req.entityId,
    filed_by: req.user._id,
    filed_by_name: filerName,
    affected_bdm_id: affectedBdmId,
    dispute_type: String(body.dispute_type).toUpperCase(),
    artifact_type: artifactType,
    payout_id: body.payout_id || null,
    sales_credit_id: body.sales_credit_id || null,
    sale_line_id: body.sale_line_id || ctx.credit?.sale_line_id || null,
    plan_id: body.plan_id || ctx.payout?.plan_id || null,
    fiscal_year: ctx.fiscal_year,
    period: ctx.period,
    claim_amount: Number(body.claim_amount) || 0,
    reason: body.reason.trim(),
    evidence_urls: Array.isArray(body.evidence_urls) ? body.evidence_urls.filter(Boolean) : [],
    current_state: 'OPEN',
    state_changed_at: new Date(),
    history: [{
      from_state: '',
      to_state: 'OPEN',
      by: req.user._id,
      by_role: req.user.role || '',
      at: new Date(),
      reason: 'Dispute filed',
    }],
    created_by: req.user._id,
  });

  await ErpAuditLog.logChange({
    entity_id: dispute.entity_id,
    log_type: 'STATUS_CHANGE',
    target_ref: dispute._id.toString(),
    target_model: 'IncentiveDispute',
    field_changed: 'current_state',
    old_value: '',
    new_value: 'OPEN',
    changed_by: req.user._id,
    note: `Filed dispute (${dispute.dispute_type}) for ${dispute.artifact_type} affecting BDM ${dispute.affected_bdm_id}`,
  });

  res.status(201).json({ success: true, data: dispute, message: 'Dispute filed — awaiting reviewer pickup' });
});

exports.listDisputes = catchAsync(async (req, res) => {
  const filter = {};
  if (req.isPresident) {
    if (req.query.entity_id) filter.entity_id = req.query.entity_id;
  } else {
    filter.entity_id = req.entityId;
  }
  if (req.query.current_state) filter.current_state = req.query.current_state;
  if (req.query.affected_bdm_id) filter.affected_bdm_id = req.query.affected_bdm_id;
  if (req.query.dispute_type) filter.dispute_type = req.query.dispute_type;
  if (req.query.fiscal_year) filter.fiscal_year = Number(req.query.fiscal_year);
  if (req.query.period) filter.period = req.query.period;

  // Non-privileged users see only their own — Rule #21: never silently
  // privilege-fall-back to a query that returns nothing for legitimate
  // privileged callers.
  if (!req.isPresident && !req.isAdmin && !req.isFinance) {
    filter.$or = [
      { filed_by: req.user._id },
      { affected_bdm_id: req.user._id },
      { reviewer_id: req.user._id },
    ];
  }

  const rows = await IncentiveDispute.find(filter)
    .populate('filed_by', 'name email')
    .populate('affected_bdm_id', 'name email')
    .populate('reviewer_id', 'name email')
    .populate('payout_id', 'tier_label tier_code period tier_budget')
    .populate('sales_credit_id', 'rule_name credit_pct credited_amount')
    .populate('sale_line_id', 'doc_ref invoice_number invoice_total')
    .sort({ state_changed_at: -1, createdAt: -1 })
    .lean();

  res.json({ success: true, data: rows });
});

exports.getDisputeById = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const dispute = await IncentiveDispute.findOne({ _id: req.params.id, ...entityScope })
    .populate('filed_by', 'name email')
    .populate('affected_bdm_id', 'name email')
    .populate('reviewer_id', 'name email')
    .populate('resolved_by', 'name email')
    .populate('payout_id', 'tier_label tier_code period tier_budget status journal_id settlement_journal_id reversal_journal_id')
    .populate('sales_credit_id', 'rule_name credit_pct credited_amount sale_line_id rule_id')
    .populate('sale_line_id', 'doc_ref invoice_number invoice_total csi_date')
    .populate('plan_id', 'plan_name fiscal_year reference version_no')
    .populate('history.by', 'name email')
    .lean();

  if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
  if (!_canRead(req, dispute)) return res.status(403).json({ success: false, message: 'Forbidden' });

  res.json({ success: true, data: dispute });
});

// ─── LIFECYCLE TRANSITIONS ─────────────────────────────────────────────

exports.takeReview = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const dispute = await IncentiveDispute.findOne({ _id: req.params.id, ...entityScope });
  if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
  if (dispute.current_state !== 'OPEN') {
    return res.status(400).json({ success: false, message: `Cannot take review on dispute in state ${dispute.current_state}` });
  }

  const gated = await gateApproval({
    entityId: dispute.entity_id,
    module: 'INCENTIVE_DISPUTE',
    docType: 'DISPUTE_TAKE_REVIEW',
    docId: dispute._id,
    docRef: `DSP-${String(dispute._id).slice(-6)}`,
    amount: Number(dispute.claim_amount) || 0,
    description: `Take review on dispute ${dispute._id} (${dispute.dispute_type})`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const reviewerName = req.user.name || (await User.findById(req.user._id).select('name').lean())?.name || '';
  dispute.reviewer_id = req.user._id;
  dispute.reviewer_name = reviewerName;
  await _logAndPushHistory(dispute, 'OPEN', 'UNDER_REVIEW', req.user._id, req.body?.notes || 'Review started');
  await dispute.save();

  res.json({ success: true, data: dispute, message: 'Dispute moved to UNDER_REVIEW' });
});

exports.resolveDispute = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const dispute = await IncentiveDispute.findOne({ _id: req.params.id, ...entityScope });
  if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
  if (dispute.current_state !== 'UNDER_REVIEW') {
    return res.status(400).json({ success: false, message: `Cannot resolve dispute in state ${dispute.current_state}` });
  }

  const outcome = String(req.body?.outcome || '').toUpperCase();
  if (!['APPROVED', 'DENIED'].includes(outcome)) {
    return res.status(400).json({ success: false, message: 'outcome must be APPROVED or DENIED' });
  }
  const summary = (req.body?.resolution_summary || '').trim();
  if (!summary) return res.status(400).json({ success: false, message: 'resolution_summary is required' });

  // Phase G4.3 — pass structured metadata so the Approval Hub handler can
  // apply the transition without needing the original req.body on the
  // approver's side (outcome + resolution_summary are required to reconstruct
  // resolveDispute's write path).
  const gated = await gateApproval({
    entityId: dispute.entity_id,
    module: 'INCENTIVE_DISPUTE',
    docType: 'DISPUTE_RESOLVE',
    docId: dispute._id,
    docRef: `DSP-${String(dispute._id).slice(-6)}`,
    amount: Number(dispute.claim_amount) || 0,
    description: `Resolve dispute ${dispute._id} → ${outcome}`,
    metadata: { outcome, resolution_summary: summary },
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const newState = outcome === 'APPROVED' ? 'RESOLVED_APPROVED' : 'RESOLVED_DENIED';
  let extras = {};

  // ── APPROVED + cascade reversal (best-effort; never blocks resolution) ──
  // Per Rule #20: never bypass gateApproval/periodLockCheck. We re-use the
  // existing reverseAccrualJournal helper, which itself respects period locks.
  if (outcome === 'APPROVED') {
    if (dispute.artifact_type === 'payout' && dispute.payout_id) {
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- dispute fetched with entityScope above; payout_id is unique
        const payout = await IncentivePayout.findById(dispute.payout_id);
        if (payout && payout.journal_id && payout.status !== 'REVERSED') {
          const reversalJe = await reverseAccrualJournal(
            payout.journal_id,
            `Dispute approved: ${summary}`,
            req.user._id,
            payout.entity_id,
          );
          payout.status = 'REVERSED';
          payout.reversed_by = req.user._id;
          payout.reversed_at = new Date();
          payout.reversal_reason = `Dispute ${dispute._id} approved`;
          payout.reversal_journal_id = reversalJe._id;
          await payout.save();
          extras.reversal_journal_id = reversalJe._id;
          dispute.reversal_journal_id = reversalJe._id;
        }
      } catch (err) {
        console.error('[resolveDispute] payout reversal cascade failed (non-blocking):', err.message);
        await ErpAuditLog.logChange({
          entity_id: dispute.entity_id,
          log_type: 'STATUS_CHANGE',
          target_ref: dispute._id.toString(),
          target_model: 'IncentiveDispute',
          field_changed: 'reversal_cascade',
          new_value: 'FAILED',
          changed_by: req.user._id,
          note: `APPROVED cascade reversal failed: ${err.message}`,
        });
      }
    } else if (dispute.artifact_type === 'credit' && dispute.sales_credit_id) {
      // Append a reversal SalesCredit row (negative credited_amount). Engine
      // re-runs would NOT touch this row (source='reversal' is preserved).
      try {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- dispute fetched with entityScope above; sales_credit_id is unique
        const original = await SalesCredit.findById(dispute.sales_credit_id).lean();
        if (original) {
          const reversal = await SalesCredit.create([{
            entity_id: original.entity_id,
            sale_line_id: original.sale_line_id,
            credit_bdm_id: original.credit_bdm_id,
            rule_id: original.rule_id || null,
            rule_name: original.rule_name,
            credit_pct: -Math.abs(original.credit_pct),
            credited_amount: -Math.abs(original.credited_amount),
            credit_reason: `Dispute ${dispute._id} approved — reversal of original credit. ${summary}`,
            invoice_total: original.invoice_total,
            csi_date: original.csi_date,
            fiscal_year: original.fiscal_year,
            period: original.period,
            source: 'reversal',
            created_at: new Date(),
            created_by: req.user._id,
          }]);
          dispute.reversal_credit_id = reversal[0]._id;
          extras.reversal_credit_id = reversal[0]._id;
        }
      } catch (err) {
        console.error('[resolveDispute] credit reversal append failed (non-blocking):', err.message);
      }
    }
  }

  dispute.resolution_summary = summary;
  dispute.resolved_by = req.user._id;
  dispute.resolved_at = new Date();
  await _logAndPushHistory(dispute, 'UNDER_REVIEW', newState, req.user._id, summary, extras);
  await dispute.save();

  // Phase SG-6 #32 — integration event (subscribers: finance, payroll, BDM notification).
  try {
    const { emit, INTEGRATION_EVENTS } = require('../services/integrationHooks');
    emit(INTEGRATION_EVENTS.DISPUTE_RESOLVED, {
      entity_id: dispute.entity_id,
      actor_id: req.user._id,
      ref: String(dispute._id),
      data: {
        state: newState,
        outcome,
        reference_model: dispute.reference_model,
        reference_id: dispute.reference_id ? String(dispute.reference_id) : null,
        claim_amount: dispute.claim_amount,
        summary,
      },
    });
  } catch (err) { console.warn('[resolveDispute] integrationHooks emit skipped:', err.message); }

  res.json({ success: true, data: dispute, message: `Dispute ${newState}` });
});

exports.closeDispute = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const dispute = await IncentiveDispute.findOne({ _id: req.params.id, ...entityScope });
  if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
  if (!['RESOLVED_APPROVED', 'RESOLVED_DENIED'].includes(dispute.current_state)) {
    return res.status(400).json({ success: false, message: `Cannot close dispute in state ${dispute.current_state}` });
  }

  const gated = await gateApproval({
    entityId: dispute.entity_id,
    module: 'INCENTIVE_DISPUTE',
    docType: 'DISPUTE_CLOSE',
    docId: dispute._id,
    docRef: `DSP-${String(dispute._id).slice(-6)}`,
    amount: Number(dispute.claim_amount) || 0,
    description: `Close dispute ${dispute._id}`,
    requesterId: req.user._id,
    requesterName: req.user.name || req.user.email,
  }, res);
  if (gated) return;

  const fromState = dispute.current_state;
  await _logAndPushHistory(dispute, fromState, 'CLOSED', req.user._id, req.body?.reason || 'Dispute closed');
  await dispute.save();

  res.json({ success: true, data: dispute, message: 'Dispute closed' });
});

// Convenience: filer-cancel for an OPEN dispute. No gate (filer is just
// withdrawing their own request). Does not produce a resolution row.
exports.cancelDispute = catchAsync(async (req, res) => {
  const entityScope = req.isPresident ? {} : { entity_id: req.entityId };
  const dispute = await IncentiveDispute.findOne({ _id: req.params.id, ...entityScope });
  if (!dispute) return res.status(404).json({ success: false, message: 'Dispute not found' });
  if (dispute.current_state !== 'OPEN') {
    return res.status(400).json({ success: false, message: 'Only OPEN disputes can be cancelled by the filer' });
  }
  const isPrivileged = req.isPresident || req.isAdmin || req.isFinance;
  if (!isPrivileged && String(dispute.filed_by) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the filer (or privileged users) can cancel' });
  }

  await _logAndPushHistory(dispute, 'OPEN', 'CLOSED', req.user._id, req.body?.reason || 'Cancelled by filer');
  await dispute.save();

  res.json({ success: true, data: dispute, message: 'Dispute cancelled and closed' });
});

module.exports.TERMINAL_STATES = TERMINAL_STATES;
