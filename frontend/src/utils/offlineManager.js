/**
 * Offline Manager — Service Worker Registration + Sync Coordination
 *
 * Responsibilities:
 *   1. Register the service worker on app boot
 *   2. Track online/offline status
 *   3. Trigger background sync when connection returns
 *   4. Provide queue count for UI badges
 *   5. Listen for sync-complete messages from SW
 *
 * Usage:
 *   import { offlineManager } from '../utils/offlineManager';
 *   offlineManager.init();
 *   offlineManager.onStatusChange((isOnline) => { ... });
 */

const listeners = new Set();
let swRegistration = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let queueCount = 0;
const queueListeners = new Set();

// ── Public API ─────────────────────────────────────────────────────

const offlineManager = {
  /**
   * Initialize: register SW, set up online/offline listeners.
   * Call once from main.jsx or App.jsx.
   */
  async init() {
    if (typeof window === 'undefined') return;

    // Online/offline events
    window.addEventListener('online', () => handleStatusChange(true));
    window.addEventListener('offline', () => handleStatusChange(false));
    isOnline = navigator.onLine;

    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', handleSWMessage);

        // Check queue count on init
        this.requestQueueCount();

        // eslint-disable-next-line no-console
        console.log('[OfflineManager] Service worker registered');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[OfflineManager] SW registration failed:', err);
      }
    }
  },

  /** Current online status */
  get isOnline() {
    return isOnline;
  },

  /** Current pending queue count */
  get queueCount() {
    return queueCount;
  },

  /**
   * Subscribe to online/offline status changes.
   * @param {function} callback - (isOnline: boolean) => void
   * @returns {function} unsubscribe
   */
  onStatusChange(callback) {
    listeners.add(callback);
    // Immediately fire with current status
    callback(isOnline);
    return () => listeners.delete(callback);
  },

  /**
   * Subscribe to queue count changes.
   * @param {function} callback - (count: number) => void
   * @returns {function} unsubscribe
   */
  onQueueChange(callback) {
    queueListeners.add(callback);
    callback(queueCount);
    return () => queueListeners.delete(callback);
  },

  /** Manually trigger sync (e.g., when user taps "Sync Now") */
  triggerSync() {
    if (!navigator.serviceWorker?.controller) return;

    // Try Background Sync API first
    if (swRegistration?.sync) {
      swRegistration.sync.register('vip-clm-sync').catch(() => {
        // Fallback: message-based sync
        navigator.serviceWorker.controller.postMessage({ type: 'VIP_TRIGGER_SYNC' });
      });
    } else {
      // Fallback: message-based sync
      navigator.serviceWorker.controller.postMessage({ type: 'VIP_TRIGGER_SYNC' });
    }
  },

  /** Request current queue count from SW */
  requestQueueCount() {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'VIP_GET_QUEUE_COUNT' });
    }
  },
};

// ── Internal helpers ───────────────────────────────────────────────

function handleStatusChange(online) {
  const changed = isOnline !== online;
  isOnline = online;
  if (changed) {
    listeners.forEach((cb) => {
      try { cb(isOnline); } catch { /* ignore */ }
    });

    // When coming back online, trigger sync
    if (isOnline) {
      offlineManager.triggerSync();
    }
  }
}

function handleSWMessage(event) {
  const { data } = event;
  if (!data) return;

  if (data.type === 'VIP_SYNC_COMPLETE') {
    queueCount = data.remaining || 0;
    queueListeners.forEach((cb) => {
      try { cb(queueCount); } catch { /* ignore */ }
    });
  }

  if (data.type === 'VIP_QUEUE_COUNT') {
    queueCount = data.count || 0;
    queueListeners.forEach((cb) => {
      try { cb(queueCount); } catch { /* ignore */ }
    });
  }
}

export { offlineManager };
export default offlineManager;
