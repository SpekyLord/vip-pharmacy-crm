/**
 * Auto-Journal Service — generates JE data from source documents
 *
 * PRD v5 §11.3 — Each function returns a JE data object (not persisted).
 * The caller (monthEndClose or controller) creates+posts via journalEngine.
 *
 * COA mapping from PHASETASK-ERP.md Phase 6 notes:
 *   SMER POSTED:       DR 6100 Per Diem + 6150 Transport, CR 1110 AR BDM
 *   Car Logbook POSTED: DR 6200 Fuel/Gas, CR 1110 AR BDM
 *   ORE POSTED:        DR 6XXX (per category), CR 1110 AR BDM
 *   ACCESS POSTED:     DR 6XXX, CR 2000 AP Trade or Bank
 *   PRF POSTED:        DR 5200 Partner Rebate, CR Cash/Bank
 *   CALF POSTED:       DR 1110 AR BDM (clearing), CR Cash/Bank
 */

/**
 * Helper: format period from Date
 */
function dateToPeriod(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Journal from Sales Line
 * DR 1100 AR Trade (gross)
 * CR 4000 Sales Revenue — Vatable (net)
 * CR 2100 Output VAT (vat)
 */
function journalFromSale(salesLine, entityId, userId) {
  const gross = salesLine.total_amount || salesLine.invoice_total || 0;
  const vat = salesLine.total_vat || 0;
  const net = gross - vat;

  const lines = [
    { account_code: '1100', account_name: 'Accounts Receivable — Trade', debit: gross, credit: 0, description: `Sale: ${salesLine.invoice_number || ''}` },
    { account_code: '4000', account_name: 'Sales Revenue — Vatable', debit: 0, credit: net, description: `Sale: ${salesLine.invoice_number || ''}` },
  ];

  if (vat > 0) {
    lines.push({ account_code: '2100', account_name: 'Output VAT', debit: 0, credit: vat, description: `VAT on ${salesLine.invoice_number || ''}` });
  }

  return {
    je_date: salesLine.invoice_date || salesLine.created_at || new Date(),
    period: dateToPeriod(salesLine.invoice_date || salesLine.created_at || new Date()),
    description: `Sales: ${salesLine.invoice_number || salesLine._id}`,
    source_module: 'SALES',
    source_event_id: salesLine.event_id || null,
    source_doc_ref: salesLine.invoice_number || String(salesLine._id),
    lines,
    bir_flag: 'BOTH',
    vat_flag: vat > 0 ? 'VATABLE' : 'EXEMPT',
    bdm_id: salesLine.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Collection
 * DR 1010-1014 Cash/Bank (based on payment_mode coa_code)
 * CR 1100 AR Trade
 */
function journalFromCollection(collection, bankCoaCode, bankName, userId) {
  const amount = collection.total_amount || collection.amount_collected || 0;
  const coaCode = bankCoaCode || '1000';
  const coaName = bankName || 'Cash on Hand';

  return {
    je_date: collection.collection_date || collection.created_at || new Date(),
    period: dateToPeriod(collection.collection_date || collection.created_at || new Date()),
    description: `Collection: ${collection.or_number || collection._id}`,
    source_module: 'COLLECTION',
    source_event_id: collection.event_id || null,
    source_doc_ref: collection.or_number || String(collection._id),
    lines: [
      { account_code: coaCode, account_name: coaName, debit: amount, credit: 0, description: `Collection ${collection.or_number || ''}` },
      { account_code: '1100', account_name: 'Accounts Receivable — Trade', debit: 0, credit: amount, description: `Collection ${collection.or_number || ''}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: collection.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from CWT (Creditable Withholding Tax)
 * DR 1220 CWT Receivable
 * CR 1100 AR Trade
 */
function journalFromCWT(cwtEntry, userId) {
  const amount = cwtEntry.cwt_amount || 0;

  return {
    je_date: cwtEntry.cr_date || new Date(),
    period: dateToPeriod(cwtEntry.cr_date || new Date()),
    description: `CWT: CR#${cwtEntry.cr_no || ''} — ${cwtEntry.hospital_name || ''}`,
    source_module: 'COLLECTION',
    source_event_id: cwtEntry.event_id || null,
    source_doc_ref: cwtEntry.cr_no || String(cwtEntry._id),
    lines: [
      { account_code: '1220', account_name: 'CWT Receivable', debit: amount, credit: 0, description: `CWT CR#${cwtEntry.cr_no || ''}` },
      { account_code: '1100', account_name: 'Accounts Receivable — Trade', debit: 0, credit: amount, description: `CWT CR#${cwtEntry.cr_no || ''}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: cwtEntry.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Expense
 * DR 6XXX Expense (from expense category/coa_code)
 * CR 1110 AR BDM Advances (personal reimbursement) or CR 2000 AP / Bank (company funded)
 */
function journalFromExpense(expense, expenseCoaCode, expenseCoaName, creditCoaCode, creditCoaName, userId) {
  const amount = expense.total_amount || expense.amount || 0;

  return {
    je_date: expense.expense_date || expense.date || expense.created_at || new Date(),
    period: dateToPeriod(expense.expense_date || expense.date || expense.created_at || new Date()),
    description: `Expense: ${expense.doc_number || expense._id}`,
    source_module: 'EXPENSE',
    source_event_id: expense.event_id || null,
    source_doc_ref: expense.doc_number || String(expense._id),
    lines: [
      { account_code: expenseCoaCode || '6900', account_name: expenseCoaName || 'Miscellaneous Expense', debit: amount, credit: 0, description: expense.description || '' },
      { account_code: creditCoaCode || '1110', account_name: creditCoaName || 'AR — BDM Advances', debit: 0, credit: amount, description: expense.description || '' }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: expense.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Commission
 * DR 5100 BDM Commission
 * CR 1110 AR BDM Advances
 */
function journalFromCommission(commission, userId) {
  const amount = commission.amount || 0;

  return {
    je_date: commission.date || new Date(),
    period: dateToPeriod(commission.date || new Date()),
    description: `Commission: ${commission.bdm_name || ''} — ${commission.period || ''}`,
    source_module: 'COMMISSION',
    source_event_id: commission.event_id || null,
    source_doc_ref: String(commission._id),
    lines: [
      { account_code: '5100', account_name: 'BDM Commission', debit: amount, credit: 0, description: `Commission ${commission.bdm_name || ''}` },
      { account_code: '1110', account_name: 'AR — BDM Advances', debit: 0, credit: amount, description: `Commission ${commission.bdm_name || ''}` }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    bdm_id: commission.bdm_id || null,
    created_by: userId
  };
}

/**
 * Journal from Payroll (multi-line)
 * DR 6000 Salaries + DR 6050 Allowances + DR 5100 Commission (if any)
 * CR 2200 SSS + CR 2210 PhilHealth + CR 2220 PagIBIG + CR 2230 WHT + CR Cash/Bank (net)
 */
function journalFromPayroll(payslip, bankCoaCode, bankName, userId) {
  const lines = [];

  // Debit: earnings breakdown
  const basic = payslip.earnings?.basic_salary || 0;
  const allowance = payslip.earnings?.allowance || payslip.earnings?.de_minimis_total || 0;
  const commission = payslip.earnings?.commission || 0;
  const overtime = payslip.earnings?.overtime || 0;

  if (basic > 0) lines.push({ account_code: '6000', account_name: 'Salaries & Wages', debit: basic + overtime, credit: 0, description: 'Basic salary' });
  if (allowance > 0) lines.push({ account_code: '6050', account_name: 'Allowances', debit: allowance, credit: 0, description: 'Allowances / de minimis' });
  if (commission > 0) lines.push({ account_code: '5100', account_name: 'BDM Commission', debit: commission, credit: 0, description: 'Commission' });

  // Credit: deductions
  const sss = payslip.deductions?.sss_ee || 0;
  const philhealth = payslip.deductions?.philhealth_ee || 0;
  const pagibig = payslip.deductions?.pagibig_ee || 0;
  const tax = payslip.deductions?.withholding_tax || 0;

  if (sss > 0) lines.push({ account_code: '2200', account_name: 'SSS Payable', debit: 0, credit: sss, description: 'SSS EE share' });
  if (philhealth > 0) lines.push({ account_code: '2210', account_name: 'PhilHealth Payable', debit: 0, credit: philhealth, description: 'PhilHealth EE share' });
  if (pagibig > 0) lines.push({ account_code: '2220', account_name: 'Pag-IBIG Payable', debit: 0, credit: pagibig, description: 'Pag-IBIG EE share' });
  if (tax > 0) lines.push({ account_code: '2230', account_name: 'Withholding Tax Payable', debit: 0, credit: tax, description: 'WHT' });

  // Credit: net pay → Cash/Bank
  const netPay = payslip.net_pay || 0;
  if (netPay > 0) {
    lines.push({
      account_code: bankCoaCode || '1010',
      account_name: bankName || 'RCBC Savings',
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
 * DR 1200 Inventory + DR 1210 Input VAT
 * CR 2000 AP Trade
 */
function journalFromAP(supplierInvoice, userId) {
  const net = supplierInvoice.net_amount || supplierInvoice.total_amount || 0;
  const vat = supplierInvoice.input_vat || supplierInvoice.vat_amount || 0;
  const gross = net + vat;

  const lines = [
    { account_code: '1200', account_name: 'Inventory', debit: net, credit: 0, description: `PO: ${supplierInvoice.po_number || ''}` },
  ];
  if (vat > 0) {
    lines.push({ account_code: '1210', account_name: 'Input VAT', debit: vat, credit: 0, description: `Input VAT on ${supplierInvoice.invoice_ref || ''}` });
  }
  lines.push({ account_code: '2000', account_name: 'Accounts Payable — Trade', debit: 0, credit: gross, description: `SI: ${supplierInvoice.invoice_ref || ''}` });

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
 * DR 7000 Depreciation Expense
 * CR 1350 Accumulated Depreciation
 */
function journalFromDepreciation(deprnEntry, userId) {
  const amount = deprnEntry.amount || 0;

  return {
    je_date: deprnEntry.date || new Date(),
    period: deprnEntry.period || dateToPeriod(deprnEntry.date || new Date()),
    description: `Depreciation: ${deprnEntry.asset_name || ''} — ${deprnEntry.period || ''}`,
    source_module: 'DEPRECIATION',
    source_doc_ref: String(deprnEntry.asset_id || deprnEntry._id),
    lines: [
      { account_code: '7000', account_name: 'Depreciation Expense', debit: amount, credit: 0, description: deprnEntry.asset_name || '' },
      { account_code: '1350', account_name: 'Accumulated Depreciation', debit: 0, credit: amount, description: deprnEntry.asset_name || '' }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };
}

/**
 * Journal from Interest (Loan)
 * DR 7050 Interest Expense
 * CR 2300 Loans Payable
 */
function journalFromInterest(interestEntry, userId) {
  const amount = interestEntry.interest_amount || 0;

  return {
    je_date: interestEntry.date || new Date(),
    period: interestEntry.period || dateToPeriod(interestEntry.date || new Date()),
    description: `Interest: ${interestEntry.loan_code || ''} — ${interestEntry.period || ''}`,
    source_module: 'INTEREST',
    source_doc_ref: String(interestEntry.loan_id || interestEntry._id),
    lines: [
      { account_code: '7050', account_name: 'Interest Expense', debit: amount, credit: 0, description: interestEntry.loan_code || '' },
      { account_code: '2300', account_name: 'Loans Payable', debit: 0, credit: amount, description: interestEntry.loan_code || '' }
    ],
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };
}

/**
 * Journal from Owner Equity (infusion or drawing)
 * INFUSION: DR Cash/Bank, CR 3000 Owner Capital
 * DRAWING:  DR 3100 Owner Drawings, CR Cash/Bank
 */
function journalFromOwnerEquity(equityEntry, bankCoaCode, bankName, userId) {
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
        { account_code: '3000', account_name: 'Owner Capital', debit: 0, credit: amount, description: 'Owner infusion' }
      ],
      bir_flag: equityEntry.bir_flag || 'BOTH',
      vat_flag: 'N/A',
      created_by: userId
    };
  }

  // DRAWING
  return {
    je_date: equityEntry.entry_date || new Date(),
    period: dateToPeriod(equityEntry.entry_date || new Date()),
    description: `Owner Drawing: ${equityEntry.description || ''}`,
    source_module: 'OWNER',
    source_doc_ref: String(equityEntry._id),
    lines: [
      { account_code: '3100', account_name: 'Owner Drawings', debit: amount, credit: 0, description: 'Owner drawing' },
      { account_code: coaCode, account_name: coaName, debit: 0, credit: amount, description: 'Owner drawing' }
    ],
    bir_flag: equityEntry.bir_flag || 'BOTH',
    vat_flag: 'N/A',
    created_by: userId
  };
}

module.exports = {
  journalFromSale,
  journalFromCollection,
  journalFromCWT,
  journalFromExpense,
  journalFromCommission,
  journalFromPayroll,
  journalFromAP,
  journalFromDepreciation,
  journalFromInterest,
  journalFromOwnerEquity
};
