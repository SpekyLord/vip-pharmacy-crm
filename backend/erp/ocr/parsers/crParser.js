/**
 * CR (Collection Receipt) Parser — tuned for VIP & MG format
 *
 * Real OCR includes both CR form and check in one photo.
 * Key observations:
 *   - CR form: "COLLECTION RECEIPT", "Date 03-04 20", CSI settlements
 *   - Check: "RCBC", "CA 1200041967", amount "5,946.43"
 *   - Bank names appear on check: RCBC, BDO, BPI, MBTC, etc.
 *   - Amount formats: "5,944-43" (dash-decimal), "5,946.43" (normal)
 *   - CSI settlement: invoice number + amount pairs
 */

const {
  scoredField,
  getWordConfidencesForText,
  splitLines,
} = require('../confidenceScorer');

// ── Amount parser (reuse from CSI) ──

function parseAmount(str) {
  if (!str) return null;
  let cleaned = String(str).replace(/[₱P£\s]/g, '').replace(/[()]/g, '').trim();
  if (!cleaned) return null;

  // Dash-decimal: "5,944-43" → "5944.43"
  const dashMatch = cleaned.match(/^([\d.,]+)-(\d{1,2})$/);
  if (dashMatch) {
    cleaned = dashMatch[1].replace(/[.,]/g, '') + '.' + dashMatch[2];
    return parseFloat(cleaned) || null;
  }

  // Multiple dots as thousands
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount > 1) {
    const lastDot = cleaned.lastIndexOf('.');
    cleaned = cleaned.substring(0, lastDot).replace(/\./g, '') + '.' + cleaned.substring(lastDot + 1);
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

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

// ── Known Philippine banks ──

const KNOWN_BANKS = ['RCBC', 'BDO', 'BPI', 'MBTC', 'METROBANK', 'PNB', 'LANDBANK', 'UNIONBANK', 'CHINABANK', 'SECURITYBANK', 'EWB', 'AUB', 'PSB', 'SBC', 'UB'];

function detectBank(fullText) {
  const upper = fullText.toUpperCase();
  for (const bank of KNOWN_BANKS) {
    if (upper.includes(bank)) return bank;
  }
  return null;
}

// ── Main parser ──

function parseCR(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let crNo = null;
  let date = null;
  let hospital = null;
  let amount = null;
  let paymentMode = null;
  let checkNo = null;
  let bank = null;

  // ── CR Number ──
  // Look for "N°", "No.", or "Receipt No" pattern near "COLLECTION RECEIPT"
  // Also: MG format has CR number in the form header
  for (const line of lines) {
    const m = line.match(/(?:COLLECTION\s*RECEIPT|Receipt)\s*(?:N[°o]?\.?\s*[:;]?\s*)?(\d{3,})/i);
    if (m) { crNo = m[1]; break; }
  }
  // Fallback: look for standalone "N° XXXX" or "No. XXXX" near COLLECTION RECEIPT
  if (!crNo) {
    for (let i = 0; i < lines.length; i++) {
      if (/COLLECTION\s*RECEIPT/i.test(lines[i])) {
        // Search nearby lines for a receipt number
        for (let j = Math.max(0, i - 3); j <= Math.min(i + 3, lines.length - 1); j++) {
          const m = lines[j].match(/N[°o]\.?\s*[:;]?\s*(\d{4,})/i);
          if (m) { crNo = m[1]; break; }
        }
        break;
      }
    }
  }

  // ── Date ──
  // "Date 03-04 20" or "Date: March 31, 2026" or "Date 03-04 2026"
  const allText = lines.join('\n');
  // Try numeric: "Date 03-04 20" (year truncated)
  const dateNumMatch = allText.match(/Date\s*[:;]?\s*(\d{1,2}[-\/\.]\d{1,2}[-\/\.]?\s*\d{2,4})/i);
  if (dateNumMatch) {
    date = dateNumMatch[1].replace(/\s+/g, '').trim();
  }
  // Try written: "Date: March 31, 2026"
  if (!date) {
    const dateWritten = allText.match(/Date\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{1,2},?\s*\d{2,4})/i);
    if (dateWritten) date = dateWritten[1].trim();
  }

  // ── Hospital: "Received from: MEDICUS MEDICAL CENTER" ──
  for (const line of lines) {
    const m = line.match(/Received\s*from\s*[:;]?\s*(.+)/i);
    if (m) {
      const val = m[1].trim();
      if (val.length > 3) { hospital = val; break; }
    }
  }
  // Fallback: look for hospital name after "Received from" on next line
  if (!hospital) {
    for (let i = 0; i < lines.length; i++) {
      if (/Received\s*from/i.test(lines[i]) && i + 1 < lines.length) {
        const next = lines[i + 1].trim();
        if (next.length > 3 && !/^(With\s*Tin|and\s*Address|MANDURRIAO|SAN\s*RAFAEL)/i.test(next)) {
          hospital = next;
          break;
        }
      }
    }
  }

  // ── Amount ──
  // Look for peso amount patterns: "P5,944-43", "5,946.43", "(P5,944.43"
  // Prefer the one near "payment for" or "sum of" or on the check amount line
  // Collect all peso amounts
  const allAmounts = [];
  for (const line of lines) {
    const re = /[₱P(]\s*([\d,]+\.?\d+)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const n = parseAmount(m[1]);
      if (n != null && n > 100) allAmounts.push(n);
    }
    // Also check dash-decimal
    const dashRe = /[₱P(]\s*([\d,]+-\d{2})/g;
    while ((m = dashRe.exec(line)) !== null) {
      const n = parseAmount(m[1]);
      if (n != null && n > 100) allAmounts.push(n);
    }
  }

  // Best amount: the one that appears most or the largest non-check-number amount
  if (allAmounts.length > 0) {
    // Find most common amount (CR amount and check amount should match)
    const freq = {};
    for (const a of allAmounts) {
      const key = a.toFixed(2);
      freq[key] = (freq[key] || 0) + 1;
    }
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    amount = parseFloat(sorted[0][0]);
  }

  // ── Payment Mode ──
  if (/CHECK/i.test(fullText)) paymentMode = 'CHECK';
  else if (/CASH/i.test(fullText)) paymentMode = 'CASH';

  // ── Check No ──
  // "CHECK No. 1200041947" from CR form
  const checkMatch = allText.match(/CHECK\s*(?:No|#)\.?\s*[:;]?\s*(\d+)/i);
  if (checkMatch) checkNo = checkMatch[1];
  // Also try: "CA 1200041967" from check
  if (!checkNo) {
    const caMatch = allText.match(/\bCA\s+(\d{6,})/i);
    if (caMatch) checkNo = caMatch[1];
  }

  // ── Bank ──
  bank = detectBank(fullText);

  // ── CSI Settlement Table ──
  // Look for CSI invoice numbers + amounts
  // Pattern: "CHARGE SALES INVOICE" section with number + amount pairs
  // Or: "379 4,000" type pairs near the top
  const settledCsis = [];
  let inSettlement = false;

  for (const line of lines) {
    if (/CHARGE\s*SALES|INVOICE.*AMOUNT|CSI\s*No/i.test(line)) {
      inSettlement = true;
      continue;
    }
    if (inSettlement) {
      // Stop at COLLECTION RECEIPT or TOTAL
      if (/COLLECTION\s*RECEIPT|TOTAL|Received/i.test(line)) {
        inSettlement = false;
        continue;
      }
      // Look for number pairs: "379  4,000"
      const nums = extractNumbers(line);
      if (nums.length >= 2) {
        settledCsis.push({
          csi_no: scoredField(String(Math.round(nums[0])), getWordConfidencesForText(words, String(Math.round(nums[0]))), true),
          amount: scoredField(nums[1], getWordConfidencesForText(words, String(nums[1])), true),
        });
      }
    }
  }

  return {
    cr_no: scoredField(crNo, getWordConfidencesForText(words, crNo), !!crNo),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    hospital: scoredField(hospital, getWordConfidencesForText(words, hospital), !!hospital),
    amount: scoredField(amount, getWordConfidencesForText(words, String(amount || '')), amount != null),
    payment_mode: scoredField(paymentMode, [], !!paymentMode),
    check_no: scoredField(checkNo, getWordConfidencesForText(words, checkNo), !!checkNo),
    bank: scoredField(bank, [], !!bank),
    settled_csis: settledCsis,
    validation_flags: validationFlags,
  };
}

module.exports = { parseCR };
