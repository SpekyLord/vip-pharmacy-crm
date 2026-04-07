/**
 * Dunning Service — SAP FI-AR Dunning pattern
 * Computed on-read, never stored. Always current.
 *
 * Level 0: CURRENT (0-30 days) — green
 * Level 1: FOLLOW_UP (31-60 days) — yellow
 * Level 2: WARNING (61-90 days) — orange
 * Level 3: CRITICAL (>90 days) — red
 */

function computeDunningLevel(daysOutstanding) {
  if (daysOutstanding > 90) return { level: 3, color: '#dc2626', label: 'CRITICAL' };
  if (daysOutstanding > 60) return { level: 2, color: '#d97706', label: 'WARNING' };
  if (daysOutstanding > 30) return { level: 1, color: '#ca8a04', label: 'FOLLOW UP' };
  return { level: 0, color: '#16a34a', label: 'CURRENT' };
}

/**
 * Enrich AR aging data with dunning levels per CSI and per hospital
 */
function enrichArWithDunning(arAgingData) {
  if (!arAgingData?.hospitals) return arAgingData;

  for (const hospital of arAgingData.hospitals) {
    hospital.dunning = computeDunningLevel(hospital.worst_days);

    if (hospital.csis) {
      for (const csi of hospital.csis) {
        csi.dunning = computeDunningLevel(csi.days_outstanding || 0);
      }
    }
  }

  return arAgingData;
}

module.exports = { computeDunningLevel, enrichArWithDunning };
