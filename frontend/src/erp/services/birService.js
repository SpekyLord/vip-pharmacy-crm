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
};
