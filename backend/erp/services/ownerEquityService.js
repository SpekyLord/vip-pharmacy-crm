/**
 * Owner Equity Service — record infusions/drawings with auto-journaling
 *
 * PRD v5 §11.11
 * INFUSION: DR Cash/Bank, CR 3000 Owner Capital
 * DRAWING:  DR 3100 Owner Drawings, CR Cash/Bank
 */
const OwnerEquityEntry = require('../models/OwnerEquityEntry');
const { createAndPostJournal } = require('./journalEngine');
const { journalFromOwnerEquity } = require('./autoJournal');

/**
 * Record an owner infusion — creates entry + JE
 */
async function recordInfusion(entityId, data, userId) {
  const entry = await OwnerEquityEntry.create({
    entity_id: entityId,
    entry_type: 'INFUSION',
    amount: data.amount,
    bank_account: data.bank_account,
    bank_coa_code: data.bank_coa_code,
    bir_flag: data.bir_flag || 'BOTH',
    description: data.description,
    entry_date: data.entry_date || new Date(),
    recorded_by: userId
  });

  // Auto-create and post JE
  const jeData = await journalFromOwnerEquity(entry, data.bank_coa_code || '1010', data.bank_name || 'RCBC Savings', userId);
  const je = await createAndPostJournal(entityId, jeData);

  entry.je_id = je._id;
  await entry.save();

  return { entry, je };
}

/**
 * Record an owner drawing — creates entry + JE
 */
async function recordDrawing(entityId, data, userId) {
  const entry = await OwnerEquityEntry.create({
    entity_id: entityId,
    entry_type: 'DRAWING',
    amount: data.amount,
    bank_account: data.bank_account,
    bank_coa_code: data.bank_coa_code,
    bir_flag: data.bir_flag || 'BOTH',
    description: data.description,
    entry_date: data.entry_date || new Date(),
    recorded_by: userId
  });

  const jeData = await journalFromOwnerEquity(entry, data.bank_coa_code || '1010', data.bank_name || 'RCBC Savings', userId);
  const je = await createAndPostJournal(entityId, jeData);

  entry.je_id = je._id;
  await entry.save();

  return { entry, je };
}

/**
 * Get equity ledger with running balance
 */
async function getEquityLedger(entityId) {
  const entries = await OwnerEquityEntry.find({ entity_id: entityId })
    .sort({ entry_date: 1, created_at: 1 })
    .lean();

  let runningBalance = 0;
  return entries.map(e => {
    if (e.entry_type === 'INFUSION') {
      runningBalance += e.amount;
    } else {
      runningBalance -= e.amount;
    }
    return { ...e, running_balance: Math.round(runningBalance * 100) / 100 };
  });
}

module.exports = {
  recordInfusion,
  recordDrawing,
  getEquityLedger
};
