/**
 * integrityService — Phase A.4 (May 2026)
 *
 * Wraps /api/erp/integrity admin endpoints. Backed by integrityController.
 * Role gates backend-driven via JE_RETRY_ROLES lookup; frontend trusts 403s
 * and renders disabled-state for UI elements the caller cannot reach.
 */
import api from '../../services/api';

const BASE = '/erp/integrity';

/**
 * Re-fire autoJournal for a single POSTED-but-FAILED source doc.
 * @param {'SALES_LINE'|'COLLECTION'|'PRF_CALF'|'SUPPLIER_INVOICE'} kind
 * @param {string} docId
 * @returns {Promise<{success, message, je_status, je_number?, je_failure_reason?}>}
 */
export async function retryJe(kind, docId) {
  const { data } = await api.post(`${BASE}/retry-je`, { kind, doc_id: docId });
  return data;
}

/**
 * Bulk recompute outstanding_amount across the entity's POSTED rows.
 * Idempotent. Slow on large datasets — show a spinner.
 * @returns {Promise<{success, message, ar, ap}>}
 */
export async function recomputeAr() {
  const { data } = await api.post(`${BASE}/recompute-ar`, {});
  return data;
}

export default { retryJe, recomputeAr };
