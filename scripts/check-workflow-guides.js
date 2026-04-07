#!/usr/bin/env node
/**
 * Lint check: ensures every ERP page has either WorkflowGuide or is a
 * Control Center panel (covered by DEPENDENCY_GUIDE).
 *
 * Run: node scripts/check-workflow-guides.js
 * Exit code 0 = all pages covered, 1 = gaps found
 */
const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.join(__dirname, '..', 'frontend', 'src', 'erp', 'pages');
const CC_PATH = path.join(PAGES_DIR, 'ControlCenter.jsx');

// Pages that are exempt (utility, not user-facing, or the ControlCenter itself)
const EXEMPT = new Set([
  'ControlCenter.jsx',   // hosts DEPENDENCY_GUIDE panels
  'FoundationHealth.jsx', // CC overview panel (no workflow)
  'OcrTest.jsx',          // dev utility
  'PersonDetail.jsx',     // detail view, not a list/transaction page
  'PayslipView.jsx',      // read-only detail view
]);

// Detect Control Center panels from ControlCenter.jsx SECTIONS
function getControlCenterPanels() {
  const cc = fs.readFileSync(CC_PATH, 'utf-8');
  const panels = new Set();
  // Match: import('./PageName') patterns in SECTIONS
  const re = /import\(['"]\.\/(\w+)['"]\)/g;
  let m;
  while ((m = re.exec(cc)) !== null) {
    panels.add(m[1] + '.jsx');
  }
  return panels;
}

function main() {
  const ccPanels = getControlCenterPanels();
  const files = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.jsx'));

  const missing = [];
  const covered = { workflow: 0, dependency: 0, exempt: 0 };

  for (const file of files) {
    if (EXEMPT.has(file)) { covered.exempt++; continue; }

    const content = fs.readFileSync(path.join(PAGES_DIR, file), 'utf-8');
    const hasWorkflowGuide = content.includes('WorkflowGuide');
    const isCCPanel = ccPanels.has(file);

    if (hasWorkflowGuide) {
      covered.workflow++;
    } else if (isCCPanel) {
      covered.dependency++;
    } else {
      missing.push(file);
    }
  }

  console.log(`\nWorkflowGuide Coverage Report`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`  WorkflowGuide:    ${covered.workflow} pages`);
  console.log(`  CC/Dependency:    ${covered.dependency} pages`);
  console.log(`  Exempt:           ${covered.exempt} pages`);
  console.log(`  MISSING:          ${missing.length} pages`);
  console.log(`  Total:            ${files.length} pages`);

  if (missing.length > 0) {
    console.log(`\n⚠ Pages without WorkflowGuide or DEPENDENCY_GUIDE:`);
    for (const f of missing.sort()) {
      console.log(`  - ${f}`);
    }
    console.log(`\nAdd WorkflowGuide (standalone) or DEPENDENCY_GUIDE (Control Center panel) to these pages.`);
    process.exit(1);
  } else {
    console.log(`\n✓ All pages are covered.`);
    process.exit(0);
  }
}

main();
