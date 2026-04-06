import useErpApi from './useErpApi';

export default function useBanking() {
  const api = useErpApi();

  // ═══ Bank Accounts ═══
  const listBankAccounts = (params) => api.get('/banking/bank-accounts', { params });
  const createBankAccount = (data) => api.post('/banking/bank-accounts', data);
  const updateBankAccount = (id, data) => api.put(`/banking/bank-accounts/${id}`, data);

  // ═══ Bank Statements & Reconciliation ═══
  const importStatement = (data) => api.post('/banking/statements/import', data);
  const listStatements = (params) => api.get('/banking/statements', { params });
  const getStatement = (id) => api.get(`/banking/statements/${id}`);
  const autoMatchStatement = (id) => api.post(`/banking/statements/${id}/auto-match`);
  const manualMatchEntry = (id, data) => api.post(`/banking/statements/${id}/manual-match`, data);
  const getReconSummary = (id) => api.get(`/banking/statements/${id}/recon`);
  const finalizeRecon = (id) => api.post(`/banking/statements/${id}/finalize`);

  // ═══ Credit Card Transactions & Payments ═══
  const getCardBalances = () => api.get('/banking/credit-cards/balances');
  const getCardLedger = (id, params) => api.get(`/banking/credit-cards/${id}/ledger`, { params });
  const createCCTransaction = (data) => api.post('/banking/credit-cards/transactions', data);
  const recordCardPayment = (id, data) => api.post(`/banking/credit-cards/${id}/payment`, data);

  return {
    ...api,
    listBankAccounts, createBankAccount, updateBankAccount,
    exportBankAccounts: () => api.get('/banking/bank-accounts/export', { responseType: 'blob' }),
    importBankAccounts: (fd) => api.post('/banking/bank-accounts/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
    importStatement, listStatements, getStatement, autoMatchStatement, manualMatchEntry, getReconSummary, finalizeRecon,
    getCardBalances, getCardLedger, createCCTransaction, recordCardPayment
  };
}
