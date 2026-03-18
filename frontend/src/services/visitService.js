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

const visitService = {
  getAll: async (params = {}) => {
    const response = await api.get('/visits', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/visits/${id}`);
    return response.data;
  },

  // Create visit with FormData (for photo uploads)
  create: async (formData) => {
    const response = await api.post('/visits', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

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
  canVisitBatch: async (doctorIds) => {
    const response = await api.post('/visits/can-visit-batch', { doctorIds });
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

  // Get compliance alerts (behind-schedule BDMs)
  getComplianceAlerts: async (params = {}) => {
    const response = await api.get('/visits/compliance', { params });
    return response.data;
  },

  // Get quota dumping alerts
  getQuotaDumpingAlerts: async (params = {}) => {
    const response = await api.get('/visits/quota-dumping', { params });
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
};

export default visitService;
