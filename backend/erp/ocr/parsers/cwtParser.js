/**
 * BIR 2307 (Certificate of Creditable Tax Withheld at Source) Parser
 *
 * Tuned for actual BIR 2307 OCR output. Key observations:
 *   - TINs appear as "010 824 240" (spaces instead of dashes)
 *   - Period: "From 02 01 2026" and "To 02 28 2026"
 *   - Payee section: after "Part 1-Payee Information" or "Payee" label
 *   - Payor section: after "Part II Payor Information" or "Payor" label
 *   - ATC code: "WC 158" or "WC158"
 *   - Income/Tax in table: "71,428.57" in Amount columns, "714.29" in Tax column
 *   - Names: "MILLIGRAMS AND CO., INCORPORATED" / "PANAY HEALTH CARE MULTI PURPOSE COOPERATIVE"
 */

const {
  scoredField,
  getWordConfidencesForText,
  splitLines,
} = require('../confidenceScorer');

function parseAmount(str) {
  if (!str) return null;
  let cleaned = String(str).replace(/[₱P\s]/g, '').replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseCWT(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let payeeTin = null;
  let payeeName = null;
  let payorTin = null;
  let payorName = null;
  let payorAddress = null;
  let periodFrom = null;
  let periodTo = null;
  let atcCode = null;
  let totalIncome = null;
  let totalTax = null;

  // ── Period: "From 02 01 2026" and "To 02 28 2026" ──
  const allText = lines.join('\n');
  const periodMatch = allText.match(/From\s+(\d{2}\s+\d{2}\s+\d{4})/i);
  if (periodMatch) {
    const parts = periodMatch[1].trim().split(/\s+/);
    if (parts.length === 3) periodFrom = `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  const periodToMatch = allText.match(/To\s+(\d{2}\s+\d{2}\s+\d{4})/i);
  if (periodToMatch) {
    const parts = periodToMatch[1].trim().split(/\s+/);
    if (parts.length === 3) periodTo = `${parts[0]}/${parts[1]}/${parts[2]}`;
  }

  // ── ATC Code: "WC 158" or "WC158" ──
  const atcMatch = allText.match(/\b(WC\s*\d{3})\b/i);
  if (atcMatch) atcCode = atcMatch[1].replace(/\s+/g, ' ').trim();

  // ── Section-based parsing ──
  // Divide into Payee section (Part 1) and Payor section (Part II)
  let payeeStart = -1;
  let payorStart = -1;
  let detailsStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/Part\s*1|Part\s*I[^I]|Payee\s*Info/i.test(lines[i]) && payeeStart < 0) payeeStart = i;
    if (/Part\s*II|Part\s*2|Payor\s*Info/i.test(lines[i]) && payorStart < 0) payorStart = i;
    if (/Part\s*III|Details.*Monthly|Income\s*Payments/i.test(lines[i]) && detailsStart < 0) detailsStart = i;
  }

  // ── TINs: "010 824 240" pattern (3-3-3 with spaces) ──
  const tinPattern = /(\d{3})\s+(\d{3})\s+(\d{3})/g;
  const allTins = [];
  let tinMatch;
  while ((tinMatch = tinPattern.exec(allText)) !== null) {
    allTins.push(`${tinMatch[1]}-${tinMatch[2]}-${tinMatch[3]}`);
  }

  // Also try dash-separated: "010-824-240"
  const dashTinPattern = /(\d{3}[-]\d{3}[-]\d{3})/g;
  while ((tinMatch = dashTinPattern.exec(allText)) !== null) {
    const tin = tinMatch[1];
    if (!allTins.includes(tin)) allTins.push(tin);
  }

  // First TIN is payee, second is payor
  if (allTins.length >= 1) payeeTin = allTins[0];
  if (allTins.length >= 2) payorTin = allTins[1];

  // ── Names: Find registered name lines ──
  // Payee name: line after "Registered Name for Non-Individual" in payee section
  // Or: first ALL-CAPS line with 3+ words after payee TIN
  // Payor name: same pattern in payor section

  // Strategy: find lines that look like company names (ALL CAPS, multiple words, >15 chars)
  const nameLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Company name heuristic: mostly uppercase, >15 chars, contains words
    if (line.length > 15 && /^[A-Z\s.,&()]+$/i.test(line)) {
      const upperRatio = (line.match(/[A-Z]/g) || []).length / line.replace(/\s/g, '').length;
      if (upperRatio > 0.7) {
        // Skip known non-name lines
        if (/Republic|Department|Bureau|Certificate|Withheld|Fill\s*in|AMOUNT|Income\s*Payment|Taxpayer|Registered\s*Address|Foreign|penalties|perjury|provisions|National|Revenue|processing|Privacy|NOTE|Date\s*of|Signature/i.test(line)) continue;
        nameLines.push({ idx: i, line });
      }
    }
  }

  // Assign names based on position relative to Part I / Part II
  if (payeeStart >= 0 && payorStart >= 0) {
    for (const n of nameLines) {
      if (n.idx > payeeStart && n.idx < payorStart && !payeeName) {
        payeeName = n.line;
      } else if (n.idx > payorStart && !payorName) {
        payorName = n.line;
      }
    }
  } else if (nameLines.length >= 2) {
    // Fallback: first name = payee, second = payor
    payeeName = nameLines[0].line;
    payorName = nameLines[1].line;
  } else if (nameLines.length === 1) {
    payeeName = nameLines[0].line;
  }

  // ── Payor Address ──
  // Line after payor name that contains location words
  if (payorName) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === payorName && i + 1 < lines.length) {
        // Check next few lines for address
        for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
          const candidate = lines[j].trim();
          if (candidate.length > 5 && /[A-Za-z]/.test(candidate) && !/^Part\s/i.test(candidate) && !/^Income/i.test(candidate)) {
            payorAddress = candidate;
            break;
          }
        }
        break;
      }
    }
  }

  // ── Income and Tax amounts ──
  // Look for monetary amounts in the details section (Part III)
  // Format: "71,428.57" appears in income columns, "714.29" in tax column
  const startLine = detailsStart >= 0 ? detailsStart : 0;
  const amounts = [];

  for (let i = startLine; i < lines.length; i++) {
    // Stop at signature/declaration section
    if (/penalties|perjury|declare|consent/i.test(lines[i])) break;

    const re = /([\d,]+\.?\d+)/g;
    let m;
    while ((m = re.exec(lines[i])) !== null) {
      const n = parseAmount(m[1]);
      if (n != null && n > 1 && n < 10000000) {
        // Filter out years and page numbers
        if (n >= 2020 && n <= 2040 && Number.isInteger(n)) continue;
        amounts.push(n);
      }
    }
  }

  // In BIR 2307, the income amount is typically the largest, tax is smallest
  // They often appear as: income, income (repeated for months), total income, total tax
  if (amounts.length > 0) {
    // Find the most common large amount (income) and the smallest distinct amount (tax)
    const sorted = [...new Set(amounts)].sort((a, b) => b - a);
    if (sorted.length >= 2) {
      totalIncome = sorted[0]; // largest = total income
      totalTax = sorted[sorted.length - 1]; // smallest = total tax
      // But if tax is too small relative to income (should be ~1% for WC158), verify
      if (totalIncome > 0 && totalTax / totalIncome < 0.001) {
        // Tax might be the second smallest
        totalTax = sorted.length >= 3 ? sorted[sorted.length - 2] : sorted[sorted.length - 1];
      }
    } else if (sorted.length === 1) {
      totalIncome = sorted[0];
    }
  }

  return {
    payee_tin: scoredField(payeeTin, getWordConfidencesForText(words, payeeTin), !!payeeTin),
    payee_name: scoredField(payeeName, getWordConfidencesForText(words, payeeName), !!payeeName),
    payor_tin: scoredField(payorTin, getWordConfidencesForText(words, payorTin), !!payorTin),
    payor_name: scoredField(payorName, getWordConfidencesForText(words, payorName), !!payorName),
    payor_address: scoredField(payorAddress, getWordConfidencesForText(words, payorAddress), !!payorAddress),
    period_from: scoredField(periodFrom, getWordConfidencesForText(words, periodFrom), !!periodFrom),
    period_to: scoredField(periodTo, getWordConfidencesForText(words, periodTo), !!periodTo),
    atc_code: scoredField(atcCode, getWordConfidencesForText(words, atcCode), !!atcCode),
    total_income: scoredField(totalIncome, getWordConfidencesForText(words, String(totalIncome || '')), totalIncome != null),
    total_tax_withheld: scoredField(totalTax, getWordConfidencesForText(words, String(totalTax || '')), totalTax != null),
    validation_flags: validationFlags,
  };
}

module.exports = { parseCWT };
