/**
 * Photo Audit Agent (#D)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
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

  const Visit = require('../models/Visit');

  const flags = [];
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);

  const yesterdayEnd = new Date(now);
  yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const visits = await Visit.find({
    visitDate: { $gte: yesterdayStart, $lte: yesterdayEnd },
    status: 'completed',
  })
    .populate('user', 'name email')
    .populate('doctor', 'firstName lastName')
    .lean();

  if (!visits.length) {
    console.log('[PhotoAudit] No visits yesterday. Complete.');
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No completed visits found for yesterday.'],
      },
      message_ids: [],
    };
  }

  try {
    const hashToVisits = {};
    for (const visit of visits) {
      for (const photo of visit.photos || []) {
        if (!photo.hash) continue;
        if (!hashToVisits[photo.hash]) hashToVisits[photo.hash] = [];
        hashToVisits[photo.hash].push({
          visitId: visit._id,
          bdmName: visit.user?.name || 'Unknown',
          doctorName: visit.doctor ? `Dr. ${visit.doctor.lastName}, ${visit.doctor.firstName}` : 'Unknown',
        });
      }
    }

    for (const [hash, matches] of Object.entries(hashToVisits)) {
      if (matches.length <= 1) continue;
      const details = matches.map((match) => `${match.bdmName} -> ${match.doctorName} (ID: ${match.visitId})`).join('; ');
      flags.push({
        type: 'DUPLICATE_PHOTO',
        severity: 'high',
        detail: `Same photo hash (${hash.substring(0, 12)}...) found in ${matches.length} visits: ${details}`,
        bdm_names: [...new Set(matches.map((match) => match.bdmName))],
      });
    }

    for (const visit of visits) {
      const hashes = (visit.photos || []).filter((photo) => photo.hash).map((photo) => photo.hash);
      if (hashes.length >= 2 && hashes.length > new Set(hashes).size) {
        flags.push({
          type: 'DUPLICATE_PHOTO_SAME_VISIT',
          severity: 'medium',
          detail: `${visit.user?.name || 'Unknown'} submitted duplicate photos within visit to ${visit.doctor ? `Dr. ${visit.doctor.lastName}` : 'Unknown'} (ID: ${visit._id})`,
          bdm_names: [visit.user?.name || 'Unknown'],
        });
      }
    }
  } catch (err) {
    console.error('[PhotoAudit] Duplicate hash check failed:', err.message);
  }

  try {
    const visitsByBdm = {};
    for (const visit of visits) {
      const bdmId = String(visit.user?._id || visit.user);
      if (!visitsByBdm[bdmId]) visitsByBdm[bdmId] = [];
      visitsByBdm[bdmId].push(visit);
    }

    for (const bdmVisits of Object.values(visitsByBdm)) {
      if (bdmVisits.length < 2) continue;
      bdmVisits.sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));

      for (let index = 1; index < bdmVisits.length; index += 1) {
        const prev = bdmVisits[index - 1];
        const curr = bdmVisits[index];
        const timeDiffMinutes = (new Date(curr.visitDate) - new Date(prev.visitDate)) / (1000 * 60);

        if (timeDiffMinutes >= 0 && timeDiffMinutes < 15) {
          flags.push({
            type: 'SUSPICIOUS_TIMING',
            severity: 'high',
            detail: `${curr.user?.name || prev.user?.name || 'Unknown'}: visits to ${prev.doctor ? `Dr. ${prev.doctor.lastName}` : 'Unknown'} and ${curr.doctor ? `Dr. ${curr.doctor.lastName}` : 'Unknown'} were ${timeDiffMinutes.toFixed(0)} minutes apart (IDs: ${prev._id}, ${curr._id})`,
            bdm_names: [curr.user?.name || 'Unknown'],
          });
        }
      }
    }
  } catch (err) {
    console.error('[PhotoAudit] Suspicious timing check failed:', err.message);
  }

  try {
    const gpsVisitsByBdm = {};
    for (const visit of visits) {
      if (!visit.location?.latitude || !visit.location?.longitude) continue;
      const bdmId = String(visit.user?._id || visit.user);
      if (!gpsVisitsByBdm[bdmId]) gpsVisitsByBdm[bdmId] = [];
      gpsVisitsByBdm[bdmId].push(visit);
    }

    const MAX_SPEED_KMH = 120;

    for (const bdmVisits of Object.values(gpsVisitsByBdm)) {
      if (bdmVisits.length < 2) continue;
      bdmVisits.sort((a, b) => new Date(a.visitDate) - new Date(b.visitDate));

      for (let index = 1; index < bdmVisits.length; index += 1) {
        const prev = bdmVisits[index - 1];
        const curr = bdmVisits[index];
        const distanceKm = haversineKm(
          prev.location.latitude,
          prev.location.longitude,
          curr.location.latitude,
          curr.location.longitude
        );
        const timeDiffHours = (new Date(curr.visitDate) - new Date(prev.visitDate)) / (1000 * 60 * 60);
        if (timeDiffHours <= 0) continue;

        const requiredSpeed = distanceKm / timeDiffHours;
        if (requiredSpeed > MAX_SPEED_KMH && distanceKm > 5) {
          flags.push({
            type: 'GPS_ANOMALY',
            severity: 'high',
            detail: `${curr.user?.name || 'Unknown'}: ${distanceKm.toFixed(1)} km between ${prev.doctor ? `Dr. ${prev.doctor.lastName}` : 'Unknown'} and ${curr.doctor ? `Dr. ${curr.doctor.lastName}` : 'Unknown'} in ${(timeDiffHours * 60).toFixed(0)} minutes (would require ${requiredSpeed.toFixed(0)} km/h). IDs: ${prev._id}, ${curr._id}`,
            bdm_names: [curr.user?.name || 'Unknown'],
          });
        }
      }
    }
  } catch (err) {
    console.error('[PhotoAudit] GPS anomaly check failed:', err.message);
  }

  try {
    const weekendVisits = visits.filter((visit) => {
      const day = new Date(visit.visitDate).getDay();
      return day === 0 || day === 6;
    });

    for (const visit of weekendVisits) {
      const dayName = new Date(visit.visitDate).getDay() === 0 ? 'Sunday' : 'Saturday';
      flags.push({
        type: 'WEEKEND_VISIT',
        severity: 'medium',
        detail: `${visit.user?.name || 'Unknown'} logged a visit to ${visit.doctor ? `Dr. ${visit.doctor.lastName}, ${visit.doctor.firstName}` : 'Unknown'} on ${dayName} (${new Date(visit.visitDate).toLocaleDateString()}) - ID: ${visit._id}`,
        bdm_names: [visit.user?.name || 'Unknown'],
      });
    }
  } catch (err) {
    console.error('[PhotoAudit] Weekend visit check failed:', err.message);
  }

  const notificationResults = [];
  if (flags.length > 0) {
    const high = flags.filter((flag) => flag.severity === 'high');
    const medium = flags.filter((flag) => flag.severity === 'medium');

    let body = `Photo & Visit Audit Report - ${yesterdayStart.toLocaleDateString()}\n\n`;
    body += `Visits checked: ${visits.length}\n`;
    body += `Flags raised: ${flags.length} (${high.length} high, ${medium.length} medium)\n\n`;

    const grouped = {};
    for (const flag of flags) {
      if (!grouped[flag.type]) grouped[flag.type] = [];
      grouped[flag.type].push(flag);
    }

    for (const [type, items] of Object.entries(grouped)) {
      body += `=== ${type} (${items.length}) ===\n`;
      for (const item of items) {
        body += `  [${item.severity.toUpperCase()}] ${item.detail}\n`;
      }
      body += '\n';
    }

    const allBdmNames = [...new Set(flags.flatMap((flag) => flag.bdm_names || []))];
    if (allBdmNames.length > 0) {
      body += `\nBDMs involved: ${allBdmNames.join(', ')}`;
    }

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `Photo Audit: ${flags.length} flag(s) from ${visits.length} visits`,
        body,
        category: 'system',
        priority: high.length > 0 ? 'high' : 'important',
        channels: ['in_app', 'email'],
        agent: 'photo_audit',
      }))
    );
  }

  console.log(`[PhotoAudit] Complete. Checked ${visits.length} visits, raised ${flags.length} flags.`);

  const uniqueBdms = new Set(
    visits.map((visit) => (visit.user?._id ? String(visit.user._id) : null)).filter(Boolean)
  );

  return {
    status: 'success',
    summary: {
      bdms_processed: uniqueBdms.size,
      alerts_generated: flags.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: flags.length ? flags.slice(0, 5).map((flag) => flag.detail) : ['No photo audit flags were raised.'],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
