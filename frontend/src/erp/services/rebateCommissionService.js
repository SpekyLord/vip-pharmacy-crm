/**
 * rebateCommissionService — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * Wraps the 6 admin matrix + payout-ledger endpoints introduced in Phase 4:
 *   - /erp/md-product-rebates           (Tier-A per-MD per-product %)
 *   - /erp/non-md-partner-rebate-rules  (Non-MD partner rebate matrix)
 *   - /erp/md-capitation-rules          (Tier-B per-patient capitation)
 *   - /erp/staff-commission-rules       (BDM/ECOMM_REP/AREA_BDM commission)
 *   - /erp/rebate-payouts               (read-only payout ledger + transitions)
 *   - /erp/commission-payouts           (read-only commission ledger)
 *
 * Each section exports list/create/update/delete/etc. matching the route file.
 * 3-gate validation errors from the Tier-A schema bubble up as 400 with the
 * server's verbatim message — caller toasts directly.
 */
import api from '../../services/api';

// ───────── MdProductRebate (Tier-A) ─────────────────────────────────────
const MDR_BASE = '/erp/md-product-rebates';

export async function listMdProductRebates(params = {}) {
  const { data } = await api.get(MDR_BASE, { params });
  return data || { success: false, data: [] };
}
export async function getMdProductRebate(id) {
  const { data } = await api.get(`${MDR_BASE}/${id}`);
  return data?.data || null;
}
export async function createMdProductRebate(payload) {
  const { data } = await api.post(MDR_BASE, payload);
  return data;
}
export async function updateMdProductRebate(id, payload) {
  const { data } = await api.put(`${MDR_BASE}/${id}`, payload);
  return data;
}
export async function deactivateMdProductRebate(id) {
  const { data } = await api.delete(`${MDR_BASE}/${id}`);
  return data;
}

// ───────── NonMdPartnerRebateRule ───────────────────────────────────────
const NMD_BASE = '/erp/non-md-partner-rebate-rules';

export async function listNonMdRules(params = {}) {
  const { data } = await api.get(NMD_BASE, { params });
  return data || { success: false, data: [] };
}
export async function getNonMdRule(id) {
  const { data } = await api.get(`${NMD_BASE}/${id}`);
  return data?.data || null;
}
export async function createNonMdRule(payload) {
  const { data } = await api.post(NMD_BASE, payload);
  return data;
}
export async function updateNonMdRule(id, payload) {
  const { data } = await api.put(`${NMD_BASE}/${id}`, payload);
  return data;
}
export async function deactivateNonMdRule(id) {
  const { data } = await api.delete(`${NMD_BASE}/${id}`);
  return data;
}

// ───────── MdCapitationRule (Tier-B) ────────────────────────────────────
const CAP_BASE = '/erp/md-capitation-rules';

export async function listCapitationRules(params = {}) {
  const { data } = await api.get(CAP_BASE, { params });
  return data || { success: false, data: [] };
}
export async function getCapitationRule(id) {
  const { data } = await api.get(`${CAP_BASE}/${id}`);
  return data?.data || null;
}
export async function getExcludedProducts(id) {
  const { data } = await api.get(`${CAP_BASE}/${id}/excluded-products`);
  return data?.data || { excluded_product_ids: [], products: [] };
}
export async function createCapitationRule(payload) {
  const { data } = await api.post(CAP_BASE, payload);
  return data;
}
export async function updateCapitationRule(id, payload) {
  const { data } = await api.put(`${CAP_BASE}/${id}`, payload);
  return data;
}
export async function deactivateCapitationRule(id) {
  const { data } = await api.delete(`${CAP_BASE}/${id}`);
  return data;
}

// ───────── StaffCommissionRule ──────────────────────────────────────────
const COMM_BASE = '/erp/staff-commission-rules';

export async function listCommissionRules(params = {}) {
  const { data } = await api.get(COMM_BASE, { params });
  return data || { success: false, data: [] };
}
export async function getCommissionRule(id) {
  const { data } = await api.get(`${COMM_BASE}/${id}`);
  return data?.data || null;
}
export async function createCommissionRule(payload) {
  const { data } = await api.post(COMM_BASE, payload);
  return data;
}
export async function updateCommissionRule(id, payload) {
  const { data } = await api.put(`${COMM_BASE}/${id}`, payload);
  return data;
}
export async function deactivateCommissionRule(id) {
  const { data } = await api.delete(`${COMM_BASE}/${id}`);
  return data;
}

// ───────── RebatePayout (ledger + transitions) ──────────────────────────
const RP_BASE = '/erp/rebate-payouts';

export async function listRebatePayouts(params = {}) {
  const { data } = await api.get(RP_BASE, { params });
  return data || { success: false, data: [] };
}
export async function getRebatePayoutSummary(params = {}) {
  const { data } = await api.get(`${RP_BASE}/summary`, { params });
  return data?.data || [];
}
export async function markRebatePayoutReadyToPay(id, payload = {}) {
  const { data } = await api.post(`${RP_BASE}/${id}/ready-to-pay`, payload);
  return data;
}
export async function markRebatePayoutPaid(id, payload = {}) {
  const { data } = await api.post(`${RP_BASE}/${id}/paid`, payload);
  return data;
}
export async function voidRebatePayout(id, reason) {
  const { data } = await api.post(`${RP_BASE}/${id}/void`, { reason });
  return data;
}

// ───────── CommissionPayout (read-only) ─────────────────────────────────
const CP_BASE = '/erp/commission-payouts';

export async function listCommissionPayouts(params = {}) {
  const { data } = await api.get(CP_BASE, { params });
  return data || { success: false, data: [] };
}
export async function getCommissionPayoutSummary(params = {}) {
  const { data } = await api.get(`${CP_BASE}/summary`, { params });
  return data?.data || [];
}

export default {
  // matrices
  listMdProductRebates, getMdProductRebate, createMdProductRebate, updateMdProductRebate, deactivateMdProductRebate,
  listNonMdRules, getNonMdRule, createNonMdRule, updateNonMdRule, deactivateNonMdRule,
  listCapitationRules, getCapitationRule, getExcludedProducts, createCapitationRule, updateCapitationRule, deactivateCapitationRule,
  listCommissionRules, getCommissionRule, createCommissionRule, updateCommissionRule, deactivateCommissionRule,
  // ledgers
  listRebatePayouts, getRebatePayoutSummary, markRebatePayoutReadyToPay, markRebatePayoutPaid, voidRebatePayout,
  listCommissionPayouts, getCommissionPayoutSummary,
};
