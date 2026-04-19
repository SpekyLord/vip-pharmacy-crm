/**
 * aiCoworkService — Phase G6.10 frontend bridge
 *
 * Wraps the four /erp/ai-cowork endpoints. Used by useAiCoworkFeature hook
 * (per-feature gating) and the AgentSettings AI Cowork tab (admin management).
 */
import api from '../../services/api';

export async function listAiCoworkFeatures() {
  const { data } = await api.get('/erp/ai-cowork/features');
  return data?.data || [];
}

export async function invokeAiCoworkFeature(code, context = {}) {
  const { data } = await api.post(`/erp/ai-cowork/${encodeURIComponent(code)}/invoke`, { context });
  return data;
}

export async function getAiCoworkUsage(days = 30) {
  const { data } = await api.get(`/erp/ai-cowork/usage?days=${days}`);
  return data?.data || [];
}
