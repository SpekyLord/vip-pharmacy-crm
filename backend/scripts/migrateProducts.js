/**
 * Migration Script: Website Products → CRM Products
 *
 * One-time migration that:
 * 1. Connects to both the CRM DB and the website (vip-pharmacy) DB
 * 2. Finds all product IDs referenced in Doctor.targetProducts,
 *    Visit.productsDiscussed, and ProductAssignment
 * 3. Fetches those products from the website DB
 * 4. Creates CrmProduct documents with the SAME _id to preserve all references
 * 5. Sets targetSpecializations to [] (admin fills in later)
 *
 * Usage: node backend/scripts/migrateProducts.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const CrmProduct = require('../models/CrmProduct');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const ProductAssignment = require('../models/ProductAssignment');
const { connectWebsiteDB } = require('../config/websiteDb');
const { getWebsiteProductModel } = require('../models/WebsiteProduct');

const migrateProducts = async () => {
  try {
    // 1. Connect to CRM DB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('CRM DB connected.');

    // 2. Connect to website DB
    await connectWebsiteDB();
    const WebsiteProduct = getWebsiteProductModel();
    console.log('Website DB connected.');

    // 3. Collect all referenced product IDs
    console.log('\nCollecting referenced product IDs...');

    const [doctorProducts, visitProducts, assignmentProducts] = await Promise.all([
      Doctor.distinct('targetProducts.product'),
      Visit.distinct('productsDiscussed.product'),
      ProductAssignment.distinct('product'),
    ]);

    const allIds = new Set([
      ...doctorProducts.map(id => id?.toString()).filter(Boolean),
      ...visitProducts.map(id => id?.toString()).filter(Boolean),
      ...assignmentProducts.map(id => id?.toString()).filter(Boolean),
    ]);

    console.log(`  Doctor.targetProducts: ${doctorProducts.length} unique IDs`);
    console.log(`  Visit.productsDiscussed: ${visitProducts.length} unique IDs`);
    console.log(`  ProductAssignment: ${assignmentProducts.length} unique IDs`);
    console.log(`  Total unique product IDs: ${allIds.size}`);

    if (allIds.size === 0) {
      console.log('\nNo product references found. Nothing to migrate.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // 4. Fetch products from website DB
    const objectIds = [...allIds].map(id => new mongoose.Types.ObjectId(id));
    const websiteProducts = await WebsiteProduct.find({ _id: { $in: objectIds } }).lean();
    console.log(`\nFetched ${websiteProducts.length} products from website DB.`);

    if (websiteProducts.length === 0) {
      console.warn('No matching products found in website DB. Exiting.');
      await mongoose.connection.close();
      process.exit(0);
    }

    // 5. Check for existing CRM products (avoid duplicates)
    const existingCrm = await CrmProduct.find({ _id: { $in: objectIds } }).select('_id').lean();
    const existingIds = new Set(existingCrm.map(p => p._id.toString()));
    console.log(`Already migrated: ${existingIds.size} products.`);

    // 6. Create CrmProduct documents with same _id
    let created = 0;
    let skipped = 0;

    for (const wp of websiteProducts) {
      if (existingIds.has(wp._id.toString())) {
        skipped++;
        continue;
      }

      await CrmProduct.create({
        _id: wp._id,
        name: wp.name || 'Unknown Product',
        genericName: wp.genericName || '',
        dosage: wp.dosage || '',
        category: wp.category || 'Uncategorized',
        description: wp.description || '',
        usage: wp.usage || '',
        safety: wp.safety || '',
        image: wp.image || '',
        imageKey: '',
        targetSpecializations: [],
        isActive: wp.inStock !== false,
      });

      created++;
      console.log(`  Migrated: ${wp.name} (${wp._id})`);
    }

    // 7. Report missing products
    const migratedIds = new Set(websiteProducts.map(p => p._id.toString()));
    const missingIds = [...allIds].filter(id => !migratedIds.has(id));
    if (missingIds.length > 0) {
      console.warn(`\nWARNING: ${missingIds.length} referenced products not found in website DB:`);
      missingIds.forEach(id => console.warn(`  - ${id}`));
    }

    // Summary
    console.log('\n========================================');
    console.log('MIGRATION COMPLETE');
    console.log('========================================');
    console.log(`  Created: ${created} CRM products`);
    console.log(`  Skipped: ${skipped} (already existed)`);
    console.log(`  Missing: ${missingIds.length} (not in website DB)`);
    console.log('\nNext steps:');
    console.log('  1. Go to Admin → Products and assign targetSpecializations');
    console.log('  2. Remove connectWebsiteDB() from server.js (already done)');
    console.log('========================================\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
};

migrateProducts();
