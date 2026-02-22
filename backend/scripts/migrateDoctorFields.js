/**
 * Migration Script: Doctor Model Field Extensions (Task A.1)
 *
 * This script migrates existing Doctor documents to the new field structure:
 * 1. Splits `name` into `firstName` + `lastName`
 * 2. Merges `hospital` + `address.street` into `clinicOfficeAddress`
 * 3. Removes deprecated fields (`name`, `hospital`, `address`)
 *
 * Usage: node backend/scripts/migrateDoctorFields.js
 * (Requires MONGO_URI in .env)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment variables');
  process.exit(1);
}

/**
 * Split a full name into firstName and lastName
 * Handles "Dr. FirstName LastName" format
 */
const splitName = (fullName) => {
  if (!fullName) return { firstName: 'Unknown', lastName: 'Unknown' };

  // Remove "Dr." prefix if present
  let name = fullName.replace(/^Dr\.?\s*/i, '').trim();

  if (!name) return { firstName: 'Unknown', lastName: 'Unknown' };

  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }

  // Last word is lastName, rest is firstName
  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  return { firstName, lastName };
};

/**
 * Merge hospital and address into clinicOfficeAddress
 */
const mergeAddress = (hospital, address) => {
  const parts = [];

  if (hospital) parts.push(hospital);

  if (address) {
    if (address.street) parts.push(address.street);
    // Only add city/province if no hospital (avoid redundancy)
    if (!hospital) {
      if (address.city) parts.push(address.city);
      if (address.province) parts.push(address.province);
    }
  }

  return parts.join(', ') || null;
};

const migrate = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const db = mongoose.connection.db;
    const collection = db.collection('doctors');

    // Count documents that need migration (have `name` field but no `firstName`)
    const toMigrate = await collection.countDocuments({
      name: { $exists: true },
      firstName: { $exists: false },
    });

    console.log(`Found ${toMigrate} doctors to migrate.`);

    if (toMigrate === 0) {
      console.log('No migration needed. All doctors already have firstName/lastName.');
      await mongoose.disconnect();
      return;
    }

    // Fetch all doctors that need migration
    const doctors = await collection.find({
      name: { $exists: true },
      firstName: { $exists: false },
    }).toArray();

    let migrated = 0;
    let errors = 0;

    for (const doc of doctors) {
      try {
        const { firstName, lastName } = splitName(doc.name);
        const clinicOfficeAddress = mergeAddress(doc.hospital, doc.address);

        const updateFields = {
          firstName,
          lastName,
        };

        if (clinicOfficeAddress) {
          updateFields.clinicOfficeAddress = clinicOfficeAddress;
        }

        await collection.updateOne(
          { _id: doc._id },
          {
            $set: updateFields,
            $unset: {
              name: '',
              hospital: '',
              address: '',
            },
          }
        );

        migrated++;
        console.log(`  Migrated: "${doc.name}" → firstName="${firstName}", lastName="${lastName}", address="${clinicOfficeAddress || 'N/A'}"`);
      } catch (err) {
        errors++;
        console.error(`  ERROR migrating ${doc._id} (${doc.name}):`, err.message);
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total found: ${toMigrate}`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Errors: ${errors}`);

    // Drop the old text index on { name, hospital } if it exists
    try {
      const indexes = await collection.indexes();
      const textIndex = indexes.find(idx =>
        idx.weights && (idx.weights.name || idx.weights.hospital)
      );
      if (textIndex) {
        console.log(`\nDropping old text index: ${textIndex.name}`);
        await collection.dropIndex(textIndex.name);
        console.log('Old text index dropped. New index will be created by Mongoose on next startup.');
      }
    } catch (indexErr) {
      console.log('Note: Could not drop old text index (may not exist):', indexErr.message);
    }

    await mongoose.disconnect();
    console.log('\nMigration complete. Disconnected.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
};

migrate();
