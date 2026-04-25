/**
 * backfillTaskKpiFields — Phase G10 no-op migration.
 *
 * All Phase G10 Task fields (growth_driver_code, kpi_code, goal_period,
 * milestone_label, start_date, kpi_ref_id, responsibility_tags) are
 * OPTIONAL. Existing (G8 + G9) tasks remain valid without touching them.
 * This script reports counts so admins can audit tagging coverage after
 * deploy — it writes NOTHING.
 *
 * Usage:
 *   node backend/scripts/backfillTaskKpiFields.js           # report only
 *   node backend/scripts/backfillTaskKpiFields.js --dry-run # same (for CI convention)
 *
 * Exit code 0 on success, 1 on Mongo connect failure.
 */
/* eslint-disable vip-tenant/require-entity-filter -- report-only CLI: aggregates Task tagging coverage across every entity by design; no req context */
'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

const Task = require('../erp/models/Task');

const dry = process.argv.includes('--dry-run');

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('FAIL: MONGO_URI not set');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  } catch (err) {
    console.error('FAIL: mongoose.connect:', err.message);
    process.exit(1);
  }

  try {
    const [
      total,
      missingDriver,
      missingKpi,
      missingPeriod,
      missingTags,
    ] = await Promise.all([
      Task.countDocuments({}),
      Task.countDocuments({ $or: [{ growth_driver_code: null }, { growth_driver_code: { $exists: false } }] }),
      Task.countDocuments({ $or: [{ kpi_code: null }, { kpi_code: { $exists: false } }] }),
      Task.countDocuments({ $or: [{ goal_period: null }, { goal_period: { $exists: false } }] }),
      Task.countDocuments({ $or: [{ responsibility_tags: { $size: 0 } }, { responsibility_tags: { $exists: false } }] }),
    ]);

    const report = {
      dry_run: dry,
      total_tasks: total,
      coverage_gaps: {
        missing_growth_driver_code: missingDriver,
        missing_kpi_code:           missingKpi,
        missing_goal_period:        missingPeriod,
        missing_responsibility_tags: missingTags,
      },
      note: 'G10 fields are OPTIONAL. No writes performed — admins can bulk-tag via /erp/tasks + bulk-update if coverage matters.',
      timestamp: new Date().toISOString(),
    };
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error('FAIL: query:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
