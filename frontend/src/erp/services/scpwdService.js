/**
 * scpwdService — Phase VIP-1.H (Apr 2026)
 *
 * Wraps /api/erp/scpwd-sales-book endpoints. Used by the SCPWDSalesBook page.
 *
 * Export endpoints return CSV blobs — caller must handle download manually
 * (see SCPWDSalesBook.jsx for the trigger-download helper).
 *
 * Backend: backend/erp/routes/scpwdSalesBookRoutes.js
 * Backend ctrl: backend/erp/controllers/scpwdSalesBookController.js
 */
import api from '../../services/api';

const BASE = '/erp/scpwd-sales-book';

export async function listScpwdRows(params = {}) {
  const { data } = await api.get(BASE, { params });
  return data || { success: false, data: [], total: 0 };
}

export async function getScpwdSummary(params = {}) {
  const { data } = await api.get(`${BASE}/summary`, { params });
  return data?.data || null;
}

export async function getScpwdRow(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return data?.data || null;
}

export async function createScpwdRow(payload) {
  const { data } = await api.post(BASE, payload);
  return data;
}

export async function updateScpwdRow(id, payload) {
  const { data } = await api.put(`${BASE}/${id}`, payload);
  return data;
}

export async function postScpwdRow(id) {
  // Pass an explicit empty body so axios sets Content-Type: application/json,
  // which keeps express.json() body parsing active. Without it, req.body is
  // undefined and the upstream periodLockCheck middleware crashes on
  // req.body.period access.
  const { data } = await api.post(`${BASE}/${id}/post`, {});
  return data;
}

export async function voidScpwdRow(id, reason) {
  const { data } = await api.post(`${BASE}/${id}/void`, { reason });
  return data;
}

/**
 * Trigger a browser download of the monthly BIR Sales Book CSV.
 * Returns { ok, filename } so callers can show success/error toasts.
 */
export async function downloadMonthlyExport(year, month) {
  return _downloadCsv(`${BASE}/export/monthly`, { year, month }, `SCPWD_SalesBook_${year}-${String(month).padStart(2, '0')}.csv`);
}

export async function downloadVatReclaimExport(year, month) {
  return _downloadCsv(`${BASE}/export/vat-reclaim`, { year, month }, `SCPWD_InputVATCreditWorksheet_${year}-${String(month).padStart(2, '0')}_DRAFT.csv`);
}

async function _downloadCsv(url, params, fallbackFilename) {
  const response = await api.get(url, {
    params,
    responseType: 'blob',
    // Don't let global error interceptors swallow CSV blob errors silently
    validateStatus: (s) => s >= 200 && s < 300,
  });

  // Filename from Content-Disposition if present, else fallback
  const cd = response.headers?.['content-disposition'] || '';
  const match = /filename="([^"]+)"/.exec(cd);
  const filename = match ? match[1] : fallbackFilename;

  const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  return { ok: true, filename };
}

export default {
  listScpwdRows,
  getScpwdSummary,
  getScpwdRow,
  createScpwdRow,
  updateScpwdRow,
  postScpwdRow,
  voidScpwdRow,
  downloadMonthlyExport,
  downloadVatReclaimExport,
};
