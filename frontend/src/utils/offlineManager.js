/**
 * Offline Manager — Service Worker Registration + Sync Coordination
 *
 * Responsibilities:
 *   1. Register the service worker on app boot
 *   2. Track online/offline status
 *   3. Trigger background sync when connection returns
 *   4. Provide queue count for UI badges
 *   5. Listen for sync-complete messages from SW
 *   6. iOS Safari fallback: visibilitychange + focus-based sync
 *      (iOS Safari does NOT support Background Sync API)
 *   7. Handle VIP_SYNC_AUTH_REQUIRED — notify user to re-login
 *
 * Usage:
 *   import { offlineManager } from '../utils/offlineManager';
 *   offlineManager.init();
 *   offlineManager.onStatusChange((isOnline) => { ... });
 */

const listeners = new Set();
const authListeners = new Set();
let swRegistration = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
let queueCount = 0;
const queueListeners = new Set();

// iOS Safari detection — needed because it lacks Background Sync API
const isIOSSafari = typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.MSStream;

// Periodic sync interval for iOS fallback (check every 30s when app is foregrounded)
let periodicSyncTimer = null;
const PERIODIC_SYNC_INTERVAL = 30_000; // 30 seconds

// ── Public API ─────────────────────────────────────────────────────

const offlineManager = {
  /**
   * Initialize: register SW, set up online/offline listeners,
   * and iOS Safari fallback listeners.
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

    // ── iOS Safari fallback ──────────────────────────────────────
    // Background Sync API is NOT supported on iOS Safari.
    // Instead, we sync when:
    //   (a) The app comes to foreground (visibilitychange)
    //   (b) The window gets focus
    //   (c) Periodic timer while foregrounded (every 30s)
    // This covers the real-world BDM scenario: present offline at clinic,
    // then open the app later when back on signal.

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOnline) {
        this.triggerSync();
      }
      // Start/stop periodic sync based on visibility
      this._managePeriodicSync();
    });

    window.addEventListener('focus', () => {
      if (isOnline) {
        this.triggerSync();
      }
    });

    // Start periodic sync if app is already visible
    this._managePeriodicSync();
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

  /**
   * Subscribe to auth-required events (when sync fails due to expired tokens).
   * @param {function} callback - (message: string) => void
   * @returns {function} unsubscribe
   */
  onAuthRequired(callback) {
    authListeners.add(callback);
    return () => authListeners.delete(callback);
  },

  /** Manually trigger sync (e.g., when user taps "Sync Now") */
  triggerSync() {
    if (!navigator.serviceWorker?.controller) return;

    // Try Background Sync API first (Chrome Android supports this)
    if (swRegistration?.sync && !isIOSSafari) {
      swRegistration.sync.register('vip-clm-sync').catch(() => {
        // Fallback: message-based sync
        navigator.serviceWorker.controller.postMessage({ type: 'VIP_TRIGGER_SYNC' });
      });
    } else {
      // iOS Safari and other browsers without Background Sync:
      // Use message-based sync (works when app is foregrounded)
      navigator.serviceWorker.controller.postMessage({ type: 'VIP_TRIGGER_SYNC' });
    }
  },

  /** Request current queue count from SW */
  requestQueueCount() {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'VIP_GET_QUEUE_COUNT' });
    }
  },

  /**
   * Manage periodic sync timer.
   * Runs every 30s while the app is visible and online.
   * Stops when the app is hidden or offline.
   * This is the iOS Safari fallback for Background Sync.
   * @private
   */
  _managePeriodicSync() {
    const shouldRun = document.visibilityState === 'visible' && isOnline && queueCount > 0;

    if (shouldRun && !periodicSyncTimer) {
      periodicSyncTimer = setInterval(() => {
        if (isOnline && queueCount > 0) {
          this.triggerSync();
        } else if (queueCount === 0) {
          // Nothing left to sync — stop polling
          clearInterval(periodicSyncTimer);
          periodicSyncTimer = null;
        }
      }, PERIODIC_SYNC_INTERVAL);
    } else if (!shouldRun && periodicSyncTimer) {
      clearInterval(periodicSyncTimer);
      periodicSyncTimer = null;
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
      // Restart periodic sync check for iOS
      offlineManager._managePeriodicSync();
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
    // If queue is drained, stop periodic sync
    offlineManager._managePeriodicSync();
  }

  if (data.type === 'VIP_QUEUE_COUNT') {
    queueCount = data.count || 0;
    queueListeners.forEach((cb) => {
      try { cb(queueCount); } catch { /* ignore */ }
    });
    // Start periodic sync if there are items
    offlineManager._managePeriodicSync();
  }

  // Auth required — refresh token expired, user must re-login
  if (data.type === 'VIP_SYNC_AUTH_REQUIRED') {
    authListeners.forEach((cb) => {
      try { cb(data.message || 'Session expired. Please log in again.'); } catch { /* ignore */ }
    });
  }
}

export { offlineManager };
export default offlineManager;
