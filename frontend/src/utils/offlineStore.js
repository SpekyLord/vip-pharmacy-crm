/**
 * Offline Store — IndexedDB-backed local cache for BDM offline data
 *
 * Stores:
 *   - doctors:  Cached doctor list for offline doctor selection
 *   - products: Cached product list for offline product selection
 *   - clmDraft: In-progress CLM session data (before sync)
 *
 * This is NOT a replacement for the API — it's a fallback cache.
 * When online, the app always fetches from the API and updates the cache.
 * When offline, the app reads from this cache.
 */

const DB_NAME = 'vip-offline-data';
const DB_VERSION = 1;

const STORES = {
  DOCTORS: 'doctors',
  PRODUCTS: 'products',
  CLM_DRAFTS: 'clm_drafts',
};

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
      if (!db.objectStoreNames.contains(STORES.CLM_DRAFTS)) {
        db.createObjectStore(STORES.CLM_DRAFTS, { keyPath: 'id', autoIncrement: true });
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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

  // ── CLM Drafts (offline sessions) ────────────────────────────
  async saveDraft(draft) {
    try {
      await putOne(STORES.CLM_DRAFTS, {
        ...draft,
        id: draft.id || Date.now(),
        savedAt: new Date().toISOString(),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
      console.warn('[OfflineStore] Failed to delete CLM draft:', err);
    }
  },
};

export { offlineStore, STORES };
export default offlineStore;
