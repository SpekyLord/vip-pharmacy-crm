/**
 * Multi-Channel Notification Service
 *
 * All agents route alerts through this service.
 * Channels: in-app (now), email (now), SMS (add API key later), Messenger (add API key later)
 *
 * Usage:
 *   const { notify } = require('./notificationService');
 *   await notify({
 *     recipient_id: userId,           // or 'PRESIDENT', 'ALL_BDMS'
 *     title: 'Alert Title',
 *     body: 'Alert body text',
 *     category: 'compliance_alert',   // matches MessageInbox categories
 *     priority: 'important',          // normal, important, high
 *     channels: ['in_app', 'email'],  // which channels to use
 *     agent: 'expense_anomaly'        // which agent sent this
 *   });
 */

const MessageInbox = require('../models/MessageInbox');
const User = require('../models/User');
const { ROLES, ROLE_SETS } = require('../constants/roles');

// ═══════════════════════════════════════════
// Channel: In-App Message (ready now)
// ═══════════════════════════════════════════
async function sendInApp({ recipientId, title, body, category, priority, entityId = null, folder = null }) {
  try {
    // Resolve recipient's role + entity for MessageInbox (entity_id is needed
    // for Phase G9 unified inbox folder/list endpoints).
    let recipientRole = 'admin';
    let resolvedEntityId = entityId;
    if (recipientId) {
      const recipient = await User.findById(recipientId).select('role entity_id entity_ids').lean();
      if (recipient) {
        recipientRole = recipient.role;
        if (!resolvedEntityId) {
          resolvedEntityId = recipient.entity_id
            || (Array.isArray(recipient.entity_ids) && recipient.entity_ids.length > 0
              ? recipient.entity_ids[0]
              : null);
        }
      }
    }
    // Phase G9.R2 — derive folder from category when caller didn't specify.
    let resolvedFolder = folder;
    if (!resolvedFolder) {
      try {
        const { folderForCategory } = require('../erp/utils/inboxLookups');
        resolvedFolder = folderForCategory(category);
      } catch {
        resolvedFolder = 'INBOX';
      }
    }
    const message = await MessageInbox.create({
      title,
      body,
      category: category || 'system',
      priority: priority || 'normal',
      recipientRole,
      recipientUserId: recipientId || null,
      senderName: 'System Agent',
      senderRole: 'system',
      senderUserId: null,
      entity_id: resolvedEntityId,
      folder: resolvedFolder,
    });
    return { channel: 'in_app', success: true, messageId: message._id?.toString?.() || null };
  } catch (err) {
    console.error('[Agent Notify] In-app failed:', err.message);
    return { channel: 'in_app', success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════
// Channel: Email via Resend (ready now)
// ═══════════════════════════════════════════
async function sendEmail({ recipientEmail, recipientName, title, body }) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      return { channel: 'email', success: false, error: 'RESEND_API_KEY not configured' };
    }

    const { Resend } = require('resend');
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `[VIP Agent] ${title}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#1e40af;color:white;padding:12px 16px;border-radius:8px 8px 0 0;">
            <strong>${title}</strong>
          </div>
          <div style="padding:16px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
            ${body.replace(/\n/g, '<br>')}
            <hr style="margin-top:16px;border:none;border-top:1px solid #e5e7eb;">
            <p style="font-size:11px;color:#9ca3af;">Automated alert from VIP ERP Agent System</p>
          </div>
        </div>
      `
    });
    return { channel: 'email', success: true };
  } catch (err) {
    console.error('[Agent Notify] Email failed:', err.message);
    return { channel: 'email', success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════
// Channel: SMS via Semaphore (add API key later)
// ═══════════════════════════════════════════
async function sendSms({ recipientPhone, body }) {
  try {
    const apiKey = process.env.SEMAPHORE_API_KEY;
    if (!apiKey) {
      return { channel: 'sms', success: false, error: 'SEMAPHORE_API_KEY not configured — skipping SMS' };
    }

    // Semaphore Philippine SMS gateway
    const https = require('https');
    const params = new URLSearchParams({
      apikey: apiKey,
      number: recipientPhone,
      message: body.substring(0, 160), // SMS limit
      sendername: process.env.SEMAPHORE_SENDER || 'VIP_ERP'
    });

    return new Promise((resolve) => {
      const req = https.request('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }, (res) => {
        resolve({ channel: 'sms', success: res.statusCode === 200 });
      });
      req.on('error', (err) => resolve({ channel: 'sms', success: false, error: err.message }));
      req.write(params.toString());
      req.end();
    });
  } catch (err) {
    return { channel: 'sms', success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════
// Channel: Facebook Messenger (add API key later)
// ═══════════════════════════════════════════
async function sendMessenger({ recipientFbId, body }) {
  try {
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!pageToken) {
      return { channel: 'messenger', success: false, error: 'FB_PAGE_ACCESS_TOKEN not configured — skipping Messenger' };
    }

    const https = require('https');
    const payload = JSON.stringify({
      recipient: { id: recipientFbId },
      message: { text: body.substring(0, 2000) }
    });

    return new Promise((resolve) => {
      const req = https.request(`https://graph.facebook.com/v18.0/me/messages?access_token=${pageToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        resolve({ channel: 'messenger', success: res.statusCode === 200 });
      });
      req.on('error', (err) => resolve({ channel: 'messenger', success: false, error: err.message }));
      req.write(payload);
      req.end();
    });
  } catch (err) {
    return { channel: 'messenger', success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════
// Main notify() function
// ═══════════════════════════════════════════

/**
 * Resolve recipient_id to user(s)
 * Supports: ObjectId (single user), 'PRESIDENT', 'ALL_BDMS', 'ALL_ADMINS'
 */
async function resolveRecipients(recipientId) {
  if (recipientId === 'PRESIDENT') {
    const users = await User.find({ role: { $in: ROLE_SETS.PRESIDENT_ROLES }, isActive: true }).lean();
    return users;
  }
  if (recipientId === 'ALL_BDMS') {
    return await User.find({ role: ROLES.CONTRACTOR, isActive: true }).lean();
  }
  if (recipientId === 'ALL_ADMINS') {
    return await User.find({ role: { $in: ROLE_SETS.ADMIN_LIKE }, isActive: true }).lean();
  }
  // Single user
  const user = await User.findById(recipientId).lean();
  return user ? [user] : [];
}

/**
 * Send notification to one or many recipients via multiple channels
 */
async function notify({ recipient_id, title, body, category, priority, channels, agent, entity_id, folder }) {
  const defaultChannels = ['in_app', 'email'];
  const activeChannels = channels || defaultChannels;
  const recipients = await resolveRecipients(recipient_id);

  if (!recipients.length) {
    console.warn(`[Agent ${agent}] No recipients found for: ${recipient_id}`);
    return [];
  }

  const results = [];

  for (const user of recipients) {
    for (const channel of activeChannels) {
      let result;

      switch (channel) {
        case 'in_app':
          result = await sendInApp({ recipientId: user._id, title, body, category, priority, entityId: entity_id, folder });
          break;
        case 'email':
          if (user.email) {
            result = await sendEmail({ recipientEmail: user.email, recipientName: user.name, title, body });
          }
          break;
        case 'sms':
          if (user.phone) {
            result = await sendSms({ recipientPhone: user.phone, body: `${title}: ${body}` });
          }
          break;
        case 'messenger':
          if (user.fbMessengerId) {
            result = await sendMessenger({ recipientFbId: user.fbMessengerId, body: `${title}\n\n${body}` });
          }
          break;
      }

      if (result) results.push({ user: user.name || user.email, ...result });
    }
  }

  // Log agent activity
  console.log(`[Agent ${agent}] Notified ${recipients.length} recipients via ${activeChannels.join(',')} — ${title}`);
  return results;
}

function countSuccessfulChannels(results = [], channel = 'in_app') {
  return (Array.isArray(results) ? results : []).filter((result) => result?.channel === channel && result?.success).length;
}

function getInAppMessageIds(results = []) {
  return (Array.isArray(results) ? results : [])
    .filter((result) => result?.channel === 'in_app' && result?.success && result?.messageId)
    .map((result) => result.messageId);
}

/**
 * Broadcast to a role group (convenience)
 */
async function broadcastToRole(role, { title, body, category, priority, channels, agent }) {
  const roleMap = {
    president: 'PRESIDENT',
    bdms: 'ALL_BDMS',
    admins: 'ALL_ADMINS'
  };
  return notify({ recipient_id: roleMap[role] || role, title, body, category, priority, channels, agent });
}

module.exports = { notify, broadcastToRole, countSuccessfulChannels, getInAppMessageIds };
