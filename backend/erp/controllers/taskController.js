/**
 * Task Controller — Phase G8 (P2-9)
 *
 * Endpoints mounted at /api/erp/tasks:
 *   GET    /           — list tasks (scoped: default = mine + created-by-me; ?all=1 for privileged)
 *   GET    /overdue    — overdue tasks (backing LIST_OVERDUE_ITEMS tool)
 *   POST   /           — create task (backing CREATE_TASK tool; also usable from UI)
 *   PATCH  /:id        — update status/priority/due_date/description/assignee
 *   DELETE /:id        — delete (owner or privileged only)
 *
 * Rule #21: entity_id derived from req.entityId, never from body.
 * Rule #20: tasks are not financial documents; no gateApproval / period locks.
 */
'use strict';

const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../../models/User');
const { catchAsync } = require('../../middleware/errorHandler');

const PRIVILEGED_ROLES = ['president', 'ceo', 'admin', 'finance'];
function isPrivileged(role) {
  return PRIVILEGED_ROLES.includes(String(role || '').toLowerCase());
}

function sanitizeTitle(v) {
  return String(v || '').trim().slice(0, 200);
}
function sanitizeBody(v) {
  return String(v || '').trim().slice(0, 5000);
}

// ── GET /api/erp/tasks ──────────────────────────────────────────────────────
const listTasks = catchAsync(async (req, res) => {
  const {
    status,
    assignee,         // user id or 'me' or 'unassigned'
    scope,            // 'mine' (default) | 'created' | 'all' (privileged)
    priority,
    overdue_only,
    limit = 50,
    page = 1,
  } = req.query;

  const filter = { entity_id: req.entityId };
  if (status) filter.status = String(status).toUpperCase();
  if (priority) filter.priority = String(priority).toLowerCase();

  const me = req.user._id;
  const effectiveScope = (scope || 'mine').toLowerCase();

  if (effectiveScope === 'all') {
    if (!isPrivileged(req.user.role)) {
      return res.status(403).json({ success: false, message: 'scope=all requires privileged role' });
    }
  } else if (effectiveScope === 'created') {
    filter.created_by = me;
  } else {
    // 'mine' — tasks the current user owns or created
    filter.$or = [{ assignee_user_id: me }, { created_by: me }];
  }

  if (assignee === 'me') filter.assignee_user_id = me;
  else if (assignee === 'unassigned') filter.assignee_user_id = null;
  else if (assignee && mongoose.isValidObjectId(assignee)) {
    filter.assignee_user_id = new mongoose.Types.ObjectId(assignee);
  }

  if (String(overdue_only || '').toLowerCase() === 'true') {
    filter.due_date = { $lt: new Date() };
    filter.status = { $in: ['OPEN', 'IN_PROGRESS'] };
  }

  const cap = Math.min(Number(limit) || 50, 200);
  const skip = (Math.max(1, Number(page) || 1) - 1) * cap;

  const [items, total] = await Promise.all([
    Task.find(filter)
      .sort({ due_date: 1, priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(cap)
      .populate('assignee_user_id', 'name full_name email role')
      .populate('created_by', 'name full_name email role')
      .lean(),
    Task.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page: Number(page) || 1, limit: cap, total },
  });
});

// ── GET /api/erp/tasks/overdue ──────────────────────────────────────────────
const listOverdue = catchAsync(async (req, res) => {
  const { assignee } = req.query;
  const now = new Date();
  const filter = {
    entity_id: req.entityId,
    status: { $in: ['OPEN', 'IN_PROGRESS'] },
    due_date: { $lt: now, $ne: null },
  };
  if (assignee === 'me' || !isPrivileged(req.user.role)) {
    filter.assignee_user_id = req.user._id;
  } else if (assignee && mongoose.isValidObjectId(assignee)) {
    filter.assignee_user_id = new mongoose.Types.ObjectId(assignee);
  }

  const items = await Task.find(filter)
    .sort({ due_date: 1 })
    .limit(100)
    .populate('assignee_user_id', 'name full_name email role')
    .populate('created_by', 'name full_name email role')
    .lean();

  res.json({ success: true, data: items, count: items.length });
});

// ── POST /api/erp/tasks ─────────────────────────────────────────────────────
const createTask = catchAsync(async (req, res) => {
  const {
    title,
    description,
    assignee_user_id,
    due_date,
    priority,
    parent_task_id,
    source_module,
    source_doc_id,
  } = req.body;

  if (!title || !sanitizeTitle(title)) {
    return res.status(400).json({ success: false, message: 'title is required' });
  }

  // Validate assignee belongs to a user we can see (sanity — no cross-entity
  // targeting by accident). Null is fine (unassigned).
  let assigneeId = null;
  if (assignee_user_id && mongoose.isValidObjectId(assignee_user_id)) {
    const u = await User.findById(assignee_user_id).select('_id').lean();
    if (!u) return res.status(400).json({ success: false, message: 'assignee not found' });
    assigneeId = u._id;
  }

  // Parent task — must belong to same entity
  let parentId = null;
  if (parent_task_id && mongoose.isValidObjectId(parent_task_id)) {
    const p = await Task.findOne({ _id: parent_task_id, entity_id: req.entityId }).select('_id sub_tasks').lean();
    if (!p) return res.status(400).json({ success: false, message: 'parent_task_id not found in this entity' });
    parentId = p._id;
  }

  const doc = await Task.create({
    entity_id: req.entityId,
    title: sanitizeTitle(title),
    description: sanitizeBody(description),
    assignee_user_id: assigneeId,
    created_by: req.user._id,
    due_date: due_date ? new Date(due_date) : null,
    priority: priority && Task.TASK_PRIORITIES.includes(String(priority).toLowerCase()) ? String(priority).toLowerCase() : 'normal',
    parent_task_id: parentId,
    source_module: source_module ? String(source_module).toUpperCase().slice(0, 40) : null,
    source_doc_id: source_doc_id && mongoose.isValidObjectId(source_doc_id) ? source_doc_id : null,
  });

  // Maintain parent.sub_tasks cache (best-effort — failure here must not
  // block task creation; the tree can be rebuilt from parent_task_id at any time)
  if (parentId) {
    try {
      await Task.updateOne({ _id: parentId }, { $addToSet: { sub_tasks: doc._id } });
    } catch {
      /* non-blocking */
    }
  }

  res.status(201).json({ success: true, data: doc });
});

// ── PATCH /api/erp/tasks/:id ────────────────────────────────────────────────
const updateTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid task id' });
  }

  const task = await Task.findOne({ _id: id, entity_id: req.entityId });
  if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

  const me = req.user._id.toString();
  const owns = task.assignee_user_id?.toString() === me || task.created_by?.toString() === me;
  if (!owns && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Not your task' });
  }

  const { title, description, assignee_user_id, due_date, priority, status } = req.body;

  if (title !== undefined) task.title = sanitizeTitle(title);
  if (description !== undefined) task.description = sanitizeBody(description);
  if (due_date !== undefined) task.due_date = due_date ? new Date(due_date) : null;
  if (priority !== undefined && Task.TASK_PRIORITIES.includes(String(priority).toLowerCase())) {
    task.priority = String(priority).toLowerCase();
  }
  if (assignee_user_id !== undefined) {
    if (assignee_user_id === null || assignee_user_id === '') {
      task.assignee_user_id = null;
    } else if (mongoose.isValidObjectId(assignee_user_id)) {
      const u = await User.findById(assignee_user_id).select('_id').lean();
      if (!u) return res.status(400).json({ success: false, message: 'assignee not found' });
      task.assignee_user_id = u._id;
    }
  }
  if (status !== undefined) {
    const upper = String(status).toUpperCase();
    if (!Task.TASK_STATUSES.includes(upper)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${Task.TASK_STATUSES.join(', ')}` });
    }
    task.status = upper;
    if (upper === 'DONE' && !task.completed_at) {
      task.completed_at = new Date();
      task.completed_by = req.user._id;
    }
    if (upper !== 'DONE') {
      task.completed_at = null;
      task.completed_by = null;
    }
  }

  await task.save();
  res.json({ success: true, data: task });
});

// ── DELETE /api/erp/tasks/:id ───────────────────────────────────────────────
const deleteTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ success: false, message: 'Invalid task id' });
  }
  const task = await Task.findOne({ _id: id, entity_id: req.entityId });
  if (!task) return res.status(404).json({ success: false, message: 'Task not found' });

  const me = req.user._id.toString();
  if (task.created_by?.toString() !== me && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only the creator (or a privileged role) can delete' });
  }

  // Detach from parent's sub_tasks cache (best-effort)
  if (task.parent_task_id) {
    try {
      await Task.updateOne({ _id: task.parent_task_id }, { $pull: { sub_tasks: task._id } });
    } catch {
      /* non-blocking */
    }
  }

  await task.deleteOne();
  res.json({ success: true, message: 'Task deleted' });
});

module.exports = {
  listTasks,
  listOverdue,
  createTask,
  updateTask,
  deleteTask,
};
