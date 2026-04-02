/**
 * Seed script for VendorMaster
 * Seeds known VIP vendors with default COA mappings and OCR aliases
 * Idempotent — upserts by vendor_name
 *
 * Usage: node backend/erp/scripts/seedVendors.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const Entity = require('../models/Entity');
const VendorMaster = require('../models/VendorMaster');

const VENDORS = [
  {
    vendor_name: 'AP CARGO LOGISTIC NETWORK CORPORATION',
    vendor_aliases: ['AP CARGO', 'AP CARGO LOGISTIC', 'APCARGO', 'A.P. CARGO'],
    default_coa_code: '6200',
    default_expense_category: 'Courier / Shipping'
  },
  {
    vendor_name: 'JRS EXPRESS',
    vendor_aliases: ['JRS', 'JRS EXPRESS INC'],
    default_coa_code: '6200',
    default_expense_category: 'Courier / Shipping'
  },
  {
    vendor_name: 'LBC EXPRESS',
    vendor_aliases: ['LBC', 'LBC EXPRESS INC'],
    default_coa_code: '6200',
    default_expense_category: 'Courier / Shipping'
  },
  {
    vendor_name: 'PILIPINAS SHELL PETROLEUM CORPORATION',
    vendor_aliases: ['SHELL', 'SHELL STATION', 'PILIPINAS SHELL', 'SHELL SVP'],
    default_coa_code: '6150',
    default_expense_category: 'Fuel & Oil'
  },
  {
    vendor_name: 'PETRON CORPORATION',
    vendor_aliases: ['PETRON', 'PETRON STATION', 'PETRON XCS'],
    default_coa_code: '6150',
    default_expense_category: 'Fuel & Oil'
  },
  {
    vendor_name: 'CALTEX PHILIPPINES',
    vendor_aliases: ['CALTEX', 'CHEVRON', 'CALTEX STATION'],
    default_coa_code: '6150',
    default_expense_category: 'Fuel & Oil'
  },
  {
    vendor_name: 'PHOENIX PETROLEUM',
    vendor_aliases: ['PHOENIX', 'PHOENIX FUEL'],
    default_coa_code: '6150',
    default_expense_category: 'Fuel & Oil'
  },
  {
    vendor_name: 'SEAOIL PHILIPPINES',
    vendor_aliases: ['SEAOIL', 'SEA OIL'],
    default_coa_code: '6150',
    default_expense_category: 'Fuel & Oil'
  },
  {
    vendor_name: 'NLEX CORPORATION',
    vendor_aliases: ['NLEX', 'NORTH LUZON EXPRESSWAY'],
    default_coa_code: '6160',
    default_expense_category: 'Parking & Tolls'
  },
  {
    vendor_name: 'SOUTH LUZON EXPRESSWAY',
    vendor_aliases: ['SLEX', 'SOUTH LUZON'],
    default_coa_code: '6160',
    default_expense_category: 'Parking & Tolls'
  },
  {
    vendor_name: 'TPLEX (TARLAC-PANGASINAN-LA UNION EXPRESSWAY)',
    vendor_aliases: ['TPLEX'],
    default_coa_code: '6160',
    default_expense_category: 'Parking & Tolls'
  },
  {
    vendor_name: 'SKYWAY O&M CORPORATION',
    vendor_aliases: ['SKYWAY', 'SKYWAY CORP'],
    default_coa_code: '6160',
    default_expense_category: 'Parking & Tolls'
  },
  {
    vendor_name: 'CAVITEX INFRASTRUCTURE CORPORATION',
    vendor_aliases: ['CAVITEX'],
    default_coa_code: '6160',
    default_expense_category: 'Parking & Tolls'
  }
];

const seedVendors = async () => {
  await connectDB();

  // Get VIP Inc entity for entity_id
  const vipEntity = await Entity.findOne({ entity_type: 'PARENT' });
  if (!vipEntity) {
    console.error('✗ No parent entity found. Run seedEntities.js first.');
    return;
  }

  let created = 0;
  let existing = 0;

  for (const v of VENDORS) {
    const result = await VendorMaster.findOneAndUpdate(
      { entity_id: vipEntity._id, vendor_name: v.vendor_name },
      {
        ...v,
        entity_id: vipEntity._id,
        is_active: true
      },
      { upsert: true, new: true }
    );
    if (result.createdAt && Date.now() - result.createdAt.getTime() < 5000) {
      created++;
    } else {
      existing++;
    }
  }

  console.log(`✓ Vendors seeded: ${created} created, ${existing} already existed (${VENDORS.length} total)`);
};

if (require.main === module) {
  seedVendors()
    .then(() => mongoose.disconnect())
    .catch(err => {
      console.error('Seed error:', err);
      mongoose.disconnect();
      process.exit(1);
    });
}

module.exports = seedVendors;
