/**
 * DR (Delivery Receipt) Parser [v5 UPGRADE]
 *
 * Full OCR extraction (upgraded from classification-only in v4).
 * Extracts: DR#, Date, Hospital, Products, Qty, Batch/Lot, Type (sampling/consignment).
 *
 * Reuses 3-line product parser from CSI parser.
 */

const {
  scoredField,
  getWordConfidencesForText,
  splitLines,
} = require('../confidenceScorer');
const { extractProductBlocks } = require('./csiParser');

const RE_DR_NO = /(?:DR|Delivery\s*Receipt)\s*(?:No|#)\.?\s*:?\s*(\d+[\w-]*)/i;
const RE_DATE = /Date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
const RE_HOSPITAL = /(?:deliver(?:ed)?\s*to|hospital|client)\s*:?\s*(.+)/i;

const RE_SAMPLING = /\bsampl(?:ing|e)\b/i;
const RE_CONSIGNMENT = /\bconsign(?:ment|ed)?\b/i;

function parseDR(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let drNo = null;
  let date = null;
  let hospital = null;
  let drType = null;

  for (const line of lines) {
    if (!drNo) {
      const m = line.match(RE_DR_NO);
      if (m) drNo = m[1];
    }
    if (!date) {
      const m = line.match(RE_DATE);
      if (m) date = m[1];
    }
    if (!hospital) {
      const m = line.match(RE_HOSPITAL);
      if (m) hospital = m[1].trim();
    }
    if (RE_SAMPLING.test(line)) drType = 'DR_SAMPLING';
    if (RE_CONSIGNMENT.test(line)) drType = 'DR_CONSIGNMENT';
  }

  // Default to consignment if no type detected
  if (!drType) drType = 'DR_CONSIGNMENT';

  // Products using shared 3-line parser
  const productBlocks = extractProductBlocks(lines, words);

  const lineItems = productBlocks.map((block) => {
    const brandVal = block.brand_name.value;
    let qty = null;

    if (brandVal) {
      for (const line of lines) {
        if (line.toLowerCase().includes((brandVal || '').toLowerCase())) {
          const nums = [];
          const re = /\b(\d+)\b/g;
          let m;
          while ((m = re.exec(line)) !== null) {
            const n = parseInt(m[1], 10);
            if (n > 0 && n < 10000) nums.push(n);
          }
          if (nums.length > 0) qty = nums[nums.length - 1];
          break;
        }
      }
    }

    return {
      ...block,
      qty: scoredField(qty, getWordConfidencesForText(words, String(qty || '')), qty != null),
    };
  });

  return {
    dr_no: scoredField(drNo, getWordConfidencesForText(words, drNo), !!drNo),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    hospital: scoredField(hospital, getWordConfidencesForText(words, hospital), !!hospital),
    dr_type: scoredField(drType, [], !!drType),
    line_items: lineItems,
    validation_flags: validationFlags,
  };
}

module.exports = { parseDR };
