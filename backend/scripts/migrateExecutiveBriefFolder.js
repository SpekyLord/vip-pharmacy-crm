/**
 * Phase G9.R11 — one-time migration. Apr 30 2026.
 *
 * Idempotent. Run with --dry-run first to preview.
 *
 * What it does (per entity):
 *   1. Inserts the new EXECUTIVE_BRIEF row in MESSAGE_FOLDERS lookup if
 *      missing. Lazy-seed only fires when an entity has zero rows; existing
 *      entities have already seeded the old 9-folder list and won't pick up
 *      the new row on their own. Insert-only — never overwrites admin edits.
 *   2. Updates the AI_AGENT_REPORTS row's sort_order from 5 → 6 if the row
 *      still has the old position AND admin hasn't customised metadata
 *      (insert_only_metadata heuristic — we keep admin overrides intact).
 *   3. Adds AI_AGENT_REPORTS to the `hidden_folders` array on the president
 *      row in INBOX_HIDDEN_FOLDERS_BY_ROLE if it isn't already there. Other
 *      roles untouched.
 *   4. Re-points existing MessageInbox rows where category === 'briefing' AND
 *      folder === 'AI_AGENT_REPORTS' to folder 'EXECUTIVE_BRIEF'. Rows in
 *      different folders (someone manually moved them) are left alone.
 *
 * Run from backend/:
 *   node scripts/migrateExecutiveBriefFolder.js              # dry-run, no writes
 *   node scripts/migrateExecutiveBriefFolder.js --apply      # commit
 *
 * Safe to re-run.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('[migrateExecutiveBriefFolder] MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`[migrateExecutiveBriefFolder] Connected. APPLY=${APPLY}`);

  const Lookup = require('../erp/models/Lookup');
  const MessageInbox = require('../models/MessageInbox');

  // ── Step 1 + 2: MESSAGE_FOLDERS — insert EXECUTIVE_BRIEF, bump
  // AI_AGENT_REPORTS sort_order ──────────────────────────────────────────
  const folderRows = await Lookup.find({ category: 'MESSAGE_FOLDERS', is_active: true }).lean();
  const entitiesWithFolders = [...new Set(folderRows.map(r => String(r.entity_id)))].filter(Boolean);
  console.log(`[migrateExecutiveBriefFolder] entities with MESSAGE_FOLDERS rows: ${entitiesWithFolders.length}`);

  let executiveBriefInserted = 0;
  let aiAgentReportsBumped = 0;

  for (const entIdStr of entitiesWithFolders) {
    const entId = new mongoose.Types.ObjectId(entIdStr);
    const rowsForEntity = folderRows.filter(r => String(r.entity_id) === entIdStr);

    // Insert EXECUTIVE_BRIEF if missing
    const hasExecBrief = rowsForEntity.some(r => r.code === 'EXECUTIVE_BRIEF');
    if (!hasExecBrief) {
      console.log(`  [${entIdStr}] Will insert EXECUTIVE_BRIEF row`);
      executiveBriefInserted += 1;
      if (APPLY) {
        await Lookup.create({
          entity_id: entId,
          category: 'MESSAGE_FOLDERS',
          code: 'EXECUTIVE_BRIEF',
          label: 'Executive Brief',
          sort_order: 5,
          is_active: true,
          metadata: {
            virtual: false,
            description: 'Daily executive briefs — morning brief, FP&A forecast, procurement scorecard, expansion readiness',
          },
        });
      }
    }

    // Bump AI_AGENT_REPORTS sort_order 5 → 6 ONLY if it's still at 5 (admin
    // hasn't customised). insert_only is best-effort — we leave admin edits
    // alone; if the row is at 5 it almost certainly is the seeded default.
    const aar = rowsForEntity.find(r => r.code === 'AI_AGENT_REPORTS');
    if (aar && aar.sort_order === 5) {
      console.log(`  [${entIdStr}] Will bump AI_AGENT_REPORTS sort_order 5 → 6`);
      aiAgentReportsBumped += 1;
      if (APPLY) {
        await Lookup.updateOne(
          { _id: aar._id },
          { $set: { sort_order: 6 } }
        );
      }
    }
  }
  console.log(`[migrateExecutiveBriefFolder] Step 1+2: insert_pending=${executiveBriefInserted} bump_pending=${aiAgentReportsBumped}`);

  // ── Step 3: INBOX_HIDDEN_FOLDERS_BY_ROLE — president row gains
  // AI_AGENT_REPORTS in hidden_folders ────────────────────────────────────
  const presidentRows = await Lookup.find({
    category: 'INBOX_HIDDEN_FOLDERS_BY_ROLE',
    code: 'president',
    is_active: true,
  }).lean();
  console.log(`[migrateExecutiveBriefFolder] president rows in INBOX_HIDDEN_FOLDERS_BY_ROLE: ${presidentRows.length}`);

  let presidentRowsUpdated = 0;
  for (const row of presidentRows) {
    const current = Array.isArray(row.metadata?.hidden_folders) ? row.metadata.hidden_folders : [];
    if (current.includes('AI_AGENT_REPORTS')) {
      // Already hidden — skip.
      continue;
    }
    const next = [...current, 'AI_AGENT_REPORTS'];
    console.log(`  [${row.entity_id}] Will add AI_AGENT_REPORTS to president hidden_folders: [${current.join(', ')}] → [${next.join(', ')}]`);
    presidentRowsUpdated += 1;
    if (APPLY) {
      await Lookup.updateOne(
        { _id: row._id },
        {
          $set: {
            'metadata.hidden_folders': next,
            'metadata.description': 'President uses Approval Hub for APPROVALS, and Executive Brief replaces AI Agents as the daily-read folder. AI Agents stays accessible via direct click — just excluded from the main Inbox count.',
          },
        }
      );
    }
  }

  // Entities that have MESSAGE_FOLDERS rows but no president row in
  // INBOX_HIDDEN_FOLDERS_BY_ROLE → insert a fresh one with both folders hidden.
  const entitiesWithPresidentRow = new Set(presidentRows.map(r => String(r.entity_id)));
  let presidentRowsInserted = 0;
  for (const entIdStr of entitiesWithFolders) {
    if (entitiesWithPresidentRow.has(entIdStr)) continue;
    console.log(`  [${entIdStr}] Will insert president hidden-folders row`);
    presidentRowsInserted += 1;
    if (APPLY) {
      await Lookup.create({
        entity_id: new mongoose.Types.ObjectId(entIdStr),
        category: 'INBOX_HIDDEN_FOLDERS_BY_ROLE',
        code: 'president',
        label: 'President',
        sort_order: 1,
        is_active: true,
        metadata: {
          hidden_folders: ['APPROVALS', 'AI_AGENT_REPORTS'],
          description: 'President uses Approval Hub for APPROVALS, and Executive Brief replaces AI Agents as the daily-read folder. AI Agents stays accessible via direct click — just excluded from the main Inbox count.',
        },
      });
    }
  }
  console.log(`[migrateExecutiveBriefFolder] Step 3: president_rows_updated=${presidentRowsUpdated} president_rows_inserted=${presidentRowsInserted}`);

  // ── Step 4: re-point existing MessageInbox briefing rows ────────────────
  const briefingFilter = {
    category: 'briefing',
    folder: 'AI_AGENT_REPORTS',
  };
  const briefingCount = await MessageInbox.countDocuments(briefingFilter);
  console.log(`[migrateExecutiveBriefFolder] Step 4: briefing rows still in AI_AGENT_REPORTS: ${briefingCount}`);

  let briefingMoved = 0;
  if (briefingCount > 0) {
    if (APPLY) {
      const res = await MessageInbox.updateMany(
        briefingFilter,
        { $set: { folder: 'EXECUTIVE_BRIEF' } }
      );
      briefingMoved = res.modifiedCount || 0;
    } else {
      briefingMoved = briefingCount;
    }
  }
  console.log(`[migrateExecutiveBriefFolder] Step 4: briefing rows moved=${briefingMoved}`);

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('────────────────────────────────────────');
  console.log(`SUMMARY (${APPLY ? 'WROTE' : 'DRY-RUN'}):`);
  console.log(`  EXECUTIVE_BRIEF lookup rows inserted: ${executiveBriefInserted}`);
  console.log(`  AI_AGENT_REPORTS sort_order bumped:   ${aiAgentReportsBumped}`);
  console.log(`  president hidden-folders updated:     ${presidentRowsUpdated}`);
  console.log(`  president hidden-folders inserted:    ${presidentRowsInserted}`);
  console.log(`  briefing messages re-pointed:         ${briefingMoved}`);
  console.log('────────────────────────────────────────');
  if (!APPLY) {
    console.log('Re-run with --apply to commit.');
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrateExecutiveBriefFolder] fatal:', err);
  process.exit(1);
});
