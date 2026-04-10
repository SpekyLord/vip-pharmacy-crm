const AgentRun = require('../erp/models/AgentRun');
const AgentConfig = require('../erp/models/AgentConfig');
const { getAgentDefinition } = require('./agentRegistry');
const { logError, logInfo, logWarn } = require('../utils/logger');

const RUN_LOCK_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeSummary(summary = {}) {
  return {
    bdms_processed: Number(summary.bdms_processed) || 0,
    alerts_generated: Number(summary.alerts_generated) || 0,
    messages_sent: Number(summary.messages_sent) || 0,
    key_findings: Array.isArray(summary.key_findings)
      ? summary.key_findings.filter(Boolean).slice(0, 10)
      : [],
  };
}

function normalizeMessageIds(messageIds = []) {
  return (Array.isArray(messageIds) ? messageIds : [])
    .map((id) => {
      if (!id) return null;
      if (typeof id === 'string') return id;
      if (typeof id.toString === 'function') return id.toString();
      return null;
    })
    .filter(Boolean);
}

function formatAgentError(err) {
  if (!err) return 'Unknown agent error';
  if (err.response?.data?.message) return err.response.data.message;
  if (err.error?.message) return err.error.message;
  if (err.message) return err.message;
  return String(err);
}

async function ensureAgentConfig(agentKey) {
  try {
    await AgentConfig.findOneAndUpdate(
      { agent_key: agentKey },
      { $setOnInsert: { agent_key: agentKey } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }

  return AgentConfig.findOne({ agent_key: agentKey }).lean();
}

async function releaseLock(agentKey, finishedAt = new Date()) {
  await AgentConfig.findOneAndUpdate(
    { agent_key: agentKey },
    {
      $set: {
        is_running: false,
        last_finished_at: finishedAt,
      },
      $unset: {
        current_run_id: '',
        run_lock_until: '',
      },
    }
  );
}

async function prepareAgentRun(agentKey, { triggerSource = 'manual', args = {} } = {}) {
  const definition = getAgentDefinition(agentKey);
  if (!definition) {
    const err = new Error(`Unknown agent: ${agentKey}`);
    err.statusCode = 400;
    throw err;
  }

  const existingConfig = await ensureAgentConfig(agentKey);
  if (triggerSource === 'scheduled' && existingConfig?.enabled === false) {
    return { started: false, reason: 'disabled', definition };
  }

  const now = new Date();
  const lockUntil = new Date(now.getTime() + RUN_LOCK_TTL_MS);
  const lockedConfig = await AgentConfig.findOneAndUpdate(
    {
      agent_key: agentKey,
      $or: [
        { is_running: { $ne: true } },
        { run_lock_until: { $lte: now } },
        { run_lock_until: { $exists: false } },
      ],
    },
    {
      $set: {
        is_running: true,
        last_started_at: now,
        run_lock_until: lockUntil,
      },
    },
    { new: true }
  );

  if (!lockedConfig) {
    return { started: false, reason: 'already_running', definition };
  }

  let runRecord;
  try {
    runRecord = await AgentRun.create({
      agent_key: agentKey,
      agent_label: definition.label,
      status: 'running',
      trigger_source: triggerSource,
      run_date: now,
      summary: normalizeSummary(),
    });

    await AgentConfig.findOneAndUpdate(
      { agent_key: agentKey },
      { $set: { current_run_id: runRecord._id } }
    );
  } catch (err) {
    await releaseLock(agentKey, new Date());
    throw err;
  }

  return {
    started: true,
    agentKey,
    definition,
    triggerSource,
    args,
    run: runRecord.toObject(),
  };
}

async function finalizeRun(runContext, result, executionMs) {
  const finishedAt = new Date();
  const runRecord = await AgentRun.findByIdAndUpdate(
    runContext.run._id,
    {
      $set: {
        status: result?.status || 'success',
        summary: normalizeSummary(result?.summary),
        error_msg: result?.error_msg || null,
        message_ids: normalizeMessageIds(result?.message_ids),
        execution_ms: executionMs,
      },
    },
    { new: true }
  ).lean();

  await releaseLock(runContext.agentKey, finishedAt);
  return runRecord;
}

async function executePreparedRun(runContext) {
  const startTime = Date.now();

  try {
    const agentModule = require(runContext.definition.modulePath);
    if (typeof agentModule.run !== 'function') {
      throw new Error(`Agent "${runContext.agentKey}" does not export run()`);
    }

    const rawResult = await agentModule.run({
      ...runContext.args,
      triggerSource: runContext.triggerSource,
      runId: runContext.run._id.toString(),
    });

    return finalizeRun(
      runContext,
      {
        status: ['success', 'partial', 'error'].includes(rawResult?.status) ? rawResult.status : 'success',
        summary: rawResult?.summary || {},
        message_ids: rawResult?.message_ids || [],
        error_msg: rawResult?.error_msg || null,
      },
      Date.now() - startTime
    );
  } catch (err) {
    const errorMsg = formatAgentError(err);
    logWarn('agent_execution_failed', {
      agentKey: runContext.agentKey,
      triggerSource: runContext.triggerSource,
      error: errorMsg,
    });

    return finalizeRun(
      runContext,
      {
        status: 'error',
        summary: {},
        message_ids: [],
        error_msg: errorMsg,
      },
      Date.now() - startTime
    );
  }
}

async function startManualAgentRun(agentKey, args = {}) {
  const runContext = await prepareAgentRun(agentKey, { triggerSource: 'manual', args });
  if (!runContext.started) return runContext;

  setImmediate(() => {
    executePreparedRun(runContext)
      .then((runRecord) => {
        logInfo('manual_agent_run_completed', {
          agentKey,
          status: runRecord?.status,
          runId: runRecord?._id?.toString?.() || runContext.run._id.toString(),
        });
      })
      .catch((err) => {
        logError('manual_agent_run_unhandled_failure', {
          agentKey,
          error: formatAgentError(err),
        });
      });
  });

  return runContext;
}

async function runScheduledAgent(agentKey, args = {}) {
  const runContext = await prepareAgentRun(agentKey, { triggerSource: 'scheduled', args });
  if (!runContext.started) return runContext;
  return executePreparedRun(runContext);
}

module.exports = {
  RUN_LOCK_TTL_MS,
  normalizeSummary,
  formatAgentError,
  startManualAgentRun,
  runScheduledAgent,
  prepareAgentRun,
  executePreparedRun,
};
