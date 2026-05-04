/**
 * withholdingReturnService — Phase VIP-1.J / J2 (Apr 2026).
 *
 * BIR 1601-EQ (Quarterly EWT), 1606 (Monthly Real-Property Withholding),
 * 2307-OUT (Per-Payee Certificate of Creditable Withholding Tax) and SAWT
 * (Summary Alphalist of Withholding Tax) generation. Mirrors the J1
 * `vatReturnService` shape so the form-detail page renders both VAT and
 * EWT outputs through the same React component.
 *
 * Source-of-truth boundaries:
 *   • Engine writes WithholdingLedger rows at document-post time. The
 *     aggregators here are PURE READS of that ledger — sub-ledger / GL
 *     reconciliation runs against the same rows (sub-ledger ≠ GL = bug).
 *   • Box layout is BIR-fixed. Subscriber labels do not override BIR field
 *     names — re-skinning a 1601-EQ box risks filing a wrong return.
 *   • SAWT `.dat` schema is BIR-fixed (Alphalist Data Entry v7.x); golden
 *     fixture committed to `backend/erp/services/__fixtures__/`.
 *   • CSV / `.dat` exports both flow through the BirFilingStatus audit-log
 *     append pattern (SHA-256 + byte length + user + filename) for Rule #20
 *     traceability.
 *
 * Period encoding mirrors WithholdingLedger.period:
 *   • Monthly: 'YYYY-MM' — 1606 reads one month.
 *   • Quarterly: 1601-EQ + SAWT + outbound 2307 sum three months.
 *
 * What is NOT in this file (deferred to subsequent J phases):
 *   • 1601-C compensation withholding (J3) — bridges Payslip → ledger
 *     COMPENSATION direction. Same shape, different schedule.
 *   • QAP + 1604-E annual alphalists (J4).
 *   • 2307 inbound reconciliation (J6) — uses CwtLedger, not this ledger.
 */

const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const WithholdingLedger = require('../models/WithholdingLedger');
const BirFilingStatus = require('../models/BirFilingStatus');

// ── Period helpers (mirror vatReturnService) ────────────────────────────
const QUARTER_MONTHS = {
  1: ['01', '02', '03'],
  2: ['04', '05', '06'],
  3: ['07', '08', '09'],
  4: ['10', '11', '12'],
};

function pad2(n) { return String(n).padStart(2, '0'); }
function monthlyPeriod(year, month) { return `${year}-${pad2(month)}`; }
function quarterPeriods(year, quarter) {
  const months = QUARTER_MONTHS[quarter];
  if (!months) throw new Error(`Invalid quarter: ${quarter}`);
  return months.map(m => `${year}-${m}`);
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// ── Aggregation primitives ──────────────────────────────────────────────
// Phase J3 — `direction` parameter added (default 'OUTBOUND' preserves J2
// callers). 1601-C aggregator passes 'COMPENSATION' to scope to payroll
// rows. The same primitive is reused so finance posture (PENDING vs
// INCLUDE) and entity scoping behave identically across forms.
async function sumByAtcCode(entityId, periods, financeTag = 'INCLUDE', direction = 'OUTBOUND') {
  // Sum rows grouped by ATC code for the given period set + direction.
  // PENDING rows are EXCLUDED from the official return so finance must
  // explicitly INCLUDE them — same posture as VatLedger.
  const rows = await WithholdingLedger.aggregate([
    {
      $match: {
        entity_id: entityId,
        direction,
        period: { $in: Array.isArray(periods) ? periods : [periods] },
        finance_tag: financeTag,
      },
    },
    {
      $group: {
        _id: '$atc_code',
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows;
}

async function listPayees(entityId, periods, atcFilter = null, financeTag = 'INCLUDE', direction = 'OUTBOUND') {
  const match = {
    entity_id: entityId,
    direction,
    period: { $in: Array.isArray(periods) ? periods : [periods] },
    finance_tag: financeTag,
  };
  if (atcFilter) {
    match.atc_code = Array.isArray(atcFilter) ? { $in: atcFilter } : atcFilter;
  }
  const rows = await WithholdingLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: { payee_kind: '$payee_kind', payee_id: '$payee_id', atc_code: '$atc_code' },
        gross: { $sum: '$gross_amount' },
        withheld: { $sum: '$withheld_amount' },
        count: { $sum: 1 },
        first_period: { $min: '$period' },
        last_period: { $max: '$period' },
        payee_name: { $last: '$payee_name_snapshot' },
        payee_tin: { $last: '$payee_tin_snapshot' },
        payee_address: { $last: '$payee_address_snapshot' },
      },
    },
    { $sort: { gross: -1 } },
  ]);
  return rows.map(r => ({
    payee_kind: r._id.payee_kind,
    payee_id: r._id.payee_id,
    atc_code: r._id.atc_code,
    payee_name: r.payee_name || '(unnamed payee)',
    payee_tin: r.payee_tin || '',
    payee_address: r.payee_address || '',
    gross: round2(r.gross),
    withheld: round2(r.withheld),
    count: r.count,
    first_period: r.first_period,
    last_period: r.last_period,
  }));
}

// ── BIR form box layouts (BIR-fixed) ────────────────────────────────────
const BOX_LAYOUT_1601_EQ = [
  // Schedule 1 — Income payments per ATC code.
  { code: 'wi010_gross',     label: 'Sch 1 — WI010 Professional fees (indiv ≤ 720k) — Gross',  section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wi010_tax',       label: 'Sch 1 — WI010 Tax Withheld',                              section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wi011_gross',     label: 'Sch 1 — WI011 Professional fees (indiv > 720k) — Gross',  section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wi011_tax',       label: 'Sch 1 — WI011 Tax Withheld',                              section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wc010_gross',     label: 'Sch 1 — WC010 Professional fees (corp ≤ 720k) — Gross',   section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wc010_tax',       label: 'Sch 1 — WC010 Tax Withheld',                              section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wc011_gross',     label: 'Sch 1 — WC011 Professional fees (corp > 720k) — Gross',   section: 'SCH1', readonly: true, decimals: 2 },
  { code: 'wc011_tax',       label: 'Sch 1 — WC011 Tax Withheld',                              section: 'SCH1', readonly: true, decimals: 2 },
  // TWA goods + services
  { code: 'wi080_gross',     label: 'Sch 2 — WI080 TWA Goods (1%) — Gross',                    section: 'SCH2', readonly: true, decimals: 2 },
  { code: 'wi080_tax',       label: 'Sch 2 — WI080 Tax Withheld',                              section: 'SCH2', readonly: true, decimals: 2 },
  { code: 'wi081_gross',     label: 'Sch 2 — WI081 TWA Services (2%) — Gross',                 section: 'SCH2', readonly: true, decimals: 2 },
  { code: 'wi081_tax',       label: 'Sch 2 — WI081 Tax Withheld',                              section: 'SCH2', readonly: true, decimals: 2 },
  // Totals
  { code: 'total_gross',     label: 'Total Gross Income Payments',                              section: 'TOTAL', readonly: true, decimals: 2 },
  { code: 'total_withheld',  label: 'Total Tax Withheld for the Quarter',                       section: 'TOTAL', readonly: true, decimals: 2 },
];

const BOX_LAYOUT_1606 = [
  { code: 'wi160_gross',     label: 'WI160 Rent (Indiv lessor, 5%) — Gross Rental',            section: 'RENT',  readonly: true, decimals: 2 },
  { code: 'wi160_tax',       label: 'WI160 Tax Withheld',                                       section: 'RENT',  readonly: true, decimals: 2 },
  { code: 'wc160_gross',     label: 'WC160 Rent (Corp lessor, 5%) — Gross Rental',             section: 'RENT',  readonly: true, decimals: 2 },
  { code: 'wc160_tax',       label: 'WC160 Tax Withheld',                                       section: 'RENT',  readonly: true, decimals: 2 },
  { code: 'total_gross',     label: 'Total Gross Rental Payments',                              section: 'TOTAL', readonly: true, decimals: 2 },
  { code: 'total_withheld',  label: 'Total Tax Withheld for the Month',                         section: 'TOTAL', readonly: true, decimals: 2 },
];

// Phase J3 — 1601-C Monthly Compensation Withholding return.
// Box layout mirrors the BIR 1601-C form structure: regular taxable
// compensation + 13th-month excess (taxable portion above the ₱90k TRAIN
// exemption) + MWE (exempt — gross only) + totals. Tax-table math happens
// upstream in payslipCalc; this report aggregates the engine's recorded
// totals for the bookkeeper to copy into eBIRForms.
const BOX_LAYOUT_1601_C = [
  // Schedule 1 — taxable compensation (BIR ATC WI100)
  { code: 'wi100_gross',    label: 'Sch 1 — WI100 Regular Taxable Compensation — Gross',           section: 'COMP',  readonly: true, decimals: 2 },
  { code: 'wi100_tax',      label: 'Sch 1 — WI100 Tax Withheld on Regular Compensation',           section: 'COMP',  readonly: true, decimals: 2 },
  // Schedule 2 — 13th-month + bonuses excess (BIR ATC WC120)
  { code: 'wc120_gross',    label: 'Sch 2 — WC120 13th-Month + Bonuses (excess of ₱90k) — Gross',  section: 'BNS',   readonly: true, decimals: 2 },
  { code: 'wc120_tax',      label: 'Sch 2 — WC120 Tax (already counted in Sch 1 total)',           section: 'BNS',   readonly: true, decimals: 2 },
  // Schedule 3 — minimum wage earners (exempt under TRAIN)
  { code: 'wmwe_gross',     label: 'Sch 3 — MWE Compensation — Gross (exempt under TRAIN)',         section: 'MWE',   readonly: true, decimals: 2 },
  { code: 'wmwe_tax',       label: 'Sch 3 — MWE Tax Withheld (always 0 — exempt)',                 section: 'MWE',   readonly: true, decimals: 2 },
  // Totals
  { code: 'total_gross',    label: 'Total Compensation Paid',                                       section: 'TOTAL', readonly: true, decimals: 2 },
  { code: 'total_taxable',  label: 'Net Taxable Compensation (Sch 1 + Sch 2 Gross)',                section: 'TOTAL', readonly: true, decimals: 2 },
  { code: 'total_withheld', label: 'Total Tax Required to Be Withheld for the Month',               section: 'TOTAL', readonly: true, decimals: 2 },
  { code: 'employee_count', label: 'Number of Employees Reported',                                   section: 'TOTAL', readonly: true, decimals: 0 },
];

function getBoxLayout(formCode) {
  if (formCode === '1601-EQ') return BOX_LAYOUT_1601_EQ;
  if (formCode === '1606') return BOX_LAYOUT_1606;
  if (formCode === '1601-C') return BOX_LAYOUT_1601_C;
  throw new Error(`Unsupported form_code for withholding return: ${formCode}`);
}

// ── 1601-EQ aggregator (quarterly EWT) ──────────────────────────────────
async function compute1601EQ({ entityId, year, quarter }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error('Invalid quarter (1-4)');

  const periods = quarterPeriods(year, quarter);
  // 1606 codes (rent) are reported separately on Form 1606 — exclude from 1601-EQ.
  const rows = (await sumByAtcCode(entityId, periods)).filter(r => r._id !== 'WI160' && r._id !== 'WC160');
  const byCode = new Map(rows.map(r => [r._id, r]));

  const get = (code) => byCode.get(code) || { gross: 0, withheld: 0, count: 0 };
  const totals = {
    wi010_gross: round2(get('WI010').gross), wi010_tax: round2(get('WI010').withheld),
    wi011_gross: round2(get('WI011').gross), wi011_tax: round2(get('WI011').withheld),
    wc010_gross: round2(get('WC010').gross), wc010_tax: round2(get('WC010').withheld),
    wc011_gross: round2(get('WC011').gross), wc011_tax: round2(get('WC011').withheld),
    wi080_gross: round2(get('WI080').gross), wi080_tax: round2(get('WI080').withheld),
    wi081_gross: round2(get('WI081').gross), wi081_tax: round2(get('WI081').withheld),
  };
  totals.total_gross = round2(rows.reduce((s, r) => s + r.gross, 0));
  totals.total_withheld = round2(rows.reduce((s, r) => s + r.withheld, 0));

  // Schedule 4 detail — rows for line-by-line payee disclosure on the form.
  const schedule = await listPayees(entityId, periods, ['WI010', 'WI011', 'WC010', 'WC011', 'WI080', 'WI081']);

  const meta = {
    form_code: '1601-EQ',
    entity_id: entityId,
    period_year: year,
    period_quarter: quarter,
    period_label: `${year}-Q${quarter}`,
    period_months: periods,
    source_counts: {
      atc_buckets: rows.length,
      payee_lines: schedule.length,
    },
    box_layout: BOX_LAYOUT_1601_EQ,
    schedule,
    pending_j3: {
      compensation: 'Phase J3 will add 1601-C compensation withholding (separate form).',
    },
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── 1606 aggregator (monthly rent withholding) ──────────────────────────
async function compute1606({ entityId, year, month }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month');

  const period = monthlyPeriod(year, month);
  const rows = (await sumByAtcCode(entityId, [period])).filter(r => r._id === 'WI160' || r._id === 'WC160');
  const byCode = new Map(rows.map(r => [r._id, r]));

  const get = (code) => byCode.get(code) || { gross: 0, withheld: 0, count: 0 };
  const totals = {
    wi160_gross: round2(get('WI160').gross), wi160_tax: round2(get('WI160').withheld),
    wc160_gross: round2(get('WC160').gross), wc160_tax: round2(get('WC160').withheld),
    total_gross: round2(rows.reduce((s, r) => s + r.gross, 0)),
    total_withheld: round2(rows.reduce((s, r) => s + r.withheld, 0)),
  };

  const schedule = await listPayees(entityId, [period], ['WI160', 'WC160']);

  const meta = {
    form_code: '1606',
    entity_id: entityId,
    period_year: year,
    period_month: month,
    period_label: period,
    source_counts: {
      atc_buckets: rows.length,
      landlord_lines: schedule.length,
    },
    box_layout: BOX_LAYOUT_1606,
    schedule,
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── 1601-C aggregator (monthly compensation withholding — Phase J3) ─────
/**
 * Monthly compensation-withholding return. Reads COMPENSATION-direction
 * rows from WithholdingLedger (emitted by `withholdingService.emitCompensation
 * WithholdingForPayslip` at payroll-post time per Rule #20).
 *
 * Box decomposition (mirrors BIR Form 1601-C):
 *   • Sch 1 (WCOMP): regular taxable compensation — gross + withheld
 *   • Sch 2 (W13TH): 13th-month + bonuses excess of ₱90k — gross only
 *                    (tax already counted in Sch 1 withheld)
 *   • Sch 3 (WMWE):  minimum wage earners — gross only, withheld is
 *                    structurally 0 (TRAIN exemption)
 *
 * `total_taxable` = Sch 1 gross + Sch 2 gross (the BIR-defined "Net
 * Taxable Compensation" line, which excludes the MWE pool).
 * `total_withheld` = Sch 1 withheld (Sch 2 + Sch 3 contribute 0).
 * `employee_count` = distinct count of payee_id across all schedules.
 */
async function compute1601C({ entityId, year, month }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month');

  const period = monthlyPeriod(year, month);
  const rows = await sumByAtcCode(entityId, [period], 'INCLUDE', 'COMPENSATION');
  const byCode = new Map(rows.map(r => [r._id, r]));

  const get = (code) => byCode.get(code) || { gross: 0, withheld: 0, count: 0 };
  const wi100 = get('WI100');   // Regular taxable compensation
  const wc120 = get('WC120');   // 13th-month excess
  const wmwe = get('WMWE');     // Minimum wage earner (exempt)

  // Distinct employee count — best effort from the payee schedule. We use
  // the schedule's distinct payee_id set rather than the ATC group counts
  // (those are ROW counts, not employee counts).
  const schedule = await listPayees(entityId, [period], ['WI100', 'WC120', 'WMWE'], 'INCLUDE', 'COMPENSATION');
  const distinctEmployees = new Set(schedule.map(s => String(s.payee_id))).size;

  const totals = {
    wi100_gross: round2(wi100.gross),
    wi100_tax: round2(wi100.withheld),
    wc120_gross: round2(wc120.gross),
    wc120_tax: 0, // structural — tax already in wi100_tax
    wmwe_gross: round2(wmwe.gross),
    wmwe_tax: 0, // structural — exempt
    total_gross: round2(wi100.gross + wc120.gross + wmwe.gross),
    total_taxable: round2(wi100.gross + wc120.gross),
    total_withheld: round2(wi100.withheld),
    employee_count: distinctEmployees,
  };

  const meta = {
    form_code: '1601-C',
    entity_id: entityId,
    period_year: year,
    period_month: month,
    period_label: period,
    source_counts: {
      atc_buckets: rows.length,
      employee_lines: schedule.length,
      distinct_employees: distinctEmployees,
    },
    box_layout: BOX_LAYOUT_1601_C,
    schedule,
    pending_j3b: {
      annual_alphalist: 'Phase J3 Part B will add 1604-CF annual alphalist (.dat writer + 3 schedules).',
    },
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── 2307 outbound PDF generator (per payee per quarter) ─────────────────
/**
 * Renders a BIR Form 2307 (Certificate of Creditable Tax Withheld at Source)
 * PDF buffer for one payee × one quarter. Caller streams the buffer with
 * Content-Disposition. Layout is intentionally text-based — BIR accepts a
 * plain paginated PDF as long as fields align with the official template.
 *
 * Subscribers can later swap this renderer for a pixel-perfect template
 * (mirrors the csiDraftRenderer.js feed-offset pattern), but the data
 * contract stays stable: the PDF reads only from the WithholdingLedger
 * snapshots, not live PeopleMaster/Vendor rows.
 */
async function export2307Pdf({ entityId, payeeKind, payeeId, year, quarter, entity }) {
  if (!entityId || !payeeId || !year || !quarter) {
    throw new Error('export2307Pdf requires entityId, payeeId, year, quarter.');
  }
  const periods = quarterPeriods(year, quarter);
  const rows = await WithholdingLedger.find({
    entity_id: entityId,
    direction: 'OUTBOUND',
    period: { $in: periods },
    payee_kind: payeeKind,
    payee_id: payeeId,
    finance_tag: 'INCLUDE',
  }).sort({ period: 1, atc_code: 1 }).lean();

  if (rows.length === 0) {
    throw new Error(`No INCLUDE-tagged withholding rows for payee ${payeeId} in ${year}-Q${quarter}. Tag rows in finance review first.`);
  }

  const payee = {
    name: rows[rows.length - 1].payee_name_snapshot || '(payee)',
    tin: rows[rows.length - 1].payee_tin_snapshot || 'NOT ON FILE',
    address: rows[rows.length - 1].payee_address_snapshot || '',
  };

  const totals = rows.reduce((acc, r) => {
    acc.gross += r.gross_amount;
    acc.withheld += r.withheld_amount;
    return acc;
  }, { gross: 0, withheld: 0 });

  // Build the PDF.
  const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(11).text('Republika ng Pilipinas — Bureau of Internal Revenue', { align: 'center' });
  doc.fontSize(13).text('BIR Form 2307 — Certificate of Creditable Tax Withheld At Source', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).text(`Quarter: Q${quarter} of ${year}    |    Generated: ${new Date().toISOString()}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(10).text('Withholding Agent (Payor)', { underline: true });
  doc.fontSize(9)
    .text(`Name:    ${entity?.entity_name || ''}`)
    .text(`TIN:     ${entity?.tin || 'NOT SET'}`)
    .text(`Address: ${entity?.address || ''}`)
    .text(`RDO:     ${entity?.rdo_code || 'NOT SET'}`);
  doc.moveDown();

  doc.fontSize(10).text('Payee', { underline: true });
  doc.fontSize(9)
    .text(`Name:    ${payee.name}`)
    .text(`TIN:     ${payee.tin}`)
    .text(`Address: ${payee.address}`);
  doc.moveDown();

  doc.fontSize(10).text('Income Subject to Withholding', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(8.5);
  // Column header
  const tableStart = doc.y;
  doc.text('Period',     36,  tableStart, { width: 70 });
  doc.text('ATC',        110, tableStart, { width: 60 });
  doc.text('Source Doc', 175, tableStart, { width: 130 });
  doc.text('Gross',      310, tableStart, { width: 80, align: 'right' });
  doc.text('Rate',       395, tableStart, { width: 50, align: 'right' });
  doc.text('Withheld',   450, tableStart, { width: 90, align: 'right' });
  doc.moveTo(36, doc.y + 2).lineTo(540, doc.y + 2).stroke();
  doc.moveDown(0.3);

  for (const r of rows) {
    const y = doc.y;
    doc.text(r.period,                        36,  y, { width: 70 });
    doc.text(r.atc_code,                      110, y, { width: 60 });
    doc.text(r.source_doc_ref || '',          175, y, { width: 130 });
    doc.text(fmtMoney(r.gross_amount),        310, y, { width: 80, align: 'right' });
    doc.text(`${(r.withholding_rate * 100).toFixed(2)}%`, 395, y, { width: 50, align: 'right' });
    doc.text(fmtMoney(r.withheld_amount),     450, y, { width: 90, align: 'right' });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.3);
  doc.moveTo(36, doc.y).lineTo(540, doc.y).stroke();
  doc.moveDown(0.4);

  doc.fontSize(10).text(`Total Gross:    ${fmtMoney(totals.gross)}`,    { align: 'right' });
  doc.fontSize(10).text(`Total Withheld: ${fmtMoney(totals.withheld)}`, { align: 'right' });
  doc.moveDown();

  doc.fontSize(8).fillColor('#555')
    .text('This certificate is computer-generated from VIP CRM ERP — Phase VIP-1.J / J2.', { align: 'center' });
  doc.text(`Source rows: ${rows.length}  |  Snapshot frozen at post time per BIR audit posture.`, { align: 'center' });
  doc.fillColor('black');

  doc.end();
  const buffer = await done;
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { buffer, contentHash, totals: { gross: round2(totals.gross), withheld: round2(totals.withheld) }, payee, rowCount: rows.length };
}

function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

// ── SAWT .dat writer (Alphalist Data Entry v7.x) ────────────────────────
/**
 * Emits a fixed-format text payload in the BIR Alphalist Data Entry shape.
 * Format reference: BIR RR 1-2014 + Alphalist Data Entry v7.x manual.
 *
 * Header line (H):
 *   H1|TIN|RegName|Branch|Period|FormType|Year|Quarter
 *
 * Detail line (D) per payee × ATC bucket:
 *   D1|Seq|PayeeTIN|RegName|FirstName|MiddleName|Address|Nature|ATC|TaxBase|Rate|Withheld
 *
 * Trailer (T):
 *   T1|RecordCount|TotalTaxBase|TotalWithheld
 *
 * Subscribers in jurisdictions outside PH can swap this serializer via DI
 * — `serializeSawtDat` is exported standalone so a future
 * `withholdingReturnService.serialize.{country}.js` can replace it via
 * lookup-driven module path.
 */
function serializeSawtDat({ entity, year, quarter, schedule }) {
  const lines = [];
  const header = [
    'H1',
    entity?.tin || 'NOT SET',
    sanitize(entity?.entity_name || ''),
    'HEAD OFFICE',
    `${year}Q${quarter}`,
    'SAWT',
    String(year),
    String(quarter),
  ];
  lines.push(header.join('|'));

  let totalBase = 0;
  let totalWithheld = 0;
  schedule.forEach((r, idx) => {
    const detail = [
      'D1',
      String(idx + 1).padStart(6, '0'),
      r.payee_tin || '',
      sanitize(r.payee_kind === 'VendorMaster' || r.payee_kind === 'Hospital' ? r.payee_name : ''),
      sanitize(r.payee_kind === 'PeopleMaster' || r.payee_kind === 'Doctor' ? r.payee_name : ''),
      '',                                   // middle name (blank — per-payee split next phase)
      sanitize(r.payee_address || ''),
      'BUSINESS',
      r.atc_code || '',
      r.gross.toFixed(2),
      ((r.withheld / Math.max(1, r.gross)) * 100).toFixed(2),
      r.withheld.toFixed(2),
    ];
    totalBase += r.gross;
    totalWithheld += r.withheld;
    lines.push(detail.join('|'));
  });

  const trailer = [
    'T1',
    String(schedule.length).padStart(6, '0'),
    totalBase.toFixed(2),
    totalWithheld.toFixed(2),
  ];
  lines.push(trailer.join('|'));

  return lines.join('\r\n') + '\r\n';
}

function sanitize(s) {
  // Pipe is the SAWT field separator — strip it. Keep other chars including
  // non-Latin (BIR alphalist tooling accepts UTF-8 in modern versions).
  return String(s || '').replace(/\|/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

async function exportSawtDat({ entityId, year, quarter, userId, entity }) {
  if (!Number.isInteger(year) || !Number.isInteger(quarter)) throw new Error('Invalid year/quarter.');
  const periods = quarterPeriods(year, quarter);
  // SAWT excludes 1606 (rent goes through QAP / 1606 separately).
  const schedule = await listPayees(entityId, periods, [
    'WI010', 'WI011', 'WC010', 'WC011', 'WI080', 'WI081',
  ]);

  const datContent = serializeSawtDat({ entity, year, quarter, schedule });
  const contentHash = crypto.createHash('sha256').update(datContent, 'utf8').digest('hex');
  const filename = `SAWT_${year}_Q${quarter}.dat`;

  // Append to BirFilingStatus row (or create) — same audit pattern as J1.
  const filter = {
    entity_id: entityId,
    form_code: 'SAWT',
    period_year: year,
    period_quarter: quarter,
    period_month: null,
    period_payee_id: null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      status: 'DRAFT',
      totals_snapshot: {
        record_count: schedule.length,
        total_gross: round2(schedule.reduce((s, r) => s + r.gross, 0)),
        total_withheld: round2(schedule.reduce((s, r) => s + r.withheld, 0)),
      },
    });
  } else {
    row.totals_snapshot = {
      record_count: schedule.length,
      total_gross: round2(schedule.reduce((s, r) => s + r.gross, 0)),
      total_withheld: round2(schedule.reduce((s, r) => s + r.withheld, 0)),
    };
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: userId,
    artifact_kind: 'DAT',
    filename,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    notes: `SAWT ${year}-Q${quarter} export (${schedule.length} payees)`,
  });
  await row.save();

  return { row, datContent, contentHash, filename, schedule };
}

// ── CSV summary export for 1601-EQ + 1606 ───────────────────────────────
function buildEwtCsv({ totals, meta, entity }) {
  const layout = meta.box_layout;
  const header = ['Box Code', 'Label', 'Value'];
  const dataRows = layout.map(b => [
    b.code,
    b.label,
    Number(totals[b.code] || 0).toFixed(b.decimals || 2),
  ]);

  const headerLines = [
    [`BIR Form ${meta.form_code} — ${meta.period_label}`],
    [`Entity: ${entity?.entity_name || 'N/A'}`],
    [`TIN: ${entity?.tin || 'NOT SET'}`],
    [`RDO Code: ${entity?.rdo_code || 'NOT SET'}`],
    [`Generated at: ${new Date().toISOString()}`],
    [''],
    header,
  ];

  const csvLines = [...headerLines, ...dataRows].map(row => row.map(csvCell).join(',')).join('\r\n');

  // Schedule 1 detail (per-payee) — empty for forms with no schedule attached.
  if (Array.isArray(meta.schedule) && meta.schedule.length) {
    const scheduleHeader = [
      '', // separator row
      ['Schedule — Per-Payee Detail'],
      ['ATC Code', 'Payee Kind', 'Payee Name', 'Payee TIN', 'Gross', 'Withheld', 'Rows'],
    ];
    const scheduleRows = meta.schedule.map(r => [
      r.atc_code,
      r.payee_kind,
      r.payee_name,
      r.payee_tin,
      r.gross.toFixed(2),
      r.withheld.toFixed(2),
      r.count,
    ]);
    return csvLines + '\r\n' + [...scheduleHeader, ...scheduleRows].map(row => row.map(csvCell).join(',')).join('\r\n');
  }
  return csvLines;
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function exportEwtCsv({ formCode, entityId, year, periodMonthOrQuarter, userId, entity }) {
  let computed;
  if (formCode === '1601-EQ') {
    computed = await compute1601EQ({ entityId, year, quarter: periodMonthOrQuarter });
  } else if (formCode === '1606') {
    computed = await compute1606({ entityId, year, month: periodMonthOrQuarter });
  } else if (formCode === '1601-C') {
    // J3 — monthly compensation withholding. Uses month encoding like 1606.
    computed = await compute1601C({ entityId, year, month: periodMonthOrQuarter });
  } else {
    throw new Error(`Unsupported EWT form: ${formCode}`);
  }

  const csvContent = buildEwtCsv({ ...computed, entity });
  const contentHash = crypto.createHash('sha256').update(csvContent, 'utf8').digest('hex');
  let filename;
  if (formCode === '1601-EQ') filename = `1601EQ_${year}-Q${periodMonthOrQuarter}.csv`;
  else if (formCode === '1606') filename = `1606_${year}-${pad2(periodMonthOrQuarter)}.csv`;
  else filename = `1601C_${year}-${pad2(periodMonthOrQuarter)}.csv`; // 1601-C

  const monthlyEncodedForms = ['1606', '1601-C'];
  const filter = {
    entity_id: entityId,
    form_code: formCode,
    period_year: year,
    period_month: monthlyEncodedForms.includes(formCode) ? periodMonthOrQuarter : null,
    period_quarter: formCode === '1601-EQ' ? periodMonthOrQuarter : null,
    period_payee_id: null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      status: 'DRAFT',
      totals_snapshot: computed.totals,
    });
  } else {
    row.totals_snapshot = computed.totals;
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: userId,
    artifact_kind: 'CSV',
    filename,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(csvContent, 'utf8'),
    notes: `${formCode} ${computed.meta.period_label} export`,
  });
  await row.save();

  return { row, csvContent, contentHash, filename, computed };
}

module.exports = {
  compute1601EQ,
  compute1606,
  // Phase J3 — Monthly compensation withholding return
  compute1601C,
  exportEwtCsv,
  export2307Pdf,
  exportSawtDat,
  serializeSawtDat,
  getBoxLayout,
  listPayees,
  // Test seams
  _internals: { sumByAtcCode, buildEwtCsv, round2, sanitize, fmtMoney },
};
