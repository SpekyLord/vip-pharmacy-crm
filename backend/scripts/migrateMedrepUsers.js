/**
 * Migration Script: Migrate MedRep Users
 *
 * The medrep role has been removed (Change 1 in CHANGE_LOG.md).
 * This script converts existing medrep users to admin or employee.
 *
 * Usage:
 *   node backend/scripts/migrateMedrepUsers.js          # defaults to 'admin'
 *   node backend/scripts/migrateMedrepUsers.js admin     # convert to admin
 *   node backend/scripts/migrateMedrepUsers.js employee  # convert to employee
 */

require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_ROLE = process.argv[2] || 'admin';

if (!['admin', 'employee'].includes(TARGET_ROLE)) {
  console.error(`Invalid target role: "${TARGET_ROLE}". Must be "admin" or "employee".`);
  process.exit(1);
}

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected...\n');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Find all medrep users (query raw collection since model no longer allows medrep)
    const medrepUsers = await usersCollection.find({ role: 'medrep' }).toArray();

    if (medrepUsers.length === 0) {
      console.log('No medrep users found. Nothing to migrate.');
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log(`Found ${medrepUsers.length} medrep user(s):`);
    medrepUsers.forEach((u) => {
      console.log(`  - ${u.name} (${u.email})`);
    });

    console.log(`\nMigrating to role: "${TARGET_ROLE}"...\n`);

    const result = await usersCollection.updateMany(
      { role: 'medrep' },
      { $set: { role: TARGET_ROLE } }
    );

    console.log(`Updated ${result.modifiedCount} user(s) from "medrep" → "${TARGET_ROLE}".`);

    // Verify
    const remaining = await usersCollection.countDocuments({ role: 'medrep' });
    if (remaining === 0) {
      console.log('Verification: No medrep users remain. Migration successful.');
    } else {
      console.warn(`WARNING: ${remaining} medrep user(s) still remain!`);
    }

    await mongoose.connection.close();
    console.log('\nDone.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

run();
