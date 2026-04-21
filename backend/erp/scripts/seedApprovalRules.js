/**
 * Seed default Approval Rules per module — Authority Matrix
 *
 * Creates one Level-1 rule for every module + doc_type combination that calls
 * gateApproval() in the codebase. Rules follow the APPROVAL_CATEGORY lookup:
 *   - Financial modules → president + finance approve
 *   - Operational modules → admin + finance approve
 *
 * Idempotent — skips rules that already exist (entity_id + module + doc_type + level).
 *
 * Usage: node backend/erp/scripts/seedApprovalRules.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ApprovalRule = require('../models/ApprovalRule');
const Entity = require('../models/Entity');

// ── Financial modules: president + finance ──────────────────────────────────
const FINANCIAL_RULES = [
  { module: 'EXPENSES',    doc_type: 'SMER',             description: 'Sales & Marketing Expense Reports' },
  { module: 'EXPENSES',    doc_type: 'CAR_LOGBOOK',      description: 'Mileage & fuel logbook submissions' },
  { module: 'EXPENSES',    doc_type: 'EXPENSE_ENTRY',    description: 'General expense entries (ORE/ACCESS)' },
  { module: 'EXPENSES',    doc_type: 'PRF_CALF',         description: 'Per Diem Reimbursement / CALF liquidation' },
  { module: 'PURCHASING',  doc_type: 'SUPPLIER_INVOICE',  description: 'Supplier invoice posting' },
  { module: 'PAYROLL',     doc_type: 'PAYSLIP',          description: 'Payslip batch posting' },
  { module: 'JOURNAL',     doc_type: 'JOURNAL_ENTRY',    description: 'Manual journal entries' },
  { module: 'JOURNAL',     doc_type: 'DEPRECIATION',     description: 'Fixed asset depreciation posting' },
  { module: 'JOURNAL',     doc_type: 'INTEREST',         description: 'Interest accrual posting' },
  { module: 'BANKING',     doc_type: 'BANK_RECON',       description: 'Bank reconciliation finalization' },
  { module: 'PETTY_CASH',  doc_type: 'DISBURSEMENT',     description: 'Petty cash disbursements' },
  { module: 'IC_TRANSFER', doc_type: 'IC_TRANSFER',      description: 'Inter-company stock transfers' },
  { module: 'IC_TRANSFER', doc_type: 'IC_SETTLEMENT',    description: 'Inter-company settlement' },
  { module: 'INCOME',      doc_type: 'PNL_REPORT',       description: 'Income / P&L report submission' },
  // Opening AR — pre-cutover historical sales. Higher fraud risk than
  // regular SALES so it seeds under financial (president + finance).
  { module: 'OPENING_AR',       doc_type: 'CSI',              description: 'Pre-cutover historical AR (Opening AR CSI)' },
  // Sales Goal incentive lifecycle (Phase SG-Q2 W2). Accrual is automatic;
  // approve/pay/reverse route through gateApproval.
  { module: 'INCENTIVE_PAYOUT', doc_type: 'PAYOUT_APPROVE',   description: 'Incentive payout approval' },
  { module: 'INCENTIVE_PAYOUT', doc_type: 'PAYOUT_PAY',       description: 'Incentive payout settlement (cash/bank)' },
  { module: 'INCENTIVE_PAYOUT', doc_type: 'PAYOUT_REVERSE',   description: 'Incentive payout reversal' },
];

// ── Operational modules: admin + finance ────────────────────────────────────
const OPERATIONAL_RULES = [
  { module: 'SALES',       doc_type: 'CSI',          description: 'Customer sales invoice batch' },
  { module: 'SALES',       doc_type: 'CREDIT_NOTE',  description: 'Credit note submission' },
  { module: 'COLLECTION',  doc_type: 'CR',           description: 'Collection receipts' },
  { module: 'INVENTORY',   doc_type: 'GRN',          description: 'Goods Received Note posting' },
  // Phase 32 — Undertaking (receipt confirmation). Acknowledge auto-approves
  // the linked GRN. BDM acknowledges directly; admin/finance if lookup roles
  // restrict BDM (per-entity MODULE_DEFAULT_ROLES.UNDERTAKING).
  { module: 'UNDERTAKING', doc_type: 'UNDERTAKING',  description: 'Goods receipt acknowledgement (auto-approves linked GRN)' },
  // Phase 31R — standalone CreditNote (sales return) approval when submitted
  // outside a SALES batch.
  { module: 'CREDIT_NOTE', doc_type: 'CREDIT_NOTE',  description: 'Standalone credit note / product returns' },
  // Phase 33 — per-fuel-entry approval (held under module=EXPENSES at
  // gateApproval time today; admin can ALSO target rules at module=FUEL_ENTRY
  // for future symmetric routing).
  { module: 'FUEL_ENTRY',  doc_type: 'FUEL_ENTRY',   description: 'Individual fuel receipt approval (per-entry)' },
  // Phase SG-Q2 — Sales Goal plan lifecycle (activate/close/reopen/bulk/compute).
  { module: 'SALES_GOAL_PLAN', doc_type: 'PLAN_ACTIVATE',       description: 'Sales goal plan activation' },
  { module: 'SALES_GOAL_PLAN', doc_type: 'PLAN_CLOSE',          description: 'Sales goal plan close' },
  { module: 'SALES_GOAL_PLAN', doc_type: 'PLAN_REOPEN',         description: 'Sales goal plan reopen' },
  { module: 'SALES_GOAL_PLAN', doc_type: 'PLAN_NEW_VERSION',    description: 'Plan versioning / new version' },
  { module: 'SALES_GOAL_PLAN', doc_type: 'BULK_TARGETS_IMPORT', description: 'Bulk target import (Excel)' },
  { module: 'SALES_GOAL_PLAN', doc_type: 'TARGET_REVISION',     description: 'Mid-period target revision' },
  // Phase SG-4 — Incentive dispute lifecycle (file is open; take/resolve/close
  // go through gateApproval).
  { module: 'INCENTIVE_DISPUTE', doc_type: 'DISPUTE_TAKE_REVIEW', description: 'Take review on filed dispute' },
  { module: 'INCENTIVE_DISPUTE', doc_type: 'DISPUTE_RESOLVE',     description: 'Resolve dispute (approved or denied)' },
  { module: 'INCENTIVE_DISPUTE', doc_type: 'DISPUTE_CLOSE',       description: 'Close dispute' },
];

async function seedApprovalRules() {
  await connectDB();

  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  if (!entities.length) {
    console.log('No active entities found. Nothing to seed.');
    process.exit(0);
  }

  console.log(`Found ${entities.length} active entity(ies).\n`);

  let created = 0;
  let skipped = 0;

  for (const entity of entities) {
    console.log(`── Entity: ${entity.entity_name} (${entity._id}) ──`);

    // Financial rules
    for (const rule of FINANCIAL_RULES) {
      const exists = await ApprovalRule.findOne({
        entity_id: entity._id,
        module: rule.module,
        doc_type: rule.doc_type,
        level: 1,
      });
      if (exists) {
        skipped++;
        continue;
      }
      await ApprovalRule.create({
        entity_id: entity._id,
        module: rule.module,
        doc_type: rule.doc_type,
        level: 1,
        amount_threshold: null,
        approver_type: 'ROLE',
        approver_roles: ['president', 'finance'],
        description: rule.description,
        is_active: true,
      });
      console.log(`  + ${rule.module} / ${rule.doc_type}`);
      created++;
    }

    // Operational rules
    for (const rule of OPERATIONAL_RULES) {
      const exists = await ApprovalRule.findOne({
        entity_id: entity._id,
        module: rule.module,
        doc_type: rule.doc_type,
        level: 1,
      });
      if (exists) {
        skipped++;
        continue;
      }
      await ApprovalRule.create({
        entity_id: entity._id,
        module: rule.module,
        doc_type: rule.doc_type,
        level: 1,
        amount_threshold: null,
        approver_type: 'ROLE',
        approver_roles: ['admin', 'finance'],
        description: rule.description,
        is_active: true,
      });
      console.log(`  + ${rule.module} / ${rule.doc_type}`);
      created++;
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (already exist): ${skipped}`);
  await mongoose.disconnect();
  process.exit(0);
}

seedApprovalRules().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
