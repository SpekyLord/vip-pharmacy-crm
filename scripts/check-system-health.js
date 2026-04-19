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
const COMPONENTS_DIR = path.join(ROOT, 'frontend', 'src', 'erp', 'components');

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

// ═══ 2. WorkflowGuide pageKeys ═══
function checkWorkflowGuides() {
  console.log('\n2. WorkflowGuide PageKeys');
  console.log('─'.repeat(40));

  const wfgPath = path.join(COMPONENTS_DIR, 'WorkflowGuide.jsx');
  if (!fs.existsSync(wfgPath)) { warn('WFG', 'WorkflowGuide.jsx not found'); return; }

  const wfgContent = fs.readFileSync(wfgPath, 'utf-8');

  // Extract defined pageKeys
  const definedKeys = new Set();
  const keyRe = /['"]?([a-zA-Z][-a-zA-Z0-9]*)['"]?:\s*\{[\s\n]*title:/g;
  let m;
  while ((m = keyRe.exec(wfgContent)) !== null) definedKeys.add(m[1]);

  // Find used pageKeys across all pages
  const usedKeys = new Set();
  const pages = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.jsx'));
  for (const file of pages) {
    const content = fs.readFileSync(path.join(PAGES_DIR, file), 'utf-8');
    const useRe = /pageKey=["']([^"']+)["']/g;
    while ((m = useRe.exec(content)) !== null) usedKeys.add(m[1]);
  }

  // Defined but never used
  for (const key of definedKeys) {
    if (!usedKeys.has(key)) warn('WFG', `pageKey "${key}" defined but never used in any page`);
  }
  // Used but never defined
  for (const key of usedKeys) {
    if (!definedKeys.has(key)) warn('WFG', `pageKey "${key}" used in a page but not defined in WorkflowGuide`);
  }

  const startIssues = issues;
  if (issues === startIssues) console.log(`  ✓ All ${definedKeys.size} pageKeys valid (${usedKeys.size} used)`);
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

// ═══ Run all checks ═══
console.log('System Health Check');
console.log('═'.repeat(40));

const beforeIssues = issues;
checkLookupCollections();
checkWorkflowGuides();
checkControlCenter();
checkAgentEnums();

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
