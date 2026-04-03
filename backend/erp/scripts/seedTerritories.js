/**
 * Seed Territories from TERRITORY_REGISTRY.csv
 * Run: cd backend && node erp/scripts/seedTerritories.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Territory = require('../models/Territory');
const Entity = require('../models/Entity');
const User = require('../../models/User');

const REGISTRY = [
  { name: 'Menivie Daniela', email: 's4.vippharmacy@gmail.com', entity: 'VIP', code: 'DIG', territory: 'VIP Davao' },
  { name: 'Mae Navarro', email: 's3.vippharmacy@gmail.com', entity: 'VIP', code: 'BAC', territory: 'VIP Bacolod' },
  { name: 'Cristina Salila', email: 's8.vippharmacy@gmail.com', entity: 'VIP', code: 'GSC', territory: 'VIP Gensan' },
  { name: 'Roman Mabanag', email: 's12.vippharmacy@gmail.com', entity: 'VIP', code: 'OZA', territory: 'VIP Ozamiz' },
  { name: 'Romela Shen Herrera', email: 's18.vippharmacy@gmail.com', entity: 'VIP', code: 'PAN', territory: 'VIP Panay' },
  { name: 'Jake Montero', email: 's19.vippharmacy@gmail.com', entity: 'MG', code: 'MGO', territory: 'MG and CO. Iloilo' },
  { name: 'Edcel Mae Arespacochaga', email: 's21.vippharmacy@gmail.com', entity: 'VIP', code: 'DUM', territory: 'VIP Dumaguete' },
  { name: 'Jay Ann Protacio', email: 's22.vippharmacy@gmail.com', entity: 'VIP', code: 'ILO1', territory: 'eBDM 1 Iloilo' },
  { name: 'Judy Mae Patrocinio', email: 's25.vippharmacy@gmail.com', entity: 'VIP', code: 'ACC', territory: 'Shared Services' },
  { name: 'Jenny Rose Jacosalem', email: 's26.vippharmacy@gmail.com', entity: 'VIP', code: 'ILO2', territory: 'eBDM 2 Iloilo' },
  { name: 'Gregg Louie Vios', email: 'yourpartner@viosintegrated.net', entity: 'VIP', code: 'ADM', territory: 'Admin' },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const entities = await Entity.find({}).lean();
  const entityMap = {};
  for (const e of entities) {
    if (e.entity_type === 'PARENT') entityMap['VIP'] = e._id;
    if (e.entity_name?.includes('MG')) entityMap['MG'] = e._id;
  }
  console.log('Entities:', Object.keys(entityMap).map(k => `${k}=${entityMap[k]}`).join(', '));

  // Delete old territories
  await Territory.deleteMany({});
  console.log('Cleared old territories');

  // Group registry by territory code (in case multiple BDMs share a territory)
  const territoryGroups = {};
  for (const r of REGISTRY) {
    if (!territoryGroups[r.code]) {
      territoryGroups[r.code] = {
        entity_id: entityMap[r.entity] || entityMap['VIP'],
        territory_code: r.code,
        territory_name: r.territory,
        assigned_bdms: []
      };
    }
    // Find user by email
    const user = await User.findOne({ email: r.email }).select('_id').lean();
    if (user) {
      territoryGroups[r.code].assigned_bdms.push(user._id);
      // Also update User.territory_id
      await User.updateOne({ _id: user._id }, { territory_id: null }); // will set after territory created
      console.log(`  Found user: ${r.name} (${r.email})`);
    } else {
      console.log(`  WARNING: User not found: ${r.name} (${r.email})`);
    }
  }

  // Create territories and update User.territory_id
  for (const [code, data] of Object.entries(territoryGroups)) {
    const territory = await Territory.create(data);
    console.log(`  Created: ${code} — ${data.territory_name} (${data.assigned_bdms.length} BDMs)`);

    // Update User.territory_id for assigned BDMs
    for (const bdmId of data.assigned_bdms) {
      await User.updateOne({ _id: bdmId }, { territory_id: territory._id });
    }
  }

  // Summary
  const count = await Territory.countDocuments();
  console.log(`\nDone. ${count} territories created.`);

  // Verify
  const all = await Territory.find({}).populate('assigned_bdms', 'firstName lastName email').lean();
  for (const t of all) {
    const bdms = t.assigned_bdms.map(b => `${b.firstName} ${b.lastName}`).join(', ');
    console.log(`  ${t.territory_code} | ${t.territory_name} | ${bdms}`);
  }

  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
