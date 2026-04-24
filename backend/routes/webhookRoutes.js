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
const InviteLink = require('../models/InviteLink');
const { handleFacebookDataDeletion } = require('../services/dataDeletionService');
const { tryAutoReply } = require('../utils/autoReply');
const { fetchSenderInfo, matchSenderToDoctor } = require('../utils/aiMatcher');
const { handleInboundOptOut } = require('../utils/optOut');
const { markClmSessionConverted } = require('../controllers/clmController');

/**
 * Phase M1 — Bind an external messaging ID to a Doctor/Client via invite referral.
 *
 * When a BDM sends an invite link like `m.me/<page>?ref=doc_<doctorId>` and the
 * recipient taps + replies, the provider echoes the `ref` back on the first event.
 * We use that to:
 *   1. Set the provider ID on the Doctor/Client (messengerId / viberId / whatsappNumber)
 *   2. Stamp per-channel consent with source='invite_reply'
 *   3. Mark the matching InviteLink record as converted
 *   4. Log the inbound message with source='invite_reply' so it shows up in the
 *      communication log with clear provenance (not an AI-match best-guess)
 *
 * Returns { doctor, client, userId } on success, or null if the ref is invalid /
 * the referenced record is gone. Callers still fall back to AI-match on null.
 */
async function bindFromInviteRef({ ref, channel, senderId, senderName, senderProfilePic, messageId, messageText }) {
  if (!ref || typeof ref !== 'string') return null;
  const match = ref.match(/^(doc|cli)_([a-f0-9]{24})$/i);
  if (!match) return null;
  const [, kind, id] = match;

  const channelField = channel === 'MESSENGER' ? 'messengerId'
    : channel === 'VIBER' ? 'viberId'
    : channel === 'WHATSAPP' ? 'whatsappNumber' : null;
  if (!channelField) return null;

  const now = new Date();
  const consentPath = `marketingConsent.${channel}`;

  let bound = null;
  if (kind === 'doc') {
    const Doctor = require('../models/Doctor');
    bound = await Doctor.findByIdAndUpdate(
      id,
      {
        [channelField]: senderId,
        [`${consentPath}.consented`]: true,
        [`${consentPath}.at`]: now,
        [`${consentPath}.source`]: 'invite_reply',
        [`${consentPath}.withdrawn_at`]: null,
      },
      { new: true }
    ).lean();
  } else {
    const Client = require('../models/Client');
    bound = await Client.findByIdAndUpdate(
      id,
      {
        [channelField]: senderId,
        [`${consentPath}.consented`]: true,
        [`${consentPath}.at`]: now,
        [`${consentPath}.source`]: 'invite_reply',
        [`${consentPath}.withdrawn_at`]: null,
      },
      { new: true }
    ).lean();
  }
  if (!bound) return null;

  // Mark the InviteLink as converted (best-effort; missing record is fine for old links)
  await InviteLink.findOneAndUpdate(
    { ref, status: { $in: ['sent', 'opened'] } },
    { status: 'converted', repliedAt: now },
    { sort: { sentAt: -1 } }
  );

  // Log the inbound with invite_reply provenance so the "Pending Assignment" triage
  // page does not pick it up as an unknown sender.
  const userId = kind === 'doc' ? bound.assignedTo : bound.createdBy;
  await CommunicationLog.create({
    doctor: kind === 'doc' ? bound._id : null,
    client: kind === 'cli' ? bound._id : null,
    user: userId || null,
    channel,
    direction: 'inbound',
    source: 'invite_reply',
    messageContent: messageText || '',
    externalMessageId: messageId,
    deliveryStatus: 'delivered',
    contactedAt: now,
    senderExternalId: senderId,
    senderName: senderName || null,
    senderProfilePic: senderProfilePic || null,
    aiMatchStatus: 'auto_assigned',
  });

  return { doctor: kind === 'doc' ? bound : null, client: kind === 'cli' ? bound : null, userId };
}

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
            // Phase M1.11 — Honor STOP/UNSUBSCRIBE/OPT OUT before any bind/match logic.
            // Keyword match withdraws consent + logs + acks. Returning { handled: true }
            // short-circuits the remaining processing for this message.
            const optOut = await handleInboundOptOut({
              channel: 'WHATSAPP',
              text,
              senderId: from,
              messageId: msg.id,
            });
            if (optOut?.handled) continue;

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

        // Phase M1 — Referral from m.me/<page>?ref=doc_<id> click-through.
        // Fires as a standalone postback the first time the user opens the chat via the link.
        // We record the opened state; the actual binding happens when they send the first message.
        //
        // CLM conversion (this PR) — refs shaped `CLM_<sessionId>_<doctorId>_<userId>`
        // short-circuit to the CLM helper; they never match an InviteLink row anyway.
        if (event.referral?.ref || event.postback?.referral?.ref) {
          const ref = event.referral?.ref || event.postback?.referral?.ref;
          if (typeof ref === 'string' && ref.startsWith('CLM_')) {
            await markClmSessionConverted(ref);
            continue;
          }
          await InviteLink.findOneAndUpdate(
            { ref, channel: 'MESSENGER', status: 'sent' },
            { status: 'opened', openedAt: new Date() },
            { sort: { sentAt: -1 } }
          );
        }

        // Inbound messages
        if (event.message && event.sender) {
          const senderId = event.sender.id;
          const text = event.message.text || '';
          if (senderId && text) {
            // Phase M1.11 — Opt-out runs BEFORE bindFromInviteRef so a STOP message
            // that arrives with ?ref=doc_<id> on first contact does NOT auto-consent
            // the recipient moments before withdrawing it. If matched, the remaining
            // bind / AI-match / pending-triage paths are skipped for this event.
            const optOut = await handleInboundOptOut({
              channel: 'MESSENGER',
              text,
              senderId,
              messageId: event.message.mid,
            });
            if (optOut?.handled) continue;

            // Phase M1 — If this message carries a referral `ref`, bind the PSID to
            // the Doctor/Client named in the ref and stamp consent. This takes
            // precedence over `messengerId` lookup and AI-match.
            //
            // CLM conversion short-circuits first — a VIP Client who scans the
            // slide-6 QR arrives here with `CLM_<sessionId>_<doctorId>_<userId>`.
            // Record the conversion and skip the bind/AI-match pipeline.
            const inviteRef = event.message.referral?.ref || event.referral?.ref;
            if (inviteRef) {
              if (typeof inviteRef === 'string' && inviteRef.startsWith('CLM_')) {
                await markClmSessionConverted(inviteRef);
                continue;
              }
              const bound = await bindFromInviteRef({
                ref: inviteRef,
                channel: 'MESSENGER',
                senderId,
                senderName: null,
                senderProfilePic: null,
                messageId: event.message.mid,
                messageText: text,
              });
              if (bound) {
                await tryAutoReply({
                  channel: 'MESSENGER',
                  contactId: senderId,
                  doctorId: bound.doctor?._id,
                  userId: bound.userId,
                });
                continue;
              }
              // ref was malformed or target gone — fall through to the normal path
            }

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
        // Phase M1.11 — Opt-out runs BEFORE tracking_data bind so a STOP reply on an
        // invite link does NOT auto-consent before withdrawing. Unlike Messenger's
        // for-of `continue`, Viber delivers one event per request — return early.
        const optOut = await handleInboundOptOut({
          channel: 'VIBER',
          text,
          senderId,
          messageId: String(body.message_token || ''),
          senderName: body.sender.name || null,
          senderProfilePic: body.sender.avatar || null,
        });
        if (optOut?.handled) return res.sendStatus(200);

        // Phase M1 — Viber passes the deep-link context on `message.tracking_data`
        // (for `viber://pa?chatURI=<bot>&context=<ref>` links). Bind and consent here
        // before falling through to viberId lookup.
        const inviteRef = body.message.tracking_data || body.context;
        if (inviteRef) {
          const bound = await bindFromInviteRef({
            ref: inviteRef,
            channel: 'VIBER',
            senderId,
            senderName: body.sender.name || null,
            senderProfilePic: body.sender.avatar || null,
            messageId: String(body.message_token || ''),
            messageText: text,
          });
          if (bound) {
            await tryAutoReply({
              channel: 'VIBER',
              contactId: senderId,
              doctorId: bound.doctor?._id,
              userId: bound.userId,
            });
            return res.sendStatus(200);
          }
        }

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

// ═══════════════════════════════════════════
// Phase M1 — Public Unsubscribe Endpoint (one-click per RFC 8058)
// ═══════════════════════════════════════════
// Idempotent — re-visits show the confirmed state without error.

const { parseUnsubscribeToken } = require('../utils/unsubscribeToken');

router.get('/unsubscribe/:token', async (req, res) => {
  const parsed = parseUnsubscribeToken(req.params.token);
  if (!parsed) {
    return res.status(400).send(renderUnsubHtml({ ok: false, message: 'Invalid or expired unsubscribe link.' }));
  }
  try {
    const Model = parsed.kind === 'doc' ? require('../models/Doctor') : require('../models/Client');
    await Model.findByIdAndUpdate(parsed.id, {
      [`marketingConsent.${parsed.channel}.withdrawn_at`]: new Date(),
      [`marketingConsent.${parsed.channel}.consented`]: false,
    });
    return res.send(renderUnsubHtml({ ok: true, channel: parsed.channel }));
  } catch (err) {
    console.error('[Webhook] unsubscribe error:', err.message);
    return res.status(500).send(renderUnsubHtml({ ok: false, message: 'Something went wrong. Try again later.' }));
  }
});

function renderUnsubHtml({ ok, channel, message }) {
  const title = ok ? 'Unsubscribed' : 'Unsubscribe Failed';
  const body = ok
    ? `<p>You have been unsubscribed from <strong>${channel}</strong> messages. We won't contact you on this channel again.</p><p style="color:#64748b;font-size:13px">If this was a mistake, contact your VIP representative to re-opt in.</p>`
    : `<p>${message}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:24px;color:#0f172a"><h1 style="font-size:22px;margin:0 0 12px">${title}</h1>${body}</body></html>`;
}

module.exports = router;
