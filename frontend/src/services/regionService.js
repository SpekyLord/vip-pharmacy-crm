/**
 * Region Service
 *
 * Region API calls:
 * - Get all regions
 * - Get region hierarchy
 * - CRUD operations
 * - Get region statistics
 */

import api from './api';

const regionService = {
  getAll: async (params = {}) => {
    const response = await api.get('/regions', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/regions/${id}`);
    return response.data;
  },

  // Get regions formatted for dropdown
  getForDropdown: async () => {
    const response = await api.get('/regions');
    return response.data;
  },

  // Get region hierarchy (tree structure)
  getHierarchy: async () => {
    const response = await api.get('/regions/hierarchy');
    return response.data;
  },

  // Get regions by level
  getByLevel: async (level) => {
    const response = await api.get(`/regions/level/${level}`);
    return response.data;
  },

  // Get child regions of a parent
  getChildren: async (id) => {
    const response = await api.get(`/regions/${id}/children`);
    return response.data;
  },

  // Get region statistics (doctor count, employee count, etc.)
  getStats: async (id) => {
    const response = await api.get(`/regions/${id}/stats`);
    return response.data;
  },

  // Create new region
  create: async (regionData) => {
    const response = await api.post('/regions', regionData);
    return response.data;
  },

  // Update region
  update: async (id, regionData) => {
    const response = await api.put(`/regions/${id}`, regionData);
    return response.data;
  },

  // Delete (deactivate) region
  delete: async (id) => {
    const response = await api.delete(`/regions/${id}`);
    return response.data;
  },
};

export default regionService;
