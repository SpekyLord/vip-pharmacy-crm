/**
 * Healthcheck: Activity-aware per-diem tier rule wiring — Phase G4.5ee (Apr 30 2026)
 *
 * Statically verifies the end-to-end contract that an activity_type code
 * (OFFICE / FIELD / NO_WORK / OTHER / future-subscriber-defined) drives the
 * per-diem tier via the lookup-driven ACTIVITY_PERDIEM_RULES, with proper
 * cache invalidation, frontend mirror, and override-bypass semantics.
 *
 * Usage:
 *   node backend/scripts/healthcheckActivityPerdiemRules.js
 *
 * Exit code 0 = green. Exit code 1 = at least one check failed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const checks = [];

function check(label, condition, hint = '') {
  checks.push({ label, ok: !!condition, hint });
}

function readFile(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

// ── 1. perdiemCalc.js: tier rule resolver + cache + extended computePerdiemTier ──
const calc = readFile('backend/erp/services/perdiemCalc.js');
check(
  'perdiemCalc exposes ACTIVITY_PERDIEM_RULE_DEFAULTS with OFFICE/FIELD/OTHER/NO_WORK',
  calc
    && /ACTIVITY_PERDIEM_RULE_DEFAULTS\s*=\s*\{[\s\S]*OFFICE:\s*'AUTO_FULL'[\s\S]*FIELD:\s*'USE_THRESHOLDS'[\s\S]*OTHER:\s*'USE_THRESHOLDS'[\s\S]*NO_WORK:\s*'ZERO'[\s\S]*\}/.test(calc),
  'Inline DEFAULTS must list all 4 baseline activity codes so the resolver works on un-seeded entities.'
);
check(
  'perdiemCalc has VALID_TIER_RULES Set with all four rules',
  calc && /VALID_TIER_RULES\s*=\s*new\s+Set\(\[\s*'AUTO_FULL'\s*,\s*'AUTO_HALF'\s*,\s*'ZERO'\s*,\s*'USE_THRESHOLDS'/.test(calc),
  'Validation set must include all four tier_rule values so a malformed metadata.tier_rule is silently ignored.'
);
check(
  'perdiemCalc has _activityRulesCache with 60s TTL',
  calc && /_activityRulesCache\s*=\s*new\s+Map/.test(calc) && /ACTIVITY_RULE_CACHE_TTL_MS\s*=\s*60_?000/.test(calc),
  'Cache + 60s TTL must mirror PROXY_ENTRY_ROLES / PERDIEM_RATES pattern.'
);
check(
  'computePerdiemTier accepts options.activityRule and short-circuits AUTO_FULL/AUTO_HALF/ZERO',
  calc
    && /function computePerdiemTier\(mdCount, settings, compProfile, perdiemConfig, options\s*=\s*\{\}\)/.test(calc)
    && /options\.activityRule/.test(calc)
    && /activityRule\s*===\s*'AUTO_FULL'\s*\)\s*return\s*'FULL'/.test(calc)
    && /activityRule\s*===\s*'AUTO_HALF'\s*\)\s*return\s*'HALF'/.test(calc)
    && /activityRule\s*===\s*'ZERO'\s*\)\s*return\s*'ZERO'/.test(calc),
  'Activity rule must short-circuit BEFORE threshold resolution so OFFICE day = FULL ignoring MD count.'
);
check(
  'computePerdiemTier preserves USE_THRESHOLDS / unset → existing MD-threshold logic',
  calc
    && /USE_THRESHOLDS or unset/.test(calc)
    && /resolvePerdiemThresholds\(settings, compProfile, perdiemConfig\)/.test(calc),
  'When activityRule is USE_THRESHOLDS or unset, the function MUST fall through to existing MD-vs-threshold logic — preserves Phase G1.6 contract.'
);
check(
  'computePerdiemAmount forwards options to computePerdiemTier',
  calc && /function computePerdiemAmount\(mdCount, perdiemRate, settings, compProfile, perdiemConfig, options\s*=\s*\{\}\)/.test(calc)
       && /computePerdiemTier\(mdCount, settings, compProfile, perdiemConfig, options\)/.test(calc),
  'computePerdiemAmount(...) must accept and forward the options object so call sites with activityRule still get tier-aware rendering.'
);
check(
  'resolveActivityPerdiemRule(entityId, code) exists',
  calc && /async function resolveActivityPerdiemRule\(entityId, activityCode\)/.test(calc),
  'Single-code resolver — used by ad-hoc callers; map resolver is the bulk path.'
);
check(
  'resolveActivityPerdiemRuleMap(entityId) exists for bulk resolution',
  calc && /async function resolveActivityPerdiemRuleMap\(entityId\)/.test(calc),
  'Bulk-map resolver — preferred call shape for SMER controllers (1 DB read, then sync .map()).'
);
check(
  'getActivityRuleFromMap(rulesMap, activityCode) sync helper exists',
  calc && /function getActivityRuleFromMap\(rulesMap, activityCode\)/.test(calc),
  'Sync helper — used inside .map() over daily entries to avoid awaiting per row.'
);
check(
  'getActivityRuleFromMap defaults to USE_THRESHOLDS for missing/unknown codes',
  calc && /if \(!rulesMap \|\| !activityCode\) return 'USE_THRESHOLDS'/.test(calc),
  'Unknown activity codes must NOT silently change tier — fall back to legacy MD-threshold logic.'
);
check(
  'invalidateActivityPerdiemRuleCache(entityId) exists for hot reload',
  calc && /function invalidateActivityPerdiemRuleCache\(entityId\s*=\s*null\)/.test(calc),
  'Cache buster wired into lookupGenericController so admin edits propagate immediately.'
);
check(
  'perdiemCalc module.exports include G4.5ee API surface',
  calc
    && /module\.exports[\s\S]*resolveActivityPerdiemRule/.test(calc)
    && /module\.exports[\s\S]*resolveActivityPerdiemRuleMap/.test(calc)
    && /module\.exports[\s\S]*getActivityRuleFromMap/.test(calc)
    && /module\.exports[\s\S]*invalidateActivityPerdiemRuleCache/.test(calc),
  'All four new functions must be exported.'
);

// ── 2. Lookup seed defaults + cache-bust hook ──
const lookup = readFile('backend/erp/controllers/lookupGenericController.js');
check(
  'ACTIVITY_PERDIEM_RULES seed entry exists with all 4 codes + insert_only_metadata',
  lookup
    && /ACTIVITY_PERDIEM_RULES:\s*\[/.test(lookup)
    && /code:\s*'OFFICE'[\s\S]{0,400}tier_rule:\s*'AUTO_FULL'/.test(lookup)
    && /code:\s*'FIELD'[\s\S]{0,400}tier_rule:\s*'USE_THRESHOLDS'/.test(lookup)
    && /code:\s*'OTHER'[\s\S]{0,400}tier_rule:\s*'USE_THRESHOLDS'/.test(lookup)
    && /code:\s*'NO_WORK'[\s\S]{0,400}tier_rule:\s*'ZERO'/.test(lookup),
  'SEED_DEFAULTS.ACTIVITY_PERDIEM_RULES must seed all 4 baseline codes with the correct tier_rule.'
);
check(
  'ACTIVITY_PERDIEM_RULES seed rows use insert_only_metadata so admin tweaks survive re-seeds',
  lookup && /ACTIVITY_PERDIEM_RULES:\s*\[[\s\S]{0,2000}insert_only_metadata:\s*true/.test(lookup),
  'Admin-owned semantics — tier_rule edits via Control Center must persist across seedAll runs.'
);
check(
  'ACTIVITY_PERDIEM_RULES_CATEGORIES set declared',
  lookup && /ACTIVITY_PERDIEM_RULES_CATEGORIES\s*=\s*new\s+Set\(\['ACTIVITY_PERDIEM_RULES'\]\)/.test(lookup),
  'Cache-bust gate set must be defined so the 4 hook lines branch correctly.'
);
check(
  'invalidateActivityPerdiemRuleCache imported from perdiemCalc',
  lookup && /\{\s*invalidateActivityPerdiemRuleCache\s*\}\s*=\s*require\('\.\.\/services\/perdiemCalc'\)/.test(lookup),
  'Without the import, the cache-bust call sites are no-ops (ReferenceError at runtime).'
);
check(
  'cache-bust hook fires on create + update + remove + seedCategory (4 sites)',
  lookup
    && (lookup.match(/ACTIVITY_PERDIEM_RULES_CATEGORIES\.has\(/g) || []).length >= 4,
  'All 4 mutator paths must bust the cache so admin edits propagate within the same request, not 60s later.'
);

// ── 3. expenseController wiring (the high-blast-radius surface) ──
const expense = readFile('backend/erp/controllers/expenseController.js');
check(
  'expenseController imports resolveActivityPerdiemRuleMap + getActivityRuleFromMap',
  expense && /resolveActivityPerdiemRuleMap[\s\S]{0,80}getActivityRuleFromMap/.test(expense),
  'Both names must be on the destructure from ../services/perdiemCalc.'
);
check(
  'createSmer pre-resolves activity rule map BEFORE the daily_entries .map()',
  expense
    && /const activityRulesMap\s*=\s*await\s+resolveActivityPerdiemRuleMap\(req\.entityId\);[\s\S]{0,800}let dailyEntries\s*=\s*\(req\.body\.daily_entries[\s\S]{0,400}\.map\(/.test(expense),
  'createSmer must prefetch the rule map so the .map() callback can stay sync.'
);
check(
  'createSmer non-override branch passes { activityRule } to computePerdiemAmount',
  expense
    && /createSmer[\s\S]*?const activityRule\s*=\s*getActivityRuleFromMap\(activityRulesMap, entry\.activity_type\);[\s\S]{0,300}computePerdiemAmount\(entry\.md_count[^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*\{\s*activityRule\s*\}\)/.test(expense),
  'Non-override per-diem amount call MUST carry { activityRule } in createSmer.'
);
check(
  'createSmer override branch passes NO options (override always wins)',
  expense
    && /No options passed[\s\S]{0,200}computePerdiemAmount\(entry\.override_tier === 'FULL' \? 999 : 3, perdiemRate, settings, compProfile, perdiemConfig\);/.test(expense),
  'createSmer override path MUST NOT pass activityRule — admin force-FULL/HALF must always win. The pre-call comment should explicitly state this so future maintainers do not "helpfully" add the option.'
);
check(
  'updateSmer prefetches activity rule map and passes { activityRule } on non-override',
  expense
    && /updateSmer[\s\S]*?const activityRulesMap\s*=\s*await\s+resolveActivityPerdiemRuleMap\(smer\.entity_id\)/.test(expense)
    && /updateSmer[\s\S]*?getActivityRuleFromMap\(activityRulesMap, cleaned\.activity_type\)[\s\S]{0,300}\{\s*activityRule\s*\}/.test(expense),
  'updateSmer recompute path must mirror createSmer — same prefetch + same option pass-through.'
);
check(
  'remove_override revert path resolves activityRule for the reverted entry',
  expense
    && /remove_override[\s\S]*?resolveActivityPerdiemRuleMap\(smer\.entity_id\)[\s\S]{0,400}getActivityRuleFromMap\(activityRulesMap, entry\.activity_type\)[\s\S]{0,200}\{\s*activityRule\s*\}/.test(expense),
  'Reverting an override on an OFFICE day must return to AUTO_FULL, not the MD-threshold result the override was masking.'
);

// ── 4. Frontend mirror in Smer.jsx ──
const smerJsx = readFile('frontend/src/erp/pages/Smer.jsx');
check(
  'Smer.jsx fetches ACTIVITY_PERDIEM_RULES via useLookupOptions',
  smerJsx && /useLookupOptions\('ACTIVITY_PERDIEM_RULES'\)/.test(smerJsx),
  'Frontend must read the same lookup the backend reads.'
);
check(
  'Smer.jsx builds activityRuleByCode useMemo with fallback',
  smerJsx
    && /ACTIVITY_RULE_FALLBACK\s*=\s*useMemo\(/.test(smerJsx)
    && /OFFICE:\s*'AUTO_FULL'/.test(smerJsx)
    && /activityRuleByCode\s*=\s*useMemo\(/.test(smerJsx),
  'Inline fallback must mirror backend defaults so the page works even if the lookup endpoint fails.'
);
check(
  'computePerdiem accepts activityType arg + short-circuits AUTO_FULL/AUTO_HALF/ZERO',
  smerJsx
    && /const computePerdiem\s*=\s*\(count,\s*activityType\)\s*=>/.test(smerJsx)
    && /rule\s*===\s*'AUTO_FULL'/.test(smerJsx)
    && /rule\s*===\s*'AUTO_HALF'/.test(smerJsx)
    && /rule\s*===\s*'ZERO'/.test(smerJsx),
  'Frontend mirror must short-circuit on the same 3 rules so the on-screen tier matches what postSmer will compute.'
);
check(
  'handleEntryChange passes activity_type into computePerdiem',
  smerJsx && /computePerdiem\(updated\[index\]\.md_count \|\| 0,\s*updated\[index\]\.activity_type\)/.test(smerJsx),
  'Without this, picking OFFICE in the UI would not refresh the tier preview to FULL.'
);
check(
  'handleRemoveOverride passes activity_type into computePerdiem fallback',
  smerJsx && /computePerdiem\(e\.md_count \|\| 0,\s*e\.activity_type\)/.test(smerJsx),
  'Local-state revert path also needs the activity_type so an OFFICE row returns to AUTO_FULL.'
);
check(
  'override-applied path forces tier WITHOUT activity rule (override always wins)',
  smerJsx && /computePerdiem\(tier === 'FULL' \? 999 : 3\)/.test(smerJsx),
  'Override-applied per-diem amount calc MUST NOT pass activity_type — that path is meant to bypass activity rule.'
);
check(
  'Smer.jsx renders activity-rule banner only when at least one non-USE_THRESHOLDS rule exists',
  smerJsx
    && /Activity-driven per-diem/.test(smerJsx)
    && /interesting\.length === 0\)\s*return null/.test(smerJsx),
  'Pharma-default subscribers (all USE_THRESHOLDS) should see no banner; AUTO_FULL/AUTO_HALF/ZERO subscribers see explanatory copy.'
);

// ── 5. WorkflowGuide narrative ──
const wfg = readFile('frontend/src/erp/components/WorkflowGuide.jsx');
check(
  'WORKFLOW_GUIDES.smer mentions Phase G4.5ee + ACTIVITY_PERDIEM_RULES',
  wfg && /Phase G4\.5ee[\s\S]{0,400}ACTIVITY_PERDIEM_RULES/.test(wfg),
  'SMER tip must explain the activity-aware behavior so users know OFFICE day = AUTO_FULL.'
);

// ── 6. Backward compat — non-override existing call sites still resolve via Phase G1.6 chain ──
check(
  'CRM-Pull preview (getSmerCrmMdCounts) intentionally NOT migrated — preview shows MD-threshold-based tier',
  expense
    && /\/\/ Phase G1\.6 — pass perdiemConfig so per-role thresholds apply[\s\S]{0,200}computePerdiemAmount\(crmData\.md_count, perdiemRate, settings, compProfile, perdiemConfig\);/.test(expense),
  'CRM Pull is the FIRST-load preview before the BDM picks activity_type. After save, createSmer applies the activity rule. Documented in CLAUDE-ERP.md G4.5ee section.'
);
check(
  'override-display in approval queue (universalApprovalService) intentionally NOT migrated',
  readFile('backend/erp/services/universalApprovalService.js')
    && /requestedAmount[\s\S]{0,300}computePerdiemAmount\(requestedMd,\s*smer\.perdiem_rate,\s*settings,\s*undefined,\s*perdiemConfig\)\.amount/.test(readFile('backend/erp/services/universalApprovalService.js') || ''),
  'Override-display path uses fake md_count (999/3) to emulate FULL/HALF — override always wins, no activity rule.'
);
check(
  'override-approval apply (universalApprovalController) intentionally NOT migrated',
  readFile('backend/erp/controllers/universalApprovalController.js')
    && /computePerdiemAmount\(tier === 'FULL' \? 999 : 3,\s*smer\.perdiem_rate,\s*settings,\s*compProfile,\s*perdiemConfig\)/.test(readFile('backend/erp/controllers/universalApprovalController.js') || ''),
  'Approval-apply path also override-style — no activity rule passed, by design.'
);

// ── Output ──
let failed = 0;
console.log('\nActivity-aware Per-Diem Tier Rule (Phase G4.5ee) wiring healthcheck');
console.log('==================================================================');
checks.forEach((c, i) => {
  const status = c.ok ? '✓' : '✗';
  const line = `${String(i + 1).padStart(2, ' ')}. ${status}  ${c.label}`;
  console.log(line);
  if (!c.ok) {
    failed += 1;
    if (c.hint) console.log(`     hint: ${c.hint}`);
  }
});
console.log('------------------------------------------------------------------');
console.log(`${checks.length - failed} / ${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
