/**
 * JE-Status Tracker — Phase A.4 (May 2026)
 *
 * Stamps `je_status` (POSTED|FAILED), `je_failure_reason`, `je_attempts`, and
 * `last_je_attempt_at` on transactional source docs (SalesLine, Collection,
 * PrfCalf, SupplierInvoice) when their auto-journal call succeeds or throws.
 *
 * Why this exists:
 *   • Some POST paths run autoJournal OUTSIDE the row.save() transaction
 *     (Collection.submitCollections + Collection.postSingleCollection are
 *     the canonical examples). When the JE throws, the row is already
 *     POSTED but the GL is missing the matching entry — silent drift.
 *   • Sales POST paths run JE INSIDE the txn (Phase JE-TX), so a failure
 *     rolls everything back atomically — je_status='FAILED' is unreachable
 *     in those paths. We still stamp 'POSTED' on success for consistency
 *     so the integrity sweep can rely on a single signal.
 *   • Period-close gates on `je_status='FAILED'` rows. Admin must hit the
 *     "Retry JE" button (or void+re-post the source doc) before close.
 *
 * Idempotency: stamps are best-effort. Repeated success calls are no-ops.
 * Repeated failure calls increment je_attempts (auditable retry count).
 *
 * Atomicity: callers may pass an optional Mongoose session so the stamp
 * lives in the same transaction as the row's POST flip.
 */

const STATUSES = Object.freeze({ PENDING: 'PENDING', POSTED: 'POSTED', FAILED: 'FAILED' });

const MODEL_BY_KIND = {
  SALES_LINE: '../models/SalesLine',
  COLLECTION: '../models/Collection',
  PRF_CALF: '../models/PrfCalf',
  SUPPLIER_INVOICE: '../models/SupplierInvoice',
};

function resolveModel(kind) {
  const path = MODEL_BY_KIND[kind];
  if (!path) throw new Error(`jeStatusTracker: unknown kind ${kind}`);
  // eslint-disable-next-line global-require
  return require(path);
}

/**
 * Mark JE attempt successful — sets je_status='POSTED' and clears failure
 * reason. Increments je_attempts so audit can see how many tries it took.
 *
 * @param {string} kind — SALES_LINE | COLLECTION | PRF_CALF | SUPPLIER_INVOICE
 * @param {ObjectId|string} docId
 * @param {object} [opts] — { session, attempt? — defaults to $inc: 1 }
 */
async function markJePosted(kind, docId, opts = {}) {
  const Model = resolveModel(kind);
  const update = {
    $set: {
      je_status: STATUSES.POSTED,
      je_failure_reason: null,
      last_je_attempt_at: new Date(),
    },
    $inc: { je_attempts: 1 },
  };
  await Model.updateOne(
    { _id: docId },
    update,
    { session: opts.session || undefined },
  );
}

/**
 * Mark JE attempt failed — sets je_status='FAILED' and captures the error
 * message (truncated to 500 chars to stop a stack-trace blowing up the doc).
 *
 * Caller still owns the broader audit trail (ErpAuditLog) and the user-facing
 * warning. This stamp is the machine-readable signal the integrity sweep
 * + Retry button + period-close gate consume.
 *
 * @param {string} kind
 * @param {ObjectId|string} docId
 * @param {Error|string} reason
 * @param {object} [opts] — { session }
 */
async function markJeFailed(kind, docId, reason, opts = {}) {
  const Model = resolveModel(kind);
  const message = (reason && reason.message) ? reason.message : String(reason || 'unknown');
  const truncated = message.length > 500 ? `${message.slice(0, 497)}…` : message;

  await Model.updateOne(
    { _id: docId },
    {
      $set: {
        je_status: STATUSES.FAILED,
        je_failure_reason: truncated,
        last_je_attempt_at: new Date(),
      },
      $inc: { je_attempts: 1 },
    },
    { session: opts.session || undefined },
  );
}

module.exports = {
  STATUSES,
  markJePosted,
  markJeFailed,
};
