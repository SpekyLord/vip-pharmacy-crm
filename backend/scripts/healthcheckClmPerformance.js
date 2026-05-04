#!/usr/bin/env node
/**
 * Healthcheck — Phase D.4c CLM Pitch Performance wiring (May 2026).
 *
 * Static-asserts the 22-point wiring contract for the new admin coaching
 * surface at /admin/statistics → CLM Performance tab. Mirrors the pattern
 * established by healthcheckTeamActivity.js + healthcheckClmIdempotency.js.
 *
 * Sections:
 *   1. clmController.getPerformanceMatrix — exists + entity-scoped + 3 pipelines
 *   2. clmRoutes mounts /sessions/performance with adminOnly BEFORE /:id generic
 *   3. clmPerformanceThresholds.js — DEFAULTS + getThresholds + invalidate
 *   4. lookupGenericController seeds CLM_PERFORMANCE_THRESHOLDS w/ 5 keys
 *   5. clmService.getPerformanceMatrix — passes params, hits the right path
 *   6. StatisticsPage.jsx — tab button + tab body + state + lazy-load
 *
 * Run: node backend/scripts/healthcheckClmPerformance.js
 *      → exit 0 = clean, exit 1 = wiring gap
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let pass = 0;
let fail = 0;

function check(label, ok, hint) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    pass++;
  } else {
    console.log(`  ✗ ${label}${hint ? `   — ${hint}` : ''}`);
    fail++;
  }
}

console.log('Healthcheck — Phase D.4c CLM Pitch Performance');
console.log('═'.repeat(60));

// ── 1. clmController.getPerformanceMatrix ──────────────────────────
console.log('\n1. backend/controllers/clmController.js');
console.log('─'.repeat(60));
const ctrl = read('backend/controllers/clmController.js');
check(
  'requires clmPerformanceThresholds helper',
  /require\(['"]\.\.\/utils\/clmPerformanceThresholds['"]\)/.test(ctrl),
  'getThresholds: getClmPerformanceThresholds'
);
check(
  'getPerformanceMatrix is defined',
  /const getPerformanceMatrix\s*=\s*asyncHandler/.test(ctrl)
);
check(
  'exports getPerformanceMatrix',
  /module\.exports\s*=\s*\{[^}]*getPerformanceMatrix/.test(ctrl)
);
check(
  'enforces status: completed match',
  /getPerformanceMatrix[\s\S]*?status:\s*['"]completed['"]/.test(ctrl)
);
check(
  'resolves entity_id via resolveEntityId (Rule #21)',
  /getPerformanceMatrix[\s\S]*?resolveEntityId\(req\)/.test(ctrl)
);
check(
  'has bdmComparison aggregation (group by user)',
  /getPerformanceMatrix[\s\S]*?\$group:\s*\{\s*_id:\s*['"]\$user['"]/.test(ctrl)
);
check(
  'has slidePerformance aggregation (unwind slideEvents)',
  /getPerformanceMatrix[\s\S]*?\$unwind:[^}]*slideEvents/.test(ctrl)
);
check(
  'has bdmProductMatrix aggregation (group by user × product)',
  /getPerformanceMatrix[\s\S]*?\$group:\s*\{\s*_id:\s*\{\s*user:\s*['"]\$user['"]/.test(ctrl)
);
check(
  'returns thresholds in response payload',
  /getPerformanceMatrix[\s\S]*?thresholds,/.test(ctrl)
);
check(
  'computes conversionRate (interested + already_partner)',
  /interested.*already_partner|alreadyPartnerCount/.test(ctrl)
);
check(
  'flags earlyExitCount (slidesViewedCount < 4)',
  /earlyExitCount/.test(ctrl) && /\$lt:\s*\[\s*\{\s*\$ifNull:\s*\[\s*['"]\$slidesViewedCount/.test(ctrl)
);

// ── 2. clmRoutes mount ─────────────────────────────────────────────
console.log('\n2. backend/routes/clmRoutes.js');
console.log('─'.repeat(60));
const routes = read('backend/routes/clmRoutes.js');
check(
  'imports getPerformanceMatrix',
  /getPerformanceMatrix,?\s*$/m.test(routes) || /getPerformanceMatrix\s*,/.test(routes)
);
check(
  'mounts GET /sessions/performance with adminOnly',
  /router\.get\(['"]\/sessions\/performance['"]\s*,\s*adminOnly\s*,\s*getPerformanceMatrix/.test(routes)
);
const perfIdx = routes.indexOf("/sessions/performance");
const idIdx = routes.indexOf("/sessions/:id");
check(
  '/sessions/performance is mounted BEFORE /sessions/:id (route order)',
  perfIdx > 0 && idIdx > 0 && perfIdx < idIdx,
  'Express matches /:id literally if listed first'
);

// ── 3. clmPerformanceThresholds helper ─────────────────────────────
console.log('\n3. backend/utils/clmPerformanceThresholds.js');
console.log('─'.repeat(60));
check(
  'file exists',
  exists('backend/utils/clmPerformanceThresholds.js')
);
const thresh = exists('backend/utils/clmPerformanceThresholds.js')
  ? read('backend/utils/clmPerformanceThresholds.js')
  : '';
check(
  'exports getThresholds + invalidate + DEFAULTS',
  /module\.exports\s*=\s*\{[\s\S]*getThresholds[\s\S]*invalidate[\s\S]*DEFAULTS/.test(thresh)
);
check(
  'DEFAULTS includes 5 expected keys',
  /min_avg_dwell_seconds_per_slide/.test(thresh)
    && /target_avg_session_minutes/.test(thresh)
    && /target_conversion_rate_pct/.test(thresh)
    && /min_slides_viewed/.test(thresh)
    && /flag_below_total_sessions/.test(thresh)
);
check(
  'queries Lookup with category=CLM_PERFORMANCE_THRESHOLDS',
  /category:\s*['"]CLM_PERFORMANCE_THRESHOLDS['"]/.test(thresh)
);
check(
  'falls back to DEFAULTS on lookup failure',
  /catch[\s\S]*using defaults/.test(thresh)
);
check(
  'has TTL_MS cache + invalidate',
  /const TTL_MS\s*=/.test(thresh) && /function invalidate/.test(thresh)
);

// ── 4. Lookup seed ─────────────────────────────────────────────────
console.log('\n4. backend/erp/controllers/lookupGenericController.js');
console.log('─'.repeat(60));
const seeds = read('backend/erp/controllers/lookupGenericController.js');
check(
  'CLM_PERFORMANCE_THRESHOLDS seed entry exists',
  /CLM_PERFORMANCE_THRESHOLDS:\s*\[/.test(seeds)
);
check(
  'seed row carries all 5 metadata keys',
  /CLM_PERFORMANCE_THRESHOLDS:\s*\[[^\]]*min_avg_dwell_seconds_per_slide[^\]]*target_avg_session_minutes[^\]]*target_conversion_rate_pct[^\]]*min_slides_viewed[^\]]*flag_below_total_sessions/.test(seeds)
);
check(
  'seed row uses insert_only_metadata: true',
  /CLM_PERFORMANCE_THRESHOLDS:\s*\[[^\]]*insert_only_metadata:\s*true/.test(seeds)
);

// ── 5. Frontend service ────────────────────────────────────────────
console.log('\n5. frontend/src/services/clmService.js');
console.log('─'.repeat(60));
const svc = read('frontend/src/services/clmService.js');
check(
  'getPerformanceMatrix is defined',
  /getPerformanceMatrix:\s*async/.test(svc)
);
check(
  'hits /clm/sessions/performance',
  /\/clm\/sessions\/performance/.test(svc)
);

// ── 6. Frontend StatisticsPage wiring ──────────────────────────────
console.log('\n6. frontend/src/pages/admin/StatisticsPage.jsx');
console.log('─'.repeat(60));
const stats = read('frontend/src/pages/admin/StatisticsPage.jsx');
check(
  'imports clmService',
  /import\s+clmService\s+from\s+['"]\.\.\/\.\.\/services\/clmService['"]/.test(stats)
);
check(
  'state — clmPerformance + clmPerformanceLoading',
  /const \[clmPerformance, setClmPerformance\]/.test(stats)
    && /const \[clmPerformanceLoading, setClmPerformanceLoading\]/.test(stats)
);
check(
  'fetchClmPerformance calls clmService.getPerformanceMatrix',
  /fetchClmPerformance[\s\S]*clmService\.getPerformanceMatrix\(\)/.test(stats)
);
check(
  'lazy-load on activeTab=clm-performance',
  /activeTab\s*===\s*['"]clm-performance['"][\s\S]*fetchClmPerformance/.test(stats)
);
check(
  'tab button — clm-performance with badge for flagged BDMs',
  /activeTab\s*===\s*['"]clm-performance['"]/.test(stats)
    && /CLM Performance/.test(stats)
);
check(
  'tab body — renders <CLMPerformanceTab',
  /<CLMPerformanceTab/.test(stats)
);
check(
  'CLMPerformanceTab component is defined',
  /const CLMPerformanceTab\s*=\s*\(/.test(stats)
);
check(
  'CLMPerformanceTab renders 3 panels (BDM Comparison, Slide Performance, Top Products)',
  /BDM Comparison/.test(stats)
    && /Slide Performance/.test(stats)
    && /Top Products/.test(stats)
);
check(
  'Refresh handler covers clm-performance',
  /activeTab === ['"]clm-performance['"]\)\s*\{\s*fetchClmPerformance/.test(stats)
);

// ── Summary ────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
const total = pass + fail;
if (fail === 0) {
  console.log(`✓ ${pass}/${total} CLM Pitch Performance wiring intact end-to-end.`);
  process.exit(0);
} else {
  console.log(`✗ ${fail} of ${total} assertions failed.`);
  process.exit(1);
}
