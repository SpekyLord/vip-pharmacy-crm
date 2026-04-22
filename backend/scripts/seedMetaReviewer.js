/**
 * Seed Meta App Reviewer BDM + Test MD
 *
 * Creates (or resets) the two records the Meta App Review reviewer needs to
 * replicate the Messenger invite + consent + opt-out flow for `pages_messaging`
 * permission review.
 *
 * Idempotent — run as often as needed; password is always re-hashed to the known
 * value so the reviewer credentials never drift.
 *
 *   User (role=contractor):
 *     email:    meta-reviewer@viosintegrated.net
 *     password: MetaReview2026!
 *     name:     Meta App Reviewer (BDM)
 *
 *   Doctor (VIP Client) assigned to the above user:
 *     name:     Dr. Test Reviewer
 *     messengerId is explicitly unset so the binding flow is visible as a state change
 *     marketingConsent.MESSENGER starts with no consent so the invite-reply
 *       writes the first ledger entry (reviewer sees the write happen live)
 *
 * Usage:
 *   npm run seed:meta-reviewer
 *
 * Safety:
 *   - Upserts two records; does not touch any other user or doctor
 *   - Safe to run on prod, staging, or dev
 *   - Re-running resets password + clears messengerId so the reviewer can
 *     replay the flow from a clean state
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const { ROLES } = require('../constants/roles');

const REVIEWER_EMAIL = 'meta-reviewer@viosintegrated.net';
const REVIEWER_PASSWORD = 'MetaReview2026!';
const REVIEWER_NAME = 'Meta App Reviewer (BDM)';

const DOCTOR_FIRST_NAME = 'Test';
const DOCTOR_LAST_NAME = 'Reviewer MD';

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not set in backend/.env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[seed:meta-reviewer] connected to MongoDB');

  // ── Upsert the reviewer User ────────────────────────────────────────────
  // Cannot use findOneAndUpdate for password because the bcrypt pre-save hook
  // only fires on .save(). Fetch-or-create, then assign and save.
  let user = await User.findOne({ email: REVIEWER_EMAIL });
  if (!user) {
    user = new User({
      email: REVIEWER_EMAIL,
      name: REVIEWER_NAME,
      role: ROLES.CONTRACTOR,
      password: REVIEWER_PASSWORD,
      isActive: true,
    });
    await user.save();
    console.log(`[seed:meta-reviewer] created BDM user: ${REVIEWER_EMAIL}`);
  } else {
    user.name = REVIEWER_NAME;
    user.role = ROLES.CONTRACTOR;
    user.password = REVIEWER_PASSWORD;
    user.isActive = true;
    // Clear any lockout state from previous review cycles
    if (typeof user.failedLoginAttempts !== 'undefined') user.failedLoginAttempts = 0;
    if (typeof user.lockedUntil !== 'undefined') user.lockedUntil = null;
    await user.save();
    console.log(`[seed:meta-reviewer] reset BDM user: ${REVIEWER_EMAIL}`);
  }

  // ── Upsert the test MD Doctor ───────────────────────────────────────────
  const doctorFilter = {
    firstName: DOCTOR_FIRST_NAME,
    lastName: DOCTOR_LAST_NAME,
  };

  const doctorUpdate = {
    $set: {
      firstName: DOCTOR_FIRST_NAME,
      lastName: DOCTOR_LAST_NAME,
      specialization: 'IM',
      clinicOfficeAddress: 'Iloilo Doctors Hospital, West Avenue, Iloilo City',
      locality: 'Iloilo City',
      province: 'Iloilo',
      visitFrequency: 4,
      assignedTo: user._id,
      clientType: 'MD',
      isActive: true,
      levelOfEngagement: 3,
      notes:
        'Seed record for Meta App Review replication. The reviewer generates an invite, ' +
        'sends the first inbound Messenger message, observes binding + consent, then sends STOP.',
    },
    $unset: {
      messengerId: '',
      viberId: '',
      whatsappNumber: '',
    },
  };

  const doctor = await Doctor.findOneAndUpdate(doctorFilter, doctorUpdate, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });

  // Reset Messenger consent ledger so the invite-reply can write a fresh entry.
  // Schema path is marketingConsent.MESSENGER.{consented,at,source,withdrawn_at}
  if (doctor.marketingConsent && doctor.marketingConsent.MESSENGER) {
    doctor.marketingConsent.MESSENGER.consented = false;
    doctor.marketingConsent.MESSENGER.at = null;
    doctor.marketingConsent.MESSENGER.source = null;
    doctor.marketingConsent.MESSENGER.withdrawn_at = null;
    await doctor.save();
  }

  console.log(
    `[seed:meta-reviewer] upserted Doctor: Dr. ${DOCTOR_FIRST_NAME} ${DOCTOR_LAST_NAME} (_id=${doctor._id})`
  );

  // ── Print credentials block for pasting into Meta form ──────────────────
  console.log('\n' + '═'.repeat(68));
  console.log('  READY — paste the block below into the Meta App Review form');
  console.log('═'.repeat(68));
  console.log('');
  console.log('Login URL: https://<your-prod-host>/login');
  console.log('');
  console.log(`Email:     ${REVIEWER_EMAIL}`);
  console.log(`Password:  ${REVIEWER_PASSWORD}`);
  console.log(`Role:      BDM (contractor)`);
  console.log('');
  console.log(`Test MD:   Dr. ${DOCTOR_FIRST_NAME} ${DOCTOR_LAST_NAME}`);
  console.log(`           (already assigned to this BDM — open VIP Clients → Engage tab)`);
  console.log('');
  console.log('Flow:');
  console.log('  1. Log in at the URL above.');
  console.log('  2. Sidebar → VIP Clients → open "Dr. Test Reviewer MD".');
  console.log('  3. Engage tab → "Invite via Messenger" → copy the m.me link.');
  console.log('  4. Open the link in a Messenger-logged-in browser, send "Hi".');
  console.log('  5. Refresh CRM → Messenger consent captured, inbox shows message.');
  console.log('  6. Reply from CRM composer → MD receives in Messenger.');
  console.log('  7. Messenger → send STOP → CRM shows consent withdrawn, ack sent.');
  console.log('');
  console.log('═'.repeat(68));

  await mongoose.disconnect();
  console.log('\n[seed:meta-reviewer] done');
}

run().catch((err) => {
  console.error('[seed:meta-reviewer] failed:', err);
  process.exit(1);
});
