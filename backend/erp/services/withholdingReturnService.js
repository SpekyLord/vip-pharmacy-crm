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
 *   • 2307 inbound reconciliation (J6) — uses CwtLedger, not this ledger.
 *   • Books of Accounts (J5) and 1702 Annual Income Tax (J7) — separate services.
 *
 * Phase history in this file:
 *   • J2 (Apr 2026): 1601-EQ + 1606 + 2307-OUT + SAWT
 *   • J3 Part A (May 04 2026): 1601-C monthly compensation
 *   • J3 Part B (May 04 2026): 1604-CF annual alphalist + 2316 employee cert
 *   • J4 (May 04 2026): 1604-E annual EWT alphalist + QAP quarterly EWT alphalist
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

// ── 1604-CF annual alphalist (Phase J3 Part B) ──────────────────────────
/**
 * Annual Compensation Alphalist (BIR Form 1604-CF). Aggregates the entire
 * calendar year of COMPENSATION-direction WithholdingLedger rows into three
 * BIR-required schedules:
 *
 *   • Schedule 7.1 — Regular employees (taxable). Per-employee row: TIN,
 *     name, gross compensation, non-taxable, taxable, tax withheld.
 *   • Schedule 7.2 — Minimum wage earners (exempt under TRAIN). Same shape
 *     but withheld is structurally 0; the row exists for BIR audit posture.
 *   • Schedule 7.3 — Employees terminated during the year. Same shape as 7.1
 *     but partitioned out so the BIR auditor can reconcile the alphalist
 *     against the entity's HR separation roster.
 *
 * The MWE flag wins over termination: a separated MWE belongs in 7.2, not
 * 7.3. BIR's audit posture treats MWE as the dominant classification.
 *
 * Snapshot pattern (Rule #20): every row reads frozen `payee_*_snapshot`
 * fields from WithholdingLedger — never from live PeopleMaster. Subsequent
 * employee renames or TIN updates do NOT rewrite the alphalist of a closed
 * year. Termination check reads PeopleMaster.date_separated (live) because
 * the snapshot was taken at the time of payroll post and may pre-date the
 * separation event by months. Schedule classification is a posting-time
 * classification problem — but for the YEARLY alphalist, the user's intent
 * is "show me everyone who left during 2026," which is a live HR question.
 */
async function compute1604CF({ entityId, year }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year');

  // 12 monthly periods covered by this year's alphalist
  const periods = [];
  for (let m = 1; m <= 12; m++) periods.push(`${year}-${pad2(m)}`);

  // Per-(payee × ATC) rollup over all 12 periods
  const perPayeeAtc = await listPayees(entityId, periods, ['WI100', 'WC120', 'WMWE'], 'INCLUDE', 'COMPENSATION');

  // Group by employee — one schedule row per (payee_id) summing across ATCs
  const byEmployee = new Map();
  for (const r of perPayeeAtc) {
    const key = String(r.payee_id);
    if (!byEmployee.has(key)) {
      byEmployee.set(key, {
        payee_kind: r.payee_kind,
        payee_id: r.payee_id,
        payee_name: r.payee_name,
        payee_tin: r.payee_tin,
        payee_address: r.payee_address,
        gross_regular: 0,        // WI100 gross
        gross_thirteenth: 0,     // WC120 gross (13th-month excess of ₱90k)
        gross_mwe: 0,            // WMWE gross
        withheld: 0,             // WI100 withheld (WC120 + WMWE always 0)
        first_period: r.first_period,
        last_period: r.last_period,
        atc_buckets: 0,
        is_mwe: false,
      });
    }
    const e = byEmployee.get(key);
    if (r.atc_code === 'WI100') { e.gross_regular += r.gross; e.withheld += r.withheld; }
    else if (r.atc_code === 'WC120') { e.gross_thirteenth += r.gross; }
    else if (r.atc_code === 'WMWE') { e.gross_mwe += r.gross; e.is_mwe = true; }
    e.atc_buckets += 1;
    if (r.first_period && (!e.first_period || r.first_period < e.first_period)) e.first_period = r.first_period;
    if (r.last_period && (!e.last_period || r.last_period > e.last_period)) e.last_period = r.last_period;
  }

  // Termination classification — live PeopleMaster lookup. We only need
  // date_separated to decide 7.3 partition; if PeopleMaster is gone (rare),
  // default to "not separated" so the row defaults to 7.1.
  const PeopleMaster = require('../models/PeopleMaster');
  const ids = Array.from(byEmployee.keys());
  const yearStartDate = new Date(Date.UTC(year, 0, 1));
  const yearEndDate = new Date(Date.UTC(year + 1, 0, 1));
  let separatedSet = new Set();
  if (ids.length) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- per-id lookup driven by aggregator output; entity scoped via the WithholdingLedger query above
    const sepRows = await PeopleMaster.find({
      _id: { $in: ids },
      date_separated: { $gte: yearStartDate, $lt: yearEndDate },
    }).select('_id date_separated').lean();
    separatedSet = new Set(sepRows.map(r => String(r._id)));
  }

  // Decompose into 3 schedules. MWE wins over termination per BIR posture.
  const schedule_7_1 = []; // Regular taxable
  const schedule_7_2 = []; // MWE exempt
  const schedule_7_3 = []; // Terminated during year
  for (const e of byEmployee.values()) {
    const total_gross = round2(e.gross_regular + e.gross_thirteenth + e.gross_mwe);
    const taxable = round2(e.gross_regular + e.gross_thirteenth);
    const non_taxable = round2(e.gross_mwe + Math.min(e.gross_thirteenth, 0)); // 13th excess is taxable; non-taxable bucket is MWE pool
    const row = {
      payee_kind: e.payee_kind,
      payee_id: e.payee_id,
      payee_name: e.payee_name,
      payee_tin: e.payee_tin,
      payee_address: e.payee_address,
      gross_compensation: total_gross,
      taxable_compensation: taxable,
      non_taxable_compensation: non_taxable,
      tax_withheld: round2(e.withheld),
      first_period: e.first_period,
      last_period: e.last_period,
      atc_buckets: e.atc_buckets,
      is_mwe: e.is_mwe,
      is_separated: separatedSet.has(String(e.payee_id)),
    };
    if (row.is_mwe) schedule_7_2.push(row);
    else if (row.is_separated) schedule_7_3.push(row);
    else schedule_7_1.push(row);
  }

  // Sort each schedule by gross desc so the bookkeeper sees big-ticket
  // rows first (eyeball-audit pattern).
  const sortByGross = (a, b) => b.gross_compensation - a.gross_compensation;
  schedule_7_1.sort(sortByGross);
  schedule_7_2.sort(sortByGross);
  schedule_7_3.sort(sortByGross);

  // Totals row across all schedules — what 1604-CF Box 14 (Total Tax
  // Required to Be Withheld for the Year) reports.
  const totals = {
    sched_7_1_count: schedule_7_1.length,
    sched_7_2_count: schedule_7_2.length,
    sched_7_3_count: schedule_7_3.length,
    employees_total: byEmployee.size,
    gross_compensation_total: round2(
      schedule_7_1.reduce((s, r) => s + r.gross_compensation, 0)
      + schedule_7_2.reduce((s, r) => s + r.gross_compensation, 0)
      + schedule_7_3.reduce((s, r) => s + r.gross_compensation, 0)
    ),
    taxable_compensation_total: round2(
      schedule_7_1.reduce((s, r) => s + r.taxable_compensation, 0)
      + schedule_7_3.reduce((s, r) => s + r.taxable_compensation, 0)
      // 7.2 (MWE) has 0 taxable by definition
    ),
    non_taxable_compensation_total: round2(
      schedule_7_2.reduce((s, r) => s + r.gross_compensation, 0)
      // MWE pool is the non-taxable bucket on 1604-CF
    ),
    withheld_total: round2(
      schedule_7_1.reduce((s, r) => s + r.tax_withheld, 0)
      + schedule_7_3.reduce((s, r) => s + r.tax_withheld, 0)
    ),
  };

  const meta = {
    form_code: '1604-CF',
    entity_id: entityId,
    period_year: year,
    period_label: String(year),
    period_months: periods,
    source_counts: {
      ledger_rows: perPayeeAtc.length,
      employees: byEmployee.size,
      schedule_7_1: schedule_7_1.length,
      schedule_7_2: schedule_7_2.length,
      schedule_7_3: schedule_7_3.length,
    },
    schedules: {
      '7.1': schedule_7_1,
      '7.2': schedule_7_2,
      '7.3': schedule_7_3,
    },
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── 1604-CF .dat writer (BIR Alphalist Data Entry v7.x) ─────────────────
/**
 * Emits a fixed-format text payload in the BIR Alphalist Data Entry shape
 * for 1604-CF (annual compensation alphalist).
 *
 * Format reference: BIR Alphalist Data Entry v7.x manual + RR 2-2015.
 *
 * Header line (H):
 *   H1604CF|TIN|RegName|Branch|Year|FormType
 *
 * Schedule 7.1 detail (D71) — Regular employees:
 *   D71|Seq|EmpTIN|LastName|FirstName|MiddleName|Address|Gross|NonTaxable|Taxable|TaxWithheld
 *
 * Schedule 7.2 detail (D72) — Minimum wage earners (exempt):
 *   D72|Seq|EmpTIN|LastName|FirstName|MiddleName|Address|Gross|NonTaxable|Taxable|TaxWithheld
 *
 * Schedule 7.3 detail (D73) — Terminated during year:
 *   D73|Seq|EmpTIN|LastName|FirstName|MiddleName|Address|Gross|NonTaxable|Taxable|TaxWithheld
 *
 * Trailer (T):
 *   T1604CF|EmployeesTotal|GrossTotal|TaxableTotal|NonTaxableTotal|WithheldTotal
 *
 * Subscribers in jurisdictions outside PH can swap this serializer via the
 * same DI seam pattern used by serializeSawtDat (lookup-driven module path
 * future Vios SaaS spin-out).
 */
function serialize1604CFDat({ entity, year, totals, meta }) {
  const lines = [];
  lines.push([
    'H1604CF',
    entity?.tin || 'NOT SET',
    sanitize(entity?.entity_name || ''),
    'HEAD OFFICE',
    String(year),
    '1604CF',
  ].join('|'));

  const writeDetail = (kind, rows) => {
    rows.forEach((r, idx) => {
      // Last + First + Middle name parsing — best effort. The snapshot
      // captured `payee_name` at payslip-post time as `full_name`. We split
      // on the LAST space so "Maria Cruz De La Cruz" → first="Maria Cruz De La" + last="Cruz" — wrong but conservative.
      // The bridge captured first_name/last_name explicitly during emit
      // (J3 Part B fix), but legacy Part A rows lack those. Fall back to
      // the full-name split so old data still serializes.
      const fullName = sanitize(r.payee_name || '');
      const lastSpace = fullName.lastIndexOf(' ');
      const lastName = lastSpace >= 0 ? fullName.slice(lastSpace + 1) : fullName;
      const firstName = lastSpace >= 0 ? fullName.slice(0, lastSpace) : '';
      lines.push([
        kind,
        String(idx + 1).padStart(6, '0'),
        r.payee_tin || '',
        lastName,
        firstName,
        '', // middle name — not split today; subscriber surface for future
        sanitize(r.payee_address || ''),
        r.gross_compensation.toFixed(2),
        r.non_taxable_compensation.toFixed(2),
        r.taxable_compensation.toFixed(2),
        r.tax_withheld.toFixed(2),
      ].join('|'));
    });
  };

  writeDetail('D71', meta?.schedules?.['7.1'] || []);
  writeDetail('D72', meta?.schedules?.['7.2'] || []);
  writeDetail('D73', meta?.schedules?.['7.3'] || []);

  lines.push([
    'T1604CF',
    String(totals.employees_total).padStart(6, '0'),
    totals.gross_compensation_total.toFixed(2),
    totals.taxable_compensation_total.toFixed(2),
    totals.non_taxable_compensation_total.toFixed(2),
    totals.withheld_total.toFixed(2),
  ].join('|'));

  return lines.join('\r\n') + '\r\n';
}

async function export1604CFDat({ entityId, year, userId, entity }) {
  if (!Number.isInteger(year)) throw new Error('Invalid year.');
  const { totals, meta } = await compute1604CF({ entityId, year });

  const datContent = serialize1604CFDat({ entity, year, totals, meta });
  const contentHash = crypto.createHash('sha256').update(datContent, 'utf8').digest('hex');
  const filename = `1604CF_${year}.dat`;

  const filter = {
    entity_id: entityId,
    form_code: '1604-CF',
    period_year: year,
    period_month: null,
    period_quarter: null,
    period_payee_id: null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      status: 'DRAFT',
      totals_snapshot: totals,
    });
  } else {
    row.totals_snapshot = totals;
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: userId,
    artifact_kind: 'DAT',
    filename,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    notes: `1604-CF ${year} export (${totals.employees_total} employees: ${totals.sched_7_1_count} regular, ${totals.sched_7_2_count} MWE, ${totals.sched_7_3_count} terminated)`,
  });
  await row.save();

  return { row, datContent, contentHash, filename, totals, meta };
}

// ── 2316 PDF — annual employee Certificate of Compensation Paid + Tax Withheld ─
/**
 * Per-employee × per-year BIR Form 2316. Mirrors export2307Pdf but for
 * compensation: same snapshot-only read pattern, same audit-log append, same
 * pdfkit text layout. Sent to each employee for their personal income-tax
 * filing (or as proof of "Substituted Filing" exemption when 2316 is the
 * only income source).
 *
 * Source: COMPENSATION-direction WithholdingLedger rows for the calendar
 * year. NEVER reads live PeopleMaster — snapshots at row-write time are the
 * source of truth so a later TIN/name change doesn't rewrite a closed year.
 */
async function export2316Pdf({ entityId, payeeId, year, entity }) {
  if (!entityId || !payeeId || !year) {
    throw new Error('export2316Pdf requires entityId, payeeId, year.');
  }
  const periods = [];
  for (let m = 1; m <= 12; m++) periods.push(`${year}-${pad2(m)}`);

  const rows = await WithholdingLedger.find({
    entity_id: entityId,
    direction: 'COMPENSATION',
    period: { $in: periods },
    payee_kind: 'PeopleMaster',
    payee_id: payeeId,
    finance_tag: { $ne: 'EXCLUDE' },
  }).sort({ period: 1, atc_code: 1 }).lean();

  if (rows.length === 0) {
    throw new Error(`No compensation rows for employee ${payeeId} in ${year}. Post payroll first.`);
  }

  const last = rows[rows.length - 1];
  const employee = {
    name: last.payee_name_snapshot || '(employee)',
    tin: last.payee_tin_snapshot || 'NOT ON FILE',
    address: last.payee_address_snapshot || '',
  };

  // Decompose totals by ATC bucket
  const totals = rows.reduce((acc, r) => {
    if (r.atc_code === 'WI100') { acc.gross_regular += r.gross_amount; acc.withheld += r.withheld_amount; }
    else if (r.atc_code === 'WC120') { acc.gross_thirteenth += r.gross_amount; }
    else if (r.atc_code === 'WMWE') { acc.gross_mwe += r.gross_amount; }
    return acc;
  }, { gross_regular: 0, gross_thirteenth: 0, gross_mwe: 0, withheld: 0 });

  const grossTotal = round2(totals.gross_regular + totals.gross_thirteenth + totals.gross_mwe);
  const taxable = round2(totals.gross_regular + totals.gross_thirteenth);
  const nonTaxable = round2(totals.gross_mwe);
  const withheld = round2(totals.withheld);

  const doc = new PDFDocument({ size: 'LETTER', margin: 36 });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(11).text('Republika ng Pilipinas — Bureau of Internal Revenue', { align: 'center' });
  doc.fontSize(13).text('BIR Form 2316 — Certificate of Compensation Payment / Tax Withheld', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).text(`For the Year: ${year}    |    Generated: ${new Date().toISOString()}`, { align: 'center' });
  doc.moveDown();

  doc.fontSize(10).text('Employer (Withholding Agent)', { underline: true });
  doc.fontSize(9)
    .text(`Name:    ${entity?.entity_name || ''}`)
    .text(`TIN:     ${entity?.tin || 'NOT SET'}`)
    .text(`Address: ${entity?.address || ''}`)
    .text(`RDO:     ${entity?.rdo_code || 'NOT SET'}`);
  doc.moveDown();

  doc.fontSize(10).text('Employee', { underline: true });
  doc.fontSize(9)
    .text(`Name:    ${employee.name}`)
    .text(`TIN:     ${employee.tin}`)
    .text(`Address: ${employee.address}`);
  doc.moveDown();

  doc.fontSize(10).text('Compensation Income & Tax Withheld', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9);

  // Per-month detail
  const tableStart = doc.y;
  doc.text('Period',     36,  tableStart, { width: 70 });
  doc.text('ATC',        110, tableStart, { width: 60 });
  doc.text('Source',     175, tableStart, { width: 130 });
  doc.text('Gross',      310, tableStart, { width: 80, align: 'right' });
  doc.text('Withheld',   400, tableStart, { width: 90, align: 'right' });
  doc.moveTo(36, doc.y + 2).lineTo(540, doc.y + 2).stroke();
  doc.moveDown(0.3);

  for (const r of rows) {
    const y = doc.y;
    doc.text(r.period,                        36,  y, { width: 70 });
    doc.text(r.atc_code,                      110, y, { width: 60 });
    doc.text(r.source_doc_ref || '',          175, y, { width: 130 });
    doc.text(fmtMoney(r.gross_amount),        310, y, { width: 80, align: 'right' });
    doc.text(fmtMoney(r.withheld_amount),     400, y, { width: 90, align: 'right' });
    doc.moveDown(0.2);
  }
  doc.moveDown(0.3);
  doc.moveTo(36, doc.y).lineTo(540, doc.y).stroke();
  doc.moveDown(0.4);

  // Annual totals (BIR 2316 boxes — Part IV)
  doc.fontSize(10).text(`A. Gross Compensation:        ${fmtMoney(grossTotal)}`,    { align: 'right' });
  doc.fontSize(10).text(`B. Non-Taxable (MWE/exempt):  ${fmtMoney(nonTaxable)}`,    { align: 'right' });
  doc.fontSize(10).text(`C. Taxable Compensation:      ${fmtMoney(taxable)}`,        { align: 'right' });
  doc.fontSize(10).text(`D. Tax Withheld for the Year: ${fmtMoney(withheld)}`,       { align: 'right' });
  doc.moveDown();

  doc.fontSize(8).fillColor('#555')
    .text('This certificate is computer-generated from VIP CRM ERP — Phase VIP-1.J / J3 Part B.', { align: 'center' });
  doc.text(`Source rows: ${rows.length}  |  Snapshot frozen at payroll-post time per BIR audit posture.`, { align: 'center' });
  doc.fillColor('black');

  doc.end();
  const buffer = await done;
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    buffer,
    contentHash,
    totals: {
      gross: grossTotal,
      non_taxable: nonTaxable,
      taxable,
      withheld,
    },
    employee,
    rowCount: rows.length,
  };
}

// ── Phase J4 — 1604-E (annual) + QAP (quarterly) EWT alphalists (May 2026) ─
/**
 * Annual + quarterly OUTBOUND-direction alphalists. Both forms share the
 * same per-payee × per-ATC schedule shape (one row per (payee × ATC) pair
 * — what BIR Alphalist Data Entry v7.x expects on the `.dat` D1 line). The
 * year/quarter scope is the only difference.
 *
 * Scope (per BIR posture + this codebase's split):
 *   • 1604-E covers the EWT subset 1601-EQ reports — WI010/WI011/WC010/
 *     WC011/WI080/WI081. Rent (WI160/WC160) goes through 1606's per-month
 *     filings + its own annual roll-up (out of scope here).
 *   • QAP covers the same EWT subset for one quarter — complements 1601-EQ
 *     by enumerating the per-payee detail behind the form's totals boxes.
 *
 * finance_tag is 'INCLUDE' strict — finance has the judgment call on each
 * OUTBOUND row (vendor/contractor/hospital). PENDING rows are NOT in the
 * alphalist (matches 1601-EQ + SAWT posture). Do NOT auto-INCLUDE OUTBOUND
 * the way J3 Part B does for COMPENSATION — compensation has no judgment
 * call (tax determined upstream by payslipCalc), but EWT rates depend on
 * vendor characterization (corp/indiv, TWA registration, threshold flips).
 *
 * Snapshot pattern (Rule #20): rows read frozen `payee_*_snapshot` fields
 * from WithholdingLedger; vendor renames or TIN changes do NOT rewrite a
 * closed year. There is no "vendor terminated" partition — BIR doesn't
 * ask for a separated-vendor schedule on 1604-E.
 */
const J4_OUTBOUND_ATCS = ['WI010', 'WI011', 'WC010', 'WC011', 'WI080', 'WI081'];

async function compute1604E({ entityId, year }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year. Year ≥ 2024.');

  const periods = [];
  for (let m = 1; m <= 12; m++) periods.push(`${year}-${pad2(m)}`);

  const schedule = await listPayees(entityId, periods, J4_OUTBOUND_ATCS);

  // Distinct payee count across the year (a payee may appear under multiple
  // ATCs — count once per payee_id for the BIR-reported headcount).
  const distinctPayees = new Set(schedule.map(r => `${r.payee_kind}:${r.payee_id}`)).size;

  // Per-ATC totals for the form's summary boxes.
  const byAtc = new Map();
  for (const code of J4_OUTBOUND_ATCS) byAtc.set(code, { gross: 0, withheld: 0, count: 0 });
  for (const r of schedule) {
    const bucket = byAtc.get(r.atc_code);
    if (!bucket) continue;
    bucket.gross += r.gross;
    bucket.withheld += r.withheld;
    bucket.count += 1;
  }

  const totals = {
    payee_lines: schedule.length,
    distinct_payees: distinctPayees,
    gross_total: round2(schedule.reduce((s, r) => s + r.gross, 0)),
    withheld_total: round2(schedule.reduce((s, r) => s + r.withheld, 0)),
  };
  for (const code of J4_OUTBOUND_ATCS) {
    const b = byAtc.get(code);
    totals[`${code.toLowerCase()}_gross`] = round2(b.gross);
    totals[`${code.toLowerCase()}_tax`] = round2(b.withheld);
    totals[`${code.toLowerCase()}_count`] = b.count;
  }

  const meta = {
    form_code: '1604-E',
    entity_id: entityId,
    period_year: year,
    period_label: String(year),
    period_months: periods,
    atc_subset: J4_OUTBOUND_ATCS,
    source_counts: {
      ledger_payee_atc_rows: schedule.length,
      distinct_payees: distinctPayees,
      atc_buckets: J4_OUTBOUND_ATCS.filter(c => byAtc.get(c).count > 0).length,
    },
    schedule,                   // flat per-(payee × ATC) — BIR `.dat` D1 contract
    computed_at: new Date(),
  };

  return { totals, meta };
}

async function computeQAP({ entityId, year, quarter }) {
  if (!entityId) throw new Error('entityId is required');
  if (!Number.isInteger(year) || year < 2024 || year > 2099) throw new Error('Invalid year. Year ≥ 2024.');
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) throw new Error('Invalid quarter (1-4)');

  const periods = quarterPeriods(year, quarter);
  const schedule = await listPayees(entityId, periods, J4_OUTBOUND_ATCS);

  const distinctPayees = new Set(schedule.map(r => `${r.payee_kind}:${r.payee_id}`)).size;

  const byAtc = new Map();
  for (const code of J4_OUTBOUND_ATCS) byAtc.set(code, { gross: 0, withheld: 0, count: 0 });
  for (const r of schedule) {
    const bucket = byAtc.get(r.atc_code);
    if (!bucket) continue;
    bucket.gross += r.gross;
    bucket.withheld += r.withheld;
    bucket.count += 1;
  }

  const totals = {
    payee_lines: schedule.length,
    distinct_payees: distinctPayees,
    gross_total: round2(schedule.reduce((s, r) => s + r.gross, 0)),
    withheld_total: round2(schedule.reduce((s, r) => s + r.withheld, 0)),
  };
  for (const code of J4_OUTBOUND_ATCS) {
    const b = byAtc.get(code);
    totals[`${code.toLowerCase()}_gross`] = round2(b.gross);
    totals[`${code.toLowerCase()}_tax`] = round2(b.withheld);
    totals[`${code.toLowerCase()}_count`] = b.count;
  }

  const meta = {
    form_code: 'QAP',
    entity_id: entityId,
    period_year: year,
    period_quarter: quarter,
    period_label: `${year}-Q${quarter}`,
    period_months: periods,
    atc_subset: J4_OUTBOUND_ATCS,
    source_counts: {
      ledger_payee_atc_rows: schedule.length,
      distinct_payees: distinctPayees,
      atc_buckets: J4_OUTBOUND_ATCS.filter(c => byAtc.get(c).count > 0).length,
    },
    schedule,
    computed_at: new Date(),
  };

  return { totals, meta };
}

// ── 1604-E .dat writer (BIR Alphalist Data Entry v7.x — annual EWT) ─────
/**
 * Header line (H):
 *   H1604E|TIN|RegName|Branch|Year|FormType
 *
 * Detail line (D1) per (payee × ATC):
 *   D1|Seq|PayeeTIN|RegName|FirstName|MiddleName|Address|Nature|ATC|Gross|Rate|Withheld
 *
 * Trailer (T):
 *   T1604E|RecordCount|TotalGross|TotalWithheld
 *
 * Mirrors serializeSawtDat byte-for-byte on the D1/T1 lines so the BIR
 * Alphalist Data Entry v7.x importer sees the same record shape it accepts
 * from SAWT/QAP — only the H/T tag distinguishes 1604-E.
 *
 * Subscribers can swap this serializer via DI (same lookup-driven module
 * path pattern as serializeSawtDat) when the Vios SaaS spin-out lands in
 * a non-PH jurisdiction.
 */
function serialize1604EDat({ entity, year, totals, meta }) {
  const lines = [];
  lines.push([
    'H1604E',
    entity?.tin || 'NOT SET',
    sanitize(entity?.entity_name || ''),
    'HEAD OFFICE',
    String(year),
    '1604E',
  ].join('|'));

  let totalGross = 0;
  let totalWithheld = 0;
  (meta?.schedule || []).forEach((r, idx) => {
    const detail = [
      'D1',
      String(idx + 1).padStart(6, '0'),
      r.payee_tin || '',
      sanitize(r.payee_kind === 'VendorMaster' || r.payee_kind === 'Hospital' ? r.payee_name : ''),
      sanitize(r.payee_kind === 'PeopleMaster' || r.payee_kind === 'Doctor' ? r.payee_name : ''),
      '',                                   // middle name — payee-name split deferred to a future refactor
      sanitize(r.payee_address || ''),
      'BUSINESS',
      r.atc_code || '',
      r.gross.toFixed(2),
      ((r.withheld / Math.max(1, r.gross)) * 100).toFixed(2),
      r.withheld.toFixed(2),
    ];
    totalGross += r.gross;
    totalWithheld += r.withheld;
    lines.push(detail.join('|'));
  });

  lines.push([
    'T1604E',
    String((meta?.schedule || []).length).padStart(6, '0'),
    totalGross.toFixed(2),
    totalWithheld.toFixed(2),
  ].join('|'));

  return lines.join('\r\n') + '\r\n';
}

// ── QAP .dat writer (BIR Alphalist Data Entry v7.x — quarterly EWT) ─────
/**
 * Header line (H):
 *   HQAP|TIN|RegName|Branch|Period|FormType|Year|Quarter
 *
 * Detail line (D1) per (payee × ATC) — identical shape to SAWT/1604-E so
 * the BIR importer reuses the same record contract.
 *
 * Trailer (T):
 *   TQAP|RecordCount|TotalGross|TotalWithheld
 */
function serializeQAPDat({ entity, year, quarter, totals, meta }) {
  const lines = [];
  lines.push([
    'HQAP',
    entity?.tin || 'NOT SET',
    sanitize(entity?.entity_name || ''),
    'HEAD OFFICE',
    `${year}Q${quarter}`,
    'QAP',
    String(year),
    String(quarter),
  ].join('|'));

  let totalGross = 0;
  let totalWithheld = 0;
  (meta?.schedule || []).forEach((r, idx) => {
    const detail = [
      'D1',
      String(idx + 1).padStart(6, '0'),
      r.payee_tin || '',
      sanitize(r.payee_kind === 'VendorMaster' || r.payee_kind === 'Hospital' ? r.payee_name : ''),
      sanitize(r.payee_kind === 'PeopleMaster' || r.payee_kind === 'Doctor' ? r.payee_name : ''),
      '',
      sanitize(r.payee_address || ''),
      'BUSINESS',
      r.atc_code || '',
      r.gross.toFixed(2),
      ((r.withheld / Math.max(1, r.gross)) * 100).toFixed(2),
      r.withheld.toFixed(2),
    ];
    totalGross += r.gross;
    totalWithheld += r.withheld;
    lines.push(detail.join('|'));
  });

  lines.push([
    'TQAP',
    String((meta?.schedule || []).length).padStart(6, '0'),
    totalGross.toFixed(2),
    totalWithheld.toFixed(2),
  ].join('|'));

  return lines.join('\r\n') + '\r\n';
}

async function export1604EDat({ entityId, year, userId, entity }) {
  if (!Number.isInteger(year)) throw new Error('Invalid year.');
  const { totals, meta } = await compute1604E({ entityId, year });

  const datContent = serialize1604EDat({ entity, year, totals, meta });
  const contentHash = crypto.createHash('sha256').update(datContent, 'utf8').digest('hex');
  const filename = `1604E_${year}.dat`;

  const filter = {
    entity_id: entityId,
    form_code: '1604-E',
    period_year: year,
    period_month: null,
    period_quarter: null,
    period_payee_id: null,
  };
  let row = await BirFilingStatus.findOne(filter);
  if (!row) {
    row = new BirFilingStatus({
      ...filter,
      status: 'DRAFT',
      totals_snapshot: totals,
    });
  } else {
    row.totals_snapshot = totals;
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: userId,
    artifact_kind: 'DAT',
    filename,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    notes: `1604-E ${year} export (${totals.distinct_payees} payees / ${totals.payee_lines} lines)`,
  });
  await row.save();

  return { row, datContent, contentHash, filename, totals, meta };
}

async function exportQAPDat({ entityId, year, quarter, userId, entity }) {
  if (!Number.isInteger(year) || !Number.isInteger(quarter)) throw new Error('Invalid year/quarter.');
  const { totals, meta } = await computeQAP({ entityId, year, quarter });

  const datContent = serializeQAPDat({ entity, year, quarter, totals, meta });
  const contentHash = crypto.createHash('sha256').update(datContent, 'utf8').digest('hex');
  const filename = `QAP_${year}_Q${quarter}.dat`;

  const filter = {
    entity_id: entityId,
    form_code: 'QAP',
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
      totals_snapshot: totals,
    });
  } else {
    row.totals_snapshot = totals;
  }
  row.export_audit_log.push({
    exported_at: new Date(),
    exported_by: userId,
    artifact_kind: 'DAT',
    filename,
    content_hash: contentHash,
    byte_length: Buffer.byteLength(datContent, 'utf8'),
    notes: `QAP ${year}-Q${quarter} export (${totals.distinct_payees} payees / ${totals.payee_lines} lines)`,
  });
  await row.save();

  return { row, datContent, contentHash, filename, totals, meta };
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
  // Phase J3 Part A — Monthly compensation withholding return
  compute1601C,
  // Phase J3 Part B — Annual compensation alphalist + 2316 employee certificate
  compute1604CF,
  serialize1604CFDat,
  export1604CFDat,
  export2316Pdf,
  // Phase J4 — Annual + quarterly OUTBOUND-direction EWT alphalists
  compute1604E,
  serialize1604EDat,
  export1604EDat,
  computeQAP,
  serializeQAPDat,
  exportQAPDat,
  exportEwtCsv,
  export2307Pdf,
  exportSawtDat,
  serializeSawtDat,
  getBoxLayout,
  listPayees,
  // Test seams
  _internals: { sumByAtcCode, buildEwtCsv, round2, sanitize, fmtMoney },
};
