/**
 * Phase G7.A.0 backfill — populates `product_key_clean` on every existing
 * ProductMaster row + creates one EntityProductCarry row per (entity, product)
 * pair with selling_price / purchase_price / reorder fields copied from the
 * canonical ProductMaster.
 *
 * Idempotent. Dry-run by default. Pass --apply to commit.
 *
 * Why both at once: G7.A.0 is the "schema foundation" sub-phase; populating
 * EntityProductCarry alongside the canonical key lets G7.A.2 (validator flip)
 * be a pure code change — no extra data migration required at flip time.
 *
 * Usage:
 *   node backend/erp/scripts/backfillProductCanonicalAndCarry.js          # dry-run
 *   node backend/erp/scripts/backfillProductCanonicalAndCarry.js --apply  # commit
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');
const ProductMaster = require('../models/ProductMaster');
const EntityProductCarry = require('../models/EntityProductCarry');
const { cleanName } = require('../utils/nameClean');
const { normalizeUnit } = require('../utils/normalize');

const APPLY = process.argv.includes('--apply');

function buildProductKeyClean({ brand_name, generic_name, dosage_strength, unit_code, sold_per }) {
  if (!brand_name || !generic_name || !dosage_strength) return null;
  const unit = normalizeUnit(unit_code || sold_per);
  if (!unit) return null;
  const parts = [
    cleanName(brand_name),
    cleanName(generic_name),
    cleanName(dosage_strength),
    unit,
  ];
  if (parts.some((p) => !p)) return null;
  return parts.join('|');
}

(async () => {
  await connectDB();
  console.log(APPLY ? '=== APPLY MODE — committing changes ===' : '=== DRY RUN — no writes ===');
  console.log();

  // ── Step 1: backfill ProductMaster.product_key_clean ──────────────────
  const products = await ProductMaster.find({}).lean();
  console.log(`ProductMaster: ${products.length} rows total`);

  let needCleanFill = 0;
  let cleanCantCompute = 0;
  let canonicalUpdates = [];
  for (const p of products) {
    const computed = buildProductKeyClean(p);
    if (!computed) {
      cleanCantCompute += 1;
      continue;
    }
    if (p.product_key_clean !== computed) {
      needCleanFill += 1;
      canonicalUpdates.push({ id: p._id, computed, prev: p.product_key_clean });
    }
  }
  console.log(`  ${needCleanFill} rows need product_key_clean (set or differ)`);
  console.log(`  ${cleanCantCompute} rows missing brand/generic/dosage/unit — cannot compute key (skipped)`);

  if (APPLY && needCleanFill > 0) {
    const ops = canonicalUpdates.map((u) => ({
      updateOne: { filter: { _id: u.id }, update: { $set: { product_key_clean: u.computed } } },
    }));
    // Chunk to avoid 16MB op-array limit
    for (let i = 0; i < ops.length; i += 500) {
      await ProductMaster.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    }
    console.log(`  ${ops.length} ProductMaster rows updated`);
  }

  // ── Step 2: backfill EntityProductCarry from existing (entity, product) pairs ─
  console.log();
  console.log('EntityProductCarry backfill:');
  const existingCarries = await EntityProductCarry.find({}).select('entity_id product_id').lean();
  const haveSet = new Set(existingCarries.map((c) => `${c.entity_id}::${c.product_id}`));
  console.log(`  ${existingCarries.length} existing carry rows`);

  const carryOps = [];
  let skipNoEntity = 0;
  let skipInactive = 0;
  for (const p of products) {
    if (!p.entity_id) { skipNoEntity += 1; continue; }
    const key = `${p.entity_id}::${p._id}`;
    if (haveSet.has(key)) continue;
    if (p.is_active === false) {
      // Mirror the source row's is_active so backfill doesn't reactivate things
      // that were intentionally deactivated.
      carryOps.push({
        insertOne: {
          document: {
            entity_id: p.entity_id,
            product_id: p._id,
            territory_id: null,
            is_active: false,
            selling_price: p.selling_price || 0,
            purchase_price: p.purchase_price || 0,
            reorder_min_qty: p.reorder_min_qty ?? null,
            reorder_qty: p.reorder_qty ?? null,
            safety_stock_qty: p.safety_stock_qty ?? null,
            lead_time_days: p.lead_time_days ?? null,
            vat_override: null,
            effective_from: p.added_at || p.createdAt || new Date(),
            status: 'SUSPENDED',
            change_reason: 'G7.A.0 backfill — source ProductMaster row is_active=false',
          },
        },
      });
      skipInactive += 1;
      continue;
    }
    carryOps.push({
      insertOne: {
        document: {
          entity_id: p.entity_id,
          product_id: p._id,
          territory_id: null,
          is_active: true,
          selling_price: p.selling_price || 0,
          purchase_price: p.purchase_price || 0,
          reorder_min_qty: p.reorder_min_qty ?? null,
          reorder_qty: p.reorder_qty ?? null,
          safety_stock_qty: p.safety_stock_qty ?? null,
          lead_time_days: p.lead_time_days ?? null,
          vat_override: null,
          effective_from: p.added_at || p.createdAt || new Date(),
          status: 'ACTIVE',
          change_reason: 'G7.A.0 backfill from ProductMaster.entity_id pair',
        },
      },
    });
  }

  console.log(`  ${carryOps.length} carry rows ${APPLY ? 'creating' : 'WOULD create'} (${skipInactive} suspended-due-to-inactive-source, ${skipNoEntity} skipped no entity_id)`);

  if (APPLY && carryOps.length > 0) {
    for (let i = 0; i < carryOps.length; i += 500) {
      try {
        await EntityProductCarry.bulkWrite(carryOps.slice(i, i + 500), { ordered: false });
      } catch (err) {
        // Duplicate-key from re-runs (idempotency): partial success is OK
        if (err?.code !== 11000 && !(err?.writeErrors || []).every((e) => e.code === 11000)) {
          throw err;
        }
        console.log(`    chunk ${i}: some rows already existed (idempotent skip)`);
      }
    }
    console.log(`  carry backfill applied`);
  }

  // ── Step 3: summary verification ─────────────────────────────────────
  console.log();
  console.log('=== Summary ===');
  if (APPLY) {
    const after = await EntityProductCarry.countDocuments({});
    const withKey = await ProductMaster.countDocuments({ product_key_clean: { $exists: true, $ne: null, $ne: '' } });
    const total = await ProductMaster.countDocuments({});
    console.log(`ProductMaster.product_key_clean populated: ${withKey} / ${total} (${cleanCantCompute} cannot compute)`);
    console.log(`EntityProductCarry rows: ${after}`);
  } else {
    console.log('Re-run with --apply to commit. No writes performed.');
  }

  await mongoose.disconnect();
})().catch((e) => { console.error(e); mongoose.disconnect(); process.exit(1); });
