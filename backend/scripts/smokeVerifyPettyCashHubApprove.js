/**
 * Smoke verify: confirm the Hub approve flipped the smoke-fixture txn to
 * POSTED, the fund balance moved by the txn amount, and the originating
 * ApprovalRequest closed to APPROVED with a history $push.
 *
 * Usage:
 *   node backend/scripts/smokeVerifyPettyCashHubApprove.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const PettyCashFund = require('../erp/models/PettyCashFund');
const PettyCashTransaction = require('../erp/models/PettyCashTransaction');
const ApprovalRequest = require('../erp/models/ApprovalRequest');

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

const FIXTURE_TAG = 'G6.7-PC1 smoke fixture (Apr 30 2026)';

(async () => {
  await mongoose.connect(rewriteSrvToDirect(process.env.MONGO_URI));

  const txn = await PettyCashTransaction.findOne({ source_description: FIXTURE_TAG }).lean();
  if (!txn) throw new Error('No fixture txn found — did Hub approve run?');
  const fund = await PettyCashFund.findById(txn.fund_id).lean();
  const request = await ApprovalRequest.findOne({ doc_id: txn._id }).lean();

  console.log('── Petty Cash Hub Approve — Verification ──');
  console.log('Txn:');
  console.log('  _id            =', txn._id);
  console.log('  status         =', txn.status, txn.status === 'POSTED' ? '✓' : '✗ expected POSTED');
  console.log('  amount         = ₱' + txn.amount);
  console.log('  posted_by      =', txn.posted_by);
  console.log('  posted_at      =', txn.posted_at);
  console.log('  approved_by    =', txn.approved_by);
  console.log('  running_balance= ₱' + txn.running_balance);
  console.log('Fund:');
  console.log('  _id            =', fund._id);
  console.log('  fund_name      =', fund.fund_name);
  console.log('  current_balance= ₱' + fund.current_balance, fund.current_balance === txn.amount ? '✓ (matches txn amount)' : '✗ expected ₱' + txn.amount);
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
    txn.status === 'POSTED' &&
    fund.current_balance === txn.amount &&
    request?.status === 'APPROVED' &&
    !!txn.posted_by &&
    !!txn.posted_at &&
    !!request?.decided_by &&
    (request?.history || []).some(h => h.status === 'APPROVED');

  console.log('');
  if (allGood) {
    console.log('✓ ALL CHECKS PASS — Hub approve flow is fully wired end-to-end.');
  } else {
    console.log('✗ Some checks failed (see ✗ markers above).');
    process.exit(1);
  }

  await mongoose.disconnect();
})().catch(err => {
  console.error('Verify failed:', err);
  process.exit(1);
});
