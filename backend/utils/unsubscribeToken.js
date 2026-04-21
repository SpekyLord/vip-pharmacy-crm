/**
 * Unsubscribe Token — Phase M1 (Apr 2026)
 *
 * HMAC-SHA256 signed token for one-click unsubscribe links in outbound emails
 * and SMS. Token format: `<kind>.<id>.<channel>.<hex-signature>` where kind is
 * 'doc' (Doctor / VIP Client) or 'cli' (Regular Client).
 *
 * Verified by `/api/webhooks/unsubscribe/:token` (public, unauthenticated, idempotent).
 */

const crypto = require('crypto');

function buildUnsubscribeToken(kind, id, channel) {
  const secret = process.env.JWT_SECRET || '';
  const body = `${kind}.${id}.${channel}`;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex').slice(0, 32);
  return `${body}.${sig}`;
}

function parseUnsubscribeToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [kind, id, channel, sig] = parts;
  if (!['doc', 'cli'].includes(kind)) return null;
  if (!['MESSENGER', 'VIBER', 'WHATSAPP', 'EMAIL', 'SMS'].includes(channel)) return null;
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || '')
    .update(`${kind}.${id}.${channel}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || a.length === 0) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return { kind, id, channel };
}

module.exports = { buildUnsubscribeToken, parseUnsubscribeToken };
