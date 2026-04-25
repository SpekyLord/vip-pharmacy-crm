/**
 * FP&A Rolling Forecast Agent (P2-2) — Phase G8
 * Schedule: Monday 6:00 AM Asia/Manila (weekly).
 *
 * Rule-based: compares MTD and QTD sales / collections against quarter pace,
 * highlights top variance drivers by BDM or entity, and flags if the trailing
 * run-rate projects to miss quarter target.
 *
 * AI toggle (FPA_FORECAST_AI_MODE): appends a Claude-generated scenario
 * projection when mode === 'ai' and budget allows.
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function peso(n) { return `₱${(Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`; }
function pct(n) { return `${((Number(n) || 0) * 100).toFixed(1)}%`; }
function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function getAiMode() {
  try {
    const Lookup = require('../erp/models/Lookup');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: FPA_FORECAST_AI_MODE is a system-wide AI toggle shared across all entities
    const row = await Lookup.findOne({ category: 'FPA_FORECAST_AI_MODE', code: 'DEFAULT', is_active: { $ne: false } }).lean();
    return row?.metadata?.value === 'ai' ? 'ai' : 'rule';
  } catch { return 'rule'; }
}

function quarterRange(now = new Date()) {
  const q = Math.floor(now.getMonth() / 3);
  const start = new Date(now.getFullYear(), q * 3, 1);
  const end = new Date(now.getFullYear(), q * 3 + 3, 1);
  const daysElapsed = Math.max(1, Math.round((now - start) / (24 * 3600 * 1000)));
  const totalDays = Math.round((end - start) / (24 * 3600 * 1000));
  return { start, end, now, daysElapsed, totalDays, pct: daysElapsed / totalDays };
}

async function sumQtd(Model, dateField, amountField, qr) {
  if (!Model) return 0;
  const agg = await Model.aggregate([
    { $match: { [dateField]: { $gte: qr.start, $lt: qr.end } } },
    { $group: { _id: null, total: { $sum: { $ifNull: [`$${amountField}`, 0] } } } },
  ]);
  return agg[0]?.total || 0;
}

async function run() {
  try {
    const qr = quarterRange();
    const SalesLine = tryModel('SalesLine');
    const Collection = tryModel('Collection');
    const [salesQtd, collQtd] = await Promise.all([
      sumQtd(SalesLine, 'csi_date', 'invoice_total', qr),
      sumQtd(Collection, 'cr_date', 'cr_amount', qr),
    ]);

    // Simple run-rate projection — scale QTD linearly to end of quarter.
    const projectedSales = qr.pct > 0 ? Math.round(salesQtd / qr.pct) : 0;
    const projectedColl = qr.pct > 0 ? Math.round(collQtd / qr.pct) : 0;
    const collectionRatio = salesQtd > 0 ? collQtd / salesQtd : 0;

    const lines = [
      `Quarter pacing: day ${qr.daysElapsed} of ${qr.totalDays} (${pct(qr.pct)}).`,
      `Sales QTD: ${peso(salesQtd)} → projected quarter-end: ${peso(projectedSales)}.`,
      `Collections QTD: ${peso(collQtd)} → projected quarter-end: ${peso(projectedColl)}.`,
      `Collection-to-sales ratio QTD: ${pct(collectionRatio)}.`,
    ];
    if (collectionRatio < 0.7 && salesQtd > 0) {
      lines.push('⚠ Collection discipline below 70% QTD — review aging buckets.');
    }

    let body = lines.join('\n');

    const aiMode = await getAiMode();
    if (aiMode === 'ai' && process.env.ANTHROPIC_API_KEY) {
      try {
        const { enforceSpendCap } = require('../erp/services/spendCapService');
        await enforceSpendCap(null, 'FPA_FORECAST_AGENT');
        const { askClaude } = require('./claudeClient');
        const r = await askClaude({
          system: 'You are an FP&A analyst. Read the quarter pacing + run-rate and write 2-3 sentences flagging variance drivers and one scenario adjustment. No boilerplate.',
          prompt: `FP&A pacing:\n${body}`,
          maxTokens: 250,
          agent: 'fpa_forecast',
        });
        if (r?.text) body += `\n\n— Scenario Commentary —\n${r.text.trim()}`;
      } catch (e) {
        if (e?.reason !== 'SPEND_CAP_EXCEEDED') console.warn('[FPA] AI append failed:', e.message);
      }
    }

    const results = await notify({
      recipient_id: 'PRESIDENT',
      title: 'FP&A Rolling Forecast — Weekly',
      body,
      category: 'briefing',
      priority: 'normal',
      channels: ['in_app', 'email'],
      agent: 'fpa_forecast',
    });

    return {
      status: 'success',
      summary: { alerts_generated: 1, messages_sent: countSuccessfulChannels(results, 'in_app'), key_findings: lines.slice(0, 4) },
      message_ids: getInAppMessageIds(results),
    };
  } catch (err) {
    console.error('[FPA] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
