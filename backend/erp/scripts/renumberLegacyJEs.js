/* eslint-disable vip-tenant/require-entity-filter -- standalone admin/migration/diagnostic script: no req context; intentional cross-entity reads/writes for ops work */
/**
 * Migration: renumber legacy JournalEntry.je_number values.
 *
 * Legacy rollout stored a raw DocSequence number (e.g. "8"). Apr 2026 switched
 * to `JE-{ENTITY_CODE}{MMDDYY}-{NNN}` via `services/docNumbering.js#generateJeNumber`.
 * Existing JEs in the DB still show bare numbers in the detail panel.
 *
 * This script finds every JE whose `je_number` is purely numeric and rewrites
 * it using the new format, keyed by each JE's own `entity_id` + `je_date`.
 * Sequence numbers come from DocSequence, so the rewritten numbers interleave
 * safely with any already-correct same-day JEs.
 *
 * Also re-derives `source_doc_ref` for SALES JEs where the ref is a 24-char
 * hex ObjectId (legacy fallback from the old `journalFromSale`), by looking
 * up the linked SalesLine's `doc_ref` (CSI booklet#) or `invoice_number`.
 *
 * Safe to re-run — the numeric filter skips already-migrated JEs.
 *
 * Usage: node backend/erp/scripts/renumberLegacyJEs.js [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const db = require('../../config/db');
const JournalEntry = require('../models/JournalEntry');
const SalesLine = require('../models/SalesLine');
const { generateJeNumber } = require('../services/docNumbering');

const DRY_RUN = process.argv.includes('--dry-run');
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const NUMERIC_RE = /^\d+$/;

async function migrate() {
  await db();

  const legacy = await JournalEntry.find({ je_number: { $regex: NUMERIC_RE } })
    .select('_id entity_id je_date je_number source_module source_doc_ref source_event_id')
    .sort({ je_date: 1, created_at: 1 })
    .lean();

  console.log(`Found ${legacy.length} JE(s) with legacy numeric je_number`);

  let renumbered = 0;
  let refFixed = 0;
  const failures = [];

  for (const je of legacy) {
    const updates = {};

    try {
      const newNumber = await generateJeNumber({ entityId: je.entity_id, date: je.je_date });
      updates.je_number = newNumber;
    } catch (err) {
      failures.push({ id: je._id.toString(), reason: `je_number: ${err.message}` });
      continue;
    }

    // Legacy sales fallback wrote ObjectId hex strings into source_doc_ref.
    // Resolve those to the SalesLine's human-readable doc_ref.
    if (je.source_module === 'SALES' && je.source_doc_ref && OBJECT_ID_RE.test(je.source_doc_ref)) {
      try {
        const sale = await SalesLine.findById(je.source_doc_ref)
          .select('doc_ref invoice_number sale_type')
          .lean();
        const resolved = sale?.doc_ref || sale?.invoice_number;
        if (resolved) {
          updates.source_doc_ref = resolved;
          updates.description = `${sale.sale_type === 'SERVICE_INVOICE' ? 'SI' : sale.sale_type === 'CASH_RECEIPT' ? 'CR' : 'CSI'} ${resolved}`;
          refFixed++;
        }
      } catch (err) {
        // non-fatal — renumbering still applies
        console.warn(`  ⚠ source_doc_ref resolve failed for JE ${je._id}: ${err.message}`);
      }
    }

    if (DRY_RUN) {
      console.log(`  [dry] ${je.je_number} → ${updates.je_number}${updates.source_doc_ref ? ` · doc_ref → ${updates.source_doc_ref}` : ''}`);
    } else {
      try {
        await JournalEntry.updateOne({ _id: je._id }, { $set: updates });
      } catch (err) {
        failures.push({ id: je._id.toString(), reason: err.message });
        continue;
      }
    }
    renumbered++;
  }

  console.log('');
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Renumbered: ${renumbered}/${legacy.length}`);
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}source_doc_ref resolved: ${refFixed}`);
  if (failures.length) {
    console.log(`Failures: ${failures.length}`);
    failures.forEach(f => console.log(`  ✗ ${f.id}: ${f.reason}`));
  }

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
