/**
 * Visit Service
 *
 * Visit API calls:
 * - CRUD operations
 * - Filtering by date/user/doctor
 * - Approval workflow
 * - Statistics
 */

import api from './api';
import { offlineStore } from '../utils/offlineStore';
import { offlineManager } from '../utils/offlineManager';

const visitService = {
  getAll: async (params = {}) => {
    const response = await api.get('/visits', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/visits/${id}`);
    return response.data;
  },

  // Create visit with FormData (for photo uploads).
  //
  // Phase N — Online vs offline branch:
  //   - Online (navigator.onLine === true): existing direct multipart POST.
  //     Server handles the upload + creates the Visit row + back-stamps the
  //     CLM session if session_group_id resolves to a CLMSession.idempotencyKey.
  //   - Offline (navigator.onLine === false): caller must instead provide
  //     `{ photoRefs, formFields }` via createOffline(), which issues a JSON
  //     envelope POST that the service worker intercepts + queues.
  //
  // Backwards-compatible: existing callers (NewVisitPage online path) still
  // pass FormData and hit the network path. The offline path is only used
  // when VisitLogger detects offline state — see Phase N.4 wiring.
  create: async (formData) => {
    const response = await api.post('/visits', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Phase N — Offline visit submission via the SW queue.
   *
   * Caller is responsible for:
   *   1. Capturing photos and persisting them to offlineStore.saveVisitPhoto()
   *      to obtain photo_<uuid> refs.
   *   2. Building formFields (everything that would have been a field on
   *      the FormData body — doctor, visitDate, productsDiscussed JSON,
   *      engagementTypes JSON, photoMetadata JSON, location JSON,
   *      session_group_id, etc).
   *   3. Calling this method, then on success deleting the local draft.
   *
   * Returns the SW's synthetic { offline: true, offlineQueued: true } response
   * so the UI can surface "saved offline; will sync" feedback.
   *
   * @param {{ photoRefs: string[], formFields: object }} envelope
   */
  createOffline: async (envelope) => {
    return offlineManager.queueVisit(envelope);
  },

  /**
   * Phase N — convenience: persist a draft (photos + formFields) without
   * submitting yet. Used by VisitLogger's auto-save path so a tab close
   * mid-encounter doesn't lose the BDM's work.
   *
   * @param {object} draft - { id, doctorId, photoRefs, formFields }
   */
  saveDraft: async (draft) => {
    await offlineStore.saveVisitDraft(draft);
  },

  loadDraft: async (id) => offlineStore.getVisitDraft(id),
  listDrafts: async () => offlineStore.getVisitDrafts(),
  deleteDraft: async (id) => offlineStore.deleteVisitDraft(id),

  update: async (id, visitData) => {
    const response = await api.put(`/visits/${id}`, visitData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/visits/${id}`);
    return response.data;
  },

  getByUser: async (userId, params = {}) => {
    const response = await api.get(`/visits/user/${userId}`, { params });
    return response.data;
  },

  getByDoctor: async (doctorId, params = {}) => {
    const response = await api.get(`/visits/doctor/${doctorId}`, { params });
    return response.data;
  },

  getWeekly: async () => {
    const response = await api.get('/visits/weekly');
    return response.data;
  },

  approve: async (visitId) => {
    const response = await api.put(`/visits/${visitId}/approve`);
    return response.data;
  },

  reject: async (visitId, reason) => {
    const response = await api.put(`/visits/${visitId}/reject`, { reason });
    return response.data;
  },

  getStats: async (params = {}) => {
    const response = await api.get('/visits/stats', { params });
    return response.data;
  },

  // Get today's visits for current user
  getToday: async () => {
    const response = await api.get('/visits/today');
    return response.data;
  },

  // Get today's visit stats for admin dashboard
  getAdminTodayStats: async () => {
    const response = await api.get('/visits/admin/today-stats');
    return response.data;
  },

  // Get current user's visits
  getMy: async (params = {}, options = {}) => {
    const response = await api.get('/visits/my', { params, ...options });
    return response.data;
  },

  // Check if user can visit a specific doctor (weekly/monthly limit check)
  canVisit: async (doctorId) => {
    const response = await api.get(`/visits/can-visit/${doctorId}`);
    return response.data;
  },

  // Batch check visit status for multiple doctors (eliminates N+1 problem)
  canVisitBatch: async (doctorIds, options = {}) => {
    const response = await api.post('/visits/can-visit-batch', { doctorIds }, options);
    return response.data;
  },

  // Get weekly compliance report for a user
  getWeeklyCompliance: async (monthYear) => {
    const response = await api.get('/visits/weekly', { params: { monthYear } });
    return response.data;
  },

  // Refresh photo URLs for a visit (when presigned URLs expire)
  refreshPhotos: async (visitId) => {
    const response = await api.get(`/visits/${visitId}/refresh-photos`);
    return response.data;
  },

  // Get employee visit report for Call Plan Template format (Admin only)
  getEmployeeReport: async (userId, monthYear) => {
    const response = await api.get(`/visits/employee-report/${userId}`, {
      params: { monthYear },
    });
    return response.data;
  },

  // Get GPS review data for verification
  getGPSReview: async (params = {}) => {
    const response = await api.get('/visits/gps-review', { params });
    return response.data;
  },

  // Get photo audit issues (visits with flagged photos) - Admin only
  getPhotoAuditIssues: async (params = {}) => {
    const response = await api.get('/visits/photo-audit', { params });
    return response.data;
  },

  // Find all visits containing a specific photo hash (duplicate investigation)
  findByPhotoHash: async (hash) => {
    const response = await api.get('/visits/photo-audit/find-by-hash', { params: { hash } });
    return response.data;
  },

  // Get product presentation statistics for a cycle (Admin only)
  getProductPresentationStats: async (params = {}) => {
    const response = await api.get('/visits/product-presentation-stats', { params });
    return response.data;
  },
};

export default visitService;
