/**
 * Compliance Deadline Calendar Agent (P2-4) — Phase G8
 * Schedule: Monday 5:00 AM Asia/Manila (weekly).
 *
 * Rule-based: lists known recurring deadlines falling in the next 14 days.
 * Source: COMPLIANCE_DEADLINES lookup (lazy-seeded below if not present).
 * Adding a deadline = new lookup row, no code change (Rule #3).
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

// Baseline PH deadlines. Month offsets: 'every' = monthly; [1,4,7,10] = quarterly.
// Each deadline: { code, label, day_of_month, months (array) | 'every', description }.
// Entities add/remove via Control Center → Lookup Tables once the row category exists.
const BASELINE_DEADLINES = [
  { code: 'BIR_1601E', label: 'BIR 1601-E (monthly withholding)', day_of_month: 10, months: 'every', description: 'Expanded withholding tax return, filed monthly' },
  { code: 'BIR_2550M', label: 'BIR 2550-M (monthly VAT)', day_of_month: 20, months: 'every', description: 'Monthly VAT declaration' },
  { code: 'BIR_1701Q', label: 'BIR 1701-Q (quarterly income tax)', day_of_month: 15, months: [5, 8, 11], description: 'Quarterly income tax return' },
  { code: 'SSS_REMIT', label: 'SSS contribution remittance', day_of_month: 10, months: 'every', description: 'SSS employer remittance' },
  { code: 'PHIC_REMIT', label: 'PhilHealth remittance', day_of_month: 15, months: 'every', description: 'PhilHealth employer remittance' },
  { code: 'HDMF_REMIT', label: 'HDMF (Pag-IBIG) remittance', day_of_month: 15, months: 'every', description: 'Pag-IBIG employer remittance' },
];

async function loadDeadlines() {
  const Lookup = tryModel('Lookup');
  if (!Lookup) return BASELINE_DEADLINES;
  // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: COMPLIANCE_DEADLINES are PH-wide regulatory dates shared across all entities
  const rows = await Lookup.find({ category: 'COMPLIANCE_DEADLINES', is_active: { $ne: false } }).lean();
  if (!rows.length) return BASELINE_DEADLINES;
  return rows.map(r => ({
    code: r.code,
    label: r.label,
    day_of_month: r.metadata?.day_of_month || 10,
    months: r.metadata?.months || 'every',
    description: r.metadata?.description || '',
  }));
}

function upcomingFor(deadline, from = new Date(), windowDays = 14) {
  const out = [];
  for (let i = 0; i < windowDays + 1; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const m = d.getMonth() + 1;
    const dom = d.getDate();
    const monthsArr = deadline.months === 'every' ? null : deadline.months;
    if (dom === deadline.day_of_month && (!monthsArr || monthsArr.includes(m))) {
      out.push({ date: d, label: deadline.label, description: deadline.description });
    }
  }
  return out;
}

async function run() {
  try {
    const deadlines = await loadDeadlines();
    const now = new Date();
    const upcoming = deadlines.flatMap(d => upcomingFor(d, now, 14)).sort((a, b) => a.date - b.date);

    const lines = upcoming.length
      ? upcoming.map(u => `• ${u.date.toISOString().slice(0, 10)} — ${u.label}`)
      : ['No filings / remittances in the next 14 days.'];

    const body = lines.join('\n');

    const results = await notify({
      recipient_id: 'PRESIDENT',
      title: 'Compliance Deadline Calendar — Next 14 Days',
      body,
      category: 'compliance_alert',
      priority: upcoming.length > 0 ? 'important' : 'normal',
      channels: ['in_app', 'email'],
      agent: 'compliance_calendar',
    });

    return {
      status: 'success',
      summary: { alerts_generated: upcoming.length, messages_sent: countSuccessfulChannels(results, 'in_app'), key_findings: lines.slice(0, 6) },
      message_ids: getInAppMessageIds(results),
    };
  } catch (err) {
    console.error('[Compliance] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
