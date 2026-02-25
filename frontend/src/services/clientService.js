/**
 * Client Service (Regular / Non-VIP Clients)
 *
 * API calls for regular client CRUD and extra call visits.
 */

import api from './api';

const clientService = {
  getAll: async (params = {}) => {
    const response = await api.get('/clients', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/clients/${id}`);
    return response.data;
  },

  create: async (clientData) => {
    const response = await api.post('/clients', clientData);
    return response.data;
  },

  update: async (id, clientData) => {
    const response = await api.put(`/clients/${id}`, clientData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/clients/${id}`);
    return response.data;
  },

  // Get today's extra call count
  getTodayVisitCount: async () => {
    const response = await api.get('/clients/visit-count/today');
    return response.data;
  },

  // Create an extra call visit (FormData with photos)
  createVisit: async (formData) => {
    const response = await api.post('/clients/visits', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Get current user's extra call visit history
  getMyVisits: async (params = {}, options = {}) => {
    const response = await api.get('/clients/visits/my', { params, ...options });
    return response.data;
  },
};

export default clientService;
