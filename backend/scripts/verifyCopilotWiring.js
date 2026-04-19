/**
 * verifyCopilotWiring.js — Phase G7.5 health check
 *
 * Pure static analysis (no DB connection). Walks the Copilot wiring planes and
 * exits 1 if anything is out of sync. Run as part of CI or pre-deploy.
 *
 *   1. Every COPILOT_TOOLS seed code has a registered handler in
 *      copilotToolRegistry.HANDLERS.
 *   2. Every registered handler in copilotToolRegistry.HANDLERS is referenced
 *      by exactly one COPILOT_TOOLS seed (no orphan handlers).
 *   3. PRESIDENT_COPILOT row in AI_COWORK_FEATURES seed has system_prompt + model.
 *   4. AI_SPEND_CAPS seed has a MONTHLY row with monthly_budget_usd > 0 and a
 *      valid action_when_reached.
 *   5. copilotService imports spendCapService.checkSpendCap (i.e., spend cap is
 *      actually enforced before the Claude call — Rule #3 + G7.8).
 *   6. approvalAiService imports spendCapService.checkSpendCap (same).
 *   7. ErpAuditLog enum includes 'COPILOT_TOOL_CALL', 'AI_BUDGET_CHANGE',
 *      'AI_COWORK_CONFIG_CHANGE' (so audit writes don't silently fail).
 *   8. erp/routes/index.js mounts '/copilot' and '/ai-cowork'.
 *   9. App.jsx mounts the PresidentCopilot component (ERP shell coverage).
 *  10. write_confirm tool handlers (draftRejectionReason, draftMessage) call
 *      existing controllers/models — never bypass gateApproval/period locks.
 *      We grep for one signature: `require('../controllers/universalApprovalController')`
 *      from copilotToolRegistry.js (proves DRAFT_REJECTION_REASON routes through
 *      the canonical reject path).
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

// Capture errors then report at the end so the operator sees the full picture.
const errors = [];
const warnings = [];
const passes = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg)   { passes.push(msg); }

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); }
  catch (e) { return null; }
}

// ── 1+2: COPILOT_TOOLS ↔ copilotToolRegistry handlers ────────────────────
function checkToolsRegistry() {
  const lookupCtl = require(path.join(ROOT, 'erp/controllers/lookupGenericController'));
  const registry = require(path.join(ROOT, 'erp/services/copilotToolRegistry'));
  const seeds = lookupCtl.SEED_DEFAULTS?.COPILOT_TOOLS || [];
  if (!seeds.length) {
    fail('SEED_DEFAULTS.COPILOT_TOOLS is empty — Copilot has no tools to expose to Claude.');
    return;
  }
  const handlerKeys = new Set(Object.keys(registry.HANDLERS || {}));
  const seedHandlerKeys = new Set();

  for (const seed of seeds) {
    const hk = seed.metadata?.handler_key;
    if (!hk) {
      fail(`COPILOT_TOOLS/${seed.code}: missing metadata.handler_key`);
      continue;
    }
    seedHandlerKeys.add(hk);
    if (!handlerKeys.has(hk)) {
      fail(`COPILOT_TOOLS/${seed.code}: handler_key '${hk}' not registered in copilotToolRegistry.HANDLERS`);
    } else {
      ok(`tool ${seed.code} → handler ${hk}`);
    }
    if (!seed.metadata?.json_schema?.name) {
      warn(`COPILOT_TOOLS/${seed.code}: metadata.json_schema.name is missing — Claude won't be able to call it`);
    }
    if (!Array.isArray(seed.metadata?.allowed_roles)) {
      warn(`COPILOT_TOOLS/${seed.code}: metadata.allowed_roles is not an array (open to all)`);
    }
    if (!['read', 'write_confirm'].includes(seed.metadata?.tool_type)) {
      fail(`COPILOT_TOOLS/${seed.code}: metadata.tool_type must be 'read' or 'write_confirm'`);
    }
  }

  for (const hk of handlerKeys) {
    if (!seedHandlerKeys.has(hk)) {
      fail(`copilotToolRegistry handler '${hk}' has no matching COPILOT_TOOLS seed (orphan handler)`);
    }
  }
}

// ── 3: PRESIDENT_COPILOT seed shape ──────────────────────────────────────
function checkPresidentCopilotRow() {
  const lookupCtl = require(path.join(ROOT, 'erp/controllers/lookupGenericController'));
  const seeds = lookupCtl.SEED_DEFAULTS?.AI_COWORK_FEATURES || [];
  const row = seeds.find((s) => s.code === 'PRESIDENT_COPILOT');
  if (!row) {
    fail('AI_COWORK_FEATURES seed missing PRESIDENT_COPILOT row');
    return;
  }
  if (!row.metadata?.system_prompt || row.metadata.system_prompt.length < 50) {
    fail('PRESIDENT_COPILOT.metadata.system_prompt is missing or too short');
  } else { ok('PRESIDENT_COPILOT system_prompt set'); }
  if (!row.metadata?.model) {
    fail('PRESIDENT_COPILOT.metadata.model is missing');
  } else { ok(`PRESIDENT_COPILOT model: ${row.metadata.model}`); }
  if (!Array.isArray(row.metadata?.allowed_roles) || row.metadata.allowed_roles.length === 0) {
    warn('PRESIDENT_COPILOT.metadata.allowed_roles is empty — widget will show for ALL users');
  }
  if (!row.metadata?.quick_mode_prompt) {
    warn('PRESIDENT_COPILOT.metadata.quick_mode_prompt is empty — Cmd+K will lack focused guidance');
  }
}

// ── 4: AI_SPEND_CAPS MONTHLY row shape ────────────────────────────────────
function checkSpendCapRow() {
  const lookupCtl = require(path.join(ROOT, 'erp/controllers/lookupGenericController'));
  const seeds = lookupCtl.SEED_DEFAULTS?.AI_SPEND_CAPS || [];
  const row = seeds.find((s) => s.code === 'MONTHLY');
  if (!row) {
    fail('AI_SPEND_CAPS seed missing MONTHLY row');
    return;
  }
  const md = row.metadata || {};
  if (!(Number(md.monthly_budget_usd) > 0)) {
    fail('AI_SPEND_CAPS/MONTHLY.metadata.monthly_budget_usd must be > 0');
  } else { ok(`spend cap default: $${md.monthly_budget_usd}/mo`); }
  if (!['disable', 'warn_only'].includes(md.action_when_reached)) {
    fail(`AI_SPEND_CAPS/MONTHLY.metadata.action_when_reached must be 'disable' or 'warn_only'`);
  }
}

// ── 5+6: Spend cap actually wired into the AI services ───────────────────
function checkSpendCapWiring() {
  const copilotSvc = readFile(path.join(ROOT, 'erp/services/copilotService.js'));
  const coworkSvc  = readFile(path.join(ROOT, 'erp/services/approvalAiService.js'));
  if (!copilotSvc) { fail('erp/services/copilotService.js not found'); return; }
  if (!coworkSvc)  { fail('erp/services/approvalAiService.js not found'); return; }
  if (!/require\(['"]\.\/spendCapService['"]\)/.test(copilotSvc)) {
    fail('copilotService does not import spendCapService — spend cap not enforced for Copilot');
  } else { ok('copilotService imports spendCapService'); }
  if (!/require\(['"]\.\/spendCapService['"]\)/.test(coworkSvc)) {
    fail('approvalAiService does not import spendCapService — spend cap not enforced for AI Cowork');
  } else { ok('approvalAiService imports spendCapService'); }
  // copilot must also call enforceSpendCap or checkSpendCap inside runChat
  if (!/(enforceSpendCap|checkSpendCap)\s*\(/.test(copilotSvc)) {
    fail('copilotService imports spendCapService but does not call its functions');
  }
}

// ── 7: ErpAuditLog enum extended ─────────────────────────────────────────
function checkAuditEnum() {
  const src = readFile(path.join(ROOT, 'erp/models/ErpAuditLog.js'));
  if (!src) { fail('erp/models/ErpAuditLog.js not found'); return; }
  for (const lt of ['COPILOT_TOOL_CALL', 'AI_BUDGET_CHANGE', 'AI_COWORK_CONFIG_CHANGE']) {
    if (!new RegExp(`'${lt}'`).test(src)) {
      fail(`ErpAuditLog.log_type enum is missing '${lt}' — audit writes will fail silently`);
    } else { ok(`ErpAuditLog enum has ${lt}`); }
  }
}

// ── 8: Routes mounted ────────────────────────────────────────────────────
function checkRoutesMount() {
  const idx = readFile(path.join(ROOT, 'erp/routes/index.js'));
  if (!idx) { fail('erp/routes/index.js not found'); return; }
  if (!/router\.use\(['"]\/copilot['"]/.test(idx)) {
    fail('erp/routes/index.js does not mount /copilot');
  } else { ok('routes/index.js mounts /copilot'); }
  if (!/router\.use\(['"]\/ai-cowork['"]/.test(idx)) {
    fail('erp/routes/index.js does not mount /ai-cowork');
  } else { ok('routes/index.js mounts /ai-cowork'); }
}

// ── 9: App.jsx mounts PresidentCopilot ───────────────────────────────────
function checkAppShellMount() {
  const app = readFile(path.join(FRONTEND_DIR, 'App.jsx'));
  if (!app) { fail('frontend/src/App.jsx not found'); return; }
  if (!/PresidentCopilot/.test(app)) {
    fail('App.jsx does not reference PresidentCopilot — widget never renders');
  } else { ok('App.jsx mounts PresidentCopilot'); }
  if (!/CommandPalette/.test(app)) {
    warn('App.jsx does not reference CommandPalette — Cmd+K palette disabled');
  } else { ok('App.jsx mounts CommandPalette'); }
}

// ── 10: write_confirm execute path goes through canonical controller ─────
function checkWriteConfirmRouting() {
  const reg = readFile(path.join(ROOT, 'erp/services/copilotToolRegistry.js'));
  if (!reg) { fail('copilotToolRegistry.js not found'); return; }
  // DRAFT_REJECTION_REASON execute path must call the existing approvalHandlers map
  if (!/require\(['"]\.\.\/controllers\/universalApprovalController['"]\)/.test(reg)) {
    fail('copilotToolRegistry does not import universalApprovalController — DRAFT_REJECTION_REASON would bypass Rule #20');
  } else { ok('DRAFT_REJECTION_REASON routes through universalApprovalController.approvalHandlers'); }
  // DRAFT_MESSAGE execute path must use MessageInbox model (not a custom write)
  if (!/require\(['"]\.\.\/\.\.\/models\/MessageInbox['"]\)/.test(reg)) {
    warn('copilotToolRegistry does not import MessageInbox — DRAFT_MESSAGE may not actually send');
  } else { ok('DRAFT_MESSAGE writes via MessageInbox model'); }
  // Defence in depth: the handler must NOT accept entity_id from args
  // (Rule #21). We grep for the anti-pattern.
  if (/args\.\s*entity_id/.test(reg)) {
    fail('copilotToolRegistry uses args.entity_id — handlers must derive entity from ctx.entityId (Rule #21)');
  }
}

// ── 11: Frontend service URL bug check (regression guard for the pre-G7 fix) ─
function checkFrontendServiceURL() {
  const cowork = readFile(path.join(FRONTEND_DIR, 'erp/services/aiCoworkService.js'));
  const copilot = readFile(path.join(FRONTEND_DIR, 'erp/services/copilotService.js'));
  for (const [name, src] of [['aiCoworkService.js', cowork], ['copilotService.js', copilot]]) {
    if (!src) continue;
    if (/['"]\/api\/erp\//.test(src)) {
      fail(`${name} uses '/api/erp/...' but axios baseURL is '/api' — paths will resolve to '/api/api/erp/...'`);
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────────
function main() {
  try {
    checkToolsRegistry();
    checkPresidentCopilotRow();
    checkSpendCapRow();
    checkSpendCapWiring();
    checkAuditEnum();
    checkRoutesMount();
    checkAppShellMount();
    checkWriteConfirmRouting();
    checkFrontendServiceURL();
  } catch (e) {
    console.error('verifyCopilotWiring crashed:', e.stack);
    process.exit(1);
  }

  console.log('— verifyCopilotWiring —');
  for (const p of passes) console.log(`  ✓ ${p}`);
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors)  console.error(`  ✗ ${e}`);

  console.log('');
  console.log(`PASSES: ${passes.length}  WARNINGS: ${warnings.length}  ERRORS: ${errors.length}`);

  if (errors.length) {
    console.error('FAIL — Copilot wiring has errors.');
    process.exit(1);
  }
  console.log('OK — Copilot wiring verified.');
  process.exit(0);
}

main();
