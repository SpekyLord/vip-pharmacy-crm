/**
 * Phase 15.3 — CSI Draft Overlay Renderer
 *
 * Produces a mm-precise PDF that a BDM feeds THROUGH their physical
 * BIR-registered CSI booklet. The PDF prints only the variable data
 * (customer, date, items, totals) — the booklet supplies all pre-printed
 * content (invoice #, logo, TIN, ATP footer, column labels). This is NOT
 * a valid BIR receipt on its own; it is an overlay helper.
 *
 * Coordinates come from the per-entity CSI_TEMPLATE Lookup row
 * (metadata shape in seedCsiTemplates.js). Caller is responsible for
 * loading and shaping the inputs — this renderer is pure layout.
 *
 * ── Coordinate semantics (Apr 27 2026) ──────────────────────────────
 * Uniform across every field — header, body rows, batch line, expiry
 * line, PO row, notes, both totals stacks:
 *   x = LEFT edge of the first character, measured from the left of the page.
 *   y = BASELINE of the letter (the line letters sit on, not the top of
 *       the bounding box), measured from the top of the page.
 * Renderer compensates by subtracting the font ascent before handing y to
 * PDFKit (which expects y at the top of the line box). The calibration
 * crosshair is geometric (no font), so its (x, y) point coincides exactly
 * with the rendered baseline of the first character.
 * The legacy `align` field on each column/totals block is now ignored —
 * everything is left-edge anchored.
 *
 * ── Callers ─────────────────────────────────────────────────────────
 *   renderCsiDraft({ sale, entity, template, user, customerLabel,
 *                    customerAddress, lineDisplay, terms })
 *     → Promise<Buffer>
 *
 *   renderCalibrationGrid({ template, user })  (Phase 15.3.3)
 *     → Promise<Buffer>
 */

const PDFDocument = require('pdfkit');
const { abbreviateUnit } = require('../utils/normalize');

const MM_TO_PT = 2.8346;
const mm = (v) => v * MM_TO_PT;

// ─── Public API ─────────────────────────────────────────────────────

async function renderCsiDraft({
  sale,
  entity,
  template,
  user,
  customerLabel,
  customerAddress,
  lineDisplay,
  terms,
}) {
  if (!template) throw new Error('CSI_TEMPLATE_NOT_CONFIGURED');
  if (!sale) throw new Error('CSI_DRAFT_MISSING_SALE');
  if (!Array.isArray(lineDisplay) || lineDisplay.length === 0) {
    throw new Error('CSI_DRAFT_EMPTY_LINES');
  }

  const tpl = template.metadata || template;
  // Two-layer offset model — printer-agnostic CSI output:
  //   1) tpl.feed_offset = where the booklet sits on the page for the
  //      entity's PRIMARY printer (e.g. (25, 47.5) for a Brother that
  //      centers a 160×202 booklet on A4). Lookup-driven, configurable
  //      via Lookup Manager — same printer = same value for everyone.
  //   2) user.csi_printer_offset_*_mm = per-user fine tuning for
  //      printers that differ from the primary (different brand, drift,
  //      manual calibration). Defaults to 0 if the user never calibrated.
  // Final = lookup x + feed_offset + user_offset.
  const feedOffsetX = Number(tpl.feed_offset?.x_mm) || 0;
  const feedOffsetY = Number(tpl.feed_offset?.y_mm) || 0;
  const userOffsetX = Number(user?.csi_printer_offset_x_mm) || 0;
  const userOffsetY = Number(user?.csi_printer_offset_y_mm) || 0;
  const offsetX = feedOffsetX + userOffsetX;
  const offsetY = feedOffsetY + userOffsetY;

  const pageSize = [mm(tpl.page.width_mm), mm(tpl.page.height_mm)];
  const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: false });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const maxPerPage = Math.max(1, Number(tpl.body.max_items_per_page) || 3);
  const chunkedLines = chunkArray(lineDisplay, maxPerPage);

  for (let i = 0; i < chunkedLines.length; i++) {
    doc.addPage({ size: pageSize, margin: 0 });
    drawPage({
      doc,
      tpl,
      offsetX,
      offsetY,
      customerLabel,
      customerAddress,
      csiDate: sale.csi_date,
      terms,
      poNumber: sale.po_number,
      lines: chunkedLines[i],
      totals: buildTotalsView(sale, lineDisplay),
      pageMeta: { index: i + 1, total: chunkedLines.length },
    });
  }

  doc.end();
  return done;
}

async function renderCalibrationGrid({ template, user }) {
  if (!template) throw new Error('CSI_TEMPLATE_NOT_CONFIGURED');
  const tpl = template.metadata || template;
  // Same two-layer offset model as renderCsiDraft so the calibration
  // crosshair lands exactly where the booklet content will land.
  const feedOffsetX = Number(tpl.feed_offset?.x_mm) || 0;
  const feedOffsetY = Number(tpl.feed_offset?.y_mm) || 0;
  const userOffsetX = Number(user?.csi_printer_offset_x_mm) || 0;
  const userOffsetY = Number(user?.csi_printer_offset_y_mm) || 0;
  const offsetX = feedOffsetX + userOffsetX;
  const offsetY = feedOffsetY + userOffsetY;

  const pageSize = [mm(tpl.page.width_mm), mm(tpl.page.height_mm)];
  const doc = new PDFDocument({ size: pageSize, margin: 0, autoFirstPage: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const px = (x) => mm(x + offsetX);
  const py = (y) => mm(y + offsetY);
  const maxX = tpl.page.width_mm;
  const maxY = tpl.page.height_mm;

  // ── 5mm × 5mm grid ────────────────────────────────────────────────
  doc.lineWidth(0.15).strokeColor('#999');
  for (let x = 0; x <= maxX; x += 5) {
    doc.moveTo(px(x), py(0)).lineTo(px(x), py(maxY)).stroke();
  }
  for (let y = 0; y <= maxY; y += 5) {
    doc.moveTo(px(0), py(y)).lineTo(px(maxX), py(y)).stroke();
  }

  // ── Bold lines every 10mm ─────────────────────────────────────────
  doc.lineWidth(0.4).strokeColor('#555');
  for (let x = 0; x <= maxX; x += 10) {
    doc.moveTo(px(x), py(0)).lineTo(px(x), py(maxY)).stroke();
  }
  for (let y = 0; y <= maxY; y += 10) {
    doc.moveTo(px(0), py(y)).lineTo(px(maxX), py(y)).stroke();
  }

  // ── mm labels on edges (every 10mm) ───────────────────────────────
  doc.font('Helvetica').fontSize(5).fillColor('#333');
  for (let x = 10; x < maxX; x += 10) {
    doc.text(String(x), px(x) + 0.5, py(1), { lineBreak: false });
  }
  for (let y = 10; y < maxY; y += 10) {
    doc.text(String(y), px(1), py(y) - 1.5, { lineBreak: false });
  }

  // ── Reference crosshairs at each key CSI field anchor ─────────────
  // Lets the BDM put their printed sheet over the booklet and SEE
  // exactly where each data field is expected to land.
  doc.lineWidth(0.6).strokeColor('#d00');
  const anchors = [
    { x: tpl.header.name.x,    y: tpl.header.name.y,    label: 'NAME' },
    { x: tpl.header.date.x,    y: tpl.header.date.y,    label: 'DATE' },
    { x: tpl.header.address.x, y: tpl.header.address.y, label: 'ADDR' },
    { x: tpl.header.terms.x,   y: tpl.header.terms.y,   label: 'TERMS' },
    { x: (tpl.body.columns.description || tpl.body.columns.articles).x,
      y: tpl.body.first_row_y_mm, label: 'ROW1' },
    { x: tpl.totals.right.x_mm, y: tpl.totals.right.start_y_mm, label: 'TOT_R' },
    { x: tpl.totals.left.x_mm,  y: tpl.totals.left.start_y_mm,  label: 'TOT_L' },
  ];
  doc.font('Helvetica-Bold').fontSize(6).fillColor('#d00');
  anchors.forEach((a) => {
    // 2mm crosshair
    doc.moveTo(px(a.x - 1), py(a.y)).lineTo(px(a.x + 1), py(a.y)).stroke();
    doc.moveTo(px(a.x), py(a.y - 1)).lineTo(px(a.x), py(a.y + 1)).stroke();
    doc.text(a.label, px(a.x) + 2, py(a.y) - 2, { lineBreak: false });
  });

  // ── Header — top-left corner tag ──────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#000');
  doc.text(`CSI CALIBRATION GRID · ${tpl.page.width_mm}×${tpl.page.height_mm}mm · offset X=${offsetX} Y=${offsetY}`,
           px(5), py(5), { lineBreak: false });

  doc.end();
  return done;
}

// ─── Page rendering ─────────────────────────────────────────────────

function drawPage({ doc, tpl, offsetX, offsetY, customerLabel, customerAddress,
                   csiDate, terms, poNumber, lines, totals }) {
  const font = tpl.font?.family || 'Helvetica-Bold';
  const size = tpl.font?.size_pt || 10;
  doc.font(font).fontSize(size).fillColor('#000');

  const px = (x) => mm(x + offsetX);
  const py = (y) => mm(y + offsetY);

  // ── Header fields ─────────────────────────────────────────────────
  drawText(doc, safe(customerLabel), px(tpl.header.name.x),    py(tpl.header.name.y));
  drawText(doc, formatDate(csiDate),  px(tpl.header.date.x),    py(tpl.header.date.y));
  drawText(doc, safe(customerAddress),px(tpl.header.address.x), py(tpl.header.address.y));
  drawText(doc, safe(terms),          px(tpl.header.terms.x),   py(tpl.header.terms.y));

  // ── Body rows ─────────────────────────────────────────────────────
  const firstY = tpl.body.first_row_y_mm;
  const rowH = tpl.body.row_height_mm;
  const cols = tpl.body.columns;
  const isVipShape = Boolean(cols.description);  // VIP has description, MG has articles

  // Lookup-driven abbreviation (Rule #3): subscribers tune via CSI_TEMPLATE
  // Lookup metadata. Helper falls back to threshold=4/length=3 defaults if
  // the template hasn't been migrated yet.
  const abbrevOpts = {
    overrides: tpl.text?.unit_abbreviations || {},
    threshold: tpl.text?.unit_abbrev_threshold,
    length: tpl.text?.unit_abbrev_length,
  };

  lines.forEach((line, idx) => {
    const itemRow = idx * 3;
    const batchRow = itemRow + 1;
    const expRow   = itemRow + 2;

    const itemYmm  = firstY + rowH * itemRow;
    const batchYmm = firstY + rowH * batchRow;
    const expYmm   = firstY + rowH * expRow;

    const unitAbbr = abbreviateUnit(line.unit, abbrevOpts);

    if (isVipShape) {
      // VIP: Item Description · Quantity · Unit Cost · Amount
      // The booklet has NO dedicated Unit column — pack the unit (AMP/BOT/...)
      // at the end of the description so it lands right before Quantity.
      // If a template still defines cols.unit (legacy), honor it instead.
      const descBase = safe(line.description);
      const desc = (cols.unit || !unitAbbr) ? descBase : `${descBase} ${unitAbbr}`;
      drawText(doc, desc, px(cols.description.x), py(itemYmm));
      if (cols.unit) {
        drawText(doc, unitAbbr,             px(cols.unit.x),        py(itemYmm), { align: cols.unit.align || 'left' });
      }
      drawText(doc, formatQty(line.qty),    px(cols.quantity.x),    py(itemYmm), { align: cols.quantity.align });
      drawText(doc, formatMoney(line.unit_price), px(cols.unit_cost.x), py(itemYmm), { align: cols.unit_cost.align });
      drawText(doc, formatMoney(line.amount),     px(cols.amount.x),    py(itemYmm), { align: cols.amount.align });
    } else {
      // MG AND CO.: Qty · Unit · Articles · U/P · Amount
      drawText(doc, formatQty(line.qty),    px(cols.quantity.x), py(itemYmm), { align: cols.quantity.align });
      drawText(doc, unitAbbr,               px(cols.unit.x),     py(itemYmm), { align: cols.unit.align });
      drawText(doc, safe(line.description), px(cols.articles.x), py(itemYmm), { align: cols.articles.align });
      drawText(doc, formatMoney(line.unit_price), px(cols.unit_price.x), py(itemYmm), { align: cols.unit_price.align });
      drawText(doc, formatMoney(line.amount),     px(cols.amount.x),     py(itemYmm), { align: cols.amount.align });
    }

    // Batch and Exp rows — description-column x on both shapes
    const batchColX = isVipShape ? cols.description.x : cols.articles.x;
    if (line.batch_lot_no) {
      drawText(doc, `Batch No. - ${line.batch_lot_no}`, px(batchColX), py(batchYmm));
    }
    if (line.exp_date) {
      drawText(doc, `Exp. Date: ${formatExpiry(line.exp_date)}`, px(batchColX), py(expYmm));
    }
  });

  // ── PO# row (only if value) ───────────────────────────────────────
  if (poNumber) {
    const poRowIdx = tpl.body.po_row_index - 1;  // convert to 0-based offset
    const poYmm = firstY + rowH * poRowIdx;
    const poColX = isVipShape ? cols.description.x : cols.articles.x;
    drawText(doc, `${tpl.text.po_label || 'PO#:'} ${poNumber}`, px(poColX), py(poYmm));
  }

  // ── NOTE rows (always) ────────────────────────────────────────────
  const noteStart = tpl.body.note_row_start_index - 1;
  const noteColX = isVipShape ? cols.description.x : cols.articles.x;
  const noteY1 = firstY + rowH * noteStart;
  const noteY2 = firstY + rowH * (noteStart + 1);
  drawText(doc, tpl.text.note_line_1 || '', px(noteColX), py(noteY1));
  drawText(doc, tpl.text.note_line_2 || '', px(noteColX), py(noteY2));

  // ── Totals ────────────────────────────────────────────────────────
  drawTotalsBlock(doc, tpl.totals.left,  totals, px, py);
  drawTotalsBlock(doc, tpl.totals.right, totals, px, py);
}

function drawTotalsBlock(doc, block, totals, px, py) {
  if (!block || !Array.isArray(block.fields)) return;
  block.fields.forEach((key, i) => {
    const value = totals[key];
    if (value === undefined || value === null) return;
    // Skip zero values on the LEFT block (common case is all-blank) but
    // always print the RIGHT block so the draft matches scanned layout.
    const isRightBlock = block.x_mm >= 100;  // heuristic: right-block x > 100mm
    if (!isRightBlock && !value) return;
    const x = px(block.x_mm);
    const y = py(block.start_y_mm + block.row_height_mm * i);
    drawText(doc, formatMoney(value), x, y, { align: block.align || 'right' });
  });
}

// ─── Totals view builder ────────────────────────────────────────────
// Computes all possible totals fields (both templates' unions). Unused
// fields on a given template's block are simply ignored by drawTotalsBlock.
function buildTotalsView(sale, allLines) {
  const vatable = Number(sale.total_net_of_vat) || 0;  // net-of-VAT proxy for vatable sales
  const vat     = Number(sale.total_vat) || 0;
  const gross   = Number(sale.invoice_total) || (vatable + vat);
  return {
    vatable_sales: vatable,
    vat,
    vat_amount: vat,
    zero_rated: 0,
    vat_exempt: 0,
    total_sales_vat_inclusive: gross,
    less_vat: vat,
    amount_net_of_vat: vatable,
    less_discount: 0,
    less_sc_pwd_discount: 0,
    amount_due: gross,
    add_vat: 0,
    less_withholding_tax: 0,
    total_amount_due: gross,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function drawText(doc, text, x, y /* , opts unused */) {
  if (text === undefined || text === null || text === '') return;
  const str = String(text);
  // Lookup convention (uniform for every field):
  //   x = LEFT edge of the first character, measured from the left of the page
  //   y = BASELINE of the letter, measured from the top of the page
  // PDFKit's native y is the top of the line box, so we subtract the font's
  // ascent so the baseline lands at the lookup-supplied y. The calibration
  // crosshair is geometric (no font), so its (x, y) point coincides with
  // the rendered baseline.
  const ascent = ((doc._font && doc._font.ascender) || 718) / 1000 * doc._fontSize;
  const drawY = y - ascent;
  doc.text(str, x, drawY, { lineBreak: false });
}

function safe(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function formatDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatExpiry(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  // MM/DD/YYYY — matches what the GRN audit / entry pages render via
  // toLocaleDateString('en-PH'), keeping the operator's mental model
  // consistent across receiving and selling.
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${date.getFullYear()}`;
}

function formatMoney(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (!isFinite(num)) return '';
  return num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQty(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (!isFinite(num)) return '';
  return Number.isInteger(num) ? String(num) : num.toString();
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

module.exports = {
  renderCsiDraft,
  renderCalibrationGrid,
  MM_TO_PT,
};
