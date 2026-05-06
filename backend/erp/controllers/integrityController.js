/**
 * Integrity Controller — Phase A.4 (May 2026)
 *
 * Admin-only surface for the AR/AP sub-ledger recon + JE-asymmetry repair
 * tooling. Two endpoints:
 *
 *   POST /api/erp/integrity/retry-je
 *     Re-fire autoJournal for a single POSTED-but-FAILED source doc
 *     (Sale / Collection / PRF/CALF / SupplierInvoice). Idempotent — if a
 *     non-reversed JE already exists for this doc, just stamps
 *     je_status='POSTED' and returns without re-firing.
 *
 *   POST /api/erp/integrity/recompute-ar
 *     Bulk-refresh outstanding_amount across every POSTED SalesLine +
 *     SupplierInvoice in the entity. Slow but idempotent. Surfaced as the
 *     "Refresh AR Aging" admin button.
 *
 * Both endpoints are role-gated via JE_RETRY_ROLES lookup (defaults
 * admin/finance/president). Subscribers tune per-entity.
 */

const mongoose = require('mongoose');
const SalesLine = require('../models/SalesLine');
const Collection = require('../models/Collection');
const PrfCalf = require('../models/PrfCalf');
const SupplierInvoice = require('../models/SupplierInvoice');
const JournalEntry = require('../models/JournalEntry');
const Hospital = require('../models/Hospital');
const ErpAuditLog = require('../models/ErpAuditLog');
const { catchAsync } = require('../../middleware/errorHandler');
const {
  journalFromSale,
  journalFromServiceRevenue,
  journalFromCollection,
  journalFromCWT,
  journalFromPrfCalf,
  journalFromAP,
  resolveFundingCoa,
} = require('../services/autoJournal');
const { createAndPostJournal } = require('../services/journalEngine');
const { markJePosted, markJeFailed } = require('../services/jeStatusTracker');
const arAgingService = require('../services/arAgingService');
const { userCanRetryJe, userCanRecomputeAr } = require('../utils/jeRetryAccess');

const VALID_KINDS = ['SALES_LINE', 'COLLECTION', 'PRF_CALF', 'SUPPLIER_INVOICE'];

/**
 * POST /retry-je
 * Body: { kind, doc_id }
 */
const retryJe = catchAsync(async (req, res) => {
  const { kind, doc_id } = req.body || {};
  if (!kind || !VALID_KINDS.includes(kind)) {
    return res.status(400).json({ success: false, message: `kind must be one of ${VALID_KINDS.join(', ')}` });
  }
  if (!doc_id || !mongoose.Types.ObjectId.isValid(doc_id)) {
    return res.status(400).json({ success: false, message: 'doc_id (ObjectId) required' });
  }

  if (!(await userCanRetryJe(req))) {
    return res.status(403).json({
      success: false,
      message: 'Your role is not permitted to retry JE writes. Lookup: JE_RETRY_ROLES.RETRY_JE',
    });
  }

  // Resolve the source doc + its event_id (idempotency key for JournalEntry).
  let doc;
  let Model;
  try {
    if (kind === 'SALES_LINE') Model = SalesLine;
    else if (kind === 'COLLECTION') Model = Collection;
    else if (kind === 'PRF_CALF') Model = PrfCalf;
    else if (kind === 'SUPPLIER_INVOICE') Model = SupplierInvoice;
    // eslint-disable-next-line vip-tenant/require-entity-filter -- _id from req.body; entity-scope check below
    doc = await Model.findById(doc_id);
    if (!doc) return res.status(404).json({ success: false, message: `${kind} ${doc_id} not found` });
    if (String(doc.entity_id) !== String(req.entityId)) {
      return res.status(403).json({ success: false, message: 'Document belongs to a different entity' });
    }
    if (doc.status !== 'POSTED') {
      return res.status(400).json({
        success: false,
        message: `Document is in status '${doc.status}' — only POSTED docs can have JE retried`,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: `Lookup failed: ${err.message}` });
  }

  // Idempotency — if a non-reversed JE already exists for this event_id, stamp
  // je_status='POSTED' and exit without firing a duplicate write.
  if (doc.event_id) {
    // eslint-disable-next-line vip-tenant/require-entity-filter -- source_event_id is unique; doc entity-scoped above
    const existingJe = await JournalEntry.findOne({
      source_event_id: doc.event_id,
      status: 'POSTED',
      is_reversal: { $ne: true },
    }).select('_id je_number').lean();
    if (existingJe) {
      await markJePosted(kind, doc._id);
      return res.json({
        success: true,
        message: `JE already exists (${existingJe.je_number || existingJe._id}) — je_status synced to POSTED`,
        je_status: 'POSTED',
        je_number: existingJe.je_number || null,
      });
    }
  }

  // Build + fire the autoJournal call appropriate to the kind. Wrapped in
  // try/catch so the je_status stamp captures the precise failure reason.
  let jeData;
  let je;
  try {
    if (kind === 'SALES_LINE') {
      jeData = doc.sale_type === 'SERVICE_INVOICE'
        ? await journalFromServiceRevenue(doc, doc.entity_id, req.user._id)
        : await journalFromSale(doc, doc.entity_id, req.user._id);
    } else if (kind === 'COLLECTION') {
      const funding = await resolveFundingCoa(doc);
      jeData = await journalFromCollection(doc, funding.coa_code, funding.coa_name, req.user._id);
    } else if (kind === 'PRF_CALF') {
      jeData = await journalFromPrfCalf(doc, req.user._id);
    } else if (kind === 'SUPPLIER_INVOICE') {
      jeData = await journalFromAP(doc.toObject(), req.user._id);
    }

    if (!jeData) {
      // journalFromSale returns null for zero-amount sales (samples). That's
      // a valid POSTED state with no GL entry — stamp POSTED and exit.
      await markJePosted(kind, doc._id);
      return res.json({
        success: true,
        message: 'Document is zero-amount — no JE required (je_status synced to POSTED)',
        je_status: 'POSTED',
      });
    }

    jeData.source_event_id = doc.event_id || null;
    je = await createAndPostJournal(doc.entity_id, jeData);
    await markJePosted(kind, doc._id);

    // Side effect: for Collection retry, also fire the CWT journal if applicable
    // (mirrors submitCollections wiring). Best-effort — log on failure.
    if (kind === 'COLLECTION' && doc.cwt_amount > 0) {
      try {
        const cwtHosp = doc.hospital_id
          ? await Hospital.findById(doc.hospital_id).select('hospital_name').lean()
          : null;
        const cwtInput = { ...doc.toObject(), hospital_name: cwtHosp?.hospital_name || '' };
        const cwtData = await journalFromCWT(cwtInput, req.user._id);
        cwtData.source_event_id = doc.event_id || null;
        await createAndPostJournal(doc.entity_id, cwtData);
      } catch (cwtErr) {
        console.warn(`[retryJe] CWT JE retry failed for ${doc.cr_no}:`, cwtErr.message);
      }
    }

    // Side effect: re-recompute AR outstanding for any settled CSIs.
    if (kind === 'COLLECTION') {
      try {
        await arAgingService.recomputeOutstandingForCollection(doc);
      } catch (recomputeErr) {
        console.warn(`[retryJe] AR recompute failed:`, recomputeErr.message);
      }
    }

    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      log_type: 'JE_RETRY_SUCCESS',
      target_ref: doc.cr_no || doc.doc_ref || doc.invoice_ref || doc.prf_number || String(doc._id),
      target_model: kind,
      changed_by: req.user._id,
      note: `Retry JE succeeded — je_number=${je?.je_number || 'unknown'}`,
    }).catch(() => {});

    return res.json({
      success: true,
      message: `JE re-fired successfully (${je?.je_number || je?._id})`,
      je_status: 'POSTED',
      je_number: je?.je_number || null,
    });
  } catch (jeErr) {
    await markJeFailed(kind, doc._id, jeErr);
    await ErpAuditLog.logChange({
      entity_id: req.entityId,
      log_type: 'JE_RETRY_FAILURE',
      target_ref: doc.cr_no || doc.doc_ref || doc.invoice_ref || doc.prf_number || String(doc._id),
      target_model: kind,
      field_changed: 'auto_journal',
      old_value: '',
      new_value: jeErr.message,
      changed_by: req.user._id,
      note: `Retry JE failed for ${kind} ${doc._id}`,
    }).catch(() => {});
    return res.status(500).json({
      success: false,
      message: `Retry failed: ${jeErr.message}`,
      je_status: 'FAILED',
      je_failure_reason: jeErr.message,
    });
  }
});

/**
 * POST /recompute-ar
 * Bulk refresh of outstanding_amount across the entity's POSTED rows.
 */
const recomputeAr = catchAsync(async (req, res) => {
  if (!(await userCanRecomputeAr(req))) {
    return res.status(403).json({
      success: false,
      message: 'Your role is not permitted to recompute AR. Lookup: JE_RETRY_ROLES.RECOMPUTE_AR',
    });
  }

  const arResult = await arAgingService.recomputeAllOutstandingForEntity(req.entityId);

  // AP — walk SupplierInvoices similarly
  let apScanned = 0, apUpdated = 0, apSkipped = 0;
  const apOver = [];
  // eslint-disable-next-line vip-tenant/require-entity-filter -- explicit entity_id filter on cursor
  const cursor = SupplierInvoice.find({ entity_id: req.entityId, status: 'POSTED' })
    .select('_id')
    .cursor({ batchSize: 200 });
  for await (const doc of cursor) {
    apScanned += 1;
    const r = await arAgingService.recomputeOutstandingForSupplierInvoice(doc._id);
    if (r.skipped) apSkipped += 1;
    else apUpdated += 1;
    if (r.over_paid > 0) apOver.push({ _id: String(r._id), over: r.over_paid });
  }

  await ErpAuditLog.logChange({
    entity_id: req.entityId,
    log_type: 'AR_RECOMPUTE',
    target_ref: 'BULK',
    target_model: 'SalesLine+SupplierInvoice',
    changed_by: req.user._id,
    note: `AR ${arResult.updated}/${arResult.scanned}; AP ${apUpdated}/${apScanned}`,
  }).catch(() => {});

  return res.json({
    success: true,
    message: `AR/AP outstanding refreshed across ${arResult.scanned + apScanned} row(s)`,
    ar: arResult,
    ap: { scanned: apScanned, updated: apUpdated, skipped: apSkipped, over_paid: apOver },
  });
});

module.exports = { retryJe, recomputeAr };
