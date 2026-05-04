#!/usr/bin/env node
/**
 * Phase N+ — CLM startSession Idempotency Contract Health Check
 *
 * Static (no-DB) verification of the Resume vs duplicate-sync 200/409 split
 * locked May 04 2026 in CLAUDE.md note 13b. This contract is load-bearing
 * for the merged-flow CLM finalization gate — if it drifts, Resume CLM
 * round-trips silently fall back to offline-mode stubs and Session Complete
 * data is written to the wrong record.
 *
 * Asserted contract:
 *
 *   POST /api/clm/sessions  with header  X-Idempotency-Key: <uuid>
 *
 *   Existing session state           | Same user? | Response
 *   ─────────────────────────────────|────────────|──────────────────────────
 *   in_progress                      | yes        | 200 { resumed: true }
 *   in_progress                      | no         | 409
 *   completed (or anything ≠ in_prog)| either     | 409
 *   none (no row for that key)       | n/a        | 201 (normal create)
 *
 *   Both the pre-check (findOne before create) AND the race-safe E11000
 *   catch (after create) implement this same split.
 *
 *   Frontend clmService.startSession sends the X-Idempotency-Key header
 *   and PartnershipCLM.handleStartPresentation reads `res.resumed` to show
 *   the Resume toast.
 *
 * Run: node backend/scripts/healthcheckClmIdempotency.js
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

console.log('Phase N+ — CLM startSession Idempotency Contract Health Check');
console.log('═'.repeat(60));

// ── 1. clmController.startSession contract ────────────────────────
console.log('\n1. backend/controllers/clmController.js — startSession contract');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'controllers', 'clmController.js'));
  if (!file) {
    warn('CLM_CTRL', 'backend/controllers/clmController.js not found');
  } else {
    if (!/const\s+startSession\s*=\s*asyncHandler/.test(file)) {
      warn('CLM_CTRL', 'startSession handler not found');
    }

    if (!/req\.headers\['x-idempotency-key'\]/.test(file)) {
      warn('CLM_CTRL', "startSession does not read req.headers['x-idempotency-key']");
    }

    if (!/CLMSession\.findOne\(\s*\{\s*idempotencyKey\s*\}/.test(file)) {
      warn('CLM_CTRL', 'startSession pre-check missing — should call CLMSession.findOne({ idempotencyKey })');
    }

    // Same-user guard — both pre-check and E11000 catch must compare String(existing.user) === String(req.user._id).
    const sameUserMatches = (file.match(/String\(existing\.user\)\s*===\s*String\(req\.user\._id\)/g) || []).length;
    if (sameUserMatches < 2) {
      warn('CLM_CTRL', `same-user guard appears ${sameUserMatches}× — expected ≥2 (pre-check + E11000 catch)`);
    }

    // status === 'in_progress' guard — both paths.
    const inProgressMatches = (file.match(/existing\.status\s*===\s*'in_progress'/g) || []).length;
    if (inProgressMatches < 2) {
      warn('CLM_CTRL', `in_progress guard appears ${inProgressMatches}× — expected ≥2 (pre-check + E11000 catch)`);
    }

    // Resume returns 200 with resumed: true — both paths.
    const resume200Matches = (file.match(/res\.status\(200\)[\s\S]{0,200}?resumed:\s*true/g) || []).length;
    if (resume200Matches < 2) {
      warn('CLM_CTRL', `Resume → 200 + resumed:true appears ${resume200Matches}× — expected ≥2 (pre-check + E11000 catch)`);
    }

    // Duplicate-sync returns 409 — both paths.
    const dup409Matches = (file.match(/res\.status\(409\)/g) || []).length;
    if (dup409Matches < 2) {
      warn('CLM_CTRL', `Duplicate-sync → 409 appears ${dup409Matches}× — expected ≥2 (pre-check + E11000 catch)`);
    }

    // E11000 race-safe catch.
    if (!/err\s*&&\s*err\.code\s*===\s*11000/.test(file)) {
      warn('CLM_CTRL', 'E11000 race-safe catch missing — concurrent offline syncs would surface 500');
    }

    // Hostile-client guard: remote mode discards inbound location.
    if (!/sessionMode\s*===\s*'remote'\s*\?\s*\{\}\s*:\s*\(location/.test(file)) {
      warn('CLM_CTRL', 'remote-mode location discard missing — hostile client could fake in-person GPS');
    }
  }
  if (issues === startIssues) console.log('  ✓ startSession contract intact');
}

// ── 2. CLMSession model — sparse unique index on idempotencyKey ───
console.log('\n2. backend/models/CLMSession.js — idempotencyKey sparse unique index');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'models', 'CLMSession.js'));
  if (!file) {
    warn('CLM_MODEL', 'backend/models/CLMSession.js not found');
  } else {
    if (!/idempotencyKey/.test(file)) {
      warn('CLM_MODEL', 'idempotencyKey field missing from CLMSession schema');
    }
    // Index can be expressed as schema.index({ idempotencyKey: 1 }, { unique: true, sparse: true })
    // OR inline on the field as { unique: true, sparse: true }. Accept either.
    const hasSchemaIndex = /idempotencyKey:\s*1[\s\S]{0,80}?unique:\s*true[\s\S]{0,80}?sparse:\s*true/.test(file)
      || /idempotencyKey:\s*1[\s\S]{0,80}?sparse:\s*true[\s\S]{0,80}?unique:\s*true/.test(file);
    const hasInlineIndex = /idempotencyKey\s*:\s*\{[\s\S]{0,200}?unique:\s*true[\s\S]{0,200}?sparse:\s*true/.test(file)
      || /idempotencyKey\s*:\s*\{[\s\S]{0,200}?sparse:\s*true[\s\S]{0,200}?unique:\s*true/.test(file);
    if (!hasSchemaIndex && !hasInlineIndex) {
      warn('CLM_MODEL', 'idempotencyKey missing { unique: true, sparse: true } — race-safe E11000 catch will not fire');
    }
  }
  if (issues === startIssues) console.log('  ✓ idempotencyKey indexed sparse + unique');
}

// ── 3. clmRoutes — POST /sessions wired ───────────────────────────
console.log('\n3. backend/routes/clmRoutes.js — POST /sessions wired to startSession');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'routes', 'clmRoutes.js'));
  if (!file) {
    warn('CLM_ROUTES', 'backend/routes/clmRoutes.js not found');
  } else {
    if (!/router\.post\(\s*['"]\/sessions['"]\s*,[\s\S]{0,200}?startSession/.test(file)) {
      warn('CLM_ROUTES', 'POST /sessions does not delegate to startSession handler');
    }
  }
  if (issues === startIssues) console.log('  ✓ POST /sessions wired');
}

// ── 4. clmService.startSession sends X-Idempotency-Key ─────────────
console.log('\n4. frontend/src/services/clmService.js — sends X-Idempotency-Key header');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'src', 'services', 'clmService.js'));
  if (!file) {
    warn('CLM_SVC', 'frontend/src/services/clmService.js not found');
  } else {
    if (!/startSession\s*:\s*async/.test(file)) {
      warn('CLM_SVC', 'startSession not exported');
    }
    if (!/idempotencyKey\s*=\s*null/.test(file)) {
      warn('CLM_SVC', 'startSession does not accept idempotencyKey param');
    }
    if (!/['"]X-Idempotency-Key['"]\s*:\s*idempotencyKey/.test(file)) {
      warn('CLM_SVC', "startSession does not send 'X-Idempotency-Key' header");
    }
  }
  if (issues === startIssues) console.log('  ✓ clmService.startSession sends X-Idempotency-Key');
}

// ── 5. server.js CORS exposes/accepts X-Idempotency-Key ────────────
// The header is custom — must appear in allowedHeaders or CORS preflight
// silently fails as "Network Error" (CLAUDE.md gotcha 8b).
console.log('\n5. backend/server.js — CORS allowedHeaders includes X-Idempotency-Key');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'server.js'));
  if (!file) {
    warn('CORS', 'backend/server.js not found');
  } else {
    // Tolerant to single/double quotes and to either appearing inside
    // an allowedHeaders array or a buildCorsOptions return.
    if (!/X-Idempotency-Key/i.test(file)) {
      warn('CORS', 'X-Idempotency-Key not listed in server.js (CORS preflight will fail silently — see CLAUDE.md gotcha 8b)');
    }
  }
  if (issues === startIssues) console.log('  ✓ CORS accepts X-Idempotency-Key');
}

// ── 6. PartnershipCLM reads res.resumed for Resume toast ──────────
console.log('\n6. frontend/src/pages/employee/PartnershipCLM.jsx — reads res.resumed');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'src', 'pages', 'employee', 'PartnershipCLM.jsx'));
  if (!file) {
    warn('PARTNERSHIP_CLM', 'frontend/src/pages/employee/PartnershipCLM.jsx not found');
  } else {
    if (!/clmService\.startSession\s*\(/.test(file)) {
      warn('PARTNERSHIP_CLM', 'PartnershipCLM does not call clmService.startSession');
    }
    if (!/res\.resumed/.test(file)) {
      warn('PARTNERSHIP_CLM', 'PartnershipCLM does not read res.resumed — Resume toast will not fire');
    }
  }
  if (issues === startIssues) console.log('  ✓ PartnershipCLM reads res.resumed');
}

console.log('\n' + '═'.repeat(60));
if (issues > 0) {
  console.log(`✗ ${issues} issue(s) found. CLM idempotency contract has drifted.`);
  process.exit(1);
} else {
  console.log('✓ CLM idempotency contract intact end-to-end.');
  process.exit(0);
}
