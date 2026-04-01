import useErpApi from './useErpApi';

export default function useSales() {
  const api = useErpApi();

  const getSales = (params) => api.get('/sales', { params });
  const getSaleById = (id) => api.get(`/sales/${id}`);
  const createSale = (data) => api.post('/sales', data);
  const updateSale = (id, data) => api.put(`/sales/${id}`, data);
  const deleteDraft = (id) => api.del(`/sales/draft/${id}`);
  const validateSales = (saleIds) => api.post('/sales/validate', { sale_ids: saleIds });
  const submitSales = () => api.post('/sales/submit');
  const reopenSales = (saleIds) => api.post('/sales/reopen', { sale_ids: saleIds });
  const requestDeletion = (id) => api.post(`/sales/${id}/request-deletion`);
  const approveDeletion = (id, reason) => api.post(`/sales/${id}/approve-deletion`, { reason });

  return {
    ...api,
    getSales, getSaleById, createSale, updateSale, deleteDraft,
    validateSales, submitSales, reopenSales, requestDeletion, approveDeletion
  };
}
