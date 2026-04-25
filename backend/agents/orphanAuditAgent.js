/**
 * Orphan Audit Agent (Day-4.5 item 3 / Week-1 Stabilization).
 *
 * Wraps the read-only sweep in `backend/erp/scripts/findOrphanedOwnerRecords.js`
 * into a scheduled agent that fires a MessageInbox alert whenever an orphan
 * shows up in any of the 8 covered transactional collections.
 *
 * "Orphan" = a transactional doc whose `bdm_id` points to a user whose role
 * is NOT in the entity's `VALID_OWNER_ROLES.<MODULE>` lookup. Surfaced by
 * Phase G4.5d (Sale 8091 incident) and now monitored on schedule so silent
 * regressions surface within a week instead of waiting for an operator to
 * remember to run the script.
 *
 * Reuses the Day-4 `notify()` plumbing — same recipient enums, same
 * deferred_crm escape hatch, same in-app+email channel selection. No new
 * lookup keys, no new model classification work.
 *
 * Schedule: Monday 05:15 Asia/Manila, sandwiched between System Integrity
 * (05:00) and Treasury (05:30) so the morning briefings see fresh data.
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

// Mirrors the MODULES table in `backend/erp/scripts/findOrphanedOwnerRecords.js`.
// Kept inline (not imported) so the script stays a self-contained operator
// tool — duplication is two short tables, abstracting it adds more rope than
// it saves.
const MODULES = [
  { key: 'sales',            lookupCode: 'SALES',       modelPath: '../erp/models/SalesLine',         displayFields: { ref: 'doc_ref',           date: 'csi_date',         amount: 'line_total' } },
  { key: 'collections',      lookupCode: 'COLLECTIONS', modelPath: '../erp/models/Collection',        displayFields: { ref: 'collection_ref',    date: 'collection_date',  amount: 'amount' } },
  { key: 'expenses',         lookupCode: 'EXPENSES',    modelPath: '../erp/models/ExpenseEntry',      displayFields: { ref: 'doc_ref',           date: 'expense_date',     amount: 'total_amount' } },
  { key: 'car_logbook',      lookupCode: 'CAR_LOGBOOK', modelPath: '../erp/models/CarLogbookCycle',   displayFields: { ref: 'cycle_ref',         date: 'period',           amount: 'total_amount' } },
  { key: 'car_logbook_day',  lookupCode: 'CAR_LOGBOOK', modelPath: '../erp/models/CarLogbookEntry',   displayFields: { ref: '_id',               date: 'entry_date',       amount: 'total_fuel_amount' } },
  { key: 'prf_calf',         lookupCode: 'PRF_CALF',    modelPath: '../erp/models/PrfCalf',           displayFields: { ref: 'calf_number',       date: 'created_at',       amount: 'amount' } },
  { key: 'undertaking',      lookupCode: 'UNDERTAKING', modelPath: '../erp/models/Undertaking',       displayFields: { ref: 'undertaking_number', date: 'receipt_date',    amount: null } },
  { key: 'smer_entry',       lookupCode: 'SMER',        modelPath: '../erp/models/SmerEntry',         displayFields: { ref: '_id',               date: 'period',           amount: 'total_reimbursable' } },
];

const DEFAULT_VALID_OWNER_ROLES = ['staff'];

const MAX_REFS_PER_OWNER_IN_BODY = 5;
const MAX_OWNER_BLOCKS_PER_MODULE = 8;
const MAX_BODY_LINES = 120;

function tryRequire(modulePath) {
  try { return require(modulePath); } catch { return null; }
}

async function getValidOwnerRoles(Lookup, entityId, moduleCode) {
  if (!Lookup) return DEFAULT_VALID_OWNER_ROLES;
  try {
    const doc = await Lookup.findOne({
      entity_id: entityId,
      category: 'VALID_OWNER_ROLES',
      code: moduleCode,
      is_active: true,
    }).lean();
    if (doc && Array.isArray(doc.metadata?.roles) && doc.metadata.roles.length) {
      return doc.metadata.roles;
    }
  } catch { /* fall through */ }
  return DEFAULT_VALID_OWNER_ROLES;
}

/**
 * Pure scan: returns
 *   [{ entityId, entityName, totalOrphans, modules: [{ key, validRoles, owners: [{ ownerId, ownerName, ownerRole, ownerEmail, count, refs }] }] }]
 *
 * Empty modules / clean entities are NOT included in the result. Caller
 * decides what to do with empty input (no notify, no agent run noise).
 */
async function findOrphans({ entityFilter = null } = {}) {
  const User = tryRequire('../models/User');
  const Entity = tryRequire('../erp/models/Entity');
  const Lookup = tryRequire('../erp/models/Lookup');
  if (!User || !Entity) {
    return { entities: [], grandTotal: 0, error: 'core models missing (User/Entity)' };
  }

  const entityQuery = entityFilter ? { _id: entityFilter } : {};
  const entities = await Entity.find(entityQuery).select('_id name short_name entity_name').lean();

  const out = [];
  let grandTotal = 0;

  for (const entity of entities) {
    const entityName = entity.short_name || entity.entity_name || entity.name || String(entity._id);
    const entityBlock = { entityId: String(entity._id), entityName, totalOrphans: 0, modules: [] };

    for (const mod of MODULES) {
      const Model = tryRequire(mod.modelPath);
      if (!Model) continue;

      const validRoles = await getValidOwnerRoles(Lookup, entity._id, mod.lookupCode);

      const nonOwnerUsers = await User.find({
        $or: [{ entity_id: entity._id }, { entity_ids: entity._id }],
        role: { $nin: validRoles },
        isActive: { $ne: false },
      }).select('_id name email role').lean();

      if (!nonOwnerUsers.length) continue;

      const nonOwnerIds = nonOwnerUsers.map((u) => u._id);
      const userMap = new Map(nonOwnerUsers.map((u) => [String(u._id), u]));

      const orphans = await Model.find({
        entity_id: entity._id,
        bdm_id: { $in: nonOwnerIds },
      }).lean();

      if (!orphans.length) continue;

      const byOwner = new Map();
      for (const row of orphans) {
        const key = String(row.bdm_id);
        if (!byOwner.has(key)) byOwner.set(key, []);
        byOwner.get(key).push(row);
      }

      const owners = [];
      for (const [ownerId, rows] of byOwner) {
        const u = userMap.get(ownerId) || {};
        const refs = rows.map((r) => String(r[mod.displayFields.ref] || r._id));
        owners.push({
          ownerId,
          ownerName: u.name || ownerId,
          ownerRole: u.role || '?',
          ownerEmail: u.email || '',
          count: rows.length,
          refs,
        });
      }
      owners.sort((a, b) => b.count - a.count);

      entityBlock.modules.push({
        key: mod.key,
        validRoles,
        totalOrphans: orphans.length,
        owners,
      });
      entityBlock.totalOrphans += orphans.length;
    }

    if (entityBlock.totalOrphans > 0) {
      out.push(entityBlock);
      grandTotal += entityBlock.totalOrphans;
    }
  }

  return { entities: out, grandTotal };
}

function buildNotificationBody(scan) {
  const lines = [];
  lines.push(`Orphan Audit — ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Total orphaned rows across all entities: ${scan.grandTotal}`);
  lines.push('');
  lines.push('An "orphan" = a transactional doc whose `bdm_id` points to a user');
  lines.push('whose role is NOT in VALID_OWNER_ROLES for that module. This is the');
  lines.push('Phase G4.5d / Rule #21 silent-self-fill fingerprint.');
  lines.push('');

  for (const ent of scan.entities) {
    if (lines.length > MAX_BODY_LINES) { lines.push('… (output truncated; rerun the script for full detail)'); break; }
    lines.push(`═══ ${ent.entityName} (${ent.totalOrphans} orphan row(s)) ═══`);

    for (const mod of ent.modules) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  [${mod.key}] ${mod.totalOrphans} row(s); valid owner roles: ${mod.validRoles.join(', ')}`);

      const ownerSlice = mod.owners.slice(0, MAX_OWNER_BLOCKS_PER_MODULE);
      for (const o of ownerSlice) {
        if (lines.length > MAX_BODY_LINES) break;
        const email = o.ownerEmail ? ` <${o.ownerEmail}>` : '';
        lines.push(`    • ${o.ownerName} (${o.ownerRole})${email} — ${o.count} row(s)`);
        const preview = o.refs.slice(0, MAX_REFS_PER_OWNER_IN_BODY).join(', ');
        const more = o.refs.length > MAX_REFS_PER_OWNER_IN_BODY ? ` (+${o.refs.length - MAX_REFS_PER_OWNER_IN_BODY} more)` : '';
        lines.push(`      refs: ${preview}${more}`);
      }
      if (mod.owners.length > MAX_OWNER_BLOCKS_PER_MODULE) {
        lines.push(`    … (+${mod.owners.length - MAX_OWNER_BLOCKS_PER_MODULE} more owner(s) hidden)`);
      }
    }
    lines.push('');
  }

  lines.push('Repair path: re-open each flagged doc → reassign ownership via');
  lines.push('OwnerPicker to the correct BDM → re-submit. Period locks and');
  lines.push('journal reversals apply as normal.');
  lines.push('');
  lines.push('Operator: run `node erp/scripts/findOrphanedOwnerRecords.js --csv`');
  lines.push('from the backend/ folder for a full CSV with status + was_proxied flags.');
  return lines.join('\n');
}

function buildKeyFindings(scan) {
  const findings = [];
  for (const ent of scan.entities.slice(0, 3)) {
    findings.push(`${ent.entityName}: ${ent.totalOrphans} orphan(s) across ${ent.modules.length} module(s)`);
    const top = ent.modules.slice().sort((a, b) => b.totalOrphans - a.totalOrphans)[0];
    if (top) findings.push(`  • worst module: ${top.key} (${top.totalOrphans})`);
  }
  return findings.slice(0, 6);
}

async function run({ entityFilter = null } = {}) {
  try {
    if (mongoose.connection.readyState !== 1) {
      // Mirrors the dataQualityAgent posture: agents trust the executor /
      // server boot to have opened the connection. Bail with a soft error
      // rather than dialing a second connection.
      return { status: 'error', summary: {}, message_ids: [], error_msg: 'mongoose not connected' };
    }

    const scan = await findOrphans({ entityFilter });

    if (scan.error) {
      return { status: 'error', summary: {}, message_ids: [], error_msg: scan.error };
    }

    if (scan.grandTotal === 0) {
      return {
        status: 'success',
        summary: {
          alerts_generated: 0,
          messages_sent: 0,
          key_findings: ['No orphaned owner rows detected across all entities. ✓'],
        },
        message_ids: [],
      };
    }

    const body = buildNotificationBody(scan);
    const title = `Orphan Audit — ${scan.grandTotal} orphaned row(s) across ${scan.entities.length} entity(s)`;
    const priority = scan.grandTotal > 50 ? 'high' : 'important';

    const presResults = await notify({
      recipient_id: 'PRESIDENT',
      title,
      body,
      category: 'compliance_alert',
      priority,
      channels: ['in_app', 'email'],
      agent: 'orphan_audit',
    });
    const adminResults = await notify({
      recipient_id: 'ALL_ADMINS',
      title,
      body,
      category: 'compliance_alert',
      priority,
      channels: ['in_app'],
      agent: 'orphan_audit',
    });

    return {
      status: 'success',
      summary: {
        alerts_generated: scan.grandTotal,
        messages_sent: countSuccessfulChannels(presResults, 'in_app') + countSuccessfulChannels(adminResults, 'in_app'),
        key_findings: buildKeyFindings(scan),
      },
      message_ids: [...getInAppMessageIds(presResults), ...getInAppMessageIds(adminResults)],
    };
  } catch (err) {
    console.error('[OrphanAudit] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = {
  run,
  // Exported for unit tests / introspection.
  findOrphans,
  buildNotificationBody,
  buildKeyFindings,
  MODULES,
  DEFAULT_VALID_OWNER_ROLES,
};
