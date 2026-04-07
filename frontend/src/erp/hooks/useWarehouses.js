/**
 * useWarehouses — Phase 17
 *
 * Hook for warehouse API calls and user's accessible warehouse list.
 */
import useErpApi from './useErpApi';

export default function useWarehouses() {
  const api = useErpApi();

  // Get user's accessible warehouses (for picker)
  const getMyWarehouses = (params) => api.get('/warehouse/my', { params });

  // All warehouses for entity (admin view)
  const getWarehouses = (params) => api.get('/warehouse', { params });

  // Warehouses for a specific entity (IC transfer target picker)
  const getWarehousesByEntity = (entityId) => api.get(`/warehouse/by-entity/${entityId}`);

  // Single warehouse with stock summary
  const getWarehouse = (id) => api.get(`/warehouse/${id}`);

  // CRUD
  const createWarehouse = (data) => api.post('/warehouse', data);
  const updateWarehouse = (id, data) => api.put(`/warehouse/${id}`, data);

  return {
    ...api,
    getMyWarehouses,
    getWarehouses,
    getWarehousesByEntity,
    getWarehouse,
    createWarehouse,
    updateWarehouse,
  };
}
