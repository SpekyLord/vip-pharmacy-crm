/**
 * Undertaking of Receipt Parser (for GRN)
 *
 * Reuses the 3-line product parser from CSI parser.
 * Extracts per line item: brand, generic, dosage, batch, expiry, qty.
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');
const { extractProductBlocks } = require('./csiParser');

function parseUndertaking(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  const productBlocks = extractProductBlocks(lines, words);

  // Attach qty from nearby lines
  const lineItems = productBlocks.map((block) => {
    const brandVal = block.brand_name.value;
    let qty = null;

    if (brandVal) {
      for (const line of lines) {
        if (line.toLowerCase().includes((brandVal || '').toLowerCase())) {
          // Look for a standalone number that could be qty
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

  if (lineItems.length === 0) {
    validationFlags.push({
      type: 'NO_PRODUCTS',
      message: 'No product lines detected — enter items manually',
    });
  }

  return {
    line_items: lineItems,
    validation_flags: validationFlags,
  };
}

module.exports = { parseUndertaking };
