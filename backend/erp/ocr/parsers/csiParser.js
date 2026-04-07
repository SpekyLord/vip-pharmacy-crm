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

const {
  normalizeWords,
  detectCSIZones,
  findWordsInRect,
  buildSpatialLines,
  getLineIndicesInZone,
} = require('../spatialUtils');

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
  // VIP: "Invoice N 004764", "Invoice No 008277"
  for (const line of lines) {
    const m1 = line.match(/Invoice\s*N[°o]?\s*[:.]?\s*(\d{3,})/i);
    if (m1) return m1[1];
  }
  // MG: "No. 425", "⚫ No. 426", ". No. 424" — but NOT BIR/accreditation/booklet lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBirLine(line)) continue;
    if (/Accred|ATP|OCN|074AU|Bkl|Nos\.|Series/i.test(line)) continue;
    const m2 = line.match(/No\.?\s*(\d{3,})/i);
    if (m2) return m2[1];

    // "No." on its own line — check previous and next lines for standalone number
    if (/^\s*\.?\s*No\.?\s*$/i.test(line.trim())) {
      // Check previous line
      if (i > 0) {
        const prevNum = lines[i - 1].trim().match(/(\d{3,})/);
        if (prevNum && !isBirLine(lines[i - 1]) && !/Accred|ATP|OCN|074AU|Bkl/i.test(lines[i - 1])) {
          return prevNum[1];
        }
      }
      // Check next line
      if (i + 1 < lines.length) {
        const nextNum = lines[i + 1].trim().match(/(\d{3,})/);
        if (nextNum && !isBirLine(lines[i + 1]) && !/Accred|ATP|OCN|074AU|Bkl|Date/i.test(lines[i + 1])) {
          return nextNum[1];
        }
      }
    }
  }
  return null;
}

function extractDate(lines) {
  const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const monthRe = new RegExp(`(?:[A-Z])?(${monthPattern}\\.?\\s+\\d{1,2},?\\s*\\d{2,4})`, 'i');
  const numericRe = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;

  const invoiceIdx = lines.findIndex((l) => /invoice|no\.?\s*\d/i.test(l));
  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] || '').trim();
    if (!raw) continue;
    if (/run\s*date|date\s*issued|bir|accreditation|auth\s*to\s*print|printer|fisherman|agreement/i.test(raw)) continue;

    const hasDateLabel = /\bdate\b/i.test(raw);
    const monthMatch = raw.match(monthRe);
    const numericMatch = hasDateLabel ? raw.match(numericRe) : null;

    let value = null;
    if (monthMatch) {
      value = monthMatch[1].replace(/\s+/g, ' ').trim();
    } else if (numericMatch) {
      value = numericMatch[1].trim();
    } else if (hasDateLabel) {
      // Handwritten fallback: "Date: MARCA 71,7024"
      const hm = raw.match(/Date\s*[:;]?\s*([A-Z]+\s+\d[\d,\s]*)/i);
      if (hm) value = hm[1].replace(/\s+/g, ' ').trim();
    }

    if (!value) continue;

    let score = 0;
    if (hasDateLabel) score += 100;
    if (monthMatch) score += 30;
    if (i <= 30) score += 20; // Header/top area bias
    if (invoiceIdx >= 0) score += Math.max(0, 25 - Math.abs(i - invoiceIdx));

    candidates.push({ value, score });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].value;
  }

  return null;
}

function extractHospital(lines) {
  let chargedToValue = null;
  let chargedToIdx = -1;
  const chargeToRe = /(?:CHARGE[D]?|[CI]?ARGE[D]?)\s*(?:TO|T0)\s*[:;]?\s*(.*)/i;
  const hospitalKeywordRe = /Medical\s*Center|Hospital|Clinic|Infirmary|Health\s*Care|Cooperative/i;

  // Step 1: Find "Charged to" / "CHARGE TO:" and extract the name fragment
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(chargeToRe);
    if (!m) continue;
    chargedToValue = m[1].trim();
    chargedToIdx = i;
    break;
  }

  // OCR may miss the leading "C" and fail CHARGE TO detection.
  // Fall back to hospital keyword scan when no charge label is found.
  if (chargedToIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      const c = lines[i].trim();
      if (!hospitalKeywordRe.test(c)) continue;
      if (/MG\s*AND|MILLIGRAM|INCORPORATED|Lawaan|Balantang|Jaro|Iloilo\s*City|Mandurriao|VAT|TIN|Address|Business|Registered/i.test(c)) continue;
      if (c.length > 5 && c.length < 80) return c;
    }
    return null;
  }

  // Step 2: Search ALL lines (not just adjacent) for hospital/medical/clinic keywords
  // OCR two-column layout may put "Medical Center" many lines away from "Charged to"
  const hospitalSuffixes = [];
  for (let j = 0; j < lines.length; j++) {
    if (j === chargedToIdx) continue;
    const c = lines[j].trim();
    // Match lines that ARE hospital name parts
    if (/^(Medical\s*Center|Hospital|Clinic|Infirmary|Health\s*Care|Cooperative|Multi.?Purpose)/i.test(c)) {
      hospitalSuffixes.push({ idx: j, text: c });
    }
    // Also match "XXX Medical Center", "XXX Hospital" etc. as standalone
    if (hospitalKeywordRe.test(c) &&
        !/MG\s*AND|MILLIGRAM|INCORPORATED|Lawaan|Balantang|Jaro|Iloilo\s*City|Mandurriao|VAT|TIN/i.test(c)) {
      // This line itself IS a hospital name
      if (c.length > 5 && c.length < 80) {
        hospitalSuffixes.push({ idx: j, text: c });
      }
    }
  }

  // Step 3: Combine "Charged to" value with the closest hospital suffix
  if (chargedToValue && chargedToValue.length > 2 && !/^(Invoice|Date|TIN|$)/i.test(chargedToValue)) {
    // Check if the chargedToValue already contains a full hospital name
    if (/Hospital|Medical|Clinic|Infirmary|Health\s*Care|Cooperative/i.test(chargedToValue)) {
      return chargedToValue;
    }

    // Find the closest hospital suffix and combine
    if (hospitalSuffixes.length > 0) {
      // Sort by distance from chargedTo line
      hospitalSuffixes.sort((a, b) => Math.abs(a.idx - chargedToIdx) - Math.abs(b.idx - chargedToIdx));
      const suffix = hospitalSuffixes[0];
      // If the suffix starts with "Medical Center", "Hospital", etc., append to chargedToValue
      if (/^(Medical|Hospital|Clinic|Infirmary|Health|Cooperative|Multi)/i.test(suffix.text)) {
        return chargedToValue + ' ' + suffix.text;
      }
      // If the suffix is a full hospital name already, return it
      return suffix.text;
    }

    // No suffix found — return the raw value
    return chargedToValue;
  }

  // Step 3b: chargedToValue is empty but hospital keyword lines were found nearby — use the closest
  if (hospitalSuffixes.length > 0) {
    hospitalSuffixes.sort((a, b) => Math.abs(a.idx - chargedToIdx) - Math.abs(b.idx - chargedToIdx));
    return hospitalSuffixes[0].text;
  }

  // Step 4: Fallback — search for standalone hospital name lines
  for (let j = chargedToIdx + 1; j <= Math.min(chargedToIdx + 15, lines.length - 1); j++) {
    const c = lines[j].trim();
    if (/^(Invoice|Date|TIN|Registered|Business|TERMS|_?Terms|N[°o]?\s*\d|No\.|CHARGE|SC\/PWD|Qty|Unit|ARTICLES|Item\s*Desc|OSCA|Address)/i.test(c)) continue;
    if (/^(MG\s*AND|MILLIGRAM|B4\s*L7|Lawaan|Balantang|VAT\s*Reg|Vios|VIP\s*Inc)/i.test(c)) continue;
    if (/^[:;.\s_-]*$/.test(c)) continue;
    if (c.length < 3) continue;
    if (/^\d+$/.test(c)) continue;

    let hospital = c;
    // Check next lines for continuation
    for (let k = j + 1; k <= Math.min(j + 3, lines.length - 1); k++) {
      const next = lines[k].trim();
      if (/^(HOSPITAL|MEDICAL|CLINIC|CENTER|INFIRMARY|COOPERATIVE|MULTI.?PURPOSE|HEALTH\s*CARE)/i.test(next)) {
        hospital += ' ' + next;
      } else if (/Medical\s*Center|Health\s*Care/i.test(next)) {
        hospital += ' ' + next;
      } else break;
    }
    return hospital;
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

function extractProductBlocks(lines, tableLineIndices = null) {
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
    // When spatial data is available, search ALL table lines (not just ±4)
    // because OCR may insert many blank/irrelevant lines between the product name and batch line
    const nearby = [];
    if (tableLineIndices) {
      for (const j of tableLineIndices) {
        if (j === i || usedLines.has(j)) continue;
        nearby.push({ idx: j, line: lines[j].trim(), dist: Math.abs(j - i) });
      }
    } else {
      for (let j = Math.max(0, i - 4); j <= Math.min(lines.length - 1, i + 4); j++) {
        if (j === i || usedLines.has(j)) continue;
        nearby.push({ idx: j, line: lines[j].trim(), dist: Math.abs(j - i) });
      }
    }
    nearby.sort((a, b) => a.dist - b.dist);

    for (const c of nearby) {
      if (c.line.length < 4) continue;
      if (RE_BATCH.test(c.line) || RE_LOT.test(c.line)) continue;
      if (/^Exp/i.test(c.line)) continue;
      if (isSkipLine(c.line)) continue;
      if (/^\d[\d.,\s]*$/.test(c.line)) continue;
      if (isBirLine(c.line)) continue;
      // Skip address/location/hospital continuation lines
      if (/^(San\s|Jose|aklan|Kalibo|Floilo|City|BS\s*AQUINO|Medical\s*Center|Antique$|HOSPITAL$|INFIRMARY$|CLINIC$|CENTER$|COOPERATIVE$)/i.test(c.line)) continue;

      // Try parentheses match
      let pMatch = c.line.match(RE_PRODUCT_PARENS) || c.line.match(RE_PRODUCT_BROKEN);
      if (pMatch) {
        let rawBrand = pMatch[1].trim();
        genericName = pMatch[2].trim();
        let rawDosage = pMatch[3].trim();

        // Strip trailing quantity from dosage: "40 MG/ML 500" → dosage="40 MG/ML", inline qty=500
        // Pattern: dosage text followed by a standalone integer (the qty)
        const dosageQtyMatch = rawDosage.match(/^(.+?(?:mg|ml|mcg|iu|g)\s*(?:\/\s*\d*\s*(?:mg|ml|mcg|iu|g))?)\s+(\d+)\s*$/i);
        if (dosageQtyMatch) {
          rawDosage = dosageQtyMatch[1].trim();
          // Store the inline qty for later number assignment
          if (!blocks._inlineQtys) blocks._inlineQtys = [];
          blocks._inlineQtys.push(parseInt(dosageQtyMatch[2], 10));
        }
        dosage = rawDosage;

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

    // Check if an inline qty was extracted from the dosage line for this product
    let inlineQty = null;
    if (blocks._inlineQtys && blocks._inlineQtys.length > 0) {
      inlineQty = blocks._inlineQtys.shift();
    }

    blocks.push({
      batchLineIdx: i,
      brand_name: brandName,
      generic_name: genericName,
      dosage: dosage,
      batch_lot_no: batchLotNo,
      expiry_date: expiryDate,
      qty: inlineQty,  // pre-filled from dosage line if found
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
function assignProductNumbers(lines, blocks, footerIdx, tableLineIndices = null) {
  if (blocks.length === 0) return;

  // Step 1: Collect ALL number entries before footer
  const numEntries = [];

  // Track lines to skip (e.g., line after standalone "Exp:")
  const skipLines = new Set();
  for (let i = 0; i < footerIdx; i++) {
    // If this line is just "Exp:" or "Exp", skip the next line too (it's a date like "11/2027")
    if (/^\s*Exp(?:iry)?\.?\s*[-:]?\s*$/i.test(lines[i].trim()) && i + 1 < footerIdx) {
      skipLines.add(i + 1);
    }
  }

  // For number collection, use line-index range rather than exact spatial match,
  // because standalone number lines ("120") don't text-match to spatial lines.
  // Skip everything before the first table line (filters out header numbers like "5000" address).
  const tableStartIdx = tableLineIndices ? Math.min(...tableLineIndices) : 0;

  for (let i = 0; i < footerIdx; i++) {
    const line = lines[i].trim();
    if (skipLines.has(i)) continue;
    // Spatial filter: skip lines before the table body starts
    if (i < tableStartIdx) continue;
    // Skip payment terms values like "30 days" (can be mistaken as qty/price).
    if (/^\d+\s*(days?|DAYS?)\b/.test(line)) continue;
    if (i > 0 && /_?terms\s*[:;]?/i.test(lines[i - 1])) continue;

    // Skip TIN patterns
    if (/\d{3}[-\s]\d{3}[-\s]\d{3}/i.test(line)) continue;
    // Skip batch/expiry lines — including "Exp: 11/2027", "Exp. Date: 2029/11/29"
    if (RE_BATCH.test(line) || RE_LOT.test(line)) continue;
    if (/Exp(?:iry)?\.?\s*[-:]?\s*(?:Date)?/i.test(line)) continue;
    // Skip date-like patterns: "11/2027", "2029/11/29", "17/06/2027"
    if (/^\d{1,2}\/\d{2,4}$/.test(line) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(line)) continue;
    // Skip label lines
    if (isSkipLine(line)) continue;
    if (isBirLine(line)) continue;
    // Skip entity header lines (MG AND CO address, TIN, etc.)
    if (/^(MG\s*AND|MILLIGRAM|B4\s*L7|Lawaan|VAT\s*Reg|Charged|Address|CHARGE\s*SALES|SC\/PWD|No\.$|Date\s|TIN$|Terms|OSCA|Medical\s*Center|San\s+Jose)/i.test(line)) continue;
    // Skip handwritten BDM annotations: "20 Pap", "480 AMP", "10 AMP", "270 Amps to follow", "PDH 124472"
    if (/^\d+\s+(?:Pap|AMP|amps?|vials?|pcs?|tabs?|boxes?)\b/i.test(line)) continue;
    if (/\b(?:LACKING|to\s*follow|detriped|roop|PDH)\b/i.test(line)) continue;
    // Skip lines with "Note:" annotations
    if (/^Note\s*:/i.test(line)) continue;
    // Skip lines that look like reference numbers with dates: "2307409 7/28"
    if (/^\d{5,}\s+\d{1,2}\/\d{1,2}/.test(line)) continue;
    // Skip lines with mixed large numbers and date fragments
    if (/^\d{6,}/.test(line)) continue;
    // Skip lines with substantial non-numeric text (>4 alpha chars)
    const alphaOnly = line.replace(/[\d₱P£#.,\-\s()/]/g, '').trim();
    if (alphaOnly.length > 4) continue;

    const nums = extractNumbers(line);
    for (const n of nums) {
      // Filter non-monetary
      if (n >= 2020 && n <= 2040 && Number.isInteger(n)) continue;
      if (n > 999999 && Number.isInteger(n)) continue;
      numEntries.push({ idx: i, value: n });
    }
  }

  if (numEntries.length === 0) return;

  // Step 2: Account for products that already have qty (from inline extraction)
  // These products only need 2 numbers (price, amount) from the pool
  const values = numEntries.map(e => e.value);
  const productCount = blocks.length;
  const prefilledQtyCount = blocks.filter(b => b.qty != null).length;

  // If some products have inline qty, assign differently
  if (prefilledQtyCount > 0) {
    let cursor = 0;
    for (let p = 0; p < productCount; p++) {
      if (blocks[p].qty != null) {
        // Already has qty — take 2 from pool (price, amount)
        if (cursor + 1 < values.length) {
          blocks[p].unit_price = values[cursor];
          blocks[p].amount = values[cursor + 1];
          cursor += 2;
        } else if (cursor < values.length) {
          blocks[p].amount = values[cursor];
          cursor += 1;
        }
      } else {
        // Needs qty — take 3 from pool (qty, price, amount)
        if (cursor + 2 < values.length) {
          blocks[p].qty = values[cursor];
          blocks[p].unit_price = values[cursor + 1];
          blocks[p].amount = values[cursor + 2];
          cursor += 3;
        } else if (cursor + 1 < values.length) {
          blocks[p].qty = values[cursor];
          blocks[p].amount = values[cursor + 1];
          cursor += 2;
        } else if (cursor < values.length) {
          blocks[p].amount = values[cursor];
          cursor += 1;
        }
      }
    }
  } else if (values.length >= productCount * 3) {
    // Perfect: 3 numbers per product
    for (let p = 0; p < productCount; p++) {
      blocks[p].qty = values[p * 3];
      blocks[p].unit_price = values[p * 3 + 1];
      blocks[p].amount = values[p * 3 + 2];
    }
  } else if (values.length > productCount * 2 && values.length < productCount * 3) {
    // Not enough for 3 per product, but more than 2 per product
    // Strategy: give 3 numbers to first product(s), 2 to the rest
    // E.g., 5 values for 2 products: [50, 540, 27000, 720, 36000] → product1 gets 3, product2 gets 2
    const extraNumbers = values.length - productCount * 2;
    let cursor = 0;
    for (let p = 0; p < productCount; p++) {
      if (p < extraNumbers) {
        // This product gets 3 numbers (qty, price, amount)
        blocks[p].qty = values[cursor];
        blocks[p].unit_price = values[cursor + 1];
        blocks[p].amount = values[cursor + 2];
        cursor += 3;
      } else {
        // This product gets 2 numbers (price + amount, qty missing from OCR)
        blocks[p].unit_price = values[cursor];
        blocks[p].amount = values[cursor + 1];
        cursor += 2;
      }
    }
  } else if (values.length >= productCount * 2) {
    // Exactly 2 numbers per product (qty + amount, no unit price)
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

  // Step 3: Semantic validation — qty × unit_price should ≈ amount
  // If mismatch, try to fix by swapping or recomputing
  for (const block of blocks) {
    if (block.qty != null && block.unit_price != null && block.amount != null) {
      const expected = block.qty * block.unit_price;
      const tolerance = block.amount * 0.05;
      if (Math.abs(expected - block.amount) > tolerance && tolerance > 1) {
        // Try: maybe amount and unit_price are swapped
        if (block.qty > 0 && Math.abs(block.amount / block.qty - block.unit_price) > 10) {
          // Check if amount is actually the unit_price and unit_price is the amount
          const altExpected = block.qty * block.amount;
          if (Math.abs(altExpected - block.unit_price) < block.unit_price * 0.05) {
            // Swap unit_price and amount
            const tmp = block.unit_price;
            block.unit_price = block.amount;
            block.amount = tmp;
          }
        }
      }
    }
    // If we have qty and amount but no unit_price, compute it
    if (block.qty != null && block.amount != null && block.unit_price == null && block.qty > 0) {
      block.unit_price = parseFloat((block.amount / block.qty).toFixed(2));
    }
    // If we have qty and unit_price but no amount, compute it
    if (block.qty != null && block.unit_price != null && block.amount == null) {
      block.amount = parseFloat((block.qty * block.unit_price).toFixed(2));
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
// SPATIAL EXTRACTION
// ═══════════════════════════════════════════════════════════

/**
 * Extract hospital name using spatial bounding box data.
 *
 * Strategy — search three regions around the "CHARGE TO" label:
 *   A. ABOVE the label (OCR sometimes reads the value before the label)
 *   B. Same Y-line, to the RIGHT of the label center
 *   C. BELOW the label (next line down)
 *
 * Prefer results containing hospital keywords (Hospital, Medical, Health Care, etc.).
 * If no keyword match, return null to fall through to line-based extraction.
 */
function extractHospitalSpatial(nWords, zones) {
  if (!zones || zones.chargeToY == null) return null;

  const { findLandmark: findLM } = require('../spatialUtils');
  const ctLandmark = findLM(nWords, /(?:charge[d]?|[ci]?arge[d]?)\s*(?:to|t0)/i);
  if (!ctLandmark) return null;

  const skipPatterns = /^(Invoice|Date|TIN|Registered|Business|TERMS|N[°o]?\s*\d|No\.|SC\/PWD|Qty|Unit|ARTICLES|Item|OSCA|Address|MG\s*AND|MILLIGRAM|B4\s*L7|Lawaan|Balantang|VAT|Vios|VIP|CHARGE|ARGE|SALES)/i;
  const hospitalKeywords = /Hospital|Medical|Clinic|Infirmary|Health\s*Care|Cooperative|Multi.?Purpose/i;

  // Collect candidate texts from all three regions
  const candidates = [];

  // Region A: ABOVE the label (OCR can place value text before the label)
  const aboveRegion = {
    xMin: 0.02, xMax: 0.65,
    yMin: ctLandmark.yMin - 0.03,
    yMax: ctLandmark.yMin - 0.002,
  };
  const aboveLines = buildSpatialLines(findWordsInRect(nWords, aboveRegion), null, 0.008);
  for (const line of aboveLines) {
    const text = line.text.trim();
    if (text.length >= 3 && !skipPatterns.test(text) && !/^[\d:.;\s_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Region B: Same Y-line, to the right of the label CENTER (not rightX edge)
  const sameLineRegion = {
    xMin: ctLandmark.cx + 0.08,
    xMax: 0.65,
    yMin: ctLandmark.yMin - 0.008,
    yMax: ctLandmark.yMax + 0.008,
  };
  const sameLineWords = findWordsInRect(nWords, sameLineRegion);
  if (sameLineWords.length > 0) {
    const text = [...sameLineWords].sort((a, b) => a.cx - b.cx).map(w => w.text).join(' ').trim();
    if (text.length >= 3 && !skipPatterns.test(text) && !/^[\d:.;\s_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Region C: Below the label
  const belowRegion = {
    xMin: 0.02, xMax: 0.65,
    yMin: ctLandmark.yMax + 0.003,
    yMax: ctLandmark.yMax + 0.05,
  };
  const belowLines = buildSpatialLines(findWordsInRect(nWords, belowRegion), null, 0.008);
  for (const line of belowLines) {
    const text = line.text.trim();
    if (text.length >= 3 && !skipPatterns.test(text) && !/^[\d:.;\s_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Prefer candidates with hospital keywords
  const withKeyword = candidates.find(c => hospitalKeywords.test(c));
  if (withKeyword) return withKeyword;

  // No keyword match — return null to let line-based extraction try
  return null;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function parseCSI(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  // Spatial layer: normalize words and detect zones
  const nWords = normalizeWords(words, ocrResult.fullTextAnnotation);
  const zones = nWords.length > 10 ? detectCSIZones(nWords) : null;

  // Table line indices for spatial filtering (null = use all lines as before)
  const tableLineIndices = zones ? getLineIndicesInZone(lines, nWords, zones.tableBody) : null;

  const invoiceNo = extractInvoiceNo(lines);
  const date = extractDate(lines);

  // Try spatial hospital extraction first, fall back to line-based
  let hospital = zones ? extractHospitalSpatial(nWords, zones) : null;
  if (!hospital) hospital = extractHospital(lines);

  const terms = extractTerms(lines);

  const footerIdx = findFooterStart(lines);
  const blocks = extractProductBlocks(lines, tableLineIndices);
  assignProductNumbers(lines, blocks, footerIdx, tableLineIndices);
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
