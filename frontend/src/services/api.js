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

// Working entity header — set by EntityContext for president/ceo users
let _workingEntityId = null;
export const setWorkingEntityHeader = (id) => { _workingEntityId = id; };

// Request interceptor - inject X-Entity-Id header when set
api.interceptors.request.use(
  (config) => {
    if (_workingEntityId) {
      config.headers['X-Entity-Id'] = _workingEntityId;
    }
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

      // Preserve the original HTTP method — Axios v1.x can lose it on retry
      const savedMethod = originalRequest.method;

      // If a refresh is already in progress, wait for it instead of firing another
      if (isRefreshing) {
        try {
          await refreshPromise;
          originalRequest.method = savedMethod;
          return api.request(originalRequest);
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
        // Retry original request — explicitly restore method to prevent GET fallback
        originalRequest.method = savedMethod;
        return api.request(originalRequest);
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
