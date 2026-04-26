/**
 * scpwdReportingService — Phase VIP-1.H (Apr 2026)
 *
 * BIR-compliant CSV exports for the SC/PWD Sales Book register.
 *
 * Two outputs:
 *   1. Monthly SC/PWD Sales Book Register (BIR RR 7-2010 column requirements)
 *   2. Input VAT Credit Worksheet — BIR Form 2306 logic for reclaiming input
 *      VAT lost to SC/PWD-exempt sales.
 *
 * Both exports are read-only against POSTED rows only (DRAFT/VOID excluded).
 * Audit logging is the caller's responsibility (controller writes AuditLog).
 *
 * Subscriber adaptation: column labels are static here (BIR-mandated), but
 * subscribers in other jurisdictions can substitute this service module
 * wholesale via dependency injection (Phase 2 if/when needed). For PH the
 * format is locked by RR 7-2010.
 *
 * **First-time export caveat**: Input VAT Credit Worksheet column math should
 * be reviewed by an accredited PH tax accountant before filing the first
 * month's reclaim. Output is labeled `[DRAFT — review before filing]` until
 * the accountant signs off and admin removes the prefix via Settings flag.
 */

const SalesBookSCPWD = require('../models/SalesBookSCPWD');

// CSV-safe escape — handles commas, quotes, and newlines per RFC 4180
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  // Always quote-wrap; doubles internal quotes per RFC 4180.
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

function fmtMoney(n) {
  // BIR convention: 2 decimals, no thousands separators in CSV (avoid locale parsing issues downstream)
  return Number(n || 0).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  // BIR convention: YYYY-MM-DD
  return dt.toISOString().slice(0, 10);
}

/**
 * Generate the monthly SC/PWD Sales Book per BIR RR 7-2010.
 *
 * Columns (per RR 7-2010 + RR 5-2017 audit-binder requirements):
 *   Date | OR/SI No. | SC/PWD Type | OSCA/PWD ID | Customer Name |
 *   Gross Amount | 20% Discount | VAT-Exempt Amount | Net Amount |
 *   Items Description | Notes
 *
 * @param {ObjectId} entityId
 * @param {number} year
 * @param {number} month (1-12)
 * @returns {Promise<{ filename: string, content: string, rowCount: number, totals: {...} }>}
 */
async function generateMonthlyExport(entityId, year, month) {
  const rows = await SalesBookSCPWD.find({
    entity_id: entityId,
    'bir_period.year': year,
    'bir_period.month': month,
    status: 'POSTED',
  })
  .sort({ transaction_date: 1, _id: 1 })
  .lean();

  const header = [
    'Date',
    'OR / SI No.',
    'Type',
    'OSCA / PWD ID',
    'Customer Name',
    'Gross Amount',
    '20% Discount',
    'VAT-Exempt Amount',
    'Net Amount',
    'Items',
    'Notes',
  ];

  const dataRows = rows.map(r => [
    fmtDate(r.transaction_date),
    r.source_doc_ref || '',
    r.sc_pwd_type,
    r.osca_or_pwd_id,
    r.customer_name,
    fmtMoney(r.gross_amount),
    fmtMoney(r.discount_amount),
    fmtMoney(r.vat_exempt_amount),
    fmtMoney(r.net_amount),
    (r.items || []).map(i => `${i.product_name} x${i.qty}`).join('; '),
    r.notes || '',
  ]);

  // Totals row — BIR auditors expect the period total visible in-file
  const totals = rows.reduce((acc, r) => ({
    gross: acc.gross + (r.gross_amount || 0),
    discount: acc.discount + (r.discount_amount || 0),
    vat_exempt: acc.vat_exempt + (r.vat_exempt_amount || 0),
    net: acc.net + (r.net_amount || 0),
  }), { gross: 0, discount: 0, vat_exempt: 0, net: 0 });

  const totalsRow = [
    '', '', '', '', 'TOTALS',
    fmtMoney(totals.gross),
    fmtMoney(totals.discount),
    fmtMoney(totals.vat_exempt),
    fmtMoney(totals.net),
    '', '',
  ];

  const allRows = [header, ...dataRows, [], totalsRow];
  const content = toCsv(allRows);
  const monthLabel = String(month).padStart(2, '0');
  const filename = `SCPWD_SalesBook_${year}-${monthLabel}.csv`;

  return { filename, content, rowCount: rows.length, totals };
}

/**
 * Generate the Input VAT Credit Worksheet per BIR Form 2306 logic.
 *
 * The pharmacy paid input VAT to the distributor on goods sold under SC/PWD
 * exemption (no output VAT collected from customer). That input VAT is
 * reclaimable from BIR. Worksheet groups by product and shows:
 *   Product | Qty Sold | Gross Sales | VAT-Exempt Lost | Recoverable Input VAT
 *
 * For v1 the recoverable amount is computed as (line_subtotal × 12 / 112)
 * — the standard PH VAT-inclusive grossing assumption when supplier-paid
 * VAT is not denormalized on the SCPWD row. Once the storefront feeds rows
 * with `input_vat_paid_to_supplier` populated, the worksheet uses the
 * actual paid amount.
 *
 * **Output is labeled DRAFT** until accountant review (per first-time export
 * caveat above).
 */
async function generateInputVatCreditWorksheet(entityId, year, month) {
  const rows = await SalesBookSCPWD.find({
    entity_id: entityId,
    'bir_period.year': year,
    'bir_period.month': month,
    status: 'POSTED',
  }).lean();

  // Group by product
  const byProduct = new Map();
  for (const r of rows) {
    for (const item of r.items || []) {
      const key = item.product_id ? String(item.product_id) : `__by_name__${item.product_name}`;
      const cur = byProduct.get(key) || {
        product_name: item.product_name,
        product_code: item.product_code || '',
        qty: 0,
        gross: 0,
        vat_exempt: 0,
        input_vat_recoverable: 0,
      };
      cur.qty += item.qty || 0;
      cur.gross += item.line_subtotal || 0;
      cur.vat_exempt += item.line_vat_exempt || 0;
      // If row has a denormalized supplier-paid VAT (storefront feed), use it
      // prorated by line_subtotal. Otherwise fall back to the standard
      // 12/112 grossing-up factor on the line subtotal.
      const lineRecoverable = r.input_vat_paid_to_supplier
        ? (r.input_vat_paid_to_supplier * (item.line_subtotal / r.gross_amount))
        : (item.line_subtotal * 12 / 112);
      cur.input_vat_recoverable += lineRecoverable;
      byProduct.set(key, cur);
    }
  }

  const header = [
    '[DRAFT — review with accountant before filing]',
  ];
  const subHeader = [
    'Product Code',
    'Product Name',
    'Qty Sold',
    'Gross Sales',
    'VAT-Exempt Forgone',
    'Recoverable Input VAT',
  ];

  const dataRows = Array.from(byProduct.values())
    .sort((a, b) => b.input_vat_recoverable - a.input_vat_recoverable)
    .map(p => [
      p.product_code,
      p.product_name,
      p.qty,
      fmtMoney(p.gross),
      fmtMoney(p.vat_exempt),
      fmtMoney(p.input_vat_recoverable),
    ]);

  const totals = Array.from(byProduct.values()).reduce((acc, p) => ({
    qty: acc.qty + p.qty,
    gross: acc.gross + p.gross,
    vat_exempt: acc.vat_exempt + p.vat_exempt,
    recoverable: acc.recoverable + p.input_vat_recoverable,
  }), { qty: 0, gross: 0, vat_exempt: 0, recoverable: 0 });

  const totalsRow = [
    '', 'TOTALS',
    totals.qty,
    fmtMoney(totals.gross),
    fmtMoney(totals.vat_exempt),
    fmtMoney(totals.recoverable),
  ];

  const allRows = [header, [], subHeader, ...dataRows, [], totalsRow];
  const content = toCsv(allRows);
  const monthLabel = String(month).padStart(2, '0');
  const filename = `SCPWD_InputVATCreditWorksheet_${year}-${monthLabel}_DRAFT.csv`;

  return { filename, content, rowCount: byProduct.size, totals };
}

module.exports = {
  generateMonthlyExport,
  generateInputVatCreditWorksheet,
};
