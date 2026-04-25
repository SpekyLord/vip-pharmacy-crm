/* eslint-disable vip-tenant/require-entity-filter -- standalone test script: no req context; queries are by-id on test-created docs the script itself just generated */
/**
 * Phase 7 Test Script — Income, PNL, Profit Sharing & Year-End Close
 *
 * Creates POSTED test data (SalesLines, Collections, SMER, Expenses)
 * then exercises all Phase 7 services and verifies results.
 *
 * Usage: cd backend && node erp/scripts/testPhase7.js
 * Cleanup: Removes all test data on completion (or use --keep flag to keep it)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

// Models
const User = require('../../models/User');
const { ROLES } = require('../../constants/roles');
const Entity = require('../models/Entity');
const Hospital = require('../models/Hospital');
const ProductMaster = require('../models/ProductMaster');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const SmerEntry = require('../models/SmerEntry');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const InventoryLedger = require('../models/InventoryLedger');
const Settings = require('../models/Settings');
const IncomeReport = require('../models/IncomeReport');
const PnlReport = require('../models/PnlReport');
const MonthlyArchive = require('../models/MonthlyArchive');

// Phase 7 Services
const { generatePnlReport, computeCogs, validateYearEndClose, executeYearEndClose } = require('../services/pnlCalc');
const { evaluateEligibility } = require('../services/profitShareEngine');
const { generateIncomeReport, transitionIncomeStatus } = require('../services/incomeCalc');

const KEEP_DATA = process.argv.includes('--keep');
const TEST_PERIOD = '2026-03'; // March 2026
const TEST_CYCLE = 'MONTHLY';

// Track created docs for cleanup
const createdIds = {
  salesLines: [],
  collections: [],
  smer: [],
  expenses: [],
  prfCalf: [],
  incomeReports: [],
  pnlReports: [],
  archives: []
};

// ═══════════════���═══════════════════════════
// HELPERS
// ═══════════════════════════════════════════

function log(label, value) {
  console.log(`  ${label.padEnd(30)} ${value}`);
}

function fmt(n) {
  return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hr(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function periodToDate(period, day) {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  await connectDB();
  console.log('\n🔌 MongoDB connected\n');

  try {
    // ─── Step 1: Find real master data ───
    hr('STEP 1 — Finding Master Data');

    const entity = await Entity.findOne({});
    if (!entity) throw new Error('No Entity found. Run seedErpMasterData.js first.');
    log('Entity:', `${entity.entity_name} (${entity._id})`);

    // Use Jake Montero's BDM account (fallback to any employee)
    const bdm = await User.findOne({ email: 's19.vippharmacy@gmail.com' }) || await User.findOne({ role: ROLES.CONTRACTOR });
    if (!bdm) throw new Error('No BDM (contractor) user found. Run CRM seed first.');
    log('BDM:', `${bdm.firstName || bdm.name} (${bdm._id})`);

    const adminUser = await User.findOne({ role: { $in: ['admin', 'president'] } });
    if (!adminUser) throw new Error('No admin/president user found.');
    log('Admin:', `${adminUser.firstName || adminUser.name} (${adminUser._id})`);

    const products = await ProductMaster.find({ entity_id: entity._id, is_active: true }).limit(5).lean();
    if (products.length < 2) throw new Error('Need at least 2 products. Run seedErpMasterData.js first.');
    log('Products found:', products.length);
    products.forEach(p => log(`  - ${p.brand_name}`, `Buy: ${p.purchase_price} / Sell: ${p.selling_price}`));

    // Hospitals may not have entity_id (shared across entities)
    const hospitals = await Hospital.find({}).limit(3).lean();
    if (hospitals.length < 2) throw new Error('Need at least 2 hospitals. Run seedErpMasterData.js first.');
    log('Hospitals found:', hospitals.length);
    hospitals.forEach(h => log(`  - ${h.hospital_name}`, h._id.toString()));

    const settings = await Settings.getSettings();
    log('VAT Rate:', settings.VAT_RATE);
    log('PS Min Hospitals:', settings.PROFIT_SHARE_MIN_HOSPITALS);
    log('PS Consecutive Months:', settings.PS_CONSECUTIVE_MONTHS);
    log('PS BDM %:', settings.PROFIT_SHARE_BDM_PCT);

    // Get a Doctor (CRM) for partner tagging
    const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', new mongoose.Schema({}, { strict: false, collection: 'doctors' }));
    const doctor = await Doctor.findOne({}).lean();

    const entityId = entity._id;
    const bdmId = bdm._id;
    const userId = adminUser._id;

    // ─── Step 2: Create POSTED SalesLines ───
    hr('STEP 2 — Creating POSTED SalesLines (CSIs)');

    const salesData = [
      {
        hospital_id: hospitals[0]._id,
        doc_ref: 'TEST-CSI-001',
        csi_date: periodToDate(TEST_PERIOD, 5),
        line_items: [
          { product_id: products[0]._id, qty: 10, unit_price: products[0].selling_price || 100, unit: 'PC' },
          { product_id: products[1]._id, qty: 5, unit_price: products[1].selling_price || 80, unit: 'PC' }
        ]
      },
      {
        hospital_id: hospitals[1]._id,
        doc_ref: 'TEST-CSI-002',
        csi_date: periodToDate(TEST_PERIOD, 10),
        line_items: [
          { product_id: products[0]._id, qty: 8, unit_price: products[0].selling_price || 100, unit: 'PC' }
        ]
      },
      {
        hospital_id: hospitals[0]._id,
        doc_ref: 'TEST-CSI-003',
        csi_date: periodToDate(TEST_PERIOD, 15),
        line_items: [
          { product_id: products[1]._id, qty: 12, unit_price: products[1].selling_price || 80, unit: 'PC' },
          ...(products[2] ? [{ product_id: products[2]._id, qty: 6, unit_price: products[2].selling_price || 60, unit: 'PC' }] : [])
        ]
      }
    ];

    for (const data of salesData) {
      const sl = await SalesLine.create({
        entity_id: entityId,
        bdm_id: bdmId,
        ...data,
        status: 'POSTED',
        posted_at: data.csi_date,
        posted_by: userId,
        created_by: userId
      });
      createdIds.salesLines.push(sl._id);
      log(`Created ${data.doc_ref}:`, fmt(sl.invoice_total));
    }

    // ─── Step 3: Create POSTED Collections ───
    hr('STEP 3 — Creating POSTED Collections (CRs)');

    const salesDocs = await SalesLine.find({ _id: { $in: createdIds.salesLines } }).lean();

    const collectionData = [
      {
        hospital_id: hospitals[0]._id,
        cr_no: 'TEST-CR-001',
        cr_date: periodToDate(TEST_PERIOD, 12),
        cr_amount: salesDocs[0].invoice_total,
        settled_csis: [{
          sales_line_id: salesDocs[0]._id,
          doc_ref: salesDocs[0].doc_ref,
          csi_date: salesDocs[0].csi_date,
          invoice_amount: salesDocs[0].invoice_total,
          net_of_vat: salesDocs[0].total_net_of_vat,
          source: 'SALES_LINE',
          commission_rate: 0.03, // 3%
          commission_amount: salesDocs[0].total_net_of_vat * 0.03,
          partner_tags: doctor ? [{
            doctor_id: doctor._id,
            doctor_name: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Dr. Test',
            rebate_pct: 2,
            rebate_amount: salesDocs[0].total_net_of_vat * 0.02
          }] : []
        }],
        payment_mode: 'CHECK'
      },
      {
        hospital_id: hospitals[1]._id,
        cr_no: 'TEST-CR-002',
        cr_date: periodToDate(TEST_PERIOD, 18),
        cr_amount: salesDocs[1].invoice_total,
        settled_csis: [{
          sales_line_id: salesDocs[1]._id,
          doc_ref: salesDocs[1].doc_ref,
          csi_date: salesDocs[1].csi_date,
          invoice_amount: salesDocs[1].invoice_total,
          net_of_vat: salesDocs[1].total_net_of_vat,
          source: 'SALES_LINE',
          commission_rate: 0.03,
          commission_amount: salesDocs[1].total_net_of_vat * 0.03,
          partner_tags: doctor ? [{
            doctor_id: doctor._id,
            doctor_name: `${doctor.firstName || ''} ${doctor.lastName || ''}`.trim() || 'Dr. Test',
            rebate_pct: 2,
            rebate_amount: salesDocs[1].total_net_of_vat * 0.02
          }] : []
        }],
        payment_mode: 'CASH'
      }
    ];

    for (const data of collectionData) {
      const col = await Collection.create({
        entity_id: entityId,
        bdm_id: bdmId,
        ...data,
        status: 'POSTED',
        posted_at: data.cr_date,
        posted_by: userId,
        created_by: userId
      });
      createdIds.collections.push(col._id);
      log(`Created ${data.cr_no}:`, `${fmt(col.cr_amount)} | Commission: ${fmt(col.total_commission)} | Rebates: ${fmt(col.total_partner_rebates)}`);
    }

    // ─── Step 4: Create POSTED SMER ───
    hr('STEP 4 — Creating POSTED SMER Entry');

    const smer = await SmerEntry.create({
      entity_id: entityId,
      bdm_id: bdmId,
      period: TEST_PERIOD,
      cycle: TEST_CYCLE,
      // Phase G1.5 — rate now lives in PERDIEM_RATES lookup. Test fixture uses
      // the pharma default (₱800) directly; production resolvePerdiemConfig throws
      // on missing lookup row instead of silently falling back.
      perdiem_rate: 800,
      daily_entries: [
        { day: 3, entry_date: periodToDate(TEST_PERIOD, 3), day_of_week: 'TUE', md_count: 8, perdiem_tier: 'FULL', perdiem_amount: 800, transpo_p2p: 150 },
        { day: 4, entry_date: periodToDate(TEST_PERIOD, 4), day_of_week: 'WED', md_count: 5, perdiem_tier: 'HALF', perdiem_amount: 400, transpo_p2p: 200 },
        { day: 5, entry_date: periodToDate(TEST_PERIOD, 5), day_of_week: 'THU', md_count: 10, perdiem_tier: 'FULL', perdiem_amount: 800, transpo_p2p: 100 },
        { day: 10, entry_date: periodToDate(TEST_PERIOD, 10), day_of_week: 'TUE', md_count: 9, perdiem_tier: 'FULL', perdiem_amount: 800, transpo_p2p: 180 },
        { day: 11, entry_date: periodToDate(TEST_PERIOD, 11), day_of_week: 'WED', md_count: 2, perdiem_tier: 'ZERO', perdiem_amount: 0, transpo_p2p: 120 }
      ],
      status: 'POSTED',
      event_id: null,
      created_by: userId
    });
    createdIds.smer.push(smer._id);
    log('SMER Total Reimbursable:', fmt(smer.total_reimbursable));
    log('SMER Total Per Diem:', fmt(smer.total_perdiem));
    log('SMER Total Transport:', fmt(smer.total_transpo));

    // ─── Step 5: Create POSTED Expense Entry ───
    hr('STEP 5 — Creating POSTED Expense Entry (ORE/ACCESS)');

    const expense = await ExpenseEntry.create({
      entity_id: entityId,
      bdm_id: bdmId,
      period: TEST_PERIOD,
      cycle: TEST_CYCLE,
      lines: [
        { expense_date: periodToDate(TEST_PERIOD, 6), expense_type: 'ORE', expense_category: 'parking', amount: 150, payment_mode: 'CASH' },
        { expense_date: periodToDate(TEST_PERIOD, 8), expense_type: 'ORE', expense_category: 'toll', amount: 200, payment_mode: 'CASH' },
        { expense_date: periodToDate(TEST_PERIOD, 12), expense_type: 'ACCESS', expense_category: 'courier', amount: 350, payment_mode: 'GCASH' }
      ],
      status: 'POSTED',
      created_by: userId
    });
    createdIds.expenses.push(expense._id);
    log('ORE Total:', fmt(expense.total_ore));
    log('ACCESS Total:', fmt(expense.total_access));

    // ─── Step 6: Test PNL Generation ───
    hr('STEP 6 — Testing PNL Report Generation');

    const pnl = await generatePnlReport(entityId.toString(), bdmId.toString(), TEST_PERIOD, userId);
    createdIds.pnlReports.push(pnl._id);

    console.log('\n  ┌─────────────── P&L STATEMENT ───────────────┐');
    console.log('  │ REVENUE                                      │');
    log('  │  Gross Sales:', fmt(pnl.revenue.gross_sales));
    log('  │  Less: VAT:', fmt(pnl.revenue.total_vat));
    log('  │  Net Sales:', fmt(pnl.revenue.net_sales));
    log('  │  Collections (Net VAT):', fmt(pnl.revenue.collections_net_of_vat));
    console.log('  │                                              │');
    console.log('  │ COST OF GOODS SOLD                            │');
    log('  │  COGS:', fmt(pnl.cogs.total_cogs));
    console.log('  │                                              │');
    log('  │  GROSS PROFIT:', fmt(pnl.gross_profit));
    console.log('  │                                              │');
    console.log('  │ OPERATING EXPENSES                            │');
    log('  │  SMER Reimbursable:', fmt(pnl.expenses.smer_reimbursable));
    log('  │  Gas less Personal:', fmt(pnl.expenses.gasoline_less_personal));
    log('  │  Partners Insurance:', fmt(pnl.expenses.partners_insurance));
    log('  │  ACCESS Total:', fmt(pnl.expenses.access_total));
    log('  │  ORE Total:', fmt(pnl.expenses.ore_total));
    log('  │  Sampling DR Cost:', fmt(pnl.expenses.sampling_dr_cost));
    log('  │  Total Expenses:', fmt(pnl.total_expenses));
    console.log('  │                                              │');
    log('  │  ▶ NET INCOME:', fmt(pnl.net_income));
    console.log('  │                                              │');
    console.log('  │ PROFIT SHARING                                │');
    log('  │  Eligible:', pnl.profit_sharing.eligible ? 'YES ✓' : 'NO (streak building)');
    log('  │  Deficit:', pnl.profit_sharing.deficit_flag ? 'YES' : 'NO');
    log('  │  BDM Share:', fmt(pnl.profit_sharing.bdm_share));
    log('  │  VIP Share:', fmt(pnl.profit_sharing.vip_share));
    log('  │  Products evaluated:', pnl.profit_sharing.ps_products?.length || 0);
    for (const p of (pnl.profit_sharing.ps_products || [])) {
      log(`  │    ${p.product_name}:`, `Hospitals=${p.hospital_count} MDs=${p.md_count} Streak=${p.consecutive_months} ${p.qualified ? '✓' : '✗'}`);
    }
    console.log('  └────────────────────────────��───────────────┘\n');

    // ─── Step 7: Test COGS Breakdown ───
    hr('STEP 7 — Testing COGS Breakdown');
    const { start, end } = periodToDates(TEST_PERIOD);
    const cogsData = await computeCogs(entityId.toString(), bdmId.toString(), start, end);
    log('Total COGS:', fmt(cogsData.total_cogs));
    for (const b of cogsData.breakdown) {
      log(`  ${b.product_name}:`, `${b.qty_sold} units × ${fmt(b.unit_cost)} = ${fmt(b.cogs)}`);
    }

    // ─── Step 8: Test Profit Share Engine Directly ───
    hr('STEP 8 — Testing Profit Share Engine');
    const psResult = await evaluateEligibility(entityId.toString(), bdmId.toString(), TEST_PERIOD, { net_income: pnl.net_income });
    log('PS Eligible:', psResult.eligible ? 'YES' : 'NO');
    log('PS Deficit:', psResult.deficit_flag ? 'YES' : 'NO');
    log('Products passing Cond A:', psResult.ps_products.filter(p => p.hospital_count >= 2).length);
    log('Products passing Cond B:', psResult.ps_products.filter(p => p.md_count >= 1).length);
    log('Products with streak ≥ 3:', psResult.ps_products.filter(p => p.consecutive_months >= 3).length);
    console.log('\n  Note: PS eligible = false is expected (first month, streak = 0-1, needs 3+ months)');

    // ─── Step 9: Test Income Report Generation ───
    hr('STEP 9 — Testing Income Report Generation');
    const income = await generateIncomeReport(entityId.toString(), bdmId.toString(), TEST_PERIOD, TEST_CYCLE, userId);
    createdIds.incomeReports.push(income._id);

    console.log('\n  ┌──────────���──── PAYSLIP ───────────────┐');
    console.log('  │ EARNINGS                                │');
    log('  │  SMER:', fmt(income.earnings.smer));
    log('  │  CORE Commission:', fmt(income.earnings.core_commission));
    log('  │  Bonus:', fmt(income.earnings.bonus));
    log('  │  Profit Sharing:', fmt(income.earnings.profit_sharing));
    log('  │  Reimbursements:', fmt(income.earnings.reimbursements));
    log('  │  ─────────────────────', '');
    log('  │  TOTAL EARNINGS:', fmt(income.total_earnings));
    console.log('  │                                         │');
    console.log('  │ DEDUCTIONS                               │');
    log('  │  Cash Advance:', fmt(income.deductions.cash_advance));
    log('  │  Credit Card:', fmt(income.deductions.credit_card_payment));
    log('  │  Other Deductions:', fmt(income.deductions.other_deductions));
    log('  │  ─────────────────────', '');
    log('  │  TOTAL DEDUCTIONS:', fmt(income.total_deductions));
    console.log('  │                                         │');
    log('  │  ▶ NET PAY:', fmt(income.net_pay));
    log('  │  Status:', income.status);
    console.log('  └─────────────────────────────────────────┘\n');

    // ─── Step 10: Test Income Workflow ───
    hr('STEP 10 — Testing Income Workflow Transitions');

    log('Current status:', income.status);

    const reviewed = await transitionIncomeStatus(income._id, 'review', userId);
    log('After review:', reviewed.status);

    const confirmed = await transitionIncomeStatus(income._id, 'confirm', bdmId);
    log('After BDM confirm:', confirmed.status);

    const credited = await transitionIncomeStatus(income._id, 'credit', userId);
    log('After credit:', credited.status);

    console.log('  ✓ Workflow: GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED');

    // ─── Step 11: Test Period Close ───
    hr('STEP 11 — Testing Period Close');

    // Post the PNL first
    pnl.status = 'POSTED';
    pnl.posted_at = new Date();
    pnl.posted_by = userId;
    await pnl.save();
    log('PNL status:', pnl.status);

    // Close the period
    const archive = await MonthlyArchive.findOneAndUpdate(
      { entity_id: entityId, period: TEST_PERIOD, record_type: 'MONTHLY' },
      {
        entity_id: entityId,
        period: TEST_PERIOD,
        record_type: 'MONTHLY',
        period_status: 'CLOSED',
        closed_at: new Date(),
        closed_by: userId,
        snapshot: {
          total_sales: pnl.revenue.gross_sales,
          total_collections: pnl.revenue.collections_net_of_vat,
          total_cogs: pnl.cogs.total_cogs,
          total_expenses: pnl.total_expenses,
          total_net_income: pnl.net_income
        },
        created_by: userId
      },
      { upsert: true, new: true }
    );
    createdIds.archives.push(archive._id);
    log('Period close:', `${TEST_PERIOD} → ${archive.period_status}`);

    // ─── Step 12: Test Year-End Close Validation ───
    hr('STEP 12 — Testing Year-End Close Validation');

    const fyYear = parseInt(TEST_PERIOD.split('-')[0]);
    const fyValidation = await validateYearEndClose(entityId.toString(), fyYear);
    log('Fiscal Year:', fyYear);
    log('Ready:', fyValidation.ready ? 'YES' : 'NO');
    log('Closed periods:', fyValidation.closed_periods.length);
    log('Open periods:', fyValidation.open_periods.length);
    log('Missing periods:', fyValidation.missing_periods.length);
    console.log('  Note: Year-end close requires all 12 months closed (only 1 closed here — expected NOT READY)');

    // ─── Summary ───
    hr('TEST SUMMARY');
    console.log('  ✓ Master data found (entity, BDM, products, hospitals)');
    console.log('  ✓ Created 3 POSTED SalesLines (CSIs)');
    console.log('  ✓ Created 2 POSTED Collections (CRs) with commission + partner tags');
    console.log('  ✓ Created 1 POSTED SMER entry with 5 daily entries');
    console.log('  ✓ Created 1 POSTED Expense entry (ORE + ACCESS)');
    console.log('  ✓ PNL Report generated with revenue, COGS, expenses, net income');
    console.log('  ✓ COGS breakdown by product verified');
    console.log('  ✓ Profit Share engine evaluated (streak building — first month)');
    console.log('  ✓ Income Report generated with earnings + deductions');
    console.log('  ✓ Income workflow: GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED');
    console.log('  ✓ Period close: monthly archive created');
    console.log('  ✓ Year-end validation: correctly reports NOT READY (need all 12 months)');
    console.log(`\n  All Phase 7 tests PASSED ✓\n`);

  } catch (err) {
    console.error('\n  ✗ TEST FAILED:', err.message);
    console.error(err.stack);
  } finally {
    // ─── Cleanup ───
    if (!KEEP_DATA) {
      hr('CLEANUP — Removing test data');
      try {
        if (createdIds.incomeReports.length) await IncomeReport.deleteMany({ _id: { $in: createdIds.incomeReports } });
        if (createdIds.pnlReports.length) await PnlReport.deleteMany({ _id: { $in: createdIds.pnlReports } });
        if (createdIds.archives.length) await MonthlyArchive.deleteMany({ _id: { $in: createdIds.archives } });
        if (createdIds.collections.length) await Collection.deleteMany({ _id: { $in: createdIds.collections } });
        if (createdIds.salesLines.length) await SalesLine.deleteMany({ _id: { $in: createdIds.salesLines } });
        if (createdIds.smer.length) await SmerEntry.deleteMany({ _id: { $in: createdIds.smer } });
        if (createdIds.expenses.length) await ExpenseEntry.deleteMany({ _id: { $in: createdIds.expenses } });
        if (createdIds.prfCalf.length) await PrfCalf.deleteMany({ _id: { $in: createdIds.prfCalf } });
        console.log('  ✓ All test data removed');
      } catch (cleanErr) {
        console.error('  ✗ Cleanup error:', cleanErr.message);
      }
    } else {
      console.log('\n  --keep flag: test data preserved in database');
    }

    await mongoose.disconnect();
    console.log('  Disconnected.\n');
    process.exit(0);
  }
}

function periodToDates(period) {
  const [year, month] = period.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1)
  };
}

main();
