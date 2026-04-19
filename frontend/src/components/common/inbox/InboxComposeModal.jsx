/**
 * InboxComposeModal — Phase G9.R5
 *
 * Two-way DM composer. Supports either targeted (recipient_user_id) or
 * broadcast (recipient_role) composition. Backend gate (Phase G9.R3) enforces
 * messaging.* sub-permissions + MESSAGE_ACCESS_ROLES matrix; this UI just
 * surfaces the inputs.
 *
 * Recipient picker:
 *   - "User" mode: lists users via /api/users (lazy-loaded on open)
 *   - "Role" mode: lists roles from a static set the backend recognizes
 */
import { useEffect, useMemo, useState } from 'react';
import { Send, X } from 'lucide-react';
import api from '../../../services/api';
import messageService from '../../../services/messageInboxService';

const styles = `
  .icm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .icm-card { background: #fff; border-radius: 16px; padding: 20px 22px; width: 100%; max-width: 540px; max-height: 90vh; display: flex; flex-direction: column; gap: 12px; }
  body.dark-mode .icm-card { background: #0f172a; }
  .icm-header { display: flex; justify-content: space-between; align-items: center; }
  .icm-header h3 { margin: 0; font-size: 16px; }
  body.dark-mode .icm-header h3 { color: #f1f5f9; }
  .icm-close { background: transparent; border: 0; cursor: pointer; padding: 4px 8px; color: #94a3b8; border-radius: 6px; }
  .icm-close:hover { background: #f1f5f9; }
  body.dark-mode .icm-close:hover { background: #1e293b; }
  .icm-row { display: flex; flex-direction: column; gap: 4px; }
  .icm-row label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
  .icm-row input, .icm-row select, .icm-row textarea { padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-family: inherit; background: #fff; color: #111; }
  body.dark-mode .icm-row input, body.dark-mode .icm-row select, body.dark-mode .icm-row textarea { background: #0b1220; border-color: #1e293b; color: #e2e8f0; }
  .icm-row textarea { resize: vertical; min-height: 110px; max-height: 240px; }
  .icm-toggle { display: flex; gap: 6px; }
  .icm-toggle button { padding: 6px 12px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; font-size: 12px; font-weight: 700; cursor: pointer; min-height: 36px; }
  .icm-toggle button.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  body.dark-mode .icm-toggle button { background: #0b1220; border-color: #1e293b; color: #cbd5e1; }
  .icm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .icm-actions button { padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; min-height: 40px; display: inline-flex; align-items: center; gap: 6px; }
  .icm-actions .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .icm-actions .primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .icm-actions .secondary { background: #fff; color: #334155; border-color: #cbd5e1; }
  body.dark-mode .icm-actions .secondary { background: #1e293b; color: #cbd5e1; border-color: #334155; }
  .icm-error { color: #b91c1c; font-size: 12px; padding: 8px 10px; border: 1px solid #fecaca; background: #fef2f2; border-radius: 8px; }
  @media (max-width: 480px) {
    .icm-card { padding: 16px; }
    .icm-actions button, .icm-toggle button { min-height: 44px; }
  }
`;

// Roles selectable as a broadcast target. Filtered at the backend by
// MESSAGE_ACCESS_ROLES + sub-perm checks.
const ROLE_OPTIONS = [
  { code: 'admin', label: 'Admins' },
  { code: 'finance', label: 'Finance' },
  { code: 'president', label: 'Presidents' },
  { code: 'ceo', label: 'CEOs' },
  { code: 'contractor', label: 'Contractors / BDMs' },
];

export default function InboxComposeModal({ open, onClose, onSent }) {
  const [mode, setMode] = useState('user'); // 'user' | 'role'
  const [recipientUserId, setRecipientUserId] = useState('');
  const [recipientRole, setRecipientRole] = useState(ROLE_OPTIONS[0].code);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [users, setUsers] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (mode !== 'user' || users) return;
    let live = true;
    setUsersLoading(true);
    (async () => {
      try {
        const res = await api.get('/users', { params: { limit: 200, isActive: true }, withCredentials: true });
        const list = res?.data?.data?.users || res?.data?.data || res?.data?.users || [];
        if (live) setUsers(Array.isArray(list) ? list : []);
      } catch {
        if (live) setUsers([]);
      } finally {
        if (live) setUsersLoading(false);
      }
    })();
    return () => { live = false; };
  }, [open, mode, users]);

  const userOptions = useMemo(() => (users || []).map((u) => ({
    id: u._id || u.id,
    label: `${u.full_name || u.name || u.email}${u.role ? ` · ${u.role}` : ''}`,
  })), [users]);

  if (!open) return null;

  const reset = () => {
    setSubject(''); setBody(''); setRecipientUserId(''); setError(null);
  };

  const handleSend = async () => {
    setError(null);
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject || !trimmedBody) {
      setError('Subject and body are required.');
      return;
    }
    if (mode === 'user' && !recipientUserId) {
      setError('Pick a recipient.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        subject: trimmedSubject,
        body: trimmedBody,
        category: 'chat',
        priority: 'normal',
      };
      if (mode === 'user') {
        payload.recipient_user_id = recipientUserId;
      } else {
        payload.recipient_role = recipientRole;
      }
      const res = await messageService.compose(payload);
      window.dispatchEvent(new Event('inbox:updated'));
      reset();
      onSent?.(res?.data || null);
      onClose?.();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to send';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="icm-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target.className === 'icm-overlay' && !busy) onClose?.(); }}>
        <div className="icm-card">
          <div className="icm-header">
            <h3>New message</h3>
            <button type="button" className="icm-close" onClick={onClose} disabled={busy} aria-label="Close">
              <X size={18} />
            </button>
          </div>

          <div className="icm-toggle" role="tablist" aria-label="Recipient mode">
            <button type="button" role="tab" aria-selected={mode === 'user'} className={mode === 'user' ? 'active' : ''} onClick={() => setMode('user')}>
              Direct
            </button>
            <button type="button" role="tab" aria-selected={mode === 'role'} className={mode === 'role' ? 'active' : ''} onClick={() => setMode('role')}>
              Broadcast (role)
            </button>
          </div>

          {mode === 'user' ? (
            <div className="icm-row">
              <label htmlFor="icm-user">To</label>
              <select id="icm-user" value={recipientUserId} onChange={(e) => setRecipientUserId(e.target.value)} disabled={busy || usersLoading}>
                <option value="">{usersLoading ? 'Loading users…' : 'Select a user'}</option>
                {userOptions.map((u) => (<option key={u.id} value={u.id}>{u.label}</option>))}
              </select>
            </div>
          ) : (
            <div className="icm-row">
              <label htmlFor="icm-role">Audience</label>
              <select id="icm-role" value={recipientRole} onChange={(e) => setRecipientRole(e.target.value)} disabled={busy}>
                {ROLE_OPTIONS.map((r) => (<option key={r.code} value={r.code}>{r.label}</option>))}
              </select>
            </div>
          )}

          <div className="icm-row">
            <label htmlFor="icm-subject">Subject</label>
            <input id="icm-subject" type="text" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject…" disabled={busy} />
          </div>

          <div className="icm-row">
            <label htmlFor="icm-body">Message</label>
            <textarea id="icm-body" maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" disabled={busy} />
          </div>

          {error && <div className="icm-error">{error}</div>}

          <div className="icm-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="primary" onClick={handleSend} disabled={busy}>
              <Send size={14} /> {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
