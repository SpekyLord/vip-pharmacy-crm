import api from '../../services/api';

export default function usePettyCash() {
  // Fund CRUD
  const getFunds = async () => { const { data } = await api.get('/erp/petty-cash/funds'); return data; };
  const getFundById = async (id) => { const { data } = await api.get(`/erp/petty-cash/funds/${id}`); return data; };
  const createFund = async (body) => { const { data } = await api.post('/erp/petty-cash/funds', body); return data; };
  const updateFund = async (id, body) => { const { data } = await api.put(`/erp/petty-cash/funds/${id}`, body); return data; };
  const deleteFund = async (id) => { const { data } = await api.delete(`/erp/petty-cash/funds/${id}`); return data; };

  // Transactions
  const getTransactions = async (params) => { const { data } = await api.get('/erp/petty-cash/transactions', { params }); return data; };
  const createTransaction = async (body) => { const { data } = await api.post('/erp/petty-cash/transactions', body); return data; };
  const postTransaction = async (id) => { const { data } = await api.post(`/erp/petty-cash/transactions/${id}/post`); return data; };

  // Ceiling
  const checkCeiling = async (fundId) => { const { data } = await api.get(`/erp/petty-cash/ceiling/${fundId}`); return data; };

  // Documents (remittance/replenishment)
  const generateRemittance = async (body) => { const { data } = await api.post('/erp/petty-cash/remittances/generate', body); return data; };
  const generateReplenishment = async (body) => { const { data } = await api.post('/erp/petty-cash/replenishments/generate', body); return data; };
  const getDocuments = async (params) => { const { data } = await api.get('/erp/petty-cash/documents', { params }); return data; };
  const signDocument = async (id, body) => { const { data } = await api.post(`/erp/petty-cash/documents/${id}/sign`, body); return data; };
  const processDocument = async (id) => { const { data } = await api.post(`/erp/petty-cash/documents/${id}/process`); return data; };

  return {
    getFunds, getFundById, createFund, updateFund, deleteFund,
    getTransactions, createTransaction, postTransaction,
    checkCeiling,
    generateRemittance, generateReplenishment, getDocuments, signDocument, processDocument
  };
}
