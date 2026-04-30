/**
 * Smoke verify: confirm Hub approve flipped the smoke-fixture JE to POSTED
 * and the originating ApprovalRequest closed to APPROVED with history $push.
 *
 * Usage:
 *   node backend/scripts/smokeVerifyJournalHubApprove.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

function rewriteSrvToDirect(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) return uri;
  const m = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/]+)\/([^?]*)\??(.*)$/);
  if (!m) return uri;
  const [, creds, host, db, qs] = m;
  const baseHost = host.split('.').slice(1).join('.');
  const shards = [
    `ac-dwvh8hq-shard-00-00.${baseHost}:27017`,
    `ac-dwvh8hq-shard-00-01.${baseHost}:27017`,
    `ac-dwvh8hq-shard-00-02.${baseHost}:27017`,
  ];
  const baseQs = qs || '';
  const extra = ['authSource=admin', 'replicaSet=atlas-sy6yco-shard-0', 'tls=true'];
  const final = [baseQs, ...extra.filter(e => !baseQs.includes(e.split('=')[0]))].filter(Boolean).join('&');
  return `mongodb://${creds}@${shards.join(',')}/${db}?${final}`;
}

const FIXTURE_TAG = 'G6.7-PC2 smoke fixture (Apr 30 2026)';
const JournalEntry = require('../erp/models/JournalEntry');
const ApprovalRequest = require('../erp/models/ApprovalRequest');

(async () => {
  await mongoose.connect(rewriteSrvToDirect(process.env.MONGO_URI));

  const je = await JournalEntry.findOne({ description: FIXTURE_TAG }).sort({ createdAt: -1 }).lean();
  if (!je) throw new Error('No fixture JE found — did Hub approve run?');
  const request = await ApprovalRequest.findOne({ doc_id: je._id }).lean();

  console.log('── Journal Hub Approve — Verification ──');
  console.log('JE:');
  console.log('  _id            =', je._id);
  console.log('  je_number      =', je.je_number);
  console.log('  status         =', je.status, je.status === 'POSTED' ? '✓' : '✗ expected POSTED');
  console.log('  period         =', je.period);
  console.log('  posted_by      =', je.posted_by);
  console.log('  posted_at      =', je.posted_at);
  console.log('  total_debit    = ₱' + (je.lines || []).reduce((s, l) => s + (l.debit || 0), 0));
  console.log('  total_credit   = ₱' + (je.lines || []).reduce((s, l) => s + (l.credit || 0), 0));
  console.log('ApprovalRequest:');
  console.log('  _id            =', request?._id);
  console.log('  status         =', request?.status, request?.status === 'APPROVED' ? '✓' : '✗ expected APPROVED');
  console.log('  decided_by     =', request?.decided_by);
  console.log('  decided_at     =', request?.decided_at);
  console.log('  decision_reason=', request?.decision_reason);
  console.log('  history_len    =', (request?.history || []).length);
  const lastHistory = (request?.history || [])[request?.history?.length - 1];
  console.log('  last_history   =', JSON.stringify(lastHistory));

  const allGood =
    je.status === 'POSTED' &&
    !!je.posted_by &&
    !!je.posted_at &&
    request?.status === 'APPROVED' &&
    !!request?.decided_by &&
    (request?.history || []).some(h => h.status === 'APPROVED');

  console.log('');
  if (allGood) {
    console.log('✓ ALL CHECKS PASS — Phase G6.7-PC2 Hub approve flow is fully wired end-to-end.');
  } else {
    console.log('✗ Some checks failed (see ✗ markers above).');
    process.exit(1);
  }
  await mongoose.disconnect();
})().catch(err => {
  console.error('Verify failed:', err);
  process.exit(1);
});
