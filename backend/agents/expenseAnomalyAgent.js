/**
 * Expense Anomaly Agent (#3)
 */

const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

async function run() {
  console.log('[ExpenseAnomaly] Running...');

  const ExpenseEntry = require('../erp/models/ExpenseEntry');
  const User = require('../models/User');

  const anomalies = [];
  let checkedBdms = 0;

  try {
    const dupes = await ExpenseEntry.aggregate([
      { $unwind: '$lines' },
      { $match: { 'lines.or_number': { $exists: true, $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$lines.or_number',
          count: { $sum: 1 },
          entry_ids: { $addToSet: '$_id' },
          bdm_ids: { $addToSet: '$bdm_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 50 },
    ]);

    for (const dupe of dupes) {
      anomalies.push({
        type: 'DUPLICATE_OR',
        detail: `OR# ${dupe._id} appears in ${dupe.count} expense lines across ${dupe.entry_ids.length} entries`,
      });
    }
  } catch (err) {
    console.error('[ExpenseAnomaly] Duplicate OR check failed:', err.message);
  }

  try {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentCycle = now.getDate() <= 15 ? 'C1' : 'C2';

    const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name').lean();
    checkedBdms = bdms.length;

    const lookbackPeriods = [];
    for (let i = 1; i <= 3; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      lookbackPeriods.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }

    for (const bdm of bdms) {
      try {
        const currentResult = await ExpenseEntry.aggregate([
          { $match: { bdm_id: bdm._id, period: currentPeriod, cycle: currentCycle } },
          { $group: { _id: null, total: { $sum: '$total_amount' } } },
        ]);
        const currentTotal = currentResult[0]?.total || 0;
        if (currentTotal === 0) continue;

        const avgResult = await ExpenseEntry.aggregate([
          { $match: { bdm_id: bdm._id, period: { $in: lookbackPeriods }, cycle: currentCycle } },
          { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
        ]);
        const avgTotal = avgResult[0]?.total || 0;
        const avgCount = avgResult[0]?.count || 0;
        if (avgCount === 0) continue;

        const monthlyAvg = avgTotal / Math.min(avgCount, 3);
        const ratio = currentTotal / monthlyAvg;

        if (ratio > 1.3) {
          anomalies.push({
            type: 'OVER_BUDGET',
            detail: `${bdm.name} current ${currentCycle} expenses: PHP ${currentTotal.toFixed(2)} (${(ratio * 100).toFixed(0)}% of 3-month avg PHP ${monthlyAvg.toFixed(2)})`,
          });
        }
      } catch (err) {
        console.error('[ExpenseAnomaly] Over-budget check failed for BDM:', err.message);
      }
    }
  } catch (err) {
    console.error('[ExpenseAnomaly] Over-budget check failed:', err.message);
  }

  try {
    const largeExpenses = await ExpenseEntry.aggregate([
      { $match: { recorded_on_behalf_of: { $exists: false } } },
      { $unwind: '$lines' },
      { $match: { 'lines.amount': { $gt: 5000 } } },
      {
        $lookup: {
          from: 'users',
          localField: 'bdm_id',
          foreignField: '_id',
          as: 'bdm',
        },
      },
      { $unwind: { path: '$bdm', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          bdm_name: '$bdm.name',
          amount: '$lines.amount',
          category: '$lines.expense_category',
          establishment: '$lines.establishment',
          expense_date: '$lines.expense_date',
        },
      },
      { $limit: 20 },
    ]);

    for (const expense of largeExpenses) {
      anomalies.push({
        type: 'LARGE_EXPENSE',
        detail: `${expense.bdm_name || 'Unknown BDM'}: PHP ${expense.amount.toFixed(2)} at ${expense.establishment || 'N/A'} (${expense.category || 'uncategorized'}) on ${expense.expense_date ? new Date(expense.expense_date).toLocaleDateString() : 'N/A'}`,
      });
    }
  } catch (err) {
    console.error('[ExpenseAnomaly] Large expense check failed:', err.message);
  }

  try {
    const oreCashViolations = await ExpenseEntry.aggregate([
      { $unwind: '$lines' },
      {
        $match: {
          'lines.expense_type': 'ORE',
          'lines.payment_mode': { $exists: true, $ne: 'CASH' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'bdm_id',
          foreignField: '_id',
          as: 'bdm',
        },
      },
      { $unwind: { path: '$bdm', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          bdm_name: '$bdm.name',
          payment_mode: '$lines.payment_mode',
          amount: '$lines.amount',
          or_number: '$lines.or_number',
        },
      },
      { $limit: 30 },
    ]);

    for (const violation of oreCashViolations) {
      anomalies.push({
        type: 'ORE_NON_CASH',
        detail: `${violation.bdm_name || 'Unknown BDM'}: ORE paid via ${violation.payment_mode} (PHP ${(violation.amount || 0).toFixed(2)}, OR# ${violation.or_number || 'N/A'}). ORE must be CASH only.`,
      });
    }
  } catch (err) {
    console.error('[ExpenseAnomaly] ORE cash check failed:', err.message);
  }

  const notificationResults = [];
  if (anomalies.length > 0) {
    const grouped = {};
    for (const anomaly of anomalies) {
      if (!grouped[anomaly.type]) grouped[anomaly.type] = [];
      grouped[anomaly.type].push(anomaly.detail);
    }

    let body = `Expense Anomaly Report - ${new Date().toLocaleDateString()}\n\n`;
    body += `Total anomalies found: ${anomalies.length}\n\n`;

    for (const [type, details] of Object.entries(grouped)) {
      body += `=== ${type} (${details.length}) ===\n`;
      for (const detail of details) {
        body += `  - ${detail}\n`;
      }
      body += '\n';
    }

    notificationResults.push(
      ...(await notify({
        recipient_id: 'PRESIDENT',
        title: `Expense Anomalies Detected (${anomalies.length})`,
        body,
        category: 'system',
        priority: 'important',
        channels: ['in_app', 'email'],
        agent: 'expense_anomaly',
      }))
    );
  }

  console.log(`[ExpenseAnomaly] Complete. Found ${anomalies.length} anomalies.`);

  return {
    status: 'success',
    summary: {
      bdms_processed: checkedBdms,
      alerts_generated: anomalies.length,
      messages_sent: countSuccessfulChannels(notificationResults, 'in_app'),
      key_findings: anomalies.length ? anomalies.slice(0, 5).map((anomaly) => anomaly.detail) : ['No expense anomalies detected.'],
    },
    message_ids: getInAppMessageIds(notificationResults),
  };
}

module.exports = { run };
