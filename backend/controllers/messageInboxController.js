/**
 * Message Inbox Controller — Phase G9.R4 Unified Operational Inbox
 *
 * Handles inbox messages stored in `messages` collection (DB: vip-pharmacy-crm).
 *
 * Endpoints:
 *   GET    /api/messages                      List w/ filters (folder, requires_action, thread_id, counts=1)
 *   GET    /api/messages/counts               Lightweight unread + action_required counts
 *   GET    /api/messages/sent                 Admin sent items
 *   GET    /api/messages/thread/:thread_id    Full thread (oldest first)
 *   POST   /api/messages                      Admin generic compose
 *   POST   /api/messages/notify               Admin → specific user (compliance alert)
 *   POST   /api/messages/compose              Two-way DM compose (any role w/ messaging.* sub-perm)
 *   POST   /api/messages/:id/reply            Reply to a message (threaded)
 *   POST   /api/messages/:id/action           Execute the row's action (approve/reject/resolve/acknowledge)
 *   PATCH  /api/messages/:id/read             Per-user read
 *   PATCH  /api/messages/:id/unread           Per-user unread
 *
 * Entity scoping (Rule #21):
 *   - Privileged users (president/ceo/admin/finance) can pass ?entity_id=
 *     to scope queries; absent = no entity filter (see everything visible).
 *   - Non-privileged users always filter by their req.user.entity_id.
 *   - Writes always stamp the resolved entity_id on the new row.
 *
 * Folder derivation: writes that don't pass an explicit folder fall back to
 * folderForCategory() so the row lands in the right tab even when callers are
 * legacy.
 */

const mongoose = require('mongoose');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const MessageInbox = require('../models/MessageInbox');
const {
  folderForCategory,
  canDm,
  canBroadcast,
  getFoldersConfig,
  getActionsConfig,
} = require('../erp/utils/inboxLookups');

const getMessageModel = () => MessageInbox;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const PRIVILEGED_ROLES = new Set([
  ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN, ROLES.FINANCE,
]);
const isPrivileged = (role) => PRIVILEGED_ROLES.has(role);

/**
 * Resolve the entity_id to scope the query/write by. Privileged users may
 * pass `?entity_id=` (or X-Entity-Id header for ERP routes); absent means
 * "no entity filter — see everything I'm entitled to" per Rule #21 — never
 * silently fall back to `req.user.entity_id` for privileged users.
 */
const resolveEntityScope = (req) => {
  const headerEntity = req.headers?.['x-entity-id'];
  const queryEntity = req.query?.entity_id;
  if (isPrivileged(req.user.role)) {
    const raw = (queryEntity || headerEntity || '').toString();
    if (raw && /^[a-f\d]{24}$/i.test(raw)) {
      return new mongoose.Types.ObjectId(raw);
    }
    return null; // privileged + no override = no entity filter
  }
  // Non-privileged: always pinned to user's primary entity_id
  return req.user.entity_id || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);
};

/**
 * Build the audience filter for "messages I should see":
 *   - broadcast (recipientUserId null/missing) AND recipientRole === my role
 *   - targeted to me directly (recipientUserId === my _id)
 *
 * NOT to be confused with entity scoping — the entity filter is layered on
 * top of this when applicable.
 */
const buildAudienceFilter = (user) => ({
  $or: [
    {
      recipientRole: user.role,
      $or: [
        { recipientUserId: { $exists: false } },
        { recipientUserId: null },
      ],
    },
    { recipientUserId: user._id },
  ],
});

const toInboxDTO = (doc, userId) => {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const read = Array.isArray(obj.readBy)
    ? obj.readBy.some((id) => String(id) === String(userId))
    : false;
  return {
    _id: String(obj._id),
    senderName: obj.senderName,
    senderRole: obj.senderRole,
    senderUserId: obj.senderUserId ? String(obj.senderUserId) : null,
    recipientRole: obj.recipientRole,
    recipientUserId: obj.recipientUserId ? String(obj.recipientUserId) : null,
    title: obj.title,
    body: obj.body,
    category: obj.category,
    priority: obj.priority,
    folder: obj.folder || folderForCategory(obj.category),
    entity_id: obj.entity_id ? String(obj.entity_id) : null,
    thread_id: obj.thread_id ? String(obj.thread_id) : null,
    parent_message_id: obj.parent_message_id ? String(obj.parent_message_id) : null,
    requires_action: !!obj.requires_action,
    action_type: obj.action_type || null,
    action_payload: obj.action_payload || null,
    action_completed_at: obj.action_completed_at || null,
    action_completed_by: obj.action_completed_by ? String(obj.action_completed_by) : null,
    isArchived: !!obj.isArchived,
    createdAt: obj.createdAt,
    read,
  };
};

const isObjectId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);

/* ------------------------------------------------------------------ */
/* GET /api/messages                                                  */
/* ------------------------------------------------------------------ */
const getInboxMessages = catchAsync(async (req, res) => {
  const Message = getMessageModel();

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const folder = (req.query.folder || '').toString().toUpperCase();
  const category = req.query.category;
  const status = req.query.status;
  const requiresActionParam = req.query.requires_action;
  const threadId = req.query.thread_id;
  const search = (req.query.search || '').trim();
  const wantCounts = req.query.counts === '1' || req.query.counts === 'true';

  const filter = {
    isArchived: false,
    ...buildAudienceFilter(req.user),
  };

  // Entity scoping (Rule #21)
  const entityScope = resolveEntityScope(req);
  if (entityScope) filter.entity_id = entityScope;

  // Folder filter — virtual folders are computed (ARCHIVE / SENT / INBOX /
  // ACTION_REQUIRED), real folders match folder field directly.
  if (folder && folder !== 'INBOX') {
    if (folder === 'ARCHIVE') {
      filter.isArchived = true;
    } else if (folder === 'SENT') {
      // SENT is a sender-side filter: drop audience filter, pin sender
      delete filter.$or;
      filter.senderUserId = req.user._id;
    } else if (folder === 'ACTION_REQUIRED') {
      filter.requires_action = true;
      filter.action_completed_at = null;
    } else {
      filter.folder = folder;
    }
  }

  if (category && category !== 'all') {
    const cats = category.split(',').map((c) => c.trim()).filter(Boolean);
    filter.category = cats.length > 1 ? { $in: cats } : cats[0];
  }

  if (status === 'read') filter.readBy = req.user._id;
  else if (status === 'unread') filter.readBy = { $ne: req.user._id };

  if (requiresActionParam === '1' || requiresActionParam === 'true') {
    filter.requires_action = true;
    filter.action_completed_at = null;
  }

  if (threadId && isObjectId(threadId)) {
    filter.thread_id = new mongoose.Types.ObjectId(threadId);
  }

  if (search) {
    // search is overlaid on top of the audience filter — combine with $and
    // since both branches use $or
    const searchOr = [
      { title: { $regex: search, $options: 'i' } },
      { body: { $regex: search, $options: 'i' } },
      { senderName: { $regex: search, $options: 'i' } },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
  }

  const [docs, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Message.countDocuments(filter),
  ]);

  const response = {
    success: true,
    data: docs.map((d) => toInboxDTO(d, req.user._id)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  };

  if (wantCounts) {
    response.counts = await computeFolderCounts(req, entityScope);
  }

  res.status(200).json(response);
});

/* ------------------------------------------------------------------ */
/* GET /api/messages/counts                                           */
/* ------------------------------------------------------------------ */
// Single-scan $group aggregation: all 8 counts are derived from one pass
// over the base-filter working set using $sum + $cond. This replaces the
// previous 8-query fan-out (which did 8 separate collection scans) with
// exactly one IXSCAN over the { entity_id, folder, createdAt } index.
const ZERO_COUNTS = Object.freeze({
  inbox: 0,
  unread: 0,
  action_required: 0,
  approvals: 0,
  tasks: 0,
  ai_agent_reports: 0,
  announcements: 0,
  chat: 0,
});

const computeFolderCounts = async (req, entityScope) => {
  const Message = getMessageModel();
  const baseAud = buildAudienceFilter(req.user);
  const baseFilter = { isArchived: false, ...baseAud };
  if (entityScope) baseFilter.entity_id = entityScope;

  // Defensive cast: `$in` in aggregation does strict type-match. If auth
  // middleware ever normalises req.user._id to a string, comparing it to
  // BSON ObjectIds in `$readBy` would miss every hit. Casting here keeps
  // the pipeline robust regardless of upstream type drift.
  const userId = mongoose.Types.ObjectId.isValid(req.user._id)
    ? new mongoose.Types.ObjectId(req.user._id)
    : req.user._id;
  const pipeline = [
    { $match: baseFilter },
    {
      $group: {
        _id: null,
        inbox: { $sum: 1 },
        unread: {
          $sum: {
            $cond: [
              { $not: [{ $in: [userId, { $ifNull: ['$readBy', []] }] }] },
              1,
              0,
            ],
          },
        },
        action_required: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$requires_action', true] },
                  { $eq: ['$action_completed_at', null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        approvals:        { $sum: { $cond: [{ $eq: ['$folder', 'APPROVALS'] }, 1, 0] } },
        tasks:            { $sum: { $cond: [{ $eq: ['$folder', 'TASKS'] }, 1, 0] } },
        ai_agent_reports: { $sum: { $cond: [{ $eq: ['$folder', 'AI_AGENT_REPORTS'] }, 1, 0] } },
        announcements:    { $sum: { $cond: [{ $eq: ['$folder', 'ANNOUNCEMENTS'] }, 1, 0] } },
        chat:             { $sum: { $cond: [{ $eq: ['$folder', 'CHAT'] }, 1, 0] } },
      },
    },
  ];

  const rows = await Message.aggregate(pipeline);
  if (!rows.length) return { ...ZERO_COUNTS };

  const { _id, ...counts } = rows[0];
  return counts;
};

const getCounts = catchAsync(async (req, res) => {
  const entityScope = resolveEntityScope(req);
  const counts = await computeFolderCounts(req, entityScope);
  // Soft cache hint — clients poll every 30s; allow ~25s of caching to absorb spikes.
  res.set('Cache-Control', 'private, max-age=25');
  res.status(200).json({ success: true, data: counts });
});

/* ------------------------------------------------------------------ */
/* GET /api/messages/thread/:thread_id                                */
/* ------------------------------------------------------------------ */
const getThread = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const threadId = req.params.thread_id;
  if (!isObjectId(threadId)) {
    return res.status(400).json({ success: false, message: 'Invalid thread_id' });
  }

  const filter = {
    thread_id: new mongoose.Types.ObjectId(threadId),
    isArchived: false,
  };
  // Entity scoping for non-privileged callers
  const entityScope = resolveEntityScope(req);
  if (entityScope) filter.entity_id = entityScope;

  const docs = await Message.find(filter).sort({ createdAt: 1 }).limit(500);

  // Audience guard: caller must appear as recipient (broadcast-to-role or
  // direct) on at least one row, OR be the sender of at least one row, OR
  // be privileged.
  const visibleByAudience = isPrivileged(req.user.role) || docs.some((d) => {
    if (String(d.senderUserId) === String(req.user._id)) return true;
    if (String(d.recipientUserId) === String(req.user._id)) return true;
    if (!d.recipientUserId && d.recipientRole === req.user.role) return true;
    return false;
  });
  if (!visibleByAudience) {
    return res.status(403).json({ success: false, message: 'Thread not visible' });
  }

  res.status(200).json({
    success: true,
    data: docs.map((d) => toInboxDTO(d, req.user._id)),
    count: docs.length,
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/messages (admin generic)                                 */
/* ------------------------------------------------------------------ */
const createInboxMessage = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only admins can create inbox messages.' });
  }
  const Message = getMessageModel();
  const {
    title, body, category, priority = 'normal',
    senderName, recipientRole, recipientUserId = null, folder = null,
  } = req.body;

  if (!title || !body || !category || !recipientRole) {
    return res.status(400).json({ success: false, message: 'title, body, category, recipientRole are required.' });
  }

  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);

  const doc = await Message.create({
    title,
    body,
    category,
    priority,
    senderName: senderName || req.user.name || 'Admin',
    senderRole: req.user.role || 'admin',
    senderUserId: req.user._id,
    recipientRole,
    recipientUserId,
    readBy: [],
    isArchived: false,
    entity_id: entityScope,
    folder: folder || folderForCategory(category),
  });

  res.status(201).json({ success: true, data: toInboxDTO(doc, req.user._id) });
});

/* ------------------------------------------------------------------ */
/* POST /api/messages/notify (admin → specific user, legacy)          */
/* ------------------------------------------------------------------ */
const createMessageNotify = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only admins can send compliance alerts.' });
  }

  const Message = getMessageModel();
  const {
    recipientUserId,
    body,
    title = 'Compliance Alert',
    category = 'compliance_alert',
    priority = 'normal',
    recipientRole = ROLES.CONTRACTOR,
    senderName,
  } = req.body;

  if (!recipientUserId) {
    return res.status(400).json({ success: false, message: 'recipientUserId is required.' });
  }

  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);

  const doc = await Message.create({
    senderName: senderName || req.user.name || 'Admin',
    senderRole: req.user.role || 'admin',
    senderUserId: req.user._id,
    title,
    body: body || 'Please check your compliance status and complete required visits.',
    category,
    priority,
    recipientRole,
    recipientUserId,
    readBy: [],
    isArchived: false,
    entity_id: entityScope,
    folder: folderForCategory(category),
  });

  res.status(201).json({ success: true, data: toInboxDTO(doc, req.user._id) });
});

/* ------------------------------------------------------------------ */
/* POST /api/messages/compose (any role w/ messaging.* perm)          */
/* ------------------------------------------------------------------ */
const composeMessage = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const {
    recipient_user_id, recipient_role, subject, body,
    category = 'chat', priority = 'normal',
  } = req.body || {};

  if (!subject?.trim() || !body?.trim()) {
    return res.status(400).json({ success: false, message: 'subject and body are required.' });
  }
  if (!recipient_user_id && !recipient_role) {
    return res.status(400).json({ success: false, message: 'recipient_user_id OR recipient_role is required.' });
  }

  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);

  // Two-layer authorization: messaging.* sub-perm gate (when erp_access enabled)
  // PLUS MESSAGE_ACCESS_ROLES role-level matrix. President always bypasses.
  const userSubs = req.user.erp_access?.sub_permissions?.messaging || {};
  const isPres = req.user.role === ROLES.PRESIDENT || req.user.role === ROLES.CEO;

  // resolvedRole is hoisted out of the auth blocks so the Message.create below
  // can use it as recipientRole when only recipient_user_id was provided.
  // Schema requires recipientRole — leaving it undefined fails validation.
  let resolvedRole = recipient_role || null;

  if (recipient_role && !recipient_user_id) {
    // Broadcast path
    if (!isPres) {
      const allowedBySub = userSubs.broadcast === true;
      const { ok } = await canBroadcast({ entityId: entityScope, senderRole: req.user.role });
      if (!allowedBySub && !ok) {
        return res.status(403).json({ success: false, message: 'You do not have broadcast permission.' });
      }
    }
  } else {
    // DM path — resolve recipient role for sub-perm + matrix check
    if (!resolvedRole && recipient_user_id) {
      try {
        const User = require('../models/User');
        const recip = await User.findById(recipient_user_id).select('role entity_id').lean();
        if (!recip) return res.status(404).json({ success: false, message: 'Recipient not found' });
        resolvedRole = recip.role;
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid recipient' });
      }
    }
    if (!isPres) {
      const allowedBySub = userSubs.dm_any_role === true || userSubs.dm_direct_reports === true;
      const { ok } = await canDm({
        entityId: entityScope,
        senderRole: req.user.role,
        recipientRole: resolvedRole,
        isDirectReport: false,
        crossEntity: false,
      });
      if (!allowedBySub && !ok) {
        return res.status(403).json({ success: false, message: 'You cannot direct-message this role.' });
      }
    }
  }

  if (!resolvedRole) {
    return res.status(400).json({ success: false, message: 'Could not resolve recipient role.' });
  }

  const doc = await Message.create({
    senderName: req.user.full_name || req.user.name || req.user.email,
    senderRole: req.user.role,
    senderUserId: req.user._id,
    title: String(subject).slice(0, 200),
    body: String(body).slice(0, 5000),
    category: String(category).slice(0, 64).toLowerCase(),
    priority,
    recipientRole: resolvedRole,
    recipientUserId: recipient_user_id || null,
    readBy: [],
    isArchived: false,
    entity_id: entityScope,
    folder: folderForCategory(category),
  });
  // thread_id for fresh chat = own _id
  doc.thread_id = doc._id;
  await doc.save();

  res.status(201).json({ success: true, data: toInboxDTO(doc, req.user._id) });
});

/* ------------------------------------------------------------------ */
/* POST /api/messages/:id/reply                                       */
/* ------------------------------------------------------------------ */
const replyToMessage = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const parent = await Message.findById(req.params.id);
  if (!parent) throw new NotFoundError('Message not found');

  // Audience guard for the parent
  const allowedRecipient =
    String(parent.recipientUserId) === String(req.user._id)
    || (!parent.recipientUserId && parent.recipientRole === req.user.role)
    || String(parent.senderUserId) === String(req.user._id);
  if (!allowedRecipient && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You cannot reply to this message.' });
  }

  const body = (req.body?.body || '').toString();
  if (!body.trim()) {
    return res.status(400).json({ success: false, message: 'body is required' });
  }

  // Recipient of the reply = the OTHER party. If parent had recipientUserId
  // == me, the reply goes to parent.senderUserId (could be null for system).
  const replyToUserId = String(parent.senderUserId) === String(req.user._id)
    ? parent.recipientUserId
    : parent.senderUserId;
  const replyToRole = String(parent.senderUserId) === String(req.user._id)
    ? parent.recipientRole
    : parent.senderRole;

  const threadId = parent.thread_id || parent._id;

  // Replies inherit parent.category (and thus folder) on purpose: threads
  // stay co-located with the original (approvals with approvals, tasks with
  // tasks, etc.). If you ever want replies to always land in CHAT, change
  // `category: parent.category || 'reply'` below to `category: 'reply'`.
  const reply = await Message.create({
    senderName: req.user.full_name || req.user.name || req.user.email,
    senderRole: req.user.role,
    senderUserId: req.user._id,
    title: parent.title?.startsWith('Re: ') ? parent.title : `Re: ${parent.title || ''}`.slice(0, 200),
    body: body.slice(0, 5000),
    category: parent.category || 'reply',
    priority: parent.priority || 'normal',
    recipientRole: replyToRole || 'admin',
    recipientUserId: replyToUserId || null,
    readBy: [],
    isArchived: false,
    entity_id: parent.entity_id,
    folder: parent.folder || folderForCategory(parent.category),
    thread_id: threadId,
    parent_message_id: parent._id,
  });

  res.status(201).json({ success: true, data: toInboxDTO(reply, req.user._id) });
});

/* ------------------------------------------------------------------ */
/* POST /api/messages/:id/action                                      */
/* ------------------------------------------------------------------ */
const executeAction = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');

  // Caller must be the row's recipient (or privileged)
  const allowedRecipient =
    String(msg.recipientUserId) === String(req.user._id)
    || (!msg.recipientUserId && msg.recipientRole === req.user.role)
    || isPrivileged(req.user.role);
  if (!allowedRecipient) {
    return res.status(403).json({ success: false, message: 'You cannot act on this message.' });
  }

  if (!msg.requires_action) {
    return res.status(400).json({ success: false, message: 'This message has no action affordance.' });
  }
  if (msg.action_completed_at) {
    return res.status(400).json({ success: false, message: 'Action already completed.' });
  }

  const rowActionType = String(msg.action_type || '').toLowerCase();
  const payload = msg.action_payload || {};
  const reason = (req.body?.reason || '').toString().slice(0, 500);
  // The body may carry an explicit verb override for action pairs that share
  // a single row (e.g. an approval row exposes BOTH [Approve] and [Reject]
  // buttons — both buttons hit this endpoint, distinguished only by
  // req.body.action). Allowed overrides per row type:
  //   approve row → 'approve' or 'reject' (verb pivot)
  //   any other  → ignored; we use the row's stored action_type
  const bodyAction = String(req.body?.action || '').toLowerCase();
  let actionType = rowActionType;
  if (rowActionType === 'approve' && (bodyAction === 'approve' || bodyAction === 'reject')) {
    actionType = bodyAction;
  }

  // Delegation map — all paths reuse existing controllers (Rule #20: no bypass).
  let downstream;
  try {
    if (actionType === 'approve' || actionType === 'reject') {
      const requestId = payload.approval_request_id;
      if (!requestId) {
        return res.status(400).json({ success: false, message: 'Missing approval_request_id in payload' });
      }
      if (actionType === 'reject' && !reason.trim()) {
        return res.status(400).json({ success: false, message: 'Reason is required for rejection' });
      }
      const { approvalHandlers } = require('../erp/controllers/universalApprovalController');
      // Approval rows are always type='approval_request' for the inbox path.
      // The downstream handler enforces sub-perm + period locks itself.
      downstream = await approvalHandlers.approval_request(
        requestId, actionType, req.user._id, reason
      );
    } else if (actionType === 'resolve') {
      const variances = Array.isArray(payload.variance_alert_ids) ? payload.variance_alert_ids : [];
      const VarianceAlert = require('../erp/models/VarianceAlert');
      const PeopleMaster = require('../erp/models/PeopleMaster');
      const results = [];
      for (const vid of variances) {
        if (!isObjectId(vid)) continue;
        const alert = await VarianceAlert.findById(vid);
        if (!alert) continue;
        if (alert.status === 'RESOLVED') { results.push({ id: vid, ok: true, already: true }); continue; }
        // Permission mirror of varianceAlertController.resolveVarianceAlert
        const canResolve = req.user.role === ROLES.PRESIDENT
          || req.user.role === ROLES.CEO
          || req.user.role === ROLES.ADMIN
          || req.user.role === ROLES.FINANCE
          || String(alert.bdm_id) === String(req.user._id);
        let managerOk = false;
        if (!canResolve && alert.person_id) {
          try {
            const p = await PeopleMaster.findById(alert.person_id).select('reports_to').lean();
            if (p?.reports_to) {
              const mgr = await PeopleMaster.findById(p.reports_to).select('user_id').lean();
              if (mgr?.user_id && String(mgr.user_id) === String(req.user._id)) managerOk = true;
            }
          } catch { /* leave managerOk false */ }
        }
        if (!canResolve && !managerOk) { results.push({ id: vid, ok: false, reason: 'denied' }); continue; }
        alert.status = 'RESOLVED';
        alert.resolved_at = new Date();
        alert.resolved_by = req.user._id;
        alert.resolution_note = reason;
        await alert.save();
        results.push({ id: vid, ok: true });
      }
      downstream = { resolved: results };
    } else if (actionType === 'acknowledge') {
      // No downstream — just stamp completion + mark read
      downstream = { acknowledged: true };
    } else if (actionType === 'reply') {
      return res.status(400).json({ success: false, message: 'Use POST /messages/:id/reply for reply actions.' });
    } else if (actionType === 'open_link') {
      return res.status(400).json({ success: false, message: 'open_link is a frontend-only action.' });
    } else {
      return res.status(400).json({ success: false, message: `Unknown action_type '${actionType}'` });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Downstream action failed' });
  }

  msg.action_completed_at = new Date();
  msg.action_completed_by = req.user._id;
  if (!msg.readBy.some((id) => String(id) === String(req.user._id))) {
    msg.readBy.push(req.user._id);
  }
  await msg.save();

  res.status(200).json({
    success: true,
    data: toInboxDTO(msg, req.user._id),
    downstream,
  });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/messages/:id/read                                       */
/* ------------------------------------------------------------------ */
// Senders can mark their own SENT items read/unread — the SENT folder
// lists them (senderUserId = self), so blocking the mark action was a
// silent UX wart. Recipients retain the existing access rules.
const isReadWriteAllowed = (msg, user) => {
  const isSender = msg.senderUserId && String(msg.senderUserId) === String(user._id);
  const isRecipient =
    msg.recipientRole === user.role
    && (msg.recipientUserId == null || String(msg.recipientUserId) === String(user._id));
  return isSender || isRecipient;
};

const markMessageRead = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');

  if (!isReadWriteAllowed(msg, req.user) && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to access this message.' });
  }

  await Message.updateOne(
    { _id: msg._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  const updated = await Message.findById(msg._id);
  res.status(200).json({ success: true, data: toInboxDTO(updated, req.user._id) });
});

const markMessageUnread = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');

  if (!isReadWriteAllowed(msg, req.user) && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to access this message.' });
  }

  await Message.updateOne({ _id: msg._id }, { $pull: { readBy: req.user._id } });
  const updated = await Message.findById(msg._id);
  res.status(200).json({ success: true, data: toInboxDTO(updated, req.user._id) });
});

/* ------------------------------------------------------------------ */
/* GET /api/messages/sent                                             */
/* ------------------------------------------------------------------ */
const getSentMessages = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only admins can view sent messages.' });
  }
  const Message = getMessageModel();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip = (page - 1) * limit;

  const category = req.query.category;
  const search = (req.query.search || '').trim();

  const filter = { isArchived: false, senderUserId: req.user._id };
  const entityScope = resolveEntityScope(req);
  if (entityScope) filter.entity_id = entityScope;

  if (category && category !== 'all') {
    const cats = category.split(',').map((c) => c.trim()).filter(Boolean);
    filter.category = cats.length > 1 ? { $in: cats } : cats[0];
  }
  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { body: { $regex: search, $options: 'i' } },
      { recipientRole: { $regex: search, $options: 'i' } },
    ];
  }

  const [docs, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Message.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: docs.map((d) => toInboxDTO(d, req.user._id)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/messages/folders (lookup-driven nav config)               */
/* ------------------------------------------------------------------ */
const getFolders = catchAsync(async (req, res) => {
  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);
  const [folders, actions] = await Promise.all([
    getFoldersConfig(entityScope),
    getActionsConfig(entityScope),
  ]);
  res.status(200).json({
    success: true,
    data: {
      folders: folders.map((f) => ({
        code: f.code,
        label: f.label,
        sort_order: f.sort_order,
        virtual: !!f.metadata?.virtual,
        description: f.metadata?.description || '',
      })),
      actions: actions.map((a) => ({
        code: a.code,
        label: a.label,
        sort_order: a.sort_order,
        variant: a.metadata?.variant || 'secondary',
        confirm: !!a.metadata?.confirm,
        reason_required: !!a.metadata?.reason_required,
        api_path: a.metadata?.api_path || null,
      })),
    },
  });
});

module.exports = {
  getInboxMessages,
  getSentMessages,
  getCounts,
  getThread,
  getFolders,
  createInboxMessage,
  createMessageNotify,
  composeMessage,
  replyToMessage,
  executeAction,
  markMessageRead,
  markMessageUnread,
};
