import { useMemo } from 'react';
import api from '../../services/api';

export default function useOfficeSupplies() {
  return useMemo(() => {
    const getSupplies = async (params) => { const { data } = await api.get('/erp/office-supplies', { params }); return data; };
    const getSupplyById = async (id) => { const { data } = await api.get(`/erp/office-supplies/${id}`); return data; };
    const createSupply = async (body) => { const { data } = await api.post('/erp/office-supplies', body); return data; };
    const updateSupply = async (id, body) => { const { data } = await api.put(`/erp/office-supplies/${id}`, body); return data; };
    const recordTransaction = async (id, body) => { const { data } = await api.post(`/erp/office-supplies/${id}/transactions`, body); return data; };
    const getTransactions = async (idOrParams, params) => {
      // If called with an ID string, fetch per-supply; otherwise fetch global
      if (typeof idOrParams === 'string' && idOrParams) {
        const { data } = await api.get(`/erp/office-supplies/${idOrParams}/transactions`, { params });
        return data;
      }
      const { data } = await api.get('/erp/office-supplies/transactions', { params: idOrParams });
      return data;
    };
    const getReorderAlerts = async () => { const { data } = await api.get('/erp/office-supplies/reorder-alerts'); return data; };

    const exportSupplies = async () => { const { data } = await api.get('/erp/office-supplies/export', { responseType: 'blob' }); return data; };
    const importSupplies = async (fd) => { const { data } = await api.post('/erp/office-supplies/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); return data; };

    // Phase 31R-OS — president reversal. Sends the `{ reason, confirm }` payload
    // required by buildPresidentReverseHandler (shared factory). Backend cascades
    // to transactions (for items) or restores qty_on_hand (for txns).
    const presidentReverseItem = async (id, body) => {
      const { data } = await api.delete(`/erp/office-supplies/${id}/president-reverse`, { data: body });
      return data;
    };
    const presidentReverseTxn = async (id, body) => {
      const { data } = await api.delete(`/erp/office-supplies/transactions/${id}/president-reverse`, { data: body });
      return data;
    };

    return { getSupplies, getSupplyById, createSupply, updateSupply, recordTransaction, getTransactions, getReorderAlerts, exportSupplies, importSupplies, presidentReverseItem, presidentReverseTxn };
  }, []);
}
