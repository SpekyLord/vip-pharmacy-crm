/**
 * Proxy SLA Agent — Phase P1 (#PX) (April 23, 2026).
 *
 * Rule-based (FREE tier). Runs every 4 hours.
 *
 * 1. Finds CaptureSubmission with status='PENDING_PROXY' older than SLA threshold
 *    (default 24h, lookup-driven PROXY_SLA_THRESHOLDS) → alerts office lead.
 * 2. Finds status='AWAITING_BDM_REVIEW' older than auto-ack threshold
 *    (default 72h) → auto-acknowledges with warning.
 * 3. Computes metrics: avg turnaround, proxy throughput, BDM review rate.
 *
 * Idempotent: re-runs do not re-fire alerts (checks sla_alert_sent_at).
 */

// Lazy-loaded below in ensureDeps()
let Entity;

// Lazy-require to avoid circular dependency at module load
let CaptureSubmission;
let Lookup;
let User;
let dispatchMultiChannel;

function ensureDeps() {
  if (!CaptureSubmission) {
    CaptureSubmission = require('../erp/models/CaptureSubmission');
    Lookup = require('../erp/models/Lookup');
    Entity = require('../erp/models/Entity');
    User = require('../models/User');
    ({ dispatchMultiChannel } = require('../erp/services/erpNotificationService'));
  }
}

const DEFAULT_PENDING_SLA_HOURS = 24;
const DEFAULT_AUTO_ACK_HOURS = 72;

async function getSlaThresholds(entityId) {
  try {
    const row = await Lookup.findOne({
      entity_id: entityId,
      category: 'PROXY_SLA_THRESHOLDS',
      code: 'DEFAULT',
      is_active: true,
    }).lean();
    if (row && row.metadata) {
      return {
        pendingHours: Number(row.metadata.pending_alert_hours) || DEFAULT_PENDING_SLA_HOURS,
        autoAckHours: Number(row.metadata.auto_ack_hours) || DEFAULT_AUTO_ACK_HOURS,
      };
    }
  } catch (err) {
    console.warn('[proxySlaAgent] Failed to read PROXY_SLA_THRESHOLDS:', err.message);
  }
  return { pendingHours: DEFAULT_PENDING_SLA_HOURS, autoAckHours: DEFAULT_AUTO_ACK_HOURS };
}

async function run({ entityId } = {}) {
  ensureDeps();

  // Resolve entities to scan
  let entities;
  if (entityId) {
    const e = await Entity.findById(entityId).lean();
    entities = e ? [e] : [];
  } else {
    entities = await Entity.find({ is_active: true }).lean();
  }

  const results = [];

  for (const entity of entities) {
    const eid = entity._id;
    const { pendingHours, autoAckHours } = await getSlaThresholds(eid);
    const now = new Date();

    // ── 1. Alert on stale PENDING_PROXY ──
    const pendingCutoff = new Date(now.getTime() - pendingHours * 60 * 60 * 1000);
    const stalePending = await CaptureSubmission.find({
      entity_id: eid,
      status: 'PENDING_PROXY',
      created_at: { $lt: pendingCutoff },
      sla_alert_sent_at: { $exists: false },
    }).lean();

    if (stalePending.length > 0) {
      // Find office leads (admin/finance) for this entity
      const officeLeads = await User.find({
        $or: [
          { entity_id: eid, role: { $in: ['admin', 'finance'] }, isActive: true },
          { entity_ids: eid, role: { $in: ['admin', 'finance'] }, isActive: true },
        ],
      }).select('name email role').lean();

      if (officeLeads.length > 0) {
        await dispatchMultiChannel(officeLeads, {
          subject: `[SLA] ${stalePending.length} capture(s) pending > ${pendingHours}h`,
          text: `${stalePending.length} BDM capture submission(s) have been waiting for proxy processing longer than ${pendingHours} hours at ${entity.name || eid}. Please check the Proxy Queue.`,
          category: 'proxy_sla_alert',
          entityId: eid,
          priority: 'high',
        }).catch(err => console.error('[proxySlaAgent] alert dispatch failed:', err.message));
      }

      // Mark alert sent (idempotent)
      const staleIds = stalePending.map(s => s._id);
      await CaptureSubmission.updateMany(
        { _id: { $in: staleIds } },
        { $set: { sla_alert_sent_at: now } }
      );

      results.push({ entity: entity.name, action: 'sla_alert', count: stalePending.length });
    }

    // ── 2. Auto-acknowledge stale AWAITING_BDM_REVIEW ──
    const autoAckCutoff = new Date(now.getTime() - autoAckHours * 60 * 60 * 1000);
    const staleReview = await CaptureSubmission.find({
      entity_id: eid,
      status: 'AWAITING_BDM_REVIEW',
      proxy_completed_at: { $lt: autoAckCutoff },
    }).lean();

    if (staleReview.length > 0) {
      const staleReviewIds = staleReview.map(s => s._id);
      await CaptureSubmission.updateMany(
        { _id: { $in: staleReviewIds } },
        {
          $set: {
            status: 'AUTO_ACKNOWLEDGED',
            auto_ack_at: now,
            bdm_acknowledged_at: now,
          },
        }
      );

      // Notify BDMs that their reviews were auto-acknowledged
      const bdmIds = [...new Set(staleReview.map(s => String(s.bdm_id)))];
      const bdmUsers = await User.find({ _id: { $in: bdmIds } }).select('name email role').lean();
      if (bdmUsers.length > 0) {
        for (const bdm of bdmUsers) {
          const count = staleReview.filter(s => String(s.bdm_id) === String(bdm._id)).length;
          await dispatchMultiChannel([bdm], {
            subject: `${count} proxied entry/entries auto-acknowledged`,
            text: `${count} proxied entry/entries were auto-acknowledged after ${autoAckHours}h without your review. If any are incorrect, file a dispute from the Review Queue.`,
            category: 'proxy_auto_ack',
            entityId: eid,
            priority: 'normal',
          }).catch(err => console.error('[proxySlaAgent] auto-ack notify failed:', err.message));
        }
      }

      results.push({ entity: entity.name, action: 'auto_ack', count: staleReview.length });
    }
  }

  return {
    success: true,
    summary: results.length > 0 ? results : [{ action: 'no_action', message: 'All submissions within SLA' }],
  };
}

module.exports = { run };
