/**
 * Seed script for Inventory (OPENING_BALANCE entries)
 *
 * Creates sample ProductMaster records + InventoryLedger OPENING_BALANCE entries
 * for testing FIFO engine and sales module.
 *
 * Requires: Entity seed (seedEntities.js) must have run first.
 *
 * Usage: node backend/erp/scripts/seedInventory.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const ProductMaster = require('../models/ProductMaster');
const InventoryLedger = require('../models/InventoryLedger');
const Hospital = require('../models/Hospital');
const User = require('../../models/User');

const PRODUCTS = [
  {
    brand_name: 'Dexavit',
    generic_name: 'Multivitamins + Iron',
    dosage_strength: '500mg',
    sold_per: 'BOX',
    purchase_price: 150,
    selling_price: 250,
    vat_status: 'VATABLE',
    category: 'Vitamins',
    product_aliases: ['DEXAVIT', 'DXVIT', 'DEXAVIT MULTIVITAMINS']
  },
  {
    brand_name: 'Ambroxol',
    generic_name: 'Ambroxol HCl',
    dosage_strength: '30mg/5ml',
    sold_per: 'BOTTLE',
    purchase_price: 80,
    selling_price: 140,
    vat_status: 'VATABLE',
    category: 'Respiratory',
    product_aliases: ['AMBROXOL HCL', 'AMBROXOL SYRUP']
  },
  {
    brand_name: 'Cefalexin',
    generic_name: 'Cefalexin Monohydrate',
    dosage_strength: '500mg',
    sold_per: 'CAPSULE',
    purchase_price: 12,
    selling_price: 22,
    vat_status: 'VATABLE',
    category: 'Antibiotics',
    product_aliases: ['CEFALEXIN', 'CEPHALEXIN']
  },
  {
    brand_name: 'Paracetamol',
    generic_name: 'Paracetamol',
    dosage_strength: '500mg',
    sold_per: 'TABLET',
    purchase_price: 2,
    selling_price: 5,
    vat_status: 'EXEMPT',
    category: 'Analgesics',
    product_aliases: ['BIOGESIC', 'PARACETAMOL TAB']
  },
  {
    brand_name: 'Losartan',
    generic_name: 'Losartan Potassium',
    dosage_strength: '50mg',
    sold_per: 'TABLET',
    purchase_price: 8,
    selling_price: 15,
    vat_status: 'VATABLE',
    category: 'Cardiovascular',
    product_aliases: ['LOSARTAN K', 'LOSARTAN POTASSIUM']
  },
  {
    brand_name: 'Surgical Gloves',
    generic_name: 'Latex Gloves (Sterile)',
    dosage_strength: 'Medium',
    sold_per: 'PAIR',
    purchase_price: 15,
    selling_price: 30,
    vat_status: 'VATABLE',
    category: 'Medical Supplies',
    product_aliases: ['GLOVES MEDIUM', 'LATEX GLOVES']
  }
];

// Batches per product: each with batch_lot_no, expiry_date, qty
const BATCHES = [
  // Dexavit — 2 batches
  { productIdx: 0, batch_lot_no: 'DXV2025A', expiry_date: new Date('2026-08-01'), qty: 100 },
  { productIdx: 0, batch_lot_no: 'DXV2026B', expiry_date: new Date('2027-03-01'), qty: 50 },
  // Ambroxol — 1 batch
  { productIdx: 1, batch_lot_no: 'AMB2025X', expiry_date: new Date('2026-06-01'), qty: 30 },
  // Cefalexin — 2 batches (one near-expiry)
  { productIdx: 2, batch_lot_no: 'CEF2025A', expiry_date: new Date('2026-07-01'), qty: 200 },
  { productIdx: 2, batch_lot_no: 'CEF2026C', expiry_date: new Date('2027-01-01'), qty: 100 },
  // Paracetamol — 1 large batch
  { productIdx: 3, batch_lot_no: 'PAR2026A', expiry_date: new Date('2027-12-01'), qty: 500 },
  // Losartan — 2 batches
  { productIdx: 4, batch_lot_no: 'LOS2025A', expiry_date: new Date('2026-09-01'), qty: 150 },
  { productIdx: 4, batch_lot_no: 'LOS2026B', expiry_date: new Date('2027-06-01'), qty: 80 },
  // Surgical Gloves — 1 batch
  { productIdx: 5, batch_lot_no: 'GLV2026A', expiry_date: new Date('2027-12-01'), qty: 50 }
];

const HOSPITALS = [
  {
    hospital_name: 'Western Visayas Medical Center',
    hospital_type: 'Government',
    payment_terms: 30,
    vat_status: 'EXEMPT'
  },
  {
    hospital_name: 'Iloilo Doctors Hospital',
    hospital_type: 'Private',
    payment_terms: 15,
    vat_status: 'VATABLE'
  },
  {
    hospital_name: 'St. Pauls Hospital Iloilo',
    hospital_type: 'Private',
    payment_terms: 30,
    vat_status: 'VATABLE'
  }
];

const seedInventory = async () => {
  await connectDB();

  // Get VIP entity
  const vipEntity = await Entity.findOne({ tin: '744-251-498-0000' });
  if (!vipEntity) {
    console.error('VIP Entity not found. Run seedEntities.js first.');
    return;
  }

  // Find or create a BDM user for seeding
  let bdm = await User.findOne({ email: 'juan@vipcrm.com' });
  if (!bdm) {
    console.log('BDM user juan@vipcrm.com not found. Creating test BDM...');
    bdm = await User.findOne({ role: 'employee' });
  }
  if (!bdm) {
    console.error('No BDM (employee) user found. Run CRM seed first.');
    return;
  }

  // Assign entity_id to BDM if not set
  if (!bdm.entity_id) {
    bdm.entity_id = vipEntity._id;
    bdm.live_date = new Date('2026-01-01');
    await bdm.save();
    console.log(`✓ Assigned entity_id to BDM: ${bdm.name}`);
  }

  const entityId = vipEntity._id;
  const bdmId = bdm._id;

  // Upsert products
  const productDocs = [];
  for (const p of PRODUCTS) {
    const doc = await ProductMaster.findOneAndUpdate(
      { entity_id: entityId, item_key: `${p.brand_name}|${p.dosage_strength}` },
      { ...p, entity_id: entityId, added_by: bdmId },
      { upsert: true, new: true, runValidators: true }
    );
    productDocs.push(doc);
  }
  console.log(`✓ Products seeded: ${productDocs.length}`);

  // Upsert hospitals
  for (const h of HOSPITALS) {
    await Hospital.findOneAndUpdate(
      { entity_id: entityId, hospital_name: h.hospital_name },
      { ...h, entity_id: entityId, status: 'ACTIVE' },
      { upsert: true, new: true, runValidators: true }
    );
  }
  console.log(`✓ Hospitals seeded: ${HOSPITALS.length}`);

  // Create OPENING_BALANCE entries (skip if already exist for this entity)
  const existingCount = await InventoryLedger.countDocuments({
    entity_id: entityId,
    transaction_type: 'OPENING_BALANCE'
  });

  if (existingCount > 0) {
    console.log(`✓ Inventory already seeded (${existingCount} entries). Skipping.`);
  } else {
    for (const batch of BATCHES) {
      await InventoryLedger.create({
        entity_id: entityId,
        bdm_id: bdmId,
        product_id: productDocs[batch.productIdx]._id,
        batch_lot_no: batch.batch_lot_no,
        expiry_date: batch.expiry_date,
        transaction_type: 'OPENING_BALANCE',
        qty_in: batch.qty,
        running_balance: batch.qty,
        recorded_by: bdmId
      });
    }
    console.log(`✓ Inventory seeded: ${BATCHES.length} OPENING_BALANCE entries`);
  }

  console.log('\nInventory seed complete.');
};

// Run standalone or as module
if (require.main === module) {
  seedInventory()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedInventory;
