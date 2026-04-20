/**
 * dailyBriefingAgent — Phase G7.9
 *
 * Reuses the President's Copilot infrastructure to compose a morning briefing.
 * Zero new Claude prompt-engineering — the prompt lives in the lookup row
 * AI_COWORK_FEATURES/PRESIDENT_DAILY_BRIEFING.metadata.user_template (admin
 * editable, Mustache placeholders).
 *
 * Flow:
 *   1) For each entity that has both PRESIDENT_COPILOT and PRESIDENT_DAILY_BRIEFING
 *      enabled, find the entity's president user.
 *   2) Render the user_template with {{date}} + {{entity_name}} placeholders.
 *   3) Call copilotService.runChat as that president user. The chat loop will
 *      automatically use COPILOT_TOOLS (LIST_PENDING_APPROVALS, SUMMARIZE_MODULE,
 *      COMPARE_ENTITIES, ...) to gather facts.
 *   4) Post the assistant reply to MessageInbox (category: 'briefing').
 *
 * Spend: counts toward the same AI_SPEND_CAPS as interactive Copilot calls.
 *
 * Entry point matches agentExecutor's contract: exports `run({ ... })` →
 *   { status, summary, message_ids?, error_msg? }
 */
'use strict';

const Lookup = require('../erp/models/Lookup');
const User = require('../models/User');
const MessageInbox = require('../models/MessageInbox');
const { runChat } = require('../erp/services/copilotService');
const { logInfo, logWarn } = require('../utils/logger');

const FEATURE_CODE = 'PRESIDENT_DAILY_BRIEFING';

function renderTemplate(template, vars = {}) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

async function getEnabledEntities() {
  // We need entity_ids where BOTH PRESIDENT_COPILOT and PRESIDENT_DAILY_BRIEFING are active
  const copilotRows = await Lookup.find({
    category: 'AI_COWORK_FEATURES', code: 'PRESIDENT_COPILOT', is_active: true,
  }).select('entity_id').lean();
  const briefingRows = await Lookup.find({
    category: 'AI_COWORK_FEATURES', code: FEATURE_CODE, is_active: true,
  }).select('entity_id metadata').lean();

  const copilotEntityIds = new Set(copilotRows.map((r) => String(r.entity_id)));
  return briefingRows.filter((r) => copilotEntityIds.has(String(r.entity_id)));
}

async function findPresidentUserForEntity(entityId) {
  // Prefer a user with role=president whose entity_id (or entity_ids) includes this one
  const user = await User.findOne({
    role: { $in: ['president', 'ceo'] },
    $or: [
      { entity_id: entityId },
      { entity_ids: entityId },
    ],
  }).select('_id name full_name role entity_id entity_ids').lean();
  return user || null;
}

async function postBriefingMessage({ entityId, recipient, title, body }) {
  // Phase G9.R2 — entity_id + folder so the briefing surfaces in the
  // recipient's "AI Agents" folder of the unified inbox (Phase G9.A).
  return MessageInbox.create({
    senderName: 'Daily Briefing',
    senderRole: 'system',
    senderUserId: null,
    title,
    body,
    category: 'briefing',
    priority: 'normal',
    recipientRole: recipient.role,
    recipientUserId: recipient._id,
    entity_id: entityId || recipient.entity_id || null,
    folder: 'AI_AGENT_REPORTS',
  });
}

async function runForEntity(briefingRow) {
  const entityId = briefingRow.entity_id;
  const md = briefingRow.metadata || {};
  const president = await findPresidentUserForEntity(entityId);
  if (!president) return { ok: false, reason: 'no_president_user', entityId };

  const Entity = require('../erp/models/Entity');
  const entity = await Entity.findById(entityId).select('name short_name').lean();
  const entityName = entity?.name || entity?.short_name || String(entityId);
  const today = new Date().toISOString().slice(0, 10);

  const userPrompt = renderTemplate(md.user_template || 'Generate the {{date}} morning briefing for {{entity_name}}.', {
    date: today,
    entity_name: entityName,
  });

  const chatUser = {
    _id: president._id,
    name: president.full_name || president.name,
    full_name: president.full_name || president.name,
    role: president.role,
    entity_id: entityId,
    entity_ids: president.entity_ids || [entityId],
  };

  let result;
  try {
    result = await runChat({
      entityId,
      user: chatUser,
      entityIds: chatUser.entity_ids,
      messages: [{ role: 'user', content: userPrompt }],
      mode: 'normal',
    });
  } catch (e) {
    return { ok: false, reason: e.message, entityId };
  }

  const body = result?.reply || '(no reply)';
  const message = await postBriefingMessage({
    entityId,
    recipient: president,
    title: `☀️ Daily Briefing — ${today}`,
    body,
  });

  return { ok: true, entityId, recipient: president._id, messageId: message._id, cost: result?.usage?.cost_usd };
}

async function run() {
  const startTs = Date.now();
  let success = 0, failed = 0;
  const messageIds = [];
  const findings = [];

  let rows;
  try {
    rows = await getEnabledEntities();
  } catch (e) {
    logWarn('daily_briefing_lookup_query_failed', { error: e.message });
    return {
      status: 'error', summary: { entities: 0 }, message_ids: [],
      error_msg: `Lookup query failed: ${e.message}`,
    };
  }

  if (!rows.length) {
    return {
      status: 'success',
      summary: { bdms_processed: 0, alerts_generated: 0, messages_sent: 0, key_findings: ['No entities have PRESIDENT_DAILY_BRIEFING enabled.'] },
    };
  }

  for (const row of rows) {
    const r = await runForEntity(row);
    if (r.ok) {
      success++;
      messageIds.push(r.messageId);
      findings.push(`✓ ${String(r.entityId).slice(-6)} → message ${String(r.messageId).slice(-6)} ($${(r.cost || 0).toFixed(4)})`);
    } else {
      failed++;
      findings.push(`✗ ${String(r.entityId).slice(-6)} → ${r.reason}`);
    }
  }

  logInfo('daily_briefing_run_completed', {
    success, failed, totalMs: Date.now() - startTs,
  });

  return {
    status: failed === 0 ? 'success' : (success > 0 ? 'partial' : 'error'),
    summary: {
      bdms_processed: success + failed,
      alerts_generated: success,
      messages_sent: success,
      key_findings: findings.slice(0, 10),
    },
    message_ids: messageIds,
  };
}

module.exports = { run };
