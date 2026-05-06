/**
 * PendingCapturesPicker — Phase P1.2 Slice 1 (May 2026).
 *
 * Reusable proxy-side drawer for ERP entry pages. Lives next to the
 * gallery-upload button on /erp/expenses, /erp/sales/entry, /erp/collection,
 * /erp/grn etc. Lets the proxy pull photos the BDM already snapped via
 * Capture Hub (or Quick Capture as UNCATEGORIZED) without re-uploading
 * from gallery.
 *
 * Why this matters: today the proxy can VIEW BDM captures at /erp/proxy-queue
 * but can't REUSE them when entering the ERP doc — they'd right-click → save
 * → re-upload. This component closes that loop. The proxy clicks the button,
 * picks one or more captures, and the drawer fetches the signed S3 URLs into
 * Blobs → File objects → hands them to the host page's existing upload
 * pipeline (FormData / batchFiles state / scanCSI etc).
 *
 * Design choices:
 *   - Returns File objects (not URLs) so existing FormData-based upload code
 *     on the host page works untouched. Same downstream code path as gallery.
 *   - Selection is multi-pick by default (proxy reconciles a batch of ORs at
 *     once). Single-pick mode for one-off pages via maxSelect=1.
 *   - workflowTypes is an array so /erp/expenses (EXPENSE + FUEL_ENTRY +
 *     UNCATEGORIZED), /erp/collection (COLLECTION + UNCATEGORIZED), etc.
 *   - bdmId narrows to one BDM when the host page knows whose docs it's
 *     entering (proxy persona-pair flows). Omit for a cross-BDM picker.
 *   - The captures stay PENDING_PROXY in the queue until the host page calls
 *     pickupCapture + completeCapture(linked_doc_kind, linked_doc_id) on doc
 *     submit — the picker doesn't auto-flip status (host page knows which
 *     doc was created and threads the link).
 *
 * Sub-permission gate: button is rendered unconditionally; the host page
 * is responsible for only showing it to users with PROXY_PULL_CAPTURE
 * (or admin/finance/president). Server-side getProxyQueue still enforces
 * canProxyEntry() so even if the button is shown, the API will 403 cleanly.
 */
import { useState, useCallback, useEffect } from 'react';
import { Camera, X, RefreshCw, Inbox, ImageOff } from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../hooks/useCaptureSubmissions';
import '../../styles/pending-captures-picker.css';

export default function PendingCapturesPicker({
  workflowTypes = [],
  // Phase P1.2 Phase 1 (May 06 2026) — optional sub_type narrowing per
  // workflow_type. Shape: { COLLECTION: 'CWT' } means "when iterating
  // workflowTypes for COLLECTION, also pass sub_type=CWT to the queue
  // query." Workflow_types not present in this map fall through with no
  // sub_type filter (legacy behaviour). Used by Bir2307InboundPage to
  // narrow COLLECTION captures to just CWT (vs CR/DEPOSIT/PAID_CSI), since
  // CWT was collapsed from a top-level workflow_type into a sub_type of
  // COLLECTION this phase.
  subTypeFilter = {},
  bdmId,
  onPick,
  buttonLabel = 'From BDM Captures',
  buttonStyle,
  maxSelect = 20,
  // Phase P1.2 Slice 7-extension Round 2A — when true, skip the
  // fetch(signedS3Url) → Blob → File pipeline that the OCR scan modals need
  // and yield the raw capture rows via meta.captures instead. The caller
  // (SalesList per-row Attach CSI) writes the artifact's S3 URL straight
  // into the target field — no re-upload, no in-browser cross-origin fetch
  // (which the private bucket's missing CORS allowlist would block on
  // `localhost:5173` and any non-S3-origin caller).
  skipFetch = false,
}) {
  const { getProxyQueue } = useCaptureSubmissions();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [pickingIn, setPickingIn] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Backend filters by single workflow_type, so iterate. Typical entry
      // pages pass 1-3 types; merge + dedupe by _id; sort newest first.
      const merged = [];
      const seen = new Set();
      for (const wt of workflowTypes) {
        const params = {
          status: ['PENDING_PROXY', 'IN_PROGRESS'],
          workflow_type: wt,
          limit: 100,
          sort_by: 'created_at',
          sort_dir: 'desc',
        };
        if (bdmId) params.bdm_id = bdmId;
        // Phase P1.2 Phase 1 (May 06 2026) — sub_type narrowing only fires
        // when the caller mapped the workflow_type. Other workflow_types in
        // the same picker (e.g. UNCATEGORIZED catch-all) iterate without a
        // sub_type filter so the caller can blend a strictly-narrowed feed
        // (COLLECTION+CWT) with a broad fallback (UNCATEGORIZED).
        if (subTypeFilter && subTypeFilter[wt]) {
          params.sub_type = subTypeFilter[wt];
        }
        const res = await getProxyQueue(params);
        (res?.data || []).forEach((d) => {
          if (!seen.has(d._id)) { seen.add(d._id); merged.push(d); }
        });
      }
      merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(merged);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load BDM captures');
    } finally {
      setLoading(false);
    }
  }, [getProxyQueue, workflowTypes, bdmId, subTypeFilter]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggleSelect = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= maxSelect) {
          toast(`At most ${maxSelect} captures per attach`, { icon: '⚠️' });
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }, [maxSelect]);

  const handleConfirm = useCallback(async () => {
    if (selected.size === 0) {
      toast.error('Pick at least one capture');
      return;
    }
    setPickingIn(true);
    try {
      const picked = items.filter((it) => selected.has(it._id));

      // Phase P1.2 Slice 7-extension Round 2A — skipFetch path. Caller takes
      // the raw capture rows (with their already-signed S3 URL inside
      // captured_artifacts[i].url) and writes the bare URL directly into
      // the target document field (e.g. SalesLine.csi_received_photo_url).
      // The private bucket's missing CORS allowlist would block fetch()
      // from a browser origin, but a server-side read path's signUrl()
      // re-signs at consumption time, so persisting the URL string only
      // is sufficient — no client-side fetch needed.
      if (skipFetch) {
        const captureIds = picked.map((it) => it._id);
        onPick([], { capture_ids: captureIds, captures: picked });
        toast.success(`Attached ${picked.length} capture${picked.length === 1 ? '' : 's'} from BDM queue`);
        setOpen(false);
        setSelected(new Set());
        return;
      }

      const files = [];
      const captureIds = [];
      for (const it of picked) {
        captureIds.push(it._id);
        for (const a of it.captured_artifacts || []) {
          if (!a?.url) continue;
          // Skip legacy data URLs (Phase P1.1 placeholders) — they would
          // never have been uploaded via Quick Capture so the picker
          // shouldn't surface them.
          if (a.url.startsWith('data:')) continue;
          let blob;
          try {
            const blobRes = await fetch(a.url);
            if (!blobRes.ok) {
              console.warn('[PendingCapturesPicker] fetch failed', a.url, blobRes.status);
              continue;
            }
            blob = await blobRes.blob();
          } catch (e) {
            // S3 CORS or signed-URL expiry — surface but don't abort the
            // whole pick. The proxy can fall back to gallery upload for
            // the missing photo.
            console.warn('[PendingCapturesPicker] fetch error', e.message);
            continue;
          }
          const fname = (a.key || `capture-${it._id}.jpg`).split('/').pop() || 'capture.jpg';
          files.push(new File([blob], fname, { type: blob.type || 'image/jpeg' }));
        }
      }
      if (files.length === 0) {
        toast.error('No fetchable photos in the selection');
        return;
      }
      onPick(files, { capture_ids: captureIds });
      toast.success(`Attached ${files.length} photo${files.length === 1 ? '' : 's'} from BDM captures`);
      setOpen(false);
      setSelected(new Set());
    } catch (err) {
      console.error('[PendingCapturesPicker] confirm error', err);
      toast.error(err?.message || 'Failed to fetch capture photos');
    } finally {
      setPickingIn(false);
    }
  }, [items, selected, onPick, skipFetch]);

  const defaultButtonStyle = {
    padding: '8px 16px',
    borderRadius: 6,
    background: '#0ea5e9',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={buttonStyle || defaultButtonStyle}
        type="button"
        data-testid="pending-captures-picker-btn"
      >
        <Inbox size={14} />
        {buttonLabel}
      </button>

      {open && (
        <div className="pcp-backdrop" onClick={() => setOpen(false)}>
          <div className="pcp-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="pcp-header">
              <div>
                <h3 className="pcp-title">
                  <Inbox size={18} /> Pending BDM Captures
                </h3>
                <div className="pcp-subtitle">
                  {loading ? 'Loading…' : `${items.length} pending — click rows to select`}
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="pcp-close" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="pcp-body">
              {loading && (
                <div className="pcp-loading">
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </div>
              )}
              {!loading && items.length === 0 && (
                <div className="pcp-empty">
                  <Camera size={28} />
                  <div className="pcp-empty-title">No pending captures</div>
                  <div className="pcp-empty-hint">Use the gallery upload as fallback.</div>
                </div>
              )}
              {!loading && items.map((it) => {
                const isSelected = selected.has(it._id);
                const firstPhoto = it.captured_artifacts?.[0];
                const isLegacyDataUrl = firstPhoto?.url?.startsWith?.('data:');
                return (
                  <button
                    key={it._id}
                    onClick={() => toggleSelect(it._id)}
                    className={`pcp-row ${isSelected ? 'selected' : ''}`}
                    type="button"
                  >
                    <div className="pcp-thumb-wrap">
                      {isLegacyDataUrl ? (
                        <ImageOff size={20} aria-label="Legacy data URL — re-upload required" />
                      ) : firstPhoto?.url ? (
                        <img src={firstPhoto.url} alt="" className="pcp-thumb" />
                      ) : (
                        <Camera size={20} />
                      )}
                      {it.captured_artifacts?.length > 1 && (
                        <span className="pcp-thumb-count">+{it.captured_artifacts.length - 1}</span>
                      )}
                    </div>
                    <div className="pcp-row-meta">
                      <div className="pcp-row-bdm">{it.bdm_id?.name || 'BDM'}</div>
                      <div className="pcp-row-detail">
                        <span className="pcp-row-wf">{it.workflow_type.replace(/_/g, ' ')}</span>
                        {it.sub_type ? <span className="pcp-row-sub"> · {it.sub_type.replace(/_/g, ' ')}</span> : null}
                        {it.amount_declared ? <span> · ₱{Number(it.amount_declared).toLocaleString()}</span> : null}
                      </div>
                      <div className="pcp-row-time">
                        {new Date(it.created_at).toLocaleString()}
                        {Number.isFinite(it.age_hours) ? ` · ${it.age_hours}h ago` : ''}
                      </div>
                      {it.bdm_notes ? <div className="pcp-row-notes">“{it.bdm_notes}”</div> : null}
                    </div>
                    <div className={`pcp-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && '✓'}
                    </div>
                  </button>
                );
              })}
            </div>

            {items.length > 0 && (
              <div className="pcp-footer">
                <span className="pcp-footer-count">{selected.size} selected</span>
                <button
                  onClick={handleConfirm}
                  disabled={selected.size === 0 || pickingIn}
                  className="pcp-confirm"
                  type="button"
                >
                  {pickingIn ? 'Fetching…' : `Attach ${selected.size || ''}`.trim()}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
