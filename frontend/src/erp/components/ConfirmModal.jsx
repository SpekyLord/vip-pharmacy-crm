import { memo } from 'react';

/**
 * ConfirmModal — lightweight yes/no confirm dialog matching ERP theming.
 *
 * Use for routine lifecycle confirms (Submit, Re-open, Validate). For destructive
 * irreversible actions (hard delete, drop), prefer ConfirmDeleteModal which forces
 * type-to-confirm.
 *
 * Controlled component — render with state in the parent:
 *   const [confirm, setConfirm] = useState(null);
 *   ...
 *   setConfirm({ message: '...', confirmText: 'Submit', onConfirm: () => doIt() });
 *   ...
 *   <ConfirmModal
 *     {...(confirm || {})}
 *     isOpen={!!confirm}
 *     onCancel={() => setConfirm(null)}
 *   />
 */

const cmStyles = `
  .cm-overlay {
    position: fixed; inset: 0;
    background: rgba(15, 23, 42, 0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 1100;
    padding: 16px;
  }
  .cm-content {
    background: var(--erp-panel, #fff);
    color: var(--erp-text, #1f2937);
    border-radius: 12px;
    padding: 22px 22px 18px;
    width: 100%; max-width: 440px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    border: 1px solid var(--erp-border, #e2e8f0);
  }
  .cm-title { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
  .cm-message { margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: var(--erp-muted, #475569); white-space: pre-line; }
  .cm-actions { display: flex; justify-content: flex-end; gap: 10px; }
  .cm-btn { min-height: 40px; padding: 9px 18px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: background 0.15s, border-color 0.15s; }
  .cm-btn-cancel { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
  .cm-btn-cancel:hover:not(:disabled) { background: #e2e8f0; }
  .cm-btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .cm-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
  .cm-btn-danger { background: #dc2626; color: #fff; border-color: #dc2626; }
  .cm-btn-danger:hover:not(:disabled) { background: #b91c1c; }
  .cm-btn-warning { background: #f59e0b; color: #fff; border-color: #f59e0b; }
  .cm-btn-warning:hover:not(:disabled) { background: #d97706; }
  .cm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  body.dark-mode .cm-content { background: #0b1220; color: #e2e8f0; border-color: #334155; }
  body.dark-mode .cm-message { color: #94a3b8; }
  body.dark-mode .cm-btn-cancel { background: #1e293b; color: #e2e8f0; border-color: #334155; }
  body.dark-mode .cm-btn-cancel:hover:not(:disabled) { background: #334155; }

  @media (max-width: 480px) {
    .cm-actions { flex-direction: column-reverse; gap: 8px; }
    .cm-btn { width: 100%; min-height: 44px; }
  }
`;

const ConfirmModal = memo(function ConfirmModal({
  isOpen = false,
  title = 'Confirm',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const confirmClass = variant === 'danger'
    ? 'cm-btn cm-btn-danger'
    : variant === 'warning'
      ? 'cm-btn cm-btn-warning'
      : 'cm-btn cm-btn-primary';

  return (
    <div className="cm-overlay" onClick={busy ? undefined : onCancel}>
      <style>{cmStyles}</style>
      <div className="cm-content" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3 className="cm-title">{title}</h3>
        <p className="cm-message">{message}</p>
        <div className="cm-actions">
          <button type="button" className="cm-btn cm-btn-cancel" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Working…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ConfirmModal;
