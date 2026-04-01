/**
 * Gas Receipt Parser
 *
 * Handles two receipt formats:
 *   1. Shell credit card receipts — only liters + total (no price_per_liter)
 *   2. Generic gas station receipts — may include full details
 *
 * When price_per_liter is not present, it is computed from total/liters
 * and flagged with price_computed: true.
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');

const RE_DATE = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
const RE_LITERS = /(\d+\.?\d*)\s*(?:L|liter|litre|lit)/i;
const RE_PRICE_PER = /(?:price|rate|per)\s*(?:liter|litre|L)?\s*[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i;
const RE_TOTAL = /(?:total|amount|amt)\s*[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i;
const RE_FUEL_TYPE = /\b(diesel|premium|unleaded|regular|gas(?:oline)?|super)\b/i;
const RE_SHELL = /\bshell\b/i;

function parseGasReceipt(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let date = null;
  let stationName = null;
  let fuelType = null;
  let liters = null;
  let pricePerLiter = null;
  let totalAmount = null;
  let priceComputed = false;
  const isShell = RE_SHELL.test(fullText);

  // Station name: often the first or second line
  if (lines.length > 0) stationName = lines[0];

  for (const line of lines) {
    if (!date) {
      const m = line.match(RE_DATE);
      if (m) date = m[1];
    }
    if (!fuelType) {
      const m = line.match(RE_FUEL_TYPE);
      if (m) fuelType = m[1].toUpperCase();
    }
    if (!liters) {
      const m = line.match(RE_LITERS);
      if (m) liters = parseFloat(m[1]);
    }
    if (!pricePerLiter) {
      const m = line.match(RE_PRICE_PER);
      if (m) pricePerLiter = parseAmount(m[1]);
    }
    if (!totalAmount) {
      const m = line.match(RE_TOTAL);
      if (m) totalAmount = parseAmount(m[1]);
    }
  }

  // Fallback: scan for standalone large number as total
  if (totalAmount == null) {
    for (const line of lines) {
      const m = line.match(/[₱P]\s*([\d,]+\.?\d*)/);
      if (m) {
        const val = parseAmount(m[1]);
        if (val != null && val > 50) { totalAmount = val; break; }
      }
    }
  }

  // Compute price_per_liter if missing (Shell credit card receipts)
  if (pricePerLiter == null && liters && totalAmount) {
    pricePerLiter = parseFloat((totalAmount / liters).toFixed(2));
    priceComputed = true;
  }

  return {
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    station_name: scoredField(stationName, getWordConfidencesForText(words, stationName), !!stationName),
    fuel_type: scoredField(fuelType, getWordConfidencesForText(words, fuelType), !!fuelType),
    liters: scoredField(liters, getWordConfidencesForText(words, String(liters || '')), liters != null),
    price_per_liter: scoredField(pricePerLiter, getWordConfidencesForText(words, String(pricePerLiter || '')), pricePerLiter != null),
    total_amount: scoredField(totalAmount, getWordConfidencesForText(words, String(totalAmount || '')), totalAmount != null),
    price_computed: priceComputed,
    is_shell: isShell,
    validation_flags: validationFlags,
  };
}

module.exports = { parseGasReceipt };
