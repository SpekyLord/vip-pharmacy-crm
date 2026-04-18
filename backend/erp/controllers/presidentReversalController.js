/**
 * President Reversal Console Controller
 *
 * Cross-module read + dispatch endpoints for the central /erp/president/reversals
 * page. Read endpoints (list/history/preview) are gated by sub-permission
 * `accounting.reversal_console` so finance/admin can audit without being able to
 * trigger reversals. The reverse endpoint is gated by `accounting.reverse_posted`.
 *
 * Subscription/scalability:
 *   - Both sub-permissions are seeded as ERP_SUB_PERMISSION lookups
 *     (ACCOUNTING__REVERSAL_CONSOLE + ACCOUNTING__REVERSE_POSTED) so subscribers
 *     configure access via Access Templates without code changes.
 *   - The cross-module list reads from the registry (REVERSAL_HANDLERS) so a new
 *     module appears automatically once its handler is registered.
 */

const { catchAsync } = require('../../middleware/errorHandler');
const {
  presidentReverse,
  listReversibleDocs,
  listReversalHistory,
  previewDependents,
  REVERSAL_HANDLERS,
} = require('../services/documentReversalService');
const {
  buildDocumentDetails,
  REVERSAL_DOC_TYPE_TO_MODULE,
} = require('../services/documentDetailBuilder');
const { hydrateReversalDetail } = require('../services/documentDetailHydrator');

/**
 * GET /erp/president/reversals/registry
 * Returns the list of reversible doc types so the frontend can populate the
 * filter dropdown without hardcoding. Lookup-driven scaffolding.
 */
const getRegistry = catchAsync(async (req, res) => {
  const types = Object.entries(REVERSAL_HANDLERS).map(([code, h]) => ({
    code,
    label: h.label,
    module: h.module,
  }));
  res.json({ success: true, data: types });
});

/**
 * GET /erp/president/reversals/reversible
 * Cross-module list of reversible POSTED docs. Filterable by doc_types[],
 * entity_id, from_date, to_date. Default scope is the caller's entity unless
 * they pass `?entity_id=ALL` explicitly (which only privileged callers can do).
 */
const getReversible = catchAsync(async (req, res) => {
  const { doc_types, from_date, to_date } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  // Privileged-user query-filter rule (CLAUDE.md §21):
  // Default to caller's working entity. Allow `?entity_id=ALL` for cross-entity
  // visibility — but ONLY for privileged users. Non-privileged callers always
  // get their working entity regardless of the param.
  const privileged = req.isPresident || req.isAdmin || req.isFinance;
  let entityId = req.entityId;
  if (privileged && req.query.entity_id) {
    entityId = req.query.entity_id === 'ALL' ? null : req.query.entity_id;
  }

  const types = doc_types ? String(doc_types).split(',').filter(Boolean) : null;
  const result = await listReversibleDocs({
    doc_types: types,
    entityId,
    fromDate: from_date,
    toDate: to_date,
    page,
    limit,
  });
  res.json({ success: true, ...result });
});

/**
 * GET /erp/president/reversals/history
 * Reversal audit log feed. Filterable by entity, doc_type, date.
 */
const getHistory = catchAsync(async (req, res) => {
  const { doc_type, from_date, to_date } = req.query;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  const privileged = req.isPresident || req.isAdmin || req.isFinance;
  let entityId = req.entityId;
  if (privileged && req.query.entity_id) {
    entityId = req.query.entity_id === 'ALL' ? null : req.query.entity_id;
  }

  const result = await listReversalHistory({
    entityId, doc_type, fromDate: from_date, toDate: to_date, page, limit,
  });
  res.json({ success: true, ...result });
});

/**
 * GET /erp/president/reversals/preview/:doc_type/:doc_id
 * Returns dependent docs (if any) that would block reversal — so the UI can
 * warn the user before they click Reverse.
 */
const getPreview = catchAsync(async (req, res) => {
  const { doc_type, doc_id } = req.params;
  try {
    const result = await previewDependents({ doc_type, doc_id, tenantFilter: req.tenantFilter || {} });
    res.json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
});

/**
 * POST /erp/president/reversals/reverse
 * Body: { doc_type, doc_id, reason, confirm: 'DELETE' }
 * Central reverse dispatch — same SAP Storno path as per-module endpoints.
 */
const postReverse = catchAsync(async (req, res) => {
  const { doc_type, doc_id, reason, confirm } = req.body || {};
  if (!doc_type || !doc_id) {
    return res.status(400).json({ success: false, message: 'doc_type and doc_id are required' });
  }
  if (confirm !== 'DELETE') {
    return res.status(400).json({ success: false, message: 'Type DELETE in the confirmation field to proceed' });
  }
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'Reason is required' });
  }

  try {
    const result = await presidentReverse({
      doc_type, doc_id, reason,
      user: req.user,
      tenantFilter: req.tenantFilter || {},
    });
    res.json({
      success: true,
      message: result.mode === 'HARD_DELETE'
        ? `Deleted ${result.doc_ref || result.doc_id} (no posting side effects)`
        : `Reversed ${result.doc_ref || result.doc_id} (${result.mode}) — original retained for audit`,
      data: result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
      dependents: err.dependents || undefined,
    });
  }
});

/**
 * GET /erp/president/reversals/detail/:doc_type/:doc_id
 * Rich per-module detail (same shape as Approval Hub's `details` object). Used
 * by the Reversal Console's expandable row. Lazy-fetched on expand so the list
 * payload stays light even when there are thousands of POSTED docs.
 *
 * Preferred path: documentDetailHydrator.hydrateReversalDetail — re-fetches the
 * doc with ref .populate() (hospital/customer/warehouse/vendor/fund/entity),
 * cross-DB product-name + inventory stock lookup, and S3 URL signing. Mirrors
 * the three enrichment passes Approval Hub runs at list time, so the two
 * screens render identical information.
 *
 * Fallback path: REVERSAL_HANDLERS[].load() + raw builder. Used only for
 * doc_types not yet registered in the hydrator, so new handlers still work
 * (shown without populated refs / cross-DB names) until a populated loader is
 * added. Tenant scope is enforced in both paths.
 */
const getDetail = catchAsync(async (req, res) => {
  const { doc_type, doc_id } = req.params;
  const handler = REVERSAL_HANDLERS[doc_type];
  if (!handler) {
    return res.status(400).json({ success: false, message: `Unknown doc_type='${doc_type}'` });
  }

  const tenantFilter = req.tenantFilter || {};

  // Preferred: fully hydrated (populated + cross-DB + signed photos).
  try {
    const hydrated = await hydrateReversalDetail(doc_type, doc_id, tenantFilter);
    if (hydrated) {
      return res.json({
        success: true,
        data: {
          doc_type,
          doc_id,
          module: hydrated.module,
          doc_ref: hydrated.doc_ref,
          status: hydrated.status,
          details: hydrated.details,
        },
      });
    }
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }

  // Fallback for doc_types without a hydrator entry yet.
  let doc;
  try {
    doc = await handler.load({ doc_id, tenantFilter });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }

  const moduleKey = REVERSAL_DOC_TYPE_TO_MODULE[doc_type] || doc_type;
  const details = buildDocumentDetails(moduleKey, doc);

  res.json({
    success: true,
    data: {
      doc_type,
      doc_id,
      module: moduleKey,
      doc_ref: doc.doc_ref || doc.cr_no || doc.calf_number || doc.prf_number
        || doc.transfer_ref || doc.je_number || doc.invoice_number || String(doc._id),
      status: doc.status,
      details,
    },
  });
});

module.exports = {
  getRegistry,
  getReversible,
  getHistory,
  getPreview,
  getDetail,
  postReverse,
};
