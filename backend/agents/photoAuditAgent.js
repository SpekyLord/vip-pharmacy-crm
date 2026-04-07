/**
 * Photo Audit Agent (#D)
 * Runs daily at 8:30 AM
 *
 * Checks yesterday's visits for:
 * 1. Duplicate photo hashes (same photo used in multiple visits)
 * 2. Suspicious timing (multiple visits by same BDM within 15 minutes)
 * 3. GPS anomaly (impossible travel distance for time gap)
 * 4. Weekend visits (Saturday/Sunday)
 */

const { notify } = require('./notificationService');

/**
 * Haversine formula: distance in kilometers between two GPS coordinates
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function run() {
  console.log('[PhotoAudit] Running...');
  try {
    const Visit = require('../models/Visit');
    const User = require('../models/User');

    const flags = [];

    // Define "yesterday" (Manila time UTC+8)
    const now = new Date();
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Get all visits from yesterday
    const visits = await Visit.find({
      visitDate: { $gte: yesterdayStart, $lte: yesterdayEnd },
      status: 'completed'
    })
      .populate('user', 'name email')
      .populate('doctor', 'firstName lastName')
      .lean();

    if (visits.length === 0) {
      console.log('[PhotoAudit] No visits yesterday. Complete.');
      return;
    }

    console.log(`[PhotoAudit] Checking ${visits.length} visits from yesterday.`);

    // ─── 1. Duplicate photo hashes ─────────────────────────────────
    try {
      // Collect all photo hashes across visits
      const hashToVisits = {};
      for (const visit of visits) {
        if (!visit.photos || visit.photos.length === 0) continue;
        for (const photo of visit.photos) {
          if (!photo.hash) continue;
          if (!hashToVisits[photo.hash]) hashToVisits[photo.hash] = [];
          hashToVisits[photo.hash].push({
            visitId: visit._id,
            bdmName: visit.user?.name || 'Unknown',
            doctorName: visit.doctor ? `Dr. ${visit.doctor.lastName}, ${visit.doctor.firstName}` : 'Unknown',
            photoUrl: photo.url
          });
        }
      }

      for (const [hash, matches] of Object.entries(hashToVisits)) {
        if (matches.length > 1) {
          // Same hash across multiple visits
          const visitDetails = matches.map(m => `${m.bdmName} -> ${m.doctorName} (ID: ${m.visitId})`).join('; ');
          flags.push({
            type: 'DUPLICATE_PHOTO',
            severity: 'high',
            detail: `Same photo hash (${hash.substring(0, 12)}...) found in ${matches.length} visits: ${visitDetails}`,
            bdm_names: [...new Set(matches.map(m => m.bdmName))]
          });
        }
      }

      // Also check for duplicate hashes within the same visit (less concerning but worth noting)
      for (const visit of visits) {
        if (!visit.photos || visit.photos.length < 2) continue;
        const hashes = visit.photos.filter(p => p.hash).map(p => p.hash);
        const uniqueHashes = new Set(hashes);
        if (hashes.length > uniqueHashes.size) {
          flags.push({
            type: 'DUPLICATE_PHOTO_SAME_VISIT',
            severity: 'medium',
            detail: `${visit.user?.name || 'Unknown'} submitted duplicate photos within visit to ${visit.doctor ? `Dr. ${visit.doctor.lastName}` : 'Unknown'} (ID: ${visit._id})`,
            bdm_names: [visit.user?.name || 'Unknown']
          });
        }
      }
    } catch (err) {
      console.error('[PhotoAudit] Duplicate hash check failed:', err.message);
    }

    // ─── 2. Suspicious timing (< 15 min between visits) ───────────
    try {
      // Group visits by BDM
      const visitsByBdm = {};
      for (const visit of visits) {
        const bdmId = String(visit.user?._id || visit.user);
        if (!visitsByBdm[bdmId]) visitsByBdm[bdmId] = [];
        visitsByBdm[bdmId].push(visit);
      }

      for (const [bdmId, bdmVisits] of Object.entries(visitsByBdm)) {
        if (bdmVisits.length < 2) continue;

        // Sort by visit date
        bdmVisits.sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));

        for (let i = 1; i < bdmVisits.length; i++) {
          const prev = bdmVisits[i - 1];
          const curr = bdmVisits[i];
          const timeDiffMinutes = (new Date(curr.visitDate) - new Date(prev.visitDate)) / (1000 * 60);

          if (timeDiffMinutes >= 0 && timeDiffMinutes < 15) {
            const bdmName = curr.user?.name || prev.user?.name || 'Unknown';
            const prevDoctor = prev.doctor ? `Dr. ${prev.doctor.lastName}` : 'Unknown';
            const currDoctor = curr.doctor ? `Dr. ${curr.doctor.lastName}` : 'Unknown';

            flags.push({
              type: 'SUSPICIOUS_TIMING',
              severity: 'high',
              detail: `${bdmName}: visits to ${prevDoctor} and ${currDoctor} were ${timeDiffMinutes.toFixed(0)} minutes apart (IDs: ${prev._id}, ${curr._id})`,
              bdm_names: [bdmName]
            });
          }
        }
      }
    } catch (err) {
      console.error('[PhotoAudit] Suspicious timing check failed:', err.message);
    }

    // ─── 3. GPS anomaly (impossible travel) ────────────────────────
    try {
      // Group visits by BDM that have GPS
      const gpsVisitsByBdm = {};
      for (const visit of visits) {
        if (!visit.location?.latitude || !visit.location?.longitude) continue;
        const bdmId = String(visit.user?._id || visit.user);
        if (!gpsVisitsByBdm[bdmId]) gpsVisitsByBdm[bdmId] = [];
        gpsVisitsByBdm[bdmId].push(visit);
      }

      // Max reasonable speed: 120 km/h (highway driving in Philippines, generous threshold)
      const MAX_SPEED_KMH = 120;

      for (const [bdmId, bdmVisits] of Object.entries(gpsVisitsByBdm)) {
        if (bdmVisits.length < 2) continue;

        bdmVisits.sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));

        for (let i = 1; i < bdmVisits.length; i++) {
          const prev = bdmVisits[i - 1];
          const curr = bdmVisits[i];

          const distKm = haversineKm(
            prev.location.latitude, prev.location.longitude,
            curr.location.latitude, curr.location.longitude
          );

          const timeDiffHours = (new Date(curr.visitDate) - new Date(prev.visitDate)) / (1000 * 60 * 60);

          // Skip if time diff is 0 (same timestamp) to avoid division by zero
          if (timeDiffHours <= 0) continue;

          const requiredSpeedKmh = distKm / timeDiffHours;

          if (requiredSpeedKmh > MAX_SPEED_KMH && distKm > 5) {
            const bdmName = curr.user?.name || 'Unknown';
            const prevDoctor = prev.doctor ? `Dr. ${prev.doctor.lastName}` : 'Unknown';
            const currDoctor = curr.doctor ? `Dr. ${curr.doctor.lastName}` : 'Unknown';
            const timeDiffMin = (timeDiffHours * 60).toFixed(0);

            flags.push({
              type: 'GPS_ANOMALY',
              severity: 'high',
              detail: `${bdmName}: ${distKm.toFixed(1)} km between ${prevDoctor} and ${currDoctor} in ${timeDiffMin} minutes (would require ${requiredSpeedKmh.toFixed(0)} km/h). IDs: ${prev._id}, ${curr._id}`,
              bdm_names: [bdmName],
              distance_km: distKm,
              required_speed: requiredSpeedKmh
            });
          }
        }
      }
    } catch (err) {
      console.error('[PhotoAudit] GPS anomaly check failed:', err.message);
    }

    // ─── 4. Weekend visits ─────────────────────────────────────────
    try {
      const weekendVisits = visits.filter(v => {
        const day = new Date(v.visitDate).getDay();
        return day === 0 || day === 6; // Sunday = 0, Saturday = 6
      });

      for (const visit of weekendVisits) {
        const dayName = new Date(visit.visitDate).getDay() === 0 ? 'Sunday' : 'Saturday';
        const bdmName = visit.user?.name || 'Unknown';
        const doctorName = visit.doctor ? `Dr. ${visit.doctor.lastName}, ${visit.doctor.firstName}` : 'Unknown';

        flags.push({
          type: 'WEEKEND_VISIT',
          severity: 'medium',
          detail: `${bdmName} logged a visit to ${doctorName} on ${dayName} (${new Date(visit.visitDate).toLocaleDateString()}) — ID: ${visit._id}`,
          bdm_names: [bdmName]
        });
      }
    } catch (err) {
      console.error('[PhotoAudit] Weekend visit check failed:', err.message);
    }

    // ─── Send notification to PRESIDENT ────────────────────────────
    if (flags.length > 0) {
      const high = flags.filter(f => f.severity === 'high');
      const medium = flags.filter(f => f.severity === 'medium');

      let body = `Photo & Visit Audit Report — ${yesterdayStart.toLocaleDateString()}\n\n`;
      body += `Visits checked: ${visits.length}\n`;
      body += `Flags raised: ${flags.length} (${high.length} high, ${medium.length} medium)\n\n`;

      // Group by type
      const grouped = {};
      for (const f of flags) {
        if (!grouped[f.type]) grouped[f.type] = [];
        grouped[f.type].push(f);
      }

      for (const [type, items] of Object.entries(grouped)) {
        body += `=== ${type} (${items.length}) ===\n`;
        for (const item of items) {
          body += `  [${item.severity.toUpperCase()}] ${item.detail}\n`;
        }
        body += '\n';
      }

      // List unique BDMs involved
      const allBdmNames = [...new Set(flags.flatMap(f => f.bdm_names || []))];
      if (allBdmNames.length > 0) {
        body += `\nBDMs involved: ${allBdmNames.join(', ')}`;
      }

      await notify({
        recipient_id: 'PRESIDENT',
        title: `Photo Audit: ${flags.length} flag(s) from ${visits.length} visits`,
        body,
        category: 'system',
        priority: high.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'photo_audit'
      });
    }

    console.log(`[PhotoAudit] Complete. Checked ${visits.length} visits, raised ${flags.length} flags.`);
  } catch (err) {
    console.error('[PhotoAudit] Error:', err.message);
  }
}

module.exports = { run };
