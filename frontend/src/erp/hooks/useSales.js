import useErpApi from './useErpApi';

export default function useSales() {
  const api = useErpApi();

  const getSales = (params) => api.get('/sales', { params });
  const getSaleById = (id) => api.get(`/sales/${id}`);
  const createSale = (data) => api.post('/sales', data);
  const updateSale = (id, data) => api.put(`/sales/${id}`, data);
  const deleteDraft = (id) => api.del(`/sales/draft/${id}`);
  const validateSales = (saleIds) => api.post('/sales/validate', { sale_ids: saleIds });
  const submitSales = (saleIds) => api.post('/sales/submit', saleIds ? { sale_ids: saleIds } : {});
  const reopenSales = (saleIds) => api.post('/sales/reopen', { sale_ids: saleIds });
  const requestDeletion = (id) => api.post(`/sales/${id}/request-deletion`, {});
  const approveDeletion = (id, reason) => api.post(`/sales/${id}/approve-deletion`, { reason });
  const presidentReverseSale = (id, { reason, confirm }) =>
    api.post(`/sales/${id}/president-reverse`, { reason, confirm });
  const attachReceivedCsi = (id, { csi_received_photo_url, csi_received_attachment_id, capture_id }) =>
    api.put(`/sales/${id}/received-csi`, { csi_received_photo_url, csi_received_attachment_id, capture_id });

  // Phase 15.3 — CSI draft overlay PDF URL. Hand to window.open so the
  // browser downloads the PDF using the current auth cookie.
  const csiDraftUrl = (id) => `/api/erp/sales/${id}/csi-draft`;
  const getDraftsPendingCsi = () => api.get('/sales/drafts/pending-csi');
  const csiCalibrationUrl = (entityId) =>
    `/api/erp/sales/drafts/calibration-grid${entityId ? `?entity_id=${entityId}` : ''}`;

  return {
    ...api,
    getSales, getSaleById, createSale, updateSale, deleteDraft,
    validateSales, submitSales, reopenSales, requestDeletion, approveDeletion,
    presidentReverseSale, attachReceivedCsi,
    csiDraftUrl, getDraftsPendingCsi, csiCalibrationUrl,
  };
}
