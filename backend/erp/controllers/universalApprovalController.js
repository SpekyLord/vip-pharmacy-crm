/**
 * Universal Approval Controller — Approval Hub endpoints
 *
 * GET  /universal-pending — all pending items across all modules
 * POST /universal-approve — approve/reject any item from the hub (routes to module's own logic)
 * PATCH /universal-edit   — quick-edit whitelisted fields before approving (Phase G3)
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
  expense_entry: 'EXPENSES',
  prf_calf: 'PRF_CALF',
  payslip: 'PAYROLL',
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
};

// Module-specific approval handlers (lazy-loaded to avoid circular deps)
const approvalHandlers = {
  approval_request: async (id, action, userId, reason) => {
    const { processDecision } = require('../services/approvalService');
    return processDecision(id, action === 'approve' ? 'APPROVED' : 'REJECTED', userId, reason);
  },

  perdiem_override: async (id, action, userId, reason) => {
    const { processDecision } = require('../services/approvalService');
    const result = await processDecision(id, action === 'approve' ? 'APPROVED' : 'REJECTED', userId, reason);

    // Auto-apply or revert the override on the SMER daily entry
    const ApprovalRequest = require('../models/ApprovalRequest');
    const request = await ApprovalRequest.findById(id).lean();
    if (request?.doc_id) {
      const SmerEntry = require('../models/SmerEntry');
      const smer = await SmerEntry.findOne({ _id: request.doc_id, status: { $in: ['DRAFT', 'ERROR'] } });
      if (smer) {
        const entryId = request.metadata?.entry_id
          || request.description?.match(/Entry ID: (.+)$/)?.[1];  // fallback for pre-metadata requests
        const entry = entryId ? smer.daily_entries.id(entryId) : null;

        if (entry) {
          if (action === 'approve') {
            const tier = request.metadata?.override_tier
              || request.description?.match(/→ (FULL|HALF)/)?.[1];
            const rsn = request.metadata?.override_reason || 'Approved override';
            if (tier) {
              const Settings = require('../models/Settings');
              const { computePerdiemAmount } = require('../services/perdiemCalc');
              const settings = await Settings.getSettings();
              const { amount } = computePerdiemAmount(tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings);

              const oldTier = entry.perdiem_tier;
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
            }
          } else {
            // Rejected — clear pending state, keep computed amount
            entry.override_status = 'REJECTED';
            entry.requested_override_tier = undefined;
          }
          await smer.save();
        }
      }
    }
    return result;
  },

  deduction_schedule: async (id, action, userId, reason) => {
    const svc = require('../services/deductionScheduleService');
    if (action === 'approve') return svc.approveSchedule(id, userId);
    if (action === 'reject') return svc.rejectSchedule(id, userId, reason || 'Rejected from Approval Hub');
    throw new Error(`Unknown action: ${action}`);
  },

  income_report: async (id, action, userId, reason) => {
    if (action === 'reject') {
      const IncomeReport = require('../models/IncomeReport');
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

  kpi_rating: async (id, action, userId, reason) => {
    const KpiSelfRating = require('../models/KpiSelfRating');
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
    const CarLogbookEntry = require('../models/CarLogbookEntry');
    const doc = await CarLogbookEntry.findById(id);
    if (!doc) throw new Error('Car logbook entry not found');
    // Post/reject ALL VALID entries for same BDM + period + cycle (not just this one)
    // Car logbook has separate documents per day, but approval is per-batch
    const batchFilter = { entity_id: doc.entity_id, bdm_id: doc.bdm_id, period: doc.period, cycle: doc.cycle, status: 'VALID' };
    if (action === 'post') {
      const allValid = await CarLogbookEntry.find(batchFilter);
      const { postSingleCarLogbook } = require('./expenseController');
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

  expense_entry: async (id, action, userId, reason) => {
    const ExpenseEntry = require('../models/ExpenseEntry');
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

  purchasing: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'purchasing', id, action, userId, reason,
    modelByDocType: { SUPPLIER_INVOICE: 'SupplierInvoice' },
    fallbackModel: 'PurchaseOrder',
    terminalStates: ['POSTED', 'CLOSED', 'CANCELLED'],
  }),

  journal: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'journal', id, action, userId, reason,
    modelByDocType: { JOURNAL_ENTRY: 'JournalEntry' },
    fallbackModel: 'JournalEntry',
    terminalStates: ['POSTED', 'VOID'],
  }),

  banking: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'banking', id, action, userId, reason,
    modelByDocType: { BANK_RECON: 'BankStatement' },
    fallbackModel: 'BankStatement',
    terminalStates: ['FINALIZED'],
  }),

  ic_transfer: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'ic_transfer', id, action, userId, reason,
    modelByDocType: { IC_TRANSFER: 'InterCompanyTransfer', IC_SETTLEMENT: 'IcSettlement' },
    fallbackModel: 'InterCompanyTransfer',
    terminalStates: ['POSTED', 'CANCELLED', 'RECEIVED'],
  }),

  petty_cash: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'petty_cash', id, action, userId, reason,
    modelByDocType: { DISBURSEMENT: 'PettyCashTransaction', DEPOSIT: 'PettyCashTransaction' },
    fallbackModel: 'PettyCashTransaction',
    terminalStates: ['POSTED', 'VOIDED'],
  }),

  sales_goal_plan: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'sales_goal_plan', id, action, userId, reason,
    modelByDocType: { SALES_GOAL_PLAN: 'SalesGoalPlan' },
    fallbackModel: 'SalesGoalPlan',
    terminalStates: ['CLOSED'],
  }),

  incentive_payout: async (id, action, userId, reason) => buildGroupBReject({
    actionType: 'incentive_payout', id, action, userId, reason,
    modelByDocType: { INCENTIVE_PAYOUT: 'IncentivePayout' },
    fallbackModel: 'IncentivePayout',
    terminalStates: ['PAID', 'REVERSED'],
  }),
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
  const moduleKey = TYPE_TO_MODULE[type];
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
  expense_entry:      () => require('../models/ExpenseEntry'),
  prf_calf:           () => require('../models/PrfCalf'),
  grn:                () => require('../models/GrnEntry'),
};

// Statuses that appear in the Approval Hub — only these are editable
const EDITABLE_STATUSES = {
  deduction_schedule: ['PENDING_APPROVAL'],
  income_report:      ['GENERATED', 'REVIEWED'],
  sales_line:         ['VALID'],
  collection:         ['VALID'],
  smer_entry:         ['VALID'],
  car_logbook:        ['VALID'],
  expense_entry:      ['VALID'],
  prf_calf:           ['VALID'],
  grn:                ['PENDING'],
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
  universalEdit
};
