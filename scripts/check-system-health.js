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

// ═══ 5. Proxy Entry wiring (Phases G4.5a + G4.5b) ═══
function checkProxyEntryWiring() {
  console.log('\n5. Proxy Entry Wiring (Phase G4.5a + G4.5b)');
  console.log('─'.repeat(40));
  const startIssues = issues;

  const helperPath = path.join(ROOT, 'backend', 'erp', 'utils', 'resolveOwnerScope.js');
  if (!fs.existsSync(helperPath)) {
    warn('PROXY', 'backend/erp/utils/resolveOwnerScope.js missing');
    return;
  }
  const helper = fs.readFileSync(helperPath, 'utf-8');
  for (const ex of ['canProxyEntry', 'resolveOwnerForWrite', 'widenFilterForProxy', 'invalidateProxyRolesCache']) {
    if (!new RegExp(`(module\\.exports|exports\\.)\\s*[={].*${ex}|${ex}\\s*[,}]`).test(helper)) {
      warn('PROXY', `resolveOwnerScope.js does not export ${ex}`);
    }
  }

  // Lookup seed: PROXY_ENTRY_ROLES + per-module sub-perm keys
  // G4.5a seeded SALES__PROXY_ENTRY + SALES__OPENING_AR_PROXY.
  // G4.5b adds COLLECTIONS__PROXY_ENTRY + INVENTORY__GRN_PROXY_ENTRY.
  const lookupSeed = fs.readFileSync(path.join(ERP_CONTROLLERS, 'lookupGenericController.js'), 'utf-8');
  for (const key of [
    'PROXY_ENTRY_ROLES:',
    'SALES__PROXY_ENTRY', 'SALES__OPENING_AR_PROXY',
    'COLLECTIONS__PROXY_ENTRY', 'INVENTORY__GRN_PROXY_ENTRY',
  ]) {
    if (!lookupSeed.includes(key)) warn('PROXY', `SEED_DEFAULTS missing ${key}`);
  }
  // PROXY_ENTRY_ROLES must enumerate all 5 modules so OwnerPicker can resolve
  // them without falling back to the admin/finance/president default.
  for (const moduleCode of ["code: 'SALES'", "code: 'OPENING_AR'", "code: 'COLLECTIONS'", "code: 'EXPENSES'", "code: 'GRN'"]) {
    if (!lookupSeed.includes(moduleCode)) {
      warn('PROXY', `PROXY_ENTRY_ROLES seed missing module entry ${moduleCode}`);
    }
  }
  // Cache invalidation wired
  if (!lookupSeed.includes('invalidateProxyRolesCache')) {
    warn('PROXY', 'lookupGenericController.js does not call invalidateProxyRolesCache — admin edits to PROXY_ENTRY_ROLES will take up to 60s TTL to propagate');
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

  // Models: recorded_on_behalf_of on SalesLine (G4.5a) + Collection, GrnEntry, Undertaking (G4.5b)
  for (const { file, label } of [
    { file: 'SalesLine.js', label: 'SalesLine' },
    { file: 'Collection.js', label: 'Collection' },
    { file: 'GrnEntry.js', label: 'GrnEntry' },
    { file: 'Undertaking.js', label: 'Undertaking' },
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
  for (const page of ['SalesEntry.jsx', 'OpeningArEntry.jsx', 'CollectionSession.jsx', 'GrnEntry.jsx']) {
    const p = path.join(PAGES_DIR, page);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf-8');
    if (!src.includes('OwnerPicker')) warn('PROXY', `${page} does not import OwnerPicker`);
    if (!src.includes('assigned_to')) warn('PROXY', `${page} payload missing assigned_to field`);
  }
  // List pages render Proxied pill (reads recorded_on_behalf_of)
  for (const page of ['SalesList.jsx', 'OpeningArList.jsx', 'Collections.jsx', 'GrnEntry.jsx']) {
    const p = path.join(PAGES_DIR, page);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, 'utf-8');
    if (!src.includes('recorded_on_behalf_of')) {
      warn('PROXY', `${page} does not render proxy indicator (recorded_on_behalf_of)`);
    }
  }

  if (issues === startIssues) console.log('  ✓ Proxy entry wiring intact (G4.5a + G4.5b)');
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
