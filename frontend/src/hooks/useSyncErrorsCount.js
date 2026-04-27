/**
 * useSyncErrorsCount — Phase N offline-first sprint
 *
 * Exposes the live `sync_errors` IndexedDB row count + a refresh function.
 * Re-fetches whenever the SW emits VIP_VISIT_DRAFT_LOST (live update) and
 * on a 30s polling interval (handles cross-tab writes from other surfaces).
 *
 * Lives in /hooks/ so the SyncErrorsTray.jsx component file can stay
 * component-only (lint react-refresh/only-export-components).
 */
import { useCallback, useEffect, useState } from 'react';
import offlineManager from '../utils/offlineManager';
import offlineStore from '../utils/offlineStore';

export default function useSyncErrorsCount() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const rows = await offlineStore.getSyncErrors();
      setCount(rows.length);
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = offlineManager.onVisitDraftLost(() => refresh());
    const t = setInterval(refresh, 30_000);
    return () => {
      unsub();
      clearInterval(t);
    };
  }, [refresh]);

  return { count, refresh };
}
