/**
 * InboxThreadView — Phase G9.R5
 *
 * Right pane that renders the selected message + its full thread + the
 * action affordance row. When the message lives in folder=TASKS the parent
 * <InboxPage> swaps in <TaskMiniEditor> instead of this view (the task
 * editor handles its own thread slot).
 *
 * For non-task folders this view supports:
 *   - the row's action (approve/reject/resolve/acknowledge)
 *   - a reply composer (creates a child message in the same thread)
 */
import { useState } from 'react';
import { ExternalLink, Reply, Send, X } from 'lucide-react';

const styles = `
  .itv-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; background: #fff; }
  body.dark-mode .itv-wrap { background: #0f172a; }
  .itv-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
  body.dark-mode .itv-header { border-color: #1e293b; }
  .itv-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 6px; line-height: 1.3; }
  body.dark-mode .itv-title { color: #f1f5f9; }
  .itv-sub { font-size: 12px; color: #64748b; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .itv-tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; text-transform: uppercase; }
  .itv-tag.action { background: #fee2e2; color: #b91c1c; }
  .itv-tag.high { background: #fef3c7; color: #92400e; }
  .itv-tag.completed { background: #dcfce7; color: #166534; }
  .itv-tag.folder { background: #e0f2fe; color: #075985; }
  .itv-actions { padding: 12px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  body.dark-mode .itv-actions { background: #142036; border-color: #1e293b; }
  .itv-btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; min-height: 36px; display: inline-flex; align-items: center; gap: 6px; }
  .itv-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .itv-btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .itv-btn.primary:hover:not(:disabled) { background: #1d4ed8; }
  .itv-btn.danger { background: #dc2626; color: #fff; border-color: #dc2626; }
  .itv-btn.danger:hover:not(:disabled) { background: #b91c1c; }
  .itv-btn.secondary { background: #fff; color: #334155; border-color: #cbd5e1; }
  .itv-btn.secondary:hover:not(:disabled) { background: #f1f5f9; }
  body.dark-mode .itv-btn.secondary { background: #1e293b; color: #cbd5e1; border-color: #334155; }
  .itv-actiondone { font-size: 12px; color: #166534; font-weight: 700; }
  .itv-thread { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; min-height: 0; }
  .itv-msg { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; }
  .itv-msg.mine { background: #dbeafe; border-color: #93c5fd; align-self: flex-end; max-width: 92%; }
  body.dark-mode .itv-msg { background: #142036; border-color: #1e293b; }
  body.dark-mode .itv-msg.mine { background: #1e3a8a; border-color: #2563eb; }
  .itv-msg-meta { font-size: 11px; color: #64748b; display: flex; gap: 10px; margin-bottom: 6px; align-items: center; }
  .itv-msg-from { font-weight: 800; color: #0f172a; }
  body.dark-mode .itv-msg-from { color: #f1f5f9; }
  .itv-msg-body { font-size: 13px; color: #1f2937; white-space: pre-wrap; word-wrap: break-word; line-height: 1.55; }
  body.dark-mode .itv-msg-body { color: #e2e8f0; }
  .itv-empty { color: #94a3b8; font-size: 13px; padding: 40px; text-align: center; }
  .itv-reply { padding: 14px 20px; border-top: 1px solid #e5e7eb; background: #fff; display: flex; flex-direction: column; gap: 8px; }
  body.dark-mode .itv-reply { background: #0f172a; border-color: #1e293b; }
  .itv-reply textarea { width: 100%; min-height: 70px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 13px; resize: vertical; font-family: inherit; background: #fff; color: #111; }
  body.dark-mode .itv-reply textarea { background: #0b1220; border-color: #1e293b; color: #e2e8f0; }
  .itv-reply-row { display: flex; gap: 8px; align-items: center; }
  .itv-reason-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
  .itv-reason-card { background: #fff; border-radius: 14px; padding: 20px; width: 100%; max-width: 440px; }
  body.dark-mode .itv-reason-card { background: #0f172a; }
  .itv-reason-card h4 { margin: 0 0 12px; font-size: 15px; }
  .itv-reason-card textarea { width: 100%; min-height: 90px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; }
  .itv-reason-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 767px) {
    .itv-header, .itv-actions, .itv-thread, .itv-reply { padding-left: 14px; padding-right: 14px; }
    .itv-btn { min-height: 44px; }
  }
`;

function fmt(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InboxThreadView({
  message,
  thread,
  currentUserId,
  actionsConfig,
  onAction,         // (id, args) => Promise<{success, downstream}>
  onReply,          // (id, body) => Promise
  onClose,
  busy,
}) {
  const [replyBody, setReplyBody] = useState('');
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [pendingActionType, setPendingActionType] = useState(null);

  if (!message) {
    return (
      <>
        <style>{styles}</style>
        <div className="itv-wrap"><div className="itv-empty">Select a message to view.</div></div>
      </>
    );
  }

  const { action_type: actionType, action_payload: payload, action_completed_at: completedAt } = message;
  const action = (actionsConfig || []).find((a) => a.code === actionType);
  const completed = !!completedAt;
  const requiresAction = !!message.requires_action;

  // Build the action button row from action_type. For approve we surface
  // both Approve + Reject (Reject pulls reason). For others, single button.
  const actionRow = [];
  if (requiresAction && !completed) {
    if (actionType === 'approve') {
      actionRow.push({ code: 'approve', label: 'Approve', variant: 'primary', confirm: false });
      actionRow.push({ code: 'reject', label: 'Reject', variant: 'danger', confirm: true, reasonRequired: true });
    } else if (actionType === 'resolve') {
      actionRow.push({ code: 'resolve', label: action?.label || 'Resolve', variant: action?.variant || 'primary', confirm: action?.confirm ?? true, reasonRequired: action?.reason_required ?? true });
    } else if (actionType === 'acknowledge') {
      actionRow.push({ code: 'acknowledge', label: action?.label || 'Acknowledge', variant: action?.variant || 'secondary', confirm: false });
    } else if (actionType === 'open_link' && payload?.deep_link) {
      actionRow.push({ code: 'open_link', label: 'Open', variant: 'secondary', deepLink: payload.deep_link });
    }
  }

  const submitAction = async (code, reason) => {
    if (code === 'open_link') {
      if (payload?.deep_link) window.location.assign(payload.deep_link);
      return;
    }
    // Translate the displayed code into the real action_type the backend expects.
    // For our model, the call always hits POST /messages/:id/action and the
    // controller dispatches based on the row's stored action_type.
    // Approve/reject differentiation goes via `args.actionVariant` for clarity,
    // but the controller reads action_type from the row — for reject path we
    // need to OVERRIDE: backend currently treats action_type as the verb.
    // We POST { reason, action: code } so the controller can choose between
    // approve/reject within a single approve-row.
    await onAction(message._id, { reason, action: code });
  };

  const handleClick = (a) => {
    if (a.confirm || a.reasonRequired) {
      setPendingActionType(a.code);
      setReasonText('');
      setReasonOpen(true);
    } else {
      submitAction(a.code);
    }
  };

  const confirmReason = async () => {
    const code = pendingActionType;
    const action = actionRow.find((x) => x.code === code);
    if (action?.reasonRequired && !reasonText.trim()) return;
    setReasonOpen(false);
    await submitAction(code, reasonText.trim());
  };

  const handleReply = async () => {
    const text = replyBody.trim();
    if (!text) return;
    await onReply(message._id, text);
    setReplyBody('');
  };

  return (
    <>
      <style>{styles}</style>
      <div className="itv-wrap">
        <div className="itv-header">
          <h2 className="itv-title">{message.title}</h2>
          <div className="itv-sub">
            <span className="itv-tag folder">{message.folder || 'INBOX'}</span>
            {message.priority === 'high' && <span className="itv-tag high">High</span>}
            {requiresAction && !completed && <span className="itv-tag action">Action required</span>}
            {completed && <span className="itv-tag completed">Done</span>}
            <span>{message.senderName || 'System'} · {fmt(message.createdAt)}</span>
            {onClose && (
              <button type="button" className="itv-btn secondary" style={{ marginLeft: 'auto', minHeight: '32px', padding: '4px 10px' }} onClick={onClose}>
                <X size={14} /> Close
              </button>
            )}
          </div>
        </div>

        {(actionRow.length > 0 || completed) && (
          <div className="itv-actions">
            {actionRow.map((a) => (
              <button
                key={a.code}
                type="button"
                className={`itv-btn ${a.variant}`}
                disabled={busy}
                onClick={() => handleClick(a)}
              >
                {a.code === 'open_link' && <ExternalLink size={14} />}
                {a.label}
              </button>
            ))}
            {payload?.deep_link && actionType !== 'open_link' && (
              <a href={payload.deep_link} className="itv-btn secondary" target="_self" rel="noreferrer">
                <ExternalLink size={14} /> Open source
              </a>
            )}
            {completed && (
              <span className="itv-actiondone">✓ Completed {fmt(completedAt)}</span>
            )}
          </div>
        )}

        <div className="itv-thread">
          {(thread || [message]).map((m) => {
            const mine = String(m.senderUserId) === String(currentUserId);
            return (
              <div key={m._id} className={`itv-msg${mine ? ' mine' : ''}`}>
                <div className="itv-msg-meta">
                  <span className="itv-msg-from">{m.senderName || 'System'}</span>
                  <span>{m.senderRole || ''}</span>
                  <span style={{ marginLeft: 'auto' }}>{fmt(m.createdAt)}</span>
                </div>
                <div className="itv-msg-body">{m.body}</div>
              </div>
            );
          })}
        </div>

        <div className="itv-reply">
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Reply…"
            maxLength={5000}
            disabled={busy}
            aria-label="Reply"
          />
          <div className="itv-reply-row">
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{replyBody.length}/5000</span>
            <button
              type="button"
              className="itv-btn primary"
              style={{ marginLeft: 'auto' }}
              disabled={busy || !replyBody.trim()}
              onClick={handleReply}
            >
              <Send size={14} /> Send reply
            </button>
          </div>
        </div>

        {reasonOpen && (
          <div className="itv-reason-modal" onClick={(e) => { if (e.target.className === 'itv-reason-modal') setReasonOpen(false); }}>
            <div className="itv-reason-card">
              <h4>{pendingActionType === 'reject' ? 'Reason for rejection' : 'Reason'}</h4>
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder={pendingActionType === 'reject' ? 'Briefly tell the submitter what to fix…' : 'Optional context…'}
                maxLength={500}
                autoFocus
              />
              <div className="itv-reason-actions">
                <button type="button" className="itv-btn secondary" onClick={() => setReasonOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`itv-btn ${pendingActionType === 'reject' ? 'danger' : 'primary'}`}
                  onClick={confirmReason}
                  disabled={busy}
                >
                  <Reply size={14} /> Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
