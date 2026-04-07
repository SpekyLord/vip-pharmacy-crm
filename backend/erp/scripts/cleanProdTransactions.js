/**
 * PROD DB CLEANUP — Wipe all test ERP transactions
 *
 * KEEPS: hospitals, products, customers, COA, cost centers, payment modes,
 *        gov rates, access templates, lookups, territories, warehouses,
 *        settings, comp profiles, vendors, people master, expense components,
 *        transfer price list, bank accounts, credit cards (master),
 *        recurring journal templates, insurance policies, office supplies (catalog),
 *        fixed assets, entity, agent config
 *
 * WIPES: all transactional ERP data (sales, collections, journals, GRN,
 *        expenses, payslips, petty cash, inventory ledger, bank statements,
 *        CC transactions, VAT/CWT ledgers, reports, SMER, archives,
 *        AP payments, POs, supplier invoices, loans, collaterals, CSI booklets,
 *        car logbook, IC transfers, consignment, partner scorecards, audit logs, etc.)
 *
 * Also resets doc sequences back to 0.
 *
 * CRM collections (users, doctors, visits, regions, etc.) are UNTOUCHED.
 *
 * Usage:
 *   cd backend
 *   node erp/scripts/cleanProdTransactions.js          ← dry run (default)
 *   node erp/scripts/cleanProdTransactions.js --commit ← actually deletes
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../../config/db');

// ─── Collections to WIPE ──────────────────────────────────────────────────────
const TRANSACTIONAL_COLLECTIONS = [
  'erp_sales_lines',
  'erp_collections',
  'erp_journal_entries',
  'erp_grn_entries',
  'erp_expense_entries',
  'erp_payslips',
  'erp_petty_cash_funds',
  'erp_petty_cash_transactions',
  'erp_petty_cash_remittances',
  'erp_inventory_ledger',
  'erp_bank_statements',
  'erp_credit_card_transactions',
  'erp_cwt_ledger',
  'erp_vat_ledger',
  'erp_income_reports',
  'erp_cycle_reports',
  'erp_pnl_reports',
  'erp_smer_entries',
  'erp_monthly_archives',
  'erp_archive_batches',
  'erp_archived_documents',
  'erp_ap_payments',
  'erp_ic_settlements',
  'erp_inter_company_transfers',
  'erp_stock_reassignments',
  'erp_purchase_orders',
  'erp_supplier_invoices',
  'erp_loans',
  'erp_owner_equity',
  'erp_cashflow_statements',
  'erp_car_logbook_entries',
  'erp_csi_booklets',
  'erp_collaterals',
  'erp_office_supply_transactions',
  'erp_consignmenttrackers',
  'erp_partner_scorecards',
  'erp_budget_allocations',
  'erp_period_locks',
  'erp_prf_calf',
  'erp_document_attachments',
  'erp_agent_runs',
  'erp_audit_logs',
];

// ─── Collections to RESET (doc sequences → counter back to 0) ────────────────
const SEQUENCE_COLLECTION = 'erp_doc_sequences';

const isDryRun = !process.argv.includes('--commit');

async function run() {
  await connectDB();
  const db = mongoose.connection.db;

  console.log('\n========================================');
  console.log(isDryRun ? '  DRY RUN — nothing will be deleted' : '  LIVE MODE — DELETING DATA');
  console.log('========================================\n');

  let totalDocs = 0;

  // ── Count / wipe transactional collections ───────────────────────────────
  for (const col of TRANSACTIONAL_COLLECTIONS) {
    const count = await db.collection(col).countDocuments();
    totalDocs += count;
    if (isDryRun) {
      console.log(`  [DRY RUN] ${col}: ${count} documents would be deleted`);
    } else {
      const result = await db.collection(col).deleteMany({});
      console.log(`  [WIPED]   ${col}: ${result.deletedCount} documents deleted`);
    }
  }

  // ── Reset doc sequences ──────────────────────────────────────────────────
  const seqCount = await db.collection(SEQUENCE_COLLECTION).countDocuments();
  if (isDryRun) {
    console.log(`\n  [DRY RUN] ${SEQUENCE_COLLECTION}: ${seqCount} sequences would be reset to 0`);
  } else {
    const result = await db.collection(SEQUENCE_COLLECTION).updateMany({}, { $set: { seq: 0 } });
    console.log(`\n  [RESET]   ${SEQUENCE_COLLECTION}: ${result.modifiedCount} sequences reset to 0`);
  }

  console.log('\n========================================');
  if (isDryRun) {
    console.log(`  TOTAL: ${totalDocs} documents would be deleted across ${TRANSACTIONAL_COLLECTIONS.length} collections`);
    console.log('\n  Run with --commit to actually delete:');
    console.log('  node erp/scripts/cleanProdTransactions.js --commit');
  } else {
    console.log('  DONE. All test transactions have been cleared.');
    console.log('  Static/reference data and CRM data are untouched.');
  }
  console.log('========================================\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
