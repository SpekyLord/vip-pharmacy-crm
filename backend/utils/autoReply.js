/**
 * Auto-Reply Helper — Chatbot Auto-Response
 *
 * When an inbound message arrives via webhook and the assigned BDM is
 * unavailable (outside business hours), sends a configurable canned response.
 *
 * Settings-driven (all configurable from ERP Control Center):
 *   - AUTOREPLY_ENABLED: master toggle
 *   - AUTOREPLY_BUSINESS_HOURS_START / END: "HH:mm" in PHT (Asia/Manila)
 *   - AUTOREPLY_WORK_DAYS: array of day numbers (0=Sun..6=Sat)
 *   - AUTOREPLY_MESSAGE: the canned response text
 *   - AUTOREPLY_COOLDOWN_MINUTES: suppress re-sends within N minutes per contact
 *
 * Free on all platforms — uses the same dispatchMessage() as manual sends.
 */

const CommunicationLog = require('../models/CommunicationLog');

// In-memory cooldown map: `${channel}:${contactId}` → lastSentTimestamp
const _cooldownMap = new Map();

/**
 * Check if we're outside business hours (PHT = Asia/Manila).
 * Returns true if auto-reply should fire.
 */
function isOutsideBusinessHours(settings) {
  const now = new Date();
  // Convert to PHT
  const pht = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const day = pht.getDay(); // 0=Sun..6=Sat
  const hours = pht.getHours();
  const minutes = pht.getMinutes();
  const currentTime = hours * 60 + minutes;

  const workDays = settings.AUTOREPLY_WORK_DAYS || [1, 2, 3, 4, 5];
  const startParts = (settings.AUTOREPLY_BUSINESS_HOURS_START || '08:00').split(':');
  const endParts = (settings.AUTOREPLY_BUSINESS_HOURS_END || '17:00').split(':');
  const startTime = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
  const endTime = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);

  // Outside business hours if: not a work day, or before start, or after end
  if (!workDays.includes(day)) return true;
  if (currentTime < startTime || currentTime >= endTime) return true;
  return false;
}

/**
 * Check cooldown — returns true if we should suppress the auto-reply.
 */
function isCooldownActive(channel, contactId, cooldownMinutes) {
  const key = `${channel}:${contactId}`;
  const lastSent = _cooldownMap.get(key);
  if (!lastSent) return false;
  const elapsed = (Date.now() - lastSent) / 60000;
  return elapsed < cooldownMinutes;
}

/**
 * Record that we just sent an auto-reply.
 */
function setCooldown(channel, contactId) {
  const key = `${channel}:${contactId}`;
  _cooldownMap.set(key, Date.now());
}

/**
 * Main entry: attempt to send auto-reply for an inbound message.
 *
 * @param {Object} opts
 * @param {string} opts.channel      — 'WHATSAPP', 'VIBER', 'MESSENGER'
 * @param {string} opts.contactId    — the sender's platform ID / phone number
 * @param {ObjectId} opts.doctorId   — resolved doctor._id (if found)
 * @param {ObjectId} opts.userId     — assigned BDM user._id (for logging)
 */
async function tryAutoReply({ channel, contactId, doctorId, userId }) {
  try {
    // Lazy-load settings to avoid circular deps at module level
    const Settings = require('../erp/models/Settings');
    const settings = await Settings.getSettings();

    if (!settings.AUTOREPLY_ENABLED) return;
    if (!isOutsideBusinessHours(settings)) return;

    const cooldown = settings.AUTOREPLY_COOLDOWN_MINUTES || 60;
    if (isCooldownActive(channel, contactId, cooldown)) return;

    const message = settings.AUTOREPLY_MESSAGE;
    if (!message) return;

    // Dispatch via the same channel
    const { dispatchMessage } = require('../controllers/communicationLogController');
    const result = await dispatchMessage(channel, contactId, message);

    if (result.success) {
      setCooldown(channel, contactId);

      // Log the auto-reply
      await CommunicationLog.create({
        doctor: doctorId || null,
        client: null,
        user: userId,
        channel,
        direction: 'outbound',
        source: 'api',
        messageContent: message,
        externalMessageId: result.externalId || null,
        deliveryStatus: 'sent',
        contactedAt: new Date(),
        notes: 'Auto-reply (outside business hours)',
      });
    }
  } catch (err) {
    console.error(`[AutoReply] Error sending auto-reply via ${channel}:`, err.message);
  }
}

module.exports = { tryAutoReply, isOutsideBusinessHours };
