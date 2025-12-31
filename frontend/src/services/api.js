/**
 * API Configuration
 *
 * Axios instance with:
 * - Base URL configuration
 * - Request/response interceptors
 * - Cookie-based token refresh handling (httpOnly cookies)
 * - Error formatting
 *
 * SECURITY: Tokens are stored in httpOnly cookies only.
 * The frontend never accesses tokens directly - cookies are sent automatically.
 */

import axios from 'axios';

// Determine API URL based on how the frontend is accessed
// If accessed via network IP (phone), use the same host for API
const getApiUrl = () => {
  // Check if custom API URL is set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // If accessing from localhost, use localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }

  // If accessing from network IP (phone), use the same IP for backend
  return `http://${window.location.hostname}:5000/api`;
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout to prevent hanging requests
  withCredentials: true, // CRITICAL: Send cookies with every request
});

// Request interceptor - no token injection needed (cookies sent automatically)
api.interceptors.request.use(
  (config) => {
    // Cookies are sent automatically with withCredentials: true
    // No need to manually add Authorization header
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle token refresh via cookies
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip refresh attempt for auth endpoints to avoid infinite loops
      if (originalRequest.url?.includes('/auth/refresh-token') ||
          originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        // Refresh token is in httpOnly cookie, sent automatically
        await axios.post(`${API_URL}/auth/refresh-token`, {}, {
          withCredentials: true, // Send refresh token cookie
        });

        // Retry original request - new access token cookie will be sent automatically
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - dispatch logout event for AuthContext to handle
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
