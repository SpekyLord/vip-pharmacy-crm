/**
 * AI-Assisted Sender Matcher
 *
 * When an inbound message arrives from an unknown sender (no Doctor match found),
 * this utility:
 *   1. Fetches the sender's display name from the platform API
 *   2. Runs a fuzzy string match to find the top 5 Doctor candidates
 *   3. Calls Claude Haiku to pick the best match and assign a confidence level
 *
 * Returns { doctorId, confidence: 'high'|'medium'|'low', reason } or null.
 */

const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const Doctor = require('../models/Doctor');

// ── Fetch sender display name from platform API ──────────────────────────────

async function fetchMessengerSenderName(psid) {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) return null;
  return new Promise((resolve) => {
    const req = https.request(
      `https://graph.facebook.com/v19.0/${psid}?fields=name,profile_pic&access_token=${token}`,
      { method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ name: parsed.name || null, profilePic: parsed.profile_pic || null });
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function fetchViberSenderName(viberId) {
  const token = process.env.VIBER_BOT_TOKEN;
  if (!token) return null;
  const payload = JSON.stringify({ id: viberId });
  return new Promise((resolve) => {
    const req = https.request('https://chatapi.viber.com/pa/get_user_details', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': token,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const user = parsed.user || {};
          const name = [user.name].filter(Boolean).join(' ') || null;
          resolve({ name, profilePic: user.avatar || null });
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// WhatsApp doesn't provide display names via Cloud API; use phone as identity
async function fetchWhatsAppSenderName(phone) {
  return { name: phone, profilePic: null };
}

/**
 * Fetch sender's display name from the appropriate platform.
 * Returns { name, profilePic } or null.
 */
async function fetchSenderInfo(channel, externalId) {
  try {
    const ch = (channel || '').toUpperCase();
    if (ch === 'MESSENGER') return await fetchMessengerSenderName(externalId);
    if (ch === 'VIBER') return await fetchViberSenderName(externalId);
    if (ch === 'WHATSAPP') return await fetchWhatsAppSenderName(externalId);
  } catch {
    // ignore
  }
  return null;
}

// ── Fuzzy name scoring ───────────────────────────────────────────────────────

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\bdr\.?\s*/gi, '')
    .replace(/[^a-z\s]/g, '')
    .trim();
}

function simpleScore(a, b) {
  const tokensA = normalizeName(a).split(/\s+/).filter(Boolean);
  const tokensB = normalizeName(b).split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const t of tokensA) {
    if (tokensB.some((s) => s.includes(t) || t.includes(s))) matches++;
  }
  return tokensA.length ? matches / tokensA.length : 0;
}

// ── Claude Haiku match decision ──────────────────────────────────────────────

async function callClaude(senderName, messageText, candidates) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey });

  const candidateList = candidates
    .map((d, i) => `${i + 1}. ID="${d._id}" Name="${d.firstName} ${d.lastName}" Spec="${d.specialization || ''}" Clinic="${d.clinicOfficeAddress || ''}"`)
    .join('\n');

  const prompt = `You are matching an inbound messaging sender to a VIP Client (doctor) in a CRM system.

Sender name: "${senderName}"
Sender message: "${messageText.substring(0, 200)}"

Candidates:
${candidateList}

Pick the best match. Reply ONLY with valid JSON, no extra text:
{"doctorId":"<MongoDB ObjectId string>","confidence":"high"|"medium"|"low","reason":"<one sentence>"}

Rules:
- "high": name is a clear match (same last name and first initial at minimum)
- "medium": partial or phonetic match, plausible
- "low": uncertain or no good match
- If no candidate fits at all, reply: {"doctorId":null,"confidence":"low","reason":"No suitable match found"}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0]?.text?.trim() || '';
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Match an unknown inbound sender to a Doctor in the DB.
 *
 * @param {string} senderName   Display name from the platform
 * @param {string} messageText  First message content
 * @param {string} channel      'MESSENGER' | 'VIBER' | 'WHATSAPP'
 * @returns {{ doctorId, confidence, reason } | null}
 */
async function matchSenderToDoctor(senderName, messageText, channel) {
  if (!senderName) return null;

  // Find unlinked doctors (no channel ID set for this channel)
  const ch = (channel || '').toUpperCase();
  const filterField = ch === 'MESSENGER' ? 'messengerId' : ch === 'VIBER' ? 'viberId' : 'whatsappNumber';
  const unlinked = await Doctor.find({ [filterField]: { $in: [null, ''] } })
    .select('firstName lastName specialization clinicOfficeAddress locality province')
    .lean();

  if (unlinked.length === 0) return null;

  // Score all candidates, take top 5
  const scored = unlinked
    .map((d) => ({
      ...d,
      score: simpleScore(senderName, `${d.firstName} ${d.lastName}`),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const result = await callClaude(senderName, messageText, scored);
  if (!result || !result.doctorId) return null;

  // Validate the returned doctorId is one of our candidates
  const validIds = scored.map((d) => d._id.toString());
  if (!validIds.includes(result.doctorId.toString())) return null;

  return {
    doctorId: result.doctorId,
    confidence: result.confidence || 'low',
    reason: result.reason || '',
  };
}

module.exports = { fetchSenderInfo, matchSenderToDoctor };
