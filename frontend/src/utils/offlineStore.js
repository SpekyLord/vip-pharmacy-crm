/**
 * Offline Store — IndexedDB-backed local cache for BDM offline data
 *
 * Stores:
 *   - doctors:        Cached doctor list for offline doctor selection
 *   - products:       Cached product list for offline product selection
 *   - product_images: Product image blobs keyed by product._id (survives S3 signed URL expiry)
 *   - clm_drafts:     In-progress CLM session data (before sync)
 *
 * IMPORTANT: Product images from S3 use signed URLs that expire in 1 hour (SEC-007).
 * We fetch the image bytes while online and store them as Blobs in IndexedDB,
 * keyed by product._id — NOT by URL. This means images work offline indefinitely.
 *
 * This is NOT a replacement for the API — it's a fallback cache.
 * When online, the app always fetches from the API and updates the cache.
 * When offline, the app reads from this cache.
 */

const DB_NAME = 'vip-offline-data';
// v1 → v2: product_images store
// v2 → v3 (Phase N): visit_drafts + visit_photos stores
const DB_VERSION = 3;

const STORES = {
  DOCTORS: 'doctors',
  PRODUCTS: 'products',
  PRODUCT_IMAGES: 'product_images',
  CLM_DRAFTS: 'clm_drafts',
  // Phase N — VisitLogger persists in-progress drafts here so a tab close /
  // device reboot mid-encounter doesn't lose the BDM's photos and form data.
  // Drafts are keyed by `id` (UUID generated at draft creation time, also
  // used as the SW queue's session_group_id). Photos are keyed by `photo_<uuid>`.
  VISIT_DRAFTS: 'visit_drafts',
  VISIT_PHOTOS: 'visit_photos',
};

// Phase N — Constants the SW reads (must stay in sync with sw.js)
const VISIT_PHOTO_REF_PREFIX = 'photo_';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.DOCTORS)) {
        db.createObjectStore(STORES.DOCTORS, { keyPath: '_id' });
      }
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        db.createObjectStore(STORES.PRODUCTS, { keyPath: '_id' });
      }
      if (!db.objectStoreNames.contains(STORES.PRODUCT_IMAGES)) {
        db.createObjectStore(STORES.PRODUCT_IMAGES, { keyPath: 'productId' });
      }
      if (!db.objectStoreNames.contains(STORES.CLM_DRAFTS)) {
        db.createObjectStore(STORES.CLM_DRAFTS, { keyPath: 'id', autoIncrement: true });
      }
      // Phase N — Visit drafts (in-progress visits). keyPath='id' is a UUID
      // generated client-side; it doubles as session_group_id when the BDM
      // also runs a CLM presentation as part of the same encounter.
      if (!db.objectStoreNames.contains(STORES.VISIT_DRAFTS)) {
        db.createObjectStore(STORES.VISIT_DRAFTS, { keyPath: 'id' });
      }
      // Phase N — Visit photo blobs. keyPath='ref' = photo_<uuid>. The SW
      // opens this DB at replay time, reads each ref into a Blob, rebuilds
      // FormData, and replays the multipart POST. Index by draftId so we
      // can age-evict orphaned photos when their parent draft is deleted.
      if (!db.objectStoreNames.contains(STORES.VISIT_PHOTOS)) {
        const photoStore = db.createObjectStore(STORES.VISIT_PHOTOS, { keyPath: 'ref' });
        photoStore.createIndex('byDraft', 'draftId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Generic helpers ────────────────────────────────────────────────

async function putAll(storeName, items) {
  if (!items?.length) return;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  // Clear existing and replace with fresh data
  store.clear();
  items.forEach((item) => store.put(item));
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
  db.close();
}

async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function getOne(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const req = store.get(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function putOne(storeName, item) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(item);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
  db.close();
}

async function deleteOne(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
  db.close();
}

// ── Public API ─────────────────────────────────────────────────────

const offlineStore = {
  // ── Doctors ──────────────────────────────────────────────────
  async cacheDoctors(doctors) {
    try {
      await putAll(STORES.DOCTORS, doctors);
    } catch (err) {
      console.warn('[OfflineStore] Failed to cache doctors:', err);
    }
  },

  async getCachedDoctors() {
    try {
      return await getAll(STORES.DOCTORS);
    } catch {
      return [];
    }
  },

  // ── Products ─────────────────────────────────────────────────
  async cacheProducts(products) {
    try {
      await putAll(STORES.PRODUCTS, products);
    } catch (err) {
      console.warn('[OfflineStore] Failed to cache products:', err);
    }
  },

  async getCachedProducts() {
    try {
      return await getAll(STORES.PRODUCTS);
    } catch {
      return [];
    }
  },

  // ── Product Images (blob cache — survives S3 signed URL expiry) ──
  /**
   * Download a product image from its S3 signed URL and store the bytes
   * in IndexedDB keyed by productId. The URL will expire in 1 hour,
   * but the cached bytes persist indefinitely.
   *
   * @param {string} productId - The product's _id
   * @param {string} imageUrl  - Current S3 signed URL (valid for ~1 hour)
   */
  async cacheProductImage(productId, imageUrl) {
    if (!productId || !imageUrl) return;
    try {
      const response = await fetch(imageUrl, { mode: 'cors' });
      if (!response.ok) return;
      const blob = await response.blob();
      await putOne(STORES.PRODUCT_IMAGES, {
        productId,
        blob,
        mimeType: blob.type || 'image/jpeg',
        cachedAt: new Date().toISOString(),
        size: blob.size,
      });
    } catch (err) {
      console.warn(`[OfflineStore] Failed to cache image for product ${productId}:`, err);
    }
  },

  /**
   * Batch-cache product images. Only fetches images that aren't already cached
   * (or are older than 23 hours — just under the 24h S3 URL refresh cycle).
   *
   * @param {Array<{_id: string, image: string}>} products
   */
  async cacheProductImages(products) {
    if (!products?.length) return;
    const productsWithImages = products.filter((p) => p.image);
    // Fire-and-forget: don't block the UI
    for (const product of productsWithImages) {
      try {
        const existing = await getOne(STORES.PRODUCT_IMAGES, product._id);
        // Skip if already cached within the last 23 hours
        if (existing?.cachedAt) {
          const age = Date.now() - new Date(existing.cachedAt).getTime();
          if (age < 23 * 60 * 60 * 1000) continue;
        }
        await this.cacheProductImage(product._id, product.image);
      } catch {
        // Non-critical — continue with next product
      }
    }
  },

  /**
   * Get a cached product image as an object URL (for use in <img src>).
   * Returns null if not cached.
   *
   * @param {string} productId
   * @returns {Promise<string|null>} Object URL or null
   */
  async getProductImageUrl(productId) {
    try {
      const record = await getOne(STORES.PRODUCT_IMAGES, productId);
      if (!record?.blob) return null;
      return URL.createObjectURL(record.blob);
    } catch {
      return null;
    }
  },

  // ── CLM Drafts (offline sessions) ────────────────────────────
  async saveDraft(draft) {
    try {
      await putOne(STORES.CLM_DRAFTS, {
        ...draft,
        id: draft.id || Date.now(),
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[OfflineStore] Failed to save CLM draft:', err);
    }
  },

  async getDrafts() {
    try {
      return await getAll(STORES.CLM_DRAFTS);
    } catch {
      return [];
    }
  },

  async deleteDraft(id) {
    try {
      await deleteOne(STORES.CLM_DRAFTS, id);
    } catch (err) {
      console.warn('[OfflineStore] Failed to delete CLM draft:', err);
    }
  },

  // ── Phase N — Visit Drafts (in-progress offline visits) ─────────
  /**
   * Save a visit draft. `id` MUST be a stable UUID — both the visit_photos
   * blobs and the SW queue's session_group_id share this identifier.
   *
   * @param {object} draft - { id, doctorId, photoRefs, formFields, createdAt, updatedAt }
   */
  async saveVisitDraft(draft) {
    if (!draft?.id) throw new Error('Visit draft requires a stable id');
    try {
      await putOne(STORES.VISIT_DRAFTS, {
        ...draft,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[OfflineStore] Failed to save visit draft:', err);
    }
  },

  async getVisitDraft(id) {
    try {
      return await getOne(STORES.VISIT_DRAFTS, id);
    } catch {
      return null;
    }
  },

  async getVisitDrafts() {
    try {
      return await getAll(STORES.VISIT_DRAFTS);
    } catch {
      return [];
    }
  },

  async deleteVisitDraft(id) {
    try {
      await deleteOne(STORES.VISIT_DRAFTS, id);
      // Cascade: drop photos owned by this draft. Best-effort.
      try {
        const db = await openDB();
        const tx = db.transaction(STORES.VISIT_PHOTOS, 'readwrite');
        const idx = tx.objectStore(STORES.VISIT_PHOTOS).index('byDraft');
        const cursorReq = idx.openCursor(IDBKeyRange.only(id));
        await new Promise((resolve, reject) => {
          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              cursor.delete();
              cursor.continue();
            } else {
              resolve();
            }
          };
          cursorReq.onerror = () => reject(cursorReq.error);
        });
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = reject;
        });
        db.close();
      } catch (err) {
        console.warn('[OfflineStore] Failed to cascade-delete visit photos:', err);
      }
    } catch (err) {
      console.warn('[OfflineStore] Failed to delete visit draft:', err);
    }
  },

  // ── Phase N — Visit Photo Blobs (offline-captured proof) ─────────
  /**
   * Persist a captured photo Blob into IndexedDB. Returns the photo ref
   * (a `photo_<uuid>` string) which the caller stores on the draft so the
   * SW can rebuild FormData on replay.
   *
   * @param {Blob} blob - the captured photo bytes
   * @param {object} meta - { draftId, capturedAt, source, gps, hash, filename }
   * @returns {Promise<string>} the photo ref
   */
  async saveVisitPhoto(blob, meta = {}) {
    if (!blob) throw new Error('saveVisitPhoto requires a Blob');
    const ref = `${VISIT_PHOTO_REF_PREFIX}${
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`
    }`;
    await putOne(STORES.VISIT_PHOTOS, {
      ref,
      draftId: meta.draftId || null,
      blob,
      mimeType: blob.type || 'image/jpeg',
      size: blob.size,
      capturedAt: meta.capturedAt || new Date().toISOString(),
      source: meta.source || 'camera',
      gps: meta.gps || null,
      hash: meta.hash || null,
      filename: meta.filename || `${ref}.jpg`,
    });
    return ref;
  },

  /**
   * Get a cached visit photo as an object URL — for re-rendering the draft's
   * photo grid when the BDM reopens an in-progress visit.
   * @param {string} ref - photo_<uuid>
   * @returns {Promise<string|null>}
   */
  async getVisitPhotoUrl(ref) {
    try {
      const record = await getOne(STORES.VISIT_PHOTOS, ref);
      if (!record?.blob) return null;
      return URL.createObjectURL(record.blob);
    } catch {
      return null;
    }
  },

  async deleteVisitPhoto(ref) {
    try {
      await deleteOne(STORES.VISIT_PHOTOS, ref);
    } catch (err) {
      console.warn('[OfflineStore] Failed to delete visit photo:', err);
    }
  },
};

export { offlineStore, STORES };
export default offlineStore;
