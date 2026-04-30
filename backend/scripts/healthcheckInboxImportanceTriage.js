/**
 * Phase G9.R11 — Inbox Importance Triage healthcheck.
 *
 * Static wiring contract. No DB calls. Exits non-zero on first failure so
 * CI/pre-deploy can hook it in.
 *
 * Run from repo root:
 *   node backend/scripts/healthcheckInboxImportanceTriage.js
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const RED = '\x1b[31m';
const GRN = '\x1b[32m';
const YEL = '\x1b[33m';
const RST = '\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

function ok(msg) {
  passed += 1;
  console.log(`  ${GRN}✓${RST} ${msg}`);
}
function bad(msg) {
  failed += 1;
  failures.push(msg);
  console.log(`  ${RED}✗${RST} ${msg}`);
}

function readFile(rel) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

function check(label, condition, evidence = '') {
  if (condition) ok(label);
  else bad(`${label}${evidence ? ` (${evidence})` : ''}`);
}

console.log(`${YEL}Phase G9.R11 — Inbox Importance Triage healthcheck${RST}\n`);

// ── 1. inboxLookups.js — folder defaults + category map + hidden-folder defaults ──
console.log('1. backend/erp/utils/inboxLookups.js');
const inboxLookupsSrc = readFile('backend/erp/utils/inboxLookups.js');

check('FOLDER_DEFAULTS contains EXECUTIVE_BRIEF',
  /code:\s*'EXECUTIVE_BRIEF'/.test(inboxLookupsSrc));

check('EXECUTIVE_BRIEF sort_order is 5',
  /code:\s*'EXECUTIVE_BRIEF',\s*label:\s*'Executive Brief',\s*sort_order:\s*5/.test(inboxLookupsSrc));

check('AI_AGENT_REPORTS sort_order shifted to 6',
  /code:\s*'AI_AGENT_REPORTS',\s*label:\s*'AI Agents',\s*sort_order:\s*6/.test(inboxLookupsSrc));

check('CATEGORY_TO_FOLDER routes briefing → EXECUTIVE_BRIEF',
  /briefing:\s*'EXECUTIVE_BRIEF'/.test(inboxLookupsSrc));

const orphanCategories = ['inventory_alert', 'proxy_sla_alert', 'proxy_auto_ack', 'data_quality'];
for (const cat of orphanCategories) {
  check(`CATEGORY_TO_FOLDER routes ${cat} → AI_AGENT_REPORTS`,
    new RegExp(`${cat}:\\s*'AI_AGENT_REPORTS'`).test(inboxLookupsSrc));
}

check('HIDDEN_FOLDERS_BY_ROLE_DEFAULTS president hides AI_AGENT_REPORTS',
  /president[\s\S]*?hidden_folders:\s*\[\s*'APPROVALS',\s*'AI_AGENT_REPORTS'\s*\]/.test(inboxLookupsSrc));

// ── 2. backfillMessageInboxEntityId.js — CATEGORY_TO_FOLDER copy synced ──
console.log('\n2. backend/scripts/backfillMessageInboxEntityId.js');
const backfillSrc = readFile('backend/scripts/backfillMessageInboxEntityId.js');

check('Backfill script routes briefing → EXECUTIVE_BRIEF',
  /briefing:\s*'EXECUTIVE_BRIEF'/.test(backfillSrc));

for (const cat of orphanCategories) {
  check(`Backfill script routes ${cat} → AI_AGENT_REPORTS`,
    new RegExp(`${cat}:\\s*'AI_AGENT_REPORTS'`).test(backfillSrc));
}

// Symmetry check: every category in inboxLookups appears in backfill (and vice-versa)
function extractCategoryMap(src) {
  const m = src.match(/CATEGORY_TO_FOLDER\s*=\s*{([\s\S]*?)};/);
  if (!m) return null;
  const body = m[1];
  const entries = [...body.matchAll(/(\w+):\s*'(\w+)'/g)].map(([, k, v]) => [k, v]);
  return Object.fromEntries(entries);
}
const lookupMap = extractCategoryMap(inboxLookupsSrc);
const backfillMap = extractCategoryMap(backfillSrc);
const lookupKeys = lookupMap ? Object.keys(lookupMap).sort() : [];
const backfillKeys = backfillMap ? Object.keys(backfillMap).sort() : [];

check('inboxLookups CATEGORY_TO_FOLDER and backfill copy have identical keys',
  JSON.stringify(lookupKeys) === JSON.stringify(backfillKeys),
  `lookup=${lookupKeys.length} keys, backfill=${backfillKeys.length} keys`);

let valuesMatch = lookupMap && backfillMap;
if (valuesMatch) {
  for (const k of lookupKeys) {
    if (lookupMap[k] !== backfillMap[k]) { valuesMatch = false; break; }
  }
}
check('inboxLookups CATEGORY_TO_FOLDER and backfill copy have identical values', !!valuesMatch);

// ── 3. messageInboxController.js — ZERO_COUNTS + aggregation + priority filter ──
console.log('\n3. backend/controllers/messageInboxController.js');
const ctrlSrc = readFile('backend/controllers/messageInboxController.js');

check('ZERO_COUNTS includes executive_brief',
  /executive_brief:\s*0/.test(ctrlSrc));

check('Aggregation pipeline sums EXECUTIVE_BRIEF folder',
  /executive_brief:\s*\{\s*\$sum:\s*\{\s*\$cond:\s*\[\{\s*\$eq:\s*\['\$folder',\s*'EXECUTIVE_BRIEF'\]/.test(ctrlSrc));

check('GET /messages accepts ?priority= filter',
  /req\.query\.priority/.test(ctrlSrc));

check('Priority filter passes through to filter.priority',
  /filter\.priority\s*=/.test(ctrlSrc));

// ── 4. Migration script exists + syntax-checks ──
console.log('\n4. backend/scripts/migrateExecutiveBriefFolder.js');
const migPath = path.join(REPO, 'backend/scripts/migrateExecutiveBriefFolder.js');
check('Migration script file exists', fs.existsSync(migPath));
const migSrc = fs.existsSync(migPath) ? fs.readFileSync(migPath, 'utf8') : '';
check('Migration script supports --apply flag',
  /process\.argv\.includes\('--apply'\)/.test(migSrc));
check('Migration script handles MESSAGE_FOLDERS lookup',
  /category:\s*'MESSAGE_FOLDERS'/.test(migSrc));
check('Migration script handles INBOX_HIDDEN_FOLDERS_BY_ROLE lookup',
  /category:\s*'INBOX_HIDDEN_FOLDERS_BY_ROLE'/.test(migSrc));
check('Migration script re-points briefing rows to EXECUTIVE_BRIEF',
  /folder:\s*'EXECUTIVE_BRIEF'/.test(migSrc));

// ── 5. Frontend wiring ──
console.log('\n5. Frontend wiring');
const navSrc = readFile('frontend/src/components/common/inbox/InboxFolderNav.jsx');
check('InboxFolderNav imports Newspaper icon',
  /from 'lucide-react'[\s\S]*Newspaper/.test(navSrc));
check('ICON_BY_CODE.EXECUTIVE_BRIEF maps to Newspaper',
  /EXECUTIVE_BRIEF:\s*Newspaper/.test(navSrc));

const pageSrc = readFile('frontend/src/pages/common/InboxPage.jsx');
check('InboxPage DEFAULT_FOLDERS includes EXECUTIVE_BRIEF',
  /code:\s*'EXECUTIVE_BRIEF',\s*label:\s*'Executive Brief',\s*sort_order:\s*5/.test(pageSrc));
check('InboxPage has priorityFilter state',
  /useState\('all'\);[\s\S]{0,200}priorityFilter/.test(pageSrc) || /\[priorityFilter,\s*setPriorityFilter\]\s*=\s*useState/.test(pageSrc));
check('InboxPage threads priority param into messageService.list',
  /params\.priority\s*=\s*priorityFilter/.test(pageSrc));
check('InboxPage renders priority chip row only inside AI_AGENT_REPORTS',
  /activeFolder === 'AI_AGENT_REPORTS'[\s\S]{0,200}ip-prio-row/.test(pageSrc));
check('InboxPage chip set covers high + important + normal + low + all',
  /'high'[\s\S]*?'important'[\s\S]*?'normal'[\s\S]*?'low'/.test(pageSrc));

// ── 6. Banner copy ──
console.log('\n6. Banner copy (PageGuide + WorkflowGuide)');
const pageGuideSrc = readFile('frontend/src/components/common/PageGuide.jsx');
check('PageGuide inbox banner mentions Executive Brief',
  /Executive Brief/.test(pageGuideSrc));
check('PageGuide inbox banner mentions priority chips',
  /Priority chips/i.test(pageGuideSrc));

const wfSrc = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check('WorkflowGuide inbox banner mentions Executive Brief',
  /Executive Brief folder \(Phase G9\.R11\)/.test(wfSrc));
check('WorkflowGuide inbox banner mentions priority chips',
  /priority chips/i.test(wfSrc));

// ── Summary ──
console.log('\n────────────────────────────────────────');
console.log(`Result: ${GRN}${passed} passed${RST}, ${failed > 0 ? RED : GRN}${failed} failed${RST}`);
if (failed > 0) {
  console.log(`\n${RED}Failures:${RST}`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log(`${GRN}All ${passed} checks passed.${RST}`);
process.exit(0);
