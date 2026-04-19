/**
 * TaskMiniEditor — Phase G9.E (inline drop-in)
 *
 * Compact task editor meant to render inside the unified InboxPage's thread
 * pane when the selected MessageInbox row points at a Task (folder=TASKS).
 * Mirrors Odoo's "Activities" side-pane: inline edits save immediately via
 * the existing PATCH /erp/tasks/:id endpoint — no duplicated logic, no new
 * backend routes (Rule #20).
 *
 * Full-featured edit (bulk ops, Gantt, advanced filters) stays on
 * /erp/tasks — this component is deliberately minimal.
 *
 * Props:
 *   task         — Task object (required). Falsy = shows empty-state.
 *   onChange     — (updatedTask) => void. Fired after every successful save
 *                  so the parent can refresh its list/thread indicator.
 *   onClose      — () => void. If provided, renders an X button in the header.
 *   onOpenFull   — (task) => void. Overrides the default behaviour of the
 *                  "Open full page" action (which navigates to /erp/tasks).
 *   threadSlot   — optional React node. The G9 InboxPage can inject a real
 *                  MessageInbox thread (messages linked via source_module=
 *                  'TASKS' + source_doc_id=task._id) here; when absent the
 *                  section renders a harmless placeholder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useErpApi from '../hooks/useErpApi';
import userService from '../../services/userService';
import { showError, showSuccess } from '../utils/errorToast';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
// G10.C.1 fallback if the RESPONSIBILITY_TAG lookup hasn't seeded yet
// (e.g. very first admin action pre-login). Backend always returns the
// authoritative list via GET /erp/tasks/... — this is a safety net only.
const TAG_FALLBACK = ['BDM', 'PRESIDENT', 'EBDM', 'OM'];

const styles = `
  .tme-wrap { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 12px; padding: 14px 16px; font-size: 13px; color: var(--erp-text,#111); display: flex; flex-direction: column; gap: 12px; }
  .tme-head { display: flex; align-items: flex-start; gap: 10px; }
  .tme-head-main { flex: 1; min-width: 0; }
  .tme-title { font-size: 15px; font-weight: 700; margin: 0; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; }
  .tme-sub { font-size: 11px; color: var(--erp-muted,#6b7280); margin-top: 3px; display: flex; gap: 10px; flex-wrap: wrap; }
  .tme-overdue { background: #fee2e2; color: #991b1b; padding: 1px 6px; border-radius: 4px; font-weight: 600; }
  .tme-close { background: transparent; border: 0; color: var(--erp-muted,#6b7280); font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 6px; border-radius: 4px; }
  .tme-close:hover { background: #f3f4f6; }
  .tme-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
  .tme-field { display: flex; flex-direction: column; gap: 3px; }
  .tme-field label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--erp-muted,#6b7280); }
  .tme-field select, .tme-field input, .tme-field textarea { padding: 6px 9px; border: 1px solid var(--erp-border,#e5e7eb); border-radius: 7px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text,#111); font-family: inherit; }
  .tme-field textarea { resize: vertical; min-height: 70px; }
  .tme-desc { grid-column: 1 / -1; }
  .tme-assignee { grid-column: 1 / -1; }
  .tme-assignee-row { display: flex; align-items: center; gap: 8px; }
  .tme-assignee-row .tme-current { flex: 1; padding: 6px 9px; border: 1px dashed var(--erp-border,#e5e7eb); border-radius: 7px; color: var(--erp-muted,#6b7280); font-size: 12px; }
  .tme-actions { display: flex; gap: 6px; flex-wrap: wrap; border-top: 1px solid var(--erp-border,#e5e7eb); padding-top: 10px; }
  .tme-btn { padding: 6px 11px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--erp-border,#e5e7eb); background: var(--erp-panel,#fff); color: var(--erp-text,#111); }
  .tme-btn.primary { background: var(--erp-accent,#2563eb); color: #fff; border-color: var(--erp-accent,#2563eb); }
  .tme-btn.ghost { background: transparent; }
  .tme-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .tme-saving { font-size: 11px; color: var(--erp-muted,#6b7280); margin-left: auto; align-self: center; }
  .tme-saved { color: #15803d; }
  .tme-thread { border-top: 1px solid var(--erp-border,#e5e7eb); padding-top: 10px; }
  .tme-thread h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--erp-muted,#6b7280); margin: 0 0 6px; font-weight: 700; }
  .tme-thread-empty { font-size: 12px; color: var(--erp-muted,#6b7280); font-style: italic; padding: 8px 0; }
  .tme-empty { padding: 30px; text-align: center; color: var(--erp-muted,#6b7280); font-size: 13px; }
  .tme-kpi-badge { display: inline-flex; align-items: center; gap: 4px; background: var(--erp-accent-soft,#eef2ff); color: var(--erp-accent,#2563eb); padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; }
  .tme-tag-row { display: flex; flex-wrap: wrap; gap: 4px; }
  .tme-tag { background: #e0e7ff; color: #312e81; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; letter-spacing: 0.02em; display: inline-flex; align-items: center; gap: 3px; }
  .tme-tag button { background: transparent; border: 0; color: inherit; cursor: pointer; font-size: 13px; line-height: 1; padding: 0; opacity: 0.7; }
  .tme-tag button:hover { opacity: 1; }
  .tme-tag-add { display: inline-flex; align-items: center; gap: 4px; }
  .tme-tag-add select { font-size: 11px; padding: 3px 6px; border: 1px dashed var(--erp-border,#e5e7eb); border-radius: 8px; background: transparent; color: var(--erp-muted,#6b7280); cursor: pointer; }
  @media (max-width: 520px) { .tme-grid { grid-template-columns: 1fr; } }
`;

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function toDateInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isOverdue(t) {
  if (!t?.due_date || t.status === 'DONE' || t.status === 'CANCELLED') return false;
  return new Date(t.due_date) < new Date();
}
function assigneeLabel(a) {
  if (!a) return 'Unassigned';
  if (typeof a === 'string') return a;
  return a.full_name || a.name || a.email || 'User';
}

export default function TaskMiniEditor({ task, onChange, onClose, onOpenFull, threadSlot }) {
  // Draft buffers so uncommitted edits don't flash back to server values
  // between a change event and the response arriving.
  const [desc, setDesc] = useState(task?.description || '');
  const [due, setDue] = useState(toDateInput(task?.due_date));
  const dueRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [showReassign, setShowReassign] = useState(false);
  const [users, setUsers] = useState(null);   // null = not fetched yet
  const [usersLoading, setUsersLoading] = useState(false);
  // G10.C.1 — responsibility_tags picklist sourced from RESPONSIBILITY_TAG
  // lookup. Lazy-loaded once per editor mount; cached in component state.
  const [tagOptions, setTagOptions] = useState(null);

  const api = useErpApi();

  // Sync drafts when parent swaps tasks. Intentionally keyed on _id only —
  // keying on description/due_date would clobber live typing whenever the
  // parent re-renders with a fresh task object reference.
  useEffect(() => {
    setDesc(task?.description || '');
    setDue(toDateInput(task?.due_date));
    setShowReassign(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?._id]);

  const patch = useCallback(async (body, successMsg) => {
    if (!task?._id) return;
    setSaving(true);
    try {
      const res = await api.patch(`/tasks/${task._id}`, body);
      const next = res?.data || { ...task, ...body };
      setSavedAt(Date.now());
      if (successMsg) showSuccess(successMsg);
      onChange?.(next);
      return next;
    } catch (err) {
      showError(err, 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }, [api, task, onChange]);

  const handleStatus = (e) => patch({ status: e.target.value });
  const handlePriority = (e) => patch({ priority: e.target.value });
  const handleDueCommit = () => {
    const current = toDateInput(task?.due_date);
    if (due === current) return;
    patch({ due_date: due || null });
  };
  const handleDescCommit = () => {
    if ((desc || '') === (task?.description || '')) return;
    patch({ description: desc });
  };

  const handleMarkDone = () => patch({ status: 'DONE' }, 'Task marked done');
  const handleReschedule = () => {
    setSavedAt(0);
    dueRef.current?.focus();
    // Opening the native picker is gated behind user gesture in some browsers;
    // focusing is the reliable path.
    try { dueRef.current?.showPicker?.(); } catch { /* older browsers */ }
  };

  const loadUsers = useCallback(async () => {
    if (users || usersLoading) return;
    setUsersLoading(true);
    try {
      const res = await userService.getAll({ limit: 200 });
      const list = res?.data || [];
      setUsers(Array.isArray(list) ? list : []);
    } catch (err) {
      showError(err, 'Failed to load users');
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [users, usersLoading]);

  const handleReassignOpen = async () => {
    setShowReassign(v => !v);
    if (!showReassign) await loadUsers();
  };
  const handleReassignPick = async (rawValue) => {
    setShowReassign(false);
    if (!rawValue) return; // placeholder
    const uid = rawValue === '__NONE__' ? null : rawValue;
    await patch({ assignee_user_id: uid }, uid ? 'Task reassigned' : 'Assignee cleared');
  };

  // G10.C.1 — responsibility_tags load + add/remove. Uses backend lookup
  // as source of truth (admin-editable per entity). Fallback handles the
  // very-first-read window before the lazy-seed round-trip lands.
  const loadTagOptions = useCallback(async () => {
    if (tagOptions !== null) return;
    try {
      // Lookups are mounted under /api/lookup (CRM) or /api/erp/lookup (ERP).
      // We read via /api — task endpoints don't expose RESPONSIBILITY_TAG
      // yet; fall back to the known defaults if the fetch fails.
      const res = await api.get('/lookup?category=RESPONSIBILITY_TAG');
      const rows = Array.isArray(res?.data) ? res.data : [];
      const codes = rows.filter(r => r.is_active !== false).map(r => String(r.code).toUpperCase());
      setTagOptions(codes.length ? codes : TAG_FALLBACK);
    } catch {
      setTagOptions(TAG_FALLBACK);
    }
  }, [api, tagOptions]);

  const currentTags = Array.isArray(task?.responsibility_tags) ? task.responsibility_tags : [];
  const handleAddTag = async (tag) => {
    if (!tag || currentTags.includes(tag)) return;
    const next = [...currentTags, tag];
    await patch({ responsibility_tags: next });
  };
  const handleRemoveTag = async (tag) => {
    const next = currentTags.filter(t => t !== tag);
    await patch({ responsibility_tags: next });
  };

  const handleOpenFull = () => {
    if (onOpenFull) return onOpenFull(task);
    if (typeof window !== 'undefined') {
      window.location.href = `/erp/tasks#${task._id}`;
    }
  };

  const savedFresh = savedAt && Date.now() - savedAt < 3500;
  const overdue = useMemo(() => isOverdue(task), [task]);

  if (!task) {
    return (
      <>
        <style>{styles}</style>
        <div className="tme-wrap"><div className="tme-empty">Select a task to view.</div></div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="tme-wrap">
        <div className="tme-head">
          <div className="tme-head-main">
            <h3 className="tme-title" title={task.title}>{task.title}</h3>
            <div className="tme-sub">
              <span>Created by {assigneeLabel(task.created_by)}</span>
              <span>Due {fmtDate(task.due_date)}</span>
              {overdue && <span className="tme-overdue">OVERDUE</span>}
              {task.growth_driver_code && (
                <span className="tme-kpi-badge" title="Growth driver">
                  {task.growth_driver_code.replace(/_/g, ' ')}
                </span>
              )}
              {task.kpi_code && (
                <span className="tme-kpi-badge" title="KPI">KPI · {task.kpi_code}</span>
              )}
              {task.goal_period && (
                <span className="tme-kpi-badge" title="Goal period">{task.goal_period}</span>
              )}
            </div>
          </div>
          {onClose && (
            <button type="button" className="tme-close" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        <div className="tme-grid">
          <div className="tme-field">
            <label>Status</label>
            <select value={task.status} onChange={handleStatus} disabled={saving}>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="tme-field">
            <label>Priority</label>
            <select value={task.priority} onChange={handlePriority} disabled={saving}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="tme-field">
            <label>Due date</label>
            <input
              ref={dueRef}
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={handleDueCommit}
              disabled={saving}
            />
          </div>
          <div className="tme-field">
            <label>Assignee</label>
            <div className="tme-assignee-row">
              <span className="tme-current">{assigneeLabel(task.assignee_user_id)}</span>
            </div>
          </div>

          <div className="tme-field tme-desc">
            <label>Description</label>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={handleDescCommit}
              placeholder="Notes, context, links…"
              maxLength={5000}
              disabled={saving}
            />
          </div>

          <div className="tme-field tme-desc">
            <label>Owners (responsibility tags)</label>
            <div className="tme-tag-row">
              {currentTags.length === 0 && (
                <span style={{ fontSize: 11, color: 'var(--erp-muted,#6b7280)', fontStyle: 'italic' }}>
                  No owners tagged yet
                </span>
              )}
              {currentTags.map(t => (
                <span key={t} className="tme-tag">
                  {t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    disabled={saving}
                    aria-label={`Remove ${t}`}
                  >×</button>
                </span>
              ))}
              <span className="tme-tag-add">
                <select
                  value=""
                  disabled={saving}
                  onFocus={loadTagOptions}
                  onChange={(e) => { handleAddTag(e.target.value); e.target.value = ''; }}
                >
                  <option value="">+ Add tag</option>
                  {(tagOptions || TAG_FALLBACK)
                    .filter(t => !currentTags.includes(t))
                    .map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </span>
            </div>
          </div>
        </div>

        {showReassign && (
          <div className="tme-field tme-assignee">
            <label>Reassign to</label>
            <select
              defaultValue=""
              onChange={(e) => handleReassignPick(e.target.value)}
              disabled={usersLoading}
            >
              <option value="" disabled>{usersLoading ? 'Loading…' : 'Select a user'}</option>
              <option value="__NONE__">— Unassigned —</option>
              {(users || []).map(u => (
                <option key={u._id} value={u._id}>
                  {u.full_name || u.name || u.email}{u.role ? ` · ${u.role}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="tme-actions">
          {task.status !== 'DONE' && (
            <button type="button" className="tme-btn primary" onClick={handleMarkDone} disabled={saving}>
              Mark done
            </button>
          )}
          <button type="button" className="tme-btn" onClick={handleReassignOpen} disabled={saving}>
            {showReassign ? 'Cancel reassign' : 'Reassign'}
          </button>
          <button type="button" className="tme-btn" onClick={handleReschedule} disabled={saving}>
            Reschedule
          </button>
          <button type="button" className="tme-btn ghost" onClick={handleOpenFull}>
            Open full page
          </button>
          <span className={`tme-saving${savedFresh ? ' tme-saved' : ''}`}>
            {saving ? 'Saving…' : savedFresh ? 'Saved' : ''}
          </span>
        </div>

        <div className="tme-thread">
          <h4>Thread</h4>
          {threadSlot || (
            <div className="tme-thread-empty">
              No thread yet. Replies linked to this task will appear here once the inbox is wired up.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
