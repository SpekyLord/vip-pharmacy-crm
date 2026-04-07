/**
 * Seed script for Entity collection
 * Seeds VIP Inc (parent) and MG AND CO (subsidiary)
 * Idempotent — safe to run multiple times
 *
 * Usage: node backend/erp/scripts/seedEntities.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');

const seedEntities = async () => {
  await connectDB();

  // Upsert VIP Inc (parent)
  const vip = await Entity.findOneAndUpdate(
    { tin: '744-251-498-0000' },
    {
      entity_name: 'VIOS INTEGRATED PROJECTS (VIP) INC.',
      tin: '744-251-498-0000',
      address: 'Iloilo City, Philippines',
      vat_registered: true,
      entity_type: 'PARENT',
      parent_entity_id: null,
      status: 'ACTIVE'
    },
    { upsert: true, new: true, runValidators: true }
  );
  console.log(`✓ Entity: ${vip.entity_name} (${vip._id})`);

  // Upsert MG AND CO (subsidiary)
  const mg = await Entity.findOneAndUpdate(
    { tin: '010-824-240-00000' },
    {
      entity_name: 'MG AND CO. INC.',
      tin: '010-824-240-00000',
      address: 'Iloilo City, Philippines',
      vat_registered: false,
      entity_type: 'SUBSIDIARY',
      parent_entity_id: vip._id,
      status: 'ACTIVE'
    },
    { upsert: true, new: true, runValidators: true }
  );
  console.log(`✓ Entity: ${mg.entity_name} (${mg._id}) → parent: ${vip.entity_name}`);

  console.log('\nEntity seed complete.');
};

// Run if called directly
if (require.main === module) {
  seedEntities()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedEntities;
