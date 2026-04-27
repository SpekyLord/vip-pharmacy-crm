/**
 * Orphan Ledger Audit Agent — VIP-1.B follow-up (Apr 2026).
 *
 * Wraps the read-only sweep in `backend/erp/scripts/findOrphanedLedgerEntries.js`
 * into a scheduled agent that fires a MessageInbox alert whenever a POSTED
 * transactional doc (Sales / Collection / PRF) is missing its settlement
 * JournalEntry.
 *
 * Why it exists: VIP-1.B's `routePrfsForCollection` runs INSIDE the CR POST
 * transaction, but the settlement JE engine still runs OUTSIDE — a leftover
 * "non-blocking" pattern from before the rebate engine landed. If the JE
 * engine throws, the CR stays POSTED but no JournalEntry exists, leaving the
 * BIR-facing ledger silently inconsistent. The standalone script catches this;
 * this agent puts it on a daily cron so the window between "silent failure"
 * and "you find out" shrinks to <24h.
 *
 * Match logic: for each entity, find every POSTED row with `event_id` set,
 * non-zero amount, and check whether a POSTED JournalEntry exists with
 * `source_event_id == doc.event_id`. Any mismatch is an orphan.
 *
 * Reuses the Day-4 `notify()` plumbing — same recipient enums, same
 * deferred_crm escape hatch, same in-app+email channel selection.
 *
 * Schedule: Daily 03:00 Asia/Manila (clean slot before the morning agents).
 */
'use strict';

const mongoose = require('mongoose');
const { notify, countSuccessfulChannels, getInAppMessageIds } = require('./notificationService');

// Mirrors the MODULES table in `backend/erp/scripts/findOrphanedLedgerEntries.js`.
// Kept inline so the agent is self-contained — same trade-off as orphanAuditAgent.
const MODULES = [
  {
    key: 'sales',
    sourceModule: 'SALES',
    modelPath: '../erp/models/SalesLine',
    docRefField: 'doc_ref',
    dateField: 'csi_date',
    amountField: 'invoice_total',
    minAmountField: 'invoice_total', // zero-amount sales skip JE by design
  },
  {
    key: 'collections',
    sourceModule: 'COLLECTION',
    modelPath: '../erp/models/Collection',
    docRefField: 'cr_no',
    dateField: 'cr_date',
    amountField: 'cr_amount',
    minAmountField: 'cr_amount',
  },
  {
    key: 'prf',
    sourceModule: 'EXPENSE',
    modelPath: '../erp/models/PrfCalf',
    docRefField: 'doc_ref',
    dateField: 'posted_at',
    amountField: 'amount',
    minAmountField: 'amount',
  },
];

const MAX_REFS_PER_MODULE_IN_BODY = 10;
const MAX_BODY_LINES = 120;

function tryRequire(modulePath) {
  try { return require(modulePath); } catch { return null; }
}

/**
 * Pure scan: returns
 *   {
 *     entities: [{ entityId, entityName, totalOrphans, modules: [{ key, scanned, orphans, refs }] }],
 *     grandTotal,
 *     grandScanned
 *   }
 * Empty modules / clean entities are NOT included in the result. Caller
 * decides what to do with empty input (no notify, no agent run noise).
 */
async function findOrphanLedgers({ entityFilter = null } = {}) {
  const Entity = tryRequire('../erp/models/Entity');
  const JournalEntry = tryRequire('../erp/models/JournalEntry');
  if (!Entity || !JournalEntry) {
    return { entities: [], grandTotal: 0, grandScanned: 0, error: 'core models missing (Entity/JournalEntry)' };
  }

  const entityQuery = entityFilter ? { _id: entityFilter } : {};
  const entities = await Entity.find(entityQuery).select('_id name short_name entity_name').lean();

  const out = [];
  let grandTotal = 0;
  let grandScanned = 0;

  for (const entity of entities) {
    const entityName = entity.short_name || entity.entity_name || entity.name || String(entity._id);
    const entityBlock = { entityId: String(entity._id), entityName, totalOrphans: 0, modules: [] };

    for (const mod of MODULES) {
      const Model = tryRequire(mod.modelPath);
      if (!Model) continue;

      // POSTED, non-zero, with event_id stamped. NO date window — we want to
      // catch persistent orphans, not just rolling-window ones (an orphan that
      // ages out of a window is still wrong).
      const candidateFilter = {
        entity_id: entity._id,
        status: 'POSTED',
        event_id: { $ne: null },
        [mod.minAmountField]: { $gt: 0 },
      };
      const candidates = await Model.find(candidateFilter)
        .select(`_id event_id ${mod.docRefField} ${mod.dateField} ${mod.amountField} bdm_id status posted_at`)
        .lean();

      grandScanned += candidates.length;
      if (!candidates.length) continue;

      const eventIds = candidates.map((c) => c.event_id);
      const jeRows = await JournalEntry.find({
        entity_id: entity._id,
        source_module: mod.sourceModule,
        source_event_id: { $in: eventIds },
        status: 'POSTED',
      }).select('source_event_id').lean();

      const haveJe = new Set(jeRows.map((j) => String(j.source_event_id)));
      const orphans = candidates.filter((c) => !haveJe.has(String(c.event_id)));
      if (!orphans.length) continue;

      const refs = orphans.map((row) => {
        const ref = row[mod.docRefField] || row._id;
        const dt = row[mod.dateField] ? new Date(row[mod.dateField]).toISOString().slice(0, 10) : '';
        const amt = row[mod.amountField] ?? '';
        return { ref: String(ref), date: dt, amount: amt, _id: String(row._id), event_id: String(row.event_id) };
      });

      entityBlock.modules.push({
        key: mod.key,
        scanned: candidates.length,
        orphans: orphans.length,
        refs,
      });
      entityBlock.totalOrphans += orphans.length;
    }

    if (entityBlock.totalOrphans > 0) {
      out.push(entityBlock);
      grandTotal += entityBlock.totalOrphans;
    }
  }

  return { entities: out, grandTotal, grandScanned };
}

function buildNotificationBody(scan) {
  const lines = [];
  lines.push(`Orphan Ledger Audit — ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`Total orphaned POSTED rows missing settlement JE: ${scan.grandTotal}`);
  lines.push(`(scanned ${scan.grandScanned} POSTED rows across all entities)`);
  lines.push('');
  lines.push('An "orphan" = a POSTED Sales/Collection/PRF whose `event_id` has NO');
  lines.push('matching POSTED JournalEntry. The JE engine threw silently OUTSIDE');
  lines.push('the POST transaction, leaving the BIR-facing ledger inconsistent.');
  lines.push('');

  for (const ent of scan.entities) {
    if (lines.length > MAX_BODY_LINES) { lines.push('… (output truncated; rerun the script for full detail)'); break; }
    lines.push(`═══ ${ent.entityName} (${ent.totalOrphans} orphan row(s)) ═══`);

    for (const mod of ent.modules) {
      if (lines.length > MAX_BODY_LINES) break;
      lines.push(`  [${mod.key}] ${mod.orphans}/${mod.scanned} POSTED rows missing JE:`);
      const slice = mod.refs.slice(0, MAX_REFS_PER_MODULE_IN_BODY);
      for (const r of slice) {
        if (lines.length > MAX_BODY_LINES) break;
        lines.push(`    • ${r.ref}  ${r.date}  ₱${r.amount}  (event ${r.event_id})`);
      }
      if (mod.refs.length > MAX_REFS_PER_MODULE_IN_BODY) {
        lines.push(`    … (+${mod.refs.length - MAX_REFS_PER_MODULE_IN_BODY} more refs hidden)`);
      }
    }
    lines.push('');
  }

  lines.push('Repair path:');
  lines.push('  1. Check ErpAuditLog for LEDGER_ERROR with target_ref matching');
  lines.push('     each doc — that captures why the JE engine threw.');
  lines.push('  2. Reopen the doc and re-submit (idempotent on source_event_id).');
  lines.push('     If the underlying error was COA validation / period lock /');
  lines.push('     missing fund, fix the root cause first.');
  lines.push('');
  lines.push('Operator: run `node erp/scripts/findOrphanedLedgerEntries.js --csv`');
  lines.push('from the backend/ folder for a full CSV export.');
  return lines.join('\n');
}

function buildKeyFindings(scan) {
  const findings = [];
  findings.push(`${scan.grandTotal} orphaned POSTED row(s) across ${scan.entities.length} entity(s)`);
  for (const ent of scan.entities.slice(0, 3)) {
    const top = ent.modules.slice().sort((a, b) => b.orphans - a.orphans)[0];
    if (top) findings.push(`${ent.entityName} — worst module: ${top.key} (${top.orphans})`);
  }
  return findings.slice(0, 6);
}

async function run({ entityFilter = null } = {}) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return { status: 'error', summary: {}, message_ids: [], error_msg: 'mongoose not connected' };
    }

    const scan = await findOrphanLedgers({ entityFilter });

    if (scan.error) {
      return { status: 'error', summary: {}, message_ids: [], error_msg: scan.error };
    }

    if (scan.grandTotal === 0) {
      return {
        status: 'success',
        summary: {
          alerts_generated: 0,
          messages_sent: 0,
          key_findings: [`Scanned ${scan.grandScanned} POSTED rows. No ledger orphans detected. ✓`],
        },
        message_ids: [],
      };
    }

    const body = buildNotificationBody(scan);
    const title = `Orphan Ledger Audit — ${scan.grandTotal} POSTED row(s) missing JE across ${scan.entities.length} entity(s)`;
    // Ledger orphans are higher-priority than owner orphans because they break
    // BIR-facing reporting. Anything > 0 deserves admin attention same-day.
    const priority = scan.grandTotal > 10 ? 'high' : 'important';

    const presResults = await notify({
      recipient_id: 'PRESIDENT',
      title,
      body,
      category: 'compliance_alert',
      priority,
      channels: ['in_app', 'email'],
      agent: 'orphan_ledger_audit',
    });
    const adminResults = await notify({
      recipient_id: 'ALL_ADMINS',
      title,
      body,
      category: 'compliance_alert',
      priority,
      channels: ['in_app'],
      agent: 'orphan_ledger_audit',
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
    console.error('[OrphanLedgerAudit] Run failed:', err.message);
    return { status: 'error', summary: {}, message_ids: [], error_msg: err.message };
  }
}

module.exports = {
  run,
  // Exported for unit tests / introspection.
  findOrphanLedgers,
  buildNotificationBody,
  buildKeyFindings,
  MODULES,
};
