/**
 * Repair Stuck Per Diem Overrides
 *
 * Context (2026-04-21): a latent bug in universalApprovalController.perdiem_override
 * silently no-op'd the SMER write-back when the parent SMER's status was not in
 * the lookup-driven editable set (typically ['DRAFT', 'ERROR']). The handler flipped
 * the ApprovalRequest to APPROVED but the daily entry stayed `override_status: 'PENDING'`,
 * so the contractor's UI kept showing "pending" forever.
 *
 * The handler has since been fixed and the SMER validate/submit path now blocks
 * submission while any override is PENDING. This script repairs pre-existing
 * stuck records.
 *
 * For every ApprovalRequest with:
 *   module: 'PERDIEM_OVERRIDE', status: 'APPROVED'
 * we look up the linked SmerEntry + daily entry. If the entry is still PENDING:
 *   - SMER in DRAFT/VALID/ERROR → re-apply the override (totals auto-recompute on save)
 *   - SMER in POSTED            → log a warning (ledger already journaled with
 *                                 pre-override amount; admin must reopen via
 *                                 Reversal Console, then resubmit)
 *
 * REJECTED requests follow the same pattern: clear entry.override_status from
 * PENDING to REJECTED, preserving the CRM-computed per diem.
 *
 * Idempotent — running twice is a no-op once entries are reconciled.
 *
 * Usage (from backend/):
 *   node erp/scripts/repairStuckPerdiemOverrides.js           # dry-run
 *   node erp/scripts/repairStuckPerdiemOverrides.js --apply   # writes
 */
require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const ApprovalRequest = require('../models/ApprovalRequest');
  const SmerEntry = require('../models/SmerEntry');
  const Settings = require('../models/Settings');
  const PeopleMaster = require('../models/PeopleMaster');
  const CompProfile = require('../models/CompProfile');
  const ErpAuditLog = require('../models/ErpAuditLog');
  const { computePerdiemAmount } = require('../services/perdiemCalc');

  const decided = await ApprovalRequest.find({
    module: 'PERDIEM_OVERRIDE',
    status: { $in: ['APPROVED', 'REJECTED'] },
  }).lean();

  console.log(`Scanning ${decided.length} decided per-diem override requests…`);

  let repaired = 0;
  let alreadyOk = 0;
  let postedWarn = 0;
  let missing = 0;

  for (const req of decided) {
    if (!req.doc_id) { missing++; continue; }
    const smer = await SmerEntry.findById(req.doc_id);
    if (!smer) { missing++; console.warn(`  [missing] SMER ${req.doc_id} for request ${req._id}`); continue; }

    const entryId = req.metadata?.entry_id
      || req.description?.match(/Entry ID: (.+)$/)?.[1];
    const entry = entryId ? smer.daily_entries.id(entryId) : null;
    if (!entry) { missing++; console.warn(`  [missing] daily entry ${entryId} on SMER ${smer._id}`); continue; }

    // Already reconciled?
    if (req.status === 'APPROVED' && entry.override_status === 'APPROVED' && entry.perdiem_override === true) { alreadyOk++; continue; }
    if (req.status === 'REJECTED' && (entry.override_status === 'REJECTED' || !entry.override_status)) { alreadyOk++; continue; }

    if (req.status === 'APPROVED') {
      const tier = req.metadata?.override_tier
        || req.description?.match(/→ (FULL|HALF)/)?.[1];
      if (!tier) { missing++; console.warn(`  [missing tier] request ${req._id}`); continue; }

      if (smer.status === 'POSTED') {
        postedWarn++;
        console.warn(`  [POSTED] SMER ${smer._id} (${smer.period}-${smer.cycle}) day ${entry.day} — override approved but SMER already journaled. Admin must reopen via Reversal Console then resubmit.`);
        continue;
      }

      const settings = await Settings.getSettings();
      const person = await PeopleMaster.findOne({ user_id: smer.bdm_id, entity_id: smer.entity_id }).select('_id').lean();
      const compProfile = person
        ? await CompProfile.findOne({ person_id: person._id, entity_id: smer.entity_id, status: 'ACTIVE' }).sort({ effective_date: -1 }).lean()
        : null;
      const { amount } = computePerdiemAmount(tier === 'FULL' ? 999 : 3, smer.perdiem_rate, settings, compProfile);

      const oldTier = entry.perdiem_tier;
      const rsn = req.metadata?.override_reason || 'Approved override';
      entry.perdiem_override = true;
      entry.override_tier = tier;
      entry.override_reason = `${rsn} (Approval #${req._id}) [repair]`;
      entry.override_status = 'APPROVED';
      entry.overridden_by = req.decided_by || req.requested_by;
      entry.overridden_at = req.decided_at || new Date();
      entry.perdiem_tier = tier;
      entry.perdiem_amount = amount;

      console.log(`  [APPLY] SMER ${smer._id} day ${entry.day}: ${oldTier} → ${tier} (₱${amount})`);

      if (APPLY) {
        await smer.save();
        await ErpAuditLog.logChange({
          entity_id: smer.entity_id, bdm_id: smer.bdm_id,
          log_type: 'ITEM_CHANGE', target_ref: smer._id.toString(), target_model: 'SmerEntry',
          field_changed: `daily_entries.${entry.day}.perdiem_tier`,
          old_value: `${oldTier} (md_count: ${entry.md_count})`,
          new_value: `${tier} (approved override, repaired)`,
          changed_by: req.decided_by || req.requested_by,
          note: `Per diem override day ${entry.day}: ${oldTier} → ${tier} — repaired from stuck approval #${req._id}`,
        });
      }
      repaired++;
    } else {
      // REJECTED — clear pending state
      console.log(`  [REJECT] SMER ${smer._id} day ${entry.day}: clear PENDING → REJECTED`);
      entry.override_status = 'REJECTED';
      entry.requested_override_tier = undefined;
      if (APPLY) await smer.save();
      repaired++;
    }
  }

  console.log('');
  console.log(`Summary:`);
  console.log(`  repaired:      ${repaired}`);
  console.log(`  already-ok:    ${alreadyOk}`);
  console.log(`  posted-skip:   ${postedWarn}  (require manual reopen + resubmit)`);
  console.log(`  missing-data:  ${missing}`);
  if (!APPLY) console.log(`\nDRY-RUN — rerun with --apply to persist.`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
