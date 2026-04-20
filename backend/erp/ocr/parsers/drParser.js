/**
 * DR (Delivery Receipt) Parser [v5 UPGRADE]
 *
 * Full OCR extraction for VIP Delivery Receipts.
 * Extracts: DR#, Date, Hospital, Products (brand, generic, dosage, batch, expiry, qty, price, amount),
 * DR Type (sampling/consignment).
 *
 * Reuses product block extraction + number assignment from CSI parser.
 */

const {
  scoredField,
  getWordConfidencesForText,
  splitLines,
} = require('../confidenceScorer');
const { extractProductBlocks } = require('./csiParser');

const RE_SAMPLING = /\bsampl(?:ing|e)\b/i;
const RE_DONATION = /\b(?:stock\s*)?donat(?:ion|ed)?\b/i;
const RE_CONSIGNMENT = /\bconsign(?:ment|ed)?\b/i;

function parseDR(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let drNo = null;
  let date = null;
  let hospital = null;
  let drType = null;

  // --- DR Number ---
  // Patterns: "N° 002502", "No 002502", "No. 002502", "DR No. 002502"
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip BIR/printer lines
    if (/BIR|ATP|OCN|074AU|Accred|Bkl|FISHERMAN|Printer|Prop\./i.test(line)) continue;

    // "DR No. 002502" or "Delivery Receipt No. 002502"
    const drMatch = line.match(/(?:DR|Delivery\s*Receipt)\s*(?:No|#)\.?\s*:?\s*(\d{3,})/i);
    if (drMatch) { drNo = drMatch[1]; break; }

    // "N° 002502", "No 002502", "No. 002502", "N: 001949"
    const noMatch = line.match(/N[°o:]?\s*\.?\s*(\d{4,})/i);
    if (noMatch) { drNo = noMatch[1]; break; }

    // "No" or "N°" or "N:" on its own line — check adjacent lines
    if (/^\s*N[°o:]?\.?\s*$/i.test(line.trim())) {
      // Check next line
      if (i + 1 < lines.length) {
        const nextNum = lines[i + 1].trim().match(/^(\d{4,})$/);
        if (nextNum) { drNo = nextNum[1]; break; }
      }
      // Check previous line
      if (i > 0) {
        const prevNum = lines[i - 1].trim().match(/^(\d{4,})$/);
        if (prevNum) { drNo = prevNum[1]; break; }
      }
    }
  }

  // --- Date ---
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip printer dates
    if (/Date\s*(of|Issued)|ATP|Accred/i.test(line)) continue;

    // Written with full year: "Date March 23, 2026" or "Date: March 23, 2026"
    const wm = line.match(/Date\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s*\d{4})/i);
    if (wm) { date = wm[1].replace(/\s+/g, ' ').trim(); break; }

    // Written with day but year on next line: "Date Feb. 26" + "2026"
    const wmPartial = line.match(/Date\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?)\s*$/i);
    if (wmPartial) {
      let dateStr = wmPartial[1].trim();
      // Check next line for year
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        const yearMatch = nextLine.match(/^(\d{4})$/);
        if (yearMatch) {
          dateStr += ' ' + yearMatch[1];
        } else {
          // Year might be on same line but garbled: "Date March 31 20" → incomplete
          const shortYear = nextLine.match(/^(\d{2})$/);
          if (shortYear) dateStr += ' 20' + shortYear[1];
        }
      }
      date = dateStr.replace(/\s+/g, ' ').trim();
      break;
    }

    // Written with short year: "Date March 7 2026" (no comma)
    const wmNoComma = line.match(/Date\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{1,2}\s+\d{2,4})/i);
    if (wmNoComma) { date = wmNoComma[1].replace(/\s+/g, ' ').trim(); break; }

    // Numeric: "Date: 03/23/2026" or "Date 03-23-26"
    const nm = line.match(/Date\s*[:;]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    if (nm) { date = nm[1].trim(); break; }
  }

  // --- Hospital (Delivered to) ---
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/Deliver(?:ed)?\s*to\s*[:;]?\s*(.*)/i);
    if (!m) continue;

    let hospitalName = m[1].trim();

    // If the name is empty or too short, check next line
    if (hospitalName.length < 3) {
      if (i + 1 < lines.length) hospitalName = lines[i + 1].trim();
    }

    // Build multi-line hospital name (same strategy as CSI parser)
    if (hospitalName.length > 2) {
      // Search nearby lines for "Medical Center", "Hospital", etc.
      for (let j = i + 1; j <= Math.min(i + 10, lines.length - 1); j++) {
        const next = lines[j].trim();
        if (/^(Medical\s*Center|Hospital|Clinic|Infirmary|Cooperative|Health\s*Care)/i.test(next)) {
          hospitalName += ' ' + next;
        } else if (/Medical\s*Center|Health\s*Care/i.test(next) &&
                   !/TIN|VAT|Address|Bus/i.test(next)) {
          hospitalName += ' ' + next;
        }
      }
      // Also search ALL lines for hospital suffixes (OCR two-column layout)
      if (!/Hospital|Medical|Clinic|Infirmary|Cooperative|Health/i.test(hospitalName)) {
        for (let j = 0; j < lines.length; j++) {
          if (j === i) continue;
          const c = lines[j].trim();
          if (/^(Medical\s*Center|Hospital|Clinic|Infirmary)/i.test(c)) {
            hospitalName += ' ' + c;
            break;
          }
        }
      }
      hospital = hospitalName;
    }
    break;
  }

  // --- DR Type (Sampling/Donation vs Consignment) ---
  for (const line of lines) {
    if (RE_SAMPLING.test(line)) drType = 'DR_SAMPLING';
    if (RE_DONATION.test(line)) drType = 'DR_SAMPLING'; // Donation treated as sampling
    if (RE_CONSIGNMENT.test(line)) drType = 'DR_CONSIGNMENT';
  }
  if (!drType) drType = 'DR_CONSIGNMENT';

  // --- Products using shared 3-line parser ---
  const blocks = extractProductBlocks(lines);

  // --- Extract qty from "Qty Unit" lines (e.g., "20 amps", "100 amps", "500 vials") ---
  // These appear on the line before the product name or as part of it
  // The CSI parser skips these (alpha >5), so we extract qty here for DR
  for (const block of blocks) {
    if (block.brand_name) {
      // Find the brand name line
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(block.brand_name) ||
            (block.brand_name.length > 4 && lines[i].toLowerCase().includes(block.brand_name.toLowerCase().substring(0, 5)))) {
          // Check same line for leading qty: "20 amps Tachyban..."
          const qtyOnLine = lines[i].match(/^(\d+)\s+(?:vials?|amps?|pcs?|tabs?|caps?|boxes?|bottles?|units?|pairs?)\s/i);
          if (qtyOnLine) {
            block._extractedQty = parseInt(qtyOnLine[1], 10);
          }
          // Check previous line for "qty unit": "20 amps", "100 amps", "500 vials"
          if (!block._extractedQty && i > 0) {
            const prevLine = lines[i - 1].trim();
            const qtyUnitMatch = prevLine.match(/^(\d+)\s*(?:vials?|amps?|pcs?|tabs?|caps?|boxes?|bottles?|units?|pairs?)$/i);
            if (qtyUnitMatch) {
              block._extractedQty = parseInt(qtyUnitMatch[1], 10);
            } else if (/^\d+$/.test(prevLine)) {
              // Standalone number
              const prevVal = parseInt(prevLine, 10);
              if (prevVal > 0 && prevVal < 10000) block._extractedQty = prevVal;
            }
          }
          // Check two lines back: "500\namps\nPorFever..."
          if (!block._extractedQty && i > 1) {
            const prev2 = lines[i - 2].trim();
            const prev1 = lines[i - 1].trim();
            if (/^\d+$/.test(prev2) && /^(?:vials?|amps?|pcs?|tabs?|caps?|boxes?|bottles?|units?|pairs?)$/i.test(prev1)) {
              const val = parseInt(prev2, 10);
              if (val > 0 && val < 10000) block._extractedQty = val;
            }
          }
          // Check three lines back: "500\namps\nPorFever (Paracetamol)..." with unit on separate line
          if (!block._extractedQty && i > 2) {
            const prev3 = lines[i - 3].trim();
            const prev2 = lines[i - 2].trim();
            if (/^\d+$/.test(prev3) && /^(?:vials?|amps?|pcs?|tabs?|caps?|boxes?|bottles?|units?|pairs?)$/i.test(prev2)) {
              const val = parseInt(prev3, 10);
              if (val > 0 && val < 10000) block._extractedQty = val;
            }
          }
          break;
        }
      }
    }
  }

  // --- Number assignment for DR ---
  // DR has same table format as CSI: Qty, Unit, ARTICLES, Price, Amount
  // Find footer start
  let footerIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/Total\s*Sales|Total\s*Amount/i.test(lines[i])) { footerIdx = i; break; }
  }

  // Collect product numbers (same approach as CSI)
  const RE_BATCH = /Batch\s*[#]?\s*(?:no|lot)?\.?\s*[:;]?\s*/i;
  const numEntries = [];

  // Track expiry continuation lines
  const skipLines = new Set();
  for (let i = 0; i < footerIdx; i++) {
    if (/^\s*Exp(?:iry)?\.?\s*[-:]?\s*$/i.test(lines[i].trim()) && i + 1 < footerIdx) {
      skipLines.add(i + 1);
    }
  }

  for (let i = 0; i < footerIdx; i++) {
    const line = lines[i].trim();
    if (skipLines.has(i)) continue;
    if (/\d{3}[-\s]\d{3}[-\s]\d{3}/i.test(line)) continue;
    if (RE_BATCH.test(line)) continue;
    if (/Exp(?:iry)?\.?\s*[-:]?\s*(?:Date)?/i.test(line)) continue;
    if (/^\d{1,2}\/\d{2,4}$/.test(line) || /^\d{1,2}[-\/]\d{2,4}$/.test(line)) continue;
    if (/^(VIP|Vios|B4\s*L7|Lawa|VAT\s*Reg|DELIVERY|Deliver|Bus\s*Name|Address|Terms|TIN$|Qty|Unit|ARTICLES|No$|N[°o:]|Date\s|San\s|Medical|Antique$|Kalibo|Aklan|Hospital$|Note|items|changed|accepted)/i.test(line)) continue;
    // Skip lines containing the DR number (N: 001949, No 002502, etc.)
    if (drNo && line.includes(drNo)) continue;
    // Skip the DR number line itself and adjacent number-only lines near "No"/"N:" label
    if (/^\d{4,}$/.test(line) && i > 0 && /^\s*N[°o:]?\.?\s*$/i.test(lines[i - 1].trim())) continue;
    if (/BIR|ATP|OCN|Accred|FISHERMAN|Printer|Prop\.|Arevalo|Received|Customer|valid.*claim|document.*not/i.test(line)) continue;

    const alphaOnly = line.replace(/[\d₱P£#.,\-\s()/]/g, '').trim();
    if (alphaOnly.length > 5) continue;

    // Extract numbers
    const re = /([\d][.\d,]*\d(?:-\d{1,2})?)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      let cleaned = m[1].replace(/,/g, '');
      // Handle dash-decimal: "480-00" → 480.00
      const dashMatch = cleaned.match(/^(\d+)-(\d{1,2})$/);
      if (dashMatch) cleaned = dashMatch[1] + '.' + dashMatch[2];
      const n = parseFloat(cleaned);
      if (n > 0 && !(n >= 2020 && n <= 2040 && Number.isInteger(n)) && n < 999999) {
        numEntries.push({ idx: i, value: n });
      }
    }
  }

  // Assign numbers to product blocks
  const values = numEntries.map(e => e.value);
  const productCount = blocks.length;

  // Apply extracted qty even if no numbers in pool (sampling/donation DRs)
  for (const block of blocks) {
    if (block._extractedQty != null) {
      block.qty = block._extractedQty;
    }
  }

  if (productCount > 0 && values.length > 0) {
    if (values.length >= productCount * 3) {
      for (let p = 0; p < productCount; p++) {
        blocks[p].qty = values[p * 3];
        blocks[p].unit_price = values[p * 3 + 1];
        blocks[p].amount = values[p * 3 + 2];
      }
    } else if (values.length > productCount * 2 && values.length < productCount * 3) {
      const extra = values.length - productCount * 2;
      let cursor = 0;
      for (let p = 0; p < productCount; p++) {
        if (p < extra) {
          blocks[p].qty = values[cursor];
          blocks[p].unit_price = values[cursor + 1];
          blocks[p].amount = values[cursor + 2];
          cursor += 3;
        } else {
          blocks[p].unit_price = values[cursor];
          blocks[p].amount = values[cursor + 1];
          cursor += 2;
        }
      }
    } else if (values.length >= productCount * 2) {
      for (let p = 0; p < productCount; p++) {
        blocks[p].qty = values[p * 2];
        blocks[p].amount = values[p * 2 + 1];
      }
    } else {
      // Distribute by proximity
      const remaining = [...numEntries];
      for (const block of blocks) {
        remaining.sort((a, b) => Math.abs(a.idx - block.batchLineIdx) - Math.abs(b.idx - block.batchLineIdx));
        const take = remaining.splice(0, Math.min(3, remaining.length));
        const tv = take.map(t => t.value);
        if (tv.length >= 3) { block.qty = tv[0]; block.unit_price = tv[1]; block.amount = tv[2]; }
        else if (tv.length === 2) { block.qty = tv[0]; block.amount = tv[1]; }
        else if (tv.length === 1) { block.amount = tv[0]; }
      }
    }

    // Apply extracted qty from product lines (overrides number pool assignment)
    for (const block of blocks) {
      if (block._extractedQty != null) {
        block.qty = block._extractedQty;
      }
    }

    // Semantic validation
    for (const block of blocks) {
      if (block.qty != null && block.unit_price != null && block.amount != null) {
        const expected = block.qty * block.unit_price;
        if (Math.abs(expected - block.amount) > block.amount * 0.05 && block.amount > 1) {
          if (block.qty > 0) {
            const altExpected = block.qty * block.amount;
            if (Math.abs(altExpected - block.unit_price) < block.unit_price * 0.05) {
              const tmp = block.unit_price;
              block.unit_price = block.amount;
              block.amount = tmp;
            }
          }
        }
      }
      if (block.qty != null && block.amount != null && block.unit_price == null && block.qty > 0) {
        block.unit_price = parseFloat((block.amount / block.qty).toFixed(2));
      }
      if (block.qty != null && block.unit_price != null && block.amount == null) {
        block.amount = parseFloat((block.qty * block.unit_price).toFixed(2));
      }
    }
  }

  // Build scored line items
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

  // Phase H6 — normalize dr_type to dispatch_type enum matching
  // ConsignmentTracker.dispatch_type ('SAMPLING' | 'CONSIGNMENT'). The existing
  // dr_type string is kept for backward compatibility with any older consumers.
  const dispatchType = drType === 'DR_SAMPLING' ? 'SAMPLING' : 'CONSIGNMENT';

  return {
    dr_no: scoredField(drNo, getWordConfidencesForText(words, drNo), !!drNo),
    // Phase H6 — expose dr_ref (same value, aligned with ConsignmentTracker field name)
    dr_ref: scoredField(drNo, getWordConfidencesForText(words, drNo), !!drNo),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    // Phase H6 — expose dr_date (aligned with ConsignmentTracker + CRITICAL_FIELDS_BY_DOC)
    dr_date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    hospital: scoredField(hospital, getWordConfidencesForText(words, hospital), !!hospital),
    hospital_name: scoredField(hospital, getWordConfidencesForText(words, hospital), !!hospital),
    dr_type: scoredField(drType, [], !!drType),
    dispatch_type: scoredField(dispatchType, [], true),
    line_items: lineItems,
    validation_flags: validationFlags,
  };
}

module.exports = { parseDR };
