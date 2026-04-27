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
  getHiddenFoldersForRole,
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
  const userIdStr = String(userId);
  const read = Array.isArray(obj.readBy)
    ? obj.readBy.some((id) => String(id) === userIdStr)
    : false;
  // Phase G9.R8 — per-recipient archive + acknowledgement DTO projection.
  const archived = Array.isArray(obj.archivedBy)
    ? obj.archivedBy.some((id) => String(id) === userIdStr)
    : false;
  const ackList = Array.isArray(obj.acknowledgedBy) ? obj.acknowledgedBy : [];
  const myAck = ackList.find((e) => String(e.user) === userIdStr);
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
    // Per-recipient state — what THIS caller sees:
    archived,
    must_acknowledge: !!obj.must_acknowledge,
    acknowledged_by_me: !!myAck,
    acknowledged_at: myAck ? myAck.at : null,
    // Aggregate ack count (sender/admin uses this to decide if a read-receipts
    // modal is worth opening). Full per-user breakdown is in GET /:id/ack-status.
    acknowledged_count: ackList.length,
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

  // Phase G9.R8 — archivedBy replaces the single isArchived bool. Default
  // view hides messages archived BY the current caller; sibling recipients
  // still see the message. Also hide retention-soft-deleted rows so soft-
  // deleted items drop out of the inbox immediately without waiting for the
  // grace-period hard purge.
  const filter = {
    archivedBy: { $ne: req.user._id },
    deletion_candidate: { $ne: true },
    ...buildAudienceFilter(req.user),
  };

  // Entity scoping (Rule #21)
  const entityScope = resolveEntityScope(req);
  if (entityScope) filter.entity_id = entityScope;

  // Phase G9.R9 — Per-role hidden folders (lookup-driven). E.g. president sees
  // approvals via Approval Hub, so the APPROVALS folder is hidden from their
  // Inbox view + counts + folder rail. Returns [] for any role without a row.
  const hiddenFolders = await getHiddenFoldersForRole({
    entityId: entityScope,
    role: req.user.role,
  });

  // If caller explicitly asked for a hidden folder (stale URL / direct API
  // hit), short-circuit with an empty paginated response. Defence-in-depth:
  // the rail won't render hidden folders, but URL bar / cached links still
  // can. SENT is exempt (your own outbox includes everything you sent).
  if (folder && folder !== 'INBOX' && folder !== 'SENT' && hiddenFolders.includes(folder)) {
    return res.status(200).json({
      success: true,
      data: [],
      pagination: { page, limit, total: 0, pages: 1 },
      ...(wantCounts ? { counts: await computeFolderCounts(req, entityScope, hiddenFolders) } : {}),
    });
  }

  // Folder filter — virtual folders are computed (ARCHIVE / SENT / INBOX /
  // ACTION_REQUIRED), real folders match folder field directly.
  if (folder && folder !== 'INBOX') {
    if (folder === 'ARCHIVE') {
      // Flip the archive filter: show only messages archived by me.
      filter.archivedBy = req.user._id;
    } else if (folder === 'SENT') {
      // SENT is a sender-side filter: drop audience filter AND the
      // per-recipient archive filter (sender's Sent list is their authoritative
      // outbox regardless of what recipients did with their copies).
      delete filter.$or;
      delete filter.archivedBy;
      filter.senderUserId = req.user._id;
    } else if (folder === 'ACTION_REQUIRED') {
      filter.requires_action = true;
      filter.action_completed_at = null;
      // Action-required virtual folder still shows ALL folders by default —
      // suppress hidden ones so the red badge matches what's clickable.
      if (hiddenFolders.length) filter.folder = { $nin: hiddenFolders };
    } else {
      filter.folder = folder;
    }
  } else if (hiddenFolders.length) {
    // Default INBOX virtual folder (catch-all) — exclude hidden folders so
    // the catch-all view matches what the rail offers.
    filter.folder = { $nin: hiddenFolders };
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
    response.counts = await computeFolderCounts(req, entityScope, hiddenFolders);
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
  unacknowledged: 0,
  action_required: 0,
  approvals: 0,
  tasks: 0,
  ai_agent_reports: 0,
  announcements: 0,
  chat: 0,
});

const computeFolderCounts = async (req, entityScope, hiddenFoldersArg) => {
  const Message = getMessageModel();
  const baseAud = buildAudienceFilter(req.user);
  // Phase G9.R8 — hide per-user archived rows + soft-deleted rows from counts
  // (so the folder badges reflect "what I'd actually see in my inbox").
  const baseFilter = {
    archivedBy: { $ne: req.user._id },
    deletion_candidate: { $ne: true },
    ...baseAud,
  };
  if (entityScope) baseFilter.entity_id = entityScope;

  // Phase G9.R9 — Per-role hidden folders. Caller may pre-resolve to avoid a
  // duplicate lookup hit (getInboxMessages already fetched it); fall back to a
  // self-resolution for the standalone /counts endpoint.
  const hiddenFolders = Array.isArray(hiddenFoldersArg)
    ? hiddenFoldersArg
    : await getHiddenFoldersForRole({ entityId: entityScope, role: req.user.role });
  if (hiddenFolders.length) {
    baseFilter.folder = { $nin: hiddenFolders };
  }

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
        // Phase G9.R8 — Unacknowledged count.
        //   Counts messages where must_acknowledge=true AND the current user's
        //   id does NOT appear in acknowledgedBy.user. Uses a $filter over the
        //   (small) acknowledgedBy array — cheap even for large inboxes since
        //   the array rarely exceeds the role-members count.
        unacknowledged: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$must_acknowledge', true] },
                  {
                    $eq: [
                      {
                        $size: {
                          $filter: {
                            input: { $ifNull: ['$acknowledgedBy', []] },
                            cond: { $eq: ['$$this.user', userId] },
                          },
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
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

  // Phase G9.R8 — threads hide only the CALLER's archived rows + soft-deleted
  // rows. Other recipients' archives don't affect my view of the same thread.
  const filter = {
    thread_id: new mongoose.Types.ObjectId(threadId),
    archivedBy: { $ne: req.user._id },
    deletion_candidate: { $ne: true },
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
    archivedBy: [],
    acknowledgedBy: [],
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
    archivedBy: [],
    acknowledgedBy: [],
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
    // Phase G9.R8 — admin override for the ack-default pre-save hook. When
    // omitted, the MessageInbox pre-save hook consults INBOX_ACK_DEFAULTS.
    // When true/false, that value is authoritative (hook respects isModified).
    must_acknowledge,
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

  const docPayload = {
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
    archivedBy: [],
    acknowledgedBy: [],
    entity_id: entityScope,
    folder: folderForCategory(category),
  };
  // Phase G9.R8 — admin-supplied must_acknowledge override. Passing only when
  // explicitly set marks the field as modified on the doc, which tells the
  // pre-save hook to respect the override instead of re-deriving from lookup.
  if (must_acknowledge === true || must_acknowledge === false) {
    docPayload.must_acknowledge = must_acknowledge;
  }
  const doc = await Message.create(docPayload);
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
    archivedBy: [],
    acknowledgedBy: [],
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
      // Variance IDs came from msg.action_payload, written by the system when the
      // inbox row was created against msg.entity_id. Scope by msg.entity_id so a
      // foreign payload can't cross entities even if injected.
      const alertEntityScope = msg.entity_id ? { entity_id: msg.entity_id } : {};
      for (const vid of variances) {
        if (!isObjectId(vid)) continue;
        const alert = await VarianceAlert.findOne({ _id: vid, ...alertEntityScope });
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
            // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key reports_to lookup; alert is already entity-scoped above
            const p = await PeopleMaster.findById(alert.person_id).select('reports_to').lean();
            if (p?.reports_to) {
              // eslint-disable-next-line vip-tenant/require-entity-filter -- by-key manager-chain cascade from alert.entity_id
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

  // Phase G9.R8 — sender's Sent folder is the outbox of record. We don't
  // hide messages based on any recipient's archive decision, and we don't
  // hide soft-deleted rows either (admin reviewing "did this go out?" needs
  // to see everything they sent until hard purge).
  const filter = { senderUserId: req.user._id };
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
/* Phase G9.R8 — Archive / Unarchive / Bulk Archive                   */
/* ------------------------------------------------------------------ */
// All three are self-service: the caller can only toggle their OWN entry
// in archivedBy. Any authenticated user who can see the message (audience
// gate via isReadWriteAllowed + privileged bypass) can archive it.
//
// We deliberately allow the SENDER to archive their own copy too — a sender
// who receives a reply to their own broadcast may want to tidy their inbox
// view of that thread. isReadWriteAllowed already covers this.

const archiveMessage = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');
  if (!isReadWriteAllowed(msg, req.user) && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to archive this message.' });
  }
  await Message.updateOne(
    { _id: msg._id },
    { $addToSet: { archivedBy: req.user._id } }
  );
  const updated = await Message.findById(msg._id);
  res.status(200).json({ success: true, data: toInboxDTO(updated, req.user._id) });
});

const unarchiveMessage = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');
  if (!isReadWriteAllowed(msg, req.user) && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to unarchive this message.' });
  }
  await Message.updateOne(
    { _id: msg._id },
    { $pull: { archivedBy: req.user._id } }
  );
  const updated = await Message.findById(msg._id);
  res.status(200).json({ success: true, data: toInboxDTO(updated, req.user._id) });
});

const bulkArchiveMessages = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(isObjectId) : [];
  if (ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids[] is required.' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ success: false, message: 'Max 200 ids per request.' });
  }
  // Only archive messages the caller can actually see (audience + entity scope).
  // We compute a permissive authz filter and scope the $addToSet to it so a
  // malicious caller can't archive-by-id across tenants.
  const baseAud = buildAudienceFilter(req.user);
  const entityScope = resolveEntityScope(req);
  const filter = {
    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    ...baseAud,
  };
  if (entityScope) filter.entity_id = entityScope;

  const result = await Message.updateMany(filter, {
    $addToSet: { archivedBy: req.user._id },
  });
  res.status(200).json({
    success: true,
    data: { matched: result.matchedCount, modified: result.modifiedCount },
  });
});

/* ------------------------------------------------------------------ */
/* Phase G9.R8 — Mark all as read (per folder)                        */
/* ------------------------------------------------------------------ */
// Bulk version of markMessageRead. Accepts the same folder filter vocabulary
// as GET /messages (INBOX / ACTION_REQUIRED / APPROVALS / TASKS / ...).
// Scope is strictly "messages the caller currently sees in that folder" —
// the filter mirrors getInboxMessages so the effect matches what's on screen.
const markAllRead = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const folder = (req.query.folder || req.body?.folder || '').toString().toUpperCase();

  const filter = {
    archivedBy: { $ne: req.user._id },
    deletion_candidate: { $ne: true },
    readBy: { $ne: req.user._id },
    ...buildAudienceFilter(req.user),
  };
  const entityScope = resolveEntityScope(req);
  if (entityScope) filter.entity_id = entityScope;

  // Phase G9.R9 — Per-role hidden folders. "Mark all read" must not reach
  // across hidden folders (e.g. president marking Inbox read shouldn't
  // silently mark every approval-folder row read too).
  const hiddenFolders = await getHiddenFoldersForRole({
    entityId: entityScope,
    role: req.user.role,
  });

  // Asking to mark-all-read for a hidden folder is a no-op (defence-in-depth).
  if (folder && folder !== 'INBOX' && folder !== 'SENT' && hiddenFolders.includes(folder)) {
    return res.status(200).json({
      success: true,
      data: { matched: 0, modified: 0, folder },
    });
  }

  if (folder && folder !== 'INBOX') {
    if (folder === 'ARCHIVE') {
      filter.archivedBy = req.user._id;
    } else if (folder === 'SENT') {
      // Sender rarely needs "mark all read" over their own sent items, but we
      // still honor the call for consistency. Drop audience filter + pin sender.
      delete filter.$or;
      delete filter.archivedBy;
      filter.senderUserId = req.user._id;
    } else if (folder === 'ACTION_REQUIRED') {
      filter.requires_action = true;
      filter.action_completed_at = null;
      if (hiddenFolders.length) filter.folder = { $nin: hiddenFolders };
    } else {
      filter.folder = folder;
    }
  } else if (hiddenFolders.length) {
    // Default INBOX scope — exclude hidden folders.
    filter.folder = { $nin: hiddenFolders };
  }

  const result = await Message.updateMany(filter, {
    $addToSet: { readBy: req.user._id },
  });
  res.status(200).json({
    success: true,
    data: { matched: result.matchedCount, modified: result.modifiedCount, folder: folder || 'INBOX' },
  });
});

/* ------------------------------------------------------------------ */
/* Phase G9.R8 — Acknowledge                                          */
/* ------------------------------------------------------------------ */
// Explicit "I have read and understood this" click. Writes to
// acknowledgedBy with a timestamp (audit trail). Also marks the message
// read (acknowledge implies read — bot-opening a broadcast you never saw
// then ack'ing it is the abuse case; we don't prevent it at this layer
// because the actor is still identified in the log).
//
// Idempotent: if the user is already in acknowledgedBy, we return the
// existing timestamp untouched. No 409 — callers can blindly click ack.
const acknowledgeMessage = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');
  if (!isReadWriteAllowed(msg, req.user) && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You are not allowed to acknowledge this message.' });
  }

  const userIdStr = String(req.user._id);
  const alreadyAcked = Array.isArray(msg.acknowledgedBy)
    && msg.acknowledgedBy.some((e) => String(e.user) === userIdStr);

  if (!alreadyAcked) {
    // Use a guarded updateOne so concurrent acks don't double-insert.
    await Message.updateOne(
      { _id: msg._id, 'acknowledgedBy.user': { $ne: req.user._id } },
      {
        $push: { acknowledgedBy: { user: req.user._id, at: new Date() } },
        $addToSet: { readBy: req.user._id },
      }
    );
  }

  const updated = await Message.findById(msg._id);
  res.status(200).json({ success: true, data: toInboxDTO(updated, req.user._id) });
});

/* ------------------------------------------------------------------ */
/* Phase G9.R8 — Acknowledgement status (sender/admin read-receipts)  */
/* ------------------------------------------------------------------ */
// Returns { total, acknowledged: [{user_id, name, at}], pending: [{user_id, name}] }
// for a broadcast OR DM. Only visible to:
//   - the sender of the message, OR
//   - privileged roles (president/ceo/admin/finance).
// Non-broadcast DMs still work — pending just shows the single recipient.
const getAckStatus = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);
  if (!msg) throw new NotFoundError('Message not found');

  const isSender = msg.senderUserId && String(msg.senderUserId) === String(req.user._id);
  if (!isSender && !isPrivileged(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only the sender or a privileged role can view read-receipts.' });
  }

  const User = require('../models/User');

  // Determine the audience that SHOULD have acknowledged:
  //   - targeted DM (recipientUserId set): audience = [recipientUserId]
  //   - broadcast (recipientUserId null): audience = all active users in
  //     recipientRole within the message's entity (if scoped) or across all
  //     entities.
  let audienceIds = [];
  if (msg.recipientUserId) {
    audienceIds = [msg.recipientUserId];
  } else {
    const userFilter = { role: msg.recipientRole, isActive: { $ne: false } };
    if (msg.entity_id) {
      userFilter.$or = [
        { entity_id: msg.entity_id },
        { entity_ids: msg.entity_id },
      ];
    }
    const users = await User.find(userFilter).select('_id').lean();
    audienceIds = users.map((u) => u._id);
  }

  const ackedUserIds = (msg.acknowledgedBy || []).map((e) => String(e.user));
  const ackedSet = new Set(ackedUserIds);
  const pendingIds = audienceIds.filter((uid) => !ackedSet.has(String(uid)));

  // Enrich with display names (single bulk query for both sets).
  const allIds = [...new Set([...ackedUserIds.map(String), ...pendingIds.map(String)])];
  const users = allIds.length
    ? await User.find({ _id: { $in: allIds } }).select('_id full_name name email').lean()
    : [];
  const nameMap = new Map(users.map((u) => [String(u._id), u.full_name || u.name || u.email || 'Unknown']));

  const acknowledged = (msg.acknowledgedBy || []).map((e) => ({
    user_id: String(e.user),
    name: nameMap.get(String(e.user)) || 'Unknown',
    at: e.at,
  }));
  const pending = pendingIds.map((uid) => ({
    user_id: String(uid),
    name: nameMap.get(String(uid)) || 'Unknown',
  }));

  res.status(200).json({
    success: true,
    data: {
      message_id: String(msg._id),
      title: msg.title,
      must_acknowledge: !!msg.must_acknowledge,
      is_broadcast: !msg.recipientUserId,
      total: audienceIds.length,
      acknowledged,
      pending,
    },
  });
});

/* ------------------------------------------------------------------ */
/* Phase G9.R8 — Retention run-now + preview                          */
/* ------------------------------------------------------------------ */
// Thin wrappers that delegate to messageRetentionAgent. Both are gated by
// the messaging.retention_manage sub-perm at the route level.
const runRetentionNow = catchAsync(async (req, res) => {
  const retention = require('../erp/services/messageRetentionAgent');
  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);
  if (!entityScope && !isPrivileged(req.user.role)) {
    return res.status(400).json({ success: false, message: 'Entity context required.' });
  }
  // Privileged caller with no explicit entity scope = run ALL entities.
  // Non-privileged = pinned to their entity.
  const result = await retention.runRetention({
    entityId: entityScope,
    triggeredBy: req.user._id,
    dryRun: req.body?.dry_run === true || req.query?.dry_run === '1',
  });
  res.status(200).json({ success: true, data: result });
});

const previewRetention = catchAsync(async (req, res) => {
  const retention = require('../erp/services/messageRetentionAgent');
  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);
  if (!entityScope && !isPrivileged(req.user.role)) {
    return res.status(400).json({ success: false, message: 'Entity context required.' });
  }
  const result = await retention.previewRetention({
    entityId: entityScope,
  });
  res.status(200).json({ success: true, data: result });
});

/* ------------------------------------------------------------------ */
/* GET /api/messages/folders (lookup-driven nav config)               */
/* ------------------------------------------------------------------ */
const getFolders = catchAsync(async (req, res) => {
  const entityScope = resolveEntityScope(req)
    || req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);
  const [folders, actions, hiddenFolders] = await Promise.all([
    getFoldersConfig(entityScope),
    getActionsConfig(entityScope),
    // Phase G9.R9 — drop hidden folders from the left-rail for the caller's role.
    getHiddenFoldersForRole({ entityId: entityScope, role: req.user.role }),
  ]);
  const visibleFolders = hiddenFolders.length
    ? folders.filter((f) => !hiddenFolders.includes(String(f.code).toUpperCase()))
    : folders;
  res.status(200).json({
    success: true,
    data: {
      folders: visibleFolders.map((f) => ({
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

/* ------------------------------------------------------------------ */
/* POST /api/messages/system-event                                    */
/*                                                                    */
/* Phase N offline-first sprint (Apr 27 2026)                         */
/*                                                                    */
/* Self-DM endpoint for system-generated events (sync complete /      */
/* sync error / draft lost). The CALLER is BOTH sender and recipient  */
/* — the entry lands in their own inbox so they can audit how often   */
/* their device burned mobile data syncing offline drafts.            */
/*                                                                    */
/* SECURITY:                                                          */
/*   - protect middleware required (req.user populated)               */
/*   - event_type is server-side allowlisted; client cannot inject    */
/*     arbitrary inbox content                                        */
/*   - title/body templates are server-side, only numeric / scalar    */
/*     payload values land in the formatted text                      */
/*   - recipient is FORCED to req.user._id; can't be spoofed          */
/*                                                                    */
/* Lookup-driven (Rule #3): the event-type → template mapping comes   */
/* from the SYSTEM_EVENT_TEMPLATES Lookup category if present (per    */
/* entity), otherwise the inline DEFAULT_EVENT_TEMPLATES below kick   */
/* in so a Lookup outage never breaks the sync feedback loop.         */
/* ------------------------------------------------------------------ */

const Lookup = require('../erp/models/Lookup');

const DEFAULT_EVENT_TEMPLATES = Object.freeze({
  sync_complete: {
    category: 'system',
    priority: 'low',
    titleTemplate: 'Synced {synced} {kind_label} (~{megabytes} MB)',
    bodyTemplate:
      'Your offline drafts replayed automatically when connectivity returned.\n\n' +
      'Items synced: {synced}\nApprox data used: {megabytes} MB ({bytes_human}).\n' +
      'Pending: {remaining}\nCompleted at: {completed_at}',
  },
  sync_error: {
    category: 'system',
    priority: 'normal',
    titleTemplate: 'Offline sync error — {kind_label} could not replay',
    bodyTemplate:
      'A queued offline item could not be restored or accepted by the server.\n\n' +
      'Kind: {kind_label}\nReason: {reason}\nReference: {draft_id}\n\n' +
      'Open the Sync Errors tray on your dashboard to retry or discard.',
  },
  visit_draft_lost: {
    category: 'system',
    priority: 'normal',
    titleTemplate: 'Visit draft photos lost — please re-capture',
    bodyTemplate:
      'A queued offline visit could not be replayed because its photos are no longer available locally (browser storage may have been cleared).\n\n' +
      'Reference: {draft_id}\n' +
      'Reason: {reason}\n\n' +
      'Open the Sync Errors tray on your dashboard to dismiss this entry.',
  },
});

const KIND_LABELS = Object.freeze({
  visit: 'visit',
  visits: 'visits',
  clm: 'CLM session',
  commLog: 'communication log',
  other: 'item',
});

function pluralizeKind(syncedKinds, totalSynced) {
  // syncedKinds is the SW's per-kind counter, e.g. { visit: 3 }. Pick the
  // dominant kind for the user-facing sentence; mixed runs default to 'item(s)'.
  if (!syncedKinds || typeof syncedKinds !== 'object') {
    return totalSynced === 1 ? 'item' : 'items';
  }
  const entries = Object.entries(syncedKinds).filter(([, n]) => Number(n) > 0);
  if (entries.length === 1) {
    const [k, n] = entries[0];
    const base = KIND_LABELS[k] || KIND_LABELS.other;
    return Number(n) === 1 ? base : (base === 'CLM session' ? 'CLM sessions' : `${base}s`);
  }
  return totalSynced === 1 ? 'item' : 'items';
}

function bytesHuman(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{([a-z_]+)\}/g, (_, key) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

async function resolveEventTemplate(entityId, eventType, fallback) {
  // Allow per-entity admin overrides via the SYSTEM_EVENT_TEMPLATES Lookup
  // category (seeded in lookupGenericController.js SEED_DEFAULTS). Failures
  // fall back silently to the inline DEFAULT_EVENT_TEMPLATES so a Lookup
  // outage never breaks the auto-sync inbox flow. eventType is uppercased
  // to match the seed row codes (sync_complete → SYNC_COMPLETE).
  try {
    const filter = {
      category: 'SYSTEM_EVENT_TEMPLATES',
      code: String(eventType).toUpperCase(),
      is_active: true,
    };
    if (entityId) filter.entity_id = entityId;
    const row = await Lookup.findOne(filter).lean();
    if (row?.metadata?.titleTemplate && row?.metadata?.bodyTemplate) {
      return {
        category: row.metadata.category || fallback.category,
        priority: row.metadata.priority || fallback.priority,
        titleTemplate: row.metadata.titleTemplate,
        bodyTemplate: row.metadata.bodyTemplate,
      };
    }
  } catch { /* lookup outage — use defaults */ }
  return fallback;
}

const recordSystemEvent = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const { event_type, payload = {} } = req.body || {};
  const allowed = Object.keys(DEFAULT_EVENT_TEMPLATES);
  if (!event_type || !allowed.includes(event_type)) {
    return res.status(400).json({
      success: false,
      message: `event_type must be one of: ${allowed.join(', ')}`,
    });
  }

  // Drop pure-noise events server-side: sync_complete with synced=0 means the
  // queue was already empty (user hit Sync Now while online and idle). No
  // value in spamming the inbox with "synced 0 items".
  if (event_type === 'sync_complete' && Number(payload.synced || 0) === 0) {
    return res.status(204).end();
  }

  const fallback = DEFAULT_EVENT_TEMPLATES[event_type];
  const entityId = req.user.entity_id
    || (Array.isArray(req.user.entity_ids) && req.user.entity_ids.length > 0 ? req.user.entity_ids[0] : null);
  const tpl = await resolveEventTemplate(entityId, event_type, fallback);

  const synced = Number(payload.synced || 0);
  const bytes = Number(payload.bytes || 0);
  const remaining = Number(payload.remaining || 0);
  const draftId = String(payload.draft_id || payload.draftId || '').slice(0, 100);
  const reason = String(payload.reason || '').slice(0, 300);
  const kindLabel = pluralizeKind(payload.syncedKinds, synced) || 'items';

  const vars = {
    synced,
    bytes,
    bytes_human: bytesHuman(bytes),
    megabytes: (bytes / (1024 * 1024)).toFixed(2),
    remaining,
    draft_id: draftId,
    reason: reason || 'unknown',
    kind_label: kindLabel,
    completed_at: payload.completedAt || new Date().toISOString(),
  };

  const docPayload = {
    senderName: 'VIP CRM (system)',
    senderRole: 'system',
    senderUserId: null,
    title: fillTemplate(tpl.titleTemplate, vars).slice(0, 200),
    body: fillTemplate(tpl.bodyTemplate, vars).slice(0, 5000),
    category: tpl.category || 'system',
    priority: tpl.priority || 'low',
    recipientRole: req.user.role,
    recipientUserId: req.user._id,
    readBy: [],
    archivedBy: [],
    acknowledgedBy: [],
    entity_id: entityId,
    folder: folderForCategory(tpl.category || 'system'),
  };

  const doc = await Message.create(docPayload);
  doc.thread_id = doc._id;
  await doc.save();

  res.status(201).json({ success: true, data: { id: doc._id, title: doc.title } });
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
  // Phase G9.R8 — archive/ack/retention
  archiveMessage,
  unarchiveMessage,
  bulkArchiveMessages,
  markAllRead,
  acknowledgeMessage,
  getAckStatus,
  runRetentionNow,
  previewRetention,
  // Phase N offline-first sprint
  recordSystemEvent,
};
