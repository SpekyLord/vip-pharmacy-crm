/**
 * Product Service
 *
 * CRM Product API calls:
 * - CRUD operations (admin)
 * - Category and specialization filtering
 * - Search
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

  create: async (formData) => {
    const response = await api.post('/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  update: async (id, formData) => {
    const response = await api.put(`/products/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
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

  getCategories: async () => {
    const response = await api.get('/products/categories');
    return response.data;
  },

  getBySpecialization: async (specialization) => {
    const response = await api.get(`/products/specialization/${encodeURIComponent(specialization)}`);
    return response.data;
  },

  getSpecializations: async () => {
    const response = await api.get('/products/specializations');
    return response.data;
  },

  search: async (q) => {
    const response = await api.get('/products/search', { params: { q } });
    return response.data;
  },
};

export default productService;
