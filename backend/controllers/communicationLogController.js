/**
 * CommunicationLog Controller
 *
 * CRUD for BDM-to-client interactions outside of visits.
 * Supports manual screenshot uploads (Phase 1) and
 * API-based messaging (Phase 2).
 */

const CommunicationLog = require('../models/CommunicationLog');
const Doctor = require('../models/Doctor');
const Client = require('../models/Client');
const { catchAsync, NotFoundError } = require('../middleware/errorHandler');
const { signCommPhotos } = require('../config/s3');
const { ROLES, isAdminLike } = require('../constants/roles');

/**
 * @desc    Create a communication log (manual screenshot upload)
 * @route   POST /api/communication-logs
 * @access  Private (BDM, Admin)
 */
const createLog = catchAsync(async (req, res) => {
  const { doctor, client, channel, direction, notes, contactedAt } = req.body;

  // Must have at least one target
  if (!doctor && !client) {
    return res.status(400).json({
      success: false,
      message: 'Either a VIP Client or Regular Client must be selected.',
    });
  }

  // BDM access check: can only log for assigned doctors or own clients
  if (!isAdminLike(req.user.role)) {
    if (doctor) {
      const doc = await Doctor.findById(doctor).lean();
      if (!doc) {
        return res.status(404).json({ success: false, message: 'VIP Client not found.' });
      }
      const assignedTo = doc.assignedTo?._id || doc.assignedTo;
      if (!assignedTo || assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This VIP Client is not assigned to you.',
        });
      }
    }
    if (client) {
      const cl = await Client.findById(client).lean();
      if (!cl) {
        return res.status(404).json({ success: false, message: 'Regular Client not found.' });
      }
      if (cl.createdBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. This client does not belong to you.',
        });
      }
    }
  }

  // Build photos array from uploaded screenshots
  const photos = (req.uploadedPhotos || []).map((photo, i) => ({
    url: photo.url,
    capturedAt: photo.capturedAt || new Date(),
    source: 'gallery',
    hash: photo.hash,
  }));

  const log = await CommunicationLog.create({
    doctor: doctor || null,
    client: client || null,
    user: req.user._id,
    channel,
    direction: direction || 'outbound',
    notes,
    contactedAt: contactedAt || new Date(),
    source: 'manual',
    photos,
  });

  res.status(201).json({
    success: true,
    message: 'Communication log created successfully.',
    data: log,
  });
});

/**
 * @desc    Get current user's communication logs
 * @route   GET /api/communication-logs/my
 * @access  Private (BDM, Admin)
 */
const getMyLogs = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, channel, startDate, endDate } = req.query;
  const query = { user: req.user._id, status: 'logged' };

  if (channel) query.channel = channel;
  if (startDate || endDate) {
    query.contactedAt = {};
    if (startDate) query.contactedAt.$gte = new Date(startDate);
    if (endDate) query.contactedAt.$lte = new Date(endDate);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [logs, total] = await Promise.all([
    CommunicationLog.find(query)
      .populate('doctor', 'firstName lastName specialization')
      .populate('client', 'firstName lastName specialization')
      .sort({ contactedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    CommunicationLog.countDocuments(query),
  ]);

  // Sign photo URLs
  const signedLogs = await Promise.all(logs.map((log) => signCommPhotos(log)));

  res.json({
    success: true,
    data: signedLogs,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
  });
});

/**
 * @desc    Get logs for a specific VIP Client
 * @route   GET /api/communication-logs/doctor/:doctorId
 * @access  Private (BDM sees own, Admin sees all)
 */
const getLogsByDoctor = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, channel, sort: sortParam, source } = req.query;
  const query = { doctor: req.params.doctorId, status: 'logged' };

  // BDM can only see their own logs for this doctor
  if (!isAdminLike(req.user.role)) {
    query.user = req.user._id;
  }

  if (channel) query.channel = channel;
  if (source) query.source = source;

  const sortDir = sortParam === 'asc' ? 1 : -1;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [logs, total] = await Promise.all([
    CommunicationLog.find(query)
      .populate('user', 'name email')
      .populate('doctor', 'firstName lastName specialization')
      .sort({ contactedAt: sortDir })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    CommunicationLog.countDocuments(query),
  ]);

  const signedLogs = await Promise.all(logs.map((log) => signCommPhotos(log)));

  res.json({
    success: true,
    data: signedLogs,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
  });
});

/**
 * @desc    Get logs for a specific Regular Client
 * @route   GET /api/communication-logs/client/:clientId
 * @access  Private (BDM sees own, Admin sees all)
 */
const getLogsByClient = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, channel } = req.query;
  const query = { client: req.params.clientId, status: 'logged' };

  if (!isAdminLike(req.user.role)) {
    query.user = req.user._id;
  }

  if (channel) query.channel = channel;

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [logs, total] = await Promise.all([
    CommunicationLog.find(query)
      .populate('user', 'name email')
      .populate('client', 'firstName lastName specialization')
      .sort({ contactedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    CommunicationLog.countDocuments(query),
  ]);

  const signedLogs = await Promise.all(logs.map((log) => signCommPhotos(log)));

  res.json({
    success: true,
    data: signedLogs,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
  });
});

/**
 * @desc    Get all communication logs (admin)
 * @route   GET /api/communication-logs
 * @access  Private (Admin)
 */
const getAllLogs = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, channel, userId, doctorId, clientId, startDate, endDate } = req.query;
  const query = { status: 'logged' };

  if (channel) query.channel = channel;
  if (userId) query.user = userId;
  if (doctorId) query.doctor = doctorId;
  if (clientId) query.client = clientId;
  if (startDate || endDate) {
    query.contactedAt = {};
    if (startDate) query.contactedAt.$gte = new Date(startDate);
    if (endDate) query.contactedAt.$lte = new Date(endDate);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const [logs, total] = await Promise.all([
    CommunicationLog.find(query)
      .populate('user', 'name email')
      .populate('doctor', 'firstName lastName specialization')
      .populate('client', 'firstName lastName specialization')
      .sort({ contactedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    CommunicationLog.countDocuments(query),
  ]);

  const signedLogs = await Promise.all(logs.map((log) => signCommPhotos(log)));

  res.json({
    success: true,
    data: signedLogs,
    pagination: {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      pages: Math.ceil(total / parseInt(limit, 10)),
    },
  });
});

/**
 * @desc    Get a single communication log by ID
 * @route   GET /api/communication-logs/:id
 * @access  Private (BDM sees own, Admin sees all)
 */
const getLogById = catchAsync(async (req, res) => {
  const log = await CommunicationLog.findById(req.params.id)
    .populate('user', 'name email')
    .populate('doctor', 'firstName lastName specialization clinicOfficeAddress locality province phone email')
    .populate('client', 'firstName lastName specialization clinicOfficeAddress locality province phone email');

  if (!log) {
    throw new NotFoundError('Communication log not found');
  }

  // BDM can only see their own logs
  if (!isAdminLike(req.user.role) && log.user._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only view your own communication logs.',
    });
  }

  const signedLog = await signCommPhotos(log);

  res.json({
    success: true,
    data: signedLog,
  });
});

/**
 * @desc    Archive a communication log
 * @route   PATCH /api/communication-logs/:id/archive
 * @access  Private (Creator or Admin)
 */
const archiveLog = catchAsync(async (req, res) => {
  const log = await CommunicationLog.findById(req.params.id);

  if (!log) {
    throw new NotFoundError('Communication log not found');
  }

  // Only creator or admin can archive
  if (!isAdminLike(req.user.role) && log.user.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Only the creator or admin can archive this log.',
    });
  }

  log.status = 'archived';
  await log.save();

  res.json({
    success: true,
    message: 'Communication log archived.',
    data: log,
  });
});

/**
 * @desc    Send a message via API (Phase 2)
 * @route   POST /api/communication-logs/send
 * @access  Private (BDM, Admin)
 */
const sendMessage = catchAsync(async (req, res) => {
  const { doctorId, clientId, channel, message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'Message content is required.' });
  }
  if (!doctorId && !clientId) {
    return res.status(400).json({ success: false, message: 'Either a VIP Client or Regular Client must be selected.' });
  }

  // Look up contact info for the selected channel
  let recipientContact = null;
  let targetDoc = null;
  let targetClient = null;

  if (doctorId) {
    targetDoc = await Doctor.findById(doctorId).lean();
    if (!targetDoc) {
      return res.status(404).json({ success: false, message: 'VIP Client not found.' });
    }
    // BDM access check
    if (!isAdminLike(req.user.role)) {
      const assignedTo = targetDoc.assignedTo?._id || targetDoc.assignedTo;
      if (!assignedTo || assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'This VIP Client is not assigned to you.' });
      }
    }
    recipientContact = getContactForChannel(targetDoc, channel);
  } else {
    targetClient = await Client.findById(clientId).lean();
    if (!targetClient) {
      return res.status(404).json({ success: false, message: 'Regular Client not found.' });
    }
    if (!isAdminLike(req.user.role) && targetClient.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'This client does not belong to you.' });
    }
    recipientContact = getContactForChannel(targetClient, channel);
  }

  if (!recipientContact) {
    return res.status(400).json({
      success: false,
      message: `No ${channel} contact info found for this client. Please update their profile first.`,
    });
  }

  // Send via the appropriate channel
  let sendResult;
  try {
    sendResult = await dispatchMessage(channel, recipientContact, message);
  } catch (err) {
    console.error(`[CommLog] Send failed via ${channel}:`, err.message);
    return res.status(502).json({
      success: false,
      message: `Failed to send via ${channel}: ${err.message}`,
    });
  }

  // Create auto-logged communication record
  const log = await CommunicationLog.create({
    doctor: doctorId || null,
    client: clientId || null,
    user: req.user._id,
    channel,
    direction: 'outbound',
    source: 'api',
    messageContent: message,
    externalMessageId: sendResult.externalId || null,
    deliveryStatus: sendResult.success ? 'sent' : 'failed',
    contactedAt: new Date(),
  });

  res.status(201).json({
    success: true,
    message: `Message sent via ${channel}.`,
    data: log,
  });
});

/**
 * @desc    Get all unmatched/pending inbound messages (admin)
 * @route   GET /api/communication-logs/unmatched
 * @access  Private (Admin)
 */
const getUnmatched = catchAsync(async (req, res) => {
  const logs = await CommunicationLog.find({ pendingAssignment: true })
    .populate('aiMatchSuggestion.doctorId', 'firstName lastName specialization')
    .sort({ contactedAt: -1 })
    .lean();

  res.json({ success: true, data: logs });
});

/**
 * @desc    Assign a pending log to a doctor (admin)
 * @route   POST /api/communication-logs/:id/assign
 * @access  Private (Admin)
 */
const assignLog = catchAsync(async (req, res) => {
  const { doctorId } = req.body;
  if (!doctorId) {
    return res.status(400).json({ success: false, message: 'doctorId is required.' });
  }

  const log = await CommunicationLog.findById(req.params.id);
  if (!log) throw new NotFoundError('Communication log not found');

  const doctor = await Doctor.findById(doctorId).lean();
  if (!doctor) throw new NotFoundError('VIP Client not found');

  // Link the channel ID on the Doctor if not already set
  const ch = (log.channel || '').toUpperCase();
  const fieldMap = { MESSENGER: 'messengerId', VIBER: 'viberId', WHATSAPP: 'whatsappNumber' };
  const channelField = fieldMap[ch];
  if (channelField && log.senderExternalId && !doctor[channelField]) {
    await Doctor.findByIdAndUpdate(doctorId, { [channelField]: log.senderExternalId });
  }

  log.doctor = doctorId;
  log.user = doctor.assignedTo || req.user._id;
  log.pendingAssignment = false;
  log.aiMatchStatus = 'accepted';
  await log.save();

  res.json({ success: true, message: 'Log assigned to VIP Client.', data: log });
});

/**
 * @desc    Decline the AI suggestion for a pending log (admin)
 * @route   POST /api/communication-logs/:id/decline
 * @access  Private (Admin)
 */
const declineLog = catchAsync(async (req, res) => {
  const log = await CommunicationLog.findById(req.params.id);
  if (!log) throw new NotFoundError('Communication log not found');

  log.aiMatchStatus = 'declined';
  await log.save();

  res.json({ success: true, message: 'AI suggestion declined.', data: log });
});

// ── Helper: get contact info for a channel ──
function getContactForChannel(clientOrDoctor, channel) {
  const ch = (channel || '').toUpperCase();
  switch (ch) {
    case 'WHATSAPP':
      return clientOrDoctor.whatsappNumber || clientOrDoctor.phone;
    case 'VIBER':
      return clientOrDoctor.viberId || clientOrDoctor.phone;
    case 'MESSENGER':
      return clientOrDoctor.messengerId;
    case 'EMAIL':
      return clientOrDoctor.email;
    default:
      return null;
  }
}

// ── Helper: dispatch message via channel API ──
async function dispatchMessage(channel, contact, message) {
  const ch = (channel || '').toUpperCase();
  const { notify } = require('../agents/notificationService');

  switch (ch) {
    case 'WHATSAPP': {
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) {
        return { success: false, error: 'WhatsApp not configured' };
      }
      const https = require('https');
      const payload = JSON.stringify({
        messaging_product: 'whatsapp',
        to: contact,
        type: 'text',
        text: { body: message.substring(0, 4096) },
      });
      return new Promise((resolve) => {
        const req = https.request(
          `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                const externalId = parsed.messages?.[0]?.id || null;
                resolve({ success: res.statusCode === 200, externalId });
              } catch {
                resolve({ success: res.statusCode === 200 });
              }
            });
          }
        );
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.write(payload);
        req.end();
      });
    }

    case 'VIBER': {
      const botToken = process.env.VIBER_BOT_TOKEN;
      if (!botToken) {
        return { success: false, error: 'Viber not configured' };
      }
      const https = require('https');
      const payload = JSON.stringify({
        receiver: contact,
        type: 'text',
        text: message.substring(0, 7000),
      });
      return new Promise((resolve) => {
        const req = https.request('https://chatapi.viber.com/pa/send_message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Viber-Auth-Token': botToken,
          },
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ success: parsed.status === 0, externalId: String(parsed.message_token || '') });
            } catch {
              resolve({ success: false });
            }
          });
        });
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.write(payload);
        req.end();
      });
    }

    case 'MESSENGER': {
      const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;
      if (!pageToken) {
        return { success: false, error: 'Messenger not configured' };
      }
      const https = require('https');
      const payload = JSON.stringify({
        recipient: { id: contact },
        message: { text: message.substring(0, 2000) },
      });
      return new Promise((resolve) => {
        const req = https.request(
          `https://graph.facebook.com/v18.0/me/messages?access_token=${pageToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              try {
                const parsed = JSON.parse(data);
                resolve({ success: res.statusCode === 200, externalId: parsed.message_id || null });
              } catch {
                resolve({ success: res.statusCode === 200 });
              }
            });
          }
        );
        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.write(payload);
        req.end();
      });
    }

    case 'EMAIL': {
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      if (!apiKey || !fromEmail) {
        return { success: false, error: 'Email (Resend) not configured' };
      }
      try {
        const { Resend } = require('resend');
        const resend = new Resend(apiKey);
        const result = await resend.emails.send({
          from: fromEmail,
          to: contact,
          subject: 'Message from your VIP Representative',
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <div style="padding:16px;border:1px solid #e5e7eb;border-radius:8px;">
              ${message.replace(/\n/g, '<br>')}
              <hr style="margin-top:16px;border:none;border-top:1px solid #e5e7eb;">
              <p style="font-size:11px;color:#9ca3af;">Sent via VIP CRM</p>
            </div>
          </div>`,
        });
        return { success: true, externalId: result.id || null };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    default:
      return { success: false, error: `Channel ${channel} does not support API sending` };
  }
}

module.exports = {
  createLog,
  getMyLogs,
  getLogsByDoctor,
  getLogsByClient,
  getAllLogs,
  getLogById,
  archiveLog,
  sendMessage,
  getUnmatched,
  assignLog,
  declineLog,
  // Shared helpers (used by messageTemplateController)
  dispatchMessage,
  getContactForChannel,
};
