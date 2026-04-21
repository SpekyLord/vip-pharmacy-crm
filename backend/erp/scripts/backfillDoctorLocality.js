/**
 * Phase G1.5 — Backfill Doctor.locality + Doctor.province from legacy clinicOfficeAddress.
 *
 * Strategy:
 *   1. Load PH_LOCALITIES + PH_PROVINCES lookups for the entity.
 *   2. For each Doctor/Client where locality OR province is missing:
 *        a. Parse last 2 comma-separated tokens from clinicOfficeAddress.
 *           Normal pattern: "Barangay, Street, City, Province" → take last two.
 *           Single-token: try to match as locality only.
 *        b. Fuzzy-match tokens against lookup labels (case-insensitive, punctuation-stripped).
 *        c. On confident match → auto-apply.
 *        d. On no match / ambiguous → record in a "needs-review" report;
 *           admin fills in via UI.
 *   3. Idempotent — doctors with BOTH locality + province already populated are skipped.
 *
 * Usage (from backend/):
 *   node erp/scripts/backfillDoctorLocality.js              # dry-run, reports only
 *   node erp/scripts/backfillDoctorLocality.js --apply      # writes auto-matches
 *   node erp/scripts/backfillDoctorLocality.js --apply --entity-id=<id>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const APPLY = process.argv.includes('--apply');
const entityArg = process.argv.find(a => a.startsWith('--entity-id='));
const ENTITY_ID = entityArg ? entityArg.split('=')[1] : null;

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\bcity\b/g, 'city')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitAddressTokens(addr) {
  if (!addr) return [];
  return String(addr)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  await connectDB();
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const Lookup = require('../models/Lookup');
  const Doctor = require('../../models/Doctor');
  const Client = require('../../models/Client');
  const Entity = require('../models/Entity');

  const entityFilter = ENTITY_ID ? { _id: ENTITY_ID } : {};
  const entities = await Entity.find(entityFilter).lean();
  if (!entities.length) {
    console.log('No entities found. Aborting.');
    return;
  }

  for (const entity of entities) {
    console.log(`\n── Entity: ${entity.name || entity._id} ──`);

    const localities = await Lookup.find({
      entity_id: entity._id,
      category: 'PH_LOCALITIES',
      is_active: true
    }).lean();
    const provinces = await Lookup.find({
      entity_id: entity._id,
      category: 'PH_PROVINCES',
      is_active: true
    }).lean();

    if (!localities.length || !provinces.length) {
      console.log(`  PH_LOCALITIES or PH_PROVINCES not seeded for this entity. Run seedAllLookups.js first.`);
      continue;
    }

    const localityByNorm = new Map(localities.map(l => [normalize(l.label), l]));
    const provinceByNorm = new Map(provinces.map(p => [normalize(p.label), p]));
    const provinceByCode = new Map(provinces.map(p => [p.code, p]));

    const stats = {
      scanned: 0,
      alreadyOk: 0,
      autoMatched: 0,
      partialMatch: 0,
      noMatch: 0,
      noAddress: 0,
    };
    const needsReview = [];

    for (const ModelName of ['Doctor', 'Client']) {
      const Model = ModelName === 'Doctor' ? Doctor : Client;
      const docs = await Model.find({}).select('_id firstName lastName clinicOfficeAddress locality province').lean();

      for (const doc of docs) {
        stats.scanned++;
        if (doc.locality && doc.province) { stats.alreadyOk++; continue; }
        if (!doc.clinicOfficeAddress) { stats.noAddress++; needsReview.push({ model: ModelName, id: doc._id, name: `${doc.lastName}, ${doc.firstName}`, reason: 'no address' }); continue; }

        const tokens = splitAddressTokens(doc.clinicOfficeAddress);
        if (tokens.length === 0) { stats.noAddress++; continue; }

        // Heuristic: last segment is usually province, second-to-last is locality.
        // Philippine CPT workbooks sometimes append the country — drop "Philippines" if present.
        const filtered = tokens.filter(t => normalize(t) !== 'philippines' && normalize(t) !== 'ph');
        const candidates = filtered.slice(-2);
        const localityGuess = candidates[0] ? normalize(candidates[0]) : null;
        const provinceGuess = candidates[candidates.length - 1] ? normalize(candidates[candidates.length - 1]) : null;

        let matchedLocality = localityGuess ? localityByNorm.get(localityGuess) : null;
        let matchedProvince = provinceGuess ? provinceByNorm.get(provinceGuess) : null;

        // If we matched a locality but not a province, derive the province from
        // the locality's metadata.province_code.
        if (matchedLocality && !matchedProvince && matchedLocality.metadata?.province_code) {
          matchedProvince = provinceByCode.get(matchedLocality.metadata.province_code);
        }

        if (matchedLocality && matchedProvince) {
          stats.autoMatched++;
          if (APPLY) {
            await Model.updateOne(
              { _id: doc._id },
              { $set: { locality: matchedLocality.label, province: matchedProvince.label } }
            );
          }
          console.log(`  [auto]   ${ModelName} ${doc.lastName}, ${doc.firstName} → ${matchedLocality.label}, ${matchedProvince.label}`);
        } else if (matchedLocality || matchedProvince) {
          stats.partialMatch++;
          needsReview.push({
            model: ModelName, id: doc._id, name: `${doc.lastName}, ${doc.firstName}`,
            reason: 'partial match',
            address: doc.clinicOfficeAddress,
            matched_locality: matchedLocality?.label || null,
            matched_province: matchedProvince?.label || null,
          });
        } else {
          stats.noMatch++;
          needsReview.push({
            model: ModelName, id: doc._id, name: `${doc.lastName}, ${doc.firstName}`,
            reason: 'no match',
            address: doc.clinicOfficeAddress,
            tokens: candidates,
          });
        }
      }
    }

    console.log(`\n  Summary for ${entity.name || entity._id}:`);
    console.log(`    scanned:         ${stats.scanned}`);
    console.log(`    already-ok:      ${stats.alreadyOk}`);
    console.log(`    auto-matched:    ${stats.autoMatched}${APPLY ? ' (written)' : ' (dry-run)'}`);
    console.log(`    partial-match:   ${stats.partialMatch}  → admin review`);
    console.log(`    no-match:        ${stats.noMatch}       → admin review`);
    console.log(`    no-address:      ${stats.noAddress}     → admin review`);

    if (needsReview.length && !APPLY) {
      console.log(`\n  Sample rows needing review (first 10):`);
      for (const r of needsReview.slice(0, 10)) {
        console.log(`    ${r.model} ${r.name} — ${r.reason} — addr: "${r.address || '(empty)'}" — matched: L="${r.matched_locality || ''}" P="${r.matched_province || ''}"`);
      }
      if (needsReview.length > 10) console.log(`    ... and ${needsReview.length - 10} more.`);
    }
  }

  if (!APPLY) console.log(`\nDRY-RUN complete. Rerun with --apply to persist auto-matches.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Backfill error:', err);
  mongoose.disconnect();
  process.exit(1);
});
