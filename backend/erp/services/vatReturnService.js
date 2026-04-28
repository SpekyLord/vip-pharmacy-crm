/**
 * vatReturnService — Phase VIP-1.J / J1 (Apr 2026)
 *
 * BIR Form 2550M (Monthly VAT Declaration) + 2550Q (Quarterly VAT Return)
 * aggregator. Builds the per-box payload that the form-detail page renders
 * as copy-paste cards into eBIRForms 7.x, plus a CSV-export path with a
 * SHA-256 content hash logged into BirFilingStatus.export_audit_log per
 * Rule #20.
 *
 * Box mapping is BIR-fixed (RR 16-2005 + TRAIN amendments). The labels here
 * are NOT lookup-driven because BIR cannot be subscriber-overridden — a
 * subscriber re-skinning these boxes would risk filing a wrong return. The
 * box codes match the eBIRForms 7.x screen positions. If BIR amends the
 * form layout, this file changes; subscribers are not affected.
 *
 * Source-of-truth boundaries (J1 first-version):
 *   • Output VAT — from VatLedger (vat_type='OUTPUT', finance_tag='INCLUDE').
 *     Engine-created at journalFromSale time (Phase G3) so totals match the
 *     posted journal entries — no double-counting.
 *   • Input VAT — same VatLedger model, vat_type='INPUT'.
 *   • Vatable Sales  — sum gross_amount of those OUTPUT VatLedger rows.
 *   • Exempt Sales   — sum gross_amount of POSTED SalesBookSCPWD rows for the
 *     period (RA 11534 maintenance meds + SC/PWD sales). This is the reliable
 *     J1 signal; broader exempt detection (Customer.vat_status='EXEMPT')
 *     is deferred to J1.1 since the legacy Customer field is not yet wired
 *     into journalFromSale.
 *   • Zero-Rated Sales — sum POSTED Sale rows where customer.vat_status =
 *     'ZERO_RATED'. Stub returns 0 + a "needs J1.1" note when no Sale model
 *     is mounted (current state) so the form still files cleanly.
 *   • Sales to Government — sum POSTED Sale rows where customer.customer_type
 *     code resolves to GOVERNMENT (lookup-driven via Customer.customer_type
 *     → CUSTOMER_TYPE lookup). Same J1.1 stub semantics.
 *   • Input VAT Carryover — pulled from PREVIOUS period's BirFilingStatus
 *     totals_snapshot.net_vat_payable; if negative (credit), carry forward.
 *
 * Net VAT Payable (Box 22A) = Output VAT − (Input VAT current + Input VAT
 *   carryover). Negative values become NEXT period's carryover.
 *
 * Period encoding mirrors VatLedger.period:
 *   • Monthly: 'YYYY-MM'  e.g. '2026-04'
 *   • Quarterly aggregator sums three monthly periods.
 *
 * Subscription-readiness:
 *   • All ENTITY-scoped reads. No global queries.
 *   • Box layout returned as a structured array so the frontend renders it
 *     dynamically — when J3+ adds 1601-C boxes, the same component renders
 *     them with no JSX changes.
 *   • CSV exporter computes SHA-256 of the bytes BEFORE writing to the
 *     audit log so re-exports with byte-level changes are detectable
 *     (Rule #5 audit posture from CLAUDE-ERP).
 */

const crypto = require('crypto');
const VatLedger = require('../models/VatLedger');
const SalesBookSCPWD = require('../models/SalesBookSCPWD');
const BirFilingStatus = require('../models/BirFilingStatus');

// ── Period helpers ────────────────────────────────────────────────────
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

function priorMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function priorQuarter(year, quarter) {
  if (quarter === 1) return { year: year - 1, quarter: 4 };
  return { year, quarter: quarter - 1 };
}

// ── Aggregation primitives ────────────────────────────────────────────
async function sumVatLedger(entityId, periods, vatType, financeTag = 'INCLUDE') {
  const result = await VatLedger.aggregate([
    {
      $match: {
        entity_id: entityId,
        period: { $in: Array.isArray(periods) ? periods : [periods] },
        vat_type: vatType,
        finance_tag: financeTag,
      },
    },
    {
      $group: {
        _id: null,
        gross: { $sum: '$gross_amount' },
        vat: { $sum: '$vat_amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  return result[0] || { gross: 0, vat: 0, count: 0 };
}

async function sumScpwdExemptForMonths(entityId, months) {
  // months is [{ year, month }, …]. Returns gross + count of POSTED rows.
  if (!months.length) return { gross: 0, count: 0 };
  const orClauses = months.map(({ year, month }) => ({
    'bir_period.year': year,
    'bir_period.month': month,
  }));
  const result = await SalesBookSCPWD.aggregate([
    {
      $match: {
        entity_id: entityId,
        status: 'POSTED',
        $or: orClauses,
      },
    },
    {
      $group: {
        _id: null,
        gross: { $sum: '$gross_amount' },
        count: { $sum: 1 },
      },
    },
  ]);
  return result[0] || { gross: 0, count: 0 };
}

/**
 * Read the previous period's net VAT payable so we can carry forward an
 * input-VAT credit (negative) into the current period. If the prior row is
 * not stored (FILED/CONFIRMED rows always store totals_snapshot), returns 0.
 *
 * For 2550M: looks at the prior MONTH.
 * For 2550Q: looks at the prior QUARTER.
 *
 * BIR convention: only excess input VAT carries forward; if last period had
 * a payable (positive), there is no credit to carry. We surface 0 in that
 * case rather than a "negative carryover".
 */
async function readPriorCarryover(entityId, formCode, year, monthOrQuarter) {
  let priorFilter;
  if (formCode === '2550M') {
    const p = priorMonth(year, monthOrQuarter);
    priorFilter = {
      entity_id: entityId,
      form_code: '2550M',
      period_year: p.year,
      period_month: p.month,
    };
  } else if (formCode === '2550Q') {
    const p = priorQuarter(year, monthOrQuarter);
    priorFilter = {
      entity_id: entityId,
      form_code: '2550Q',
      period_year: p.year,
      period_quarter: p.quarter,
    };
  } else {
    return 0;
  }

  const prior = await BirFilingStatus.findOne(priorFilter).lean();
  const net = prior?.totals_snapshot?.net_vat_payable;
  if (typeof net !== 'number') return 0;
  // Negative net = excess input VAT credit → positive carryover this period.
  return net < 0 ? Math.abs(net) : 0;
}

// ── BIR form box layouts (BIR-fixed; not lookup-driven by design) ─────
//
// Each box descriptor:
//   { code: 'BOX_KEY', label: 'BIR Field Name (Box code on form)',
//     section: 'SALES'|'OUTPUT'|'INPUT'|'PAYABLE', readonly: bool,
//     decimals: 2 }
//
// `code` is what the frontend keys against the totals payload.
// `section` is for UI grouping; `readonly` flags computed totals that the
// user does not type into eBIRForms (they auto-populate there too).

const BOX_LAYOUT_2550M = [
  // 13 — Sales / Receipts
  { code: 'vatable_sales',          label: '13A — Vatable Sales / Receipts (gross of VAT)',                 section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'zero_rated_sales',       label: '14A — Zero-Rated Sales / Receipts',                              section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'exempt_sales',           label: '15A — Exempt Sales / Receipts (RA 11534 + SC/PWD)',              section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'sales_to_government',    label: '16A — Sales to Government (subject to 5% final VAT)',           section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'total_sales',            label: '17A — Total Sales / Receipts',                                  section: 'SALES',   readonly: true,  decimals: 2 },
  // 18 — Output VAT
  { code: 'output_vat',             label: '18A — Output Tax Due (12% of Vatable Sales)',                   section: 'OUTPUT',  readonly: true,  decimals: 2 },
  // 19-21 — Input VAT
  { code: 'input_vat_carryover',    label: '20A — Input Tax Carried Over from Previous Period',             section: 'INPUT',   readonly: true,  decimals: 2 },
  { code: 'input_vat_current',      label: '20B — Input Tax on Current Period Purchases',                   section: 'INPUT',   readonly: false, decimals: 2 },
  { code: 'total_input_vat',        label: '20G — Total Available Input Tax',                                section: 'INPUT',   readonly: true,  decimals: 2 },
  // 22 — Net VAT Payable / (Excess Input VAT)
  { code: 'net_vat_payable',        label: '22A — Net VAT Payable / (Excess Input VAT carry-forward)',       section: 'PAYABLE', readonly: true,  decimals: 2 },
];

const BOX_LAYOUT_2550Q = [
  { code: 'vatable_sales',          label: '13A — Vatable Sales / Receipts for the Quarter',                section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'zero_rated_sales',       label: '14A — Zero-Rated Sales / Receipts for the Quarter',             section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'exempt_sales',           label: '15A — Exempt Sales / Receipts (RA 11534 + SC/PWD)',             section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'sales_to_government',    label: '16A — Sales to Government for the Quarter',                     section: 'SALES',   readonly: false, decimals: 2 },
  { code: 'total_sales',            label: '17A — Total Sales / Receipts',                                  section: 'SALES',   readonly: true,  decimals: 2 },
  { code: 'output_vat',             label: '18A — Output Tax Due (12% of Quarterly Vatable Sales)',         section: 'OUTPUT',  readonly: true,  decimals: 2 },
  { code: 'input_vat_carryover',    label: '20A — Input Tax Carried Over from Previous Quarter',            section: 'INPUT',   readonly: true,  decimals: 2 },
  { code: 'input_vat_current',      label: '20B — Input Tax on Quarterly Purchases',                        section: 'INPUT',   readonly: false, decimals: 2 },
  { code: 'total_input_vat',        label: '20G — Total Available Input Tax for the Quarter',               section: 'INPUT',   readonly: true,  decimals: 2 },
  { code: 'net_vat_payable',        label: '22A — Net VAT Payable / (Excess Input VAT carry-forward)',      section: 'PAYABLE', readonly: true,  decimals: 2 },
];

function getBoxLayout(formCode) {
  if (formCode === '2550M') return BOX_LAYOUT_2550M;
  if (formCode === '2550Q') return BOX_LAYOUT_2550Q;
  throw new Error(`Unsupported form_code for VAT return: ${formCode}`);
}

// ── 2550M aggregator ──────────────────────────────────────────────────
async function compute2550M({ entityId, year, month }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid month (1-12)');

  const period = monthlyPeriod(year, month);
  const [output, input, scpwd, carryover] = await Promise.all([
    sumVatLedger(entityId, [period], 'OUTPUT'),
    sumVatLedger(entityId, [period], 'INPUT'),
    sumScpwdExemptForMonths(entityId, [{ year, month }]),
    readPriorCarryover(entityId, '2550M', year, month),
  ]);

  // J1 stub: zero_rated and sales_to_government wait on customer-vat-status
  // join (J1.1). Returning 0 with a flag the UI surfaces as "needs J1.1".
  const totals = {
    vatable_sales:        round2(output.gross),
    zero_rated_sales:     0,
    exempt_sales:         round2(scpwd.gross),
    sales_to_government:  0,
    total_sales:          round2(output.gross + scpwd.gross),
    output_vat:           round2(output.vat),
    input_vat_carryover:  round2(carryover),
    input_vat_current:    round2(input.vat),
    total_input_vat:      round2(carryover + input.vat),
    net_vat_payable:      round2(output.vat - carryover - input.vat),
  };

  const meta = {
    form_code: '2550M',
    entity_id: entityId,
    period_year: year,
    period_month: month,
    period_label: period,
    source_counts: {
      output_vat_rows: output.count,
      input_vat_rows: input.count,
      scpwd_exempt_rows: scpwd.count,
    },
    pending_j11: {
      // Flag boxes that are stubbed pending J1.1 customer-type integration.
      zero_rated_sales: 'Phase J1.1 will join Sale.customer.vat_status to break out zero-rated sales. Currently stubbed at 0.',
      sales_to_government: 'Phase J1.1 will join Sale.customer.customer_type for the GOVERNMENT bucket. Currently stubbed at 0.',
    },
    box_layout: BOX_LAYOUT_2550M,
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── 2550Q aggregator ──────────────────────────────────────────────────
async function compute2550Q({ entityId, year, quarter }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error('Invalid quarter (1-4)');

  const periods = quarterPeriods(year, quarter);
  const months = QUARTER_MONTHS[quarter].map(m => ({ year, month: parseInt(m, 10) }));
  const [output, input, scpwd, carryover] = await Promise.all([
    sumVatLedger(entityId, periods, 'OUTPUT'),
    sumVatLedger(entityId, periods, 'INPUT'),
    sumScpwdExemptForMonths(entityId, months),
    readPriorCarryover(entityId, '2550Q', year, quarter),
  ]);

  const totals = {
    vatable_sales:        round2(output.gross),
    zero_rated_sales:     0,
    exempt_sales:         round2(scpwd.gross),
    sales_to_government:  0,
    total_sales:          round2(output.gross + scpwd.gross),
    output_vat:           round2(output.vat),
    input_vat_carryover:  round2(carryover),
    input_vat_current:    round2(input.vat),
    total_input_vat:      round2(carryover + input.vat),
    net_vat_payable:      round2(output.vat - carryover - input.vat),
  };

  const meta = {
    form_code: '2550Q',
    entity_id: entityId,
    period_year: year,
    period_quarter: quarter,
    period_label: `${year}-Q${quarter}`,
    period_months: periods,
    source_counts: {
      output_vat_rows: output.count,
      input_vat_rows: input.count,
      scpwd_exempt_rows: scpwd.count,
    },
    pending_j11: {
      zero_rated_sales: 'Phase J1.1 will break out zero-rated sales. Currently 0.',
      sales_to_government: 'Phase J1.1 will break out the GOVERNMENT bucket. Currently 0.',
    },
    box_layout: BOX_LAYOUT_2550Q,
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── CSV serializer (shared between 2550M and 2550Q) ────────────────────
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

function buildCsv({ totals, meta, entity }) {
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
  return toCsv([...headerLines, ...dataRows]);
}

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

/**
 * Materialize / refresh the BirFilingStatus row for this period and
 * append an export entry (CSV) to its export_audit_log. Returns the
 * { row, csvContent, contentHash, filename } tuple. Caller streams the CSV.
 *
 * Atomicity: the row update is a single document save; the audit-log
 * append is part of the same save. There is no inter-document transaction
 * because the only side-effect is updating one row.
 *
 * Period-lock interaction: the export ITSELF does not change financial
 * period state — it's a read. Period-lock middleware on mark-filed (Phase
 * G3) is the gate that prevents post-CONFIRMED edits.
 */
async function exportFormCsv({ formCode, entityId, year, periodMonthOrQuarter, userId, entity }) {
  let computed;
  if (formCode === '2550M') {
    computed = await compute2550M({ entityId, year, month: periodMonthOrQuarter });
  } else if (formCode === '2550Q') {
    computed = await compute2550Q({ entityId, year, quarter: periodMonthOrQuarter });
  } else {
    throw new Error(`Unsupported form_code: ${formCode}`);
  }

  const csvContent = buildCsv({ ...computed, entity });
  const contentHash = crypto.createHash('sha256').update(csvContent, 'utf8').digest('hex');
  const filename = formCode === '2550M'
    ? `2550M_${year}-${pad2(periodMonthOrQuarter)}.csv`
    : `2550Q_${year}-Q${periodMonthOrQuarter}.csv`;

  // Find or create the BirFilingStatus row for this period and append audit.
  const filter = {
    entity_id: entityId,
    form_code: formCode,
    period_year: year,
    period_month: formCode === '2550M' ? periodMonthOrQuarter : null,
    period_quarter: formCode === '2550Q' ? periodMonthOrQuarter : null,
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
    // Refresh the snapshot so the dashboard heatmap has fresh numbers,
    // but do NOT downgrade status from FILED/CONFIRMED back to DRAFT.
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
  compute2550M,
  compute2550Q,
  exportFormCsv,
  getBoxLayout,
  // Test seams
  _internals: { sumVatLedger, sumScpwdExemptForMonths, readPriorCarryover, buildCsv, round2 },
};
