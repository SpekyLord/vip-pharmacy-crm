/**
 * healthCheckCollections.js — Mongo collection audit
 *
 * Walks every Mongoose model registered under backend/models/ and
 * backend/erp/models/, then for each:
 *   - confirms the underlying collection exists in the live DB
 *   - counts documents
 *   - classifies the row as OK / EMPTY / EMPTY-SEED / MISSING / ERR
 *
 * Exit codes:
 *   0 — every EXPECTED_SEEDED collection has at least one document
 *   1 — at least one expected-seeded collection is empty or missing
 *
 * Usage (from project root):
 *   cd backend && node scripts/healthCheckCollections.js
 *   cd backend && node scripts/healthCheckCollections.js --include-website
 */
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const CRM_MODEL_DIR = path.resolve(__dirname, '..', 'models');
const ERP_MODEL_DIR = path.resolve(__dirname, '..', 'erp', 'models');

// Collections that MUST have at least one row in any provisioned env.
// Empty here = ERROR (a seed didn't run, or the script is pointed at the wrong DB).
const EXPECTED_SEEDED = new Set([
  // CRM
  'User',           // at least 1 admin
  'Specialization',
  'SupportType',
  'Program',
  // ERP foundation
  'Entity',
  'PeopleMaster',
  'Lookup',
  'ChartOfAccounts',
  'Settings',
  'AccessTemplate',
  'PaymentMode',
  'GovernmentRates',
  'Warehouse',
]);
// Note: PeriodLock is intentionally NOT here. Rows are created lazily when an
// admin first locks a financial period (see controlCenterController.getHealth) —
// an empty erp_period_locks in a dev DB is normal, not a seed failure.

// WebsiteProduct binds lazily to the website DB connection (config/websiteDb.js).
// Requiring the file does NOT register a model on the default connection, so we
// audit it separately behind --include-website.
const SKIP_FILES = new Set(['WebsiteProduct.js']);

function discoverModels() {
  for (const dir of [CRM_MODEL_DIR, ERP_MODEL_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.js')) continue;
      if (SKIP_FILES.has(file)) continue;
      try {
        require(path.join(dir, file));
      } catch (e) {
        console.error(`  ! could not require ${path.relative(path.resolve(__dirname, '..'), path.join(dir, file))}: ${e.message}`);
      }
    }
  }
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set in backend/.env — cannot connect.');
    process.exit(1);
  }

  discoverModels();
  await connectDB();

  const db = mongoose.connection.db;
  const liveCollectionNames = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
  );

  const rows = [];
  const errors = [];
  const warnings = [];

  const modelNames = Object.keys(mongoose.models).sort();
  for (const name of modelNames) {
    const Model = mongoose.models[name];
    const collName = Model.collection.collectionName;
    const exists = liveCollectionNames.has(collName);

    let count = 0;
    let countError = null;
    try {
      count = exists ? await Model.countDocuments({}) : 0;
    } catch (e) {
      countError = e.message;
    }

    const expected = EXPECTED_SEEDED.has(name);
    let status;
    if (countError) {
      status = 'ERR';
      errors.push(`${name} (${collName}): ${countError}`);
    } else if (!exists && expected) {
      status = 'MISSING';
      errors.push(`${name} → collection '${collName}' does not exist (expected to be seeded)`);
    } else if (count === 0 && expected) {
      status = 'EMPTY-SEED';
      errors.push(`${name} → 0 rows in '${collName}' (expected to be seeded)`);
    } else if (count === 0) {
      status = 'EMPTY';
      warnings.push(`${name} → 0 rows in '${collName}'`);
    } else {
      status = 'OK';
    }

    rows.push({ name, collName, exists, count, expected, status });
  }

  // Optional: cross-DB website products
  let websiteRow = null;
  if (process.argv.includes('--include-website')) {
    const { connectWebsiteDB, getWebsiteConnection } = require('../config/websiteDb');
    const { getWebsiteProductModel } = require('../models/WebsiteProduct');
    try {
      await connectWebsiteDB();
      await new Promise((resolve, reject) => {
        const c = getWebsiteConnection();
        if (c.readyState === 1) return resolve();
        c.once('connected', resolve);
        c.once('error', reject);
      });
      const Product = getWebsiteProductModel();
      const cnt = await Product.countDocuments({});
      websiteRow = { name: 'WebsiteProduct', collName: 'products', count: cnt, db: process.env.WEBSITE_DB_NAME || 'vip-pharmacy' };
    } catch (e) {
      websiteRow = { error: e.message };
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────
  console.log('— healthCheckCollections —');
  console.log(`  DB host: ${mongoose.connection.host}`);
  console.log(`  DB name: ${mongoose.connection.name}`);
  console.log(`  Models walked: ${rows.length}`);
  console.log('');

  const order = { ERR: 0, MISSING: 1, 'EMPTY-SEED': 2, EMPTY: 3, OK: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`  ${pad('STATUS', 11)} ${pad('MODEL', 32)} ${pad('COLLECTION', 34)} COUNT`);
  console.log(`  ${'-'.repeat(11)} ${'-'.repeat(32)} ${'-'.repeat(34)} -----`);
  for (const r of rows) {
    const glyph = r.status === 'OK' ? '✓' : (r.status === 'EMPTY' ? '!' : '✗');
    console.log(`  ${glyph} ${pad(r.status, 9)} ${pad(r.name, 32)} ${pad(r.collName, 34)} ${r.count}`);
  }

  console.log('');
  const totals = {
    OK:           rows.filter((r) => r.status === 'OK').length,
    EMPTY:        rows.filter((r) => r.status === 'EMPTY').length,
    'EMPTY-SEED': rows.filter((r) => r.status === 'EMPTY-SEED').length,
    MISSING:      rows.filter((r) => r.status === 'MISSING').length,
    ERR:          rows.filter((r) => r.status === 'ERR').length,
  };
  console.log(`  Totals — OK: ${totals.OK}  EMPTY: ${totals.EMPTY}  EMPTY-SEED: ${totals['EMPTY-SEED']}  MISSING: ${totals.MISSING}  ERR: ${totals.ERR}`);

  if (websiteRow) {
    console.log('');
    if (websiteRow.error) {
      console.log(`  ! cross-DB WebsiteProduct check failed: ${websiteRow.error}`);
    } else {
      console.log(`  cross-DB WebsiteProduct (${websiteRow.db}.${websiteRow.collName}) → ${websiteRow.count} rows`);
    }
  }

  if (warnings.length) {
    console.log('');
    console.log('  Warnings (transactional collections — may be empty in a fresh env):');
    for (const w of warnings) console.log(`    ! ${w}`);
  }
  if (errors.length) {
    console.log('');
    console.log('  Errors (expected-seeded collections that are empty or missing):');
    for (const e of errors) console.error(`    ✗ ${e}`);
  }

  await mongoose.disconnect();

  if (errors.length) {
    console.error('');
    console.error('FAIL — at least one expected-seeded collection is empty or missing.');
    process.exit(1);
  }
  console.log('');
  console.log('OK — every expected-seeded collection has rows.');
  process.exit(0);
}

main().catch(async (e) => {
  console.error(`healthCheckCollections crashed: ${e.stack || e.message}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
