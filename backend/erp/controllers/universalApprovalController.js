/**
 * Universal Approval Controller — Approval Hub endpoints
 *
 * GET  /universal-pending — all pending items across all modules
 * POST /universal-approve — approve/reject any item from the hub (routes to module's own logic)
 * PATCH /universal-edit   — quick-edit whitelisted fields before approving (Phase G3)
 */
const { catchAsync } = require('../../middleware/errorHandler');
const { getUniversalPending } = require('../services/universalApprovalService');
const Lookup = require('../models/Lookup');

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
      rating.status = 'REJECTED';
      rating.rejection_reason = reason;
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
      await postSaleRow(doc, userId);
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [{ message: reason }];
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
      doc.status = 'POSTED';
      doc.posted_by = userId;
      doc.posted_at = new Date();
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [{ message: reason }];
    }
    await doc.save();
    return doc;
  },

  smer_entry: async (id, action, userId, reason) => {
    const SmerEntry = require('../models/SmerEntry');
    const doc = await SmerEntry.findById(id);
    if (!doc) throw new Error('SMER entry not found');
    if (doc.status !== 'VALID') throw new Error('SMER not in VALID status');
    if (action === 'post') {
      doc.status = 'POSTED';
      doc.posted_by = userId;
      doc.posted_at = new Date();
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [{ message: reason }];
    }
    await doc.save();
    return doc;
  },

  car_logbook: async (id, action, userId, reason) => {
    const CarLogbookEntry = require('../models/CarLogbookEntry');
    const doc = await CarLogbookEntry.findById(id);
    if (!doc) throw new Error('Car logbook entry not found');
    if (doc.status !== 'VALID') throw new Error('Car logbook not in VALID status');
    if (action === 'post') {
      doc.status = 'POSTED';
      doc.posted_by = userId;
      doc.posted_at = new Date();
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [{ message: reason }];
    }
    await doc.save();
    return doc;
  },

  expense_entry: async (id, action, userId, reason) => {
    const ExpenseEntry = require('../models/ExpenseEntry');
    const doc = await ExpenseEntry.findById(id);
    if (!doc) throw new Error('Expense entry not found');
    if (doc.status !== 'VALID') throw new Error('Expense entry not in VALID status');
    if (action === 'post') {
      doc.status = 'POSTED';
      doc.posted_by = userId;
      doc.posted_at = new Date();
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [{ message: reason }];
    }
    await doc.save();
    return doc;
  },

  prf_calf: async (id, action, userId, reason) => {
    const PrfCalf = require('../models/PrfCalf');
    const doc = await PrfCalf.findById(id);
    if (!doc) throw new Error('PRF/CALF not found');
    if (doc.status !== 'VALID') throw new Error('PRF/CALF not in VALID status');
    if (action === 'post') {
      doc.status = 'POSTED';
      doc.posted_by = userId;
      doc.posted_at = new Date();
    } else if (action === 'reject') {
      doc.status = 'ERROR';
      doc.rejection_reason = reason;
      doc.validation_errors = [{ message: reason }];
    }
    await doc.save();
    return doc;
  }
};

/**
 * GET /api/erp/approvals/universal-pending
 */
const getUniversalPendingEndpoint = catchAsync(async (req, res) => {
  // Pass user's entity_ids for cross-entity support (president sees all, multi-entity users see their entities)
  const entityIds = req.user.entity_ids || (req.user.entity_id ? [req.user.entity_id] : []);
  const items = await getUniversalPending(req.entityId, req.user._id, req.user.role, entityIds);
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

  const result = await handler(id, action, req.user._id, reason);
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
 */
const universalEdit = catchAsync(async (req, res) => {
  const { type, id, updates, edit_reason } = req.body;

  if (!type || !id || !updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, message: 'type, id, and updates object are required' });
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

  if (!allowedFields || allowedFields.length === 0) {
    return res.status(400).json({ success: false, message: `No editable fields configured for type "${type}"` });
  }

  // 3. Filter updates to only whitelisted fields
  const safeUpdates = {};
  const changes = [];
  for (const [field, newValue] of Object.entries(updates)) {
    if (allowedFields.includes(field)) {
      safeUpdates[field] = newValue;
    }
  }

  if (Object.keys(safeUpdates).length === 0) {
    return res.status(400).json({
      success: false,
      message: `None of the provided fields are editable. Allowed: ${allowedFields.join(', ')}`
    });
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

  // 6. Apply updates and build change log
  for (const [field, newValue] of Object.entries(safeUpdates)) {
    const oldValue = doc[field];
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      changes.push({ field, old_value: oldValue, new_value: newValue });
      doc[field] = newValue;
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
