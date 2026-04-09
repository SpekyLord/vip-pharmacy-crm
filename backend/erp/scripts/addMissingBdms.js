/**
 * One-time script: Add missing BDM users for opening stock import
 *
 * Creates 3 BDM users (role: employee) so the opening stock import
 * script can match them by name. Also verifies "Gregg Louie Vios" exists.
 *
 * Usage:
 *   cd backend && node erp/scripts/addMissingBdms.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const { ROLES } = require('../../constants/roles');

const BDM_PASSWORD = 'BDM123!@#';

const NEW_BDMS = [
  { name: 'Jay Ann Protacio',       email: 's22.vippharmacy@gmail.com' },
  { name: 'Jenny Rose Jacosalem',   email: 's26.vippharmacy@gmail.com' },
  { name: 'Judy Mae Patrocinio',    email: 's25.vippharmacy@gmail.com' },
];

async function run() {
  await connectDB();
  console.log('\n=== Add Missing BDMs ===\n');

  // 1. Find or create VIP Pharmacy Inc. entity
  let entity = await Entity.findOne({ entity_name: /vip pharmacy/i });
  if (!entity) {
    entity = await Entity.create({
      entity_name: 'VIP Pharmacy Inc.',
      entity_type: 'PARENT',
      status: 'ACTIVE',
    });
    console.log('[CREATED] Entity: VIP Pharmacy Inc. ->', entity._id);
  } else {
    console.log('[EXISTS]  Entity:', entity.entity_name, '->', entity._id);
  }

  // 2. Check for Gregg Louie Vios
  const gregg = await User.findOne({ name: /gregg louie vios/i });
  if (gregg) {
    console.log(`[EXISTS]  Gregg Louie Vios — email: ${gregg.email}, role: ${gregg.role}, id: ${gregg._id}`);
    // Ensure entity_id is set
    if (!gregg.entity_id) {
      gregg.entity_id = entity._id;
      await gregg.save();
      console.log('          -> Set entity_id on Gregg');
    }
  } else {
    // Check by admin email as fallback
    const adminUser = await User.findOne({ email: 'admin@vipcrm.com' });
    if (adminUser) {
      console.log(`[INFO]    "Gregg Louie Vios" not found by name, but admin@vipcrm.com exists — name: "${adminUser.name}", role: ${adminUser.role}`);
      console.log('          If this is the same person, update the name manually or re-run with adjustments.');
    } else {
      console.log('[MISSING] Gregg Louie Vios — not found in DB. Needs manual creation (email unknown).');
    }
  }

  // 3. Create BDMs
  let created = 0;
  let skipped = 0;

  for (const bdm of NEW_BDMS) {
    const existing = await User.findOne({ email: bdm.email });
    if (existing) {
      console.log(`[SKIP]    ${bdm.name} — email ${bdm.email} already exists (id: ${existing._id})`);
      // Ensure entity_id is set
      if (!existing.entity_id) {
        existing.entity_id = entity._id;
        await existing.save();
        console.log(`          -> Set entity_id on ${bdm.name}`);
      }
      skipped++;
      continue;
    }

    const user = new User({
      name: bdm.name,
      email: bdm.email,
      password: BDM_PASSWORD,
      role: ROLES.CONTRACTOR,
      isActive: true,
      entity_id: entity._id,
    });

    await user.save(); // pre-save hook hashes the password
    console.log(`[CREATED] ${bdm.name} — ${bdm.email} (id: ${user._id})`);
    created++;
  }

  console.log(`\n--- Done: ${created} created, ${skipped} skipped ---\n`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('Script failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
