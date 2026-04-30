/**
 * Smoke fixture: creates ONE DRAFT JournalEntry + matching PENDING ApprovalRequest
 * so the Approval Hub surfaces a JOURNAL item we can verify the Phase G6.7-PC2
 * approve path against.
 *
 * Usage:
 *   node backend/scripts/smokeFixtureJournalHubApprove.js          # create
 *   node backend/scripts/smokeFixtureJournalHubApprove.js --cleanup  # remove
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
const MONGO_URI = rewriteSrvToDirect(process.env.MONGO_URI);

const JournalEntry = require('../erp/models/JournalEntry');
const ApprovalRequest = require('../erp/models/ApprovalRequest');
const Entity = require('../erp/models/Entity');
const User = require('../models/User');

const FIXTURE_TAG = 'G6.7-PC2 smoke fixture (Apr 30 2026)';

(async () => {
  await mongoose.connect(MONGO_URI);
  const cleanup = process.argv.includes('--cleanup');

  if (cleanup) {
    const jes = await JournalEntry.find({ description: FIXTURE_TAG }).lean();
    if (!jes.length) { console.log('No fixture JEs found.'); await mongoose.disconnect(); return; }
    const ids = jes.map(j => j._id);
    const reqDel = await ApprovalRequest.deleteMany({ doc_id: { $in: ids } });
    const jeDel = await JournalEntry.deleteMany({ _id: { $in: ids } });
    console.log(`Cleaned up ${jeDel.deletedCount} JE(s) and ${reqDel.deletedCount} request(s).`);
    await mongoose.disconnect();
    return;
  }

  const s25 = await User.findOne({ email: 's25.vippharmacy@gmail.com' }).lean();
  if (!s25) throw new Error('s25 user not found');

  // Entity model uses entity_name / short_name (no entity_code field).
  const vipEntity = await Entity.findOne({ short_name: 'VIP' }).lean()
                 || await Entity.findOne({ entity_name: /^VIP/i }).lean();
  if (!vipEntity) throw new Error('VIP entity not found (looked up by short_name=VIP / entity_name=^VIP)');

  // Idempotency: if a non-POSTED fixture already exists, return it
  const existing = await JournalEntry.findOne({
    description: FIXTURE_TAG,
    status: { $ne: 'POSTED' }
  }).lean();
  if (existing) {
    const req = await ApprovalRequest.findOne({ doc_id: existing._id, status: 'PENDING' }).lean();
    console.log('Existing fixture found:');
    console.log('  je._id            =', existing._id);
    console.log('  request._id       =', req?._id);
    console.log('  je_number         =', existing.je_number);
    console.log('  je.status         =', existing.status);
    console.log('  request.status    =', req?.status);
    await mongoose.disconnect();
    return;
  }

  // Build a balanced 2-line JE: ₱100 cash deposit (Dr Cash / Cr Owner Equity).
  // Account codes are stable seed values; if either is missing, the JE pre-save
  // will reject — that's a separate problem to chase, not for this fixture to fix.
  const period = (() => {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  })();

  // Use a low-risk pair we know exists: any cash/equity. Try common codes;
  // we'll fall back to a placeholder pair the validator will reject loudly.
  // Account codes verified against live VIP ChartOfAccounts via API: 1000 (Cash on Hand) + 3000 (Owner Capital).
  const lines = [
    { account_code: '1000', account_name: 'Cash on Hand', debit: 100, credit: 0, description: FIXTURE_TAG },
    { account_code: '3000', account_name: 'Owner Capital', debit: 0, credit: 100, description: FIXTURE_TAG },
  ];

  // Generate a JE number via DocSequence-equivalent — fall back to a temp string
  // if the helper isn't easily importable. The pre-save hook may or may not require it.
  const jeNumber = `JE-G67PC2-${Date.now()}`;

  const je = await JournalEntry.create({
    entity_id: vipEntity._id,
    je_number: jeNumber,
    je_date: new Date(),
    period,
    description: FIXTURE_TAG,
    source_module: 'MANUAL',
    lines,
    bir_flag: 'BOTH',
    vat_flag: 'N/A',
    status: 'DRAFT',
    created_by: s25._id,
  });

  // Mirror what gateApproval would have built
  const request = await ApprovalRequest.create({
    entity_id: vipEntity._id,
    module: 'JOURNAL',
    doc_type: 'JOURNAL_ENTRY',
    doc_id: je._id,
    doc_ref: je.je_number,
    description: `Manual JE — ${FIXTURE_TAG}`,
    amount: 100,
    requested_by: s25._id,
    requested_at: new Date(),
    status: 'PENDING',
    rule_id: null,
    metadata: { fixture: true, phase: 'G6.7-PC2' },
    history: [{ status: 'PENDING', by: s25._id, reason: 'Synthetic gateApproval enqueue (smoke fixture)' }],
  });

  console.log('Fixture created:');
  console.log('  je._id           =', je._id);
  console.log('  request._id      =', request._id);
  console.log('  je_number        =', je.je_number);
  console.log('  je.status        =', je.status, '(should flip to POSTED after Hub approve)');
  console.log('  request.status   =', request.status, '(should flip to APPROVED after Hub approve)');
  console.log('  amount           = ₱100 (DR 1010 / CR 3010)');

  await mongoose.disconnect();
})().catch(err => {
  console.error('Fixture failed:', err);
  process.exit(1);
});
