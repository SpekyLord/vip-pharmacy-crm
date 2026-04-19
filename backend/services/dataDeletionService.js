/**
 * Data Deletion Service
 *
 * Handles the Facebook Data Deletion Callback. Meta POSTs
 *   signed_request=<base64url_sig>.<base64url_payload>
 * where the signature is HMAC-SHA256(payload, FB_APP_SECRET). The payload is a
 * JSON blob that includes the user_id (PSID) whose data must be deleted.
 *
 * Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 */

const crypto = require('crypto');
const DataDeletionRequest = require('../models/DataDeletionRequest');
const CommunicationLog = require('../models/CommunicationLog');
const Doctor = require('../models/Doctor');
const Client = require('../models/Client');

function base64UrlDecode(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Invalid signed_request segment');
  }
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(padded + padding, 'base64');
}

function parseSignedRequest(signedRequest, appSecret) {
  if (typeof signedRequest !== 'string' || !signedRequest.includes('.')) {
    throw new Error('Malformed signed_request');
  }
  const [encodedSig, encodedPayload] = signedRequest.split('.', 2);

  const sig = base64UrlDecode(encodedSig);
  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(encodedPayload)
    .digest();

  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) {
    throw new Error('signed_request signature mismatch');
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  if (payload.algorithm && payload.algorithm.toUpperCase() !== 'HMAC-SHA256') {
    throw new Error(`Unsupported signed_request algorithm: ${payload.algorithm}`);
  }
  return payload;
}

/**
 * Delete / redact all data tied to a Facebook user_id (PSID).
 *   - CommunicationLog rows whose doctor/client has the matching messengerId
 *   - Clears messengerId on affected Doctor/Client records
 * Returns counts for the status page.
 */
async function purgeFacebookUserData(externalUserId) {
  const doctors = await Doctor.find({ messengerId: externalUserId }).select('_id').lean();
  const clients = await Client.find({ messengerId: externalUserId }).select('_id').lean();

  const doctorIds = doctors.map((d) => d._id);
  const clientIds = clients.map((c) => c._id);

  let commLogDeleted = 0;
  if (doctorIds.length || clientIds.length) {
    const filter = {
      channel: 'MESSENGER',
      $or: [
        ...(doctorIds.length ? [{ doctor: { $in: doctorIds } }] : []),
        ...(clientIds.length ? [{ client: { $in: clientIds } }] : []),
      ],
    };
    const result = await CommunicationLog.deleteMany(filter);
    commLogDeleted = result.deletedCount || 0;
  }

  let doctorsUpdated = 0;
  if (doctorIds.length) {
    const result = await Doctor.updateMany(
      { _id: { $in: doctorIds } },
      { $unset: { messengerId: '' } }
    );
    doctorsUpdated = result.modifiedCount || 0;
  }

  let clientsUpdated = 0;
  if (clientIds.length) {
    const result = await Client.updateMany(
      { _id: { $in: clientIds } },
      { $unset: { messengerId: '' } }
    );
    clientsUpdated = result.modifiedCount || 0;
  }

  return {
    communicationLogs: commLogDeleted,
    doctorsUpdated,
    clientsUpdated,
  };
}

/**
 * Entry point called by POST /api/webhooks/facebook/data-deletion.
 * Returns a confirmation_code string. Throws on invalid signed_request.
 */
async function handleFacebookDataDeletion(signedRequest) {
  const appSecret = process.env.FB_APP_SECRET;
  if (!appSecret) {
    throw new Error('FB_APP_SECRET is not configured');
  }

  const payload = parseSignedRequest(signedRequest, appSecret);
  const userId = payload.user_id;
  if (!userId) {
    throw new Error('signed_request payload missing user_id');
  }

  const confirmationCode = DataDeletionRequest.generateConfirmationCode();
  const request = await DataDeletionRequest.create({
    confirmationCode,
    platform: 'facebook',
    externalUserId: String(userId),
    status: 'pending',
    requestedAt: new Date(),
  });

  try {
    const counts = await purgeFacebookUserData(String(userId));
    request.status = 'completed';
    request.completedAt = new Date();
    request.deletedCounts = counts;
    await request.save();
  } catch (err) {
    request.status = 'failed';
    request.errorMessage = err.message;
    await request.save();
    console.error('[DataDeletion] purge failed for', userId, err);
  }

  return confirmationCode;
}

module.exports = {
  handleFacebookDataDeletion,
  parseSignedRequest, // exported for tests
  purgeFacebookUserData, // exported for tests/manual runs
};
