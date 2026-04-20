/**
 * InboxFolderNav — Phase G9.R5
 *
 * Vertical folder list (desktop) / horizontal scroll bar (mobile). Folder
 * codes are sourced from /api/messages/folders so subscribers can rename
 * labels or add new folders via Control Center → Lookup Tables (Rule #3).
 */
import { Inbox, Bell, ClipboardCheck, ListChecks, Sparkles, Megaphone, MessagesSquare, Send, Archive } from 'lucide-react';

const ICON_BY_CODE = {
  INBOX: Inbox,
  ACTION_REQUIRED: Bell,
  APPROVALS: ClipboardCheck,
  TASKS: ListChecks,
  AI_AGENT_REPORTS: Sparkles,
  ANNOUNCEMENTS: Megaphone,
  CHAT: MessagesSquare,
  SENT: Send,
  ARCHIVE: Archive,
};

const styles = `
  .ifn-wrap { display: flex; flex-direction: column; gap: 4px; padding: 12px; }
  .ifn-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; cursor: pointer; border: 0; background: transparent; color: #334155; width: 100%; text-align: left; font-size: 13px; font-weight: 600; min-height: 44px; transition: background 120ms ease; }
  .ifn-item:hover { background: #f1f5f9; }
  .ifn-item.active { background: #2563eb; color: #fff; }
  .ifn-item.active:hover { background: #1d4ed8; }
  .ifn-icon { width: 18px; height: 18px; flex-shrink: 0; }
  .ifn-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ifn-badges { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .ifn-badge { background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; min-width: 22px; text-align: center; }
  .ifn-item.active .ifn-badge { background: #fff; color: #1d4ed8; }
  .ifn-badge.action { background: #fee2e2; color: #b91c1c; }
  .ifn-item.active .ifn-badge.action { background: #fff; color: #b91c1c; }
  /* Phase G9.R8 — Unacknowledged chip (⚑ N). Amber so it is distinct from the
     blue unread count and the red action-required count; same visual pattern
     as the must-acknowledge header chip in InboxThreadView. */
  .ifn-badge.ack { background: #fef3c7; color: #92400e; }
  .ifn-item.active .ifn-badge.ack { background: #fff; color: #92400e; }
  body.dark-mode .ifn-item { color: #cbd5e1; }
  body.dark-mode .ifn-item:hover { background: #1e293b; }
  body.dark-mode .ifn-badge { background: #1e293b; color: #cbd5e1; }
  body.dark-mode .ifn-badge.ack { background: #78350f; color: #fef3c7; }
  @media (max-width: 767px) {
    .ifn-wrap { flex-direction: row; overflow-x: auto; padding: 8px; gap: 6px; -webkit-overflow-scrolling: touch; }
    .ifn-item { min-width: 140px; flex-shrink: 0; min-height: 44px; }
  }
`;

export default function InboxFolderNav({ folders, activeFolder, counts, onSelect }) {
  const list = (folders || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  // Phase G9.R8 — INBOX now displays two chips when relevant: unread (blue)
  // and unacknowledged (amber ⚑). counts.unacknowledged is a global number
  // (must_acknowledge=true AND current user not in acknowledgedBy) computed
  // by the backend aggregation — not scoped to the folder, so we only show
  // it on INBOX to avoid double-counting across folders.
  const countFor = (code) => {
    const c = counts || {};
    if (code === 'ACTION_REQUIRED') return c.action_required || 0;
    if (code === 'INBOX') return c.unread || 0;
    return c[code.toLowerCase()] || 0;
  };
  const ackCountFor = (code) => {
    if (code !== 'INBOX') return 0;
    return (counts && counts.unacknowledged) || 0;
  };

  return (
    <>
      <style>{styles}</style>
      <nav className="ifn-wrap" aria-label="Inbox folders">
        {list.map((f) => {
          const Icon = ICON_BY_CODE[f.code] || Inbox;
          const isActive = activeFolder === f.code;
          const count = countFor(f.code);
          const ackCount = ackCountFor(f.code);
          const isAction = f.code === 'ACTION_REQUIRED';
          return (
            <button
              key={f.code}
              type="button"
              className={`ifn-item${isActive ? ' active' : ''}`}
              onClick={() => onSelect(f.code)}
              title={f.description || f.label}
            >
              <Icon className="ifn-icon" />
              <span className="ifn-label">{f.label}</span>
              {(count > 0 || ackCount > 0) && (
                <span className="ifn-badges">
                  {ackCount > 0 && (
                    <span
                      className="ifn-badge ack"
                      aria-label={`${ackCount} unacknowledged`}
                      title={`${ackCount} message${ackCount === 1 ? '' : 's'} awaiting acknowledgement`}
                    >
                      {'\u2691 '}{ackCount > 99 ? '99+' : ackCount}
                    </span>
                  )}
                  {count > 0 && (
                    <span className={`ifn-badge${isAction ? ' action' : ''}`}>
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
