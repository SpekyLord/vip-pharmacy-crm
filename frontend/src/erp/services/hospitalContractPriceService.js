/**
 * hospitalContractPriceService — Phase CSI-X1 (Apr 2026)
 *
 * Wraps /erp/hospital-contract-prices endpoints. Resolution helpers used by
 * SalesEntry to display the resolved unit_price + source (CONTRACT vs SRP)
 * when the user picks a hospital + product.
 */
import api from '../../services/api';

const BASE = '/erp/hospital-contract-prices';

export async function listContractPrices(params = {}) {
  const { data } = await api.get(BASE, { params });
  return data || { success: false, data: [], pagination: {} };
}

export async function getContractPrice(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return data?.data || null;
}

export async function createContractPrice(payload) {
  const { data } = await api.post(BASE, payload);
  return data;
}

export async function updateContractPrice(id, payload) {
  const { data } = await api.put(`${BASE}/${id}`, payload);
  return data;
}

export async function cancelContractPrice(id, reason) {
  const { data } = await api.post(`${BASE}/${id}/cancel`, { reason });
  return data;
}

// Resolve single (hospital_id, product_id) — used by SalesEntry / HospitalPO entry
export async function resolvePrice({ hospital_id, product_id, as_of_date }) {
  const { data } = await api.get(`${BASE}/resolve`, {
    params: { hospital_id, product_id, as_of_date }
  });
  return data?.data || { price: null, source: 'NONE', contract_price_ref: null };
}

// Bulk resolve for multi-line PO entry
export async function resolvePricesBulk(items, as_of_date) {
  const { data } = await api.post(`${BASE}/resolve-bulk`, { items, as_of_date });
  return data?.data || [];
}
