#!/usr/bin/env node
/**
 * Phase A.5 — MD Merge + Canonical Key Wiring Health Check
 *
 * Static (no-DB) verification of the contract that A.5.2 (unique-index flip)
 * depends on. CLAUDE.md note 12b flagged this script as "TODO before
 * unique-index flip" — that's now.
 *
 * Asserted contract:
 *
 *   1. Doctor.vip_client_name_clean — schema field + non-unique index today,
 *      maintained by pre-save AND pre-findOneAndUpdate hooks as
 *      `lastname|firstname` (lowercased).
 *
 *   2. Doctor.mergedInto / mergedAt / isActive — soft-delete trio that the
 *      partial-unique index (post-A.5.2) and the merge service both depend on.
 *
 *   3. doctorMergeService — manifest-driven cascade across CRM (7) + ERP (6)
 *      FK paths; runs inside a Mongo transaction when supported; loser is
 *      ALWAYS soft-deleted (mergedInto + isActive=false) — never hard-deleted
 *      inline (separate cron drives the 30-day grace window).
 *
 *   4. doctorMergeController — every endpoint role-gates via
 *      VIP_CLIENT_LIFECYCLE_ROLES lookup (Rule #3) with president bypass.
 *
 *   5. resolveVipClientLifecycleRole — lazy-seed-from-inline-defaults pattern
 *      so the page never goes dark on a Lookup outage.
 *
 *   6. doctorMergeRoutes mounted at /api/admin/md-merge in server.js.
 *
 *   7. Frontend MdMergePage + mdMergeService + Sidebar entry + App.jsx route +
 *      PageGuide entry all wired (Rule #2 — full chain).
 *
 *   8. errorHandler — duplicate-key on `vip_client_name_clean` returns a
 *      friendly 409 (the minimum UX gate for A.5.2 before the full A.5.3
 *      contract ships).
 *
 *   9. migrateVipClientCanonical script — partial-filter index shape
 *      (`{ unique: true, partialFilterExpression: { mergedInto: null } }`) so
 *      merged losers don't trip the constraint on rollback.
 *
 * Run: node backend/scripts/healthcheckMdMergeAudit.js
 * Exit code 0 = clean, 1 = issues found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');

let issues = 0;

function warn(category, msg) {
  issues++;
  console.log(`  [${category}] ${msg}`);
}

function readSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

console.log('Phase A.5 — MD Merge + Canonical Key Wiring Health Check');
console.log('═'.repeat(60));

// ── 1. Doctor model — canonical key + soft-delete trio + index ───────
console.log('\n1. backend/models/Doctor.js — canonical key + soft-delete trio');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'models', 'Doctor.js'));
  if (!file) {
    warn('DOCTOR_MODEL', 'backend/models/Doctor.js not found');
  } else {
    if (!/vip_client_name_clean\s*:\s*\{[\s\S]{0,80}?type:\s*String/.test(file)) {
      warn('DOCTOR_MODEL', 'vip_client_name_clean field missing from Doctor schema');
    }
    if (!/mergedInto\s*:\s*\{[\s\S]{0,200}?ref:\s*['"]Doctor['"]/.test(file)) {
      warn('DOCTOR_MODEL', 'mergedInto ref:Doctor missing — soft-delete contract broken');
    }
    if (!/mergedAt\s*:\s*\{\s*type:\s*Date/.test(file)) {
      warn('DOCTOR_MODEL', 'mergedAt field missing from Doctor schema');
    }
    if (!/isActive\s*:\s*\{[\s\S]{0,80}?type:\s*Boolean/.test(file)) {
      warn('DOCTOR_MODEL', 'isActive field missing from Doctor schema');
    }
    // Index declaration must remain non-unique today; the migration script flips
    // it to partial-unique. If the schema has `unique: true` inline, mongoose
    // autoIndex would attempt to build it on every connect and (with current
    // dupes) log error noise silently — guard against that drift.
    if (!/doctorSchema\.index\(\s*\{\s*vip_client_name_clean:\s*1\s*\}\s*\)/.test(file)) {
      warn('DOCTOR_MODEL', 'plain schema.index({ vip_client_name_clean: 1 }) declaration missing');
    }
    if (/doctorSchema\.index\([\s\S]{0,80}?vip_client_name_clean:\s*1[\s\S]{0,80}?unique:\s*true/.test(file)) {
      warn('DOCTOR_MODEL', 'schema declares unique: true on vip_client_name_clean — must stay plain; flip is via migration script');
    }
    // Pre-save hook recomputes vip_client_name_clean.
    if (!/this\.vip_client_name_clean\s*=\s*`\$\{last\}\|\$\{first\}`/.test(file)) {
      warn('DOCTOR_MODEL', 'pre-save hook does not recompute vip_client_name_clean as `last|first`');
    }
    // Pre-findOneAndUpdate hook mirrors the same.
    if (!/findOneAndUpdate[\s\S]{0,1500}?vip_client_name_clean\s*=\s*clean/.test(file)) {
      warn('DOCTOR_MODEL', 'pre-findOneAndUpdate hook does not maintain vip_client_name_clean');
    }
  }
  if (issues === startIssues) console.log('  ✓ Doctor model contract intact');
}

// ── 2. doctorMergeService — cascade manifest + transaction + soft-delete ─
console.log('\n2. backend/services/doctorMergeService.js — cascade contract');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'services', 'doctorMergeService.js'));
  if (!file) {
    warn('MERGE_SVC', 'backend/services/doctorMergeService.js not found');
  } else {
    // Manifest is the single source of truth — preview, execute, rollback walk
    // the same manifest. If anyone collapses these into per-call hardcoded
    // arrays the rollback path silently breaks.
    if (!/function\s+buildCascadeManifest\s*\(\s*\)/.test(file)) {
      warn('MERGE_SVC', 'buildCascadeManifest function missing — manifest pattern broken');
    }
    // CRM cascade entries — must include all 7 FK sites (Visit, PA, CommLog ×2,
    // Schedule, InviteLink, CLMSession). Cross-check against CLAUDE.md note 12b.
    const crmEntries = ['Visit', 'ProductAssignment', 'CommunicationLog', 'Schedule', 'InviteLink', 'CLMSession'];
    for (const m of crmEntries) {
      const re = new RegExp(`model:\\s*${m},`);
      if (!re.test(file)) {
        warn('MERGE_SVC', `cascade manifest missing CRM model "${m}"`);
      }
    }
    // ERP cascade entries — informational refs (not transactional-integrity-bearing
    // but still need re-pointing so admin reports stay accurate post-merge).
    const erpEntries = ['ErpCollection', 'ErpMdProductRebate', 'ErpMdCapitationRule', 'ErpPatientMdAttribution', 'ErpPrfCalf'];
    for (const m of erpEntries) {
      const re = new RegExp(`model:\\s*${m},`);
      if (!re.test(file)) {
        warn('MERGE_SVC', `cascade manifest missing ERP model "${m}"`);
      }
    }
    // Visit-week + schedule + pa-active + attribution collision strategies must
    // all be live (the kinds the manifest dispatches against).
    for (const kind of ['simple', 'nested-array', 'visit-week', 'schedule', 'pa-active', 'attribution']) {
      if (!new RegExp(`kind:\\s*'${kind}'`).test(file)) {
        warn('MERGE_SVC', `cascade kind "${kind}" missing from manifest`);
      }
    }
    // Soft-delete contract — loser is NEVER hard-deleted inline; mergedInto +
    // mergedAt + isActive=false get set and persisted under the session.
    if (!/loser\.mergedInto\s*=\s*winner\._id/.test(file)) {
      warn('MERGE_SVC', 'loser.mergedInto = winner._id assignment missing — soft-delete contract broken');
    }
    if (!/loser\.isActive\s*=\s*false/.test(file)) {
      warn('MERGE_SVC', 'loser.isActive = false missing — loser would still appear in active queries');
    }
    if (!/loser\.mergedAt\s*=\s*new Date\(\)/.test(file)) {
      warn('MERGE_SVC', 'loser.mergedAt assignment missing — 30-day grace window cannot be computed');
    }
    // Transaction-aware execution.
    if (!/session\.withTransaction/.test(file)) {
      warn('MERGE_SVC', 'session.withTransaction missing — partial-cascade risk on Atlas');
    }
    // Atlas/replica detection so standalone Mongo (test fixtures) gracefully
    // falls through.
    if (!/replSetGetStatus/.test(file)) {
      warn('MERGE_SVC', 'replSetGetStatus probe missing — standalone Mongo fallback unsafe');
    }
    // Audit row written OUTSIDE the cascade txn so a mid-cascade abort still
    // leaves an audit trail for the next admin.
    if (!/DoctorMergeAudit\.create/.test(file)) {
      warn('MERGE_SVC', 'DoctorMergeAudit.create missing — merges would leave no audit trail');
    }
    // Find-candidates query — the duplicate scanner that drives the admin UI.
    if (!/findCandidates\s*\([\s\S]{0,1200}?vip_client_name_clean:\s*\{\s*\$exists:\s*true/.test(file)) {
      warn('MERGE_SVC', 'findCandidates does not gate on { vip_client_name_clean: { $exists: true } } — pre-A.5.1 docs would surface as dupes');
    }
    if (!/findCandidates\s*\([\s\S]{0,1200}?mergedInto:\s*null/.test(file)) {
      warn('MERGE_SVC', 'findCandidates does not exclude soft-deleted losers (mergedInto: null missing)');
    }
  }
  if (issues === startIssues) console.log('  ✓ Merge service cascade contract intact');
}

// ── 3. DoctorMergeAudit model — structured per-model arrays + lifecycle ─
console.log('\n3. backend/models/DoctorMergeAudit.js — audit shape');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'models', 'DoctorMergeAudit.js'));
  if (!file) {
    warn('AUDIT_MODEL', 'backend/models/DoctorMergeAudit.js not found');
  } else {
    if (!/winner_id\s*:\s*\{[\s\S]{0,200}?ref:\s*['"]Doctor['"]/.test(file)) {
      warn('AUDIT_MODEL', 'winner_id ref:Doctor missing');
    }
    if (!/loser_id\s*:\s*\{[\s\S]{0,200}?ref:\s*['"]Doctor['"]/.test(file)) {
      warn('AUDIT_MODEL', 'loser_id ref:Doctor missing');
    }
    if (!/cascade\s*:\s*\[cascadeEntrySchema\]/.test(file)) {
      warn('AUDIT_MODEL', 'cascade array schema missing — rollback queries cannot reconstruct per-model FK moves');
    }
    if (!/enum:\s*\[\s*'APPLIED'\s*,\s*'ROLLED_BACK'\s*,\s*'HARD_DELETED'\s*\]/.test(file)) {
      warn('AUDIT_MODEL', 'status enum [APPLIED, ROLLED_BACK, HARD_DELETED] missing — lifecycle broken');
    }
  }
  if (issues === startIssues) console.log('  ✓ DoctorMergeAudit shape intact');
}

// ── 4. doctorMergeController — role gates on every endpoint ──────────
console.log('\n4. backend/controllers/doctorMergeController.js — role gates');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'controllers', 'doctorMergeController.js'));
  if (!file) {
    warn('MERGE_CTRL', 'backend/controllers/doctorMergeController.js not found');
  } else {
    if (!/gateRole\s*\(/.test(file)) {
      warn('MERGE_CTRL', 'gateRole helper missing — endpoints not role-gated');
    }
    // President bypass — universal Rule #20.
    if (!/req\.user\.role\s*===\s*ROLES\.PRESIDENT/.test(file)) {
      warn('MERGE_CTRL', 'president bypass missing — Rule #20 violated');
    }
    // Each public surface should call gateRole with its role getter.
    // Preview is read-only — gated on view, not execute (admin can spelunk
    // the cascade blast radius without commit authority).
    const expectedGates = [
      { endpoint: 'candidates', getter: 'getViewMergeToolRoles' },
      { endpoint: 'preview',    getter: 'getViewMergeToolRoles' },
      { endpoint: 'execute',    getter: 'getExecuteMergeRoles' },
      { endpoint: 'rollback',   getter: 'getRollbackMergeRoles' },
    ];
    for (const { endpoint, getter } of expectedGates) {
      // gateRole(req, getXxxRoles) appears in the same handler block as the endpoint name.
      const re = new RegExp(`${endpoint}\\s*=\\s*catchAsync[\\s\\S]{0,400}?gateRole\\s*\\(\\s*req\\s*,\\s*${getter}\\s*\\)`);
      if (!re.test(file)) {
        warn('MERGE_CTRL', `${endpoint} endpoint not gated by ${getter}`);
      }
    }
  }
  if (issues === startIssues) console.log('  ✓ All merge endpoints role-gated');
}

// ── 5. resolveVipClientLifecycleRole — defaults + lazy-seed pattern ──
console.log('\n5. backend/utils/resolveVipClientLifecycleRole.js — lookup-driven roles');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'utils', 'resolveVipClientLifecycleRole.js'));
  if (!file) {
    warn('VIP_LIFECYCLE_ROLE', 'backend/utils/resolveVipClientLifecycleRole.js not found');
  } else {
    // Lookup category alignment.
    if (!/category:\s*['"]VIP_CLIENT_LIFECYCLE_ROLES['"]/.test(file)) {
      warn('VIP_LIFECYCLE_ROLE', "Lookup category 'VIP_CLIENT_LIFECYCLE_ROLES' not queried");
    }
    // 7-code surface — mirror plan D11.
    const codes = [
      'VIEW_MERGE_TOOL', 'EXECUTE_MERGE', 'ROLLBACK_MERGE', 'HARD_DELETE_MERGED',
      'REASSIGN_PRIMARY', 'JOIN_COVERAGE_AUTO', 'JOIN_COVERAGE_APPROVAL',
    ];
    for (const code of codes) {
      const re = new RegExp(`['"]${code}['"]`);
      if (!re.test(file)) {
        warn('VIP_LIFECYCLE_ROLE', `code "${code}" not exposed`);
      }
    }
    // Lazy-seed-from-inline-defaults: cache hit OR fall back to defaults on
    // Lookup outage. Both paths must exist.
    if (!/_cache\.set\s*\(/.test(file)) {
      warn('VIP_LIFECYCLE_ROLE', 'cache.set missing — every call would hit Mongo');
    }
    if (!/let\s+roles\s*=\s*defaults/.test(file)) {
      warn('VIP_LIFECYCLE_ROLE', 'inline defaults fallback missing — page goes dark on Lookup outage');
    }
  }
  if (issues === startIssues) console.log('  ✓ VIP lifecycle role helper intact');
}

// ── 6. doctorMergeRoutes — mounted at /api/admin/md-merge ────────────
console.log('\n6. backend/server.js — /api/admin/md-merge mount');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'server.js'));
  if (!file) {
    warn('SERVER', 'backend/server.js not found');
  } else {
    if (!/app\.use\(\s*['"]\/api\/admin\/md-merge['"][\s\S]{0,200}?doctorMergeRoutes/.test(file)) {
      warn('SERVER', 'doctorMergeRoutes not mounted at /api/admin/md-merge');
    }
  }
  if (issues === startIssues) console.log('  ✓ /api/admin/md-merge mounted');
}

// ── 7. Frontend wiring — App.jsx route + Sidebar link + service + page guide ─
console.log('\n7. Frontend wiring — App.jsx + Sidebar + service + PageGuide');
console.log('─'.repeat(60));
{
  const startIssues = issues;

  const app = readSafe(path.join(FRONTEND, 'src', 'App.jsx'));
  if (!app) {
    warn('FRONTEND', 'frontend/src/App.jsx not found');
  } else {
    if (!/MdMergePage[\s\S]{0,200}?import\(['"]\.\/pages\/admin\/MdMergePage['"]/.test(app)) {
      warn('FRONTEND', 'App.jsx does not lazy-load MdMergePage');
    }
    if (!/path=["']\/admin\/md-merge["']/.test(app)) {
      warn('FRONTEND', 'App.jsx route /admin/md-merge missing');
    }
  }

  const sidebar = readSafe(path.join(FRONTEND, 'src', 'components', 'common', 'Sidebar.jsx'));
  if (!sidebar) {
    warn('FRONTEND', 'frontend/src/components/common/Sidebar.jsx not found');
  } else {
    if (!/path:\s*['"]\/admin\/md-merge['"]/.test(sidebar)) {
      warn('FRONTEND', 'Sidebar entry for /admin/md-merge missing — admin cannot reach the page');
    }
  }

  const svc = readSafe(path.join(FRONTEND, 'src', 'services', 'mdMergeService.js'));
  if (!svc) {
    warn('FRONTEND', 'frontend/src/services/mdMergeService.js not found');
  } else {
    // Service hits /admin/md-merge/* paths.
    if (!/['"]\/admin\/md-merge\//.test(svc)) {
      warn('FRONTEND', 'mdMergeService does not call /admin/md-merge/* endpoints');
    }
  }

  const pageGuide = readSafe(path.join(FRONTEND, 'src', 'components', 'common', 'PageGuide.jsx'));
  if (!pageGuide) {
    warn('FRONTEND', 'frontend/src/components/common/PageGuide.jsx not found');
  } else {
    // Rule #1 — every admin-facing page has a banner entry.
    if (!/['"]md-merge['"]\s*:\s*\{[\s\S]{0,80}?title:/.test(pageGuide)) {
      warn('FRONTEND', "PageGuide entry 'md-merge' missing — Rule #1 (banners on user-facing pages)");
    }
  }

  if (issues === startIssues) console.log('  ✓ Frontend wiring intact end-to-end');
}

// ── 8. errorHandler — friendly 409 on canonical-name dup ─────────────
console.log('\n8. backend/middleware/errorHandler.js — vip_client_name_clean E11000 path');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'middleware', 'errorHandler.js'));
  if (!file) {
    warn('ERR_HANDLER', 'backend/middleware/errorHandler.js not found');
  } else {
    if (!/err\.code\s*===\s*11000/.test(file)) {
      warn('ERR_HANDLER', 'global E11000 catch missing');
    }
    // Friendly path for vip_client_name_clean. Without this, the post-flip UX
    // surfaces "vip_client_name_clean already exists" — confusing for BDMs.
    if (!/err\.keyValue\.vip_client_name_clean[\s\S]{0,500}?ApiError\(\s*409/.test(file)) {
      warn('ERR_HANDLER', 'vip_client_name_clean → friendly 409 mapping missing (post-A.5.2 BDMs hit raw field-name error)');
    }
  }
  if (issues === startIssues) console.log('  ✓ vip_client_name_clean E11000 path returns friendly 409');
}

// ── 9. migration script — partial-filter index shape ─────────────────
console.log('\n9. backend/scripts/migrateVipClientCanonical.js — partial-unique shape');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'scripts', 'migrateVipClientCanonical.js'));
  if (!file) {
    warn('MIGRATION', 'backend/scripts/migrateVipClientCanonical.js not found');
  } else {
    // Three modes — DRY_RUN, APPLY, UNIQUE_INDEX. The script uses an inline
    // ternary so DRY_RUN is the implicit default branch — match just the
    // string-literal presence, which is enough to detect drift.
    for (const mode of ['DRY_RUN', 'APPLY', 'UNIQUE_INDEX']) {
      if (!new RegExp(`['"]${mode}['"]`).test(file)) {
        warn('MIGRATION', `mode "${mode}" not handled`);
      }
    }
    // Final shape MUST be partial-unique with { mergedInto: null }. A plain
    // `unique: true` build would refuse on rollback because winner+loser share
    // canonical key (merge service does not rename the loser).
    if (!/partialFilterExpression:\s*\{\s*mergedInto:\s*null\s*\}/.test(file)) {
      warn('MIGRATION', 'partialFilterExpression { mergedInto: null } not present — plain unique would refuse rollback');
    }
    if (!/createIndex\(\s*\{\s*vip_client_name_clean:\s*1\s*\}\s*,\s*\{\s*unique:\s*true/.test(file)) {
      warn('MIGRATION', 'createIndex with unique:true call missing');
    }
    // Refusal-on-active-dupes (matches dry-run scope so script pre-check and
    // index enforcement scope agree).
    if (!/REFUSING\s+to\s+create\s+unique\s+index/.test(file)) {
      warn('MIGRATION', 'refuse-on-active-dupes guard missing — index build would fail post-merge with E11000');
    }
  }
  if (issues === startIssues) console.log('  ✓ Migration script shape intact');
}

console.log('\n' + '═'.repeat(60));
if (issues > 0) {
  console.log(`✗ ${issues} issue(s) found. MD merge / canonical-key contract has drifted.`);
  process.exit(1);
} else {
  console.log('✓ MD merge + canonical-key contract intact end-to-end.');
  process.exit(0);
}
