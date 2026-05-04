/**
 * bookOfAccountsService — Phase VIP-1.J / J5 (May 2026)
 *
 * Generates BIR Loose-Leaf Books of Accounts as PDFs:
 *   1. Sales Journal              (SALES_JOURNAL)
 *   2. Purchase Journal           (PURCHASE_JOURNAL)
 *   3. Cash Receipts Journal      (CASH_RECEIPTS)
 *   4. Cash Disbursements Journal (CASH_DISBURSEMENTS)
 *   5. General Journal            (GENERAL_JOURNAL)
 *   6. General Ledger             (GENERAL_LEDGER)
 *
 * Source-of-truth boundary:
 *   Every book is a PURE READ of POSTED JournalEntry rows. Specialised
 *   journals (Sales / Purchase / CR / CD / GJ) classify each JE into
 *   exactly ONE book by deterministic priority — so summing the five
 *   specialised books equals "all POSTED JEs" with no double-count. The
 *   General Ledger is the same set of rows projected by account_code.
 *
 * Classification (priority order — first match wins):
 *   1. SALES_JOURNAL         → source_module ∈ BIR_BOA_BOOK_CATALOG.SALES_JOURNAL.metadata.source_modules
 *   2. PURCHASE_JOURNAL      → source_module ∈ ...PURCHASE_JOURNAL.metadata.source_modules
 *   3. CASH_RECEIPTS         → JE has any DR line on a cash account
 *   4. CASH_DISBURSEMENTS    → JE has any CR line on a cash account
 *   5. GENERAL_JOURNAL       → everything else (catch-all)
 *
 * Cash account derivation (in this order, first non-empty wins):
 *   1. Lookup BIR_BOA_CASH_ACCOUNTS rows for the entity (codes config-driven)
 *   2. ChartOfAccounts where account_code matches /^10[01][0-9]$/ + ASSET + active
 *      (PRD §11.1 reserves 1000-1019 for Cash & Bank — works as default)
 *
 * Responsible Officer (sworn declaration signer) is read from lookup
 * BIR_BOA_RESPONSIBLE_OFFICER per entity (Rule #3 — no hardcoded business
 * values). Falls back to placeholder lines if unconfigured so subscriber
 * can pen-fill before notarisation.
 *
 * BIR-required PDF header on EVERY page (RR 9-2009 / RMC 29-2019):
 *   • Registered Name (entity_name)
 *   • TIN
 *   • Registered Address
 *   • Business Style
 *   • RDO Code
 *   • Period covered
 *   • Page X of Y
 *
 * Sworn declaration page (annual binding only) carries the responsible
 * officer's name + title + TIN + CTC + a declaration block conforming to
 * BIR loose-leaf submission requirements. Notarisation happens off-system
 * after print.
 *
 * Subscription readiness (Rule #19 + Rule #3):
 *   • Per-entity: every aggregation is filtered by entity_id.
 *   • Lookup-driven: book catalog, cash accounts, and responsible officer
 *     are all per-entity Lookup rows. Subscribers reconfigure via Control
 *     Center without code deployment.
 *   • Period-locked: respects PeriodLock.module='BIR_FILING'. CONFIRMED
 *     years are locked against retroactive JE edits via existing middleware.
 *   • Audit-logged: every export appends a SHA-256-stamped row to
 *     BirFilingStatus.export_audit_log per Rule #20.
 *
 * Backwards-compatibility:
 *   • Reuses the existing BIR_FILING form_code 'BOOKS' — single annual
 *     BirFilingStatus row per (entity, year). Per-book per-period exports
 *     all append onto that row's export_audit_log with `notes` describing
 *     the book + period.
 */

const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const ChartOfAccounts = require('../models/ChartOfAccounts');
const Lookup = require('../models/Lookup');

// ── Constants ───────────────────────────────────────────────────────────

const BOOK_CODES = [
  'SALES_JOURNAL',
  'PURCHASE_JOURNAL',
  'CASH_RECEIPTS',
  'CASH_DISBURSEMENTS',
  'GENERAL_JOURNAL',
  'GENERAL_LEDGER',
];

// Default classification used when BIR_BOA_BOOK_CATALOG lookup is unseeded.
// Subscribers override per-entity via Control Center → Lookup Tables.
const DEFAULT_BOOK_RULES = {
  SALES_JOURNAL: {
    label: 'Sales Journal',
    bir_section: 'Sales Journal — RR 9-2009 §3(a)',
    source_modules: ['SALES'],
    cash_side: null,
    priority: 1,
    description: 'POSTED journal entries originating from Sales (CSI). Records gross sales, output VAT, AR, and CWT receivable.',
  },
  PURCHASE_JOURNAL: {
    label: 'Purchase Journal',
    bir_section: 'Purchase Journal — RR 9-2009 §3(b)',
    source_modules: ['SUPPLIER_INVOICE', 'AP'],
    cash_side: null,
    priority: 2,
    description: 'POSTED journal entries from supplier invoices + accounts payable. Records inventory cost, input VAT, and AP.',
  },
  CASH_RECEIPTS: {
    label: 'Cash Receipts Journal',
    bir_section: 'Cash Receipts Journal — RR 9-2009 §3(c)',
    source_modules: ['COLLECTION', 'BANKING'],
    cash_side: 'DR',
    priority: 3,
    description: 'POSTED journal entries with at least one DEBIT on a cash account (collections, deposits, owner contributions).',
  },
  CASH_DISBURSEMENTS: {
    label: 'Cash Disbursements Journal',
    bir_section: 'Cash Disbursements Journal — RR 9-2009 §3(d)',
    source_modules: ['EXPENSE', 'PAYROLL', 'PETTY_CASH', 'AP'],
    cash_side: 'CR',
    priority: 4,
    description: 'POSTED journal entries with at least one CREDIT on a cash account (expenses paid in cash, payroll cash, AP payments).',
  },
  GENERAL_JOURNAL: {
    label: 'General Journal',
    bir_section: 'General Journal — RR 9-2009 §3(e)',
    source_modules: [], // catch-all (tested last)
    cash_side: null,
    priority: 5,
    description: 'POSTED journal entries not captured by the specialised journals (manual, depreciation, interest, owner draws, IC transfers, inventory adjustments).',
  },
  GENERAL_LEDGER: {
    label: 'General Ledger',
    bir_section: 'General Ledger — RR 9-2009 §3(f)',
    source_modules: [], // not used — GL projects all POSTED JEs by account
    cash_side: null,
    priority: 6,
    description: 'Per-account roll-up of every POSTED journal entry line. Subsidiary record-of-record for trial balance.',
  },
};

const DEFAULT_RESPONSIBLE_OFFICER = {
  name: '____________________________',
  title: 'President / Treasurer',
  tin: '___-___-___-_____',
  ctc_no: '__________',
  ctc_place: '__________',
  ctc_date: '__________',
};

// PRD §11.1 reserves account_code 1000-1019 for Cash & Bank. Used when
// BIR_BOA_CASH_ACCOUNTS lookup is unseeded AND ChartOfAccounts derivation
// returns nothing.
const PRD_CASH_RANGE_REGEX = /^10[01][0-9]$/;

// ── Helpers ─────────────────────────────────────────────────────────────

function pad2(n) { return String(n).padStart(2, '0'); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(round2(n));
}
function periodLabel(year, month) {
  if (!month) return `For the Year ${year}`;
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' });
  return `For the Month of ${monthName} ${year}`;
}
function periodFilenameSegment(year, month) {
  return month ? `${year}-${pad2(month)}` : String(year);
}

function buildPeriodMatch(year, month) {
  if (month) {
    return { period: `${year}-${pad2(month)}` };
  }
  // Year-wide — match all 12 months.
  const periods = [];
  for (let m = 1; m <= 12; m++) periods.push(`${year}-${pad2(m)}`);
  return { period: { $in: periods } };
}

// ── Lookup readers (lazy-cached per request via the caller) ────────────

/**
 * Returns the merged book rules: lookup overrides applied on top of
 * DEFAULT_BOOK_RULES. Lookup is not lazy-seeded here — subscribers create
 * rows via Control Center if they want to override. Missing lookup =
 * defaults are authoritative (what VIP runs with today).
 */
async function loadBookRules(entityId) {
  const rows = await Lookup.find({
    entity_id: entityId,
    category: 'BIR_BOA_BOOK_CATALOG',
    is_active: { $ne: false },
  }).lean();

  const merged = JSON.parse(JSON.stringify(DEFAULT_BOOK_RULES));
  for (const row of rows) {
    if (!BOOK_CODES.includes(row.code)) continue;
    const meta = row.metadata || {};
    if (Array.isArray(meta.source_modules)) merged[row.code].source_modules = meta.source_modules;
    if (typeof meta.cash_side === 'string' || meta.cash_side === null) merged[row.code].cash_side = meta.cash_side;
    if (typeof meta.priority === 'number') merged[row.code].priority = meta.priority;
    if (typeof meta.label === 'string') merged[row.code].label = meta.label;
    if (typeof meta.bir_section === 'string') merged[row.code].bir_section = meta.bir_section;
    if (typeof meta.description === 'string') merged[row.code].description = meta.description;
  }
  return merged;
}

async function loadCashAccountCodes(entityId) {
  // First try explicit lookup overrides.
  const rows = await Lookup.find({
    entity_id: entityId,
    category: 'BIR_BOA_CASH_ACCOUNTS',
    is_active: { $ne: false },
  }).lean();
  if (rows.length > 0) {
    return new Set(rows.map(r => String(r.code).trim()).filter(Boolean));
  }

  // Fallback — derive from ChartOfAccounts using the PRD §11.1 range. If
  // the entity has not seeded a CoA yet, this returns an empty set and
  // CASH_RECEIPTS / CASH_DISBURSEMENTS books will be empty (correct —
  // there is no cash account to match against).
  const coa = await ChartOfAccounts.find({
    entity_id: entityId,
    account_type: 'ASSET',
    is_active: true,
  }).select('account_code').lean();
  return new Set(
    coa.map(a => String(a.account_code))
       .filter(c => PRD_CASH_RANGE_REGEX.test(c))
  );
}

async function loadResponsibleOfficer(entityId) {
  const row = await Lookup.findOne({
    entity_id: entityId,
    category: 'BIR_BOA_RESPONSIBLE_OFFICER',
    is_active: { $ne: false },
  }).lean();
  if (!row || !row.metadata) return { ...DEFAULT_RESPONSIBLE_OFFICER };
  return {
    name: row.metadata.name || DEFAULT_RESPONSIBLE_OFFICER.name,
    title: row.metadata.title || DEFAULT_RESPONSIBLE_OFFICER.title,
    tin: row.metadata.tin || DEFAULT_RESPONSIBLE_OFFICER.tin,
    ctc_no: row.metadata.ctc_no || DEFAULT_RESPONSIBLE_OFFICER.ctc_no,
    ctc_place: row.metadata.ctc_place || DEFAULT_RESPONSIBLE_OFFICER.ctc_place,
    ctc_date: row.metadata.ctc_date || DEFAULT_RESPONSIBLE_OFFICER.ctc_date,
  };
}

/**
 * Classify each POSTED JE into exactly ONE book by priority:
 *   1. SALES_JOURNAL         (source_module match)
 *   2. PURCHASE_JOURNAL      (source_module match)
 *   3. CASH_RECEIPTS         (any DR line on a cash account)
 *   4. CASH_DISBURSEMENTS    (any CR line on a cash account)
 *   5. GENERAL_JOURNAL       (everything else)
 *
 * Returns the book code as a string. Pure function — given the same
 * inputs always returns the same output. Used by both book aggregation
 * and the healthcheck assertion suite.
 */
function classifyJournalEntry(je, bookRules, cashAccountCodes) {
  const sm = je.source_module;
  const salesMods = bookRules.SALES_JOURNAL.source_modules || [];
  const purchaseMods = bookRules.PURCHASE_JOURNAL.source_modules || [];
  if (salesMods.includes(sm)) return 'SALES_JOURNAL';
  if (purchaseMods.includes(sm)) return 'PURCHASE_JOURNAL';

  // Cash classification — any line touching a cash account on the right side.
  if (cashAccountCodes && cashAccountCodes.size > 0) {
    let hasDrCash = false;
    let hasCrCash = false;
    for (const line of (je.lines || [])) {
      if (cashAccountCodes.has(String(line.account_code))) {
        if ((line.debit || 0) > 0) hasDrCash = true;
        if ((line.credit || 0) > 0) hasCrCash = true;
      }
    }
    if (hasDrCash) return 'CASH_RECEIPTS';
    if (hasCrCash) return 'CASH_DISBURSEMENTS';
  }
  return 'GENERAL_JOURNAL';
}

// ── Compute API ─────────────────────────────────────────────────────────

/**
 * Aggregate a specialised journal book.
 *
 * @param {Object} params
 * @param {ObjectId|string} params.entityId
 * @param {string} params.bookCode — one of BOOK_CODES (excluding GENERAL_LEDGER)
 * @param {number} params.year
 * @param {number|null} params.month — 1-12 for monthly; null/undefined = annual
 * @returns { rows, totals, period_label, generated_at, book_code }
 *
 * Each row corresponds to one POSTED JournalEntry classified into this
 * book. Row carries je_number, je_date, period, source_module, source_doc_ref,
 * description, total_debit, total_credit, line_count.
 */
async function computeJournalBook({ entityId, bookCode, year, month = null }) {
  if (!entityId) throw new Error('computeJournalBook requires entityId.');
  if (!BOOK_CODES.includes(bookCode)) throw new Error(`Invalid bookCode: ${bookCode}`);
  if (bookCode === 'GENERAL_LEDGER') {
    return computeGeneralLedger({ entityId, year, month });
  }

  const periodMatch = buildPeriodMatch(year, month);
  const [bookRules, cashAccountCodes] = await Promise.all([
    loadBookRules(entityId),
    loadCashAccountCodes(entityId),
  ]);

  // Pull all POSTED JEs in the period, classify, retain only those for
  // this book. Mongo-side filter on source_module would be a premature
  // optimisation — cash classification needs the whole JE shape, and the
  // entity-scoped period match already cuts the working set to a sane size.
  const jes = await JournalEntry.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    status: 'POSTED',
    ...periodMatch,
  })
    .select('je_number je_date period source_module source_doc_ref description total_debit total_credit lines')
    .sort({ je_date: 1, je_number: 1 })
    .lean();

  const rows = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const je of jes) {
    const code = classifyJournalEntry(je, bookRules, cashAccountCodes);
    if (code !== bookCode) continue;
    const debit = round2(je.total_debit || 0);
    const credit = round2(je.total_credit || 0);
    totalDebit += debit;
    totalCredit += credit;
    rows.push({
      je_number: je.je_number,
      je_date: je.je_date,
      period: je.period,
      source_module: je.source_module,
      source_doc_ref: je.source_doc_ref || '',
      description: je.description || '',
      total_debit: debit,
      total_credit: credit,
      line_count: (je.lines || []).length,
    });
  }

  return {
    book_code: bookCode,
    book_label: bookRules[bookCode].label,
    bir_section: bookRules[bookCode].bir_section,
    description: bookRules[bookCode].description,
    period_label: periodLabel(year, month),
    period_year: year,
    period_month: month || null,
    rows,
    totals: {
      row_count: rows.length,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * General Ledger — per-account roll-up of every POSTED JE line in the period.
 *
 * One section per account_code (sorted ascending). Each section lists
 * every line touching that account with debit/credit/running-balance and
 * a section total + closing balance.
 */
async function computeGeneralLedger({ entityId, year, month = null }) {
  if (!entityId) throw new Error('computeGeneralLedger requires entityId.');
  const periodMatch = buildPeriodMatch(year, month);

  const jes = await JournalEntry.find({
    entity_id: new mongoose.Types.ObjectId(entityId),
    status: 'POSTED',
    ...periodMatch,
  })
    .select('je_number je_date period source_module source_doc_ref description lines')
    .sort({ je_date: 1, je_number: 1 })
    .lean();

  // Bucket lines by account_code.
  const buckets = new Map(); // account_code -> { account_name, lines[] }
  for (const je of jes) {
    for (const line of (je.lines || [])) {
      const code = String(line.account_code);
      if (!buckets.has(code)) {
        buckets.set(code, { account_name: line.account_name || '', lines: [] });
      }
      const bucket = buckets.get(code);
      // First non-empty account_name wins (line-level overrides empty string).
      if (!bucket.account_name && line.account_name) bucket.account_name = line.account_name;
      bucket.lines.push({
        je_number: je.je_number,
        je_date: je.je_date,
        period: je.period,
        source_module: je.source_module,
        source_doc_ref: je.source_doc_ref || '',
        description: line.description || je.description || '',
        debit: round2(line.debit || 0),
        credit: round2(line.credit || 0),
      });
    }
  }

  // Sort accounts ascending by code; compute per-account running balance.
  const accounts = [];
  let totalDebit = 0;
  let totalCredit = 0;
  const sortedCodes = Array.from(buckets.keys()).sort();
  for (const code of sortedCodes) {
    const { account_name, lines } = buckets.get(code);
    let running = 0;
    let acctDebit = 0;
    let acctCredit = 0;
    const enrichedLines = lines.map(l => {
      running = round2(running + l.debit - l.credit);
      acctDebit += l.debit;
      acctCredit += l.credit;
      return { ...l, running_balance: running };
    });
    totalDebit += acctDebit;
    totalCredit += acctCredit;
    accounts.push({
      account_code: code,
      account_name,
      lines: enrichedLines,
      total_debit: round2(acctDebit),
      total_credit: round2(acctCredit),
      closing_balance: round2(acctDebit - acctCredit),
    });
  }

  return {
    book_code: 'GENERAL_LEDGER',
    book_label: 'General Ledger',
    bir_section: DEFAULT_BOOK_RULES.GENERAL_LEDGER.bir_section,
    description: DEFAULT_BOOK_RULES.GENERAL_LEDGER.description,
    period_label: periodLabel(year, month),
    period_year: year,
    period_month: month || null,
    accounts,
    totals: {
      account_count: accounts.length,
      line_count: accounts.reduce((s, a) => s + a.lines.length, 0),
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Compute a book — dispatcher around the two specialised compute paths.
 */
async function computeBook({ entityId, bookCode, year, month = null }) {
  if (bookCode === 'GENERAL_LEDGER') return computeGeneralLedger({ entityId, year, month });
  return computeJournalBook({ entityId, bookCode, year, month });
}

/**
 * Returns the catalog (per-entity merged book rules + cash account codes
 * + responsible officer) for the dashboard / frontend bootstrap.
 */
async function getBookCatalog({ entityId }) {
  const [bookRules, cashAccountCodes, officer] = await Promise.all([
    loadBookRules(entityId),
    loadCashAccountCodes(entityId),
    loadResponsibleOfficer(entityId),
  ]);
  const books = BOOK_CODES.map(code => ({
    code,
    ...bookRules[code],
  })).sort((a, b) => a.priority - b.priority);
  return {
    books,
    cash_account_codes: Array.from(cashAccountCodes).sort(),
    responsible_officer: officer,
  };
}

// ── PDF rendering ───────────────────────────────────────────────────────

/**
 * Mints a BIR loose-leaf compliant header on every page. Called via
 * doc.on('pageAdded', ...) so it fires for the first page AND every
 * automatically-added subsequent page.
 *
 * Important quirk in pdfkit: doc.on('pageAdded') fires AFTER the page is
 * added but BEFORE any content is written. We position the header at top
 * margin and then the caller's content lands below via the cursor that
 * the renderHeader sets via doc.y.
 */
function buildHeaderRenderer({ entity, book, periodLabel: pLabel }) {
  return function renderHeader(doc) {
    const startY = doc.page.margins.top;
    doc.fontSize(8).fillColor('#000');
    doc.text(`Registered Name: ${entity?.entity_name || '(unset)'}`, doc.page.margins.left, startY, { width: 540 });
    doc.text(`TIN: ${entity?.tin || 'NOT SET'}    |    RDO: ${entity?.rdo_code || 'NOT SET'}    |    Business Style: ${entity?.business_style || '—'}`);
    doc.text(`Address: ${entity?.address || '—'}`);
    doc.text(`Book: ${book.book_label} — ${book.bir_section}    |    ${pLabel}`);
    doc.moveTo(doc.page.margins.left, doc.y + 2)
       .lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
       .stroke();
    doc.moveDown(0.5);
  };
}

function renderJournalTable(doc, book, isAnnual) {
  const { rows, totals } = book;
  doc.fontSize(10).fillColor('#000').text(book.book_label, { underline: true });
  doc.fontSize(8).fillColor('#444').text(book.description);
  doc.moveDown(0.4);
  if (rows.length === 0) {
    doc.fontSize(9).fillColor('#666').text('No journal entries for this period.');
    doc.fillColor('#000');
    return;
  }

  const left = doc.page.margins.left;
  const cols = [
    { label: 'JE #',         x: left,        w: 80  },
    { label: 'Date',         x: left + 82,   w: 60  },
    { label: 'Source',       x: left + 144,  w: 70  },
    { label: 'Doc Ref',      x: left + 216,  w: 90  },
    { label: 'Description',  x: left + 308,  w: 130 },
    { label: 'Debit',        x: left + 440,  w: 60, align: 'right' },
    { label: 'Credit',       x: left + 502,  w: 60, align: 'right' },
  ];

  doc.fontSize(8).fillColor('#000');
  const headerY = doc.y;
  for (const c of cols) {
    doc.text(c.label, c.x, headerY, { width: c.w, align: c.align || 'left' });
  }
  doc.moveTo(left, doc.y + 2).lineTo(left + 562, doc.y + 2).stroke();
  doc.moveDown(0.3);

  doc.fontSize(7.5);
  for (const r of rows) {
    const y = doc.y;
    // Rough-cut page break — keep ~60pt below the cursor for the row.
    if (y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      // pageAdded handler re-prints header; restart row at fresh cursor.
    }
    const rowY = doc.y;
    const dateStr = r.je_date ? new Date(r.je_date).toISOString().slice(0, 10) : '';
    doc.text(r.je_number || '',         cols[0].x, rowY, { width: cols[0].w });
    doc.text(dateStr,                    cols[1].x, rowY, { width: cols[1].w });
    doc.text(r.source_module || '',      cols[2].x, rowY, { width: cols[2].w });
    doc.text((r.source_doc_ref || '').slice(0, 24), cols[3].x, rowY, { width: cols[3].w });
    doc.text((r.description || '').slice(0, 60),    cols[4].x, rowY, { width: cols[4].w });
    doc.text(fmtMoney(r.total_debit),    cols[5].x, rowY, { width: cols[5].w, align: 'right' });
    doc.text(fmtMoney(r.total_credit),   cols[6].x, rowY, { width: cols[6].w, align: 'right' });
    doc.moveDown(0.2);
  }
  doc.moveTo(left, doc.y + 1).lineTo(left + 562, doc.y + 1).stroke();
  doc.moveDown(0.2);

  // Totals row
  doc.fontSize(8.5).fillColor('#000');
  const totY = doc.y;
  doc.text(`TOTALS (${totals.row_count} entries)`, cols[0].x, totY, { width: 308 });
  doc.text(fmtMoney(totals.total_debit),  cols[5].x, totY, { width: cols[5].w, align: 'right' });
  doc.text(fmtMoney(totals.total_credit), cols[6].x, totY, { width: cols[6].w, align: 'right' });
  doc.moveDown(0.5);

  // Sub-ledger / GL invariant: total_debit == total_credit (within ₱0.01)
  const diff = round2(totals.total_debit - totals.total_credit);
  if (Math.abs(diff) > 0.01) {
    doc.fontSize(8).fillColor('#b91c1c')
      .text(`⚠ INVARIANT WARNING: Debit ≠ Credit (diff ${fmtMoney(diff)}). Investigate immediately — every JE is balanced individually so a sum mismatch indicates corrupted aggregation.`);
    doc.fillColor('#000');
  }
  doc.moveDown(0.3);
}

function renderGeneralLedgerSections(doc, book) {
  const { accounts, totals } = book;
  doc.fontSize(10).fillColor('#000').text(book.book_label, { underline: true });
  doc.fontSize(8).fillColor('#444').text(book.description);
  doc.moveDown(0.4);
  if (accounts.length === 0) {
    doc.fontSize(9).fillColor('#666').text('No journal entries for this period.');
    doc.fillColor('#000');
    return;
  }

  const left = doc.page.margins.left;
  for (const acct of accounts) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 100) doc.addPage();

    doc.fontSize(9).fillColor('#000')
       .text(`Account ${acct.account_code} — ${acct.account_name}`, { underline: true });
    doc.moveDown(0.2);

    const cols = [
      { x: left,        w: 80  },  // JE#
      { x: left + 82,   w: 60  },  // Date
      { x: left + 144,  w: 60  },  // Source
      { x: left + 206,  w: 90  },  // Doc Ref
      { x: left + 298,  w: 110 },  // Description
      { x: left + 410,  w: 50, align: 'right' }, // Debit
      { x: left + 462,  w: 50, align: 'right' }, // Credit
      { x: left + 514,  w: 50, align: 'right' }, // Running
    ];
    const labels = ['JE #', 'Date', 'Source', 'Doc Ref', 'Description', 'Debit', 'Credit', 'Running'];
    doc.fontSize(7.5);
    const hdrY = doc.y;
    for (let i = 0; i < cols.length; i++) {
      doc.text(labels[i], cols[i].x, hdrY, { width: cols[i].w, align: cols[i].align || 'left' });
    }
    doc.moveTo(left, doc.y + 2).lineTo(left + 562, doc.y + 2).stroke();
    doc.moveDown(0.2);

    doc.fontSize(7);
    for (const l of acct.lines) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 25) doc.addPage();
      const rowY = doc.y;
      const dateStr = l.je_date ? new Date(l.je_date).toISOString().slice(0, 10) : '';
      doc.text(l.je_number || '',            cols[0].x, rowY, { width: cols[0].w });
      doc.text(dateStr,                       cols[1].x, rowY, { width: cols[1].w });
      doc.text(l.source_module || '',         cols[2].x, rowY, { width: cols[2].w });
      doc.text((l.source_doc_ref || '').slice(0, 22), cols[3].x, rowY, { width: cols[3].w });
      doc.text((l.description || '').slice(0, 50),    cols[4].x, rowY, { width: cols[4].w });
      doc.text(fmtMoney(l.debit),             cols[5].x, rowY, { width: cols[5].w, align: 'right' });
      doc.text(fmtMoney(l.credit),            cols[6].x, rowY, { width: cols[6].w, align: 'right' });
      doc.text(fmtMoney(l.running_balance),   cols[7].x, rowY, { width: cols[7].w, align: 'right' });
      doc.moveDown(0.18);
    }
    doc.moveTo(left, doc.y + 1).lineTo(left + 562, doc.y + 1).stroke();
    doc.moveDown(0.15);

    // Per-account totals
    doc.fontSize(7.5).fillColor('#000');
    const totY = doc.y;
    doc.text(`Account total — ${acct.lines.length} lines`, cols[0].x, totY, { width: 298 });
    doc.text(fmtMoney(acct.total_debit),     cols[5].x, totY, { width: cols[5].w, align: 'right' });
    doc.text(fmtMoney(acct.total_credit),    cols[6].x, totY, { width: cols[6].w, align: 'right' });
    doc.text(fmtMoney(acct.closing_balance), cols[7].x, totY, { width: cols[7].w, align: 'right' });
    doc.moveDown(0.6);
  }

  // Grand totals
  if (doc.y > doc.page.height - doc.page.margins.bottom - 50) doc.addPage();
  doc.fontSize(9).fillColor('#000')
     .text(`Grand totals: ${totals.account_count} accounts, ${totals.line_count} lines`);
  doc.text(`Total Debits:  ${fmtMoney(totals.total_debit)}`);
  doc.text(`Total Credits: ${fmtMoney(totals.total_credit)}`);
  const diff = round2(totals.total_debit - totals.total_credit);
  if (Math.abs(diff) > 0.01) {
    doc.fillColor('#b91c1c')
      .text(`⚠ Trial-balance check FAILED: Debit ≠ Credit (diff ${fmtMoney(diff)}).`);
    doc.fillColor('#000');
  } else {
    doc.fillColor('#15803d').text('Trial-balance check OK (Debit = Credit within rounding).').fillColor('#000');
  }
}

/**
 * Generate a single book PDF (monthly OR annual binding).
 *
 * @param {Object} params
 * @param {ObjectId|string} params.entityId
 * @param {string} params.bookCode
 * @param {number} params.year
 * @param {number|null} params.month — null = annual binding (12 monthly sections)
 * @param {Object} params.entity — pre-loaded Entity doc (lean OK)
 * @returns { buffer, contentHash, filename, totals, rowCount, period_label }
 */
async function exportBookPdf({ entityId, bookCode, year, month = null, entity }) {
  if (!entityId || !bookCode || !year) {
    throw new Error('exportBookPdf requires entityId, bookCode, year.');
  }
  if (!BOOK_CODES.includes(bookCode)) throw new Error(`Invalid bookCode: ${bookCode}`);

  const isAnnual = !month;
  const sections = [];

  if (isAnnual) {
    // Annual binding — 12 monthly sections + a year-end summary section.
    for (let m = 1; m <= 12; m++) {
      // eslint-disable-next-line no-await-in-loop
      sections.push(await computeBook({ entityId, bookCode, year, month: m }));
    }
    // Append a year-summary section (computed once, no monthly bucketing).
    // eslint-disable-next-line no-await-in-loop
    sections.push(await computeBook({ entityId, bookCode, year, month: null }));
  } else {
    sections.push(await computeBook({ entityId, bookCode, year, month }));
  }

  const headerBook = sections[0]; // book metadata is identical across sections
  const pdfPeriodLabel = isAnnual ? periodLabel(year, null) : periodLabel(year, month);
  const renderHeader = buildHeaderRenderer({ entity, book: headerBook, periodLabel: pdfPeriodLabel });

  const doc = new PDFDocument({ size: 'LETTER', margin: 36, bufferPages: true });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // Mint header on every page (initial + any pdfkit-added overflow page)
  doc.on('pageAdded', () => renderHeader(doc));
  renderHeader(doc); // first page

  // Cover content
  doc.fontSize(13).text('BUREAU OF INTERNAL REVENUE', { align: 'center' });
  doc.fontSize(10).text(`${headerBook.book_label} — Loose-Leaf Books of Accounts`, { align: 'center' });
  doc.fontSize(9).text(pdfPeriodLabel, { align: 'center' });
  doc.moveDown(0.6);

  if (isAnnual) {
    // Render monthly sections, then year summary as the last section.
    for (let i = 0; i < 12; i++) {
      const section = sections[i];
      const monthIdx = i + 1;
      doc.fontSize(11).fillColor('#000').text(periodLabel(year, monthIdx), { underline: true });
      doc.moveDown(0.3);
      if (bookCode === 'GENERAL_LEDGER') renderGeneralLedgerSections(doc, section);
      else renderJournalTable(doc, section, false);
      doc.moveDown(0.4);
      // Page break between months for readability (skip if month had no rows AND
      // we're not on the last month — keeps PDFs compact for empty businesses).
      const hasContent = bookCode === 'GENERAL_LEDGER'
        ? (section.accounts && section.accounts.length > 0)
        : (section.rows && section.rows.length > 0);
      if (hasContent && monthIdx < 12) doc.addPage();
    }
    doc.addPage();
    const yearSection = sections[12];
    doc.fontSize(12).fillColor('#000').text('Year Summary — All Months Consolidated', { underline: true });
    doc.moveDown(0.4);
    if (bookCode === 'GENERAL_LEDGER') renderGeneralLedgerSections(doc, yearSection);
    else renderJournalTable(doc, yearSection, true);
  } else {
    if (bookCode === 'GENERAL_LEDGER') renderGeneralLedgerSections(doc, sections[0]);
    else renderJournalTable(doc, sections[0], false);
  }

  // Page footers (Page X of Y) — use bufferedPageRange BEFORE end() so the
  // pages are still buffer-addressable. Calling flushPages() drops the
  // buffered queue, so we must NOT flush before stamping. doc.end() handles
  // the final flush.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const footerY = doc.page.height - doc.page.margins.bottom + 8;
    doc.fontSize(7).fillColor('#666');
    doc.text(
      `Page ${i + 1} of ${range.count}    |    Generated: ${new Date().toISOString()}    |    VIP CRM ERP — Phase VIP-1.J / J5`,
      doc.page.margins.left,
      footerY,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
    );
    doc.fillColor('#000');
  }
  const totalPages = range.count;

  doc.end();
  const buffer = await done;
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Aggregate totals across sections (for monthly: 1 section; for annual: 12 + summary)
  const totals = sections.reduce((acc, s) => {
    if (bookCode === 'GENERAL_LEDGER') {
      acc.account_count = Math.max(acc.account_count, s.totals.account_count);
      acc.line_count += s.totals.line_count;
    } else {
      acc.row_count += s.totals.row_count;
    }
    acc.total_debit += s.totals.total_debit;
    acc.total_credit += s.totals.total_credit;
    return acc;
  }, { row_count: 0, account_count: 0, line_count: 0, total_debit: 0, total_credit: 0 });
  // Annual aggregation double-counts (12 monthly + 1 yearly summary). Simpler:
  // for the "rowCount" returned to the audit log use the year-summary section
  // values when isAnnual, the single section when monthly.
  const summarySection = isAnnual ? sections[12] : sections[0];
  const auditRowCount = bookCode === 'GENERAL_LEDGER'
    ? summarySection.totals.line_count
    : summarySection.totals.row_count;

  const filename = `${bookCode}_${entity?.tin || 'NOTIN'}_${periodFilenameSegment(year, month)}.pdf`;

  return {
    buffer,
    contentHash,
    filename,
    totals: {
      row_count: bookCode === 'GENERAL_LEDGER' ? summarySection.totals.line_count : summarySection.totals.row_count,
      account_count: bookCode === 'GENERAL_LEDGER' ? summarySection.totals.account_count : null,
      total_debit: round2(summarySection.totals.total_debit),
      total_credit: round2(summarySection.totals.total_credit),
    },
    rowCount: auditRowCount,
    period_label: pdfPeriodLabel,
    page_count: totalPages,
  };
}

/**
 * Generate the sworn declaration PDF for a book's annual binding.
 *
 * BIR loose-leaf submission requirement: each book must be accompanied by
 * a sworn declaration signed by the responsible officer, notarised, and
 * filed with the RDO within 15 days of year-end (RR 9-2009 §4).
 *
 * The declaration here is a fillable template — name/title/TIN/CTC come
 * from the BIR_BOA_RESPONSIBLE_OFFICER lookup if seeded, otherwise the
 * subscriber pen-fills before notarisation. The notarisation block
 * (notary public name, jurisdiction, doc/page/book/series numbers) is
 * always pen-filled by the notary.
 */
async function exportSwornDeclaration({ entityId, bookCode, year, entity }) {
  if (!entityId || !bookCode || !year) {
    throw new Error('exportSwornDeclaration requires entityId, bookCode, year.');
  }
  if (!BOOK_CODES.includes(bookCode)) throw new Error(`Invalid bookCode: ${bookCode}`);

  const [bookRules, officer] = await Promise.all([
    loadBookRules(entityId),
    loadResponsibleOfficer(entityId),
  ]);
  const book = bookRules[bookCode];

  const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(11).text('REPUBLIC OF THE PHILIPPINES', { align: 'center' });
  doc.fontSize(10).text('Bureau of Internal Revenue', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(13).text('SWORN DECLARATION', { align: 'center', underline: true });
  doc.moveDown(0.3);
  doc.fontSize(9).text('Loose-Leaf Books of Accounts — RR 9-2009 / RMC 29-2019', { align: 'center' });
  doc.moveDown(1.2);

  doc.fontSize(10).fillColor('#000');
  doc.text(`I, ${officer.name}, of legal age, Filipino, ${officer.title} of ${entity?.entity_name || '(Entity Name)'} (the "Taxpayer"), with Taxpayer Identification Number ${entity?.tin || '(TIN)'} and registered address at ${entity?.address || '(Address)'}, after having been duly sworn to in accordance with law, do hereby depose and state THAT —`, { align: 'justify' });
  doc.moveDown(0.6);
  doc.text(`1. The attached ${book.label} for the calendar year ${year} contains a true and accurate record of all transactions of the Taxpayer for the period covered, in accordance with the requirements of the National Internal Revenue Code of 1997, as amended, and its implementing rules and regulations;`, { align: 'justify' });
  doc.moveDown(0.4);
  doc.text(`2. The book is registered with the Bureau of Internal Revenue under Revenue District Office ${entity?.rdo_code || '(RDO)'}, and is the Taxpayer's Loose-Leaf Books of Accounts as authorised under the Permit issued thereby;`, { align: 'justify' });
  doc.moveDown(0.4);
  doc.text(`3. The transactions recorded herein were classified into the appropriate book in accordance with the Taxpayer's accounting policies and the rules prescribed by the Bureau of Internal Revenue;`, { align: 'justify' });
  doc.moveDown(0.4);
  doc.text(`4. The undersigned has reviewed the records contained herein and affirms their completeness and accuracy under penalty of perjury and the relevant provisions of the National Internal Revenue Code.`, { align: 'justify' });
  doc.moveDown(1);

  doc.text(`IN WITNESS WHEREOF, I have hereunto set my hand this ____ day of ______________, ${year + 1}, at ______________________, Philippines.`, { align: 'justify' });
  doc.moveDown(2);

  // Signature block
  const left = doc.page.margins.left;
  doc.text('_______________________________________', left + 220);
  doc.fontSize(9).text(officer.name, left + 220);
  doc.text(officer.title, left + 220);
  doc.text(`TIN: ${officer.tin}`, left + 220);
  doc.text(`CTC No.: ${officer.ctc_no}`, left + 220);
  doc.text(`Issued at: ${officer.ctc_place}`, left + 220);
  doc.text(`Issued on: ${officer.ctc_date}`, left + 220);
  doc.moveDown(2);

  // Notarisation block (pen-filled by the notary — placeholder)
  doc.fontSize(10).fillColor('#000').text('SUBSCRIBED AND SWORN to before me this ____ day of ______________, ' + (year + 1) + ', at ______________________, affiant exhibiting his/her competent evidence of identity above stated.', { align: 'justify' });
  doc.moveDown(1.4);
  doc.text('_______________________________________');
  doc.fontSize(9).text('NOTARY PUBLIC');
  doc.text('Doc No.: _______');
  doc.text('Page No.: _______');
  doc.text('Book No.: _______');
  doc.text('Series of ' + (year + 1) + '.');
  doc.moveDown(2);

  doc.fontSize(7).fillColor('#666')
     .text(`Generated by VIP CRM ERP — Phase VIP-1.J / J5  |  ${new Date().toISOString()}  |  Book: ${book.label}  |  Year: ${year}`, { align: 'center' });

  doc.end();
  const buffer = await done;
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const filename = `SwornDeclaration_${bookCode}_${year}.pdf`;
  return { buffer, contentHash, filename };
}

module.exports = {
  BOOK_CODES,
  DEFAULT_BOOK_RULES,
  DEFAULT_RESPONSIBLE_OFFICER,
  PRD_CASH_RANGE_REGEX,
  classifyJournalEntry,
  loadBookRules,
  loadCashAccountCodes,
  loadResponsibleOfficer,
  computeBook,
  computeJournalBook,
  computeGeneralLedger,
  exportBookPdf,
  exportSwornDeclaration,
  getBookCatalog,
  // Internal helpers exported for healthcheck / unit tests:
  _internal: { round2, fmtMoney, periodLabel, periodFilenameSegment, buildPeriodMatch },
};
