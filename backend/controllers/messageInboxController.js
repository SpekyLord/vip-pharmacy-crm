/**
 * Message Inbox Controller
 *
 * Handles inbox/notification messages stored in:
 * DB: vip-pharmacy-crm
 * Collection: messages
 *
 * Features:
 * - Get inbox messages with pagination + filters (category, read/unread, search)
 * - Create message (admin only)
 * - Mark read/unread (per-user via readBy array)
 *
 * NOTE:
 * In MongoDB terms:
 * - "Database" = vip-pharmacy-crm
 * - "Collection" = messages (like a table)
 * - "Document" = one message row (JSON-like object)
 */

const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const MessageInbox = require('../models/MessageInbox');

const getMessageModel = () => MessageInbox;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const buildAudienceFilter = (user) => ({
  recipientRole: user.role,
  $or: [
    { recipientUserId: { $exists: false } },
    { recipientUserId: null },
    { recipientUserId: user._id },
  ],
});



const toInboxDTO = (doc, userId) => {
  const obj = doc.toObject();

    const read = Array.isArray(obj.readBy)
    ? obj.readBy.some((id) => String(id) === String(userId))
    : false;

    return {
      _id: String(obj._id),

      senderName: obj.senderName,
      senderRole: obj.senderRole,
      senderUserId: obj.senderUserId ? String(obj.senderUserId) : null,          // ✅ add

      recipientRole: obj.recipientRole,                                         // ✅ add
      recipientUserId: obj.recipientUserId ? String(obj.recipientUserId) : null, // ✅ add

      title: obj.title,
      body: obj.body,
      category: obj.category,
      priority: obj.priority,
      createdAt: obj.createdAt,
      read,
    };


};


/* ------------------------------------------------------------------ */
/* @desc    Get inbox messages (employee/admin)                        */
/* @route   GET /api/messages                                         */
/* @access  All authenticated users                                   */
/* ------------------------------------------------------------------ */
const getInboxMessages = catchAsync(async (req, res) => {
  const Message = getMessageModel();

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const category = req.query.category; // announcement|payroll|leave|policy|system
  const status = req.query.status; // all|read|unread
  const search = (req.query.search || '').trim();

  const filter = {
  isArchived: false,
  ...buildAudienceFilter(req.user),
 };

  if (category && category !== 'all') {
    // Support comma-separated categories: ?category=ai_coaching,ai_schedule,ai_alert
    const cats = category.split(',').map(c => c.trim()).filter(Boolean);
    filter.category = cats.length > 1 ? { $in: cats } : cats[0];
  }

  // Read/unread filtering (per-user)
    if (status === "read") {
    filter.readBy = req.user._id;
    } else if (status === "unread") {
    filter.readBy = { $ne: req.user._id };
    }



  // Search filter
    if (search) {
    filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { body: { $regex: search, $options: "i" } },
        { senderName: { $regex: search, $options: "i" } },
    ];
    }

  const [docs, total] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Message.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: docs.map((d) => toInboxDTO(d, req.user._id)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

/* ------------------------------------------------------------------ */
/* @desc    Create a message (admin only)                              */
/* @route   POST /api/messages                                         */
/* @access  Admin only                                                 */
/* ------------------------------------------------------------------ */
const createInboxMessage = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Only admins can create inbox messages.',
    });
  }

  const Message = getMessageModel();

    const {
    title,
    body,
    category,
    priority = "normal",
    senderName,
    recipientRole,
    recipientUserId = null, // null = broadcast to role
    } = req.body;

    if (!title || !body || !category || !recipientRole) {
    return res.status(400).json({ success:false, message:"title, body, category, recipientRole are required." });
    }

    const doc = await Message.create({
      title,
      body,
      category,
      priority,

      senderName: senderName || req.user.name || "Admin",
      senderRole: req.user.role || "admin",
      senderUserId: req.user._id, // ✅ REQUIRED for /sent

      recipientRole,
      recipientUserId,
      readBy: [],
      isArchived: false,
    });


  res.status(201).json({
    success: true,
    data: toInboxDTO(doc, req.user._id),
  });
});

/* ------------------------------------------------------------------ */
/* @desc    MessageNotify (admin -> specific user)                     */
/* @route   POST /api/messages/notify                                  */
/* @access  Admin only                                                 */
/* ------------------------------------------------------------------ */
const createMessageNotify = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Only admins can send compliance alerts.",
    });
  }

  const Message = getMessageModel();

  const {
    recipientUserId,         // REQUIRED
    body,                    // optional (default will be applied)
    title = "Compliance Alert",
    category = "compliance_alert",
    priority = "normal",
    recipientRole = ROLES.CONTRACTOR,
    senderName,
  } = req.body;

  if (!recipientUserId) {
    return res.status(400).json({
      success: false,
      message: "recipientUserId is required.",
    });
  }

  const doc = await Message.create({
    senderName: senderName || req.user.name || "Admin",
    senderRole: req.user.role || "admin",
    senderUserId: req.user._id,

    title,
    body: body || "Please check your compliance status and complete required visits.",
    category,
    priority,

    recipientRole,
    recipientUserId,

    readBy: [],
    isArchived: false,
  });

  res.status(201).json({
    success: true,
    data: toInboxDTO(doc, req.user._id),
  });
});



/* ------------------------------------------------------------------ */
/* @desc    Mark message as read (for current user)                     */
/* @route   PATCH /api/messages/:id/read                                */
/* @access  All authenticated users                                    */
/* ------------------------------------------------------------------ */
const markMessageRead = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);

  if (!msg) throw new NotFoundError('Message not found');

  // ensure user is allowed to see this message
    const allowed =
    msg.recipientRole === req.user.role &&
    (msg.recipientUserId == null || String(msg.recipientUserId) === String(req.user._id));

    if (!allowed) {
    return res.status(403).json({
        success: false,
        message: "You are not allowed to access this message.",
    });
    }


    await Message.updateOne(
    { _id: msg._id, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
    );



  const updated = await Message.findById(msg._id);

  res.status(200).json({
    success: true,
    data: toInboxDTO(updated, req.user._id),
  });
});

/* ------------------------------------------------------------------ */
/* @desc    Mark message as unread (for current user)                   */
/* @route   PATCH /api/messages/:id/unread                              */
/* @access  All authenticated users                                    */
/* ------------------------------------------------------------------ */
const markMessageUnread = catchAsync(async (req, res) => {
  const Message = getMessageModel();
  const msg = await Message.findById(req.params.id);

  if (!msg) throw new NotFoundError('Message not found');

  // ensure user is allowed to see this message
    const allowed =
    msg.recipientRole === req.user.role &&
    (msg.recipientUserId == null || String(msg.recipientUserId) === String(req.user._id));

    if (!allowed) return res.status(403).json({ success:false, message:"You are not allowed to access this message." });

    await Message.updateOne(
    { _id: msg._id },
    { $pull: { readBy: req.user._id } }
    );



  const updated = await Message.findById(msg._id);

  res.status(200).json({
    success: true,
    data: toInboxDTO(updated, req.user._id),
  });
});

/* ------------------------------------------------------------------ */
/* @desc    Get SENT messages (admin only)                             */
/* @route   GET /api/messages/sent                                     */
/* @access  Admin only                                                 */
/* ------------------------------------------------------------------ */
const getSentMessages = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Only admins can view sent messages.",
    });
  }

  const Message = getMessageModel();

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const category = req.query.category; // all|announcement|...
  const search = (req.query.search || "").trim();

  const filter = {
    isArchived: false,
    senderUserId: req.user._id, // ✅ key line: admin's sent messages
  };

  if (category && category !== "all") {
    const cats = category.split(',').map(c => c.trim()).filter(Boolean);
    filter.category = cats.length > 1 ? { $in: cats } : cats[0];
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { body: { $regex: search, $options: "i" } },
      { recipientRole: { $regex: search, $options: "i" } },
    ];
  }

  const [docs, total] = await Promise.all([
    Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Message.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: docs.map((d) => toInboxDTO(d, req.user._id)),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

module.exports = {
  getInboxMessages,
  getSentMessages,      // ✅ add
  createInboxMessage,
  createMessageNotify,
  markMessageRead,
  markMessageUnread,
};

