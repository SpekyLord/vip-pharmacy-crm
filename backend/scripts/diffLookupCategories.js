/**
 * Diff Lookup Categories — between two MongoDB clusters / databases
 *
 * Use case: Foundation Health card shows different "Lookup Tables X/Y" counts
 * across environments (dev vs prod, or VIP vs SaaS subscriber). Tells you
 * exactly which categories live in DB-A but not DB-B and vice versa, with
 * row counts so you can distinguish "admin populated this on-demand" from
 * "lazy-seed fired here but not there."
 *
 * Usage:
 *   node backend/scripts/diffLookupCategories.js \
 *     --left  "<left-mongo-uri>"  \
 *     --right "<right-mongo-uri>" \
 *     [--entity <entity-id>]      \
 *     [--left-label dev]          \
 *     [--right-label prod]
 *
 *   --entity   Restrict counts to one entity_id. Omit to compare GLOBAL distinct
 *              categories across all entities (useful for sanity checks but the
 *              Foundation Health card is per-entity, so prefer scoping).
 *   --left-label / --right-label  Cosmetic labels for the report (default LEFT/RIGHT).
 *
 * Example (dev vs prod, single entity):
 *   node backend/scripts/diffLookupCategories.js \
 *     --left  "mongodb+srv://...dev-cluster..."  \
 *     --right "mongodb+srv://...prod-cluster..." \
 *     --entity 6612a9b3c4d5e6f7a8b9c0d1 \
 *     --left-label dev --right-label prod
 *
 * Output:
 *   Categories in DEV but not PROD (2):
 *     - PAYSLIP_PROXY_ROSTER   (12 rows)
 *     - PDF_RENDERER           ( 1 row )
 *
 *   Categories in PROD but not DEV (0):
 *     (none)
 *
 *   Common categories: 187
 *
 * Read-only — no writes to either cluster.
 */

const mongoose = require('mongoose');

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--left' || k === '--right' || k === '--entity' || k === '--left-label' || k === '--right-label') {
      out[k.replace(/^--/, '').replace(/-/g, '_')] = argv[++i];
    } else if (k === '--help' || k === '-h') {
      out.help = true;
    }
  }
  return out;
}

async function categoriesByCluster(uri, entityId, label) {
  const conn = await mongoose.createConnection(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 30000
  }).asPromise();

  try {
    const match = entityId ? { entity_id: new mongoose.Types.ObjectId(entityId) } : {};
    const rows = await conn.collection('erp_lookups').aggregate([
      { $match: match },
      { $group: { _id: '$category', row_count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();

    const map = new Map();
    for (const r of rows) map.set(r._id, r.row_count);
    console.log(`[${label}] ${rows.length} distinct categories${entityId ? ` for entity ${entityId}` : ' (global)'}`);
    return map;
  } finally {
    await conn.close();
  }
}

function printDiff(leftLabel, leftMap, rightLabel, rightMap) {
  const leftKeys = new Set(leftMap.keys());
  const rightKeys = new Set(rightMap.keys());

  const onlyLeft = [...leftKeys].filter(k => !rightKeys.has(k)).sort();
  const onlyRight = [...rightKeys].filter(k => !leftKeys.has(k)).sort();
  const common = [...leftKeys].filter(k => rightKeys.has(k));

  const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
  const widest = Math.max(20, ...onlyLeft.map(s => s.length), ...onlyRight.map(s => s.length));

  console.log('');
  console.log(`Categories in ${leftLabel.toUpperCase()} but not ${rightLabel.toUpperCase()} (${onlyLeft.length}):`);
  if (onlyLeft.length === 0) {
    console.log('  (none)');
  } else {
    for (const k of onlyLeft) {
      const n = leftMap.get(k);
      console.log(`  - ${pad(k, widest)}  (${n} row${n === 1 ? '' : 's'})`);
    }
  }

  console.log('');
  console.log(`Categories in ${rightLabel.toUpperCase()} but not ${leftLabel.toUpperCase()} (${onlyRight.length}):`);
  if (onlyRight.length === 0) {
    console.log('  (none)');
  } else {
    for (const k of onlyRight) {
      const n = rightMap.get(k);
      console.log(`  - ${pad(k, widest)}  (${n} row${n === 1 ? '' : 's'})`);
    }
  }

  console.log('');
  console.log(`Common categories: ${common.length}`);
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.left || !args.right) {
    console.error('Usage: node backend/scripts/diffLookupCategories.js --left <uri> --right <uri> [--entity <id>] [--left-label dev] [--right-label prod]');
    process.exit(args.help ? 0 : 1);
  }

  const leftLabel = args.left_label || 'LEFT';
  const rightLabel = args.right_label || 'RIGHT';

  const [leftMap, rightMap] = await Promise.all([
    categoriesByCluster(args.left, args.entity, leftLabel),
    categoriesByCluster(args.right, args.entity, rightLabel)
  ]);

  printDiff(leftLabel, leftMap, rightLabel, rightMap);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('diffLookupCategories failed:', err.message);
      process.exit(1);
    });
}

module.exports = { categoriesByCluster, printDiff };
