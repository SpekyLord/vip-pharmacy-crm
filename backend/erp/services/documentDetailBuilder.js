/**
 * Document Detail Builder — Shared per-module detail assembly
 *
 * Pure functions that take a hydrated (populated + .lean()) document and return
 * the `details` object consumed by BOTH the Approval Hub (pending decisions) and
 * the President Reversal Console (posted audit view).
 *
 * Subscription/scalability:
 *   - One builder per module key. Adding a new module = add one builder + register
 *     it in DETAIL_BUILDERS. Both hubs pick it up automatically.
 *   - Builders are pure — no DB calls. The caller hydrates the doc; the builder
 *     transforms the fields into the UI-facing shape. This lets the reversal
 *     detail endpoint reuse the SAME builder as the approval pending list without
 *     running duplicate queries.
 *   - No hardcoded business values (Rule #3). Labels/cycles come from Lookup
 *     categories resolved in the frontend layer; photo URLs and numeric fields
 *     pass through as-is.
 *   - Rule #4 (full identifiers): product display should combine brand + dosage
 *     upstream at the query layer; this builder preserves whatever `product_id`
 *     or `product_name` the caller hydrated.
 *
 * Builders lifted verbatim from universalApprovalService.js MODULE_QUERIES
 * (Phase 31 extraction, April 2026). Behavior is byte-identical — the inline
 * `details: {...}` blocks now live here as named functions.
 */

// ─── 12 existing builders (Phase 1 extraction — byte-identical behavior) ───

function buildDeductionScheduleDetails(item) {
  return {
    deduction_type: item.deduction_type,
    deduction_label: item.deduction_label,
    total_amount: item.total_amount,
    term_months: item.term_months,
    installment_amount: item.installment_amount,
    start_period: item.start_period,
    target_cycle: item.target_cycle || 'C2',
    description: item.description,
    installments: (item.installments || []).map(i => ({
      period: i.period, installment_no: i.installment_no, amount: i.amount, status: i.status,
    })),
  };
}

function buildIncomeDetails(item) {
  return {
    period: item.period,
    cycle: item.cycle,
    earnings: item.earnings,
    total_earnings: item.total_earnings,
    deduction_lines: (item.deduction_lines || []).map(l => ({
      deduction_label: l.deduction_label, amount: l.amount, status: l.status,
      auto_source: l.auto_source, description: l.description,
    })),
    total_deductions: item.total_deductions,
    net_pay: item.net_pay,
  };
}

function buildInventoryDetails(item) {
  return {
    grn_date: item.grn_date,
    warehouse_name: item.warehouse_id?.warehouse_name
      ? `${item.warehouse_id.warehouse_name} (${item.warehouse_id.warehouse_code})`
      : null,
    source_type: item.source_type || 'STANDALONE',
    po_number: item.po_number || null,
    vendor_name: item.vendor_id?.vendor_name || null,
    _warehouse_id: item.warehouse_id?._id || item.warehouse_id,
    _bdm_id: item.bdm_id?._id || item.bdm_id,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, item_key: li.item_key, batch_lot_no: li.batch_lot_no,
      expiry_date: li.expiry_date, qty: li.qty,
    })),
    notes: item.notes,
    waybill_photo_url: item.waybill_photo_url,
    undertaking_photo_url: item.undertaking_photo_url,
  };
}

function buildPayrollDetails(item) {
  return {
    period: item.period, cycle: item.cycle,
    earnings: item.earnings, deductions: item.deductions,
    total_earnings: item.total_earnings, total_deductions: item.total_deductions,
    net_pay: item.net_pay,
  };
}

function buildKpiDetails(item) {
  return {
    period: item.period, period_type: item.period_type,
    kpi_ratings: (item.kpi_ratings || []).map(k => ({
      kpi_code: k.kpi_code, kpi_name: k.kpi_name,
      self_score: k.self_score, self_comment: k.self_comment,
      manager_score: k.manager_score,
    })),
    overall_self_score: item.overall_self_score,
    overall_manager_score: item.overall_manager_score,
  };
}

function buildSalesDetails(item) {
  return {
    sale_type: item.sale_type,
    csi_date: item.csi_date,
    invoice_number: item.invoice_number,
    hospital: item.hospital_id?.hospital_name,
    customer: item.customer_id?.customer_name,
    payment_mode: item.payment_mode,
    invoice_total: item.invoice_total,
    total_vat: item.total_vat,
    total_net_of_vat: item.total_net_of_vat,
    csi_photo_url: item.csi_photo_url,
    _warehouse_id: item.warehouse_id,
    _bdm_id: item.bdm_id?._id || item.bdm_id,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, qty: li.qty, unit_price: li.unit_price,
      line_total: li.line_total, vat_amount: li.vat_amount,
    })),
  };
}

function buildCollectionDetails(item) {
  return {
    cr_date: item.cr_date,
    cr_amount: item.cr_amount,
    hospital: item.hospital_id?.hospital_name,
    customer: item.customer_id?.customer_name,
    payment_mode: item.payment_mode,
    check_no: item.check_no,
    total_csi_amount: item.total_csi_amount,
    total_commission: item.total_commission,
    total_partner_rebates: item.total_partner_rebates,
    cwt_amount: item.cwt_amount,
    settled_csis: (item.settled_csis || []).map(c => ({
      doc_ref: c.doc_ref, invoice_amount: c.invoice_amount,
      commission_amount: c.commission_amount,
    })),
    deposit_slip_url: item.deposit_slip_url,
    cr_photo_url: item.cr_photo_url,
    cwt_certificate_url: item.cwt_certificate_url,
    csi_photo_urls: item.csi_photo_urls,
  };
}

function buildSmerDetails(item) {
  return {
    period: item.period,
    cycle: item.cycle,
    working_days: item.working_days,
    total_perdiem: item.total_perdiem,
    total_transpo: item.total_transpo,
    total_ore: item.total_ore,
    total_reimbursable: item.total_reimbursable,
    travel_advance: item.travel_advance,
    balance_on_hand: item.balance_on_hand,
    daily_entries_count: (item.daily_entries || []).length,
  };
}

function buildCarLogbookDetails(item) {
  return {
    period: item.period,
    cycle: item.cycle,
    entry_date: item.entry_date,
    total_km: item.total_km,
    official_km: item.official_km,
    personal_km: item.personal_km,
    total_fuel_amount: item.total_fuel_amount,
    official_gas_amount: item.official_gas_amount,
    personal_gas_amount: item.personal_gas_amount,
    actual_liters: item.actual_liters,
    km_per_liter: item.km_per_liter,
    overconsumption_flag: item.overconsumption_flag,
    fuel_entries_count: (item.fuel_entries || []).length,
    fuel_receipts: (item.fuel_entries || [])
      .filter(fe => fe.receipt_url || fe.starting_km_photo_url || fe.ending_km_photo_url)
      .map(fe => ({
        day: fe.day, receipt_url: fe.receipt_url,
        starting_km_photo_url: fe.starting_km_photo_url,
        ending_km_photo_url: fe.ending_km_photo_url,
      })),
  };
}

function buildExpensesDetails(item) {
  return {
    period: item.period,
    cycle: item.cycle,
    total_ore: item.total_ore,
    total_access: item.total_access,
    total_amount: item.total_amount,
    total_vat: item.total_vat,
    line_count: item.line_count || (item.lines || []).length,
    lines: (item.lines || []).slice(0, 10).map(l => ({
      expense_type: l.expense_type, expense_category: l.expense_category,
      amount: l.amount, or_number: l.or_number, payment_mode: l.payment_mode,
      calf_required: l.calf_required,
      or_photo_url: l.or_photo_url,
    })),
  };
}

function buildPrfCalfDetails(item) {
  return {
    doc_type: item.doc_type,
    period: item.period,
    cycle: item.cycle,
    prf_type: item.prf_type,
    payee_name: item.payee_name,
    payee_type: item.payee_type,
    purpose: item.purpose,
    payment_mode: item.payment_mode,
    rebate_amount: item.rebate_amount,
    advance_amount: item.advance_amount,
    liquidation_amount: item.liquidation_amount,
    balance: item.balance,
    bir_flag: item.bir_flag,
    photo_urls: item.photo_urls,
  };
}

function buildPerdiemOverrideDetails(req) {
  return {
    module: 'PERDIEM_OVERRIDE',
    doc_type: req.doc_type,
    doc_ref: req.doc_ref,
    description: req.description,
    amount: req.amount,
    requested_by: req.requested_by?.name,
    requested_at: req.requested_at,
  };
}

// ─── Phase 2 — new builders for gap modules ───

/**
 * IC_TRANSFER — covers InterCompanyTransfer (SOURCE→TARGET stock shipment) AND
 * IcSettlement (subsidiary paying VIP). Both share the IC_TRANSFER module key
 * via gateApproval.
 */
function buildIcTransferDetails(item) {
  const isSettlement = !!item.cr_no;
  if (isSettlement) {
    return {
      kind: 'IC_SETTLEMENT',
      cr_no: item.cr_no,
      cr_date: item.cr_date,
      cr_amount: item.cr_amount,
      creditor_entity: item.creditor_entity_id?.entity_name || null,
      debtor_entity: item.debtor_entity_id?.entity_name || null,
      payment_mode: item.payment_mode,
      check_no: item.check_no,
      check_date: item.check_date,
      bank: item.bank,
      deposit_slip_url: item.deposit_slip_url,
      cr_photo_url: item.cr_photo_url,
    };
  }
  return {
    kind: 'IC_TRANSFER',
    transfer_ref: item.transfer_ref,
    transfer_date: item.transfer_date,
    source_entity: item.source_entity_id?.entity_name || null,
    target_entity: item.target_entity_id?.entity_name || null,
    source_warehouse: item.source_warehouse_id?.warehouse_name || null,
    target_warehouse: item.target_warehouse_id?.warehouse_name || null,
    total_amount: item.total_amount,
    total_items: item.total_items,
    // Markers for universalApprovalService.enrichLineItems — scopes the stock
    // lookup to the SOURCE warehouse (what's actually being shipped out) so the
    // approver sees "available: 50" against a transfer of 100 and can reject
    // before stock runs negative. Matches the Sales/GRN builder pattern.
    _warehouse_id: item.source_warehouse_id?._id || item.source_warehouse_id,
    _bdm_id: item.source_bdm_id?._id || item.source_bdm_id,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, item_key: li.item_key,
      qty: li.qty, unit: li.unit,
      batch_lot_no: li.batch_lot_no, expiry_date: li.expiry_date,
      transfer_price: li.transfer_price, line_total: li.line_total,
    })),
    notes: item.notes,
  };
}

/**
 * JOURNAL — covers manual Journal Entries (JOURNAL_ENTRY), depreciation batches
 * (DEPRECIATION), and interest batches (INTEREST). All go through the JOURNAL
 * module sub-permission.
 */
function buildJournalDetails(item) {
  const totalDebit = (item.lines || []).reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = (item.lines || []).reduce((s, l) => s + (l.credit || 0), 0);
  return {
    je_number: item.je_number,
    je_date: item.je_date,
    source_module: item.source_module,
    source_doc_ref: item.source_doc_ref,
    memo: item.memo || item.description,
    is_reversal: item.is_reversal,
    corrects_je_id: item.corrects_je_id,
    total_debits: totalDebit,
    total_credits: totalCredit,
    lines: (item.lines || []).map(l => ({
      account_code: l.account_code, account_name: l.account_name,
      debit: l.debit || 0, credit: l.credit || 0, memo: l.memo,
      cost_center: l.cost_center, bdm_id: l.bdm_id,
    })),
  };
}

/**
 * BANKING — BankStatement being finalized (reconciliation).
 */
function buildBankingDetails(item) {
  const entries = item.entries || [];
  const matched = entries.filter(e => e.match_status === 'MATCHED').length;
  const unmatched = entries.filter(e => e.match_status === 'UNMATCHED').length;
  const reconcilingItems = entries.filter(e => e.match_status === 'RECONCILING_ITEM').length;
  return {
    bank_account: item.bank_account_id?.bank_name
      ? `${item.bank_account_id.bank_name}${item.bank_account_id.bank_code ? ` (${item.bank_account_id.bank_code})` : ''}`
      : null,
    coa_code: item.bank_account_id?.coa_code || null,
    statement_date: item.statement_date,
    period: item.period,
    closing_balance: item.closing_balance,
    entries_count: entries.length,
    matched_count: matched,
    unmatched_count: unmatched,
    reconciling_items_count: reconcilingItems,
    uploaded_at: item.uploaded_at,
    uploaded_by: item.uploaded_by?.name || null,
    // Show first 10 entries for quick glance
    entries_preview: entries.slice(0, 10).map(e => ({
      txn_date: e.txn_date, description: e.description, reference: e.reference,
      debit: e.debit, credit: e.credit, balance: e.balance, match_status: e.match_status,
    })),
  };
}

/**
 * PURCHASING — supplier invoice (bill) pending approval.
 */
function buildPurchasingDetails(item) {
  return {
    invoice_ref: item.invoice_ref,
    invoice_date: item.invoice_date,
    vendor_name: item.vendor_id?.vendor_name || item.vendor_name || null,
    vendor_tin: item.vendor_id?.tin || null,
    po_number: item.po_id?.po_number || item.po_number || null,
    grn_id: item.grn_id || null,
    total_amount: item.total_amount,
    vat_amount: item.vat_amount,
    net_amount: item.net_amount,
    input_vat: item.input_vat,
    due_date: item.due_date,
    line_items: (item.line_items || []).map(li => ({
      product_id: li.product_id, item_key: li.item_key, description: li.description,
      qty: li.qty, unit_price: li.unit_price, line_total: li.line_total,
    })),
  };
}

/**
 * PETTY_CASH — disbursement or deposit pending fund admin's approval.
 */
function buildPettyCashDetails(item) {
  return {
    txn_number: item.txn_number,
    txn_type: item.txn_type,
    txn_date: item.txn_date,
    fund_label: item.fund_id?.fund_name
      || (item.fund_id?.fund_code ? `Fund ${item.fund_id.fund_code}` : null),
    amount: item.amount,
    running_balance: item.running_balance,
    fund_current_balance: item.fund_id?.current_balance,
    // DEPOSIT-flavored
    source_description: item.source_description,
    // DISBURSEMENT-flavored
    payee: item.payee,
    particulars: item.particulars,
    expense_category: item.expense_category,
    or_number: item.or_number,
    or_photo_url: item.or_photo_url,
    is_pcv: item.is_pcv,
    pcv_remarks: item.pcv_remarks,
    vat_amount: item.vat_amount,
    net_of_vat: item.net_of_vat,
  };
}

// ─── Registry ───

const DETAIL_BUILDERS = {
  // Existing 12 (Phase 1 extraction)
  DEDUCTION_SCHEDULE: buildDeductionScheduleDetails,
  INCOME:             buildIncomeDetails,
  INVENTORY:          buildInventoryDetails,
  PAYROLL:            buildPayrollDetails,
  KPI:                buildKpiDetails,
  SALES:              buildSalesDetails,
  COLLECTION:         buildCollectionDetails,
  SMER:               buildSmerDetails,
  CAR_LOGBOOK:        buildCarLogbookDetails,
  EXPENSES:           buildExpensesDetails,
  PRF_CALF:           buildPrfCalfDetails,
  PERDIEM_OVERRIDE:   buildPerdiemOverrideDetails,
  // Phase 2 new
  IC_TRANSFER:        buildIcTransferDetails,
  JOURNAL:            buildJournalDetails,
  BANKING:            buildBankingDetails,
  PURCHASING:         buildPurchasingDetails,
  PETTY_CASH:         buildPettyCashDetails,
};

/**
 * Main entry point. Returns `null` when no builder is registered (APPROVAL_REQUEST
 * intentionally has none — its items pass through without a `details` field).
 */
function buildDocumentDetails(module, doc) {
  const fn = DETAIL_BUILDERS[module];
  if (!fn || !doc) return null;
  return fn(doc);
}

/**
 * Map a REVERSAL_HANDLERS doc_type back to the MODULE key used by the builder
 * registry. Used by the President Reversal Console's detail endpoint — lets the
 * same builder serve both hubs without duplicating the mapping logic.
 */
const REVERSAL_DOC_TYPE_TO_MODULE = {
  SALES_LINE:           'SALES',
  COLLECTION:           'COLLECTION',
  EXPENSE:              'EXPENSES',
  CALF:                 'PRF_CALF',
  PRF:                  'PRF_CALF',
  GRN:                  'INVENTORY',
  IC_TRANSFER:          'IC_TRANSFER',
  CONSIGNMENT_TRANSFER: 'INVENTORY', // DR is inventory-adjacent; reuse GRN-style panel for now
  INCOME_REPORT:        'INCOME',
  PAYSLIP:              'PAYROLL',
  PETTY_CASH_TXN:       'PETTY_CASH',
  JOURNAL_ENTRY:        'JOURNAL',
};

module.exports = {
  buildDocumentDetails,
  DETAIL_BUILDERS,
  REVERSAL_DOC_TYPE_TO_MODULE,
};
