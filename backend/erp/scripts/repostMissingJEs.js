/* eslint-disable vip-tenant/require-entity-filter -- standalone backlog repost script: no req context; intentionally scans all entities for missing JEs */
/**
 * Repost Missing JEs — Phase 35 backlog script
 *
 * Context (2026-04-21): the JournalEntry pre-save validator's "#15 Hardening"
 * check rejected any line that credited a DEBIT-normal account or debited a
 * CREDIT-normal account, even when the full JE was balanced and the intent
 * was a legitimate asset/liability reduction (e.g. SMER crediting AR-BDM to
 * draw down a BDM's advance). The rejection was swallowed by the surrounding
 * auto-journal try/catch in every controller, so POSTED documents silently
 * ended up without matching JournalEntry rows — the ledger drifted by the
 * undocumented amount every day since 2026-04-13.
 *
 * Phase 35 fix: added `is_contra` flag to JE line sub-schema + skip the direction
 * check on flagged lines + marked all reduction lines in every auto-journal
 * helper and controller. With the code fix in place, this script repairs the
 * backlog of POSTED documents that never got a JournalEntry companion row.
 *
 * Scoped sources (matches the blast-radius in the handoff):
 *   - SmerEntry                  (submitSmer / postSingleSmer)
 *   - CarLogbookCycle            (submitCarLogbookCycle / postSingleCarLogbook)
 *   - ExpenseEntry               (submitExpenses / postSingleExpense)
 *   - PrfCalf                    (submitPrfCalf / postSinglePrfCalf)
 *
 * For each POSTED doc with `deletion_event_id` absent and no JournalEntry
 * at `source_event_id === doc.event_id`, we rebuild the JE via the same
 * helpers the controllers use and post it. Re-invokes the auto-journal
 * builder; idempotent — if a JE already exists, skip.
 *
 * Period-lock aware: if the doc's period is closed, we skip by default with a
 * warning. Pass --force-closed-period to repost anyway (uses the normal post
 * path which still respects JE-level period lock; closed-period reposts will
 * fail loudly rather than silently, which is the correct behavior).
 *
 * Usage (run from backend/):
 *   node erp/scripts/repostMissingJEs.js                 # dry-run, since=2026-04-13
 *   node erp/scripts/repostMissingJEs.js --apply         # writes
 *   node erp/scripts/repostMissingJEs.js --since 2026-04-01
 *   node erp/scripts/repostMissingJEs.js --type SMER     # single doc type
 *   node erp/scripts/repostMissingJEs.js --force-closed-period
 */
require('dotenv').config();
const mongoose = require('mongoose');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE_CLOSED = args.includes('--force-closed-period');
const typeIdx = args.indexOf('--type');
const TYPE_FILTER = typeIdx >= 0 ? args[typeIdx + 1] : null; // SMER|CARLOGBOOK|EXPENSE|PRFCALF
const sinceIdx = args.indexOf('--since');
const SINCE = sinceIdx >= 0 ? new Date(args[sinceIdx + 1]) : new Date('2026-04-13T00:00:00Z');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Run from backend/ with .env present.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}  since=${SINCE.toISOString().slice(0, 10)}  type=${TYPE_FILTER || 'ALL'}  force=${FORCE_CLOSED}`);

  // Register every model the validator / helpers may reach via mongoose.model(...)
  // Standalone scripts bypass server.js's implicit registration, so missing a
  // model here surfaces as "Schema hasn't been registered" during save.
  // JE pre-save hook looks up ChartOfAccounts; autoJournal helpers resolve
  // Settings + BankAccount + CreditCard + PaymentMode via resolveFundingCoa.
  require('../models/ChartOfAccounts');
  require('../models/Settings');
  require('../models/BankAccount');
  require('../models/CreditCard');
  require('../models/PaymentMode');
  require('../models/MonthlyArchive');
  const SmerEntry = require('../models/SmerEntry');
  const CarLogbookCycle = require('../models/CarLogbookCycle');
  const CarLogbookEntry = require('../models/CarLogbookEntry');
  const ExpenseEntry = require('../models/ExpenseEntry');
  const PrfCalf = require('../models/PrfCalf');
  const JournalEntry = require('../models/JournalEntry');
  const { getCoaMap, resolveFundingCoa, journalFromPrfCalf } = require('../services/autoJournal');
  const { createAndPostJournal } = require('../services/journalEngine');
  const { checkPeriodOpen } = require('../utils/periodLock');

  const summary = { smer: 0, smer_repaired: 0, logbook: 0, logbook_repaired: 0, expense: 0, expense_repaired: 0, prfcalf: 0, prfcalf_repaired: 0, period_locked: 0, failed: [] };

  async function hasExistingJe(event_id) {
    if (!event_id) return false;
    const je = await JournalEntry.findOne({ source_event_id: event_id }).select('_id').lean();
    return !!je;
  }

  async function guardPeriod(entityId, period, label) {
    try {
      await checkPeriodOpen(entityId, period);
      return true;
    } catch (err) {
      if (FORCE_CLOSED) {
        console.log(`  [${label}] period ${period} closed — forcing repost (--force-closed-period)`);
        return true;
      }
      summary.period_locked += 1;
      console.log(`  [${label}] SKIP — period ${period} closed. Use --force-closed-period to override.`);
      return false;
    }
  }

  // ─── 1) SMER ────────────────────────────────────────────────────
  if (!TYPE_FILTER || TYPE_FILTER === 'SMER') {
    const smers = await SmerEntry.find({
      status: 'POSTED',
      posted_at: { $gte: SINCE },
      deletion_event_id: { $exists: false },
    }).lean();
    summary.smer = smers.length;
    console.log(`\n── SMER candidates: ${smers.length}`);

    for (const smer of smers) {
      if (!smer.event_id) { console.log(`  SKIP SMER ${smer._id} — no event_id`); continue; }
      if (await hasExistingJe(smer.event_id)) continue;
      const label = `SMER ${smer.period}-${smer.cycle} (${smer._id})`;
      if (!(await guardPeriod(smer.entity_id, smer.period, label))) continue;

      try {
        const coaMap = await getCoaMap();
        const lines = [];
        const desc = `SMER ${smer.period}-${smer.cycle}`;
        if (smer.total_perdiem > 0) lines.push({ account_code: coaMap.PER_DIEM || '6100', account_name: 'Per Diem Expense', debit: smer.total_perdiem, credit: 0, description: desc });
        if (smer.total_transpo > 0) lines.push({ account_code: coaMap.TRANSPORT || '6150', account_name: 'Transport Expense', debit: smer.total_transpo, credit: 0, description: desc });
        if (smer.total_special_cases > 0) lines.push({ account_code: coaMap.SPECIAL_TRANSPORT || '6160', account_name: 'Special Transport Expense', debit: smer.total_special_cases, credit: 0, description: desc });
        if (smer.total_ore > 0) lines.push({ account_code: coaMap.OTHER_REIMBURSABLE || '6170', account_name: 'Other Reimbursable Expense', debit: smer.total_ore, credit: 0, description: desc });
        if (!lines.length || !smer.total_reimbursable) {
          console.log(`  [${label}] SKIP — no reimbursable amount to journal`);
          continue;
        }
        lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: smer.total_reimbursable, description: desc, is_contra: true });

        if (!APPLY) {
          console.log(`  [${label}] DRY-RUN would post ${lines.length} lines; total_reimbursable=${smer.total_reimbursable}`);
          summary.smer_repaired += 1;
          continue;
        }
        await createAndPostJournal(smer.entity_id, {
          je_date: smer.posted_at || new Date(),
          period: smer.period,
          description: `SMER: ${desc} (Phase 35 repost)`,
          source_module: 'EXPENSE',
          source_event_id: smer.event_id,
          source_doc_ref: `SMER-${smer.period}-${smer.cycle}`,
          lines,
          bir_flag: 'BOTH',
          vat_flag: 'N/A',
          bdm_id: smer.bdm_id,
          created_by: smer.posted_by || smer.bdm_id,
        });
        summary.smer_repaired += 1;
        console.log(`  [${label}] REPOSTED — ${smer.total_reimbursable}`);
      } catch (err) {
        summary.failed.push({ type: 'SMER', id: String(smer._id), error: err.message });
        console.error(`  [${label}] FAILED: ${err.message}`);
      }
    }
  }

  // ─── 2) CAR LOGBOOK (cycle wrapper, Phase 33) ────────────────────
  if (!TYPE_FILTER || TYPE_FILTER === 'CARLOGBOOK') {
    const cycles = await CarLogbookCycle.find({
      status: 'POSTED',
      posted_at: { $gte: SINCE },
      deletion_event_id: { $exists: false },
    }).lean();
    summary.logbook = cycles.length;
    console.log(`\n── CarLogbookCycle candidates: ${cycles.length}`);

    for (const cycle of cycles) {
      if (!cycle.event_id) continue;
      if (await hasExistingJe(cycle.event_id)) continue;
      const label = `CarLogbookCycle ${cycle.period}-${cycle.cycle} (${cycle._id})`;
      if (!(await guardPeriod(cycle.entity_id, cycle.period, label))) continue;

      try {
        const days = await CarLogbookEntry.find({
          entity_id: cycle.entity_id, bdm_id: cycle.bdm_id,
          period: cycle.period, cycle: cycle.cycle, status: 'POSTED',
        }).lean();
        const coaMap = await getCoaMap();
        let cashTotal = 0, fundedTotal = 0, fundedCoa = null;
        for (const d of days) {
          for (const fuel of (d.fuel_entries || [])) {
            if (!fuel.payment_mode || fuel.payment_mode === 'CASH') cashTotal += fuel.total_amount || 0;
            else {
              fundedTotal += fuel.total_amount || 0;
              if (!fundedCoa) fundedCoa = await resolveFundingCoa(fuel);
            }
          }
        }
        const totalFuel = cashTotal + fundedTotal;
        if (totalFuel <= 0) { console.log(`  [${label}] SKIP — no fuel amount`); continue; }
        const jeDesc = `Car Logbook ${cycle.period} ${cycle.cycle}`;
        const lines = [{ account_code: coaMap.FUEL_GAS || '6200', account_name: 'Fuel & Gas Expense', debit: totalFuel, credit: 0, description: jeDesc }];
        if (cashTotal > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: cashTotal, description: jeDesc, is_contra: true });
        if (fundedTotal > 0 && fundedCoa) {
          const isContra = /^[156]/.test(String(fundedCoa.coa_code || ''));
          lines.push({ account_code: fundedCoa.coa_code, account_name: fundedCoa.coa_name, debit: 0, credit: fundedTotal, description: jeDesc, is_contra: isContra });
        }
        if (!APPLY) { console.log(`  [${label}] DRY-RUN would post ${lines.length} lines; total_fuel=${totalFuel}`); summary.logbook_repaired += 1; continue; }
        await createAndPostJournal(cycle.entity_id, {
          je_date: new Date(),
          period: cycle.period,
          description: `${jeDesc} (Phase 35 repost)`,
          source_module: 'EXPENSE',
          source_event_id: cycle.event_id,
          source_doc_ref: `LOGBOOK-${cycle.period}-${cycle.cycle}`,
          lines,
          bir_flag: 'BOTH',
          vat_flag: 'N/A',
          bdm_id: cycle.bdm_id,
          created_by: cycle.posted_by || cycle.bdm_id,
        });
        summary.logbook_repaired += 1;
        console.log(`  [${label}] REPOSTED — fuel=${totalFuel}`);
      } catch (err) {
        summary.failed.push({ type: 'CARLOGBOOK', id: String(cycle._id), error: err.message });
        console.error(`  [${label}] FAILED: ${err.message}`);
      }
    }
  }

  // ─── 3) EXPENSE ENTRIES ─────────────────────────────────────────
  if (!TYPE_FILTER || TYPE_FILTER === 'EXPENSE') {
    const expenses = await ExpenseEntry.find({
      status: 'POSTED',
      posted_at: { $gte: SINCE },
      deletion_event_id: { $exists: false },
    });
    summary.expense = expenses.length;
    console.log(`\n── Expense candidates: ${expenses.length}`);

    for (const entry of expenses) {
      if (!entry.event_id) continue;
      if (await hasExistingJe(entry.event_id)) continue;
      const label = `Expense ${entry.period}-${entry.cycle} (${entry._id})`;
      if (!(await guardPeriod(entry.entity_id, entry.period, label))) continue;

      try {
        const coaMap = await getCoaMap();
        const lines = [];
        const desc = `EXP ${entry.period}-${entry.cycle}`;
        let creditOre = 0, creditAccess = 0, accessCoa = null;
        for (const line of (entry.lines || [])) {
          const amt = line.amount || 0;
          if (amt <= 0) continue;
          lines.push({ account_code: line.coa_code || coaMap.MISC_EXPENSE || '6900', account_name: line.expense_category || 'Miscellaneous Expense', debit: amt, credit: 0, description: line.establishment || desc });
          if (line.expense_type === 'ACCESS') { creditAccess += amt; if (!accessCoa) accessCoa = await resolveFundingCoa(line, coaMap.AP_TRADE || '2000'); }
          else { creditOre += amt; }
        }
        if (creditOre > 0) lines.push({ account_code: coaMap.AR_BDM || '1110', account_name: 'AR — BDM Advances', debit: 0, credit: creditOre, description: desc, is_contra: true });
        if (creditAccess > 0) {
          const coa = accessCoa || { coa_code: coaMap.AP_TRADE || '2000', coa_name: 'Accounts Payable — Trade' };
          const isContra = /^[156]/.test(String(coa.coa_code || ''));
          lines.push({ account_code: coa.coa_code, account_name: coa.coa_name, debit: 0, credit: creditAccess, description: desc, is_contra: isContra });
        }
        if (lines.length < 2) { console.log(`  [${label}] SKIP — no lines`); continue; }

        if (!APPLY) { console.log(`  [${label}] DRY-RUN would post ${lines.length} lines`); summary.expense_repaired += 1; continue; }
        await createAndPostJournal(entry.entity_id, {
          je_date: entry.posted_at || new Date(),
          period: entry.period,
          description: `Expenses: ${desc} (Phase 35 repost)`,
          source_module: 'EXPENSE',
          source_event_id: entry.event_id,
          source_doc_ref: `EXP-${entry.period}-${entry.cycle}`,
          lines,
          bir_flag: entry.bir_flag || 'BOTH',
          vat_flag: 'N/A',
          bdm_id: entry.bdm_id,
          created_by: entry.posted_by || entry.bdm_id,
        });
        summary.expense_repaired += 1;
        console.log(`  [${label}] REPOSTED`);
      } catch (err) {
        summary.failed.push({ type: 'EXPENSE', id: String(entry._id), error: err.message });
        console.error(`  [${label}] FAILED: ${err.message}`);
      }
    }
  }

  // ─── 4) PRF/CALF ───────────────────────────────────────────────
  if (!TYPE_FILTER || TYPE_FILTER === 'PRFCALF') {
    const docs = await PrfCalf.find({
      status: 'POSTED',
      posted_at: { $gte: SINCE },
      deletion_event_id: { $exists: false },
    }).lean();
    summary.prfcalf = docs.length;
    console.log(`\n── PRF/CALF candidates: ${docs.length}`);

    for (const doc of docs) {
      if (!doc.event_id) continue;
      if (await hasExistingJe(doc.event_id)) continue;
      const label = `${doc.doc_type} ${doc.prf_number || doc.calf_number || doc.period} (${doc._id})`;
      if (!(await guardPeriod(doc.entity_id, doc.period, label))) continue;

      try {
        const jeData = await journalFromPrfCalf(doc, doc.posted_by || doc.bdm_id);
        if (!jeData) { console.log(`  [${label}] SKIP — zero amount`); continue; }
        jeData.source_event_id = doc.event_id;
        jeData.description = `${jeData.description} (Phase 35 repost)`;
        if (!APPLY) { console.log(`  [${label}] DRY-RUN would post`); summary.prfcalf_repaired += 1; continue; }
        await createAndPostJournal(doc.entity_id, jeData);
        summary.prfcalf_repaired += 1;
        console.log(`  [${label}] REPOSTED`);
      } catch (err) {
        summary.failed.push({ type: 'PRFCALF', id: String(doc._id), error: err.message });
        console.error(`  [${label}] FAILED: ${err.message}`);
      }
    }
  }

  console.log('\n──── SUMMARY ────');
  console.log(`SMER      : ${summary.smer_repaired}/${summary.smer} repaired`);
  console.log(`CarLogbook: ${summary.logbook_repaired}/${summary.logbook} repaired`);
  console.log(`Expense   : ${summary.expense_repaired}/${summary.expense} repaired`);
  console.log(`PrfCalf   : ${summary.prfcalf_repaired}/${summary.prfcalf} repaired`);
  console.log(`Period-locked skips: ${summary.period_locked}`);
  console.log(`Failures  : ${summary.failed.length}`);
  if (summary.failed.length) {
    console.log('\nFailed docs:');
    for (const f of summary.failed) console.log(`  ${f.type} ${f.id}: ${f.error}`);
  }
  if (!APPLY) console.log('\n(Dry-run — no writes made. Add --apply to persist.)');

  await mongoose.disconnect();
  process.exit(summary.failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
