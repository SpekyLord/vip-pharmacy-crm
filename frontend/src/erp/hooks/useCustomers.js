import useErpApi from './useErpApi';

export default function useCustomers() {
  const api = useErpApi();

  const getAll = (params = {}) => api.get('/customers', { params });

  const getById = (id) => api.get(`/customers/${id}`);

  const create = (data) => api.post('/customers', data);

  const update = (id, data) => api.put(`/customers/${id}`, data);

  const deactivate = (id) => api.patch(`/customers/${id}/deactivate`);

  const tagBdm = (id, bdmId) => api.post(`/customers/${id}/tag-bdm`, { bdm_id: bdmId });

  const untagBdm = (id, bdmId) => api.post(`/customers/${id}/untag-bdm`, { bdm_id: bdmId });

  return {
    ...api,
    getAll, getById, create, update, deactivate, tagBdm, untagBdm
  };
}
