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

  create: async (visitData) => {
    const response = await api.post('/visits', visitData);
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
};

export default visitService;
