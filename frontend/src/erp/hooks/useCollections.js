import useErpApi from './useErpApi';

export default function useCollections() {
  const api = useErpApi();

  const getCollections = (params) => api.get('/collections', { params });
  const getCollectionById = (id) => api.get(`/collections/${id}`);
  // Phase G4.5b — accepts optional bdmId (proxy entry). When the caller is a
  // proxy (admin/finance/back-office contractor with collections.proxy_entry
  // ticked) and has selected a target BDM in OwnerPicker, pass that BDM's id
  // here so backend getOpenCsis returns the target's POSTED CSIs instead of
  // the proxy's own (empty) list. Backend Rule #21: absence of ?bdm_id= for
  // a privileged caller = "no filter, see everything in entity".
  const getOpenCsis = (id, entityId, { isCustomer, bdmId } = {}) => api.get('/collections/open-csis', {
    params: {
      ...(isCustomer ? { customer_id: id } : { hospital_id: id }),
      ...(entityId && { entity_id: entityId }),
      ...(bdmId && { bdm_id: bdmId }),
    }
  });
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
  const presidentReverseCollection = (id, { reason, confirm }) =>
    api.post(`/collections/${id}/president-reverse`, { reason, confirm });

  return {
    ...api,
    getCollections, getCollectionById, getOpenCsis,
    createCollection, updateCollection, deleteDraft,
    validateCollections, submitCollections, reopenCollections,
    getArAging, getCollectionRate, generateSoa,
    requestDeletion, approveDeletion, presidentReverseCollection
  };
}
