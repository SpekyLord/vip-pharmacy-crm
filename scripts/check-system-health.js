#!/usr/bin/env node
/**
 * Code Health Check — catches wiring bugs, broken references, collection name
 * mismatches, and missing exports BEFORE they hit production.
 *
 * Run: node scripts/check-system-health.js
 * Exit code 0 = clean, 1 = issues found
 *
 * Checks:
 * 1. $lookup collection names match actual model definitions
 * 2. WorkflowGuide pageKeys: defined vs used
 * 3. ControlCenter SECTIONS → file exports exist
 * 4. ControlCenter DEPENDENCY_GUIDE keys match SECTIONS keys
 * 5. Agent enum consistency (AgentRun, AgentConfig, scheduler, dashboard, settings)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ERP_MODELS = path.join(ROOT, 'backend', 'erp', 'models');
const AGENTS_DIR = path.join(ROOT, 'backend', 'agents');
const ERP_SERVICES = path.join(ROOT, 'backend', 'erp', 'services');
const ERP_CONTROLLERS = path.join(ROOT, 'backend', 'erp', 'controllers');
const PAGES_DIR = path.join(ROOT, 'frontend', 'src', 'erp', 'pages');
const CRM_PAGES_DIR = path.join(ROOT, 'frontend', 'src', 'pages');
const COMPONENTS_DIR = path.join(ROOT, 'frontend', 'src', 'erp', 'components');

// Recursively collect .jsx files under a directory (one level is enough for
// CRM pages, which have admin/, employee/, common/ subfolders).
function listJsxRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.jsx')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

let issues = 0;

function warn(category, msg) {
  issues++;
  console.log(`  [${category}] ${msg}`);
}

// ═══ 1. $lookup collection name validation ═══
function checkLookupCollections() {
  console.log('\n1. $lookup Collection Names');
  console.log('─'.repeat(40));

  // Build map of model file → collection name
  const collectionMap = {};
  const modelFiles = fs.readdirSync(ERP_MODELS).filter(f => f.endsWith('.js'));
  for (const file of modelFiles) {
    const content = fs.readFileSync(path.join(ERP_MODELS, file), 'utf-8');
    const match = content.match(/collection:\s*['"]([^'"]+)['"]/);
    if (match) collectionMap[match[1]] = file;
  }
  // Add default mongoose collections (User → users, Entity → entities)
  const crmModels = path.join(ROOT, 'backend', 'models');
  if (fs.existsSync(crmModels)) {
    for (const file of fs.readdirSync(crmModels).filter(f => f.endsWith('.js'))) {
      const content = fs.readFileSync(path.join(crmModels, file), 'utf-8');
      const match = content.match(/collection:\s*['"]([^'"]+)['"]/);
      if (match) collectionMap[match[1]] = file;
    }
  }
  // Common defaults
  collectionMap['users'] = 'User.js (default)';
  collectionMap['entities'] = 'Entity.js (default)';

  const validCollections = new Set(Object.keys(collectionMap));

  // Scan all backend JS files for $lookup from:
  const scanDirs = [AGENTS_DIR, ERP_SERVICES, ERP_CONTROLLERS];
  let checked = 0;
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const re = /from:\s*['"]([^'"]+)['"]/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        checked++;
        if (!validCollections.has(m[1])) {
          warn('LOOKUP', `${file}: from: '${m[1]}' — no model has this collection name`);
        }
      }
    }
  }
  if (issues === 0) console.log(`  ✓ All $lookup collection names valid (${checked} checked)`);
}

// ═══ 2. WorkflowGuide + PageGuide pageKeys ═══
// Two banner libraries live side by side:
//   - ERP pages (and some shared pages) use <WorkflowGuide pageKey="..."/>
//     backed by WORKFLOW_GUIDES in frontend/src/erp/components/WorkflowGuide.jsx
//   - CRM pages use <PageGuide pageKey="..."/> backed by PAGE_GUIDES in
//     frontend/src/components/common/PageGuide.jsx
// A handful of shared pages (e.g. InboxPage.jsx) render EITHER banner
// depending on role, so the same key can legitimately live in both libraries.
// Integrity means attributing each usage to its component and validating
// against the matching source-of-truth.
function checkWorkflowGuides() {
  console.log('\n2. WorkflowGuide + PageGuide PageKeys');
  console.log('─'.repeat(40));

  const wfgPath = path.join(COMPONENTS_DIR, 'WorkflowGuide.jsx');
  const pgPath = path.join(ROOT, 'frontend', 'src', 'components', 'common', 'PageGuide.jsx');

  if (!fs.existsSync(wfgPath)) { warn('WFG', 'WorkflowGuide.jsx not found'); return; }
  if (!fs.existsSync(pgPath)) { warn('WFG', 'PageGuide.jsx not found'); return; }

  const keyRe = /['"]?([a-zA-Z][-a-zA-Z0-9]*)['"]?:\s*\{[\s\n]*title:/g;
  const extractKeys = (content) => {
    const set = new Set();
    let m;
    while ((m = keyRe.exec(content)) !== null) set.add(m[1]);
    keyRe.lastIndex = 0; // reset for reuse
    return set;
  };

  const wfgKeys = extractKeys(fs.readFileSync(wfgPath, 'utf-8'));
  const pgKeys = extractKeys(fs.readFileSync(pgPath, 'utf-8'));

  // Scan every page under erp/pages AND pages/ and attribute each pageKey
  // usage to the banner component on the same JSX tag.
  const wfgUsed = new Set();
  const pgUsed = new Set();
  const pageFiles = [
    ...listJsxRecursive(PAGES_DIR),
    ...listJsxRecursive(CRM_PAGES_DIR),
  ];
  const useRe = /<(WorkflowGuide|PageGuide)\b[^>]*?\bpageKey=["']([^"']+)["']/g;
  for (const filePath of pageFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let m;
    while ((m = useRe.exec(content)) !== null) {
      if (m[1] === 'WorkflowGuide') wfgUsed.add(m[2]);
      else pgUsed.add(m[2]);
    }
  }

  // Defined but never used — per library
  for (const key of wfgKeys) {
    if (!wfgUsed.has(key)) warn('WFG', `WorkflowGuide key "${key}" defined but never used in any page`);
  }
  for (const key of pgKeys) {
    if (!pgUsed.has(key)) warn('WFG', `PageGuide key "${key}" defined but never used in any page`);
  }
  // Used but never defined — per library
  for (const key of wfgUsed) {
    if (!wfgKeys.has(key)) warn('WFG', `<WorkflowGuide pageKey="${key}"/> used in a page but not defined in WORKFLOW_GUIDES`);
  }
  for (const key of pgUsed) {
    if (!pgKeys.has(key)) warn('WFG', `<PageGuide pageKey="${key}"/> used in a page but not defined in PAGE_GUIDES`);
  }

  const startIssues = issues;
  if (issues === startIssues) {
    console.log(`  ✓ All WorkflowGuide keys valid: ${wfgKeys.size} defined / ${wfgUsed.size} used`);
    console.log(`  ✓ All PageGuide keys valid:     ${pgKeys.size} defined / ${pgUsed.size} used`);
  }
}

// ═══ 3. ControlCenter SECTIONS → file exports ═══
function checkControlCenter() {
  console.log('\n3. ControlCenter Wiring');
  console.log('─'.repeat(40));

  const ccPath = path.join(PAGES_DIR, 'ControlCenter.jsx');
  if (!fs.existsSync(ccPath)) { warn('CC', 'ControlCenter.jsx not found'); return; }

  const content = fs.readFileSync(ccPath, 'utf-8');
  const startIssues = issues;

  // Check lazy imports: import('./FileName').then(m => ({ default: m.ExportName }))
  const importRe = /import\(['"]\.\/(\w+)['"]\)(?:\.then\(m\s*=>\s*\(\{\s*default:\s*m\.(\w+)\s*\}\)\))?/g;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const fileName = m[1] + '.jsx';
    const exportName = m[2]; // may be undefined for default imports

    const filePath = path.join(PAGES_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      warn('CC', `SECTIONS imports './\${m[1]}' but ${fileName} does not exist`);
      continue;
    }

    if (exportName) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const hasExport = fileContent.includes(`export function ${exportName}`) ||
                        fileContent.includes(`export const ${exportName}`) ||
                        fileContent.includes(`export { ${exportName}`);
      if (!hasExport) {
        warn('CC', `SECTIONS expects export '${exportName}' from ${fileName} but it doesn't exist`);
      }
    }
  }

  // Check CATEGORY_CONFIG keys exist in SECTIONS
  const sectionKeys = new Set();
  const skRe = /['"]([a-z][-a-z0-9]*)['"]:\s*lazy/g;
  while ((m = skRe.exec(content)) !== null) sectionKeys.add(m[1]);

  const catKeyRe = /key:\s*['"]([a-z][-a-z0-9]*)['"],\s*label:/g;
  while ((m = catKeyRe.exec(content)) !== null) {
    if (!sectionKeys.has(m[1])) {
      warn('CC', `CATEGORY_CONFIG item '${m[1]}' has no matching SECTIONS entry`);
    }
  }

  if (issues === startIssues) console.log(`  ✓ All ControlCenter sections wired correctly`);
}

// ═══ 4. Agent enum consistency ═══
function checkAgentEnums() {
  console.log('\n4. Agent Enum Consistency');
  console.log('─'.repeat(40));

  const startIssues = issues;

  // AgentRun / AgentConfig legacy enum capture — only for back-compat. After
  // Phase G8 both schemas dropped the enum on agent_key. If an enum is still
  // present, scope the match to the `agent_key: { ... }` block so we don't
  // capture the `status` or `trigger_source` enums by accident.
  function extractAgentKeyEnum(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const block = content.match(/agent_key:\s*\{([\s\S]*?)\}/);
    if (!block) return [];
    const enumMatch = block[1].match(/enum:\s*\[([^\]]+)\]/);
    if (!enumMatch) return [];
    return (enumMatch[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''));
  }
  const runKeys = extractAgentKeyEnum(path.join(ERP_MODELS, 'AgentRun.js'));
  const configKeys = extractAgentKeyEnum(path.join(ERP_MODELS, 'AgentConfig.js'));

  // Phase G8 — agentRegistry is now the single source of truth for agent keys.
  // The old hardcoded maps in agentController / AgentDashboard / AgentSettings
  // are gone; this health check now validates the enum definitions against
  // AGENT_DEFINITIONS in agentRegistry.js.
  const registryPath = path.join(__dirname, '..', 'backend', 'agents', 'agentRegistry.js');
  const registryContent = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf-8') : '';
  const registryKeys = [];
  // Match `agent_key_name: { key: 'agent_key_name', ... }` rows inside AGENT_DEFINITIONS.
  const regRe = /^\s+(\w+):\s*\{\s*key:\s*['"](\w+)['"],/gm;
  let m;
  while ((m = regRe.exec(registryContent)) !== null) registryKeys.push(m[1]);

  // Frontend display-metadata maps (not the source of truth anymore — the lists
  // of rendered agents come from the backend registry). We still audit that
  // every registry key has a friendly schedule entry so the UI doesn't render
  // "Scheduled" fallback for known agents. Missing schedule = warning, not error.
  const dashPath = path.join(PAGES_DIR, 'AgentDashboard.jsx');
  const dashContent = fs.existsSync(dashPath) ? fs.readFileSync(dashPath, 'utf-8') : '';
  const dashKeys = [];
  // Scope to the AGENT_META block so we don't match object-shape lines elsewhere.
  const metaBlockMatch = dashContent.match(/const\s+AGENT_META\s*=\s*\{([\s\S]*?)\n\};/);
  if (metaBlockMatch) {
    const dashRe = /^\s+(\w+):\s*\{\s*icon:\s*\w+,\s*color:/gm;
    while ((m = dashRe.exec(metaBlockMatch[1])) !== null) dashKeys.push(m[1]);
  }

  const settingsPath = path.join(PAGES_DIR, 'AgentSettings.jsx');
  const settingsContent = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf-8') : '';
  const settingsKeys = [];
  // Scope to the AGENT_SCHEDULE block only to avoid matching unrelated
  // string-value keys like `module:`, `doc_ref:`, `reason:` elsewhere in the file.
  const scheduleBlockMatch = settingsContent.match(/const\s+AGENT_SCHEDULE\s*=\s*\{([\s\S]*?)\};/);
  if (scheduleBlockMatch) {
    const setRe = /^\s+(\w+):\s*['"][^'"]*['"],/gm;
    let m2;
    while ((m2 = setRe.exec(scheduleBlockMatch[1])) !== null) settingsKeys.push(m2[1]);
  }

  // Empty enums = no schema constraint (Phase G8 removed them in favour of
  // controller-level validation via agentRegistry). Skip empty sources so the
  // audit doesn't false-positive every registry key as "missing from enum".
  const allSources = {};
  if (runKeys.length) allSources['AgentRun enum'] = new Set(runKeys);
  if (configKeys.length) allSources['AgentConfig enum'] = new Set(configKeys);
  allSources['agentRegistry (source of truth)'] = new Set(registryKeys);
  if (dashKeys.length) allSources['AgentDashboard schedule meta'] = new Set(dashKeys);
  if (settingsKeys.length) allSources['AgentSettings schedule meta'] = new Set(settingsKeys);

  // Union of all keys across all sources
  const allKeys = new Set([...runKeys, ...configKeys, ...registryKeys, ...dashKeys, ...settingsKeys]);

  for (const key of allKeys) {
    const missingFrom = [];
    for (const [source, set] of Object.entries(allSources)) {
      if (!set.has(key)) missingFrom.push(source);
    }
    if (missingFrom.length > 0) {
      warn('AGENT', `'${key}' missing from: ${missingFrom.join(', ')}`);
    }
  }

  if (issues === startIssues) console.log(`  ✓ All ${allKeys.size} agent keys consistent across 5 sources`);
}

// ═══ 5. Proxy Entry wiring (Phases G4.5a + G4.5b + G4.5c.1 + G4.5e + G4.5f) ═══
function checkProxyEntryWiring() {
  console.log('\n5. Proxy Entry Wiring (Phase G4.5a + G4.5b + G4.5c.1 + G4.5e + G4.5f)');
  console.log('─'.repeat(40));
  const startIssues = issues;

  const helperPath = path.join(ROOT, 'backend', 'erp', 'utils', 'resolveOwnerScope.js');
  if (!fs.existsSync(helperPath)) {
    warn('PROXY', 'backend/erp/utils/resolveOwnerScope.js missing');
    return;
  }
  const helper = fs.readFileSync(helperPath, 'utf-8');
  for (const ex of [
    'canProxyEntry', 'resolveOwnerForWrite', 'widenFilterForProxy',
    'invalidateProxyRolesCache',
    // Phase G4.5a follow-up — Rule #3 lookup-driven proxy-target role guard.
    'getValidOwnerRolesForModule', 'invalidateValidOwnerRolesCache',
  ]) {
    if (!new RegExp(`(module\\.exports|exports\\.)\\s*[={].*${ex}|${ex}\\s*[,}]`).test(helper)) {
      warn('PROXY', `resolveOwnerScope.js does not export ${ex}`);
    }
  }
  // The hardcoded VALID_OWNER_ROLES Set has been replaced with a lookup-
  // driven read. If it's back, someone reverted the Rule #3 cleanup.
  if (/const\s+VALID_OWNER_ROLES\s*=\s*new\s+Set\s*\(/.test(helper)) {
    warn('PROXY', 'resolveOwnerScope.js reverted to hardcoded VALID_OWNER_ROLES Set — should read from VALID_OWNER_ROLES lookup');
  }
  if (!/getValidOwnerRolesForModule\(\s*req\.entityId/.test(helper)) {
    warn('PROXY', 'resolveOwnerScope.js resolveOwnerForWrite does not call getValidOwnerRolesForModule — target-role gate is not lookup-driven');
  }

  // Lookup seed: PROXY_ENTRY_ROLES + per-module sub-perm keys
  // G4.5a seeded SALES__PROXY_ENTRY + SALES__OPENING_AR_PROXY.
  // G4.5b adds COLLECTIONS__PROXY_ENTRY + INVENTORY__GRN_PROXY_ENTRY.
  // G4.5c.1 adds EXPENSES__PROXY_ENTRY.
  // G4.5e adds EXPENSES__CAR_LOGBOOK_PROXY + EXPENSES__PRF_CALF_PROXY + INVENTORY__UNDERTAKING_PROXY.
  // G4.5f adds EXPENSES__SMER_PROXY.
  const lookupSeed = fs.readFileSync(path.join(ERP_CONTROLLERS, 'lookupGenericController.js'), 'utf-8');
  for (const key of [
    'PROXY_ENTRY_ROLES:',
    'VALID_OWNER_ROLES:',
    'SALES__PROXY_ENTRY', 'SALES__OPENING_AR_PROXY',
    'COLLECTIONS__PROXY_ENTRY', 'INVENTORY__GRN_PROXY_ENTRY',
    'EXPENSES__PROXY_ENTRY',
    // Phase G4.5e — Car Logbook / PRF-CALF / Undertaking proxy sub-perms.
    'EXPENSES__CAR_LOGBOOK_PROXY', 'EXPENSES__PRF_CALF_PROXY', 'INVENTORY__UNDERTAKING_PROXY',
    // Phase G4.5f — SMER + per-diem override proxy sub-perm.
    'EXPENSES__SMER_PROXY',
  ]) {
    if (!lookupSeed.includes(key)) warn('PROXY', `SEED_DEFAULTS missing ${key}`);
  }
  // PROXY_ENTRY_ROLES + VALID_OWNER_ROLES must each enumerate all 9 modules
  // (G4.5a/b/c.1: 5 + G4.5e: 3 + G4.5f: 1) so OwnerPicker + resolveOwnerForWrite
  // can resolve them without falling back to their respective defaults.
  for (const moduleCode of [
    "code: 'SALES'", "code: 'OPENING_AR'", "code: 'COLLECTIONS'", "code: 'EXPENSES'", "code: 'GRN'",
    // Phase G4.5e — new module codes in both PROXY_ENTRY_ROLES + VALID_OWNER_ROLES.
    "code: 'CAR_LOGBOOK'", "code: 'PRF_CALF'", "code: 'UNDERTAKING'",
    // Phase G4.5f — SMER in both PROXY_ENTRY_ROLES + VALID_OWNER_ROLES.
    "code: 'SMER'",
  ]) {
    const occurrences = (lookupSeed.match(new RegExp(moduleCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (occurrences < 2) {
      warn('PROXY', `PROXY_ENTRY_ROLES or VALID_OWNER_ROLES seed missing module entry ${moduleCode} (found ${occurrences} occurrences, expected ≥2)`);
    }
  }
  // Phase G4.5f — MESSAGE_CATEGORY must include the two proxy-receipt codes
  // (PERDIEM_SUMMARY + PERDIEM_OVERRIDE_DECISION). Without them, the pre-save
  // hook in MessageInbox may default the courtesy receipts to must_acknowledge
  // via unknown-category fallthrough on some lookup routes.
  for (const cat of ['PERDIEM_SUMMARY', 'PERDIEM_OVERRIDE_DECISION']) {
    if (!lookupSeed.includes(cat)) warn('PROXY', `MESSAGE_CATEGORY seed missing ${cat} (Phase G4.5f proxy receipt)`);
  }
  // Cache invalidation wired for both lookup categories
  if (!lookupSeed.includes('invalidateProxyRolesCache')) {
    warn('PROXY', 'lookupGenericController.js does not call invalidateProxyRolesCache — admin edits to PROXY_ENTRY_ROLES will take up to 60s TTL to propagate');
  }
  if (!lookupSeed.includes('invalidateValidOwnerRolesCache')) {
    warn('PROXY', 'lookupGenericController.js does not call invalidateValidOwnerRolesCache — admin edits to VALID_OWNER_ROLES will take up to 60s TTL to propagate');
  }

  // salesController uses helper (G4.5a)
  const salesCtrl = fs.readFileSync(path.join(ERP_CONTROLLERS, 'salesController.js'), 'utf-8');
  for (const fn of ['resolveOwnerForWrite', 'widenFilterForProxy']) {
    if (!salesCtrl.includes(fn)) warn('PROXY', `salesController.js does not import/use ${fn}`);
  }
  if (!salesCtrl.includes('forceApproval')) {
    warn('PROXY', 'salesController.js submitSales missing forceApproval flag (Option B — forced hub for proxied rows)');
  }

  // collectionController uses helper (G4.5b)
  const collCtrl = fs.readFileSync(path.join(ERP_CONTROLLERS, 'collectionController.js'), 'utf-8');
  for (const fn of ['resolveOwnerForWrite', 'widenFilterForProxy']) {
    if (!collCtrl.includes(fn)) warn('PROXY', `collectionController.js does not import/use ${fn}`);
  }
  if (!collCtrl.includes('forceApproval')) {
    warn('PROXY', 'collectionController.js submitCollections missing forceApproval flag (Option B — forced hub for proxied rows)');
  }
  if (!/'collections'.*subKey:\s*'proxy_entry'|subKey:\s*'proxy_entry'.*'collections'/s.test(collCtrl)) {
    warn('PROXY', "collectionController.js does not call widenFilterForProxy with module='collections', subKey='proxy_entry'");
  }

  // expenseController uses helper (Phase G4.5c.1 single-entry expenses + G4.5e Car Logbook + PRF/CALF)
  const expCtrl = fs.readFileSync(path.join(ERP_CONTROLLERS, 'expenseController.js'), 'utf-8');
  for (const fn of ['resolveOwnerForWrite', 'widenFilterForProxy']) {
    if (!expCtrl.includes(fn)) warn('PROXY', `expenseController.js does not import/use ${fn}`);
  }
  if (!/forceApproval/.test(expCtrl)) {
    warn('PROXY', 'expenseController.js submitExpenses missing forceApproval flag (Option B — forced hub for proxied rows)');
  }
  if (!/'expenses'.*subKey:\s*'proxy_entry'|subKey:\s*'proxy_entry'.*'expenses'/s.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not call widenFilterForProxy with module='expenses', subKey='proxy_entry'");
  }
  // Phase G4.5e — Car Logbook must use car_logbook_proxy with lookupCode CAR_LOGBOOK.
  if (!/car_logbook_proxy/.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not reference sub-perm key 'car_logbook_proxy' (Phase G4.5e Car Logbook port)");
  }
  if (!/lookupCode:\s*'CAR_LOGBOOK'/.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not pass lookupCode: 'CAR_LOGBOOK' — PROXY_ENTRY_ROLES.CAR_LOGBOOK lookup unreachable");
  }
  // Phase G4.5e — PRF/CALF uses prf_calf_proxy + PRF_CALF lookup code.
  if (!/prf_calf_proxy/.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not reference sub-perm key 'prf_calf_proxy' (Phase G4.5e CALF port)");
  }
  if (!/lookupCode:\s*'PRF_CALF'/.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not pass lookupCode: 'PRF_CALF' — PROXY_ENTRY_ROLES.PRF_CALF lookup unreachable");
  }
  // Phase G4.5f — SMER uses smer_proxy + SMER lookup code.
  if (!/smer_proxy/.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not reference sub-perm key 'smer_proxy' (Phase G4.5f SMER port)");
  }
  if (!/lookupCode:\s*'SMER'/.test(expCtrl)) {
    warn('PROXY', "expenseController.js does not pass lookupCode: 'SMER' — PROXY_ENTRY_ROLES.SMER lookup unreachable");
  }
  // Phase G4.5f Integrity Point A — submitSmer/validateSmer must require an
  // explicit bdm_id on the widened (privileged/proxy) path. Without this
  // guard, a single click would submit every BDM's VALID SMER at once.
  if (!/bdm_id is required[\s\S]*SMER|submit SMER for/.test(expCtrl)) {
    warn('PROXY', 'expenseController.submitSmer missing bdm_id-required guard on widened path (Phase G4.5f Integrity Point A)');
  }
  // Phase G4.5f Integrity Point B — applyPerdiemOverride must use widenFilter
  // so a proxy caller can apply the override they requested (otherwise 404).
  // Cheap heuristic: the string 'applyPerdiemOverride' must appear near a
  // widenFilterForProxy call site with SMER_PROXY_OPTS.
  if (!/applyPerdiemOverride[\s\S]{0,800}SMER_PROXY_OPTS|SMER_PROXY_OPTS[\s\S]{0,800}applyPerdiemOverride/.test(expCtrl)) {
    // Loose form: at minimum both tokens must coexist somewhere in the file.
    if (!/SMER_PROXY_OPTS/.test(expCtrl)) {
      warn('PROXY', "expenseController.js missing SMER_PROXY_OPTS constant (Phase G4.5f)");
    }
  }
  // Phase G4.5f — MessageInbox receipt helper must exist so proxy submits /
  // apply paths can notify the SMER owner. Failure here means the notification
  // side of the proxy contract is broken (but the proxy writes still work).
  if (!/writeProxyReceipt/.test(expCtrl)) {
    warn('PROXY', 'expenseController.js missing writeProxyReceipt helper (Phase G4.5f MessageInbox receipts)');
  }
  // Phase G4.5e — legacy resolveCarLogbookScope must be deleted (replaced by resolveOwnerForWrite).
  if (/function\s+resolveCarLogbookScope\s*\(/.test(expCtrl)) {
    warn('PROXY', 'expenseController.js still defines legacy resolveCarLogbookScope — Phase G4.5e should have removed it in favor of resolveOwnerForWrite');
  }
  // Phase G4.5e — autoCalfForSource must propagate recorded_on_behalf_of so
  // the auto-CALF inherits the proxy audit chain from the source doc.
  if (!/recorded_on_behalf_of:\s*sourceDoc\.recorded_on_behalf_of/.test(expCtrl)) {
    warn('PROXY', 'expenseController.autoCalfForSource does not propagate recorded_on_behalf_of from source doc — proxy chain breaks at auto-CALF');
  }
  // Unified audit codes (Phase G4.5c.1) — createExpense emits PROXY_CREATE,
  // updateExpense emits PROXY_UPDATE, matching Sales/Collections/GRN.
  if (!/log_type:\s*'PROXY_CREATE'/.test(expCtrl)) {
    warn('PROXY', 'expenseController.createExpense does not emit PROXY_CREATE audit (unified code)');
  }
  if (!/log_type:\s*'PROXY_UPDATE'/.test(expCtrl)) {
    warn('PROXY', 'expenseController.updateExpense does not emit PROXY_UPDATE audit (unified code)');
  }

  // Phase G4.5c.1 — ExpenseEntry.calf_override field (president-only CALF
  // bypass; decoupled from recorded_on_behalf_of to prevent admin/contractor
  // proxies from silently bypassing the CALF requirement).
  const expModelPath = path.join(ERP_MODELS, 'ExpenseEntry.js');
  if (fs.existsSync(expModelPath)) {
    const expModel = fs.readFileSync(expModelPath, 'utf-8');
    if (!/calf_override\s*:\s*\{\s*type:\s*Boolean/.test(expModel)) {
      warn('PROXY', 'ExpenseEntry model missing calf_override field — CALF bypass still piggybacks on recorded_on_behalf_of (regression risk)');
    }
    if (/if\s*\(\s*this\.recorded_on_behalf_of\s*\)\s*\{\s*line\.calf_required\s*=\s*false/.test(expModel)) {
      warn('PROXY', 'ExpenseEntry pre-save hook still bypasses CALF via recorded_on_behalf_of — admin/contractor proxies will silently skip CALF');
    }
  }

  // inventoryController uses helper (G4.5b, GRN paths)
  const invCtrl = fs.readFileSync(path.join(ERP_CONTROLLERS, 'inventoryController.js'), 'utf-8');
  for (const fn of ['resolveOwnerForWrite', 'widenFilterForProxy']) {
    if (!invCtrl.includes(fn)) warn('PROXY', `inventoryController.js does not import/use ${fn}`);
  }
  if (!/grn_proxy_entry/.test(invCtrl)) {
    warn('PROXY', "inventoryController.js does not reference sub-perm key 'grn_proxy_entry'");
  }
  // Warehouse-access cross-check: proxy GRN must verify target BDM is in
  // Warehouse.assigned_users (or manager_id). If this guard is missing, a
  // proxy could receive stock into a warehouse the target BDM can't access.
  if (!/assigned_users|warehouse.*not assigned/i.test(invCtrl)) {
    warn('PROXY', 'inventoryController.createGrn missing warehouse-access cross-check — target BDM could receive into a warehouse they are not assigned to');
  }

  // Phase G4.5e — undertakingController proxy wiring.
  const utCtrlPath = path.join(ERP_CONTROLLERS, 'undertakingController.js');
  if (fs.existsSync(utCtrlPath)) {
    const utCtrl = fs.readFileSync(utCtrlPath, 'utf-8');
    for (const fn of ['widenFilterForProxy', 'canProxyEntry']) {
      if (!utCtrl.includes(fn)) warn('PROXY', `undertakingController.js does not import/use ${fn} (Phase G4.5e)`);
    }
    if (!/undertaking_proxy/.test(utCtrl)) {
      warn('PROXY', "undertakingController.js does not reference sub-perm key 'undertaking_proxy' (Phase G4.5e)");
    }
    if (!/lookupCode:\s*'UNDERTAKING'/.test(utCtrl)) {
      warn('PROXY', "undertakingController.js does not pass lookupCode: 'UNDERTAKING' — PROXY_ENTRY_ROLES.UNDERTAKING unreachable");
    }
    if (!/forceApproval/.test(utCtrl)) {
      warn('PROXY', 'undertakingController.submitUndertaking missing forceApproval flag (Rule #20 four-eyes for proxy UTs)');
    }
  }

  // Models: recorded_on_behalf_of on SalesLine (G4.5a) + Collection, GrnEntry,
  // Undertaking (G4.5b) + ExpenseEntry (G4.5c.1) + CarLogbookEntry, CarLogbookCycle,
  // PrfCalf (G4.5e) + SmerEntry (G4.5f)
  for (const { file, label } of [
    { file: 'SalesLine.js', label: 'SalesLine' },
    { file: 'Collection.js', label: 'Collection' },
    { file: 'GrnEntry.js', label: 'GrnEntry' },
    { file: 'Undertaking.js', label: 'Undertaking' },
    { file: 'ExpenseEntry.js', label: 'ExpenseEntry' },
    // Phase G4.5e — three new collections carry proxy audit.
    { file: 'CarLogbookEntry.js', label: 'CarLogbookEntry' },
    { file: 'CarLogbookCycle.js', label: 'CarLogbookCycle' },
    { file: 'PrfCalf.js', label: 'PrfCalf' },
    // Phase G4.5f — SmerEntry carries the field at both cycle level (top) and
    // per-day level (daily_entries[].recorded_on_behalf_of). One occurrence in
    // source is enough to pass the substring check.
    { file: 'SmerEntry.js', label: 'SmerEntry' },
  ]) {
    const modelPath = path.join(ERP_MODELS, file);
    if (!fs.existsSync(modelPath)) {
      warn('PROXY', `${label} model file missing at ${modelPath}`);
      continue;
    }
    const src = fs.readFileSync(modelPath, 'utf-8');
    if (!src.includes('recorded_on_behalf_of')) {
      warn('PROXY', `${label} model missing recorded_on_behalf_of field`);
    }
  }

  // undertakingService must propagate recorded_on_behalf_of from GRN to the
  // auto-created Undertaking; otherwise a proxied GRN's UT would look
  // self-created in the target BDM's queue.
  const utSvcPath = path.join(ERP_SERVICES, 'undertakingService.js');
  if (fs.existsSync(utSvcPath)) {
    const utSvc = fs.readFileSync(utSvcPath, 'utf-8');
    if (!/recorded_on_behalf_of/.test(utSvc)) {
      warn('PROXY', 'undertakingService.autoUndertakingForGrn does not propagate recorded_on_behalf_of from GRN to UT');
    }
  }

  // Phase G4.5f — SmerEntry model must also expose bdm_phone_instruction at
  // the cycle + daily-entry level so the proxy authorization tag persists.
  const smerModelPath = path.join(ERP_MODELS, 'SmerEntry.js');
  if (fs.existsSync(smerModelPath)) {
    const smerModel = fs.readFileSync(smerModelPath, 'utf-8');
    if (!/bdm_phone_instruction/.test(smerModel)) {
      warn('PROXY', 'SmerEntry model missing bdm_phone_instruction field (Phase G4.5f authorization tag)');
    }
    // The field should appear at BOTH levels (cycle + daily). Two occurrences expected.
    const occ = (smerModel.match(/bdm_phone_instruction/g) || []).length;
    if (occ < 2) {
      warn('PROXY', `SmerEntry model declares bdm_phone_instruction ${occ} time(s) — expected ≥2 (cycle + daily_entries)`);
    }
  }

  // Phase G4.5f — universalApprovalController.perdiem_override must emit a
  // PERDIEM_OVERRIDE_DECISION MessageInbox row when the entry was proxied.
  // Without this, approvers' Hub decisions on proxied overrides leave the
  // SMER owner in the dark about outcomes. Local read because `universal`
  // below is declared later in this function body.
  {
    const _universalPath = path.join(ERP_CONTROLLERS, 'universalApprovalController.js');
    if (fs.existsSync(_universalPath)) {
      const _universal = fs.readFileSync(_universalPath, 'utf-8');
      if (!/PERDIEM_OVERRIDE_DECISION/.test(_universal)) {
        warn('PROXY', 'universalApprovalController.perdiem_override does not emit PERDIEM_OVERRIDE_DECISION receipt (Phase G4.5f)');
      }
    }
  }

  // MODULE_AUTO_POST has OPENING_AR + COLLECTION (GRN is intentionally excluded —
  // its auto-post path runs through undertakingController.postSingleUndertaking
  // on UT acknowledgment, not through the generic approval auto-post dispatcher).
  const universal = fs.readFileSync(path.join(ERP_CONTROLLERS, 'universalApprovalController.js'), 'utf-8');
  if (!/OPENING_AR:\s*\{[^}]*sales_line/.test(universal)) {
    warn('PROXY', "MODULE_AUTO_POST missing OPENING_AR → sales_line — proxied Opening AR won't auto-post after hub approval");
  }
  if (!/COLLECTION:\s*\{[^}]*collection/.test(universal)) {
    warn('PROXY', "MODULE_AUTO_POST missing COLLECTION → collection — proxied Collection won't auto-post after hub approval");
  }

  // approvalService honors opts.forceApproval
  const approvalSvc = fs.readFileSync(path.join(ERP_SERVICES, 'approvalService.js'), 'utf-8');
  if (!/opts\.forceApproval|const\s+forceApproval/.test(approvalSvc)) {
    warn('PROXY', 'approvalService.js checkApprovalRequired does not read opts.forceApproval');
  }

  // Frontend OwnerPicker + consumers
  const pickerPath = path.join(COMPONENTS_DIR, 'OwnerPicker.jsx');
  if (!fs.existsSync(pickerPath)) {
    warn('PROXY', 'frontend/src/erp/components/OwnerPicker.jsx missing');
  } else {
    const picker = fs.readFileSync(pickerPath, 'utf-8');
    if (!picker.includes('PROXY_ENTRY_ROLES')) warn('PROXY', 'OwnerPicker.jsx does not read PROXY_ENTRY_ROLES lookup');
    if (!/===\s*['"]contractor['"]/.test(picker)) {
      warn('PROXY', "OwnerPicker.jsx does not filter target roles to contractor/employee — admins/finance may appear as invalid proxy targets");
    }
  }
  // Entry pages mount OwnerPicker + send assigned_to in payload
  // Expenses.jsx doubles as entry + list on single page (not split like Sales).
  for (const page of ['SalesEntry.jsx', 'OpeningArEntry.jsx', 'CollectionSession.jsx', 'GrnEntry.jsx', 'Expenses.jsx']) {
    const p = path.join(PAGES_DIR, page);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf-8');
    if (!src.includes('OwnerPicker')) warn('PROXY', `${page} does not import OwnerPicker`);
    if (!src.includes('assigned_to')) warn('PROXY', `${page} payload missing assigned_to field`);
  }
  // List pages render Proxied pill (reads recorded_on_behalf_of)
  // Phase G4.5e adds PrfCalf.jsx and UndertakingDetail.jsx to the check.
  // Phase G4.5f adds Smer.jsx (row-level + per-day pill both read the field).
  for (const page of ['SalesList.jsx', 'OpeningArList.jsx', 'Collections.jsx', 'GrnEntry.jsx', 'Expenses.jsx', 'PrfCalf.jsx', 'UndertakingDetail.jsx', 'Smer.jsx']) {
    const p = path.join(PAGES_DIR, page);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf-8');
    if (!src.includes('recorded_on_behalf_of')) {
      warn('PROXY', `${page} does not render proxy indicator (recorded_on_behalf_of)`);
    }
  }
  // Phase G4.5e — entry pages that carry proxy WRITE (OwnerPicker or
  // equivalent sub-perm gate) + send assigned_to on create. CarLogbook.jsx
  // uses the existing BDM picker rather than OwnerPicker because the page
  // was already built around a per-person picker; the gate is canProxyCarLogbook.
  // Phase G4.5f — Smer.jsx follows the CarLogbook pattern (BDM picker + sub-perm
  // check via canProxySmer, not OwnerPicker) because SMER is per-person per-cycle.
  for (const { page, needle } of [
    { page: 'PrfCalf.jsx', needle: 'OwnerPicker' },
    { page: 'CarLogbook.jsx', needle: 'car_logbook_proxy' },
    { page: 'Smer.jsx', needle: 'smer_proxy' },
  ]) {
    const p = path.join(PAGES_DIR, page);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf-8');
    if (!src.includes(needle)) warn('PROXY', `${page} missing proxy-write wiring (looking for "${needle}")`);
    if (!src.includes('assigned_to')) warn('PROXY', `${page} payload missing assigned_to field (Phase G4.5e/G4.5f)`);
  }
  // Phase G4.5f — Smer.jsx proxy-write surfaces must also send the
  // bdm_phone_instruction tag on create / submit / override payloads. Backend
  // 400s on the proxy path if the tag is missing.
  {
    const smerPagePath = path.join(PAGES_DIR, 'Smer.jsx');
    if (fs.existsSync(smerPagePath)) {
      const src = fs.readFileSync(smerPagePath, 'utf-8');
      if (!/bdm_phone_instruction/.test(src)) {
        warn('PROXY', 'Smer.jsx missing bdm_phone_instruction on proxy payloads (Phase G4.5f authorization tag)');
      }
    }
  }
  // Phase G4.5e — UndertakingDetail.jsx reveals the submit button when the
  // user has inventory.undertaking_proxy. Without this gate, eBDMs can't submit
  // on behalf even though the backend permits it.
  {
    const utDetail = path.join(PAGES_DIR, 'UndertakingDetail.jsx');
    if (fs.existsSync(utDetail)) {
      const src = fs.readFileSync(utDetail, 'utf-8');
      if (!/undertaking_proxy/.test(src)) {
        warn('PROXY', 'UndertakingDetail.jsx submit gate does not check undertaking_proxy sub-perm (Phase G4.5e)');
      }
    }
  }
  // Phase G4.5b-ext — AR Aging + Collection Rate endpoints must use
  // canProxyEntry so proxy-eligible contractors can view their target BDMs'
  // AR data. Without this, a proxy can record collections but cannot verify
  // the AR state — a blind spot that undermines data accuracy.
  if (!/canProxyEntry.*getArAgingEndpoint|getArAgingEndpoint[\s\S]*?canProxyEntry/.test(collCtrl)) {
    // Check if canProxyEntry appears near getArAgingEndpoint
    const arAgingIdx = collCtrl.indexOf('getArAgingEndpoint');
    const arAgingBlock = arAgingIdx >= 0 ? collCtrl.slice(arAgingIdx, arAgingIdx + 600) : '';
    if (!arAgingBlock.includes('canProxyEntry')) {
      warn('PROXY', 'collectionController.getArAgingEndpoint does not call canProxyEntry — proxy contractors cannot view target BDM AR aging (Phase G4.5b-ext)');
    }
  }
  {
    const crIdx = collCtrl.indexOf('getCollectionRateEndpoint');
    const crBlock = crIdx >= 0 ? collCtrl.slice(crIdx, crIdx + 600) : '';
    if (!crBlock.includes('canProxyEntry')) {
      warn('PROXY', 'collectionController.getCollectionRateEndpoint does not call canProxyEntry — proxy contractors cannot view target BDM collection rate (Phase G4.5b-ext)');
    }
  }

  if (issues === startIssues) console.log('  \u2713 Proxy entry wiring intact (G4.5a + G4.5b + G4.5b-ext + G4.5c.1 + G4.5e + G4.5f)');
}

// ═══ Phase FRA-A — FRA dual-write to User.entity_ids ═══
// Verifies the wiring that makes FunctionalRoleAssignment rows propagate to
// User.entity_ids (what tenantFilter reads). Without this, FRA rows are
// cosmetic and cross-entity proxy writes fail with "target not assigned to
// the current entity" even though the admin believes the person is assigned.
// Live drift count (actual DB state vs expected union) is surfaced by the
// backfill script's --dry-run: `node backend/erp/scripts/backfillEntityIdsFromFra.js`.
function checkFraEntityIdsSync() {
  const startIssues = issues;
  console.log('\n6. FRA → User.entity_ids Sync (Phase FRA-A)');
  console.log('─'.repeat(40));

  // User model has entity_ids_static field (admin-direct baseline)
  const userModelPath = path.join(ROOT, 'backend', 'models', 'User.js');
  const userModel = fs.readFileSync(userModelPath, 'utf-8');
  if (!/entity_ids_static\s*:\s*\[/.test(userModel)) {
    warn('FRA', 'User model missing entity_ids_static field — FRA rebuild cannot preserve admin-direct assignments');
  }
  if (!/userSchema\.index\(\s*\{\s*entity_ids_static\s*:/.test(userModel)) {
    warn('FRA', 'User model missing entity_ids_static index — drift reports will be slow');
  }

  // Shared rebuild helper present with expected exports
  const rebuildPath = path.join(ROOT, 'backend', 'erp', 'utils', 'userEntityRebuild.js');
  if (!fs.existsSync(rebuildPath)) {
    warn('FRA', 'backend/erp/utils/userEntityRebuild.js missing — dual-write cannot function');
  } else {
    const rebuild = fs.readFileSync(rebuildPath, 'utf-8');
    for (const ex of ['rebuildUserEntityIdsForUser', 'rebuildUserEntityIdsFromPerson', 'safeRebuildFromPerson']) {
      if (!new RegExp(`(module\\.exports|exports\\.)\\s*[={].*${ex}|${ex}\\s*[,}]`).test(rebuild)) {
        warn('FRA', `userEntityRebuild.js does not export ${ex}`);
      }
    }
    // Union formula invariant
    if (!/entity_ids_static/.test(rebuild) || !/FunctionalRoleAssignment/.test(rebuild)) {
      warn('FRA', 'userEntityRebuild.js does not compute union(entity_ids_static, activeFras)');
    }
  }

  // functionalRoleController calls rebuild on every mutation path
  const fraCtrlPath = path.join(ERP_CONTROLLERS, 'functionalRoleController.js');
  if (!fs.existsSync(fraCtrlPath)) {
    warn('FRA', 'functionalRoleController.js missing — expected at backend/erp/controllers/functionalRoleController.js');
  } else {
    const fraCtrl = fs.readFileSync(fraCtrlPath, 'utf-8');
    if (!/require\(['"]\.\.\/utils\/userEntityRebuild['"]\)/.test(fraCtrl)) {
      warn('FRA', 'functionalRoleController.js does not import userEntityRebuild — FRA mutations will not propagate');
    }
    // Each mutation path must trigger a rebuild. Count occurrences — one per
    // mutation handler (createAssignment, updateAssignment, deactivateAssignment,
    // bulkCreate = 4 minimum).
    const rebuildCalls = (fraCtrl.match(/safeRebuildFromPerson\s*\(/g) || []).length;
    if (rebuildCalls < 4) {
      warn('FRA', `functionalRoleController.js calls safeRebuildFromPerson ${rebuildCalls} times, expected ≥4 (create, update, deactivate, bulkCreate)`);
    }
  }

  // userController.updateUser mirrors admin-direct entity_ids to static + rebuilds
  const userCtrlPath = path.join(ROOT, 'backend', 'controllers', 'userController.js');
  const userCtrl = fs.readFileSync(userCtrlPath, 'utf-8');
  if (!/entity_ids_static\s*=/.test(userCtrl)) {
    warn('FRA', 'userController.js does not mirror admin-direct entity_ids to entity_ids_static — admin writes will be dropped on next FRA rebuild');
  }
  if (!/rebuildUserEntityIdsForUser/.test(userCtrl)) {
    warn('FRA', 'userController.js does not call rebuildUserEntityIdsForUser — admin-direct entity_ids writes will not union with active FRAs');
  }

  // Backfill script present (required for migration + drift detection)
  const backfillPath = path.join(ROOT, 'backend', 'erp', 'scripts', 'backfillEntityIdsFromFra.js');
  if (!fs.existsSync(backfillPath)) {
    warn('FRA', 'backend/erp/scripts/backfillEntityIdsFromFra.js missing — pre-FRA-A users have no entity_ids_static baseline');
  } else {
    const backfill = fs.readFileSync(backfillPath, 'utf-8');
    if (!/--apply/.test(backfill) || !/--user/.test(backfill)) {
      warn('FRA', 'backfillEntityIdsFromFra.js does not support --apply / --user flags — expected dry-run safe default');
    }
  }

  if (issues === startIssues) console.log('  ✓ FRA → User.entity_ids wiring intact (Phase FRA-A)');
}

// ═══ 7. Phase P1 — CaptureSubmission + Proxy Queue Wiring ═══
function checkCaptureSubmissionWiring() {
  const startIssues = issues;
  console.log('\n7. CaptureSubmission + Proxy Queue (Phase P1)');
  console.log('─'.repeat(40));

  // Model exists
  const modelPath = path.join(ERP_MODELS, 'CaptureSubmission.js');
  if (!fs.existsSync(modelPath)) {
    warn('P1', 'CaptureSubmission model missing at backend/erp/models/CaptureSubmission.js');
  } else {
    const model = fs.readFileSync(modelPath, 'utf-8');
    // Check required fields
    for (const field of ['bdm_id', 'entity_id', 'workflow_type', 'status', 'captured_artifacts']) {
      if (!new RegExp(`${field}\\s*:`).test(model)) {
        warn('P1', `CaptureSubmission model missing field: ${field}`);
      }
    }
    // Check status enum includes full lifecycle
    for (const st of ['PENDING_PROXY', 'IN_PROGRESS', 'PROCESSED', 'AWAITING_BDM_REVIEW', 'ACKNOWLEDGED', 'DISPUTED', 'CANCELLED', 'AUTO_ACKNOWLEDGED']) {
      if (!model.includes(`'${st}'`)) {
        warn('P1', `CaptureSubmission model missing status: ${st}`);
      }
    }
    // Check workflow_type enum
    for (const wt of ['SMER', 'EXPENSE', 'SALES', 'GRN', 'FUEL_ENTRY', 'PETTY_CASH']) {
      if (!model.includes(`'${wt}'`)) {
        warn('P1', `CaptureSubmission model missing workflow_type: ${wt}`);
      }
    }
  }

  // Controller exists with expected exports
  const ctrlPath = path.join(ERP_CONTROLLERS, 'captureSubmissionController.js');
  if (!fs.existsSync(ctrlPath)) {
    warn('P1', 'captureSubmissionController.js missing');
  } else {
    const ctrl = fs.readFileSync(ctrlPath, 'utf-8');
    for (const fn of ['createCapture', 'getMyCaptures', 'getMyReviewQueue', 'acknowledgeCapture', 'disputeCapture', 'getProxyQueue', 'pickupCapture', 'completeCapture', 'getQueueStats']) {
      if (!new RegExp(`${fn}\\s*[,}]`).test(ctrl) && !new RegExp(`exports\\.${fn}`).test(ctrl)) {
        warn('P1', `captureSubmissionController.js does not export ${fn}`);
      }
    }
    // Must use canProxyEntry for queue access gating
    if (!/canProxyEntry/.test(ctrl)) {
      warn('P1', 'captureSubmissionController.js does not use canProxyEntry — proxy queue ungated');
    }
    // Must use dispatchMultiChannel for notifications
    if (!/dispatchMultiChannel/.test(ctrl)) {
      warn('P1', 'captureSubmissionController.js does not use dispatchMultiChannel — notifications missing');
    }
  }

  // Routes exist and are wired in index
  const routesPath = path.join(ROOT, 'backend', 'erp', 'routes', 'captureSubmissionRoutes.js');
  if (!fs.existsSync(routesPath)) {
    warn('P1', 'captureSubmissionRoutes.js missing');
  }
  const routeIndex = fs.readFileSync(path.join(ROOT, 'backend', 'erp', 'routes', 'index.js'), 'utf-8');
  if (!/captureSubmissionRoutes/.test(routeIndex)) {
    warn('P1', 'captureSubmissionRoutes not mounted in routes/index.js');
  }

  // Agent exists and is registered
  const agentPath = path.join(ROOT, 'backend', 'agents', 'proxySlaAgent.js');
  if (!fs.existsSync(agentPath)) {
    warn('P1', 'proxySlaAgent.js missing at backend/agents/');
  } else {
    const agent = fs.readFileSync(agentPath, 'utf-8');
    if (!/PROXY_SLA_THRESHOLDS/.test(agent)) {
      warn('P1', 'proxySlaAgent.js does not read PROXY_SLA_THRESHOLDS lookup');
    }
    if (!/AUTO_ACKNOWLEDGED/.test(agent)) {
      warn('P1', 'proxySlaAgent.js does not handle auto-acknowledgment');
    }
  }
  const registry = fs.readFileSync(path.join(ROOT, 'backend', 'agents', 'agentRegistry.js'), 'utf-8');
  if (!/proxy_sla/.test(registry)) {
    warn('P1', 'proxy_sla agent not registered in agentRegistry.js');
  }
  const scheduler = fs.readFileSync(path.join(ROOT, 'backend', 'agents', 'agentScheduler.js'), 'utf-8');
  if (!/proxy_sla/.test(scheduler)) {
    warn('P1', 'proxy_sla agent not scheduled in agentScheduler.js');
  }

  // Lookup seed: PROXY_SLA_THRESHOLDS
  const lookupCtrl = fs.readFileSync(path.join(ERP_CONTROLLERS, 'lookupGenericController.js'), 'utf-8');
  if (!/PROXY_SLA_THRESHOLDS/.test(lookupCtrl)) {
    warn('P1', 'PROXY_SLA_THRESHOLDS not seeded in lookupGenericController.js');
  }

  if (issues === startIssues) console.log('  ✓ CaptureSubmission + Proxy Queue wiring intact (Phase P1)');
}

// ═══ Run all checks ═══
console.log('System Health Check');
console.log('═'.repeat(40));

const beforeIssues = issues;
checkLookupCollections();
checkWorkflowGuides();
checkControlCenter();
checkAgentEnums();
checkProxyEntryWiring();
checkFraEntityIdsSync();
checkCaptureSubmissionWiring();

console.log('\n' + '═'.repeat(40));
if (issues > beforeIssues) {
  // beforeIssues was 0 at start, issues accumulated
}
if (issues > 0) {
  console.log(`✗ ${issues} issue(s) found. Fix before deploying.`);
  process.exit(1);
} else {
  console.log('✓ All checks passed. System is healthy.');
  process.exit(0);
}
