/**
 * AuthContext
 *
 * Authentication context providing:
 * - User state management
 * - Login/logout functionality
 * - Cookie-based authentication (httpOnly cookies)
 * - Authentication status
 *
 * SECURITY: Tokens are stored in httpOnly cookies only.
 * The frontend never accesses tokens directly - this protects against XSS attacks.
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

  // Check for existing session on mount by calling /api/auth/me
  // Cookies are sent automatically - if valid, user is authenticated
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        // Try to get profile - cookie will be sent automatically
        const response = await authService.getProfile();
        // Backend returns { success, data: user } or { data: user }
        if (isMounted) {
          setUser(response.data || response);
        }
      } catch {
        // No valid session - user is not authenticated
        // No localStorage cleanup needed - cookies are httpOnly
        if (isMounted) {
          setUser(null);
        }
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
      // Backend sets httpOnly cookies automatically
      // Only store user data in state - never tokens
      const { user: userData } = response.data;
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
      // Backend clears httpOnly cookies
      await authService.logout();
    } catch {
      // Logout error - continue with local cleanup anyway
    } finally {
      // Clear user state - cookies are cleared by backend
      setUser(null);
    }
  }, []);

  // Token refresh is handled automatically by the API interceptor
  // This function is kept for backward compatibility but does nothing
  const refreshToken = useCallback(async () => {
    try {
      // Refresh is handled via cookies - just call the endpoint
      await authService.refreshToken();
      return true;
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
