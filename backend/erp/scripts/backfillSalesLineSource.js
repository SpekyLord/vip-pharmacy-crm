/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Migration Script: Backfill SalesLine.source on legacy rows
 *
 * Sets source = 'SALES_LINE' on any SalesLine document where the field is
 * literally missing from the stored Mongo document. Mongoose schema defaults
 * apply on write + hydration but NOT on MongoDB query filters — so the new
 * duplicate-detection rule in validateSales (which scopes by source) would
 * silently miss legacy rows whose source field was never persisted.
 *
 * Idempotent: re-running after the backfill is a no-op (updateMany matches
 * nothing once every row has a source).
 *
 * Usage: node backend/erp/scripts/backfillSalesLineSource.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const db = require('../../config/db');

async function migrate() {
  await db();

  const SalesLine = require('../models/SalesLine');

  const res = await SalesLine.updateMany(
    { source: { $exists: false } },
    { $set: { source: 'SALES_LINE' } }
  );

  console.log(`Backfilled source='SALES_LINE' on ${res.modifiedCount} SalesLine documents (matched ${res.matchedCount}).`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
