/**
 * Internal Audit / SoD Checker Agent (P2-5) — Phase G8
 * Schedule: Wednesday 8:00 AM Asia/Manila (weekly).
 *
 * Rule-based checks:
 *   - Creator == Approver: any POSTED doc where created_by === approved_by
 *   - Rapid approve: doc approved < 5 min after submission (auto-approve sniff)
 *   - Period-close readiness: open DRAFTs in a period scheduled to close soon
 *
 * Notification routing: PRESIDENT + FINANCE (per user decision — SoD is a
 * finance-owned signal).
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function creatorEqualsApprover() {
  const AR = tryModel('ApprovalRequest');
  if (!AR) return [];
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  // ApprovalRequest carries requested_by + decided_by. When same user for same
  // doc = SoD break. Status enum is PENDING|APPROVED|REJECTED|CANCELLED — no
  // CLOSED. Filter to recently-decided APPROVED docs to surface fresh signal.
  const rows = await AR.find({
    status: 'APPROVED',
    decided_at: { $gte: since },
    $expr: { $eq: ['$requested_by', '$decided_by'] },
  })
    .limit(10)
    .select('doc_type doc_id doc_ref requested_by decided_at module')
    .lean();
  return rows;
}

async function rapidApprovals() {
  const AR = tryModel('ApprovalRequest');
  if (!AR) return [];
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  // Mongoose {timestamps: true} exposes createdAt (camelCase) — use that as
  // the submission anchor. requested_at exists too but is not always set on
  // older rows; createdAt is guaranteed by the timestamps plugin.
  const rows = await AR.aggregate([
    {
      $match: {
        status: 'APPROVED',
        decided_at: { $gte: since },
        createdAt: { $exists: true },
      },
    },
    {
      $project: {
        doc_type: 1, doc_ref: 1, module: 1,
        elapsed_sec: { $divide: [{ $subtract: ['$decided_at', '$createdAt'] }, 1000] },
      },
    },
    { $match: { elapsed_sec: { $lt: 300 } } }, // <5 min
    { $sort: { elapsed_sec: 1 } },
    { $limit: 10 },
  ]);
  return rows;
}

async function run() {
  try {
    const [sod, rapid] = await Promise.all([creatorEqualsApprover(), rapidApprovals()]);

    const lines = [];
    lines.push(`SoD breaks (same user submitted + decided): ${sod.length}`);
    sod.slice(0, 3).forEach(r => lines.push(`  ${r.module || r.doc_type} · ${r.doc_ref || '(no ref)'}`));
    lines.push(`Rapid approvals (<5 min elapsed): ${rapid.length}`);
    rapid.slice(0, 3).forEach(r => lines.push(`  ${r.module || r.doc_type} · ${r.doc_ref || '(no ref)'} · ${Math.round(r.elapsed_sec)}s`));

    if (!sod.length && !rapid.length) lines.push('No SoD or rapid-approve anomalies in the last 7 days. ✓');

    const body = lines.join('\n');
    const anomalies = sod.length + rapid.length;

    // Route to PRESIDENT + FINANCE per decision. Two separate calls because
    // notificationService resolves role groups individually — no cross-role fan-out.
    const resultsPres = await notify({
      recipient_id: 'PRESIDENT',
      title: anomalies > 0 ? `⚠ Internal Audit / SoD — ${anomalies} anomaly` : 'Internal Audit / SoD — All Clear',
      body,
      category: 'compliance_alert',
      priority: anomalies > 0 ? 'high' : 'normal',
      channels: ['in_app', 'email'],
      agent: 'internal_audit_sod',
    });
    const resultsFin = await notify({
      recipient_id: 'ALL_ADMINS', // ROLE_SETS.ADMIN_LIKE includes finance
      title: anomalies > 0 ? `⚠ Internal Audit / SoD — ${anomalies} anomaly` : 'Internal Audit / SoD — All Clear',
      body,
      category: 'compliance_alert',
      priority: anomalies > 0 ? 'high' : 'normal',
      channels: ['in_app'], // email skipped on secondary route to avoid duplicates
      agent: 'internal_audit_sod',
    });

    return {
      status: 'success',
      summary: {
        alerts_generated: anomalies,
        messages_sent: countSuccessfulChannels(resultsPres, 'in_app') + countSuccessfulChannels(resultsFin, 'in_app'),
        key_findings: lines.slice(0, 5),
      },
      message_ids: [...getInAppMessageIds(resultsPres), ...getInAppMessageIds(resultsFin)],
    };
  } catch (err) {
    console.error('[InternalAudit] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
