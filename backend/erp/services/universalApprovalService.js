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
const { getSignedDownloadUrl, extractKeyFromUrl } = require('../../config/s3');

// Models
const ApprovalRequest = require('../models/ApprovalRequest');
const DeductionSchedule = require('../models/DeductionSchedule');
const IncomeReport = require('../models/IncomeReport');
const GrnEntry = require('../models/GrnEntry');
const Undertaking = require('../models/Undertaking'); // Phase 32 — Approval Hub surfaces SUBMITTED Undertakings
const ApprovalRule = require('../models/ApprovalRule');
const Lookup = require('../models/Lookup');
const InventoryLedger = require('../models/InventoryLedger');

// Phase 31 — shared per-module detail builders (also used by Reversal Console)
const { buildDocumentDetails } = require('./documentDetailBuilder');
// CRM bridge — used to enrich CAR_LOGBOOK approvals with same-day visit data
// (mirrors how SMER pulls md_count via the same bridge during generation).
const { getDailyVisitDetails } = require('./smerCrmBridge');

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
    sub_key: null, // special: derive from item.module field
    query: async (entityId) => {
      // Phase G4.1 (April 2026) — surface ALL pending ApprovalRequests with rich details.
      //
      // Previously excluded level-0 default-roles-gate items on the assumption that
      // their underlying module query (SALES/COLLECTION/...) would always surface the
      // raw doc. In practice some modules filter by statuses that miss gated docs,
      // leaving the request orphaned in the legacy Requests tab with no expand UI.
      //
      // Current behaviour: include everything, hydrate each underlying doc via
      // `buildApprovalRequestDetails` (lookup-driven doc_type → model map), and then
      // let the by-doc_id dedup pass in getUniversalPending prefer the raw-module
      // item whenever both surfaces exist. That preserves the Phase 31R "no double-
      // listing" guarantee while fixing the orphan case.
      const items = await ApprovalRequest.find({
        entity_id: entityId,
        status: 'PENDING',
      })
        .populate('requested_by', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      return Promise.all(items.map(async (item) => {
        const { details, moduleKey } = await buildApprovalRequestDetails(item);
        return {
          id: `APPROVAL_REQUEST:${item._id}`,
          module: item.module || 'APPROVAL_REQUEST',
          doc_type: item.doc_type || 'APPROVAL',
          // doc_id (top-level) — drives the by-doc_id dedup in getUniversalPending.
          // Fallback to the request _id when the request has no underlying doc
          // (synthetic holds) so dedup never coalesces unrelated items.
          doc_id: item.doc_id || item._id,
          doc_ref: item.doc_ref || `REQ-${String(item._id).slice(-6)}`,
          description: item.description || `${item.module} approval — ${item.doc_ref || 'pending'}`,
          amount: item.amount || 0,
          submitted_by: item.requested_by?.name || 'Unknown',
          submitted_at: item.requested_at || item.createdAt,
          status: 'PENDING_APPROVAL',
          current_action: 'Approve',
          action_key: 'APPROVE',
          // Passes doc_id + doc_type + module alongside request id so the handler
          // (and future auto-post extensions) can dereference the underlying doc
          // without re-querying.
          approve_data: {
            type: 'approval_request',
            id: item._id,
            request_id: item._id,
            doc_id: item.doc_id || null,
            doc_type: item.doc_type || null,
            module: item.module || null,
            module_key: moduleKey || null,
          },
          details,
        };
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES (null = open, governed by ApprovalRule)
  },
  {
    module: 'DEDUCTION_SCHEDULE',
    label: 'Deduction Schedules',
    sub_key: 'approve_deductions',
    query: async (entityId) => {
      const items = await DeductionSchedule.find({ entity_id: entityId, status: 'PENDING_APPROVAL' })
        .populate('bdm_id', 'name email')
        .populate('approved_by', 'name')
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
        details: buildDocumentDetails('DEDUCTION_SCHEDULE', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'INCOME',
    label: 'Income Reports',
    sub_key: 'approve_income',
    query: async (entityId) => {
      const items = await IncomeReport.find({
        entity_id: entityId,
        status: { $in: ['GENERATED', 'BDM_CONFIRMED'] }
      })
        .populate('bdm_id', 'name email')
        .populate('reviewed_by', 'name')
        .populate('credited_by', 'name')
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
        details: buildDocumentDetails('INCOME', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'INVENTORY',
    label: 'GRN (Goods Receipt)',
    sub_key: 'approve_inventory',
    query: async (entityId) => {
      const items = await GrnEntry.find({ entity_id: entityId, status: 'PENDING' })
        .populate('bdm_id', 'name email')
        .populate('warehouse_id', 'warehouse_name warehouse_code')
        .populate('vendor_id', 'vendor_name')
        .populate('reviewed_by', 'name')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `INVENTORY:${item._id}`,
        module: 'INVENTORY',
        doc_type: 'GRN',
        doc_id: item._id,
        doc_ref: item.grn_ref || `GRN-${String(item._id).slice(-6)}`,
        description: `${item.bdm_id?.name || 'BDM'} — ${item.warehouse_id?.warehouse_name || 'Warehouse'} — ${(item.line_items || []).length} item(s) received`,
        amount: 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_APPROVAL',
        current_action: 'Approve',
        action_key: 'APPROVE',
        approve_data: { type: 'grn', id: item._id },
        details: buildDocumentDetails('INVENTORY', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES.INVENTORY
  },
  // Phase 32 — Undertaking (GRN receipt confirmation). Surfaces SUBMITTED docs
  // so approvers can acknowledge (which auto-approves the linked GRN and writes
  // InventoryLedger). Pre-hub the BDM confirmed batch + expiry via scan or manual
  // input on the Undertaking page; the Hub view shows those confirmed values
  // alongside the linked GRN's waybill photo (via buildDocumentDetails).
  {
    module: 'UNDERTAKING',
    label: 'Undertaking (Receipt Confirmation)',
    sub_key: 'approve_inventory', // reuses inventory approver sub-perm; subscribers
                                   // can split by adding `approve_undertaking` to
                                   // ERP_SUB_PERMISSION lookup and flipping this key.
    query: async (entityId) => {
      const items = await Undertaking.find({ entity_id: entityId, status: 'SUBMITTED' })
        .populate('bdm_id', 'name email')
        .populate('warehouse_id', 'warehouse_name warehouse_code')
        .populate({
          path: 'linked_grn_id',
          select: 'grn_number grn_date source_type po_id po_number vendor_id waybill_photo_url undertaking_photo_url reassignment_id status',
          populate: { path: 'vendor_id', select: 'vendor_name' }
        })
        .sort({ createdAt: -1, created_at: -1 })
        .lean();
      return items.map(item => {
        const scanned = (item.line_items || []).filter(l => l.scan_confirmed).length;
        const totalLines = (item.line_items || []).length;
        const variances = (item.line_items || []).filter(l => l.variance_flag).length;
        const grn = item.linked_grn_id || {};
        return {
          id: `UNDERTAKING:${item._id}`,
          module: 'UNDERTAKING',
          doc_type: 'UNDERTAKING',
          doc_id: item._id,
          doc_ref: item.undertaking_number || `UT-${String(item._id).slice(-6)}`,
          description: `${item.bdm_id?.name || 'BDM'} — ${grn.grn_number || grn.source_type || 'STANDALONE'} — ${totalLines} line(s), ${scanned} scanned${variances ? `, ${variances} variance flag(s)` : ''}`,
          amount: 0,
          submitted_by: item.bdm_id?.name || 'Unknown',
          submitted_at: item.createdAt || item.created_at,
          status: 'PENDING_APPROVAL',
          current_action: 'Acknowledge',
          action_key: 'APPROVE',
          approve_data: { type: 'undertaking', id: item._id },
          details: buildDocumentDetails('UNDERTAKING', item),
        };
      });
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'PAYROLL',
    label: 'Payslips',
    sub_key: 'approve_payroll',
    query: async (entityId) => {
      const Payslip = getModel('Payslip');
      if (!Payslip) return [];
      const items = await Payslip.find({
        entity_id: entityId,
        status: { $in: ['COMPUTED', 'REVIEWED'] }
      })
        .populate('person_id', 'full_name email')
        .populate('reviewed_by', 'name')
        .populate('approved_by', 'name')
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
        details: buildDocumentDetails('PAYROLL', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'KPI',
    label: 'KPI Ratings',
    sub_key: 'approve_kpi',
    query: async (entityId) => {
      const KpiSelfRating = getModel('KpiSelfRating');
      if (!KpiSelfRating) return [];
      const items = await KpiSelfRating.find({
        entity_id: entityId,
        status: { $in: ['SUBMITTED', 'REVIEWED'] }
      })
        .populate('person_id', 'full_name email')
        .populate('reviewer_id', 'full_name')
        .populate('approved_by', 'name')
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
        details: buildDocumentDetails('KPI', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  // ── Phase F expansion: document-posting modules (VALID → POSTED) ──
  {
    module: 'SALES',
    label: 'Sales / CSI',
    sub_key: 'approve_sales',
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
        submitted_at: item.csi_date || item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'sales_line', id: item._id, action: 'post' },
        details: buildDocumentDetails('SALES', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'COLLECTION',
    label: 'Collections / CR',
    sub_key: 'approve_collections',
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
        submitted_at: item.cr_date || item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'collection', id: item._id, action: 'post' },
        details: buildDocumentDetails('COLLECTION', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'SMER',
    label: 'SMER',
    sub_key: 'approve_expenses',
    query: async (entityId) => {
      const SmerEntry = getModel('SmerEntry');
      if (!SmerEntry) return [];
      const items = await SmerEntry.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .populate('daily_entries.overridden_by', 'name')
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
        details: buildDocumentDetails('SMER', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    // Phase 31R follow-up — Credit Note (product returns) pending-approval surface.
    // Native pattern (mirrors SMER): query CreditNote.status='VALID' directly so the
    // approver sees the actual document, not an ApprovalRequest stub. gateApproval
    // on submit uses module='CREDIT_NOTE' so MODULE_DEFAULT_ROLES is consulted; the
    // level-0 ApprovalRequest that's created when a non-authorized BDM submits is
    // excluded by the APPROVAL_REQUEST query filter (`level: { $gt: 0 }`) — so this
    // surface is the single, non-duplicated view for approvers.
    module: 'CREDIT_NOTE',
    label: 'Credit Notes / Returns',
    sub_key: 'approve_sales',
    query: async (entityId) => {
      const CreditNote = getModel('CreditNote');
      if (!CreditNote) return [];
      const items = await CreditNote.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .populate('hospital_id', 'hospital_name')
        .populate('customer_id', 'customer_name')
        .populate('warehouse_id', 'warehouse_name warehouse_code')
        .sort({ createdAt: -1 })
        .lean();
      return items.map(item => ({
        id: `CREDIT_NOTE:${item._id}`,
        module: 'CREDIT_NOTE',
        doc_type: 'CREDIT_NOTE',
        doc_id: item._id,
        doc_ref: item.cn_number || `CN-${String(item._id).slice(-6)}`,
        description: `${item.bdm_id?.name || 'BDM'} — ${item.cn_number || ''} — Return from ${(item.hospital_id?.hospital_name || item.customer_id?.customer_name || 'Customer')} — ₱${(item.credit_total || 0).toLocaleString()}`,
        amount: item.credit_total || 0,
        submitted_by: item.bdm_id?.name || 'Unknown',
        submitted_at: item.createdAt,
        status: 'PENDING_POST',
        current_action: 'Post',
        action_key: 'POST',
        approve_data: { type: 'credit_note', id: item._id, action: 'post' },
        details: buildDocumentDetails('CREDIT_NOTE', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES['CREDIT_NOTE']
  },
  {
    module: 'CAR_LOGBOOK',
    label: 'Car Logbook',
    sub_key: 'approve_expenses',
    query: async (entityId) => {
      // Phase 33: surface CarLogbookCycle wrapper docs (one per period+cycle)
      // instead of 15× per-day CarLogbookEntry rows. Fixes the "Lines=0 / ₱0 /
      // 16× LOGBOOK-2026-04" display bug where batched-day submissions
      // hydrated as individual entries.
      const CarLogbookCycle = getModel('CarLogbookCycle');
      const CarLogbookEntry = getModel('CarLogbookEntry');
      if (!CarLogbookCycle) return [];

      const cycles = await CarLogbookCycle.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      return Promise.all(cycles.map(async (cycle) => {
        // Hydrate per-day docs for this cycle (detail panel needs the fuel_receipts + per-day rows)
        const days = CarLogbookEntry
          ? await CarLogbookEntry.find({ cycle_id: cycle._id }).sort({ entry_date: 1 }).lean()
          : [];

        const details = buildDocumentDetails('CAR_LOGBOOK', { ...cycle, daily_entries: days });

        // Best-effort CRM enrichment — pull distinct cities the BDM visited across the cycle
        const bdmUserId = cycle.bdm_id?._id || cycle.bdm_id;
        if (details && bdmUserId && days.length) {
          try {
            const allVisits = [];
            for (const d of days) {
              if (!d.entry_date) continue;
              const v = await getDailyVisitDetails(bdmUserId, d.entry_date);
              if (v && v.length) allVisits.push(...v.map(x => ({ ...x, entry_date: d.entry_date })));
            }
            const cities = [...new Set(allVisits.map(v => v.doctor?.clinicOfficeAddress).filter(Boolean))];
            details.crm_visit_count = allVisits.length;
            details.cities_visited = cities;
          } catch (err) {
            details.crm_visit_count = null;
            details.crm_lookup_error = err?.message || 'CRM lookup failed';
          }
        }

        const workingDays = cycle.working_days || 0;
        return {
          id: `CAR_LOGBOOK:${cycle._id}`,
          module: 'CAR_LOGBOOK',
          doc_type: 'CAR_LOGBOOK',
          doc_id: cycle._id,
          doc_ref: `LOGBOOK-${cycle.period}-${cycle.cycle}`,
          description: `${cycle.bdm_id?.name || 'BDM'} — ${cycle.period} ${cycle.cycle} — ${workingDays} working day${workingDays === 1 ? '' : 's'}, ${cycle.total_km || 0} km`,
          amount: cycle.total_fuel_amount || 0,
          submitted_by: cycle.bdm_id?.name || 'Unknown',
          submitted_at: cycle.createdAt,
          status: 'PENDING_POST',
          current_action: 'Post',
          action_key: 'POST',
          approve_data: { type: 'car_logbook', id: cycle._id, action: 'post' },
          details,
        };
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },

  {
    module: 'FUEL_ENTRY',
    label: 'Fuel Entry (per-receipt)',
    sub_key: 'approve_expenses',
    query: async (entityId) => {
      // Per-fuel-entry approvals (mirrors per-diem override). Surface
      // CarLogbookEntry.fuel_entries[i] where approval_status === 'PENDING'.
      const CarLogbookEntry = getModel('CarLogbookEntry');
      if (!CarLogbookEntry) return [];
      const docs = await CarLogbookEntry.find({
        entity_id: entityId,
        'fuel_entries.approval_status': 'PENDING',
      }).populate('bdm_id', 'name email').lean();

      const out = [];
      for (const day of docs) {
        for (const fuel of (day.fuel_entries || [])) {
          if (fuel.approval_status !== 'PENDING') continue;
          const details = buildDocumentDetails('FUEL_ENTRY', { day, fuel });
          const dateStr = day.entry_date ? new Date(day.entry_date).toISOString().split('T')[0] : '';
          out.push({
            id: `FUEL_ENTRY:${fuel._id}`,
            module: 'FUEL_ENTRY',
            doc_type: 'FUEL_ENTRY',
            doc_id: fuel._id,
            doc_ref: fuel.doc_ref || `FUEL-${day.period}-${day._id}`,
            description: `${day.bdm_id?.name || 'BDM'} — Fuel ₱${(fuel.total_amount || 0).toLocaleString()} @ ${fuel.station_name || 'unknown'} on ${dateStr}`,
            amount: fuel.total_amount || 0,
            submitted_by: day.bdm_id?.name || 'Unknown',
            submitted_at: day.createdAt,
            status: 'PENDING_APPROVAL',
            current_action: 'Approve',
            action_key: 'APPROVE',
            approve_data: { type: 'fuel_entry', id: fuel._id, action: 'post' },
            details,
          });
        }
      }
      return out;
    },
  },
  {
    module: 'EXPENSES',
    label: 'Expenses (ORE/ACCESS)',
    sub_key: 'approve_expenses',
    query: async (entityId) => {
      const ExpenseEntry = getModel('ExpenseEntry');
      if (!ExpenseEntry) return [];
      const items = await ExpenseEntry.find({ entity_id: entityId, status: 'VALID' })
        .populate('bdm_id', 'name email')
        .populate('recorded_on_behalf_of', 'name')
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
        details: buildDocumentDetails('EXPENSES', item),
      }));
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'PRF_CALF',
    label: 'PRF / CALF',
    sub_key: 'approve_expenses',
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
          details: buildDocumentDetails('PRF_CALF', item),
        };
      });
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },

  // ═══ PER DIEM OVERRIDE APPROVAL ═══
  {
    module: 'PERDIEM_OVERRIDE',
    label: 'Per Diem Override',
    sub_key: 'approve_perdiem',
    query: async (entityId) => {
      const ApprovalRequest = require('../models/ApprovalRequest');
      const SmerEntry = require('../models/SmerEntry');
      const Settings = require('../models/Settings');
      const { computePerdiemAmount } = require('../services/perdiemCalc');

      const pendingOverrides = await ApprovalRequest.find({
        entity_id: entityId,
        module: 'PERDIEM_OVERRIDE',
        status: 'PENDING',
      })
        .populate('requested_by', 'name email')
        .sort({ createdAt: -1 })
        .lean();

      if (pendingOverrides.length === 0) return [];

      // Batch-fetch linked SMER entries and populate hospital names for coverage summary
      // (Hospital model uses `hospital_name`, not `name` — see Hospital.js)
      const smerIds = [...new Set(pendingOverrides.map(r => r.doc_id?.toString()).filter(Boolean))];
      const smers = smerIds.length
        ? await SmerEntry.find({ _id: { $in: smerIds } })
            .populate('daily_entries.hospital_ids', 'hospital_name')
            .populate('daily_entries.hospital_id', 'hospital_name')
            .lean()
        : [];
      const smerMap = new Map(smers.map(s => [s._id.toString(), s]));
      const settings = await Settings.getSettings();

      return pendingOverrides.map(req => {
        const smer = req.doc_id ? smerMap.get(req.doc_id.toString()) : null;
        const entryId = req.metadata?.entry_id
          || req.description?.match(/Entry ID: (.+)$/)?.[1]
          || null;
        const entry = smer && entryId
          ? (smer.daily_entries || []).find(e => e._id?.toString() === entryId)
          : null;

        let coverage = null;
        if (entry && smer) {
          const requestedTier = req.metadata?.override_tier
            || req.description?.match(/→ (FULL|HALF)/)?.[1]
            || null;
          const requestedMd = requestedTier === 'FULL' ? 999 : (requestedTier === 'HALF' ? 3 : entry.md_count);
          const requestedAmount = requestedTier
            ? computePerdiemAmount(requestedMd, smer.perdiem_rate, settings).amount
            : req.amount;
          const hospitals = (entry.hospital_ids || []).map(h => h?.hospital_name).filter(Boolean);
          const hospitalCovered = hospitals.length
            ? hospitals.join(', ')
            : (entry.hospital_covered || entry.hospital_id?.hospital_name || null);

          coverage = {
            entry_date: entry.entry_date,
            day_of_week: entry.day_of_week,
            day_number: entry.day,
            md_count: entry.md_count,
            hospital_covered: hospitalCovered,
            activity_type: entry.activity_type || null,
            current_tier: entry.perdiem_tier,
            current_amount: entry.perdiem_amount,
            requested_tier: requestedTier,
            requested_amount: requestedAmount,
            difference: (requestedAmount || 0) - (entry.perdiem_amount || 0),
            override_reason: req.metadata?.override_reason
              || req.description?.match(/\((.+?)\)\./)?.[1]
              || null,
            period: smer.period,
            cycle: smer.cycle,
          };
        }

        return {
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
          details: buildDocumentDetails('PERDIEM_OVERRIDE', { ...req, _coverage: coverage }),
        };
      });
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 31 — 5 gap modules (IC_TRANSFER, JOURNAL, BANKING, PURCHASING, PETTY_CASH)
  //
  // These modules call `gateApproval()` on submit (see docs/APPROVAL_COVERAGE_AUDIT.md)
  // but had no MODULE_QUERIES entries — so their pending docs never appeared in the
  // Approval Hub. Each entry below queries `ApprovalRequest` filtered by module,
  // hydrates the underlying doc from its source model, and builds rich detail via
  // the shared `buildDocumentDetails()`.
  //
  // Pattern: makePendingQuery(moduleKey, modelName, docTypeMap) → returns a query
  // function. Each new module just needs one line here. Subscription-safe: adding
  // a 6th gap module requires no schema changes, just another entry.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    module: 'IC_TRANSFER',
    label: 'Inter-Company Transfer',
    sub_key: 'approve_ic_transfer',
    query: async (entityId) => {
      return buildGapModulePendingItems({
        entityId,
        module: 'IC_TRANSFER',
        // IC_TRANSFER docs live in two collections depending on docType
        docTypeToModel: { IC_TRANSFER: 'InterCompanyTransfer', IC_SETTLEMENT: 'IcSettlement' },
        populateByDocType: {
          IC_TRANSFER: [
            { path: 'source_entity_id', select: 'entity_name' },
            { path: 'target_entity_id', select: 'entity_name' },
            { path: 'source_warehouse_id', select: 'warehouse_name' },
            { path: 'target_warehouse_id', select: 'warehouse_name' },
            { path: 'approved_by', select: 'name' },
            { path: 'shipped_by', select: 'name' },
            { path: 'received_by', select: 'name' },
            { path: 'posted_by', select: 'name' },
            { path: 'cancelled_by', select: 'name' },
          ],
          IC_SETTLEMENT: [
            { path: 'creditor_entity_id', select: 'entity_name' },
            { path: 'debtor_entity_id', select: 'entity_name' },
            { path: 'posted_by', select: 'name' },
          ],
        },
        actionType: 'ic_transfer',
      });
    },
    // Roles: lookup-driven via MODULE_DEFAULT_ROLES
  },
  {
    module: 'JOURNAL',
    label: 'Journal Entries',
    sub_key: 'approve_journal',
    query: async (entityId) => {
      // JOURNAL covers manual JEs (doc_id = JournalEntry._id) and also
      // DEPRECIATION/INTEREST batches (doc_id = entity_id — batch-level, no single doc).
      // For batch docTypes we can't hydrate a single JournalEntry, so we call
      // the batch staging service directly to dereference the asset / loan lines
      // the approver needs to review before posting.
      const items = await buildGapModulePendingItems({
        entityId,
        module: 'JOURNAL',
        docTypeToModel: { JOURNAL_ENTRY: 'JournalEntry' },
        populateByDocType: {
          JOURNAL_ENTRY: [
            { path: 'posted_by', select: 'name' },
            { path: 'created_by', select: 'name' },
            { path: 'corrects_je_id', select: 'je_number je_date' },
          ],
        },
        actionType: 'journal',
        // Batch docTypes pass the ApprovalRequest itself to the builder; we then
        // enrich with staging data below.
        fallbackToRequest: true,
      });

      // Post-process DEPRECIATION / INTEREST batch items — hydrate staging lines
      // so the approver sees which assets/loans are about to post.
      const { getDepreciationStaging } = require('./depreciationService');
      const { getInterestStaging } = require('./loanService');
      for (const it of items) {
        if (it.doc_type !== 'DEPRECIATION' && it.doc_type !== 'INTEREST') continue;
        // doc_ref format: "DEPR-{period}" or "INT-{period}"
        const period = it.doc_ref?.replace(/^(DEPR|INT)-/, '') || null;
        if (!period) continue;
        try {
          const staging = it.doc_type === 'DEPRECIATION'
            ? await getDepreciationStaging(entityId, period)
            : await getInterestStaging(entityId, period);
          const total = (staging || []).reduce(
            (s, r) => s + (r.amount ?? r.interest_amount ?? 0),
            0
          );
          it.details = buildDocumentDetails('JOURNAL', {
            _batch_kind: it.doc_type,
            period,
            staging,
            total_amount: total,
            doc_ref: it.doc_ref,
            description: it.description,
            amount: it.amount,
            memo: it.description,
            status: it.status,
          });
        } catch (err) {
          console.error(`JOURNAL batch staging hydrate failed [${it.doc_type}/${period}]:`, err.message);
        }
      }

      return items;
    },
  },
  {
    module: 'BANKING',
    label: 'Bank Reconciliation',
    sub_key: 'approve_banking',
    query: async (entityId) => {
      return buildGapModulePendingItems({
        entityId,
        module: 'BANKING',
        docTypeToModel: { BANK_RECON: 'BankStatement' },
        populateByDocType: {
          BANK_RECON: [
            { path: 'bank_account_id', select: 'bank_name bank_code coa_code' },
            { path: 'uploaded_by', select: 'name' },
          ],
        },
        actionType: 'banking',
      });
    },
  },
  {
    module: 'PURCHASING',
    label: 'Supplier Invoices',
    sub_key: 'approve_purchasing',
    query: async (entityId) => {
      return buildGapModulePendingItems({
        entityId,
        module: 'PURCHASING',
        docTypeToModel: { SUPPLIER_INVOICE: 'SupplierInvoice' },
        populateByDocType: {
          SUPPLIER_INVOICE: [
            { path: 'vendor_id', select: 'vendor_name tin' },
            { path: 'po_id', select: 'po_number' },
          ],
        },
        actionType: 'purchasing',
      });
    },
  },
  {
    module: 'PETTY_CASH',
    label: 'Petty Cash Transactions',
    sub_key: 'approve_petty_cash',
    query: async (entityId) => {
      return buildGapModulePendingItems({
        entityId,
        module: 'PETTY_CASH',
        // PettyCash gateApproval uses txn_type as docType (DISBURSEMENT/DEPOSIT),
        // not a fixed string — map both to the same model.
        docTypeToModel: { DISBURSEMENT: 'PettyCashTransaction', DEPOSIT: 'PettyCashTransaction' },
        populateByDocType: {
          // `created_by` is the requester on PettyCashTransaction (the model has no
          // `bdm_id` — it uses `created_by` as the BDM scope, see model line 79).
          DISBURSEMENT: [
            { path: 'fund_id', select: 'fund_name fund_code current_balance' },
            { path: 'created_by', select: 'name email' },
            { path: 'approved_by', select: 'name' },
            { path: 'posted_by', select: 'name' },
            { path: 'voided_by', select: 'name' },
          ],
          DEPOSIT: [
            { path: 'fund_id', select: 'fund_name fund_code current_balance' },
            { path: 'created_by', select: 'name email' },
            { path: 'approved_by', select: 'name' },
            { path: 'posted_by', select: 'name' },
            { path: 'voided_by', select: 'name' },
          ],
        },
        actionType: 'petty_cash',
      });
    },
  },

  // ── Phase G6.7 — Sales Goal Plans + Incentive Payouts (gap modules) ──
  {
    module: 'SALES_GOAL_PLAN',
    label: 'Sales Goal Plan',
    sub_key: 'approve_sales_goal',
    query: async (entityId) => {
      return buildGapModulePendingItems({
        entityId,
        module: 'SALES_GOAL_PLAN',
        docTypeToModel: { SALES_GOAL_PLAN: 'SalesGoalPlan' },
        populateByDocType: {
          SALES_GOAL_PLAN: [
            { path: 'created_by', select: 'name' },
            { path: 'approved_by', select: 'name' },
          ],
        },
        actionType: 'sales_goal_plan',
        // Plan-adjacent doc_types (BULK_TARGETS_IMPORT, PLAN_NEW_VERSION,
        // TARGET_REVISION) have no direct model. Pass the ApprovalRequest so
        // the panel can at least render doc_ref / amount / description.
        fallbackToRequest: true,
      });
    },
  },
  {
    module: 'INCENTIVE_PAYOUT',
    label: 'Incentive Payouts',
    sub_key: 'approve_incentive_payout',
    query: async (entityId) => {
      return buildGapModulePendingItems({
        entityId,
        module: 'INCENTIVE_PAYOUT',
        docTypeToModel: { INCENTIVE_PAYOUT: 'IncentivePayout' },
        populateByDocType: {
          INCENTIVE_PAYOUT: [
            { path: 'bdm_id', select: 'name email' },
            { path: 'plan_id', select: 'plan_name fiscal_year reference' },
            { path: 'journal_id', select: 'je_number je_date' },
          ],
        },
        actionType: 'incentive_payout',
        // Payout-adjacent doc_types (STATEMENT_DISPATCH, bulk actions) have
        // no model-backed doc — fall back to the ApprovalRequest so the panel
        // can still render doc_ref / amount / description.
        fallbackToRequest: true,
      });
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Phase G4.1 (April 2026) — APPROVAL_REQUEST hydration registry
//
// Maps ApprovalRequest.doc_type → { modelName, populate } so the Approval Hub
// can render rich DocumentDetailPanel cards for ANY pending request (Group A
// where the raw doc is the primary surface AND orphans where only the request
// is visible). Scalable + subscription-safe:
//   - Add a new doc_type = add one row; no MODULE_QUERIES change needed.
//   - Module-key resolution piggybacks on the existing
//     `REVERSAL_DOC_TYPE_TO_MODULE` registry in documentDetailBuilder.js.
//   - Future migration: source this from a `APPROVAL_REQUEST_HYDRATION` Lookup
//     category (mirrors how MODULE_DEFAULT_ROLES moved to Lookup in Phase F.1).
//     Model names are require()-bound so the Lookup migration will need a
//     whitelist resolver — not done here to keep the change scoped.
// ═══════════════════════════════════════════════════════════════════════════
const DOC_TYPE_HYDRATION = {
  // ── Group A — gateApproval-held docs whose module_query also surfaces them ──
  CSI:                 { modelName: 'SalesLine',         populate: [{ path: 'bdm_id', select: 'name email' }] },
  CR:                  { modelName: 'Collection',        populate: [{ path: 'bdm_id', select: 'name email' }] },
  SMER:                { modelName: 'SmerEntry',         populate: [{ path: 'bdm_id', select: 'name email' }] },
  SMER_ENTRY:          { modelName: 'SmerEntry',         populate: [{ path: 'bdm_id', select: 'name email' }] },
  CAR_LOGBOOK:         { modelName: 'CarLogbookCycle',   populate: [{ path: 'bdm_id', select: 'name email' }] },
  FUEL_ENTRY:          { modelName: 'CarLogbookEntry',   populate: [{ path: 'bdm_id', select: 'name email' }] },
  EXPENSE_ENTRY:       { modelName: 'ExpenseEntry',      populate: [{ path: 'bdm_id', select: 'name email' }, { path: 'recorded_on_behalf_of', select: 'name' }] },
  PRF:                 { modelName: 'PrfCalf',           populate: [{ path: 'bdm_id', select: 'name email' }] },
  CALF:                { modelName: 'PrfCalf',           populate: [{ path: 'bdm_id', select: 'name email' }] },
  GRN:                 { modelName: 'GrnEntry',          populate: [{ path: 'warehouse_id', select: 'warehouse_name warehouse_code' }, { path: 'vendor_id', select: 'vendor_name' }, { path: 'bdm_id', select: 'name email' }] },
  UNDERTAKING:         { modelName: 'Undertaking',       populate: [{ path: 'requested_by', select: 'name email' }] },
  CREDIT_NOTE:         { modelName: 'CreditNote',        populate: [{ path: 'bdm_id', select: 'name email' }] },
  INCOME_REPORT:       { modelName: 'IncomeReport',      populate: [{ path: 'bdm_id', select: 'name email' }] },
  PAYSLIP:             { modelName: 'Payslip',           populate: [{ path: 'user_id', select: 'name email' }] },
  KPI_RATING:          { modelName: 'KpiSelfRating',     populate: [{ path: 'bdm_id', select: 'name email' }] },
  DEDUCTION_SCHEDULE:  { modelName: 'DeductionSchedule', populate: [{ path: 'bdm_id', select: 'name email' }] },
  // ── Group B — docs whose primary surface IS the ApprovalRequest ──
  SUPPLIER_INVOICE:    { modelName: 'SupplierInvoice',      populate: [{ path: 'vendor_id', select: 'vendor_name tin' }, { path: 'po_id', select: 'po_number' }] },
  JOURNAL_ENTRY:       { modelName: 'JournalEntry',         populate: [{ path: 'posted_by', select: 'name' }, { path: 'created_by', select: 'name' }] },
  BANK_RECON:          { modelName: 'BankStatement',        populate: [{ path: 'bank_account_id', select: 'bank_name bank_code coa_code' }] },
  IC_TRANSFER:         { modelName: 'InterCompanyTransfer', populate: [{ path: 'source_entity_id', select: 'entity_name' }, { path: 'target_entity_id', select: 'entity_name' }] },
  IC_SETTLEMENT:       { modelName: 'IcSettlement',         populate: [{ path: 'creditor_entity_id', select: 'entity_name' }, { path: 'debtor_entity_id', select: 'entity_name' }] },
  DISBURSEMENT:        { modelName: 'PettyCashTransaction', populate: [{ path: 'fund_id', select: 'fund_name fund_code current_balance' }, { path: 'created_by', select: 'name email' }] },
  DEPOSIT:             { modelName: 'PettyCashTransaction', populate: [{ path: 'fund_id', select: 'fund_name fund_code current_balance' }, { path: 'created_by', select: 'name email' }] },
  SALES_GOAL_PLAN:     { modelName: 'SalesGoalPlan',        populate: [{ path: 'created_by', select: 'name' }] },
  INCENTIVE_PAYOUT:    { modelName: 'IncentivePayout',      populate: [{ path: 'bdm_id', select: 'name email' }, { path: 'plan_id', select: 'plan_name fiscal_year reference' }] },
};

/**
 * Phase G4.1 — Hydrate an ApprovalRequest with its underlying document +
 * DocumentDetailPanel-ready `details` object.
 *
 * Returns `{ details, moduleKey }`. Best-effort: when the doc can't be
 * hydrated (no registry row, no model, doc deleted), falls back to passing
 * the ApprovalRequest itself to the builder so the detail panel still renders
 * doc_ref / amount / description.
 *
 * Uses the existing REVERSAL_DOC_TYPE_TO_MODULE mapping from documentDetailBuilder
 * so new doc_types registered for reversal automatically inherit a module key here.
 */
async function buildApprovalRequestDetails(req) {
  const { REVERSAL_DOC_TYPE_TO_MODULE } = require('./documentDetailBuilder');
  const docType = req.doc_type;
  const moduleKey = (docType && REVERSAL_DOC_TYPE_TO_MODULE[docType]) || req.module || null;

  const hydration = DOC_TYPE_HYDRATION[docType];
  if (!hydration || !req.doc_id) {
    return { details: buildDocumentDetails(moduleKey, req), moduleKey };
  }

  const Model = getModel(hydration.modelName);
  if (!Model) {
    return { details: buildDocumentDetails(moduleKey, req), moduleKey };
  }

  try {
    let query = Model.findById(req.doc_id);
    for (const p of (hydration.populate || [])) {
      if (p?.path) query = query.populate(p.path, p.select);
    }
    const doc = await query.lean();
    if (!doc) return { details: buildDocumentDetails(moduleKey, req), moduleKey };
    return { details: buildDocumentDetails(moduleKey, doc), moduleKey };
  } catch (err) {
    console.error(`ApprovalRequest hydration failed [${docType}/${req.doc_id}]:`, err.message);
    return { details: buildDocumentDetails(moduleKey, req), moduleKey };
  }
}

/**
 * Phase 31 — Shared helper for gap-module pending lists.
 *
 * Queries ApprovalRequest filtered by module (PENDING) and for each request,
 * hydrates the underlying doc from the appropriate model, then builds rich
 * detail via the shared `buildDocumentDetails()`.
 *
 * @param {Object} opts
 * @param {ObjectId} opts.entityId
 * @param {string}   opts.module — MODULE_QUERIES module key (also used as builder key)
 * @param {Object<string,string>} opts.docTypeToModel — maps request.doc_type → Mongoose model name
 * @param {Object<string,Array>}  opts.populateByDocType — per-docType populate config
 * @param {string}   opts.actionType — approve_data.type string for the hub's approve action
 * @param {boolean}  [opts.fallbackToRequest] — if true, fall back to passing the ApprovalRequest
 *                   itself to the builder when no model mapping matches (batch docTypes like
 *                   DEPRECIATION/INTEREST that have no single document).
 */
async function buildGapModulePendingItems(opts) {
  const requests = await ApprovalRequest.find({
    entity_id: opts.entityId,
    module: opts.module,
    status: 'PENDING',
  })
    .populate('requested_by', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  if (!requests.length) return [];

  // Group requests by doc_type so we can batch-hydrate per model.
  const byDocType = new Map();
  for (const req of requests) {
    if (!byDocType.has(req.doc_type)) byDocType.set(req.doc_type, []);
    byDocType.get(req.doc_type).push(req);
  }

  // Hydrate docs per docType
  const hydratedByReqId = new Map();
  for (const [docType, reqs] of byDocType) {
    const modelName = opts.docTypeToModel[docType];
    if (!modelName) continue; // fallback path handled below
    const Model = getModel(modelName);
    if (!Model) continue;

    const ids = reqs.map(r => r.doc_id).filter(Boolean);
    if (!ids.length) continue;

    let query = Model.find({ _id: { $in: ids } });
    const pops = opts.populateByDocType[docType] || [];
    for (const p of pops) query = query.populate(p.path, p.select);
    const docs = await query.lean();
    const docMap = new Map(docs.map(d => [String(d._id), d]));
    for (const r of reqs) {
      const doc = docMap.get(String(r.doc_id));
      if (doc) hydratedByReqId.set(String(r._id), doc);
    }
  }

  return requests.map(req => {
    const hydrated = hydratedByReqId.get(String(req._id));
    const docForBuilder = hydrated || (opts.fallbackToRequest ? req : null);
    return {
      id: `${opts.module}:${req._id}`,
      module: opts.module,
      doc_type: req.doc_type,
      doc_id: req.doc_id,
      doc_ref: req.doc_ref || `${req.doc_type}-${String(req._id).slice(-6)}`,
      description: req.description || `${opts.module} ${req.doc_type} — ${req.doc_ref || 'pending'}`,
      amount: req.amount || 0,
      submitted_by: req.requested_by?.name || 'Unknown',
      submitted_at: req.requested_at || req.createdAt,
      status: 'PENDING_APPROVAL',
      current_action: 'Approve',
      action_key: 'APPROVE',
      approve_data: { type: opts.actionType, id: req._id, request_id: req._id, doc_id: req.doc_id },
      details: buildDocumentDetails(opts.module, docForBuilder),
    };
  });
}

/**
 * Phase 34 — Map module keys (from MODULE_QUERIES or gateApproval) to approval sub-permission keys.
 * Used by isAuthorizedForModule (pending list) and universalApprovalController (approve/edit actions).
 */
const MODULE_TO_SUB_KEY = {
  APPROVAL_REQUEST: null,       // special: derive from item.module field on the ApprovalRequest
  SALES:            'approve_sales',
  // Opening AR shares the sales approve sub-permission — same commercial-ops
  // decision (post a receivable). Subscribers who want a tighter gate can add
  // `approve_opening_ar` to ERP_SUB_PERMISSION and remap here.
  OPENING_AR:       'approve_sales',
  COLLECTION:       'approve_collections',
  INVENTORY:        'approve_inventory',
  SMER:             'approve_expenses',
  CAR_LOGBOOK:      'approve_expenses',
  FUEL_ENTRY:       'approve_expenses',
  // Phase 31R follow-up — Credit Note shares the sales approve sub-permission.
  // Adding a dedicated `approve_credit_notes` sub-key would be subscription-cleaner,
  // but reusing `approve_sales` avoids a second Access Template grant for the same
  // commercial-ops decision (return = reverse of a sale). Subscribers who want to
  // separate the two can add a new ERP_SUB_PERMISSION lookup row + remap here.
  CREDIT_NOTE:      'approve_sales',
  EXPENSES:         'approve_expenses',
  PRF_CALF:         'approve_expenses',
  PURCHASING:       'approve_purchasing',
  PAYROLL:          'approve_payroll',
  JOURNAL:          'approve_journal',
  BANKING:          'approve_banking',
  PETTY_CASH:       'approve_petty_cash',
  IC_TRANSFER:      'approve_ic_transfer',
  INCOME:           'approve_income',
  DEDUCTION_SCHEDULE: 'approve_deductions',
  KPI:              'approve_kpi',
  PERDIEM_OVERRIDE: 'approve_perdiem',
  SALES_GOAL_PLAN:  'approve_sales_goal',
  INCENTIVE_PAYOUT: 'approve_incentive_payout',
  // Phase 32 — reuses inventory approver sub-perm so existing approvers don't need
  // a new Access Template tick. Subscribers who want to split the gate (e.g. let a
  // warehouse clerk acknowledge Undertakings without seeing GRN approvals) can add
  // `approve_undertaking` to ERP_SUB_PERMISSION lookup and flip this mapping.
  UNDERTAKING:      'approve_inventory',
};

/**
 * Check if user has the approval sub-permission for a module.
 * Follows the existing erpSubAccessCheck convention:
 *   - President/CEO → always pass
 *   - FULL access with no sub_permissions defined → all granted
 *   - sub_permissions exist → check specific key
 *
 * @param {object} user - req.user with erp_access
 * @param {string} subKey - one of the approve_* keys
 * @returns {boolean}
 */
function hasApprovalSub(user, subKey) {
  if (!subKey) return true; // null sub_key = open (e.g., APPROVAL_REQUEST — filtered per-item)
  const { role, erp_access } = user;
  if ([ROLES.PRESIDENT, ROLES.CEO].includes(role)) return true;

  const subs = erp_access?.sub_permissions?.approvals;
  const truthyCount = subs ? Object.values(subs).filter(Boolean).length : 0;
  // FULL with no subs defined = all granted (matches erpSubAccessCheck convention)
  if (!subs || truthyCount === 0) {
    return (erp_access?.modules?.approvals === 'FULL');
  }
  return !!subs[subKey];
}

/**
 * Check if a user is authorized for a module.
 * 1. President/CEO → always authorized
 * 2. If ApprovalRules exist for this module → check if user matches any rule
 * 3. If no rules → fall back to lookup-driven MODULE_DEFAULT_ROLES (Rule #3 compliant)
 * 4. Phase 34: sub-permission check — user must also have the module's approval sub-permission
 *
 * @param {ObjectId} entityId
 * @param {object}   user - full req.user object (with _id, role, erp_access)
 * @param {object}   moduleEntry - entry from MODULE_QUERIES
 * @param {Map}      defaultRolesMap - pre-fetched MODULE_DEFAULT_ROLES lookup entries keyed by code
 */
async function isAuthorizedForModule(entityId, user, moduleEntry, defaultRolesMap) {
  const userId = user._id;
  const userRole = user.role;

  // President always sees everything
  if ([ROLES.PRESIDENT, ROLES.CEO].includes(userRole)) return true;

  // Phase 34: sub-permission gate — check before role/rule checks
  const subKey = moduleEntry.sub_key || MODULE_TO_SUB_KEY[moduleEntry.module];
  if (!hasApprovalSub(user, subKey)) return false;

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
 *
 * Phase 34: accepts full user object (was: userId, userRole) for sub-permission checks.
 * @param {ObjectId} entityId
 * @param {object}   user - full req.user object (with _id, role, erp_access)
 * @param {ObjectId[]} entityIds - user's entity_ids for cross-entity support
 */
async function getUniversalPending(entityId, user, entityIds) {
  const userRole = user.role;
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
    const auth = await isAuthorizedForModule(entityId, user, mod, defaultRolesMap);
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

  // Flatten + dedup by composite id (strict dupes from module re-entry across entities)
  const seen = new Set();
  const flat = results.flat().filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  // ── Phase G4.1 — doc_id dedup across surfaces ──
  //
  // The APPROVAL_REQUEST query now returns ALL pending requests (previously it
  // excluded level-0 default-roles-gate items). That can duplicate any request
  // whose underlying doc is ALSO returned by a module-native query — e.g. a
  // CAR_LOGBOOK held by gateApproval appears both as
  //   id: 'CAR_LOGBOOK:<entryId>'       (raw, action_key: POST)
  //   id: 'APPROVAL_REQUEST:<reqId>'    (mirror, action_key: APPROVE)
  // Both items share the same `doc_id`. We prefer the raw module item because
  // its action handler runs the actual post (which resolves the request via
  // the Phase G4 close-loop). Orphan ApprovalRequests (no module-native
  // sibling) survive this pass and surface with their hydrated details so the
  // approver can still expand and act on them from the Hub.
  const byDocId = new Map();
  for (const item of flat) {
    const key = item.doc_id ? String(item.doc_id) : null;
    if (!key) continue;
    if (!byDocId.has(key)) byDocId.set(key, []);
    byDocId.get(key).push(item);
  }

  const dropIds = new Set();
  for (const group of byDocId.values()) {
    if (group.length < 2) continue;
    const hasRaw = group.some(g => !String(g.id).startsWith('APPROVAL_REQUEST:'));
    if (!hasRaw) continue;
    for (const g of group) {
      if (String(g.id).startsWith('APPROVAL_REQUEST:')) dropIds.add(g.id);
    }
  }

  // ── Phase G4.1 — per-item sub-permission filter for APPROVAL_REQUEST items ──
  //
  // APPROVAL_REQUEST is registered with `sub_key: null` (open at the module
  // level — any Hub user passes isAuthorizedForModule). Pre-Phase G4.1 the
  // query only returned level-1+ items, so the "bypass" was tiny. Now that we
  // surface ALL pending requests (incl. level-0 default-roles-gate), we must
  // derive each item's real sub_key from its `module` field and filter out
  // items the caller isn't entitled to approve. President/CEO always pass.
  const filteredByPerm = flat.filter(item => {
    if (!String(item.id).startsWith('APPROVAL_REQUEST:')) return true;
    const itemModule = item.module || 'APPROVAL_REQUEST';
    const itemSubKey = MODULE_TO_SUB_KEY[itemModule];
    return hasApprovalSub(user, itemSubKey);
  });

  const allItems = filteredByPerm.filter(i => !dropIds.has(i.id))
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

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

  // ── Sign S3 photo URLs so the browser can load them ──
  const signUrl = async (url) => {
    if (!url) return url;
    try {
      const key = extractKeyFromUrl(url);
      return await getSignedDownloadUrl(key, 3600);
    } catch (err) {
      console.error('Approval signUrl failed:', url, err.message);
      return url;
    }
  };
  const signUrls = (urls) => Promise.all((urls || []).map(u => signUrl(u)));

  await Promise.all(allItems.map(async (item) => {
    const d = item.details || {};
    switch (item.module) {
      case 'SALES':
        d.csi_photo_url = await signUrl(d.csi_photo_url);
        break;
      case 'COLLECTION':
        [d.deposit_slip_url, d.cr_photo_url, d.cwt_certificate_url] = await Promise.all([
          signUrl(d.deposit_slip_url), signUrl(d.cr_photo_url), signUrl(d.cwt_certificate_url)
        ]);
        d.csi_photo_urls = await signUrls(d.csi_photo_urls);
        break;
      case 'EXPENSES':
        await Promise.all((d.lines || []).map(async (l) => {
          l.or_photo_url = await signUrl(l.or_photo_url);
        }));
        break;
      case 'CAR_LOGBOOK':
        await Promise.all([
          ...(d.fuel_receipts || []).map(async (fr) => {
            [fr.receipt_url, fr.starting_km_photo_url, fr.ending_km_photo_url] = await Promise.all([
              signUrl(fr.receipt_url), signUrl(fr.starting_km_photo_url), signUrl(fr.ending_km_photo_url)
            ]);
          }),
          (async () => {
            [d.starting_km_photo_url, d.ending_km_photo_url] = await Promise.all([
              signUrl(d.starting_km_photo_url), signUrl(d.ending_km_photo_url)
            ]);
          })(),
        ]);
        break;
      case 'INVENTORY':
        [d.waybill_photo_url, d.undertaking_photo_url] = await Promise.all([
          signUrl(d.waybill_photo_url), signUrl(d.undertaking_photo_url)
        ]);
        break;
      case 'UNDERTAKING':
        // Phase 32 — waybill + legacy undertaking photo are stored on the linked
        // GRN and mirrored onto the Undertaking details payload by
        // buildUndertakingDetails. Sign both so the Hub can render the waybill
        // thumbnail + click-to-enlarge modal.
        [d.waybill_photo_url, d.undertaking_photo_url] = await Promise.all([
          signUrl(d.waybill_photo_url), signUrl(d.undertaking_photo_url)
        ]);
        break;
      case 'PRF_CALF':
        d.photo_urls = await signUrls(d.photo_urls);
        break;
      case 'CREDIT_NOTE':
        d.photo_urls = await signUrls(d.photo_urls);
        break;
      // Phase 31 — gap modules
      case 'IC_TRANSFER':
        if (d.kind === 'IC_SETTLEMENT') {
          [d.deposit_slip_url, d.cr_photo_url] = await Promise.all([
            signUrl(d.deposit_slip_url), signUrl(d.cr_photo_url)
          ]);
        }
        break;
      case 'PETTY_CASH':
        d.or_photo_url = await signUrl(d.or_photo_url);
        break;
    }
  }));

  return allItems;
}

module.exports = {
  getUniversalPending,
  MODULE_QUERIES,
  MODULE_TO_SUB_KEY,
  hasApprovalSub,
};
