import useErpApi from './useErpApi';

export default function useGrn() {
  const api = useErpApi();

  const getGrnList = (params = {}) => api.get('/inventory/grn', { params });
  const createGrn = (data) => api.post('/inventory/grn', data);
  const approveGrn = (id, action, rejectionReason) =>
    api.post(`/inventory/grn/${id}/approve`, { action, rejection_reason: rejectionReason });

  return { ...api, getGrnList, createGrn, approveGrn };
}
