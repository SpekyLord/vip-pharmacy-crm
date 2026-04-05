/**
 * Accounting Controller — HTTP layer for all Phase 11 accounting endpoints
 *
 * Journals, Trial Balance, P&L, VAT/CWT, Cashflow,
 * Fixed Assets, Loans, Owner Equity, General Ledger
 */
const mongoose = require('mongoose');
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
const XLSX = require('xlsx');

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

const batchPostJournals = catchAsync(async (req, res) => {
  const { je_ids } = req.body;
  if (!Array.isArray(je_ids) || !je_ids.length) {
    return res.status(400).json({ success: false, message: 'je_ids array required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const results = [];
    for (const id of je_ids) {
      const je = await JournalEntry.findOne({ _id: id, entity_id: req.entityId }).session(session);
      if (!je) { results.push({ id, success: false, reason: 'Not found' }); continue; }
      if (je.status !== 'DRAFT') { results.push({ id, je_number: je.je_number, success: false, reason: `Status is ${je.status}` }); continue; }
      je.status = 'POSTED';
      je.posted_by = req.user._id;
      je.posted_at = new Date();
      await je.save({ session });
      results.push({ id, je_number: je.je_number, success: true });
    }

    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: `Batch post failed: ${failures.length} error(s)`, data: { results } });
    }

    await session.commitTransaction();
    res.json({ success: true, message: `${results.length} journal entries posted`, data: { posted: results.length, results } });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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

// ═══ Export Fixed Assets (Excel) ═══
const exportFixedAssets = catchAsync(async (req, res) => {
  const assets = await FixedAsset.find({ entity_id: req.entityId }).sort({ asset_code: 1 }).lean();
  const rows = assets.map(a => ({
    'Asset Code': a.asset_code,
    'Asset Name': a.asset_name,
    'Category': a.category || '',
    'Acquisition Date': a.acquisition_date ? new Date(a.acquisition_date).toISOString().slice(0, 10) : '',
    'Acquisition Cost': a.acquisition_cost || 0,
    'Useful Life (Months)': a.useful_life_months || 0,
    'Salvage Value': a.salvage_value || 0,
    'Depreciation Method': a.depreciation_method || 'STRAIGHT_LINE',
    'Accumulated Depreciation': a.accumulated_depreciation || 0,
    'Net Book Value': a.net_book_value || 0,
    'Status': a.status || 'ACTIVE'
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Fixed Assets');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="fixed-assets-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Fixed Assets (Excel) — upsert by asset_code ═══
const importFixedAssets = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let created = 0, updated = 0, errors = [];
  for (const r of rows) {
    const asset_code = String(r['Asset Code'] || r.asset_code || '').trim();
    const asset_name = String(r['Asset Name'] || r.asset_name || '').trim();
    if (!asset_code || !asset_name) { errors.push({ asset_code: asset_code || '(empty)', error: 'Code and Name required' }); continue; }
    try {
      const result = await FixedAsset.findOneAndUpdate(
        { entity_id: req.entityId, asset_code },
        {
          entity_id: req.entityId, asset_code, asset_name,
          category: String(r['Category'] || r.category || '').trim() || undefined,
          acquisition_date: r['Acquisition Date'] ? new Date(r['Acquisition Date']) : undefined,
          acquisition_cost: r['Acquisition Cost'] != null ? Number(r['Acquisition Cost']) : 0,
          useful_life_months: r['Useful Life (Months)'] != null ? Number(r['Useful Life (Months)']) : 60,
          salvage_value: r['Salvage Value'] != null ? Number(r['Salvage Value']) : 0,
          depreciation_method: String(r['Depreciation Method'] || 'STRAIGHT_LINE').trim().toUpperCase(),
          status: String(r['Status'] || 'ACTIVE').trim().toUpperCase()
        },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) { errors.push({ asset_code, error: err.message }); }
  }
  res.json({ success: true, message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`, data: { created, updated, errors } });
});

// ═══ Export Loans (Excel) ═══
const exportLoans = catchAsync(async (req, res) => {
  const loans = await LoanMaster.find({ entity_id: req.entityId }).sort({ loan_code: 1 }).lean();
  const rows = loans.map(l => ({
    'Loan Code': l.loan_code,
    'Lender': l.lender || '',
    'Purpose': l.purpose || '',
    'Principal': l.principal || 0,
    'Annual Rate (%)': l.annual_rate || 0,
    'Term (Months)': l.term_months || 0,
    'Start Date': l.start_date ? new Date(l.start_date).toISOString().slice(0, 10) : '',
    'Monthly Payment': l.monthly_payment || 0,
    'Outstanding Balance': l.outstanding_balance || 0,
    'Status': l.status || 'ACTIVE'
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 25 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Loans');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="loans-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Loans (Excel) — upsert by loan_code ═══
const importLoans = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let created = 0, updated = 0, errors = [];
  for (const r of rows) {
    const loan_code = String(r['Loan Code'] || r.loan_code || '').trim();
    if (!loan_code) { errors.push({ loan_code: '(empty)', error: 'Loan code required' }); continue; }
    try {
      const result = await LoanMaster.findOneAndUpdate(
        { entity_id: req.entityId, loan_code },
        {
          entity_id: req.entityId, loan_code,
          lender: String(r['Lender'] || r.lender || '').trim() || undefined,
          purpose: String(r['Purpose'] || r.purpose || '').trim() || undefined,
          principal: r['Principal'] != null ? Number(r['Principal']) : 0,
          annual_rate: r['Annual Rate (%)'] != null ? Number(r['Annual Rate (%)']) : 0,
          term_months: r['Term (Months)'] != null ? Number(r['Term (Months)']) : 0,
          start_date: r['Start Date'] ? new Date(r['Start Date']) : undefined,
          status: String(r['Status'] || 'ACTIVE').trim().toUpperCase()
        },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) { errors.push({ loan_code, error: err.message }); }
  }
  res.json({ success: true, message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`, data: { created, updated, errors } });
});

module.exports = {
  // Journals
  createManualJournal, listJournals, getJournalById, postJournalEndpoint, reverseJournalEndpoint, batchPostJournals,
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
  exportFixedAssets, importFixedAssets,
  // Loans
  listLoans, createLoan, computeInterestEndpoint,
  getInterestStagingEndpoint, approveInterestEndpoint, postInterestEndpoint,
  exportLoans, importLoans,
  // Owner Equity
  recordInfusionEndpoint, recordDrawingEndpoint, getEquityLedgerEndpoint
};
