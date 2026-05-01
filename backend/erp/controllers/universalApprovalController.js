/**
 * Universal Approval Controller — Approval Hub endpoints
 *
 * GET  /universal-pending — all pending items across all modules
 * POST /universal-approve — approve/reject any item from the hub (routes to module's own logic)
 * PATCH /universal-edit   — quick-edit whitelisted fields before approving (Phase G3)
 *
 * ── Entity-scope posture (Day-5 ESLint triage, Apr 2026) ──────────────────
 * Each module handler does `Model.findById(id)` where `id` comes from
 * req.body. The entity-scope contract today is: the Hub LIST endpoint
 * (`getUniversalPending`) IS entity-scoped via req.entityId, and approvers
 * are gated by `erpAccessCheck('approvals')` + per-module `hasApprovalSub`.
 * The handlers themselves trust that the supplied `id` matches an item
 * displayed in the gated list.
 *
 * GAP: a malicious approver could craft a request body with an arbitrary
 * doc id from a sibling entity, bypassing the UI list. Closing that gap
 * requires a pre-flight target-model dispatch + entity-scope guard before
 * the handler runs, which is a behavior change with its own test surface.
 * Tracked as a Phase G6.x follow-up; the 24 inline disables below
 * document the stance instead of silently inheriting it.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { catchAsync } = require('../../middleware/errorHandler');
const { getUniversalPending, MODULE_TO_SUB_KEY, hasApprovalSub } = require('../services/universalApprovalService');
const Lookup = require('../models/Lookup');

// Phase 34 — Map approval handler type keys to module keys for sub-permission checks
// Phase G6.7 — extended to cover Group B modules (gap modules routed via ApprovalRequest).
// Group B `type` strings MUST match `actionType` values in universalApprovalService.js.
const TYPE_TO_MODULE = {
  sales_line: 'SALES',
  collection: 'COLLECTION',
  grn: 'INVENTORY',
  smer_entry: 'SMER',
  car_logbook: 'CAR_LOGBOOK',
  // Phase 31R follow-up — Credit Note approval-hub routing
  credit_note: 'CREDIT_NOTE',
  expense_entry: 'EXPENSES',
  prf_calf: 'PRF_CALF',
  payslip: 'PAYROLL',
  // Phase G4.5cc (Apr 29, 2026) — clerk-submitted payroll run. The MODULE_AUTO_POST
  // hook below dispatches to this `type` so admin's single Hub approval cascades
  // every matching payslip COMPUTED→REVIEWED→APPROVED→POSTED + emits a payroll JE.
  payroll_run: 'PAYROLL',
  kpi_rating: 'KPI',
  income_report: 'INCOME',
  deduction_schedule: 'DEDUCTION_SCHEDULE',
  perdiem_override: 'PERDIEM_OVERRIDE',
  approval_request: 'APPROVAL_REQUEST',
  // Phase G6.7 — Group B (gap modules, id = ApprovalRequest._id, dereferenced via doc_id)
  purchasing: 'PURCHASING',
  journal: 'JOURNAL',
  banking: 'BANKING',
  ic_transfer: 'IC_TRANSFER',
  petty_cash: 'PETTY_CASH',
  sales_goal_plan: 'SALES_GOAL_PLAN',
  incentive_payout: 'INCENTIVE_PAYOUT',
  // Phase 32 — Undertaking (GRN receipt confirmation). Acknowledge auto-approves
  // the linked GRN via postSingleUndertaking (rule #20).
  undertaking: 'UNDERTAKING',
  // Phase G4.3 — Incentive Dispute (SG-4). docType drives which transition the
  // handler applies (DISPUTE_TAKE_REVIEW | DISPUTE_RESOLVE | DISPUTE_CLOSE).
  incentive_dispute: 'INCENTIVE_DISPUTE',
};

// Phase G4.1 follow-up (April 2026) — Auto-post on orphan approval path.
//
// When an ApprovalRequest has no module sibling in the Hub (the raw module
// query missed the underlying doc), approving via type='approval_request'
// previously only flipped the request to APPROVED and left the source doc
// stuck in VALID. The BDM had to re-submit to close the loop.
//
// This map lets the `approval_request` handler re-enter the module's own
// handler on final approval so the doc moves VALID → POSTED in the same
// round-trip. Scope is limited to Group A handlers that own a `postSingleXxx`
// helper with its own VALID-status guard — safe to invoke idempotently.
//
// Intentionally excluded:
//   - Group B (PURCHASING, JOURNAL, BANKING, IC_TRANSFER, PETTY_CASH,
//     SALES_GOAL_PLAN, INCENTIVE_PAYOUT) — approve path is consumed by each
//     module's controller on next call via isFullyApproved(); no uniform
//     post hook exists in this handler yet.
//   - Multi-step state machines (payslip, kpi_rating, income_report) —
//     review/approve/credit semantics require explicit human acknowledgement
//     between steps.
//   - GRN / deduction_schedule / undertaking — the request IS the approval
//     target (no separate underlying doc to post).
const MODULE_AUTO_POST = {
  SMER:        { type: 'smer_entry',    action: 'post' },
  EXPENSES:    { type: 'expense_entry', action: 'post' },
  PRF_CALF:    { type: 'prf_calf',      action: 'post' },
  SALES:       { type: 'sales_line',    action: 'post' },
  // OPENING_AR shares the SalesLine model + postSaleRow handler with SALES
  // (postSaleRow detects source==='OPENING_AR' and skips inventory + COGS).
  // Without this entry, proxied or contractor-submitted Opening AR rows
  // would stay in VALID after hub approval and require manual re-submit.
  // Added Phase G4.5a (Apr 22 2026) alongside proxy entry.
  OPENING_AR:  { type: 'sales_line',    action: 'post' },
  COLLECTION:  { type: 'collection',    action: 'post' },
  CAR_LOGBOOK: { type: 'car_logbook',   action: 'post' },
  CREDIT_NOTE: { type: 'credit_note',   action: 'post' },
  // Per-fuel-entry gate is held under module:'EXPENSES' + docType:'FUEL_ENTRY'.
  // Keyed here by doc_type so the auto-post dispatcher (below) routes to the
  // fuel_entry handler, not the generic expense_entry one.
  FUEL_ENTRY:  { type: 'fuel_entry',    action: 'post' },
  // Phase G4.5cc (Apr 29, 2026) — clerk-run payroll. PAYROLL was previously
  // excluded from auto-post on the grounds that per-payslip review/approve
  // semantics required explicit acknowledgement. With G4.5cc, a clerk submits
  // the WHOLE RUN (period+cycle) for posting via gateApproval; admin's single
  // Hub approval should cascade every matching payslip from COMPUTED to POSTED
  // + emit JEs. The `payroll_run` handler reads metadata.run_period / run_cycle
  // off the ApprovalRequest so it re-resolves the full payslip set on approval.
  // Per-payslip Hub items (the legacy MODULE_QUERIES.PAYROLL surface) are still
  // available for management-driven manual review when admin chooses.
  PAYROLL:     { type: 'payroll_run',   action: 'post' },
};

// Module-specific approval handlers (lazy-loaded to avoid circular deps)
const approvalHandlers = {
  approval_request: async (id, action, userId, reason) => {
    const { processDecision } = require('../services/approvalService');
    const result = await processDecision(
      id,
      action === 'approve' ? 'APPROVED' : 'REJECTED',
      userId,
      reason
    );

    // Phase G4.1 follow-up — Auto-post on orphan approval path.
    // Fire the module's own handler on final APPROVE (no escalation queued)
    // so the BDM doesn't have to re-submit. Failure is logged, not thrown:
    // the approval decision is already persisted and must stand. If post
    // fails (e.g. doc already POSTED via sibling race, CALF not yet posted),
    // the BDM fixes the prerequisite and resubmits.
    if (
      action === 'approve' &&
      result?.request?.status === 'APPROVED' &&
      !result.nextLevel
    ) {
      const req = result.request;
      // Prefer doc_type (more specific — e.g. FUEL_ENTRY under EXPENSES) over module
      const autoPost = MODULE_AUTO_POST[req.doc_type] || MODULE_AUTO_POST[req.module];
      if (autoPost && req.doc_id && approvalHandlers[autoPost.type]) {
        try {
          await approvalHandlers[autoPost.type](
            req.doc_id,
            autoPost.action,
            userId,
            reason
          );
        } catch (err) {
          console.error(
            `Auto-post on orphan approval failed (module=${req.module}, doc_id=${req.doc_id}):`,
            err.message
          );
        }
      }
    }

    return result;
  },

  perdiem_override: async (id, action, userId, reason) => {
    // Apply the override to the SMER daily entry FIRST. Only if that succeeds do we
    // record the decision on the ApprovalRequest — this prevents the silent-skip
    // class of bug where the request flips to APPROVED but the SMER stays PENDING.
    const ApprovalRequest = require('../models/ApprovalRequest');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const request = await ApprovalRequest.findById(id).lean();
    if (!request) throw new Error('Per diem override: approval request not found');
    if (!request.doc_id) throw new Error('Per diem override: approval request missing doc_id (SMER reference)');

    const SmerEntry = require('../models/SmerEntry');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- doc_id from same-entity-scoped request above
    const smer = await SmerEntry.findById(request.doc_id);
    if (!smer) throw new Error(`Per diem override: SMER ${request.doc_id} not found`);

    const entryId = request.metadata?.entry_id
      || request.description?.match(/Entry ID: (.+)$/)?.[1];  // fallback for pre-metadata requests
    const entry = entryId ? smer.daily_entries.id(entryId) : null;
    if (!entry) throw new Error(`Per diem override: daily entry ${entryId || '(id missing)'} not found on SMER ${smer._id}`);

    if (action === 'approve') {
      const tier = request.metadata?.override_tier
        || request.description?.match(/→ (FULL|HALF)/)?.[1];
      if (!tier) throw new Error('Per diem override: missing override_tier on request metadata/description');

      // Ledger-drift guard: if the parent SMER is already POSTED, applying the
      // override would silently change expense totals that have already journaled.
      // Refuse — the approver must reopen the SMER, let it go back to DRAFT,
      // re-approve, then resubmit so the journal entry posts with the new amount.
      if (smer.status === 'POSTED') {
        throw new Error(`SMER ${smer.period}-${smer.cycle} is already POSTED. Reopen the SMER (Reversal Console) before approving this per diem override so the journal re-posts with the new amount.`);
      }

      const Settings = require('../models/Settings');
      const { computePerdiemAmount, resolvePerdiemConfig } = require('../services/perdiemCalc');
      const PeopleMaster = require('../models/PeopleMaster');
      const CompProfile = require('../models/CompProfile');
      const settings = await Settings.getSettings();
      // Resolve the BDM's per-person CompProfile so the accepted amount matches
      // what the requester saw at submission time. Matches loadBdmCompProfile()
      // in expenseController.js — inlined here to avoid a cross-controller require.
      const person = await PeopleMaster.findOne({ user_id: smer.bdm_id, entity_id: smer.entity_id }).select('_id').lean();
      const compProfile = person
        ? await CompProfile.findOne({ person_id: person._id, entity_id: smer.entity_id, status: 'ACTIVE' }).sort({ effective_date: -1 }).lean()
        : null;
      // Phase G1.6 — pull per-role config (full_tier_threshold / half_tier_threshold)
      // so the approved amount uses the same threshold chain as the request-time preview.
      let perdiemConfig;
      try {
        perdiemConfig = await resolvePerdiemConfig({ entityId: smer.entity_id, role: 'BDM' });
      } catch (_) {
        perdiemConfig = undefined;
      }
      const { amount } = computePerdiemAmount(tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings, compProfile, perdiemConfig);

      const oldTier = entry.perdiem_tier;
      const rsn = request.metadata?.override_reason || 'Approved override';
      entry.perdiem_override = true;
      entry.override_tier = tier;
      entry.override_reason = `${rsn} (Approval #${id})`;
      entry.override_status = 'APPROVED';
      entry.overridden_by = userId;
      entry.overridden_at = new Date();
      entry.perdiem_tier = tier;
      entry.perdiem_amount = amount;

      const ErpAuditLog = require('../models/ErpAuditLog');
      await ErpAuditLog.logChange({
        entity_id: smer.entity_id, bdm_id: smer.bdm_id,
        log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
        field_changed: `daily_entries.${entry.day}.perdiem_tier`,
        old_value: `${oldTier} (md_count: ${entry.md_count})`,
        new_value: `${tier} (approved override)`,
        changed_by: userId,
        note: `Per diem override day ${entry.day}: ${oldTier} → ${tier} — auto-applied via approval #${id}`
      });
    } else {
      // Rejected — clear pending state, keep CRM-computed amount
      entry.override_status = 'REJECTED';
      entry.requested_override_tier = undefined;
    }
    await smer.save();

    // Phase G4.5f — courtesy receipt to the SMER owner when the override was
    // requested on their behalf by a proxy. Best-effort, non-blocking; failures
    // are logged but never roll back the approval decision (which has already
    // mutated the SMER above). Decoupled from the SMER controller's own
    // submitSmer/applyPerdiemOverride receipts so a hub-direct decision still
    // routes a notification — even if no one ever calls applyPerdiemOverride.
    if (entry.recorded_on_behalf_of && String(smer.bdm_id) !== String(entry.recorded_on_behalf_of)) {
      try {
        const MessageInbox = require('../../models/MessageInbox');
        const User = require('../../models/User');
        // Resolve BOTH the proxy's display label AND the target BDM's role
        // (recipient filter hinges on recipientRole=user.role — post-Phase S2
        // the value is 'staff'; legacy docs may still carry 'contractor' /
        // 'employee' until migration runs).
        const [proxyUser, ownerUser] = await Promise.all([
          User.findById(entry.recorded_on_behalf_of).select('name email').lean(),
          User.findById(smer.bdm_id).select('role').lean(),
        ]);
        const proxyLabel = proxyUser?.name || proxyUser?.email || 'an authorized user';
        const recipientRole = ownerUser?.role || 'staff';
        const decisionLabel = action === 'approve' ? 'APPROVED' : 'REJECTED';
        const tierLabel = action === 'approve' ? `New tier: ${entry.perdiem_tier} (₱${(entry.perdiem_amount || 0).toLocaleString()}). ` : '';
        await MessageInbox.create({
          entity_id: smer.entity_id,
          recipientRole,
          recipientUserId: smer.bdm_id,
          senderUserId: userId,
          senderName: 'Approval Hub',
          senderRole: 'system',
          title: `Per-diem override ${decisionLabel} — ${smer.period} ${smer.cycle} Day ${entry.day}`,
          body: `Your per-diem override request for ${smer.period} ${smer.cycle} Day ${entry.day} was ${decisionLabel}. ` +
            `${tierLabel}` +
            `Original request keyed by ${proxyLabel} — authorization on file: "${entry.bdm_phone_instruction || '(not recorded)'}". ` +
            (reason ? `Approver note: ${reason}.` : ''),
          category: 'PERDIEM_OVERRIDE_DECISION',
          priority: 'normal',
          must_acknowledge: false,
          requires_action: false,
          folder: 'INBOX',
        });
      } catch (notifyErr) {
        console.error('[perdiem_override] proxy decision receipt failed (non-critical):', notifyErr.message);
      }
    }

    // SMER write succeeded — record the decision on the ApprovalRequest.
    const { processDecision } = require('../services/approvalService');
    return await processDecision(id, action === 'approve' ? 'APPROVED' : 'REJECTED', userId, reason);
  },

  deduction_schedule: async (id, action, userId, reason) => {
    const svc = require('../services/deductionScheduleService');
    if (action === 'approve') return svc.approveSchedule(id, userId);
    if (action === 'reject') return svc.rejectSchedule(id, userId, reason || 'Rejected from Approval Hub');
    throw new Error(`Unknown action: ${action}`);
  },

  // Phase G4.3 — Incentive Dispute (SG-4 lifecycle dispatcher).
  //
  // The Approval Hub passes `id = ApprovalRequest._id`; the handler loads the
  // request, derefs the dispute, then applies the transition that the ORIGINAL
  // REQUESTER was trying to execute (DISPUTE_TAKE_REVIEW / DISPUTE_RESOLVE /
  // DISPUTE_CLOSE). Mirrors the perdiem_override pattern: side-effect FIRST,
  // then processDecision so the ApprovalRequest only flips to APPROVED if the
  // dispute write succeeded.
  //
  // Identity rule: dispute-level attribution fields (reviewer_id, resolved_by,
  // history[].by) use `request.requested_by` so the audit trail reflects the
  // person who asked to make the transition, not the Hub approver. The Hub
  // approver's identity is recorded on the ApprovalRequest via processDecision.
  //
  // On `reject`: the dispute stays in its current state (no terminal REJECTED
  // status — rejection means "the approver declined to make this transition").
  // The rejection reason surfaces in Approval History; no banner on the
  // dispute itself (resubmit = filer re-calls the lifecycle endpoint).
  incentive_dispute: async (id, action, userId, reason) => {
    const ApprovalRequest = require('../models/ApprovalRequest');
    const IncentiveDispute = require('../models/IncentiveDispute');
    const { processDecision } = require('../services/approvalService');

    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const request = await ApprovalRequest.findById(id).lean();
    if (!request) throw new Error('Incentive dispute: approval request not found');
    if (!request.doc_id) throw new Error('Incentive dispute: approval request missing doc_id');

    // eslint-disable-next-line vip-tenant/require-entity-filter -- doc_id from same-entity-scoped request above
    const dispute = await IncentiveDispute.findById(request.doc_id);
    if (!dispute) throw new Error(`Incentive dispute ${request.doc_id} not found`);

    if (action === 'reject') {
      // Dispute remains in its current state; reason lives on the ApprovalRequest.
      return await processDecision(id, 'REJECTED', userId, reason);
    }

    if (action !== 'approve') throw new Error(`Unsupported action for incentive_dispute: ${action}`);

    const originalRequesterId = request.requested_by || userId;
    const docType = request.doc_type;

    if (docType === 'DISPUTE_TAKE_REVIEW') {
      if (dispute.current_state !== 'OPEN') {
        throw new Error(`Cannot take review on dispute in state ${dispute.current_state}`);
      }
      const User = require('../../models/User');
      const reviewer = await User.findById(originalRequesterId).select('name role').lean();
      dispute.reviewer_id = originalRequesterId;
      dispute.reviewer_name = reviewer?.name || '';
      dispute.history.push({
        from_state: 'OPEN', to_state: 'UNDER_REVIEW',
        by: originalRequesterId, by_role: reviewer?.role || '',
        at: new Date(),
        reason: reason || 'Review started (approved via Hub)',
      });
      dispute.current_state = 'UNDER_REVIEW';
      dispute.state_changed_at = new Date();
      await dispute.save();

    } else if (docType === 'DISPUTE_RESOLVE') {
      if (dispute.current_state !== 'UNDER_REVIEW') {
        throw new Error(`Cannot resolve dispute in state ${dispute.current_state}`);
      }
      // Prefer structured metadata (Phase G4.3 controller pass-through). Fall
      // back to parsing the description for pre-G4.3 requests in the wild.
      const outcome = request.metadata?.outcome
        || request.description?.match(/→ (APPROVED|DENIED)/)?.[1];
      if (!['APPROVED', 'DENIED'].includes(outcome)) {
        throw new Error('Dispute resolve: missing/invalid outcome on request metadata (expected APPROVED or DENIED)');
      }
      const summary = (request.metadata?.resolution_summary || reason || '').trim()
        || 'Resolved via Approval Hub';
      const newState = outcome === 'APPROVED' ? 'RESOLVED_APPROVED' : 'RESOLVED_DENIED';

      // Cascade reversal for APPROVED outcome — mirrors resolveDispute in
      // incentiveDisputeController.js. Best-effort (non-blocking) so a cascade
      // failure doesn't leave the dispute stuck; approver can retry via the
      // direct route (reverseAccrualJournal is idempotent on REVERSED status).
      const extras = {};
      if (outcome === 'APPROVED') {
        if (dispute.artifact_type === 'payout' && dispute.payout_id) {
          try {
            const IncentivePayout = require('../models/IncentivePayout');
            const { reverseAccrualJournal } = require('../services/journalFromIncentive');
            // eslint-disable-next-line vip-tenant/require-entity-filter -- payout_id from same-entity-scoped dispute above
            const payout = await IncentivePayout.findById(dispute.payout_id);
            if (payout && payout.journal_id && payout.status !== 'REVERSED') {
              const reversalJe = await reverseAccrualJournal(
                payout.journal_id,
                `Dispute approved (via Hub): ${summary}`,
                userId,
                payout.entity_id
              );
              payout.status = 'REVERSED';
              payout.reversed_by = userId;
              payout.reversed_at = new Date();
              payout.reversal_reason = `Dispute ${dispute._id} approved via Hub`;
              payout.reversal_journal_id = reversalJe._id;
              await payout.save();
              extras.reversal_journal_id = reversalJe._id;
              dispute.reversal_journal_id = reversalJe._id;
            }
          } catch (err) {
            console.error('[hub incentive_dispute] payout reversal cascade failed (non-blocking):', err.message);
          }
        } else if (dispute.artifact_type === 'credit' && dispute.sales_credit_id) {
          try {
            const SalesCredit = require('../models/SalesCredit');
            // eslint-disable-next-line vip-tenant/require-entity-filter -- sales_credit_id from same-entity-scoped dispute above
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
                credit_reason: `Dispute ${dispute._id} approved (via Hub) — reversal of original credit. ${summary}`,
                invoice_total: original.invoice_total,
                csi_date: original.csi_date,
                fiscal_year: original.fiscal_year,
                period: original.period,
                source: 'reversal',
                created_at: new Date(),
                created_by: userId,
              }]);
              dispute.reversal_credit_id = reversal[0]._id;
              extras.reversal_credit_id = reversal[0]._id;
            }
          } catch (err) {
            console.error('[hub incentive_dispute] credit reversal append failed (non-blocking):', err.message);
          }
        }
      }

      dispute.resolution_summary = summary;
      dispute.resolved_by = originalRequesterId;
      dispute.resolved_at = new Date();
      const User = require('../../models/User');
      const requesterRole = (await User.findById(originalRequesterId).select('role').lean())?.role || '';
      dispute.history.push({
        from_state: 'UNDER_REVIEW', to_state: newState,
        by: originalRequesterId, by_role: requesterRole,
        at: new Date(),
        reason: summary,
        reversal_journal_id: extras.reversal_journal_id || null,
        reversal_credit_id: extras.reversal_credit_id || null,
      });
      dispute.current_state = newState;
      dispute.state_changed_at = new Date();
      await dispute.save();

      // Phase SG-6 #32 — integration event (mirrors direct-route resolveDispute)
      try {
        const { emit, INTEGRATION_EVENTS } = require('../services/integrationHooks');
        emit(INTEGRATION_EVENTS.DISPUTE_RESOLVED, {
          entity_id: dispute.entity_id,
          actor_id: userId,
          ref: String(dispute._id),
          data: { state: newState, outcome, summary, via: 'approval_hub' },
        });
      } catch (err) {
        console.warn('[hub incentive_dispute] integrationHooks emit skipped:', err.message);
      }

    } else if (docType === 'DISPUTE_CLOSE') {
      if (!['RESOLVED_APPROVED', 'RESOLVED_DENIED'].includes(dispute.current_state)) {
        throw new Error(`Cannot close dispute in state ${dispute.current_state}`);
      }
      const User = require('../../models/User');
      const requesterRole = (await User.findById(originalRequesterId).select('role').lean())?.role || '';
      const fromState = dispute.current_state;
      dispute.history.push({
        from_state: fromState, to_state: 'CLOSED',
        by: originalRequesterId, by_role: requesterRole,
        at: new Date(),
        reason: reason || 'Dispute closed (approved via Hub)',
      });
      dispute.current_state = 'CLOSED';
      dispute.state_changed_at = new Date();
      await dispute.save();

    } else {
      throw new Error(`Unknown dispute doc_type: ${docType}`);
    }

    // Dispute write succeeded — record the decision on the ApprovalRequest.
    return await processDecision(id, 'APPROVED', userId, reason);
  },

  income_report: async (id, action, userId, reason) => {
    if (action === 'reject') {
      const IncomeReport = require('../models/IncomeReport');
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
      const doc = await IncomeReport.findById(id);
      if (!doc) throw new Error('Income report not found');
      doc.status = 'RETURNED';
      doc.return_reason = reason;
      await doc.save();
      return doc;
    }
    const { transitionIncomeStatus } = require('../services/incomeCalc');
    // action maps: review → GENERATED→REVIEWED, credit → BDM_CONFIRMED→CREDITED
    return transitionIncomeStatus(id, action, userId);
  },

  grn: async (id, action, userId, reason) => {
    const GrnEntry = require('../models/GrnEntry');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const grn = await GrnEntry.findById(id);
    if (!grn) throw new Error('GRN not found');
    if (grn.status !== 'PENDING') throw new Error(`GRN not in PENDING status`);

    if (action === 'approve') {
      grn.status = 'APPROVED';
      grn.reviewed_by = userId;
      grn.reviewed_at = new Date();
    } else {
      grn.status = 'REJECTED';
      grn.reviewed_by = userId;
      grn.reviewed_at = new Date();
      grn.rejection_reason = reason || 'Rejected from Approval Hub';
    }
    await grn.save();
    return grn;
  },

  payslip: async (id, action, userId, reason) => {
    const Payslip = require('../models/Payslip');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const payslip = await Payslip.findById(id);
    if (!payslip) throw new Error('Payslip not found');

    if (action === 'review') {
      if (payslip.status !== 'COMPUTED') throw new Error('Payslip not in COMPUTED status');
      payslip.status = 'REVIEWED';
      payslip.reviewed_by = userId;
      payslip.reviewed_at = new Date();
    } else if (action === 'approve') {
      if (payslip.status !== 'REVIEWED') throw new Error('Payslip not in REVIEWED status');
      payslip.status = 'APPROVED';
      payslip.approved_by = userId;
      payslip.approved_at = new Date();
    } else if (action === 'reject') {
      payslip.status = 'REJECTED';
      payslip.rejection_reason = reason;
      payslip.reviewed_by = userId;
      payslip.reviewed_at = new Date();
    }
    await payslip.save();
    return payslip;
  },

  // Phase G4.5cc (Apr 29, 2026) — clerk-run payroll cascade.
  //
  // Triggered by MODULE_AUTO_POST.PAYROLL when admin approves a clerk-submitted
  // payroll run in the Approval Hub. The dispatcher passes `id` = the seed
  // payslip's _id (set by gateApproval in postPayroll → candidates[0]._id);
  // we re-resolve period+cycle off that payslip and bulk-cascade ALL sibling
  // payslips through COMPUTED → REVIEWED → APPROVED → POSTED, emitting one
  // payroll JE per posted slip. The state-machine transitions are the same
  // ones reviewPayslip / approvePayslip / postPayroll already use, so single
  // entry point. Per-payslip failures (state-mismatch, JE error) are captured
  // and surfaced in the result; they do NOT abort the cascade — the approval
  // decision is already persisted on the ApprovalRequest and must stand.
  //
  // Why we don't pass the metadata.run_period/run_cycle from the request: the
  // dispatcher in approvalHandlers.approval_request only forwards `req.doc_id`,
  // not the full request. Reading the seed payslip's period/cycle gives the
  // same answer with one extra round-trip and survives a mid-flight rename of
  // the metadata shape. (Defensive: even if metadata is wiped or stale, we
  // still cascade the right run.)
  payroll_run: async (id, action, userId, reason) => {
    if (action !== 'post') {
      throw new Error(`payroll_run: unsupported action '${action}' (only 'post' is allowed)`);
    }

    const Payslip = require('../models/Payslip');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub cascade: id from gated approver via entity-scoped list; see top-of-file note
    const seed = await Payslip.findById(id).lean();
    if (!seed) throw new Error('Seed payslip not found for payroll run cascade');

    const { entity_id, period, cycle } = seed;

    // Period lock — if the period was closed between submit and approve, fail
    // loudly. Admin must reopen the period before re-approving (matches the
    // direct postPayroll path).
    const { checkPeriodOpen } = require('../utils/periodLock');
    if (period) await checkPeriodOpen(entity_id, period);

    const { transitionPayslipStatus } = require('../services/payslipCalc');
    const { journalFromPayroll, resolveFundingCoa } = require('../services/autoJournal');
    const { createAndPostJournal } = require('../services/journalEngine');
    const ErpAuditLog = require('../models/ErpAuditLog');

    const candidates = await Payslip.find({
      entity_id,
      period,
      cycle,
      status: { $in: ['COMPUTED', 'REVIEWED', 'APPROVED'] },
      deletion_event_id: { $exists: false },
    });

    let posted = 0;
    const errors = [];

    for (const ps of candidates) {
      try {
        // Cascade through the state machine. Each step is enforced by
        // VALID_TRANSITIONS in payslipCalc — we only call the next step if
        // the current status matches.
        if (ps.status === 'COMPUTED') {
          await transitionPayslipStatus(ps._id, 'review', userId);
        }
        // Re-fetch status (the transition mutated the doc in-DB; ps in memory is stale).
        let cur = await Payslip.findById(ps._id).select('status').lean();
        if (cur?.status === 'REVIEWED') {
          await transitionPayslipStatus(ps._id, 'approve', userId);
        }
        cur = await Payslip.findById(ps._id).select('status').lean();
        if (cur?.status === 'APPROVED') {
          await transitionPayslipStatus(ps._id, 'post', userId);
          posted++;

          // Emit JE — same logic as postPayroll's loop. Failure logs but does
          // not roll back the POSTED transition (matches direct postPayroll).
          let fullPs = null;
          try {
            // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key re-fetch with populates; ps._id from entity-scoped find above
            fullPs = await Payslip.findById(ps._id)
              .populate('person_id', 'full_name')
              .lean();
            const bankCoa = await resolveFundingCoa({ payment_mode: 'BANK_TRANSFER' });
            const jeData = await journalFromPayroll(
              { ...fullPs, employee_name: fullPs.person_id?.full_name || '' },
              bankCoa.coa_code, bankCoa.coa_name, userId
            );
            await createAndPostJournal(fullPs.entity_id, jeData);
          } catch (jeErr) {
            console.error('[G4.5cc CASCADE AUTO_JOURNAL_FAILURE] Payslip', String(ps._id), jeErr.message);
            ErpAuditLog.logChange({
              entity_id: fullPs?.entity_id || ps.entity_id,
              log_type: 'LEDGER_ERROR',
              target_ref: ps._id?.toString(),
              target_model: 'JournalEntry',
              field_changed: 'auto_journal',
              new_value: jeErr.message,
              changed_by: userId,
              note: `Auto-journal failed for payslip ${fullPs?.employee_name || ps._id} (G4.5cc clerk-run cascade)`,
            }).catch(() => {});
          }
        }
      } catch (err) {
        errors.push({ payslip_id: ps._id?.toString(), error: err.message });
      }
    }

    // Audit the cascade itself (one row per run) so admin can trace which Hub
    // approval rolled which payslips forward.
    ErpAuditLog.logChange({
      entity_id,
      log_type: 'WORKFLOW',
      target_ref: id?.toString(),
      target_model: 'Payslip',
      field_changed: 'payroll_run_cascade',
      old_value: `period=${period} cycle=${cycle} candidates=${candidates.length}`,
      new_value: `posted=${posted} errors=${errors.length}`,
      changed_by: userId,
      note: `G4.5cc clerk-run cascade — ${reason || 'admin Hub approval'}`,
    }).catch(() => {});

    return { posted, total: candidates.length, errors };
  },

  kpi_rating: async (id, action, userId, reason) => {
    const KpiSelfRating = require('../models/KpiSelfRating');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const rating = await KpiSelfRating.findById(id);
    if (!rating) throw new Error('KPI rating not found');

    if (action === 'review') {
      if (rating.status !== 'SUBMITTED') throw new Error('Rating not in SUBMITTED status');
      rating.status = 'REVIEWED';
      rating.reviewed_at = new Date();
    } else if (action === 'approve') {
      if (rating.status !== 'REVIEWED') throw new Error('Rating not in REVIEWED status');
      rating.status = 'APPROVED';
      rating.approved_by = userId;
      rating.approved_at = new Date();
    } else if (action === 'reject') {
      rating.status = 'RETURNED';
      rating.return_reason = reason;
      rating.reviewed_by = userId;
      rating.reviewed_at = new Date();
    }
    await rating.save();
    return rating;
  },

  // ── Phase F expansion: document-posting handlers (VALID → POSTED) ──

  sales_line: async (id, action, userId, reason) => {
    const SalesLine = require('../models/SalesLine');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await SalesLine.findById(id);
    if (!doc) throw new Error('Sales line not found');
    if (doc.status !== 'VALID') throw new Error('Sales line not in VALID status');
    if (action === 'post') {
      // Full posting with TransactionEvent, inventory (FIFO/consignment), and journals
      // OPENING_AR: skips inventory + COGS automatically inside postSaleRow
      const { postSaleRow } = require('./salesController');
      // Determine if posting user is admin-like (president/admin/finance/ceo)
      // so FIFO uses entity-wide stock instead of restricting to bdm_id
      const User = require('../../models/User');
      const { isAdminLike } = require('../../constants/roles');
      const poster = await User.findById(userId).select('role').lean();
      await postSaleRow(doc, userId, { isAdminLike: poster && isAdminLike(poster.role) });
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [reason];
      await doc.save();
    }
    return doc;
  },

  collection: async (id, action, userId, reason) => {
    const Collection = require('../models/Collection');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await Collection.findById(id);
    if (!doc) throw new Error('Collection not found');
    if (doc.status !== 'VALID') throw new Error('Collection not in VALID status');
    if (action === 'post') {
      const { postSingleCollection } = require('./collectionController');
      await postSingleCollection(doc, userId);
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [reason];
      await doc.save();
    }
    return doc;
  },

  smer_entry: async (id, action, userId, reason) => {
    const SmerEntry = require('../models/SmerEntry');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await SmerEntry.findById(id);
    if (!doc) throw new Error('SMER entry not found');
    if (doc.status !== 'VALID') throw new Error('SMER not in VALID status');
    if (action === 'post') {
      const { postSingleSmer } = require('./expenseController');
      await postSingleSmer(doc, userId);
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [reason];
      await doc.save();
    }
    return doc;
  },

  car_logbook: async (id, action, userId, reason) => {
    const CarLogbookCycle = require('../models/CarLogbookCycle');
    const CarLogbookEntry = require('../models/CarLogbookEntry');
    const { postSingleCarLogbook } = require('./expenseController');

    // Phase 33: the Approval Hub references the CarLogbookCycle wrapper doc_id.
    // Legacy approvals (pre-Phase 33) may still carry a per-day CarLogbookEntry id
    // — fall through to that path when no cycle wrapper matches.
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const cycle = await CarLogbookCycle.findById(id);
    if (cycle) {
      if (action === 'post') {
        await postSingleCarLogbook(cycle, userId);
        return cycle;
      }
      if (action === 'reject') {
        cycle.status = 'ERROR';
        cycle.rejection_reason = reason;
        cycle.validation_errors = [reason];
        await cycle.save();
        // Propagate rejection onto every VALID per-day doc belonging to this cycle
        // eslint-disable-next-line vip-tenant/require-entity-filter -- cycle_id is unique; cycle fetched above
        await CarLogbookEntry.updateMany(
          { cycle_id: cycle._id, status: 'VALID' },
          { $set: { status: 'ERROR', rejection_reason: reason, validation_errors: [reason] } }
        );
        return cycle;
      }
      return cycle;
    }

    // Legacy per-day fallback (ensures old pending approvals still dispatch)
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await CarLogbookEntry.findById(id);
    if (!doc) throw new Error('Car logbook entry not found');
    const batchFilter = { entity_id: doc.entity_id, bdm_id: doc.bdm_id, period: doc.period, cycle: doc.cycle, status: 'VALID' };
    if (action === 'post') {
      const allValid = await CarLogbookEntry.find(batchFilter);
      for (const entry of allValid) {
        await postSingleCarLogbook(entry, userId);
      }
      return allValid[0] || doc;
    } else if (action === 'reject') {
      await CarLogbookEntry.updateMany(batchFilter, {
        $set: { status: 'ERROR', rejection_reason: reason, validation_errors: [reason] }
      });
      return doc;
    }
    return doc;
  },

  // Per-fuel approval (mirrors per-diem override dispatcher)
  fuel_entry: async (id, action, userId, reason) => {
    const CarLogbookEntry = require('../models/CarLogbookEntry');
    // The fuel entry id is a subdoc _id on a CarLogbookEntry.fuel_entries array.
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const dayDoc = await CarLogbookEntry.findOne({ 'fuel_entries._id': id });
    if (!dayDoc) throw new Error('Fuel entry not found');
    const fuel = dayDoc.fuel_entries.id(id);
    if (!fuel) throw new Error('Fuel entry not found on day doc');

    if (action === 'post' || action === 'approve') {
      fuel.approval_status = 'APPROVED';
      fuel.approved_by = userId;
      fuel.approved_at = new Date();
      fuel.rejection_reason = undefined;
    } else if (action === 'reject') {
      fuel.approval_status = 'REJECTED';
      fuel.rejection_reason = reason || 'Rejected';
    }
    await dayDoc.save();
    return { _id: fuel._id, parent_id: dayDoc._id, approval_status: fuel.approval_status };
  },

  expense_entry: async (id, action, userId, reason) => {
    const ExpenseEntry = require('../models/ExpenseEntry');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await ExpenseEntry.findById(id);
    if (!doc) throw new Error('Expense entry not found');
    if (doc.status !== 'VALID') throw new Error('Expense entry not in VALID status');
    if (action === 'post') {
      const { postSingleExpense } = require('./expenseController');
      await postSingleExpense(doc, userId);
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [reason];
      await doc.save();
    }
    return doc;
  },

  prf_calf: async (id, action, userId, reason) => {
    const PrfCalf = require('../models/PrfCalf');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await PrfCalf.findById(id);
    if (!doc) throw new Error('PRF/CALF not found');
    if (doc.status !== 'VALID') throw new Error('PRF/CALF not in VALID status');
    if (action === 'post') {
      const { postSinglePrfCalf } = require('./expenseController');
      await postSinglePrfCalf(doc, userId);
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [reason];
      await doc.save();
    }
    return doc;
  },

  // Phase 32 — Undertaking (GRN receipt confirmation) approval handler.
  // Approve path calls postSingleUndertaking which opens a MongoDB session and
  // auto-approves the linked GRN atomically (rule #20). Reject returns the doc
  // to DRAFT so the BDM can fix and resubmit (no validation errors field; the
  // rejection_reason captures why).
  undertaking: async (id, action, userId, reason) => {
    const Undertaking = require('../models/Undertaking');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await Undertaking.findById(id);
    if (!doc) throw new Error('Undertaking not found');
    if (doc.status !== 'SUBMITTED') {
      throw new Error(`Undertaking is ${doc.status}, expected SUBMITTED`);
    }
    if (action === 'approve' || action === 'post') {
      const { postSingleUndertaking } = require('./undertakingController');
      const { undertaking } = await postSingleUndertaking(doc, userId);
      return undertaking;
    } else if (action === 'reject') {
      // Phase 32R — reject is terminal. Linked GRN stays PENDING for reversal
      // or direct rejection by approver.
      doc.status = 'REJECTED';
      doc.rejection_reason = reason || 'Rejected from Approval Hub';
      doc.reopen_count = (doc.reopen_count || 0) + 1;
      await doc.save();
      return doc;
    }
    return doc;
  },

  // Phase 31R follow-up — Credit Note (product return) approval handler.
  // Mirrors smer_entry / car_logbook / expense_entry: approver posts one CN via
  // the extracted `postSingleCreditNote` helper (which handles event+inventory+JE);
  // reject flips status to ERROR so the submitter can edit and resubmit.
  credit_note: async (id, action, userId, reason) => {
    const CreditNote = require('../models/CreditNote');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
    const doc = await CreditNote.findById(id);
    if (!doc) throw new Error('Credit note not found');
    if (doc.status !== 'VALID') throw new Error('Credit note not in VALID status');
    if (action === 'post') {
      const { postSingleCreditNote } = require('./creditNoteController');
      await postSingleCreditNote(doc, userId);
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.validation_errors = [reason];
      await doc.save();
    }
    return doc;
  },

  // ── Phase G6.7 — Group B reject handlers ──
  // Group B modules are routed through `ApprovalRequest` (see universalApprovalService
  // `buildGapModulePendingItems`). The Approval Hub passes `id = ApprovalRequest._id` here
  // so each handler must look up the request, dereference `doc_id`, and update the
  // underlying source document. The handler ONLY supports `reject` — the happy-path
  // approve path stays inside the existing `processDecision()` route, which the module's
  // own controllers consume after gateApproval().
  //
  // Subscription-safe: each module's source-doc model is loaded by name from a lookup-driven
  // map (REJECT_TARGETS) so adding a new Group B module requires only:
  //   (1) adding a row to MODULE_REJECTION_CONFIG seed (already done in lookupGenericController),
  //   (2) adding the model name + business rules below in REJECT_TARGETS,
  //   (3) wiring the type string in TYPE_TO_MODULE above + universalApprovalService actionType.
  // No new handlers needed for additional fields — schema is uniform via getModuleRejectionConfig.

  // Maps universalApprovalController `type` → { modelName, docTypeMap, terminalStates }
  // - modelName: the source-doc Mongoose model
  // - docTypeMap: optional map of ApprovalRequest.doc_type → modelName when one type covers
  //   multiple physical models (IC_TRANSFER → InterCompanyTransfer | IcSettlement)
  // - terminalStates: status values that block rejection (already settled / posted)
  // Tone matches Rule #20 — never bypass gateApproval/periodLockCheck and never demote a
  // POSTED financial document via reject; require explicit reverse instead.

  // Phase G6.7-PC4 (May 01 2026) — Purchasing: branches on action like petty_cash
  // and journal. Approve/post path delegates to the new postSingleSupplierInvoice
  // helper (extracted from purchasingController.postInvoice). The helper handles
  // status guard, period lock against the invoice's own entity, atomic JE post
  // + status flip, VAT ledger entry, and idempotency on POSTED. Reject stays
  // on buildGroupBReject (terminalStates: POSTED/CLOSED/CANCELLED — never demote).
  //
  // Note: PURCHASE_ORDER doc_type still falls through reject only — POs are
  // approved via dedicated approvePO / receivePO routes that already gate
  // through gateApproval. The Hub purchasing surface is currently SI-only.
  purchasing: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'purchasing', id, action, userId, reason,
        modelByDocType: { SUPPLIER_INVOICE: 'SupplierInvoice' },
        fallbackModel: 'PurchaseOrder',
        terminalStates: ['POSTED', 'CLOSED', 'CANCELLED'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const SupplierInvoice = require('../models/SupplierInvoice');
      const { postSingleSupplierInvoice } = require('./purchasingController');

      // Group B id-semantics: id IS the ApprovalRequest._id; deref to invoice._id.
      // Fall back to treating id as the invoice _id directly so direct dispatches still work.
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list
      const request = await ApprovalRequest.findById(id).lean();
      const invoiceId = (request && request.doc_id) ? request.doc_id : id;

      // Helper enforces status guard + period lock + JE atomicity + idempotency.
      const { invoice, je } = await postSingleSupplierInvoice(invoiceId, userId);

      // Close the originating ApprovalRequest. The shared auto-resolve at L1130-1160
      // keys on `{ doc_id: id }` (Group A id-semantics) and never matches Group B.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }

      return { invoice, journal_entry: je };
    }
    throw new Error(`Unsupported action for purchasing: ${action}`);
  },

  // Phase G6.7-PC2 (Apr 30 2026) — Journal: branches on action like petty_cash.
  // Approve/post path delegates to the existing journalEngine.postJournal helper
  // (already factored — no extraction needed); reject stays on buildGroupBReject.
  // Idempotent on POSTED; period-lock against the JE's own entity (cross-entity-safe).
  journal: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'journal', id, action, userId, reason,
        modelByDocType: { JOURNAL_ENTRY: 'JournalEntry' },
        fallbackModel: 'JournalEntry',
        terminalStates: ['POSTED', 'VOID'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const JournalEntry = require('../models/JournalEntry');
      const { postJournal } = require('../services/journalEngine');
      const { checkPeriodOpen } = require('../utils/periodLock');

      // Hub passes ApprovalRequest._id (Group B id-semantics); deref to JE._id.
      // Fall back to treating id as the JE _id directly so direct dispatches still work.
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
      const request = await ApprovalRequest.findById(id).lean();
      const jeId = (request && request.doc_id) ? request.doc_id : id;

      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: jeId resolved from gated approver via entity-scoped list above
      const jePre = await JournalEntry.findById(jeId).lean();
      if (!jePre) throw new Error('Journal entry not found');

      // Idempotency on POSTED — re-approve from Hub never double-posts (matches G6.7-PC1 petty_cash posture).
      if (jePre.status !== 'POSTED') {
        // Period lock against the JE's own entity (Hub approvers may be cross-entity privileged).
        if (jePre.period) await checkPeriodOpen(jePre.entity_id, jePre.period);
        // postJournal throws if status !== 'DRAFT' — that's the desired guard for non-DRAFT/non-POSTED states.
        await postJournal(jeId, userId, jePre.entity_id);
      }

      // Close the originating ApprovalRequest. The shared auto-resolve at L1130-1160
      // keys on `{ doc_id: id }` (Group A id-semantics where id IS the underlying doc),
      // which never matches Group B items (id IS the ApprovalRequest._id). Without this
      // explicit close, the request would stay PENDING in the Hub after a successful approve.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }

      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: jeId resolved from gated approver via entity-scoped list above
      return await JournalEntry.findById(jeId).lean();
    }
    throw new Error(`Unsupported action for journal: ${action}`);
  },

  // Phase G6.7-PC7 (May 01 2026) — Banking: branches on action.
  // Approve/post path delegates to bankReconService.finalizeRecon (already
  // exported as a callable helper — same posture as journalEngine.postJournal).
  // The helper throws "Already finalized" on terminal state, so the Hub guard
  // peeks status FIRST and short-circuits cleanly to preserve idempotency.
  //
  // CAUTION: BankStatement.status === 'FINALIZED' is immutable — there is no
  // un-finalize path. The peek guard means re-clicking Approve from the Hub
  // is safe (no double JE creation, no double balance write), but the cost of
  // a wrong-fire here is HIGHER than other modules. Smoke carefully.
  banking: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'banking', id, action, userId, reason,
        modelByDocType: { BANK_RECON: 'BankStatement' },
        fallbackModel: 'BankStatement',
        terminalStates: ['FINALIZED'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const BankStatement = require('../models/BankStatement');
      const { finalizeRecon } = require('../services/bankReconService');

      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list
      const request = await ApprovalRequest.findById(id).lean();
      const stmtId = (request && request.doc_id) ? request.doc_id : id;

      // Idempotency peek: finalizeRecon throws on FINALIZED; the Hub treats
      // re-fire as success so the request can be cleanly closed.
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: stmtId resolved from gated approver
      const stmtPre = await BankStatement.findById(stmtId).lean();
      if (!stmtPre) throw new Error('Bank statement not found');

      let finalizeResult;
      if (stmtPre.status === 'FINALIZED') {
        finalizeResult = {
          status: 'FINALIZED',
          closing_balance: stmtPre.closing_balance,
          adjustment_jes: 0,
          already_finalized: true,
        };
      } else {
        finalizeResult = await finalizeRecon(stmtId, userId);
      }

      // Close the originating ApprovalRequest.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }

      return finalizeResult;
    }
    throw new Error(`Unsupported action for banking: ${action}`);
  },

  // Phase G6.7-PC6 (May 01 2026) — IC Transfer + IC Settlement: branches on
  // BOTH action AND doc_type because the `ic_transfer` Hub type covers TWO
  // physical models with different lifecycles:
  //   - doc_type IC_TRANSFER    → InterCompanyTransfer (DRAFT → APPROVED, no JE)
  //                                → approveSingleIcTransfer
  //   - doc_type IC_SETTLEMENT  → IcSettlement (DRAFT → POSTED + TransactionEvent)
  //                                → postSingleIcSettlement
  // Both helpers are idempotent on their terminal/post-gate states.
  // Reject delegates to buildGroupBReject (terminalStates: POSTED/CANCELLED/RECEIVED).
  ic_transfer: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'ic_transfer', id, action, userId, reason,
        modelByDocType: { IC_TRANSFER: 'InterCompanyTransfer', IC_SETTLEMENT: 'IcSettlement' },
        fallbackModel: 'InterCompanyTransfer',
        terminalStates: ['POSTED', 'CANCELLED', 'RECEIVED'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');

      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list
      const request = await ApprovalRequest.findById(id).lean();
      const docId = (request && request.doc_id) ? request.doc_id : id;
      const docType = request?.doc_type || 'IC_TRANSFER';

      let result;
      if (docType === 'IC_SETTLEMENT') {
        const IcSettlement = require('../models/IcSettlement');
        const { postSingleIcSettlement } = require('./icSettlementController');
        const { settlement } = await postSingleIcSettlement(docId, userId);
        result = { settlement, doc_type: 'IC_SETTLEMENT' };
      } else {
        // Default to IC_TRANSFER (the more common case — transfer approval).
        const InterCompanyTransfer = require('../models/InterCompanyTransfer');
        const { approveSingleIcTransfer } = require('./interCompanyController');
        const { transfer } = await approveSingleIcTransfer(docId, userId);
        result = { transfer, doc_type: 'IC_TRANSFER' };
      }

      // Close the originating ApprovalRequest.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }

      return result;
    }
    throw new Error(`Unsupported action for ic_transfer: ${action}`);
  },

  // Petty Cash — supports BOTH approve/post (atomic balance + status flip)
  // and reject. Approve path mirrors the Group A pattern (postSingleSmer /
  // postSingleExpense): Hub passes ApprovalRequest._id; deref to doc_id and
  // call the shared postSinglePettyCashTransaction helper. Period lock,
  // balance guards, and ceiling notifications all live inside the helper.
  petty_cash: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'petty_cash', id, action, userId, reason,
        modelByDocType: { DISBURSEMENT: 'PettyCashTransaction', DEPOSIT: 'PettyCashTransaction' },
        fallbackModel: 'PettyCashTransaction',
        terminalStates: ['POSTED', 'VOIDED'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');
      // Hub passes ApprovalRequest._id in approve_data.id (Group B id-semantics);
      // deref to the underlying PettyCashTransaction. Fall back to treating id as
      // the txn _id directly so legacy callers / direct dispatches still work.
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
      const request = await ApprovalRequest.findById(id).lean();
      const txnId = (request && request.doc_id) ? request.doc_id : id;

      const { postSinglePettyCashTransaction } = require('./pettyCashController');
      const { txn } = await postSinglePettyCashTransaction(txnId, userId);

      // Close the originating ApprovalRequest. The shared auto-resolve at
      // L1130-1160 below keys on `{ doc_id: id }` (Group A id-semantics where
      // id IS the underlying doc), which never matches for Group B items
      // (id IS the ApprovalRequest._id). Without this explicit close, the
      // request would stay PENDING in the Hub after a successful approve.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }
      return txn;
    }
    throw new Error(`Unsupported action for petty_cash: ${action}`);
  },

  // Phase G6.7-PC5 (May 01 2026) — Sales Goal Plan: branches on action.
  // Approve/post path delegates to postSingleSalesGoalPlan helper (extracted
  // from salesGoalController.activatePlan). Helper runs the full activation
  // cascade inside a single transaction:
  //   1. Generate plan.reference (idempotent — preserved across reopen)
  //   2. plan.status DRAFT → ACTIVE
  //   3. SalesGoalTargets DRAFT → ACTIVE (cascade)
  //   4. Auto-enroll eligible BDMs (idempotent at BDM level)
  //   5. Lazy-seed KPI_VARIANCE_THRESHOLDS.GLOBAL
  //   6. Sync IncentivePlan header (O(1))
  //   7. STATUS_CHANGE audit log
  // Helper short-circuits on plan.status === 'ACTIVE' so re-clicking Approve
  // from the Hub never double-enrolls or burns a fresh reference number.
  // Reject delegates to buildGroupBReject (terminalStates: CLOSED/REVERSED).
  sales_goal_plan: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'sales_goal_plan', id, action, userId, reason,
        modelByDocType: {
          PLAN_ACTIVATE:   'SalesGoalPlan',
          SALES_GOAL_PLAN: 'SalesGoalPlan',
        },
        fallbackModel: 'SalesGoalPlan',
        // CLOSED = normal end-of-life; REVERSED = President-Reverse cascade (Phase SG-3R).
        // Both are terminal — must not be demoted to REJECTED.
        terminalStates: ['CLOSED', 'REVERSED'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const SalesGoalPlan = require('../models/SalesGoalPlan');
      const { postSingleSalesGoalPlan } = require('./salesGoalController');

      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list
      const request = await ApprovalRequest.findById(id).lean();
      const planId = (request && request.doc_id) ? request.doc_id : id;

      // Helper enforces DRAFT-only guard + transaction atomicity + idempotency.
      // Plan-adjacent doc_types (BULK_TARGETS_IMPORT, PLAN_NEW_VERSION,
      // TARGET_REVISION, STATEMENT_DISPATCH) — for now we only handle
      // PLAN_ACTIVATE here. Other doc_types fall through to the helper which
      // will throw "Only DRAFT plans can be activated" if applied to a
      // non-plan; admin should use module-specific endpoints for those.
      const docType = request?.doc_type || 'PLAN_ACTIVATE';
      if (docType !== 'PLAN_ACTIVATE' && docType !== 'SALES_GOAL_PLAN') {
        // Plan-adjacent doc_types have no model-backed activation. Just close
        // the request — admin should use the module-specific endpoint to
        // actually act on the underlying intent (bulk-import, version-cut, etc.)
        if (request) {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver
          await ApprovalRequest.updateOne(
            { _id: id, status: 'PENDING' },
            {
              $set: {
                status: 'APPROVED',
                decided_by: userId,
                decided_at: new Date(),
                decision_reason: reason || `Approved via Approval Hub — admin must trigger ${docType} action separately`,
              },
              $push: {
                history: { status: 'APPROVED', by: userId, reason: reason || 'Approved via Approval Hub' },
              },
            }
          );
        }
        return { approved: true, doc_type: docType, request_id: id };
      }

      const { plan, enrollmentSummary } = await postSingleSalesGoalPlan(planId, userId);

      // Close the originating ApprovalRequest.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }

      return { plan, enrollment: enrollmentSummary };
    }
    throw new Error(`Unsupported action for sales_goal_plan: ${action}`);
  },

  // Phase G6.7-PC3 (Apr 30 2026) — Incentive Payout: branches on action AND on
  // the underlying ApprovalRequest.doc_type (the controller emits FOUR doc_types:
  // PAYOUT_APPROVE, PAYOUT_PAY, PAYOUT_REVERSE, STATEMENT_DISPATCH). Each maps
  // to a different lifecycle helper:
  //   - PAYOUT_APPROVE   → postSinglePayoutApproval (ACCRUED → APPROVED, no JE)
  //   - PAYOUT_PAY       → postSinglePayoutPayment  (→ PAID, settlement JE)
  //   - PAYOUT_REVERSE   → postSinglePayoutReversal (→ REVERSED, storno JE)
  //   - STATEMENT_DISPATCH → no doc state change; just close the request.
  //                          (Actual dispatch runs via the dedicated endpoint
  //                          dispatchStatementsForPeriod which has its own gate.)
  // All three lifecycle helpers are idempotent on terminal state — re-clicking
  // Approve from the Hub never double-posts a JE. Reject delegates to the
  // shared buildGroupBReject (POSTED/PAID/REVERSED rows are protected as terminal).
  incentive_payout: async (id, action, userId, reason) => {
    if (action === 'reject') {
      return buildGroupBReject({
        actionType: 'incentive_payout', id, action, userId, reason,
        modelByDocType: {
          PAYOUT_APPROVE: 'IncentivePayout',
          PAYOUT_PAY: 'IncentivePayout',
          PAYOUT_REVERSE: 'IncentivePayout',
          INCENTIVE_PAYOUT: 'IncentivePayout',
        },
        fallbackModel: 'IncentivePayout',
        terminalStates: ['PAID', 'REVERSED'],
      });
    }
    if (action === 'approve' || action === 'post') {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const IncentivePayout = require('../models/IncentivePayout');
      const {
        postSinglePayoutApproval,
        postSinglePayoutPayment,
        postSinglePayoutReversal,
      } = require('./incentivePayoutController');

      // Hub passes ApprovalRequest._id (Group B id-semantics); deref to payout._id.
      // Fall back to treating id as the payout _id directly so direct dispatches still work.
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
      const request = await ApprovalRequest.findById(id).lean();
      const docType = request?.doc_type || 'PAYOUT_PAY';

      // STATEMENT_DISPATCH has no underlying IncentivePayout — request.doc_id points
      // at the requester userId for audit. Just close the request; admin must
      // separately call /statements/dispatch to actually mass-mail (that endpoint
      // has its own gateApproval and runs the email loop).
      if (docType === 'STATEMENT_DISPATCH') {
        if (request) {
          // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
          await ApprovalRequest.updateOne(
            { _id: id, status: 'PENDING' },
            {
              $set: {
                status: 'APPROVED',
                decided_by: userId,
                decided_at: new Date(),
                decision_reason: reason || 'Approved via Approval Hub — admin must trigger dispatch separately',
              },
              $push: {
                history: {
                  status: 'APPROVED',
                  by: userId,
                  reason: reason || 'Approved via Approval Hub',
                },
              },
            }
          );
        }
        return { dispatch_authorized: true, request_id: id };
      }

      const payoutId = (request && request.doc_id) ? request.doc_id : id;

      // Branch on doc_type. Helpers are idempotent on terminal state.
      let result;
      if (docType === 'PAYOUT_APPROVE') {
        result = await postSinglePayoutApproval(payoutId, userId);
      } else if (docType === 'PAYOUT_REVERSE') {
        // Reversal requires a non-empty reason. The Hub passes the approver's
        // decision_reason; if blank, fall back to a sentinel so the helper
        // doesn't 400 (the original BDM-side reason is in the ApprovalRequest
        // description if needed for forensics).
        const reversalReason = (reason && reason.trim()) || `Reversed via Approval Hub (request ${String(id).slice(-6)})`;
        result = await postSinglePayoutReversal(payoutId, userId, reversalReason);
      } else {
        // PAYOUT_PAY (default — the most common authority-gates-then-pays flow).
        // No paid_via passed: the helper falls through to CASH_ON_HAND inside
        // postSettlementJournal. Subscribers who want the Hub to pick a specific
        // PaymentMode at approve time can extend the request UI to capture it
        // and pass via approve_data — out of scope for PC3.
        result = await postSinglePayoutPayment(payoutId, userId);
      }

      // Close the originating ApprovalRequest. The shared auto-resolve at L1130-1160
      // keys on `{ doc_id: id }` (Group A id-semantics where id IS the underlying doc),
      // which never matches Group B items (id IS the ApprovalRequest._id). Without this
      // explicit close, the request would stay PENDING in the Hub after a successful approve.
      if (request) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id resolved from gated approver via entity-scoped list above
        await ApprovalRequest.updateOne(
          { _id: id, status: 'PENDING' },
          {
            $set: {
              status: 'APPROVED',
              decided_by: userId,
              decided_at: new Date(),
              decision_reason: reason || 'Approved via Approval Hub',
            },
            $push: {
              history: {
                status: 'APPROVED',
                by: userId,
                reason: reason || 'Approved via Approval Hub',
              },
            },
          }
        );
      }

      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: payoutId resolved from gated approver via entity-scoped list above
      return await IncentivePayout.findById(payoutId).lean();
    }
    throw new Error(`Unsupported action for incentive_payout: ${action}`);
  },
};

/**
 * Phase G6.7 — Shared reject path for Group B modules.
 *
 * Loads the ApprovalRequest by id, derefs to the source doc via doc_id, validates the
 * source doc isn't already in a terminal state, then sets status='REJECTED' + reason.
 *
 * This is intentionally additive: it does NOT touch journals, period locks, or
 * gateApproval — it only updates the contractor-visible status + reason. The
 * universalApprove caller handles ApprovalRequest resolution after this returns.
 *
 * Period-lock note: rejection does NOT change financial state — no JE is created or
 * reversed. Period locks gate POSTING (the happy path), not rejection of pre-post
 * documents. So no periodLockCheck is needed here, in line with Rule #20 (locks
 * protect ledger integrity, not contractor-visible status fields).
 */
async function buildGroupBReject({ actionType, id, action, userId, reason, modelByDocType, fallbackModel, terminalStates }) {
  if (action !== 'reject') {
    throw new Error(`Unsupported action for ${actionType}: ${action} — only 'reject' is supported via Group B handler`);
  }

  const mongoose = require('mongoose');
  const ApprovalRequest = require('../models/ApprovalRequest');

  // The id we receive may be either an ApprovalRequest._id (gap module path) or the
  // source doc _id directly (if this handler is ever invoked outside the Hub).
  // Try ApprovalRequest first; fall back to source doc lookup.
  // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
  const request = await ApprovalRequest.findById(id).lean();

  let modelName, docId;
  if (request && request.doc_id) {
    modelName = (modelByDocType && modelByDocType[request.doc_type]) || fallbackModel;
    docId = request.doc_id;
  } else {
    // No request found — assume id is the source doc id directly
    modelName = fallbackModel;
    docId = id;
  }

  if (!modelName) {
    throw new Error(`No source model resolved for ${actionType} (doc_type=${request?.doc_type})`);
  }

  let Model;
  try {
    Model = mongoose.model(modelName);
  } catch (err) {
    throw new Error(`Model ${modelName} not registered: ${err.message}`);
  }

  const doc = await Model.findById(docId);
  if (!doc) throw new Error(`${modelName} not found (id=${docId})`);

  if (terminalStates && terminalStates.includes(doc.status)) {
    throw new Error(`Cannot reject ${modelName} in terminal state ${doc.status} — use reverse/void instead`);
  }

  doc.status = 'REJECTED';
  doc.rejection_reason = reason;
  doc.rejected_by = userId;
  doc.rejected_at = new Date();
  await doc.save();
  return doc;
}

/**
 * GET /api/erp/approvals/universal-pending
 */
const getUniversalPendingEndpoint = catchAsync(async (req, res) => {
  // Phase 34: pass full user object for sub-permission checks
  const entityIds = req.user.entity_ids || (req.user.entity_id ? [req.user.entity_id] : []);
  const items = await getUniversalPending(req.entityId, req.user, entityIds);
  res.json({ success: true, data: items, count: items.length });
});

/**
 * POST /api/erp/approvals/universal-approve
 * Body: { type, id, action, reason? }
 * type: 'approval_request' | 'deduction_schedule' | 'income_report' | 'grn' | 'payslip' | 'kpi_rating' | 'sales_line' | 'collection' | 'smer_entry' | 'car_logbook' | 'expense_entry' | 'prf_calf'
 * action: 'approve' | 'reject' | 'review' | 'credit' | 'post'
 */
const universalApprove = catchAsync(async (req, res) => {
  const { type, id, action, reason } = req.body;

  if (!type || !id || !action) {
    return res.status(400).json({ success: false, message: 'type, id, and action are required' });
  }

  if (action === 'reject' && !reason?.trim()) {
    return res.status(400).json({ success: false, message: 'Reason is required for rejection' });
  }

  const handler = approvalHandlers[type];
  if (!handler) {
    return res.status(400).json({ success: false, message: `Unknown approval type: ${type}` });
  }

  // Phase 34: sub-permission check — user must have the module's approval sub-permission
  // Phase G4.1: for `approval_request`, dereference the request to derive the
  // real module key (APPROVAL_REQUEST has sub_key=null by design — the gate has
  // to key on the underlying module like EXPENSES/PURCHASING).
  let moduleKey = TYPE_TO_MODULE[type];
  if (type === 'approval_request') {
    try {
      const ApprovalRequest = require('../models/ApprovalRequest');
      // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: id from gated approver via entity-scoped list; see top-of-file note
      const reqDoc = await ApprovalRequest.findById(id).select('module').lean();
      if (reqDoc?.module) moduleKey = reqDoc.module;
    } catch (err) {
      console.error('Approval request module lookup failed:', err.message);
    }
  }
  const subKey = moduleKey ? MODULE_TO_SUB_KEY[moduleKey] : null;
  if (subKey && !hasApprovalSub(req.user, subKey)) {
    return res.status(403).json({
      success: false,
      message: `Access denied: approvals.${subKey} sub-permission required`,
    });
  }

  const result = await handler(id, action, req.user._id, reason);

  // Phase G4 — Resolve any open default-roles ApprovalRequest for this doc.
  // Closes the audit loop: when an approver acts in the Hub, mark the synthetic
  // request as APPROVED/REJECTED so it stops appearing in the Authority Matrix list.
  // Skipped for 'approval_request' / 'perdiem_override' (handler manages its own request).
  if (!['approval_request', 'perdiem_override'].includes(type)) {
    try {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const decisionStatus = (action === 'reject') ? 'REJECTED'
        : (['post', 'approve', 'credit'].includes(action)) ? 'APPROVED'
        : null;
      if (decisionStatus) {
        // eslint-disable-next-line vip-tenant/require-entity-filter -- approval-hub: doc_id from gated approver via entity-scoped list; see top-of-file note
        await ApprovalRequest.updateMany(
          { doc_id: id, status: 'PENDING' },
          {
            $set: {
              status: decisionStatus,
              decided_by: req.user._id,
              decided_at: new Date(),
              decision_reason: reason || `${action} via Approval Hub`,
            },
            $push: {
              history: {
                status: decisionStatus,
                by: req.user._id,
                reason: reason || `${action} via Approval Hub`,
              },
            },
          }
        );
      }
    } catch (err) {
      console.error('Approval request resolution failed:', err.message);
    }
  }

  res.json({ success: true, data: result, message: `${action} successful` });
});

// ═══ Phase G3: Universal Quick-Edit (typo fixes before approving) ═══

// Model map — lazy-loaded to avoid circular deps (mirrors approvalHandlers pattern)
const MODEL_MAP = {
  deduction_schedule: () => require('../models/DeductionSchedule'),
  income_report:      () => require('../models/IncomeReport'),
  sales_line:         () => require('../models/SalesLine'),
  collection:         () => require('../models/Collection'),
  smer_entry:         () => require('../models/SmerEntry'),
  car_logbook:        () => require('../models/CarLogbookEntry'),
  credit_note:        () => require('../models/CreditNote'),
  expense_entry:      () => require('../models/ExpenseEntry'),
  prf_calf:           () => require('../models/PrfCalf'),
  grn:                () => require('../models/GrnEntry'),
  // Phase 32 — Undertaking (receipt-confirmation doc). Editable only in DRAFT; the
  // Approval Hub surfaces SUBMITTED, but edits aren't allowed there (approver decides).
  undertaking:        () => require('../models/Undertaking'),
};

// Statuses that appear in the Approval Hub — only these are editable
const EDITABLE_STATUSES = {
  deduction_schedule: ['PENDING_APPROVAL'],
  income_report:      ['GENERATED', 'REVIEWED'],
  sales_line:         ['VALID'],
  collection:         ['VALID'],
  smer_entry:         ['VALID'],
  car_logbook:        ['VALID'],
  credit_note:        ['VALID'],
  expense_entry:      ['VALID'],
  prf_calf:           ['VALID'],
  grn:                ['PENDING'],
  // Phase 32R — Undertaking is read-only (capture is on GRN; UT just mirrors +
  // acknowledges). Approval Hub cannot quick-edit the UT because there are no
  // editable line fields. To fix a mistake, the BDM must reverse the GRN and
  // re-capture.
  undertaking:        [],
};

/**
 * PATCH /api/erp/approvals/universal-edit
 * Body: { type, id, updates, edit_reason? }
 *
 * Quick-edit whitelisted fields on a pending document (lookup-driven).
 * Editable fields come from APPROVAL_EDITABLE_FIELDS lookup (entity-scoped).
 *
 * Phase 34: also supports line-item edits via updates.line_items array.
 *   updates.line_items: [{ index: 0, qty: 5, unit_price: 100 }, ...]
 *   Allowed line-item fields come from APPROVAL_EDITABLE_LINE_FIELDS lookup.
 */
const universalEdit = catchAsync(async (req, res) => {
  const { type, id, updates, edit_reason } = req.body;

  if (!type || !id || !updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, message: 'type, id, and updates object are required' });
  }

  // Phase 34: sub-permission check
  const moduleKey = TYPE_TO_MODULE[type];
  const subKey = moduleKey ? MODULE_TO_SUB_KEY[moduleKey] : null;
  if (subKey && !hasApprovalSub(req.user, subKey)) {
    return res.status(403).json({
      success: false,
      message: `Access denied: approvals.${subKey} sub-permission required`,
    });
  }

  // 1. Check model exists for this type
  const getModel = MODEL_MAP[type];
  if (!getModel) {
    return res.status(400).json({ success: false, message: `Type "${type}" does not support quick-edit` });
  }

  // 2. Fetch lookup-driven editable fields for this entity + type
  const lookupCode = type.toUpperCase();
  const lookupEntry = await Lookup.findOne({
    entity_id: req.entityId,
    category: 'APPROVAL_EDITABLE_FIELDS',
    code: lookupCode,
    is_active: true
  }).lean();

  // Auto-seed if not found (first access)
  let allowedFields = lookupEntry?.metadata?.fields;
  if (!allowedFields) {
    const { SEED_DEFAULTS } = require('./lookupGenericController');
    const seeds = SEED_DEFAULTS.APPROVAL_EDITABLE_FIELDS || [];
    const seedEntry = seeds.find(s => s.code === lookupCode);
    if (seedEntry) {
      await Lookup.updateOne(
        { entity_id: req.entityId, category: 'APPROVAL_EDITABLE_FIELDS', code: lookupCode },
        { $setOnInsert: { label: seedEntry.label, sort_order: 0, is_active: true, metadata: seedEntry.metadata || {} } },
        { upsert: true }
      );
      allowedFields = seedEntry.metadata?.fields;
    }
  }

  // Phase 34: fetch allowed line-item fields (separate lookup category)
  let allowedLineFields = null;
  const lineItemUpdates = updates.line_items;
  if (Array.isArray(lineItemUpdates) && lineItemUpdates.length > 0) {
    const lineFieldEntry = await Lookup.findOne({
      entity_id: req.entityId,
      category: 'APPROVAL_EDITABLE_LINE_FIELDS',
      code: lookupCode,
      is_active: true
    }).lean();

    let lineFields = lineFieldEntry?.metadata?.fields;
    if (!lineFields) {
      const { SEED_DEFAULTS } = require('./lookupGenericController');
      const lineSeeds = SEED_DEFAULTS.APPROVAL_EDITABLE_LINE_FIELDS || [];
      const lineSeed = lineSeeds.find(s => s.code === lookupCode);
      if (lineSeed) {
        await Lookup.updateOne(
          { entity_id: req.entityId, category: 'APPROVAL_EDITABLE_LINE_FIELDS', code: lookupCode },
          { $setOnInsert: { label: lineSeed.label, sort_order: 0, is_active: true, metadata: lineSeed.metadata || {} } },
          { upsert: true }
        );
        lineFields = lineSeed.metadata?.fields;
      }
    }
    allowedLineFields = lineFields || [];
  }

  // Check that at least one type of edit is possible
  const hasTopLevelUpdates = Object.keys(updates).some(k => k !== 'line_items');
  const hasLineUpdates = allowedLineFields && lineItemUpdates && lineItemUpdates.length > 0;

  if (!hasTopLevelUpdates && !hasLineUpdates) {
    if (!allowedFields?.length && !allowedLineFields?.length) {
      return res.status(400).json({ success: false, message: `No editable fields configured for type "${type}"` });
    }
  }

  // 3. Filter top-level updates to only whitelisted fields
  const safeUpdates = {};
  if (allowedFields && allowedFields.length > 0) {
    for (const [field, newValue] of Object.entries(updates)) {
      if (field !== 'line_items' && allowedFields.includes(field)) {
        safeUpdates[field] = newValue;
      }
    }
  }

  // 4. Load the document
  const Model = getModel();
  const doc = await Model.findById(id);
  if (!doc) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }

  // 5. Verify document is in an editable (pending) status
  const allowedStatuses = EDITABLE_STATUSES[type] || [];
  if (!allowedStatuses.includes(doc.status)) {
    return res.status(400).json({
      success: false,
      message: `Document status "${doc.status}" is not editable. Must be: ${allowedStatuses.join(', ')}`
    });
  }

  // 6. Apply top-level updates and build change log
  const changes = [];
  for (const [field, newValue] of Object.entries(safeUpdates)) {
    const oldValue = doc[field];
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      changes.push({ field, old_value: oldValue, new_value: newValue });
      doc[field] = newValue;
    }
  }

  // Phase 34: apply line-item updates
  if (hasLineUpdates && allowedLineFields.length > 0) {
    const docLines = doc.line_items || doc.lines || [];
    for (const lineUpdate of lineItemUpdates) {
      const idx = lineUpdate.index;
      if (idx === undefined || idx < 0 || idx >= docLines.length) continue;

      const line = docLines[idx];
      for (const [field, newValue] of Object.entries(lineUpdate)) {
        if (field === 'index') continue;
        if (!allowedLineFields.includes(field)) continue;

        const oldValue = line[field];
        if (String(oldValue ?? '') !== String(newValue ?? '')) {
          changes.push({
            field: `line_items[${idx}].${field}`,
            old_value: oldValue,
            new_value: newValue,
          });
          line[field] = newValue;

          // Recalculate line_total for sales lines
          if ((field === 'qty' || field === 'unit_price') && line.unit_price !== undefined && line.qty !== undefined) {
            line.line_total = (Number(line.qty) || 0) * (Number(line.unit_price) || 0);
          }
          // Recalculate line_total for expense lines
          if (field === 'amount') {
            line.amount = Number(newValue) || 0;
          }
        }
      }
    }

    // Recalculate document totals after line-item changes
    if (doc.line_items && changes.some(c => c.field.startsWith('line_items'))) {
      // Sales: invoice_total = sum of line_totals
      if (type === 'sales_line') {
        doc.invoice_total = doc.line_items.reduce((sum, li) => sum + (li.line_total || 0), 0);
      }
      // Expenses: total_amount = sum of line amounts
      if (type === 'expense_entry' && doc.lines) {
        doc.total_amount = doc.lines.reduce((sum, li) => sum + (li.amount || 0), 0);
      }
      doc.markModified('line_items');
    }
    if (doc.lines && changes.some(c => c.field.startsWith('line_items'))) {
      doc.markModified('lines');
    }
  }

  if (changes.length === 0) {
    return res.json({ success: true, data: doc, message: 'No changes detected' });
  }

  // 7. Push audit entry
  if (!doc.edit_history) doc.edit_history = [];
  doc.edit_history.push({
    edited_by: req.user._id,
    edited_at: new Date(),
    changes,
    edit_reason: edit_reason || 'Quick edit from Approval Hub'
  });

  await doc.save();

  res.json({ success: true, data: doc, message: `Updated ${changes.length} field(s)` });
});

module.exports = {
  getUniversalPendingEndpoint,
  universalApprove,
  universalEdit,
  // Phase G7.2 — exported so copilotToolRegistry can route DRAFT_REJECTION_REASON
  // through the SAME handler path /universal-approve uses (Rule #20 — never
  // bypass gateApproval/period locks; for rejection, the handler is the gate).
  approvalHandlers,
  TYPE_TO_MODULE,
};
