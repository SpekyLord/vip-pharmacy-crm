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

// Post a message to the SW controller, buffering it until the controller is
// populated (the SW has activated + claimed the page). Needed for cold-start
// flows where AuthContext fires setCurrentUser before activation completes.
function sendToSW(msg) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(msg);
    return;
  }
  const flush = () => {
    // `once: true` auto-removes the listener after the first fire.
    navigator.serviceWorker.controller?.postMessage(msg);
  };
  navigator.serviceWorker.addEventListener('controllerchange', flush, { once: true });
}

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

        console.log('[OfflineManager] Service worker registered');
      } catch (err) {
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
   * Tell the SW who the currently-authenticated user is. Called by
   * AuthContext on successful login and on initial session hydration.
   * The SW persists this to its META store and uses it to scope queued-
   * request replay so one BDM's drafts don't execute under another BDM's
   * auth on a shared device.
   *
   * On cold-start, AuthContext may fire this BEFORE the SW has activated
   * and claimed the page (i.e. `navigator.serviceWorker.controller` is
   * still null). In that window we buffer the message and flush it on the
   * next `controllerchange` event — otherwise the SW would never learn the
   * user and the scoping filter would silently fall back to "replay all".
   *
   * @param {string} userId — the logged-in user's _id (Mongo ObjectId string)
   */
  setCurrentUser(userId) {
    if (!userId) return;
    sendToSW({ type: 'VIP_SET_USER', userId: String(userId) });
  },

  /**
   * Clear the current-user marker in the SW. Called by AuthContext on
   * logout. After this, the SW's replay loop skips any queued requests
   * that have a userId stamped — they wait until their owner logs back in
   * (or age-evict at 7 days).
   */
  clearCurrentUser() {
    sendToSW({ type: 'VIP_CLEAR_USER' });
  },

  /**
   * Phase N — Submit a visit envelope to the SW queue. Used by visitService
   * when offline. The envelope shape mirrors what sw.js expects in the
   * fetch interceptor: { kind: 'visit', photoRefs: [...], formFields: {...} }.
   *
   * The fetch goes via a real POST to /api/visits with JSON body — the SW
   * notices the application/json + visit envelope, queues it instead of
   * passing through, and returns a synthetic 200 with offlineQueued:true.
   *
   * @param {object} envelope - { photoRefs, formFields }
   * @returns {Promise<object>} the synthetic queued response body
   */
  async queueVisit(envelope) {
    if (!envelope?.photoRefs || !envelope?.formFields) {
      throw new Error('queueVisit requires { photoRefs, formFields }');
    }
    // Issue a JSON POST so the SW intercepts. We hit the same endpoint the
    // online path uses; the SW differentiates by the X-VIP-Visit-Envelope
    // marker and the JSON body shape.
    const res = await fetch('/api/visits', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-VIP-Visit-Envelope': '1',
      },
      body: JSON.stringify({
        kind: 'visit',
        photoRefs: envelope.photoRefs,
        formFields: envelope.formFields,
      }),
    });
    return res.json();
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

  // Phase N — Visit draft lost (photos missing on replay). Bubble up via
  // the auth-required listener pool because both events share the same UX
  // contract: a toast that asks the BDM to take some recovery action.
  // Subscribers can distinguish on data.type if they need to.
  if (data.type === 'VIP_VISIT_DRAFT_LOST') {
    authListeners.forEach((cb) => {
      try {
        cb(data.message || 'Offline visit data was lost. Please re-capture and re-submit.');
      } catch { /* ignore */ }
    });
  }
}

export { offlineManager };
export default offlineManager;
