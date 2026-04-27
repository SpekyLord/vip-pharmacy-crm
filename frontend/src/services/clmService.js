/**
 * CLM Service
 *
 * API calls for Closed Loop Marketing (Partnership Presentation) sessions.
 * Supports scalable product selection from CRM.
 */
import api from './api';

const clmService = {
  // ── Session lifecycle ─────────────────────────────────────────────
  // Phase N — `mode` accepts 'in_person' (default) or 'remote'. Remote-mode
  // sessions skip GPS, are publicly viewable via /clm/deck/:id, and back-link
  // to a CommunicationLog row when generated from the BDM CommLog page.
  startSession: async (doctorId, location, productIds = [], idempotencyKey = null, mode = 'in_person') => {
    const config = {};
    if (idempotencyKey) {
      config.headers = { 'X-Idempotency-Key': idempotencyKey };
    }
    const response = await api.post('/clm/sessions', { doctorId, location, productIds, mode }, config);
    return response.data;
  },

  // Phase N — Public deck fetch (anonymous, no JWT). Used by DeckViewerPage.jsx.
  // Returns 404 on bad ID or non-remote-mode sessions; rate-limited 10 req/min/IP.
  fetchPublicDeck: async (sessionId) => {
    const response = await api.get(`/clm/deck/${sessionId}`, {
      // Don't carry credentials — the public route is intentionally
      // anonymous; sending a stale cookie would just be ignored, but the
      // explicit `false` makes the contract clear.
      withCredentials: false,
    });
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

  // ── Product management ────────────────────────────────────────────
  addProducts: async (sessionId, productIds) => {
    const response = await api.put(`/clm/sessions/${sessionId}/products`, { productIds });
    return response.data;
  },

  updateProductInterest: async (sessionId, productId, data) => {
    const response = await api.put(`/clm/sessions/${sessionId}/product-interest`, {
      productId,
      ...data,
    });
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
