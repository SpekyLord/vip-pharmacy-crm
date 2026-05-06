#!/usr/bin/env node
/**
 * Healthcheck — Phase VIP-1.J / J2.2 PS-Eligibility Auto-Flip
 *
 * Static contract verifier (no DB connection). Asserts the wiring chain is
 * intact end-to-end so a refactor cannot silently sever the auto-flip:
 *   service exports the public API
 *   pnlCalc requires + invokes the helper after evaluateEligibility
 *   lookup seed has the PS_AUTO_FLIP_NOTIFY_ROLES category
 *   workflow banner mentions the flip behavior (Rule #1)
 *   PeopleMaster has withhold_active field
 *   Entity has withholding_active master switch
 *   MessageInbox model is reachable
 *
 * Exit code 0 = clean; 1 = at least one assert failed (with details printed).
 *
 * Usage: node backend/scripts/healthcheckPsAutoFlip.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
let failures = 0;
let passed = 0;

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function expect(cond, label) {
  if (cond) {
    passed += 1;
    process.stdout.write(`PASS  ${label}\n`);
  } else {
    failures += 1;
    process.stdout.write(`FAIL  ${label}\n`);
  }
}

process.stdout.write('Phase VIP-1.J / J2.2 — PS-Eligibility Auto-Flip Healthcheck\n');
process.stdout.write('============================================================\n\n');

// ─── Section 1: Service file exists + exports the public API ─────────────
process.stdout.write('Section 1 — psAutoFlipService.js contract\n');

const svc = read('backend/erp/services/psAutoFlipService.js');
expect(svc !== null, 'psAutoFlipService.js exists');

if (svc) {
  expect(/maybeAutoFlipPsEligibility/.test(svc), 'exports maybeAutoFlipPsEligibility');
  expect(/resolveNotifyRoles/.test(svc), 'exports resolveNotifyRoles');
  expect(/DEFAULT_NOTIFY_ROLES/.test(svc), 'exports DEFAULT_NOTIFY_ROLES');
  expect(/LOOKUP_CATEGORY/.test(svc), 'exports LOOKUP_CATEGORY constant');
  expect(/LOOKUP_CODE/.test(svc), 'exports LOOKUP_CODE constant');

  // Defaults match seed defaults so a missing lookup row never sends to the wrong audience.
  expect(/DEFAULT_NOTIFY_ROLES\s*=\s*\[\s*'admin',\s*'finance',\s*'president'\s*\]/.test(svc),
    'defaults are admin + finance + president');

  // Lookup wiring
  expect(/PS_AUTO_FLIP_NOTIFY_ROLES/.test(svc), 'references PS_AUTO_FLIP_NOTIFY_ROLES category');
  expect(/RECEIVE_PS_FLIP_ALERT/.test(svc), 'references RECEIVE_PS_FLIP_ALERT code');

  // Idempotency
  expect(/already_active/.test(svc), 'returns reason already_active when re-invoked');
  expect(/withhold_active\s*===\s*true/.test(svc), 'guards on existing withhold_active=true');

  // Persistence flip
  expect(/person\.withhold_active\s*=\s*true/.test(svc), 'flips PeopleMaster.withhold_active to true');
  expect(/await\s+person\.save\(\)/.test(svc), 'persists the flip via save()');

  // Notification audience resolution
  expect(/findNotificationRecipients/.test(svc), 'uses findNotificationRecipients');
  expect(/dispatchMultiChannel/.test(svc), 'uses dispatchMultiChannel for email + in-app + SMS');

  // MessageInbox surface configuration
  expect(/inAppPriority:\s*'high'/.test(svc), 'inbox priority is high');
  expect(/inAppRequiresAction:\s*true/.test(svc), 'inbox row requires action (acknowledge)');
  expect(/inAppFolder:\s*'ACTION_REQUIRED'/.test(svc), 'inbox row routes to ACTION_REQUIRED folder');
  expect(/inAppCategory:\s*'compliance_alert'/.test(svc), 'inbox category is compliance_alert');

  // Failure isolation per Rule #20 (workflow safety) + erpNotificationService pattern
  expect(/console\.warn\([^)]*notification failed/.test(svc),
    'warn-and-continue if notification fails');
  expect(/console\.error\([^)]*\[psAutoFlip\]/.test(svc),
    'top-level catch logs error without rethrowing');

  // Action payload includes deep-link to BIR posture page so the recipient
  // has a one-click path to the entity-level master switch.
  expect(/deep_link:\s*'\/erp\/bir'/.test(svc), 'inbox action_payload deep-links to /erp/bir');

  // Audience role list is lower-cased for case-insensitive comparison
  expect(/toLowerCase/.test(svc), 'role list is lower-cased before comparison');
}

// ─── Section 2: pnlCalc.js wires the hook ────────────────────────────────
process.stdout.write('\nSection 2 — pnlCalc.generatePnlReport hook wiring\n');

const pnlCalc = read('backend/erp/services/pnlCalc.js');
expect(pnlCalc !== null, 'pnlCalc.js exists');

if (pnlCalc) {
  expect(/require\(['"]\.\/psAutoFlipService['"]\)/.test(pnlCalc),
    'pnlCalc requires psAutoFlipService');
  expect(/maybeAutoFlipPsEligibility/.test(pnlCalc),
    'pnlCalc destructures maybeAutoFlipPsEligibility');

  // The hook must call AFTER evaluateEligibility (psResult has been computed)
  // and BEFORE the actual write (existing.save() / PnlReport.create) — the
  // earlier PnlReport.findOne(...) at the top of generatePnlReport is a
  // preliminary read for expense reconciliation, NOT the upsert. We anchor
  // on the WRITE (.save() / .create()) which is unambiguous.
  const evalIdx = pnlCalc.indexOf('await evaluateEligibility');
  const flipIdx = pnlCalc.indexOf('maybeAutoFlipPsEligibility(');
  const saveIdx = pnlCalc.indexOf('existing.save()');
  const createIdx = pnlCalc.indexOf('PnlReport.create(');
  // First write boundary = whichever appears first AND is positive
  const writeCandidates = [saveIdx, createIdx].filter((i) => i > 0);
  const writeIdx = writeCandidates.length > 0 ? Math.min(...writeCandidates) : -1;
  expect(evalIdx > 0, 'pnlCalc calls evaluateEligibility');
  expect(flipIdx > 0, 'pnlCalc invokes maybeAutoFlipPsEligibility');
  expect(writeIdx > 0, 'pnlCalc writes the upsert (existing.save / PnlReport.create)');
  expect(evalIdx > 0 && flipIdx > evalIdx, 'flip invoked AFTER evaluateEligibility');
  expect(flipIdx > 0 && writeIdx > flipIdx, 'flip invoked BEFORE upsert write');

  // Hook is called with all four required args
  expect(/maybeAutoFlipPsEligibility\(\s*\{[^}]*entityId[^}]*bdmId[^}]*period[^}]*psResult/.test(pnlCalc),
    'flip helper receives entityId + bdmId + period + psResult');

  // The hook is awaited but its result is discarded — failures are absorbed.
  // Verify the call is awaited (so the flip lands before the upsert) but is
  // NOT inside a try block that would block the caller.
  expect(/await\s+maybeAutoFlipPsEligibility/.test(pnlCalc),
    'flip helper is awaited for ordering, but errors are absorbed inside the helper');
}

// ─── Section 3: Lookup seed ──────────────────────────────────────────────
process.stdout.write('\nSection 3 — PS_AUTO_FLIP_NOTIFY_ROLES seed defaults\n');

const lookupCtl = read('backend/erp/controllers/lookupGenericController.js');
expect(lookupCtl !== null, 'lookupGenericController.js exists');

if (lookupCtl) {
  expect(/PS_AUTO_FLIP_NOTIFY_ROLES:\s*\[/.test(lookupCtl),
    'PS_AUTO_FLIP_NOTIFY_ROLES category seeded');
  expect(/code:\s*'RECEIVE_PS_FLIP_ALERT'/.test(lookupCtl),
    'RECEIVE_PS_FLIP_ALERT code seeded');

  // The seed should default to admin + finance + president (matching service defaults).
  // Capture the full category array — match through to a `],` on its own line so
  // the inner `roles: [...],` doesn't terminate the slice prematurely.
  const seedSlice = lookupCtl.match(/PS_AUTO_FLIP_NOTIFY_ROLES:\s*\[[\s\S]+?\n\s*\],/);
  expect(seedSlice !== null, 'seed entry parseable');
  if (seedSlice) {
    const slice = seedSlice[0];
    expect(/'admin'/.test(slice), 'seed includes admin');
    expect(/'finance'/.test(slice), 'seed includes finance');
    expect(/'president'/.test(slice), 'seed includes president');
    expect(/insert_only_metadata:\s*true/.test(slice),
      'insert_only_metadata=true (admin overrides preserved across re-seeds)');
    expect(/sort_order:\s*1/.test(slice), 'sort_order set');
    expect(/description:/.test(slice), 'description for Lookup Manager');
  }
}

// ─── Section 4: Banner update (Rule #1) ──────────────────────────────────
process.stdout.write('\nSection 4 — Profit Sharing workflow banner mentions auto-flip\n');

const banner = read('frontend/src/erp/components/WorkflowGuide.jsx');
expect(banner !== null, 'WorkflowGuide.jsx exists');

if (banner) {
  // Slice the profit-sharing entry to scope assertions
  const psSlice = banner.match(/'profit-sharing':\s*\{[\s\S]+?\},(?=\s*\n\s*\/\/|\s*\n\s*'[a-z])/);
  expect(psSlice !== null, 'profit-sharing banner entry parseable');
  if (psSlice) {
    const slice = psSlice[0];
    expect(/J2\.2/.test(slice), 'banner mentions J2.2');
    expect(/withhold_active/i.test(slice), 'banner mentions withhold_active');
    expect(/Entity\.withholding_active/i.test(slice), 'banner mentions entity master switch');
    expect(/PS_AUTO_FLIP_NOTIFY_ROLES/.test(slice), 'banner mentions lookup category for subscribers');
    expect(/\/erp\/bir/.test(slice), 'banner adds BIR posture next-step link');
  }
}

// ─── Section 5: Underlying schema fields exist ──────────────────────────
process.stdout.write('\nSection 5 — schema preconditions intact\n');

const peopleModel = read('backend/erp/models/PeopleMaster.js');
expect(peopleModel !== null, 'PeopleMaster.js exists');
if (peopleModel) {
  expect(/withhold_active:\s*\{\s*type:\s*Boolean/.test(peopleModel),
    'PeopleMaster.withhold_active field exists');
  expect(/user_id:\s*\{[^}]*ref:\s*'User'/.test(peopleModel),
    'PeopleMaster.user_id refs User (matches lookup query)');
  expect(/entity_id:\s*\{[^}]*ref:\s*'Entity'/.test(peopleModel),
    'PeopleMaster.entity_id refs Entity (multi-tenant scope)');
}

const entityModel = read('backend/erp/models/Entity.js');
expect(entityModel !== null, 'Entity.js exists');
if (entityModel) {
  expect(/withholding_active:\s*\{\s*type:\s*Boolean/.test(entityModel),
    'Entity.withholding_active master switch exists');
}

const psEngine = read('backend/erp/services/profitShareEngine.js');
expect(psEngine !== null, 'profitShareEngine.js exists');
if (psEngine) {
  expect(/exports\.evaluateEligibility|module\.exports\s*=\s*\{[^}]*evaluateEligibility/.test(psEngine),
    'profitShareEngine exports evaluateEligibility');
  // The return shape is what the auto-flip relies on:
  expect(/eligible:\s*true|eligible\s*=\s*true|eligible\s*=\s*false/.test(psEngine),
    'evaluateEligibility return shape carries eligible boolean');
  expect(/bdm_share/.test(psEngine), 'evaluateEligibility returns bdm_share');
  expect(/vip_share/.test(psEngine), 'evaluateEligibility returns vip_share');
  expect(/ps_products/.test(psEngine), 'evaluateEligibility returns ps_products');
}

// ─── Section 6: Notification dependency surface ─────────────────────────
process.stdout.write('\nSection 6 — erpNotificationService dependency surface\n');

const notifySvc = read('backend/erp/services/erpNotificationService.js');
expect(notifySvc !== null, 'erpNotificationService.js exists');
if (notifySvc) {
  expect(/findNotificationRecipients/.test(notifySvc),
    'findNotificationRecipients exists');
  expect(/dispatchMultiChannel/.test(notifySvc),
    'dispatchMultiChannel exists');
  // Both are exported
  expect(/findNotificationRecipients[\s\S]{0,400}\}/.test(
    (notifySvc.match(/module\.exports\s*=\s*\{[\s\S]+?\};/) || [''])[0]),
    'findNotificationRecipients is exported');
  expect(/dispatchMultiChannel[\s\S]{0,400}\}/.test(
    (notifySvc.match(/module\.exports\s*=\s*\{[\s\S]+?\};/) || [''])[0]),
    'dispatchMultiChannel is exported');
}

// ─── Section 7: MessageInbox shape ──────────────────────────────────────
process.stdout.write('\nSection 7 — MessageInbox shape supports the alert payload\n');

const inboxModel = read('backend/models/MessageInbox.js');
expect(inboxModel !== null, 'MessageInbox.js exists');
if (inboxModel) {
  expect(/folder:/.test(inboxModel), 'folder field exists');
  expect(/requires_action:/.test(inboxModel), 'requires_action field exists');
  expect(/action_type:/.test(inboxModel), 'action_type field exists');
  expect(/action_payload:/.test(inboxModel), 'action_payload field exists');
  expect(/priority:/.test(inboxModel), 'priority field exists');
  expect(/category:/.test(inboxModel), 'category field exists');
  expect(/recipientRole:/.test(inboxModel), 'recipientRole field exists');
  expect(/recipientUserId:/.test(inboxModel), 'recipientUserId field exists');
  expect(/entity_id:/.test(inboxModel), 'entity_id field exists (multi-tenant)');
}

// ─── Section 8: CLAUDE-ERP.md and PHASETASK-ERP.md updated ──────────────
process.stdout.write('\nSection 8 — Documentation closure\n');

const claudeErp = read('CLAUDE-ERP.md');
expect(claudeErp !== null, 'CLAUDE-ERP.md exists');
if (claudeErp) {
  expect(/J2\.2.*shipped|J2\.2.*✅|J2\.2.*SHIPPED/.test(claudeErp),
    'CLAUDE-ERP.md flips J2.2 from open to shipped');
}

const phaseTasks = read('docs/PHASETASK-ERP.md');
expect(phaseTasks !== null, 'docs/PHASETASK-ERP.md exists');
if (phaseTasks) {
  expect(/J2\.2.*shipped|J2\.2.*✅|J2\.2.*SHIPPED/.test(phaseTasks),
    'PHASETASK-ERP.md flips J2.2 from open to shipped');
}

// ─── Summary ────────────────────────────────────────────────────────────
process.stdout.write('\n============================================================\n');
process.stdout.write(`Result: ${passed} PASS / ${failures} FAIL\n`);
if (failures > 0) {
  process.stdout.write('\nHealthcheck FAILED — fix the issues above before shipping J2.2.\n');
  process.exit(1);
}
process.stdout.write('\nHealthcheck CLEAN — Phase J2.2 wiring contract intact.\n');
process.exit(0);
