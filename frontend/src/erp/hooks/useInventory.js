import useErpApi from './useErpApi';

export default function useInventory() {
  const api = useErpApi();

  // Phase 17: all functions accept optional warehouse_id param
  const getMyStock = (bdmId, entityId, warehouseId) => api.get('/inventory/my-stock', {
    params: {
      ...(bdmId && { bdm_id: bdmId }),
      ...(entityId && { entity_id: entityId }),
      ...(warehouseId && { warehouse_id: warehouseId }),
    }
  });

  const getBatches = (productId, bdmId, entityId, warehouseId) => api.get(`/inventory/batches/${productId}`, {
    params: {
      ...(bdmId && { bdm_id: bdmId }),
      ...(entityId && { entity_id: entityId }),
      ...(warehouseId && { warehouse_id: warehouseId }),
    }
  });

  const getLedger = (productId, params = {}) => api.get(`/inventory/ledger/${productId}`, { params });

  const getVariance = (bdmId, warehouseId) => api.get('/inventory/variance', {
    params: {
      ...(bdmId && { bdm_id: bdmId }),
      ...(warehouseId && { warehouse_id: warehouseId }),
    }
  });

  const recordPhysicalCount = (counts, warehouseId) => api.post('/inventory/physical-count', {
    counts,
    ...(warehouseId && { warehouse_id: warehouseId }),
  });

  // Fix wrong batch_lot_no / expiry_date on stocks on hand. Narrow endpoint —
  // quantities + costs are immutable here; use physical count for qty fixes.
  const correctBatchMetadata = (payload) => api.patch('/inventory/batches/correct-metadata', payload);

  const getAlerts = (bdmId, warehouseId) => api.get('/inventory/alerts', {
    params: {
      ...(bdmId && { bdm_id: bdmId }),
      ...(warehouseId && { warehouse_id: warehouseId }),
    }
  });

  return {
    ...api,
    getMyStock, getBatches, getLedger, getVariance, recordPhysicalCount, correctBatchMetadata, getAlerts
  };
}
