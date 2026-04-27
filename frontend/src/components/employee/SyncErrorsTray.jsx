/**
 * SyncErrorsTray — Phase N offline-first sprint (Apr 27 2026)
 *
 * Drawer + badge for queued offline drafts that could not be replayed.
 * Driven by the `sync_errors` store in IndexedDB (offlineStore v4). Each
 * row is a record of a VIP_VISIT_DRAFT_LOST event the SW emitted plus
 * any future client-side write that wants to surface a failure.
 *
 * Composition:
 *   - <SyncErrorsBadge /> — compact pill that shows on EmployeeDashboard
 *     navbar; click to open the drawer
 *   - <SyncErrorsDrawer /> — modal drawer listing every error with
 *     [Retry] / [Discard] / [Discard all] actions
 *
 * Retry behaviour: today, "Retry" simply nukes the row and asks the BDM
 * to re-capture. The original visit-photo blobs are gone by definition
 * (that's why we got VIP_VISIT_DRAFT_LOST in the first place); a real
 * "retry" would require re-running the camera capture flow. We surface
 * the blocking reason in the row instead so the BDM knows what to do.
 *
 * Inbox audit: every error is auto-DM'd to the BDM's inbox via
 * useOfflineSyncListener. The drawer's "Discard" action just clears the
 * local row — the inbox audit trail stays intact.
 *
 * Why a separate drawer + badge rather than just hijacking the inbox:
 *   - The inbox is shared across BDM + Admin contexts and lives behind a
 *     full-page route. The badge here keeps the count visible at a glance.
 *   - Sync errors are device-local (the offline drafts never reached the
 *     server); discarding them is a per-device decision, not a per-user
 *     archive.
 */
import { useEffect, useState, useCallback } from 'react';
import offlineStore from '../../utils/offlineStore';
import useSyncErrorsCount from '../../hooks/useSyncErrorsCount';

const styles = `
  .sync-err-badge { display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 999px; background: #fef2f2;
    color: #991b1b; border: 1px solid #fecaca; font-size: 12px;
    font-weight: 600; cursor: pointer; }
  .sync-err-badge:hover { background: #fee2e2; }
  .sync-err-badge .sync-err-dot { width: 8px; height: 8px; border-radius: 50%;
    background: #dc2626; display: inline-block; }
  .sync-err-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4);
    z-index: 1000; display: flex; align-items: stretch; justify-content: flex-end; }
  .sync-err-drawer { width: min(440px, 100vw); background: #fff;
    box-shadow: -4px 0 20px rgba(0,0,0,.15); display: flex; flex-direction: column; }
  .sync-err-drawer header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center; }
  .sync-err-drawer header h3 { margin: 0; font-size: 16px; color: #111827; }
  .sync-err-drawer .close-btn { background: none; border: 0; font-size: 22px;
    cursor: pointer; color: #6b7280; line-height: 1; }
  .sync-err-drawer .body { flex: 1; overflow: auto; padding: 12px 16px; }
  .sync-err-row { padding: 12px; border: 1px solid #fee2e2; border-radius: 8px;
    background: #fff7f7; margin-bottom: 10px; }
  .sync-err-row .kind { font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.4px; color: #991b1b; font-weight: 700; }
  .sync-err-row .msg { font-size: 13px; color: #1f2937; margin: 4px 0; }
  .sync-err-row .meta { font-size: 11px; color: #6b7280; }
  .sync-err-row .actions { margin-top: 8px; display: flex; gap: 6px; }
  .sync-err-row .actions button { font-size: 12px; padding: 4px 10px;
    border-radius: 6px; border: 1px solid #d1d5db; background: #fff;
    cursor: pointer; }
  .sync-err-row .actions button.danger { color: #991b1b; border-color: #fca5a5; }
  .sync-err-empty { text-align: center; padding: 32px; color: #9ca3af;
    font-size: 13px; }
  .sync-err-drawer footer { padding: 12px 20px; border-top: 1px solid #e5e7eb;
    display: flex; gap: 8px; justify-content: space-between; align-items: center; }
  .sync-err-drawer footer .left-text { font-size: 11px; color: #6b7280; }
  .sync-err-drawer footer button.danger-text { color: #991b1b; background: transparent;
    border: 0; cursor: pointer; font-size: 12px; }
`;

function fmtAge(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const KIND_LABELS = {
  visit_draft_lost: 'Visit photos lost',
  sync_error: 'Sync error',
};

export function SyncErrorsBadge({ onClick }) {
  const { count } = useSyncErrorsCount();
  if (count <= 0) return null;
  return (
    <>
      <style>{styles}</style>
      <button
        type="button"
        className="sync-err-badge"
        onClick={onClick}
        aria-label={`${count} sync error${count === 1 ? '' : 's'} — tap to review`}
      >
        <span className="sync-err-dot" />
        Sync errors ({count})
      </button>
    </>
  );
}

export function SyncErrorsDrawer({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await offlineStore.getSyncErrors();
      setRows(list);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleDiscard = async (id) => {
    setBusy(true);
    try {
      await offlineStore.deleteSyncError(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardAll = async () => {
    if (!rows.length) return;
    if (!window.confirm(`Discard all ${rows.length} sync errors? Inbox audit trail will be preserved.`)) return;
    setBusy(true);
    try {
      await offlineStore.clearAllSyncErrors();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <style>{styles}</style>
      <div
        className="sync-err-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Sync errors"
        onClick={(e) => { if (e.target.classList.contains('sync-err-overlay')) onClose(); }}
      >
        <div className="sync-err-drawer">
          <header>
            <h3>Sync Errors ({rows.length})</h3>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Close">×</button>
          </header>
          <div style={{
            padding: '10px 16px',
            background: '#fff7ed',
            borderBottom: '1px solid #fed7aa',
            fontSize: 12,
            color: '#7c2d12',
            lineHeight: 1.5,
          }}>
            <strong>What is this?</strong> Each row is an offline visit draft that could not be replayed when connectivity returned (typically because the browser cleared its blob storage between capture and sync). Discarding clears the local row but leaves a copy in your Inbox so admin can audit. There is no Retry — the original photos are gone, so re-capture from the New Visit page.
          </div>
          <div className="body">
            {rows.length === 0 ? (
              <div className="sync-err-empty">No outstanding sync errors. Your offline drafts are syncing cleanly.</div>
            ) : rows.map((row) => (
              <div key={row.id} className="sync-err-row">
                <div className="kind">{KIND_LABELS[row.kind] || row.kind || 'Error'}</div>
                <div className="msg">{row.message || 'Unknown sync failure.'}</div>
                <div className="meta">
                  {row.doctorName ? `${row.doctorName} • ` : ''}
                  {row.draftId ? `ref: ${row.draftId.slice(0, 8)} • ` : ''}
                  {fmtAge(row.createdAt)}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => handleDiscard(row.id)}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
          <footer>
            <div className="left-text">A copy is also in your inbox.</div>
            {rows.length > 0 && (
              <button type="button" className="danger-text" onClick={handleDiscardAll} disabled={busy}>
                Discard all
              </button>
            )}
          </footer>
        </div>
      </div>
    </>
  );
}

export default function SyncErrorsTray() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SyncErrorsBadge onClick={() => setOpen(true)} />
      <SyncErrorsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
