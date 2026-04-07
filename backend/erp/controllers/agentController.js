const AgentRun = require('../models/AgentRun');
const { catchAsync } = require('../../middleware/errorHandler');

// Agent key → module path mapping
const AGENT_MODULES = {
  expense_anomaly:   '../../agents/expenseAnomalyAgent',
  inventory_reorder: '../../agents/inventoryReorderAgent',
  credit_risk:       '../../agents/creditRiskAgent',
  document_expiry:   '../../agents/documentExpiryAgent',
  visit_compliance:  '../../agents/visitComplianceAgent',
  photo_audit:       '../../agents/photoAuditAgent',
  smart_collection:  '../../agents/smartCollectionAgent',
  bir_filing:        '../../agents/birFilingAgent',
  performance_coach: '../../agents/performanceCoachAgent',
  visit_planner:     '../../agents/visitPlannerAgent',
  engagement_decay:  '../../agents/engagementDecayAgent',
  org_intelligence:  '../../agents/orgIntelligenceAgent',
  system_integrity:  '../../agents/systemIntegrityAgent',
};

const AI_AGENTS = new Set(['smart_collection', 'bir_filing', 'performance_coach', 'visit_planner', 'engagement_decay', 'org_intelligence']);

/**
 * Agent Intelligence Controller — serves agent run history, stats, and on-demand triggers.
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

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [runs, total] = await Promise.all([
    AgentRun.find(filter).sort({ run_date: -1 }).skip(skip).limit(limit).lean(),
    AgentRun.countDocuments(filter)
  ]);

  res.json({ success: true, data: runs, pagination: { page, limit, total } });
});

// Aggregate stats — last run per agent, success rates, totals
exports.getStats = catchAsync(async (req, res) => {
  const [agentStats, recentRuns] = await Promise.all([
    AgentRun.aggregate([
      { $sort: { run_date: -1 } },
      { $group: {
        _id: '$agent_key',
        label: { $first: '$agent_label' },
        last_run: { $first: '$run_date' },
        last_status: { $first: '$status' },
        last_summary: { $first: '$summary' },
        total_runs: { $sum: 1 },
        success_count: { $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] } },
        total_alerts: { $sum: '$summary.alerts_generated' },
        total_messages: { $sum: '$summary.messages_sent' }
      }},
      { $sort: { last_run: -1 } }
    ]),
    AgentRun.find().sort({ run_date: -1 }).limit(5).lean()
  ]);

  res.json({
    success: true,
    data: {
      agents: agentStats,
      recent_runs: recentRuns
    }
  });
});

// ═══ Run Agent On-Demand ═══

// Track running agents to prevent double-runs
const _running = new Set();

exports.runAgent = catchAsync(async (req, res) => {
  const { agentKey } = req.params;

  if (!AGENT_MODULES[agentKey]) {
    return res.status(400).json({ success: false, message: `Unknown agent: ${agentKey}` });
  }

  if (AI_AGENTS.has(agentKey) && !process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ success: false, message: `Agent "${agentKey}" requires ANTHROPIC_API_KEY to be set` });
  }

  if (_running.has(agentKey)) {
    return res.status(409).json({ success: false, message: `Agent "${agentKey}" is already running` });
  }

  _running.add(agentKey);
  const start = Date.now();

  try {
    const { run } = require(AGENT_MODULES[agentKey]);
    await run();
    _running.delete(agentKey);

    // Get the latest run record this agent just created
    const latestRun = await AgentRun.findOne({ agent_key: agentKey }).sort({ run_date: -1 }).lean();

    res.json({
      success: true,
      message: `Agent "${agentKey}" completed in ${Date.now() - start}ms`,
      data: latestRun
    });
  } catch (err) {
    _running.delete(agentKey);
    res.status(500).json({
      success: false,
      message: `Agent "${agentKey}" failed: ${err.message}`
    });
  }
});

// ═══ Agent Config ═══

const AgentConfig = require('../models/AgentConfig');

exports.getConfig = catchAsync(async (req, res) => {
  const configs = await AgentConfig.find().sort({ agent_key: 1 }).lean();

  // Merge with known agents to show all agents even if no config exists
  const merged = Object.entries(AGENT_MODULES).map(([key]) => {
    const existing = configs.find(c => c.agent_key === key);
    return existing || { agent_key: key, enabled: true, schedule: null, notify_roles: ['president'] };
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
