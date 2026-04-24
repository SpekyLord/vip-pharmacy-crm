/**
 * VIP CRM Service Worker — Offline-First for BDM Partnership Presentations
 *
 * Strategy:
 *   - SHELL_CACHE:  App shell (HTML, JS, CSS) — cache-first, updated in background
 *   - CLM_CACHE:    CLM presentation assets (logos, product images) — cache-first
 *   - DATA_CACHE:   API responses (doctors, products) — network-first with cache fallback
 *   - OFFLINE_QUEUE: Failed POST/PUT requests queued in IndexedDB for background sync
 *
 * The CLM presenter can run fully offline once the shell + CLM assets are cached.
 * API data (doctors, products) is cached on first successful fetch so BDMs can
 * select doctors and present even without connectivity.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `vip-shell-${CACHE_VERSION}`;
const CLM_CACHE = `vip-clm-${CACHE_VERSION}`;
const DATA_CACHE = `vip-data-${CACHE_VERSION}`;

// ── Static assets to pre-cache on install ──────────────────────────
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// /clm/ has no static pre-cached assets. Branding logos are entity-specific
// (S3-hosted, signed URLs) and product images come from the CRM product
// catalog. Both are cached on-demand by the fetch handler below. CLMPresenter
// gracefully falls back to Lucide placeholders when assets are unavailable.

// API paths to cache for offline data access
const CACHEABLE_API_PATHS = [
  '/api/doctors',
  '/api/products',
  '/api/clm/sessions/my',
];

// API paths that should be queued when offline (mutations)
const QUEUEABLE_METHODS = ['POST', 'PUT', 'PATCH'];
const QUEUEABLE_API_PATHS = [
  '/api/clm/',
];

// ── IndexedDB for offline queue ────────────────────────────────────
// DB_VERSION 2 (April 2026): adds `meta` store for current-user tracking so
// the replay loop can filter queued requests by owner. Prevents BDM1's
// offline drafts from replaying under BDM2's auth on shared devices.
const DB_NAME = 'vip-offline-queue';
const DB_VERSION = 2;
const STORE_NAME = 'pending-requests';
const META_STORE = 'meta';
const META_KEY_CURRENT_USER = 'current-user-id';

// Drop queued requests older than this at replay time. Guards against
// indefinite accumulation when a user abandons drafts.
const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      // v1 → v2 migration: add meta store. Existing queued rows (without
      // userId) will be replayed unfiltered the first time — acceptable
      // since the upgrade happens on activation, before any new queueing
      // under the new user-scoped contract.
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── User-scope helpers (META store) ────────────────────────────────
async function getCurrentUserId() {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const req = store.get(META_KEY_CURRENT_USER);
    return await new Promise((resolve) => {
      req.onsuccess = () => { db.close(); resolve(req.result?.value || null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch {
    return null;
  }
}

async function setCurrentUserId(userId) {
  try {
    const db = await openDB();
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    if (userId) {
      store.put({ key: META_KEY_CURRENT_USER, value: String(userId) });
    } else {
      store.delete(META_KEY_CURRENT_USER);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  } catch (err) {
    console.warn('[SW] setCurrentUserId failed:', err);
  }
}

async function enqueueRequest(request, body) {
  try {
    // Stamp the queued item with the current user so replay can filter out
    // other users' drafts on shared devices. null is allowed (pre-v2 rows
    // behaved the same way; replay treats null userId as "anyone may replay").
    const userId = await getCurrentUserId();
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
      timestamp: Date.now(),
      userId,
    });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
    return true;
  } catch (err) {
    console.error('[SW] Failed to enqueue request:', err);
    return false;
  }
}

async function getQueuedRequests() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return [];
  }
}

async function removeQueuedRequest(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  } catch (err) {
    console.error('[SW] Failed to remove queued request:', err);
  }
}

// ── Install: pre-cache shell assets ────────────────────────────────
// CLM_CACHE is created lazily on the first /clm/* fetch (see fetch handler
// below). Keeping the cache name around ensures the cleanup logic in activate
// still recognizes the current cache and doesn't wipe legitimate on-demand
// entries across an SW update.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  const currentCaches = [SHELL_CACHE, CLM_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !currentCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing strategy ────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) return;

  // Skip chrome-extension and other non-same-origin for navigation
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api')) return;

  // ── CLM assets: cache-first (these never change) ─────────────
  if (url.pathname.startsWith('/clm/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CLM_CACHE).then((cache) => cache.put(request, clone));
        return response;
      }))
    );
    return;
  }

  // ── API mutations (POST/PUT): queue if offline ───────────────
  if (QUEUEABLE_METHODS.includes(request.method) &&
      QUEUEABLE_API_PATHS.some((p) => url.pathname.includes(p))) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request.clone());
          return response;
        } catch (err) {
          // Offline — queue the request
          const body = await request.clone().text();
          const queued = await enqueueRequest(request, body);
          if (queued) {
            // Return a synthetic success response so the UI doesn't break
            return new Response(
              JSON.stringify({
                success: true,
                offline: true,
                message: 'Saved offline. Will sync when connection returns.',
                data: { _id: `offline_${Date.now()}`, offlineQueued: true },
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
          throw err;
        }
      })()
    );
    return;
  }

  // ── API GET requests: network-first with cache fallback ──────
  if (url.pathname.startsWith('/api/') && request.method === 'GET') {
    const isCacheable = CACHEABLE_API_PATHS.some((p) => url.pathname.startsWith(p));
    if (isCacheable) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(DATA_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match(request).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({
                success: false,
                offline: true,
                message: 'You are offline. Showing cached data.',
                data: [],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }))
      );
      return;
    }
    // Non-cacheable API: just try network
    return;
  }

  // ── Navigation requests: network-first, fallback to cached shell ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── Static assets (JS/CSS/fonts): stale-while-revalidate ────
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }
});

// ── Background sync: replay queued requests ────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'vip-clm-sync') {
    event.waitUntil(replayQueue());
  }
});

/**
 * Replay queued requests with JWT token refresh orchestration.
 *
 * Problem: Access token is 15 min (httpOnly cookie). If BDM was offline
 * for >15 min, the cookie is stale. On replay, the server returns 401.
 *
 * Solution: On first 401, call POST /api/auth/refresh-token (refresh token
 * is 7 days, also httpOnly cookie). If refresh succeeds, the server sets
 * new cookies and we retry. If refresh fails (expired/revoked), notify
 * the user that re-login is required.
 */
let tokenRefreshAttempted = false;

async function attemptTokenRefresh() {
  try {
    const refreshUrl = new URL('/api/auth/refresh-token', self.location.origin).href;
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'include',
    });
    if (response.ok) {
      tokenRefreshAttempted = false; // Reset for future cycles
      return true;
    }
    // 401/403 = refresh token also expired — user must re-login
    return false;
  } catch {
    // Network error during refresh
    return false;
  }
}

async function replayQueue() {
  const queued = await getQueuedRequests();
  if (!queued.length) return;

  tokenRefreshAttempted = false;

  // Read the currently-authenticated user once per replay cycle. On shared
  // devices (one tablet across multiple BDMs), only items stamped with the
  // current userId replay — others stay queued until their owner logs back in.
  // Null currentUser means either no one is logged in (nothing to replay) or
  // the auth context hasn't sync'd yet — we still allow legacy (pre-v2)
  // untagged items through so upgrades don't orphan in-flight drafts.
  const currentUserId = await getCurrentUserId();
  const now = Date.now();

  for (const item of queued) {
    // Age eviction — drop anything older than QUEUE_MAX_AGE_MS regardless
    // of owner. Prevents indefinite accumulation on a device that keeps
    // going offline (stale 5xx loops, abandoned drafts).
    if (item.timestamp && now - item.timestamp > QUEUE_MAX_AGE_MS) {
      await removeQueuedRequest(item.id);
      continue;
    }

    // User-scope filter — if the item was stamped with a userId (v2+), it
    // must match the currently-authenticated user. Items without a userId
    // are legacy (created under v1) and replay as before.
    if (item.userId && currentUserId && item.userId !== currentUserId) {
      // Leave in queue — don't replay under the wrong user, but keep the
      // draft intact so BDM1 can sync it when they log back in.
      continue;
    }

    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
        credentials: 'include',
      });

      if (response.ok || (response.status >= 200 && response.status < 400)) {
        await removeQueuedRequest(item.id);
        continue;
      }

      // 401 = access token expired — try refresh
      if (response.status === 401 && !tokenRefreshAttempted) {
        tokenRefreshAttempted = true;
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          // Retry this request with fresh token
          const retryResponse = await fetch(item.url, {
            method: item.method,
            headers: item.headers,
            body: item.body || undefined,
            credentials: 'include',
          });
          if (retryResponse.ok || (retryResponse.status >= 200 && retryResponse.status < 400)) {
            await removeQueuedRequest(item.id);
            continue;
          }
          // Still failing after refresh — leave in queue
        } else {
          // Refresh failed — notify user they need to re-login
          const clients = await self.clients.matchAll();
          clients.forEach((client) => {
            client.postMessage({
              type: 'VIP_SYNC_AUTH_REQUIRED',
              message: 'Session expired. Please log in again to sync offline data.',
            });
          });
          break; // Stop replaying — all requests will fail without auth
        }
      }

      // 409 Conflict = duplicate — remove from queue (server already has it)
      if (response.status === 409) {
        await removeQueuedRequest(item.id);
        continue;
      }

      // 4xx (other than 401/409) = client error, remove to prevent infinite retry
      if (response.status >= 400 && response.status < 500) {
        await removeQueuedRequest(item.id);
        continue;
      }

      // 5xx = server error, leave in queue for next sync
    } catch {
      // Network error — still offline
      break;
    }
  }

  // Notify all clients about sync completion
  const remaining = await getQueuedRequests();
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'VIP_SYNC_COMPLETE', remaining: remaining.length });
  });
}

// ── Periodic sync check (fallback for browsers without Background Sync) ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'VIP_TRIGGER_SYNC') {
    replayQueue().then(async () => {
      const remaining = await getQueuedRequests();
      event.source?.postMessage({
        type: 'VIP_SYNC_COMPLETE',
        remaining: remaining.length,
      });
    });
  }

  if (event.data?.type === 'VIP_GET_QUEUE_COUNT') {
    getQueuedRequests().then((queued) => {
      event.source?.postMessage({
        type: 'VIP_QUEUE_COUNT',
        count: queued.length,
      });
    });
  }

  // Current-user sync from main thread. Written by AuthContext on login /
  // session init; cleared on logout. Persisted to the META store so a
  // restarted SW (browser relaunch, wake from sleep) still sees it on the
  // next replay cycle without waiting for the main thread to re-announce.
  if (event.data?.type === 'VIP_SET_USER' && event.data.userId) {
    setCurrentUserId(event.data.userId);
  }
  if (event.data?.type === 'VIP_CLEAR_USER') {
    setCurrentUserId(null);
  }
});
