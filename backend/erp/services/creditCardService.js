/**
 * Credit Card Ledger Service
 * Card balance tracking, ledger view, and payment recording with JE creation.
 */
const mongoose = require('mongoose');
const CreditCardTransaction = require('../models/CreditCardTransaction');
const CreditCard = require('../models/CreditCard');
const BankAccount = require('../models/BankAccount');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const { createAndPostJournal } = require('./journalEngine');
// Ensure populated ref models are registered
require('../models/ExpenseEntry');
require('../models/PrfCalf');

/**
 * Get outstanding balance for a single credit card (PENDING + POSTED transactions).
 */
async function getCardBalance(entityId, cardId) {
  const result = await CreditCardTransaction.aggregate([
    {
      $match: {
        entity_id: new mongoose.Types.ObjectId(entityId),
        credit_card_id: new mongoose.Types.ObjectId(cardId),
        status: { $in: ['PENDING', 'POSTED'] }
      }
    },
    { $group: { _id: null, outstanding: { $sum: '$amount' } } }
  ]);
  return Math.round((result[0]?.outstanding || 0) * 100) / 100;
}

/**
 * Get card ledger — transaction list filtered by period.
 */
async function getCardLedger(entityId, cardId, period) {
  const filter = {
    entity_id: new mongoose.Types.ObjectId(entityId),
    credit_card_id: new mongoose.Types.ObjectId(cardId)
  };
  if (period) {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);
    filter.txn_date = { $gte: start, $lt: end };
  }

  const transactions = await CreditCardTransaction.find(filter)
    .populate('linked_expense_id', 'period cycle status')
    .populate('linked_calf_id', 'calf_number doc_type status')
    .populate('payment_je_id', 'je_number')
    .populate('created_by', 'name')
    .sort({ txn_date: -1 })
    .lean();

  return transactions;
}

/**
 * Get all cards with their outstanding balances for an entity.
 */
async function getAllCardBalances(entityId) {
  const eid = new mongoose.Types.ObjectId(entityId);

  const cards = await CreditCard.find({ entity_id: eid, is_active: true })
    .populate('assigned_to', 'name')
    .lean();

  const balances = await CreditCardTransaction.aggregate([
    { $match: { entity_id: eid, status: { $in: ['PENDING', 'POSTED'] } } },
    { $group: { _id: '$credit_card_id', outstanding: { $sum: '$amount' }, txn_count: { $sum: 1 } } }
  ]);

  const balMap = new Map(balances.map(b => [b._id.toString(), b]));

  return cards.map(card => ({
    ...card,
    outstanding: Math.round((balMap.get(card._id.toString())?.outstanding || 0) * 100) / 100,
    pending_txn_count: balMap.get(card._id.toString())?.txn_count || 0
  }));
}

/**
 * Record a credit card payment — creates a JE:
 *   DR: CC Payable (card's coa_code, e.g. 2310)
 *   CR: Cash/Bank (bank account's coa_code, e.g. 1010)
 * Marks oldest PENDING/POSTED transactions as PAID up to the payment amount.
 */
async function recordCardPayment(entityId, cardId, amount, bankAccountId, paymentDate, userId) {
  const card = await CreditCard.findOne({ _id: cardId, entity_id: entityId }).lean();
  if (!card) throw new Error('Credit card not found');

  const bankAcct = await BankAccount.findOne({ _id: bankAccountId, entity_id: entityId }).lean();
  if (!bankAcct) throw new Error('Bank account not found');

  // Look up account names for JE lines
  const accounts = await ChartOfAccounts.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    account_code: { $in: [card.coa_code, bankAcct.coa_code] }
  }).lean();
  const acctMap = new Map(accounts.map(a => [a.account_code, a.account_name]));

  const jeDate = paymentDate || new Date();
  const period = `${jeDate.getFullYear()}-${String(jeDate.getMonth() + 1).padStart(2, '0')}`;

  // Create and post the payment JE
  const je = await createAndPostJournal(entityId, {
    je_date: jeDate,
    period,
    description: `CC Payment — ${card.card_name} via ${bankAcct.bank_name}`,
    source_module: 'BANKING',
    source_doc_ref: `CC-PAY-${card.card_code}`,
    lines: [
      {
        account_code: card.coa_code,
        account_name: acctMap.get(card.coa_code) || `CC Payable — ${card.card_name}`,
        debit: amount,
        credit: 0,
        description: `CC payment — ${card.card_name}`
      },
      {
        account_code: bankAcct.coa_code,
        account_name: acctMap.get(bankAcct.coa_code) || bankAcct.bank_name,
        debit: 0,
        credit: amount,
        description: `CC payment from ${bankAcct.bank_name}`
      }
    ],
    bir_flag: 'INTERNAL',
    vat_flag: 'N/A',
    created_by: userId
  });

  // Mark oldest outstanding transactions as PAID up to the payment amount
  let remaining = amount;
  const txns = await CreditCardTransaction.find({
    entity_id: entityId,
    credit_card_id: cardId,
    status: { $in: ['PENDING', 'POSTED'] }
  }).sort({ txn_date: 1 });

  const paidIds = [];
  for (const txn of txns) {
    if (remaining <= 0) break;
    txn.status = 'PAID';
    txn.payment_je_id = je._id;
    await txn.save();
    remaining -= txn.amount;
    paidIds.push(txn._id);
  }

  return {
    je_id: je._id,
    je_number: je.je_number,
    amount,
    transactions_paid: paidIds.length
  };
}

module.exports = {
  getCardBalance,
  getCardLedger,
  getAllCardBalances,
  recordCardPayment
};
