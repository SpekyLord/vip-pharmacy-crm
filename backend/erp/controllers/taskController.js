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
const { notifyTaskEvent, dispatchMultiChannel } = require('../services/erpNotificationService');
const {
  isValidDriverCode,
  isValidKpiCode,
  driverKpiAlignment,
  getDriversConfig,
  getKpiCodesConfig,
  getBulkNotifyThreshold,
} = require('../utils/kpiLookups');

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

// G10 — coerce responsibility_tags input to a clean string array.
// Accepts array or comma-separated string. Upper-cases + trims + dedupes.
// Unknown values are NOT rejected here (freeform; users may tag any role).
function sanitizeTags(v) {
  if (v == null) return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const clean = arr
    .map(s => String(s || '').trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 10);
  return Array.from(new Set(clean));
}

// G10 — parse a goal_period string. Accepts '2026' | '2026-Q1' | '2026-01'.
// Returns the normalized value, or null on invalid. Empty strings clear.
function sanitizePeriod(v) {
  if (v === null || v === '') return null;
  if (v === undefined) return undefined;
  const s = String(v).trim().toUpperCase();
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{4}-Q[1-4]$/.test(s)) return s;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return s;
  return null;
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

  // G10 — lookup-driven filter params (multi-select via comma list)
  const multi = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
  if (req.query.growth_driver_code) {
    const arr = multi(req.query.growth_driver_code).map(s => s.toUpperCase());
    filter.growth_driver_code = arr.length === 1 ? arr[0] : { $in: arr };
  }
  if (req.query.kpi_code) {
    const arr = multi(req.query.kpi_code).map(s => s.toUpperCase());
    filter.kpi_code = arr.length === 1 ? arr[0] : { $in: arr };
  }
  if (req.query.goal_period) filter.goal_period = String(req.query.goal_period).toUpperCase();
  if (req.query.responsibility_tags) {
    const arr = multi(req.query.responsibility_tags).map(s => s.toUpperCase());
    filter.responsibility_tags = arr.length === 1 ? arr[0] : { $in: arr };
  }

  // G10 — due-date range (client passes ISO strings; skip invalid silently)
  if (req.query.due_from || req.query.due_to) {
    filter.due_date = filter.due_date || {};
    const from = req.query.due_from ? new Date(req.query.due_from) : null;
    const to = req.query.due_to ? new Date(req.query.due_to) : null;
    if (from && !isNaN(from.getTime())) filter.due_date.$gte = from;
    if (to && !isNaN(to.getTime())) filter.due_date.$lte = to;
    if (Object.keys(filter.due_date).length === 0) delete filter.due_date;
  }

  // G10 — free-text search over title + description (case-insensitive).
  // Uses regex, not $text, to avoid requiring a text index we don't have.
  if (req.query.q) {
    const safe = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 80);
    if (safe) {
      const rx = new RegExp(safe, 'i');
      filter.$and = (filter.$and || []).concat([{ $or: [{ title: rx }, { description: rx }] }]);
    }
  }

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
    // G10 — optional KPI/Goal linkage
    growth_driver_code,
    kpi_code,
    goal_period,
    milestone_label,
    start_date,
    kpi_ref_id,
    responsibility_tags,
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

  // G10 — lookup-gated validation for driver + KPI + driver/KPI alignment.
  const driverCode = growth_driver_code ? String(growth_driver_code).toUpperCase() : null;
  const kpiCodeClean = kpi_code ? String(kpi_code).toUpperCase() : null;
  if (driverCode && !(await isValidDriverCode(req.entityId, driverCode))) {
    return res.status(400).json({ success: false, message: `Unknown growth_driver_code: ${driverCode}` });
  }
  if (kpiCodeClean && !(await isValidKpiCode(req.entityId, kpiCodeClean))) {
    return res.status(400).json({ success: false, message: `Unknown kpi_code: ${kpiCodeClean}` });
  }
  const alignment = await driverKpiAlignment(req.entityId, driverCode, kpiCodeClean);
  if (!alignment.ok) {
    return res.status(400).json({ success: false, message: `KPI/driver mismatch: ${alignment.reason}` });
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
    // G10 — KPI/Goal linkage fields
    growth_driver_code: driverCode,
    kpi_code: kpiCodeClean,
    goal_period: sanitizePeriod(goal_period) ?? null,
    milestone_label: milestone_label ? String(milestone_label).trim().slice(0, 120) : null,
    start_date: start_date ? new Date(start_date) : null,
    kpi_ref_id: kpi_ref_id && mongoose.isValidObjectId(kpi_ref_id) ? kpi_ref_id : null,
    responsibility_tags: sanitizeTags(responsibility_tags) || [],
  });

  // Maintain parent.sub_tasks cache (best-effort — failure here must not
  // block task creation; the tree can be rebuilt from parent_task_id at any time)
  if (parentId) {
    try {
      await Task.updateOne({ _id: parentId, entity_id: req.entityId }, { $addToSet: { sub_tasks: doc._id } });
    } catch {
      /* non-blocking */
    }
  }

  // Phase G9.B.2 — inbox notification to the assignee when the task is
  // assigned to someone other than the creator. Fire-and-forget; notification
  // failure never rolls back task creation.
  if (assigneeId && String(assigneeId) !== String(req.user._id)) {
    notifyTaskEvent({
      entityId: req.entityId,
      event: 'assigned',
      recipientUserId: assigneeId,
      actorName: req.user?.name || 'A teammate',
      taskId: doc._id,
      taskTitle: doc.title,
      dueDate: doc.due_date,
      priority: doc.priority,
    }).catch(err => console.warn('[tasks] notify assigned failed:', err.message));
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

  // Phase G9.B.2 — snapshot state before mutation so we can fire the right
  // lifecycle inbox events (reassigned / completed) after the save commits.
  const priorAssigneeId = task.assignee_user_id ? String(task.assignee_user_id) : null;
  const priorStatus = task.status;

  const {
    title, description, assignee_user_id, due_date, priority, status,
    // G10
    growth_driver_code, kpi_code, goal_period, milestone_label,
    start_date, kpi_ref_id, responsibility_tags,
  } = req.body;

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

  // G10 — KPI/Goal linkage. Null/empty clears the field; valid code sets it.
  // Validate BEFORE save; an unknown code rejects the whole patch (400) so
  // partial-success can't leak an orphan driver onto a task while other
  // fields change.
  let nextDriver = task.growth_driver_code;
  let nextKpi = task.kpi_code;
  if (growth_driver_code !== undefined) {
    nextDriver = growth_driver_code ? String(growth_driver_code).toUpperCase() : null;
    if (nextDriver && !(await isValidDriverCode(req.entityId, nextDriver))) {
      return res.status(400).json({ success: false, message: `Unknown growth_driver_code: ${nextDriver}` });
    }
  }
  if (kpi_code !== undefined) {
    nextKpi = kpi_code ? String(kpi_code).toUpperCase() : null;
    if (nextKpi && !(await isValidKpiCode(req.entityId, nextKpi))) {
      return res.status(400).json({ success: false, message: `Unknown kpi_code: ${nextKpi}` });
    }
  }
  if (growth_driver_code !== undefined || kpi_code !== undefined) {
    const alignment = await driverKpiAlignment(req.entityId, nextDriver, nextKpi);
    if (!alignment.ok) {
      return res.status(400).json({ success: false, message: `KPI/driver mismatch: ${alignment.reason}` });
    }
    task.growth_driver_code = nextDriver;
    task.kpi_code = nextKpi;
  }
  if (goal_period !== undefined) {
    const p = sanitizePeriod(goal_period);
    if (goal_period && !p) {
      return res.status(400).json({ success: false, message: `Invalid goal_period (expected YYYY | YYYY-QN | YYYY-MM)` });
    }
    task.goal_period = p;
  }
  if (milestone_label !== undefined) {
    task.milestone_label = milestone_label ? String(milestone_label).trim().slice(0, 120) : null;
  }
  if (start_date !== undefined) {
    task.start_date = start_date ? new Date(start_date) : null;
  }
  if (kpi_ref_id !== undefined) {
    task.kpi_ref_id = kpi_ref_id && mongoose.isValidObjectId(kpi_ref_id) ? kpi_ref_id : null;
  }
  if (responsibility_tags !== undefined) {
    const t = sanitizeTags(responsibility_tags);
    task.responsibility_tags = t || [];
  }

  await task.save();

  // Phase G9.B.2 — fire lifecycle inbox events AFTER successful save.
  // Fire-and-forget; notification failures never affect the task write.
  try {
    const newAssigneeId = task.assignee_user_id ? String(task.assignee_user_id) : null;

    // Reassignment — notify the new assignee (skip if they reassigned to themselves)
    if (newAssigneeId && newAssigneeId !== priorAssigneeId && newAssigneeId !== me) {
      notifyTaskEvent({
        entityId: req.entityId,
        event: 'reassigned',
        recipientUserId: newAssigneeId,
        actorName: req.user?.name || 'A teammate',
        taskId: task._id,
        taskTitle: task.title,
        dueDate: task.due_date,
        priority: task.priority,
      }).catch(err => console.warn('[tasks] notify reassigned failed:', err.message));
    }

    // Completion — notify the creator (skip if creator completed their own task)
    if (task.status === 'DONE' && priorStatus !== 'DONE' && task.created_by && String(task.created_by) !== me) {
      notifyTaskEvent({
        entityId: req.entityId,
        event: 'completed',
        recipientUserId: task.created_by,
        actorName: req.user?.name || 'The assignee',
        taskId: task._id,
        taskTitle: task.title,
        dueDate: task.due_date,
        priority: task.priority,
      }).catch(err => console.warn('[tasks] notify completed failed:', err.message));
    }
  } catch (err) {
    console.warn('[tasks] lifecycle notify block failed:', err.message);
  }

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
      await Task.updateOne({ _id: task.parent_task_id, entity_id: task.entity_id }, { $pull: { sub_tasks: task._id } });
    } catch {
      /* non-blocking */
    }
  }

  await task.deleteOne();
  res.json({ success: true, message: 'Task deleted' });
});

// ── GET /api/erp/tasks/drivers ──────────────────────────────────────────
// Phase G10 — lookup-backed driver list for the Gantt grouping + filter UI.
// Lazy-seeds on first read per entity. Returns [{ code, label, metadata }].
const listDrivers = catchAsync(async (req, res) => {
  const rows = await getDriversConfig(req.entityId);
  res.json({ success: true, data: rows });
});

// ── GET /api/erp/tasks/kpi-codes ────────────────────────────────────────
// Phase G10 — lookup-backed KPI list. Optional ?driver=<CODE> filter so the
// UI can cascade KPI selection from the driver selection without a second
// client-side join.
const listKpiCodes = catchAsync(async (req, res) => {
  const rows = await getKpiCodesConfig(req.entityId);
  const driver = req.query.driver ? String(req.query.driver).toUpperCase() : null;
  const filtered = driver
    ? rows.filter(r => String(r.metadata?.driver || '').toUpperCase() === driver)
    : rows;
  res.json({ success: true, data: filtered });
});

// ── GET /api/erp/tasks/by-driver ────────────────────────────────────────
// Phase G10 — Gantt data source. Returns tasks grouped by growth_driver_code
// with per-group metadata (revenue band, label, order) so the UI can render
// the "▼ HOSPITAL ACCREDITATION  band: 1.0–2.0M" header without a second
// lookup round-trip. Unassigned tasks (no driver) land in a NONE group that
// the UI can hide or render last.
const listByDriver = catchAsync(async (req, res) => {
  const { goal_period, scope } = req.query;
  const me = req.user._id;
  const effectiveScope = (scope || 'mine').toLowerCase();
  const match = { entity_id: req.entityId };
  if (goal_period) match.goal_period = String(goal_period).toUpperCase();
  if (effectiveScope === 'all') {
    if (!isPrivileged(req.user.role)) {
      return res.status(403).json({ success: false, message: 'scope=all requires privileged role' });
    }
  } else if (effectiveScope === 'created') {
    match.created_by = me;
  } else {
    match.$or = [{ assignee_user_id: me }, { created_by: me }];
  }

  const [tasks, drivers] = await Promise.all([
    Task.find(match)
      .sort({ start_date: 1, due_date: 1, createdAt: 1 })
      .limit(2000) // hard cap — Gantt of >2k rows is not a usable UI anyway
      .populate('assignee_user_id', 'name full_name email role')
      .populate('created_by', 'name full_name email role')
      .lean(),
    getDriversConfig(req.entityId),
  ]);

  // Build driver-keyed buckets. Preserve POA order via metadata.po_a_order.
  const groups = drivers
    .slice()
    .sort((a, b) => (a.metadata?.po_a_order ?? a.sort_order ?? 99) - (b.metadata?.po_a_order ?? b.sort_order ?? 99))
    .map(d => ({
      code: d.code,
      label: d.label,
      metadata: d.metadata || {},
      tasks: [],
    }));
  const byCode = new Map(groups.map(g => [g.code, g]));
  const orphan = { code: null, label: 'Unassigned Driver', metadata: {}, tasks: [] };

  for (const t of tasks) {
    const bucket = t.growth_driver_code ? byCode.get(String(t.growth_driver_code).toUpperCase()) : null;
    (bucket || orphan).tasks.push(t);
  }

  const payload = [...groups.filter(g => g.tasks.length > 0)];
  if (orphan.tasks.length > 0) payload.push(orphan);

  res.json({ success: true, data: payload, total: tasks.length });
});

// ── POST /api/erp/tasks/bulk-update ─────────────────────────────────────
// Phase G10.E — atomic-per-row bulk patch. Runs the SAME authorization +
// validation path as updateTask (no shortcut), collecting per-id errors.
// Body: { ids: [objectId...], patch: { status?, priority?, due_date?,
//          assignee_user_id?, growth_driver_code?, kpi_code?,
//          goal_period?, milestone_label? } }
// Only whitelisted fields are accepted — title/description edits are
// single-row work, not a bulk operation.
const bulkUpdate = catchAsync(async (req, res) => {
  const { ids, patch } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids[] is required' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ success: false, message: 'bulk update limited to 200 ids per request' });
  }
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ success: false, message: 'patch object is required' });
  }

  // Whitelist patch fields (reject anything not explicitly allowed).
  const ALLOWED = new Set([
    'status', 'priority', 'due_date', 'assignee_user_id',
    'growth_driver_code', 'kpi_code', 'goal_period', 'milestone_label',
    'start_date', 'responsibility_tags',
  ]);
  const bad = Object.keys(patch).filter(k => !ALLOWED.has(k));
  if (bad.length) {
    return res.status(400).json({ success: false, message: `Fields not allowed in bulk: ${bad.join(', ')}` });
  }

  // Validate lookup codes up-front ONCE (same value applied to N rows).
  if (patch.growth_driver_code !== undefined) {
    const v = patch.growth_driver_code ? String(patch.growth_driver_code).toUpperCase() : null;
    if (v && !(await isValidDriverCode(req.entityId, v))) {
      return res.status(400).json({ success: false, message: `Unknown growth_driver_code: ${v}` });
    }
    patch.growth_driver_code = v;
  }
  if (patch.kpi_code !== undefined) {
    const v = patch.kpi_code ? String(patch.kpi_code).toUpperCase() : null;
    if (v && !(await isValidKpiCode(req.entityId, v))) {
      return res.status(400).json({ success: false, message: `Unknown kpi_code: ${v}` });
    }
    patch.kpi_code = v;
  }
  if (patch.growth_driver_code !== undefined && patch.kpi_code !== undefined) {
    const a = await driverKpiAlignment(req.entityId, patch.growth_driver_code, patch.kpi_code);
    if (!a.ok) return res.status(400).json({ success: false, message: `KPI/driver mismatch: ${a.reason}` });
  }
  if (patch.status !== undefined) {
    const upper = String(patch.status).toUpperCase();
    if (!Task.TASK_STATUSES.includes(upper)) {
      return res.status(400).json({ success: false, message: `Invalid status: ${patch.status}` });
    }
    patch.status = upper;
  }
  if (patch.priority !== undefined) {
    const lo = String(patch.priority).toLowerCase();
    if (!Task.TASK_PRIORITIES.includes(lo)) {
      return res.status(400).json({ success: false, message: `Invalid priority: ${patch.priority}` });
    }
    patch.priority = lo;
  }
  if (patch.assignee_user_id) {
    if (!mongoose.isValidObjectId(patch.assignee_user_id)) {
      return res.status(400).json({ success: false, message: 'Invalid assignee_user_id' });
    }
    const u = await User.findById(patch.assignee_user_id).select('_id').lean();
    if (!u) return res.status(400).json({ success: false, message: 'assignee not found' });
  }
  if (patch.goal_period !== undefined) {
    const p = sanitizePeriod(patch.goal_period);
    if (patch.goal_period && !p) {
      return res.status(400).json({ success: false, message: 'Invalid goal_period' });
    }
    patch.goal_period = p;
  }
  if (patch.responsibility_tags !== undefined) {
    patch.responsibility_tags = sanitizeTags(patch.responsibility_tags) || [];
  }

  // Authorization — load each task and check ownership. Skip (not fail) if
  // the caller is not privileged AND doesn't own the task, per the existing
  // updateTask rule.
  const validIds = ids
    .filter(id => mongoose.isValidObjectId(id))
    .map(id => new mongoose.Types.ObjectId(id));
  const tasks = await Task.find({ _id: { $in: validIds }, entity_id: req.entityId });
  const me = req.user._id.toString();
  const privileged = isPrivileged(req.user.role);

  const updated = [];
  const errors = [];
  // Phase G10.E.1 — collect per-assignee notification events during the
  // save loop, then dispatch AFTER all saves with rollup if any recipient
  // exceeds TASK_BULK_NOTIFY_THRESHOLD. Keeps inbox clean on 50-task bulk.
  const reassignEvents = new Map(); // recipientId → [{taskId, taskTitle, dueDate, priority}]
  const completionEvents = new Map(); // recipientId → [{...}] (to creator)

  for (const task of tasks) {
    const owns = task.assignee_user_id?.toString() === me || task.created_by?.toString() === me;
    if (!owns && !privileged) {
      errors.push({ id: String(task._id), reason: 'not_authorized' });
      continue;
    }
    const priorStatus = task.status;
    const priorAssignee = task.assignee_user_id ? String(task.assignee_user_id) : null;
    Object.assign(task, patch);
    if (patch.status === 'DONE' && priorStatus !== 'DONE') {
      task.completed_at = new Date();
      task.completed_by = req.user._id;
    } else if (patch.status !== undefined && patch.status !== 'DONE') {
      task.completed_at = null;
      task.completed_by = null;
    }
    if (patch.due_date !== undefined) task.due_date = patch.due_date ? new Date(patch.due_date) : null;
    if (patch.start_date !== undefined) task.start_date = patch.start_date ? new Date(patch.start_date) : null;
    try {
      await task.save();
      const newAssignee = task.assignee_user_id ? String(task.assignee_user_id) : null;
      if (newAssignee && newAssignee !== priorAssignee && newAssignee !== me) {
        if (!reassignEvents.has(newAssignee)) reassignEvents.set(newAssignee, []);
        reassignEvents.get(newAssignee).push({
          taskId: task._id, taskTitle: task.title, dueDate: task.due_date, priority: task.priority,
        });
      }
      if (task.status === 'DONE' && priorStatus !== 'DONE' && task.created_by && String(task.created_by) !== me) {
        const creatorId = String(task.created_by);
        if (!completionEvents.has(creatorId)) completionEvents.set(creatorId, []);
        completionEvents.get(creatorId).push({
          taskId: task._id, taskTitle: task.title, dueDate: task.due_date, priority: task.priority,
        });
      }
      updated.push(String(task._id));
    } catch (err) {
      errors.push({ id: String(task._id), reason: err.message });
    }
  }

  // ── Roll up per-recipient events (G10.E.1) ────────────────────────────
  // Below threshold: fire N per-task notifyTaskEvent calls (current shape,
  // preserves threading by taskId). Above: single dispatchMultiChannel
  // summary row with action_type=open_link → /erp/tasks?ids=<csv>.
  try {
    const threshold = await getBulkNotifyThreshold(req.entityId);
    const actor = req.user?.name || 'A teammate';
    const fireRollup = async (recipientUserId, items, { event, verbPast }) => {
      const bullets = items.slice(0, 10).map(i => `• ${i.taskTitle}`).join('\n');
      const extra = items.length > 10 ? `\n…and ${items.length - 10} more` : '';
      const ids = items.map(i => String(i.taskId)).join(',');
      return dispatchMultiChannel({
        recipients: [{ user_id: recipientUserId }],
        entityId: req.entityId,
        category: event === 'reassigned' ? 'task_reassigned' : 'task_completed',
        priority: 'normal',
        subject: `${items.length} tasks ${verbPast}`,
        body: `${actor} ${verbPast} ${items.length} tasks:\n\n${bullets}${extra}`,
        inAppFolder: 'TASKS',
        inAppActionType: 'open_link',
        inAppActionPayload: { deep_link: `/erp/tasks?ids=${ids}` },
        inAppSender: { user_id: req.user?._id, name: actor, role: req.user?.role },
      });
    };
    for (const [recipientId, items] of reassignEvents.entries()) {
      if (items.length <= threshold) {
        for (const it of items) {
          notifyTaskEvent({
            entityId: req.entityId, event: 'reassigned',
            recipientUserId: recipientId, actorName: actor,
            taskId: it.taskId, taskTitle: it.taskTitle, dueDate: it.dueDate, priority: it.priority,
          }).catch(e => console.warn('[tasks] bulk reassigned notify failed:', e.message));
        }
      } else {
        fireRollup(recipientId, items, { event: 'reassigned', verbPast: 'reassigned to you' })
          .catch(e => console.warn('[tasks] bulk reassigned rollup failed:', e.message));
      }
    }
    for (const [recipientId, items] of completionEvents.entries()) {
      if (items.length <= threshold) {
        for (const it of items) {
          notifyTaskEvent({
            entityId: req.entityId, event: 'completed',
            recipientUserId: recipientId, actorName: actor,
            taskId: it.taskId, taskTitle: it.taskTitle, dueDate: it.dueDate, priority: it.priority,
          }).catch(e => console.warn('[tasks] bulk completed notify failed:', e.message));
        }
      } else {
        fireRollup(recipientId, items, { event: 'completed', verbPast: 'marked done' })
          .catch(e => console.warn('[tasks] bulk completed rollup failed:', e.message));
      }
    }
  } catch (err) {
    console.warn('[tasks] bulk notification rollup block failed:', err.message);
  }

  // Report ids that weren't found at all (didn't match entity scope).
  const foundIds = new Set(tasks.map(t => String(t._id)));
  for (const id of validIds) {
    const s = String(id);
    if (!foundIds.has(s) && !errors.some(e => e.id === s)) {
      errors.push({ id: s, reason: 'not_found' });
    }
  }
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) errors.push({ id: String(id), reason: 'invalid_id' });
  }

  res.json({ success: true, updated: updated.length, updated_ids: updated, errors });
});

// ── POST /api/erp/tasks/bulk-delete ─────────────────────────────────────
// Phase G10.E — batch delete with per-row authorization. Only the creator
// (or a privileged role) can delete, matching deleteTask semantics.
const bulkDelete = catchAsync(async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids[] is required' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ success: false, message: 'bulk delete limited to 200 ids per request' });
  }
  const validIds = ids
    .filter(id => mongoose.isValidObjectId(id))
    .map(id => new mongoose.Types.ObjectId(id));
  const tasks = await Task.find({ _id: { $in: validIds }, entity_id: req.entityId });
  const me = req.user._id.toString();
  const privileged = isPrivileged(req.user.role);

  const deleted = [];
  const errors = [];
  for (const task of tasks) {
    if (task.created_by?.toString() !== me && !privileged) {
      errors.push({ id: String(task._id), reason: 'not_authorized' });
      continue;
    }
    if (task.parent_task_id) {
      try { await Task.updateOne({ _id: task.parent_task_id, entity_id: task.entity_id }, { $pull: { sub_tasks: task._id } }); } catch { /* non-blocking */ }
    }
    try { await task.deleteOne(); deleted.push(String(task._id)); }
    catch (err) { errors.push({ id: String(task._id), reason: err.message }); }
  }
  const foundIds = new Set(tasks.map(t => String(t._id)));
  for (const id of validIds) {
    const s = String(id);
    if (!foundIds.has(s) && !errors.some(e => e.id === s)) {
      errors.push({ id: s, reason: 'not_found' });
    }
  }
  for (const id of ids) {
    if (!mongoose.isValidObjectId(id)) errors.push({ id: String(id), reason: 'invalid_id' });
  }
  res.json({ success: true, deleted: deleted.length, deleted_ids: deleted, errors });
});

module.exports = {
  listTasks,
  listOverdue,
  createTask,
  updateTask,
  deleteTask,
  // G10
  listDrivers,
  listKpiCodes,
  listByDriver,
  bulkUpdate,
  bulkDelete,
};
