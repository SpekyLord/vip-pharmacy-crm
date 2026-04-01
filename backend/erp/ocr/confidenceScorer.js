/**
 * Confidence scoring for OCR-extracted fields.
 *
 * Levels:
 *   HIGH   – Vision word confidence > 0.9 AND regex matched
 *   MEDIUM – Vision confidence 0.7-0.9 OR partial regex match
 *   LOW    – Vision confidence < 0.7 OR no match OR value missing
 */

const HIGH = 'HIGH';
const MEDIUM = 'MEDIUM';
const LOW = 'LOW';

/**
 * Score a single extracted field.
 *
 * @param {*}       value            – The extracted value (null/undefined = missing).
 * @param {number[]} wordConfidences – Array of per-word Vision API confidences (0-1).
 * @param {boolean}  regexMatched    – Whether a regex pattern matched cleanly.
 * @returns {string} HIGH | MEDIUM | LOW
 */
function scoreField(value, wordConfidences = [], regexMatched = false) {
  if (value == null || value === '') return LOW;

  const avg = wordConfidences.length
    ? wordConfidences.reduce((s, c) => s + c, 0) / wordConfidences.length
    : 0;

  if (avg > 0.9 && regexMatched) return HIGH;
  if (avg >= 0.7 || regexMatched) return MEDIUM;
  return LOW;
}

/**
 * Convenience wrapper that returns the standard { value, confidence } shape.
 */
function createField(value, confidence) {
  return { value: value ?? null, confidence: confidence || LOW };
}

/**
 * Build a scored field in one call.
 */
function scoredField(value, wordConfidences, regexMatched) {
  return createField(value, scoreField(value, wordConfidences, regexMatched));
}

/**
 * Find Vision words whose bounding-box centre falls inside a vertical band.
 * Useful for isolating table rows.
 *
 * @param {object[]} words – From visionClient.detectText().words
 * @param {number}   yMin  – Top edge (pixels)
 * @param {number}   yMax  – Bottom edge (pixels)
 * @returns {object[]}
 */
function findWordsInRegion(words, yMin, yMax) {
  return words.filter((w) => {
    if (!w.boundingBox || w.boundingBox.length < 4) return false;
    const cy =
      w.boundingBox.reduce((sum, v) => sum + v.y, 0) / w.boundingBox.length;
    return cy >= yMin && cy <= yMax;
  });
}

/**
 * Given a text fragment, find the matching Vision words and return the
 * average confidence.  The match is case-insensitive and strips whitespace.
 *
 * @param {object[]} words      – From visionClient.detectText().words
 * @param {string}   textToFind – The text to locate.
 * @returns {number[]} Array of per-word confidences (empty if nothing matched).
 */
function getWordConfidencesForText(words, textToFind) {
  if (!textToFind) return [];

  const target = textToFind.replace(/\s+/g, '').toLowerCase();
  if (!target) return [];

  const confidences = [];
  let buffer = '';
  let pending = [];

  for (const w of words) {
    const lower = (w.text || '').toLowerCase();
    buffer += lower;
    if (w.confidence != null) pending.push(w.confidence);

    if (buffer.includes(target)) {
      confidences.push(...pending);
      buffer = '';
      pending = [];
    } else if (!target.startsWith(buffer)) {
      buffer = lower;
      pending = w.confidence != null ? [w.confidence] : [];
    }
  }

  return confidences;
}

/**
 * Parse a numeric string, removing commas and currency symbols.
 * Returns the number or null if unparseable.
 */
function parseAmount(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[₱P,\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Split OCR fullText into trimmed, non-empty lines.
 */
function splitLines(fullText) {
  return (fullText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

module.exports = {
  HIGH,
  MEDIUM,
  LOW,
  scoreField,
  createField,
  scoredField,
  findWordsInRegion,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
};
