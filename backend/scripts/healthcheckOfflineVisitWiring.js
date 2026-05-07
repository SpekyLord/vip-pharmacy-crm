#!/usr/bin/env node
/**
 * Phase N — Offline Visit + CLM Merge Wiring Health Check
 *
 * Static (no-DB) verification of the linkage contract that Phase N.1 lays
 * down:
 *
 *   1. Visit model has clm_session_id + session_group_id fields with sparse
 *      indexes.
 *   2. CLMSession model has visit_id + mode + deckOpenedAt + deckOpenCount.
 *   3. CommunicationLog model has clm_session_id.
 *   4. visitController.createVisit reads session_group_id and looks up the
 *      CLM session via idempotencyKey.
 *   5. clmController exports getPublicDeck and accepts mode='remote'.
 *   6. clmRoutes mounts /deck/:id BEFORE router.use(protect).
 *   7. Service worker queues /api/visits/ (Phase N.2 prerequisite — flagged
 *      "missing" until Phase N.2 ships).
 *   8. PageGuide has both 'new-visit' and 'deck-viewer' (Phase N.6 prereq).
 *
 * Run: node backend/scripts/healthcheckOfflineVisitWiring.js
 * Exit code 0 = clean, 1 = issues found
 *
 * NOTE: Does NOT hit the database. For a live-DB smoke, the full Phase N.7
 * E2E flow (offline visit + CLM submit on staging) covers the dynamic side.
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

console.log('Phase N — Offline Visit + CLM Wiring Health Check');
console.log('═'.repeat(50));

// ── 1. Visit model ────────────────────────────────────────────────
console.log('\n1. Visit model schema (Phase N.1)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'models', 'Visit.js'));
  if (!file) {
    warn('VISIT_MODEL', 'backend/models/Visit.js not found');
  } else {
    if (!/clm_session_id\s*:\s*\{[\s\S]*?ref:\s*'CLMSession'/.test(file)) {
      warn('VISIT_MODEL', 'Visit.clm_session_id field missing or not ref=CLMSession');
    }
    if (!/session_group_id\s*:\s*\{[\s\S]*?type:\s*String/.test(file)) {
      warn('VISIT_MODEL', 'Visit.session_group_id field missing or wrong type');
    }
    if (!/visitSchema\.index\(\s*\{\s*clm_session_id:\s*1\s*\}\s*,\s*\{\s*sparse:\s*true\s*\}/.test(file)) {
      warn('VISIT_MODEL', 'Sparse index on clm_session_id missing');
    }
    if (!/visitSchema\.index\(\s*\{\s*session_group_id:\s*1\s*\}\s*,\s*\{\s*sparse:\s*true\s*\}/.test(file)) {
      warn('VISIT_MODEL', 'Sparse index on session_group_id missing');
    }
  }
  if (issues === startIssues) console.log('  ✓ Visit model wired for Phase N');
}

// ── 2. CLMSession model ───────────────────────────────────────────
console.log('\n2. CLMSession model schema (Phase N.1)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'models', 'CLMSession.js'));
  if (!file) {
    warn('CLM_MODEL', 'backend/models/CLMSession.js not found');
  } else {
    if (!/visit_id\s*:\s*\{[\s\S]*?ref:\s*'Visit'/.test(file)) {
      warn('CLM_MODEL', 'CLMSession.visit_id field missing or not ref=Visit');
    }
    if (!/mode\s*:\s*\{[\s\S]*?enum:\s*\[\s*'in_person'\s*,\s*'remote'\s*\]/.test(file)) {
      warn('CLM_MODEL', "CLMSession.mode enum ['in_person','remote'] missing");
    }
    if (!/deckOpenedAt\s*:\s*\{\s*type:\s*Date\s*\}/.test(file)) {
      warn('CLM_MODEL', 'CLMSession.deckOpenedAt missing');
    }
    if (!/deckOpenCount/.test(file)) {
      warn('CLM_MODEL', 'CLMSession.deckOpenCount missing');
    }
  }
  if (issues === startIssues) console.log('  ✓ CLMSession model wired for Phase N');
}

// ── 3. CommunicationLog model ─────────────────────────────────────
console.log('\n3. CommunicationLog model schema (Phase N.1)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'models', 'CommunicationLog.js'));
  if (!file) {
    warn('COMMLOG_MODEL', 'backend/models/CommunicationLog.js not found');
  } else {
    if (!/clm_session_id\s*:\s*\{[\s\S]*?ref:\s*'CLMSession'/.test(file)) {
      warn('COMMLOG_MODEL', 'CommunicationLog.clm_session_id field missing or not ref=CLMSession');
    }
  }
  if (issues === startIssues) console.log('  ✓ CommunicationLog model wired for Phase N');
}

// ── 4. visitController linkage logic ──────────────────────────────
console.log('\n4. visitController linkage logic (Phase N.1)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'controllers', 'visitController.js'));
  if (!file) {
    warn('VISIT_CTRL', 'backend/controllers/visitController.js not found');
  } else {
    if (!/require\(['"]\.\.\/models\/CLMSession['"]\)/.test(file)) {
      warn('VISIT_CTRL', 'visitController missing require for CLMSession model');
    }
    if (!/session_group_id/.test(file)) {
      warn('VISIT_CTRL', 'visitController never reads session_group_id');
    }
    if (!/CLMSession\.findOne\(\s*\{\s*idempotencyKey/.test(file)) {
      warn('VISIT_CTRL', 'visitController never resolves CLMSession by idempotencyKey');
    }
    if (!/visit_id\s*=\s*visit\._id/.test(file)) {
      warn('VISIT_CTRL', 'visitController never back-stamps CLMSession.visit_id');
    }
  }
  if (issues === startIssues) console.log('  ✓ visitController linkage logic wired');
}

// ── 5. clmController public deck handler + remote mode ────────────
console.log('\n5. clmController.getPublicDeck + remote mode (Phase N.1)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'controllers', 'clmController.js'));
  if (!file) {
    warn('CLM_CTRL', 'backend/controllers/clmController.js not found');
  } else {
    if (!/const\s+getPublicDeck\s*=\s*asyncHandler/.test(file)) {
      warn('CLM_CTRL', 'getPublicDeck handler missing');
    }
    if (!/findOne\(\s*\{\s*_id:\s*id\s*,\s*mode:\s*'remote'\s*\}/.test(file)) {
      warn('CLM_CTRL', "getPublicDeck doesn't filter by mode='remote'");
    }
    if (!/getPublicDeck/.test(file.split('module.exports')[1] || '')) {
      warn('CLM_CTRL', 'getPublicDeck not exported');
    }
    if (!/sessionMode\s*=\s*mode\s*===\s*'remote'/.test(file)) {
      warn('CLM_CTRL', 'startSession mode parameter not handled');
    }
  }
  if (issues === startIssues) console.log('  ✓ clmController public deck + remote mode wired');
}

// ── 6. clmRoutes public mount + rate limit ─────────────────────────
console.log('\n6. clmRoutes public mount (Phase N.1)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'routes', 'clmRoutes.js'));
  if (!file) {
    warn('CLM_ROUTES', 'backend/routes/clmRoutes.js not found');
  } else {
    // The /deck/:id mount MUST appear BEFORE router.use(protect). Detect
    // textual order to enforce.
    const deckIdx = file.search(/router\.get\(['"]\/deck\/:id/);
    const protectIdx = file.search(/router\.use\(protect\)/);
    if (deckIdx === -1) {
      warn('CLM_ROUTES', 'GET /deck/:id route not mounted');
    } else if (protectIdx === -1) {
      warn('CLM_ROUTES', 'router.use(protect) missing — auth bypass risk');
    } else if (deckIdx > protectIdx) {
      warn('CLM_ROUTES', '/deck/:id mounted AFTER router.use(protect) — public route is gated by JWT, contract broken');
    }
    if (!/express-rate-limit/.test(file)) {
      warn('CLM_ROUTES', 'express-rate-limit not imported — public deck has no IP rate limit');
    }
    if (!/publicDeckRateLimit/.test(file)) {
      warn('CLM_ROUTES', 'publicDeckRateLimit not applied to /deck/:id');
    }
  }
  if (issues === startIssues) console.log('  ✓ clmRoutes public mount + rate limit wired');
}

// ── 7. Service worker visit queueing (Phase N.2 prerequisite) ─────
console.log('\n7. Service worker /api/visits queueing (Phase N.2)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'public', 'sw.js'));
  if (!file) {
    warn('SW', 'frontend/public/sw.js not found');
  } else {
    if (!/QUEUEABLE_API_PATHS[\s\S]*?\/api\/visits\//.test(file)) {
      warn('SW', "sw.js QUEUEABLE_API_PATHS missing '/api/visits/' (Phase N.2 not yet shipped — flag, do not block)");
    }
  }
  if (issues === startIssues) console.log('  ✓ Service worker queues /api/visits/');
}

// ── 8. PageGuide banner copy refreshed for Phase N (N.6) ──────────
// Note: a dedicated 'deck-viewer' PAGE_GUIDES entry was DROPPED late in N.6
// because the public deck viewer is intentionally chrome-free (no banner).
// Instead, the existing 'new-visit' banner picked up Phase N copy ("Start
// Presentation", offline-friendly), and 'communication-log' picked up the
// "Generate Deck Link" copy. Look for the marker phrases as proof.
console.log('\n8. PageGuide refreshed copy (Phase N.6)');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'src', 'components', 'common', 'PageGuide.jsx'));
  if (!file) {
    warn('PAGEGUIDE', 'frontend/src/components/common/PageGuide.jsx not found');
  } else {
    if (!/Start Presentation/.test(file)) {
      warn('PAGEGUIDE', "'new-visit' banner missing Phase N 'Start Presentation' copy (Phase N.6)");
    }
    if (!/Generate Deck Link/.test(file)) {
      warn('PAGEGUIDE', "'communication-log' banner missing Phase N 'Generate Deck Link' copy (Phase N.6)");
    }
    // Phase N.8 — banner must reflect the new "rejected on sync" UX so BDMs
    // know to look at the Sync Errors tray when a server-rejected replay
    // surfaces.
    if (!/Phase N\.8|rejected on sync|Sync Errors tray/i.test(file)) {
      warn('PAGEGUIDE', "'new-visit' banner missing Phase N.8 'rejected on sync' / 'Sync Errors tray' copy");
    }
  }
  if (issues === startIssues) console.log('  ✓ PageGuide Phase N copy wired');
}

// ── 9. Phase N.8 — Service worker broadcasts VIP_VISIT_DRAFT_LOST on 4xx ──
// Without this, server-rejected replays (Phase O 422 SCREENSHOT_DETECTED, 400
// VISIT_PHOTO_TOO_OLD, etc.) silently delete the draft photos with no UI
// feedback. The fix is in the SW replay loop: capture the server's structured
// {code, message} and broadcast it before deleting.
console.log('\n9. Phase N.8 — SW broadcasts VIP_VISIT_DRAFT_LOST on 4xx replay');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'public', 'sw.js'));
  if (!file) {
    warn('SW_N8', 'frontend/public/sw.js not found');
  } else {
    // Cache version must be bumped to force production clients to drop old SW
    if (!/CACHE_VERSION\s*=\s*['"]v4['"]/.test(file)) {
      warn('SW_N8', "CACHE_VERSION not bumped to 'v4' — production clients will keep running pre-N.8 SW");
    }
    // 4xx broadcast block must exist and reach the listener pool
    if (!/Phase N\.8 — Generic 4xx/.test(file)) {
      warn('SW_N8', "Phase N.8 generic-4xx broadcast block missing — server-rejected replays still silent");
    }
    if (!/type:\s*['"]VIP_VISIT_DRAFT_LOST['"]/.test(file)) {
      warn('SW_N8', "VIP_VISIT_DRAFT_LOST type emission missing in SW");
    }
    // Carries server `code` and `status` through to the listener payload
    if (!/code:\s*errCode/.test(file) || !/status:\s*response\.status/.test(file)) {
      warn('SW_N8', "VIP_VISIT_DRAFT_LOST payload missing structured `code` + `status` fields");
    }
    // E11000 dedup branch must STILL be silent (no broadcast — that path is
    // a successful idempotent dedup, not a draft-lost event).
    if (!/already been logged this week|duplicate key|e11000/.test(file)) {
      warn('SW_N8', "E11000 idempotent-dedup branch missing — duplicate offline replays will surface as draft-lost noise");
    }
  }
  if (issues === startIssues) console.log('  ✓ Phase N.8 SW broadcast wired');
}

// ── 10. Phase N.8 — SW refuses to fake-200 multipart-mid-flight failures ──
// Without this, an online multipart POST that throws mid-flight gets queued
// with a stale text() body (no Blob bytes) and replays as a server 4xx →
// silent draft loss. The fix returns a real 503 OFFLINE_REPLAY_UNAVAILABLE
// instead, so VisitLogger's catch block fires and the local draft survives.
console.log('\n10. Phase N.8 — SW refuses fake-200 on multipart-mid-flight failure');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'public', 'sw.js'));
  if (!file) {
    warn('SW_N8_503', 'frontend/public/sw.js not found');
  } else {
    if (!/OFFLINE_REPLAY_UNAVAILABLE/.test(file)) {
      warn('SW_N8_503', "OFFLINE_REPLAY_UNAVAILABLE error code missing — multipart-mid-flight fake-200 hole still open");
    }
    if (!/status:\s*503/.test(file)) {
      warn('SW_N8_503', "503 response shape missing for mid-flight multipart refusal");
    }
  }
  // VisitLogger must surface the OFFLINE_REPLAY_UNAVAILABLE code to the BDM
  // — otherwise they get a generic "Failed to log visit" toast and don't
  // know that retrying is the right action.
  const vl = readSafe(path.join(FRONTEND, 'src', 'components', 'employee', 'VisitLogger.jsx'));
  if (!vl) {
    warn('SW_N8_503', 'frontend/src/components/employee/VisitLogger.jsx not found');
  } else if (!/OFFLINE_REPLAY_UNAVAILABLE/.test(vl)) {
    warn('SW_N8_503', "VisitLogger does not handle OFFLINE_REPLAY_UNAVAILABLE — BDM gets generic toast");
  }
  if (issues === startIssues) console.log('  ✓ Phase N.8 fake-200 refusal wired');
}

// ── 11. Phase N.8 — listener + tray surface the structured code/status ──
console.log('\n11. Phase N.8 — listener + tray carry structured code through');
console.log('─'.repeat(50));
{
  const startIssues = issues;
  const om = readSafe(path.join(FRONTEND, 'src', 'utils', 'offlineManager.js'));
  if (!om) {
    warn('LISTENER', 'frontend/src/utils/offlineManager.js not found');
  } else if (!/code:\s*data\.code/.test(om) || !/status:\s*typeof data\.status === 'number'/.test(om)) {
    warn('LISTENER', "offlineManager.handleSWMessage doesn't surface code/status to onVisitDraftLost subscribers");
  }
  const hook = readSafe(path.join(FRONTEND, 'src', 'hooks', 'useOfflineSyncListener.js'));
  if (!hook) {
    warn('LISTENER', 'useOfflineSyncListener hook not found');
  } else if (!/isServerRejection/.test(hook) || !/Offline visit rejected on sync/.test(hook)) {
    warn('LISTENER', "useOfflineSyncListener doesn't differentiate photo-loss from server-rejection toast");
  }
  if (issues === startIssues) console.log('  ✓ Phase N.8 listener + toast differentiation wired');
}

console.log('\n' + '═'.repeat(50));
if (issues > 0) {
  console.log(`✗ ${issues} issue(s) found. Phase N wiring is incomplete.`);
  process.exit(1);
} else {
  console.log('✓ Phase N wiring intact end-to-end.');
  process.exit(0);
}
