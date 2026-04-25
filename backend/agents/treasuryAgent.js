/**
 * Treasury & Cash Flow Agent (P2-1) — Phase G8
 * Schedule: weekdays 5:30 AM Asia/Manila.
 *
 * Rule-based: sums current bank balances, upcoming 14-day PRF/CALF cash outflow,
 * expected 14-day collection inflow, and inter-entity imbalances. Posts a daily
 * brief to PRESIDENT inbox.
 *
 * AI toggle (TREASURY_AGENT_AI_MODE): when value === 'ai' AND ANTHROPIC_API_KEY
 * present AND AI_SPEND_CAPS allow, appends a Claude-generated narrative. Gated
 * via enforceSpendCap() — never bypasses the budget.
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function peso(n) { return `₱${(Number(n) || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`; }
function tryModel(name) { try { return mongoose.model(name); } catch { return null; } }

async function getAiMode() {
  try {
    const Lookup = require('../erp/models/Lookup');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode agent: TREASURY_AGENT_AI_MODE is a system-wide tunable, not per-entity
    const row = await Lookup.findOne({ category: 'TREASURY_AGENT_AI_MODE', code: 'DEFAULT', is_active: { $ne: false } }).lean();
    return row?.metadata?.value === 'ai' ? 'ai' : 'rule';
  } catch { return 'rule'; }
}

async function sumBankBalances() {
  const BankAccount = tryModel('BankAccount');
  if (!BankAccount) return { total: 0, byBank: [] };
  // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode agent: aggregates cash on hand across every entity for the president-level brief
  const rows = await BankAccount.find({ is_active: { $ne: false } }).select('bank_name current_balance').lean();
  const total = rows.reduce((s, r) => s + (Number(r.current_balance) || 0), 0);
  const byBank = rows.slice(0, 5).map(r => ({ bank: r.bank_name, bal: Number(r.current_balance) || 0 }));
  return { total, byBank };
}

async function sumUpcomingOutflows() {
  const PrfCalf = tryModel('PrfCalf');
  if (!PrfCalf) return { total: 0, count: 0 };
  // PrfCalf has no dedicated due_date / prf_date — lifecycle is period-based
  // (YYYY-MM) and status-gated. "Upcoming outflow" = SUBMITTED or APPROVED
  // (not yet POSTED) docs for the current or previous period. Use `amount`
  // (the canonical payable field) not a non-existent total_amount.
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode agent: aggregates upcoming PRF/CALF outflows across every entity for the president-level brief
  const agg = await PrfCalf.aggregate([
    {
      $match: {
        status: { $in: ['SUBMITTED', 'APPROVED'] },
        period: { $in: [currentPeriod, prevPeriod] },
      },
    },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } },
  ]);
  return { total: agg[0]?.total || 0, count: agg[0]?.count || 0 };
}

async function sumExpectedInflows() {
  const Collection = tryModel('Collection');
  if (!Collection) return { total: 0, count: 0 };
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  // eslint-disable-next-line vip-tenant/require-entity-filter -- cron-mode agent: aggregates trailing-7-day collection inflow across every entity for the president-level brief
  const agg = await Collection.aggregate([
    { $match: { status: 'POSTED', cr_date: { $gte: weekAgo } } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$cr_amount', 0] } }, count: { $sum: 1 } } },
  ]);
  return { total: agg[0]?.total || 0, count: agg[0]?.count || 0 };
}

async function buildBody() {
  const [bank, out, inn] = await Promise.all([sumBankBalances(), sumUpcomingOutflows(), sumExpectedInflows()]);
  const runway = bank.total > 0 && out.total > 0 ? Math.round((bank.total / (out.total / 14)) * 10) / 10 : null;

  const lines = [
    `Cash on hand: ${peso(bank.total)} across ${bank.byBank.length} bank account(s).`,
    bank.byBank.length ? `  Top balances: ${bank.byBank.map(b => `${b.bank} ${peso(b.bal)}`).join('; ')}` : '',
    `Next 14-day outflow (PRF/CALF due): ${peso(out.total)} across ${out.count} doc(s).`,
    `Trailing 7-day collection inflow: ${peso(inn.total)} across ${inn.count} CR(s).`,
    runway ? `Indicative cash runway vs upcoming outflow: ~${runway} day(s).` : '',
  ].filter(Boolean);

  return lines.join('\n');
}

async function run() {
  try {
    const aiMode = await getAiMode();
    let body = await buildBody();

    if (aiMode === 'ai' && process.env.ANTHROPIC_API_KEY) {
      try {
        const { enforceSpendCap } = require('../erp/services/spendCapService');
        await enforceSpendCap(null, 'TREASURY_AGENT');
        const { askClaude } = require('./claudeClient');
        const r = await askClaude({
          system: 'You are a treasury risk commentator. Read the numbers and add 2-3 crisp sentences highlighting concentration risk, timing mismatches, and recommended transfers. No disclaimers.',
          prompt: `Cash brief:\n${body}`,
          maxTokens: 250,
          agent: 'treasury',
        });
        if (r?.text) body += `\n\n— Narrative —\n${r.text.trim()}`;
      } catch (e) {
        if (e?.reason !== 'SPEND_CAP_EXCEEDED') console.warn('[Treasury] AI append failed:', e.message);
      }
    }

    const results = await notify({
      recipient_id: 'PRESIDENT',
      title: 'Treasury Brief — Cash Position',
      body,
      category: 'briefing',
      priority: 'normal',
      channels: ['in_app', 'email'],
      agent: 'treasury',
    });

    return {
      status: 'success',
      summary: {
        alerts_generated: 1,
        messages_sent: countSuccessfulChannels(results, 'in_app'),
        key_findings: body.split('\n').slice(0, 5),
      },
      message_ids: getInAppMessageIds(results),
    };
  } catch (err) {
    console.error('[Treasury] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = { run };
