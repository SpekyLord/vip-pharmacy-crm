/**
 * Auto-Journal Service — generates JE data from source documents
 *
 * PRD v5 §11.3 — Each function returns a JE data object (not persisted).
 * The caller (monthEndClose or controller) creates+posts via journalEngine.
 *
 * Phase 22: All COA codes are read from Settings.COA_MAP (configurable).
 * Use getCoaMap() to load the mapping — cached per process lifetime until settings change.
 */

const BankAccount = require('../models/BankAccount');
const CreditCard = require('../models/CreditCard');
const PaymentMode = require('../models/PaymentMode');
const Settings = require('../models/Settings');

// ═══ COA Map Cache ═══
let _coaCache = null;
let _coaCacheTime = 0;
const COA_CACHE_TTL = 60_000; // 1 minute

async function getCoaMap() {
  const now = Date.now();
  if (_coaCache && now - _coaCacheTime < COA_CACHE_TTL) return _coaCache;
  const settings = await Settings.getSettings();
  _coaCache = settings.COA_MAP || {};
  _coaCacheTime = now;
  return _coaCache;
}

// Helper for COA name lookup (avoids stale names by using code as key)
const COA_NAMES = {
  AR_TRADE: 'Accounts Receivable — Trade',
  AR_BDM: 'AR — BDM Advances',
  IC_RECEIVABLE: 'Intercompany Receivable',
  CASH_ON_HAND: 'Cash on Hand',
  PETTY_CASH: 'Petty Cash Fund',
  INVENTORY: 'Inventory',
  INPUT_VAT: 'Input VAT',
  CWT_RECEIVABLE: 'CWT Receivable',
  ACCUM_DEPRECIATION: 'Accumulated Depreciation',
  AP_TRADE: 'Accounts Payable — Trade',
  IC_PAYABLE: 'Intercompany Payable',
  OUTPUT_VAT: 'Output VAT',
  LOANS_PAYABLE: 'Loans Payable',
  OWNER_CAPITAL: 'Owner Capital',
  OWNER_DRAWINGS: 'Owner Drawings',
  SALES_REVENUE: 'Sales Revenue — Vatable',
  SERVICE_REVENUE: 'Service Revenue',
  INTEREST_INCOME: 'Interest Income',
  COGS: 'Cost of Goods Sold',
  BDM_COMMISSION: 'BDM Commission',
  PARTNER_REBATE: 'Partner Rebate Expense',
  PER_DIEM: 'Per Diem Expense',
  TRANSPORT: 'Transport Expense',
  SPECIAL_TRANSPORT: 'Special Transport Expense',
  OTHER_REIMBURSABLE: 'Other Reimbursable Expense',
  FUEL_GAS: 'Fuel & Gas Expense',
  INVENTORY_WRITEOFF: 'Inventory Write-Off',
  INVENTORY_ADJ_GAIN: 'Inventory Adjustment Gain',
  MISC_EXPENSE: 'Miscellaneous Expense',
  DEPRECIATION: 'Depreciation Expense',
  INTEREST_EXPENSE: 'Interest Expense',
  INTEREST_PAYABLE: 'Interest Payable',
  BANK_CHARGES: 'Bank Charges',
  // Payroll
  SALARIES_WAGES: 'Salaries & Wages',
  ALLOWANCES: 'Allowances',
  BONUS_13TH: 'Bonus & 13th Month',
  SSS_PAYABLE: 'SSS Payable',
  PHILHEALTH_PAYABLE: 'PhilHealth Payable',
  PAGIBIG_PAYABLE: 'Pag-IBIG Payable',
  WHT_PAYABLE: 'Withholding Tax Payable',
};

/** Clear cached COA_MAP — call after Settings update */
function clearCoaCache() { _coaCache = null; _coaCacheTime = 0; }

function c(coa, key) { return coa[key] || '9999'; }
function n(key) { return COA_NAMES[key] || key; }

/**
 * Helper: format period from Date
 */
function dateToPeriod(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Resolve COA code from funding references.
 * Priority: funding_card_id → funding_account_id → bank_account_id → payment_mode lookup → fallback
 */
async function resolveFundingCoa(doc, fallback) {
  const coa = await getCoaMap();
  const fb = fallback || c(coa, 'CASH_ON_HAND');

  if (doc.funding_card_id) {
    const card = await CreditCard.findById(doc.funding_card_id).lean();
    if (card?.coa_code) return { coa_code: card.coa_code, coa_name: card.card_name };
  }

  const bankRef = doc.funding_account_id || doc.bank_account_id;
  if (bankRef) {
    const bank = await BankAccount.findById(bankRef).lean();
    if (bank?.coa_code) return { coa_code: bank.coa_code, coa_name: bank.bank_name };
  }

  if (doc.payment_mode) {
    const pm = await PaymentMode.findOne({ mode_code: doc.payment_mode }).lean()
      || await PaymentMode.findOne({ mode_type: doc.payment_mode }).lean();
    if (pm?.coa_code) return { coa_code: pm.coa_code, coa_name: pm.mode_label };
  }

  return { coa_code: fb, coa_name: fallback ? `Account ${fb}` : n('CASH_ON_HAND') };
}

/**
 * Journal from Sales Line
 * DR AR_TRADE (gross), CR SALES_REVENUE (net), CR OUTPUT_VAT (vat)
 */
async function journalFromSale(salesLine, entityId, userId) {
  const coa = await getCoaMap();
  const gross = salesLine.total_amount || salesLine.invoice_total || 0;
  const vat = salesLine.total_vat || 0;
  const net = gross - vat;

  // Skip journal for zero-amount sales (complimentary/samples)
  if (gross === 0) return null;

  // CSI sales carry the booklet# in `doc_ref`; SERVICE_INVOICE/CASH_RECEIPT use
  // auto-generated `invoice_number`. Without this priority the JE falls back to
  // the raw ObjectId for every CSI, which is what users see in the detail panel.
  const docRef = salesLine.doc_ref || salesLine.invoice_number || String(salesLine._id);
  const saleLabel = salesLine.sale_type === 'SERVICE_INVOICE' ? 'SI'
    : salesLine.sale_type === 'CASH_RECEIPT' ? 'CR' : 'CSI';

  // Direct cash routing: DR PETTY_CASH instead of DR AR_TRADE when fund is set
  const debitCode = salesLine.petty_cash_fund_id && salesLine.payment_mode === 'CASH'
    ? c(coa, 'PETTY_CASH') : c(coa, 'AR_TRADE');
  const debitName = salesLine.petty_cash_fund_id && salesLine.payment_mode === 'CASH'
    ? n('PETTY_CASH') : n('AR_TRADE');

  const lines = [
    { account_code: debitCode, account_name: debitName, debit: gross, credit: 0, description: `${saleLabel} ${docRef}` },
    { account_code: c(coa, 'SALES_REVENUE'), account_name: n('SALES_REVENUE'), debit: 0, credit: net, description: `${saleLabel} ${docRef}` },
  ];

  if (vat > 0) {
    lines.push({ account_code: c(coa, 'OUTPUT_VAT'), account_name: n('OUTPUT_VAT'), debit: 0, credit: vat, description: `VAT on ${saleLabel} ${docRef}` });
  }

  return {
    je_date: salesLine.csi_date || salesLine.created_at || new Date(),
    period: dateToPeriod(salesLine.csi_date || salesLine.created_at || new Date()),
    description: `${saleLabel} ${docRef} — ${gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    source_module: 'SALES',
    source_event_id: salesLine.event_id || null,
    source_doc_ref: docRef,
    lines,
    bir_flag: 'BOTH',
    vat_flag: vat > 0 ? 'VATABLE' : 'EXEMPT',
    bdm_id: salesLine.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Collection
 * DR Cash/Bank (resolved), CR AR_TRADE
 */
async function journalFromCollection(collection, bankCoaCode, bankName, userId) {
  const coa = await getCoaMap();
  const amount = collection.cr_amount || 0;

  let coaCode, coaName;
  if (collection.petty_cash_fund_id) {
    coaCode = c(coa, 'PETTY_CASH');
    coaName = n('PETTY_CASH');
  } else {
    coaCode = bankCoaCode || c(coa, 'CASH_ON_HAND');
    coaName = bankName || n('CASH_ON_HAND');
  }

  return {
    je_date: collection.cr_date || collection.created_at || new Date(),
    period: dateToPeriod(collection.cr_date || collection.created_at || new Date()),
    description: `Collection: ${collection.cr_no || collection._id}`,
    source_module: 'COLLECTION',
    source_event_id: collection.event_id || null,
    source_doc_ref: collection.cr_no || String(collection._id),
    lines: [
      { account_code: coaCode, account_name: coaName, debit: amount, credit: 0, description: `Collection ${collection.cr_no || ''}` },
      { account_code: c(coa, 'AR_TRADE'), account_name: n('AR_TRADE'), debit: 0, credit: amount, description: `Collection ${collection.cr_no || ''}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: collection.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from CWT
 * DR CWT_RECEIVABLE, CR AR_TRADE
 */
async function journalFromCWT(cwtEntry, userId) {
  const coa = await getCoaMap();
  const amount = cwtEntry.cwt_amount || 0;

  // hospital_name may be provided by caller; fall back to hospital_id string
  const hospLabel = cwtEntry.hospital_name || (cwtEntry.hospital_id ? String(cwtEntry.hospital_id) : '');

  return {
    je_date: cwtEntry.cr_date || new Date(),
    period: dateToPeriod(cwtEntry.cr_date || new Date()),
    description: `CWT: CR#${cwtEntry.cr_no || ''} — ${hospLabel}`,
    source_module: 'COLLECTION',
    source_event_id: cwtEntry.event_id || null,
    source_doc_ref: cwtEntry.cr_no || String(cwtEntry._id),
    lines: [
      { account_code: c(coa, 'CWT_RECEIVABLE'), account_name: n('CWT_RECEIVABLE'), debit: amount, credit: 0, description: `CWT CR#${cwtEntry.cr_no || ''}` },
      { account_code: c(coa, 'AR_TRADE'), account_name: n('AR_TRADE'), debit: 0, credit: amount, description: `CWT CR#${cwtEntry.cr_no || ''}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: cwtEntry.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Expense
 * DR 6XXX Expense, CR AR_BDM or AP/Bank
 */
async function journalFromExpense(expense, expenseCoaCode, expenseCoaName, creditCoaCode, creditCoaName, userId) {
  const coa = await getCoaMap();
  const amount = expense.total_amount || expense.amount || 0;

  return {
    je_date: expense.expense_date || expense.date || expense.created_at || new Date(),
    period: dateToPeriod(expense.expense_date || expense.date || expense.created_at || new Date()),
    description: `Expense: ${expense.doc_number || expense._id}`,
    source_module: 'EXPENSE',
    source_event_id: expense.event_id || null,
    source_doc_ref: expense.doc_number || String(expense._id),
    lines: [
      { account_code: expenseCoaCode || c(coa, 'MISC_EXPENSE'), account_name: expenseCoaName || n('MISC_EXPENSE'), debit: amount, credit: 0, description: expense.description || '' },
      { account_code: creditCoaCode || c(coa, 'AR_BDM'), account_name: creditCoaName || n('AR_BDM'), debit: 0, credit: amount, description: expense.description || '' }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: expense.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Commission
 * DR BDM_COMMISSION, CR AR_BDM
 */
async function journalFromCommission(commission, userId) {
  const coa = await getCoaMap();
  const amount = commission.amount || 0;

  return {
    je_date: commission.date || new Date(),
    period: dateToPeriod(commission.date || new Date()),
    description: `Commission: ${commission.bdm_name || ''} — ${commission.period || ''}`,
    source_module: 'COMMISSION',
    source_event_id: commission.event_id || null,
    source_doc_ref: String(commission._id),
    lines: [
      { account_code: c(coa, 'BDM_COMMISSION'), account_name: n('BDM_COMMISSION'), debit: amount, credit: 0, description: `Commission ${commission.bdm_name || ''}` },
      { account_code: c(coa, 'AR_BDM'), account_name: n('AR_BDM'), debit: 0, credit: amount, description: `Commission ${commission.bdm_name || ''}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: commission.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Payroll
 * DR 6000 Salaries + DR 6050 Allowances + DR 5100 Commission
 * CR 2200 SSS + CR 2210 PhilHealth + CR 2220 PagIBIG + CR 2230 WHT + CR Cash/Bank
 */
async function journalFromPayroll(payslip, bankCoaCode, bankName, userId) {
  const coa = await getCoaMap();
  const lines = [];

  const e = payslip.earnings || {};
  const basic = e.basic_salary || 0;
  const overtime = e.overtime || 0;
  const allowance = (e.rice_allowance || 0) + (e.clothing_allowance || 0) +
    (e.medical_allowance || 0) + (e.laundry_allowance || 0) + (e.transport_allowance || 0);
  const commission = e.incentive || 0;
  const bonus = (e.bonus || 0) + (e.thirteenth_month || 0) + (e.holiday_pay || 0) + (e.night_diff || 0);

  // Debit side — expense accounts from COA_MAP (configurable via Settings)
  if (basic + overtime > 0) lines.push({ account_code: c(coa, 'SALARIES_WAGES'), account_name: n('SALARIES_WAGES'), debit: basic + overtime, credit: 0, description: 'Basic salary + OT' });
  if (allowance > 0) lines.push({ account_code: c(coa, 'ALLOWANCES'), account_name: n('ALLOWANCES'), debit: allowance, credit: 0, description: 'Allowances / de minimis' });
  if (commission > 0) lines.push({ account_code: c(coa, 'BDM_COMMISSION'), account_name: n('BDM_COMMISSION'), debit: commission, credit: 0, description: 'Incentive / Commission' });
  if (bonus > 0) lines.push({ account_code: c(coa, 'BONUS_13TH'), account_name: n('BONUS_13TH'), debit: bonus, credit: 0, description: 'Bonus / 13th month / holiday' });

  // Credit side — statutory deductions from COA_MAP (configurable via Settings)
  const d = payslip.deductions || {};
  const sss = d.sss_employee || 0;
  const philhealth = d.philhealth_employee || 0;
  const pagibig = d.pagibig_employee || 0;
  const tax = d.withholding_tax || 0;

  if (sss > 0) lines.push({ account_code: c(coa, 'SSS_PAYABLE'), account_name: n('SSS_PAYABLE'), debit: 0, credit: sss, description: 'SSS EE share' });
  if (philhealth > 0) lines.push({ account_code: c(coa, 'PHILHEALTH_PAYABLE'), account_name: n('PHILHEALTH_PAYABLE'), debit: 0, credit: philhealth, description: 'PhilHealth EE share' });
  if (pagibig > 0) lines.push({ account_code: c(coa, 'PAGIBIG_PAYABLE'), account_name: n('PAGIBIG_PAYABLE'), debit: 0, credit: pagibig, description: 'Pag-IBIG EE share' });
  if (tax > 0) lines.push({ account_code: c(coa, 'WHT_PAYABLE'), account_name: n('WHT_PAYABLE'), debit: 0, credit: tax, description: 'WHT' });

  const netPay = payslip.net_pay || 0;
  if (netPay > 0) {
    lines.push({
      account_code: bankCoaCode || c(coa, 'CASH_ON_HAND'),
      account_name: bankName || n('CASH_ON_HAND'),
      debit: 0,
      credit: netPay,
      description: 'Net pay disbursement'
    });
  }

  return {
    je_date: payslip.pay_date || payslip.created_at || new Date(),
    period: payslip.period || dateToPeriod(payslip.pay_date || new Date()),
    description: `Payroll: ${payslip.employee_name || ''} — ${payslip.period || ''}`,
    source_module: 'PAYROLL',
    source_event_id: payslip.event_id || null,
    source_doc_ref: String(payslip._id),
    lines,
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: payslip.person_id || payslip.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Accounts Payable (Supplier Invoice)
 * DR INVENTORY + DR INPUT_VAT, CR AP_TRADE
 */
async function journalFromAP(supplierInvoice, userId) {
  const coa = await getCoaMap();
  const net = supplierInvoice.net_amount || supplierInvoice.total_amount || 0;
  const vat = supplierInvoice.input_vat || supplierInvoice.vat_amount || 0;
  const gross = net + vat;

  const lines = [
    { account_code: c(coa, 'INVENTORY'), account_name: n('INVENTORY'), debit: net, credit: 0, description: `PO: ${supplierInvoice.po_number || ''}` },
  ];
  if (vat > 0) {
    lines.push({ account_code: c(coa, 'INPUT_VAT'), account_name: n('INPUT_VAT'), debit: vat, credit: 0, description: `Input VAT on ${supplierInvoice.invoice_ref || ''}` });
  }
  lines.push({ account_code: c(coa, 'AP_TRADE'), account_name: n('AP_TRADE'), debit: 0, credit: gross, description: `SI: ${supplierInvoice.invoice_ref || ''}` });

  return {
    je_date: supplierInvoice.invoice_date || new Date(),
    period: dateToPeriod(supplierInvoice.invoice_date || new Date()),
    description: `AP: ${supplierInvoice.vendor_name || ''} — ${supplierInvoice.invoice_ref || ''}`,
    source_module: 'AP',
    source_event_id: supplierInvoice.event_id || null,
    source_doc_ref: supplierInvoice.invoice_ref || String(supplierInvoice._id),
    lines,
    bir_flag: 'BOTH',
    vat_flag: vat > 0 ? 'VATABLE' : 'EXEMPT',
    bdm_id: null,
    created_by: userId
  };
}

/**
 * Journal from Depreciation
 * DR DEPRECIATION, CR ACCUM_DEPRECIATION
 */
async function journalFromDepreciation(deprnEntry, userId) {
  const coa = await getCoaMap();
  const amount = deprnEntry.amount || 0;

  return {
    je_date: deprnEntry.date || new Date(),
    period: deprnEntry.period || dateToPeriod(deprnEntry.date || new Date()),
    description: `Depreciation: ${deprnEntry.asset_name || ''} — ${deprnEntry.period || ''}`,
    source_module: 'DEPRECIATION',
    source_doc_ref: String(deprnEntry.asset_id || deprnEntry._id),
    lines: [
      { account_code: c(coa, 'DEPRECIATION'), account_name: n('DEPRECIATION'), debit: amount, credit: 0, description: deprnEntry.asset_name || '' },
      { account_code: c(coa, 'ACCUM_DEPRECIATION'), account_name: n('ACCUM_DEPRECIATION'), debit: 0, credit: amount, description: deprnEntry.asset_name || '' }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };
}

/**
 * Journal from Interest (Loan)
 * DR INTEREST_EXPENSE, CR INTEREST_PAYABLE (accrued liability)
 */
async function journalFromInterest(interestEntry, userId) {
  const coa = await getCoaMap();
  const amount = interestEntry.interest_amount || 0;

  return {
    je_date: interestEntry.date || new Date(),
    period: interestEntry.period || dateToPeriod(interestEntry.date || new Date()),
    description: `Interest: ${interestEntry.loan_code || ''} — ${interestEntry.period || ''}`,
    source_module: 'INTEREST',
    source_doc_ref: String(interestEntry.loan_id || interestEntry._id),
    lines: [
      { account_code: c(coa, 'INTEREST_EXPENSE'), account_name: n('INTEREST_EXPENSE'), debit: amount, credit: 0, description: interestEntry.loan_code || '' },
      { account_code: c(coa, 'INTEREST_PAYABLE'), account_name: n('INTEREST_PAYABLE'), debit: 0, credit: amount, description: interestEntry.loan_code || '' }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };
}

/**
 * Journal from Owner Equity (infusion or drawing)
 * INFUSION: DR Cash/Bank, CR OWNER_CAPITAL
 * DRAWING:  DR OWNER_DRAWINGS, CR Cash/Bank
 */
async function journalFromOwnerEquity(equityEntry, bankCoaCode, bankName, userId) {
  const coa = await getCoaMap();
  const amount = equityEntry.amount || 0;
  const coaCode = bankCoaCode || '1010';
  const coaName = bankName || 'RCBC Savings';

  if (equityEntry.entry_type === 'INFUSION') {
    return {
      je_date: equityEntry.entry_date || new Date(),
      period: dateToPeriod(equityEntry.entry_date || new Date()),
      description: `Owner Infusion: ${equityEntry.description || ''}`,
      source_module: 'OWNER',
      source_doc_ref: String(equityEntry._id),
      lines: [
        { account_code: coaCode, account_name: coaName, debit: amount, credit: 0, description: 'Owner infusion' },
        { account_code: c(coa, 'OWNER_CAPITAL'), account_name: n('OWNER_CAPITAL'), debit: 0, credit: amount, description: 'Owner infusion' }
      ],
      bir_flag: equityEntry.bir_flag || 'BOTH',
      vat_flag: 'N/A',
      created_by: userId
    };
  }

  return {
    je_date: equityEntry.entry_date || new Date(),
    period: dateToPeriod(equityEntry.entry_date || new Date()),
    description: `Owner Drawing: ${equityEntry.description || ''}`,
    source_module: 'OWNER',
    source_doc_ref: String(equityEntry._id),
    lines: [
      { account_code: c(coa, 'OWNER_DRAWINGS'), account_name: n('OWNER_DRAWINGS'), debit: amount, credit: 0, description: 'Owner drawing' },
      { account_code: coaCode, account_name: coaName, debit: 0, credit: amount, description: 'Owner drawing' }
    ],
    bir_flag: equityEntry.bir_flag || 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };
}

/**
 * Journal from Service Revenue (Phase 18)
 * DR AR_TRADE, CR SERVICE_REVENUE, CR OUTPUT_VAT
 */
async function journalFromServiceRevenue(salesLine, entityId, userId) {
  const coa = await getCoaMap();
  const gross = salesLine.invoice_total || 0;
  const vat = salesLine.total_vat || 0;
  const net = gross - vat;
  const docRef = salesLine.invoice_number || salesLine.doc_ref || '';

  // Direct cash routing: DR PETTY_CASH instead of DR AR_TRADE when fund is set
  const svcDebitCode = salesLine.petty_cash_fund_id && salesLine.payment_mode === 'CASH'
    ? c(coa, 'PETTY_CASH') : c(coa, 'AR_TRADE');
  const svcDebitName = salesLine.petty_cash_fund_id && salesLine.payment_mode === 'CASH'
    ? n('PETTY_CASH') : n('AR_TRADE');

  const lines = [
    { account_code: svcDebitCode, account_name: svcDebitName, debit: gross, credit: 0, description: `Service: ${docRef}` },
    { account_code: c(coa, 'SERVICE_REVENUE'), account_name: n('SERVICE_REVENUE'), debit: 0, credit: net, description: `Service: ${docRef}` },
  ];

  if (vat > 0) {
    lines.push({ account_code: c(coa, 'OUTPUT_VAT'), account_name: n('OUTPUT_VAT'), debit: 0, credit: vat, description: `VAT on ${docRef}` });
  }

  return {
    je_date: salesLine.csi_date || salesLine.created_at || new Date(),
    period: dateToPeriod(salesLine.csi_date || salesLine.created_at || new Date()),
    description: `Service Revenue: ${docRef}`,
    source_module: 'SERVICE_REVENUE',
    source_event_id: salesLine.event_id || null,
    source_doc_ref: docRef,
    lines,
    bir_flag: 'BOTH',
    vat_flag: vat > 0 ? 'VATABLE' : 'EXEMPT',
    bdm_id: salesLine.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Petty Cash transaction (Phase 19)
 * DISBURSEMENT: DR 6XXX Expense, CR PETTY_CASH
 * REMITTANCE:   DR OWNER_DRAWINGS, CR PETTY_CASH
 * REPLENISHMENT: DR PETTY_CASH, CR OWNER_DRAWINGS
 */
async function journalFromPettyCash(txn, expenseCoaCode, expenseCoaName, userId) {
  const coa = await getCoaMap();
  const amount = txn.amount || 0;
  const docRef = txn.txn_number || String(txn._id);
  const pc = c(coa, 'PETTY_CASH');
  const pcName = n('PETTY_CASH');

  if (txn.txn_type === 'DISBURSEMENT') {
    return {
      je_date: txn.txn_date || new Date(),
      period: dateToPeriod(txn.txn_date || new Date()),
      description: `Petty Cash Disbursement: ${docRef}`,
      source_module: 'PETTY_CASH',
      source_doc_ref: docRef,
      lines: [
        { account_code: expenseCoaCode || c(coa, 'MISC_EXPENSE'), account_name: expenseCoaName || n('MISC_EXPENSE'), debit: amount, credit: 0, description: txn.particulars || '' },
        { account_code: pc, account_name: pcName, debit: 0, credit: amount, description: txn.particulars || '' }
      ],
      bir_flag: 'BOTH',
      vat_flag: 'N/A',
      bdm_id: txn.bdm_id || null,
      created_by: userId
    };
  }

  if (txn.txn_type === 'REMITTANCE') {
    // Remittance: cash moves from petty cash fund to main cash/bank
    // DR Cash/Bank (or owner's designated account), CR Petty Cash
    const remitCoa = expenseCoaCode || c(coa, 'CASH_ON_HAND');
    const remitName = expenseCoaName || n('CASH_ON_HAND');
    return {
      je_date: txn.txn_date || new Date(),
      period: dateToPeriod(txn.txn_date || new Date()),
      description: `Petty Cash Remittance: ${docRef}`,
      source_module: 'PETTY_CASH',
      source_doc_ref: docRef,
      lines: [
        { account_code: remitCoa, account_name: remitName, debit: amount, credit: 0, description: 'Petty cash remittance' },
        { account_code: pc, account_name: pcName, debit: 0, credit: amount, description: 'Petty cash remittance' }
      ],
      bir_flag: 'INTERNAL',
      vat_flag: 'N/A',
      created_by: userId
    };
  }

  // REPLENISHMENT
  return {
    je_date: txn.txn_date || new Date(),
    period: dateToPeriod(txn.txn_date || new Date()),
    description: `Petty Cash Replenishment: ${docRef}`,
    source_module: 'PETTY_CASH',
    source_doc_ref: docRef,
    lines: [
      { account_code: pc, account_name: pcName, debit: amount, credit: 0, description: 'Owner replenishment' },
      { account_code: c(coa, 'OWNER_DRAWINGS'), account_name: n('OWNER_DRAWINGS'), debit: 0, credit: amount, description: 'Owner replenishment' }
    ],
    bir_flag: 'INTERNAL',
    vat_flag: 'N/A',
    created_by: userId
  };
}

/**
 * Journal from COGS
 * DR COGS, CR INVENTORY
 */
async function journalFromCOGS(salesLine, totalCogs, userId) {
  if (!totalCogs || totalCogs <= 0) return null;
  const coa = await getCoaMap();

  // CSI stores booklet# in doc_ref; only non-CSI sales use invoice_number.
  const docRef = salesLine.doc_ref || salesLine.invoice_number || String(salesLine._id);
  return {
    je_date: salesLine.csi_date || salesLine.created_at || new Date(),
    period: dateToPeriod(salesLine.csi_date || salesLine.created_at || new Date()),
    description: `COGS: ${docRef}`,
    source_module: 'SALES',
    source_event_id: salesLine.event_id || null,
    source_doc_ref: docRef,
    lines: [
      { account_code: c(coa, 'COGS'), account_name: n('COGS'), debit: totalCogs, credit: 0, description: `COGS: ${docRef}` },
      { account_code: c(coa, 'INVENTORY'), account_name: n('INVENTORY'), debit: 0, credit: totalCogs, description: `COGS: ${docRef}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: salesLine.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Inter-Company Transfer
 * SENDER:   DR IC_RECEIVABLE, CR INVENTORY
 * RECEIVER: DR INVENTORY, CR IC_PAYABLE
 */
async function journalFromInterCompany(transfer, perspective, amount, userId) {
  if (!amount || amount <= 0) return null;
  const coa = await getCoaMap();

  const docRef = transfer.transfer_number || String(transfer._id);
  const desc = `IC Transfer: ${docRef}`;

  const lines = perspective === 'SENDER'
    ? [
        { account_code: c(coa, 'IC_RECEIVABLE'), account_name: n('IC_RECEIVABLE'), debit: amount, credit: 0, description: desc },
        { account_code: c(coa, 'INVENTORY'), account_name: n('INVENTORY'), debit: 0, credit: amount, description: desc }
      ]
    : [
        { account_code: c(coa, 'INVENTORY'), account_name: n('INVENTORY'), debit: amount, credit: 0, description: desc },
        { account_code: c(coa, 'IC_PAYABLE'), account_name: n('IC_PAYABLE'), debit: 0, credit: amount, description: desc }
      ];

  return {
    je_date: transfer.shipped_at || transfer.received_at || new Date(),
    period: dateToPeriod(transfer.shipped_at || transfer.received_at || new Date()),
    description: `${perspective === 'SENDER' ? 'IC Ship' : 'IC Receive'}: ${docRef}`,
    source_module: 'IC_TRANSFER',
    source_event_id: transfer.event_id || null,
    source_doc_ref: docRef,
    lines,
    bir_flag: 'INTERNAL',
    vat_flag: 'N/A',
    bdm_id: null,
    created_by: userId
  };
}

/**
 * Journal from Inventory Adjustment (Physical Count)
 * LOSS: DR INVENTORY_WRITEOFF, CR INVENTORY
 * GAIN: DR INVENTORY, CR INVENTORY_ADJ_GAIN
 */
async function journalFromInventoryAdjustment(data, amount, userId) {
  if (!amount || amount <= 0) return null;
  const coa = await getCoaMap();

  const desc = `Inv Adj: ${data.product_name || ''} batch ${data.batch_lot_no || ''}`;
  const isLoss = data.variance < 0;

  const lines = isLoss
    ? [
        { account_code: c(coa, 'INVENTORY_WRITEOFF'), account_name: n('INVENTORY_WRITEOFF'), debit: amount, credit: 0, description: desc },
        { account_code: c(coa, 'INVENTORY'), account_name: n('INVENTORY'), debit: 0, credit: amount, description: desc }
      ]
    : [
        { account_code: c(coa, 'INVENTORY'), account_name: n('INVENTORY'), debit: amount, credit: 0, description: desc },
        { account_code: c(coa, 'INVENTORY_ADJ_GAIN'), account_name: n('INVENTORY_ADJ_GAIN'), debit: 0, credit: amount, description: desc }
      ];

  return {
    je_date: new Date(),
    period: data.period || dateToPeriod(new Date()),
    description: `${isLoss ? 'Write-Off' : 'Adj Gain'}: ${data.product_name || ''} (${data.variance > 0 ? '+' : ''}${data.variance})`,
    source_module: 'INVENTORY',
    source_doc_ref: `ADJ-${data.batch_lot_no || 'unknown'}`,
    lines,
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: data.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from PRF/CALF
 * PRF: DR PARTNER_REBATE (5200), CR funding source
 * CALF: DR AR_BDM (1110), CR funding source
 */
async function journalFromPrfCalf(doc, userId) {
  const coa = await getCoaMap();
  const amount = doc.amount || 0;
  if (amount <= 0) return null;
  const funding = await resolveFundingCoa(doc);
  const docRef = doc.prf_number || doc.calf_number || `${doc.doc_type}-${doc.period}`;
  let lines;
  if (doc.doc_type === 'PRF') {
    lines = [
      { account_code: coa.PARTNER_REBATE || '5200', account_name: 'Partner Rebate Expense', debit: amount, credit: 0, description: `PRF: ${doc.payee_name || ''}` },
      { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: amount, description: `PRF: ${docRef}` }
    ];
  } else {
    lines = [
      { account_code: coa.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: amount, credit: 0, description: `CALF advance: ${docRef}` },
      { account_code: funding.coa_code, account_name: funding.coa_name, debit: 0, credit: amount, description: `CALF: ${docRef}` }
    ];
  }
  return {
    je_date: doc.posted_at || new Date(),
    period: doc.period,
    description: `${doc.doc_type}: ${docRef}`,
    source_module: 'EXPENSE',
    source_event_id: doc.event_id || null,
    source_doc_ref: docRef,
    lines,
    bir_flag: doc.bir_flag || 'BOTH',
    vat_flag: 'N/A',
    bdm_id: doc.bdm_id || null,
    created_by: userId
  };
}

module.exports = {
  getCoaMap,
  clearCoaCache,
  resolveFundingCoa,
  journalFromSale,
  journalFromCollection,
  journalFromCWT,
  journalFromExpense,
  journalFromCommission,
  journalFromPayroll,
  journalFromAP,
  journalFromDepreciation,
  journalFromInterest,
  journalFromOwnerEquity,
  journalFromServiceRevenue,
  journalFromPettyCash,
  journalFromCOGS,
  journalFromInterCompany,
  journalFromInventoryAdjustment,
  journalFromPrfCalf
};
