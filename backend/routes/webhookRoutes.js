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
const { tryAutoReply } = require('../utils/autoReply');

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
router.post('/whatsapp', express.json(), async (req, res) => {
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
            // Find which doctor has this WhatsApp number
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

              // Auto-reply if outside business hours
              await tryAutoReply({
                channel: 'WHATSAPP',
                contactId: from,
                doctorId: doctor._id,
                userId: doctor.assignedTo,
              });
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

router.post('/messenger', express.json(), async (req, res) => {
  try {
    const body = req.body;
    console.log('[Webhook] Messenger inbound:', JSON.stringify(body));
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

              // Auto-reply if outside business hours
              await tryAutoReply({
                channel: 'MESSENGER',
                contactId: senderId,
                doctorId: doctor._id,
                userId: doctor.assignedTo,
              });
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
// Viber Business Messages Webhooks
// ═══════════════════════════════════════════

router.post('/viber', express.json(), async (req, res) => {
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

          // Auto-reply if outside business hours
          await tryAutoReply({
            channel: 'VIBER',
            contactId: senderId,
            doctorId: doctor._id,
            userId: doctor.assignedTo,
          });
        }
      }
    }
  } catch (err) {
    console.error('[Webhook] Viber error:', err.message);
  }
  res.sendStatus(200);
});

module.exports = router;
