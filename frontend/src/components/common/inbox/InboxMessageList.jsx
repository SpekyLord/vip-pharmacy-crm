/**
 * InboxMessageList — Phase G9.R5 → R8 (Apr 2026)
 *
 * Compact list of inbox rows. Sender, title, snippet, time, badges
 * (priority/action/ack). Selecting a row hands off to the parent.
 *
 * Phase G9.R8 additions:
 *   - Bulk mode (enabled via `bulkMode` prop) — shows a checkbox on each row
 *     and a sticky toolbar with "Mark all as read" + "Archive selected".
 *   - "⚑ Ack required" chip when message.must_acknowledge && !acknowledged_by_me.
 *   - The bulk toolbar is rendered inline with the list so it stays visible
 *     while scrolling (sticky top: 0).
 */
import { useMemo, useState } from 'react';
import { AlertCircle, MailOpen, Mail, CheckSquare, Square, Archive, CheckCheck, ListChecks, X } from 'lucide-react';

const styles = `
  .iml-toolbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: #fff; border-bottom: 1px solid #e5e7eb; }
  body.dark-mode .iml-toolbar { background: #0f172a; border-color: #1e293b; }
  .iml-toolbar-btn { padding: 6px 10px; font-size: 12px; font-weight: 700; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; min-height: 32px; }
  .iml-toolbar-btn:hover:not(:disabled) { background: #f1f5f9; }
  .iml-toolbar-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .iml-toolbar-btn.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
  .iml-toolbar-btn.primary:hover:not(:disabled) { background: #1d4ed8; }
  body.dark-mode .iml-toolbar-btn { background: #1e293b; color: #cbd5e1; border-color: #334155; }
  .iml-selected-count { font-size: 12px; color: #64748b; margin-left: auto; }
  .iml-list { display: flex; flex-direction: column; gap: 2px; padding: 8px; }
  .iml-row { display: flex; gap: 12px; padding: 12px 14px; border-radius: 10px; cursor: pointer; align-items: flex-start; background: #fff; border: 1px solid transparent; transition: background 120ms ease; min-height: 60px; }
  .iml-row:hover { background: #f8fafc; }
  .iml-row.active { background: #eff6ff; border-color: #bfdbfe; }
  .iml-row.unread { background: #f8fbff; }
  .iml-row.unread.active { background: #dbeafe; }
  .iml-row.bulk-selected { background: #dbeafe; border-color: #2563eb; }
  .iml-checkbox { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; flex-shrink: 0; margin-top: 2px; color: #64748b; }
  .iml-checkbox:hover { color: #2563eb; }
  .iml-checkbox.checked { color: #2563eb; }
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
  .iml-tag.ack { background: #fef3c7; color: #92400e; display: inline-flex; align-items: center; gap: 3px; }
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
    .iml-toolbar-btn { min-height: 40px; padding: 8px 12px; }
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

export default function InboxMessageList({
  messages,
  activeId,
  onSelect,
  loading,
  // Phase G9.R8 props — all optional so parent callers that don't pass them
  // get the legacy non-bulk behavior unchanged.
  onMarkAllRead,         // () => Promise — marks every message in the folder read
  onBulkArchive,         // (ids: string[]) => Promise — archives selected
  busy,                  // disables toolbar buttons while a bulk op runs
}) {
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelected = (id, e) => {
    if (e) e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelected(new Set((messages || []).map((m) => String(m._id))));
  };
  const clearSelected = () => setSelected(new Set());
  const exitBulkMode = () => { setBulkMode(false); clearSelected(); };

  const handleBulkArchive = async () => {
    if (!onBulkArchive || selected.size === 0) return;
    await onBulkArchive([...selected]);
    clearSelected();
    setBulkMode(false);
  };

  const selectedCount = selected.size;
  const canBulkArchive = !!onBulkArchive;
  const canMarkAllRead = !!onMarkAllRead;
  const hasAnyBulkAction = canBulkArchive || canMarkAllRead;

  // Sticky toolbar — always visible whether or not bulk mode is active so the
  // user can discover the entry point ("Select") + the two primary bulk ops.
  const toolbar = useMemo(() => {
    if (!hasAnyBulkAction) return null;
    return (
      <div className="iml-toolbar" role="toolbar" aria-label="Bulk actions">
        {bulkMode ? (
          <>
            <button
              type="button"
              className="iml-toolbar-btn"
              onClick={selectAllVisible}
              disabled={busy || (messages || []).length === 0}
              title="Select every message in this folder view"
            >
              <CheckSquare size={14} /> Select all
            </button>
            <button
              type="button"
              className="iml-toolbar-btn primary"
              onClick={handleBulkArchive}
              disabled={busy || selectedCount === 0 || !canBulkArchive}
              title={canBulkArchive ? 'Archive selected (per-recipient — only hides from your inbox)' : 'Bulk archive not available here'}
            >
              <Archive size={14} /> Archive selected
            </button>
            <span className="iml-selected-count">{selectedCount} selected</span>
            <button
              type="button"
              className="iml-toolbar-btn"
              onClick={exitBulkMode}
              disabled={busy}
              title="Exit bulk selection"
            >
              <X size={14} /> Done
            </button>
          </>
        ) : (
          <>
            {canMarkAllRead && (
              <button
                type="button"
                className="iml-toolbar-btn"
                onClick={onMarkAllRead}
                disabled={busy || (messages || []).length === 0}
                title="Mark every message in the current folder as read"
              >
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
            {canBulkArchive && (
              <button
                type="button"
                className="iml-toolbar-btn"
                onClick={() => setBulkMode(true)}
                disabled={busy}
                title="Enter selection mode to archive several at once"
              >
                <ListChecks size={14} /> Select
              </button>
            )}
          </>
        )}
      </div>
    );
    // `handleBulkArchive` intentionally closed-over — re-computing the toolbar
    // each render is cheaper than the memo churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkMode, selectedCount, busy, messages, canBulkArchive, canMarkAllRead, onMarkAllRead]);

  if (loading && (!messages || messages.length === 0)) {
    return (
      <>
        <style>{styles}</style>
        {toolbar}
        <div className="iml-empty">Loading…</div>
      </>
    );
  }
  if (!messages || messages.length === 0) {
    return (
      <>
        <style>{styles}</style>
        {toolbar}
        <div className="iml-empty">No messages in this folder.</div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      {toolbar}
      <ul className="iml-list" role="listbox" aria-label="Messages">
        {messages.map((m) => {
          const id = String(m._id);
          const isUnread = !m.read;
          const isActive = String(activeId) === id;
          const showAction = m.requires_action && !m.action_completed_at;
          const Icon = isUnread ? Mail : MailOpen;
          const ackNeeded = m.must_acknowledge && !m.acknowledged_by_me;
          const isSelected = selected.has(id);
          const rowClass = [
            'iml-row',
            isUnread && 'unread',
            isActive && !bulkMode && 'active',
            bulkMode && isSelected && 'bulk-selected',
          ].filter(Boolean).join(' ');

          const onRowClick = bulkMode
            ? () => toggleSelected(id)
            : () => onSelect(m);

          return (
            <li
              key={m._id}
              role="option"
              aria-selected={isActive || isSelected}
              className={rowClass}
              onClick={onRowClick}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(); } }}
            >
              {bulkMode && (
                <div
                  className={`iml-checkbox${isSelected ? ' checked' : ''}`}
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={(e) => toggleSelected(id, e)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelected(id, e); } }}
                  tabIndex={0}
                  title={isSelected ? 'Deselect' : 'Select'}
                >
                  {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                </div>
              )}
              <div className="iml-icon" title={m.senderName}>
                {showAction ? <AlertCircle size={16} /> : (isUnread ? <Icon size={16} /> : senderInitials(m.senderName))}
              </div>
              <div className="iml-body">
                <div className="iml-meta">
                  <span className="iml-sender">{m.senderName || 'System'}</span>
                  <div className="iml-tags">
                    {showAction && <span className="iml-tag action">Action</span>}
                    {/* Phase G9.R8 — ack chip. Shown only when ack is required
                        AND the current caller hasn't ack'd yet. */}
                    {ackNeeded && <span className="iml-tag ack" title="Requires your acknowledgement">⚑ Ack</span>}
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
