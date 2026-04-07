#!/usr/bin/env node
/**
 * Seed entity branding data (Phase 4B.7)
 *
 * Updates existing entities with brand_color, brand_text_color, and tagline.
 * Safe to run multiple times (idempotent).
 *
 * Usage: cd backend && node erp/scripts/seedEntityBranding.js
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const Entity = require('../models/Entity');

const BRANDING = [
  {
    match: /VIOS INTEGRATED/i,
    brand_color: '#F5C518',
    brand_text_color: '#1A1A1A',
    tagline: 'Ka Dito!'
  },
  {
    match: /MG AND CO/i,
    brand_color: '#1B2D5B',
    brand_text_color: '#FFFFFF',
    tagline: 'Right Dose. Right Partner.'
  }
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  for (const b of BRANDING) {
    const entity = await Entity.findOne({ entity_name: b.match });
    if (!entity) {
      console.log(`⚠️ Entity matching ${b.match} not found — skipping`);
      continue;
    }

    entity.brand_color = b.brand_color;
    entity.brand_text_color = b.brand_text_color;
    entity.tagline = b.tagline;
    await entity.save();
    console.log(`✓ ${entity.entity_name}: ${b.brand_color} / "${b.tagline}"`);
  }

  console.log('\n✅ Entity branding seeded');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
