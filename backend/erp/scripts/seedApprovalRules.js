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
];

// ── Operational modules: admin + finance ────────────────────────────────────
const OPERATIONAL_RULES = [
  { module: 'SALES',       doc_type: 'CSI',          description: 'Customer sales invoice batch' },
  { module: 'SALES',       doc_type: 'CREDIT_NOTE',  description: 'Credit note submission' },
  { module: 'COLLECTIONS', doc_type: 'CR',           description: 'Collection receipts' },
  { module: 'INVENTORY',   doc_type: 'GRN',          description: 'Goods Received Note posting' },
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
