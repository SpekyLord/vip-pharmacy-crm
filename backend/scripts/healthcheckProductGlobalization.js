#!/usr/bin/env node
/**
 * Phase G7.A.0 — Product Globalization Schema Foundation Health Check
 *
 * Static (no-DB) verifier of the contract that G7.A.0 establishes and that
 * every following sub-phase (G7.A.1 dedupe, G7.A.2 validator flip, G7.A.3
 * field drop, G7.A.4 carry-list UI) depends on.
 *
 * Asserted contract:
 *
 *   1. ProductMaster — product_key_clean field + non-unique index today,
 *      maintained by pre-validate AND pre-findOneAndUpdate hooks. Includes
 *      forward-compat soft-delete trio (mergedInto, mergedAt) without
 *      breaking the existing per-entity unique index on item_key.
 *
 *   2. EntityProductCarry — schema with required indexes:
 *      a. (entity_id, is_active) compound for catalog reads
 *      b. (product_id, is_active) compound for "who carries this product"
 *      c. (entity_id, product_id, territory_id, is_active) PARTIAL UNIQUE
 *         on is_active=true — at most one ACTIVE carry per (entity, product, territory)
 *      d. (product_id, territory_id, is_active) PARTIAL UNIQUE on is_active=true
 *         AND territory_id is ObjectId — G7.B forward-compat (channel exclusivity)
 *
 *   3. ProductMergeAudit — schema with cascade entry shape mirroring
 *      DoctorMergeAudit, 30-day TTL on createdAt, status enum APPLIED/
 *      ROLLED_BACK/HARD_DELETED. G7.A.0 ships the schema; G7.A.1 wires the
 *      service that writes rows.
 *
 *   4. resolveProductLifecycleRole.js — exports 7 codes (4 merge + 3 carry)
 *      with inline DEFAULT_* constants, lazy-seed-from-defaults pattern,
 *      60s TTL cache, invalidate() hook for hot-config posture.
 *
 *   5. PRODUCT_LIFECYCLE_ROLES seed in lookupGenericController SEED_DEFAULTS:
 *      7 codes with insert_only_metadata: true (admin overrides survive
 *      future re-seeds — Rule #19 hot-config).
 *
 *   6. Backfill script — buildProductKeyClean helper logic + cleanName +
 *      normalizeUnit imports + dry-run-by-default pattern + EntityProductCarry
 *      bulk insert.
 *
 *   7. Surgical pre-G7 migration (migrateVipForeignProductRefs.js) — the
 *      May-05-2026 unblock that this phase's data foundation depends on.
 *
 * Run: node backend/scripts/healthcheckProductGlobalization.js
 * Exit 0 = clean, 1 = issues found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');

let issues = 0;
let checks = 0;

function warn(category, msg) {
  issues++;
  console.log(`  [${category}] ${msg}`);
}

function pass(msg) {
  checks++;
  console.log(`  ✓ ${msg}`);
}

function readSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

console.log('Phase G7.A.0 — Product Globalization Schema Foundation Health Check');
console.log('═'.repeat(70));

// ── 1. ProductMaster — canonical key + soft-delete trio ──────────────
console.log('\n1. backend/erp/models/ProductMaster.js');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'erp', 'models', 'ProductMaster.js'));
  if (!file) {
    warn('PRODUCT_MODEL', 'backend/erp/models/ProductMaster.js not found');
  } else {
    if (/product_key_clean\s*:\s*\{[\s\S]{0,200}?type:\s*String/.test(file)) {
      pass('product_key_clean field present');
    } else {
      warn('PRODUCT_MODEL', 'product_key_clean field missing');
    }
    if (/mergedInto\s*:\s*\{[\s\S]{0,200}?ref:\s*['"]ProductMaster['"]/.test(file)) {
      pass('mergedInto ref:ProductMaster present');
    } else {
      warn('PRODUCT_MODEL', 'mergedInto ref missing — soft-delete contract broken');
    }
    if (/mergedAt\s*:\s*\{\s*type:\s*Date/.test(file)) {
      pass('mergedAt field present');
    } else {
      warn('PRODUCT_MODEL', 'mergedAt field missing');
    }
    if (/function\s+buildProductKeyClean/.test(file)) {
      pass('buildProductKeyClean helper defined');
    } else {
      warn('PRODUCT_MODEL', 'buildProductKeyClean helper missing');
    }
    // Pre-validate hook computes product_key_clean
    if (/pre\(['"]validate['"][\s\S]{0,2000}?product_key_clean\s*=\s*computed/.test(file)) {
      pass('pre-validate hook computes product_key_clean');
    } else {
      warn('PRODUCT_MODEL', 'pre-validate hook does not compute product_key_clean');
    }
    if (/pre\(['"]findOneAndUpdate['"][\s\S]{0,3000}?product_key_clean\s*=\s*computed/.test(file)) {
      pass('pre-findOneAndUpdate hook computes product_key_clean');
    } else {
      warn('PRODUCT_MODEL', 'pre-findOneAndUpdate hook does not maintain product_key_clean');
    }
    // Don't add unique index yet — that's G7.A.1's job after dedupe
    if (/productMasterSchema\.index\(\s*\{\s*product_key_clean[\s\S]{0,80}?unique:\s*true/.test(file)) {
      warn('PRODUCT_MODEL', 'schema declares unique: true on product_key_clean — must stay non-unique until G7.A.1 dedupe');
    } else {
      pass('product_key_clean is non-unique today (G7.A.1 will flip after dedupe)');
    }
    // Original entity_id-based unique index should still be present
    if (/productMasterSchema\.index\([\s\S]{0,80}?entity_id:\s*1[\s\S]{0,80}?item_key:\s*1[\s\S]{0,80}?unique:\s*true/.test(file)) {
      pass('legacy entity_id+item_key unique index preserved');
    } else {
      warn('PRODUCT_MODEL', 'legacy entity_id+item_key unique index missing — backwards-compat broken');
    }
  }
}

// ── 2. EntityProductCarry — schema + required indexes ────────────────
console.log('\n2. backend/erp/models/EntityProductCarry.js');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'erp', 'models', 'EntityProductCarry.js'));
  if (!file) {
    warn('CARRY_MODEL', 'backend/erp/models/EntityProductCarry.js not found');
  } else {
    if (/entity_id[\s\S]{0,100}?ref:\s*['"]Entity['"]/.test(file)) pass('entity_id ref:Entity'); else warn('CARRY_MODEL', 'entity_id ref missing');
    if (/product_id[\s\S]{0,100}?ref:\s*['"]ProductMaster['"]/.test(file)) pass('product_id ref:ProductMaster'); else warn('CARRY_MODEL', 'product_id ref missing');
    if (/territory_id[\s\S]{0,80}?default:\s*null/.test(file)) pass('territory_id nullable (G7.B forward-compat)'); else warn('CARRY_MODEL', 'territory_id missing or not nullable');
    if (/is_active[\s\S]{0,80}?default:\s*true/.test(file)) pass('is_active flag'); else warn('CARRY_MODEL', 'is_active flag missing');
    if (/selling_price\s*:\s*\{[\s\S]{0,80}?type:\s*Number/.test(file)) pass('selling_price field'); else warn('CARRY_MODEL', 'selling_price field missing');
    if (/purchase_price\s*:\s*\{[\s\S]{0,80}?type:\s*Number/.test(file)) pass('purchase_price field'); else warn('CARRY_MODEL', 'purchase_price field missing');
    if (/vat_override\s*:\s*\{[\s\S]{0,80}?default:\s*null/.test(file)) pass('vat_override nullable (Lock 3 escape hatch)'); else warn('CARRY_MODEL', 'vat_override missing or not nullable');
    if (/STATUS\s*=\s*\[[\s\S]{0,200}?ACTIVE[\s\S]{0,200}?SUSPENDED[\s\S]{0,200}?EXPIRED[\s\S]{0,200}?SUPERSEDED/.test(file)) {
      pass('STATUS enum has ACTIVE/SUSPENDED/EXPIRED/SUPERSEDED');
    } else {
      warn('CARRY_MODEL', 'STATUS enum incomplete');
    }
    // Indexes
    if (/index\(\s*\{\s*entity_id:\s*1,\s*product_id:\s*1,\s*territory_id:\s*1,\s*is_active:\s*1\s*\}[\s\S]{0,200}?unique:\s*true[\s\S]{0,200}?partialFilterExpression:\s*\{\s*is_active:\s*true/.test(file)) {
      pass('partial-unique index on (entity, product, territory, is_active=true)');
    } else {
      warn('CARRY_MODEL', 'partial-unique index on (entity, product, territory, active) missing — duplicates will sneak in');
    }
    if (/index\(\s*\{\s*product_id:\s*1,\s*territory_id:\s*1,\s*is_active:\s*1\s*\}[\s\S]{0,400}?territory_id:\s*\{\s*\$type:\s*['"]objectId['"]/.test(file)) {
      pass('G7.B forward-compat partial-unique on (product, territory, active) where territory is set');
    } else {
      warn('CARRY_MODEL', 'G7.B channel-exclusivity index missing — phase boundary will need migration');
    }
  }
}

// ── 3. ProductMergeAudit — forward-compat for G7.A.1 ─────────────────
console.log('\n3. backend/erp/models/ProductMergeAudit.js');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'erp', 'models', 'ProductMergeAudit.js'));
  if (!file) {
    warn('AUDIT_MODEL', 'backend/erp/models/ProductMergeAudit.js not found');
  } else {
    if (/winner_id[\s\S]{0,100}?ref:\s*['"]ProductMaster['"]/.test(file)) pass('winner_id ref:ProductMaster'); else warn('AUDIT_MODEL', 'winner_id ref missing');
    if (/loser_id[\s\S]{0,100}?ref:\s*['"]ProductMaster['"]/.test(file)) pass('loser_id ref:ProductMaster'); else warn('AUDIT_MODEL', 'loser_id ref missing');
    if (/cascade:\s*\[cascadeEntrySchema/.test(file)) pass('cascade array of cascadeEntrySchema'); else warn('AUDIT_MODEL', 'cascade array missing');
    if (/repointed_ids:\s*\[/.test(file)) pass('cascadeEntry.repointed_ids array'); else warn('AUDIT_MODEL', 'repointed_ids missing');
    if (/collision_ids:\s*\[[\s\S]{0,500}?original_value/.test(file)) pass('cascadeEntry.collision_ids with original_value'); else warn('AUDIT_MODEL', 'collision_ids missing or shape wrong');
    if (/enum:\s*\[\s*['"]APPLIED['"][\s\S]{0,80}?['"]ROLLED_BACK['"][\s\S]{0,80}?['"]HARD_DELETED['"]/.test(file)) {
      pass('status enum APPLIED/ROLLED_BACK/HARD_DELETED');
    } else {
      warn('AUDIT_MODEL', 'status enum incomplete');
    }
    if (/expireAfterSeconds:\s*30\s*\*\s*24\s*\*\s*60\s*\*\s*60/.test(file)) {
      pass('30-day TTL on createdAt (rollback grace window)');
    } else {
      warn('AUDIT_MODEL', '30-day TTL missing — rollback grace contract broken');
    }
  }
}

// ── 4. resolveProductLifecycleRole helper ────────────────────────────
console.log('\n4. backend/utils/resolveProductLifecycleRole.js');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'utils', 'resolveProductLifecycleRole.js'));
  if (!file) {
    warn('ROLE_HELPER', 'backend/utils/resolveProductLifecycleRole.js not found');
  } else {
    const codes = ['VIEW_MERGE_TOOL', 'EXECUTE_MERGE', 'ROLLBACK_MERGE', 'HARD_DELETE_MERGED', 'CARRY_GRANT', 'CARRY_REVOKE', 'PRICE_CHANGE'];
    for (const c of codes) {
      const present = new RegExp(`['"]${c}['"]`).test(file);
      if (present) pass(`${c} code referenced`);
      else warn('ROLE_HELPER', `${c} not found in helper`);
    }
    if (/category:\s*['"]PRODUCT_LIFECYCLE_ROLES['"]/.test(file)) pass('PRODUCT_LIFECYCLE_ROLES lookup category bound'); else warn('ROLE_HELPER', 'lookup category not bound');
    if (/TTL_MS\s*=\s*60_000/.test(file)) pass('60s TTL cache'); else warn('ROLE_HELPER', '60s TTL cache missing');
    if (/function invalidate/.test(file)) pass('invalidate() hook for hot-config posture'); else warn('ROLE_HELPER', 'invalidate() helper missing');
    if (/userCanPerformLifecycleAction/.test(file)) pass('userCanPerformLifecycleAction convenience'); else warn('ROLE_HELPER', 'userCanPerformLifecycleAction missing');
    if (/PRESIDENT[\s\S]{0,80}?return\s+true/.test(file)) pass('president bypass present'); else warn('ROLE_HELPER', 'president bypass missing');
  }
}

// ── 5. PRODUCT_LIFECYCLE_ROLES seed in lookupGenericController ───────
console.log('\n5. backend/erp/controllers/lookupGenericController.js — PRODUCT_LIFECYCLE_ROLES seed');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'erp', 'controllers', 'lookupGenericController.js'));
  if (!file) {
    warn('SEED', 'lookupGenericController.js not found');
  } else {
    if (/PRODUCT_LIFECYCLE_ROLES:\s*\[/.test(file)) {
      pass('PRODUCT_LIFECYCLE_ROLES category seeded');
      // Slice the seed array — find the opening bracket and walk to the
      // matching close. Nested arrays in `metadata.roles` mean a greedy
      // regex can't isolate the block; bracket-depth count is the only
      // reliable way.
      const startMatch = file.match(/PRODUCT_LIFECYCLE_ROLES:\s*\[/);
      let seedBlock = '';
      if (startMatch) {
        let depth = 1;
        let i = startMatch.index + startMatch[0].length;
        for (; i < file.length && depth > 0; i++) {
          const ch = file[i];
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
        }
        seedBlock = file.slice(startMatch.index, i);
      }
      const codes = ['VIEW_MERGE_TOOL', 'EXECUTE_MERGE', 'ROLLBACK_MERGE', 'HARD_DELETE_MERGED', 'CARRY_GRANT', 'CARRY_REVOKE', 'PRICE_CHANGE'];
      for (const c of codes) {
        if (new RegExp(`code:\\s*['"]${c}['"]`).test(seedBlock)) pass(`  seed has ${c}`);
        else warn('SEED', `seed missing ${c}`);
      }
      const insertOnlyCount = (seedBlock.match(/insert_only_metadata:\s*true/g) || []).length;
      if (insertOnlyCount === codes.length) {
        pass(`  all 7 entries have insert_only_metadata: true (Rule #19 hot-config)`);
      } else {
        warn('SEED', `expected ${codes.length} insert_only_metadata: true, got ${insertOnlyCount}`);
      }
    } else {
      warn('SEED', 'PRODUCT_LIFECYCLE_ROLES not seeded in lookupGenericController.SEED_DEFAULTS');
    }
  }
}

// ── 6. Backfill script — shape + dry-run-by-default ──────────────────
console.log('\n6. backend/erp/scripts/backfillProductCanonicalAndCarry.js');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'erp', 'scripts', 'backfillProductCanonicalAndCarry.js'));
  if (!file) {
    warn('BACKFILL', 'backfillProductCanonicalAndCarry.js not found');
  } else {
    if (/process\.argv\.includes\(['"]--apply['"]\)/.test(file)) pass('dry-run-by-default — --apply flag required'); else warn('BACKFILL', 'no --apply gate, may write on every run');
    if (/buildProductKeyClean/.test(file)) pass('buildProductKeyClean helper invoked'); else warn('BACKFILL', 'buildProductKeyClean not invoked');
    if (/cleanName/.test(file) && /normalizeUnit/.test(file)) pass('cleanName + normalizeUnit imported'); else warn('BACKFILL', 'cleanName or normalizeUnit not imported — canonical key will diverge from model');
    if (/EntityProductCarry/.test(file)) pass('EntityProductCarry referenced for backfill'); else warn('BACKFILL', 'EntityProductCarry not used — backfill is incomplete');
    if (/bulkWrite/.test(file)) pass('bulkWrite for chunked inserts'); else warn('BACKFILL', 'bulkWrite missing — would be slow on large catalogs');
  }
}

// ── 7. Surgical pre-G7 migration (May-05-2026 unblock) ───────────────
console.log('\n7. backend/erp/scripts/migrateVipForeignProductRefs.js (May-05 surgical)');
console.log('─'.repeat(70));
{
  const file = readSafe(path.join(BACKEND, 'erp', 'scripts', 'migrateVipForeignProductRefs.js'));
  if (!file) {
    warn('SURGICAL', 'migrateVipForeignProductRefs.js not found');
  } else {
    if (/process\.argv\.includes\(['"]--apply['"]\)/.test(file)) pass('dry-run-by-default'); else warn('SURGICAL', 'no --apply gate');
    if (/CASCADE\s*=\s*\[/.test(file)) pass('cascade manifest present (mirrors doctorMergeService)'); else warn('SURGICAL', 'cascade manifest missing');
    if (/InventoryLedger/.test(file) && /SalesLine/.test(file) && /HospitalContractPrice/.test(file)) pass('cascade includes critical models'); else warn('SURGICAL', 'cascade missing one of InventoryLedger/SalesLine/HospitalContractPrice');
  }
}

// ── 8. CLAUDE-ERP / PHASETASK-ERP registration ───────────────────────
console.log('\n8. CLAUDE-ERP.md / docs/PHASETASK-ERP.md — Phase G7 registration');
console.log('─'.repeat(70));
{
  const claudeErp = readSafe(path.join(ROOT, 'CLAUDE-ERP.md'));
  const phaseTask = readSafe(path.join(ROOT, 'docs', 'PHASETASK-ERP.md'));
  if (claudeErp && /Phase G7/.test(claudeErp)) {
    pass('CLAUDE-ERP.md mentions Phase G7');
  } else {
    warn('DOCS', 'Phase G7 not registered in CLAUDE-ERP.md');
  }
  if (phaseTask && /G7\.A/.test(phaseTask)) {
    pass('PHASETASK-ERP.md has G7.A entries');
  } else {
    warn('DOCS', 'G7.A not in docs/PHASETASK-ERP.md');
  }
}

// ── Summary ──────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(70));
console.log(`Checks PASSED: ${checks}`);
console.log(`Issues found:  ${issues}`);
if (issues === 0) {
  console.log('✓ All G7.A.0 contract assertions PASS');
  process.exit(0);
} else {
  console.log('✗ Issues found — fix before claiming G7.A.0 done');
  process.exit(1);
}
