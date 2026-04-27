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

// Phase N — bumped to v2 because we added multipart-rebuild logic to the
// queue replay path. Cache name bump forces clients to drop the old SW
// cleanly during activate() and pick up the new replay contract.
const CACHE_VERSION = 'v2';
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
  // Phase N — visit POST is multipart/form-data, requires the photo-detach
  // path below (visit_photos store + rebuildFormDataFromQueue) to round-trip.
  '/api/visits/',
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

// ── Phase N — Cross-DB read for visit photo blobs during multipart replay ──
// Visit photos are persisted by VisitLogger/CameraCapture into the
// `vip-offline-data` IndexedDB (offlineStore.js), in the `visit_photos`
// store. The SW lives in `vip-offline-queue` and can't share a DB connection,
// but it CAN open the data DB read-only at replay time and reconstruct
// the FormData from there. Keeping these constants in sync with offlineStore.js
// is enforced by Phase N's healthcheck script.
const VIP_DATA_DB_NAME = 'vip-offline-data';
const VIP_DATA_DB_VERSION = 3; // Phase N: bump from v2 → v3 (new visit stores)
const VIP_DATA_VISIT_PHOTOS = 'visit_photos';

function openVipDataDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VIP_DATA_DB_NAME, VIP_DATA_DB_VERSION);
    // SW does NOT define onupgradeneeded for this DB — the main thread
    // (offlineStore.js) owns the schema. SW just opens and reads. If a
    // SW activation runs before the main thread has opened the DB at v3,
    // the SW's open call WILL trigger upgradeneeded with no handler — that
    // creates an empty DB at v3 with no stores. We guard against that
    // race by re-checking objectStoreNames before reading and gracefully
    // returning [] if the visit_photos store is absent.
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => {
      // Another tab has the DB open at an older version. Resolve with null
      // so the SW falls back to "skip this replay item" rather than hanging.
      resolve(null);
    };
  });
}

async function readVisitPhotoBlob(photoRef) {
  if (!photoRef) return null;
  let db;
  try {
    db = await openVipDataDB();
    if (!db || !db.objectStoreNames.contains(VIP_DATA_VISIT_PHOTOS)) {
      // Race or schema-skew — main thread hasn't created the store yet.
      // Caller treats null as "drop this draft" (the photo is gone).
      if (db) db.close();
      return null;
    }
    const tx = db.transaction(VIP_DATA_VISIT_PHOTOS, 'readonly');
    const store = tx.objectStore(VIP_DATA_VISIT_PHOTOS);
    const req = store.get(photoRef);
    return await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[SW] readVisitPhotoBlob failed:', err);
    return null;
  } finally {
    if (db) try { db.close(); } catch { /* ignore */ }
  }
}

async function deleteVisitPhotoBlob(photoRef) {
  if (!photoRef) return;
  let db;
  try {
    db = await openVipDataDB();
    if (!db || !db.objectStoreNames.contains(VIP_DATA_VISIT_PHOTOS)) {
      if (db) db.close();
      return;
    }
    const tx = db.transaction(VIP_DATA_VISIT_PHOTOS, 'readwrite');
    tx.objectStore(VIP_DATA_VISIT_PHOTOS).delete(photoRef);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  } catch (err) {
    console.warn('[SW] deleteVisitPhotoBlob failed:', err);
  } finally {
    if (db) try { db.close(); } catch { /* ignore */ }
  }
}

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

async function enqueueRequest(request, body, extra = {}) {
  try {
    // Stamp the queued item with the current user so replay can filter out
    // other users' drafts on shared devices. null is allowed (pre-v2 rows
    // behaved the same way; replay treats null userId as "anyone may replay").
    //
    // Phase N — `extra` carries the visit-kind envelope when an incoming
    // request was a multipart visit POST. The SW intercept (fetch handler)
    // serializes the JSON portion into `body` and the photo refs + form
    // fields into `extra.kind='visit', extra.photoRefs, extra.formFields`.
    // On replay, the SW rebuilds FormData from photoRefs (Blob lookups
    // against the data DB) + formFields. Items without `extra.kind` are
    // treated as straight JSON requests (existing CLM contract).
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
      // Phase N — optional multipart-rebuild envelope. Undefined for legacy
      // CLM JSON queue items so they replay unchanged.
      kind: extra.kind || null,
      photoRefs: extra.photoRefs || null,
      formFields: extra.formFields || null,
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

// ── Phase N — Rebuild a multipart FormData payload from a queued visit ──
// item. Returns null if any photo blob is missing (the draft is unrecoverable
// — caller drops it from the queue and notifies the user).
async function rebuildVisitFormData(item) {
  if (!item || item.kind !== 'visit') return null;
  const photoRefs = Array.isArray(item.photoRefs) ? item.photoRefs : [];
  const formFields = item.formFields || {};

  const formData = new FormData();

  // Append non-photo fields first. JSON-encode complex fields (objects/arrays)
  // because Express body-parser receives them as strings on the multipart
  // path — visitController.createVisit already handles JSON.parse of these.
  for (const [key, value] of Object.entries(formFields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      formData.append(key, JSON.stringify(value));
    } else {
      formData.append(key, String(value));
    }
  }

  // Append photo blobs. The 'photos' field name + ordering match the
  // upload middleware's expectations on the create endpoint.
  for (const ref of photoRefs) {
    const record = await readVisitPhotoBlob(ref);
    if (!record?.blob) {
      // Photo is missing — refuse to replay a partial submit. Caller
      // drops the queued item entirely; lost-draft signal is delivered
      // to the user via the existing VIP_SYNC_COMPLETE message stream.
      return null;
    }
    const filename = record.filename || `${ref}.jpg`;
    const file = new File([record.blob], filename, {
      type: record.blob.type || 'image/jpeg',
    });
    formData.append('photos', file);
  }

  return { formData, photoRefs };
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
          // Offline — queue the request.
          //
          // Phase N — Visit submissions are multipart/form-data. The default
          // body=request.text() path strips Blob bytes, so we route visits
          // through a separate envelope that carries photoRefs + formFields
          // and rebuilds FormData on replay (rebuildVisitFormData).
          //
          // The frontend's visitService is responsible for posting the
          // envelope as JSON via X-VIP-Visit-Envelope header when offline,
          // OR for sending the original multipart request (the SW notices
          // the multipart content-type and short-circuits to "drop on
          // floor" — frontend should never reach this code path for visits
          // unless something went wrong; defensive log + drop).
          const isVisit = url.pathname.includes('/api/visits/') || url.pathname.endsWith('/api/visits');
          const contentType = request.headers.get('content-type') || '';

          if (isVisit && contentType.includes('application/json')) {
            // Visit envelope — JSON body shaped { kind, photoRefs, formFields }.
            // VisitService writes this when offlineManager detects offline.
            try {
              const envelopeText = await request.clone().text();
              const envelope = JSON.parse(envelopeText);
              if (envelope?.kind === 'visit') {
                const queued = await enqueueRequest(request, null, {
                  kind: 'visit',
                  photoRefs: envelope.photoRefs || [],
                  formFields: envelope.formFields || {},
                });
                if (queued) {
                  return new Response(
                    JSON.stringify({
                      success: true,
                      offline: true,
                      message: 'Visit saved offline. Will sync when connection returns.',
                      data: { _id: `offline_${Date.now()}`, offlineQueued: true },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                  );
                }
              }
            } catch (envErr) {
              console.warn('[SW] Visit envelope parse failed, falling back to text body:', envErr);
            }
          }

          // Default path (CLM, or non-envelope visit) — store JSON body verbatim
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
  if (!queued.length) return { synced: 0, syncedKinds: {}, bytes: 0 };

  tokenRefreshAttempted = false;

  // Read the currently-authenticated user once per replay cycle. On shared
  // devices (one tablet across multiple BDMs), only items stamped with the
  // current userId replay — others stay queued until their owner logs back in.
  // Null currentUser means either no one is logged in (nothing to replay) or
  // the auth context hasn't sync'd yet — we still allow legacy (pre-v2)
  // untagged items through so upgrades don't orphan in-flight drafts.
  const currentUserId = await getCurrentUserId();
  const now = Date.now();

  // Phase N offline-first sprint — track per-run sync stats so the page can
  // toast "Synced N items (~X MB)" and write a self-DM to the BDM's inbox.
  // bytes is BEST-EFFORT — we count visit photo blob sizes from each draft
  // (the dominant payload) plus an estimated 1 KB per metadata line.
  let syncedCount = 0;
  const syncedKinds = {}; // { visit: 2, clm: 1, ... }
  let approxBytes = 0;

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
      // Phase N — Visit-kind items rebuild FormData from photo blobs at
      // replay time. Strip Content-Type so fetch() sets the multipart
      // boundary itself; sending the queued JSON content-type would break
      // the upstream multer parser.
      let replayBody = item.body || undefined;
      let replayHeaders = item.headers || {};

      if (item.kind === 'visit') {
        const rebuilt = await rebuildVisitFormData(item);
        if (!rebuilt) {
          // Photos lost — drop the queued visit. Notify clients so VisitLogger
          // can surface "draft data lost, please re-capture and re-submit"
          // instead of silently dropping the user's work.
          await removeQueuedRequest(item.id);
          const clients = await self.clients.matchAll();
          clients.forEach((client) => {
            client.postMessage({
              type: 'VIP_VISIT_DRAFT_LOST',
              message: 'A queued offline visit could not be restored — please re-capture and re-submit.',
              draftId: item.id,
            });
          });
          continue;
        }
        replayBody = rebuilt.formData;
        // Drop Content-Type from the headers — fetch() must compute a fresh
        // multipart boundary or the body bytes won't parse server-side.
        const cleanHeaders = { ...item.headers };
        delete cleanHeaders['content-type'];
        delete cleanHeaders['Content-Type'];
        replayHeaders = cleanHeaders;
      }

      const response = await fetch(item.url, {
        method: item.method,
        headers: replayHeaders,
        body: replayBody,
        credentials: 'include',
      });

      if (response.ok || (response.status >= 200 && response.status < 400)) {
        // Visit replay success — sum photo sizes for the per-run sync stat
        // BEFORE deleting blobs. Then clean up the photo blobs so they
        // don't accumulate. Best-effort; any orphans get age-evicted on
        // next openVipDataDB cycle.
        if (item.kind === 'visit' && Array.isArray(item.photoRefs)) {
          for (const ref of item.photoRefs) {
            try {
              const rec = await readVisitPhotoBlob(ref);
              approxBytes += (rec?.size || rec?.blob?.size || 0);
            } catch { /* size accounting is best-effort */ }
            await deleteVisitPhotoBlob(ref);
          }
        } else {
          // metadata-only payloads (legacy CLM / commLog queued items) —
          // estimate ~1 KB so the cumulative byte counter is a defensible
          // lower bound rather than 0.
          approxBytes += 1024;
        }
        syncedCount += 1;
        const k = item.kind || 'other';
        syncedKinds[k] = (syncedKinds[k] || 0) + 1;
        await removeQueuedRequest(item.id);
        continue;
      }

      // 401 = access token expired — try refresh
      if (response.status === 401 && !tokenRefreshAttempted) {
        tokenRefreshAttempted = true;
        const refreshed = await attemptTokenRefresh();
        if (refreshed) {
          // Retry this request with fresh token. Visit-kind needs a NEW
          // FormData — the original was consumed by the failed request.
          let retryBody = replayBody;
          if (item.kind === 'visit') {
            const reRebuilt = await rebuildVisitFormData(item);
            if (!reRebuilt) {
              await removeQueuedRequest(item.id);
              continue;
            }
            retryBody = reRebuilt.formData;
          }
          const retryResponse = await fetch(item.url, {
            method: item.method,
            headers: replayHeaders,
            body: retryBody,
            credentials: 'include',
          });
          if (retryResponse.ok || (retryResponse.status >= 200 && retryResponse.status < 400)) {
            if (item.kind === 'visit' && Array.isArray(item.photoRefs)) {
              for (const ref of item.photoRefs) {
                try {
                  const rec = await readVisitPhotoBlob(ref);
                  approxBytes += (rec?.size || rec?.blob?.size || 0);
                } catch { /* size accounting is best-effort */ }
                await deleteVisitPhotoBlob(ref);
              }
            } else {
              approxBytes += 1024;
            }
            syncedCount += 1;
            const k = item.kind || 'other';
            syncedKinds[k] = (syncedKinds[k] || 0) + 1;
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
        if (item.kind === 'visit' && Array.isArray(item.photoRefs)) {
          for (const ref of item.photoRefs) {
            await deleteVisitPhotoBlob(ref);
          }
        }
        await removeQueuedRequest(item.id);
        continue;
      }

      // Phase N — Treat E11000 (visit unique-index dup) as idempotent success.
      // Visit's compound unique index on {doctor, user, yearWeekKey} naturally
      // dedups offline retries — if BDM-1 had already submitted this visit
      // online from another device while their offline queue was sitting,
      // the server returns 400 with a "weekly limit" error. Drop the queued
      // copy so it doesn't loop indefinitely.
      if (response.status === 400) {
        try {
          const errBody = await response.clone().json();
          const msg = String(errBody?.message || '').toLowerCase();
          if (msg.includes('already been logged this week') || msg.includes('duplicate key') || msg.includes('e11000')) {
            if (item.kind === 'visit' && Array.isArray(item.photoRefs)) {
              for (const ref of item.photoRefs) {
                await deleteVisitPhotoBlob(ref);
              }
            }
            await removeQueuedRequest(item.id);
            continue;
          }
        } catch {
          // JSON parse failed — fall through to generic 4xx path
        }
      }

      // 4xx (other than 401/409) = client error, remove to prevent infinite retry
      if (response.status >= 400 && response.status < 500) {
        if (item.kind === 'visit' && Array.isArray(item.photoRefs)) {
          for (const ref of item.photoRefs) {
            await deleteVisitPhotoBlob(ref);
          }
        }
        await removeQueuedRequest(item.id);
        continue;
      }

      // 5xx = server error, leave in queue for next sync
    } catch {
      // Network error — still offline
      break;
    }
  }

  // Notify all clients about sync completion. Stats payload lets the page
  // render a precise toast ("Synced 3 visits (~5.4 MB)") and write a
  // self-DM into the BDM's inbox for auditability of mobile-data spend.
  const remaining = await getQueuedRequests();
  const clients = await self.clients.matchAll();
  const stats = {
    type: 'VIP_SYNC_COMPLETE',
    remaining: remaining.length,
    synced: syncedCount,
    syncedKinds,
    bytes: approxBytes,
    completedAt: new Date().toISOString(),
  };
  clients.forEach((client) => {
    client.postMessage(stats);
  });
  return { synced: syncedCount, syncedKinds, bytes: approxBytes };
}

// ── Periodic sync check (fallback for browsers without Background Sync) ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'VIP_TRIGGER_SYNC') {
    replayQueue().then(async (replayStats) => {
      // replayQueue already broadcasts VIP_SYNC_COMPLETE to all clients
      // when items were processed. The redundant per-source post here is
      // for the empty-queue case (replayStats === undefined when queue
      // was already drained at entry) so the page can dismiss its
      // "syncing…" indicator deterministically. Carry the same stats
      // shape both ways so listeners don't have to dual-mode.
      const remaining = await getQueuedRequests();
      event.source?.postMessage({
        type: 'VIP_SYNC_COMPLETE',
        remaining: remaining.length,
        synced: replayStats?.synced || 0,
        syncedKinds: replayStats?.syncedKinds || {},
        bytes: replayStats?.bytes || 0,
        completedAt: new Date().toISOString(),
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
