/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Migration: Set erp_access on existing users based on role
 *
 * - employee with entity_id → Field BDM template
 * - finance with entity_id  → Finance template
 * - admin / president / ceo  → skip (role override in middleware)
 * - users without entity_id  → skip (CRM-only)
 *
 * Idempotent: skips users where erp_access.enabled is already true.
 *
 * Usage: node backend/erp/scripts/migrateErpAccess.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const AccessTemplate = require('../models/AccessTemplate');

const ROLE_TEMPLATE_MAP = {
  employee: 'Field BDM',
  finance: 'Finance',
};

const migrate = async () => {
  await connectDB();
  console.log('═══ Migrate ERP Access ═══\n');

  // Build template lookup: entity_id -> template_name -> template doc
  const templates = await AccessTemplate.find({ is_system: true }).lean();
  const tplMap = {};
  for (const t of templates) {
    const eid = t.entity_id.toString();
    if (!tplMap[eid]) tplMap[eid] = {};
    tplMap[eid][t.template_name] = t;
  }

  // Get users who need migration
  const users = await User.find({
    entity_id: { $ne: null },
    role: { $in: ['employee', 'finance'] },
    $or: [
      { 'erp_access.enabled': { $ne: true } },
      { erp_access: { $exists: false } },
    ],
  }).select('_id name role entity_id erp_access');

  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    const templateName = ROLE_TEMPLATE_MAP[user.role];
    if (!templateName) { skipped++; continue; }

    const eid = user.entity_id.toString();
    const tpl = tplMap[eid]?.[templateName];
    if (!tpl) {
      console.log(`  ⚠ No "${templateName}" template for entity ${eid} — skipping ${user.name}`);
      skipped++;
      continue;
    }

    user.erp_access = {
      enabled: true,
      template_id: tpl._id,
      modules: { ...tpl.modules },
      can_approve: tpl.can_approve,
      updated_at: new Date(),
    };
    user.markModified('erp_access');
    await user.save();
    migrated++;
    console.log(`  ✓ ${user.name} (${user.role}) → ${templateName}`);
  }

  console.log(`\n  Migrated: ${migrated}, Skipped: ${skipped}`);
  console.log('\n═══ Done ═══');
  await mongoose.disconnect();
};

migrate().catch(err => {
  console.error('Migration error:', err);
  mongoose.disconnect();
  process.exit(1);
});
