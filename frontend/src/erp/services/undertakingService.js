/**
 * undertakingService — Phase 32R frontend bridge
 *
 * Phase 32R: GRN is the capture page (product + qty + batch/lot + expiry +
 * waybill upload). Undertaking is a read-only approval wrapper — the BDM
 * double-checks the auto-populated record, then Validates & Submits. An
 * approver acknowledges → GRN auto-approves in the same session.
 *
 * Wrapped endpoints:
 *   - GET   /undertaking                       list (filters + pagination)
 *   - GET   /undertaking/:id                   detail (populated linked_grn + products)
 *   - POST  /undertaking/:id/submit            DRAFT → SUBMITTED (may return 202)
 *   - POST  /undertaking/:id/acknowledge       SUBMITTED → ACKNOWLEDGED (cascade-approves GRN)
 *   - POST  /undertaking/:id/reject            SUBMITTED → REJECTED (terminal; GRN stays PENDING)
 *   - POST  /undertaking/:id/waybill           Phase G4.5h-W — re-upload waybill (recovery; patches GRN too)
 *   - POST  /undertaking/:id/president-reverse cascade-reverse GRN (inventory.reverse_undertaking grant)
 *
 * Errors bubble up — callers invoke showError / showApprovalPending from errorToast.js.
 */
import api from '../../services/api';

export async function listUndertakings(params = {}) {
  const { data } = await api.get('/erp/undertaking', { params });
  return data;
}

export async function getUndertakingById(id) {
  const { data } = await api.get(`/erp/undertaking/${id}`);
  return data;
}

export async function submitUndertaking(id) {
  const { data } = await api.post(`/erp/undertaking/${id}/submit`);
  return data;
}

export async function acknowledgeUndertaking(id) {
  const { data } = await api.post(`/erp/undertaking/${id}/acknowledge`);
  return data;
}

export async function rejectUndertaking(id, rejectionReason) {
  const { data } = await api.post(`/erp/undertaking/${id}/reject`, { rejection_reason: rejectionReason });
  return data;
}

export async function presidentReverseUndertaking(id, { reason, confirm }) {
  const { data } = await api.post(`/erp/undertaking/${id}/president-reverse`, { reason, confirm });
  return data;
}

/**
 * Phase G4.5h-W (Apr 29, 2026) — Re-upload the waybill on a DRAFT or SUBMITTED
 * Undertaking. Caller has already uploaded the file via processDocument(file, 'WAYBILL')
 * and has the resulting `s3_url`. This endpoint patches BOTH the UT mirror AND
 * the linked GRN (the GRN has no edit endpoint, so this is the only recovery
 * path for legacy GRN rows missing the courier waybill).
 */
export async function reuploadWaybill(id, waybillPhotoUrl) {
  const { data } = await api.post(`/erp/undertaking/${id}/waybill`, { waybill_photo_url: waybillPhotoUrl });
  return data;
}

/**
 * Fetch GRN_SETTINGS lookup (MIN_EXPIRY_DAYS, VARIANCE_TOLERANCE_PCT,
 * WAYBILL_REQUIRED, REQUIRE_BATCH, REQUIRE_EXPIRY). Returns `{ minExpiryDays,
 * varianceTolerancePct, waybillRequired, requireBatch, requireExpiry }`.
 * Falls back to pharmacy-safe defaults (all required) if the lookup is
 * missing — backend validator still enforces the real floor.
 *
 * Phase 32R: reads GRN_SETTINGS first; falls back to legacy UNDERTAKING_SETTINGS
 * so tenants who deployed Phase 32 without re-seeding keep working without
 * manual intervention. Cached per tab via a module-level promise.
 *
 * Phase 32R-S1: requireBatch / requireExpiry let non-pharmacy subscribers
 * relax capture requirements. Defaults are 1 (required) so pharmacy tenants
 * are unaffected; the frontend toggles the client-side guard and label text
 * when either is 0 for the active entity.
 */
let _settingsPromise = null;
export function getGrnSettings() {
  if (_settingsPromise) return _settingsPromise;
  _settingsPromise = (async () => {
    const readCategory = async (cat) => {
      try {
        const { data } = await api.get(`/erp/lookup-values/${cat}`);
        return Array.isArray(data?.data) ? data.data : [];
      } catch {
        return [];
      }
    };
    let rows = await readCategory('GRN_SETTINGS');
    if (!rows.length) rows = await readCategory('UNDERTAKING_SETTINGS');
    const byCode = {};
    for (const r of rows) {
      if (r?.code) byCode[r.code] = r;
    }
    const readNum = (code, fallback) => {
      const raw = byCode[code]?.metadata?.value ?? byCode[code]?.value ?? fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    return {
      minExpiryDays: readNum('MIN_EXPIRY_DAYS', 30),
      varianceTolerancePct: readNum('VARIANCE_TOLERANCE_PCT', 10),
      waybillRequired: !!readNum('WAYBILL_REQUIRED', 1),
      requireBatch: !!readNum('REQUIRE_BATCH', 1),
      requireExpiry: !!readNum('REQUIRE_EXPIRY', 1),
    };
  })();
  return _settingsPromise;
}

// Back-compat alias so transitional imports (older pages not yet rewritten)
// still resolve.
export { getGrnSettings as getUndertakingSettings };
