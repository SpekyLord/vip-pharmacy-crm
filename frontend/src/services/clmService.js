/**
 * CLM Service
 *
 * API calls for Closed Loop Marketing (Partnership Presentation) sessions.
 */
import api from './api';

const clmService = {
  // ── Session lifecycle ─────────────────────────────────────────────
  startSession: async (doctorId, location) => {
    const response = await api.post('/clm/sessions', { doctorId, location });
    return response.data;
  },

  endSession: async (sessionId, data) => {
    const response = await api.put(`/clm/sessions/${sessionId}/end`, data);
    return response.data;
  },

  // ── Slide events ──────────────────────────────────────────────────
  recordSlideEvents: async (sessionId, slideEvents) => {
    const response = await api.put(`/clm/sessions/${sessionId}/slides`, { slideEvents });
    return response.data;
  },

  // ── QR tracking ───────────────────────────────────────────────────
  markQrDisplayed: async (sessionId) => {
    const response = await api.put(`/clm/sessions/${sessionId}/qr-shown`);
    return response.data;
  },

  markQrScanned: async (sessionId) => {
    const response = await api.put(`/clm/sessions/${sessionId}/qr-scan`);
    return response.data;
  },

  // ── Queries ───────────────────────────────────────────────────────
  getMySessions: async (params = {}) => {
    const response = await api.get('/clm/sessions/my', { params });
    return response.data;
  },

  getAllSessions: async (params = {}) => {
    const response = await api.get('/clm/sessions/all', { params });
    return response.data;
  },

  getSessionById: async (id) => {
    const response = await api.get(`/clm/sessions/${id}`);
    return response.data;
  },

  getAnalytics: async (params = {}) => {
    const response = await api.get('/clm/sessions/analytics', { params });
    return response.data;
  },
};

export default clmService;
