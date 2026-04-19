/**
 * PresidentReverseModal — type-to-confirm + reason textarea for the
 * President-only "Delete & Reverse" capability across all transactional
 * ERP modules (Sales, Collections, Expenses, Petty Cash, etc.).
 *
 * The action is destructive: for POSTED documents it triggers a SAP Storno
 * (reversal entries posted to current period; original record retained for
 * audit). For DRAFT/ERROR documents it hard-deletes the row.
 *
 * Caller passes:
 *   - docLabel       short identifier (e.g. "CSI #7844 — ₱75,000")
 *   - docStatus      current status (used to tailor the warning copy)
 *   - onConfirm({ reason, confirm })  resolves on success
 *   - onClose        modal close handler
 */

import { useState, useEffect, useRef } from 'react';

const styles = `
  .prm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: 16px; }
  .prm-panel { background: #fff; border-radius: 14px; width: 100%; max-width: 520px; padding: 22px; box-shadow: 0 24px 60px rgba(0,0,0,0.25); }
  .prm-icon-wrap { width: 52px; height: 52px; border-radius: 50%; background: #fee2e2; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
  .prm-icon { width: 28px; height: 28px; color: #dc2626; }
  .prm-title { text-align: center; font-size: 18px; font-weight: 700; color: #991b1b; margin: 0 0 8px; }
  .prm-doc { text-align: center; font-size: 13px; color: #475569; margin: 0 0 16px; word-break: break-word; }
  .prm-warn { background: #fef2f2; border: 1px solid #fecaca; color: #7f1d1d; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.55; margin-bottom: 14px; }
  .prm-warn strong { color: #991b1b; }
  .prm-warn ul { margin: 6px 0 0 18px; padding: 0; }
  .prm-field { margin-bottom: 14px; }
  .prm-field label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 4px; }
  .prm-field input, .prm-field textarea { width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 7px; border: 1px solid #cbd5e1; font-size: 13px; font-family: inherit; }
  .prm-field textarea { min-height: 76px; resize: vertical; }
  .prm-field input:focus, .prm-field textarea:focus { outline: none; border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220,38,38,0.15); }
  .prm-confirm-hint { font-size: 11px; color: #64748b; margin-top: 4px; }
  .prm-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
  .prm-btn { padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; }
  .prm-btn-cancel { background: #f1f5f9; color: #334155; }
  .prm-btn-cancel:hover { background: #e2e8f0; }
  .prm-btn-danger { background: #dc2626; color: #fff; }
  .prm-btn-danger:hover { background: #b91c1c; }
  .prm-btn-danger:disabled { background: #fca5a5; cursor: not-allowed; }
  body.dark-mode .prm-panel { background: #1e293b; color: #e2e8f0; }
  body.dark-mode .prm-doc { color: #94a3b8; }
  body.dark-mode .prm-field label { color: #cbd5e1; }
  body.dark-mode .prm-field input, body.dark-mode .prm-field textarea { background: #0f172a; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .prm-warn { background: #450a0a; border-color: #7f1d1d; color: #fecaca; }
  body.dark-mode .prm-btn-cancel { background: #334155; color: #e2e8f0; }
  @media (max-width: 480px) {
    .prm-panel { padding: 18px; }
    .prm-actions { flex-direction: column-reverse; }
    .prm-actions .prm-btn { width: 100%; }
  }
`;

export default function PresidentReverseModal({ docLabel, docStatus, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const isPosted = docStatus === 'POSTED' || docStatus === 'DELETION_REQUESTED';
  const matched = confirm.trim().toUpperCase() === 'DELETE';
  const canSubmit = matched && reason.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason.trim(), confirm: 'DELETE' });
    } catch {
      // parent surfaces the error toast — keep modal open so user can retry
      setSubmitting(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose?.();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) handleSubmit();
  };

  return (
    <div className="prm-overlay" onClick={onClose} onKeyDown={handleKey}>
      <style>{styles}</style>
      <div className="prm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="prm-icon-wrap">
          <svg className="prm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>

        <h3 className="prm-title">President Reverse — Delete &amp; Reverse</h3>
        <p className="prm-doc">{docLabel}</p>

        <div className="prm-warn">
          {isPosted ? (
            <>
              <strong>This is a SAP Storno reversal.</strong> The following will be undone in a single transaction:
              <ul>
                <li>All journal entries reversed (current period; original period untouched)</li>
                <li>Inventory consumption restored (FIFO batch quantities)</li>
                <li>Consignment conversions removed</li>
                <li>Petty Cash deposit voided + fund balance decremented</li>
                <li>VAT/CWT ledger entries cleaned up</li>
              </ul>
              The original record stays POSTED with a reversal-event link for audit.
            </>
          ) : (
            <>
              <strong>This row never posted to the ledger.</strong> It will be hard-deleted.
              No journal, inventory, or fund balances are affected.
            </>
          )}
        </div>

        <div className="prm-field">
          <label>Reason (logged to audit trail)</label>
          <textarea
            ref={inputRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this transaction being reversed?"
            disabled={submitting}
          />
        </div>

        <div className="prm-field">
          <label>Type DELETE to confirm</label>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={submitting}
          />
          <div className="prm-confirm-hint">{matched ? '✓ Confirmed' : 'Required to enable the action'}</div>
        </div>

        <div className="prm-actions">
          <button type="button" className="prm-btn prm-btn-cancel" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="prm-btn prm-btn-danger" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? 'Reversing…' : (isPosted ? 'Reverse & Mark Deleted' : 'Delete Row')}
          </button>
        </div>
      </div>
    </div>
  );
}
