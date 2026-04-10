const { ROLES } = require('../../constants/roles');
const AgentRun = require('../models/AgentRun');
const AgentConfig = require('../models/AgentConfig');
const { catchAsync } = require('../../middleware/errorHandler');
const { startManualAgentRun } = require('../../agents/agentExecutor');

// Agent key -> module path mapping
const AGENT_MODULES = {
  expense_anomaly: '../../agents/expenseAnomalyAgent',
  inventory_reorder: '../../agents/inventoryReorderAgent',
  credit_risk: '../../agents/creditRiskAgent',
  document_expiry: '../../agents/documentExpiryAgent',
  visit_compliance: '../../agents/visitComplianceAgent',
  photo_audit: '../../agents/photoAuditAgent',
  smart_collection: '../../agents/smartCollectionAgent',
  bir_filing: '../../agents/birFilingAgent',
  performance_coach: '../../agents/performanceCoachAgent',
  visit_planner: '../../agents/visitPlannerAgent',
  engagement_decay: '../../agents/engagementDecayAgent',
  org_intelligence: '../../agents/orgIntelligenceAgent',
  system_integrity: '../../agents/systemIntegrityAgent',
};

/**
 * Agent Intelligence Controller - serves agent run history, stats, and on-demand triggers.
 */

// List recent agent runs (paginated, filterable)
exports.listRuns = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.agent_key) filter.agent_key = req.query.agent_key;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.run_date = {};
    if (req.query.from) filter.run_date.$gte = new Date(req.query.from);
    if (req.query.to) filter.run_date.$lte = new Date(req.query.to);
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [runs, total] = await Promise.all([
    AgentRun.find(filter).sort({ run_date: -1 }).skip(skip).limit(limit).lean(),
    AgentRun.countDocuments(filter),
  ]);

  res.json({ success: true, data: runs, pagination: { page, limit, total } });
});

// Aggregate stats - last run per agent, success rates, totals
exports.getStats = catchAsync(async (req, res) => {
  const [agentStats, recentRuns] = await Promise.all([
    AgentRun.aggregate([
      { $sort: { run_date: -1 } },
      {
        $group: {
          _id: '$agent_key',
          label: { $first: '$agent_label' },
          last_run: { $first: '$run_date' },
          last_status: { $first: '$status' },
          last_summary: { $first: '$summary' },
          total_runs: { $sum: 1 },
          success_count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
          total_alerts: { $sum: '$summary.alerts_generated' },
          total_messages: { $sum: '$summary.messages_sent' },
        },
      },
      { $sort: { last_run: -1 } },
    ]),
    AgentRun.find().sort({ run_date: -1 }).limit(5).lean(),
  ]);

  res.json({
    success: true,
    data: {
      agents: agentStats,
      recent_runs: recentRuns,
    },
  });
});

// Run agent on-demand
exports.runAgent = catchAsync(async (req, res) => {
  const { agentKey } = req.params;

  if (!AGENT_MODULES[agentKey]) {
    return res.status(400).json({ success: false, message: `Unknown agent: ${agentKey}` });
  }

  const runRequest = await startManualAgentRun(agentKey);

  if (!runRequest.started && runRequest.reason === 'already_running') {
    return res.status(409).json({
      success: false,
      message: `Agent "${agentKey}" is already running`,
    });
  }

  if (!runRequest.started) {
    return res.status(400).json({
      success: false,
      message: `Agent "${agentKey}" could not be started${runRequest.reason ? `: ${runRequest.reason}` : ''}`,
    });
  }

  return res.status(202).json({
    success: true,
    message: `Agent "${agentKey}" started in background`,
    data: runRequest.run,
  });
});

exports.getConfig = catchAsync(async (req, res) => {
  const configs = await AgentConfig.find().sort({ agent_key: 1 }).lean();

  // Merge with known agents to show all agents even if no config exists
  const merged = Object.entries(AGENT_MODULES).map(([key]) => {
    const existing = configs.find((config) => config.agent_key === key);
    return existing || { agent_key: key, enabled: true, schedule: null, notify_roles: [ROLES.PRESIDENT] };
  });

  res.json({ success: true, data: merged });
});

exports.updateConfig = catchAsync(async (req, res) => {
  const { agentKey } = req.params;
  const { enabled, notify_roles } = req.body;

  if (!AGENT_MODULES[agentKey]) {
    return res.status(400).json({ success: false, message: `Unknown agent: ${agentKey}` });
  }

  const config = await AgentConfig.findOneAndUpdate(
    { agent_key: agentKey },
    { $set: { enabled, notify_roles, updated_by: req.user._id } },
    { new: true, upsert: true, runValidators: true }
  );

  res.json({ success: true, data: config });
});
