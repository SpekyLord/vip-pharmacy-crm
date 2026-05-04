/**
 * Bulk-Merge Iloilo Duplicates — one-shot script for Phase A.5.2-prep.
 *
 * Walks every duplicate canonical-key group surfaced by the merge service's
 * findCandidates, picks a winner via heuristic, and either reports (dry-run)
 * or executes the merge. Same audit trail + same 30-day rollback grace as the
 * /admin/md-merge UI — this is just a click-saver for the 131-group backlog.
 *
 * Heuristic for winner selection (in order):
 *   1. More visits wins (Visit.doctor count, descending)
 *   2. Tie → more populated fields (specialization, locality, province,
 *      prc_license_number, partnership_status ≠ LEAD), descending
 *   3. Tie → older createdAt wins (ascending)
 *
 * Every executed merge writes a row to reports/bulk-merge-iloilo-<YYYYMMDD-HHmm>.csv
 * with the columns: timestamp, group_key, winner_id, winner_name, loser_id,
 * loser_name, winner_visits, loser_visits, audit_id, status, error_msg.
 *
 * Modes:
 *   (no flag)  — dry-run report. Prints heuristic decisions for every group;
 *                writes the CSV with status=DRY_RUN; no DB writes.
 *   --apply    — execute every merge serially. On per-group failure, log
 *                + continue.
 *   --limit N  — only process the first N groups (useful for spot-check).
 *
 * Required env: MONGO_URI
 * Required actor: an admin/president user must exist with the email below.
 *
 * Usage (from project root or backend/):
 *   node backend/scripts/bulkMergeIloiloDupes.js
 *   node backend/scripts/bulkMergeIloiloDupes.js --limit 5 --apply
 *   node backend/scripts/bulkMergeIloiloDupes.js --apply
 *
 * Safety: DRY_RUN by default. Refuses to apply if no candidate groups exist.
 *         Each merge is its own audit row + its own 30-day rollback window.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI not set in environment variables');
  process.exit(1);
}

const ACTOR_EMAIL =
  process.env.BULK_MERGE_ACTOR_EMAIL || 'yourpartner@viosintegrated.net';

const APPLY = process.argv.includes('--apply');
const LIMIT_FLAG = process.argv.indexOf('--limit');
const LIMIT = LIMIT_FLAG !== -1 ? parseInt(process.argv[LIMIT_FLAG + 1], 10) : null;

const REASON_TEMPLATE = (groupKey) =>
  `Auto-merge: ${groupKey} (Phase A.5.2-prep dedup, BDM territory overlap)`;

// ── Helpers ───────────────────────────────────────────────────────────────

function fieldCompleteness(d) {
  let score = 0;
  if (d.specialization && d.specialization.trim()) score++;
  if (d.locality && d.locality.trim()) score++;
  if (d.province && d.province.trim()) score++;
  if (d.prc_license_number && d.prc_license_number.trim()) score++;
  if (d.partnership_status && d.partnership_status !== 'LEAD') score++;
  return score;
}

function pickWinner(doctors, visitMap) {
  // Annotate each candidate with the heuristic factors.
  const annotated = doctors.map((d) => ({
    ...d,
    _visits: visitMap.get(String(d._id)) || 0,
    _completeness: fieldCompleteness(d),
    _createdMs: d.createdAt ? new Date(d.createdAt).getTime() : Infinity,
  }));

  annotated.sort((a, b) => {
    if (a._visits !== b._visits) return b._visits - a._visits; // visits desc
    if (a._completeness !== b._completeness) return b._completeness - a._completeness;
    return a._createdMs - b._createdMs; // older first
  });

  return annotated; // [winner, loser1, loser2, ...]
}

function escapeCsv(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function ensureReportsDir(rootDir) {
  const dir = path.join(rootDir, 'reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY_RUN'}${LIMIT ? ` (limit=${LIMIT})` : ''}`);

  // Pre-register every model the merge service needs to load.
  require('../models/User');
  require('../models/Doctor');
  require('../models/Visit');
  require('../models/Schedule');
  require('../models/ProductAssignment');
  require('../models/CommunicationLog');
  require('../models/InviteLink');
  require('../models/CLMSession');
  require('../models/DoctorMergeAudit');

  const Doctor = mongoose.model('Doctor');
  const Visit = mongoose.model('Visit');
  const User = mongoose.model('User');
  const mergeService = require('../services/doctorMergeService');

  // Resolve actor.
  const actor = await User.findOne({ email: ACTOR_EMAIL }).lean();
  if (!actor) {
    console.error(`ERROR: actor user not found by email "${ACTOR_EMAIL}"`);
    console.error('       Set BULK_MERGE_ACTOR_EMAIL env var to override.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Actor: ${actor.name || actor.email} (role=${actor.role})`);

  // 1. Pull all candidate groups.
  let groups = await mergeService.findCandidates({ search: '', limit: 500 });
  console.log(`Candidate groups: ${groups.length}`);
  if (!groups.length) {
    console.log('No duplicate groups — nothing to do.');
    await mongoose.disconnect();
    return;
  }
  if (LIMIT) groups = groups.slice(0, LIMIT);

  // 2. Bulk visit count for all candidate doctors.
  const allDoctorIds = groups.flatMap((g) => g.doctors.map((d) => d._id));
  const visitCounts = await Visit.aggregate([
    { $match: { doctor: { $in: allDoctorIds } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]);
  const visitMap = new Map(visitCounts.map((v) => [String(v._id), v.count]));

  // 3. CSV setup.
  const ROOT = path.resolve(__dirname, '..', '..');
  const reportsDir = ensureReportsDir(ROOT);
  const csvPath = path.join(reportsDir, `bulk-merge-iloilo-${nowStamp()}.csv`);
  const csvHeader =
    'timestamp,group_key,winner_id,winner_name,winner_visits,winner_completeness,loser_id,loser_name,loser_visits,loser_completeness,audit_id,status,error_msg\n';
  fs.writeFileSync(csvPath, csvHeader);
  console.log(`CSV report: ${csvPath}`);
  console.log('');

  let succeeded = 0;
  let failed = 0;
  let dryCount = 0;

  // 4. Walk each group.
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const groupKey = g._id; // canonical key
    const sorted = pickWinner(g.doctors, visitMap);
    const winner = sorted[0];
    const losers = sorted.slice(1); // typically 1; could be more if 3-way dupes

    for (const loser of losers) {
      const ts = new Date().toISOString();
      const reason = REASON_TEMPLATE(groupKey);
      const winnerName = `${winner.firstName || ''} ${winner.lastName || ''}`.trim();
      const loserName = `${loser.firstName || ''} ${loser.lastName || ''}`.trim();

      const csvBase = [
        ts,
        groupKey,
        winner._id,
        winnerName,
        winner._visits,
        winner._completeness,
        loser._id,
        loserName,
        loser._visits,
        loser._completeness,
      ];

      console.log(
        `[${i + 1}/${groups.length}] ${groupKey}` +
          ` — winner=${winnerName} (v=${winner._visits},c=${winner._completeness})` +
          ` × loser=${loserName} (v=${loser._visits},c=${loser._completeness})`,
      );

      if (!APPLY) {
        dryCount++;
        fs.appendFileSync(
          csvPath,
          [...csvBase, '', 'DRY_RUN', ''].map(escapeCsv).join(',') + '\n',
        );
        continue;
      }

      try {
        const result = await mergeService.executeMerge({
          winnerId: winner._id,
          loserId: loser._id,
          reason,
          actor: { _id: actor._id, ip: 'bulk-script', userAgent: 'bulkMergeIloiloDupes.js' },
        });
        succeeded++;
        fs.appendFileSync(
          csvPath,
          [...csvBase, result.audit_id, 'SUCCESS', ''].map(escapeCsv).join(',') + '\n',
        );
        console.log(`         → APPLIED, audit_id=${result.audit_id}`);
      } catch (err) {
        failed++;
        const msg = err.message || String(err);
        fs.appendFileSync(
          csvPath,
          [...csvBase, '', 'FAILED', msg].map(escapeCsv).join(',') + '\n',
        );
        console.log(`         → FAILED: ${msg}`);
      }
    }
  }

  console.log('');
  console.log('─'.repeat(60));
  if (APPLY) {
    console.log(`Done. Succeeded: ${succeeded}. Failed: ${failed}.`);
    console.log(`CSV: ${csvPath}`);
    console.log('');
    if (failed === 0 && succeeded > 0) {
      console.log('NEXT: confirm the index can flip:');
      console.log('      node backend/scripts/migrateVipClientCanonical.js                  # expect 0 dupes');
      console.log('      node backend/scripts/migrateVipClientCanonical.js --add-unique-index');
    }
  } else {
    console.log(`Dry-run complete. Would merge ${dryCount} loser(s) across ${groups.length} group(s).`);
    console.log(`CSV (dry-run preview): ${csvPath}`);
    console.log('');
    console.log('To apply: node backend/scripts/bulkMergeIloiloDupes.js --apply');
    console.log('To spot-check first: node backend/scripts/bulkMergeIloiloDupes.js --limit 5 --apply');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
