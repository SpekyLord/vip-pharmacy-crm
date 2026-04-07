/**
 * BDM Performance Coach Agent (#7) — AI-powered coaching feedback
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
const { notify } = require('./notificationService');
const AgentRun = require('../erp/models/AgentRun');

async function run() {
  console.log('[PerformanceCoach] Running...');
  try {
    const User = require('../models/User');
    const Visit = require('../models/Visit');
    const SalesLine = require('../erp/models/SalesLine');
    const ExpenseEntry = require('../erp/models/ExpenseEntry');
    const Collection = require('../erp/models/Collection');

    const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name entity_id').lean();
    if (!bdms.length) { console.log('[PerformanceCoach] No active BDMs.'); return; }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const bdmSummaries = [];

    for (const bdm of bdms) {
      // CRM: visits this week
      const weekVisits = await Visit.countDocuments({
        user: bdm._id,
        visitDate: { $gte: weekAgo }
      });

      // CRM: visits this month
      const monthVisits = await Visit.countDocuments({
        user: bdm._id,
        visitDate: { $gte: monthStart }
      });

      // ERP: sales this month
      const sales = await SalesLine.aggregate([
        { $match: { bdm_id: bdm._id, status: 'POSTED', created_at: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } }
      ]);
      const salesTotal = sales[0]?.total || 0;
      const salesCount = sales[0]?.count || 0;

      // ERP: expenses this month
      const expenses = await ExpenseEntry.aggregate([
        { $match: { bdm_id: bdm._id, status: 'POSTED', period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } }
      ]);
      const expenseTotal = expenses[0]?.total || 0;

      // ERP: collections this month
      const collections = await Collection.aggregate([
        { $match: { collected_by: bdm._id, status: 'POSTED', cr_date: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$cr_amount' }, count: { $sum: 1 } } }
      ]);
      const collectionTotal = collections[0]?.total || 0;
      const collectionCount = collections[0]?.count || 0;

      bdmSummaries.push({
        name: bdm.name,
        id: bdm._id,
        weekVisits,
        monthVisits,
        salesTotal,
        salesCount,
        expenseTotal,
        collectionTotal,
        collectionCount
      });
    }

    // Generate coaching per BDM using Claude
    for (const bdm of bdmSummaries) {
      const data = `BDM: ${bdm.name}
Week visits: ${bdm.weekVisits} | Month visits: ${bdm.monthVisits}
Month sales: ₱${bdm.salesTotal.toLocaleString()} (${bdm.salesCount} invoices)
Month expenses: ₱${bdm.expenseTotal.toLocaleString()}
Month collections: ₱${bdm.collectionTotal.toLocaleString()} (${bdm.collectionCount} receipts)
Expense/Sales ratio: ${bdm.salesTotal > 0 ? ((bdm.expenseTotal / bdm.salesTotal) * 100).toFixed(1) : 'N/A'}%`;

      const { text } = await askClaude({
        system: `You are a sales performance coach for Philippine pharmaceutical BDMs (Business Development Managers). Give brief, constructive weekly feedback. Focus on:
- Visit consistency (target: 8-10 MDs/day, ~40-50/week)
- Sales vs expense efficiency
- Collection follow-up
Keep it encouraging and actionable. 3-4 bullet points max. Use Philippine business context.`,
        prompt: `Weekly performance for:\n${data}\n\nGive brief coaching feedback.`,
        maxTokens: 400,
        agent: 'performance_coach'
      });

      await notify({
        recipient_id: bdm.id,
        title: 'Weekly Performance Coaching',
        body: text,
        category: 'ai_coaching',
        priority: 'normal',
        channels: ['in_app'],
        agent: 'performance_coach'
      });
    }

    // President summary
    const summaryLines = bdmSummaries.map(b =>
      `${b.name}: ${b.weekVisits} visits, ₱${b.salesTotal.toLocaleString()} sales, ₱${b.collectionTotal.toLocaleString()} collected`
    ).join('\n');

    await notify({
      recipient_id: 'PRESIDENT',
      title: 'Weekly BDM Performance Summary',
      body: `BDM metrics for the week ending ${now.toLocaleDateString('en-PH')}:\n\n${summaryLines}`,
      category: 'ai_coaching',
      priority: 'normal',
      channels: ['in_app'],
      agent: 'performance_coach'
    });

    // Log agent run
    const topPerformers = [...bdmSummaries].sort((a, b) => b.salesTotal - a.salesTotal).slice(0, 3);
    await AgentRun.create({
      agent_key: 'performance_coach',
      agent_label: 'BDM Performance Coach',
      status: 'success',
      summary: {
        bdms_processed: bdmSummaries.length,
        alerts_generated: bdmSummaries.length,
        messages_sent: bdmSummaries.length + 1,
        key_findings: topPerformers.map(b => `${b.name}: ₱${b.salesTotal.toLocaleString()} sales, ${b.weekVisits} visits`)
      }
    });

    console.log(`[PerformanceCoach] Coached ${bdmSummaries.length} BDMs.`);
  } catch (err) {
    console.error('[PerformanceCoach] Error:', err.message);
    try { await AgentRun.create({ agent_key: 'performance_coach', agent_label: 'BDM Performance Coach', status: 'error', error_msg: err.message }); } catch {}
  }
}

module.exports = { run };
