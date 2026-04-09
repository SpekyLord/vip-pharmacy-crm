/**
 * Seed PeopleMaster records from existing User records with entity_id
 *
 * Links BDMs, finance, and other ERP users to PeopleMaster records.
 * Idempotent: skips users who already have a PeopleMaster record.
 *
 * Usage: node backend/erp/scripts/seedPeopleMaster.js
 */
const path = require('path');
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const PeopleMaster = require('../models/PeopleMaster');
const { ROLES, ROLE_SETS } = require('../../constants/roles');

const ROLE_TO_PERSON_TYPE = {
  [ROLES.CONTRACTOR]: 'BDM',
  [ROLES.FINANCE]: 'EMPLOYEE',
  [ROLES.ADMIN]: 'EMPLOYEE',
};

const seedPeopleMaster = async () => {
  const users = await User.find({
    entity_id: { $ne: null },
    isActive: true,
    role: { $in: ROLE_SETS.ERP_FINANCE },
  }).lean();

  let created = 0;
  let skipped = 0;

  for (const user of users) {
    // Skip if PeopleMaster already exists for this user
    const existing = await PeopleMaster.findOne({ user_id: user._id }).lean();
    if (existing) { skipped++; continue; }

    const nameParts = (user.name || '').split(' ');
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'Unknown';

    await PeopleMaster.create({
      entity_id: user.entity_id,
      person_type: ROLE_TO_PERSON_TYPE[user.role] || 'EMPLOYEE',
      user_id: user._id,
      full_name: user.name || 'Unknown',
      first_name: firstName,
      last_name: lastName,
      position: user.role === ROLES.CONTRACTOR ? 'Business Development Manager' : user.role,
      department: user.role === ROLES.CONTRACTOR ? 'Sales' : 'Operations',
      employment_type: user.contract_type === 'CONSULTANT' ? 'CONSULTANT' : 'REGULAR',
      date_hired: user.date_started || user.createdAt,
      date_of_birth: user.date_of_birth,
      is_active: true,
      status: 'ACTIVE',
    });
    created++;
  }

  console.log(`  ✓ PeopleMaster: ${created} created, ${skipped} skipped (already exist)`);
};

if (require.main === module) {
  (async () => {
    await connectDB();
    console.log('═══ Seed People Master ═══\n');
    await seedPeopleMaster();
    console.log('\n═══ Done ═══');
    await mongoose.disconnect();
  })().catch(err => {
    console.error('Seed error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = seedPeopleMaster;
