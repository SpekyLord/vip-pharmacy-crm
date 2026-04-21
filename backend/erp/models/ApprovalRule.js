/**
 * Approval Rule Model — Phase 28 (Authority Matrix)
 *
 * Defines configurable, multi-level approval rules per entity + module.
 * Admin/President maintains these via the Control Center.
 *
 * When Settings.ENFORCE_AUTHORITY_MATRIX is true, documents matching a rule
 * must be approved by the designated approver(s) before posting.
 *
 * Rules are entity-scoped and lookup-driven — no hardcoded thresholds.
 */

const mongoose = require('mongoose');

const approvalRuleSchema = new mongoose.Schema({
  entity_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Entity',
    required: true,
    index: true,
  },

  // Which module this rule applies to
  // Includes both authority-matrix modules and Universal Approval Hub modules (Phase F.1)
  module: {
    type: String,
    required: true,
    enum: [
      // Authority Matrix (Phase 29)
      'SALES', 'COLLECTIONS', 'EXPENSES', 'PURCHASING',
      'PAYROLL', 'INVENTORY', 'JOURNAL', 'BANKING',
      'PETTY_CASH', 'IC_TRANSFER', 'INCOME',
      // Universal Approval Hub (Phase F / F.1) — posting & approval modules
      'DEDUCTION_SCHEDULE', 'KPI', 'COLLECTION', 'SMER',
      'CAR_LOGBOOK', 'PRF_CALF', 'APPROVAL_REQUEST',
      'PERDIEM_OVERRIDE',
      // Phase 32 — GRN Undertaking approval wrapper
      'UNDERTAKING',
      // Phase 33 — per-fuel-entry approval (subset of EXPENSES docs;
      // mirrored as its own Hub row + admin can target matrix rules at
      // just the FUEL_ENTRY subset via module='FUEL_ENTRY')
      'FUEL_ENTRY',
      // Phase 31R — CreditNote (returns) approval + Phase SG-Q2/SG-4 —
      // Sales Goal plan, Incentive payout, Incentive dispute lifecycles.
      // Each sends its own module key via gateApproval(), so the enum
      // must accept them or rule-creation 400s.
      'CREDIT_NOTE',
      'SALES_GOAL_PLAN',
      'INCENTIVE_PAYOUT',
      'INCENTIVE_DISPUTE',
      // OPENING_AR — Pre-cutover historical AR. Kept separate from
      // regular SALES (higher fraud risk — fabricated balances, self-
      // assigned commissions). salesController splits CSI submissions
      // into two groups and fires gateApproval({ module: 'OPENING_AR' })
      // for the pre-cutover rows. Without this enum entry, admin cannot
      // configure matrix rules that target only Opening AR submissions.
      'OPENING_AR',
    ],
    index: true,
  },

  // Which document type within the module (optional — null means all docs in module)
  doc_type: {
    type: String,
    default: null,
    // e.g., 'CSI', 'CR', 'PO', 'SMER', 'ORE_ACCESS', 'PAYSLIP', 'JOURNAL_ENTRY'
  },

  // Approval level (for multi-level: level 1 approves first, then level 2, etc.)
  level: {
    type: Number,
    default: 1,
    min: 1,
    max: 5,
  },

  // Condition: amount threshold (rule applies when document amount >= this value)
  // null = applies to all amounts (no threshold)
  amount_threshold: {
    type: Number,
    default: null,
  },

  // Who can approve at this level
  approver_type: {
    type: String,
    required: true,
    enum: [
      'ROLE',      // Any user with the specified role
      'USER',      // Specific user(s)
      'REPORTS_TO', // The requester's direct manager (from PeopleMaster.reports_to)
    ],
  },

  // For ROLE type: which roles can approve
  approver_roles: {
    type: [String],
    default: [],
    // e.g., ['admin', 'finance', 'president']
  },

  // For USER type: specific user IDs who can approve
  approver_user_ids: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'User',
    default: [],
  },

  // Human-readable description
  description: {
    type: String,
    default: '',
  },

  is_active: {
    type: Boolean,
    default: true,
  },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
  collection: 'erp_approval_rules',
});

// Compound index for efficient rule lookup
approvalRuleSchema.index({ entity_id: 1, module: 1, is_active: 1, level: 1 });

module.exports = mongoose.model('ApprovalRule', approvalRuleSchema);
