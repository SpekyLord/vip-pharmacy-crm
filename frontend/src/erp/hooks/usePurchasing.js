import useErpApi from './useErpApi';

export default function usePurchasing() {
  const api = useErpApi();

  // ═══ Vendors (existing endpoints) ═══
  const listVendors = (params) => api.get('/vendors', { params });
  const getVendor = (id) => api.get(`/vendors/${id}`);
  const searchVendors = (q) => api.get('/vendors/search', { params: { q } });
  const createVendor = (data) => api.post('/vendors', data);
  const updateVendor = (id, data) => api.put(`/vendors/${id}`, data);
  const deactivateVendor = (id) => api.patch(`/vendors/${id}/deactivate`);

  // ═══ Purchase Orders ═══
  const listPOs = (params) => api.get('/purchasing/orders', { params });
  const getPO = (id) => api.get(`/purchasing/orders/${id}`);
  const createPO = (data) => api.post('/purchasing/orders', data);
  const updatePO = (id, data) => api.put(`/purchasing/orders/${id}`, data);
  const approvePO = (id) => api.post(`/purchasing/orders/${id}/approve`);
  const cancelPO = (id) => api.post(`/purchasing/orders/${id}/cancel`);
  const receivePO = (id, data) => api.post(`/purchasing/orders/${id}/receive`, data);

  // ═══ Supplier Invoices ═══
  const listInvoices = (params) => api.get('/purchasing/invoices', { params });
  const getInvoice = (id) => api.get(`/purchasing/invoices/${id}`);
  const createInvoice = (data) => api.post('/purchasing/invoices', data);
  const updateInvoice = (id, data) => api.put(`/purchasing/invoices/${id}`, data);
  const validateInvoice = (id, data) => api.post(`/purchasing/invoices/${id}/validate`, data);
  const postInvoice = (id) => api.post(`/purchasing/invoices/${id}/post`);
  const payInvoice = (id, data) => api.post(`/purchasing/invoices/${id}/pay`, data);

  // ═══ AP Ledger & Reports ═══
  const getApLedger = (params) => api.get('/purchasing/ap/ledger', { params });
  const getApAging = (params) => api.get('/purchasing/ap/aging', { params });
  const getApConsolidated = (params) => api.get('/purchasing/ap/consolidated', { params });
  const getGrni = (params) => api.get('/purchasing/ap/grni', { params });
  const getPaymentHistory = (params) => api.get('/purchasing/ap/payments', { params });

  // ═══ Products (for PO line items) ═══
  const searchProducts = (q) => api.get('/products/search', { params: { q } });

  // ═══ Bank Accounts & Credit Cards (for payments) ═══
  const listBankAccounts = () => api.get('/lookups/bank-accounts');
  const listCreditCards = (params) => api.get('/credit-cards', { params });

  return {
    ...api,
    // Vendors
    listVendors, getVendor, searchVendors, createVendor, updateVendor, deactivateVendor,
    // PO
    listPOs, getPO, createPO, updatePO, approvePO, cancelPO, receivePO,
    // Invoices
    listInvoices, getInvoice, createInvoice, updateInvoice, validateInvoice, postInvoice, payInvoice,
    // AP
    getApLedger, getApAging, getApConsolidated, getGrni, getPaymentHistory,
    // Helpers
    searchProducts, listBankAccounts, listCreditCards
  };
}
