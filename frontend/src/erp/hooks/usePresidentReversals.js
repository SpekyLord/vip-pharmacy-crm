import useErpApi from './useErpApi';

/**
 * usePresidentReversals — client for /api/erp/president/reversals/* endpoints.
 * Powers the central Reversal Console (cross-module list + history + preview).
 *
 * All endpoints require sub-permission `accounting.reversal_console` (read) or
 * `accounting.reverse_posted` (write). Configure in Access Templates.
 */
export default function usePresidentReversals() {
  const api = useErpApi();

  // List of registered doc types — drives the type filter dropdown without
  // hardcoding (subscription-ready: a new module appears as soon as its handler
  // is registered in documentReversalService.REVERSAL_HANDLERS).
  const getRegistry = () => api.get('/president/reversals/registry');

  // Cross-module list of reversible POSTED docs.
  const getReversible = (params = {}) =>
    api.get('/president/reversals/reversible', { params });

  // Reversal audit history (ErpAuditLog where log_type='PRESIDENT_REVERSAL').
  const getHistory = (params = {}) =>
    api.get('/president/reversals/history', { params });

  // Preview the dependent-doc check (does NOT mutate). Use to warn the user
  // before they click Reverse.
  const getPreview = (docType, docId) =>
    api.get(`/president/reversals/preview/${docType}/${docId}`);

  // Phase 31 — lazy-fetch full per-module detail (same shape as Approval Hub).
  // Called on row expand; result cached by the page component.
  const getDetail = (docType, docId) =>
    api.get(`/president/reversals/detail/${docType}/${docId}`);

  // Central reverse dispatch — same SAP Storno path as per-module endpoints.
  const reverse = ({ doc_type, doc_id, reason, confirm }) =>
    api.post('/president/reversals/reverse', { doc_type, doc_id, reason, confirm });

  return { ...api, getRegistry, getReversible, getHistory, getPreview, getDetail, reverse };
}
