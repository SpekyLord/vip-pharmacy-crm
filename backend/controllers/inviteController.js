/**
 * Invite Controller — Phase M1 (Apr 2026)
 *
 * - POST /api/invites/generate    — generate a deep-link invite for Messenger/Viber/WhatsApp
 * - GET  /api/invites             — list invites with filters (admin: all; BDM: own)
 * - POST /api/invites/consent     — manual consent capture (paper form / verbal)
 * - POST /api/invites/partner/enroll — MD Partner Program enrollment scaffold
 *
 * Deep-link binding: when the recipient taps the link and sends their first message,
 * the Messenger / Viber webhook reads the `ref` param, auto-binds their provider ID
 * to the Doctor/Client record, and stamps per-channel consent. See webhookRoutes.js
 * `bindFromInviteRef()` for the binding logic.
 *
 * Email invites are sent via the existing dispatchMessage(EMAIL) path in
 * communicationLogController — no separate flow here. What this controller adds
 * for EMAIL is simply the unsubscribe infrastructure via utils/unsubscribeToken.
 */

const Doctor = require('../models/Doctor');
const Client = require('../models/Client');
const InviteLink = require('../models/InviteLink');
const { catchAsync, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');

const SUPPORTED_CHANNELS = ['MESSENGER', 'VIBER', 'WHATSAPP', 'EMAIL'];

/** Build the deep link for a given channel + ref. Returns null if the channel's
 *  upstream config is missing (e.g., no FB_PAGE_USERNAME set). */
function buildDeepLink(channel, ref, recipient) {
  switch (channel) {
    case 'MESSENGER': {
      const page = process.env.FB_PAGE_USERNAME;
      if (!page) return null;
      return `https://m.me/${page}?ref=${ref}`;
    }
    case 'VIBER': {
      const botUri = process.env.VIBER_BOT_URI;
      if (!botUri) return null;
      return `viber://pa?chatURI=${encodeURIComponent(botUri)}&context=${ref}`;
    }
    case 'WHATSAPP': {
      // wa.me cannot carry a webhook-readable ref; prefill text with a marker.
      // Full auto-binding for WhatsApp is deferred — admin assigns via the
      // pending-assignment triage queue (communicationLog already handles it).
      const waNumber = recipient?.whatsappNumber || recipient?.phone;
      if (!waNumber) return null;
      const clean = String(waNumber).replace(/[^0-9]/g, '');
      const hello = encodeURIComponent(`Hi, this is from VIP. Invite code: ${ref}`);
      return `https://wa.me/${clean}?text=${hello}`;
    }
    case 'EMAIL':
      // For email, the link IS the email itself — returned null here, and the
      // caller is expected to route through dispatchMessage(EMAIL, ...) with the
      // unsubscribe token appended by the email template.
      return null;
    default:
      return null;
  }
}

/** Access check: BDM can only invite their own VIP Clients / Regular Clients.
 *  Returns { error: string, status: number } on bad input, or the target on success. */
async function loadTarget(req, doctorId, clientId) {
  if (!doctorId && !clientId) {
    return { error: 'Either doctorId or clientId is required.', status: 400 };
  }
  if (doctorId && clientId) {
    return { error: 'Provide doctorId OR clientId, not both.', status: 400 };
  }

  if (doctorId) {
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) throw new NotFoundError('VIP Client not found.');
    if (!isAdminLike(req.user.role)) {
      const assignedTo = doctor.assignedTo?._id || doctor.assignedTo;
      if (!assignedTo || assignedTo.toString() !== req.user._id.toString()) {
        throw new ForbiddenError('This VIP Client is not assigned to you.');
      }
    }
    return { kind: 'doc', doctor, client: null, ref: `doc_${doctor._id}` };
  }

  const client = await Client.findById(clientId);
  if (!client) throw new NotFoundError('Regular Client not found.');
  if (!isAdminLike(req.user.role) && client.createdBy?.toString() !== req.user._id.toString()) {
    throw new ForbiddenError('This client does not belong to you.');
  }
  return { kind: 'cli', doctor: null, client, ref: `cli_${client._id}` };
}

/**
 * POST /api/invites/generate
 * Body: { doctorId?, clientId?, channel, templateKey? }
 * Returns: { linkUrl, inviteLinkId, channel, ref }
 */
const generateInvite = catchAsync(async (req, res) => {
  const { doctorId, clientId, channel, templateKey } = req.body;
  if (!SUPPORTED_CHANNELS.includes(channel)) {
    return res.status(400).json({ success: false, message: `Unsupported channel. Use one of: ${SUPPORTED_CHANNELS.join(', ')}.` });
  }

  const target = await loadTarget(req, doctorId, clientId);
  if (target.error) return res.status(target.status).json({ success: false, message: target.error });
  const recipient = target.doctor || target.client;

  const linkUrl = buildDeepLink(channel, target.ref, recipient);
  if (!linkUrl && channel !== 'EMAIL') {
    return res.status(503).json({
      success: false,
      message: `${channel} deep linking is not configured. Ask admin to set ${channel === 'MESSENGER' ? 'FB_PAGE_USERNAME' : 'VIBER_BOT_URI'}.`,
    });
  }

  const invite = await InviteLink.create({
    doctor: doctorId || null,
    client: clientId || null,
    channel,
    ref: target.ref,
    linkUrl: linkUrl || '',
    templateKey: templateKey || null,
    sentBy: req.user._id,
    status: 'sent',
  });

  res.status(201).json({
    success: true,
    data: {
      inviteLinkId: invite._id,
      channel,
      ref: target.ref,
      linkUrl,
    },
  });
});

/**
 * GET /api/invites
 * Query: ?status=&channel=&bdmId=&from=&to=&page=&limit=
 * Admins see all. BDMs see only their own (sentBy=self).
 */
const listInvites = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (!isAdminLike(req.user.role)) {
    filter.sentBy = req.user._id;
  } else if (req.query.bdmId) {
    filter.sentBy = req.query.bdmId;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.channel) filter.channel = req.query.channel;
  if (req.query.from || req.query.to) {
    filter.sentAt = {};
    if (req.query.from) filter.sentAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.sentAt.$lte = new Date(req.query.to);
  }

  const [items, total] = await Promise.all([
    InviteLink.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('doctor', 'firstName lastName specialization')
      .populate('client', 'firstName lastName')
      .populate('sentBy', 'name email')
      .lean(),
    InviteLink.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/**
 * POST /api/invites/consent
 * Body: { doctorId?, clientId?, channel, consented, source }
 * Manual consent capture (e.g., signed paper form). Admin only — BDM cannot
 * self-attest consent on a VIP Client's behalf without evidence.
 */
const updateConsent = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    throw new ForbiddenError('Only admin can manually set consent. Use the invite flow for BDM-initiated consent.');
  }
  const { doctorId, clientId, channel, consented, source } = req.body;
  if (!SUPPORTED_CHANNELS.includes(channel) && channel !== 'SMS') {
    return res.status(400).json({ success: false, message: 'Unsupported channel.' });
  }
  if (!source) {
    return res.status(400).json({ success: false, message: 'Source is required (e.g., paper_form, verbal, invite_reply).' });
  }

  const target = await loadTarget(req, doctorId, clientId);
  if (target.error) return res.status(target.status).json({ success: false, message: target.error });
  const Model = target.kind === 'doc' ? Doctor : Client;
  const id = target.doctor?._id || target.client?._id;

  const update = consented
    ? {
        [`marketingConsent.${channel}.consented`]: true,
        [`marketingConsent.${channel}.at`]: new Date(),
        [`marketingConsent.${channel}.source`]: source,
        [`marketingConsent.${channel}.withdrawn_at`]: null,
      }
    : {
        [`marketingConsent.${channel}.consented`]: false,
        [`marketingConsent.${channel}.withdrawn_at`]: new Date(),
      };

  const updated = await Model.findByIdAndUpdate(id, update, { new: true }).lean();
  res.json({ success: true, data: updated.marketingConsent });
});

/**
 * POST /api/invites/partner/enroll
 * Body: { doctorId, tin, payoutMethod, withholdingCategory, agreedToTerms }
 *
 * Scaffold only — counsel has NOT yet cleared the agreement template. The
 * enrollment record is persisted but the agreementUrl remains a placeholder
 * until the MD_PARTNER_LIVE flag flips (Phase M1 gating).
 *
 * Generates unique referral code `DR-<LASTNAME_4CHARS>-<4DIGITS>`.
 */
const enrollPartner = catchAsync(async (req, res) => {
  if (!isAdminLike(req.user.role)) {
    throw new ForbiddenError('Only admin can enroll MD Partners.');
  }
  const { doctorId, tin, payoutMethod, withholdingCategory, agreedToTerms } = req.body;
  if (!doctorId) return res.status(400).json({ success: false, message: 'doctorId is required.' });
  if (!agreedToTerms) return res.status(400).json({ success: false, message: 'Agreement consent is required.' });

  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new NotFoundError('VIP Client not found.');

  if (doctor.partnerProgram?.enrolled) {
    return res.json({
      success: true,
      data: doctor.partnerProgram,
      message: 'Already enrolled.',
    });
  }

  // Generate a unique referral code. Retry on collision (index is unique).
  const lastNameSlug = (doctor.lastName || 'XX')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4)
    .padEnd(2, 'X');
  let referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const candidate = `DR-${lastNameSlug}-${suffix}`;
    const existing = await Doctor.findOne({ 'partnerProgram.referralCode': candidate }).lean();
    if (!existing) {
      referralCode = candidate;
      break;
    }
  }
  if (!referralCode) {
    return res.status(500).json({ success: false, message: 'Could not generate unique referral code after retries.' });
  }

  doctor.partnerProgram = {
    enrolled: true,
    referralCode,
    tin: tin || null,
    enrolledAt: new Date(),
    agreementUrl: null, // placeholder — set when counsel-approved PDF generator lands
    agreementVersion: 'v1-scaffold',
    payoutMethod: payoutMethod || null,
    withholdingCategory: withholdingCategory || null,
  };
  await doctor.save();

  res.status(201).json({ success: true, data: doctor.partnerProgram });
});

module.exports = {
  generateInvite,
  listInvites,
  updateConsent,
  enrollPartner,
};
