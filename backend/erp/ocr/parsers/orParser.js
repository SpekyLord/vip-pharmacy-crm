/**
 * OR (Official Receipt) / Expense Receipt Parser
 *
 * Generic parser for parking receipts, toll receipts, and misc expenses.
 * Extracts: OR number, date, supplier/establishment name, amount, VAT.
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');

const RE_OR_NO = /(?:O\.?R\.?|Official\s*Receipt|Receipt)\s*(?:No|#)\.?\s*:?\s*(\d+[\w-]*)/i;
const RE_DATE = /(?:Date|Issued)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
const RE_DATE_FALLBACK = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
const RE_AMOUNT = /(?:total|amount|amt|grand)\s*[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i;
const RE_VAT = /(?:VAT|V\.?A\.?T\.?)\s*(?:Amount)?\s*[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i;

function parseOR(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let orNumber = null;
  let date = null;
  let supplierName = null;
  let amount = null;
  let vatAmount = null;

  // Supplier is often the first substantive line
  if (lines.length > 0) supplierName = lines[0];

  for (const line of lines) {
    if (!orNumber) {
      const m = line.match(RE_OR_NO);
      if (m) orNumber = m[1];
    }
    if (!date) {
      const m = line.match(RE_DATE);
      if (m) date = m[1];
    }
    if (!amount) {
      const m = line.match(RE_AMOUNT);
      if (m) amount = parseAmount(m[1]);
    }
    if (!vatAmount) {
      const m = line.match(RE_VAT);
      if (m) vatAmount = parseAmount(m[1]);
    }
  }

  // Fallback date
  if (!date) {
    const m = fullText.match(RE_DATE_FALLBACK);
    if (m) date = m[1];
  }

  // Fallback amount: largest peso value
  if (amount == null) {
    let maxVal = 0;
    const re = /[₱P]\s*([\d,]+\.?\d*)/g;
    let m;
    while ((m = re.exec(fullText)) !== null) {
      const v = parseAmount(m[1]);
      if (v != null && v > maxVal) { maxVal = v; amount = v; }
    }
  }

  return {
    or_number: scoredField(orNumber, getWordConfidencesForText(words, orNumber), !!orNumber),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    supplier_name: scoredField(supplierName, getWordConfidencesForText(words, supplierName), !!supplierName),
    amount: scoredField(amount, getWordConfidencesForText(words, String(amount || '')), amount != null),
    vat_amount: scoredField(vatAmount, getWordConfidencesForText(words, String(vatAmount || '')), vatAmount != null),
    validation_flags: validationFlags,
  };
}

module.exports = { parseOR };
