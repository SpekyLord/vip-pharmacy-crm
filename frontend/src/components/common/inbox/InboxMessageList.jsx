/**
 * InboxMessageList — Phase G9.R5
 *
 * Compact list of inbox rows. Sender, title, snippet, time, badges
 * (priority/action). Selecting a row hands off to the parent (which mounts
 * the thread/task view).
 */
import { AlertCircle, MailOpen, Mail } from 'lucide-react';

const styles = `
  .iml-list { display: flex; flex-direction: column; gap: 2px; padding: 8px; }
  .iml-row { display: flex; gap: 12px; padding: 12px 14px; border-radius: 10px; cursor: pointer; align-items: flex-start; background: #fff; border: 1px solid transparent; transition: background 120ms ease; min-height: 60px; }
  .iml-row:hover { background: #f8fafc; }
  .iml-row.active { background: #eff6ff; border-color: #bfdbfe; }
  .iml-row.unread { background: #f8fbff; }
  .iml-row.unread.active { background: #dbeafe; }
  .iml-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: #e0f2fe; color: #075985; font-weight: 700; font-size: 13px; }
  .iml-row.unread .iml-icon { background: #2563eb; color: #fff; }
  .iml-body { flex: 1; min-width: 0; }
  .iml-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; flex-wrap: wrap; }
  .iml-sender { font-size: 13px; font-weight: 700; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 50%; }
  .iml-time { font-size: 11px; color: #94a3b8; margin-left: auto; }
  .iml-title { font-size: 13px; color: #1f2937; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px; }
  .iml-row.unread .iml-title { font-weight: 800; }
  .iml-snippet { font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .iml-tags { display: flex; gap: 4px; flex-shrink: 0; }
  .iml-tag { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.03em; }
  .iml-tag.action { background: #fee2e2; color: #b91c1c; }
  .iml-tag.high { background: #fef3c7; color: #92400e; }
  .iml-tag.important { background: #ede9fe; color: #5b21b6; }
  .iml-empty { padding: 40px 16px; text-align: center; color: #94a3b8; font-size: 13px; }
  body.dark-mode .iml-row { background: #0f172a; }
  body.dark-mode .iml-row:hover { background: #1e293b; }
  body.dark-mode .iml-row.unread { background: #142036; }
  body.dark-mode .iml-row.active { background: #1e3a5f; border-color: #1d4ed8; }
  body.dark-mode .iml-sender, body.dark-mode .iml-title { color: #f1f5f9; }
  body.dark-mode .iml-snippet { color: #94a3b8; }
  @media (max-width: 767px) {
    .iml-row { min-height: 60px; }
    .iml-sender { max-width: 40%; }
  }
`;

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor((now - d) / (24 * 60 * 60 * 1000));
  if (diffDays < 7) return d.toLocaleDateString('en-PH', { weekday: 'short' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function senderInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join('') || '?';
}

function snippet(body) {
  if (!body) return '';
  const cleaned = String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 140);
}

export default function InboxMessageList({ messages, activeId, onSelect, loading }) {
  if (loading && (!messages || messages.length === 0)) {
    return (
      <>
        <style>{styles}</style>
        <div className="iml-empty">Loading…</div>
      </>
    );
  }
  if (!messages || messages.length === 0) {
    return (
      <>
        <style>{styles}</style>
        <div className="iml-empty">No messages in this folder.</div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <ul className="iml-list" role="listbox" aria-label="Messages">
        {messages.map((m) => {
          const isUnread = !m.read;
          const isActive = String(activeId) === String(m._id);
          const showAction = m.requires_action && !m.action_completed_at;
          const Icon = isUnread ? Mail : MailOpen;
          return (
            <li
              key={m._id}
              role="option"
              aria-selected={isActive}
              className={`iml-row${isUnread ? ' unread' : ''}${isActive ? ' active' : ''}`}
              onClick={() => onSelect(m)}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(m); } }}
            >
              <div className="iml-icon" title={m.senderName}>
                {showAction ? <AlertCircle size={16} /> : (isUnread ? <Icon size={16} /> : senderInitials(m.senderName))}
              </div>
              <div className="iml-body">
                <div className="iml-meta">
                  <span className="iml-sender">{m.senderName || 'System'}</span>
                  <div className="iml-tags">
                    {showAction && <span className="iml-tag action">Action</span>}
                    {m.priority === 'high' && <span className="iml-tag high">High</span>}
                    {m.priority === 'important' && <span className="iml-tag important">!</span>}
                  </div>
                  <span className="iml-time">{fmtTime(m.createdAt)}</span>
                </div>
                <div className="iml-title">{m.title}</div>
                <div className="iml-snippet">{snippet(m.body)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
