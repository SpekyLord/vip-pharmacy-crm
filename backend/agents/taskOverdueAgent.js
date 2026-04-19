/**
 * Task Overdue Agent (#TO) — Phase G9.R1
 *
 * Scans every active entity for OPEN / IN_PROGRESS / BLOCKED tasks whose
 * `due_date` has passed. For each overdue task it fires a `notifyTaskEvent`
 * with event='overdue', which lands in the assignee's TASKS folder of the
 * unified inbox (via dispatchMultiChannel — email + in-app + SMS opt-in,
 * NOTIFICATION_CHANNELS / NotificationPreference are honoured).
 *
 * Type: FREE (rule-based — no AI cost, no Anthropic key required).
 * Schedule: weekdays 06:15 Manila — fires after Treasury (05:30) and before
 *   Inventory Reorder (06:30) so the morning briefing window stays clean.
 *
 * Dedup / cooldown:
 *   The agent reads the per-entity `TASK_OVERDUE_COOLDOWN_DAYS` lookup
 *   (default GLOBAL row = 1 day) and skips tasks whose
 *   `last_overdue_notify_at` is newer than (now - cooldownDays * 24h).
 *   On a successful notify the field is stamped via `Task.updateOne`.
 *   Entities can change cooldown via Control Center → Lookup Tables;
 *   no code deploy required (Rule #3 lookup-driven).
 *
 * Subscriber posture: zero hardcoded thresholds. The cooldown lookup
 * lazy-seeds on first run when missing; in-memory `DEFAULT_COOLDOWN_DAYS`
 * is the last-resort fallback so a brand-new entity still gets a single
 * notification per overdue task per day.
 *
 * Returned summary follows the agentExecutor contract:
 *   { status, summary: { bdms_processed, alerts_generated, alerts_suppressed,
 *                       messages_sent, key_findings: [...] }, error_msg, message_ids,
 *     execution_ms }
 *   - bdms_processed = unique assignees scanned this run
 *   - alerts_generated = total overdue tasks found (incl. suppressed)
 *   - alerts_suppressed = skipped due to cooldown
 *   - messages_sent = notifyTaskEvent calls dispatched
 */

'use strict';

const Entity = require('../erp/models/Entity');
const Lookup = require('../erp/models/Lookup');
const Task = require('../erp/models/Task');
const { notifyTaskEvent } = require('../erp/services/erpNotificationService');

const DEFAULT_COOLDOWN_DAYS = 1;
const SAFETY_TASK_LIMIT_PER_ENTITY = 500; // hard cap to avoid runaway runs

/**
 * Read TASK_OVERDUE_COOLDOWN_DAYS for the entity. GLOBAL row applies to all
 * tasks. A 0 day value disables dedup (notify every run — useful only for
 * test environments). Negative numbers are clamped to the default.
 */
async function loadCooldownDays(entityId) {
  if (!entityId) return DEFAULT_COOLDOWN_DAYS;
  try {
    const row = await Lookup.findOne({
      entity_id: entityId,
      category: 'TASK_OVERDUE_COOLDOWN_DAYS',
      code: 'GLOBAL',
      is_active: true,
    }).select('metadata').lean();
    if (!row) {
      // Lazy-seed GLOBAL row so admin can edit it in Control Center next time.
      try {
        await Lookup.updateOne(
          { entity_id: entityId, category: 'TASK_OVERDUE_COOLDOWN_DAYS', code: 'GLOBAL' },
          {
            $setOnInsert: {
              label: 'Cooldown days between overdue notifications for the same task',
              sort_order: 0,
              is_active: true,
              metadata: { days: DEFAULT_COOLDOWN_DAYS, value: DEFAULT_COOLDOWN_DAYS },
            },
          },
          { upsert: true }
        );
      } catch (err) {
        // 11000 (duplicate) is fine — another concurrent run already seeded it.
        if (err.code !== 11000) {
          console.warn('[taskOverdueAgent] cooldown seed failed:', err.message);
        }
      }
      return DEFAULT_COOLDOWN_DAYS;
    }
    const raw = Number(row.metadata?.days ?? row.metadata?.value);
    if (!Number.isFinite(raw) || raw < 0) return DEFAULT_COOLDOWN_DAYS;
    return raw;
  } catch (err) {
    console.warn('[taskOverdueAgent] loadCooldownDays failed:', err.message);
    return DEFAULT_COOLDOWN_DAYS;
  }
}

/**
 * Build the actor name for the notification body. The notification reads
 * "X marked your task overdue" so a friendly system label keeps the inbox
 * row scannable.
 */
function actorName() {
  return 'Task Overdue Agent';
}

/**
 * Run entry point — standard agent signature called by agentExecutor.
 * Receives `{ triggerSource, runId, entity_id?, ignore_cooldown? }`.
 */
async function run(args = {}) {
  const startTime = Date.now();
  const entityFilter = { status: 'ACTIVE' };
  if (args.entity_id) entityFilter._id = args.entity_id;

  const entities = await Entity.find(entityFilter).select('_id entity_name short_name').lean();
  if (entities.length === 0) {
    return {
      status: 'success',
      summary: {
        bdms_processed: 0,
        alerts_generated: 0,
        alerts_suppressed: 0,
        messages_sent: 0,
        key_findings: ['No active entities'],
      },
      error_msg: null,
      message_ids: [],
      execution_ms: Date.now() - startTime,
    };
  }

  const ignoreCooldown = !!args.ignore_cooldown;
  const now = new Date();
  let bdmsProcessed = 0;
  let alertsGenerated = 0;
  let alertsSuppressed = 0;
  let messagesSent = 0;
  const errors = [];
  const findings = [];
  const seenAssignees = new Set();

  for (const entity of entities) {
    try {
      const cooldownDays = await loadCooldownDays(entity._id);
      const cooldownMs = Math.max(0, cooldownDays) * 24 * 60 * 60 * 1000;
      const cooldownSince = cooldownMs > 0 ? new Date(now.getTime() - cooldownMs) : null;

      // Pull every overdue task for this entity. Sort by oldest-due first so
      // the most stale items get notified first when SAFETY_TASK_LIMIT trips.
      const overdueTasks = await Task.find({
        entity_id: entity._id,
        status: { $in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] },
        due_date: { $ne: null, $lt: now },
        assignee_user_id: { $ne: null },
      })
        .sort({ due_date: 1 })
        .limit(SAFETY_TASK_LIMIT_PER_ENTITY)
        .select('_id title priority due_date assignee_user_id created_by last_overdue_notify_at')
        .lean();

      let entityFiredCount = 0;
      let entitySuppressedCount = 0;

      for (const task of overdueTasks) {
        alertsGenerated++;
        seenAssignees.add(String(task.assignee_user_id));

        // Cooldown gate (skipped when explicitly disabled via ignore_cooldown).
        if (cooldownSince && task.last_overdue_notify_at && task.last_overdue_notify_at > cooldownSince && !ignoreCooldown) {
          alertsSuppressed++;
          entitySuppressedCount++;
          continue;
        }

        // Stamp the dedup field BEFORE dispatching. If the notify fails the
        // field is still set — the next run will re-attempt after cooldown
        // expires. Better than firing twice: an extra missed alert is
        // recoverable; spam is not.
        try {
          await Task.updateOne(
            { _id: task._id },
            { $set: { last_overdue_notify_at: now } }
          );
        } catch (stampErr) {
          console.warn('[taskOverdueAgent] stamp failed:', stampErr.message);
          continue;
        }

        try {
          await notifyTaskEvent({
            entityId: entity._id,
            event: 'overdue',
            recipientUserId: task.assignee_user_id,
            actorName: actorName(),
            taskId: task._id,
            taskTitle: task.title,
            dueDate: task.due_date,
            priority: task.priority,
          });
          messagesSent++;
          entityFiredCount++;
        } catch (notifyErr) {
          // Notification failure is non-fatal but we surface in findings.
          console.warn('[taskOverdueAgent] notify failed:', notifyErr.message);
          errors.push(`task ${task._id}: ${notifyErr.message}`);
        }
      }

      findings.push(
        `${entity.short_name || entity.entity_name}: ${overdueTasks.length} overdue, ` +
        `${entityFiredCount} notified, ${entitySuppressedCount} suppressed (cooldown ${cooldownDays}d)`
      );
    } catch (err) {
      console.error(`[taskOverdueAgent] Entity ${entity._id} failed:`, err.message);
      errors.push(`${entity.short_name || entity.entity_name}: ${err.message}`);
    }
  }

  bdmsProcessed = seenAssignees.size;

  const summary = {
    bdms_processed: bdmsProcessed,
    alerts_generated: alertsGenerated,
    alerts_suppressed: alertsSuppressed,
    messages_sent: messagesSent,
    key_findings: [
      `Assignees with overdue tasks: ${bdmsProcessed}`,
      `Overdue tasks scanned: ${alertsGenerated} (notified ${messagesSent}; cooldown-suppressed ${alertsSuppressed})`,
      ...findings.slice(0, 5),
      ...(errors.length > 0 ? [`Errors: ${errors.length} — ${errors.slice(0, 2).join(' | ')}`] : []),
    ],
  };

  return {
    status: errors.length > 0 && messagesSent === 0 ? 'error' : (errors.length > 0 ? 'partial' : 'success'),
    summary,
    error_msg: errors.length > 0 ? errors.slice(0, 5).join(' | ') : null,
    message_ids: [],
    execution_ms: Date.now() - startTime,
  };
}

module.exports = { run };
