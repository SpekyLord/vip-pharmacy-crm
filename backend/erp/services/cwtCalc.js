/**
 * CWT Calculator — Creditable Withholding Tax
 * PH pharmaceutical ATC code: WC158 (default 1%)
 */
function calculateCWT(totalCsiAmount, cwtRate, isNa) {
  if (isNa || !cwtRate) return 0;
  return Math.round(totalCsiAmount * cwtRate * 100) / 100;
}

module.exports = { calculateCWT };
