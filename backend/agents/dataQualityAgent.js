/**
 * Data Quality Agent (P2-6) — Phase G8
 * Schedule: daily 9:00 AM Asia/Manila.
 *
 * Rule-based:
 *   - Duplicate hospital names (trimmed + lowered; excludes aliases)
 *   - Customer / Vendor missing TIN or address
 *   - PeopleMaster missing reports_to or person_type
 *
 * Notification routing: PRESIDENT + ADMIN (admin owns master data).
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function duplicateHospitals() {
  const Hospital = tryModel('Hospital');
  if (!Hospital) return { dupes: [], missingName: 0 };
  const [dupes, missingName] = await Promise.all([
    Hospital.aggregate([
      { $match: { status: { $ne: 'INACTIVE' }, hospital_name: { $nin: [null, ''] } } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$hospital_name' } } },
          sample_name: { $first: '$hospital_name' },
          ids: { $addToSet: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Hospital.countDocuments({
      status: { $ne: 'INACTIVE' },
      $or: [{ hospital_name: { $in: [null, ''] } }, { hospital_name: { $exists: false } }],
    }),
  ]);
  return { dupes, missingName };
}

async function incompleteParties() {
  const Customer = tryModel('Customer');
  const Vendor = tryModel('Vendor') || tryModel('VendorMaster');
  const [custNoTin, vendNoTin] = await Promise.all([
    Customer ? Customer.countDocuments({ is_active: { $ne: false }, $or: [{ tin: { $in: [null, ''] } }, { tin: { $exists: false } }] }) : 0,
    Vendor ? Vendor.countDocuments({ is_active: { $ne: false }, $or: [{ tin: { $in: [null, ''] } }, { tin: { $exists: false } }] }) : 0,
  ]);
  return { custNoTin, vendNoTin };
}

async function orphanPeople() {
  const PM = tryModel('PeopleMaster');
  if (!PM) return 0;
  return PM.countDocuments({
    is_active: { $ne: false },
    $or: [
      { person_type: { $in: [null, ''] } },
      { person_type: { $exists: false } },
      { reports_to: null, person_type: { $ne: 'PRESIDENT' } },
    ],
  });
}

async function run() {
  try {
    const [hospitalResult, parties, orphans] = await Promise.all([duplicateHospitals(), incompleteParties(), orphanPeople()]);
    const { dupes, missingName } = hospitalResult;

    const lines = [];
    lines.push(`Duplicate hospital names: ${dupes.length}`);
    dupes.slice(0, 3).forEach(d => lines.push(`  "${d.sample_name}" appears ${d.count}×`));
    if (missingName > 0) lines.push(`Hospitals missing a name: ${missingName}`);
    lines.push(`Customers without TIN: ${parties.custNoTin}`);
    lines.push(`Vendors without TIN: ${parties.vendNoTin}`);
    lines.push(`People without person_type or reports_to: ${orphans}`);

    const total = dupes.length + missingName + parties.custNoTin + parties.vendNoTin + orphans;
    if (total === 0) lines.push('Master data looks clean. ✓');

    const body = lines.join('\n');

    const resultsPres = await notify({
      recipient_id: 'PRESIDENT',
      title: `Data Quality Report — ${total} issue(s)`,
      body,
      category: 'data_quality',
      priority: total > 20 ? 'important' : 'normal',
      channels: ['in_app', 'email'],
      agent: 'data_quality',
    });
    const resultsAdm = await notify({
      recipient_id: 'ALL_ADMINS',
      title: `Data Quality Report — ${total} issue(s)`,
      body,
      category: 'data_quality',
      priority: total > 20 ? 'important' : 'normal',
      channels: ['in_app'],
      agent: 'data_quality',
    });

    return {
      status: 'success',
      summary: {
        alerts_generated: total,
        messages_sent: countSuccessfulChannels(resultsPres, 'in_app') + countSuccessfulChannels(resultsAdm, 'in_app'),
        key_findings: lines.slice(0, 6),
      },
      message_ids: [...getInAppMessageIds(resultsPres), ...getInAppMessageIds(resultsAdm)],
    };
  } catch (err) {
    console.error('[DataQuality] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
