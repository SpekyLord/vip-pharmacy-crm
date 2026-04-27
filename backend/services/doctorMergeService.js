/**
 * Doctor (VIP-Client) Merge Service — Phase A.5.5 (Apr 2026).
 *
 * Absorbs a "loser" Doctor record into a "winner" Doctor record by:
 *   1. Re-pointing every FK that references the loser → winner (across CRM
 *      and ERP collections).
 *   2. Defusing uniqueness collisions (Visit unique on {doctor,user,yearWeekKey},
 *      Schedule unique on {doctor,user,cycleNumber,scheduledWeek,scheduledDay},
 *      ProductAssignment partial-unique on {product,doctor,active=true},
 *      PatientMdAttribution unique on {entity,patient,doctor}) — colliding
 *      loser rows are NOT silently overwritten. Visits/Schedules get a
 *      sentinel suffix on the unique key; ProductAssignments/Attributions on
 *      the loser side get deactivated. The collision strategy is captured in
 *      the audit snapshot so rollback can restore the original state.
 *   3. Soft-deleting the loser (mergedInto + mergedAt + isActive=false). Hard
 *      delete is a separate cron job that runs after the 30-day rollback
 *      grace window.
 *   4. Persisting a DoctorMergeAudit row with the per-model cascade snapshot.
 *
 * Atomicity: when MongoDB supports transactions (replica-set / Atlas), every
 * cascade + the loser soft-delete runs inside a single session txn — partial
 * writes are impossible. On standalone (test fixtures), the txn is skipped
 * and the cascade runs sequentially; failure mid-cascade is partial but the
 * loser is NEVER soft-deleted unless every cascade step succeeded.
 *
 * Rule alignments:
 *   - #2 Wiring: model → service → controller → route → frontend page +
 *     sidebar + role-gate at every layer.
 *   - #3 Lookup-driven: VIP_CLIENT_LIFECYCLE_ROLES gates every action.
 *   - #19 Subscription-readiness: model manifest pattern lets a future
 *     subscriber add their own collection without editing service core —
 *     just append to CASCADE_MANIFEST.
 *   - #21 No silent self-fill: rollback re-points by recorded ID only;
 *     never falls back to "all records on the loser at rollback time".
 */

const mongoose = require('mongoose');
const Doctor = require('../models/Doctor');
const Visit = require('../models/Visit');
const ProductAssignment = require('../models/ProductAssignment');
const CommunicationLog = require('../models/CommunicationLog');
const Schedule = require('../models/Schedule');
const InviteLink = require('../models/InviteLink');
const CLMSession = require('../models/CLMSession');
const DoctorMergeAudit = require('../models/DoctorMergeAudit');

// ERP cross-DB models. Wrapped in try/catch require so a CRM-only deployment
// (a future spin-out where ERP isn't loaded) doesn't blow up on require time.
let ErpCollection = null;
let ErpMdProductRebate = null;
let ErpMdCapitationRule = null;
let ErpPatientMdAttribution = null;
let ErpPrfCalf = null;
try { ErpCollection = require('../erp/models/Collection'); } catch (_) {}
try { ErpMdProductRebate = require('../erp/models/MdProductRebate'); } catch (_) {}
try { ErpMdCapitationRule = require('../erp/models/MdCapitationRule'); } catch (_) {}
try { ErpPatientMdAttribution = require('../erp/models/PatientMdAttribution'); } catch (_) {}
try { ErpPrfCalf = require('../erp/models/PrfCalf'); } catch (_) {}

// ── Cascade manifest ──────────────────────────────────────────────────────
// Each entry is one FK-update site. `kind` selects the strategy:
//   - 'simple'      : updateMany({ field: loserId }) → { field: winnerId }
//   - 'nested-array': $[] positional update on a nested array path
//   - 'visit-week'  : Visit-specific collision defusion via yearWeekKey sentinel
//   - 'schedule'    : Schedule-specific collision defusion via day-slot sentinel
//   - 'pa-active'   : ProductAssignment partial-unique collision (deactivate loser)
//   - 'attribution' : PatientMdAttribution unique collision (deactivate loser)
//
// The manifest is the single source of truth — the preview, execute, and
// rollback paths all walk the same manifest. Adding a new Doctor FK in a
// future schema = appending one row here, no service-core edits.
function buildCascadeManifest() {
  return [
    // ── CRM models (default Mongoose connection) ──────────────────────────
    { model: Visit,             db: 'crm', field: 'doctor', kind: 'visit-week' },
    { model: ProductAssignment, db: 'crm', field: 'doctor', kind: 'pa-active' },
    { model: CommunicationLog,  db: 'crm', field: 'doctor', kind: 'simple' },
    { model: CommunicationLog,  db: 'crm', field: 'aiMatchSuggestion.doctorId', kind: 'simple' },
    { model: Schedule,          db: 'crm', field: 'doctor', kind: 'schedule' },
    { model: InviteLink,        db: 'crm', field: 'doctor', kind: 'simple' },
    { model: CLMSession,        db: 'crm', field: 'doctor', kind: 'simple' },
    // ── ERP models (cross-DB; same Atlas cluster today, separate physical DB
    // when Pharmacy SaaS spin-out lands per Rule 0d) ──────────────────────
    { model: ErpCollection,     db: 'erp', field: 'settled_csis.partner_tags.doctor_id', kind: 'nested-array' },
    { model: ErpCollection,     db: 'erp', field: 'settled_csis.md_rebate_lines.md_id',  kind: 'nested-array' },
    { model: ErpMdProductRebate,db: 'erp', field: 'doctor_id', kind: 'simple' },
    { model: ErpMdCapitationRule,db: 'erp', field: 'doctor_id', kind: 'simple' },
    { model: ErpPatientMdAttribution, db: 'erp', field: 'doctor_id', kind: 'attribution' },
    { model: ErpPrfCalf,        db: 'erp', field: 'partner_id', kind: 'simple' },
  ].filter((entry) => !!entry.model); // drop ERP rows when models couldn't load
}

// ── Helpers ───────────────────────────────────────────────────────────────

function snapshotDoctor(doc) {
  if (!doc) return null;
  return {
    firstName: doc.firstName,
    lastName: doc.lastName,
    vip_client_name_clean: doc.vip_client_name_clean,
    primaryAssignee: doc.primaryAssignee,
    partnership_status: doc.partnership_status,
    prc_license_number: doc.prc_license_number,
    isActive: doc.isActive,
  };
}

async function txOpts() {
  // Detect replica-set support; Atlas always has it. Returns options for
  // session.withTransaction or null on standalone Mongo (tests).
  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) return null;
    const status = await admin.replSetGetStatus().catch(() => null);
    if (status?.ok) return { readConcern: { level: 'local' }, writeConcern: { w: 'majority' } };
  } catch (_) {}
  return null;
}

// ── Preview ───────────────────────────────────────────────────────────────
// Read-only — returns counts per model + collision detection so admin sees
// blast radius before clicking Execute.
async function previewMerge({ winnerId, loserId }) {
  if (String(winnerId) === String(loserId)) {
    throw new Error('Winner and loser must be different Doctors');
  }
  const [winner, loser] = await Promise.all([
    Doctor.findById(winnerId).lean(),
    Doctor.findById(loserId).lean(),
  ]);
  if (!winner) throw new Error(`Winner Doctor ${winnerId} not found`);
  if (!loser) throw new Error(`Loser Doctor ${loserId} not found`);
  if (loser.mergedInto) {
    throw new Error(`Loser Doctor ${loserId} already merged into ${loser.mergedInto}`);
  }
  if (winner.mergedInto) {
    throw new Error(`Winner Doctor ${winnerId} is itself merged — pick the live record`);
  }

  const manifest = buildCascadeManifest();
  const cascade = [];
  for (const entry of manifest) {
    const count = await countLoserRows(entry, loserId);
    let collisions = 0;
    if (count > 0) {
      collisions = await countCollisions(entry, winnerId, loserId);
    }
    cascade.push({
      model: entry.model.modelName,
      field: entry.field,
      db: entry.db,
      kind: entry.kind,
      loser_rows: count,
      potential_collisions: collisions,
    });
  }

  return {
    winner: { _id: winner._id, ...snapshotDoctor(winner) },
    loser: { _id: loser._id, ...snapshotDoctor(loser) },
    cascade,
    total_rows: cascade.reduce((acc, c) => acc + c.loser_rows, 0),
    total_collisions: cascade.reduce((acc, c) => acc + c.potential_collisions, 0),
  };
}

async function countLoserRows(entry, loserId) {
  const filter = buildLoserFilter(entry, loserId);
  return entry.model.countDocuments(filter);
}

function buildLoserFilter(entry, loserId) {
  // For nested-array fields, mongoose accepts dot-notation in count/update
  // filters — same shape as a $[]/match filter.
  return { [entry.field]: loserId };
}

async function countCollisions(entry, winnerId, loserId) {
  switch (entry.kind) {
    case 'visit-week': {
      // Visit collision: same {user, yearWeekKey} on both sides.
      const loserKeys = await entry.model
        .find({ doctor: loserId })
        .select('user yearWeekKey')
        .lean();
      if (!loserKeys.length) return 0;
      const winnerSet = new Set(
        (await entry.model
          .find({
            doctor: winnerId,
            $or: loserKeys.map((k) => ({ user: k.user, yearWeekKey: k.yearWeekKey })),
          })
          .select('user yearWeekKey')
          .lean()).map((r) => `${r.user}::${r.yearWeekKey}`),
      );
      return loserKeys.filter((k) => winnerSet.has(`${k.user}::${k.yearWeekKey}`)).length;
    }
    case 'schedule': {
      const loserKeys = await entry.model
        .find({ doctor: loserId })
        .select('user cycleNumber scheduledWeek scheduledDay')
        .lean();
      if (!loserKeys.length) return 0;
      const winnerSet = new Set(
        (await entry.model
          .find({
            doctor: winnerId,
            $or: loserKeys.map((k) => ({
              user: k.user,
              cycleNumber: k.cycleNumber,
              scheduledWeek: k.scheduledWeek,
              scheduledDay: k.scheduledDay,
            })),
          })
          .select('user cycleNumber scheduledWeek scheduledDay')
          .lean()).map(
          (r) => `${r.user}::${r.cycleNumber}::${r.scheduledWeek}::${r.scheduledDay}`,
        ),
      );
      return loserKeys.filter((k) =>
        winnerSet.has(`${k.user}::${k.cycleNumber}::${k.scheduledWeek}::${k.scheduledDay}`),
      ).length;
    }
    case 'pa-active': {
      const loserActive = await entry.model
        .find({ doctor: loserId, status: 'active' })
        .select('product')
        .lean();
      if (!loserActive.length) return 0;
      const winnerProducts = new Set(
        (await entry.model
          .find({ doctor: winnerId, status: 'active', product: { $in: loserActive.map((r) => r.product) } })
          .select('product')
          .lean()).map((r) => String(r.product)),
      );
      return loserActive.filter((r) => winnerProducts.has(String(r.product))).length;
    }
    case 'attribution': {
      // PatientMdAttribution unique on (entity_id, patient_id, doctor_id).
      const loserRows = await entry.model
        .find({ doctor_id: loserId })
        .select('entity_id patient_id')
        .lean();
      if (!loserRows.length) return 0;
      const winnerSet = new Set(
        (await entry.model
          .find({
            doctor_id: winnerId,
            $or: loserRows.map((r) => ({ entity_id: r.entity_id, patient_id: r.patient_id })),
          })
          .select('entity_id patient_id')
          .lean()).map((r) => `${r.entity_id}::${r.patient_id}`),
      );
      return loserRows.filter((r) => winnerSet.has(`${r.entity_id}::${r.patient_id}`)).length;
    }
    default:
      return 0; // simple + nested-array have no uniqueness constraints to defuse
  }
}

// ── Execute ───────────────────────────────────────────────────────────────

async function executeMerge({ winnerId, loserId, reason, actor }) {
  if (!reason || !reason.trim()) {
    throw new Error('Merge reason is required (audit trail)');
  }
  if (!actor || !actor._id) {
    throw new Error('Actor user is required');
  }

  // Re-validate state — preview may be stale.
  const [winner, loser] = await Promise.all([
    Doctor.findById(winnerId),
    Doctor.findById(loserId),
  ]);
  if (!winner) throw new Error(`Winner Doctor ${winnerId} not found`);
  if (!loser) throw new Error(`Loser Doctor ${loserId} not found`);
  if (loser.mergedInto) {
    throw new Error(`Loser Doctor ${loserId} already merged into ${loser.mergedInto}`);
  }
  if (winner.mergedInto) {
    throw new Error(`Winner Doctor ${winnerId} is itself merged — pick the live record`);
  }
  if (String(winner._id) === String(loser._id)) {
    throw new Error('Winner and loser must be different Doctors');
  }

  const manifest = buildCascadeManifest();
  const cascadeAudit = [];
  const opts = await txOpts();

  // Inner work — runs inside or outside a session.
  const work = async (session) => {
    const sessionOpt = session ? { session } : {};
    for (const entry of manifest) {
      const result = await applyCascade(entry, { winnerId, loserId, sessionOpt });
      cascadeAudit.push({
        model: entry.model.modelName,
        field: entry.field,
        db: entry.db,
        ...result,
      });
    }
    // Soft-delete loser
    loser.mergedInto = winner._id;
    loser.mergedAt = new Date();
    loser.isActive = false;
    await loser.save({ session });
  };

  if (opts) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(work, opts);
    } finally {
      await session.endSession();
    }
  } else {
    await work(null);
  }

  // Persist audit row OUTSIDE the cascade txn — even if mongo disconnects mid-
  // cascade, we want the audit to be writable on retry. Failure to write the
  // audit row is logged loudly but does NOT roll back the merge — the merge is
  // already committed; rollback would require yet another cascade pass. The
  // ops gap window is small (Atlas wire latency). If this becomes a real
  // issue, swap to outbox-pattern (Rule 0d future SaaS posture).
  let audit;
  try {
    audit = await DoctorMergeAudit.create({
      winner_id: winner._id,
      loser_id: loser._id,
      winner_snapshot: snapshotDoctor(winner),
      loser_snapshot: snapshotDoctor(loser),
      cascade: cascadeAudit,
      reason: reason.trim(),
      actor_user_id: actor._id,
      actor_ip: actor.ip || null,
      actor_user_agent: actor.userAgent || null,
      status: 'APPLIED',
    });
  } catch (auditErr) {
    console.error('[doctorMergeService] CRITICAL: cascade succeeded but audit write failed', {
      winnerId, loserId, err: auditErr.message,
    });
    // Still throw so the controller surfaces the problem to admin — they need
    // to know that rollback won't be available without manual DB intervention.
    const wrapped = new Error(
      `Merge cascade committed but audit write failed: ${auditErr.message}. Rollback not available without DB-level intervention.`,
    );
    wrapped.merge_committed_without_audit = true;
    throw wrapped;
  }

  return {
    audit_id: audit._id,
    winner_id: winner._id,
    loser_id: loser._id,
    cascade: cascadeAudit,
  };
}

async function applyCascade(entry, { winnerId, loserId, sessionOpt }) {
  switch (entry.kind) {
    case 'simple':
      return applySimple(entry, { winnerId, loserId, sessionOpt });
    case 'nested-array':
      return applyNestedArray(entry, { winnerId, loserId, sessionOpt });
    case 'visit-week':
      return applyVisitWeek(entry, { winnerId, loserId, sessionOpt });
    case 'schedule':
      return applySchedule(entry, { winnerId, loserId, sessionOpt });
    case 'pa-active':
      return applyProductAssignment(entry, { winnerId, loserId, sessionOpt });
    case 'attribution':
      return applyAttribution(entry, { winnerId, loserId, sessionOpt });
    default:
      throw new Error(`Unknown cascade kind: ${entry.kind}`);
  }
}

async function applySimple(entry, { winnerId, loserId, sessionOpt }) {
  // Capture IDs first so the audit snapshot can repoint on rollback.
  const docs = await entry.model
    .find({ [entry.field]: loserId }, { _id: 1 }, sessionOpt)
    .lean();
  const ids = docs.map((d) => d._id);
  if (ids.length) {
    await entry.model.updateMany(
      { _id: { $in: ids } },
      { $set: { [entry.field]: winnerId } },
      sessionOpt,
    );
  }
  return { repointed_ids: ids, collision_ids: [], deactivated_ids: [] };
}

async function applyNestedArray(entry, { winnerId, loserId, sessionOpt }) {
  // Path is "outerArray.innerArray.field" — Mongo positional update with $[]
  // operates on every matching nested element. We update by Doctor id at the
  // leaf, so positional filters scope cleanly.
  // Step 1: capture IDs of parent docs touched (for audit + rollback).
  const docs = await entry.model
    .find({ [entry.field]: loserId }, { _id: 1 }, sessionOpt)
    .lean();
  const ids = docs.map((d) => d._id);
  if (!ids.length) {
    return { repointed_ids: [], collision_ids: [], deactivated_ids: [] };
  }

  // Step 2: build $[] arrayFilter selectors for the nested update path.
  // Path "settled_csis.partner_tags.doctor_id" decomposes into:
  //   - outer: "settled_csis"
  //   - inner: "partner_tags"
  //   - leaf: "doctor_id"
  const parts = entry.field.split('.');
  if (parts.length !== 3) {
    throw new Error(`Nested-array path expected 3 segments, got "${entry.field}"`);
  }
  const [outer, inner, leaf] = parts;
  await entry.model.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        [`${outer}.$[o].${inner}.$[i].${leaf}`]: winnerId,
      },
    },
    {
      ...sessionOpt,
      arrayFilters: [
        // outer match — any csi with at least one inner row that matches loser
        { [`o.${inner}.${leaf}`]: loserId },
        // inner match — only the rows actually pointing at loser
        { [`i.${leaf}`]: loserId },
      ],
    },
  );

  return { repointed_ids: ids, collision_ids: [], deactivated_ids: [] };
}

async function applyVisitWeek(entry, { winnerId, loserId, sessionOpt }) {
  const repointed_ids = [];
  const collision_ids = [];
  // Pull all loser visits.
  const loserVisits = await entry.model
    .find({ doctor: loserId }, null, sessionOpt)
    .lean();
  if (!loserVisits.length) return { repointed_ids, collision_ids, deactivated_ids: [] };

  // Build winner's existing key set for collision check.
  const winnerKeys = new Set(
    (
      await entry.model
        .find(
          {
            doctor: winnerId,
            $or: loserVisits.map((v) => ({ user: v.user, yearWeekKey: v.yearWeekKey })),
          },
          'user yearWeekKey',
          sessionOpt,
        )
        .lean()
    ).map((r) => `${r.user}::${r.yearWeekKey}`),
  );

  for (const v of loserVisits) {
    const key = `${v.user}::${v.yearWeekKey}`;
    if (winnerKeys.has(key)) {
      // Collision — defuse with sentinel so unique index lets us repoint.
      const sentinel = `${v.yearWeekKey}__MERGED_${loserId}`;
      await entry.model.updateOne(
        { _id: v._id },
        { $set: { doctor: winnerId, yearWeekKey: sentinel } },
        sessionOpt,
      );
      collision_ids.push({
        _id: v._id,
        original_value: v.yearWeekKey,
        sentinel_value: sentinel,
      });
    } else {
      await entry.model.updateOne(
        { _id: v._id },
        { $set: { doctor: winnerId } },
        sessionOpt,
      );
      repointed_ids.push(v._id);
    }
  }
  return { repointed_ids, collision_ids, deactivated_ids: [] };
}

async function applySchedule(entry, { winnerId, loserId, sessionOpt }) {
  const repointed_ids = [];
  const collision_ids = [];
  const loserRows = await entry.model.find({ doctor: loserId }, null, sessionOpt).lean();
  if (!loserRows.length) return { repointed_ids, collision_ids, deactivated_ids: [] };

  const winnerSet = new Set(
    (
      await entry.model
        .find(
          {
            doctor: winnerId,
            $or: loserRows.map((r) => ({
              user: r.user,
              cycleNumber: r.cycleNumber,
              scheduledWeek: r.scheduledWeek,
              scheduledDay: r.scheduledDay,
            })),
          },
          'user cycleNumber scheduledWeek scheduledDay',
          sessionOpt,
        )
        .lean()
    ).map((r) => `${r.user}::${r.cycleNumber}::${r.scheduledWeek}::${r.scheduledDay}`),
  );

  for (const r of loserRows) {
    const key = `${r.user}::${r.cycleNumber}::${r.scheduledWeek}::${r.scheduledDay}`;
    if (winnerSet.has(key)) {
      // Schedule has no string field to sentinel into. Strategy: bump
      // cycleNumber by a sentinel offset that's well above any real cycle
      // number (1e9). Rollback restores the original cycleNumber.
      const sentinelCycle = 1_000_000_000 + Number(r.cycleNumber || 0);
      await entry.model.updateOne(
        { _id: r._id },
        { $set: { doctor: winnerId, cycleNumber: sentinelCycle } },
        sessionOpt,
      );
      collision_ids.push({
        _id: r._id,
        original_value: String(r.cycleNumber),
        sentinel_value: String(sentinelCycle),
      });
    } else {
      await entry.model.updateOne(
        { _id: r._id },
        { $set: { doctor: winnerId } },
        sessionOpt,
      );
      repointed_ids.push(r._id);
    }
  }
  return { repointed_ids, collision_ids, deactivated_ids: [] };
}

async function applyProductAssignment(entry, { winnerId, loserId, sessionOpt }) {
  const repointed_ids = [];
  const deactivated_ids = [];
  const loserRows = await entry.model.find({ doctor: loserId }, null, sessionOpt).lean();
  if (!loserRows.length) {
    return { repointed_ids, collision_ids: [], deactivated_ids };
  }
  // For each loser row, decide repoint vs deactivate based on (product,winner,active=true) collision.
  for (const r of loserRows) {
    if (r.status === 'active') {
      const winnerActive = await entry.model
        .findOne(
          { doctor: winnerId, product: r.product, status: 'active' },
          { _id: 1 },
          sessionOpt,
        )
        .lean();
      if (winnerActive) {
        // Deactivate loser side instead of repointing.
        await entry.model.updateOne(
          { _id: r._id },
          {
            $set: {
              status: 'inactive',
              deactivatedAt: new Date(),
              deactivationReason: `Auto-deactivated by Doctor merge (winner ${winnerId} already had active assignment)`,
            },
          },
          sessionOpt,
        );
        deactivated_ids.push(r._id);
        continue;
      }
    }
    // No collision (or already inactive) — safe to repoint.
    await entry.model.updateOne(
      { _id: r._id },
      { $set: { doctor: winnerId } },
      sessionOpt,
    );
    repointed_ids.push(r._id);
  }
  return { repointed_ids, collision_ids: [], deactivated_ids };
}

async function applyAttribution(entry, { winnerId, loserId, sessionOpt }) {
  const repointed_ids = [];
  const deactivated_ids = [];
  const loserRows = await entry.model
    .find({ doctor_id: loserId }, null, sessionOpt)
    .lean();
  if (!loserRows.length) {
    return { repointed_ids, collision_ids: [], deactivated_ids };
  }
  const winnerSet = new Set(
    (
      await entry.model
        .find(
          {
            doctor_id: winnerId,
            $or: loserRows.map((r) => ({ entity_id: r.entity_id, patient_id: r.patient_id })),
          },
          'entity_id patient_id',
          sessionOpt,
        )
        .lean()
    ).map((r) => `${r.entity_id}::${r.patient_id}`),
  );

  for (const r of loserRows) {
    const key = `${r.entity_id}::${r.patient_id}`;
    if (winnerSet.has(key)) {
      // Winner already attributed — deactivate (is_active=false is the standard
      // soft-delete on PatientMdAttribution per ERP conventions).
      await entry.model.updateOne(
        { _id: r._id },
        { $set: { is_active: false } },
        sessionOpt,
      );
      deactivated_ids.push(r._id);
    } else {
      await entry.model.updateOne(
        { _id: r._id },
        { $set: { doctor_id: winnerId } },
        sessionOpt,
      );
      repointed_ids.push(r._id);
    }
  }
  return { repointed_ids, collision_ids: [], deactivated_ids };
}

// ── Rollback ──────────────────────────────────────────────────────────────

async function rollbackMerge({ auditId, reason, actor }) {
  const audit = await DoctorMergeAudit.findById(auditId);
  if (!audit) throw new Error(`MergeAudit ${auditId} not found`);
  if (audit.status !== 'APPLIED') {
    throw new Error(`MergeAudit ${auditId} status is ${audit.status} — only APPLIED is rollback-eligible`);
  }
  const loser = await Doctor.findById(audit.loser_id);
  if (!loser) {
    throw new Error(`Loser Doctor ${audit.loser_id} no longer exists (cron hard-deleted?). Rollback impossible.`);
  }
  if (!loser.mergedInto) {
    throw new Error(`Loser Doctor ${audit.loser_id} is no longer marked as merged. Possible double-rollback?`);
  }

  const opts = await txOpts();
  const work = async (session) => {
    const sessionOpt = session ? { session } : {};

    // Walk the audit cascade in reverse — repoint every captured ID back to
    // the loser, restore sentinels on collision rows, re-activate deactivated
    // rows when safe.
    for (const entry of audit.cascade) {
      const Model = mongoose.models[entry.model];
      if (!Model) {
        console.warn(`[doctorMergeService.rollback] Model ${entry.model} not registered; skipping`);
        continue;
      }
      // Repoint
      if (entry.repointed_ids?.length) {
        await Model.updateMany(
          { _id: { $in: entry.repointed_ids } },
          { $set: { [entry.field]: audit.loser_id } },
          sessionOpt,
        );
      }
      // Restore sentinels — visit-week / schedule
      if (entry.collision_ids?.length) {
        for (const c of entry.collision_ids) {
          const restore = entry.field === 'doctor' && entry.model === 'Visit'
            ? { yearWeekKey: c.original_value }
            : entry.field === 'doctor' && entry.model === 'Schedule'
              ? { cycleNumber: Number(c.original_value) }
              : null;
          if (restore) {
            await Model.updateOne(
              { _id: c._id },
              { $set: { ...restore, [entry.field]: audit.loser_id } },
              sessionOpt,
            );
          }
        }
      }
      // Re-activate deactivated rows (ProductAssignment, Attribution)
      if (entry.deactivated_ids?.length) {
        if (entry.model === 'ProductAssignment') {
          await Model.updateMany(
            { _id: { $in: entry.deactivated_ids } },
            {
              $set: { status: 'active', doctor: audit.loser_id },
              $unset: { deactivatedAt: '', deactivationReason: '' },
            },
            sessionOpt,
          );
        } else if (entry.model === 'PatientMdAttribution') {
          await Model.updateMany(
            { _id: { $in: entry.deactivated_ids } },
            { $set: { is_active: true, doctor_id: audit.loser_id } },
            sessionOpt,
          );
        }
      }
    }

    // Restore loser
    loser.mergedInto = null;
    loser.mergedAt = null;
    if (audit.loser_snapshot && typeof audit.loser_snapshot.isActive === 'boolean') {
      loser.isActive = audit.loser_snapshot.isActive;
    } else {
      loser.isActive = true;
    }
    await loser.save({ session });

    // Mark audit row as rolled back
    audit.status = 'ROLLED_BACK';
    audit.rolled_back_at = new Date();
    audit.rolled_back_by = actor._id;
    audit.rollback_reason = (reason || '').trim() || 'No reason provided';
    await audit.save({ session });
  };

  if (opts) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(work, opts);
    } finally {
      await session.endSession();
    }
  } else {
    await work(null);
  }

  return { audit_id: audit._id, status: audit.status };
}

// ── Candidates ────────────────────────────────────────────────────────────
// Aggregate Doctor by canonical key + return groups with count >= 2. Used by
// the admin UI to populate the "duplicates to merge" list.
async function findCandidates({ search = '', limit = 100 } = {}) {
  const match = {
    isActive: true,
    mergedInto: null,
    vip_client_name_clean: { $exists: true, $ne: null, $ne: '' },
  };
  if (search && search.trim()) {
    const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [
      { firstName: re },
      { lastName: re },
      { vip_client_name_clean: re },
    ];
  }

  const groups = await Doctor.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$vip_client_name_clean',
        count: { $sum: 1 },
        doctors: {
          $push: {
            _id: '$_id',
            firstName: '$firstName',
            lastName: '$lastName',
            specialization: '$specialization',
            clinicOfficeAddress: '$clinicOfficeAddress',
            locality: '$locality',
            province: '$province',
            primaryAssignee: '$primaryAssignee',
            partnership_status: '$partnership_status',
            prc_license_number: '$prc_license_number',
            createdAt: '$createdAt',
            updatedAt: '$updatedAt',
          },
        },
      },
    },
    { $match: { count: { $gte: 2 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: Math.min(Number(limit) || 100, 500) },
  ]);

  return groups;
}

// ── History ───────────────────────────────────────────────────────────────

async function listAuditHistory({ status = null, limit = 50 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  return DoctorMergeAudit.find(filter)
    .populate('winner_id', 'firstName lastName')
    .populate('loser_id', 'firstName lastName mergedInto mergedAt isActive')
    .populate('actor_user_id', 'firstName lastName email')
    .populate('rolled_back_by', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 500))
    .lean();
}

module.exports = {
  previewMerge,
  executeMerge,
  rollbackMerge,
  findCandidates,
  listAuditHistory,
  // Exposed for tests:
  buildCascadeManifest,
};
