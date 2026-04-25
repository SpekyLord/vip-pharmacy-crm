/**
 * BDM Performance Coach Agent (#7) - AI-powered coaching feedback
 *
 * Runs weekly Monday 6:00 AM. Analyzes per BDM:
 *   - Visit frequency vs target (CRM visits)
 *   - Sales volume trends (ERP sales)
 *   - Expense patterns (ERP expenses)
 *   - Collection efficiency (ERP collections)
 *
 * Generates personalized coaching feedback per BDM.
 * Notifies: Each BDM (their own feedback) + PRESIDENT (summary)
 */
const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');
const { ROLES } = require('../constants/roles');

function formatPhpAmount(value) {
  return `PHP ${Number(value || 0).toLocaleString('en-PH')}`;
}

async function run() {
  console.log('[PerformanceCoach] Running...');

  const User = require('../models/User');
  const Visit = require('../models/Visit');
  const SalesLine = require('../erp/models/SalesLine');
  const ExpenseEntry = require('../erp/models/ExpenseEntry');
  const Collection = require('../erp/models/Collection');

  const bdms = await User.find({ role: ROLES.CONTRACTOR, isActive: true }).select('_id name entity_id').lean();
  if (!bdms.length) {
    console.log('[PerformanceCoach] No active BDMs.');
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        messages_sent: 0,
        key_findings: ['No active BDMs found for coaching.'],
      },
      message_ids: [],
    };
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const successfulBdms = [];
  const failures = [];
  const notificationResults = [];

  for (const bdm of bdms) {
    try {
      const weekVisits = await Visit.countDocuments({
        user: bdm._id,
        visitDate: { $gte: weekAgo },
      });

      const monthVisits = await Visit.countDocuments({
        user: bdm._id,
        visitDate: { $gte: monthStart },
      });

      // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: per-BDM coaching aggregates sales across all entities the BDM submits against
      const sales = await SalesLine.aggregate([
        { $match: { bdm_id: bdm._id, status: 'POSTED', csi_date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$invoice_total' }, count: { $sum: 1 } } },
      ]);
      const salesTotal = sales[0]?.total || 0;
      const salesCount = sales[0]?.count || 0;

      // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: per-BDM coaching aggregates expenses across all entities the BDM submits against
      const expenses = await ExpenseEntry.aggregate([
        { $match: { bdm_id: bdm._id, status: 'POSTED', period: currentPeriod } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]);
      const expenseTotal = expenses[0]?.total || 0;

      // eslint-disable-next-line vip-tenant/require-entity-filter -- global cron: per-BDM coaching aggregates collections across all entities the BDM submits against
      const collections = await Collection.aggregate([
        { $match: { bdm_id: bdm._id, status: 'POSTED', cr_date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$cr_amount' }, count: { $sum: 1 } } },
      ]);
      const collectionTotal = collections[0]?.total || 0;
      const collectionCount = collections[0]?.count || 0;

      const summary = {
        id: bdm._id,
        name: bdm.name,
        weekVisits,
        monthVisits,
        salesTotal,
        salesCount,
        expenseTotal,
        collectionTotal,
        collectionCount,
      };

      const data = `BDM: ${summary.name}
Week visits: ${summary.weekVisits} | Month visits: ${summary.monthVisits}
Month sales: ${formatPhpAmount(summary.salesTotal)} (${summary.salesCount} invoices)
Month expenses: ${formatPhpAmount(summary.expenseTotal)}
Month collections: ${formatPhpAmount(summary.collectionTotal)} (${summary.collectionCount} receipts)
Expense/Sales ratio: ${summary.salesTotal > 0 ? ((summary.expenseTotal / summary.salesTotal) * 100).toFixed(1) : 'N/A'}%`;

      const { text } = await askClaude({
        system: `You are a sales performance coach for Philippine pharmaceutical BDMs (Business Development Managers). Give brief, constructive weekly feedback. Focus on:
- Visit consistency (target: 8-10 MDs/day, ~40-50/week)
- Sales vs expense efficiency
- Collection follow-up
Keep it encouraging and actionable. 3-4 bullet points max. Use Philippine business context.`,
        prompt: `Weekly performance for:\n${data}\n\nGive brief coaching feedback.`,
        maxTokens: 400,
        agent: 'performance_coach',
      });

      notificationResults.push(...(await notify({
        recipient_id: summary.id,
        title: 'Weekly Performance Coaching',
        body: text,
        category: 'ai_coaching',
        priority: 'normal',
        channels: ['in_app'],
        agent: 'performance_coach',
      })));

      successfulBdms.push(summary);
    } catch (err) {
      console.error('[PerformanceCoach] Error:', err.message);
      failures.push({ bdmId: bdm._id, name: bdm.name, error: err });
    }
  }

  if (!successfulBdms.length) {
    throw failures[0]?.error || new Error('No BDM coaching runs completed successfully');
  }

  const summaryLines = successfulBdms
    .map((bdm) => `${bdm.name}: ${bdm.weekVisits} visits, ${formatPhpAmount(bdm.salesTotal)} sales, ${formatPhpAmount(bdm.collectionTotal)} collected`)
    .join('\n');

  notificationResults.push(...(await notify({
    recipient_id: 'PRESIDENT',
    title: 'Weekly BDM Performance Summary',
    body: `BDM metrics for the week ending ${now.toLocaleDateString('en-PH')}:\n\n${summaryLines}`,
    category: 'ai_coaching',
    priority: 'normal',
    channels: ['in_app'],
    agent: 'performance_coach',
  })));

  const keyFindings = [...successfulBdms]
    .sort((a, b) => b.salesTotal - a.salesTotal)
    .slice(0, 3)
    .map((bdm) => `${bdm.name}: ${formatPhpAmount(bdm.salesTotal)} sales, ${bdm.weekVisits} visits`);

  if (failures.length) {
    keyFindings.push(`${failures.length} BDM coaching run(s) failed and were skipped.`);
  }

  console.log(`[PerformanceCoach] Coached ${successfulBdms.length} BDMs.`);

  return {
    status: failures.length ? 'partial' : 'success',
    summary: {
      bdms_processed: successfulBdms.length,
      alerts_generated: successfulBdms.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: keyFindings,
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
