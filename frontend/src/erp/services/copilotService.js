/**
 * copilotService — Phase G7.3 frontend bridge
 *
 * Wraps the four /api/erp/copilot endpoints. Used by useCopilot hook + the
 * CommandPalette + AgentSettings Copilot Tools tab.
 */
import api from '../../services/api';

export async function getCopilotStatus() {
  const { data } = await api.get('/erp/copilot/status');
  return data?.data || null;
}

export async function postCopilotChat(messages, mode = 'normal') {
  const { data } = await api.post('/erp/copilot/chat', { messages, mode });
  return data?.data || null;
}

export async function postCopilotExecute(confirmation_payload) {
  const { data } = await api.post('/erp/copilot/execute', { confirmation_payload });
  return data?.data || null;
}

export async function getCopilotUsage(days = 30) {
  const { data } = await api.get(`/erp/copilot/usage?days=${days}`);
  return data?.data || [];
}
