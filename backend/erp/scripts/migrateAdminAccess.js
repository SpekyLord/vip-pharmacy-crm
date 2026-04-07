/**
 * Migration: Assign full ERP access to admin users without erp_access.enabled
 *
 * Phase 24A deprecated the backward-compat admin bypass (was: full access,
 * now: VIEW only). This script creates a "Full Access — Admin" system template
 * per entity and assigns it to any admin user that lacks an access template.
 *
 * Idempotent: skips admins that already have erp_access.enabled = true.
 *
 * Usage: node backend/erp/scripts/migrateAdminAccess.js
 */
const path = require('path');
if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const AccessTemplate = require('../models/AccessTemplate');
const User = require('../../models/User');
const Entity = require('../models/Entity');

const FULL_MODULES = {
  sales: 'FULL',
  inventory: 'FULL',
  collections: 'FULL',
  expenses: 'FULL',
  reports: 'FULL',
  people: 'FULL',
  payroll: 'FULL',
  accounting: 'FULL',
  purchasing: 'FULL',
  banking: 'FULL',
};

async function migrateAdminAccess() {
  const entities = await Entity.find({ status: 'ACTIVE' }).lean();
  if (!entities.length) {
    console.log('  No active entities — nothing to do');
    return;
  }

  let totalMigrated = 0;

  for (const entity of entities) {
    // Upsert a system template for this entity
    let template = await AccessTemplate.findOne({
      entity_id: entity._id,
      template_name: 'Full Access — Admin',
      is_system: true
    });

    if (!template) {
      template = await AccessTemplate.create({
        entity_id: entity._id,
        template_name: 'Full Access — Admin',
        modules: FULL_MODULES,
        can_approve: true,
        sub_permissions: {},
        is_system: true,
        is_active: true
      });
      console.log(`  Created "Full Access — Admin" template for ${entity.short_name || entity.entity_name}`);
    }

    // Find admin users for this entity without erp_access enabled
    const admins = await User.find({
      role: 'admin',
      entity_id: entity._id,
      $or: [
        { 'erp_access.enabled': { $ne: true } },
        { erp_access: { $exists: false } }
      ]
    });

    for (const admin of admins) {
      admin.erp_access = {
        enabled: true,
        template_id: template._id,
        modules: { ...FULL_MODULES },
        can_approve: true,
        sub_permissions: {},
        updated_at: new Date()
      };
      await admin.save();
      console.log(`  ${admin.name || admin.email} → assigned Full Access template`);
      totalMigrated++;
    }
  }

  // Also handle admins with no entity_id (legacy)
  const orphanAdmins = await User.find({
    role: 'admin',
    entity_id: { $exists: false },
    $or: [
      { 'erp_access.enabled': { $ne: true } },
      { erp_access: { $exists: false } }
    ]
  });

  if (orphanAdmins.length) {
    console.log(`\n  ⚠ ${orphanAdmins.length} admin(s) have no entity_id — assign them to an entity first:`);
    for (const a of orphanAdmins) {
      console.log(`    - ${a.name || a.email} (${a._id})`);
    }
  }

  console.log(`\n  Migration complete: ${totalMigrated} admin(s) assigned Full Access templates`);
}

if (require.main === module) {
  (async () => {
    await connectDB();
    console.log('═══ Migrate Admin ERP Access ═══\n');
    await migrateAdminAccess();
    await mongoose.disconnect();
  })().catch(err => {
    console.error('Migration error:', err);
    mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = migrateAdminAccess;
