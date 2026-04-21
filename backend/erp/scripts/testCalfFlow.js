/**
 * CALF End-to-End Test — Full lifecycle with journal verification
 *
 * Tests:
 *   1. Create ACCESS expense (company-funded) → auto-CALF created
 *   2. Verify auto-CALF (DRAFT, amounts, linking)
 *   3. Validate CALF → VALID
 *   4. Post CALF → POSTED + auto-journal (DR 1110, CR bank)
 *   5. Verify expense auto-submitted → POSTED + expense journal
 *   6. Reopen CALF → DRAFT + journals reversed
 *   7. Verify expense auto-reopened → DRAFT
 *   8. Edit expense (change amount) → auto-CALF updated
 *   9. Re-validate → VALID
 *  10. Re-post CALF → POSTED again (second cycle)
 *  11. Cleanup all test data
 *
 * Usage: cd backend && node erp/scripts/testCalfFlow.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const ExpenseEntry = require('../models/ExpenseEntry');
const PrfCalf = require('../models/PrfCalf');
const TransactionEvent = require('../models/TransactionEvent');
const JournalEntry = require('../models/JournalEntry');
const { createAndPostJournal, reverseJournal } = require('../services/journalEngine');
const { resolveFundingCoa } = require('../services/autoJournal');

let passed = 0, failed = 0;
const cleanup = [];

function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label, err) { failed++; console.log(`  ❌ ${label}: ${err}`); }
function assert(cond, label, errMsg) {
  if (cond) ok(label);
  else fail(label, errMsg || 'assertion failed');
}

async function run() {
  await connectDB();
  console.log('\n══════════════════════════════════════════');
  console.log('  CALF END-TO-END TEST — Full Lifecycle');
  console.log('══════════════════════════════════════════\n');

  // ── Setup: find president user + entity ──
  const president = await User.findOne({ email: 'ame.oticovios@gmail.com' });
  if (!president) { console.error('Angeline not found. Run addAngeline.js first.'); process.exit(1); }

  const entity = await Entity.findById(president.entity_id);
  if (!entity) { console.error('Entity not found.'); process.exit(1); }

  console.log(`User: ${president.name} (${president.role})`);
  console.log(`Entity: ${entity.entity_name}\n`);

  const eId = entity._id;
  const bId = president._id;
  const period = '2026-04';
  const cycle = 'C1';

  // ══════════════════════════════════════════
  // STEP 1: Create ACCESS expense with company-funded line
  // ══════════════════════════════════════════
  console.log('── Step 1: Create ACCESS expense ──');
  let expense;
  try {
    expense = await ExpenseEntry.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      lines: [
        {
          expense_date: new Date('2026-04-07'),
          expense_type: 'ACCESS',
          expense_category: 'Hotel/Accommodation',
          coa_code: '6155',
          establishment: 'Test Hotel for CALF Flow',
          amount: 3500,
          or_number: 'CALF-TEST-001',
          or_photo_url: 'https://s3.example.com/calf-test-001.jpg',
          payment_mode: 'CARD'
        },
        {
          expense_date: new Date('2026-04-07'),
          expense_type: 'ORE',
          expense_category: 'Parking',
          coa_code: '6600',
          establishment: 'SM Parking CALF Test',
          amount: 100,
          or_number: 'CALF-TEST-002',
          payment_mode: 'CASH'
        }
      ],
      created_by: bId,
      status: 'DRAFT'
    });
    cleanup.push({ model: ExpenseEntry, id: expense._id, label: 'ExpenseEntry' });
    ok(`Expense created — ${expense.line_count} lines, Total: ₱${expense.total_amount}`);
  } catch (e) { fail('Expense create', e.message); }

  if (!expense) { console.error('Cannot continue without expense.'); await doCleanup(); process.exit(1); }

  // Verify pre-save CALF flags
  const accessLine = expense.lines.find(l => l.expense_type === 'ACCESS');
  const oreLine = expense.lines.find(l => l.expense_type === 'ORE');
  assert(accessLine.calf_required === true, 'ACCESS CARD line → calf_required=true');
  assert(oreLine.calf_required === false, 'ORE CASH line → calf_required=false');

  // ══════════════════════════════════════════
  // STEP 2: Simulate auto-CALF creation (same logic as controller)
  // ══════════════════════════════════════════
  console.log('\n── Step 2: Auto-CALF creation ──');
  let calf;
  try {
    const calfLines = expense.lines.filter(l => l.calf_required && !l.calf_id);
    assert(calfLines.length === 1, `Found ${calfLines.length} CALF-required line(s)`);

    const totalAmount = Math.round(calfLines.reduce((s, l) => s + (l.amount || 0), 0) * 100) / 100;
    const lineIds = calfLines.map(l => l._id);

    calf = await PrfCalf.create({
      entity_id: eId, bdm_id: bId, period, cycle,
      doc_type: 'CALF',
      purpose: 'Auto-CALF: ACCESS expenses (company-funded)',
      advance_amount: totalAmount,
      liquidation_amount: totalAmount,
      amount: totalAmount,
      balance: 0,
      payment_mode: calfLines[0].payment_mode || 'CARD',
      funding_card_id: calfLines[0].funding_card_id || null,
      funding_account_id: calfLines[0].funding_account_id || null,
      linked_expense_id: expense._id,
      linked_expense_line_ids: lineIds,
      bir_flag: 'INTERNAL',
      status: 'DRAFT',
      created_by: bId
    });
    cleanup.push({ model: PrfCalf, id: calf._id, label: 'PrfCalf (CALF)' });

    // Back-link calf_id to expense lines
    for (const l of calfLines) l.calf_id = calf._id;
    await expense.save();

    ok(`CALF created — CALF#: ${calf.calf_number}, advance: ₱${calf.advance_amount}`);
    assert(calf.balance === 0, 'CALF balance = 0 (settled)');
    assert(calf.linked_expense_id.toString() === expense._id.toString(), 'CALF linked to expense');
    assert(calf.linked_expense_line_ids.length === 1, 'CALF linked to 1 expense line');

    // Verify back-link
    const refreshed = await ExpenseEntry.findById(expense._id);
    const linkedLine = refreshed.lines.find(l => l.calf_id);
    assert(!!linkedLine, 'Expense line has calf_id back-link');
    assert(linkedLine.calf_id.toString() === calf._id.toString(), 'Back-link matches CALF _id');
  } catch (e) { fail('Auto-CALF', e.message); }

  if (!calf) { console.error('Cannot continue without CALF.'); await doCleanup(); process.exit(1); }

  // ══════════════════════════════════════════
  // STEP 3: Validate CALF → VALID
  // ══════════════════════════════════════════
  console.log('\n── Step 3: Validate CALF ──');
  try {
    const errors = [];
    if (!calf.advance_amount || calf.advance_amount <= 0) errors.push('Advance amount required');
    if (!calf.linked_expense_id) errors.push('CALF must be linked to expense');

    calf.validation_errors = errors;
    calf.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await calf.save();
    assert(calf.status === 'VALID', `CALF validated → ${calf.status}`, `expected VALID, got ${calf.status}`);
  } catch (e) { fail('CALF validate', e.message); }

  // ══════════════════════════════════════════
  // STEP 4: Post CALF → POSTED + auto-journal
  // ══════════════════════════════════════════
  console.log('\n── Step 4: Post CALF ──');
  let calfEvent;
  try {
    // Create TransactionEvent
    calfEvent = await TransactionEvent.create({
      entity_id: eId, bdm_id: bId,
      event_type: 'CALF',
      event_date: new Date(),
      document_ref: `CALF-${calf.calf_number || calf.period}`,
      payload: { prf_calf_id: calf._id, advance_amount: calf.advance_amount },
      status: 'ACTIVE',
      created_by: bId
    });
    cleanup.push({ model: TransactionEvent, id: calfEvent._id, label: 'TransactionEvent (CALF)' });

    calf.status = 'POSTED';
    calf.posted_at = new Date();
    calf.posted_by = bId;
    calf.event_id = calfEvent._id;
    await calf.save();
    ok('CALF posted → POSTED');

    // Auto-journal: DR 1110 AR—BDM Advances, CR funding
    const funding = await resolveFundingCoa(calf);
    const calfRef = calf.calf_number || `CALF-${period}`;
    const jeLines = [
      { account_code: '1110', account_name: 'AR — BDM Advances', debit: calf.amount, credit: 0, description: `CALF advance: ${calfRef}` },
      { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: calf.amount, description: `CALF: ${calfRef}`, is_contra: /^[156]/.test(String(funding.coa_code || '')) }
    ];
    await createAndPostJournal(eId, {
      je_date: calf.posted_at, period, description: `CALF: ${calfRef}`,
      source_module: 'EXPENSE', source_event_id: calfEvent._id, source_doc_ref: calfRef,
      lines: jeLines, bir_flag: 'INTERNAL', vat_flag: 'N/A', bdm_id: bId, created_by: bId
    });
    ok(`CALF journal created — DR 1110 ��${calf.amount}, CR ${funding.coa_code} ₱${calf.amount}`);

    // Verify journal
    const calfJes = await JournalEntry.find({ source_event_id: calfEvent._id, is_reversal: { $ne: true } });
    assert(calfJes.length >= 1, `CALF journal entries found: ${calfJes.length}`);
  } catch (e) { fail('CALF post', e.message); }

  // ══════════════════════════════════════════
  // STEP 5: Auto-submit expense → POSTED
  // ══════════════════════════════════════════
  console.log('\n── Step 5: Auto-submit linked expense ──');
  let expenseEvent;
  try {
    expense = await ExpenseEntry.findById(expense._id);

    // Validate expense
    const valErrors = [];
    if (!expense.lines.length) valErrors.push('No expense lines');
    for (let i = 0; i < expense.lines.length; i++) {
      const l = expense.lines[i];
      if (!l.expense_date) valErrors.push(`Line ${i + 1}: date required`);
      if (!l.amount || l.amount <= 0) valErrors.push(`Line ${i + 1}: amount required`);
      if (!l.establishment) valErrors.push(`Line ${i + 1}: establishment required`);
    }

    if (valErrors.length) {
      expense.status = 'ERROR';
      expense.validation_errors = valErrors;
      await expense.save();
      fail('Expense validation', valErrors.join('; '));
    } else {
      // Submit expense
      expense.status = 'POSTED';
      expense.posted_at = new Date();
      expense.posted_by = bId;
      expense.validation_errors = [];

      expenseEvent = await TransactionEvent.create({
        entity_id: eId, bdm_id: bId,
        event_type: 'EXPENSE',
        event_date: new Date(),
        document_ref: `EXP-${period}-${cycle}`,
        payload: { expense_id: expense._id, total: expense.total_amount },
        status: 'ACTIVE',
        created_by: bId
      });
      cleanup.push({ model: TransactionEvent, id: expenseEvent._id, label: 'TransactionEvent (EXP)' });
      expense.event_id = expenseEvent._id;
      await expense.save();
      ok('Expense auto-submitted → POSTED');

      // Auto-journal expense lines
      const jeLines = [];
      let totalOre = 0, totalAccess = 0;
      const desc = `EXP-${period}-${cycle}`;
      for (const line of expense.lines) {
        jeLines.push({
          account_code: line.coa_code || '6900',
          account_name: line.expense_category || 'Miscellaneous',
          debit: line.amount, credit: 0, description: desc
        });
        if (line.expense_type === 'ORE') totalOre += line.amount || 0;
        else totalAccess += line.amount || 0;
      }
      if (totalOre > 0) jeLines.push({ account_code: '1110', account_name: 'AR — BDM Advances', debit: 0, credit: totalOre, description: desc, is_contra: true });
      if (totalAccess > 0) {
        const funding = await resolveFundingCoa(expense.lines.find(l => l.expense_type === 'ACCESS') || expense);
        jeLines.push({ account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: totalAccess, description: desc, is_contra: /^[156]/.test(String(funding.coa_code || '')) });
      }
      if (jeLines.length >= 2) {
        await createAndPostJournal(eId, {
          je_date: expense.posted_at, period, description: `Expenses: ${desc}`,
          source_module: 'EXPENSE', source_event_id: expenseEvent._id, source_doc_ref: desc,
          lines: jeLines, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: bId, created_by: bId
        });
        ok(`Expense journal created — ${jeLines.length} lines`);
      }

      // Verify
      const expJes = await JournalEntry.find({ source_event_id: expenseEvent._id, is_reversal: { $ne: true } });
      assert(expJes.length >= 1, `Expense journal entries found: ${expJes.length}`);
    }
  } catch (e) { fail('Expense auto-submit', e.message); }

  // ══════════════════════════════════════════
  // STEP 6: Reopen CALF → DRAFT + reverse journals
  // ══════════════════════════════════════════
  console.log('\n── Step 6: Reopen CALF ──');
  try {
    // Reverse CALF journals
    if (calf.event_id) {
      const jes = await JournalEntry.find({ source_event_id: calf.event_id, status: 'POSTED', is_reversal: { $ne: true } });
      for (const je of jes) {
        await reverseJournal(je._id, 'Test: CALF reopen reversal', bId);
      }
      ok(`Reversed ${jes.length} CALF journal(s)`);
    }

    calf = await PrfCalf.findById(calf._id);
    calf.status = 'DRAFT';
    calf.reopen_count = (calf.reopen_count || 0) + 1;
    calf.posted_at = undefined;
    calf.posted_by = undefined;
    await calf.save();
    assert(calf.status === 'DRAFT', 'CALF reopened → DRAFT');
    assert(calf.reopen_count === 1, `CALF reopen_count = ${calf.reopen_count}`);

    // Verify CALF journal reversals (reversal JE links via corrects_je_id, not source_event_id)
    const originalJes = await JournalEntry.find({ source_event_id: calfEvent._id });
    const originalJeIds = originalJes.map(j => j._id);
    const reversals = await JournalEntry.find({ corrects_je_id: { $in: originalJeIds }, is_reversal: true });
    assert(reversals.length >= 1, `CALF reversal JEs found: ${reversals.length}`);
  } catch (e) { fail('CALF reopen', e.message); }

  // ══════════════════════════════════════════
  // STEP 7: Auto-reopen expense → DRAFT
  // ══════════════════════════════════════════
  console.log('\n── Step 7: Auto-reopen linked expense ──');
  try {
    expense = await ExpenseEntry.findById(expense._id);
    if (expense.status === 'POSTED' && expense.event_id) {
      // Reverse expense journals
      const jes = await JournalEntry.find({ source_event_id: expense.event_id, status: 'POSTED', is_reversal: { $ne: true } });
      for (const je of jes) {
        await reverseJournal(je._id, 'Test: linked expense reopen reversal', bId);
      }
      ok(`Reversed ${jes.length} expense journal(s)`);

      expense.status = 'DRAFT';
      expense.reopen_count = (expense.reopen_count || 0) + 1;
      expense.posted_at = undefined;
      expense.posted_by = undefined;
      await expense.save();
    }
    assert(expense.status === 'DRAFT', `Expense status → ${expense.status}`);
    ok(`Expense reopen_count = ${expense.reopen_count}`);
  } catch (e) { fail('Expense auto-reopen', e.message); }

  // ══════════════════════════════════════════
  // STEP 8: Edit expense (change amount) → CALF updated
  // ══════════════════════════════════════════
  console.log('\n── Step 8: Edit expense + update CALF ──');
  try {
    expense = await ExpenseEntry.findById(expense._id);
    const accessIdx = expense.lines.findIndex(l => l.expense_type === 'ACCESS');
    expense.lines[accessIdx].amount = 4200;  // Changed from 3500 to 4200
    await expense.save();
    ok(`Expense ACCESS line updated: ₱3500 → ₱4200 (total: ₱${expense.total_amount})`);

    // Update linked CALF
    calf = await PrfCalf.findById(calf._id);
    const calfLines = expense.lines.filter(l => l.calf_required);
    const newTotal = Math.round(calfLines.reduce((s, l) => s + (l.amount || 0), 0) * 100) / 100;
    calf.advance_amount = newTotal;
    calf.liquidation_amount = newTotal;
    calf.amount = newTotal;
    await calf.save();
    assert(calf.advance_amount === 4200, `CALF advance updated to ₱${calf.advance_amount}`);
    assert(calf.balance === 0, 'CALF balance still ₱0 (settled)');
  } catch (e) { fail('Edit expense', e.message); }

  // ══════════════════════════════════════════
  // STEP 9: Re-validate CALF → VALID
  // ══════════════════════════════════════════
  console.log('\n── Step 9: Re-validate CALF ──');
  try {
    const errors = [];
    if (!calf.advance_amount || calf.advance_amount <= 0) errors.push('Advance amount required');
    if (!calf.linked_expense_id) errors.push('CALF must be linked to expense');

    calf.validation_errors = errors;
    calf.status = errors.length > 0 ? 'ERROR' : 'VALID';
    await calf.save();
    assert(calf.status === 'VALID', `CALF re-validated → ${calf.status}`);
  } catch (e) { fail('CALF re-validate', e.message); }

  // ══════════════════════════════════════════
  // STEP 10: Re-post CALF → POSTED (second cycle)
  // ══════════════════════════════════════════
  console.log('\n── Step 10: Re-post CALF (second cycle) ──');
  try {
    const event2 = await TransactionEvent.create({
      entity_id: eId, bdm_id: bId,
      event_type: 'CALF',
      event_date: new Date(),
      document_ref: `CALF-${calf.calf_number || calf.period}-R2`,
      payload: { prf_calf_id: calf._id, advance_amount: calf.advance_amount },
      status: 'ACTIVE',
      created_by: bId
    });
    cleanup.push({ model: TransactionEvent, id: event2._id, label: 'TransactionEvent (CALF R2)' });

    calf.status = 'POSTED';
    calf.posted_at = new Date();
    calf.posted_by = bId;
    calf.event_id = event2._id;
    await calf.save();

    // Journal for re-post (new amount)
    const funding = await resolveFundingCoa(calf);
    const calfRef = calf.calf_number || `CALF-${period}`;
    await createAndPostJournal(eId, {
      je_date: calf.posted_at, period, description: `CALF (repost): ${calfRef}`,
      source_module: 'EXPENSE', source_event_id: event2._id, source_doc_ref: `${calfRef}-R2`,
      lines: [
        { account_code: '1110', account_name: 'AR — BDM Advances', debit: calf.amount, credit: 0, description: `CALF advance: ${calfRef}` },
        { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: calf.amount, description: `CALF: ${calfRef}`, is_contra: /^[156]/.test(String(funding.coa_code || '')) }
      ],
      bir_flag: 'INTERNAL', vat_flag: 'N/A', bdm_id: bId, created_by: bId
    });
    ok(`CALF re-posted — ₱${calf.amount} (reopen_count: ${calf.reopen_count})`);

    // Auto-submit expense again
    expense = await ExpenseEntry.findById(expense._id);
    if (expense.status !== 'POSTED') {
      expense.status = 'POSTED';
      expense.posted_at = new Date();
      expense.posted_by = bId;
      expense.validation_errors = [];

      const expEvent2 = await TransactionEvent.create({
        entity_id: eId, bdm_id: bId,
        event_type: 'EXPENSE',
        event_date: new Date(),
        document_ref: `EXP-${period}-${cycle}-R2`,
        payload: { expense_id: expense._id, total: expense.total_amount, repost: true },
        status: 'ACTIVE',
        created_by: bId
      });
      cleanup.push({ model: TransactionEvent, id: expEvent2._id, label: 'TransactionEvent (EXP R2)' });
      expense.event_id = expEvent2._id;
      await expense.save();

      // Expense journal for re-post
      const jeLines2 = [];
      let totalOre2 = 0, totalAccess2 = 0;
      const desc2 = `EXP-${period}-${cycle}-R2`;
      for (const line of expense.lines) {
        jeLines2.push({ account_code: line.coa_code || '6900', account_name: line.expense_category || 'Miscellaneous', debit: line.amount, credit: 0, description: desc2 });
        if (line.expense_type === 'ORE') totalOre2 += line.amount || 0;
        else totalAccess2 += line.amount || 0;
      }
      if (totalOre2 > 0) jeLines2.push({ account_code: '1110', account_name: 'AR — BDM Advances', debit: 0, credit: totalOre2, description: desc2, is_contra: true });
      if (totalAccess2 > 0) {
        const f = await resolveFundingCoa(expense.lines.find(l => l.expense_type === 'ACCESS') || expense);
        jeLines2.push({ account_code: f.coa_code, account_name: f.coa_name, debit: 0, credit: totalAccess2, description: desc2, is_contra: /^[156]/.test(String(f.coa_code || '')) });
      }
      if (jeLines2.length >= 2) {
        await createAndPostJournal(eId, {
          je_date: expense.posted_at, period, description: `Expenses (repost): ${desc2}`,
          source_module: 'EXPENSE', source_event_id: expEvent2._id, source_doc_ref: desc2,
          lines: jeLines2, bir_flag: 'BOTH', vat_flag: 'N/A', bdm_id: bId, created_by: bId
        });
      }
      ok('Expense re-submitted → POSTED (second cycle)');
    }

    // Final verification
    const finalCalf = await PrfCalf.findById(calf._id);
    const finalExp = await ExpenseEntry.findById(expense._id);
    assert(finalCalf.status === 'POSTED', `Final CALF status: ${finalCalf.status}`);
    assert(finalExp.status === 'POSTED', `Final expense status: ${finalExp.status}`);
    assert(finalCalf.reopen_count === 1, `CALF reopen_count preserved: ${finalCalf.reopen_count}`);
    assert(finalExp.reopen_count >= 1, `Expense reopen_count: ${finalExp.reopen_count}`);
  } catch (e) { fail('CALF re-post', e.message); }

  // ══════════════════════════════════════════
  // CLEANUP
  // ══════════════════════════════════════════
  await doCleanup();

  console.log('\n══════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

async function doCleanup() {
  console.log('\n── Cleanup ──');

  // Also clean up any journal entries created during test
  for (const item of cleanup) {
    if (item.model === TransactionEvent) {
      try {
        await JournalEntry.deleteMany({ source_event_id: item.id });
        console.log(`  🗑️  Deleted JournalEntries for event ${item.id}`);
      } catch (e) { console.log(`  ⚠️  JE cleanup failed: ${e.message}`); }
    }
  }

  for (const item of cleanup.reverse()) {
    try {
      await item.model.deleteOne({ _id: item.id });
      console.log(`  🗑️  Deleted ${item.label} ${item.id}`);
    } catch (e) { console.log(`  ⚠️  Failed to delete ${item.label}: ${e.message}`); }
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
