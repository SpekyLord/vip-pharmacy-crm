/**
 * One-time script: Create Angeline Marie Vios account + BALAI LAWAAN entity
 *
 * Angeline is:
 *   - BALAI LAWAAN entity president
 *   - VIP Corporate Secretary
 *   - Territory: BLW (Balai Lawaan)
 *   - CALF override: yes (no CALF required for her expenses)
 *
 * Usage:
 *   cd backend && node erp/scripts/addAngeline.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const User = require('../../models/User');
const Entity = require('../models/Entity');
const Territory = require('../models/Territory');

const PASSWORD = 'BDM123!@#';

async function run() {
  await connectDB();
  console.log('\n=== Add Angeline Marie Vios + BALAI LAWAAN Entity ===\n');

  // 1. Find VIP parent entity
  const vipEntity = await Entity.findOne({ entity_type: 'PARENT', status: 'ACTIVE' });
  if (!vipEntity) {
    console.error('[ERROR] VIP parent entity not found. Run seedEntities.js first.');
    process.exit(1);
  }
  console.log('[EXISTS] VIP parent:', vipEntity.entity_name, '->', vipEntity._id);

  // 2. Create or find BALAI LAWAAN entity
  let blwEntity = await Entity.findOne({ entity_name: /balai lawaan/i });
  if (!blwEntity) {
    blwEntity = await Entity.create({
      entity_name: 'BALAI LAWAAN',
      entity_type: 'SUBSIDIARY',
      parent_entity_id: vipEntity._id,
      status: 'ACTIVE',
      brand_color: '#2D8B4E',
      brand_text_color: '#FFFFFF',
      tagline: ''
    });
    console.log('[CREATED] Entity: BALAI LAWAAN ->', blwEntity._id);
  } else {
    console.log('[EXISTS]  Entity:', blwEntity.entity_name, '->', blwEntity._id);
  }

  // 3. Create or find Angeline's user account
  let angeline = await User.findOne({ email: 'ame.oticovios@gmail.com' });
  if (!angeline) {
    angeline = await User.create({
      name: 'Angeline Marie Vios',
      email: 'ame.oticovios@gmail.com',
      password: PASSWORD,
      role: 'president',
      entity_id: blwEntity._id,
      isActive: true
    });
    console.log('[CREATED] User: Angeline Marie Vios ->', angeline._id);
  } else {
    console.log('[EXISTS]  User:', angeline.name, '— email:', angeline.email, '— role:', angeline.role);
    // Update entity_id if needed
    if (!angeline.entity_id || angeline.entity_id.toString() !== blwEntity._id.toString()) {
      angeline.entity_id = blwEntity._id;
      await angeline.save();
      console.log('[UPDATED] entity_id →', blwEntity._id);
    }
  }

  // 4. Create or update BLW territory
  let blwTerritory = await Territory.findOne({ territory_code: 'BLW' });
  if (!blwTerritory) {
    blwTerritory = await Territory.create({
      entity_id: blwEntity._id,
      territory_code: 'BLW',
      territory_name: 'Balai Lawaan',
      region: 'Iloilo',
      assigned_bdms: [angeline._id],
      is_active: true
    });
    console.log('[CREATED] Territory: BLW ->', blwTerritory._id);
  } else {
    // Ensure Angeline is assigned
    const isAssigned = blwTerritory.assigned_bdms.some(id => id.toString() === angeline._id.toString());
    if (!isAssigned) {
      blwTerritory.assigned_bdms.push(angeline._id);
      await blwTerritory.save();
      console.log('[UPDATED] Territory BLW: added Angeline');
    } else {
      console.log('[EXISTS]  Territory: BLW — Angeline already assigned');
    }
  }

  console.log('\n=== Summary ===');
  console.log('Entity:    BALAI LAWAAN (subsidiary of VIP)');
  console.log('User:      Angeline Marie Vios');
  console.log('Email:     ame.oticovios@gmail.com');
  console.log('Password:  BDM123!@#');
  console.log('Role:      president');
  console.log('Territory: BLW (Balai Lawaan)');
  console.log('');

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
