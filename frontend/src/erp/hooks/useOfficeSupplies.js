import api from '../../services/api';

export default function useOfficeSupplies() {
  const getSupplies = async (params) => { const { data } = await api.get('/erp/office-supplies', { params }); return data; };
  const getSupplyById = async (id) => { const { data } = await api.get(`/erp/office-supplies/${id}`); return data; };
  const createSupply = async (body) => { const { data } = await api.post('/erp/office-supplies', body); return data; };
  const updateSupply = async (id, body) => { const { data } = await api.put(`/erp/office-supplies/${id}`, body); return data; };
  const recordTransaction = async (body) => { const { data } = await api.post('/erp/office-supplies/transactions', body); return data; };
  const getTransactions = async (params) => { const { data } = await api.get('/erp/office-supplies/transactions', { params }); return data; };
  const getReorderAlerts = async () => { const { data } = await api.get('/erp/office-supplies/reorder-alerts'); return data; };

  return { getSupplies, getSupplyById, createSupply, updateSupply, recordTransaction, getTransactions, getReorderAlerts };
}
