/**
 * useOffline Hook — React hook for offline status, sync queue, and auth state
 *
 * Returns:
 *   isOnline       — boolean, current connectivity status
 *   queueCount     — number, pending offline requests waiting to sync
 *   triggerSync    — function, manually trigger background sync
 *   authRequired   — string|null, non-null when sync failed due to expired tokens
 *   clearAuth      — function, clear the authRequired message (after user re-logs in)
 *
 * Usage:
 *   const { isOnline, queueCount, triggerSync, authRequired } = useOffline();
 */
import { useState, useEffect, useCallback } from 'react';
import { offlineManager } from '../utils/offlineManager';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(offlineManager.isOnline);
  const [queueCount, setQueueCount] = useState(offlineManager.queueCount);
  const [authRequired, setAuthRequired] = useState(null);

  useEffect(() => {
    const unsubStatus = offlineManager.onStatusChange(setIsOnline);
    const unsubQueue = offlineManager.onQueueChange(setQueueCount);
    const unsubAuth = offlineManager.onAuthRequired((msg) => setAuthRequired(msg));
    return () => {
      unsubStatus();
      unsubQueue();
      unsubAuth();
    };
  }, []);

  const triggerSync = useCallback(() => {
    offlineManager.triggerSync();
  }, []);

  const clearAuth = useCallback(() => {
    setAuthRequired(null);
  }, []);

  return { isOnline, queueCount, triggerSync, authRequired, clearAuth };
}

export default useOffline;
