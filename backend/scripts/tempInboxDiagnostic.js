/**
 * TEMP — Read-only inbox diagnostic.
 * Counts messages by recipientRole, category, folder, and the noisiest titles.
 * Also reports per-user unread counts for the president + a sample BDM.
 *
 * Run from backend/:
 *   node scripts/tempInboxDiagnostic.js
 *
 * Delete after triage.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const PRESIDENT_EMAIL = 'yourpartner@viosintegrated.net';
const BDM_EMAILS = ['s3.vippharmacy@gmail.com', 's19.vippharmacy@gmail.com'];

const fmt = (rows) => rows.map((r) => JSON.stringify(r)).join('\n');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const messages = db.collection('messages');
  const users = db.collection('users');

  console.log('\n=== TOTAL MESSAGES ===');
  const total = await messages.countDocuments({});
  console.log({ total });

  console.log('\n=== BY recipientRole ===');
  console.log(fmt(await messages.aggregate([
    { $group: { _id: '$recipientRole', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()));

  console.log('\n=== BY category ===');
  console.log(fmt(await messages.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()));

  console.log('\n=== BY folder ===');
  console.log(fmt(await messages.aggregate([
    { $group: { _id: '$folder', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()));

  console.log('\n=== TOP 15 TITLES OVERALL ===');
  console.log(fmt(await messages.aggregate([
    { $group: { _id: '$title', count: { $sum: 1 }, latest: { $max: '$createdAt' } } },
    { $sort: { count: -1 } },
    { $limit: 15 },
  ]).toArray()));

  console.log('\n=== [GUARD] MESSAGES — BREAKDOWN BY MODEL ===');
  const guardRegex = /^\[GUARD\]/;
  const guardCount = await messages.countDocuments({ title: { $regex: guardRegex } });
  console.log({ totalGuardMessages: guardCount });
  console.log(fmt(await messages.aggregate([
    { $match: { title: { $regex: guardRegex } } },
    { $group: { _id: '$title', count: { $sum: 1 }, latest: { $max: '$createdAt' }, oldest: { $min: '$createdAt' } } },
    { $sort: { count: -1 } },
    { $limit: 30 },
  ]).toArray()));

  console.log('\n=== [GUARD] DATE RANGE ===');
  const guardRange = await messages.aggregate([
    { $match: { title: { $regex: guardRegex } } },
    { $group: { _id: null, oldest: { $min: '$createdAt' }, newest: { $max: '$createdAt' } } },
  ]).toArray();
  console.log(guardRange);

  console.log('\n=== [GUARD] BY recipientRole ===');
  console.log(fmt(await messages.aggregate([
    { $match: { title: { $regex: guardRegex } } },
    { $group: { _id: '$recipientRole', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray()));

  // Per-user unread counts for president + sample BDM(s)
  const president = await users.findOne({ email: PRESIDENT_EMAIL });
  if (president) {
    console.log(`\n=== PRESIDENT (${PRESIDENT_EMAIL}, _id=${president._id}) ===`);
    const presidentTotal = await messages.countDocuments({
      $or: [
        { recipientUserId: president._id },
        { recipientUserId: null, recipientRole: { $in: ['president', 'admin', 'staff', 'medrep', 'employee', 'contractor'] } },
      ],
    });
    const presidentUnread = await messages.countDocuments({
      $and: [
        {
          $or: [
            { recipientUserId: president._id },
            { recipientUserId: null, recipientRole: { $in: ['president', 'admin', 'staff', 'medrep', 'employee', 'contractor'] } },
          ],
        },
        { readBy: { $ne: president._id } },
        { archivedBy: { $ne: president._id } },
      ],
    });
    const presidentArchived = await messages.countDocuments({ archivedBy: president._id });
    const presidentMustAck = await messages.countDocuments({
      must_acknowledge: true,
      acknowledgedBy: { $not: { $elemMatch: { user: president._id } } },
      $or: [{ recipientUserId: president._id }, { recipientUserId: null }],
    });
    console.log({ presidentTotal, presidentUnread, presidentArchived, presidentMustAckOutstanding: presidentMustAck });
  } else {
    console.log(`\n!!! Could not find user ${PRESIDENT_EMAIL}`);
  }

  for (const email of BDM_EMAILS) {
    const bdm = await users.findOne({ email });
    if (!bdm) {
      console.log(`\n!!! Could not find user ${email}`);
      continue;
    }
    console.log(`\n=== BDM (${email}, role=${bdm.role}, _id=${bdm._id}) ===`);
    const bdmTotal = await messages.countDocuments({
      $or: [
        { recipientUserId: bdm._id },
        { recipientUserId: null, recipientRole: bdm.role },
      ],
    });
    const bdmUnread = await messages.countDocuments({
      $and: [
        {
          $or: [
            { recipientUserId: bdm._id },
            { recipientUserId: null, recipientRole: bdm.role },
          ],
        },
        { readBy: { $ne: bdm._id } },
        { archivedBy: { $ne: bdm._id } },
      ],
    });
    const bdmArchived = await messages.countDocuments({ archivedBy: bdm._id });
    const bdmMustAck = await messages.countDocuments({
      must_acknowledge: true,
      acknowledgedBy: { $not: { $elemMatch: { user: bdm._id } } },
      $or: [{ recipientUserId: bdm._id }, { recipientUserId: null, recipientRole: bdm.role }],
    });
    console.log({ bdmTotal, bdmUnread, bdmArchived, bdmMustAckOutstanding: bdmMustAck });

    console.log(`--- Top 10 titles for this BDM ---`);
    console.log(fmt(await messages.aggregate([
      {
        $match: {
          $or: [
            { recipientUserId: bdm._id },
            { recipientUserId: null, recipientRole: bdm.role },
          ],
        },
      },
      { $group: { _id: '$title', count: { $sum: 1 }, latest: { $max: '$createdAt' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]).toArray()));

    console.log(`--- Categories for this BDM ---`);
    console.log(fmt(await messages.aggregate([
      {
        $match: {
          $or: [
            { recipientUserId: bdm._id },
            { recipientUserId: null, recipientRole: bdm.role },
          ],
        },
      },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray()));
  }

  await mongoose.disconnect();
  console.log('\nDone.');
})().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
