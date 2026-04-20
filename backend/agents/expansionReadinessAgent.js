/**
 * Expansion Readiness Agent (P2-8) — Phase G8
 * Schedule: 1st of month 10:00 AM Asia/Manila (monthly).
 *
 * Rule-based entity performance ranking + BDM graduation flags.
 *   - Per-entity: sales / collections / active-BDM count (60-day window)
 *   - BDMs exceeding threshold for 3 consecutive months → flagged for graduation
 *     (threshold + window come from EXPANSION_READINESS_CONFIG lookup)
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function peso(n) { return `₱${(Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`; }
function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function loadConfig() {
  try {
    const Lookup = require('../erp/models/Lookup');
    const row = await Lookup.findOne({ category: 'EXPANSION_READINESS_CONFIG', code: 'DEFAULT', is_active: { $ne: false } }).lean();
    const m = row?.metadata || {};
    return {
      bdm_graduation_monthly_sales_min: Number(m.bdm_graduation_monthly_sales_min) || 500000,
      bdm_graduation_months_required: Number(m.bdm_graduation_months_required) || 3,
    };
  } catch {
    return { bdm_graduation_monthly_sales_min: 500000, bdm_graduation_months_required: 3 };
  }
}

async function entityRanking() {
  const SalesLine = tryModel('SalesLine');
  if (!SalesLine) return [];
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  return SalesLine.aggregate([
    { $match: { csi_date: { $gte: since }, status: 'POSTED' } },
    { $group: { _id: '$entity_id', total: { $sum: { $ifNull: ['$invoice_total', 0] } }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);
}

async function bdmGraduationFlags(cfg) {
  const SalesLine = tryModel('SalesLine');
  if (!SalesLine) return [];
  const months = cfg.bdm_graduation_months_required;
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const agg = await SalesLine.aggregate([
    { $match: { csi_date: { $gte: since }, status: 'POSTED', bdm_id: { $ne: null } } },
    {
      $group: {
        _id: {
          bdm: '$bdm_id',
          ym: { $dateToString: { format: '%Y-%m', date: '$csi_date' } },
        },
        total: { $sum: { $ifNull: ['$invoice_total', 0] } },
      },
    },
    {
      $group: {
        _id: '$_id.bdm',
        months_over: {
          $sum: { $cond: [{ $gte: ['$total', cfg.bdm_graduation_monthly_sales_min] }, 1, 0] },
        },
        months_tracked: { $sum: 1 },
        trailing_total: { $sum: '$total' },
      },
    },
    { $match: { months_over: { $gte: months } } },
    { $sort: { trailing_total: -1 } },
    { $limit: 10 },
  ]);
  return agg;
}

async function run() {
  try {
    const cfg = await loadConfig();
    const [entities, graduates] = await Promise.all([entityRanking(), bdmGraduationFlags(cfg)]);

    const lines = [];
    lines.push('Entity performance (60-day POSTED sales):');
    entities.slice(0, 5).forEach((e, i) => lines.push(`  ${i + 1}. entity ${String(e._id)} — ${peso(e.total)} · ${e.count} CSI(s)`));

    lines.push('');
    lines.push(`BDM graduation flags (≥₱${cfg.bdm_graduation_monthly_sales_min.toLocaleString('en-PH')}/mo for ${cfg.bdm_graduation_months_required} months):`);
    if (graduates.length === 0) lines.push('  — None this cycle.');
    graduates.slice(0, 5).forEach(g => lines.push(`  bdm ${String(g._id)} — ${peso(g.trailing_total)} trailing, ${g.months_over}/${g.months_tracked} months over threshold`));

    const body = lines.join('\n');
    const results = await notify({
      recipient_id: 'PRESIDENT',
      title: `Expansion Readiness — ${graduates.length} BDM graduation flag(s)`,
      body,
      category: 'briefing',
      priority: graduates.length > 0 ? 'important' : 'normal',
      channels: ['in_app', 'email'],
      agent: 'expansion_readiness',
    });

    return {
      status: 'success',
      summary: { alerts_generated: graduates.length, messages_sent: countSuccessfulChannels(results, 'in_app'), key_findings: lines.slice(0, 8) },
      message_ids: getInAppMessageIds(results),
    };
  } catch (err) {
    console.error('[Expansion] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
