import useErpApi from './useErpApi';

export default function useInventory() {
  const api = useErpApi();

  const getMyStock = (bdmId) => api.get('/inventory/my-stock', { params: bdmId ? { bdm_id: bdmId } : {} });
  const getBatches = (productId, bdmId) => api.get(`/inventory/batches/${productId}`, { params: bdmId ? { bdm_id: bdmId } : {} });
  const getLedger = (productId, params = {}) => api.get(`/inventory/ledger/${productId}`, { params });
  const getVariance = (bdmId) => api.get('/inventory/variance', { params: bdmId ? { bdm_id: bdmId } : {} });
  const recordPhysicalCount = (counts) => api.post('/inventory/physical-count', { counts });
  const getAlerts = (bdmId) => api.get('/inventory/alerts', { params: bdmId ? { bdm_id: bdmId } : {} });

  return {
    ...api,
    getMyStock, getBatches, getLedger, getVariance, recordPhysicalCount, getAlerts
  };
}
