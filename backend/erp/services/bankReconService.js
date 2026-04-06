/**
 * Bank Reconciliation Service
 * Auto-match bank statement entries to journal entries, manual match, and finalize.
 */
const mongoose = require('mongoose');
const BankStatement = require('../models/BankStatement');
const BankAccount = require('../models/BankAccount');
const JournalEntry = require('../models/JournalEntry');
const { createAndPostJournal } = require('./journalEngine');

/**
 * Import a bank statement — parse entries array and persist.
 */
async function importStatement(entityId, bankAccountId, statementDate, period, entries, closingBalance, uploadedBy) {
  const numbered = entries.map((e, i) => ({
    line_no: i + 1,
    txn_date: e.txn_date ? new Date(e.txn_date) : null,
    description: e.description || '',
    reference: e.reference || '',
    debit: Number(e.debit) || 0,
    credit: Number(e.credit) || 0,
    balance: e.balance != null ? Number(e.balance) : undefined,
    match_status: 'UNMATCHED',
    je_id: null
  }));

  const statement = await BankStatement.findOneAndUpdate(
    { entity_id: entityId, bank_account_id: bankAccountId, period },
    {
      $set: {
        statement_date: new Date(statementDate),
        entries: numbered,
        closing_balance: Number(closingBalance) || 0,
        status: 'DRAFT',
        uploaded_at: new Date(),
        uploaded_by: uploadedBy
      }
    },
    { upsert: true, new: true }
  );

  return statement;
}

/**
 * Auto-match bank statement entries to posted journal entries.
 * Matching criteria: same coa_code on the bank account, amount match, date ±2 days, reference substring.
 */
async function autoMatch(statementId) {
  const statement = await BankStatement.findById(statementId);
  if (!statement) throw new Error('Statement not found');
  if (statement.status === 'FINALIZED') throw new Error('Statement already finalized');

  const bankAccount = await BankAccount.findById(statement.bank_account_id).lean();
  if (!bankAccount || !bankAccount.coa_code) throw new Error('Bank account or COA code not found');

  // Fetch posted JEs in the period with lines matching this bank's COA
  const jes = await JournalEntry.find({
    entity_id: statement.entity_id,
    period: statement.period,
    status: 'POSTED',
    'lines.account_code': bankAccount.coa_code
  }).lean();

  // Build candidate list from JE lines that hit this bank account
  const candidates = [];
  for (const je of jes) {
    for (const line of je.lines) {
      if (line.account_code !== bankAccount.coa_code) continue;
      candidates.push({
        je_id: je._id,
        je_date: new Date(je.je_date),
        amount_debit: line.debit || 0,
        amount_credit: line.credit || 0,
        description: (line.description || je.source_doc_ref || '').toLowerCase(),
        matched: false
      });
    }
  }

  let matchCount = 0;
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < statement.entries.length; i++) {
    const entry = statement.entries[i];
    if (entry.match_status === 'MATCHED') continue;

    for (const cand of candidates) {
      if (cand.matched) continue;

      // Amount match: bank debit = book credit (money out) or bank credit = book debit (money in)
      const amountMatch =
        (entry.debit > 0 && Math.abs(entry.debit - cand.amount_credit) < 0.01) ||
        (entry.credit > 0 && Math.abs(entry.credit - cand.amount_debit) < 0.01);
      if (!amountMatch) continue;

      // Date match: within ±2 days
      if (entry.txn_date) {
        const diff = Math.abs(new Date(entry.txn_date).getTime() - cand.je_date.getTime());
        if (diff > TWO_DAYS_MS) continue;
      }

      // Reference match: substring check (optional — boost confidence)
      const entryRef = (entry.reference || entry.description || '').toLowerCase();
      const refMatch = !entryRef || !cand.description || entryRef.includes(cand.description) || cand.description.includes(entryRef);

      if (amountMatch && refMatch) {
        statement.entries[i].match_status = 'MATCHED';
        statement.entries[i].je_id = cand.je_id;
        cand.matched = true;
        matchCount++;
        break;
      }
    }
  }

  statement.status = 'IN_PROGRESS';
  await statement.save();

  return { matchCount, totalEntries: statement.entries.length };
}

/**
 * Manual match: link a specific statement entry to a journal entry.
 */
async function manualMatch(statementId, entryIndex, jeId) {
  const statement = await BankStatement.findById(statementId);
  if (!statement) throw new Error('Statement not found');
  if (statement.status === 'FINALIZED') throw new Error('Statement already finalized');
  if (entryIndex < 0 || entryIndex >= statement.entries.length) throw new Error('Invalid entry index');

  // Verify JE exists
  const je = await JournalEntry.findById(jeId).lean();
  if (!je) throw new Error('Journal entry not found');

  statement.entries[entryIndex].match_status = 'MATCHED';
  statement.entries[entryIndex].je_id = jeId;
  statement.status = 'IN_PROGRESS';
  await statement.save();

  return statement.entries[entryIndex];
}

/**
 * Get reconciliation summary: matched, unmatched on each side, adjusted balances.
 */
async function getReconSummary(statementId) {
  const statement = await BankStatement.findById(statementId)
    .populate('bank_account_id', 'bank_name coa_code current_balance opening_balance')
    .lean();
  if (!statement) throw new Error('Statement not found');

  const bankAccount = statement.bank_account_id;

  const matched = [];
  const unmatched_bank = [];

  for (const entry of statement.entries) {
    if (entry.match_status === 'MATCHED') {
      matched.push(entry);
    } else {
      unmatched_bank.push(entry);
    }
  }

  // Unmatched book entries: posted JEs in this period/account not linked by any statement entry
  const matchedJeIds = matched.map(e => e.je_id).filter(Boolean);
  const coaCode = bankAccount?.coa_code;

  let unmatched_book = [];
  if (coaCode) {
    const allJes = await JournalEntry.find({
      entity_id: statement.entity_id,
      period: statement.period,
      status: 'POSTED',
      'lines.account_code': coaCode
    }).lean();

    const matchedSet = new Set(matchedJeIds.map(id => id.toString()));
    unmatched_book = allJes
      .filter(je => !matchedSet.has(je._id.toString()))
      .map(je => {
        const line = je.lines.find(l => l.account_code === coaCode);
        return {
          je_id: je._id,
          je_number: je.je_number,
          je_date: je.je_date,
          description: line?.description || je.source_doc_ref || '',
          debit: line?.debit || 0,
          credit: line?.credit || 0
        };
      });
  }

  // Compute adjusted balances
  const bankBalance = statement.closing_balance;
  const unmatchedBankTotal = unmatched_bank.reduce((sum, e) => sum + (e.credit - e.debit), 0);
  const adjusted_bank_balance = Math.round((bankBalance - unmatchedBankTotal) * 100) / 100;

  const bookBalance = bankAccount?.current_balance || bankAccount?.opening_balance || 0;
  const unmatchedBookTotal = unmatched_book.reduce((sum, e) => sum + (e.debit - e.credit), 0);
  const adjusted_book_balance = Math.round((bookBalance - unmatchedBookTotal) * 100) / 100;

  const difference = Math.round((adjusted_bank_balance - adjusted_book_balance) * 100) / 100;

  return {
    statement_id: statement._id,
    period: statement.period,
    status: statement.status,
    matched,
    unmatched_bank,
    unmatched_book,
    closing_balance: bankBalance,
    book_balance: bookBalance,
    adjusted_bank_balance,
    adjusted_book_balance,
    difference
  };
}

/**
 * Finalize reconciliation — lock the statement and update bank account balance.
 */
async function finalizeRecon(statementId, userId) {
  const statement = await BankStatement.findById(statementId);
  if (!statement) throw new Error('Statement not found');
  if (statement.status === 'FINALIZED') throw new Error('Already finalized');

  const bankAccount = await BankAccount.findById(statement.bank_account_id).lean();
  const bankCoa = bankAccount?.coa_code || '1010';
  const bankName = bankAccount?.bank_name || 'Bank Account';

  // Create adjustment JEs for RECONCILING_ITEM entries (bank fees, interest, etc.)
  const reconItems = (statement.entries || []).filter(e => e.match_status === 'RECONCILING_ITEM' && !e.je_id);
  for (const entry of reconItems) {
    try {
      const amount = entry.debit || entry.credit || 0;
      if (amount <= 0) continue;

      const isDebit = entry.debit > 0; // Bank debited = money left bank (fee/charge)
      const lines = isDebit
        ? [
            { account_code: '7100', account_name: 'Bank Charges', debit: amount, credit: 0, description: entry.description || 'Bank charge' },
            { account_code: bankCoa, account_name: bankName, debit: 0, credit: amount, description: entry.description || 'Bank charge' }
          ]
        : [
            { account_code: bankCoa, account_name: bankName, debit: amount, credit: 0, description: entry.description || 'Bank credit' },
            { account_code: '4200', account_name: 'Interest Income', debit: 0, credit: amount, description: entry.description || 'Interest earned' }
          ];

      const je = await createAndPostJournal(statement.entity_id, {
        je_date: entry.txn_date || statement.statement_date,
        period: statement.period,
        description: `Bank Recon: ${entry.description || 'Reconciling item'}`,
        source_module: 'BANKING',
        source_doc_ref: `RECON-${statement.period}-L${entry.line_no}`,
        lines,
        bir_flag: 'BOTH',
        vat_flag: 'N/A',
        created_by: userId
      });

      // Link JE to statement entry
      entry.je_id = je._id;
      entry.match_status = 'MATCHED';
    } catch (jeErr) {
      console.error('Bank recon JE failed for line', entry.line_no, jeErr.message);
    }
  }

  statement.status = 'FINALIZED';
  await statement.save();

  // Update bank account current_balance to match statement closing balance
  await BankAccount.findByIdAndUpdate(statement.bank_account_id, {
    current_balance: statement.closing_balance
  });

  return { status: 'FINALIZED', closing_balance: statement.closing_balance, adjustment_jes: reconItems.length };
}

module.exports = {
  importStatement,
  autoMatch,
  manualMatch,
  getReconSummary,
  finalizeRecon
};
