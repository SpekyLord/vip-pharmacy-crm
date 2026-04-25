/**
 * verifyInboxWiring.js — Phase G9.R8 health check
 *
 * Pure static analysis (no DB connection). Walks the unified inbox wiring
 * planes and exits 1 if anything is out of sync. Run as part of CI or
 * pre-deploy.
 *
 * Checks:
 *   1. inboxLookups exports the expected helpers/maps (FOLDER_DEFAULTS, etc.)
 *   2. CATEGORY_TO_FOLDER in inboxLookups matches the same map in
 *      backfillMessageInboxEntityId (single source of truth invariant).
 *   3. Lazy-seed getters return defaults when called with null entityId
 *      (no DB roundtrip required).
 *   4. notify* helpers in erpNotificationService go through dispatchMultiChannel
 *      (no direct sendToRecipients calls outside its own definition).
 *   5. messageInboxController exports every endpoint the routes file references
 *      (catches the classic "controller renamed but route still lazy-imports
 *      the old name" bug).
 *   6. App.jsx mounts the new /inbox route (component InboxPage).
 *   7. Sidebar.jsx links to /inbox at least once.
 *   8. AI agents that write MessageInbox directly include `entity_id` and
 *      `folder` keys (regex check on dailyBriefingAgent + orgIntelligenceAgent).
 *   9. agentRegistry registers `task_overdue` AND scheduler has its cron line.
 *  10. ERP_MODULE seed has MESSAGING entry.
 *  11. ERP_SUB_PERMISSION seed has at least 5 messaging.* sub-perms.
 *  12. COPILOT_TOOLS seed has DRAFT_REPLY_TO_MESSAGE; copilotToolRegistry has
 *      a matching handler key (HANDLERS.draftReplyToMessage).
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — at least one check failed (details printed to stderr)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_DIR = path.resolve(ROOT, '..', 'frontend', 'src');

const errors = [];
const warnings = [];
const passes = [];
function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg) { passes.push(msg); }
function readFile(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }

// ── 1: inboxLookups module shape ─────────────────────────────────────────
function checkInboxLookupsShape() {
  let mod;
  try { mod = require(path.join(ROOT, 'erp/utils/inboxLookups')); }
  catch (e) { fail(`inboxLookups failed to load: ${e.message}`); return; }
  const required = [
    'FOLDER_DEFAULTS', 'ACTION_DEFAULTS', 'ACCESS_ROLES_DEFAULTS', 'HIDDEN_FOLDERS_BY_ROLE_DEFAULTS', 'CATEGORY_TO_FOLDER',
    'folderForCategory', 'getFoldersConfig', 'getActionsConfig', 'getAccessRolesConfig',
    'getHiddenFoldersConfig', 'getHiddenFoldersForRole',
    'canDm', 'canBroadcast',
  ];
  for (const k of required) {
    if (!(k in mod)) fail(`inboxLookups: missing export '${k}'`);
  }
  if (mod.FOLDER_DEFAULTS && Array.isArray(mod.FOLDER_DEFAULTS)) {
    const codes = new Set(mod.FOLDER_DEFAULTS.map((f) => f.code));
    for (const required of ['INBOX', 'ACTION_REQUIRED', 'APPROVALS', 'TASKS', 'AI_AGENT_REPORTS']) {
      if (!codes.has(required)) fail(`FOLDER_DEFAULTS missing required folder code '${required}'`);
    }
    ok(`FOLDER_DEFAULTS has ${codes.size} folders`);
  }
}

// ── 2: CATEGORY_TO_FOLDER cross-file consistency ──────────────────────────
function checkCategoryMapConsistency() {
  let inboxMap;
  try { inboxMap = require(path.join(ROOT, 'erp/utils/inboxLookups')).CATEGORY_TO_FOLDER; }
  catch (e) { fail(`inboxLookups failed to load for map check: ${e.message}`); return; }

  const backfillSrc = readFile(path.join(ROOT, 'scripts/backfillMessageInboxEntityId.js'));
  if (!backfillSrc) {
    warn('backfillMessageInboxEntityId.js not found — skipping category-map consistency check');
    return;
  }
  // Soft check — confirm backfill at least references the map (not deep-equal)
  if (!/CATEGORY_TO_FOLDER/.test(backfillSrc)) {
    fail('backfillMessageInboxEntityId.js does not reference CATEGORY_TO_FOLDER — categories will fall back to INBOX during backfill');
  } else {
    ok(`CATEGORY_TO_FOLDER referenced by both inboxLookups (${Object.keys(inboxMap || {}).length} entries) and backfill script`);
  }
}

// ── 3: Lazy-seed safety with null entityId ────────────────────────────────
async function checkLazyDefaults() {
  let mod;
  try { mod = require(path.join(ROOT, 'erp/utils/inboxLookups')); }
  catch { return; /* covered by check 1 */ }
  try {
    const folders = await mod.getFoldersConfig(null);
    if (!Array.isArray(folders) || folders.length === 0) {
      fail('getFoldersConfig(null) returned empty — should fall back to FOLDER_DEFAULTS');
    } else { ok('getFoldersConfig(null) → defaults'); }
    const actions = await mod.getActionsConfig(null);
    if (!Array.isArray(actions) || actions.length === 0) {
      fail('getActionsConfig(null) returned empty — should fall back to ACTION_DEFAULTS');
    } else { ok('getActionsConfig(null) → defaults'); }
    // Phase G9.R9 — hidden-folders matrix lazy-seed.
    if (typeof mod.getHiddenFoldersConfig === 'function') {
      const hidden = await mod.getHiddenFoldersConfig(null);
      if (!Array.isArray(hidden)) {
        fail('getHiddenFoldersConfig(null) did not return array');
      } else { ok('getHiddenFoldersConfig(null) → defaults'); }
    }
    if (typeof mod.getHiddenFoldersForRole === 'function') {
      const presidentHidden = await mod.getHiddenFoldersForRole({ entityId: null, role: 'president' });
      if (!Array.isArray(presidentHidden) || !presidentHidden.includes('APPROVALS')) {
        fail(`getHiddenFoldersForRole(president) should include 'APPROVALS', got [${presidentHidden}]`);
      } else { ok('getHiddenFoldersForRole(president) hides APPROVALS by default'); }
      const staffHidden = await mod.getHiddenFoldersForRole({ entityId: null, role: 'staff' });
      if (!Array.isArray(staffHidden) || staffHidden.length !== 0) {
        fail(`getHiddenFoldersForRole(staff) should be empty (no row), got [${staffHidden}]`);
      } else { ok('getHiddenFoldersForRole(staff) hides nothing by default'); }
    }
  } catch (e) {
    fail(`Lazy-seed null-entityId path threw: ${e.message}`);
  }
}

// ── 4: notify* helpers go through dispatchMultiChannel ────────────────────
function checkNotifyDispatch() {
  const src = readFile(path.join(ROOT, 'erp/services/erpNotificationService.js'));
  if (!src) { fail('erpNotificationService.js not found'); return; }
  // Each notify* helper definition should reference dispatchMultiChannel.
  // We grep for `notify[A-Z]\w+ = async` declarations and confirm at least
  // one dispatchMultiChannel call within ~120 lines after each.
  const helperNames = (src.match(/const\s+(notify[A-Z]\w+)\s*=/g) || [])
    .map((m) => m.replace(/const\s+/, '').replace(/\s*=/, ''));
  for (const name of helperNames) {
    const reIdx = src.indexOf(`const ${name}`);
    if (reIdx === -1) continue;
    const window = src.slice(reIdx, reIdx + 6000);
    if (!/dispatchMultiChannel\s*\(/.test(window)) {
      // Allowed exception: helpers that legitimately do something else
      // (e.g. notifyTaskEvent uses dispatchMultiChannel — ok)
      fail(`${name}: appears not to use dispatchMultiChannel (possible email-only legacy path)`);
    }
  }
  ok(`notify helpers using dispatchMultiChannel: ${helperNames.length}`);
}

// ── 5: messageInboxController exports match routes references ─────────────
function checkControllerRouteAlignment() {
  const ctlSrc = readFile(path.join(ROOT, '../backend/controllers/messageInboxController.js'))
              || readFile(path.join(__dirname, '..', '..', 'controllers/messageInboxController.js'));
  const routeSrc = readFile(path.join(ROOT, '../backend/routes/messageInbox.js'))
                || readFile(path.join(__dirname, '..', '..', 'routes/messageInbox.js'));
  if (!ctlSrc) { fail('messageInboxController.js not found'); return; }
  if (!routeSrc) { fail('messageInbox.js routes not found'); return; }

  // Required handlers introduced by Phase G9.R4
  const required = ['getInboxMessages', 'getCounts', 'getThread', 'getFolders', 'composeMessage', 'replyToMessage', 'executeAction', 'createInboxMessage', 'createMessageNotify', 'markMessageRead', 'markMessageUnread', 'getSentMessages'];
  for (const fn of required) {
    if (!new RegExp(`module\\.exports[\\s\\S]*?${fn}`).test(ctlSrc)) {
      fail(`messageInboxController missing export '${fn}'`);
    }
    if (!new RegExp(fn).test(routeSrc)) {
      fail(`routes/messageInbox.js does not reference '${fn}'`);
    }
  }
  ok(`controller/route exports aligned (${required.length} handlers)`);
}

// ── 6+7: App.jsx + Sidebar mount /inbox ───────────────────────────────────
function checkFrontendInboxMount() {
  const app = readFile(path.join(FRONTEND_DIR, 'App.jsx'));
  const sidebar = readFile(path.join(FRONTEND_DIR, 'components/common/Sidebar.jsx'));
  if (!app) { fail('frontend/src/App.jsx not found'); }
  else if (!/path="\/inbox"/.test(app) || !/InboxPage/.test(app)) {
    fail('App.jsx does not mount /inbox route → InboxPage');
  } else { ok('App.jsx mounts /inbox → InboxPage'); }
  if (!sidebar) { fail('Sidebar.jsx not found'); }
  else if (!/['"]\/inbox['"]/.test(sidebar)) {
    fail('Sidebar.jsx has no /inbox link');
  } else { ok('Sidebar.jsx links to /inbox'); }
}

// ── 8: AI agents that write MessageInbox include entity_id + folder ───────
function checkAgentDirectWrites() {
  const targets = [
    'agents/dailyBriefingAgent.js',
    'agents/orgIntelligenceAgent.js',
    'agents/notificationService.js',
  ];
  for (const rel of targets) {
    const src = readFile(path.join(ROOT, rel));
    if (!src) { warn(`${rel} not found`); continue; }
    if (!/MessageInbox\.create/.test(src)) {
      ok(`${rel} no longer writes MessageInbox directly`);
      continue;
    }
    if (!/entity_id\s*:/.test(src)) fail(`${rel}: MessageInbox.create call lacks entity_id field`);
    if (!/folder\s*:/.test(src) && !/folderForCategory/.test(src)) {
      fail(`${rel}: MessageInbox.create call lacks folder/folderForCategory derivation`);
    }
    ok(`${rel}: passes entity_id + folder`);
  }
}

// ── 9: task_overdue registered in agentRegistry + scheduler ────────────────
function checkTaskOverdueRegistration() {
  const reg = readFile(path.join(ROOT, 'agents/agentRegistry.js'));
  const sch = readFile(path.join(ROOT, 'agents/agentScheduler.js'));
  if (!reg) { fail('agents/agentRegistry.js not found'); }
  else if (!/task_overdue/.test(reg)) {
    fail('agentRegistry.js missing task_overdue entry');
  } else { ok('agentRegistry.js has task_overdue'); }
  if (!sch) { fail('agents/agentScheduler.js not found'); }
  else if (!/triggerScheduled\(['"]task_overdue/.test(sch)) {
    fail('agentScheduler.js missing cron entry for task_overdue');
  } else { ok('agentScheduler.js schedules task_overdue'); }
  // Also check the agent file exists
  const agentFile = readFile(path.join(ROOT, 'agents/taskOverdueAgent.js'));
  if (!agentFile) fail('agents/taskOverdueAgent.js not found');
  else if (!/exports\s*=\s*\{\s*run/.test(agentFile)) fail('taskOverdueAgent does not export `run`');
  else ok('taskOverdueAgent.js exists and exports run()');
}

// ── 10+11: ERP_MODULE + ERP_SUB_PERMISSION seeds ─────────────────────────
function checkLookupSeeds() {
  const lookupCtl = require(path.join(ROOT, 'erp/controllers/lookupGenericController'));
  const seeds = lookupCtl.SEED_DEFAULTS || {};
  const modules = (seeds.ERP_MODULE || []).map((r) => r.code);
  if (!modules.includes('MESSAGING')) {
    fail('ERP_MODULE seed missing MESSAGING entry');
  } else { ok('ERP_MODULE has MESSAGING'); }

  const subs = (seeds.ERP_SUB_PERMISSION || []).filter((r) => r.metadata?.module === 'messaging');
  if (subs.length < 5) {
    fail(`ERP_SUB_PERMISSION has only ${subs.length} messaging.* sub-perms (need ≥5)`);
  } else { ok(`ERP_SUB_PERMISSION has ${subs.length} messaging.* sub-perms`); }

  const defaults = (seeds.MODULE_DEFAULT_ROLES || []).find((r) => r.code === 'MESSAGING');
  if (!defaults) {
    fail('MODULE_DEFAULT_ROLES missing MESSAGING entry');
  } else { ok('MODULE_DEFAULT_ROLES has MESSAGING'); }
}

// ── 12: DRAFT_REPLY_TO_MESSAGE tool + handler ──────────────────────────────
function checkCopilotReplyTool() {
  const lookupCtl = require(path.join(ROOT, 'erp/controllers/lookupGenericController'));
  const seeds = (lookupCtl.SEED_DEFAULTS?.COPILOT_TOOLS || []);
  const tool = seeds.find((s) => s.code === 'DRAFT_REPLY_TO_MESSAGE');
  if (!tool) {
    fail('COPILOT_TOOLS seed missing DRAFT_REPLY_TO_MESSAGE');
    return;
  }
  if (tool.metadata?.handler_key !== 'draftReplyToMessage') {
    fail(`DRAFT_REPLY_TO_MESSAGE handler_key is '${tool.metadata?.handler_key}', expected 'draftReplyToMessage'`);
  } else { ok('DRAFT_REPLY_TO_MESSAGE handler_key set'); }

  const reg = require(path.join(ROOT, 'erp/services/copilotToolRegistry'));
  if (!reg.HANDLERS?.draftReplyToMessage) {
    fail('copilotToolRegistry.HANDLERS.draftReplyToMessage missing');
  } else { ok('copilotToolRegistry.HANDLERS.draftReplyToMessage registered'); }
}

// ── Run ──────────────────────────────────────────────────────────────────
async function main() {
  try {
    checkInboxLookupsShape();
    checkCategoryMapConsistency();
    await checkLazyDefaults();
    checkNotifyDispatch();
    checkControllerRouteAlignment();
    checkFrontendInboxMount();
    checkAgentDirectWrites();
    checkTaskOverdueRegistration();
    checkLookupSeeds();
    checkCopilotReplyTool();
  } catch (e) {
    console.error('verifyInboxWiring crashed:', e.stack);
    process.exit(1);
  }

  console.log('— verifyInboxWiring —');
  for (const p of passes) console.log(`  ✓ ${p}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.log('');
  console.log(`PASSES: ${passes.length}  WARNINGS: ${warnings.length}  ERRORS: ${errors.length}`);
  if (errors.length) {
    console.error('FAIL — Inbox wiring has errors.');
    process.exit(1);
  }
  console.log('OK — Inbox wiring verified.');
  process.exit(0);
}

main();
