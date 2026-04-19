/**
 * Webhook Routes — External messaging platform callbacks
 *
 * These routes do NOT use protect middleware (external services call them).
 * Each handler verifies the request signature per provider.
 *
 * GET  /api/webhooks/whatsapp   — WhatsApp webhook verification
 * POST /api/webhooks/whatsapp   — WhatsApp delivery/read receipts + inbound
 * GET  /api/webhooks/messenger  — Messenger webhook verification
 * POST /api/webhooks/messenger  — Messenger delivery/read receipts + inbound
 * POST /api/webhooks/viber      — Viber delivery/seen callbacks
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const CommunicationLog = require('../models/CommunicationLog');
const DataDeletionRequest = require('../models/DataDeletionRequest');
const { handleFacebookDataDeletion } = require('../services/dataDeletionService');
const { tryAutoReply } = require('../utils/autoReply');
const { fetchSenderInfo, matchSenderToDoctor } = require('../utils/aiMatcher');

// Capture raw request bytes so HMAC signatures can be verified against the exact payload
// Meta and Viber sign the raw body, so re-serializing JSON breaks the signature.
const rawJson = express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
});

function timingSafeHexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Verify X-Hub-Signature-256 from Meta (Messenger and WhatsApp Cloud API).
function verifyMetaSignature(req, res, next) {
  const secret = process.env.FB_APP_SECRET;
  if (!secret) {
    console.error('[Webhook] FB_APP_SECRET is not set; rejecting Meta webhook');
    return res.sendStatus(500);
  }
  const header = req.get('x-hub-signature-256') || '';
  const [algo, signature] = header.split('=');
  if (algo !== 'sha256' || !signature) {
    console.warn('[Webhook] Meta signature header missing or malformed');
    return res.sendStatus(401);
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex');
  if (!timingSafeHexEqual(signature, expected)) {
    console.warn('[Webhook] Meta signature mismatch');
    return res.sendStatus(401);
  }
  next();
}

// Verify X-Viber-Content-Signature against HMAC-SHA256(body, bot_token).
function verifyViberSignature(req, res, next) {
  const token = process.env.VIBER_BOT_TOKEN;
  if (!token) {
    console.error('[Webhook] VIBER_BOT_TOKEN is not set; rejecting Viber webhook');
    return res.sendStatus(500);
  }
  const signature = req.get('x-viber-content-signature') || '';
  if (!signature) {
    console.warn('[Webhook] Viber signature header missing');
    return res.sendStatus(401);
  }
  const expected = crypto
    .createHmac('sha256', token)
    .update(req.rawBody || Buffer.alloc(0))
    .digest('hex');
  if (!timingSafeHexEqual(signature, expected)) {
    console.warn('[Webhook] Viber signature mismatch');
    return res.sendStatus(401);
  }
  next();
}

// ═══════════════════════════════════════════
// WhatsApp Cloud API Webhooks
// ═══════════════════════════════════════════

// Verification (GET) — Meta sends a challenge to verify the webhook URL
router.get('/whatsapp', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] WhatsApp verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming events (POST)
router.post('/whatsapp', rawJson, verifyMetaSignature, async (req, res) => {
  try {
    const body = req.body;
    if (!body?.entry) return res.sendStatus(200);

    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // Status updates (sent, delivered, read, failed)
        for (const status of value.statuses || []) {
          const externalId = status.id;
          const newStatus = status.status; // sent, delivered, read, failed
          if (externalId && ['delivered', 'read', 'failed'].includes(newStatus)) {
            await CommunicationLog.findOneAndUpdate(
              { externalMessageId: externalId },
              { deliveryStatus: newStatus }
            );
          }
        }

        // Inbound messages from doctors
        for (const msg of value.messages || []) {
          const from = msg.from; // phone number
          const text = msg.text?.body || '';
          if (from && text) {
            const Doctor = require('../models/Doctor');
            const doctor = await Doctor.findOne({
              $or: [{ whatsappNumber: from }, { phone: from }],
            }).lean();

            if (doctor && doctor.assignedTo) {
              await CommunicationLog.create({
                doctor: doctor._id,
                user: doctor.assignedTo,
                channel: 'WHATSAPP',
                direction: 'inbound',
                source: 'api',
                messageContent: text,
                externalMessageId: msg.id,
                deliveryStatus: 'delivered',
                contactedAt: new Date(),
              });
              await tryAutoReply({ channel: 'WHATSAPP', contactId: from, doctorId: doctor._id, userId: doctor.assignedTo });
            } else {
              // Unknown sender — try AI matching
              const senderInfo = await fetchSenderInfo('WHATSAPP', from);
              const senderName = senderInfo?.name || from;
              const match = await matchSenderToDoctor(senderName, text, 'WHATSAPP');

              if (match && match.confidence === 'high') {
                const matched = await Doctor.findByIdAndUpdate(
                  match.doctorId,
                  { whatsappNumber: from },
                  { new: true }
                ).lean();
                if (matched) {
                  await CommunicationLog.create({
                    doctor: matched._id,
                    user: matched.assignedTo,
                    channel: 'WHATSAPP',
                    direction: 'inbound',
                    source: 'api',
                    messageContent: text,
                    externalMessageId: msg.id,
                    deliveryStatus: 'delivered',
                    contactedAt: new Date(),
                    senderExternalId: from,
                    senderName,
                    senderProfilePic: senderInfo?.profilePic || null,
                    aiMatchStatus: 'auto_assigned',
                  });
                  await tryAutoReply({ channel: 'WHATSAPP', contactId: from, doctorId: matched._id, userId: matched.assignedTo });
                }
              } else {
                await CommunicationLog.create({
                  user: null,
                  channel: 'WHATSAPP',
                  direction: 'inbound',
                  source: 'api',
                  messageContent: text,
                  externalMessageId: msg.id,
                  deliveryStatus: 'delivered',
                  contactedAt: new Date(),
                  pendingAssignment: true,
                  senderExternalId: from,
                  senderName,
                  senderProfilePic: senderInfo?.profilePic || null,
                  aiMatchSuggestion: match ? { doctorId: match.doctorId, confidence: match.confidence, reason: match.reason } : undefined,
                  aiMatchStatus: match ? 'pending' : undefined,
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] WhatsApp error:', err.message);
  }
  res.sendStatus(200);
});

// ═══════════════════════════════════════════
// Facebook Messenger Webhooks
// ═══════════════════════════════════════════

router.get('/messenger', (req, res) => {
  const verifyToken = process.env.FB_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] Messenger verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/messenger', rawJson, verifyMetaSignature, async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'page') return res.sendStatus(200);

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        // Delivery receipts
        if (event.delivery) {
          for (const mid of event.delivery.mids || []) {
            await CommunicationLog.findOneAndUpdate(
              { externalMessageId: mid },
              { deliveryStatus: 'delivered' }
            );
          }
        }

        // Read receipts
        if (event.read) {
          // Mark all unread messages to this sender as read
          const senderId = event.sender?.id;
          if (senderId) {
            const Doctor = require('../models/Doctor');
            const doctor = await Doctor.findOne({ messengerId: senderId }).lean();
            if (doctor) {
              await CommunicationLog.updateMany(
                { doctor: doctor._id, channel: 'MESSENGER', deliveryStatus: { $in: ['sent', 'delivered'] } },
                { deliveryStatus: 'read' }
              );
            }
          }
        }

        // Inbound messages
        if (event.message && event.sender) {
          const senderId = event.sender.id;
          const text = event.message.text || '';
          if (senderId && text) {
            const Doctor = require('../models/Doctor');
            const doctor = await Doctor.findOne({ messengerId: senderId }).lean();
            if (doctor && doctor.assignedTo) {
              await CommunicationLog.create({
                doctor: doctor._id,
                user: doctor.assignedTo,
                channel: 'MESSENGER',
                direction: 'inbound',
                source: 'api',
                messageContent: text,
                externalMessageId: event.message.mid,
                deliveryStatus: 'delivered',
                contactedAt: new Date(),
              });
              await tryAutoReply({ channel: 'MESSENGER', contactId: senderId, doctorId: doctor._id, userId: doctor.assignedTo });
            } else {
              // Unknown sender — try AI matching
              const senderInfo = await fetchSenderInfo('MESSENGER', senderId);
              const senderName = senderInfo?.name || senderId;
              const match = await matchSenderToDoctor(senderName, text, 'MESSENGER');

              if (match && match.confidence === 'high') {
                const matched = await Doctor.findByIdAndUpdate(
                  match.doctorId,
                  { messengerId: senderId },
                  { new: true }
                ).lean();
                if (matched) {
                  await CommunicationLog.create({
                    doctor: matched._id,
                    user: matched.assignedTo,
                    channel: 'MESSENGER',
                    direction: 'inbound',
                    source: 'api',
                    messageContent: text,
                    externalMessageId: event.message.mid,
                    deliveryStatus: 'delivered',
                    contactedAt: new Date(),
                    senderExternalId: senderId,
                    senderName,
                    senderProfilePic: senderInfo?.profilePic || null,
                    aiMatchStatus: 'auto_assigned',
                  });
                  await tryAutoReply({ channel: 'MESSENGER', contactId: senderId, doctorId: matched._id, userId: matched.assignedTo });
                }
              } else {
                await CommunicationLog.create({
                  user: null,
                  channel: 'MESSENGER',
                  direction: 'inbound',
                  source: 'api',
                  messageContent: text,
                  externalMessageId: event.message.mid,
                  deliveryStatus: 'delivered',
                  contactedAt: new Date(),
                  pendingAssignment: true,
                  senderExternalId: senderId,
                  senderName,
                  senderProfilePic: senderInfo?.profilePic || null,
                  aiMatchSuggestion: match ? { doctorId: match.doctorId, confidence: match.confidence, reason: match.reason } : undefined,
                  aiMatchStatus: match ? 'pending' : undefined,
                });
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Messenger error:', err.message);
  }
  res.sendStatus(200);
});

// ═══════════════════════════════════════════
// Facebook Data Deletion Callback
// ═══════════════════════════════════════════
// Meta posts application/x-www-form-urlencoded: signed_request=<sig>.<payload>
// Response must be JSON: { url, confirmation_code }
// Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

router.post(
  '/facebook/data-deletion',
  express.urlencoded({ extended: false }),
  async (req, res) => {
    try {
      const signedRequest = req.body?.signed_request;
      const confirmationCode = await handleFacebookDataDeletion(signedRequest);

      const baseUrl =
        process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://viosintegrated.net';
      return res.status(200).json({
        url: `${baseUrl}/data-deletion/status/${confirmationCode}`,
        confirmation_code: confirmationCode,
      });
    } catch (err) {
      console.error('[Webhook] Facebook data-deletion error:', err.message);
      return res.status(400).json({ error: err.message });
    }
  }
);

// Public status lookup (used by the frontend status page)
router.get('/facebook/data-deletion/status/:code', async (req, res) => {
  try {
    const request = await DataDeletionRequest.findOne({
      confirmationCode: req.params.code,
    })
      .select('status requestedAt completedAt deletedCounts')
      .lean();

    if (!request) {
      return res.status(404).json({ status: 'not_found' });
    }
    return res.json({
      status: request.status,
      requestedAt: request.requestedAt,
      completedAt: request.completedAt,
      deletedCounts: request.deletedCounts,
    });
  } catch (err) {
    console.error('[Webhook] data-deletion status error:', err.message);
    return res.status(500).json({ error: 'Internal error' });
  }
});

// ═══════════════════════════════════════════
// Viber Business Messages Webhooks
// ═══════════════════════════════════════════

router.post('/viber', rawJson, verifyViberSignature, async (req, res) => {
  try {
    const body = req.body;
    const event = body.event;

    // Delivery receipts
    if (event === 'delivered') {
      const token = String(body.message_token || '');
      if (token) {
        await CommunicationLog.findOneAndUpdate(
          { externalMessageId: token },
          { deliveryStatus: 'delivered' }
        );
      }
    }

    // Seen/read receipts
    if (event === 'seen') {
      const token = String(body.message_token || '');
      if (token) {
        await CommunicationLog.findOneAndUpdate(
          { externalMessageId: token },
          { deliveryStatus: 'read' }
        );
      }
    }

    // Inbound messages
    if (event === 'message' && body.sender && body.message) {
      const senderId = body.sender.id;
      const text = body.message.text || '';
      if (senderId && text) {
        const Doctor = require('../models/Doctor');
        const doctor = await Doctor.findOne({ viberId: senderId }).lean();
        if (doctor && doctor.assignedTo) {
          await CommunicationLog.create({
            doctor: doctor._id,
            user: doctor.assignedTo,
            channel: 'VIBER',
            direction: 'inbound',
            source: 'api',
            messageContent: text,
            externalMessageId: String(body.message_token || ''),
            deliveryStatus: 'delivered',
            contactedAt: new Date(),
          });
          await tryAutoReply({ channel: 'VIBER', contactId: senderId, doctorId: doctor._id, userId: doctor.assignedTo });
        } else {
          // Unknown sender — try AI matching using Viber sender name from body
          const senderName = body.sender.name || senderId;
          const senderProfilePic = body.sender.avatar || null;
          const match = await matchSenderToDoctor(senderName, text, 'VIBER');

          if (match && match.confidence === 'high') {
            const matched = await Doctor.findByIdAndUpdate(
              match.doctorId,
              { viberId: senderId },
              { new: true }
            ).lean();
            if (matched) {
              await CommunicationLog.create({
                doctor: matched._id,
                user: matched.assignedTo,
                channel: 'VIBER',
                direction: 'inbound',
                source: 'api',
                messageContent: text,
                externalMessageId: String(body.message_token || ''),
                deliveryStatus: 'delivered',
                contactedAt: new Date(),
                senderExternalId: senderId,
                senderName,
                senderProfilePic,
                aiMatchStatus: 'auto_assigned',
              });
              await tryAutoReply({ channel: 'VIBER', contactId: senderId, doctorId: matched._id, userId: matched.assignedTo });
            }
          } else {
            await CommunicationLog.create({
              user: null,
              channel: 'VIBER',
              direction: 'inbound',
              source: 'api',
              messageContent: text,
              externalMessageId: String(body.message_token || ''),
              deliveryStatus: 'delivered',
              contactedAt: new Date(),
              pendingAssignment: true,
              senderExternalId: senderId,
              senderName,
              senderProfilePic,
              aiMatchSuggestion: match ? { doctorId: match.doctorId, confidence: match.confidence, reason: match.reason } : undefined,
              aiMatchStatus: match ? 'pending' : undefined,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Viber error:', err.message);
  }
  res.sendStatus(200);
});

module.exports = router;
