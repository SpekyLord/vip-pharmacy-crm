/**
 * hospitalPoService — Phase CSI-X1 (Apr 2026)
 *
 * Wraps /erp/hospital-pos endpoints. Hospital purchase order capture +
 * unserved-backlog tracking per warehouse/hospital. PO is the spine that
 * connects sales (CSIs), inventory replenishment priorities, and BDM
 * accountability for unserved orders.
 */
import api from '../../services/api';

const BASE = '/erp/hospital-pos';

export async function listHospitalPos(params = {}) {
  const { data } = await api.get(BASE, { params });
  return data || { success: false, data: [], pagination: {} };
}

export async function getHospitalPo(id) {
  const { data } = await api.get(`${BASE}/${id}`);
  return data?.data || null;
}

export async function createHospitalPo(payload) {
  const { data } = await api.post(BASE, payload);
  return data;
}

export async function cancelHospitalPo(id, reason) {
  const { data } = await api.post(`${BASE}/${id}/cancel`, { reason });
  return data;
}

export async function cancelHospitalPoLine(lineId, reason) {
  const { data } = await api.post(`${BASE}/lines/${lineId}/cancel`, { reason });
  return data;
}

export async function getBacklogSummary() {
  const { data } = await api.get(`${BASE}/summary/backlog`);
  return data?.data || null;
}

export async function expireStalePos() {
  const { data } = await api.post(`${BASE}/maintenance/expire-stale`);
  return data;
}
