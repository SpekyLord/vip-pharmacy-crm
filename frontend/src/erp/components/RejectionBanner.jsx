/**
 * RejectionBanner — Phase G6
 *
 * Contractor-facing banner that surfaces an approver's rejection reason and offers a
 * Fix & Resubmit path. One component, lookup-driven via MODULE_REJECTION_CONFIG so the
 * per-module quirks (ERROR vs REJECTED vs RETURNED, rejection_reason vs return_reason)
 * are handled by the lookup row, not by the calling page.
 *
 *   <RejectionBanner
 *     row={doc}                         // the document {status, rejection_reason|return_reason, _id}
 *     moduleKey="SALES"                 // canonical MODULE_DEFAULT_ROLES code
 *     variant="row" | "page"            // row = inline compact; page = full banner above form
 *     onResubmit={(row) => navigate(editRoute)}   // optional — button hidden if omitted
 *     docLabel="CSI-1234"               // optional heading suffix
 *   />
 *
 * Renders null if:
 *   - moduleKey missing or config not seeded yet (safe for subscribers pre-seed)
 *   - row.status does not match config.rejected_status (row isn't rejected)
 *   - row missing or row[config.reason_field] is empty (nothing to surface)
 *
 * a11y: role="alert" + aria-live="polite" so screen readers announce the rejection
 * without stealing focus. Banner styling mirrors WorkflowGuide.jsx conventions
 * (inline <style> block, dark-mode support, mobile-responsive).
 */
import { useRef, useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import { useRejectionConfig } from '../hooks/useRejectionConfig';
import { useAiCoworkFeature } from '../hooks/useAiCoworkFeature';

const bannerStyles = `
  .rjb { border-radius: 10px; padding: 12px 14px; margin: 0 0 12px; position: relative; font-size: 13px; line-height: 1.5; display: flex; gap: 10px; align-items: flex-start; }
  .rjb-row { padding: 6px 10px; font-size: 12px; line-height: 1.4; margin: 2px 0; border-radius: 8px; display: inline-flex; gap: 6px; align-items: center; }
  .rjb-danger { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  .rjb-warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
  .rjb-icon { flex-shrink: 0; margin-top: 1px; }
  .rjb-body { flex: 1; min-width: 0; }
  .rjb-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; display: flex; gap: 6px; flex-wrap: wrap; align-items: baseline; }
  .rjb-title-label { opacity: 0.75; font-weight: 500; font-size: 11px; }
  .rjb-reason { word-break: break-word; overflow-wrap: break-word; }
  .rjb-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
  .rjb-btn { display: inline-flex; align-items: center; gap: 4px; padding: 5px 12px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; font-weight: 600; }
  .rjb-btn-primary { background: #dc2626; color: #fff; }
  .rjb-btn-primary:hover { background: #b91c1c; }
  .rjb-btn-primary.warning { background: #d97706; }
  .rjb-btn-primary.warning:hover { background: #b45309; }
  .rjb-btn svg { width: 12px; height: 12px; }
  .rjb-slot { display: inline-flex; gap: 4px; }
  body.dark-mode .rjb-danger { background: #7f1d1d33; border-color: #b91c1c; color: #fecaca; }
  body.dark-mode .rjb-warning { background: #78350f33; border-color: #b45309; color: #fde68a; }
  @media(max-width: 600px) {
    .rjb { font-size: 12px; padding: 10px 12px; }
    .rjb-row { font-size: 11px; }
    .rjb-btn { width: 100%; justify-content: center; }
  }
`;

function RejectionBanner({ row, moduleKey, variant = 'page', onResubmit, docLabel, children }) {
  const { config } = useRejectionConfig(moduleKey);
  const styleInjected = useRef(false);

  useEffect(() => {
    if (styleInjected.current) return;
    if (typeof document !== 'undefined' && !document.getElementById('rjb-styles')) {
      const tag = document.createElement('style');
      tag.id = 'rjb-styles';
      tag.textContent = bannerStyles;
      document.head.appendChild(tag);
    }
    styleInjected.current = true;
  }, []);

  if (!config || !row) return null;
  if (row.status !== config.rejected_status) return null;

  const reason = row[config.reason_field];
  if (!reason) return null;

  const tone = config.banner_tone === 'warning' ? 'warning' : 'danger';
  const resubmitEnabled = config.resubmit_allowed && typeof onResubmit === 'function' &&
    (!config.editable_statuses?.length || config.editable_statuses.includes(row.status));

  // Compact row variant — fits inside a table cell. No action button (use docLabel +
  // rely on row's existing edit control). Designed to mirror GrnEntry.jsx:637-638 style
  // while still being lookup-driven.
  if (variant === 'row') {
    return (
      <span
        className={`rjb-row rjb-${tone}`}
        role="alert"
        aria-live="polite"
        title={reason}
      >
        <AlertTriangle size={12} className="rjb-icon" />
        <span className="rjb-reason">{reason}</span>
      </span>
    );
  }

  return (
    <div className={`rjb rjb-${tone}`} role="alert" aria-live="polite">
      <AlertTriangle size={18} className="rjb-icon" />
      <div className="rjb-body">
        <div className="rjb-title">
          <span>This document was rejected{docLabel ? ` — ${docLabel}` : ''}</span>
          {config.description && <span className="rjb-title-label">({config.description})</span>}
        </div>
        <div className="rjb-reason">{reason}</div>
        {(resubmitEnabled || children) && (
          <div className="rjb-actions">
            {resubmitEnabled && (
              <button
                type="button"
                className={`rjb-btn rjb-btn-primary ${tone === 'warning' ? 'warning' : ''}`}
                onClick={() => onResubmit(row)}
              >
                <RotateCcw /> Fix & Resubmit
              </button>
            )}
            {/* Phase G6.10 — AI Cowork buttons (rendered only if president has enabled
                the feature for this entity AND user role is in allowed_roles).
                Prompts/models/etc. all live in AI_COWORK_FEATURES lookup. */}
            <AiCoworkFixHelperButton row={row} moduleKey={moduleKey} reason={reason} tone={tone} />
            {children && <span className="rjb-slot">{children}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * AiCoworkFixHelperButton — opens an inline panel with Claude's plain-language
 * fix suggestions. Renders nothing if the feature isn't available for this user.
 * Lives inside RejectionBanner so it shares the alert region (a11y-friendly).
 */
function AiCoworkFixHelperButton({ row, moduleKey, reason, tone }) {
  const { available, button, invoke, invokeLoading, error } = useAiCoworkFeature('APPROVAL_FIX_HELPER');
  const [output, setOutput] = useState(null);
  const [open, setOpen] = useState(false);

  if (!available) return null;

  const handleClick = async () => {
    setOpen(true);
    if (output) return;
    try {
      const result = await invoke({
        module: moduleKey,
        doc_ref: row?._id || row?.doc_ref || row?.invoice_number || '—',
        reason,
        summary: row?.description || row?.notes || row?.payee_name || '',
      });
      setOutput(result?.text || '');
    } catch {
      // error captured by hook; render below
    }
  };

  return (
    <>
      <button
        type="button"
        className={`rjb-btn rjb-btn-primary ${tone === 'warning' ? 'warning' : ''}`}
        style={{ background: tone === 'warning' ? '#7c3aed' : '#2563eb' }}
        onClick={handleClick}
        disabled={invokeLoading}
        title={button.description}
      >
        <Sparkles /> {invokeLoading ? 'Asking…' : button.label}
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 6,
          background: '#eff6ff', border: '1px solid #bfdbfe',
          color: '#1e3a8a', fontSize: 12, whiteSpace: 'pre-wrap', width: '100%',
        }}>
          {error ? <span style={{ color: '#991b1b' }}>{error}</span>
            : invokeLoading ? 'Thinking…'
            : output || '(no response)'}
        </div>
      )}
    </>
  );
}

export default RejectionBanner;
