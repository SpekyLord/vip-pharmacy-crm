/**
 * Journal Entry Engine — core double-entry posting service
 *
 * PRD v5 §11.3 — Create, post, reverse journal entries.
 * Uses DocSequence for auto-incrementing JE numbers per entity per year.
 * Reversal uses SAP Storno pattern (new opposite JE, original stays POSTED).
 */
const JournalEntry = require('../models/JournalEntry');
const DocSequence = require('../models/DocSequence');

/**
 * Create a journal entry in DRAFT status with auto-assigned JE number
 * @param {String} entityId
 * @param {Object} data — { je_date, period, description, source_module, lines[], bir_flag, vat_flag, bdm_id, source_event_id, source_doc_ref, created_by }
 * @returns {Object} created JournalEntry document
 */
async function createJournal(entityId, data) {
  const year = new Date(data.je_date).getFullYear();
  const seqKey = `JE-${entityId}-${year}`;
  const jeNumber = await DocSequence.getNext(seqKey);

  const je = await JournalEntry.create({
    entity_id: entityId,
    bdm_id: data.bdm_id || null,
    je_number: jeNumber,
    je_date: data.je_date,
    period: data.period,
    description: data.description,
    source_module: data.source_module,
    source_event_id: data.source_event_id || null,
    source_doc_ref: data.source_doc_ref || null,
    lines: data.lines,
    bir_flag: data.bir_flag || 'BOTH',
    vat_flag: data.vat_flag || 'N/A',
    status: 'DRAFT',
    created_by: data.created_by
  });

  return je;
}

/**
 * Post a DRAFT journal entry — validates DR=CR balance
 * @param {String} jeId — JournalEntry _id
 * @param {String} userId — who is posting
 * @returns {Object} posted JournalEntry
 */
async function postJournal(jeId, userId) {
  const je = await JournalEntry.findById(jeId);
  if (!je) throw new Error('Journal entry not found');
  if (je.status !== 'DRAFT') throw new Error(`Cannot post JE in status: ${je.status}`);

  je.status = 'POSTED';
  je.posted_by = userId;
  je.posted_at = new Date();
  await je.save(); // pre-save validates DR=CR balance

  return je;
}

/**
 * Create and immediately post a journal entry (convenience for auto-journals)
 * @param {String} entityId
 * @param {Object} data — same as createJournal
 * @returns {Object} posted JournalEntry
 */
async function createAndPostJournal(entityId, data) {
  const year = new Date(data.je_date).getFullYear();
  const seqKey = `JE-${entityId}-${year}`;
  const jeNumber = await DocSequence.getNext(seqKey);

  const je = await JournalEntry.create({
    entity_id: entityId,
    bdm_id: data.bdm_id || null,
    je_number: jeNumber,
    je_date: data.je_date,
    period: data.period,
    description: data.description,
    source_module: data.source_module,
    source_event_id: data.source_event_id || null,
    source_doc_ref: data.source_doc_ref || null,
    lines: data.lines,
    bir_flag: data.bir_flag || 'BOTH',
    vat_flag: data.vat_flag || 'N/A',
    status: 'POSTED',
    posted_by: data.created_by,
    posted_at: new Date(),
    created_by: data.created_by
  });

  return je;
}

/**
 * Reverse a POSTED journal entry (SAP Storno pattern)
 * Creates a NEW JE with all amounts flipped. Original stays POSTED.
 * @param {String} jeId — original JE _id
 * @param {String} reason — reversal reason
 * @param {String} userId — who is reversing
 * @returns {Object} reversal JournalEntry
 */
async function reverseJournal(jeId, reason, userId) {
  const original = await JournalEntry.findById(jeId);
  if (!original) throw new Error('Journal entry not found');
  if (original.status !== 'POSTED') throw new Error('Only POSTED entries can be reversed');

  // Check not already reversed
  const existing = await JournalEntry.findOne({ corrects_je_id: original._id });
  if (existing) throw new Error(`JE already reversed by JE #${existing.je_number}`);

  // Flip debit/credit on each line
  const reversedLines = original.lines.map(line => ({
    account_code: line.account_code,
    account_name: line.account_name,
    debit: line.credit,
    credit: line.debit,
    description: line.description ? `Reversal: ${line.description}` : 'Reversal',
    bdm_id: line.bdm_id,
    cost_center: line.cost_center
  }));

  const reversal = await createAndPostJournal(original.entity_id, {
    je_date: new Date(),
    period: original.period,
    description: `Reversal of JE #${original.je_number}: ${reason || ''}`.trim(),
    source_module: original.source_module,
    lines: reversedLines,
    bir_flag: original.bir_flag,
    vat_flag: original.vat_flag,
    created_by: userId
  });

  // Link reversal
  reversal.corrects_je_id = original._id;
  reversal.is_reversal = true;
  await reversal.save();

  return reversal;
}

/**
 * List journal entries for a period with optional filters
 * @param {String} entityId
 * @param {Object} filters — { period, source_module, status, page, limit }
 * @returns {Object} { data, total, page, limit }
 */
async function getJournalsByPeriod(entityId, filters = {}) {
  const query = { entity_id: entityId };
  if (filters.period) query.period = filters.period;
  if (filters.source_module) query.source_module = filters.source_module;
  if (filters.status) query.status = filters.status;
  if (filters.bdm_id) query.bdm_id = filters.bdm_id;

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 50;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    JournalEntry.find(query)
      .sort({ je_number: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    JournalEntry.countDocuments(query)
  ]);

  return { data, total, page, limit };
}

/**
 * General Ledger — all POSTED JE lines for a specific account
 * @param {String} entityId
 * @param {String} accountCode
 * @param {Object} dateRange — { from, to } (YYYY-MM-DD)
 * @returns {Array} ledger entries with running balance
 */
async function getGeneralLedger(entityId, accountCode, dateRange = {}) {
  const match = {
    entity_id: entityId,
    status: 'POSTED',
    'lines.account_code': accountCode
  };
  if (dateRange.from) match.je_date = { $gte: new Date(dateRange.from) };
  if (dateRange.to) {
    match.je_date = match.je_date || {};
    match.je_date.$lte = new Date(dateRange.to);
  }

  const entries = await JournalEntry.find(match)
    .sort({ je_date: 1, je_number: 1 })
    .lean();

  // Extract relevant lines and compute running balance
  let runningBalance = 0;
  const ledger = [];

  for (const je of entries) {
    for (const line of je.lines) {
      if (line.account_code === accountCode) {
        runningBalance += (line.debit || 0) - (line.credit || 0);
        ledger.push({
          je_id: je._id,
          je_number: je.je_number,
          je_date: je.je_date,
          period: je.period,
          description: line.description || je.description,
          source_module: je.source_module,
          debit: line.debit || 0,
          credit: line.credit || 0,
          running_balance: runningBalance
        });
      }
    }
  }

  return ledger;
}

module.exports = {
  createJournal,
  postJournal,
  createAndPostJournal,
  reverseJournal,
  getJournalsByPeriod,
  getGeneralLedger
};
