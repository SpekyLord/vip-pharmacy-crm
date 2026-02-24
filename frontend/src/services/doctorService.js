/**
 * Doctor Service
 *
 * Doctor API calls:
 * - CRUD operations
 * - Search and filter
 * - Assignment operations
 */

import api from './api';

const doctorService = {
  getAll: async (params = {}) => {
    const response = await api.get('/doctors', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/doctors/${id}`);
    return response.data;
  },

  create: async (doctorData) => {
    const response = await api.post('/doctors', doctorData);
    return response.data;
  },

  update: async (id, doctorData) => {
    const response = await api.put(`/doctors/${id}`, doctorData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/doctors/${id}`);
    return response.data;
  },

  getByRegion: async (regionId) => {
    const response = await api.get(`/doctors/region/${regionId}`);
    return response.data;
  },

  getVisitHistory: async (doctorId) => {
    const response = await api.get(`/doctors/${doctorId}/visits`);
    return response.data;
  },

  assignToRep: async (doctorId, repId) => {
    const response = await api.post(`/doctors/${doctorId}/assign`, { repId });
    return response.data;
  },

  // Get assigned products for a doctor
  getAssignedProducts: async (doctorId) => {
    const response = await api.get(`/doctors/${doctorId}/products`);
    return response.data;
  },

  // Update target products (3 slots) for a VIP Client
  updateTargetProducts: async (doctorId, targetProducts) => {
    const response = await api.put(`/doctors/${doctorId}/target-products`, {
      targetProducts,
    });
    return response.data;
  },
};

export default doctorService;
