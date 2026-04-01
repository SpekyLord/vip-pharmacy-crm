/**
 * CSI (Charge Sales Invoice) Parser — v4 (9-sample tuned)
 *
 * Handles VIP Inc. and MG AND CO. invoices, printed and handwritten.
 * Tested against 9 real OCR samples covering:
 *   - 1-product and 3-product invoices
 *   - VIP format ("Invoice N", "CHARGE TO:") and MG format ("No.", "Charged to")
 *   - Printed and handwritten (ALL CAPS, garbled text)
 *   - Pharma products with (generic) and non-pharma items (gloves, masks)
 *   - Numbers on same line, separate lines, or in separate column block
 *   - Dash-decimal "720-00", dot-thousands "2.571.43", paren "14,801)"
 */

const {
  scoredField,
  getWordConfidencesForText,
  splitLines,
} = require('../confidenceScorer');

// ═══════════════════════════════════════════════════════════
// AMOUNT PARSER
// ═══════════════════════════════════════════════════════════

function parseAmount(str) {
  if (!str) return null;
  let cleaned = String(str)
    .replace(/[₱P£#\s]/g, '')
    .replace(/[()]/g, '')
    .trim();
  if (!cleaned) return null;

  // Dash-decimal: "720-00" → "720.00", "3,857-14" → "3857.14"
  const dashMatch = cleaned.match(/^([\d.,]+)-(\d{1,2})$/);
  if (dashMatch) {
    cleaned = dashMatch[1].replace(/[.,]/g, '') + '.' + dashMatch[2];
    return parseFloat(cleaned) || null;
  }

  // Multiple dots = thousands: "2.571.43" → "2571.43", "27.000-00" handled above
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount > 1) {
    const lastDot = cleaned.lastIndexOf('.');
    cleaned = cleaned.substring(0, lastDot).replace(/\./g, '') + '.' + cleaned.substring(lastDot + 1);
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  cleaned = cleaned.replace(/,$/, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractNumbers(line) {
  const nums = [];
  const re = /([\d][.\d,]*\d(?:-\d{1,2})?)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const n = parseAmount(m[1]);
    if (n != null && n > 0) nums.push(n);
  }
  return nums;
}

function isBirLine(line) {
  return /BIR|Auth.*Print|Accreditation|FISHERMAN|AGREEMENT|Printer|Prop\.|Arevalo|PDalisay|Dalisay|Jalandoni|Pacifico|VALID.*CLAIM|DOCUMENT.*NOT|CamScanner/i.test(line);
}

function isSkipLine(line) {
  const t = line.trim();
  return /^(Item\s*Desc|Quantity|Unit\s*Cost|Price$|^Amount$|NOTE|CHARGE\s*SALES|VATable|VAT-Exempt|VAT\s*Amount|Zero-Rated|SC\/PWD|Solo\s*Parent|OSCA|Received\s*the|Cashier|Authorized|AGREEMENT|ARTICLES$|^U\/P$|^Qty$|^Unit$)/i.test(t);
}

// ═══════════════════════════════════════════════════════════
// HEADER EXTRACTION
// ═══════════════════════════════════════════════════════════

function extractInvoiceNo(lines) {
  const text = lines.join('\n');
  // VIP: "Invoice N 004764", "Invoice No 008277"
  const m1 = text.match(/Invoice\s*N[°o]?\s*[:.]?\s*(\d{3,})/i);
  if (m1) return m1[1];
  // MG: "No. 425", "⚫ No. 426", ". No. 424"
  const m2 = text.match(/No\.?\s*(\d{3,})/i);
  if (m2) return m2[1];
  return null;
}

function extractDate(lines) {
  const text = lines.join('\n');
  // Written: "Date: March 31, 2026" or "Date March 31,20 24"
  const wm = text.match(/Date\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s*\d{2,4}(?:\s*\d{0,2})?)/i);
  if (wm) return wm[1].replace(/\s+/g, ' ').trim();
  // Numeric: "Date: 7-14-2026"
  const nm = text.match(/Date\s*[:;]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  if (nm) return nm[1].trim();
  // Handwritten ALL CAPS: "Date: MARCA 71,7024" — pass through raw
  const hm = text.match(/Date\s*[:;]?\s*([A-Z]+\s+\d[\d,\s]*)/i);
  if (hm) return hm[1].replace(/\s+/g, ' ').trim();
  return null;
}

function extractHospital(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/CHARGE[D]?\s*TO\s*[:;]?\s*(.*)/i);
    if (!m) continue;

    const sameLine = m[1].trim();
    // Same line: "Charged to Antique Medical Center"
    if (sameLine.length > 3 && !/^(Invoice|Date|TIN|$)/i.test(sameLine)) {
      // But skip if it's just a partial like "Antique" without "Medical Center"
      return sameLine;
    }

    // Below — skip field labels, find hospital name
    for (let j = i + 1; j <= Math.min(i + 10, lines.length - 1); j++) {
      const c = lines[j].trim();
      if (/^(Invoice|Date|TIN|Registered|Business|TERMS|_?Terms|N[°o]?\s*\d|No\.|CHARGE|Address|SC\/PWD|Qty|Unit|ARTICLES|Item\s*Desc|OSCA|San\s|Jose|aklan|Kalibo|Floilo|City|BS\s*AQUINO|DIPOLOG|OUNGAN)/i.test(c)) continue;
      if (/^[:;.\s_-]*$/.test(c)) continue;
      if (c.length < 3) continue;
      if (/^\d+$/.test(c)) continue;

      // Could be multi-line: "THE DOCTORS" + "HOSPITAL"
      let hospital = c;
      if (j + 1 < lines.length) {
        const next = lines[j + 1].trim();
        if (/^(HOSPITAL|MEDICAL|CLINIC|CENTER|INFIRMARY)/i.test(next)) {
          hospital += ' ' + next;
        }
      }
      return hospital;
    }
    break;
  }
  return null;
}

function extractTerms(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/_?Terms\s*[:;]?\s*(.*)/i);
    if (!m) continue;
    const val = m[1].trim();
    // Filter out false positives like "Item Description / Nature of Service"
    if (/Item\s*Desc|Nature\s*of/i.test(val)) continue;
    if (val.length > 1 && val.length < 30 && !/^[:\s.]+$/.test(val)) return val;
    // Next line
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (/^\d+\s*(days?|DAYS?)/i.test(next) || /^(30|60|90)\b/i.test(next)) {
        return next;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// PRODUCT BLOCKS
// ═══════════════════════════════════════════════════════════

const RE_BATCH = /Batch\s*[#]?\s*(?:no|lot)?\.?\s*[:;]?\s*([A-Z0-9][\w+\s-]*\w)/i;
const RE_LOT = /LOT\s*[#]?\s*[:;]?\s*([A-Z0-9][\w\s-]*\w)/i;
const RE_PRODUCT_PARENS = /(.+?)\s*\(\s*([^)]+)\s*\)\s*(.+?)$/;
const RE_PRODUCT_BROKEN = /(.+?)\s+[C(]\s*([^)]+)\)\s*(.+?)$/i;

// Unit prefixes to strip from brand names
const UNIT_WORDS = /^(\d+\s*)?(?:vials?|pcs?|tabs?|caps?|boxes?|bottles?|amps?|units?|bots?|pairs?)\s+/i;

function extractProductBlocks(lines) {
  const blocks = [];
  const usedLines = new Set();

  for (let i = 0; i < lines.length; i++) {
    // Match "Batch no.", "Batch #", or "LOT #"
    const batchMatch = lines[i].match(RE_BATCH) || lines[i].match(RE_LOT);
    if (!batchMatch) continue;

    const batchLotNo = batchMatch[1].replace(/\s+/g, ' ').trim();
    usedLines.add(i);

    let brandName = null;
    let genericName = null;
    let dosage = null;

    // Search nearby lines for product name
    const nearby = [];
    for (let j = Math.max(0, i - 4); j <= Math.min(lines.length - 1, i + 4); j++) {
      if (j === i || usedLines.has(j)) continue;
      nearby.push({ idx: j, line: lines[j].trim(), dist: Math.abs(j - i) });
    }
    nearby.sort((a, b) => a.dist - b.dist);

    for (const c of nearby) {
      if (c.line.length < 4) continue;
      if (RE_BATCH.test(c.line) || RE_LOT.test(c.line)) continue;
      if (/^Exp/i.test(c.line)) continue;
      if (isSkipLine(c.line)) continue;
      if (/^\d[\d.,\s]*$/.test(c.line)) continue;
      if (isBirLine(c.line)) continue;
      // Skip address/location lines
      if (/^(San\s|Jose|aklan|Kalibo|Floilo|City|BS\s*AQUINO|Medical\s*Center|Antique$)/i.test(c.line)) continue;

      // Try parentheses match
      let pMatch = c.line.match(RE_PRODUCT_PARENS) || c.line.match(RE_PRODUCT_BROKEN);
      if (pMatch) {
        let rawBrand = pMatch[1].trim();
        genericName = pMatch[2].trim();
        dosage = pMatch[3].trim();
        // Strip unit prefix: "50 vials Onitaz" → "Onitaz"
        rawBrand = rawBrand.replace(UNIT_WORDS, '').trim();
        brandName = rawBrand;
        usedLines.add(c.idx);
        break;
      }

      // No parens — non-pharma item or garbled text
      if (!/^(NOTE|CHARGE|TERMS|Date|Registered|Business|TIN|Invoice|Address|Charged|MG\s*AND|MILLIGRAM|VAT\s*Reg|B4\s*L7)/i.test(c.line)) {
        let raw = c.line;
        raw = raw.replace(UNIT_WORDS, '').trim();
        if (raw.length > 2) {
          brandName = raw;
          usedLines.add(c.idx);
          break;
        }
      }
    }

    // Find expiry within ±7 lines
    let expiryDate = null;
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 7); j++) {
      if (j === i) continue;
      // Strict: date pattern after Exp
      const em = lines[j].match(/Exp(?:iry)?\.?\s*[-]?\s*(?:Date|dat|dab)?\s*[:;]?\s*(\d{1,2}[\/\-]\d{2,4}(?:[\/\-]\d{2,4})?)/i)
              || lines[j].match(/Exp(?:iry)?\.?\s*[-]?\s*(?:Date|dat|dab)?\s*[:;]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i)
              || lines[j].match(/Exp(?:iry)?\.?\s*[-]?\s*(?:Date|dat|dab)?\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{4})/i)
              || lines[j].match(/EXPIRY\s*DATE\s*[:;]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (em) {
        expiryDate = em[1].trim();
        usedLines.add(j);
        break;
      }
    }

    blocks.push({
      batchLineIdx: i,
      brand_name: brandName,
      generic_name: genericName,
      dosage: dosage,
      batch_lot_no: batchLotNo,
      expiry_date: expiryDate,
      qty: null,
      unit_price: null,
      amount: null,
    });
  }

  return blocks;
}

// ═══════════════════════════════════════════════════════════
// NUMBER ASSIGNMENT — the hardest part
// ═══════════════════════════════════════════════════════════

function findFooterStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/Total\s*Sales\s*\(?\s*VAT/i.test(lines[i])) return i;
  }
  return lines.length;
}

/**
 * Collect product numbers from lines BEFORE "Total Sales".
 * Numbers may be:
 *   a) On same line as product: "3,000 ₤2.00 #6,000"
 *   b) On separate lines below product block: "50\n550.00\n27,500.00"
 *   c) In a separate column block (MG format): "799.11\n39,955.50\n720-00\n36,000.00\n540.00\n27.000-00"
 *
 * Strategy: collect all number-only lines before footer,
 *           then assign in order (every 3 numbers = qty, price, amount for next product)
 */
function assignProductNumbers(lines, blocks, footerIdx) {
  if (blocks.length === 0) return;

  // Step 1: Collect ALL number entries before footer
  const numEntries = [];

  for (let i = 0; i < footerIdx; i++) {
    const line = lines[i].trim();

    // Skip TIN patterns
    if (/\d{3}[-\s]\d{3}[-\s]\d{3}/i.test(line)) continue;
    // Skip batch/expiry lines
    if (RE_BATCH.test(line) || RE_LOT.test(line)) continue;
    if (/^Exp/i.test(line)) continue;
    // Skip label lines
    if (isSkipLine(line)) continue;
    if (isBirLine(line)) continue;
    // Skip lines with substantial non-numeric text (>5 alpha chars)
    const alphaOnly = line.replace(/[\d₱P£#.,\-\s()/]/g, '').trim();
    if (alphaOnly.length > 5) continue;

    const nums = extractNumbers(line);
    for (const n of nums) {
      // Filter non-monetary
      if (n >= 2020 && n <= 2040 && Number.isInteger(n)) continue;
      if (n > 999999 && Number.isInteger(n)) continue;
      numEntries.push({ idx: i, value: n });
    }
  }

  if (numEntries.length === 0) return;

  // Step 2: Group into sets of 3 (qty, unit_price, amount) per product
  // For N products, we expect N×3 numbers (or N×2 if unit_price missing)
  const values = numEntries.map(e => e.value);
  const productCount = blocks.length;

  if (values.length >= productCount * 3) {
    // Perfect: 3 numbers per product
    for (let p = 0; p < productCount; p++) {
      blocks[p].qty = values[p * 3];
      blocks[p].unit_price = values[p * 3 + 1];
      blocks[p].amount = values[p * 3 + 2];
    }
  } else if (values.length >= productCount * 2) {
    // 2 numbers per product (qty + amount, no unit price)
    for (let p = 0; p < productCount; p++) {
      blocks[p].qty = values[p * 2];
      blocks[p].amount = values[p * 2 + 1];
    }
  } else if (productCount === 1) {
    // Single product — take last 3 (or 2 or 1)
    if (values.length >= 3) {
      blocks[0].qty = values[values.length - 3];
      blocks[0].unit_price = values[values.length - 2];
      blocks[0].amount = values[values.length - 1];
    } else if (values.length === 2) {
      blocks[0].qty = values[0];
      blocks[0].amount = values[1];
    } else {
      blocks[0].amount = values[0];
    }
  } else {
    // Fallback: distribute numbers by proximity to batch lines
    const remaining = [...numEntries];
    for (const block of blocks) {
      remaining.sort((a, b) => Math.abs(a.idx - block.batchLineIdx) - Math.abs(b.idx - block.batchLineIdx));
      const take = remaining.splice(0, Math.min(3, remaining.length));
      const tv = take.map(t => t.value);
      if (tv.length >= 3) {
        block.qty = tv[0]; block.unit_price = tv[1]; block.amount = tv[2];
      } else if (tv.length === 2) {
        block.qty = tv[0]; block.amount = tv[1];
      } else if (tv.length === 1) {
        block.amount = tv[0];
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// FOOTER TOTALS
// ═══════════════════════════════════════════════════════════

function extractFooterTotals(lines, footerIdx) {
  const amounts = [];

  for (let i = footerIdx; i < lines.length; i++) {
    if (isBirLine(lines[i])) break;

    const nums = extractNumbers(lines[i]);
    for (const n of nums) {
      if (n >= 2020 && n <= 2040 && Number.isInteger(n)) continue;
      if (n > 999999 && Number.isInteger(n)) continue;
      if (n < 1) continue;
      amounts.push(n);
    }
  }

  let totalVatInc = null, lessVat = null, netOfVat = null, totalDue = null;

  if (amounts.length >= 4) {
    totalVatInc = amounts[0];
    lessVat = amounts[1];
    netOfVat = amounts[2];
    totalDue = amounts[amounts.length - 1];
  } else if (amounts.length === 3) {
    totalVatInc = amounts[0];
    lessVat = amounts[1];
    netOfVat = amounts[2];
    totalDue = amounts[0];
  } else if (amounts.length === 2) {
    totalVatInc = amounts[0];
    totalDue = amounts[1];
  } else if (amounts.length === 1) {
    totalDue = amounts[0];
  }

  return { totalVatInc, lessVat, netOfVat, totalDue };
}

// ═══════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════

function validateFooter(totals) {
  const flags = [];
  const ti = totals.total_vat_inclusive?.value;
  const lv = totals.less_vat?.value;

  if (ti != null && lv != null) {
    const expected = ti * 12 / 112;
    if (Math.abs(lv - expected) > 2) {
      flags.push({
        type: 'FOOTER_MISMATCH',
        message: `VAT mismatch — extracted ${lv.toFixed(2)}, expected ${expected.toFixed(2)} (Total × 12/112). Please verify.`,
      });
    }
  }

  return flags;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function parseCSI(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  const invoiceNo = extractInvoiceNo(lines);
  const date = extractDate(lines);
  const hospital = extractHospital(lines);
  const terms = extractTerms(lines);

  const footerIdx = findFooterStart(lines);
  const blocks = extractProductBlocks(lines);
  assignProductNumbers(lines, blocks, footerIdx);
  const footer = extractFooterTotals(lines, footerIdx);

  const lineItems = blocks.map((b) => ({
    brand_name: scoredField(b.brand_name, getWordConfidencesForText(words, b.brand_name), !!b.brand_name),
    generic_name: scoredField(b.generic_name, getWordConfidencesForText(words, b.generic_name), !!b.generic_name),
    dosage: scoredField(b.dosage, getWordConfidencesForText(words, b.dosage), !!b.dosage),
    batch_lot_no: scoredField(b.batch_lot_no, getWordConfidencesForText(words, b.batch_lot_no), true),
    expiry_date: scoredField(b.expiry_date, getWordConfidencesForText(words, b.expiry_date), !!b.expiry_date),
    qty: scoredField(b.qty, getWordConfidencesForText(words, String(b.qty || '')), b.qty != null),
    unit_price: scoredField(b.unit_price, getWordConfidencesForText(words, String(b.unit_price || '')), b.unit_price != null),
    amount: scoredField(b.amount, getWordConfidencesForText(words, String(b.amount || '')), b.amount != null),
  }));

  const totals = {
    total_vat_inclusive: scoredField(footer.totalVatInc, getWordConfidencesForText(words, String(footer.totalVatInc || '')), footer.totalVatInc != null),
    less_vat: scoredField(footer.lessVat, getWordConfidencesForText(words, String(footer.lessVat || '')), footer.lessVat != null),
    net_of_vat: scoredField(footer.netOfVat, getWordConfidencesForText(words, String(footer.netOfVat || '')), footer.netOfVat != null),
    total_amount_due: scoredField(footer.totalDue, getWordConfidencesForText(words, String(footer.totalDue || '')), footer.totalDue != null),
  };

  validationFlags.push(...validateFooter(totals));

  return {
    invoice_no: scoredField(invoiceNo, getWordConfidencesForText(words, invoiceNo), !!invoiceNo),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    hospital: scoredField(hospital, getWordConfidencesForText(words, hospital), !!hospital),
    terms: scoredField(terms, getWordConfidencesForText(words, terms), !!terms),
    line_items: lineItems,
    totals,
    validation_flags: validationFlags,
  };
}

module.exports = {
  parseCSI,
  extractProductBlocks,
};
