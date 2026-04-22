/**
 * Phase G1.5 — Staging Smoke Test Runner
 *
 * Exercises the new per-diem config + CRM bridge + locality/province paths
 * against a live MongoDB connection (staging only — NEVER run against prod).
 *
 * Two test suites:
 *
 * A) Service-layer suite (always runs; only needs DB)
 *   1. resolvePerdiemConfig happy path
 *   2. resolvePerdiemConfig missing / invalid / inactive row → ApiError(400)
 *   3. getDailyMdCounts happy path + structured "City, Province"
 *   4. getDailyMdCounts skipFlagged filter
 *   5. getDailyMdCounts legacy fallback (null locality → clinicOfficeAddress)
 *   6. PERDIEM_RATES metadata toggle (allow_weekend)
 *
 * B) HTTP-layer suite (only runs if server is reachable)
 *   7. POST /api/doctors persists locality + province + clientType
 *   8. PUT /api/doctors/:id persists locality + province updates
 *   9. POST /api/clients persists locality + province + clientType (BDM flow)
 *  10. PUT /api/clients/:id persists locality + province + clientType updates
 *
 *   Suite B would have caught the April 22 post-audit bug (Client/Doctor controllers
 *   were dropping locality/province via their destructuring / allowlist contracts).
 *   Configure admin + BDM credentials via env vars — see CONFIG section below.
 *
 * What it still does NOT cover (manual test required):
 *   - UI-level error toast rendering (HTTP 400 surface in SMER create page)
 *   - Cascading dropdown client-side behavior
 *   - Full SMER create → validate → submit → POST journal flow
 *
 * Data isolation: creates test records with prefix `SMOKE_G15_` under a test
 * entity (`SMOKE_G15_ENTITY`). Cleanup runs on exit regardless of pass/fail.
 *
 * Usage (from backend/):
 *   node erp/scripts/smokeTestPhaseG15.js                  # service-layer only
 *   SMOKE_API_URL=http://localhost:5000 \\
 *   SMOKE_ADMIN_EMAIL=admin@vipcrm.com \\
 *   SMOKE_ADMIN_PASSWORD=Admin123!@# \\
 *   SMOKE_BDM_EMAIL=juan@vipcrm.com \\
 *   SMOKE_BDM_PASSWORD=BDM123!@# \\
 *   node erp/scripts/smokeTestPhaseG15.js                  # + HTTP suite
 *
 * Exit code: 0 = all pass, 1 = any fail
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const connectDB = require('../../config/db');

const PREFIX = 'SMOKE_G15';
const TEST_ENTITY_NAME = `${PREFIX}_ENTITY`;

const results = { pass: 0, fail: 0, details: [] };

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function log(...args) { console.log(...args); }
function pass(name) { results.pass++; results.details.push({ name, status: 'PASS' }); log(`  ✓ PASS: ${name}`); }
function fail(name, err) { results.fail++; results.details.push({ name, status: 'FAIL', err: err.message }); log(`  ✗ FAIL: ${name}\n    ${err.message}`); }

async function runTest(name, fn) {
  try { await fn(); pass(name); } catch (e) { fail(name, e); }
}

// ═══════════════════════════════════════════
// SETUP / CLEANUP
// ═══════════════════════════════════════════

async function cleanup() {
  const Entity = require('../models/Entity');
  const Lookup = require('../models/Lookup');
  const Doctor = require('../../models/Doctor');
  const Visit = require('../../models/Visit');
  const User = require('../../models/User');

  // Always scope by prefix — NOT by entity existence. Previous runs may have
  // left orphans (e.g., user created before doctor creation failed) that outlive
  // the entity cleanup. Case-insensitive on both because Mongoose lowercases
  // emails and the firstName may be persisted with different casing normalization.
  const entity = await Entity.findOne({ entity_name: TEST_ENTITY_NAME }).lean();
  const userIds = (await User.find({ email: { $regex: new RegExp(`^${PREFIX}_`, 'i') } }).select('_id').lean()).map(u => u._id);
  const doctorIds = (await Doctor.find({ firstName: { $regex: new RegExp(`^${PREFIX}_`, 'i') } }).select('_id').lean()).map(d => d._id);

  const r1 = userIds.length ? await Visit.deleteMany({ user: { $in: userIds } }) : { deletedCount: 0 };
  const r2 = doctorIds.length ? await Doctor.deleteMany({ _id: { $in: doctorIds } }) : { deletedCount: 0 };
  const r3 = userIds.length ? await User.deleteMany({ _id: { $in: userIds } }) : { deletedCount: 0 };
  const r4 = entity ? await Lookup.deleteMany({ entity_id: entity._id }) : { deletedCount: 0 };
  const r5 = entity ? await Entity.deleteOne({ _id: entity._id }) : { deletedCount: 0 };

  log(`  Cleanup: ${r1.deletedCount} visits, ${r2.deletedCount} doctors, ${r3.deletedCount} users, ${r4.deletedCount} lookups, ${r5.deletedCount} entity`);
}

async function setup() {
  const Entity = require('../models/Entity');
  const Lookup = require('../models/Lookup');
  const Doctor = require('../../models/Doctor');
  const Visit = require('../../models/Visit');
  const User = require('../../models/User');

  // Create test entity — PARENT so the SUBSIDIARY post-save auto-seed hook
  // doesn't fire and pollute real entities' lookup tables.
  const entity = await Entity.create({
    entity_name: TEST_ENTITY_NAME,
    short_name: 'SMOKE',
    entity_type: 'PARENT',
    status: 'ACTIVE',
  });

  // Seed PERDIEM_RATES.BDM with pharma defaults
  await Lookup.create({
    entity_id: entity._id,
    category: 'PERDIEM_RATES',
    code: 'BDM',
    label: 'Smoke test BDM rate',
    metadata: {
      rate_php: 800,
      eligibility_source: 'visit',
      skip_flagged: true,
      allow_weekend: false,
      full_tier_threshold: null,
      half_tier_threshold: null,
    },
    is_active: true,
  });

  // Seed a province + locality for the structured doctor
  await Lookup.create({
    entity_id: entity._id,
    category: 'PH_PROVINCES',
    code: 'ILI',
    label: 'Iloilo',
    metadata: { region: 'VISAYAS' },
    is_active: true,
  });
  await Lookup.create({
    entity_id: entity._id,
    category: 'PH_LOCALITIES',
    code: 'ILOILO_CITY_ILI',
    label: 'Iloilo City',
    metadata: { type: 'city', province_code: 'ILI' },
    is_active: true,
  });

  // Create test BDM user
  const bdm = await User.create({
    name: `${PREFIX}_Juan Dela Cruz`,
    email: `${PREFIX}_juan@smoke.test`,
    password: 'SmokeTest123!@#',
    role: 'employee',
    isActive: true,
  });

  // Unique non-null referralCodes to sidestep a stale unique index on
  // partnerProgram.referralCode (commit 365a588 switched to a partial index,
  // but some envs may still have the legacy full unique index).
  const uniqSuffix = Date.now().toString(36).toUpperCase();

  // Structured doctor (has locality + province)
  const structDoctor = await Doctor.create({
    firstName: `${PREFIX}_Maria`,
    lastName: `${PREFIX}_Santos`,
    specialization: 'Internal Medicine',
    clinicOfficeAddress: 'Rm 302 MedArts Bldg, J.M. Basa St, Iloilo City, Iloilo',
    locality: 'Iloilo City',
    province: 'Iloilo',
    assignedTo: bdm._id,
    visitFrequency: 4,
    isActive: true,
    partnerProgram: { referralCode: `SMOKE${uniqSuffix}A` },
  });

  // Legacy doctor (no locality/province, only free-text address)
  const legacyDoctor = await Doctor.create({
    firstName: `${PREFIX}_Pedro`,
    lastName: `${PREFIX}_Reyes`,
    specialization: 'Cardiology',
    clinicOfficeAddress: 'Bacolod City, Negros Occidental',
    // locality + province intentionally left null
    assignedTo: bdm._id,
    visitFrequency: 4,
    isActive: true,
    partnerProgram: { referralCode: `SMOKE${uniqSuffix}B` },
  });

  return { entity, bdm, structDoctor, legacyDoctor };
}

async function createVisit(bdmId, doctorId, dateStr, photoFlags = []) {
  const Visit = require('../../models/Visit');
  const d = new Date(`${dateStr}T08:00:00+08:00`);
  return Visit.create({
    doctor: doctorId,
    user: bdmId,
    visitDate: d,
    status: 'completed',
    photos: [{ url: 'https://smoke.test/photo.jpg', capturedAt: d }],
    photoFlags: photoFlags.length ? photoFlags : undefined,
    location: { type: 'Point', coordinates: [122.5674, 10.7202], accuracy: 20 },
  });
}

// ═══════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════

async function testResolveHappyPath({ entity }) {
  const { resolvePerdiemConfig } = require('../services/perdiemCalc');
  const cfg = await resolvePerdiemConfig({ entityId: entity._id, role: 'BDM' });
  assert(cfg.rate_php === 800, `rate_php expected 800, got ${cfg.rate_php}`);
  assert(cfg.skip_flagged === true, `skip_flagged expected true, got ${cfg.skip_flagged}`);
  assert(cfg.allow_weekend === false, `allow_weekend expected false, got ${cfg.allow_weekend}`);
  assert(cfg.eligibility_source === 'visit', `eligibility_source expected 'visit', got ${cfg.eligibility_source}`);
}

async function testResolveMissingRow({ entity }) {
  const { resolvePerdiemConfig } = require('../services/perdiemCalc');
  try {
    await resolvePerdiemConfig({ entityId: entity._id, role: 'GHOST_ROLE' });
    throw new Error('expected throw for missing role, got none');
  } catch (e) {
    assert(e.statusCode === 400, `expected ApiError statusCode=400, got ${e.statusCode}`);
    assert(/PERDIEM_RATES row missing/.test(e.message), `expected "PERDIEM_RATES row missing" in message, got: ${e.message}`);
  }
}

async function testResolveInvalidRate({ entity }) {
  const Lookup = require('../models/Lookup');
  const { resolvePerdiemConfig } = require('../services/perdiemCalc');

  await Lookup.create({
    entity_id: entity._id,
    category: 'PERDIEM_RATES',
    code: 'BAD_RATE',
    label: 'invalid rate test',
    metadata: { rate_php: -100 },  // invalid: negative
    is_active: true,
  });
  try {
    await resolvePerdiemConfig({ entityId: entity._id, role: 'BAD_RATE' });
    throw new Error('expected throw for invalid rate, got none');
  } catch (e) {
    assert(e.statusCode === 400, `expected 400, got ${e.statusCode}`);
    assert(/rate_php invalid/.test(e.message), `expected "rate_php invalid" in message, got: ${e.message}`);
  }
}

async function testHappyPathAggregation({ bdm, structDoctor }) {
  const { getDailyMdCounts } = require('../services/smerCrmBridge');

  // CRM enforces the weekly-unique index `{ doctor, user, yearWeekKey }` —
  // one visit per MD per ISO-week max. Spread the 3 visits across 3 different
  // ISO weeks (W14, W15, W16 of 2026) using the same Wednesday each week.
  await createVisit(bdm._id, structDoctor._id, '2026-04-01');  // Wed, W14
  await createVisit(bdm._id, structDoctor._id, '2026-04-08');  // Wed, W15
  await createVisit(bdm._id, structDoctor._id, '2026-04-15');  // Wed, W16

  const counts = await getDailyMdCounts(bdm._id.toString(), '2026-04-01', '2026-04-15', { skipFlagged: true });

  assert(counts['2026-04-01']?.md_count === 1, `2026-04-01 md_count expected 1, got ${counts['2026-04-01']?.md_count}`);
  assert(counts['2026-04-08']?.md_count === 1, `2026-04-08 md_count expected 1, got ${counts['2026-04-08']?.md_count}`);
  assert(counts['2026-04-15']?.md_count === 1, `2026-04-15 md_count expected 1, got ${counts['2026-04-15']?.md_count}`);

  const loc = counts['2026-04-01'].locations;
  assert(loc === 'Iloilo City, Iloilo', `locations expected "Iloilo City, Iloilo", got "${loc}"`);
}

async function testFlaggedFilter({ bdm, structDoctor }) {
  const { getDailyMdCounts } = require('../services/smerCrmBridge');

  // Flagged visit in an ISO week that the happy-path test didn't touch (W17).
  // Happy-path uses W14/15/16 with this same doctor; colliding would trip the
  // weekly-unique CRM index.
  await createVisit(bdm._id, structDoctor._id, '2026-04-22', ['duplicate_photo']);  // Wed, W17

  const countsSkip = await getDailyMdCounts(bdm._id.toString(), '2026-04-22', '2026-04-22', { skipFlagged: true });
  const countsKeep = await getDailyMdCounts(bdm._id.toString(), '2026-04-22', '2026-04-22', { skipFlagged: false });

  assert(!countsSkip['2026-04-22'], `skipFlagged=true should drop flagged visit; got ${JSON.stringify(countsSkip['2026-04-22'])}`);
  assert(countsKeep['2026-04-22']?.md_count === 1, `skipFlagged=false should keep flagged visit; got ${countsKeep['2026-04-22']?.md_count}`);
}

async function testLegacyFallback({ bdm, legacyDoctor }) {
  const { getDailyMdCounts } = require('../services/smerCrmBridge');

  await createVisit(bdm._id, legacyDoctor._id, '2026-04-07');

  const counts = await getDailyMdCounts(bdm._id.toString(), '2026-04-07', '2026-04-07', { skipFlagged: true });
  const loc = counts['2026-04-07']?.locations;
  assert(loc && loc.includes('Bacolod City, Negros Occidental'),
    `legacy doctor should fall back to clinicOfficeAddress; got "${loc}"`);
}

async function testWeekendPolicy({ entity, bdm, structDoctor }) {
  const { resolvePerdiemConfig } = require('../services/perdiemCalc');
  const Lookup = require('../models/Lookup');

  // Default config: allow_weekend=false
  const cfg1 = await resolvePerdiemConfig({ entityId: entity._id, role: 'BDM' });
  assert(cfg1.allow_weekend === false, 'initial allow_weekend should be false');

  // Flip to true via lookup metadata update
  await Lookup.updateOne(
    { entity_id: entity._id, category: 'PERDIEM_RATES', code: 'BDM' },
    { $set: { 'metadata.allow_weekend': true } }
  );
  const cfg2 = await resolvePerdiemConfig({ entityId: entity._id, role: 'BDM' });
  assert(cfg2.allow_weekend === true, `post-update allow_weekend should be true, got ${cfg2.allow_weekend}`);

  // Restore for any later tests
  await Lookup.updateOne(
    { entity_id: entity._id, category: 'PERDIEM_RATES', code: 'BDM' },
    { $set: { 'metadata.allow_weekend': false } }
  );
}

async function testDeactivatedRow({ entity }) {
  const Lookup = require('../models/Lookup');
  const { resolvePerdiemConfig } = require('../services/perdiemCalc');

  // Deactivate the BDM row
  await Lookup.updateOne(
    { entity_id: entity._id, category: 'PERDIEM_RATES', code: 'BDM' },
    { $set: { is_active: false } }
  );
  try {
    await resolvePerdiemConfig({ entityId: entity._id, role: 'BDM' });
    throw new Error('expected throw for inactive row, got none');
  } catch (e) {
    assert(e.statusCode === 400, `expected 400, got ${e.statusCode}`);
  } finally {
    // Reactivate so subsequent tests / cleanup work
    await Lookup.updateOne(
      { entity_id: entity._id, category: 'PERDIEM_RATES', code: 'BDM' },
      { $set: { is_active: true } }
    );
  }
}

// ═══════════════════════════════════════════
// HTTP-LAYER TESTS (optional — requires server running + test creds)
// ═══════════════════════════════════════════
//
// Rationale: service-layer tests miss controller-level field whitelist bugs
// (the April 22 post-audit fix: Doctor/Client controllers were dropping
// locality/province via their destructuring contracts). These tests hit the
// actual Express routes so the request → controller → model path is exercised.

const API_URL = process.env.SMOKE_API_URL || 'http://localhost:5000';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const BDM_EMAIL = process.env.SMOKE_BDM_EMAIL;
const BDM_PASSWORD = process.env.SMOKE_BDM_PASSWORD;

// Very small cookie jar — CRM auth uses httpOnly Set-Cookie, so we capture the
// Set-Cookie headers from /api/auth/login and forward them on subsequent requests.
function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return '';
  // Node's fetch returns set-cookie as a single joined string or via getSetCookie().
  // Handle both shapes.
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return raw.map(c => c.split(';')[0]).join('; ');
}

async function httpLogin(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`login failed for ${email}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  // Node 18+ fetch: use headers.getSetCookie() if available, otherwise fall back to raw.
  const setCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : res.headers.get('set-cookie');
  const cookie = parseCookies(setCookies);
  if (!cookie) throw new Error(`login returned no cookies for ${email}`);
  return cookie;
}

async function httpJson(method, url, cookie, body) {
  const res = await fetch(`${API_URL}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, json, text };
}

async function serverReachable() {
  try {
    // Most Express apps have a health route; try a lightweight call first
    const res = await fetch(`${API_URL}/api/health`, { method: 'GET' });
    return res.ok || res.status === 404;  // 404 means server up but no /health — still fine
  } catch {
    return false;
  }
}

async function httpTestDoctorCreatePersistsLocality(adminCookie, fixtures) {
  const body = {
    firstName: `${PREFIX}_HTTP_Doc`,
    lastName: `${PREFIX}_Create`,
    specialization: 'Oncology',
    locality: 'Iloilo City',
    province: 'Iloilo',
    clientType: 'MD',
    assignedTo: fixtures.bdm._id.toString(),
  };
  const res = await httpJson('POST', '/api/doctors', adminCookie, body);
  assert(res.status === 201, `expected 201, got ${res.status}: ${res.text.slice(0, 200)}`);
  const created = res.json?.data;
  assert(created, `expected created doctor in response.data`);
  assert(created.locality === 'Iloilo City', `POST /api/doctors dropped locality (got "${created.locality}") — controller whitelist bug`);
  assert(created.province === 'Iloilo', `POST /api/doctors dropped province (got "${created.province}") — controller whitelist bug`);
  assert(created.clientType === 'MD', `POST /api/doctors dropped clientType (got "${created.clientType}")`);
  return created._id;
}

async function httpTestDoctorUpdatePersistsLocality(adminCookie, doctorId) {
  const body = { locality: 'Bacolod City', province: 'Negros Occidental' };
  const res = await httpJson('PUT', `/api/doctors/${doctorId}`, adminCookie, body);
  assert(res.status === 200, `expected 200, got ${res.status}: ${res.text.slice(0, 200)}`);
  const updated = res.json?.data;
  assert(updated?.locality === 'Bacolod City', `PUT /api/doctors dropped locality update (got "${updated?.locality}")`);
  assert(updated?.province === 'Negros Occidental', `PUT /api/doctors dropped province update (got "${updated?.province}")`);
}

async function httpTestClientCreatePersistsFields(bdmCookie) {
  const body = {
    firstName: `${PREFIX}_HTTP_Client`,
    lastName: `${PREFIX}_Create`,
    specialization: 'General Practice',
    clientType: 'PERSON',
    locality: 'Iloilo City',
    province: 'Iloilo',
  };
  const res = await httpJson('POST', '/api/clients', bdmCookie, body);
  assert(res.status === 201, `expected 201, got ${res.status}: ${res.text.slice(0, 200)}`);
  const created = res.json?.data;
  assert(created, `expected created client in response.data`);
  assert(created.locality === 'Iloilo City', `POST /api/clients dropped locality (got "${created.locality}") — controller whitelist bug`);
  assert(created.province === 'Iloilo', `POST /api/clients dropped province (got "${created.province}") — controller whitelist bug`);
  assert(created.clientType === 'PERSON', `POST /api/clients dropped clientType (got "${created.clientType}") — controller whitelist bug`);
  return created._id;
}

async function httpTestClientUpdatePersistsFields(bdmCookie, clientId) {
  const body = { locality: 'Bacolod City', province: 'Negros Occidental', clientType: 'PHARMACY' };
  const res = await httpJson('PUT', `/api/clients/${clientId}`, bdmCookie, body);
  assert(res.status === 200, `expected 200, got ${res.status}: ${res.text.slice(0, 200)}`);
  const updated = res.json?.data;
  assert(updated?.locality === 'Bacolod City', `PUT /api/clients dropped locality update (got "${updated?.locality}")`);
  assert(updated?.province === 'Negros Occidental', `PUT /api/clients dropped province update (got "${updated?.province}")`);
  assert(updated?.clientType === 'PHARMACY', `PUT /api/clients dropped clientType update (got "${updated?.clientType}")`);
}

async function httpCleanupRecords(ids) {
  // Delete via Mongoose (no HTTP delete endpoint ownership check risk).
  const Doctor = require('../../models/Doctor');
  const Client = require('../../models/Client');
  if (ids.doctorId) await Doctor.deleteOne({ _id: ids.doctorId });
  if (ids.clientId) await Client.deleteOne({ _id: ids.clientId });
}

async function runHttpSuite(fixtures) {
  // Skip conditions
  if (!await serverReachable()) {
    log('  (server not reachable at ' + API_URL + ' — skipping HTTP suite)');
    return;
  }
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !BDM_EMAIL || !BDM_PASSWORD) {
    log('  (SMOKE_ADMIN_* / SMOKE_BDM_* env vars not set — skipping HTTP suite)');
    log('  Set: SMOKE_ADMIN_EMAIL, SMOKE_ADMIN_PASSWORD, SMOKE_BDM_EMAIL, SMOKE_BDM_PASSWORD');
    return;
  }

  let adminCookie, bdmCookie, doctorId, clientId;
  try {
    adminCookie = await httpLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    bdmCookie = await httpLogin(BDM_EMAIL, BDM_PASSWORD);
  } catch (e) {
    log(`  (login failed — skipping HTTP suite: ${e.message})`);
    return;
  }

  try {
    await runTest('POST /api/doctors persists locality + province + clientType', async () => {
      doctorId = await httpTestDoctorCreatePersistsLocality(adminCookie, fixtures);
    });
    if (doctorId) {
      await runTest('PUT /api/doctors/:id persists locality + province updates', () =>
        httpTestDoctorUpdatePersistsLocality(adminCookie, doctorId));
    }
    await runTest('POST /api/clients persists locality + province + clientType', async () => {
      clientId = await httpTestClientCreatePersistsFields(bdmCookie);
    });
    if (clientId) {
      await runTest('PUT /api/clients/:id persists locality + province + clientType updates', () =>
        httpTestClientUpdatePersistsFields(bdmCookie, clientId));
    }
  } finally {
    try { await httpCleanupRecords({ doctorId, clientId }); } catch (e) { log(`  (http cleanup error: ${e.message})`); }
  }
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('REFUSED: NODE_ENV=production. This script creates and deletes test data; run against staging only.');
    process.exit(2);
  }

  await connectDB();
  log(`\nPhase G1.5 Smoke Test — connected to ${mongoose.connection.name}`);

  // Wipe any residue from prior run
  log('\n── pre-cleanup ──');
  await cleanup();

  let fixtures;
  try {
    log('\n── setup ──');
    fixtures = await setup();
    log(`  entity: ${fixtures.entity._id}`);
    log(`  bdm: ${fixtures.bdm._id}`);
    log(`  structured doctor: ${fixtures.structDoctor._id}`);
    log(`  legacy doctor: ${fixtures.legacyDoctor._id}`);

    log('\n── service-layer tests ──');
    await runTest('resolvePerdiemConfig happy path', () => testResolveHappyPath(fixtures));
    await runTest('resolvePerdiemConfig missing row throws 400', () => testResolveMissingRow(fixtures));
    await runTest('resolvePerdiemConfig invalid rate throws 400', () => testResolveInvalidRate(fixtures));
    await runTest('resolvePerdiemConfig inactive row throws 400', () => testDeactivatedRow(fixtures));
    await runTest('getDailyMdCounts happy path + structured "City, Province"', () => testHappyPathAggregation(fixtures));
    await runTest('getDailyMdCounts skipFlagged filter', () => testFlaggedFilter(fixtures));
    await runTest('getDailyMdCounts legacy fallback to clinicOfficeAddress', () => testLegacyFallback(fixtures));
    await runTest('PERDIEM_RATES metadata toggle (allow_weekend)', () => testWeekendPolicy(fixtures));

    log('\n── http-layer tests ──');
    await runHttpSuite(fixtures);
  } finally {
    log('\n── cleanup ──');
    try { await cleanup(); } catch (e) { log(`  cleanup error: ${e.message}`); }
    await mongoose.disconnect();
  }

  log('\n═══════════════════════════════════════════');
  log(`Summary: ${results.pass} pass, ${results.fail} fail`);
  log('═══════════════════════════════════════════\n');
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nFATAL:', err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
