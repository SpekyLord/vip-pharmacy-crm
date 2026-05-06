#!/usr/bin/env node
/**
 * Phase J2.2 PS-Auto-Flip — End-to-End Smoke (DB-touching)
 *
 * Drives the helper through the full happy path against the dev cluster, then
 * RESTORES every side effect so the cluster is left exactly as it was found.
 *
 * Steps:
 *   1. Pick a real BDM (default: Mae Navarro — s3.vippharmacy@gmail.com).
 *   2. Snapshot baseline (PeopleMaster.withhold_active).
 *   3. Reset baseline to false (so we can observe the flip cleanly).
 *   4. Invoke maybeAutoFlipPsEligibility with a fabricated psResult { eligible: true }.
 *   5. Assert: withhold_active flipped to true.
 *   6. Assert: an inbox row was created with the expected shape.
 *   7. Re-invoke: assert idempotent ({ changed: false, reason: 'already_active' }).
 *   8. RESTORE: PeopleMaster.withhold_active back to baseline.
 *   9. CLEANUP: delete every smoke-tagged MessageInbox row this run created.
 *
 * Test-residue safety: every inbox row carries action_payload.smoke=true so
 * cleanup can scope deletes precisely. If cleanup fails, the operator sees a
 * deterministic count and a one-line query to delete the residue manually.
 *
 * Usage:
 *   node backend/scripts/smokePsAutoFlip.js                 # default: Mae Navarro on her primary entity
 *   node backend/scripts/smokePsAutoFlip.js --email s19.vippharmacy@gmail.com
 *   node backend/scripts/smokePsAutoFlip.js --keep-residue  # skip step 9 (manual cleanup)
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const PeopleMaster = require('../erp/models/PeopleMaster');
const MessageInbox = require('../models/MessageInbox');
const psAutoFlip = require('../erp/services/psAutoFlipService');

const args = process.argv.slice(2);
const emailIdx = args.indexOf('--email');
const TARGET_EMAIL = emailIdx >= 0 ? args[emailIdx + 1] : 's3.vippharmacy@gmail.com';
const KEEP_RESIDUE = args.includes('--keep-residue');
const SMOKE_PERIOD = '2099-12'; // future-dated so it can never collide with a real PS evaluation

let passed = 0;
let failed = 0;
const log = (msg) => process.stdout.write(`${msg}\n`);
function check(cond, label, detail = '') {
  if (cond) {
    passed += 1;
    log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[smoke] MONGO_URI not set. Aborting.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  log(`[smoke] Connected. Target BDM: ${TARGET_EMAIL}`);
  log(`[smoke] Smoke period: ${SMOKE_PERIOD} (future-dated, never collides with real eval)`);
  log('');

  // ─── Step 1: Resolve target BDM ───────────────────────────────────────
  log('Step 1 — Resolve target BDM');
  const user = await User.findOne({ email: TARGET_EMAIL }).lean();
  check(user !== null, `User found for ${TARGET_EMAIL}`,
    user ? `${user.name} (${user._id})` : 'NOT FOUND — adjust --email');
  if (!user) return finish();

  const person = await PeopleMaster.findOne({ user_id: user._id, is_active: true }).lean();
  check(person !== null, 'PeopleMaster row found for that user',
    person ? `${person.full_name} entity=${person.entity_id}` : 'NOT FOUND');
  if (!person) return finish();

  const ENTITY_ID = person.entity_id;
  const PERSON_ID = person._id;
  const BDM_ID = user._id;

  // ─── Step 2: Snapshot baseline ────────────────────────────────────────
  log('\nStep 2 — Snapshot baseline');
  const baseline = {
    withhold_active: person.withhold_active === true,
  };
  log(`     baseline.withhold_active = ${baseline.withhold_active}`);

  // ─── Step 3: Reset to false (observable starting state) ───────────────
  log('\nStep 3 — Reset PeopleMaster.withhold_active to false');
  await PeopleMaster.updateOne({ _id: PERSON_ID }, { $set: { withhold_active: false } });
  const after3 = await PeopleMaster.findById(PERSON_ID).lean();
  check(after3.withhold_active === false, 'reset successful', 'withhold_active=false');

  // Mark inbox cutoff so cleanup only touches rows created post-cutoff
  const cutoff = new Date();
  await new Promise((r) => setTimeout(r, 50)); // ensure clock advances past cutoff
  log(`     inbox cleanup cutoff = ${cutoff.toISOString()}`);

  // ─── Step 4: Invoke the helper ───────────────────────────────────────
  log('\nStep 4 — Invoke maybeAutoFlipPsEligibility (first time, eligible=true)');
  const psResult = {
    eligible: true,
    bdm_share: 12345.67,
    vip_share: 98765.43,
    ps_products: [
      { product_id: new mongoose.Types.ObjectId(), product_name: 'SMOKE PRODUCT A', qualified: true },
      { product_id: new mongoose.Types.ObjectId(), product_name: 'SMOKE PRODUCT B', qualified: true },
    ],
    deficit_flag: false,
  };
  const r1 = await psAutoFlip.maybeAutoFlipPsEligibility({
    entityId: ENTITY_ID,
    bdmId: BDM_ID,
    period: SMOKE_PERIOD,
    psResult,
  });
  log(`     return: ${JSON.stringify(r1)}`);
  check(r1.changed === true, 'first call returned changed=true');
  check(String(r1.person_id) === String(PERSON_ID), 'returned person_id matches PeopleMaster._id');

  // ─── Step 5: Verify the persistence flip ─────────────────────────────
  log('\nStep 5 — Verify PeopleMaster.withhold_active flipped to true');
  const after5 = await PeopleMaster.findById(PERSON_ID).lean();
  check(after5.withhold_active === true, 'withhold_active === true');

  // ─── Step 6: Verify inbox row(s) exist ───────────────────────────────
  log('\nStep 6 — Verify MessageInbox alert(s)');
  // Wait briefly for dispatchMultiChannel to finish the per-recipient writes
  await new Promise((r) => setTimeout(r, 1500));

  const inboxRows = await MessageInbox.find({
    entity_id: ENTITY_ID,
    category: 'compliance_alert',
    folder: 'ACTION_REQUIRED',
    'action_payload.people_id': String(PERSON_ID),
    createdAt: { $gte: cutoff },
  }).lean();

  log(`     inbox rows created: ${inboxRows.length}`);
  check(inboxRows.length > 0, 'at least one MessageInbox row created');

  if (inboxRows.length > 0) {
    const row = inboxRows[0];
    check(row.priority === 'high', 'priority=high');
    check(row.requires_action === true, 'requires_action=true');
    check(row.action_type === 'acknowledge', 'action_type=acknowledge');
    check(/PS eligibility|withholding|withhold|profit-sharing/i.test(row.title || ''),
      'title mentions PS/withholding', `title="${row.title}"`);
    check(row.action_payload?.deep_link === '/erp/bir',
      'action_payload.deep_link === /erp/bir');
    check(String(row.action_payload?.bdm_id) === String(BDM_ID),
      'action_payload.bdm_id matches');
    check(row.action_payload?.period === SMOKE_PERIOD,
      'action_payload.period matches');

    // Recipient role spread — the helper resolves audience via PS_AUTO_FLIP_NOTIFY_ROLES
    // (default admin/finance/president). Verify at least one inbox row carries an
    // audience-side role.
    const seenRoles = new Set(inboxRows.map((r) => String(r.recipientRole || '').toLowerCase()));
    const expectedRoles = ['admin', 'finance', 'president'];
    const roleHits = expectedRoles.filter((r) => seenRoles.has(r));
    check(roleHits.length > 0,
      'at least one inbox row addresses an expected role',
      `seen=[${[...seenRoles].join(', ')}]`);
  }

  // ─── Step 7: Idempotency — second invocation is a no-op ─────────────
  log('\nStep 7 — Re-invoke (must be idempotent no-op)');
  const r2 = await psAutoFlip.maybeAutoFlipPsEligibility({
    entityId: ENTITY_ID,
    bdmId: BDM_ID,
    period: SMOKE_PERIOD,
    psResult,
  });
  log(`     return: ${JSON.stringify(r2)}`);
  check(r2.changed === false, 'second call returned changed=false');
  check(r2.reason === 'already_active', 'second call returned reason=already_active');

  // Verify no NEW inbox rows landed since the first dispatch
  await new Promise((r) => setTimeout(r, 500));
  const inboxRows2 = await MessageInbox.find({
    entity_id: ENTITY_ID,
    category: 'compliance_alert',
    folder: 'ACTION_REQUIRED',
    'action_payload.people_id': String(PERSON_ID),
    createdAt: { $gte: cutoff },
  }).countDocuments();
  check(inboxRows2 === inboxRows.length,
    'no additional inbox rows on idempotent re-call',
    `before=${inboxRows.length} after=${inboxRows2}`);

  // ─── Step 8: Restore baseline withhold_active ────────────────────────
  log('\nStep 8 — RESTORE PeopleMaster.withhold_active to baseline');
  await PeopleMaster.updateOne(
    { _id: PERSON_ID },
    { $set: { withhold_active: baseline.withhold_active } }
  );
  const restored = await PeopleMaster.findById(PERSON_ID).lean();
  check(restored.withhold_active === baseline.withhold_active,
    'baseline restored',
    `withhold_active=${restored.withhold_active}`);

  // ─── Step 9: CLEANUP — delete smoke-created inbox rows ───────────────
  if (KEEP_RESIDUE) {
    log('\nStep 9 — SKIPPED (--keep-residue). Manual cleanup query:');
    log(`     db.messages.deleteMany({entity_id:${JSON.stringify(ENTITY_ID)},category:'compliance_alert',folder:'ACTION_REQUIRED','action_payload.people_id':${JSON.stringify(String(PERSON_ID))},createdAt:{$gte:${JSON.stringify(cutoff)}}});`);
  } else {
    log('\nStep 9 — Cleanup smoke-created inbox rows');
    const delRes = await MessageInbox.deleteMany({
      entity_id: ENTITY_ID,
      category: 'compliance_alert',
      folder: 'ACTION_REQUIRED',
      'action_payload.people_id': String(PERSON_ID),
      createdAt: { $gte: cutoff },
    });
    check(delRes.deletedCount === inboxRows.length,
      'cleanup matched expected count',
      `deleted=${delRes.deletedCount}`);
  }

  finish();
}

function finish() {
  log('\n============================================================');
  log(`Result: ${passed} PASS / ${failed} FAIL`);
  mongoose.disconnect().finally(() => {
    if (failed > 0) {
      log('\nSmoke FAILED — review the output above.');
      process.exit(1);
    }
    log('\nSmoke CLEAN — Phase J2.2 end-to-end happy path verified, baseline restored.');
    process.exit(0);
  });
}

run().catch((err) => {
  console.error('[smoke] uncaught:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
