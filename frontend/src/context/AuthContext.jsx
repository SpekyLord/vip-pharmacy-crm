/**
 * AuthContext
 *
 * Authentication context providing:
 * - User state management
 * - Login/logout functionality
 * - Token management
 * - Authentication status
 */

import { createContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Handle forced logout from API interceptor
  const handleForcedLogout = useCallback(() => {
    setUser(null);
    setLoading(false);
  }, []);

  // Listen for auth:logout events from API interceptor
  useEffect(() => {
    window.addEventListener('auth:logout', handleForcedLogout);
    return () => {
      window.removeEventListener('auth:logout', handleForcedLogout);
    };
  }, [handleForcedLogout]);

  // Check for existing session on mount
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');

      // No token - immediately stop loading
      if (!token) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      try {
        const response = await authService.getProfile();
        // Backend returns { success, data: user } or { data: user }
        if (isMounted) {
          setUser(response.data || response);
        }
      } catch {
        // Clear invalid tokens silently
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authService.login(email, password);
      // Backend returns { success, data: { user, accessToken, refreshToken } }
      const { user: userData, accessToken, refreshToken } = response.data;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      setUser(userData);
      return response;
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Logout error - continue with local cleanup anyway
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    }
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const token = localStorage.getItem('refreshToken');
      if (!token) throw new Error('No refresh token');

      const response = await authService.refreshToken(token);
      // Backend returns { success, data: { accessToken } }
      const newAccessToken = response.data?.accessToken || response.accessToken;
      localStorage.setItem('accessToken', newAccessToken);
      return newAccessToken;
    } catch (err) {
      logout();
      throw err;
    }
  }, [logout]);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
