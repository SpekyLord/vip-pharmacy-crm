/**
 * Expense Anomaly Agent (#3)
 * Runs daily at 6 AM
 *
 * Detects:
 * 1. Duplicate OR numbers across expense entries
 * 2. Over-budget BDMs (current cycle > 130% of 3-month average)
 * 3. Large single expenses > P5,000 without president override
 * 4. ORE lines with non-cash payment (ORE should be cash-only)
 */

const { notify } = require('./notificationService');

async function run() {
  console.log('[ExpenseAnomaly] Running...');
  try {
    const ExpenseEntry = require('../erp/models/ExpenseEntry');
    const User = require('../models/User');

    const anomalies = [];

    // ─── 1. Duplicate OR numbers ───────────────────────────────────
    try {
      const dupes = await ExpenseEntry.aggregate([
        { $unwind: '$lines' },
        { $match: { 'lines.or_number': { $exists: true, $ne: null, $ne: '' } } },
        {
          $group: {
            _id: '$lines.or_number',
            count: { $sum: 1 },
            entry_ids: { $addToSet: '$_id' },
            bdm_ids: { $addToSet: '$bdm_id' }
          }
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 50 }
      ]);

      for (const d of dupes) {
        anomalies.push({
          type: 'DUPLICATE_OR',
          detail: `OR# ${d._id} appears in ${d.count} expense lines across ${d.entry_ids.length} entries`,
          or_number: d._id,
          entry_ids: d.entry_ids
        });
      }
    } catch (err) {
      console.error('[ExpenseAnomaly] Duplicate OR check failed:', err.message);
    }

    // ─── 2. Over-budget BDMs (current cycle vs 3-month avg) ───────
    try {
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Determine current cycle: C1 if day <= 15, C2 otherwise
      const currentCycle = now.getDate() <= 15 ? 'C1' : 'C2';

      // Get all active BDMs
      const bdms = await User.find({ role: 'employee', isActive: true }).select('_id name').lean();

      // Build 3-month lookback periods
      const lookbackPeriods = [];
      for (let i = 1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        lookbackPeriods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }

      for (const bdm of bdms) {
        try {
          // Current cycle total
          const currentResult = await ExpenseEntry.aggregate([
            { $match: { bdm_id: bdm._id, period: currentPeriod, cycle: currentCycle } },
            { $group: { _id: null, total: { $sum: '$total_amount' } } }
          ]);
          const currentTotal = currentResult[0]?.total || 0;
          if (currentTotal === 0) continue;

          // 3-month average (same cycle)
          const avgResult = await ExpenseEntry.aggregate([
            { $match: { bdm_id: bdm._id, period: { $in: lookbackPeriods }, cycle: currentCycle } },
            { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } }
          ]);
          const avgTotal = avgResult[0]?.total || 0;
          const avgCount = avgResult[0]?.count || 0;
          if (avgCount === 0) continue;

          const monthlyAvg = avgTotal / Math.min(avgCount, 3);
          const ratio = currentTotal / monthlyAvg;

          if (ratio > 1.3) {
            anomalies.push({
              type: 'OVER_BUDGET',
              detail: `${bdm.name} current ${currentCycle} expenses: P${currentTotal.toFixed(2)} (${(ratio * 100).toFixed(0)}% of 3-month avg P${monthlyAvg.toFixed(2)})`,
              bdm_name: bdm.name,
              current: currentTotal,
              average: monthlyAvg,
              ratio
            });
          }
        } catch (err) {
          // Skip individual BDM errors
        }
      }
    } catch (err) {
      console.error('[ExpenseAnomaly] Over-budget check failed:', err.message);
    }

    // ─── 3. Large single expenses > P5,000 without president override ──
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
            as: 'bdm'
          }
        },
        { $unwind: { path: '$bdm', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            bdm_name: '$bdm.name',
            amount: '$lines.amount',
            category: '$lines.expense_category',
            establishment: '$lines.establishment',
            expense_date: '$lines.expense_date',
            period: 1
          }
        },
        { $sort: { 'lines.amount': -1 } },
        { $limit: 20 }
      ]);

      for (const exp of largeExpenses) {
        anomalies.push({
          type: 'LARGE_EXPENSE',
          detail: `${exp.bdm_name || 'Unknown BDM'}: P${exp.amount.toFixed(2)} at ${exp.establishment || 'N/A'} (${exp.category || 'uncategorized'}) on ${exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : 'N/A'}`,
          amount: exp.amount
        });
      }
    } catch (err) {
      console.error('[ExpenseAnomaly] Large expense check failed:', err.message);
    }

    // ─── 4. ORE with non-cash payment ─────────────────────────────
    try {
      const oreCashViolations = await ExpenseEntry.aggregate([
        { $unwind: '$lines' },
        {
          $match: {
            'lines.expense_type': 'ORE',
            'lines.payment_mode': { $exists: true, $ne: 'CASH' }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'bdm_id',
            foreignField: '_id',
            as: 'bdm'
          }
        },
        { $unwind: { path: '$bdm', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            bdm_name: '$bdm.name',
            payment_mode: '$lines.payment_mode',
            amount: '$lines.amount',
            or_number: '$lines.or_number',
            expense_date: '$lines.expense_date'
          }
        },
        { $limit: 30 }
      ]);

      for (const v of oreCashViolations) {
        anomalies.push({
          type: 'ORE_NON_CASH',
          detail: `${v.bdm_name || 'Unknown BDM'}: ORE paid via ${v.payment_mode} (P${(v.amount || 0).toFixed(2)}, OR# ${v.or_number || 'N/A'}). ORE must be CASH only.`,
          payment_mode: v.payment_mode
        });
      }
    } catch (err) {
      console.error('[ExpenseAnomaly] ORE cash check failed:', err.message);
    }

    // ─── Send summary to PRESIDENT ─────────────────────────────────
    if (anomalies.length > 0) {
      const grouped = {};
      for (const a of anomalies) {
        if (!grouped[a.type]) grouped[a.type] = [];
        grouped[a.type].push(a.detail);
      }

      let body = `Expense Anomaly Report — ${new Date().toLocaleDateString()}\n\n`;
      body += `Total anomalies found: ${anomalies.length}\n\n`;

      for (const [type, details] of Object.entries(grouped)) {
        body += `=== ${type} (${details.length}) ===\n`;
        for (const d of details) {
          body += `  - ${d}\n`;
        }
        body += '\n';
      }

      await notify({
        recipient_id: 'PRESIDENT',
        title: `Expense Anomalies Detected (${anomalies.length})`,
        body,
        category: 'system',
        priority: 'important',
        channels: ['in_app', 'email'],
        agent: 'expense_anomaly'
      });
    }

    console.log(`[ExpenseAnomaly] Complete. Found ${anomalies.length} anomalies.`);
  } catch (err) {
    console.error('[ExpenseAnomaly] Error:', err.message);
  }
}

module.exports = { run };
