/**
 * Accounting Controller — HTTP layer for all Phase 11 accounting endpoints
 *
 * Journals, Trial Balance, P&L, VAT/CWT, Cashflow,
 * Fixed Assets, Loans, Owner Equity, General Ledger
 */
const JournalEntry = require('../models/JournalEntry');
const FixedAsset = require('../models/FixedAsset');
const LoanMaster = require('../models/LoanMaster');
const { catchAsync } = require('../../middleware/errorHandler');
const { createJournal, postJournal, reverseJournal, getJournalsByPeriod, getGeneralLedger } = require('../services/journalEngine');
const { generateTrialBalance } = require('../services/trialBalanceService');
const { generatePnlInternal, generatePnlBir, generateVatReturn, generateCwtSummary } = require('../services/pnlService');
const { createVatEntry, tagVatEntry, getVatLedger } = require('../services/vatService');
const { createCwtEntry, getCwtLedger } = require('../services/cwtService');
const { generateCashflow } = require('../services/cashflowService');
const { computeDepreciation, getDepreciationStaging, approveDepreciation, postDepreciation } = require('../services/depreciationService');
const { computeInterest, getInterestStaging, approveInterest, postInterest } = require('../services/loanService');
const { recordInfusion, recordDrawing, getEquityLedger } = require('../services/ownerEquityService');

// ═══════════════════════════════════════════════════════════
// JOURNAL ENTRIES
// ═══════════════════════════════════════════════════════════

const createManualJournal = catchAsync(async (req, res) => {
  const data = { ...req.body, source_module: 'MANUAL', created_by: req.user._id };
  const je = await createJournal(req.entityId, data);
  res.status(201).json({ success: true, data: je });
});

const listJournals = catchAsync(async (req, res) => {
  const result = await getJournalsByPeriod(req.entityId, req.query);
  res.json({ success: true, ...result });
});

const getJournalById = catchAsync(async (req, res) => {
  const je = await JournalEntry.findOne({ _id: req.params.id, entity_id: req.entityId }).lean();
  if (!je) return res.status(404).json({ success: false, message: 'Journal entry not found' });
  res.json({ success: true, data: je });
});

const postJournalEndpoint = catchAsync(async (req, res) => {
  const je = await postJournal(req.params.id, req.user._id);
  res.json({ success: true, data: je });
});

const reverseJournalEndpoint = catchAsync(async (req, res) => {
  const { reason } = req.body;
  const reversal = await reverseJournal(req.params.id, reason, req.user._id);
  res.json({ success: true, data: reversal });
});

// ═══════════════════════════════════════════════════════════
// GENERAL LEDGER
// ═══════════════════════════════════════════════════════════

const getGeneralLedgerEndpoint = catchAsync(async (req, res) => {
  const ledger = await getGeneralLedger(req.entityId, req.params.accountCode, {
    from: req.query.from,
    to: req.query.to
  });
  res.json({ success: true, data: ledger });
});

// ═══════════════════════════════════════════════════════════
// TRIAL BALANCE
// ═══════════════════════════════════════════════════════════

const getTrialBalance = catchAsync(async (req, res) => {
  const tb = await generateTrialBalance(req.entityId, req.params.period);
  res.json({ success: true, data: tb });
});

// ═══════════════════════════════════════════════════════════
// P&L (4 VIEWS)
// ═══════════════════════════════════════════════════════════

const getPnl = catchAsync(async (req, res) => {
  const view = req.query.view || 'INTERNAL';
  let data;

  if (view === 'BIR') {
    data = await generatePnlBir(req.entityId, req.params.period);
  } else {
    data = await generatePnlInternal(req.entityId, req.params.period);
  }

  res.json({ success: true, data });
});

const getVatReturnEndpoint = catchAsync(async (req, res) => {
  const data = await generateVatReturn(req.entityId, req.params.quarter, parseInt(req.params.year));
  res.json({ success: true, data });
});

const getCwtSummaryEndpoint = catchAsync(async (req, res) => {
  const data = await generateCwtSummary(req.entityId, req.params.quarter, parseInt(req.params.year));
  res.json({ success: true, data });
});

// ═══════════════════════════════════════════════════════════
// VAT LEDGER
// ═══════════════════════════════════════════════════════════

const getVatLedgerEndpoint = catchAsync(async (req, res) => {
  const data = await getVatLedger(req.entityId, req.params.period, req.query.finance_tag);
  res.json({ success: true, data });
});

const tagVatEntryEndpoint = catchAsync(async (req, res) => {
  const { tag } = req.body;
  if (!['INCLUDE', 'EXCLUDE', 'DEFER'].includes(tag)) {
    return res.status(400).json({ success: false, message: 'Tag must be INCLUDE, EXCLUDE, or DEFER' });
  }
  const entry = await tagVatEntry(req.params.id, tag, req.user._id);
  res.json({ success: true, data: entry });
});

// ═══════════════════════════════════════════════════════════
// CWT LEDGER
// ═══════════════════════════════════════════════════════════

const getCwtLedgerEndpoint = catchAsync(async (req, res) => {
  const data = await getCwtLedger(req.entityId, req.params.period);
  res.json({ success: true, data });
});

// ═══════════════════════════════════════════════════════════
// CASHFLOW
// ═══════════════════════════════════════════════════════════

const getCashflowEndpoint = catchAsync(async (req, res) => {
  const data = await generateCashflow(req.entityId, req.params.period, req.user._id);
  res.json({ success: true, data });
});

// ═══════════════════════════════════════════════════════════
// FIXED ASSETS
// ═══════════════════════════════════════════════════════════

const listFixedAssets = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  const assets = await FixedAsset.find(filter).sort({ asset_code: 1 }).lean();
  res.json({ success: true, data: assets });
});

const createFixedAsset = catchAsync(async (req, res) => {
  const asset = await FixedAsset.create({ entity_id: req.entityId, ...req.body });
  res.status(201).json({ success: true, data: asset });
});

const computeDepreciationEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) return res.status(400).json({ success: false, message: 'Period required' });
  const result = await computeDepreciation(req.entityId, period);
  res.json({ success: true, data: result });
});

const getDepreciationStagingEndpoint = catchAsync(async (req, res) => {
  const data = await getDepreciationStaging(req.entityId, req.params.period);
  res.json({ success: true, data });
});

const approveDepreciationEndpoint = catchAsync(async (req, res) => {
  const { entry_ids } = req.body;
  const result = await approveDepreciation(req.entityId, entry_ids, req.user._id);
  res.json({ success: true, data: result });
});

const postDepreciationEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  const result = await postDepreciation(req.entityId, period, req.user._id);
  res.json({ success: true, data: result });
});

// ═══════════════════════════════════════════════════════════
// LOANS
// ═══════════════════════════════════════════════════════════

const listLoans = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.status) filter.status = req.query.status;
  const loans = await LoanMaster.find(filter).sort({ loan_code: 1 }).lean();
  res.json({ success: true, data: loans });
});

const createLoan = catchAsync(async (req, res) => {
  const loan = await LoanMaster.create({ entity_id: req.entityId, ...req.body });
  res.status(201).json({ success: true, data: loan });
});

const computeInterestEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  if (!period) return res.status(400).json({ success: false, message: 'Period required' });
  const result = await computeInterest(req.entityId, period);
  res.json({ success: true, data: result });
});

const getInterestStagingEndpoint = catchAsync(async (req, res) => {
  const data = await getInterestStaging(req.entityId, req.params.period);
  res.json({ success: true, data });
});

const approveInterestEndpoint = catchAsync(async (req, res) => {
  const { entry_ids } = req.body;
  const result = await approveInterest(req.entityId, entry_ids, req.user._id);
  res.json({ success: true, data: result });
});

const postInterestEndpoint = catchAsync(async (req, res) => {
  const { period } = req.body;
  const result = await postInterest(req.entityId, period, req.user._id);
  res.json({ success: true, data: result });
});

// ═══════════════════════════════════════════════════════════
// OWNER EQUITY
// ═══════════════════════════════════════════════════════════

const recordInfusionEndpoint = catchAsync(async (req, res) => {
  const result = await recordInfusion(req.entityId, req.body, req.user._id);
  res.status(201).json({ success: true, data: result });
});

const recordDrawingEndpoint = catchAsync(async (req, res) => {
  const result = await recordDrawing(req.entityId, req.body, req.user._id);
  res.status(201).json({ success: true, data: result });
});

const getEquityLedgerEndpoint = catchAsync(async (req, res) => {
  const data = await getEquityLedger(req.entityId);
  res.json({ success: true, data });
});

module.exports = {
  // Journals
  createManualJournal, listJournals, getJournalById, postJournalEndpoint, reverseJournalEndpoint,
  // GL
  getGeneralLedgerEndpoint,
  // Trial Balance
  getTrialBalance,
  // P&L
  getPnl, getVatReturnEndpoint, getCwtSummaryEndpoint,
  // VAT
  getVatLedgerEndpoint, tagVatEntryEndpoint,
  // CWT
  getCwtLedgerEndpoint,
  // Cashflow
  getCashflowEndpoint,
  // Fixed Assets
  listFixedAssets, createFixedAsset, computeDepreciationEndpoint,
  getDepreciationStagingEndpoint, approveDepreciationEndpoint, postDepreciationEndpoint,
  // Loans
  listLoans, createLoan, computeInterestEndpoint,
  getInterestStagingEndpoint, approveInterestEndpoint, postInterestEndpoint,
  // Owner Equity
  recordInfusionEndpoint, recordDrawingEndpoint, getEquityLedgerEndpoint
};
