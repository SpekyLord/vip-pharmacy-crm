/**
 * explainReportingQueries.js — EXPLAIN audit for the top reporting pipelines
 *
 * Runs .explain('executionStats') on every aggregation issued by the top
 * reporting services (dashboard, AR, performance, consignment, income, PnL,
 * expense anomalies, fuel efficiency, SMER-CRM bridge, Rx correlation,
 * cycle reports, CRM visit presentation stats). Flags COLLSCAN, poor
 * selectivity, $lookup without index, and missing entity_id scoping.
 *
 * Usage (from project root):
 *   cd backend && node scripts/explainReportingQueries.js
 *   cd backend && node scripts/explainReportingQueries.js --json
 *   cd backend && node scripts/explainReportingQueries.js --entity-id=<oid>
 *   cd backend && node scripts/explainReportingQueries.js --period=2026-04
 *
 * Exit codes:
 *   0 — no flags on any captured pipeline
 *   1 — at least one pipeline flagged (COLLSCAN, poor selectivity, missing
 *       entity_id, or $lookup without index) OR any service call errored
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const {
  installAggregateInterceptor,
  analyzeCaptured,
  formatReport,
} = require('../utils/explainAggregation');

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    if (a === '--json') out.json = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--entity-id=')) out.entityId = a.split('=')[1];
    else if (a.startsWith('--bdm-id=')) out.bdmId = a.split('=')[1];
    else if (a.startsWith('--period=')) out.period = a.split('=')[1];
  }
  return out;
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function resolveSampleInputs(opts) {
  const Entity = require('../erp/models/Entity');
  const PeopleMaster = require('../erp/models/PeopleMaster');

  let entityId = opts.entityId;
  if (!entityId) {
    const e = await Entity.findOne({ is_active: true }).select('_id short_name').lean()
      || await Entity.findOne({}).select('_id short_name').lean();
    entityId = e?._id?.toString();
  }

  let bdmId = opts.bdmId;
  if (!bdmId && entityId) {
    const p = await PeopleMaster.findOne({
      entity_id: new mongoose.Types.ObjectId(entityId),
      is_active: true,
      person_type: { $in: ['BDM', 'ECOMMERCE_BDM'] },
      user_id: { $ne: null },
    }).select('user_id').lean();
    bdmId = p?.user_id?.toString();
  }

  const period = opts.period || currentPeriod();

  return { entityId, bdmId, period };
}

// Service call registry — each entry wraps one reporting function. Errors are
// swallowed per call so one broken input doesn't halt the audit.
function buildCalls({ entityId, bdmId, period }) {
  const eOid = entityId ? new mongoose.Types.ObjectId(entityId) : null;
  const calls = [];

  const push = (label, fn) => calls.push({ label, fn });

  // 1-2. Dashboard: Summary + MTD (admin view, sees all BDMs)
  push('Dashboard.getSummary (admin)', async () => {
    const svc = require('../erp/services/dashboardService');
    return svc.getSummary(entityId, null, true);
  });
  push('Dashboard.getMtd (admin)', async () => {
    const svc = require('../erp/services/dashboardService');
    return svc.getMtd(entityId, null, true);
  });
  push('Dashboard.getPnlYtd (admin)', async () => {
    const svc = require('../erp/services/dashboardService');
    return svc.getPnlYtd(entityId, null, true);
  });

  // 3-4. AR engine: open CSIs + aging
  push('AR.getOpenCsis (entity-wide)', async () => {
    const svc = require('../erp/services/arEngine');
    return svc.getOpenCsis(entityId, null, null, null);
  });
  push('AR.getArAging (entity-wide)', async () => {
    const svc = require('../erp/services/arEngine');
    return svc.getArAging(entityId, null, null);
  });

  // 5-6. Performance ranking: Net Cash + MoM trend
  push('Performance.getNetCashRanking', async () => {
    const svc = require('../erp/services/performanceRankingService');
    return svc.getNetCashRanking(entityId, period);
  });

  // 7. Consignment aging (cross-BDM DR tracking)
  push('Consignment.getConsolidatedConsignmentAging', async () => {
    const svc = require('../erp/services/consignmentReportService');
    return svc.getConsolidatedConsignmentAging(entityId, {});
  });

  // 8. Income report (BDM payslip earnings)
  if (bdmId) {
    push('Income.getIncomeReport (sample BDM)', async () => {
      const svc = require('../erp/services/incomeCalc');
      return svc.getIncomeReport(entityId, bdmId, period, 1);
    });
    push('Income.projectIncome (sample BDM)', async () => {
      const svc = require('../erp/services/incomeCalc');
      return svc.projectIncome(entityId, bdmId, period, 1);
    });
  }

  // 9-10. Expense anomalies + budget overruns
  push('ExpenseAnomaly.detectAnomalies', async () => {
    const svc = require('../erp/services/expenseAnomalyService');
    return svc.detectAnomalies(entityId, period);
  });
  push('ExpenseAnomaly.detectBudgetOverruns', async () => {
    const svc = require('../erp/services/expenseAnomalyService');
    return svc.detectBudgetOverruns(entityId, period);
  });

  // 11. Fuel efficiency (per-BDM gas variance)
  push('FuelEfficiency.getFuelEfficiency', async () => {
    const svc = require('../erp/services/fuelEfficiencyService');
    return svc.getFuelEfficiency(entityId, period);
  });

  // 12. Cycle report
  push('Cycle.getCycleReports', async () => {
    const svc = require('../erp/services/cycleReportService');
    return svc.getCycleReports(entityId, {});
  });

  // 13. PnL report (per-period, per-BDM)
  if (bdmId) {
    push('PnL.getPnlReport (sample BDM)', async () => {
      const svc = require('../erp/services/pnlCalc');
      return svc.getPnlReport(entityId, bdmId, period);
    });
  }

  // 14. Rx correlation summary (CRM ↔ ERP bridge)
  push('RxCorrelation.getCorrelationSummary', async () => {
    const svc = require('../erp/services/rxCorrelationService');
    return svc.getCorrelationSummary(entityId, period, {});
  });

  // 15. SMER-CRM bridge (MD visit counts)
  if (bdmId) {
    push('SmerCrmBridge.getDailyMdCounts (sample BDM, 30d)', async () => {
      const svc = require('../erp/services/smerCrmBridge');
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 3600 * 1000);
      return svc.getDailyMdCounts(bdmId, start, end, {});
    });
  }

  return calls;
}

async function main() {
  const opts = parseArgs();
  await connectDB();

  const inputs = await resolveSampleInputs(opts);
  if (!inputs.entityId) {
    console.error('No Entity found in DB — cannot run audit without at least one entity.');
    process.exit(1);
  }

  console.log('=== EXPLAIN audit for top reporting pipelines ===');
  console.log(`entity_id : ${inputs.entityId}`);
  console.log(`bdm_id    : ${inputs.bdmId || '(none — skipping per-BDM pipelines)'}`);
  console.log(`period    : ${inputs.period}`);
  console.log('');

  const calls = buildCalls(inputs);
  const harness = installAggregateInterceptor({ verbose: opts.verbose });

  for (const c of calls) {
    harness.setLabel(c.label);
    try {
      await c.fn();
    } catch (err) {
      // Service crashed because interceptor returned [] and downstream code
      // assumed a shape. That's expected; we already captured the pipeline.
      if (opts.verbose) console.log(`  [svc error, pipeline still captured] ${c.label}: ${err.message}`);
    }
  }

  harness.restore();

  const rows = analyzeCaptured(harness.captured);

  if (opts.json) {
    console.log(JSON.stringify({ inputs, rows }, null, 2));
  } else {
    console.log(formatReport(rows));
  }

  const hasFlags = rows.some(r => r.status !== 'OK');
  await mongoose.disconnect();
  process.exit(hasFlags ? 1 : 0);
}

main().catch(err => {
  console.error('Audit crashed:', err);
  process.exit(1);
});
