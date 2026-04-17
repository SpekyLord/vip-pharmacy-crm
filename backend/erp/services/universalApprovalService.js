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
const Lookup = require('../models/Lookup');
const InventoryLedger = require('../models/InventoryLedger');

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
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES (null = open, governed by ApprovalRule)
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
        description: `${item.bdm_id?.name || 'BDM'} — ${item.deduction_label} ${item.term_months > 1 ? `₱${item.installment_amount}/mo × ${item.term_months}` : ''} · ${item.target_cycle || 'C2'}`,
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
          target_cycle: item.target_cycle || 'C2',
          description: item.description,
          installments: (item.installments || []).map(i => ({
            period: i.period, installment_no: i.installment_no, amount: i.amount, status: i.status
          }))
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
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
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
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
          _warehouse_id: item.warehouse_id,
          _bdm_id: item.bdm_id?._id || item.bdm_id,
          line_items: (item.line_items || []).map(li => ({
            product_id: li.product_id, item_key: li.item_key, batch_lot_no: li.batch_lot_no,
            expiry_date: li.expiry_date, qty: li.qty
          })),
          notes: item.notes
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
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
        .populate('person_id', 'full_name email')
        .sort({ updatedAt: -1 })
        .lean();
      return items.map(item => ({
        id: `PAYROLL:${item._id}`,
        module: 'PAYROLL',
        doc_type: 'PAYSLIP',
        doc_id: item._id,
        doc_ref: `${item.period}-${item.cycle || 'MONTHLY'}`,
        description: `${item.person_id?.full_name || 'Employee'} — ${item.period} — Net: ₱${(item.net_pay || 0).toLocaleString()}`,
        amount: item.net_pay || 0,
        submitted_by: item.person_id?.full_name || 'Unknown',
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
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
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
        .populate('person_id', 'full_name email')
        .sort({ updatedAt: -1 })
        .lean();
      return items.map(item => ({
        id: `KPI:${item._id}`,
        module: 'KPI',
        doc_type: 'KPI_RATING',
        doc_id: item._id,
        doc_ref: `${item.period || ''} ${item.period_type || ''}`.trim(),
        description: `${item.person_id?.full_name || 'Member'} — ${item.period_type || ''} self-rating`,
        amount: 0,
        submitted_by: item.person_id?.full_name || 'Unknown',
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
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  // ── Phase F expansion: document-posting modules (VALID → POSTED) ──
  {
    module: 'SALES',
    label: 'Sales / CSI',
    query: async (entityId) => {
      const SalesLine = getModel('SalesLine');
      if (!SalesLine) return [];
      const items = await SalesLine.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .populate('hospital_id', 'hospital_name')
        .populate('customer_id', 'customer_name')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `SALES:${item._id}`,
        module: 'SALES',
        doc_type: item.sale_type || 'CSI',
        doc_id: item._id,
        doc_ref: item.doc_ref || item.invoice_number || `INV-${String(item._id).slice(-6)}`,
        description: `${item.bdm_id?.name || 'BDM'} — ${item.sale_type || 'CSI'} ${item.doc_ref || ''} — ${(item.hospital_id?.hospital_name || item.customer_id?.customer_name || 'Customer')}`,
        amount: item.invoice_total || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'sales_line', id: item._id, action: 'post' },
        details: {
          sale_type: item.sale_type,
          csi_date: item.csi_date,
          invoice_number: item.invoice_number,
          hospital: item.hospital_id?.hospital_name,
          customer: item.customer_id?.customer_name,
          payment_mode: item.payment_mode,
          invoice_total: item.invoice_total,
          total_vat: item.total_vat,
          total_net_of_vat: item.total_net_of_vat,
          _warehouse_id: item.warehouse_id,
          _bdm_id: item.bdm_id?._id || item.bdm_id,
          line_items: (item.line_items || []).map(li => ({
            product_id: li.product_id, qty: li.qty, unit_price: li.unit_price,
            line_total: li.line_total, vat_amount: li.vat_amount
          }))
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'COLLECTION',
    label: 'Collections / CR',
    query: async (entityId) => {
      const Collection = getModel('Collection');
      if (!Collection) return [];
      const items = await Collection.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .populate('hospital_id', 'hospital_name')
        .populate('customer_id', 'customer_name')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `COLLECTION:${item._id}`,
        module: 'COLLECTION',
        doc_type: 'CR',
        doc_id: item._id,
        doc_ref: item.cr_no || `CR-${String(item._id).slice(-6)}`,
        description: `${item.bdm_id?.name || 'BDM'} — CR ${item.cr_no || ''} — ${(item.hospital_id?.hospital_name || item.customer_id?.customer_name || 'Customer')}`,
        amount: item.cr_amount || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'collection', id: item._id, action: 'post' },
        details: {
          cr_date: item.cr_date,
          cr_amount: item.cr_amount,
          hospital: item.hospital_id?.hospital_name,
          customer: item.customer_id?.customer_name,
          payment_mode: item.payment_mode,
          check_no: item.check_no,
          total_csi_amount: item.total_csi_amount,
          total_commission: item.total_commission,
          total_partner_rebates: item.total_partner_rebates,
          cwt_amount: item.cwt_amount,
          settled_csis: (item.settled_csis || []).map(c => ({
            doc_ref: c.doc_ref, invoice_amount: c.invoice_amount,
            commission_amount: c.commission_amount
          }))
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'SMER',
    label: 'SMER',
    query: async (entityId) => {
      const SmerEntry = getModel('SmerEntry');
      if (!SmerEntry) return [];
      const items = await SmerEntry.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `SMER:${item._id}`,
        module: 'SMER',
        doc_type: 'SMER',
        doc_id: item._id,
        doc_ref: `${item.period}-${item.cycle || ''}`.trim(),
        description: `${item.bdm_id?.name || 'BDM'} — ${item.period} ${item.cycle || ''} — Reimb: ₱${(item.total_reimbursable || 0).toLocaleString()}`,
        amount: item.total_reimbursable || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'smer_entry', id: item._id, action: 'post' },
        details: {
          period: item.period,
          cycle: item.cycle,
          working_days: item.working_days,
          total_perdiem: item.total_perdiem,
          total_transpo: item.total_transpo,
          total_ore: item.total_ore,
          total_reimbursable: item.total_reimbursable,
          travel_advance: item.travel_advance,
          balance_on_hand: item.balance_on_hand,
          daily_entries_count: (item.daily_entries || []).length
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'CAR_LOGBOOK',
    label: 'Car Logbook',
    query: async (entityId) => {
      const CarLogbookEntry = getModel('CarLogbookEntry');
      if (!CarLogbookEntry) return [];
      const items = await CarLogbookEntry.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `CAR_LOGBOOK:${item._id}`,
        module: 'CAR_LOGBOOK',
        doc_type: 'CAR_LOGBOOK',
        doc_id: item._id,
        doc_ref: `${item.period}-${item.cycle || ''}`.trim(),
        description: `${item.bdm_id?.name || 'BDM'} — ${item.period} ${item.cycle || ''} — ${item.total_km || 0} km`,
        amount: item.total_fuel_amount || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'car_logbook', id: item._id, action: 'post' },
        details: {
          period: item.period,
          cycle: item.cycle,
          entry_date: item.entry_date,
          total_km: item.total_km,
          official_km: item.official_km,
          personal_km: item.personal_km,
          total_fuel_amount: item.total_fuel_amount,
          official_gas_amount: item.official_gas_amount,
          personal_gas_amount: item.personal_gas_amount,
          actual_liters: item.actual_liters,
          km_per_liter: item.km_per_liter,
          overconsumption_flag: item.overconsumption_flag,
          fuel_entries_count: (item.fuel_entries || []).length
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'EXPENSES',
    label: 'Expenses (ORE/ACCESS)',
    query: async (entityId) => {
      const ExpenseEntry = getModel('ExpenseEntry');
      if (!ExpenseEntry) return [];
      const items = await ExpenseEntry.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `EXPENSES:${item._id}`,
        module: 'EXPENSES',
        doc_type: 'EXPENSE',
        doc_id: item._id,
        doc_ref: `${item.period}-${item.cycle || ''}`.trim(),
        description: `${item.bdm_id?.name || 'BDM'} — ${item.period} ${item.cycle || ''} — ORE: ₱${(item.total_ore || 0).toLocaleString()} / ACCESS: ₱${(item.total_access || 0).toLocaleString()}`,
        amount: item.total_amount || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'expense_entry', id: item._id, action: 'post' },
        details: {
          period: item.period,
          cycle: item.cycle,
          total_ore: item.total_ore,
          total_access: item.total_access,
          total_amount: item.total_amount,
          total_vat: item.total_vat,
          line_count: item.line_count || (item.lines || []).length,
          lines: (item.lines || []).slice(0, 10).map(l => ({
            expense_type: l.expense_type, expense_category: l.expense_category,
            amount: l.amount, or_number: l.or_number, payment_mode: l.payment_mode,
            calf_required: l.calf_required
          }))
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'PRF_CALF',
    label: 'PRF / CALF',
    query: async (entityId) => {
      const PrfCalf = getModel('PrfCalf');
      if (!PrfCalf) return [];
      const items = await PrfCalf.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => {
        const isPrf = item.doc_type === 'PRF';
        return {
          id: `PRF_CALF:${item._id}`,
          module: 'PRF_CALF',
          doc_type: item.doc_type || 'PRF',
          doc_id: item._id,
          doc_ref: (isPrf ? item.prf_number : item.calf_number) || `${item.doc_type}-${String(item._id).slice(-6)}`,
          description: `${item.bdm_id?.name || 'BDM'} — ${item.doc_type} — ${isPrf ? item.payee_name || 'Payee' : 'Cash Advance'} — ₱${(item.amount || (isPrf ? item.rebate_amount : item.advance_amount) || 0).toLocaleString()}`,
          amount: item.amount || (isPrf ? item.rebate_amount : item.advance_amount) || 0,
          submitted_by: item.bdm_id?.name || 'Unknown',
          submitted_at: item.createdAt,
          status: 'PENDING_POST',
          current_action: 'Post',
          action_key: 'POST',
          approve_data: { type: 'prf_calf', id: item._id, action: 'post' },
          details: {
            doc_type: item.doc_type,
            period: item.period,
            cycle: item.cycle,
            prf_type: item.prf_type,
            payee_name: item.payee_name,
            payee_type: item.payee_type,
            purpose: item.purpose,
            payment_mode: item.payment_mode,
            rebate_amount: item.rebate_amount,
            advance_amount: item.advance_amount,
            liquidation_amount: item.liquidation_amount,
            balance: item.balance,
            bir_flag: item.bir_flag
          }
        };
      });
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },

  // ═══ PER DIEM OVERRIDE APPROVAL ═══
  {
    module: 'PERDIEM_OVERRIDE',
    label: 'Per Diem Override',
    query: async (entityId) => {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const pendingOverrides = await ApprovalRequest.find({
        entity_id: entityId,
        module: 'PERDIEM_OVERRIDE',
        status: 'PENDING',
      })
        .populate('requested_by', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      return pendingOverrides.map(req => ({
        id: req._id.toString(),
        module: 'PERDIEM_OVERRIDE',
        doc_type: req.doc_type || 'SMER_DAILY_ENTRY',
        doc_id: req.doc_id?.toString(),
        doc_ref: req.doc_ref,
        description: req.description,
        amount: req.amount,
        submitted_by: req.requested_by?.name || 'Unknown',
        submitted_at: req.requested_at,
        status: req.status,
        current_action: 'approve',
        action_key: 'perdiem_override',
        approve_data: {
          type: 'perdiem_override',
          id: req._id.toString(),
        },
        details: {
          module: 'PERDIEM_OVERRIDE',
          doc_type: req.doc_type,
          doc_ref: req.doc_ref,
          description: req.description,
          amount: req.amount,
          requested_by: req.requested_by?.name,
          requested_at: req.requested_at,
        }
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  }
];

/**
 * Check if a user is authorized for a module.
 * 1. President/CEO → always authorized
 * 2. If ApprovalRules exist for this module → check if user matches any rule
 * 3. If no rules → fall back to lookup-driven MODULE_DEFAULT_ROLES (Rule #3 compliant)
 *
 * @param {ObjectId} entityId
 * @param {ObjectId} userId
 * @param {string}   userRole
 * @param {object}   moduleEntry - entry from MODULE_QUERIES
 * @param {Map}      defaultRolesMap - pre-fetched MODULE_DEFAULT_ROLES lookup entries keyed by code
 */
async function isAuthorizedForModule(entityId, userId, userRole, moduleEntry, defaultRolesMap) {
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

  // No ApprovalRules → fall back to lookup-driven MODULE_DEFAULT_ROLES
  const defaultEntry = defaultRolesMap.get(moduleEntry.module);
  if (!defaultEntry || !defaultEntry.metadata?.roles) return true; // null/missing = open
  return defaultEntry.metadata.roles.includes(userRole);
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

  // Fetch lookup-driven default roles in one query (Rule #3: no hardcoded business values)
  // Auto-seeds on first access if empty — mirrors getByCategory() pattern in lookupGenericController
  let defaultRoles = await Lookup.find({
    entity_id: entityId,
    category: 'MODULE_DEFAULT_ROLES',
    is_active: true
  }).lean();

  if (entityId) {
    // Auto-seed: merge missing defaults ($setOnInsert never overwrites existing entries)
    try {
      const { SEED_DEFAULTS } = require('../controllers/lookupGenericController');
      const seeds = SEED_DEFAULTS.MODULE_DEFAULT_ROLES;
      if (seeds && seeds.length > 0) {
        const ops = seeds.map((item, i) => ({
          updateOne: {
            filter: { entity_id: entityId, category: 'MODULE_DEFAULT_ROLES', code: item.code.toUpperCase() },
            update: { $setOnInsert: { label: item.label, sort_order: i * 10, is_active: true, metadata: item.metadata || {} } },
            upsert: true
          }
        }));
        await Lookup.bulkWrite(ops);
        if (defaultRoles.length === 0 || seeds.length > defaultRoles.length) {
          defaultRoles = await Lookup.find({ entity_id: entityId, category: 'MODULE_DEFAULT_ROLES', is_active: true }).lean();
        }
      }
    } catch (seedErr) {
      console.error('MODULE_DEFAULT_ROLES auto-seed failed:', seedErr.message);
    }
  }

  const defaultRolesMap = new Map(defaultRoles.map(r => [r.code, r]));

  // Filter to modules this user is authorized for
  const authorizedModules = [];
  for (const mod of MODULE_QUERIES) {
    const auth = await isAuthorizedForModule(entityId, userId, userRole, mod, defaultRolesMap);
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

  // ── Enrich line_items: product names + available stock ──
  // 1. Collect all product_id values and warehouse/bdm context from items with line_items
  const productIdSet = new Set();
  const stockQueries = []; // { warehouseId, bdmId, productId } tuples for stock lookup
  for (const item of allItems) {
    const details = item.details || {};
    const whId = details._warehouse_id;
    const bdmId = details._bdm_id;
    for (const li of (details.line_items || [])) {
      if (li.product_id && mongoose.Types.ObjectId.isValid(li.product_id)) {
        const pid = li.product_id.toString();
        productIdSet.add(pid);
        if (whId || bdmId) {
          stockQueries.push({ warehouseId: whId?.toString(), bdmId: bdmId?.toString(), productId: pid });
        }
      }
    }
  }

  // 2. Bulk-fetch product names
  const productMap = new Map();
  if (productIdSet.size > 0) {
    const ProductMaster = getModel('ProductMaster');
    if (ProductMaster) {
      const productIds = [...productIdSet].map(id => new mongoose.Types.ObjectId(id));
      const products = await ProductMaster.find({ _id: { $in: productIds } })
        .select('brand_name dosage_strength item_key')
        .lean();
      for (const p of products) productMap.set(p._id.toString(), p);
    }
  }

  // 3. Bulk-fetch available stock per warehouse (or bdm) + product
  // Build unique warehouse/bdm keys and aggregate all at once
  const stockMap = new Map(); // "warehouseId|productId" or "bdm:bdmId|productId" → available_qty
  if (stockQueries.length > 0) {
    // De-duplicate queries
    const uniqueKeys = new Set();
    const matchConditions = [];
    for (const sq of stockQueries) {
      const key = sq.warehouseId
        ? `wh:${sq.warehouseId}|${sq.productId}`
        : `bdm:${sq.bdmId}|${sq.productId}`;
      if (!uniqueKeys.has(key)) {
        uniqueKeys.add(key);
        const m = { product_id: new mongoose.Types.ObjectId(sq.productId) };
        if (sq.warehouseId) m.warehouse_id = new mongoose.Types.ObjectId(sq.warehouseId);
        else if (sq.bdmId) m.bdm_id = new mongoose.Types.ObjectId(sq.bdmId);
        matchConditions.push(m);
      }
    }
    try {
      // Run two separate aggregations: one for warehouse-based, one for bdm-based
      // This avoids cross-grouping (warehouse entries also have bdm_id, which would split groups)
      const whConditions = matchConditions.filter(m => m.warehouse_id);
      const bdmConditions = matchConditions.filter(m => m.bdm_id && !m.warehouse_id);

      const [whResults, bdmResults] = await Promise.all([
        whConditions.length > 0
          ? InventoryLedger.aggregate([
              { $match: { $or: whConditions } },
              { $group: { _id: { warehouse_id: '$warehouse_id', product_id: '$product_id' }, total_in: { $sum: '$qty_in' }, total_out: { $sum: '$qty_out' } } },
              { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } }
            ])
          : [],
        bdmConditions.length > 0
          ? InventoryLedger.aggregate([
              { $match: { $or: bdmConditions } },
              { $group: { _id: { bdm_id: '$bdm_id', product_id: '$product_id' }, total_in: { $sum: '$qty_in' }, total_out: { $sum: '$qty_out' } } },
              { $addFields: { available: { $subtract: ['$total_in', '$total_out'] } } }
            ])
          : []
      ]);

      for (const s of whResults) {
        stockMap.set(`wh:${s._id.warehouse_id}|${s._id.product_id}`, s.available);
      }
      for (const s of bdmResults) {
        stockMap.set(`bdm:${s._id.bdm_id}|${s._id.product_id}`, s.available);
      }
    } catch (err) {
      console.error('Approval stock enrichment failed:', err.message);
    }
  }

  // 4. Apply enrichments to line items
  for (const item of allItems) {
    const details = item.details || {};
    const whId = details._warehouse_id?.toString();
    const bdmId = details._bdm_id?.toString();
    for (const li of (details.line_items || [])) {
      if (li.product_id) {
        const pid = li.product_id.toString();
        // Product name
        const prod = productMap.get(pid);
        if (prod) {
          li.product_name = `${prod.brand_name} ${prod.dosage_strength || ''}`.trim();
        } else {
          li.product_name = li.item_key || String(li.product_id);
        }
        // Available stock
        const stockKey = whId ? `wh:${whId}|${pid}` : bdmId ? `bdm:${bdmId}|${pid}` : null;
        if (stockKey) {
          li.available_stock = stockMap.get(stockKey) || 0;
        }
      }
    }
    // Clean up internal fields (don't send to frontend)
    delete details._warehouse_id;
    delete details._bdm_id;
  }

  return allItems;
}

module.exports = {
  getUniversalPending,
  MODULE_QUERIES
};
