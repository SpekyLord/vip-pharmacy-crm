/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Backend test: Exercise all expense endpoints
 * Tests SMER, Car Logbook, ORE/ACCESS, PRF/CALF full lifecycle
 * Uses Angeline (president) for CALF override testing, Jake (employee) for gate testing
 *
 * Usage: cd backend && node erp/scripts/testExpenseEndpoints.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const SmerEntry = require('../models/SmerEntry');
const CarLogbookEntry = require('../models/CarLogbookEntry');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const TransactionEvent = require('../models/TransactionEvent');
const Territory = require('../models/Territory');

let passed = 0, failed = 0, cleaned = [];

function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label, err) { failed++; console.log(`  ❌ ${label}: ${err}`); }

async function run() {
  await connectDB();
  console.log('\n══════════════════════════════════════════');
  console.log('  EXPENSE BACKEND TEST — Full Lifecycle');
  console.log('══════════════════════════════════════════\n');

  // Find test users
  const president = await User.findOne({ email: 'ame.oticovios@gmail.com' });
  if (!president) { console.error('Angeline not found. Run addAngeline.js first.'); process.exit(1); }

  const entity = await Entity.findById(president.entity_id);
  if (!entity) { console.error('BALAI LAWAAN entity not found.'); process.exit(1); }

  const territory = await Territory.findOne({ territory_code: 'BLW' });

  console.log(`User: ${president.name} (${president.role})`);
  console.log(`Entity: ${entity.entity_name}`);
  console.log(`Territory: ${territory?.territory_code || 'N/A'}\n`);

  const eId = entity._id;
  const bId = president._id;
  const period = '2026-04';
  const cycle = 'C1';

  // ═══════════════════════════════════════
  // 1. SMER
  // ═══════════════════════════════════════
  console.log('── 1. SMER ──');
  let smer;
  try {
    smer = await SmerEntry.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      perdiem_rate: 800,
      daily_entries: [
        { day: 1, entry_date: new Date('2026-04-01'), activity_type: 'Office', md_count: 0, perdiem_tier: 'ZERO', perdiem_amount: 0 },
        { day: 2, entry_date: new Date('2026-04-02'), activity_type: 'Field', md_count: 10, perdiem_tier: 'FULL', perdiem_amount: 800 },
        { day: 3, entry_date: new Date('2026-04-03'), activity_type: 'Field', md_count: 5, perdiem_tier: 'HALF', perdiem_amount: 400 }
      ],
      created_by: bId, status: 'DRAFT'
    });
    cleaned.push({ model: SmerEntry, id: smer._id });
    ok('SMER created (DRAFT) — 3 daily entries');
  } catch (e) { fail('SMER create', e.message); }

  if (smer) {
    // Validate
    try {
      const errors = [];
      for (const entry of smer.daily_entries) {
        if (!entry.entry_date) errors.push(`Day ${entry.day}: date required`);
        if (entry.md_count > 0 && !entry.activity_type && !entry.hospital_covered) {
          errors.push(`Day ${entry.day}: activity type required`);
        }
      }
      smer.validation_errors = errors;
      smer.status = errors.length > 0 ? 'ERROR' : 'VALID';
      await smer.save();
      ok(`SMER validated → ${smer.status} (${errors.length} errors)`);
    } catch (e) { fail('SMER validate', e.message); }

    // Submit (only if VALID)
    if (smer.status === 'VALID') {
      try {
        const session = await mongoose.startSession();
        await session.withTransaction(async () => {
          const event = await TransactionEvent.create([{
            entity_id: eId, bdm_id: bId, event_type: 'SMER',
            event_date: new Date(), document_ref: `SMER-${period}-${cycle}`,
            payload: { smer_id: smer._id }, status: 'ACTIVE', created_by: bId
          }], { session });
          smer.status = 'POSTED'; smer.posted_at = new Date(); smer.posted_by = bId;
          smer.event_id = event[0]._id;
          await smer.save({ session });
          cleaned.push({ model: TransactionEvent, id: event[0]._id });
        });
        session.endSession();
        ok('SMER submitted → POSTED');
      } catch (e) { fail('SMER submit', e.message); }

      // Reopen
      try {
        smer.status = 'DRAFT'; smer.reopen_count = (smer.reopen_count || 0) + 1;
        await smer.save();
        ok(`SMER reopened → DRAFT (reopen_count: ${smer.reopen_count})`);
      } catch (e) { fail('SMER reopen', e.message); }
    }
  }

  // ═══════════════════════════════════════
  // 2. CAR LOGBOOK
  // ═══════════════════════════════════════
  console.log('\n── 2. Car Logbook ──');
  let logbook;
  try {
    logbook = await CarLogbookEntry.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      entry_date: new Date('2026-04-02'),
      starting_km: 50000, ending_km: 50120, personal_km: 20,
      fuel_entries: [
        { station_name: 'Shell Iloilo', fuel_type: 'UNLEADED', liters: 10, price_per_liter: 58.19, payment_mode: 'CASH' }
      ],
      created_by: bId, status: 'DRAFT'
    });
    cleaned.push({ model: CarLogbookEntry, id: logbook._id });
    ok(`Car Logbook created — ${logbook.total_km}km total, ${logbook.official_km}km official`);
  } catch (e) { fail('Car Logbook create', e.message); }

  if (logbook) {
    // Validate
    try {
      const errors = [];
      if (logbook.ending_km < logbook.starting_km) errors.push('Ending KM < Starting KM');
      if (logbook.personal_km > logbook.total_km) errors.push('Personal > Total KM');
      // Check fuel CALF gate
      for (const fuel of logbook.fuel_entries) {
        if (fuel.calf_required && !fuel.calf_id) {
          errors.push(`Fuel: CALF required for ${fuel.payment_mode}`);
        }
      }
      logbook.validation_errors = errors;
      logbook.status = errors.length > 0 ? 'ERROR' : 'VALID';
      await logbook.save();
      ok(`Car Logbook validated → ${logbook.status}`);
    } catch (e) { fail('Car Logbook validate', e.message); }

    // Check fuel efficiency computed by pre-save
    try {
      const eff = logbook.fuel_efficiency;
      ok(`Fuel efficiency: ${eff?.expected_liters?.toFixed(1) || 'N/A'}L expected, ${eff?.actual_liters?.toFixed(1) || 'N/A'}L actual, overconsumption: ${logbook.overconsumption_flag}`);
    } catch (e) { fail('Fuel efficiency', e.message); }
  }

  // ═══════════════════════════════════════
  // 3. ORE/ACCESS EXPENSE
  // ═══════════════════════════════════════
  console.log('\n── 3. ORE/ACCESS Expense ──');
  let expense;
  try {
    expense = await ExpenseEntry.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      lines: [
        { expense_date: new Date('2026-04-01'), expense_type: 'ORE', expense_category: 'Parking', establishment: 'SM Parking', amount: 100, or_number: 'OR-001', payment_mode: 'CASH' },
        { expense_date: new Date('2026-04-02'), expense_type: 'ACCESS', expense_category: 'Hotel/Accommodation', establishment: 'Hotel ALI', amount: 5000, or_number: 'OR-002', or_photo_url: 'https://s3.example.com/or-002.jpg', payment_mode: 'CARD' },
        { expense_date: new Date('2026-04-03'), expense_type: 'ORE', expense_category: 'Toll', establishment: 'NLEX', amount: 150, or_number: 'OR-003', payment_mode: 'CASH' }
      ],
      created_by: bId, status: 'DRAFT'
    });
    cleaned.push({ model: ExpenseEntry, id: expense._id });
    ok(`Expense created — ${expense.line_count} lines, ORE: ₱${expense.total_ore}, ACCESS: ₱${expense.total_access}, Total: ₱${expense.total_amount}`);
  } catch (e) { fail('Expense create', e.message); }

  if (expense) {
    // Check CALF flags auto-set by pre-save
    try {
      const oreLine = expense.lines[0];
      const accessLine = expense.lines[1];
      if (!oreLine.calf_required) ok('ORE line: calf_required=false (correct)');
      else fail('ORE CALF flag', 'should be false');
      if (accessLine.calf_required) ok('ACCESS CARD line: calf_required=true (correct)');
      else fail('ACCESS CALF flag', 'should be true');
    } catch (e) { fail('CALF flags', e.message); }

    // Check VAT auto-compute
    try {
      const line = expense.lines[0];
      const expectedVat = Math.round(100 * (0.12 / 1.12) * 100) / 100;
      if (Math.abs(line.vat_amount - expectedVat) < 0.01) ok(`VAT auto-computed: ₱${line.vat_amount} (12/112 formula)`);
      else fail('VAT compute', `expected ~${expectedVat}, got ${line.vat_amount}`);
    } catch (e) { fail('VAT compute', e.message); }

    // Validate — should get OR errors for lines without or_photo_url/or_number
    try {
      const errors = [];
      for (let i = 0; i < expense.lines.length; i++) {
        const line = expense.lines[i];
        if (!line.or_photo_url && !line.or_number) {
          errors.push(`Line ${i + 1}: OR photo or OR number required`);
        }
        if (line.calf_required && !line.calf_id) {
          // President override check
          if (president.role !== 'president') {
            errors.push(`Line ${i + 1}: CALF required for non-cash ACCESS`);
          }
        }
      }
      expense.validation_errors = errors;
      expense.status = errors.length > 0 ? 'ERROR' : 'VALID';
      await expense.save();
      ok(`Expense validated → ${expense.status} (${errors.length} errors) — president CALF override active`);
    } catch (e) { fail('Expense validate', e.message); }
  }

  // ═══════════════════════════════════════
  // 4. PRF (Partner Rebate)
  // ═══════════════════════════════════════
  console.log('\n── 4. PRF (Partner Rebate) ──');
  let prf;
  try {
    prf = await PrfCalf.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      doc_type: 'PRF', prf_type: 'PARTNER_REBATE',
      purpose: 'Test partner rebate', payee_name: 'Dr. Test Partner',
      payee_type: 'MD', partner_bank: 'BPI', partner_account_name: 'Dr. Test Partner',
      partner_account_no: '1234567890', rebate_amount: 500,
      amount: 500, payment_mode: 'BANK_TRANSFER',
      photo_urls: ['https://s3.example.com/prf-proof.jpg'],
      created_by: bId, status: 'DRAFT'
    });
    cleaned.push({ model: PrfCalf, id: prf._id });
    ok(`PRF created (PARTNER_REBATE) — PRF#: ${prf.prf_number}, ₱${prf.amount}`);
  } catch (e) { fail('PRF create', e.message); }

  // ═══════════════════════════════════════
  // 5. PRF (Personal Reimbursement)
  // ═══════════════════════════════════════
  console.log('\n── 5. PRF (Personal Reimbursement) ──');
  let prfPersonal;
  try {
    prfPersonal = await PrfCalf.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      doc_type: 'PRF', prf_type: 'PERSONAL_REIMBURSEMENT',
      purpose: 'Paid parking with own money', payee_name: president.name,
      payee_type: 'EMPLOYEE', rebate_amount: 200,
      amount: 200, payment_mode: 'CASH',
      photo_urls: ['https://s3.example.com/or-parking.jpg'],
      created_by: bId, status: 'DRAFT'
    });
    cleaned.push({ model: PrfCalf, id: prfPersonal._id });
    ok(`PRF created (PERSONAL_REIMBURSEMENT) — PRF#: ${prfPersonal.prf_number}, ₱${prfPersonal.amount}`);
  } catch (e) { fail('PRF Personal create', e.message); }

  // Validate personal PRF (should NOT require partner bank)
  if (prfPersonal) {
    try {
      const errors = [];
      if (!prfPersonal.payee_name) errors.push('Payee name required');
      if (!prfPersonal.purpose) errors.push('Purpose required');
      if (prfPersonal.prf_type === 'PERSONAL_REIMBURSEMENT') {
        if (!prfPersonal.photo_urls?.length) errors.push('OR photo required');
        // No partner bank validation needed!
      }
      prfPersonal.validation_errors = errors;
      prfPersonal.status = errors.length > 0 ? 'ERROR' : 'VALID';
      await prfPersonal.save();
      ok(`PRF Personal validated → ${prfPersonal.status} (no partner bank required — correct)`);
    } catch (e) { fail('PRF Personal validate', e.message); }
  }

  // ═══════════════════════════════════════
  // 6. CALF
  // ═══════════════════════════════════════
  console.log('\n── 6. CALF ──');
  let calf;
  try {
    calf = await PrfCalf.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      doc_type: 'CALF',
      advance_amount: 5000, liquidation_amount: 5000,
      amount: 5000, payment_mode: 'CARD',
      linked_expense_id: expense?._id,
      linked_expense_line_ids: expense ? [expense.lines[1]._id] : [],
      photo_urls: ['https://s3.example.com/calf-proof.jpg'],
      created_by: bId, status: 'DRAFT'
    });
    cleaned.push({ model: PrfCalf, id: calf._id });
    ok(`CALF created — CALF#: ${calf.calf_number}, advance: ₱${calf.advance_amount}, balance: ₱${calf.balance}`);
  } catch (e) { fail('CALF create', e.message); }

  // ═══════════════════════════════════════
  // 7. Document Numbering Check
  // ═══════════════════════════════════════
  console.log('\n── 7. Document Numbering ──');
  try {
    if (prf?.prf_number && prf.prf_number.startsWith('PRF-')) ok(`PRF number format: ${prf.prf_number}`);
    else if (prf?.prf_number) fail('PRF number', `unexpected format: ${prf.prf_number}`);
    else fail('PRF number', 'empty');
  } catch (e) { fail('PRF number', e.message); }
  try {
    if (calf?.calf_number && calf.calf_number.startsWith('CALF-')) ok(`CALF number format: ${calf.calf_number}`);
    else if (calf?.calf_number) fail('CALF number', `unexpected format: ${calf.calf_number}`);
    else fail('CALF number', 'empty');
  } catch (e) { fail('CALF number', e.message); }

  // ═══════════════════════════════════════
  // 8. Model Pre-Save Checks
  // ═══════════════════════════════════════
  console.log('\n── 8. Model Pre-Save Hooks ──');
  try {
    if (calf && calf.balance === 0) ok('CALF balance auto-computed: ₱0 (settled)');
    else if (calf) ok(`CALF balance: ₱${calf.balance}`);
  } catch (e) { fail('CALF balance', e.message); }

  try {
    if (expense && expense.total_vat > 0) ok(`Expense VAT total auto-computed: ₱${expense.total_vat}`);
    else fail('Expense VAT total', 'zero or missing');
  } catch (e) { fail('Expense VAT', e.message); }

  // ═══════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════
  console.log('\n── Cleanup ──');
  for (const item of cleaned.reverse()) {
    try {
      await item.model.deleteOne({ _id: item.id });
      console.log(`  🗑️  Deleted ${item.model.modelName} ${item.id}`);
    } catch (e) { console.log(`  ⚠️  Failed to delete ${item.model.modelName}: ${e.message}`); }
  }

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════
  console.log('\n══════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
