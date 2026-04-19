/**
 * One-time migration for Phase SG-4 #21 (plan versioning).
 *
 * Run with:    node backend/scripts/migrateSalesGoalVersioning.js
 *
 * Idempotent — safe to re-run. Performs:
 *   1. Drops the legacy `entity_id_1_fiscal_year_1` UNIQUE index on
 *      erp_sales_goal_plans (replaced by `entity_id_1_fiscal_year_1_version_no_1`).
 *   2. Creates the new composite unique index if missing.
 *   3. Backfills `version_no = 1` on every existing SalesGoalPlan that lacks it.
 *   4. Creates one IncentivePlan header per (entity_id, fiscal_year) and
 *      links existing plans to it via `incentive_plan_id`.
 *   5. Sets `current_version_id` on each header to point at the latest
 *      ACTIVE plan (or the most-recent version of any status if none ACTIVE).
 *
 * Why a script (instead of in-process auto-migration):
 *   - Dropping a unique index on a busy production collection is a deliberate
 *     ops decision, not something the app should attempt at startup.
 *   - Backfill writes to every plan row; better to control timing.
 *   - Idempotency lets us re-run if a fresh subsidiary is onboarded later.
 *
 * Safety: never modifies KpiSnapshot, IncentivePayout, or SalesGoalTarget
 * rows. The new versioning fields are additive on SalesGoalPlan only.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const SalesGoalPlan = require('../erp/models/SalesGoalPlan');
const IncentivePlan = require('../erp/models/IncentivePlan');

const LEGACY_INDEX_NAME = 'entity_id_1_fiscal_year_1';
const NEW_INDEX_NAME = 'entity_id_1_fiscal_year_1_version_no_1';

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('[migrateSalesGoalVersioning] Connected.');

  const coll = SalesGoalPlan.collection;

  // 1. Drop legacy unique index if present.
  try {
    const indexes = await coll.indexes();
    const legacy = indexes.find(idx => idx.name === LEGACY_INDEX_NAME && idx.unique);
    if (legacy) {
      await coll.dropIndex(LEGACY_INDEX_NAME);
      console.log(`[migrateSalesGoalVersioning] Dropped legacy unique index: ${LEGACY_INDEX_NAME}`);
    } else {
      console.log(`[migrateSalesGoalVersioning] Legacy index ${LEGACY_INDEX_NAME} not found (or not unique) — skipping drop.`);
    }
  } catch (err) {
    if (err.codeName === 'IndexNotFound' || /index not found/i.test(err.message || '')) {
      console.log('[migrateSalesGoalVersioning] Legacy index already dropped.');
    } else {
      console.warn('[migrateSalesGoalVersioning] Drop legacy index failed:', err.message);
    }
  }

  // 2. Create the new composite unique index.
  try {
    await coll.createIndex(
      { entity_id: 1, fiscal_year: 1, version_no: 1 },
      { unique: true, name: NEW_INDEX_NAME }
    );
    console.log(`[migrateSalesGoalVersioning] Ensured composite index: ${NEW_INDEX_NAME}`);
  } catch (err) {
    console.error('[migrateSalesGoalVersioning] Create new index failed:', err.message);
  }

  // 3. Backfill version_no = 1 where missing.
  const noVer = await SalesGoalPlan.updateMany(
    { $or: [{ version_no: { $exists: false } }, { version_no: null }] },
    { $set: { version_no: 1 } }
  );
  console.log(`[migrateSalesGoalVersioning] Backfilled version_no=1 on ${noVer.modifiedCount || noVer.nModified || 0} row(s).`);

  // 4. Create / link IncentivePlan headers.
  // Group existing plans by (entity_id, fiscal_year) and ensure one header per group.
  const planGroups = await SalesGoalPlan.aggregate([
    { $match: { incentive_plan_id: { $in: [null, undefined] } } },
    {
      $group: {
        _id: { entity_id: '$entity_id', fiscal_year: '$fiscal_year' },
        plans: {
          $push: {
            _id: '$_id',
            plan_name: '$plan_name',
            status: '$status',
            version_no: '$version_no',
            createdAt: '$createdAt',
            created_by: '$created_by',
          },
        },
      },
    },
  ]);

  let headersCreated = 0;
  let plansLinked = 0;

  for (const group of planGroups) {
    const { entity_id, fiscal_year } = group._id;
    if (!entity_id || !fiscal_year) continue;

    // Try to find existing header (created in a prior partial run)
    let header = await IncentivePlan.findOne({ entity_id, fiscal_year });
    if (!header) {
      // Use the first plan's name as the header name; fall back to a generic
      const firstPlan = group.plans[0];
      header = await IncentivePlan.create({
        entity_id,
        fiscal_year,
        plan_name: firstPlan.plan_name || `FY${fiscal_year} Plan`,
        description: '',
        current_version_no: 1,
        // Defer current_version_id assignment to step 5
        status: 'DRAFT',
        created_by: firstPlan.created_by || null,
      });
      headersCreated++;
    }

    // Link every plan in the group to this header
    const planIds = group.plans.map(p => p._id);
    const linkRes = await SalesGoalPlan.updateMany(
      { _id: { $in: planIds }, incentive_plan_id: { $in: [null, undefined] } },
      { $set: { incentive_plan_id: header._id } }
    );
    plansLinked += linkRes.modifiedCount || linkRes.nModified || 0;
  }
  console.log(`[migrateSalesGoalVersioning] Created ${headersCreated} new header(s); linked ${plansLinked} plan(s).`);

  // 5. Set current_version_id on every header to the latest ACTIVE plan (or
  //    the most-recent version of any status if no ACTIVE exists).
  const allHeaders = await IncentivePlan.find({});
  let headersSynced = 0;
  for (const header of allHeaders) {
    const versions = await SalesGoalPlan.find({
      entity_id: header.entity_id,
      fiscal_year: header.fiscal_year,
    }).sort({ version_no: -1, createdAt: -1 }).lean();

    if (versions.length === 0) continue;
    const active = versions.find(v => v.status === 'ACTIVE') || versions[0];

    const update = {};
    if (String(header.current_version_id || '') !== String(active._id)) {
      update.current_version_id = active._id;
      update.current_version_no = active.version_no || 1;
      update.status = active.status;
    }
    if (Object.keys(update).length > 0) {
      await IncentivePlan.updateOne({ _id: header._id }, { $set: update });
      headersSynced++;
    }
  }
  console.log(`[migrateSalesGoalVersioning] Synced current_version_id on ${headersSynced} header(s).`);

  console.log('[migrateSalesGoalVersioning] Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[migrateSalesGoalVersioning] FAILED:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
