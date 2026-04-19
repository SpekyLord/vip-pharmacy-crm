/**
 * TasksGantt — Phase G10.C (+ C.1 responsibility-tag chips + C.2 inbox sync)
 *
 * Custom CSS-grid Gantt for /erp/tasks. Renders 5 POA driver rows
 * (HOSPITAL_ACCREDITATION, PRODUCT_INCLUSION, INVENTORY_OPTIMIZATION,
 * DEMAND_PULL, PRICE_INCREASE) with revenue-band chips from the
 * GROWTH_DRIVER lookup metadata. Driver order is driven by
 * metadata.po_a_order (backend pre-sorts the groups).
 *
 * No new dependency — pure CSS grid + inline styles. Bar click opens the
 * existing TaskMiniEditor in a side drawer (Rule #20 — no parallel detail
 * view). After each in-drawer save, the component dispatches the global
 * `inbox:updated` DOM event so the NotificationBell + InboxPage refresh
 * without a manual reload.
 *
 * Data source: GET /api/erp/tasks/by-driver?scope=…&goal_period=…
 * Returns: [{ code, label, metadata, tasks: [...] }] — groups WITH zero
 * tasks are filtered out server-side, but we still hide any empty driver
 * that creeps in client-side (defensive).
 *
 * Props:
 *   scope        — 'mine' | 'created' | 'all' (privileged). Default 'mine'.
 *   goalPeriod   — filter by goal_period (e.g. '2026-Q1'). Optional.
 *   zoom         — 'week' | 'month' | 'quarter'. Default 'month'.
 *   onTaskUpdated — (task) => void. Fires after every TaskMiniEditor save
 *                   so parent can refresh list/Kanban/RevenueBridge in
 *                   lockstep.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import useErpApi from '../hooks/useErpApi';
import { showError } from '../utils/errorToast';
import TaskMiniEditor from './TaskMiniEditor';

const styles = `
  .gnt-wrap { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border,#e5e7eb); border-radius: 12px; padding: 12px; overflow-x: auto; }
  .gnt-controls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
  .gnt-controls label { font-size: 11px; color: var(--erp-muted,#6b7280); text-transform: uppercase; font-weight: 600; }
  .gnt-controls select { padding: 4px 8px; border: 1px solid var(--erp-border,#e5e7eb); border-radius: 6px; font-size: 12px; background: var(--erp-panel,#fff); color: var(--erp-text,#111); }
  .gnt-header-row { display: grid; grid-template-columns: 240px 1fr; font-size: 11px; color: var(--erp-muted,#6b7280); border-bottom: 1px solid var(--erp-border,#e5e7eb); padding: 6px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .gnt-months { display: grid; position: relative; }
  .gnt-month-cell { border-left: 1px solid var(--erp-border,#e5e7eb); padding: 2px 6px; font-size: 11px; }
  .gnt-group { margin-top: 8px; }
  .gnt-group-header { display: flex; align-items: center; gap: 8px; padding: 8px 4px; background: var(--erp-accent-soft,#eef2ff); border-left: 3px solid var(--erp-accent,#2563eb); font-size: 13px; font-weight: 700; color: var(--erp-text,#111); }
  .gnt-group-header .gnt-band { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--erp-muted,#6b7280); background: #fff; border: 1px solid var(--erp-border,#e5e7eb); padding: 2px 8px; border-radius: 10px; }
  .gnt-group-header .gnt-count { font-size: 11px; color: var(--erp-muted,#6b7280); font-weight: 500; }
  .gnt-row { display: grid; grid-template-columns: 240px 1fr; align-items: center; border-bottom: 1px dashed var(--erp-border,#e5e7eb); min-height: 32px; }
  .gnt-row:hover { background: rgba(37,99,235,0.03); }
  .gnt-label { padding: 4px 6px; font-size: 12px; color: var(--erp-text,#111); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; gap: 6px; align-items: center; min-width: 0; }
  .gnt-label-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .gnt-tag-chips { display: inline-flex; gap: 3px; flex-shrink: 0; }
  .gnt-tag-chip { background: #e0e7ff; color: #312e81; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 6px; letter-spacing: 0.03em; }
  .gnt-tag-chip.more { background: #f3f4f6; color: #6b7280; }
  .gnt-track { position: relative; height: 24px; border-left: 1px solid var(--erp-border,#e5e7eb); background-image: linear-gradient(to right, transparent 95%, var(--erp-border,#e5e7eb) 95%); }
  .gnt-bar { position: absolute; top: 4px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 600; cursor: pointer; padding: 0 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
  .gnt-bar.OPEN { background: var(--erp-status-open, #3b82f6); }
  .gnt-bar.IN_PROGRESS { background: var(--erp-status-in-progress, #f59e0b); }
  .gnt-bar.BLOCKED { background: var(--erp-status-blocked, #ef4444); }
  .gnt-bar.DONE { background: var(--erp-status-done, #22c55e); }
  .gnt-bar.CANCELLED { background: var(--erp-status-cancelled, #9ca3af); }
  .gnt-bar.overdue { outline: 2px solid #991b1b; outline-offset: -2px; }
  .gnt-bar:hover { filter: brightness(1.08); box-shadow: 0 2px 6px rgba(0,0,0,0.18); }
  .gnt-today { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(220,38,38,0.5); pointer-events: none; z-index: 2; }
  .gnt-empty { padding: 40px; text-align: center; color: var(--erp-muted,#6b7280); font-size: 13px; }
  .gnt-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: var(--erp-panel,#fff); border-left: 1px solid var(--erp-border,#e5e7eb); box-shadow: -4px 0 12px rgba(0,0,0,0.08); padding: 16px; overflow-y: auto; z-index: 50; }
  .gnt-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.22); z-index: 49; }
  @media (max-width: 640px) {
    .gnt-row, .gnt-header-row { grid-template-columns: 140px 1fr; }
    .gnt-label { font-size: 11px; }
    .gnt-drawer { width: 100%; }
  }
`;

// ── Date / month helpers ────────────────────────────────────────────────
function startOfMonth(d) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }
function isOverdue(t) {
  if (!t?.due_date || t.status === 'DONE' || t.status === 'CANCELLED') return false;
  return new Date(t.due_date) < new Date();
}
function taskRange(t) {
  const start = t.start_date ? new Date(t.start_date) : (t.createdAt ? new Date(t.createdAt) : null);
  const end = t.due_date ? new Date(t.due_date) : null;
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  // Normalize order — if someone put due_date before start_date, swap.
  return start <= end ? { start, end } : { start: end, end: start };
}
function formatBand(meta) {
  if (!meta) return null;
  const min = Number(meta.revenue_band_min), max = Number(meta.revenue_band_max);
  if (!Number.isFinite(min) && !Number.isFinite(max)) return null;
  if (min === max) return `${min}M`;
  return `${min}\u2013${max}M`;
}

export default function TasksGantt({ scope = 'mine', goalPeriod, zoom: initialZoom = 'month', onTaskUpdated }) {
  const api = useErpApi();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(initialZoom);
  const [selectedTask, setSelectedTask] = useState(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('scope', scope);
      if (goalPeriod) qs.set('goal_period', goalPeriod);
      const res = await api.get(`/tasks/by-driver?${qs.toString()}`);
      setGroups(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      showError(err, 'Failed to load Gantt data');
    } finally {
      setLoading(false);
    }
  }, [api, scope, goalPeriod]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // Compute the horizontal axis — derive from the data (earliest start →
  // latest due). Clamp to 4–24 months so very short or very sprawling
  // datasets still render sensibly. Quarter zoom groups 3 months per cell.
  const axis = useMemo(() => {
    const allRanges = groups.flatMap(g => (g.tasks || []).map(taskRange)).filter(Boolean);
    let min, max;
    if (allRanges.length) {
      min = allRanges.reduce((acc, r) => (!acc || r.start < acc) ? r.start : acc, null);
      max = allRanges.reduce((acc, r) => (!acc || r.end > acc) ? r.end : acc, null);
    } else {
      min = startOfMonth(new Date());
      max = addMonths(min, 11);
    }
    const axisStart = startOfMonth(min);
    const axisEndRaw = startOfMonth(addMonths(max, 1));
    const monthCount = Math.max(
      4,
      Math.min(24,
        (axisEndRaw.getFullYear() - axisStart.getFullYear()) * 12 + (axisEndRaw.getMonth() - axisStart.getMonth())
      )
    );
    const axisEnd = addMonths(axisStart, monthCount);
    const totalMs = axisEnd - axisStart;
    const months = [];
    for (let i = 0; i < monthCount; i++) {
      const m = addMonths(axisStart, i);
      months.push({ label: m.toLocaleString('en-PH', { month: 'short', year: i === 0 || m.getMonth() === 0 ? '2-digit' : undefined }), start: m, end: addMonths(m, 1) });
    }
    return { axisStart, axisEnd, totalMs, months, monthCount };
  }, [groups]);

  // Zoom: month view = one column per month (default); week view = 4 cells
  // per month; quarter view = one cell per 3 months. We only change the
  // rendered header ticks — the bar math always uses axisStart/totalMs.
  const headerCells = useMemo(() => {
    if (zoom === 'week') return axis.months.flatMap(m => [0,1,2,3].map(w => ({ label: `W${w+1}`, month: m.label })));
    if (zoom === 'quarter') {
      const out = [];
      for (let i = 0; i < axis.months.length; i += 3) {
        const first = axis.months[i];
        if (!first) break;
        out.push({ label: `Q${Math.floor(first.start.getMonth() / 3) + 1} ${first.start.getFullYear()}`, month: '' });
      }
      return out;
    }
    return axis.months.map(m => ({ label: m.label, month: '' }));
  }, [axis, zoom]);

  const todayPct = useMemo(() => {
    const now = Date.now();
    if (now < axis.axisStart.getTime() || now > axis.axisEnd.getTime()) return null;
    return ((now - axis.axisStart.getTime()) / axis.totalMs) * 100;
  }, [axis]);

  function barStyle(range) {
    const startPct = Math.max(0, ((range.start - axis.axisStart) / axis.totalMs) * 100);
    const endPct = Math.min(100, ((range.end - axis.axisStart) / axis.totalMs) * 100);
    const width = Math.max(1, endPct - startPct);
    return { left: `${startPct}%`, width: `${width}%` };
  }

  // G10.C.2 — cascade task updates to parent + dispatch inbox:updated so
  // NotificationBell + InboxPage refresh without a manual reload.
  const handleTaskChanged = (updated) => {
    fetchGroups();
    onTaskUpdated?.(updated);
    try { window.dispatchEvent(new Event('inbox:updated')); } catch { /* SSR or sandbox */ }
  };

  const visibleGroups = groups.filter(g => Array.isArray(g.tasks) && g.tasks.length > 0);

  return (
    <>
      <style>{styles}</style>
      <div className="gnt-wrap" role="region" aria-label="Tasks Gantt">
        <div className="gnt-controls">
          <label>Zoom</label>
          <select value={zoom} onChange={(e) => setZoom(e.target.value)}>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
          </select>
          {loading && <span style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Loading…</span>}
        </div>

        <div className="gnt-header-row">
          <div>Driver / Task</div>
          <div
            className="gnt-months"
            style={{ gridTemplateColumns: `repeat(${headerCells.length}, 1fr)` }}
          >
            {headerCells.map((c, i) => (
              <div key={i} className="gnt-month-cell">{c.label}</div>
            ))}
          </div>
        </div>

        {!loading && visibleGroups.length === 0 && (
          <div className="gnt-empty">
            No tasks to chart. Tag tasks with a <strong>growth driver</strong> + <strong>dates</strong> to see them here.
          </div>
        )}

        {visibleGroups.map(group => (
          <div className="gnt-group" key={group.code || 'none'}>
            <div className="gnt-group-header">
              <span>{group.label}</span>
              <span className="gnt-count">· {group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}</span>
              {formatBand(group.metadata) && (
                <span className="gnt-band">band: {formatBand(group.metadata)}</span>
              )}
            </div>
            {group.tasks.map(t => {
              const range = taskRange(t);
              const overdueFlag = isOverdue(t);
              const tags = Array.isArray(t.responsibility_tags) ? t.responsibility_tags : [];
              const tagsVisible = tags.slice(0, 3);
              const tagsOverflow = tags.length - tagsVisible.length;
              return (
                <div key={t._id} className="gnt-row">
                  <div className="gnt-label" title={t.title}>
                    <span className="gnt-label-title">{t.milestone_label || t.title}</span>
                    {tags.length > 0 && (
                      <span className="gnt-tag-chips">
                        {tagsVisible.map(tag => <span key={tag} className="gnt-tag-chip">{tag}</span>)}
                        {tagsOverflow > 0 && <span className="gnt-tag-chip more">+{tagsOverflow}</span>}
                      </span>
                    )}
                  </div>
                  <div className="gnt-track">
                    {todayPct != null && <div className="gnt-today" style={{ left: `${todayPct}%` }} />}
                    {range && (
                      <div
                        className={`gnt-bar ${t.status}${overdueFlag ? ' overdue' : ''}`}
                        style={barStyle(range)}
                        onClick={() => setSelectedTask(t)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedTask(t); }}
                        title={`${t.title} (${t.status})`}
                      >
                        {t.status === 'DONE' ? '✓ ' : ''}{t.title}
                      </div>
                    )}
                    {!range && (
                      <span style={{ position: 'absolute', left: 8, top: 4, fontSize: 11, color: 'var(--erp-muted)', fontStyle: 'italic' }}>
                        No start/due dates
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selectedTask && (
        <>
          <div className="gnt-drawer-backdrop" onClick={() => setSelectedTask(null)} />
          <div className="gnt-drawer" role="dialog" aria-label="Task detail">
            <TaskMiniEditor
              task={selectedTask}
              onChange={(updated) => {
                setSelectedTask(updated);
                handleTaskChanged(updated);
              }}
              onClose={() => setSelectedTask(null)}
            />
          </div>
        </>
      )}
    </>
  );
}
