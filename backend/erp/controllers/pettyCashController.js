/**
 * Petty Cash Controller — Phase 19
 *
 * Fund management, deposits/disbursements, ceiling checks,
 * remittance/replenishment documents with dual-signature flow.
 * All endpoints entity-scoped via tenantFilter.
 */
const mongoose = require('mongoose');
const PettyCashFund = require('../models/PettyCashFund');
const PettyCashTransaction = require('../models/PettyCashTransaction');
const PettyCashRemittance = require('../models/PettyCashRemittance');
const { catchAsync } = require('../../middleware/errorHandler');
const { journalFromPettyCash } = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');

// ═══════════════════════════════════════════════════════════
// FUNDS
// ═══════════════════════════════════════════════════════════

/**
 * GET /funds — list all petty cash funds for entity
 */
const getFunds = catchAsync(async (req, res) => {
  const funds = await PettyCashFund.find({ ...req.tenantFilter })
    .populate('custodian_id', 'name email')
    .sort({ created_at: -1 })
    .lean();

  res.json({ success: true, data: funds });
});

/**
 * GET /funds/:id — fund detail with ceiling alert status
 */
const getFundById = catchAsync(async (req, res) => {
  const fund = await PettyCashFund.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  }).populate('custodian_id', 'name email').lean();

  if (!fund) {
    return res.status(404).json({ success: false, message: 'Fund not found' });
  }

  fund.ceiling_alert = fund.current_balance > fund.balance_ceiling;

  res.json({ success: true, data: fund });
});

/**
 * POST /funds — create a petty cash fund
 */
const createFund = catchAsync(async (req, res) => {
  const fundData = {
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id
  };

  const fund = await PettyCashFund.create(fundData);
  res.status(201).json({ success: true, data: fund });
});

/**
 * PUT /funds/:id — update fund details
 */
const updateFund = catchAsync(async (req, res) => {
  const fund = await PettyCashFund.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!fund) {
    return res.status(404).json({ success: false, message: 'Fund not found' });
  }

  const blocked = ['_id', 'entity_id', 'created_at', 'created_by'];
  for (const [key, val] of Object.entries(req.body)) {
    if (!blocked.includes(key)) fund[key] = val;
  }

  await fund.save();
  res.json({ success: true, data: fund });
});

// ═══════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════

/**
 * GET /transactions — paginated, filterable by fund_id, txn_type, date range
 */
const getTransactions = catchAsync(async (req, res) => {
  const { fund_id, txn_type, date_from, date_to, page = 1, limit = 50 } = req.query;

  const filter = { ...req.tenantFilter };
  if (fund_id) filter.fund_id = fund_id;
  if (txn_type) filter.txn_type = txn_type;
  if (date_from || date_to) {
    filter.txn_date = {};
    if (date_from) filter.txn_date.$gte = new Date(date_from);
    if (date_to) filter.txn_date.$lte = new Date(date_to);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [transactions, total] = await Promise.all([
    PettyCashTransaction.find(filter)
      .populate('fund_id', 'fund_name')
      .sort({ txn_date: -1, created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PettyCashTransaction.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: transactions,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * POST /transactions — create DEPOSIT or DISBURSEMENT
 * Atomically updates fund current_balance.
 */
const createTransaction = catchAsync(async (req, res) => {
  const { fund_id, txn_type, amount } = req.body;

  if (!['DEPOSIT', 'DISBURSEMENT'].includes(txn_type)) {
    return res.status(400).json({ success: false, message: 'txn_type must be DEPOSIT or DISBURSEMENT' });
  }
  if (!fund_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'fund_id and positive amount are required' });
  }

  const session = await mongoose.startSession();
  try {
    let txn;
    await session.withTransaction(async () => {
      const fund = await PettyCashFund.findOne({
        _id: fund_id,
        ...req.tenantFilter
      }).session(session);

      if (!fund) {
        throw Object.assign(new Error('Fund not found'), { statusCode: 404 });
      }

      // Respect fund_mode — restrict allowed transaction types
      const mode = fund.fund_mode || 'REVOLVING';
      if (mode === 'EXPENSE_ONLY' && txn_type === 'DEPOSIT') {
        throw Object.assign(new Error('This fund is EXPENSE_ONLY mode — deposits not allowed. Change fund mode to REVOLVING first.'), { statusCode: 400 });
      }
      if (mode === 'DEPOSIT_ONLY' && txn_type === 'DISBURSEMENT') {
        throw Object.assign(new Error('This fund is DEPOSIT_ONLY mode — disbursements not allowed. Change fund mode to REVOLVING first.'), { statusCode: 400 });
      }

      if (txn_type === 'DISBURSEMENT' && amount > fund.current_balance) {
        throw Object.assign(
          new Error(`Insufficient balance. Current: ${fund.current_balance}, Requested: ${amount}`),
          { statusCode: 400 }
        );
      }

      // Update fund balance atomically
      const delta = txn_type === 'DEPOSIT' ? amount : -amount;
      fund.current_balance += delta;
      await fund.save({ session });

      // Create transaction
      [txn] = await PettyCashTransaction.create([{
        ...req.body,
        entity_id: req.entityId,
        created_by: req.user._id,
        status: 'DRAFT',
        running_balance: fund.current_balance
      }], { session });
    });

    res.status(201).json({ success: true, data: txn });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * POST /transactions/:id/post — mark transaction POSTED
 */
const postTransaction = catchAsync(async (req, res) => {
  const txn = await PettyCashTransaction.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!txn) {
    return res.status(404).json({ success: false, message: 'Transaction not found' });
  }
  if (txn.status === 'POSTED') {
    return res.status(400).json({ success: false, message: 'Transaction already posted' });
  }

  txn.status = 'POSTED';
  txn.posted_at = new Date();
  txn.posted_by = req.user._id;
  await txn.save();

  res.json({ success: true, data: txn });
});

// ═══════════════════════════════════════════════════════════
// CEILING CHECK & REMITTANCE / REPLENISHMENT
// ═══════════════════════════════════════════════════════════

/**
 * GET /ceiling/:fundId — check if fund is over ceiling
 */
const checkCeiling = catchAsync(async (req, res) => {
  const fund = await PettyCashFund.findOne({
    _id: req.params.fundId,
    ...req.tenantFilter
  }).lean();

  if (!fund) {
    return res.status(404).json({ success: false, message: 'Fund not found' });
  }

  const over_ceiling = fund.current_balance > fund.balance_ceiling;
  const excess = over_ceiling ? fund.current_balance - fund.balance_ceiling : 0;

  res.json({
    success: true,
    data: {
      over_ceiling,
      current_balance: fund.current_balance,
      ceiling: fund.balance_ceiling,
      excess
    }
  });
});

/**
 * POST /remittances/generate — create REMITTANCE document for excess amount
 * Links recent unremitted deposit/disbursement transactions.
 */
const generateRemittance = catchAsync(async (req, res) => {
  const { fund_id } = req.body;

  const fund = await PettyCashFund.findOne({
    _id: fund_id,
    ...req.tenantFilter
  });

  if (!fund) {
    return res.status(404).json({ success: false, message: 'Fund not found' });
  }

  if (fund.current_balance <= fund.balance_ceiling) {
    return res.status(400).json({ success: false, message: 'Fund is not over ceiling. No remittance needed.' });
  }

  const excess = fund.current_balance - fund.balance_ceiling;

  // Find recent unremitted transactions
  const unremittedTxns = await PettyCashTransaction.find({
    fund_id,
    ...req.tenantFilter,
    txn_type: { $in: ['DEPOSIT', 'DISBURSEMENT'] },
    remittance_id: { $exists: false },
    status: { $in: ['DRAFT', 'POSTED'] }
  }).sort({ txn_date: -1 }).lean();

  const txnIds = unremittedTxns.map(t => t._id);

  const doc = await PettyCashRemittance.create({
    entity_id: req.entityId,
    fund_id,
    doc_type: 'REMITTANCE',
    doc_date: new Date(),
    amount: excess,
    custodian_id: fund.custodian_id,
    transaction_ids: txnIds,
    status: 'PENDING',
    created_by: req.user._id
  });

  // Mark transactions as linked
  if (txnIds.length) {
    await PettyCashTransaction.updateMany(
      { _id: { $in: txnIds } },
      { remittance_id: doc._id }
    );
  }

  res.status(201).json({ success: true, data: doc });
});

/**
 * POST /replenishments/generate — create REPLENISHMENT document
 * Accepts amount from body, creates REPLENISHMENT transaction, adds to balance.
 */
const generateReplenishment = catchAsync(async (req, res) => {
  const { fund_id, amount } = req.body;

  if (!fund_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'fund_id and positive amount are required' });
  }

  const session = await mongoose.startSession();
  try {
    let doc;
    await session.withTransaction(async () => {
      const fund = await PettyCashFund.findOne({
        _id: fund_id,
        ...req.tenantFilter
      }).session(session);

      if (!fund) {
        throw Object.assign(new Error('Fund not found'), { statusCode: 404 });
      }

      // Create replenishment transaction
      const [txn] = await PettyCashTransaction.create([{
        entity_id: req.entityId,
        fund_id,
        txn_type: 'REPLENISHMENT',
        amount,
        txn_date: new Date(),
        source_description: 'Owner replenishment',
        status: 'DRAFT',
        created_by: req.user._id,
        running_balance: fund.current_balance + amount
      }], { session });

      // Update fund balance
      fund.current_balance += amount;
      await fund.save({ session });

      // Create replenishment document
      [doc] = await PettyCashRemittance.create([{
        entity_id: req.entityId,
        fund_id,
        doc_type: 'REPLENISHMENT',
        doc_date: new Date(),
        amount,
        custodian_id: fund.custodian_id,
        transaction_ids: [txn._id],
        status: 'PENDING',
        created_by: req.user._id
      }], { session });
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  } finally {
    session.endSession();
  }
});

// ═══════════════════════════════════════════════════════════
// DOCUMENTS (Remittance / Replenishment)
// ═══════════════════════════════════════════════════════════

/**
 * GET /documents — list PettyCashRemittance docs, filterable
 */
const getDocuments = catchAsync(async (req, res) => {
  const { fund_id, doc_type, status, page = 1, limit = 50 } = req.query;

  const filter = { ...req.tenantFilter };
  if (fund_id) filter.fund_id = fund_id;
  if (doc_type) filter.doc_type = doc_type;
  if (status) filter.status = status;

  const skip = (Number(page) - 1) * Number(limit);
  const [docs, total] = await Promise.all([
    PettyCashRemittance.find(filter)
      .populate('fund_id', 'fund_name')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    PettyCashRemittance.countDocuments(filter)
  ]);

  res.json({
    success: true,
    data: docs,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / Number(limit))
    }
  });
});

/**
 * POST /documents/:id/sign — custodian or owner signs document
 */
const signDocument = catchAsync(async (req, res) => {
  const { signer } = req.body; // 'custodian' or 'owner'

  if (!['custodian', 'owner'].includes(signer)) {
    return res.status(400).json({ success: false, message: 'signer must be "custodian" or "owner"' });
  }

  const doc = await PettyCashRemittance.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  });

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }

  if (signer === 'custodian') {
    doc.custodian_signed = true;
    doc.custodian_signed_at = new Date();
    doc.custodian_signed_by = req.user._id;
  } else {
    doc.owner_signed = true;
    doc.owner_signed_at = new Date();
    doc.owner_signed_by = req.user._id;
  }

  await doc.save();
  res.json({ success: true, data: doc });
});

/**
 * POST /documents/:id/process — mark PROCESSED, create transaction, post JE
 */
const processDocument = catchAsync(async (req, res) => {
  const doc = await PettyCashRemittance.findOne({
    _id: req.params.id,
    ...req.tenantFilter
  }).populate('fund_id');

  if (!doc) {
    return res.status(404).json({ success: false, message: 'Document not found' });
  }
  if (doc.status === 'PROCESSED') {
    return res.status(400).json({ success: false, message: 'Document already processed' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const fund = await PettyCashFund.findById(doc.fund_id._id || doc.fund_id).session(session);
      if (!fund) throw Object.assign(new Error('Fund not found'), { statusCode: 404 });

      // Create the transaction on the fund
      const txnType = doc.doc_type; // REMITTANCE or REPLENISHMENT
      const delta = txnType === 'REMITTANCE' ? -doc.amount : doc.amount;

      const [txn] = await PettyCashTransaction.create([{
        entity_id: req.entityId,
        fund_id: fund._id,
        txn_type: txnType,
        amount: doc.amount,
        txn_date: new Date(),
        source_description: `${txnType} — doc ${doc.doc_number || doc._id}`,
        status: 'POSTED',
        posted_at: new Date(),
        posted_by: req.user._id,
        created_by: req.user._id,
        running_balance: fund.current_balance + delta,
        remittance_id: doc._id
      }], { session });

      // Update fund balance
      fund.current_balance += delta;
      await fund.save({ session });

      // Create and post journal entry
      // journalFromPettyCash(txn, expenseCoaCode, expenseCoaName, userId)
      // txn needs txn_type set to doc.doc_type (REMITTANCE or REPLENISHMENT)
      const jeTxn = {
        ...txn.toObject ? txn.toObject() : txn,
        txn_type: doc.doc_type,
        txn_number: doc.doc_number,
        txn_date: doc.doc_date
      };
      const jeData = journalFromPettyCash(jeTxn, '6900', 'Miscellaneous Expense', req.user._id);
      if (jeData) {
        await createAndPostJournal(req.entityId, jeData);
      }

      // Mark document processed
      doc.status = 'PROCESSED';
      doc.processed_at = new Date();
      doc.processed_by = req.user._id;
      await doc.save({ session });
    });

    res.json({ success: true, data: doc });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    throw err;
  } finally {
    session.endSession();
  }
});

module.exports = {
  getFunds,
  getFundById,
  createFund,
  updateFund,
  getTransactions,
  createTransaction,
  postTransaction,
  checkCeiling,
  generateRemittance,
  generateReplenishment,
  getDocuments,
  signDocument,
  processDocument
};
