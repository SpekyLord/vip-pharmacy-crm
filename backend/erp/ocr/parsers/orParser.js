/**
 * OR (Official Receipt) / Expense Receipt Parser
 *
 * Handles multiple receipt formats:
 *   1. Courier/shipping receipts (AP Cargo, JRS, LBC, J&T, etc.)
 *   2. Parking receipts
 *   3. Toll receipts
 *   4. Generic official receipts
 *
 * Extracts: OR/Series number, date, supplier name, line items,
 *           total amount, VAT amount, payment mode
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');

// ── Lookup-driven hot paths (Phase H3 — subscription-ready) ──
// Couriers and payment-mode keywords are pulled from the per-entity Lookup
// table (categories OCR_COURIER_ALIASES, OCR_PAYMENT_KEYWORDS) so admins can
// add new couriers/payment methods without code changes.
// Hardcoded fallbacks below act as boot-time defaults and disaster recovery.
const Lookup = require('../../models/Lookup');

const FALLBACK_COURIERS = [
  'AP CARGO', 'JRS EXPRESS', 'LBC', 'J&T', 'J AND T',
  '2GO', 'AIR21', 'ABEST', 'GRAB EXPRESS', 'LALAMOVE',
  'XEND', 'ENTREGO', 'NINJA VAN', 'FLASH EXPRESS',
  'DHL', 'FEDEX', 'UPS', 'PHLPOST',
];

const FALLBACK_PAYMENT_MODES = [
  { aliases: ['cash'], mode_code: 'CASH' },
  { aliases: ['gcash', 'g-cash', 'g cash'], mode_code: 'GCASH' },
  { aliases: ['maya', 'paymaya'], mode_code: 'MAYA' },
  { aliases: ['credit card', 'creditcard'], mode_code: 'CREDIT CARD' },
  { aliases: ['debit card', 'debitcard'], mode_code: 'DEBIT CARD' },
  { aliases: ['check', 'cheque'], mode_code: 'CHECK' },
  { aliases: ['bank transfer', 'banktransfer', 'fund transfer'], mode_code: 'BANK TRANSFER' },
  { aliases: ['online', 'cashless'], mode_code: 'ONLINE' },
  { aliases: ['prepaid'], mode_code: 'PREPAID' },
];

// Per-entity caches (5-minute TTL) — keyed by entity_id (or '__GLOBAL__' when no entity)
const _courierCache = new Map();   // entityKey → { value: string[], expiry }
const _paymentCache = new Map();   // entityKey → { value: { aliases, mode_code }[], expiry }
const CACHE_TTL_MS = 5 * 60 * 1000;
const _entityKey = (entityId) => entityId ? String(entityId) : '__GLOBAL__';

function invalidateOrParserCache(entityId) {
  if (entityId) {
    _courierCache.delete(_entityKey(entityId));
    _paymentCache.delete(_entityKey(entityId));
  } else {
    _courierCache.clear();
    _paymentCache.clear();
  }
}

async function getCouriers(entityId) {
  const key = _entityKey(entityId);
  const now = Date.now();
  const hit = _courierCache.get(key);
  if (hit && now < hit.expiry) return hit.value;
  try {
    const filter = { category: 'OCR_COURIER_ALIASES', is_active: true };
    if (entityId) filter.entity_id = entityId;
    const rows = await Lookup.find(filter).lean();
    const flat = [];
    for (const row of rows) {
      const aliases = row.metadata?.aliases || [row.label];
      for (const a of aliases) if (a) flat.push(String(a).toUpperCase());
    }
    const value = flat.length > 0 ? flat : FALLBACK_COURIERS;
    _courierCache.set(key, { value, expiry: now + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn('[orParser] OCR_COURIER_ALIASES lookup failed, using fallback:', err.message);
    _courierCache.set(key, { value: FALLBACK_COURIERS, expiry: now + CACHE_TTL_MS });
    return FALLBACK_COURIERS;
  }
}

async function getPaymentKeywords(entityId) {
  const key = _entityKey(entityId);
  const now = Date.now();
  const hit = _paymentCache.get(key);
  if (hit && now < hit.expiry) return hit.value;
  try {
    const filter = { category: 'OCR_PAYMENT_KEYWORDS', is_active: true };
    if (entityId) filter.entity_id = entityId;
    const rows = await Lookup.find(filter).lean();
    const list = [];
    for (const row of rows) {
      const aliases = row.metadata?.aliases || [String(row.label).toLowerCase()];
      const mode_code = row.metadata?.mode_code || row.code;
      list.push({ aliases: aliases.map(a => String(a).toLowerCase()), mode_code });
    }
    const value = list.length > 0 ? list : FALLBACK_PAYMENT_MODES;
    _paymentCache.set(key, { value, expiry: now + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn('[orParser] OCR_PAYMENT_KEYWORDS lookup failed, using fallback:', err.message);
    _paymentCache.set(key, { value: FALLBACK_PAYMENT_MODES, expiry: now + CACHE_TTL_MS });
    return FALLBACK_PAYMENT_MODES;
  }
}

// NOTE: Classification logic (EXPENSE_COA_MAP, EXPENSE_CATEGORIES) removed in task 1.17.
// Parsers are extraction-only (Layer 1). Classification is handled by
// backend/erp/services/expenseClassifier.js (Phase 2.15).

// OR/Receipt/Series number patterns
const RE_OR_PATTERNS = [
  /(?:O\.?R\.?|Official\s*Receipt)\s*(?:No|#)\.?\s*:?\s*(\d+[\w-]*)/i,
  /Series\s*No\.?\s*:?\s*(\d+[\w-]*)/i,
  /Receipt\s*(?:No|#)\.?\s*:?\s*(\d+[\w-]*)/i,
  /Invoice\s*(?:No|#)\.?\s*:?\s*(\d+[\w-]*)/i,
  /(?:S\.?I\.?|Sales\s*Invoice)\s*(?:No|#)\.?\s*:?\s*(\d+[\w-]*)/i,
  /(?:No|#)\.?\s*:?\s*(\d{4,}[\w-]*)/i,  // generic "No. XXXXX"
];

// Date patterns
const RE_DATE_LABELED = /(?:Date|Issued|Dated)\s*:?\s*([\d]{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
const RE_DATE_INLINE = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
const RE_DATE_WRITTEN = /(?:Date|Issued)\s*:?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i;

// Amount patterns (ordered by specificity)
const RE_TOTAL_INCL = /(?:Total\s*Sales|Total)\s*\(?(?:VAT\s*Incl|incl)/i;
const RE_TOTAL = /(?:TOTAL|GRAND\s*TOTAL|SUB\s*TOTAL)\s*[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i;

async function parseOR(ocrResult, options = {}) {
  const { fullText, words = [] } = ocrResult;
  const entityId = options.entityId || null;
  // Lookup-driven payment-mode keywords (per-entity, with hardcoded fallback)
  const paymentKeywords = await getPaymentKeywords(entityId);
  const lines = splitLines(fullText);
  const validationFlags = [];

  let orNumber = null;
  let date = null;
  let supplierName = null;
  let amount = null;
  let vatAmount = null;
  let paymentMode = null;
  const lineItems = [];

  // --- Supplier name ---
  // Strategy: priority 1 = match any known courier alias from lookup (lookup-driven, scalable).
  // Strategy: priority 2 = generic company-suffix regex.
  // Skip very short lines, logo fragments, and metadata lines.
  const courierAliases = await getCouriers(entityId);
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.length < 8) continue;
    if (/^(?:Tel|TIN|VAT|Email|Address|Guzman|Brgy|City|For more|customer)/i.test(line)) continue;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(line)) continue;

    const upper = line.toUpperCase();
    if (courierAliases.some(c => upper.includes(c))) {
      supplierName = line;
      break;
    }
    // Generic suffix fallback (CORP, INC, CO., ENTERPRISE, EXPRESS, LOGISTICS, NETWORK, SERVICES, STATION)
    if (/(?:CORP|INC|CO\.|ENTERPRISE|EXPRESS|LOGISTICS|NETWORK|SERVICES|STATION)/i.test(line)) {
      supplierName = line;
      break;
    }
  }
  // Fallback: first line longer than 15 chars
  if (!supplierName) {
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      if (lines[i].trim().length > 15) {
        supplierName = lines[i].trim();
        break;
      }
    }
  }

  // --- OR / Series / Invoice number ---
  // First try single-line patterns
  for (const line of lines) {
    for (const pattern of RE_OR_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        const num = m[1].trim();
        if (/^\d{4,10}$/.test(num)) {
          orNumber = num;
          break;
        }
      }
    }
    if (orNumber) break;
  }
  // Fallback: "Series No." / "O.R. No." label — check PREVIOUS line, NEXT line, and same line
  // OCR may read the number before or after the label depending on layout
  if (!orNumber) {
    for (let i = 0; i < lines.length; i++) {
      if (/(?:Series|O\.?R\.?|Receipt|Invoice|S\.?I\.?)\s*(?:No|#)\.*/i.test(lines[i])) {
        // Check same line for trailing number
        const sameLine = lines[i].match(/(?:No|#)\.+\s*(\d{4,10})/i);
        if (sameLine) { orNumber = sameLine[1]; break; }

        // Check PREVIOUS line (OCR sometimes reads number above the label)
        if (i > 0) {
          const prevNum = lines[i - 1].trim().match(/^(\d{4,10})$/);
          if (prevNum) { orNumber = prevNum[1]; break; }
        }
        // Check NEXT line
        if (i + 1 < lines.length) {
          const nextNum = lines[i + 1].trim().match(/^(\d{4,10})$/);
          if (nextNum) { orNumber = nextNum[1]; break; }
        }
      }
    }
  }

  // --- Date ---
  // Priority 1: "SOLD TO" line often has the invoice date inline (e.g., "SOLD TO: VIP ... 02-27-26")
  for (const line of lines) {
    if (/SOLD\s*TO/i.test(line)) {
      const m = line.match(RE_DATE_INLINE);
      if (m) { date = m[1]; break; }
    }
  }
  // Priority 2: "Date:" labeled (but NOT "Date Issued" which is the printer's date)
  if (!date) {
    for (const line of lines) {
      // Skip printer metadata lines
      if (/Date\s*Issued|Date\s*of\s*Accred|Date\s*of\s*Expir|BIR/i.test(line)) continue;
      const m = line.match(RE_DATE_LABELED);
      if (m) { date = m[1]; break; }
    }
  }
  // Priority 3: Written date (but NOT from printer footer)
  if (!date) {
    for (const line of lines) {
      if (/Date\s*Issued|Accred|Expir|Scorpion|Printing|BIR/i.test(line)) continue;
      const m = line.match(RE_DATE_WRITTEN);
      if (m) { date = m[1]; break; }
    }
  }
  // Priority 4: inline date in top 15 lines (skip printer footer lines)
  if (!date) {
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      if (/Date\s*Issued|Accred|Expir|BIR|Printing|OCN/i.test(lines[i])) continue;
      const m = lines[i].match(RE_DATE_INLINE);
      if (m) { date = m[1]; break; }
    }
  }

  // --- Payment mode (lookup-driven via OCR_PAYMENT_KEYWORDS) ---
  for (const line of lines) {
    const lineLower = line.toLowerCase();
    for (const entry of paymentKeywords) {
      if (entry.aliases.some(kw => lineLower.includes(kw))) {
        paymentMode = entry.mode_code;
        break;
      }
    }
    if (paymentMode) break;
  }

  // --- Line items (courier tracking numbers + amounts) ---
  // Look for a table section with ITEM DESCRIPTION / QUANTITY / AMOUNT headers
  let tableHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/ITEM\s*DESC|NATURE\s*OF\s*SERVICE|DESCRIPTION/i.test(lines[i]) &&
        /AMOUNT|PRICE/i.test(lines[i])) {
      tableHeaderIdx = i;
      break;
    }
  }

  if (tableHeaderIdx >= 0) {
    // Parse lines after the header until we hit footer keywords
    for (let i = tableHeaderIdx + 1; i < Math.min(tableHeaderIdx + 20, lines.length); i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // Stop at footer
      if (/^(?:VATable|VAT-Exempt|Zero.Rated|VAT\s*Amount|Total\s*Sales|200\s*Bkl)/i.test(line)) break;

      // Extract tracking number and amount from line
      const trackingMatch = line.match(/(\d{8,})/);
      // Find amount: look for number with decimal (dash-decimal like "801-47" or dot-decimal "801.47")
      const amountMatch = line.match(/([\d,]+)[.\-](\d{2})\s*$/);

      if (trackingMatch || amountMatch) {
        const item = {};
        if (trackingMatch) item.tracking_no = trackingMatch[1];

        // Extract description (text between tracking number and amount)
        let desc = line;
        if (trackingMatch) desc = desc.replace(trackingMatch[0], '').trim();
        if (amountMatch) desc = desc.replace(amountMatch[0], '').trim();
        if (desc) item.description = desc.replace(/[^\w\s]/g, '').trim();

        if (amountMatch) {
          item.amount = parseFloat(amountMatch[1].replace(/,/g, '') + '.' + amountMatch[2]);
        }

        if (Object.keys(item).length > 0) lineItems.push(item);
      }
    }
  }

  // --- Total amount: AMOUNT DUE (most specific) ---
  // Handle dash-as-decimal: "2143-23" → 2143.23
  for (const line of lines) {
    const m = line.match(/(?:AMOUNT\s*DUE|TOTAL\s*AMOUNT\s*DUE|TOTAL\s*DUE)\s*[:\s]*[₱P]?\s*([\d,]+)[.\-](\d{2})/i);
    if (m) {
      amount = parseFloat(m[1].replace(/,/g, '') + '.' + m[2]);
      break;
    }
  }

  // Fallback: "Total Sales (VAT Inclusive)" with amount on same or next line
  if (amount == null) {
    for (let i = 0; i < lines.length; i++) {
      if (RE_TOTAL_INCL.test(lines[i])) {
        // Amount might be on same line or next line
        const sameLine = lines[i].match(/([\d,]+)[.\-](\d{2})/);
        if (sameLine) {
          amount = parseFloat(sameLine[1].replace(/,/g, '') + '.' + sameLine[2]);
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].match(/([\d,]+)[.\-](\d{2})/);
          if (nextLine) {
            amount = parseFloat(nextLine[1].replace(/,/g, '') + '.' + nextLine[2]);
          }
        }
        break;
      }
    }
  }

  // Fallback: generic TOTAL pattern
  if (amount == null) {
    for (const line of lines) {
      const m = line.match(RE_TOTAL);
      if (m) {
        const val = parseAmount(m[1]);
        if (val > 0 && val < 1000000) { amount = val; break; }
      }
    }
  }

  // Fallback: sum of line item amounts if available
  if (amount == null && lineItems.length > 0) {
    const sum = lineItems.reduce((acc, item) => acc + (item.amount || 0), 0);
    if (sum > 0) {
      amount = parseFloat(sum.toFixed(2));
      validationFlags.push({ type: 'TOTAL_FROM_LINE_ITEMS', message: 'Total computed from line items — please verify' });
    }
  }

  // Last resort: largest Php/P/₱ amount (but cap at reasonable values)
  if (amount == null) {
    let best = 0;
    for (const line of lines) {
      const matches = line.matchAll(/(?:Php|PHP|[₱P])\s*([\d,]+\.\d{2})/g);
      for (const m of matches) {
        const val = parseAmount(m[1]);
        if (val != null && val > best && val < 1000000) best = val;
      }
    }
    if (best > 0) amount = best;
  }

  // --- Footer financial fields (VATable Sales, VAT Amount) ---
  // These receipts often have a two-column footer layout where OCR reads labels
  // and numbers on separate lines. Strategy: find each label, then search nearby
  // lines (±3) for a reasonable financial number, skipping non-financial lines.
  const isFinancialLine = (line) => {
    // Skip printer metadata, booklet info, accreditation numbers
    if (/Bkl|BIR|OCN|Authority|Issued|Scorpion|Printing|Accred|Expir|TIN:|Cell\s*No/i.test(line)) return false;
    if (/00001-\d+/.test(line)) return false; // booklet series "00001-10000"
    return true;
  };

  // --- Footer financial extraction ---
  // Receipts often have a two-column footer. The numbers for VATable Sales and
  // VAT Amount may appear in a "Total Sales (VAT Inclusive)" block further down,
  // NOT next to the left-column labels. Strategy:
  //   1. Try same-line extraction from the label rows (works for single-column)
  //   2. Try the "Total Sales (VAT Inclusive)" section (works for two-column)
  //   3. Compute from available values

  let vatableSales = null;

  // Strategy 1: Same-line extraction from labels
  for (const line of lines) {
    if (/VATable\s*Sales/i.test(line)) {
      const m = line.match(/VATable\s*Sales\s*[:\s]*([\d,]+\.\d{2})/i);
      if (m) vatableSales = parseFloat(m[1].replace(/,/g, ''));
    }
    if (/VAT\s*Amount/i.test(line) && !/VAT-Exempt/i.test(line)) {
      const m = line.match(/VAT\s*Amount\s*[:\s]*([\d,]+\.\d{2})/i);
      if (m) vatAmount = parseFloat(m[1].replace(/,/g, ''));
    }
  }

  // Strategy 2: "Total Sales (VAT Inclusive)" block
  // Pattern: "Total Sales" label → next line has amount + "(VAT Inclusive)" → line after = VAT amount
  if (vatableSales == null || vatAmount == null) {
    for (let i = 0; i < lines.length; i++) {
      if (/Total\s*Sales/i.test(lines[i]) && !/VATable/i.test(lines[i])) {
        // Check same line for amount
        const sameLine = lines[i].match(/([\d,]+\.\d{2})/);
        if (sameLine && /VAT\s*Incl/i.test(lines[i])) {
          if (vatableSales == null) vatableSales = parseFloat(sameLine[1].replace(/,/g, ''));
        }
        // Check subsequent lines for amounts
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const numMatch = lines[j].match(/([\d,]+\.\d{2})/);
          if (numMatch) {
            const val = parseFloat(numMatch[1].replace(/,/g, ''));
            if (val > 1 && val < 1000000) {
              if (/VAT\s*Incl/i.test(lines[j])) {
                // This is the VATable Sales / Total Sales (VAT Inclusive) line
                if (vatableSales == null) vatableSales = val;
              } else if (vatableSales != null && vatAmount == null) {
                // First number after VATable Sales = VAT Amount
                vatAmount = val;
              } else if (vatableSales == null) {
                vatableSales = val;
              }
            }
          }
          // Stop if we hit AMOUNT DUE or Less:
          if (/AMOUNT\s*DUE/i.test(lines[j])) break;
        }
        break;
      }
    }
  }

  // Strategy 3: Compute missing values from what we have
  if (amount != null && vatAmount != null && vatableSales == null) {
    // VATable Sales = Total - VAT
    vatableSales = parseFloat((amount - vatAmount).toFixed(2));
  }
  if (amount != null && vatableSales != null && vatAmount == null) {
    // VAT = Total - VATable Sales
    vatAmount = parseFloat((amount - vatableSales).toFixed(2));
  }

  // --- Auto-compute VAT if not readable ---
  // Philippine VAT default 12% — OCR parser uses hardcoded rate for preview only;
  // authoritative VAT is computed in model pre-save hooks using Settings.VAT_RATE
  let vatComputed = false;
  if (vatAmount == null && amount != null) {
    // If we have VATable sales, compute VAT from that
    if (vatableSales != null && vatableSales > 0) {
      vatAmount = parseFloat((vatableSales * 0.12).toFixed(2));
      vatComputed = true;
    } else {
      // Assume total is VAT-inclusive → VAT = total × 12/112
      vatAmount = parseFloat((amount * 0.12 / (1 + 0.12)).toFixed(2));
      vatComputed = true;
    }
    validationFlags.push({ type: 'VAT_COMPUTED', message: `VAT auto-computed (${vatAmount}) from ${vatableSales ? 'VATable Sales' : 'total (assumed VAT-inclusive)'} — please verify` });
  }

  // --- Cross-validate VAT if both OCR-read and we can check ---
  if (amount != null && vatAmount != null && !vatComputed) {
    // Expected VAT = total × 12/112
    const expectedVat = parseFloat((amount * 0.12 / (1 + 0.12)).toFixed(2));
    const vatDiff = Math.abs(vatAmount - expectedVat);
    if (vatDiff > expectedVat * 0.10 && vatDiff > 2) {
      validationFlags.push({ type: 'VAT_MISMATCH', message: `VAT (${vatAmount}) differs from expected 12/112 of ${amount} = ${expectedVat} — verify if VAT-exempt items exist` });
    }
  }

  // --- Sanity check ---
  if (amount != null && vatAmount != null && vatAmount >= amount) {
    validationFlags.push({ type: 'VAT_EXCEEDS_TOTAL', message: `VAT (${vatAmount}) >= Total (${amount}) — please verify` });
  }

  // Cross-validate line items vs total
  if (lineItems.length > 0 && amount != null) {
    const itemsSum = lineItems.reduce((acc, item) => acc + (item.amount || 0), 0);
    if (itemsSum > 0) {
      const diff = Math.abs(itemsSum - amount);
      if (diff > amount * 0.15 && diff > 5) {
        validationFlags.push({ type: 'LINE_ITEMS_MISMATCH', message: `Line items sum (${itemsSum.toFixed(2)}) differs from total (${amount}) — check if VAT-inclusive` });
      }
    }
  }

  const result = {
    or_number: scoredField(orNumber, getWordConfidencesForText(words, orNumber), !!orNumber),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    supplier_name: scoredField(supplierName, getWordConfidencesForText(words, supplierName), !!supplierName),
    amount: scoredField(amount, getWordConfidencesForText(words, String(amount || '')), amount != null),
    vatable_sales: scoredField(vatableSales, getWordConfidencesForText(words, String(vatableSales || '')), vatableSales != null),
    vat_amount: scoredField(vatAmount, getWordConfidencesForText(words, String(vatAmount || '')), vatAmount != null),
    vat_computed: vatComputed,
    payment_mode: scoredField(paymentMode, getWordConfidencesForText(words, paymentMode), !!paymentMode),
    validation_flags: validationFlags,
  };

  // Add line items if found (courier receipts)
  if (lineItems.length > 0) {
    result.line_items = lineItems.map(item => ({
      tracking_no: scoredField(item.tracking_no || null, getWordConfidencesForText(words, item.tracking_no), !!item.tracking_no),
      description: scoredField(item.description || null, getWordConfidencesForText(words, item.description), !!item.description),
      amount: scoredField(item.amount || null, getWordConfidencesForText(words, String(item.amount || '')), item.amount != null),
    }));
  }

  return result;
}

module.exports = { parseOR, invalidateOrParserCache };
