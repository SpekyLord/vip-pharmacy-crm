/**
 * BDM Performance Coach Agent (#7) - AI-powered coaching feedback.
 */

const { askClaude } = require('./claudeClient');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

function buildExpensePeriod(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatCoachInput(summary) {
  return `BDM: ${summary.name}
Week visits: ${summary.weekVisits} | Month visits: ${summary.monthVisits}
Month sales: PHP ${summary.salesTotal.toLocaleString()} (${summary.salesCount} invoices)
Month expenses: PHP ${summary.expenseTotal.toLocaleString()}
Month collections: PHP ${summary.collectionTotal.toLocaleString()} (${summary.collectionCount} receipts)
Expense/Sales ratio: ${summary.salesTotal > 0 ? ((summary.expenseTotal / summary.salesTotal) * 100).toFixed(1) : 'N/A'}%`;
}

async function run() {
  console.log('[PerformanceCoach] Running...');

  const User = require('../models/User');
  const Visit = require('../models/Visit');
  const SalesLine = require('../erp/models/SalesLine');
  const ExpenseEntry = require('../erp/models/ExpenseEntry');
  const Collection = require('../erp/models/Collection');

  const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name entity_id').lean();
  if (!bdms.length) {
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
  const expensePeriod = buildExpensePeriod(now);

  const notificationResults = [];
  const bdmSummaries = [];
  const failures = [];

  for (const bdm of bdms) {
    try {
      const weekVisits = await Visit.countDocuments({
        user: bdm._id,
        status: 'completed',
        visitDate: { $gte: weekAgo },
      });

      const monthVisits = await Visit.countDocuments({
        user: bdm._id,
        status: 'completed',
        visitDate: { $gte: monthStart },
      });

      const sales = await SalesLine.aggregate([
        {
          $match: {
            bdm_id: bdm._id,
            status: 'POSTED',
            csi_date: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$invoice_total' },
            count: { $sum: 1 },
          },
        },
      ]);
      const salesTotal = sales[0]?.total || 0;
      const salesCount = sales[0]?.count || 0;

      const expenses = await ExpenseEntry.aggregate([
        {
          $match: {
            bdm_id: bdm._id,
            status: 'POSTED',
            period: expensePeriod,
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$total_amount' },
          },
        },
      ]);
      const expenseTotal = expenses[0]?.total || 0;

      const collections = await Collection.aggregate([
        {
          $match: {
            bdm_id: bdm._id,
            status: 'POSTED',
            cr_date: { $gte: monthStart },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$cr_amount' },
            count: { $sum: 1 },
          },
        },
      ]);
      const collectionTotal = collections[0]?.total || 0;
      const collectionCount = collections[0]?.count || 0;

      const summary = {
        name: bdm.name,
        id: bdm._id,
        weekVisits,
        monthVisits,
        salesTotal,
        salesCount,
        expenseTotal,
        collectionTotal,
        collectionCount,
      };

      const { text } = await askClaude({
        system: `You are a sales performance coach for Philippine pharmaceutical BDMs (Business Development Managers). Give brief, constructive weekly feedback. Focus on:
- Visit consistency (target: 8-10 MDs/day, about 40-50/week)
- Sales vs expense efficiency
- Collection follow-up
Keep it encouraging and actionable. Use 3-4 bullet points max and Philippine business context.`,
        prompt: `Weekly performance for:\n${formatCoachInput(summary)}\n\nGive brief coaching feedback.`,
        maxTokens: 400,
        agent: 'performance_coach',
      });

      notificationResults.push(
        ...(await notify({
          recipient_id: bdm._id,
          title: 'Weekly Performance Coaching',
          body: text,
          category: 'ai_coaching',
          priority: 'normal',
          channels: ['in_app'],
          agent: 'performance_coach',
        }))
      );

      bdmSummaries.push(summary);
    } catch (err) {
      failures.push({
        bdmId: bdm._id?.toString?.() || String(bdm._id),
        name: bdm.name || 'Unknown BDM',
        error: err,
      });
      console.error(`[PerformanceCoach] Failed for ${bdm.name || 'Unknown BDM'}:`, err.message);
    }
  }

  if (!bdmSummaries.length && failures.length) {
    throw failures[0].error;
  }

  if (bdmSummaries.length) {
    const summaryLines = bdmSummaries
      .map((bdm) =>
        `${bdm.name}: ${bdm.weekVisits} visits, PHP ${bdm.salesTotal.toLocaleString()} sales, PHP ${bdm.collectionTotal.toLocaleString()} collected`
      )
      .join('\n');

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: 'Weekly BDM Performance Summary',
        body: `BDM metrics for the week ending ${now.toLocaleDateString('en-PH')}:\n\n${summaryLines}`,
        category: 'ai_coaching',
        priority: 'normal',
        channels: ['in_app'],
        agent: 'performance_coach',
      }))
    );
  }

  const topPerformers = [...bdmSummaries]
    .sort((a, b) => b.salesTotal - a.salesTotal)
    .slice(0, 3)
    .map((bdm) => `${bdm.name}: PHP ${bdm.salesTotal.toLocaleString()} sales, ${bdm.weekVisits} visits`);

  console.log(`[PerformanceCoach] Coached ${bdmSummaries.length} BDMs with ${failures.length} failures.`);

  return {
    status: failures.length ? 'partial' : 'success',
    summary: {
      bdms_processed: bdmSummaries.length,
      alerts_generated: bdmSummaries.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: [
        ...(topPerformers.length ? topPerformers : ['Coaching sent without standout sales leaders this week.']),
        ...(failures.length ? [`${failures.length} BDM coaching run(s) failed and were skipped.`] : []),
      ].slice(0, 10),
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
