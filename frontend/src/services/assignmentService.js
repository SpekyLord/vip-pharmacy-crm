/**
 * Assignment Service
 *
 * Product Assignment API calls:
 * - CRUD operations for product-doctor assignments
 * - Bulk assignment operations
 * - MedRep-specific queries
 */

import api from './api';

const assignmentService = {
  /**
   * Get all assignments with optional filters
   * @param {Object} params - Query parameters (status, product, doctor, page, limit)
   */
  getAll: async (params = {}) => {
    const response = await api.get('/assignments', { params });
    return response.data;
  },

  /**
   * Get assignments created by the current MedRep
   * @param {Object} params - Query parameters (page, limit)
   */
  getMyAssignments: async (params = {}) => {
    const response = await api.get('/assignments/my', { params });
    return response.data;
  },

  /**
   * Get single assignment by ID
   * @param {string} id - Assignment ID
   */
  getById: async (id) => {
    const response = await api.get(`/assignments/${id}`);
    return response.data;
  },

  /**
   * Get products assigned to a specific doctor
   * @param {string} doctorId - Doctor ID
   */
  getByDoctor: async (doctorId) => {
    const response = await api.get(`/assignments/doctor/${doctorId}`);
    return response.data;
  },

  /**
   * Get doctors assigned a specific product
   * @param {string} productId - Product ID
   */
  getByProduct: async (productId) => {
    const response = await api.get(`/assignments/product/${productId}`);
    return response.data;
  },

  /**
   * Create a new assignment
   * @param {Object} data - Assignment data { product, doctor, priority?, notes? }
   */
  create: async (data) => {
    const response = await api.post('/assignments', data);
    return response.data;
  },

  /**
   * Bulk assign multiple products to a doctor
   * @param {Object} data - { doctorId, productIds, priority? }
   */
  bulkCreate: async (data) => {
    const response = await api.post('/assignments/bulk', data);
    return response.data;
  },

  /**
   * Update an existing assignment
   * @param {string} id - Assignment ID
   * @param {Object} data - Updated data { priority?, notes? }
   */
  update: async (id, data) => {
    const response = await api.put(`/assignments/${id}`, data);
    return response.data;
  },

  /**
   * Deactivate an assignment
   * @param {string} id - Assignment ID
   * @param {string} reason - Optional deactivation reason
   */
  delete: async (id, reason = '') => {
    const response = await api.delete(`/assignments/${id}`, {
      data: { reason },
    });
    return response.data;
  },

  /**
   * Get assignment statistics for dashboard
   */
  getStats: async () => {
    const response = await api.get('/assignments/my');
    const data = response.data;

    // Calculate stats from assignments
    const assignments = data.data || [];
    const active = assignments.filter((a) => a.status === 'active').length;
    const inactive = assignments.filter((a) => a.status === 'inactive').length;

    return {
      total: data.pagination?.total || assignments.length,
      active,
      inactive,
    };
  },
};

export default assignmentService;
