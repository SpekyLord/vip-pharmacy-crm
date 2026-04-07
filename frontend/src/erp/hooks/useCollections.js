import useErpApi from './useErpApi';

export default function useCollections() {
  const api = useErpApi();

  const getCollections = (params) => api.get('/collections', { params });
  const getCollectionById = (id) => api.get(`/collections/${id}`);
  const getOpenCsis = (id, entityId, { isCustomer } = {}) => api.get('/collections/open-csis', { params: { ...(isCustomer ? { customer_id: id } : { hospital_id: id }), ...(entityId && { entity_id: entityId }) } });
  const createCollection = (data) => api.post('/collections', data);
  const updateCollection = (id, data) => api.put(`/collections/${id}`, data);
  const deleteDraft = (id) => api.del(`/collections/draft/${id}`);
  const validateCollections = (ids) => api.post('/collections/validate', { collection_ids: ids });
  const submitCollections = (collectionIds) => api.post('/collections/submit', collectionIds ? { collection_ids: collectionIds } : {});
  const reopenCollections = (ids) => api.post('/collections/reopen', { collection_ids: ids });
  const getArAging = (params) => api.get('/collections/ar-aging', { params });
  const getCollectionRate = (params) => api.get('/collections/collection-rate', { params });
  const generateSoa = (hospitalId, entityId, bdmId) => api.post('/collections/soa', { hospital_id: hospitalId, entity_id: entityId, bdm_id: bdmId }, { responseType: 'blob' });
  const requestDeletion = (id) => api.post(`/collections/${id}/request-deletion`, {});
  const approveDeletion = (id, reason) => api.post(`/collections/${id}/approve-deletion`, { reason });

  return {
    ...api,
    getCollections, getCollectionById, getOpenCsis,
    createCollection, updateCollection, deleteDraft,
    validateCollections, submitCollections, reopenCollections,
    getArAging, getCollectionRate, generateSoa,
    requestDeletion, approveDeletion
  };
}
