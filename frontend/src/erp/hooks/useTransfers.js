import useErpApi from './useErpApi';

export default function useTransfers() {
  const api = useErpApi();

  // IC Transfers
  const getTransfers = (params = {}) => api.get('/transfers', { params });
  const getTransferById = (id) => api.get(`/transfers/${id}`);
  const createTransfer = (data) => api.post('/transfers', data);
  const approveTransfer = (id) => api.patch(`/transfers/${id}/approve`, {});
  const shipTransfer = (id) => api.patch(`/transfers/${id}/ship`, {});
  const receiveTransfer = (id) => api.patch(`/transfers/${id}/receive`, {});
  const postTransfer = (id) => api.patch(`/transfers/${id}/post`, {});
  const cancelTransfer = (id, reason) => api.patch(`/transfers/${id}/cancel`, { reason });

  // Transfer Prices
  const getTransferPrices = (params = {}) => api.get('/transfers/prices/list', { params });
  const getTransferPriceProducts = (params = {}) => api.get('/transfers/prices/products', { params });
  const setTransferPrice = (data) => api.put('/transfers/prices', data);
  const bulkSetTransferPrices = (data) => api.put('/transfers/prices/bulk', data);

  // Entities & BDMs
  const getEntities = () => api.get('/transfers/entities');
  const getBdmsByEntity = (entityId, includeUnassigned = false) =>
    api.get('/transfers/bdms', { params: { entity_id: entityId, include_unassigned: includeUnassigned } });

  // Copy products between entities
  const getSourceProducts = (params = {}) => api.get('/transfers/source-products', { params });
  const copyProductsToEntity = (data) => api.post('/transfers/copy-products', data);

  // Internal Stock Reassignment
  const getReassignments = (params = {}) => api.get('/transfers/reassign', { params });
  const createReassignment = (data) => api.post('/transfers/reassign', data);
  const approveReassignment = (id, action, rejection_reason) =>
    api.post(`/transfers/reassign/${id}/approve`, { action, rejection_reason });

  return {
    ...api,
    getTransfers, getTransferById, createTransfer,
    approveTransfer, shipTransfer, receiveTransfer, postTransfer, cancelTransfer,
    getTransferPrices, getTransferPriceProducts, setTransferPrice, bulkSetTransferPrices,
    getEntities, getBdmsByEntity,
    getSourceProducts, copyProductsToEntity,
    getReassignments, createReassignment, approveReassignment
  };
}
