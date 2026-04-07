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
 * POST /transactions — create DEPOSIT or DISBURSEMENT as DRAFT
 * Balance does NOT move until POST — DRAFT is just a recorded intent.
 * This prevents phantom balance changes from un-posted transactions.
 */
const createTransaction = catchAsync(async (req, res) => {
  const { fund_id, txn_type, amount } = req.body;

  if (!['DEPOSIT', 'DISBURSEMENT'].includes(txn_type)) {
    return res.status(400).json({ success: false, message: 'txn_type must be DEPOSIT or DISBURSEMENT' });
  }
  if (!fund_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'fund_id and positive amount are required' });
  }

  const fund = await PettyCashFund.findOne({ _id: fund_id, ...req.tenantFilter });
  if (!fund) return res.status(404).json({ success: false, message: 'Fund not found' });

  // BDMs can only transact on funds they're custodian of
  const isPrivileged = ['admin', 'finance', 'president'].includes(req.user.role);
  if (!isPrivileged && fund.custodian_id?.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: 'Only the fund custodian can create transactions on this fund' });
  }

  // Respect fund_mode
  const mode = fund.fund_mode || 'REVOLVING';
  if (mode === 'EXPENSE_ONLY' && txn_type === 'DEPOSIT') {
    return res.status(400).json({ success: false, message: 'This fund is EXPENSE_ONLY — deposits not allowed' });
  }
  if (mode === 'DEPOSIT_ONLY' && txn_type === 'DISBURSEMENT') {
    return res.status(400).json({ success: false, message: 'This fund is DEPOSIT_ONLY — disbursements not allowed' });
  }

  // Soft check: warn if disbursement would exceed balance (hard check at POST time)
  if (txn_type === 'DISBURSEMENT' && amount > fund.current_balance) {
    return res.status(400).json({ success: false, message: `Insufficient balance. Current: ₱${fund.current_balance}, Requested: ₱${amount}` });
  }

  // Create DRAFT — balance untouched
  const txn = await PettyCashTransaction.create({
    ...req.body,
    entity_id: req.entityId,
    created_by: req.user._id,
    status: 'DRAFT',
    running_balance: fund.current_balance // snapshot, not mutation
  });

  res.status(201).json({ success: true, data: txn });
});

/**
 * POST /transactions/:id/post — atomically move balance + mark POSTED
 * This is the ONLY place balance changes for deposit/disbursement.
 */
const postTransaction = catchAsync(async (req, res) => {
  // Period lock check before entering transaction
  const { checkPeriodOpen, dateToPeriod } = require('../utils/periodLock');
  const txnPrecheck = await PettyCashTransaction.findOne({ _id: req.params.id, ...req.tenantFilter }).lean();
  if (txnPrecheck) {
    const pcPeriod = dateToPeriod(txnPrecheck.txn_date || new Date());
    await checkPeriodOpen(req.entityId, pcPeriod);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const txn = await PettyCashTransaction.findOne({
        _id: req.params.id,
        ...req.tenantFilter
      }).session(session);

      if (!txn) throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
      if (txn.status === 'POSTED') throw Object.assign(new Error('Transaction already posted'), { statusCode: 400 });

      const fund = await PettyCashFund.findById(txn.fund_id).session(session);
      if (!fund) throw Object.assign(new Error('Fund not found'), { statusCode: 404 });

      // Hard balance check at post time
      if (txn.txn_type === 'DISBURSEMENT' && txn.amount > fund.current_balance) {
        throw Object.assign(new Error(`Insufficient balance. Current: ₱${fund.current_balance}, Requested: ₱${txn.amount}`), { statusCode: 400 });
      }

      // Move balance atomically
      const delta = txn.txn_type === 'DEPOSIT' ? txn.amount : -txn.amount;
      fund.current_balance = Math.round((fund.current_balance + delta) * 100) / 100;
      await fund.save({ session });

      txn.status = 'POSTED';
      txn.posted_at = new Date();
      txn.posted_by = req.user._id;
      txn.running_balance = fund.current_balance;
      await txn.save({ session });

      result = txn;
    });

    // ── Post-commit: ceiling breach notification (non-blocking) ──
    let ceilingBreached = false;
    try {
      const updatedFund = await PettyCashFund.findById(result.fund_id).lean();
      if (updatedFund && updatedFund.current_balance > updatedFund.balance_ceiling) {
        ceilingBreached = true;
        const excess = Math.round((updatedFund.current_balance - updatedFund.balance_ceiling) * 100) / 100;
        const { notify } = require('../../agents/notificationService');

        // Notify custodian
        if (updatedFund.custodian_id) {
          await notify({
            recipient_id: updatedFund.custodian_id,
            title: `Petty Cash Ceiling Exceeded — ${updatedFund.fund_name}`,
            body: `Balance ₱${updatedFund.current_balance.toLocaleString()} exceeds ceiling ₱${updatedFund.balance_ceiling.toLocaleString()} by ₱${excess.toLocaleString()}. Generate a Remittance and hand over excess cash to the owner.`,
            category: 'compliance_alert',
            priority: 'important',
            channels: ['in_app'],
            agent: 'petty_cash'
          }).catch(() => {});
        }

        // Notify president
        await notify({
          recipient_id: 'PRESIDENT',
          title: `Petty Cash Over Ceiling — ${updatedFund.fund_name}`,
          body: `Fund ${updatedFund.fund_code} balance ₱${updatedFund.current_balance.toLocaleString()} exceeds ceiling by ₱${excess.toLocaleString()}. Custodian should remit excess.`,
          category: 'compliance_alert',
          priority: 'normal',
          channels: ['in_app'],
          agent: 'petty_cash'
        }).catch(() => {});
      }
    } catch (ceilErr) {
      console.error('[PettyCash] Ceiling notification failed:', ceilErr.message);
    }

    res.json({ success: true, data: result, ceiling_breached: ceilingBreached });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    throw err;
  } finally {
    session.endSession();
  }
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

  // Fund mode enforcement
  if (fund.fund_mode === 'DEPOSIT_ONLY') {
    return res.status(400).json({ success: false, message: 'DEPOSIT_ONLY fund cannot generate remittance' });
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
 * POST /replenishments/generate — create REPLENISHMENT document (PENDING)
 * Balance does NOT move here — only when processDocument is called.
 * Fund mode enforcement: EXPENSE_ONLY funds cannot receive replenishment.
 */
const generateReplenishment = catchAsync(async (req, res) => {
  const { fund_id, amount } = req.body;

  if (!fund_id || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'fund_id and positive amount are required' });
  }

  const fund = await PettyCashFund.findOne({ _id: fund_id, ...req.tenantFilter });
  if (!fund) return res.status(404).json({ success: false, message: 'Fund not found' });

  // Fund mode enforcement
  if (fund.fund_mode === 'EXPENSE_ONLY') {
    return res.status(400).json({ success: false, message: 'EXPENSE_ONLY fund cannot receive replenishment' });
  }

  const doc = await PettyCashRemittance.create({
    entity_id: req.entityId,
    fund_id,
    doc_type: 'REPLENISHMENT',
    doc_date: new Date(),
    amount,
    custodian_id: fund.custodian_id,
    transaction_ids: [],
    status: 'PENDING',
    created_by: req.user._id
  });

  res.status(201).json({ success: true, data: doc });
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

      // REMITTANCE: custodian sends excess cash to owner → balance DOWN
      // REPLENISHMENT: owner sends cash to custodian → balance UP
      const txnType = doc.doc_type;
      const delta = txnType === 'REMITTANCE' ? -doc.amount : doc.amount;

      // Balance guard for remittance
      if (txnType === 'REMITTANCE' && doc.amount > fund.current_balance) {
        throw Object.assign(new Error(`Cannot remit ₱${doc.amount} — current balance is only ₱${fund.current_balance}`), { statusCode: 400 });
      }

      // Move balance atomically (this is the ONLY place balance changes for remit/replenish)
      fund.current_balance = Math.round((fund.current_balance + delta) * 100) / 100;
      await fund.save({ session });

      // Create POSTED transaction as audit record
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
        running_balance: fund.current_balance,
        remittance_id: doc._id
      }], { session });

      // Journal entry — use fund's COA code (not hardcoded 6900)
      const fundCoa = fund.coa_code || '1000';
      const fundCoaName = fund.fund_name || 'Petty Cash';
      const jeTxn = {
        ...(txn.toObject ? txn.toObject() : txn),
        txn_type: doc.doc_type,
        txn_number: doc.doc_number,
        txn_date: doc.doc_date
      };
      const jeData = await journalFromPettyCash(jeTxn, fundCoa, fundCoaName, req.user._id);
      if (jeData) {
        await createAndPostJournal(req.entityId, jeData);
      }

      // Mark document processed
      doc.status = 'PROCESSED';
      doc.processed_at = new Date();
      doc.processed_by = req.user._id;
      doc.transaction_ids = [...(doc.transaction_ids || []), txn._id];
      await doc.save({ session });
    });

    res.json({ success: true, data: doc });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ success: false, message: err.message });
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * DELETE /funds/:id — president only, fund must have zero balance
 */
const deleteFund = catchAsync(async (req, res) => {
  const fund = await PettyCashFund.findOne({ _id: req.params.id, ...req.tenantFilter });
  if (!fund) return res.status(404).json({ success: false, message: 'Fund not found' });

  if (fund.current_balance !== 0) {
    return res.status(400).json({ success: false, message: `Cannot delete fund with balance ₱${fund.current_balance}. Settle balance first.` });
  }

  // Check for any linked transactions
  const txnCount = await PettyCashTransaction.countDocuments({ fund_id: fund._id });
  if (txnCount > 0) {
    return res.status(400).json({ success: false, message: `Cannot delete fund with ${txnCount} transaction(s). Close the fund instead.` });
  }

  await PettyCashFund.deleteOne({ _id: fund._id });
  res.json({ success: true, message: `Fund ${fund.fund_code} deleted` });
});

module.exports = {
  getFunds,
  getFundById,
  createFund,
  updateFund,
  deleteFund,
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
