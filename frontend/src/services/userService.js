/**
 * User Service
 *
 * User API calls:
 * - CRUD operations for users/employees
 * - Profile management
 */

import api from './api';

const userService = {
  // Get all users with optional filters (admin only)
  getAll: async (params = {}) => {
    const response = await api.get('/users', { params });
    return response.data;
  },

  // Get currently active BDMs (admin only)
  getActiveUsers: async () => {
    const response = await api.get('/users/active');
    return response.data;
  },

  // Get employees only (admin)
  getEmployees: async (params = {}) => {
    const response = await api.get('/users/employees', { params });
    return response.data;
  },

  // Get user by ID
  getById: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  // Create new user
  create: async (userData) => {
    const response = await api.post('/users', userData);
    return response.data;
  },

  // Update user
  update: async (id, userData) => {
    const response = await api.put(`/users/${id}`, userData);
    return response.data;
  },

  // Delete (soft delete) user
  delete: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  // Get current user profile
  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data;
  },

  // Update current user profile
  updateProfile: async (profileData) => {
    const response = await api.put('/users/profile', profileData);
    return response.data;
  },

  // Admin: reset a user's password
  resetPassword: async (id, newPassword) => {
    const response = await api.put(`/users/${id}/reset-password`, { newPassword });
    return response.data;
  },

  // Admin: unlock a locked/deactivated account
  unlockAccount: async (id) => {
    const response = await api.put(`/users/${id}/unlock`);
    return response.data;
  },

  // Admin: permanently delete a user (for duplicate/orphaned logins)
  permanentDelete: async (id) => {
    const response = await api.delete(`/users/${id}/permanent`);
    return response.data;
  },

  // Lookup: entities for BDM assignment dropdown
  getEntities: async () => {
    const response = await api.get('/users/lookup/entities');
    return response.data;
  },

  // Lookup: ERP access templates for BDM assignment dropdown
  getAccessTemplates: async () => {
    const response = await api.get('/users/lookup/access-templates');
    return response.data;
  },
};

export default userService;
