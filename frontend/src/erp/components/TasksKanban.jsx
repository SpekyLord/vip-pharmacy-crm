/**
 * TasksKanban — Phase G10.F
 *
 * Five-column Kanban board keyed on Task.status. Drag a card between
 * columns → PATCH /erp/tasks/:id with { status: <newCol> }. Optimistic UI
 * with revert on failure. Reuses TaskMiniEditor in a side drawer (same as
 * TasksGantt — Rule #20, no parallel detail view).
 *
 * Props mirror TasksGantt so the parent TasksPage can swap tabs without
 * re-fetching:
 *   scope        — 'mine' | 'created' | 'all'. Default 'mine'.
 *   statusFilter — if set, restrict to that column only (hides others)
 *   onTaskUpdated — cascades to parent + dispatches inbox:updated
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import useErpApi from '../hooks/useErpApi';
import { showError } from '../utils/errorToast';
import TaskMiniEditor from './TaskMiniEditor';

const COLUMNS = [
  { key: 'OPEN',         label: 'Open' },
  { key: 'IN_PROGRESS',  label: 'In Progress' },
  { key: 'BLOCKED',      label: 'Blocked' },
  { key: 'DONE',         label: 'Done' },
  { key: 'CANCELLED',    label: 'Cancelled' },
];

const styles = `
  .kbn-wrap { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 12px; padding: 12px; overflow-x: auto; }
  .kbn-board { display: grid; grid-template-columns: repeat(5, minmax(220px, 1fr)); gap: 10px; min-width: 900px; }
  .kbn-col { background: var(--erp-accent-soft,#eef2ff); border-radius: 10px; display: flex; flex-direction: column; min-height: 200px; max-height: 70vh; }
  .kbn-col.drag-over { outline: 2px dashed var(--erp-accent,#2563eb); outline-offset: -4px; }
  .kbn-col-header { padding: 10px 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--erp-text,#111); border-bottom: 1px solid var(--erp-border,#e5e7eb); display: flex; justify-content: space-between; align-items: center; }
  .kbn-col-count { background: #fff; border: 1px solid var(--erp-border,#e5e7eb); border-radius: 10px; padding: 1px 8px; font-weight: 600; color: var(--erp-muted,#6b7280); font-size: 11px; }
  .kbn-col-body { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .kbn-card { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 8px; padding: 8px 10px; cursor: grab; font-size: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
  .kbn-card:active { cursor: grabbing; }
  .kbn-card:hover { box-shadow: 0 3px 8px rgba(0,0,0,0.08); }
  .kbn-card-title { font-weight: 600; color: var(--erp-text,#111); margin-bottom: 4px; word-wrap: break-word; }
  .kbn-card-meta { display: flex; gap: 6px; flex-wrap: wrap; font-size: 10px; color: var(--erp-muted,#6b7280); align-items: center; }
  .kbn-chip { background: var(--erp-accent-soft,#eef2ff); color: var(--erp-accent,#2563eb); padding: 1px 6px; border-radius: 6px; font-weight: 600; letter-spacing: 0.02em; }
  .kbn-chip.tag { background: #e0e7ff; color: #312e81; }
  .kbn-chip.overdue { background: #fee2e2; color: #991b1b; }
  .kbn-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: var(--erp-panel,#fff); border-left: 1px solid var(--erp-border,#e5e7eb); box-shadow: -4px 0 12px rgba(0,0,0,0.08); padding: 16px; overflow-y: auto; z-index: 50; }
  .kbn-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.22); z-index: 49; }
  .kbn-empty { padding: 30px 10px; text-align: center; color: var(--erp-muted,#6b7280); font-size: 11px; font-style: italic; }
  @media (max-width: 640px) {
    .kbn-board { grid-template-columns: repeat(5, 85vw); scroll-snap-type: x mandatory; }
    .kbn-col { scroll-snap-align: start; }
  }
`;

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function isOverdue(t) {
  if (!t?.due_date || t.status === 'DONE' || t.status === 'CANCELLED') return false;
  return new Date(t.due_date) < new Date();
}

export default function TasksKanban({ scope = 'mine', goalPeriod, onTaskUpdated }) {
  const api = useErpApi();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('scope', scope);
      qs.set('limit', '200');
      if (goalPeriod) qs.set('goal_period', goalPeriod);
      const res = await api.get(`/tasks?${qs.toString()}`);
      setTasks(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      showError(err, 'Failed to load Kanban data');
    } finally {
      setLoading(false);
    }
  }, [api, scope, goalPeriod]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const grouped = useMemo(() => {
    const out = Object.fromEntries(COLUMNS.map(c => [c.key, []]));
    for (const t of tasks) {
      const key = out[t.status] ? t.status : 'OPEN';
      out[key].push(t);
    }
    return out;
  }, [tasks]);

  // Drag & drop — optimistic patch, revert on failure. We don't persist
  // position within a column (YAGNI — no `sort_index` field). Drop on
  // column simply flips status.
  const handleDragStart = (id) => setDraggedId(id);
  const handleDragEnd = () => { setDraggedId(null); setDragOverCol(null); };
  const handleDragOver = (e, colKey) => { e.preventDefault(); setDragOverCol(colKey); };
  const handleDragLeave = () => setDragOverCol(null);
  const handleDrop = async (e, colKey) => {
    e.preventDefault();
    setDragOverCol(null);
    const id = draggedId;
    setDraggedId(null);
    if (!id) return;
    const task = tasks.find(t => String(t._id) === String(id));
    if (!task || task.status === colKey) return;

    // Optimistic update
    const prevStatus = task.status;
    setTasks(ts => ts.map(t => (String(t._id) === String(id) ? { ...t, status: colKey } : t)));
    try {
      const res = await api.patch(`/tasks/${id}`, { status: colKey });
      const saved = res?.data || { ...task, status: colKey };
      setTasks(ts => ts.map(t => (String(t._id) === String(id) ? saved : t)));
      onTaskUpdated?.(saved);
      try { window.dispatchEvent(new Event('inbox:updated')); } catch { /* noop */ }
    } catch (err) {
      showError(err, 'Could not move task');
      // Revert
      setTasks(ts => ts.map(t => (String(t._id) === String(id) ? { ...t, status: prevStatus } : t)));
    }
  };

  const handleTaskChanged = (updated) => {
    setSelectedTask(updated);
    setTasks(ts => ts.map(t => (String(t._id) === String(updated._id) ? updated : t)));
    onTaskUpdated?.(updated);
    try { window.dispatchEvent(new Event('inbox:updated')); } catch { /* noop */ }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="kbn-wrap" role="region" aria-label="Tasks Kanban board">
        {loading && <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginBottom: 6 }}>Loading…</div>}
        <div className="kbn-board">
          {COLUMNS.map(col => {
            const items = grouped[col.key] || [];
            return (
              <div
                key={col.key}
                className={`kbn-col${dragOverCol === col.key ? ' drag-over' : ''}`}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="kbn-col-header">
                  <span>{col.label}</span>
                  <span className="kbn-col-count">{items.length}</span>
                </div>
                <div className="kbn-col-body">
                  {items.length === 0 && <div className="kbn-empty">No tasks</div>}
                  {items.map(t => {
                    const overdueFlag = isOverdue(t);
                    const due = fmtDate(t.due_date);
                    const tags = Array.isArray(t.responsibility_tags) ? t.responsibility_tags : [];
                    return (
                      <div
                        key={t._id}
                        className="kbn-card"
                        draggable
                        onDragStart={() => handleDragStart(t._id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedTask(t)}
                      >
                        <div className="kbn-card-title">{t.title}</div>
                        <div className="kbn-card-meta">
                          {t.growth_driver_code && (
                            <span className="kbn-chip">{t.growth_driver_code.replace(/_/g, ' ')}</span>
                          )}
                          {tags.slice(0, 2).map(tag => (
                            <span key={tag} className="kbn-chip tag">{tag}</span>
                          ))}
                          {tags.length > 2 && <span className="kbn-chip tag">+{tags.length - 2}</span>}
                          {due && <span className={overdueFlag ? 'kbn-chip overdue' : ''}>Due {due}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTask && (
        <>
          <div className="kbn-drawer-backdrop" onClick={() => setSelectedTask(null)} />
          <div className="kbn-drawer" role="dialog" aria-label="Task detail">
            <TaskMiniEditor
              task={selectedTask}
              onChange={handleTaskChanged}
              onClose={() => setSelectedTask(null)}
            />
          </div>
        </>
      )}
    </>
  );
}
