/**
 * AuthProvider
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
import { useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';
import { classifyError } from '../utils/classifyError';
import { AuthContext } from './AuthContextObject';

const authBootstrapState = {
  promise: null,
  hasResolved: false,
  user: null,
};

const primeAuthBootstrapState = (user) => {
  authBootstrapState.promise = null;
  authBootstrapState.hasResolved = true;
  authBootstrapState.user = user;
};

const loadInitialUser = async () => {
  if (authBootstrapState.hasResolved) {
    return authBootstrapState.user;
  }

  if (!authBootstrapState.promise) {
    authBootstrapState.promise = authService.getProfile()
      .then((response) => {
        const user = response?.data || response || null;
        primeAuthBootstrapState(user);
        return user;
      })
      .catch((error) => {
        primeAuthBootstrapState(null);
        throw error;
      });
  }

  return authBootstrapState.promise;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null);

  // Handle forced logout from API interceptor
  const handleForcedLogout = useCallback(() => {
    primeAuthBootstrapState(null);
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

  // Check for an existing session on mount by calling /api/users/profile
  // Cookies are sent automatically - if valid, user is authenticated
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        const initialUser = await loadInitialUser();
        if (isMounted) {
          setUser(initialUser);
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
    setErrorType(null);
    try {
      const response = await authService.login(email, password);
      // Backend sets httpOnly cookies automatically
      // Only store user data in state - never tokens
      console.log('[AuthContext] login response:', JSON.stringify(response).substring(0, 200));
      const userData = response?.data?.user || response?.user;
      console.log('[AuthContext] userData:', userData?.name, userData?.role);
      if (!userData) {
        throw new Error('No user data in response');
      }
      primeAuthBootstrapState(userData);
      setUser(userData);
      return response;
    } catch (err) {
      const { type, message } = classifyError(err, 'Login failed');
      console.error('[AuthContext] login error:', type, message, err);
      setError(message);
      setErrorType(type);
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
      primeAuthBootstrapState(null);
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
    errorType,
    isAuthenticated: !!user,
    login,
    logout,
    refreshToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
