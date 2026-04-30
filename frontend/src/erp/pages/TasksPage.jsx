/**
 * TasksPage — Phase G8 + G10
 *
 * Full-featured /erp/tasks with four tabs:
 *   [List]         — table + advanced filters + bulk ops + Owners column
 *   [Gantt]        — POA driver timelines (G10.C)
 *   [Kanban]       — drag-to-column status board (G10.F)
 *   [Revenue Bridge] — POA summary + % done per driver (G10.C)
 *
 * Scopes:
 *   "My tasks"    — tasks I own or created (default)
 *   "Created"     — tasks I created (regardless of assignee)
 *   "All entity"  — privileged roles only (president / admin / finance / ceo)
 *
 * Advanced filters (G10.E) — driver / KPI / goal period / assignee /
 * priority / due-date range / free-text search. Driver + KPI options
 * come from the GROWTH_DRIVER + KPI_CODE lookups (subscription-safe).
 *
 * Bulk ops — per-row checkboxes + action bar [Change status] [Change
 * priority] [Delete]. Dispatches `inbox:updated` after every successful
 * batch so the NotificationBell + InboxPage refresh without a reload.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import WorkflowGuide from '../components/WorkflowGuide';
import TasksGantt from '../components/TasksGantt';
import TasksKanban from '../components/TasksKanban';
import RevenueBridge from '../components/RevenueBridge';
import useErpApi from '../hooks/useErpApi';
import { useAuth } from '../../hooks/useAuth';
import { showError, showSuccess } from '../utils/errorToast';

const styles = `
  .tsk-main { flex: 1; min-width: 0; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .tsk-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .tsk-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 14px; }
  .tsk-panel { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .tsk-tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--erp-border,#e5e7eb); margin-bottom: 14px; flex-wrap: wrap; }
  .tsk-tab { padding: 8px 14px; border: 0; background: transparent; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--erp-muted,#6b7280); border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tsk-tab.active { color: var(--erp-accent,#2563eb); border-bottom-color: var(--erp-accent,#2563eb); }
  .tsk-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
  .tsk-filters select, .tsk-filters input { padding: 6px 9px; border: 1px solid var(--erp-border); border-radius: 7px; font-size: 12px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .tsk-filters label { font-size: 11px; color: var(--erp-muted); font-weight: 600; }
  .tsk-form { display: grid; gap: 10px; grid-template-columns: 2fr 1fr 1fr 1fr 140px auto; align-items: end; }
  .tsk-form label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; }
  .tsk-form input, .tsk-form select, .tsk-form textarea { width: 100%; padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .tsk-form textarea { grid-column: 1 / -1; min-height: 60px; }
  .tsk-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tsk-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft,#eef2ff); font-weight: 600; font-size: 12px; color: var(--erp-text); white-space: nowrap; }
  .tsk-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); vertical-align: top; }
  .tsk-status { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .tsk-status.OPEN { background: #e0f2fe; color: #075985; }
  .tsk-status.IN_PROGRESS { background: #fef3c7; color: #92400e; }
  .tsk-status.BLOCKED { background: #fee2e2; color: #991b1b; }
  .tsk-status.DONE { background: #dcfce7; color: #166534; }
  .tsk-status.CANCELLED { background: #f3f4f6; color: #4b5563; }
  .tsk-priority { font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .tsk-priority.low { color: #6b7280; }
  .tsk-priority.normal { color: #2563eb; }
  .tsk-priority.high { color: #d97706; }
  .tsk-priority.urgent { color: #dc2626; }
  .tsk-overdue { color: #dc2626; font-weight: 600; }
  .tsk-btn { padding: 6px 12px; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; background: var(--erp-accent,#2563eb); color: #fff; }
  .tsk-btn.secondary { background: #f3f4f6; color: var(--erp-text); border: 1px solid var(--erp-border); }
  .tsk-btn.danger { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .tsk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .tsk-bulk-bar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; background: var(--erp-accent-soft,#eef2ff); border-radius: 8px; margin-bottom: 10px; flex-wrap: wrap; }
  .tsk-bulk-bar .spacer { flex: 1; }
  .tsk-chip { background: var(--erp-accent-soft,#eef2ff); color: var(--erp-accent,#2563eb); padding: 1px 7px; border-radius: 8px; font-size: 10px; font-weight: 700; margin-right: 3px; letter-spacing: 0.02em; }
  .tsk-chip.owner { background: #e0e7ff; color: #312e81; }
  .empty { text-align: center; padding: 30px; color: var(--erp-muted); font-size: 13px; }
  @media(max-width: 640px) {
    .tsk-form { grid-template-columns: 1fr; }
    .tsk-main { padding: 10px; }
    .tsk-table th, .tsk-table td { padding: 6px; font-size: 12px; }
  }
`;

const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function isOverdue(t) {
  if (!t.due_date || t.status === 'DONE' || t.status === 'CANCELLED') return false;
  return new Date(t.due_date) < new Date();
}
function dispatchInboxUpdated() {
  try { window.dispatchEvent(new Event('inbox:updated')); } catch { /* SSR / sandbox */ }
}

export default function TasksPage() {
  const api = useErpApi();
  const { user } = useAuth();
  const isPrivileged = ['president', 'ceo', 'admin', 'finance'].includes(String(user?.role || '').toLowerCase());

  // G10 — four tabs
  const [view, setView] = useState('list');

  // Core state
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '', priority: 'normal', growth_driver_code: '', kpi_code: '', goal_period: '' });

  // Shared filters
  const [scope, setScope] = useState('mine');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // G10 — advanced filters
  const [driverFilter, setDriverFilter] = useState('');
  const [kpiFilter, setKpiFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [search, setSearch] = useState('');

  // Lookup-backed option lists (GROWTH_DRIVER + KPI_CODE)
  const [drivers, setDrivers] = useState([]);
  const [kpiCodes, setKpiCodes] = useState([]);

  // G10.E — bulk selection (list-view-only)
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── Load driver + KPI lookups once ────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [d, k] = await Promise.all([
          api.get('/tasks/drivers'),
          api.get('/tasks/kpi-codes'),
        ]);
        setDrivers(Array.isArray(d?.data) ? d.data : []);
        setKpiCodes(Array.isArray(k?.data) ? k.data : []);
      } catch {
        // Non-fatal — filters just show an empty dropdown.
      }
    })();
  }, [api]);

  const kpiOptionsForDriver = useMemo(() => {
    if (!driverFilter) return kpiCodes;
    return kpiCodes.filter(k => String(k.metadata?.driver || '').toUpperCase() === driverFilter);
  }, [kpiCodes, driverFilter]);

  // ── Task list fetch ───────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('scope', scope);
      if (statusFilter) params.set('status', statusFilter);
      if (overdueOnly) params.set('overdue_only', 'true');
      if (driverFilter) params.set('growth_driver_code', driverFilter);
      if (kpiFilter) params.set('kpi_code', kpiFilter);
      if (periodFilter) params.set('goal_period', periodFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (dueFrom) params.set('due_from', dueFrom);
      if (dueTo) params.set('due_to', dueTo);
      if (search) params.set('q', search);
      const res = await api.get(`/tasks?${params.toString()}`);
      setTasks(res?.data || []);
      // Drop selections that reference rows no longer visible.
      const visibleIds = new Set((res?.data || []).map(t => String(t._id)));
      setSelectedIds(prev => new Set([...prev].filter(id => visibleIds.has(id))));
    } catch (err) {
      showError(err, 'Failed to load tasks');
    }
  }, [api, scope, statusFilter, overdueOnly, driverFilter, kpiFilter, periodFilter, priorityFilter, dueFrom, dueTo, search]);

  useEffect(() => { if (view === 'list') fetchTasks(); }, [fetchTasks, view]);

  // ── Create ────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;
    setBusy(true);
    try {
      await api.post('/tasks', {
        title: newTask.title,
        description: newTask.description,
        due_date: newTask.due_date || null,
        priority: newTask.priority,
        // G10 — optional KPI linkage from the create form
        growth_driver_code: newTask.growth_driver_code || null,
        kpi_code: newTask.kpi_code || null,
        goal_period: newTask.goal_period || null,
      });
      setNewTask({ title: '', description: '', due_date: '', priority: 'normal', growth_driver_code: '', kpi_code: '', goal_period: '' });
      showSuccess('Task created');
      await fetchTasks();
    } catch (err) {
      showError(err, 'Failed to create task');
    } finally {
      setBusy(false);
    }
  };

  // ── Per-row actions ──────────────────────────────────────────────────
  const handleStatus = async (id, status) => {
    try {
      await api.patch(`/tasks/${id}`, { status });
      await fetchTasks();
      dispatchInboxUpdated();
    } catch (err) {
      showError(err, 'Failed to update status');
    }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${id}`);
      showSuccess('Task deleted');
      await fetchTasks();
      dispatchInboxUpdated();
    } catch (err) {
      showError(err, 'Failed to delete');
    }
  };

  // ── G10.E — bulk ops ─────────────────────────────────────────────────
  const allVisibleChecked = tasks.length > 0 && tasks.every(t => selectedIds.has(String(t._id)));
  const someChecked = selectedIds.size > 0;
  const toggleRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllVisible = () => {
    if (allVisibleChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map(t => String(t._id))));
    }
  };
  const bulkUpdate = async (patch, label) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      const res = await api.post('/tasks/bulk-update', { ids, patch });
      const updated = res?.updated || 0;
      const errs = Array.isArray(res?.errors) ? res.errors.length : 0;
      showSuccess(`${label}: ${updated} updated${errs ? `, ${errs} failed` : ''}`);
      setSelectedIds(new Set());
      await fetchTasks();
      dispatchInboxUpdated();
    } catch (err) {
      showError(err, `Bulk ${label} failed`);
    }
  };
  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}?`)) return;
    try {
      const res = await api.post('/tasks/bulk-delete', { ids });
      const del = res?.deleted || 0;
      const errs = Array.isArray(res?.errors) ? res.errors.length : 0;
      showSuccess(`Deleted ${del}${errs ? `, ${errs} failed` : ''}`);
      setSelectedIds(new Set());
      await fetchTasks();
      dispatchInboxUpdated();
    } catch (err) {
      showError(err, 'Bulk delete failed');
    }
  };

  // Goal-period options — derive from existing tasks + allow free entry.
  const knownPeriods = useMemo(() => {
    const s = new Set();
    tasks.forEach(t => { if (t.goal_period) s.add(t.goal_period); });
    return [...s].sort();
  }, [tasks]);

  // ── Tab content routing ──────────────────────────────────────────────
  const gridTab = (
    <div className="tsk-panel">
      <div className="tsk-filters">
        <label>Scope</label>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="mine">My tasks</option>
          <option value="created">Tasks I created</option>
          {isPrivileged && <option value="all">All entity tasks</option>}
        </select>

        <label>Status</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">Any</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label>Driver</label>
        <select value={driverFilter} onChange={(e) => { setDriverFilter(e.target.value); setKpiFilter(''); }}>
          <option value="">Any</option>
          {drivers.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
        </select>

        <label>KPI</label>
        <select value={kpiFilter} onChange={(e) => setKpiFilter(e.target.value)}>
          <option value="">Any</option>
          {kpiOptionsForDriver.map(k => <option key={k.code} value={k.code}>{k.code}</option>)}
        </select>

        <label>Period</label>
        <input
          type="text"
          placeholder="2026-Q1"
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value.toUpperCase())}
          list="tsk-periods"
          style={{ width: 90 }}
        />
        <datalist id="tsk-periods">
          {knownPeriods.map(p => <option key={p} value={p} />)}
        </datalist>

        <label>Priority</label>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">Any</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <label>Due</label>
        <input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
        <span style={{ fontSize: 11, color: 'var(--erp-muted)' }}>→</span>
        <input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />

        <input
          type="search"
          placeholder="Search title/description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 160 }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
      </div>

      {someChecked && (
        <div className="tsk-bulk-bar" role="region" aria-label="Bulk actions">
          <strong>{selectedIds.size} selected</strong>
          <select defaultValue="" onChange={(e) => { if (e.target.value) { bulkUpdate({ status: e.target.value }, 'Status changed'); e.target.value = ''; } }}>
            <option value="">Change status…</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select defaultValue="" onChange={(e) => { if (e.target.value) { bulkUpdate({ priority: e.target.value }, 'Priority changed'); e.target.value = ''; } }}>
            <option value="">Change priority…</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="tsk-btn danger" onClick={bulkDelete}>Delete</button>
          <span className="spacer" />
          <button className="tsk-btn secondary" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="empty">No tasks match the current filters.</div>
      ) : (
        <table className="tsk-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  aria-label="Select all visible"
                  onChange={toggleAllVisible}
                />
              </th>
              <th>Title</th>
              <th>Driver / KPI</th>
              <th>Owners</th>
              <th>Assignee</th>
              <th>Due</th>
              <th>Priority</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => {
              const assignee = t.assignee_user_id?.full_name || t.assignee_user_id?.name || 'Unassigned';
              const overdue = isOverdue(t);
              const tags = Array.isArray(t.responsibility_tags) ? t.responsibility_tags : [];
              const rowSelected = selectedIds.has(String(t._id));
              return (
                <tr key={t._id} style={rowSelected ? { background: 'rgba(37,99,235,0.05)' } : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={rowSelected}
                      onChange={() => toggleRow(String(t._id))}
                      aria-label={`Select ${t.title}`}
                    />
                  </td>
                  <td>
                    <strong>{t.title}</strong>
                    {t.description ? <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 2 }}>{t.description.slice(0, 120)}</div> : null}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {t.growth_driver_code && <span className="tsk-chip">{t.growth_driver_code.replace(/_/g, ' ')}</span>}
                    {t.kpi_code && <span className="tsk-chip">{t.kpi_code}</span>}
                    {t.goal_period && <span className="tsk-chip">{t.goal_period}</span>}
                    {!t.growth_driver_code && !t.kpi_code && !t.goal_period && <span style={{ color: 'var(--erp-muted)' }}>—</span>}
                  </td>
                  <td>
                    {tags.length === 0 ? <span style={{ color: 'var(--erp-muted)' }}>—</span> :
                      tags.map(tag => <span key={tag} className="tsk-chip owner">{tag}</span>)
                    }
                  </td>
                  <td>{assignee}</td>
                  <td className={overdue ? 'tsk-overdue' : ''}>{fmtDate(t.due_date)}{overdue ? ' ⚠' : ''}</td>
                  <td><span className={`tsk-priority ${t.priority}`}>{t.priority}</span></td>
                  <td>
                    <select
                      value={t.status}
                      onChange={(e) => handleStatus(t._id, e.target.value)}
                      className={`tsk-status ${t.status}`}
                      style={{ border: 'none', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, cursor: 'pointer' }}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="tsk-btn danger" onClick={() => handleDelete(t._id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  const ganttTab = <TasksGantt scope={scope} goalPeriod={periodFilter} onTaskUpdated={() => { if (view === 'list') fetchTasks(); }} />;
  const kanbanTab = <TasksKanban scope={scope} goalPeriod={periodFilter} onTaskUpdated={() => { if (view === 'list') fetchTasks(); }} />;
  const bridgeTab = <RevenueBridge goalPeriod={periodFilter} />;

  return (
    <>
      <style>{styles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <main className="tsk-main">
          <div className="tsk-header">
            <h1>Tasks</h1>
            <p>
              POA-aligned task workspace. Tag each task with a growth driver + KPI
              to light up the Gantt, Kanban, and Revenue Bridge views.
            </p>
          </div>

          <WorkflowGuide pageKey="tasks" />

          <div className="tsk-panel">
            <form className="tsk-form" onSubmit={handleCreate}>
              <div>
                <label>Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="e.g. MOA signing — Hospital A"
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label>Driver</label>
                <select
                  value={newTask.growth_driver_code}
                  onChange={(e) => setNewTask({ ...newTask, growth_driver_code: e.target.value, kpi_code: '' })}
                >
                  <option value="">—</option>
                  {drivers.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label>KPI</label>
                <select
                  value={newTask.kpi_code}
                  onChange={(e) => setNewTask({ ...newTask, kpi_code: e.target.value })}
                >
                  <option value="">—</option>
                  {kpiCodes
                    .filter(k => !newTask.growth_driver_code || String(k.metadata?.driver || '').toUpperCase() === newTask.growth_driver_code)
                    .map(k => <option key={k.code} value={k.code}>{k.code}</option>)}
                </select>
              </div>
              <div>
                <label>Period</label>
                <input
                  type="text"
                  placeholder="2026"
                  value={newTask.goal_period}
                  onChange={(e) => setNewTask({ ...newTask, goal_period: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <label>Due / Priority</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  />
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <button className="tsk-btn" type="submit" disabled={busy || !newTask.title.trim()}>
                  {busy ? 'Saving…' : 'Add task'}
                </button>
              </div>
              <textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Description (optional)"
                maxLength={5000}
              />
            </form>
          </div>

          <div className="tsk-tabs" role="tablist">
            <button
              className={`tsk-tab${view === 'list' ? ' active' : ''}`}
              onClick={() => setView('list')}
              role="tab"
              aria-selected={view === 'list'}
            >List</button>
            <button
              className={`tsk-tab${view === 'gantt' ? ' active' : ''}`}
              onClick={() => setView('gantt')}
              role="tab"
              aria-selected={view === 'gantt'}
            >Gantt</button>
            <button
              className={`tsk-tab${view === 'kanban' ? ' active' : ''}`}
              onClick={() => setView('kanban')}
              role="tab"
              aria-selected={view === 'kanban'}
            >Kanban</button>
            <button
              className={`tsk-tab${view === 'bridge' ? ' active' : ''}`}
              onClick={() => setView('bridge')}
              role="tab"
              aria-selected={view === 'bridge'}
            >Revenue Bridge</button>
          </div>

          {view === 'list' && gridTab}
          {view === 'gantt' && ganttTab}
          {view === 'kanban' && kanbanTab}
          {view === 'bridge' && bridgeTab}
        </main>
      </div>
    </>
  );
}
