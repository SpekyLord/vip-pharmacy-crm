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

// Determine API URL based on environment
const getApiUrl = () => {
  // Check if custom API URL is set (production)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In development, use relative URL so Vite's proxy handles it.
  // This way phone/network access only needs port 5173 (Vite proxies /api → localhost:5000)
  return '/api';
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

// Refresh mutex: ensures only ONE refresh request fires at a time
// All other 401'd requests wait for the same refresh promise
let isRefreshing = false;
let refreshPromise = null;

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

      // If a refresh is already in progress, wait for it instead of firing another
      if (isRefreshing) {
        try {
          await refreshPromise;
          return api(originalRequest);
        } catch {
          return Promise.reject(error);
        }
      }

      // Start a new refresh
      isRefreshing = true;
      refreshPromise = axios.post(`${API_URL}/auth/refresh-token`, {}, {
        withCredentials: true,
      });

      try {
        await refreshPromise;
        // Retry original request - new access token cookie will be sent automatically
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - dispatch logout event for AuthContext to handle
        window.dispatchEvent(new CustomEvent('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
        refreshPromise = null;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
