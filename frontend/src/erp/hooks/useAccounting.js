import { useCallback } from 'react';
import useErpApi from './useErpApi';

export default function useAccounting() {
  const api = useErpApi();
  // Destructure stable references so useCallback deps are stable
  const { get, post, put, del } = api;

  // ═══ Credit Cards ═══
  const listCreditCards  = useCallback((params) => get('/credit-cards', { params }), [get]);
  const getMyCards       = useCallback(() => get('/credit-cards/my-cards'), [get]);
  const createCreditCard = useCallback((data) => post('/credit-cards', data), [post]);
  const updateCreditCard = useCallback((id, data) => put(`/credit-cards/${id}`, data), [put]);

  // ═══ Bank Accounts (via lookups) ═══
  const listBankAccounts  = useCallback(() => get('/lookups/bank-accounts'), [get]);
  const getMyBankAccounts = useCallback(() => get('/lookups/bank-accounts/my-accounts'), [get]);

  // ═══ COA ═══
  const listAccounts   = useCallback((params) => get('/coa', { params }), [get]);
  const createAccount  = useCallback((data) => post('/coa', data), [post]);
  const updateAccount  = useCallback((id, data) => put(`/coa/${id}`, data), [put]);
  const exportAccounts = useCallback(() => get('/coa/export', { responseType: 'blob' }), [get]);
  const importAccounts = useCallback((formData) => post('/coa/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }), [post]);

  // ═══ Journal Entries ═══
  const createJournal    = useCallback((data) => post('/accounting/journals', data), [post]);
  const listJournals     = useCallback((params) => get('/accounting/journals', { params }), [get]);
  const getJournal       = useCallback((id) => get(`/accounting/journals/${id}`), [get]);
  const postJournal      = useCallback((id) => post(`/accounting/journals/${id}/post`), [post]);
  const reverseJournal   = useCallback((id, data) => post(`/accounting/journals/${id}/reverse`, data), [post]);
  const batchPostJournals = useCallback((je_ids) => post('/accounting/journals/batch-post', { je_ids }), [post]);

  // ═══ Recurring Journal Templates ═══
  const listRecurringTemplates   = useCallback((params) => get('/recurring-journals', { params }), [get]);
  const getRecurringTemplate     = useCallback((id) => get(`/recurring-journals/${id}`), [get]);
  const createRecurringTemplate  = useCallback((data) => post('/recurring-journals', data), [post]);
  const updateRecurringTemplate  = useCallback((id, data) => put(`/recurring-journals/${id}`, data), [put]);
  const deleteRecurringTemplate  = useCallback((id) => del(`/recurring-journals/${id}`), [del]);
  const runRecurringTemplate     = useCallback((id) => post(`/recurring-journals/${id}/run`), [post]);
  const runAllDueTemplates       = useCallback(() => post('/recurring-journals/run-all-due'), [post]);

  // ═══ General Ledger ═══
  const getGeneralLedger = useCallback((accountCode, params) => get(`/accounting/general-ledger/${accountCode}`, { params }), [get]);

  // ═══ Trial Balance ═══
  const getTrialBalance = useCallback((period) => get(`/accounting/trial-balance/${period}`), [get]);

  // ═══ P&L ═══
  const getPnl        = useCallback((period, params) => get(`/accounting/pnl/${period}`, { params }), [get]);
  const getVatReturn  = useCallback((quarter, year) => get(`/accounting/vat-return/${quarter}/${year}`), [get]);
  const getCwtSummary = useCallback((quarter, year) => get(`/accounting/cwt-summary/${quarter}/${year}`), [get]);

  // ═══ VAT Ledger ═══
  const getVatLedger = useCallback((period, params) => get(`/accounting/vat-ledger/${period}`, { params }), [get]);
  const tagVatEntry  = useCallback((id, data) => post(`/accounting/vat-ledger/${id}/tag`, data), [post]);

  // ═══ CWT Ledger ═══
  const getCwtLedger = useCallback((period) => get(`/accounting/cwt-ledger/${period}`), [get]);

  // ═══ Cashflow ═══
  const getCashflow = useCallback((period) => get(`/accounting/cashflow/${period}`), [get]);

  // ═══ Fixed Assets ═══
  const listFixedAssets        = useCallback((params) => get('/accounting/fixed-assets', { params }), [get]);
  const createFixedAsset       = useCallback((data) => post('/accounting/fixed-assets', data), [post]);
  const computeDepreciation    = useCallback((data) => post('/accounting/depreciation/compute', data), [post]);
  const getDepreciationStaging = useCallback((period) => get(`/accounting/depreciation/staging/${period}`), [get]);
  const approveDepreciation    = useCallback((data) => post('/accounting/depreciation/approve', data), [post]);
  const postDepreciation       = useCallback((data) => post('/accounting/depreciation/post', data), [post]);

  // ═══ Loans ═══
  const listLoans         = useCallback((params) => get('/accounting/loans', { params }), [get]);
  const createLoan        = useCallback((data) => post('/accounting/loans', data), [post]);
  const computeInterest   = useCallback((data) => post('/accounting/interest/compute', data), [post]);
  const getInterestStaging = useCallback((period) => get(`/accounting/interest/staging/${period}`), [get]);
  const approveInterest   = useCallback((data) => post('/accounting/interest/approve', data), [post]);
  const postInterest      = useCallback((data) => post('/accounting/interest/post', data), [post]);

  // ═══ Owner Equity ═══
  const getEquityLedger = useCallback(() => get('/accounting/owner-equity'), [get]);
  const recordInfusion  = useCallback((data) => post('/accounting/owner-equity/infusion', data), [post]);
  const recordDrawing   = useCallback((data) => post('/accounting/owner-equity/drawing', data), [post]);

  // ═══ Month-End Close ═══
  const runAutoClose    = useCallback((data) => post('/month-end-close/auto-close', data), [post]);
  const runStaging      = useCallback((data) => post('/month-end-close/staging', data), [post]);
  const postStagedItems = useCallback((data) => post('/month-end-close/post-staged', data), [post]);
  const finalizeClose   = useCallback((data) => post('/month-end-close/finalize', data), [post]);
  const getCloseProgress = useCallback((period) => get(`/month-end-close/progress/${period}`), [get]);

  return {
    ...api,
    // Credit Cards
    listCreditCards, getMyCards, createCreditCard, updateCreditCard,
    // Bank Accounts
    listBankAccounts, getMyBankAccounts,
    // COA
    listAccounts, createAccount, updateAccount, exportAccounts, importAccounts,
    // Journals
    createJournal, listJournals, getJournal, postJournal, reverseJournal, batchPostJournals,
    // Recurring Templates
    listRecurringTemplates, getRecurringTemplate, createRecurringTemplate,
    updateRecurringTemplate, deleteRecurringTemplate, runRecurringTemplate, runAllDueTemplates,
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
    exportFixedAssets: useCallback(() => get('/accounting/fixed-assets/export', { responseType: 'blob' }), [get]),
    importFixedAssets: useCallback((fd) => post('/accounting/fixed-assets/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }), [post]),
    // Loans
    listLoans, createLoan, computeInterest,
    getInterestStaging, approveInterest, postInterest,
    exportLoans: useCallback(() => get('/accounting/loans/export', { responseType: 'blob' }), [get]),
    importLoans: useCallback((fd) => post('/accounting/loans/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } }), [post]),
    // Credit Cards
    exportCreditCards: useCallback(() => get('/credit-cards/export', { responseType: 'blob' }), [get]),
    // Owner Equity
    getEquityLedger, recordInfusion, recordDrawing,
    // Month-End Close
    runAutoClose, runStaging, postStagedItems, finalizeClose, getCloseProgress,
  };
}
