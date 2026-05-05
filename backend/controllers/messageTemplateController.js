/**
 * MessageTemplate Controller
 *
 * Admin: full CRUD on templates (including access control).
 * BDM: list templates they have access to, send via API or copy to clipboard.
 *
 * Access Control:
 *   accessLevel='all'        → visible to every BDM
 *   accessLevel='restricted' → visible only to allowedUsers[] + admin-like roles
 *   Admin-like roles always see everything.
 */

const MessageTemplate = require('../models/MessageTemplate');
const Doctor = require('../models/Doctor');
const Client = require('../models/Client');
const CommunicationLog = require('../models/CommunicationLog');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { isAdminLike, isPresidentLike } = require('../constants/roles');

// Re-use the dispatch + contact helpers from communicationLogController
const {
  dispatchMessage,
  getContactForChannel,
} = require('./communicationLogController');

// ── Helpers ──

/**
 * Resolve the sender's position/title from PeopleMaster (lookup-driven).
 * Falls back to system role if PeopleMaster record not found.
 */
async function getSenderTitle(userId) {
  try {
    const PeopleMaster = require('../erp/models/PeopleMaster');
    // eslint-disable-next-line vip-tenant/require-entity-filter -- by-user_id lookup: title is user-attribute (same person across entities reads the same title); CRM controller has no req.entityId in scope here
    const person = await PeopleMaster.findOne({ user_id: userId }).select('position').lean();
    if (person?.position) return person.position;
  } catch { /* PeopleMaster may not exist for all users */ }
  return null;
}

/** Resolve the user's working entity_id (from user profile or X-Entity-Id header) */
function getUserEntityId(req) {
  // Check X-Entity-Id header first (for president/multi-entity users switching)
  const headerEntityId = req.headers['x-entity-id'];
  if (headerEntityId && /^[a-f\d]{24}$/i.test(headerEntityId)) return headerEntityId;
  // Fall back to user's primary entity
  const eid = req.user.entity_id;
  return eid?._id?.toString?.() || eid?.toString?.() || null;
}

/** Check if user can see/use a specific template based on access + entity */
function userCanAccessTemplate(template, user, userEntityId) {
  // President-like always have full access
  if (isPresidentLike(user.role)) return true;
  // Admin-like always have access within their entity
  if (isAdminLike(user.role)) {
    // Global template (no entity) — admin can access
    if (!template.entity_id) return true;
    // Entity-scoped — admin must be in same entity
    if (userEntityId && template.entity_id.toString() === userEntityId) return true;
    return false;
  }
  // Entity check for BDMs
  if (template.entity_id && userEntityId && template.entity_id.toString() !== userEntityId) return false;
  // 'all' templates are visible to everyone in the entity
  if (template.accessLevel === 'all') return true;
  // 'restricted' — check if user is in allowedUsers
  if (template.accessLevel === 'restricted') {
    const userId = user._id.toString();
    return (template.allowedUsers || []).some(
      (id) => (id._id || id).toString() === userId
    );
  }
  return false;
}

/**
 * @desc    Create a message template
 * @route   POST /api/message-templates
 * @access  Private (Admin)
 */
const createTemplate = catchAsync(async (req, res) => {
  const { name, description, category, channels, bodyTemplate, variables, accessLevel, allowedUsers, entity_id } = req.body;

  // entity_id: explicit from body, or user's current entity, or null (global)
  const resolvedEntityId = entity_id !== undefined ? (entity_id || null) : getUserEntityId(req);

  const template = await MessageTemplate.create({
    name,
    description,
    category,
    channels: channels || [],
    bodyTemplate,
    variables: variables || [],
    accessLevel: accessLevel || 'all',
    allowedUsers: allowedUsers || [],
    entity_id: resolvedEntityId,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Template created.',
    data: template,
  });
});

/**
 * @desc    Update a message template
 * @route   PUT /api/message-templates/:id
 * @access  Private (Admin)
 */
const updateTemplate = catchAsync(async (req, res) => {
  const { name, description, category, channels, bodyTemplate, variables, status, accessLevel, allowedUsers, entity_id } = req.body;

  const template = await MessageTemplate.findById(req.params.id);
  if (!template) throw new NotFoundError('Template not found');

  if (name !== undefined) template.name = name;
  if (description !== undefined) template.description = description;
  if (category !== undefined) template.category = category;
  if (channels !== undefined) template.channels = channels;
  if (bodyTemplate !== undefined) template.bodyTemplate = bodyTemplate;
  if (variables !== undefined) template.variables = variables;
  if (status !== undefined) template.status = status;
  if (accessLevel !== undefined) template.accessLevel = accessLevel;
  if (allowedUsers !== undefined) template.allowedUsers = allowedUsers;
  if (entity_id !== undefined) template.entity_id = entity_id || null;

  await template.save();

  res.json({
    success: true,
    message: 'Template updated.',
    data: template,
  });
});

/**
 * @desc    Delete a message template
 * @route   DELETE /api/message-templates/:id
 * @access  Private (Admin)
 */
const deleteTemplate = catchAsync(async (req, res) => {
  const template = await MessageTemplate.findById(req.params.id);
  if (!template) throw new NotFoundError('Template not found');

  await template.deleteOne();

  res.json({
    success: true,
    message: 'Template deleted.',
  });
});

/**
 * @desc    Get all templates (admin sees all, BDM sees active + access-filtered)
 * @route   GET /api/message-templates
 * @access  Private (Admin, BDM)
 */
const getTemplates = catchAsync(async (req, res) => {
  const { category, status: qStatus } = req.query;
  const query = {};
  const isAdmin = isAdminLike(req.user.role);
  const isPresident = isPresidentLike(req.user.role);
  const userEntityId = getUserEntityId(req);

  // BDMs only see active templates
  if (!isAdmin) {
    query.status = 'active';
  } else if (qStatus) {
    query.status = qStatus;
  }

  if (category) query.category = category;

  // Entity scoping
  if (isPresident) {
    // President sees all templates across all entities
  } else if (isAdmin && userEntityId) {
    // Admin sees global + own entity templates
    query.$or = [{ entity_id: null }, { entity_id: userEntityId }];
  } else if (!isAdmin && userEntityId) {
    // BDM: active + entity-scoped + access-filtered
    const entityFilter = { $or: [{ entity_id: null }, { entity_id: userEntityId }] };
    const accessFilter = {
      $or: [
        { accessLevel: 'all' },
        { accessLevel: 'restricted', allowedUsers: req.user._id },
      ],
    };
    query.$and = [entityFilter, accessFilter];
  } else if (!isAdmin) {
    // BDM with no entity — only global + access-filtered
    query.entity_id = null;
    query.$or = [
      { accessLevel: 'all' },
      { accessLevel: 'restricted', allowedUsers: req.user._id },
    ];
  }

  const templates = await MessageTemplate.find(query)
    .populate('createdBy', 'name email')
    .populate('allowedUsers', 'name email')
    .sort({ category: 1, name: 1 })
    .lean();

  res.json({
    success: true,
    data: templates,
  });
});

/**
 * @desc    Get a single template
 * @route   GET /api/message-templates/:id
 * @access  Private (Admin, BDM)
 */
const getTemplateById = catchAsync(async (req, res) => {
  const template = await MessageTemplate.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('allowedUsers', 'name email')
    .lean();

  if (!template) throw new NotFoundError('Template not found');

  const userEntityId = getUserEntityId(req);

  // BDMs: must be active + have access (entity + user)
  if (!isAdminLike(req.user.role)) {
    if (template.status !== 'active') throw new NotFoundError('Template not found');
    if (!userCanAccessTemplate(template, req.user, userEntityId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this template.' });
    }
  } else if (!isPresidentLike(req.user.role)) {
    // Admin — entity check only
    if (!userCanAccessTemplate(template, req.user, userEntityId)) {
      return res.status(403).json({ success: false, message: 'This template belongs to another entity.' });
    }
  }

  res.json({
    success: true,
    data: template,
  });
});

/**
 * @desc    Send a message using a template (one-click for BDMs / admin)
 * @route   POST /api/message-templates/:id/send
 * @access  Private (Admin, BDM)
 *
 * Body: { doctorId?, clientId?, channel, variables?: { firstName, productName, ... } }
 */
const sendFromTemplate = catchAsync(async (req, res) => {
  const { doctorId, clientId, channel, variables: varsObj } = req.body;

  if (!doctorId && !clientId) {
    return res.status(400).json({ success: false, message: 'Either a VIP Client or Regular Client must be selected.' });
  }
  if (!channel) {
    return res.status(400).json({ success: false, message: 'Channel is required.' });
  }

  // Load template
  const template = await MessageTemplate.findById(req.params.id).lean();
  if (!template || template.status !== 'active') {
    throw new NotFoundError('Template not found or inactive');
  }

  // Access check (entity + user-level)
  const userEntityId = getUserEntityId(req);
  if (!userCanAccessTemplate(template, req.user, userEntityId)) {
    return res.status(403).json({ success: false, message: 'You do not have access to this template.' });
  }

  // Check channel compatibility
  if (template.channels.length > 0 && !template.channels.includes(channel)) {
    return res.status(400).json({
      success: false,
      message: `This template is not available for ${channel}.`,
    });
  }

  // Look up recipient
  let recipientContact = null;
  let targetDoc = null;
  let targetClient = null;
  const context = { ...(varsObj || {}) };

  // Auto-fill sender identity so MDs know who's messaging them
  // Position is lookup-driven (POSITION category in Control Center)
  context.senderName = context.senderName || req.user.name || '';
  if (!context.senderRole) {
    const title = await getSenderTitle(req.user._id);
    context.senderRole = title || req.user.role || '';
  }
  context.senderEmail = context.senderEmail || req.user.email || '';

  if (doctorId) {
    targetDoc = await Doctor.findById(doctorId).lean();
    if (!targetDoc) return res.status(404).json({ success: false, message: 'VIP Client not found.' });

    // Admin can contact any VIP Client; BDM only their own.
    // Phase A.5.4 — assignedTo is an array; shape-agnostic helper.
    if (!isAdminLike(req.user.role)) {
      const { isAssignedTo } = require('../utils/assigneeAccess');
      if (!isAssignedTo(targetDoc, req.user._id)) {
        return res.status(403).json({ success: false, message: 'This VIP Client is not assigned to you.' });
      }
    }
    recipientContact = getContactForChannel(targetDoc, channel);
    context.firstName = context.firstName || targetDoc.firstName || '';
    context.lastName = context.lastName || targetDoc.lastName || '';
    context.fullName = context.fullName || `${targetDoc.firstName || ''} ${targetDoc.lastName || ''}`.trim();
    context.specialization = context.specialization || targetDoc.specialization || '';
  } else {
    targetClient = await Client.findById(clientId).lean();
    if (!targetClient) return res.status(404).json({ success: false, message: 'Regular Client not found.' });

    if (!isAdminLike(req.user.role) && targetClient.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This client does not belong to you.' });
    }
    recipientContact = getContactForChannel(targetClient, channel);
    context.firstName = context.firstName || targetClient.firstName || '';
    context.lastName = context.lastName || targetClient.lastName || '';
    context.fullName = context.fullName || `${targetClient.firstName || ''} ${targetClient.lastName || ''}`.trim();
  }

  if (!recipientContact) {
    return res.status(400).json({
      success: false,
      message: `No ${channel} contact info found for this client. Please update their profile first.`,
    });
  }

  // Interpolate template
  const messageText = MessageTemplate.interpolate(template.bodyTemplate, context);

  // Dispatch
  let sendResult;
  try {
    sendResult = await dispatchMessage(channel, recipientContact, messageText);
  } catch (err) {
    console.error(`[Template] Send failed via ${channel}:`, err.message);
    return res.status(502).json({
      success: false,
      message: `Failed to send via ${channel}: ${err.message}`,
    });
  }

  // Auto-log
  const log = await CommunicationLog.create({
    doctor: doctorId || null,
    client: clientId || null,
    user: req.user._id,
    channel,
    direction: 'outbound',
    source: 'api',
    messageContent: messageText,
    externalMessageId: sendResult.externalId || null,
    deliveryStatus: sendResult.success ? 'sent' : 'failed',
    contactedAt: new Date(),
    notes: `Sent from template: ${template.name}`,
  });

  res.status(201).json({
    success: true,
    message: `Message sent via ${channel} using template "${template.name}".`,
    data: { log, renderedMessage: messageText },
  });
});

module.exports = {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplates,
  getTemplateById,
  sendFromTemplate,
};
