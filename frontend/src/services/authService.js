/**
 * Auth Service
 *
 * Authentication API calls:
 * - Login
 * - Logout
 * - Register
 * - Password reset
 * - Token refresh (via httpOnly cookies)
 * - Get profile
 *
 * SECURITY: All authentication uses httpOnly cookies.
 * Tokens are never exposed to JavaScript.
 */

import api from './api';

const authService = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token, password) => {
    const response = await api.post(`/auth/reset-password/${token}`, { password });
    return response.data;
  },

  // Token refresh is handled via httpOnly cookies - no token parameter needed
  refreshToken: async () => {
    const response = await api.post('/auth/refresh-token', {});
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/users/profile');
    return response.data;
  },

  updateProfile: async (profileData) => {
    const response = await api.put('/users/profile', profileData);
    return response.data;
  },
};

export default authService;
