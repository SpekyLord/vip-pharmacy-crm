/**
 * Opt-Out Helper — Phase M1.11 (Apr 2026)
 *
 * Honors the Privacy Policy promise: "Reply with STOP, UNSUBSCRIBE, or OPT OUT
 * on any messaging channel" to be removed from marketing on that channel.
 *
 * Contract:
 *   - Called by each inbound webhook handler (Messenger, Viber, WhatsApp) BEFORE
 *     any binding, AI-match, or pendingAssignment fallback.
 *   - On a keyword hit, resolves the sender by provider-ID to a Doctor OR Client,
 *     writes `marketingConsent.<CHANNEL>.withdrawn_at = now` + `consented = false`,
 *     records a CommunicationLog with `source='opt_out'`, and fires an ack message
 *     on the same channel (best-effort — failure does NOT roll back the consent write).
 *   - Unknown senders (no Doctor/Client bound) are still logged to the pending-triage
 *     queue with source='opt_out' so admins can see the opt-out text; ack is still sent.
 *   - Idempotent: repeat STOP from same sender re-stamps withdrawn_at without error.
 *
 * Lookup-driven via Settings (OPT_OUT_KEYWORDS, OPT_OUT_ACK_TEMPLATE, OPT_OUT_ENABLED).
 * If Settings lookup throws, the helper falls back to the hardcoded default list so
 * a DB outage cannot break a compliance-critical control.
 *
 * Returns `{ handled: true }` when the caller should short-circuit further processing
 * (bind / AI-match / pendingAssignment), or `{ handled: false }` to continue normally.
 */

const CommunicationLog = require('../models/CommunicationLog');

const FALLBACK_KEYWORDS = ['STOP', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT', 'UNSUB'];
const FALLBACK_ACK =
  "You've been unsubscribed from {CHANNEL} messages. To resume, contact your VIP representative.";

// Channel → (Doctor/Client field storing the provider's sender ID)
const PROVIDER_FIELD = {
  MESSENGER: 'messengerId',
  VIBER: 'viberId',
  WHATSAPP: 'whatsappNumber',
};

// Display name used in the ack (replaces {CHANNEL})
const CHANNEL_LABEL = {
  MESSENGER: 'Messenger',
  VIBER: 'Viber',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
};

/**
 * Load Settings with a safety fallback. Never throws.
 * Returns `{ enabled, keywords: string[], ackTemplate }`.
 */
async function loadOptOutConfig() {
  try {
    const Settings = require('../erp/models/Settings');
    const s = await Settings.getSettings();
    return {
      enabled: s?.OPT_OUT_ENABLED !== false, // default true
      keywords:
        Array.isArray(s?.OPT_OUT_KEYWORDS) && s.OPT_OUT_KEYWORDS.length
          ? s.OPT_OUT_KEYWORDS
          : FALLBACK_KEYWORDS,
      ackTemplate:
        typeof s?.OPT_OUT_ACK_TEMPLATE === 'string' && s.OPT_OUT_ACK_TEMPLATE
          ? s.OPT_OUT_ACK_TEMPLATE
          : FALLBACK_ACK,
    };
  } catch (err) {
    console.error('[OptOut] Settings load failed, using fallbacks:', err.message);
    return { enabled: true, keywords: FALLBACK_KEYWORDS, ackTemplate: FALLBACK_ACK };
  }
}

/**
 * Exact match after trim + uppercase. Exact-match (not prefix/includes) is intentional:
 *   - Aligns with carrier standards (TCPA, RFC 8058) for keyword compliance
 *   - Avoids false-positives like "please don't stop sending product updates"
 */
function isOptOutKeyword(text, keywords) {
  if (typeof text !== 'string') return false;
  const normalized = text.trim().toUpperCase();
  if (!normalized) return false;
  const list = Array.isArray(keywords) && keywords.length ? keywords : FALLBACK_KEYWORDS;
  return list.map((k) => String(k).trim().toUpperCase()).includes(normalized);
}

/**
 * Resolve the inbound sender to either a Doctor or Client via provider-ID lookup.
 * Returns `{ kind: 'doc'|'cli', id, userId, record }` or null if unknown.
 */
async function resolveSender({ channel, senderId }) {
  const field = PROVIDER_FIELD[channel];
  if (!field || !senderId) return null;

  const Doctor = require('../models/Doctor');
  const Client = require('../models/Client');

  // Doctor takes precedence (VIP channel binding is authoritative). If both had the
  // same external ID somehow, Doctor wins because the bindFromInviteRef path writes
  // Doctor on doc_ refs first.
  // Phase A.5.4 — also project primaryAssignee so the helper can pick a single
  // owner BDM (assignedTo is an array now).
  const doctor = await Doctor.findOne({ [field]: senderId })
    .select('_id assignedTo primaryAssignee marketingConsent').lean();
  if (doctor) {
    const { getPrimaryAssigneeId } = require('./assigneeAccess');
    return { kind: 'doc', id: doctor._id, userId: getPrimaryAssigneeId(doctor), record: doctor };
  }

  const client = await Client.findOne({ [field]: senderId }).select('_id createdBy marketingConsent').lean();
  if (client) {
    return { kind: 'cli', id: client._id, userId: client.createdBy || null, record: client };
  }

  return null;
}

/**
 * Withdraw consent on the resolved Doctor/Client for the given channel. Idempotent.
 * Returns true on success, false on error.
 */
async function withdrawConsent({ kind, id, channel }) {
  const Model = kind === 'doc' ? require('../models/Doctor') : require('../models/Client');
  const now = new Date();
  try {
    await Model.findByIdAndUpdate(id, {
      [`marketingConsent.${channel}.consented`]: false,
      [`marketingConsent.${channel}.withdrawn_at`]: now,
      [`marketingConsent.${channel}.source`]: 'opt_out_keyword',
    });
    return true;
  } catch (err) {
    console.error(`[OptOut] Consent withdrawal failed for ${kind}:${id} on ${channel}:`, err.message);
    return false;
  }
}

/**
 * Send the ack message on the same channel. Fire-and-forget — failure logged but
 * does NOT propagate. The compliance-critical write (consent) must never be
 * blocked by a transient dispatch issue.
 * Returns `{ success, externalId }` or `{ success: false }`.
 */
async function sendAck({ channel, senderId, ackTemplate }) {
  try {
    const label = CHANNEL_LABEL[channel] || channel;
    const message = String(ackTemplate || FALLBACK_ACK).replace(/\{CHANNEL\}/g, label);
    const { dispatchMessage } = require('../controllers/communicationLogController');
    const result = await dispatchMessage(channel, senderId, message);
    if (!result?.success) {
      console.warn(`[OptOut] Ack dispatch failed on ${channel}:`, result?.error || 'unknown');
    }
    return result || { success: false };
  } catch (err) {
    console.error(`[OptOut] Ack dispatch threw on ${channel}:`, err.message);
    return { success: false };
  }
}

/**
 * Main entry — call from each inbound webhook handler BEFORE any bind / match logic.
 *
 * @param {Object} opts
 * @param {'MESSENGER'|'VIBER'|'WHATSAPP'} opts.channel
 * @param {string} opts.text          - inbound message text
 * @param {string} opts.senderId      - provider sender ID (PSID / Viber userId / phone)
 * @param {string} [opts.messageId]   - externalMessageId for dedup
 * @param {string} [opts.senderName]  - best-effort name (for pending-triage entries)
 * @param {string} [opts.senderProfilePic]
 *
 * @returns {Promise<{ handled: boolean }>}
 */
async function handleInboundOptOut({
  channel,
  text,
  senderId,
  messageId,
  senderName,
  senderProfilePic,
}) {
  try {
    if (!channel || !senderId || typeof text !== 'string') {
      return { handled: false };
    }

    const config = await loadOptOutConfig();
    if (!config.enabled) return { handled: false };
    if (!isOptOutKeyword(text, config.keywords)) return { handled: false };

    // From here on, we commit to handling — even if resolution fails, we log + ack.
    const resolved = await resolveSender({ channel, senderId });

    if (resolved) {
      await withdrawConsent({ kind: resolved.kind, id: resolved.id, channel });

      // Audit log — source='opt_out' is the searchable marker. Wrapped in try/catch
      // so a log-persistence failure doesn't swallow the ack.
      try {
        await CommunicationLog.create({
          doctor: resolved.kind === 'doc' ? resolved.id : null,
          client: resolved.kind === 'cli' ? resolved.id : null,
          user: resolved.userId,
          channel,
          direction: 'inbound',
          source: 'opt_out',
          messageContent: text,
          externalMessageId: messageId || null,
          deliveryStatus: 'delivered',
          contactedAt: new Date(),
          senderExternalId: senderId,
          senderName: senderName || null,
          senderProfilePic: senderProfilePic || null,
        });
      } catch (err) {
        console.error('[OptOut] CommunicationLog create failed (resolved sender):', err.message);
      }
    } else {
      // Unknown sender — still log to pending-triage so admins can see the opt-out
      // and manually block any future bind attempts. pendingAssignment=true bypasses
      // the pre-validate user-required rule.
      try {
        await CommunicationLog.create({
          user: null,
          channel,
          direction: 'inbound',
          source: 'opt_out',
          messageContent: text,
          externalMessageId: messageId || null,
          deliveryStatus: 'delivered',
          contactedAt: new Date(),
          pendingAssignment: true,
          senderExternalId: senderId,
          senderName: senderName || null,
          senderProfilePic: senderProfilePic || null,
        });
      } catch (err) {
        console.error('[OptOut] CommunicationLog create failed (unknown sender):', err.message);
      }
    }

    // Ack is fire-and-forget on the same channel. If the provider is misconfigured
    // (missing token) it returns { success: false } and we proceed. The consent
    // write above is what satisfies the compliance requirement.
    await sendAck({ channel, senderId, ackTemplate: config.ackTemplate });

    return { handled: true };
  } catch (err) {
    // Last-resort catch: never let opt-out throw back into the webhook. Meta retries
    // on 5xx and we already persisted what we could.
    console.error(`[OptOut] Unexpected failure on ${channel}:`, err.message);
    return { handled: true }; // treat as handled so caller doesn't double-process
  }
}

module.exports = {
  handleInboundOptOut,
  isOptOutKeyword,
  // exported for unit testing / admin tooling
  loadOptOutConfig,
  PROVIDER_FIELD,
  CHANNEL_LABEL,
};
