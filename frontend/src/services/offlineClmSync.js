/**
 * Offline CLM Sync Service
 *
 * Replays CLM session drafts saved in IndexedDB when the BDM comes back online.
 * Each draft is a complete session record (doctor, products, slides, outcome).
 *
 * Flow:
 *   1. BDM presents offline → draft saved to IndexedDB with idempotencyKey
 *   2. BDM comes back online → offlineManager triggers sync
 *   3. This service reads drafts, creates real sessions via API, then deletes drafts
 *
 * Conflict Resolution:
 *   - Each draft carries an `idempotencyKey` (generated at creation time)
 *   - On sync, we pass the key to the server via X-Idempotency-Key header
 *   - If the server already has a session with this key, it returns 409 → we delete the draft
 *   - If the server returns 401 → token expired → stop syncing, notify user
 *   - If the server returns 4xx (other) → client error → delete draft to prevent infinite retry
 *   - If the server returns 5xx → server error → leave draft for next sync
 *
 * Called from:
 *   - offlineManager.onStatusChange (when isOnline becomes true)
 *   - Manual "Sync Now" button
 */
import clmService from './clmService';
import { offlineStore } from '../utils/offlineStore';

let syncing = false;

/**
 * Replay all offline CLM drafts to the server.
 * @returns {Promise<{synced: number, failed: number, authRequired: boolean}>}
 */
async function syncOfflineDrafts() {
  if (syncing) return { synced: 0, failed: 0, authRequired: false };
  if (!navigator.onLine) return { synced: 0, failed: 0, authRequired: false };

  syncing = true;
  let synced = 0;
  let failed = 0;
  let authRequired = false;

  try {
    const drafts = await offlineStore.getDrafts();
    if (!drafts.length) return { synced: 0, failed: 0, authRequired: false };

    for (const draft of drafts) {
      try {
        // Step 1: Create the session on the server
        // Pass idempotency key so server can detect duplicates
        const startRes = await clmService.startSession(
          draft.doctorId,
          draft.location || {},
          draft.productIds || [],
          draft.idempotencyKey || null
        );
        const sessionId = startRes.data?._id;
        if (!sessionId) throw new Error('No session ID returned');

        // Step 2: Record slide events if any
        if (draft.slideEvents?.length) {
          try {
            await clmService.recordSlideEvents(sessionId, draft.slideEvents);
          } catch {
            // Non-critical — slide analytics can be lost
          }
        }

        // Step 3: End the session with outcome data
        await clmService.endSession(sessionId, {
          ...(draft.endForm || {}),
          productsPresented: draft.productsPresented || [],
        });

        // Step 4: Remove the draft from IndexedDB
        await offlineStore.deleteDraft(draft.id);
        synced++;
      } catch (err) {
        const status = err?.response?.status;

        // 401 = auth expired — stop syncing entirely
        if (status === 401) {
          authRequired = true;
          console.warn('[OfflineCLMSync] Auth expired — stopping sync. User must re-login.');
          break;
        }

        // 409 = conflict/duplicate — server already has this session
        // This happens when the idempotency key matches an existing session
        if (status === 409) {
          console.info('[OfflineCLMSync] Duplicate detected for draft:', draft.id, '— removing.');
          await offlineStore.deleteDraft(draft.id);
          synced++; // Count as synced since server has the data
          continue;
        }

        // 4xx (other) = client error — remove to prevent infinite retry
        if (status && status >= 400 && status < 500) {
          console.warn('[OfflineCLMSync] Client error for draft:', draft.id, status, '— removing.');
          await offlineStore.deleteDraft(draft.id);
          failed++;
          continue;
        }

        // 5xx or network error — leave in queue for next sync
        console.warn('[OfflineCLMSync] Failed to sync draft:', draft.id, err);
        failed++;

        // If we lost connectivity mid-sync, stop
        if (!navigator.onLine) break;
      }
    }
  } finally {
    syncing = false;
  }

  return { synced, failed, authRequired };
}

/**
 * Get count of pending offline drafts.
 * @returns {Promise<number>}
 */
async function getPendingCount() {
  try {
    const drafts = await offlineStore.getDrafts();
    return drafts.length;
  } catch {
    return 0;
  }
}

export { syncOfflineDrafts, getPendingCount };
export default { syncOfflineDrafts, getPendingCount };
