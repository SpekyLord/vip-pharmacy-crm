/**
 * Universal Approval Service — Aggregates pending items from ALL ERP modules
 *
 * Queries each module in parallel, returns normalized items for the Approval Hub.
 * Authorization: checks ApprovalRules to determine who sees what.
 * President always sees everything. Delegated users see modules they're assigned to.
 *
 * Scalable: modules registered in PENDING_QUERIES array — add new module = add query function.
 */
const mongoose = require('mongoose');
const { ROLES } = require('../../constants/roles');

// Models
const ApprovalRequest = require('../models/ApprovalRequest');
const DeductionSchedule = require('../models/DeductionSchedule');
const IncomeReport = require('../models/IncomeReport');
const GrnEntry = require('../models/GrnEntry');
const ApprovalRule = require('../models/ApprovalRule');

// Lazy-load optional models (may not exist in all deployments)
function getModel(name) {
  try { return mongoose.model(name); } catch { return null; }
}

/**
 * Module query registry — each entry defines how to fetch pending items for one module.
 * To add a new module: push a new entry here. No switch/if chains.
 */
const MODULE_QUERIES = [
  {
    module: 'APPROVAL_REQUEST',
    label: 'Authority Matrix',
    query: async (entityId) => {
      const items = await ApprovalRequest.find({ entity_id: entityId, status: 'PENDING' })
        .populate('requested_by', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `APPROVAL_REQUEST:${item._id}`,
        module: item.module || 'APPROVAL_REQUEST',
        doc_type: item.doc_type || 'APPROVAL',
        doc_id: item._id,
        doc_ref: item.doc_ref || `REQ-${String(item._id).slice(-6)}`,
        description: item.description || `${item.module} approval — ${item.doc_ref || 'pending'}`,
        amount: item.amount || 0,
        submitted_by: item.requested_by?.name || 'Unknown',
        submitted_at: item.requested_at || item.createdAt,
        status: 'PENDING_APPROVAL',
        current_action: 'Approve',
        action_key: 'APPROVE',
        approve_data: { type: 'approval_request', id: item._id }
      }));
    },
    allowed_roles: null // uses ApprovalRule resolution
  },
  {
    module: 'DEDUCTION_SCHEDULE',
    label: 'Deduction Schedules',
    query: async (entityId) => {
      const items = await DeductionSchedule.find({ entity_id: entityId, status: 'PENDING_APPROVAL' })
        .populate('bdm_id', 'name email')
        .sort({ created_at: -1 })
        .lean();
      return items.map(item => ({
        id: `DEDUCTION_SCHEDULE:${item._id}`,
        module: 'DEDUCTION_SCHEDULE',
        doc_type: item.term_months === 1 ? 'ONE_TIME' : 'INSTALLMENT',
        doc_id: item._id,
        doc_ref: item.schedule_code,
        description: `${item.bdm_id?.name || 'BDM'} — ${item.deduction_label} ${item.term_months > 1 ? `₱${item.installment_amount}/mo × ${item.term_months}` : ''}`,
        amount: item.total_amount,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.created_at,
        status: 'PENDING_APPROVAL',
        current_action: 'Approve',
        action_key: 'APPROVE',
        approve_data: { type: 'deduction_schedule', id: item._id },
        details: {
          deduction_type: item.deduction_type,
          deduction_label: item.deduction_label,
          total_amount: item.total_amount,
          term_months: item.term_months,
          installment_amount: item.installment_amount,
          start_period: item.start_period,
          description: item.description,
          installments: (item.installments || []).map(i => ({
            period: i.period, installment_no: i.installment_no, amount: i.amount, status: i.status
          }))
        }
      }));
    },
    allowed_roles: ['admin', 'finance', 'president']
  },
  {
    module: 'INCOME',
    label: 'Income Reports',
    query: async (entityId) => {
      const items = await IncomeReport.find({
        entity_id: entityId,
        status: { $in: ['GENERATED', 'BDM_CONFIRMED'] }
      })
        .populate('bdm_id', 'name email')
        .sort({ updatedAt: -1 })
        .lean();
      return items.map(item => ({
        id: `INCOME:${item._id}`,
        module: 'INCOME',
        doc_type: 'INCOME_REPORT',
        doc_id: item._id,
        doc_ref: `${item.period}-${item.cycle}`,
        description: `${item.bdm_id?.name || 'BDM'} — ${item.period} ${item.cycle} — Net: ₱${(item.net_pay || 0).toLocaleString()}`,
        amount: item.total_earnings || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.updatedAt || item.created_at,
        status: item.status === 'GENERATED' ? 'PENDING_REVIEW' : 'PENDING_CREDIT',
        current_action: item.status === 'GENERATED' ? 'Review' : 'Credit',
        action_key: item.status === 'GENERATED' ? 'REVIEW' : 'CREDIT',
        approve_data: {
          type: 'income_report',
          id: item._id,
          action: item.status === 'GENERATED' ? 'review' : 'credit'
        },
        details: {
          period: item.period,
          cycle: item.cycle,
          earnings: item.earnings,
          total_earnings: item.total_earnings,
          deduction_lines: (item.deduction_lines || []).map(l => ({
            deduction_label: l.deduction_label, amount: l.amount, status: l.status,
            auto_source: l.auto_source, description: l.description
          })),
          total_deductions: item.total_deductions,
          net_pay: item.net_pay
        }
      }));
    },
    allowed_roles: ['admin', 'finance', 'president']
  },
  {
    module: 'INVENTORY',
    label: 'GRN (Goods Receipt)',
    query: async (entityId) => {
      const items = await GrnEntry.find({ entity_id: entityId, status: 'PENDING' })
        .populate('bdm_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `INVENTORY:${item._id}`,
        module: 'INVENTORY',
        doc_type: 'GRN',
        doc_id: item._id,
        doc_ref: item.grn_ref || `GRN-${String(item._id).slice(-6)}`,
        description: `${item.bdm_id?.name || 'BDM'} — ${(item.line_items || []).length} item(s) received`,
        amount: 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_APPROVAL',
        current_action: 'Approve',
        action_key: 'APPROVE',
        approve_data: { type: 'grn', id: item._id },
        details: {
          grn_date: item.grn_date,
          line_items: (item.line_items || []).map(li => ({
            item_key: li.item_key, batch_lot_no: li.batch_lot_no,
            expiry_date: li.expiry_date, qty: li.qty
          })),
          notes: item.notes
        }
      }));
    },
    allowed_roles: ['admin', 'finance']
  },
  {
    module: 'PAYROLL',
    label: 'Payslips',
    query: async (entityId) => {
      const Payslip = getModel('Payslip');
      if (!Payslip) return [];
      const items = await Payslip.find({
        entity_id: entityId,
        status: { $in: ['COMPUTED', 'REVIEWED'] }
      })
        .populate('person_id', 'name email')
        .sort({ updatedAt: -1 })
        .lean();
      return items.map(item => ({
        id: `PAYROLL:${item._id}`,
        module: 'PAYROLL',
        doc_type: 'PAYSLIP',
        doc_id: item._id,
        doc_ref: `${item.period}-${item.cycle || 'MONTHLY'}`,
        description: `${item.person_id?.name || 'Employee'} — ${item.period} — Net: ₱${(item.net_pay || 0).toLocaleString()}`,
        amount: item.net_pay || 0,
        submitted_by: item.person_id?.name || 'Unknown',
        submitted_at: item.updatedAt,
        status: item.status === 'COMPUTED' ? 'PENDING_REVIEW' : 'PENDING_APPROVAL',
        current_action: item.status === 'COMPUTED' ? 'Review' : 'Approve',
        action_key: item.status === 'COMPUTED' ? 'REVIEW' : 'APPROVE',
        approve_data: {
          type: 'payslip',
          id: item._id,
          action: item.status === 'COMPUTED' ? 'review' : 'approve'
        },
        details: {
          period: item.period, cycle: item.cycle,
          earnings: item.earnings, deductions: item.deductions,
          total_earnings: item.total_earnings, total_deductions: item.total_deductions,
          net_pay: item.net_pay
        }
      }));
    },
    allowed_roles: ['admin', 'finance', 'president']
  },
  {
    module: 'KPI',
    label: 'KPI Ratings',
    query: async (entityId) => {
      const KpiSelfRating = getModel('KpiSelfRating');
      if (!KpiSelfRating) return [];
      const items = await KpiSelfRating.find({
        entity_id: entityId,
        status: { $in: ['SUBMITTED', 'REVIEWED'] }
      })
        .populate('person_id', 'name email')
        .sort({ updatedAt: -1 })
        .lean();
      return items.map(item => ({
        id: `KPI:${item._id}`,
        module: 'KPI',
        doc_type: 'KPI_RATING',
        doc_id: item._id,
        doc_ref: `${item.period || ''} ${item.period_type || ''}`.trim(),
        description: `${item.person_id?.name || 'Member'} — ${item.period_type || ''} self-rating`,
        amount: 0,
        submitted_by: item.person_id?.name || 'Unknown',
        submitted_at: item.submitted_at || item.updatedAt,
        status: item.status === 'SUBMITTED' ? 'PENDING_REVIEW' : 'PENDING_APPROVAL',
        current_action: item.status === 'SUBMITTED' ? 'Review' : 'Approve',
        action_key: item.status === 'SUBMITTED' ? 'REVIEW' : 'APPROVE',
        approve_data: {
          type: 'kpi_rating',
          id: item._id,
          action: item.status === 'SUBMITTED' ? 'review' : 'approve'
        },
        details: {
          period: item.period, period_type: item.period_type,
          kpi_ratings: (item.kpi_ratings || []).map(k => ({
            kpi_code: k.kpi_code, kpi_name: k.kpi_name,
            self_score: k.self_score, self_comment: k.self_comment,
            manager_score: k.manager_score
          })),
          overall_self_score: item.overall_self_score,
          overall_manager_score: item.overall_manager_score
        }
      }));
    },
    allowed_roles: ['admin', 'president']
  }
];

/**
 * Check if a user is authorized for a module.
 * 1. If ApprovalRules exist for this module → check if user matches any rule
 * 2. If no rules → fall back to module's allowed_roles
 * 3. President always authorized
 */
async function isAuthorizedForModule(entityId, userId, userRole, moduleEntry) {
  // President always sees everything
  if ([ROLES.PRESIDENT, ROLES.CEO].includes(userRole)) return true;

  // Check ApprovalRules for delegation
  const rules = await ApprovalRule.find({
    entity_id: entityId,
    module: moduleEntry.module,
    is_active: true
  }).lean();

  if (rules.length > 0) {
    for (const rule of rules) {
      if (rule.approver_type === 'ROLE' && (rule.approver_roles || []).includes(userRole)) {
        return true;
      }
      if (rule.approver_type === 'USER' && (rule.approver_user_ids || []).some(id => id.toString() === userId.toString())) {
        return true;
      }
      // REPORTS_TO checked per-item (skip at module level)
    }
    return false;
  }

  // No rules defined → use module's default allowed_roles
  if (!moduleEntry.allowed_roles) return true; // null = open (e.g., authority matrix items)
  return moduleEntry.allowed_roles.includes(userRole);
}

/**
 * Get all pending items across all modules for a user.
 * President/CEO: queries across ALL entities (cross-entity view).
 * Other roles: queries only their working entity.
 * Returns normalized array sorted by submitted_at descending.
 */
async function getUniversalPending(entityId, userId, userRole, entityIds) {
  const isPresidentLike = [ROLES.PRESIDENT, ROLES.CEO].includes(userRole);

  // Determine which entities to query
  let entitiesToQuery;
  if (isPresidentLike) {
    // President sees all entities — query without entity filter
    const Entity = getModel('Entity');
    if (Entity) {
      const allEntities = await Entity.find({ status: { $ne: 'INACTIVE' } }).select('_id').lean();
      entitiesToQuery = allEntities.map(e => e._id);
    } else {
      entitiesToQuery = entityIds || [entityId];
    }
  } else if (entityIds && entityIds.length > 1) {
    // Multi-entity user — query all their entities
    entitiesToQuery = entityIds;
  } else {
    entitiesToQuery = [entityId];
  }

  // Filter to modules this user is authorized for
  const authorizedModules = [];
  for (const mod of MODULE_QUERIES) {
    const auth = await isAuthorizedForModule(entityId, userId, userRole, mod);
    if (auth) authorizedModules.push(mod);
  }

  // Query all authorized modules across all entities in parallel
  const results = await Promise.all(
    authorizedModules.flatMap(mod =>
      entitiesToQuery.map(async (eid) => {
        try {
          return await mod.query(eid);
        } catch (err) {
          console.error(`Universal approval query error [${mod.module}/${eid}]:`, err.message);
          return [];
        }
      })
    )
  );

  // Flatten, deduplicate by id, and sort by submitted_at descending
  const seen = new Set();
  const allItems = results.flat().filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  return allItems;
}

module.exports = {
  getUniversalPending,
  MODULE_QUERIES
};
