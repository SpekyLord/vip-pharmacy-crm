/**
 * Smoke fixture: creates ONE DRAFT PettyCashTransaction + matching PENDING
 * ApprovalRequest so the Approval Hub surfaces a PETTY_CASH item we can
 * verify the new approve path against.
 *
 * Usage:
 *   node backend/scripts/smokeFixturePettyCashHubApprove.js          # create
 *   node backend/scripts/smokeFixturePettyCashHubApprove.js --cleanup  # remove
 *
 * Prints the txn _id + ApprovalRequest _id on success. Idempotent: if an
 * unposted Phase G6.7-PC1 smoke fixture already exists, prints its IDs
 * instead of creating a duplicate.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// Local DNS resolver refuses SRV lookups intermittently on this Windows dev box.
// Fallback: rewrite mongodb+srv:// to mongodb:// with the three known shard hosts
// (resolved Apr 30 2026 via 8.8.8.8) so the script can run from any shell context.
function rewriteSrvToDirect(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) return uri;
  const m = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/]+)\/([^?]*)\??(.*)$/);
  if (!m) return uri;
  const [, creds, host, db, qs] = m;
  const shards = [
    `ac-dwvh8hq-shard-00-00.${host.split('.').slice(1).join('.')}:27017`,
    `ac-dwvh8hq-shard-00-01.${host.split('.').slice(1).join('.')}:27017`,
    `ac-dwvh8hq-shard-00-02.${host.split('.').slice(1).join('.')}:27017`,
  ];
  // Append TXT-fetched options if not present
  const baseQs = qs || '';
  const extra = ['authSource=admin', 'replicaSet=atlas-sy6yco-shard-0', 'tls=true'];
  const final = [baseQs, ...extra.filter(e => !baseQs.includes(e.split('=')[0]))].filter(Boolean).join('&');
  return `mongodb://${creds}@${shards.join(',')}/${db}?${final}`;
}
const MONGO_URI = rewriteSrvToDirect(process.env.MONGO_URI);

const PettyCashFund = require('../erp/models/PettyCashFund');
const PettyCashTransaction = require('../erp/models/PettyCashTransaction');
const ApprovalRequest = require('../erp/models/ApprovalRequest');
const User = require('../models/User');

const FIXTURE_TAG = 'G6.7-PC1 smoke fixture (Apr 30 2026)';

(async () => {
  await mongoose.connect(MONGO_URI);
  const cleanup = process.argv.includes('--cleanup');

  if (cleanup) {
    const txns = await PettyCashTransaction.find({ source_description: FIXTURE_TAG }).lean();
    if (!txns.length) {
      console.log('No fixture txns found.');
      await mongoose.disconnect();
      return;
    }
    const ids = txns.map(t => t._id);
    const reqDel = await ApprovalRequest.deleteMany({ doc_id: { $in: ids } });
    const txnDel = await PettyCashTransaction.deleteMany({ _id: { $in: ids } });
    console.log(`Cleaned up ${txnDel.deletedCount} txn(s) and ${reqDel.deletedCount} request(s).`);
    await mongoose.disconnect();
    return;
  }

  // Find the seed fund — VIP Petty Cash with custodian s25
  const s25 = await User.findOne({ email: 's25.vippharmacy@gmail.com' }).lean();
  if (!s25) throw new Error('s25 user not found');

  const fund = await PettyCashFund.findOne({ custodian_id: s25._id, status: 'ACTIVE' });
  if (!fund) throw new Error('No ACTIVE fund with s25 as custodian');

  // Idempotency: if a PENDING fixture already exists, return it
  const existing = await PettyCashTransaction.findOne({
    source_description: FIXTURE_TAG,
    status: { $ne: 'POSTED' }
  }).lean();
  if (existing) {
    const req = await ApprovalRequest.findOne({ doc_id: existing._id, status: 'PENDING' }).lean();
    console.log('Existing fixture found:');
    console.log('  txn._id           =', existing._id);
    console.log('  request._id       =', req?._id);
    console.log('  fund_name         =', fund.fund_name);
    console.log('  fund_balance      = ₱' + fund.current_balance);
    console.log('  txn_amount        = ₱' + existing.amount);
    console.log('  txn.status        =', existing.status);
    console.log('  request.status    =', req?.status);
    await mongoose.disconnect();
    return;
  }

  // Create DRAFT deposit (small ₱100 so any test post is reversible)
  const txn = await PettyCashTransaction.create({
    entity_id: fund.entity_id,
    fund_id: fund._id,
    txn_type: 'DEPOSIT',
    txn_date: new Date(),
    amount: 100,
    source_description: FIXTURE_TAG,
    status: 'DRAFT',
    running_balance: fund.current_balance,
    created_by: s25._id,
  });

  // Create PENDING ApprovalRequest mirroring what gateApproval would have built
  const request = await ApprovalRequest.create({
    entity_id: fund.entity_id,
    module: 'PETTY_CASH',
    doc_type: 'DEPOSIT',
    doc_id: txn._id,
    doc_ref: txn.txn_number || `PCF-${String(txn._id).slice(-6)}`,
    description: `Petty cash deposit — ${FIXTURE_TAG}`,
    amount: txn.amount,
    requested_by: s25._id,
    requested_at: new Date(),
    status: 'PENDING',
    rule_id: null,
    metadata: { fixture: true, phase: 'G6.7-PC1' },
    history: [{ status: 'PENDING', by: s25._id, reason: 'Synthetic gateApproval enqueue (smoke fixture)' }],
  });

  console.log('Fixture created:');
  console.log('  txn._id           =', txn._id);
  console.log('  request._id       =', request._id);
  console.log('  fund_name         =', fund.fund_name);
  console.log('  fund_balance_pre  = ₱' + fund.current_balance);
  console.log('  txn_amount        = ₱' + txn.amount);
  console.log('  txn.status        =', txn.status, '(should flip to POSTED after Hub approve)');
  console.log('  request.status    =', request.status, '(should flip to APPROVED after Hub approve)');
  console.log('  expected_balance_after_approve = ₱' + (fund.current_balance + txn.amount));

  await mongoose.disconnect();
})().catch(err => {
  console.error('Fixture failed:', err);
  process.exit(1);
});
