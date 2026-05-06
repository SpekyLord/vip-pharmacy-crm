/**
 * DuplicateVipClientModal — Phase A.5.3
 *
 * Surfaced when the backend returns 409 with `code: 'DUPLICATE_VIP_CLIENT'` from
 * `POST /api/doctors` or `PUT /api/doctors/:id`. The 409 payload identifies the
 * existing Doctor that already owns the canonical name slot. Admin (or any
 * lookup-permitted role — see VIP_CLIENT_LIFECYCLE_ROLES) can:
 *
 *   - Rename mine        → close modal, focus the lastName field on the form
 *   - Join their coverage → calls POST /api/doctors/:id/join-coverage; the
 *                            backend decides AUTO (immediate add to assignedTo[])
 *                            or APPROVAL_PENDING (admin gets a MessageInbox).
 *
 * Buttons are conditional on the 409 payload's can_join_auto / can_join_approval
 * flags so a user with neither permission only sees "Rename mine" — no
 * dead-end "Join" button that would 403 on click.
 *
 * Lookup-driven (Rule #3): the role gates live in VIP_CLIENT_LIFECYCLE_ROLES.
 * Subscription-ready (Rule #19): no hardcoded role lists in this component.
 */

import { useState, memo } from 'react';
import { AlertTriangle, X, UserPlus, Edit2, Mail } from 'lucide-react';

const dvcStyles = `
  .dvc-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;  /* sits above the add/edit modal (1000) */
  }

  .dvc-content {
    background: white;
    border-radius: 12px;
    width: 90%;
    max-width: 520px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .dvc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: #fef3c7;
    border-bottom: 1px solid #fde68a;
  }

  .dvc-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 600;
    color: #92400e;
  }

  .dvc-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #92400e;
    padding: 4px;
    line-height: 0;
  }

  .dvc-close:hover {
    color: #78350f;
  }

  .dvc-body {
    padding: 20px;
    color: #374151;
    line-height: 1.55;
  }

  .dvc-existing-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 14px 16px;
    margin-top: 14px;
    margin-bottom: 14px;
  }

  .dvc-existing-name {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 8px 0;
  }

  .dvc-existing-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #4b5563;
    margin-bottom: 4px;
  }

  .dvc-existing-row strong {
    color: #1f2937;
    font-weight: 500;
  }

  .dvc-notes-field {
    width: 100%;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    min-height: 60px;
  }

  .dvc-notes-field:focus {
    outline: none;
    border-color: #2563eb;
  }

  .dvc-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    padding: 14px 20px;
    background: #f9fafb;
    border-top: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }

  .dvc-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: 1px solid transparent;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .dvc-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .dvc-btn-rename {
    background: white;
    border-color: #d1d5db;
    color: #374151;
  }

  .dvc-btn-rename:hover:not(:disabled) {
    background: #f3f4f6;
  }

  .dvc-btn-join {
    background: #2563eb;
    color: white;
  }

  .dvc-btn-join:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .dvc-btn-request {
    background: #f59e0b;
    color: white;
  }

  .dvc-btn-request:hover:not(:disabled) {
    background: #d97706;
  }
`;

const DuplicateVipClientModal = memo(function DuplicateVipClientModal({
  duplicate,            // { code, message, existing, can_join_auto, can_join_approval }
  onRename,             // () => void  — close modal, frontend re-focuses lastName
  onJoinAuto,           // (doctorId) => Promise<bool>  — calls service.joinCoverage
  onJoinApproval,       // (doctorId, notes) => Promise<bool>
  onClose,              // () => void
}) {
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');

  if (!duplicate || !duplicate.existing) return null;

  const { existing, can_join_auto: canAuto, can_join_approval: canApproval } = duplicate;
  const fullName = existing.fullName
    || `${existing.firstName || ''} ${existing.lastName || ''}`.trim();
  const primaryName = existing.primaryAssignee?.name || '—';
  const assigneeCount = Array.isArray(existing.assignedTo) ? existing.assignedTo.length : 0;

  const handleJoin = async () => {
    if (!canAuto || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onJoinAuto?.(existing._id);
      if (ok) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestApproval = async () => {
    if (!canApproval || canAuto || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onJoinApproval?.(existing._id, notes.trim() || null);
      if (ok) onClose?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dvc-overlay" onClick={onClose}>
      <style>{dvcStyles}</style>
      <div className="dvc-content" onClick={(e) => e.stopPropagation()}>
        <div className="dvc-header">
          <div className="dvc-header-title">
            <AlertTriangle size={18} />
            VIP Client Already Exists
          </div>
          <button type="button" className="dvc-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="dvc-body">
          <p style={{ margin: 0 }}>{duplicate.message}</p>

          <div className="dvc-existing-card">
            <h3 className="dvc-existing-name">{fullName || '(name missing)'}</h3>
            <div className="dvc-existing-row">
              <span>Primary BDM</span>
              <strong>{primaryName}</strong>
            </div>
            <div className="dvc-existing-row">
              <span>Total assignees</span>
              <strong>{assigneeCount}</strong>
            </div>
            <div className="dvc-existing-row">
              <span>Logged visits</span>
              <strong>{Number.isFinite(existing.visitCount) ? existing.visitCount : 0}</strong>
            </div>
            {existing.isActive === false && (
              <div className="dvc-existing-row" style={{ color: '#b91c1c' }}>
                <span>Status</span>
                <strong>INACTIVE</strong>
              </div>
            )}
          </div>

          {!canAuto && canApproval && (
            <>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 6px 0' }}>
                Optional note for admin (why you need coverage):
              </p>
              <textarea
                className="dvc-notes-field"
                placeholder="e.g. I cover this hospital on alternating weeks..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                disabled={submitting}
              />
            </>
          )}
        </div>

        <div className="dvc-actions">
          <button
            type="button"
            className="dvc-btn dvc-btn-rename"
            onClick={onRename}
            disabled={submitting}
            data-testid="dvc-rename"
          >
            <Edit2 size={16} />
            Rename mine
          </button>
          {canAuto && (
            <button
              type="button"
              className="dvc-btn dvc-btn-join"
              onClick={handleJoin}
              disabled={submitting}
              data-testid="dvc-join-auto"
            >
              <UserPlus size={16} />
              {submitting ? 'Joining…' : 'Join their coverage'}
            </button>
          )}
          {!canAuto && canApproval && (
            <button
              type="button"
              className="dvc-btn dvc-btn-request"
              onClick={handleRequestApproval}
              disabled={submitting}
              data-testid="dvc-join-approval"
            >
              <Mail size={16} />
              {submitting ? 'Sending…' : 'Request admin approval'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default DuplicateVipClientModal;
