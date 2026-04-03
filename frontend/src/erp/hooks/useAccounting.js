import useErpApi from './useErpApi';

export default function useAccounting() {
  const api = useErpApi();

  // ═══ Credit Cards ═══
  const listCreditCards = (params) => api.get('/credit-cards', { params });
  const getMyCards = () => api.get('/credit-cards/my-cards');
  const createCreditCard = (data) => api.post('/credit-cards', data);
  const updateCreditCard = (id, data) => api.put(`/credit-cards/${id}`, data);

  // ═══ Bank Accounts (via lookups) ═══
  const listBankAccounts = () => api.get('/lookups/bank-accounts');

  // ═══ COA ═══
  const listAccounts = (params) => api.get('/coa', { params });
  const createAccount = (data) => api.post('/coa', data);
  const updateAccount = (id, data) => api.put(`/coa/${id}`, data);

  // ═══ Journal Entries ═══
  const createJournal = (data) => api.post('/accounting/journals', data);
  const listJournals = (params) => api.get('/accounting/journals', { params });
  const getJournal = (id) => api.get(`/accounting/journals/${id}`);
  const postJournal = (id) => api.post(`/accounting/journals/${id}/post`);
  const reverseJournal = (id, data) => api.post(`/accounting/journals/${id}/reverse`, data);

  // ═══ General Ledger ═══
  const getGeneralLedger = (accountCode, params) => api.get(`/accounting/general-ledger/${accountCode}`, { params });

  // ═══ Trial Balance ═══
  const getTrialBalance = (period) => api.get(`/accounting/trial-balance/${period}`);

  // ═══ P&L ═══
  const getPnl = (period, params) => api.get(`/accounting/pnl/${period}`, { params });
  const getVatReturn = (quarter, year) => api.get(`/accounting/vat-return/${quarter}/${year}`);
  const getCwtSummary = (quarter, year) => api.get(`/accounting/cwt-summary/${quarter}/${year}`);

  // ═══ VAT Ledger ═══
  const getVatLedger = (period, params) => api.get(`/accounting/vat-ledger/${period}`, { params });
  const tagVatEntry = (id, data) => api.post(`/accounting/vat-ledger/${id}/tag`, data);

  // ═══ CWT Ledger ═══
  const getCwtLedger = (period) => api.get(`/accounting/cwt-ledger/${period}`);

  // ═══ Cashflow ═══
  const getCashflow = (period) => api.get(`/accounting/cashflow/${period}`);

  // ═══ Fixed Assets ═══
  const listFixedAssets = (params) => api.get('/accounting/fixed-assets', { params });
  const createFixedAsset = (data) => api.post('/accounting/fixed-assets', data);
  const computeDepreciation = (data) => api.post('/accounting/depreciation/compute', data);
  const getDepreciationStaging = (period) => api.get(`/accounting/depreciation/staging/${period}`);
  const approveDepreciation = (data) => api.post('/accounting/depreciation/approve', data);
  const postDepreciation = (data) => api.post('/accounting/depreciation/post', data);

  // ═══ Loans ═══
  const listLoans = (params) => api.get('/accounting/loans', { params });
  const createLoan = (data) => api.post('/accounting/loans', data);
  const computeInterest = (data) => api.post('/accounting/interest/compute', data);
  const getInterestStaging = (period) => api.get(`/accounting/interest/staging/${period}`);
  const approveInterest = (data) => api.post('/accounting/interest/approve', data);
  const postInterest = (data) => api.post('/accounting/interest/post', data);

  // ═══ Owner Equity ═══
  const getEquityLedger = () => api.get('/accounting/owner-equity');
  const recordInfusion = (data) => api.post('/accounting/owner-equity/infusion', data);
  const recordDrawing = (data) => api.post('/accounting/owner-equity/drawing', data);

  // ═══ Month-End Close ═══
  const runAutoClose = (data) => api.post('/month-end-close/auto-close', data);
  const runStaging = (data) => api.post('/month-end-close/staging', data);
  const postStagedItems = (data) => api.post('/month-end-close/post-staged', data);
  const finalizeClose = (data) => api.post('/month-end-close/finalize', data);
  const getCloseProgress = (period) => api.get(`/month-end-close/progress/${period}`);

  return {
    ...api,
    // Credit Cards
    listCreditCards, getMyCards, createCreditCard, updateCreditCard,
    // Bank Accounts
    listBankAccounts,
    // COA
    listAccounts, createAccount, updateAccount,
    // Journals
    createJournal, listJournals, getJournal, postJournal, reverseJournal,
    // GL
    getGeneralLedger,
    // TB
    getTrialBalance,
    // P&L
    getPnl, getVatReturn, getCwtSummary,
    // VAT
    getVatLedger, tagVatEntry,
    // CWT
    getCwtLedger,
    // Cashflow
    getCashflow,
    // Fixed Assets
    listFixedAssets, createFixedAsset, computeDepreciation,
    getDepreciationStaging, approveDepreciation, postDepreciation,
    // Loans
    listLoans, createLoan, computeInterest,
    getInterestStaging, approveInterest, postInterest,
    // Owner Equity
    getEquityLedger, recordInfusion, recordDrawing,
    // Month-End Close
    runAutoClose, runStaging, postStagedItems, finalizeClose, getCloseProgress,
  };
}
