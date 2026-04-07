/**
 * Commission Calculator — Per CSI at collection time
 * Commission = Net of VAT × commission rate
 * Rates are admin-configurable via Settings.COMMISSION_RATES
 */
function calculateCommission(netOfVat, commissionRate) {
  if (!commissionRate || !netOfVat) return 0;
  return Math.round(netOfVat * commissionRate * 100) / 100;
}

module.exports = { calculateCommission };
