/**
 * Offline CLM Sync Service
 *
 * Replays CLM session drafts saved in IndexedDB when the BDM comes back online.
 * Each draft is a complete session record (doctor, products, slides, outcome).
 *
 * Flow:
 *   1. BDM presents offline → draft saved to IndexedDB
 *   2. BDM comes back online → offlineManager triggers sync
 *   3. This service reads drafts, creates real sessions via API, then deletes drafts
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
 * @returns {Promise<{synced: number, failed: number}>}
 */
async function syncOfflineDrafts() {
  if (syncing) return { synced: 0, failed: 0 };
  if (!navigator.onLine) return { synced: 0, failed: 0 };

  syncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const drafts = await offlineStore.getDrafts();
    if (!drafts.length) return { synced: 0, failed: 0 };

    for (const draft of drafts) {
      try {
        // Step 1: Create the session on the server
        const startRes = await clmService.startSession(
          draft.doctorId,
          draft.location || {},
          draft.productIds || []
        );
        const sessionId = startRes.data?._id;
        if (!sessionId) throw new Error('No session ID returned');

        // Step 2: Record slide events if any
        if (draft.slideEvents?.length) {
          try {
            await clmService.recordSlideEvents(sessionId, draft.slideEvents);
          } catch {
            // Non-critical
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
        // eslint-disable-next-line no-console
        console.warn('[OfflineCLMSync] Failed to sync draft:', draft.id, err);
        failed++;
        // If we get a network error, stop trying
        if (!navigator.onLine) break;
      }
    }
  } finally {
    syncing = false;
  }

  return { synced, failed };
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
