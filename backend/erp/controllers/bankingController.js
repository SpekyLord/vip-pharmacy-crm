/**
 * Banking Controller — Bank account CRUD, statement import, reconciliation, credit card ledger & payments
 */
const BankAccount = require('../models/BankAccount');
const BankStatement = require('../models/BankStatement');
const CreditCardTransaction = require('../models/CreditCardTransaction');
const bankReconService = require('../services/bankReconService');
const creditCardService = require('../services/creditCardService');
const { catchAsync } = require('../../middleware/errorHandler');
const XLSX = require('xlsx');
const { safeXlsxRead } = require('../../utils/safeXlsxRead');
const { validateCoaCode } = require('../utils/validateCoaCode');

// ════════════════════════════════════════════════════════════════════
//  BANK ACCOUNTS
// ════════════════════════════════════════════════════════════════════

const listBankAccounts = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.is_active !== undefined) filter.is_active = req.query.is_active === 'true';

  const accounts = await BankAccount.find(filter).sort({ bank_code: 1 }).lean();
  res.json({ success: true, data: accounts });
});

const createBankAccount = catchAsync(async (req, res) => {
  // Validate COA code
  if (req.body.coa_code) {
    const coaCheck = await validateCoaCode(req.body.coa_code, req.entityId);
    if (!coaCheck.valid) return res.status(400).json({ success: false, message: coaCheck.message });
  }
  const account = await BankAccount.create({
    entity_id: req.entityId,
    bank_code: req.body.bank_code,
    bank_name: req.body.bank_name,
    account_no: req.body.account_no,
    account_type: req.body.account_type,
    coa_code: req.body.coa_code,
    opening_balance: req.body.opening_balance || 0,
    current_balance: req.body.opening_balance || 0,
    statement_import_format: req.body.statement_import_format || 'CSV',
    is_active: true
  });
  res.status(201).json({ success: true, data: account });
});

const updateBankAccount = catchAsync(async (req, res) => {
  const account = await BankAccount.findOne({ _id: req.params.id, entity_id: req.entityId });
  if (!account) return res.status(404).json({ success: false, message: 'Bank account not found' });

  // Validate COA code if being updated
  if (req.body.coa_code) {
    const coaCheck = await validateCoaCode(req.body.coa_code, req.entityId);
    if (!coaCheck.valid) return res.status(400).json({ success: false, message: coaCheck.message });
  }

  const allowed = ['bank_name', 'account_no', 'account_type', 'coa_code', 'opening_balance', 'statement_import_format', 'is_active', 'assigned_users'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) account[field] = req.body[field];
  }

  await account.save();
  res.json({ success: true, data: account });
});

// ════════════════════════════════════════════════════════════════════
//  BANK STATEMENTS & RECONCILIATION
// ════════════════════════════════════════════════════════════════════

const importStatement = catchAsync(async (req, res) => {
  const { bank_account_id, statement_date, period, entries, closing_balance } = req.body;

  if (!bank_account_id || !period || !entries || !Array.isArray(entries)) {
    return res.status(400).json({ success: false, message: 'bank_account_id, period, and entries[] are required' });
  }

  const statement = await bankReconService.importStatement(
    req.entityId, bank_account_id, statement_date || new Date(), period, entries, closing_balance, req.user._id
  );

  res.status(201).json({ success: true, data: statement });
});

const listStatements = catchAsync(async (req, res) => {
  const filter = { entity_id: req.entityId };
  if (req.query.bank_account_id) filter.bank_account_id = req.query.bank_account_id;
  if (req.query.period) filter.period = req.query.period;
  if (req.query.status) filter.status = req.query.status;

  const statements = await BankStatement.find(filter)
    .populate('bank_account_id', 'bank_code bank_name')
    .populate('uploaded_by', 'name')
    .sort({ period: -1 })
    .lean();

  // Add summary counts
  const data = statements.map(s => ({
    ...s,
    entry_count: s.entries?.length || 0,
    matched_count: s.entries?.filter(e => e.match_status === 'MATCHED').length || 0
  }));

  res.json({ success: true, data });
});

const getStatement = catchAsync(async (req, res) => {
  const statement = await BankStatement.findOne({ _id: req.params.id, entity_id: req.entityId })
    .populate('bank_account_id', 'bank_code bank_name coa_code')
    .populate('uploaded_by', 'name')
    .lean();

  if (!statement) return res.status(404).json({ success: false, message: 'Statement not found' });
  res.json({ success: true, data: statement });
});

const autoMatchStatement = catchAsync(async (req, res) => {
  const result = await bankReconService.autoMatch(req.params.id);
  res.json({ success: true, data: result });
});

const manualMatchEntry = catchAsync(async (req, res) => {
  const { entryIndex, jeId } = req.body;
  if (entryIndex === undefined || !jeId) {
    return res.status(400).json({ success: false, message: 'entryIndex and jeId are required' });
  }

  const entry = await bankReconService.manualMatch(req.params.id, entryIndex, jeId);
  res.json({ success: true, data: entry });
});

const getReconSummary = catchAsync(async (req, res) => {
  const summary = await bankReconService.getReconSummary(req.params.id);
  res.json({ success: true, data: summary });
});

const finalizeRecon = catchAsync(async (req, res) => {
  const result = await bankReconService.finalizeRecon(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

// ════════════════════════════════════════════════════════════════════
//  CREDIT CARD TRANSACTIONS & PAYMENTS
// ════════════════════════════════════════════════════════════════════

const getCardBalances = catchAsync(async (req, res) => {
  const data = await creditCardService.getAllCardBalances(req.entityId);
  res.json({ success: true, data });
});

const getCardLedger = catchAsync(async (req, res) => {
  const data = await creditCardService.getCardLedger(req.entityId, req.params.id, req.query.period);
  res.json({ success: true, data });
});

const createCreditCardTransaction = catchAsync(async (req, res) => {
  const txn = await CreditCardTransaction.create({
    entity_id: req.entityId,
    credit_card_id: req.body.credit_card_id,
    txn_date: req.body.txn_date,
    description: req.body.description,
    amount: req.body.amount,
    reference: req.body.reference,
    linked_expense_id: req.body.linked_expense_id || null,
    linked_calf_id: req.body.linked_calf_id || null,
    status: req.body.status || 'PENDING',
    created_by: req.user._id
  });
  res.status(201).json({ success: true, data: txn });
});

const recordCardPayment = catchAsync(async (req, res) => {
  const { amount, bank_account_id, payment_date } = req.body;
  if (!amount || !bank_account_id) {
    return res.status(400).json({ success: false, message: 'amount and bank_account_id are required' });
  }

  const result = await creditCardService.recordCardPayment(
    req.entityId, req.params.id, Number(amount), bank_account_id, payment_date ? new Date(payment_date) : new Date(), req.user._id
  );

  res.json({ success: true, data: result });
});

// ═══ Export Bank Accounts (Excel) ═══
const exportBankAccounts = catchAsync(async (req, res) => {
  const accounts = await BankAccount.find({ entity_id: req.entityId }).sort({ bank_code: 1 }).lean();
  const rows = accounts.map(a => ({
    'Bank Code': a.bank_code || '',
    'Bank Name': a.bank_name || '',
    'Account No': a.account_no || '',
    'Account Type': a.account_type || '',
    'COA Code': a.coa_code || '',
    'Opening Balance': a.opening_balance || 0,
    'Current Balance': a.current_balance || 0,
    'Import Format': a.statement_import_format || 'CSV',
    'Active': a.is_active !== false ? 'YES' : 'NO'
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Bank Accounts');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="bank-accounts-export.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ═══ Import Bank Accounts (Excel) — upsert by bank_code ═══
const importBankAccounts = catchAsync(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Upload an Excel file' });
  const wb = safeXlsxRead(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  let created = 0, updated = 0, errors = [];
  for (const r of rows) {
    const bank_code = String(r['Bank Code'] || r.bank_code || '').trim();
    if (!bank_code) { errors.push({ bank_code: '(empty)', error: 'Bank code required' }); continue; }
    try {
      const coaCode = String(r['COA Code'] || r.coa_code || '').trim() || undefined;
      if (coaCode) {
        const coaCheck = await validateCoaCode(coaCode, req.entityId);
        if (!coaCheck.valid) { errors.push({ bank_code, error: coaCheck.message }); continue; }
      }
      const result = await BankAccount.findOneAndUpdate(
        { entity_id: req.entityId, bank_code },
        {
          entity_id: req.entityId, bank_code,
          bank_name: String(r['Bank Name'] || r.bank_name || '').trim(),
          account_no: String(r['Account No'] || r.account_no || '').trim(),
          account_type: String(r['Account Type'] || r.account_type || 'SAVINGS').trim().toUpperCase(),
          coa_code: coaCode,
          opening_balance: r['Opening Balance'] != null ? Number(r['Opening Balance']) : 0,
          statement_import_format: String(r['Import Format'] || r.statement_import_format || 'CSV').trim().toUpperCase(),
          is_active: String(r['Active'] || 'YES').toUpperCase() !== 'NO'
        },
        { upsert: true, new: true }
      );
      if (result.createdAt && result.updatedAt && result.createdAt.getTime() === result.updatedAt.getTime()) created++;
      else updated++;
    } catch (err) { errors.push({ bank_code, error: err.message }); }
  }
  res.json({ success: true, message: `Import complete: ${created} created, ${updated} updated, ${errors.length} errors`, data: { created, updated, errors } });
});

module.exports = {
  listBankAccounts, createBankAccount, updateBankAccount, exportBankAccounts, importBankAccounts,
  importStatement, listStatements, getStatement, autoMatchStatement, manualMatchEntry, getReconSummary, finalizeRecon,
  getCardBalances, getCardLedger, createCreditCardTransaction, recordCardPayment
};
