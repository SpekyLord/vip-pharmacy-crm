/**
 * CsiPhoto — robust thumbnail with onError fallback for S3 signed URLs.
 *
 * S3 signed URLs expire after 1 hour (per project config). When a stale URL
 * fails to load, the browser default is to show alt text + a broken-image
 * icon. This component swaps to a clear "expired" placeholder instead,
 * with a hint that the attachment is still on file (can be re-fetched
 * server-side).
 *
 * Shared by OpeningArEntry + OpeningArList (Option B split).
 */
import { useState, useEffect } from 'react';

export default function CsiPhoto({ url, attachmentId, onReupload, size = 56 }) {
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [url]);

  const boxStyle = { width: size, height: size, borderRadius: 8 };
  if (!url) {
    return (
      <div
        className="csi-photo-placeholder"
        style={boxStyle}
        title={onReupload ? 'No photo — click to upload' : 'No photo attached'}
        onClick={onReupload}
      >
        <span style={{ fontSize: size * 0.4 }}>📷</span>
      </div>
    );
  }
  if (errored) {
    return (
      <div
        className="csi-photo-placeholder csi-photo-expired"
        style={boxStyle}
        title={attachmentId
          ? `Photo URL expired (S3 signed URL TTL = 1h). Attachment is still on file (id: ${attachmentId}).`
          : 'Photo could not be loaded.'}
        onClick={onReupload}
      >
        <span style={{ fontSize: size * 0.35, lineHeight: 1 }}>⏱</span>
        <span style={{ fontSize: 9, marginTop: 2 }}>expired</span>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Open full photo">
      <img
        src={url}
        alt="CSI"
        className="csi-photo-thumb"
        style={boxStyle}
        onError={() => setErrored(true)}
      />
    </a>
  );
}

// Shared styles for CsiPhoto (class-based so pages need only inject once).
// OpeningArEntry and OpeningArList both include this in their page-scoped
// <style> block so the component renders correctly.
export const csiPhotoStyles = `
  .csi-photo-thumb { object-fit: cover; border: 1px solid var(--erp-border, #dbe4f0); cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .csi-photo-thumb:hover { border-color: var(--erp-accent, #1e5eff); box-shadow: 0 2px 8px rgba(30,94,255,0.18); }
  .csi-photo-placeholder { border: 1px dashed var(--erp-border, #dbe4f0); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--erp-muted, #5f7188); cursor: pointer; background: var(--erp-bg, #f4f7fb); transition: border-color 0.15s; }
  .csi-photo-placeholder:hover { border-color: var(--erp-accent, #1e5eff); color: var(--erp-accent, #1e5eff); }
  .csi-photo-expired { border-style: solid; border-color: #fcd34d; background: #fffbeb; color: #92400e; }
`;
