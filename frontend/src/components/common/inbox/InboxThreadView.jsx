/**
 * InboxThreadView — Phase G9.R5 → R8 (Apr 2026)
 *
 * Right pane that renders the selected message + its full thread + the
 * action affordance row. When the message lives in folder=TASKS the parent
 * <InboxPage> swaps in <TaskMiniEditor> instead of this view.
 *
 * Phase G9.R8 additions (Apr 2026):
 *   - Archive / Unarchive (per-recipient) — always available in the header.
 *   - Acknowledge (explicit "I read and understood this") — visible only when
 *     the message is flagged must_acknowledge and the current user hasn't
 *     ack'd yet. Persists as acknowledgedBy=[{user, at}] in the model.
 *   - Action-gate: Approve / Reject / Resolve are disabled with a tooltip
 *     "Acknowledge first" until the current user appears in acknowledgedBy.
 *     Acknowledge is NOT gated (clicking it IS the acknowledgement).
 *   - Read-Receipts link (sender + privileged only) — opens a modal listing
 *     who has acknowledged and who is still pending, fetched from
 *     GET /messages/:id/ack-status.
 *
 * Action props (parent passes; all optional):
 *   - onAction(id, args)          approve / reject / resolve / acknowledge (existing)
 *   - onReply(id, body)           threaded reply (existing)
 *   - onArchiveToggle(id, next)   next = true to archive, false to unarchive
 *   - onAcknowledge(id)           explicit ack (routes to PATCH /:id/acknowledge)
 *   - onViewReceipts(id)          sender/admin — fetch ack-status + show modal
 */
import { useState } from 'react';
import { ExternalLink, Reply, Send, X, Archive, ArchiveRestore, CheckCircle, Users } from 'lucide-react';

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
  .itv-tag.ack-required { background: #fef3c7; color: #92400e; display: inline-flex; align-items: center; gap: 4px; }
  .itv-tag.ack-done { background: #dcfce7; color: #166534; display: inline-flex; align-items: center; gap: 4px; }
  .itv-ack-banner { background: #fffbeb; border: 1px solid #fcd34d; color: #78350f; border-radius: 10px; padding: 10px 14px; margin: 0 20px 0; font-size: 12px; line-height: 1.45; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .itv-ack-banner strong { color: #92400e; }
  .itv-ack-banner .itv-btn { margin-left: auto; }
  body.dark-mode .itv-ack-banner { background: #422006; border-color: #854d0e; color: #fde68a; }
  .itv-receipts-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 16px; }
  .itv-receipts-card { background: #fff; border-radius: 14px; padding: 20px; width: 100%; max-width: 520px; max-height: 80vh; display: flex; flex-direction: column; }
  body.dark-mode .itv-receipts-card { background: #0f172a; }
  .itv-receipts-card h4 { margin: 0 0 8px; font-size: 15px; }
  .itv-receipts-card .rcpt-meta { font-size: 11px; color: #64748b; margin-bottom: 12px; }
  .itv-receipts-card .rcpt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; overflow-y: auto; }
  .itv-receipts-card .rcpt-col h5 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  .itv-receipts-card .rcpt-col.acked h5 { color: #166534; }
  .itv-receipts-card .rcpt-col.pending h5 { color: #b45309; }
  .itv-receipts-card ul { list-style: none; margin: 0; padding: 0; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
  .itv-receipts-card li { padding: 6px 8px; border-radius: 6px; background: #f8fafc; color: #334155; }
  body.dark-mode .itv-receipts-card li { background: #1e293b; color: #cbd5e1; }
  .itv-receipts-card .rcpt-when { font-size: 10px; color: #64748b; display: block; }
  @media (max-width: 480px) {
    .itv-receipts-card .rcpt-grid { grid-template-columns: 1fr; }
  }
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
  onAction,          // (id, args) => Promise<{success, downstream}>
  onReply,           // (id, body) => Promise
  onArchiveToggle,   // (id, nextArchived: boolean) => Promise — Phase G9.R8
  onAcknowledge,     // (id) => Promise — Phase G9.R8
  onViewReceipts,    // (id) => Promise<{total, acknowledged, pending}> — Phase G9.R8
  onClose,
  busy,
}) {
  const [replyBody, setReplyBody] = useState('');
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [pendingActionType, setPendingActionType] = useState(null);
  const [receipts, setReceipts] = useState(null);   // Phase G9.R8 — ack-status modal payload
  const [receiptsLoading, setReceiptsLoading] = useState(false);

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

  // Phase G9.R8 — acknowledge state (projection fields from backend DTO).
  const mustAck = !!message.must_acknowledge;
  const ackedByMe = !!message.acknowledged_by_me;
  const ackedAt = message.acknowledged_at || null;
  // Action buttons disabled until user acknowledges a must-ack message —
  // keeps the "read it before you approve it" guarantee.
  const actionGated = mustAck && !ackedByMe;
  // Sender/admin read-receipt access — we show the receipts link if the
  // caller passed an onViewReceipts handler (parent decides who sees it).
  const canViewReceipts = typeof onViewReceipts === 'function' && mustAck;
  // Archived-for-me — drives the Archive / Unarchive toggle label.
  const archivedForMe = !!message.archived;

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

  // Phase G9.R8 — handlers. All three delegate to parent for refresh-semantics:
  // archive + ack mutate the backend and the parent refreshes the list so the
  // chip/badge disappears from the message list without a page reload.
  const handleArchiveToggle = async () => {
    if (!onArchiveToggle) return;
    await onArchiveToggle(message._id, !archivedForMe);
  };
  const handleAcknowledge = async () => {
    if (!onAcknowledge) return;
    await onAcknowledge(message._id);
  };
  const handleViewReceipts = async () => {
    if (!onViewReceipts) return;
    setReceiptsLoading(true);
    try {
      const data = await onViewReceipts(message._id);
      setReceipts(data || null);
    } finally {
      setReceiptsLoading(false);
    }
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
            {/* Phase G9.R8 — ack status chip next to the other tags. */}
            {mustAck && !ackedByMe && (
              <span className="itv-tag ack-required" title="This message requires explicit acknowledgement.">
                ⚑ Ack required
              </span>
            )}
            {mustAck && ackedByMe && (
              <span className="itv-tag ack-done" title={ackedAt ? `Acknowledged ${fmt(ackedAt)}` : 'Acknowledged'}>
                <CheckCircle size={10} /> Acknowledged
              </span>
            )}
            <span>{message.senderName || 'System'} · {fmt(message.createdAt)}</span>
            {/* Phase G9.R8 — header archive toggle (per-recipient). */}
            {onArchiveToggle && (
              <button
                type="button"
                className="itv-btn secondary"
                style={{ minHeight: '32px', padding: '4px 10px' }}
                disabled={busy}
                onClick={handleArchiveToggle}
                title={archivedForMe ? 'Restore to inbox (my view only)' : 'Archive — hides from my inbox (others unaffected)'}
              >
                {archivedForMe ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                {archivedForMe ? 'Unarchive' : 'Archive'}
              </button>
            )}
            {onClose && (
              <button type="button" className="itv-btn secondary" style={{ marginLeft: 'auto', minHeight: '32px', padding: '4px 10px' }} onClick={onClose}>
                <X size={14} /> Close
              </button>
            )}
          </div>
        </div>

        {/* Phase G9.R8 — acknowledge banner. Sits between header and the
            action row so users can't miss it. Hidden if already ack'd. */}
        {mustAck && !ackedByMe && (
          <div className="itv-ack-banner" role="alert">
            <strong>Please acknowledge this message.</strong>
            <span>
              {actionGated
                ? 'Clicking Acknowledge unlocks the action buttons below.'
                : 'The sender is tracking read-receipts for compliance.'}
            </span>
            <button
              type="button"
              className="itv-btn primary"
              disabled={busy || !onAcknowledge}
              onClick={handleAcknowledge}
            >
              <CheckCircle size={14} /> I acknowledge
            </button>
          </div>
        )}

        {(actionRow.length > 0 || completed || canViewReceipts) && (
          <div className="itv-actions">
            {actionRow.map((a) => {
              // Phase G9.R8 — gate non-ack actions behind acknowledgement.
              // Acknowledge itself is NEVER gated (clicking it IS the ack).
              const gatedHere = actionGated && a.code !== 'acknowledge';
              return (
                <button
                  key={a.code}
                  type="button"
                  className={`itv-btn ${a.variant}`}
                  disabled={busy || gatedHere}
                  title={gatedHere ? 'Acknowledge this message first' : undefined}
                  onClick={() => handleClick(a)}
                >
                  {a.code === 'open_link' && <ExternalLink size={14} />}
                  {a.label}
                </button>
              );
            })}
            {payload?.deep_link && actionType !== 'open_link' && (
              <a href={payload.deep_link} className="itv-btn secondary" target="_self" rel="noreferrer">
                <ExternalLink size={14} /> Open source
              </a>
            )}
            {completed && (
              <span className="itv-actiondone">✓ Completed {fmt(completedAt)}</span>
            )}
            {/* Phase G9.R8 — sender/admin Read-Receipts link. */}
            {canViewReceipts && (
              <button
                type="button"
                className="itv-btn secondary"
                style={{ marginLeft: 'auto' }}
                disabled={busy || receiptsLoading}
                onClick={handleViewReceipts}
                title="See who has acknowledged this message"
              >
                <Users size={14} /> {receiptsLoading ? 'Loading…' : 'Read receipts'}
              </button>
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

        {/* Phase G9.R8 — Read-receipts modal (sender/admin only). Shows
            the full audit split: who acknowledged (with timestamp) and who
            is still pending. Sourced from GET /messages/:id/ack-status via
            onViewReceipts. Dismissed on backdrop click or close button. */}
        {receipts && (
          <div className="itv-receipts-modal" onClick={(e) => { if (e.target.className === 'itv-receipts-modal') setReceipts(null); }}>
            <div className="itv-receipts-card">
              <h4>Read receipts — {receipts.title || message.title}</h4>
              <div className="rcpt-meta">
                {receipts.is_broadcast ? 'Broadcast' : 'Direct message'} · {receipts.acknowledged?.length || 0} of {receipts.total || 0} acknowledged
              </div>
              <div className="rcpt-grid">
                <div className="rcpt-col acked">
                  <h5>Acknowledged ({receipts.acknowledged?.length || 0})</h5>
                  <ul>
                    {(receipts.acknowledged || []).length === 0 && <li style={{ opacity: 0.6 }}>No one yet.</li>}
                    {(receipts.acknowledged || []).map((r) => (
                      <li key={r.user_id}>
                        <strong>{r.name}</strong>
                        {r.at && <span className="rcpt-when">{fmt(r.at)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rcpt-col pending">
                  <h5>Pending ({receipts.pending?.length || 0})</h5>
                  <ul>
                    {(receipts.pending || []).length === 0 && <li style={{ opacity: 0.6 }}>Everyone has acknowledged.</li>}
                    {(receipts.pending || []).map((r) => (
                      <li key={r.user_id}>{r.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="itv-reason-actions">
                <button type="button" className="itv-btn secondary" onClick={() => setReceipts(null)}>Close</button>
              </div>
            </div>
          </div>
        )}

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
