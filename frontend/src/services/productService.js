/**
 * Product Service
 *
 * Product API calls:
 * - CRUD operations
 * - Category filtering
 * - Assignment operations
 * - Statistics
 */

import api from './api';

const productService = {
  getAll: async (params = {}) => {
    const response = await api.get('/products', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/products/${id}`);
    return response.data;
  },

  create: async (productData) => {
    const response = await api.post('/products', productData);
    return response.data;
  },

  update: async (id, productData) => {
    const response = await api.put(`/products/${id}`, productData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/products/${id}`);
    return response.data;
  },

  getByCategory: async (category) => {
    const response = await api.get(`/products/category/${category}`);
    return response.data;
  },

  assignToDoctor: async (productId, doctorId, data) => {
    const response = await api.post(`/products/${productId}/assign`, {
      doctorId,
      ...data,
    });
    return response.data;
  },

  getAssignments: async (productId) => {
    const response = await api.get(`/products/${productId}/assignments`);
    return response.data;
  },

  getStats: async (params = {}) => {
    const response = await api.get('/products/stats', { params });
    return response.data;
  },
};

export default productService;
