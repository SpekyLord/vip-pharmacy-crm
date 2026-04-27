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
import offlineManager from '../utils/offlineManager';
import offlineStore from '../utils/offlineStore';
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
    // Tell the SW the owner is gone so queued offline drafts don't replay
    // under whoever logs in next on this device.
    offlineManager.clearCurrentUser();
    // Drop the cached profile so the next login on this device doesn't
    // briefly render the previous BDM's UI before getProfile() resolves.
    offlineStore.clearCachedCurrentUser();
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
          // Refresh the offline auth cache on every successful bootstrap so
          // it stays current with whatever the server believes about this
          // user's role / entity_ids / erp_access. The cache is read ONLY
          // when the next bootstrap can't reach the server.
          if (initialUser?._id) {
            offlineManager.setCurrentUser(initialUser._id);
            offlineStore.cacheCurrentUser(initialUser);
          } else {
            offlineManager.clearCurrentUser();
            offlineStore.clearCachedCurrentUser();
          }
        }
      } catch (err) {
        // /api/users/profile failed. Two cases:
        //   (a) Genuinely unauthenticated (no cookie / cookie expired) → /login
        //   (b) Browser is offline (BDM closed the app between visits, walked
        //       30 minutes, reopened on dead signal) → fall back to the cached
        //       profile so they can keep working and queued drafts still run
        //       under the right owner. We DO NOT touch httpOnly cookies — if
        //       they're expired the next online API call will 401 and the
        //       interceptor will fire auth:logout, which clears the cache.
        const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
        const errMsg = String(err?.message || '').toLowerCase();
        const looksLikeNetwork = errMsg.includes('network') || errMsg.includes('failed to fetch');
        let recoveredUser = null;
        if (isOffline || looksLikeNetwork) {
          try {
            recoveredUser = await offlineStore.getCachedCurrentUser();
          } catch { /* ignore — fall through to logout state */ }
        }
        if (isMounted) {
          if (recoveredUser?._id) {
            // Soft-recover: keep the user logged in client-side. Mark the
            // bootstrap as resolved so subsequent reloads don't re-fire
            // /api/users/profile until the route they next hit makes a real
            // call (which will 401 → auth:logout if the cookie has expired).
            primeAuthBootstrapState(recoveredUser);
            setUser(recoveredUser);
            offlineManager.setCurrentUser(recoveredUser._id);
            console.warn('[AuthContext] offline session bootstrap — restored cached profile for', recoveredUser._id);
          } else {
            setUser(null);
            offlineManager.clearCurrentUser();
            offlineStore.clearCachedCurrentUser();
          }
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
      // Stamp the SW with the new owner so any queued drafts filed by this
      // user replay under their auth (and others' drafts stay parked).
      offlineManager.setCurrentUser(userData._id);
      // Cache the profile so AuthContext can rehydrate this session offline
      // (BDM closes app between clinic visits, reopens on dead Globe signal).
      offlineStore.cacheCurrentUser(userData);
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
      // Clear the SW's current-user marker so queued drafts don't replay
      // under the next person who logs in on this device.
      offlineManager.clearCurrentUser();
      // Drop the cached profile so the next login on this device doesn't
      // briefly render the previous BDM's UI before getProfile() resolves.
      offlineStore.clearCachedCurrentUser();
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
