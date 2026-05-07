/**
 * useOfflineSyncListener — Phase N offline-first sprint (Apr 27 2026)
 *
 * One central place that wires the SW → page sync feedback loop:
 *   1. VIP_SYNC_COMPLETE  → toast "Synced N visits (~X MB)" + write a
 *                            sync_complete entry to the BDM's inbox
 *   2. VIP_VISIT_DRAFT_LOST → toast the failure + record a sync_errors row
 *                              in IndexedDB (drives the SyncErrorsTray badge)
 *                              + write a visit_draft_lost entry to the inbox
 *
 * Mounted ONCE — typically from EmployeeDashboard so BDMs always have it
 * loaded while they're working. Mounting it twice is safe (each mount adds
 * its own listeners + cleans up on unmount), but unnecessary.
 *
 * Why a hook and not auto-init from offlineManager.init():
 *   - The toast call needs a React render tree (react-hot-toast)
 *   - The inbox write call needs api.js (which assumes the SPA is mounted)
 *   - Tests / mocks can opt out by simply not rendering the dashboard
 *
 * Anti-pattern this avoids: scattering toast + inbox-write logic across
 * VisitLogger, NewVisitPage, EmployeeDashboard so each surface had to
 * know about every sync outcome. Now they all funnel through this hook.
 */
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import offlineManager from '../utils/offlineManager';
import offlineStore from '../utils/offlineStore';
import messageInboxService from '../services/messageInboxService';

function bytesHuman(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function dominantKindLabel(syncedKinds, total) {
  if (!syncedKinds || typeof syncedKinds !== 'object') {
    return total === 1 ? 'item' : 'items';
  }
  const entries = Object.entries(syncedKinds).filter(([, n]) => Number(n) > 0);
  if (entries.length === 1) {
    const [k, n] = entries[0];
    if (k === 'visit') return Number(n) === 1 ? 'visit' : 'visits';
    if (k === 'clm') return Number(n) === 1 ? 'CLM session' : 'CLM sessions';
    if (k === 'commLog') return Number(n) === 1 ? 'comm log' : 'comm logs';
  }
  return total === 1 ? 'item' : 'items';
}

export default function useOfflineSyncListener({ enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const unsubSyncComplete = offlineManager.onSyncComplete(({ synced, syncedKinds, bytes, remaining, mergeRedirects, completedAt }) => {
      if (!synced || synced <= 0) return; // empty replay — no toast needed
      const kindLabel = dominantKindLabel(syncedKinds, synced);
      const sizeText = bytes > 0 ? ` (~${bytesHuman(bytes)})` : '';
      toast.success(`Synced ${synced} ${kindLabel}${sizeText}`, {
        duration: 5000,
        icon: '☁',
      });
      // Phase A.5.6 follow-up — the offline-replay path can hit the merge
      // resolver in visitController (BDM was offline while admin merged
      // duplicate VIP Clients; cached doctorId points at the soft-deleted
      // loser). Surface each redirect so the BDM understands why the doctor
      // list shifted after sync. One info toast per redirect, capped via
      // SW-side MAX_MERGE_REDIRECTS so noisy sweeps don't spam.
      if (Array.isArray(mergeRedirects) && mergeRedirects.length > 0) {
        const fallback = 'A queued visit was logged against the consolidated VIP Client record (the original was merged).';
        mergeRedirects.forEach((r) => {
          if (!r) return;
          toast(r.message || fallback, {
            duration: 7000,
            icon: 'ℹ️',
          });
          // Best-effort audit trail to the inbox so admin can review later.
          messageInboxService.recordSystemEvent({
            event_type: 'visit_merge_redirected',
            payload: { from: r.from, to: r.to, offline_replay: !!r.offline_replay },
          }).catch(() => { /* best-effort */ });
        });
      }
      // Best-effort inbox audit. The toast already informed the BDM; if the
      // network call to write the inbox entry fails (rare — they JUST came
      // online to trigger the sync) we silently skip it.
      messageInboxService.recordSystemEvent({
        event_type: 'sync_complete',
        payload: {
          synced,
          syncedKinds,
          bytes,
          remaining,
          merge_redirect_count: Array.isArray(mergeRedirects) ? mergeRedirects.length : 0,
          completedAt,
        },
      }).catch(() => { /* best-effort */ });
    });

    const unsubDraftLost = offlineManager.onVisitDraftLost(async ({ message, draftId }) => {
      const reason = String(message || 'Photos missing — draft could not be replayed.');
      toast.error(`Offline visit lost — ${reason}`, { duration: 7000 });
      // Persist a row to sync_errors so the badge / drawer survives reload.
      try {
        await offlineStore.recordSyncError({
          kind: 'visit_draft_lost',
          draftId: draftId || null,
          message: reason,
        });
      } catch { /* drawer is best-effort */ }
      // Self-DM into the inbox so there's a permanent audit trail.
      messageInboxService.recordSystemEvent({
        event_type: 'visit_draft_lost',
        payload: { draft_id: draftId || '', reason },
      }).catch(() => { /* best-effort */ });
    });

    return () => {
      unsubSyncComplete();
      unsubDraftLost();
    };
  }, [enabled]);
}
