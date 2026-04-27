/**
 * birService — Phase VIP-1.J (Apr 2026)
 *
 * Wraps /api/erp/bir endpoints. Used by BIRCompliancePage.
 *
 * Role gates are backend-driven (lookup BIR_ROLES). The frontend trusts
 * 403s and renders a friendly disabled-state for UI elements the user
 * cannot reach.
 *
 * Backend: backend/erp/routes/birRoutes.js
 * Backend ctrl: backend/erp/controllers/birController.js
 */
import api from '../../services/api';

const BASE = '/erp/bir';

export async function getDashboard(year) {
  const params = year ? { year } : {};
  const { data } = await api.get(`${BASE}/dashboard`, { params });
  return data?.data || null;
}

export async function getEntityConfig() {
  const { data } = await api.get(`${BASE}/entity-config`);
  return data?.data || null;
}

export async function updateEntityConfig(payload) {
  const { data } = await api.patch(`${BASE}/entity-config`, payload);
  return data?.data || null;
}

export async function runDataQuality() {
  const { data } = await api.post(`${BASE}/data-quality/run`, {});
  return data?.data || null;
}

export async function getLatestDataQuality() {
  const { data } = await api.get(`${BASE}/data-quality/latest`);
  return data?.data || null;
}

export async function getDataQualityFindings(kind) {
  const params = kind ? { kind } : {};
  const { data } = await api.get(`${BASE}/data-quality/findings`, { params });
  return data?.data || { findings: [], total: 0 };
}

export async function listFilings(year, formCode) {
  const params = {};
  if (year) params.year = year;
  if (formCode) params.form_code = formCode;
  const { data } = await api.get(`${BASE}/forms`, { params });
  return data?.data || [];
}

export async function markReviewed(id) {
  const { data } = await api.post(`${BASE}/forms/${id}/mark-reviewed`, {});
  return data?.data || null;
}

export async function markFiled(id, payload) {
  const { data } = await api.post(`${BASE}/forms/${id}/mark-filed`, payload || {});
  return data?.data || null;
}

export async function markConfirmed(id, payload) {
  const { data } = await api.post(`${BASE}/forms/${id}/mark-confirmed`, payload || {});
  return data?.data || null;
}

export async function createOrUpdateDraft(payload) {
  const { data } = await api.post(`${BASE}/forms/draft`, payload);
  return data?.data || null;
}

// ── Phase J1 — 2550M / 2550Q VAT return endpoints ─────────────────────
export async function compute2550M(year, month) {
  const { data } = await api.get(`${BASE}/forms/2550M/${year}/${month}/compute`);
  return data?.data || null;
}

export async function compute2550Q(year, quarter) {
  const { data } = await api.get(`${BASE}/forms/2550Q/${year}/${quarter}/compute`);
  return data?.data || null;
}

/**
 * Trigger a CSV download for 2550M or 2550Q. Uses the underlying axios
 * instance to inherit auth cookies + interceptors, then opens the CSV
 * via a synthetic anchor + URL.createObjectURL so the browser downloads
 * with the BIR-compliant filename emitted by the server.
 *
 * Returns { blob, filename, contentHash } so the page can show toast
 * confirmation that includes the content hash (audit visibility).
 */
export async function exportVatReturnCsv(formCode, year, period) {
  const response = await api.get(
    `${BASE}/forms/${formCode}/${year}/${period}/export.csv`,
    { responseType: 'blob' },
  );
  const blob = response.data;
  // Server emits the filename via Content-Disposition; fall back to a
  // sane default if the header isn't surfaced (some browsers strip it
  // when CORS preflight doesn't list it).
  const cd = response.headers?.['content-disposition'] || '';
  const match = cd.match(/filename="([^"]+)"/);
  const filename = match
    ? match[1]
    : (formCode === '2550M' ? `2550M_${year}-${String(period).padStart(2, '0')}.csv` : `2550Q_${year}-Q${period}.csv`);
  const contentHash = response.headers?.['x-content-hash'] || null;

  // Trigger client download.
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);

  return { blob, filename, contentHash };
}

export default {
  getDashboard,
  getEntityConfig,
  updateEntityConfig,
  runDataQuality,
  getLatestDataQuality,
  getDataQualityFindings,
  listFilings,
  markReviewed,
  markFiled,
  markConfirmed,
  createOrUpdateDraft,
  compute2550M,
  compute2550Q,
  exportVatReturnCsv,
};
