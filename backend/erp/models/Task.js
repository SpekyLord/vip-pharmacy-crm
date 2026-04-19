/**
 * Task Model — Phase G8 (P2-9)
 *
 * Proper task collection (not a MessageInbox extension) so future Gantt/Kanban
 * views have a clean data shape. Used by:
 *   - Copilot CREATE_TASK tool (write_confirm)
 *   - Copilot LIST_OVERDUE_ITEMS tool (read)
 *   - Future: Gantt timeline, Kanban board
 *
 * Entity-scoped (Rule #21): every task carries entity_id derived from
 * req.entityId on create — never accepted from the client body.
 *
 * Subscription-safe: no hardcoded priorities/statuses — those come from the
 * enum list below which subscribers can extend via PR if they really need a
 * new state. Day-to-day delegation uses assignee_user_id only.
 */
'use strict';

const mongoose = require('mongoose');

const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const taskSchema = new mongoose.Schema(
  {
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },

    // Assignee — the person the task is FOR. Null = unassigned (admin can
    // re-assign later). A user can see their own tasks via assignee_user_id;
    // the creator sees everything they created via created_by.
    assignee_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },

    // Creator — the user who created the task (typically President via Copilot
    // CREATE_TASK). Immutable after create.
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    due_date: { type: Date, default: null, index: true },

    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: 'normal',
      index: true,
    },

    status: {
      type: String,
      enum: TASK_STATUSES,
      default: 'OPEN',
      index: true,
    },

    // Nested tasks — parent_task_id points up the tree; sub_tasks[] is an
    // inline cache of child ids for fast read without a second query. Keep
    // sub_tasks bounded (≤50) — deep trees should use parent_task_id only.
    parent_task_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      default: null,
      index: true,
    },
    sub_tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],

    // Optional linkage back to the document that spawned this task (e.g. an
    // overdue approval → "chase Juan to submit"). Opaque — renderers use
    // source_module to resolve a link target.
    source_module: { type: String, trim: true, default: null },
    source_doc_id: { type: mongoose.Schema.Types.ObjectId, default: null },

    // Completion trail
    completed_at: { type: Date, default: null },
    completed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Track when a task was first surfaced to the assignee for SLA tooling.
    // Set by the CREATE_TASK handler after push notification is dispatched.
    notified_at: { type: Date, default: null },
  },
  { timestamps: true, collection: 'erp_tasks' }
);

// Hot paths: "what's overdue for me", "all my open tasks"
taskSchema.index({ entity_id: 1, assignee_user_id: 1, status: 1, due_date: 1 });
taskSchema.index({ entity_id: 1, created_by: 1, status: 1, createdAt: -1 });
// LIST_OVERDUE_ITEMS scans by due_date < now AND status in {OPEN, IN_PROGRESS}
taskSchema.index({ entity_id: 1, status: 1, due_date: 1 });

taskSchema.statics.TASK_STATUSES = TASK_STATUSES;
taskSchema.statics.TASK_PRIORITIES = TASK_PRIORITIES;

module.exports = mongoose.models.Task || mongoose.model('Task', taskSchema);
