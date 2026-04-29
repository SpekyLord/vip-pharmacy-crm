#!/usr/bin/env node
/**
 * Phase CSI-X2 — PO paste-text parser wiring health check.
 *
 * Static-analysis verification only — does NOT call the Anthropic API.
 * Confirms file existence + key wiring landmarks across:
 *   - backend regex parser
 *   - backend LLM parser
 *   - controller `parsePoText` + cache config
 *   - route mount
 *   - lookup seed
 *   - frontend service + page wiring
 *   - WorkflowGuide banner update
 *
 * Run:  node backend/scripts/healthcheckPoParser.js
 * Exit: 0 = all green, 1 = any failure
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, hint) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(`${label}${hint ? ` — ${hint}` : ''}`);
    console.log(`  ✗ ${label}${hint ? ` — ${hint}` : ''}`);
  }
}

function readFileSafe(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
  catch { return null; }
}

console.log('Phase CSI-X2 — PO paste-text parser wiring health check\n');

// ─────────────────────────────────────────────────────────────────────────
console.log('1. Backend regex parser');
const parserSrc = readFileSafe('backend/erp/services/poTextParser.js');
check('  poTextParser.js exists', !!parserSrc);
check('  exports parsePoTextRegex', !!parserSrc && /module\.exports\s*=\s*\{[^}]*parsePoTextRegex/.test(parserSrc));
check('  exports buildProductIndex', !!parserSrc && /buildProductIndex/.test(parserSrc));
check('  exports extractQty', !!parserSrc && /extractQty/.test(parserSrc));
check('  has STOPWORDS list', !!parserSrc && /STOPWORDS\s*=\s*new Set/.test(parserSrc));
check('  uses match-threshold default', !!parserSrc && /matchThreshold\s*!=\s*null\s*\?\s*opts\.matchThreshold\s*:/.test(parserSrc));
check('  returns coverage + low_confidence_count', !!parserSrc && /coverage:/.test(parserSrc) && /low_confidence_count/.test(parserSrc));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n2. Backend LLM parser');
const llmSrc = readFileSafe('backend/erp/services/poLlmParser.js');
check('  poLlmParser.js exists', !!llmSrc);
check('  imports @anthropic-ai/sdk', !!llmSrc && /require\(['"]@anthropic-ai\/sdk['"]\)/.test(llmSrc));
check('  exports parsePoTextLlm', !!llmSrc && /module\.exports\s*=\s*\{[^}]*parsePoTextLlm/.test(llmSrc));
check('  has SYSTEM_INSTRUCTION constant', !!llmSrc && /const SYSTEM_INSTRUCTION\s*=/.test(llmSrc));
check('  cache_control on system block', !!llmSrc && /cache_control:\s*\{\s*type:\s*['"]ephemeral['"]/.test(llmSrc));
check('  cache TTL 1h on catalog block', !!llmSrc && /ttl:\s*['"]1h['"]/.test(llmSrc));
check('  uses tool_choice with strict tool', !!llmSrc && /tool_choice:\s*\{\s*type:\s*['"]tool['"]/.test(llmSrc));
check('  output tool input_schema requires matched + ambiguous', !!llmSrc && /required:\s*\[['"]matched['"]\s*,\s*['"]ambiguous['"]\]/.test(llmSrc));
check('  defensive product_id validation', !!llmSrc && /productIdSet/.test(llmSrc));
check('  deterministic product sort by _id', !!llmSrc && /localeCompare/.test(llmSrc));
check('  default model is claude-haiku-4-5', !!llmSrc && /claude-haiku-4-5/.test(llmSrc));
check('  surfaces cache_read + cache_write usage', !!llmSrc && /cache_read_input_tokens/.test(llmSrc) && /cache_creation_input_tokens/.test(llmSrc));

// Smoke-load the regex parser and run a fixture (pure-JS, no DB needed)
console.log('\n3. Backend regex parser — runtime smoke');
let runtime = null;
try {
  runtime = require(path.join(ROOT, 'backend/erp/services/poTextParser.js'));
  check('  module loads without error', true);
} catch (e) {
  check('  module loads without error', false, e.message);
}
if (runtime) {
  const fixtureProducts = [
    { _id: 'p1', brand_name: 'Biogesic', generic_name: 'Paracetamol', dosage_strength: '500mg' },
    { _id: 'p2', brand_name: 'Amoxicillin', generic_name: 'Amoxicillin', dosage_strength: '500mg' },
    { _id: 'p3', brand_name: 'Cefuroxime', generic_name: 'Cefuroxime', dosage_strength: '500mg' }
  ];
  const fixtureText = '1. Amoxicillin 500mg x 50 boxes\nBiogesic 500mg - 100 tabs\nThanks po';
  let result;
  try {
    result = runtime.parsePoTextRegex(fixtureText, fixtureProducts);
    check('  parsePoTextRegex runs', true);
  } catch (e) {
    check('  parsePoTextRegex runs', false, e.message);
  }
  if (result) {
    check('  matches Amoxicillin line', result.matched.some(m => m.product_id === 'p2' && m.qty_ordered === 50));
    check('  matches Biogesic line', result.matched.some(m => m.product_id === 'p1' && m.qty_ordered === 100));
    check('  skips greeting/signature line', result.matched.length === 2);
    check('  computes coverage', typeof result.coverage === 'number');
    check('  used_llm flag is false', result.used_llm === false);
  }
}

// ─────────────────────────────────────────────────────────────────────────
console.log('\n4. Controller wiring');
const ctrlSrc = readFileSafe('backend/erp/controllers/hospitalPoController.js');
check('  imports parsePoTextRegex', !!ctrlSrc && /require\(['"]\.\.\/services\/poTextParser['"]\)/.test(ctrlSrc));
check('  imports parsePoTextLlm', !!ctrlSrc && /require\(['"]\.\.\/services\/poLlmParser['"]\)/.test(ctrlSrc));
check('  exports parsePoText', !!ctrlSrc && /parsePoText\s*$/m.test(ctrlSrc.slice(ctrlSrc.indexOf('module.exports'))));
check('  has getParserConfig with TTL', !!ctrlSrc && /getParserConfig/.test(ctrlSrc) && /PARSER_CONFIG_TTL_MS/.test(ctrlSrc));
check('  reads PO_TEXT_PARSER lookup', !!ctrlSrc && /category:\s*['"]PO_TEXT_PARSER['"]/.test(ctrlSrc));
check('  enforces llm_max_input_chars cap', !!ctrlSrc && /llm_max_input_chars/.test(ctrlSrc));
check('  fallback decision uses coverage_threshold', !!ctrlSrc && /coverage_threshold/.test(ctrlSrc));
check('  graceful LLM error fallback', !!ctrlSrc && /llmError/.test(ctrlSrc));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n5. Route mount');
const routeSrc = readFileSafe('backend/erp/routes/hospitalPoRoutes.js');
check('  POST /parse mounted', !!routeSrc && /router\.post\(['"]\/parse['"]/.test(routeSrc));
check('  /parse route registered before /:id', !!routeSrc && routeSrc.indexOf("'/parse'") < routeSrc.indexOf("'/:id'"));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n6. Lookup seed');
const lookupSrc = readFileSafe('backend/erp/controllers/lookupGenericController.js');
check('  PO_TEXT_PARSER category seeded', !!lookupSrc && /PO_TEXT_PARSER:\s*\[/.test(lookupSrc));
check('  PO_TEXT_PARSER has DEFAULT row', !!lookupSrc && /PO_TEXT_PARSER:[\s\S]{0,800}code:\s*['"]DEFAULT['"]/.test(lookupSrc));
check('  lookup uses insert_only_metadata', !!lookupSrc && /PO_TEXT_PARSER:[\s\S]{0,800}insert_only_metadata:\s*true/.test(lookupSrc));
check('  threshold defaults present', !!lookupSrc && /regex_match_threshold:\s*0\.65/.test(lookupSrc));
check('  llm_model points at haiku-4-5', !!lookupSrc && /llm_model:\s*['"]claude-haiku-4-5/.test(lookupSrc));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n7. Frontend wiring');
const svcSrc = readFileSafe('frontend/src/erp/services/hospitalPoService.js');
check('  hospitalPoService exports parsePoText', !!svcSrc && /export async function parsePoText/.test(svcSrc));
check('  hits /erp/hospital-pos/parse', !!svcSrc && /\/parse/.test(svcSrc));

const pageSrc = readFileSafe('frontend/src/erp/pages/HospitalPoEntry.jsx');
check('  HospitalPoEntry imports parsePoText', !!pageSrc && /import\s*\{[^}]*parsePoText[^}]*\}\s*from\s*['"][^'"]*hospitalPoService/.test(pageSrc));
check('  Parse button rendered', !!pageSrc && /Parse paste/.test(pageSrc));
check('  confidence pill helper present', !!pageSrc && /confidenceStyle/.test(pageSrc));
check('  Needs Review panel', !!pageSrc && /Needs review/i.test(pageSrc));
check('  override audit tag in submit payload', !!pageSrc && /\[parser-override\]/.test(pageSrc));
check('  parsed lines tracked with parsed flag', !!pageSrc && /parsed:\s*true/.test(pageSrc));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n8. WorkflowGuide banner');
const guideSrc = readFileSafe('frontend/src/erp/components/WorkflowGuide.jsx');
check('  hospital-po-entry banner mentions Phase X2 paste parser', !!guideSrc && /Phase X2/.test(guideSrc) && /Parse paste/.test(guideSrc));
check('  banner mentions PO_TEXT_PARSER lookup', !!guideSrc && /PO_TEXT_PARSER/.test(guideSrc));
check('  banner mentions confidence pill', !!guideSrc && /confidence pill/i.test(guideSrc));
check('  banner mentions parser-override audit', !!guideSrc && /parser-override/i.test(guideSrc));

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=========================================');
console.log(`Total: ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('All Phase CSI-X2 wiring checks passed.\n');
process.exit(0);
