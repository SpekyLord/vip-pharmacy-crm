/**
 * autoPrfRouting — Phase VIP-1.B (Apr 2026)
 *
 * Generates PRFs (Payment Requisition Forms) from rebate accruals on
 * Collection POSTED events.
 *
 * Trigger:
 *   Collection lifecycle controller calls `routePrfsForCollection(collectionId,
 *   userId, opts)` after a Collection transitions to POSTED. The collection's
 *   settled_csis must have `md_rebate_lines` and `partner_tags` already
 *   populated by the Collection.js pre-save bridge (Phase 2 wire — coming).
 *
 * Behavior:
 *   For each Collection POSTED:
 *     1. Walk settled_csis, collect rebates by payee.
 *     2. Write RebatePayout(ACCRUING) rows for the audit ledger (idempotent
 *        on the unique compound key).
 *     3. For each unique (payee_id, period) seen this collection, find or
 *        create a PrfCalf row. Idempotent — re-running on the same
 *        collection produces zero new PRFs.
 *
 * Idempotency strategy:
 *   - RebatePayout uniqueness enforced by its compound index.
 *   - PrfCalf idempotency: query for existing PRF whose source_collection_ids
 *     contains this collection_id for this payee. Skip if found.
 *
 * Approval routing (Rule #20):
 *   PRFs created here go through normal lifecycle (DRAFT) and are submitted
 *   later by the controller via `gateApproval('PRF', ...)`. autoPrfRouting
 *   does NOT auto-submit — admin/finance reviews and submits PRFs after
 *   period close.
 *
 * BIR_FLAG: PRFs default bir_flag='INTERNAL' (autoJournal.js:journalFromPrfCalf
 * post-Phase 0 fix bc57fba). No explicit override needed here — the JE that
 * lands when the PRF posts inherits the policy.
 *
 * Transactional posture:
 *   The caller (collectionController on POST) holds an outer mongoose
 *   transaction. We accept an optional `session` param so writes happen
 *   inside that transaction. If the transaction aborts, all RebatePayout +
 *   PrfCalf writes roll back atomically.
 */

const mongoose = require('mongoose');

const Collection = require('../models/Collection');
const PrfCalf = require('../models/PrfCalf');
const RebatePayout = require('../models/RebatePayout');

/**
 * Derive the period string ("YYYY-MM") from a Collection's cr_date.
 * Same convention as the rest of the ERP (collectionController.computePeriod).
 */
function deriveCollectionPeriod(collection) {
  const d = new Date(collection.cr_date || collection.createdAt || Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/**
 * Aggregate rebate lines from a collection's settled_csis into a per-payee map.
 *
 * Returns:
 *   {
 *     md: Map<doctor_id_str, { payee_id, payee_name, lines: [...], total }>,
 *     nonMd: Map<partner_id_str, { payee_id, payee_name, lines: [...], total }>
 *   }
 *
 * Each line carries enough source-doc context (sales_line_id, csi doc_ref,
 * product_id, base_amount) for the PRF to render an itemized payment summary
 * and for the matching RebatePayout to populate audit refs.
 */
function aggregateRebatesByPayee(collection) {
  const md = new Map();
  const nonMd = new Map();
  for (const csi of collection.settled_csis || []) {
    // MD rebates from md_rebate_lines (populated by Phase 2 Collection.js bridge).
    for (const ln of csi.md_rebate_lines || []) {
      const key = String(ln.md_id);
      if (!md.has(key)) {
        md.set(key, {
          payee_id: ln.md_id,
          payee_name: ln.md_name || '',
          lines: [],
          total: 0,
        });
      }
      const bucket = md.get(key);
      bucket.lines.push({
        sales_line_id: csi.sales_line_id || ln.sales_line_id,
        product_id: ln.product_id || null,
        product_label: ln.product_label || '',
        rebate_pct: ln.rebate_pct || 0,
        rebate_amount: ln.rebate_amount || 0,
        base_amount: ln.base_amount || csi.net_of_vat || 0,
        md_product_rebate_id: ln.rule_id || null,
      });
      bucket.total += ln.rebate_amount || 0;
    }
    // Non-MD rebates from partner_tags[].
    for (const tag of csi.partner_tags || []) {
      if (!tag.doctor_id || !(tag.rebate_amount > 0)) continue;
      const key = String(tag.doctor_id);
      if (!nonMd.has(key)) {
        nonMd.set(key, {
          payee_id: tag.doctor_id,
          payee_name: tag.doctor_name || '',
          lines: [],
          total: 0,
        });
      }
      const bucket = nonMd.get(key);
      bucket.lines.push({
        sales_line_id: csi.sales_line_id,
        rebate_pct: tag.rebate_pct || 0,
        rebate_amount: tag.rebate_amount || 0,
        base_amount: csi.net_of_vat || 0,
        non_md_rule_id: tag.rule_id || null,
      });
      bucket.total += tag.rebate_amount || 0;
    }
  }
  return { md, nonMd };
}

/**
 * Write RebatePayout(ACCRUING) rows for one payee bucket. Idempotent — the
 * model's compound unique index swallows duplicate inserts; we use ordered:false
 * to continue past dups when the same collection is re-routed.
 *
 * @returns {Promise<RebatePayout[]>} the inserted (or already-existing) rows
 */
async function writeRebatePayouts({
  entity_id,
  collection_id,
  period,
  bucket,
  payee_kind,
  source_kind,
  session,
}) {
  const docs = bucket.lines.map((ln) => ({
    entity_id,
    payee_kind, // 'MD' | 'NON_MD'
    payee_id: bucket.payee_id,
    payee_name: bucket.payee_name,
    source_kind, // 'TIER_A_PRODUCT' | 'NON_MD'
    collection_id,
    sales_line_id: ln.sales_line_id || null,
    product_id: ln.product_id || null,
    product_label: ln.product_label || '',
    md_product_rebate_id: ln.md_product_rebate_id || null,
    non_md_rule_id: ln.non_md_rule_id || null,
    rebate_pct: ln.rebate_pct || 0,
    rebate_amount: ln.rebate_amount || 0,
    base_amount: ln.base_amount || 0,
    period,
    status: 'ACCRUING',
  }));

  if (!docs.length) return [];

  try {
    return await RebatePayout.insertMany(docs, {
      ordered: false,
      session,
    });
  } catch (err) {
    // E11000 dup-key swallowed: prior accruals for the same source-line are
    // expected on idempotent replays. Re-throw anything else.
    if (err.code !== 11000 && (err.writeErrors || []).every((e) => e.code !== 11000)) {
      throw err;
    }
    // Return what's now in the DB for this collection / payee.
    return RebatePayout.find({
      entity_id,
      collection_id,
      payee_id: bucket.payee_id,
      period,
    })
      .session(session || null)
      .lean();
  }
}

/**
 * Find or create a DRAFT PrfCalf for this (entity, payee, period) tuple,
 * already containing this collection's rebate lines. If a PRF already
 * references this collection_id, return it untouched (idempotent).
 *
 * For simplicity, v1 creates ONE PRF per (collection, payee, period). Future
 * Phase 2.5 may upgrade to per-period rollup that aggregates multiple
 * collections — but that complicates voiding when one upstream collection
 * reopens, so v1 keeps it simple.
 */
async function ensurePrfForBucket({
  entity_id,
  bdm_id,
  collection_id,
  collection_doc_ref,
  cycle,
  period,
  bucket,
  payee_kind,
  userId,
  session,
}) {
  // Idempotency check: any DRAFT or POSTED PRF whose source already references
  // this (collection, payee, period)?
  const existing = await PrfCalf.findOne({
    entity_id,
    doc_type: 'PRF',
    period,
    'metadata.source_collection_id': collection_id,
    'metadata.payee_id': bucket.payee_id,
  })
    .session(session || null)
    .lean();
  if (existing) return existing;

  const prfPayload = {
    entity_id,
    bdm_id,
    doc_type: 'PRF',
    prf_type: 'PARTNER_REBATE',
    period,
    cycle,
    payee_name: bucket.payee_name,
    // Populate first-class fields so existing reverse-lookups (linked_collection_id,
    // partner_id, payee_type) keep working. Schema-level fields are the canonical
    // source of truth; metadata is the auto-generation provenance + idempotency key.
    partner_id: bucket.payee_id,
    payee_type: payee_kind === 'MD' ? 'DOCTOR' : 'NON_MD_PARTNER',
    linked_collection_id: collection_id,
    rebate_amount: bucket.total,
    amount: bucket.total,
    bir_flag: 'INTERNAL', // explicit — rebate JEs never hit BIR P&L (Phase 0)
    purpose: `${payee_kind === 'MD' ? 'MD' : 'Non-MD'} partner rebate — ${
      collection_doc_ref || 'CR'
    }`,
    status: 'DRAFT',
    created_by: userId,
    metadata: {
      auto_generated_by: 'autoPrfRouting',
      source_collection_id: collection_id,
      payee_id: bucket.payee_id,
      payee_kind, // 'MD' | 'NON_MD'
      lines: bucket.lines,
    },
  };

  const created = await PrfCalf.create(
    [prfPayload],
    session ? { session } : undefined
  );
  return Array.isArray(created) ? created[0] : created;
}

/**
 * Main entry point. Called by collectionController on POSTED transition.
 *
 * @param {Object} args
 * @param {ObjectId|string} args.collectionId
 * @param {ObjectId|string} args.userId
 * @param {ClientSession} [args.session] — outer Mongo transaction session
 * @returns {Promise<{ rebatePayouts: number, prfsCreated: number, prfsExisted: number }>}
 */
async function routePrfsForCollection({ collectionId, userId, session } = {}) {
  if (!collectionId) {
    throw new Error('autoPrfRouting.routePrfsForCollection: collectionId required');
  }

  const collection = await Collection.findById(collectionId)
    .session(session || null)
    .lean();
  if (!collection) {
    throw new Error(`autoPrfRouting: collection ${collectionId} not found`);
  }
  if (collection.status !== 'POSTED') {
    // Defensive — caller should only invoke on POSTED.
    throw new Error(
      `autoPrfRouting: refusing to route PRFs for non-POSTED collection (status=${collection.status})`
    );
  }

  const period = deriveCollectionPeriod(collection);
  const cycle = collection.cycle || 'M1'; // sensible default — admin re-tags if needed

  const { md, nonMd } = aggregateRebatesByPayee(collection);

  let rebatePayoutsCount = 0;
  let prfsCreated = 0;
  let prfsExisted = 0;

  for (const [, bucket] of md) {
    if (!(bucket.total > 0)) continue;
    const payouts = await writeRebatePayouts({
      entity_id: collection.entity_id,
      collection_id: collection._id,
      period,
      bucket,
      payee_kind: 'MD',
      source_kind: 'TIER_A_PRODUCT',
      session,
    });
    rebatePayoutsCount += payouts.length;

    const prf = await ensurePrfForBucket({
      entity_id: collection.entity_id,
      bdm_id: collection.bdm_id,
      collection_id: collection._id,
      collection_doc_ref: collection.cr_no,
      cycle,
      period,
      bucket,
      payee_kind: 'MD',
      userId,
      session,
    });
    if (prf?.metadata?.auto_generated_by === 'autoPrfRouting' && prf.createdAt) {
      // Heuristic: if PRF was created within last 5s, count as created. Else existed.
      const isFresh = Date.now() - new Date(prf.createdAt).getTime() < 5000;
      if (isFresh) prfsCreated += 1;
      else prfsExisted += 1;
    } else {
      prfsCreated += 1;
    }
  }

  for (const [, bucket] of nonMd) {
    if (!(bucket.total > 0)) continue;
    const payouts = await writeRebatePayouts({
      entity_id: collection.entity_id,
      collection_id: collection._id,
      period,
      bucket,
      payee_kind: 'NON_MD',
      source_kind: 'NON_MD',
      session,
    });
    rebatePayoutsCount += payouts.length;

    const prf = await ensurePrfForBucket({
      entity_id: collection.entity_id,
      bdm_id: collection.bdm_id,
      collection_id: collection._id,
      collection_doc_ref: collection.cr_no,
      cycle,
      period,
      bucket,
      payee_kind: 'NON_MD',
      userId,
      session,
    });
    if (prf?.metadata?.auto_generated_by === 'autoPrfRouting' && prf.createdAt) {
      const isFresh = Date.now() - new Date(prf.createdAt).getTime() < 5000;
      if (isFresh) prfsCreated += 1;
      else prfsExisted += 1;
    } else {
      prfsCreated += 1;
    }
  }

  return {
    rebatePayouts: rebatePayoutsCount,
    prfsCreated,
    prfsExisted,
    payeesProcessed: md.size + nonMd.size,
  };
}

module.exports = {
  deriveCollectionPeriod,
  aggregateRebatesByPayee,
  writeRebatePayouts,
  ensurePrfForBucket,
  routePrfsForCollection,
};
