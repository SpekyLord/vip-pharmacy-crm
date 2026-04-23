/**
 * useOffline Hook — React hook for offline status and sync queue
 *
 * Returns:
 *   isOnline     — boolean, current connectivity status
 *   queueCount   — number, pending offline requests waiting to sync
 *   triggerSync  — function, manually trigger background sync
 *
 * Usage:
 *   const { isOnline, queueCount, triggerSync } = useOffline();
 */
import { useState, useEffect, useCallback } from 'react';
import { offlineManager } from '../utils/offlineManager';

export function useOffline() {
  const [isOnline, setIsOnline] = useState(offlineManager.isOnline);
  const [queueCount, setQueueCount] = useState(offlineManager.queueCount);

  useEffect(() => {
    const unsubStatus = offlineManager.onStatusChange(setIsOnline);
    const unsubQueue = offlineManager.onQueueChange(setQueueCount);
    return () => {
      unsubStatus();
      unsubQueue();
    };
  }, []);

  const triggerSync = useCallback(() => {
    offlineManager.triggerSync();
  }, []);

  return { isOnline, queueCount, triggerSync };
}

export default useOffline;
