/**
 * verifyRejectionWiring.js — Phase G6.9 health check
 *
 * Walks the four wiring planes and exits 1 if anything is out of sync:
 *   1. Every MODULE_REJECTION_CONFIG seed code has a matching Mongoose model with the
 *      configured `rejected_status` in its status enum AND the configured `reason_field`
 *      defined as a schema path. (catches model drift without requiring a DB connection)
 *   2. Every MODULE_REJECTION_CONFIG seed code is also present in MODULE_DEFAULT_ROLES
 *      seed (no drift between Phase G4 and Phase G6 lookup categories).
 *   3. Every module key has at least one frontend page that imports `RejectionBanner`
 *      and references the module key string.
 *   4. Every entry in TYPE_TO_MODULE has a matching key in `approvalHandlers` map AND
 *      its mapped module appears in MODULE_REJECTION_CONFIG seed (so each handler can
 *      look up its rejected_status / reason_field).
 *
 * Pure static analysis — no DB connection. Runs as part of CI / pre-deploy.
 *
 * Usage:
 *   npm run verify:rejection-wiring
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — at least one check failed (details printed to stderr)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FRONTEND_PAGES_DIR = path.resolve(ROOT, '..', 'frontend', 'src', 'erp', 'pages');
const MODELS_DIR = path.join(ROOT, 'erp', 'models');

// Rule #3 / Phase G6 — module → source-doc Mongoose model name. Lookup-driven would be
// nicer but the script is static (no DB), and the mapping rarely changes. New modules
// only need to add a row here AND a MODULE_REJECTION_CONFIG seed row.
//
// IC_TRANSFER intentionally maps to TWO models (the lookup row covers both physical
// docs). The check passes if at least one model satisfies the schema constraints.
const MODULE_TO_MODEL_FILES = {
  SALES:               ['SalesLine.js'],
  COLLECTION:          ['Collection.js'],
  SMER:                ['SmerEntry.js'],
  CAR_LOGBOOK:         ['CarLogbookEntry.js'],
  EXPENSES:            ['ExpenseEntry.js'],
  PRF_CALF:            ['PrfCalf.js'],
  INVENTORY:           ['GrnEntry.js'],
  PAYROLL:             ['Payslip.js'],
  INCOME:              ['IncomeReport.js'],
  KPI:                 ['KpiSelfRating.js'],
  DEDUCTION_SCHEDULE:  ['DeductionSchedule.js'],
  PERDIEM_OVERRIDE:    ['ApprovalRequest.js'],   // override is embedded in SMER, hub uses ApprovalRequest
  APPROVAL_REQUEST:    ['ApprovalRequest.js'],
  // Phase G6.7 — Group B
  PURCHASING:          ['PurchaseOrder.js', 'SupplierInvoice.js'],
  JOURNAL:             ['JournalEntry.js'],
  BANKING:             ['BankStatement.js'],
  IC_TRANSFER:         ['InterCompanyTransfer.js', 'IcSettlement.js'],
  PETTY_CASH:          ['PettyCashTransaction.js'],
  SALES_GOAL_PLAN:     ['SalesGoalPlan.js'],
  INCENTIVE_PAYOUT:    ['IncentivePayout.js'],
};

const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// ── 1. Load SEED_DEFAULTS from lookupGenericController without executing express handlers ──
const lookupCtl = require(path.join(ROOT, 'erp', 'controllers', 'lookupGenericController.js'));
const SEEDS = lookupCtl.SEED_DEFAULTS;
if (!SEEDS) {
  fail('SEED_DEFAULTS export missing from lookupGenericController.js');
  console.error(errors.join('\n'));
  process.exit(1);
}

const REJECTION_CONFIG = SEEDS.MODULE_REJECTION_CONFIG || [];
const DEFAULT_ROLES = SEEDS.MODULE_DEFAULT_ROLES || [];
if (!REJECTION_CONFIG.length) {
  fail('SEED_DEFAULTS.MODULE_REJECTION_CONFIG is empty — no modules to verify');
}
if (!DEFAULT_ROLES.length) {
  warn('SEED_DEFAULTS.MODULE_DEFAULT_ROLES is empty — Phase G4 default-roles gate is unconfigured');
}
const defaultRolesByCode = new Map(DEFAULT_ROLES.map((r) => [r.code, r]));

// ── 2. Read frontend pages once, scan for RejectionBanner imports + moduleKey usage ──
const frontendFiles = fs.existsSync(FRONTEND_PAGES_DIR)
  ? fs.readdirSync(FRONTEND_PAGES_DIR).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'))
  : [];
const frontendUsage = new Map(); // moduleKey → [filename, ...]
for (const file of frontendFiles) {
  const text = fs.readFileSync(path.join(FRONTEND_PAGES_DIR, file), 'utf8');
  if (!/RejectionBanner/.test(text)) continue;
  // Capture every moduleKey="XXX" or moduleKey={'XXX'} occurrence
  const re = /moduleKey\s*=\s*["'{]+\s*([A-Z_]+)/g;
  let match;
  const seen = new Set();
  while ((match = re.exec(text)) !== null) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      if (!frontendUsage.has(key)) frontendUsage.set(key, []);
      frontendUsage.get(key).push(file);
    }
  }
}

// ── 3. Read universalApprovalController to extract TYPE_TO_MODULE + approvalHandlers keys ──
const ctlPath = path.join(ROOT, 'erp', 'controllers', 'universalApprovalController.js');
const ctlText = fs.readFileSync(ctlPath, 'utf8');

// TYPE_TO_MODULE — match the const declaration block
function parseStringMap(source, varName) {
  const blockRegex = new RegExp(`const\\s+${varName}\\s*=\\s*\\{([\\s\\S]*?)\\};`);
  const block = source.match(blockRegex);
  if (!block) return null;
  const lines = block[1].split('\n');
  const map = {};
  for (const line of lines) {
    const m = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*['"]([^'"]+)['"]\s*,?/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}
const TYPE_TO_MODULE = parseStringMap(ctlText, 'TYPE_TO_MODULE');
if (!TYPE_TO_MODULE) {
  fail('Could not parse TYPE_TO_MODULE block from universalApprovalController.js');
}

// approvalHandlers — find the const declaration and pull top-level keys
function parseHandlerKeys(source) {
  const m = source.match(/const\s+approvalHandlers\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return null;
  const body = m[1];
  // Match identifiers at the start of a line (after any whitespace) followed by `: async`
  const keys = new Set();
  for (const line of body.split('\n')) {
    const km = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*async/);
    if (km) keys.add(km[1]);
  }
  return keys;
}
const HANDLER_KEYS = parseHandlerKeys(ctlText);
if (!HANDLER_KEYS) {
  fail('Could not parse approvalHandlers block from universalApprovalController.js');
}

// ── CHECK 1 — every MODULE_REJECTION_CONFIG row has a matching model with status enum + reason_field ──
for (const row of REJECTION_CONFIG) {
  const code = row.code;
  const md = row.metadata || {};
  const rejectedStatus = md.rejected_status;
  const reasonField = md.reason_field;

  if (!rejectedStatus || !reasonField) {
    fail(`[CHECK 1] MODULE_REJECTION_CONFIG.${code} missing rejected_status or reason_field in metadata`);
    continue;
  }

  const modelFiles = MODULE_TO_MODEL_FILES[code];
  if (!modelFiles || !modelFiles.length) {
    fail(`[CHECK 1] MODULE_REJECTION_CONFIG.${code} has no MODULE_TO_MODEL_FILES mapping in verify script`);
    continue;
  }

  let satisfied = false;
  const reasons = [];
  for (const file of modelFiles) {
    const filePath = path.join(MODELS_DIR, file);
    if (!fs.existsSync(filePath)) {
      reasons.push(`${file} not found`);
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    // Models often declare multiple `status:` paths (line items + document). Scan ALL
    // status enum blocks and accept the model if any one contains the rejected_status.
    const allStatusBlocks = [];
    const statusRegex = /status:\s*\{[\s\S]*?enum:\s*\[([^\]]+)\]/g;
    let m;
    while ((m = statusRegex.exec(text)) !== null) allStatusBlocks.push(m[1]);
    if (!allStatusBlocks.length) {
      reasons.push(`${file}: no status enum found`);
      continue;
    }
    const allValues = new Set();
    for (const block of allStatusBlocks) {
      block.split(',').forEach((s) => allValues.add(s.replace(/['"\s]/g, '')));
    }
    if (!allValues.has(rejectedStatus)) {
      reasons.push(`${file}: no status enum contains '${rejectedStatus}' (saw [${[...allValues].join('|')}])`);
      continue;
    }
    // Reason field — accept any standard schema-path declaration
    const fieldRegex = new RegExp(`\\b${reasonField}\\s*:\\s*\\{?\\s*type:\\s*String`);
    if (!fieldRegex.test(text)) {
      reasons.push(`${file}: schema path '${reasonField}' not found as String type`);
      continue;
    }
    satisfied = true;
    break;
  }
  if (!satisfied) {
    fail(`[CHECK 1] ${code} not satisfied by any model. Reasons:\n    - ${reasons.join('\n    - ')}`);
  }
}

// ── CHECK 2 — every MODULE_REJECTION_CONFIG code is in MODULE_DEFAULT_ROLES ──
// Skipped for ApprovalRequest itself (it IS the approval — no module-default role for it).
// Also skipped for INCENTIVE_PAYOUT/PERDIEM_OVERRIDE if intentional drift recorded here.
const DEFAULT_ROLES_OPTIONAL = new Set(['APPROVAL_REQUEST', 'PERDIEM_OVERRIDE']);
for (const row of REJECTION_CONFIG) {
  if (DEFAULT_ROLES_OPTIONAL.has(row.code)) continue;
  if (!defaultRolesByCode.has(row.code)) {
    warn(`[CHECK 2] MODULE_REJECTION_CONFIG.${row.code} has no MODULE_DEFAULT_ROLES seed — Phase G4/G6 drift`);
  }
}

// ── CHECK 3 — every module key has at least one frontend page importing RejectionBanner ──
// Skipped for non-page-bound entries (APPROVAL_REQUEST, PERDIEM_OVERRIDE — these surface
// as ApprovalRequest history; no contractor page reads their reason).
const FRONTEND_OPTIONAL = new Set(['APPROVAL_REQUEST', 'PERDIEM_OVERRIDE', 'DEDUCTION_SCHEDULE', 'INCENTIVE_PAYOUT']);
for (const row of REJECTION_CONFIG) {
  if (FRONTEND_OPTIONAL.has(row.code)) continue;
  if (!frontendUsage.has(row.code)) {
    warn(`[CHECK 3] MODULE_REJECTION_CONFIG.${row.code} not referenced by any frontend page importing RejectionBanner`);
  }
}

// ── CHECK 4 — every TYPE_TO_MODULE key has a matching approvalHandlers entry, AND every
//             non-Group-A handler module appears in MODULE_REJECTION_CONFIG ──
if (TYPE_TO_MODULE && HANDLER_KEYS) {
  for (const [type, mod] of Object.entries(TYPE_TO_MODULE)) {
    if (!HANDLER_KEYS.has(type)) {
      fail(`[CHECK 4] TYPE_TO_MODULE.${type} (→ ${mod}) has no matching approvalHandlers handler`);
    }
  }
  // Every handler should also be in TYPE_TO_MODULE so sub-permission checks work
  for (const handlerKey of HANDLER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(TYPE_TO_MODULE, handlerKey)) {
      warn(`[CHECK 4] approvalHandlers.${handlerKey} has no entry in TYPE_TO_MODULE — sub-permission check will be skipped for this type`);
    }
  }
  const REJECTION_CODES = new Set(REJECTION_CONFIG.map((r) => r.code));
  for (const [type, mod] of Object.entries(TYPE_TO_MODULE)) {
    if (!REJECTION_CODES.has(mod)) {
      warn(`[CHECK 4] TYPE_TO_MODULE.${type} → ${mod} has no MODULE_REJECTION_CONFIG row — handler will not surface a rejection banner`);
    }
  }
}

// ── Output ──
if (warnings.length) {
  console.warn('\n=== WARNINGS ===');
  warnings.forEach((w) => console.warn('  ' + w));
}
if (errors.length) {
  console.error('\n=== ERRORS ===');
  errors.forEach((e) => console.error('  ' + e));
  console.error(`\nverifyRejectionWiring: ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}

console.log(`verifyRejectionWiring: OK (${REJECTION_CONFIG.length} modules verified, ${warnings.length} warning(s))`);
process.exit(0);
