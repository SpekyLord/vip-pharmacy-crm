/**
 * Communication Log Service
 *
 * API calls for BDM-to-client interaction logging.
 * Supports both screenshot uploads (FormData) and API messaging.
 */

import api from './api';

const communicationLogService = {
  // Create log with screenshot uploads (FormData)
  create: async (formData) => {
    const response = await api.post('/communication-logs', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Send message via API (Phase 2)
  sendMessage: async (data) => {
    const response = await api.post('/communication-logs/send', data);
    return response.data;
  },

  // Get current user's logs
  getMy: async (params = {}) => {
    const response = await api.get('/communication-logs/my', { params });
    return response.data;
  },

  // Get logs for a specific VIP Client
  getByDoctor: async (doctorId, params = {}) => {
    const response = await api.get(`/communication-logs/doctor/${doctorId}`, { params });
    return response.data;
  },

  // Get logs for a specific Regular Client
  getByClient: async (clientId, params = {}) => {
    const response = await api.get(`/communication-logs/client/${clientId}`, { params });
    return response.data;
  },

  // Get all logs (admin)
  getAll: async (params = {}) => {
    const response = await api.get('/communication-logs', { params });
    return response.data;
  },

  // Get single log
  getById: async (id) => {
    const response = await api.get(`/communication-logs/${id}`);
    return response.data;
  },

  // Archive a log
  archive: async (id) => {
    const response = await api.patch(`/communication-logs/${id}/archive`);
    return response.data;
  },

  // Get all unmatched pending inbound messages (admin)
  getUnmatched: async () => {
    const response = await api.get('/communication-logs/unmatched');
    return response.data;
  },

  // Assign a pending log to a doctor (admin)
  assign: async (id, doctorId) => {
    const response = await api.post(`/communication-logs/${id}/assign`, { doctorId });
    return response.data;
  },

  // Decline the AI suggestion for a pending log (admin)
  decline: async (id) => {
    const response = await api.post(`/communication-logs/${id}/decline`);
    return response.data;
  },
};

export default communicationLogService;
