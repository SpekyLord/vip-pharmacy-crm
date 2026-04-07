/**
 * Sync Territory Registry — Updates User profiles from TERRITORY_REGISTRY.csv
 *
 * Updates: firstName, lastName, live_date, entity_id, territory fields
 * Source of truth: docs/TERRITORY_REGISTRY.csv
 *
 * Usage: cd backend && node erp/scripts/syncTerritoryRegistry.js
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const Entity = require('../models/Entity');

const CSV_PATH = path.join(__dirname, '../../../docs/TERRITORY_REGISTRY.csv');

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function parseDateMMDDYYYY(dateStr) {
  if (!dateStr) return null;
  // Handle MM/DD/YYYY format — use UTC to avoid timezone shift
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts.map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  // Handle YYYY-MM-DD format
  return new Date(dateStr + 'T00:00:00Z');
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const lastName = parts.pop();
  return { firstName: parts.join(' '), lastName };
}

async function main() {
  await connectDB();
  console.log('\nSyncing Territory Registry → User profiles\n');

  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCSV(csv);
  console.log(`Found ${rows.length} rows in TERRITORY_REGISTRY.csv\n`);

  // Load entities
  const entities = await Entity.find({}).lean();
  const entityMap = {};
  for (const e of entities) {
    entityMap[e.entity_name.toUpperCase()] = e._id;
    if (e.short_name) entityMap[e.short_name.toUpperCase()] = e._id;
  }

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of rows) {
    const email = row.Email;
    if (!email) continue;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Try case-insensitive
      const userAlt = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      if (!userAlt) {
        console.log(`  ✗ NOT FOUND: ${email} (${row.NAME})`);
        notFound++;
        continue;
      }
    }

    const target = user || await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

    try {
      const { firstName, lastName } = splitName(row.NAME);
      const liveDate = parseDateMMDDYYYY(row['Live Date']);

      // Find entity
      const entityKey = (row.Entity || '').toUpperCase();
      let entityId = entityMap[entityKey] || entityMap['VIP'];
      // Special handling
      if (entityKey === 'MG AND CO.' || entityKey === 'MG AND CO') {
        entityId = entityMap['MG AND CO.'] || entityMap['MILLIGRAMS AND CO. INCORPORATED'] || entityMap['MG AND CO. INC.'];
      }
      if (entityKey === 'BALAI LAWAAN') {
        entityId = entityMap['BALAI LAWAAN'];
      }

      // Update user
      target.firstName = firstName;
      target.lastName = lastName;
      if (liveDate && !isNaN(liveDate.getTime())) {
        target.live_date = liveDate;
      }
      if (entityId) {
        target.entity_id = entityId;
      }

      await target.save();
      console.log(`  ✓ ${email.padEnd(40)} ${firstName} ${lastName} | entity: ${row.Entity} | live: ${liveDate ? liveDate.toISOString().split('T')[0] : 'NOT SET'}`);
      updated++;
    } catch (err) {
      console.log(`  ✗ ERROR: ${email} — ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Updated: ${updated} | Not Found: ${notFound} | Errors: ${errors}`);
  console.log('═'.repeat(60));

  // Verify
  console.log('\nVerification — All users with live_date:\n');
  const allUsers = await User.find({ live_date: { $exists: true } })
    .select('firstName lastName email role live_date entity_id')
    .lean();
  for (const u of allUsers) {
    const ent = entities.find(e => e._id.toString() === u.entity_id?.toString());
    console.log(`  ${(u.firstName || '') + ' ' + (u.lastName || '')} | ${u.email} | ${u.role} | live: ${u.live_date?.toISOString().split('T')[0]} | entity: ${ent?.short_name || ent?.entity_name || 'N/A'}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
