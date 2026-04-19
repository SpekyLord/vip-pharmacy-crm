/**
 * TasksPage — Phase G8 (P2-9)
 *
 * List + create + manage tasks. Backs the Secretary Copilot tools
 * (CREATE_TASK, LIST_OVERDUE_ITEMS). Entity-scoped via req.entityId on
 * the backend; this page just displays what the API returns.
 *
 * Scopes:
 *   "My tasks"    — tasks I own or created (default)
 *   "Created"     — tasks I created (regardless of assignee)
 *   "All entity"  — privileged roles only (president / admin / finance / ceo)
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import WorkflowGuide from '../components/WorkflowGuide';
import useErpApi from '../hooks/useErpApi';
import { useAuth } from '../../hooks/useAuth';
import { showError, showSuccess } from '../utils/errorToast';

const styles = `
  .tsk-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .tsk-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .tsk-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 14px; }
  .tsk-panel { background: var(--erp-panel,#fff); border: 1px solid var(--erp-border); border-radius: 14px; padding: 16px; margin-bottom: 14px; }
  .tsk-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .tsk-filters select, .tsk-filters input { padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .tsk-form { display: grid; gap: 10px; grid-template-columns: 2fr 1fr 1fr 140px auto; align-items: end; }
  .tsk-form label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; }
  .tsk-form input, .tsk-form select, .tsk-form textarea { width: 100%; padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel,#fff); color: var(--erp-text); }
  .tsk-form textarea { grid-column: 1 / -1; min-height: 60px; }
  .tsk-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tsk-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft,#eef2ff); font-weight: 600; font-size: 12px; color: var(--erp-text); white-space: nowrap; }
  .tsk-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); }
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

export default function TasksPage() {
  const api = useErpApi();
  const { user } = useAuth();
  const isPrivileged = ['president', 'ceo', 'admin', 'finance'].includes(String(user?.role || '').toLowerCase());

  const [tasks, setTasks] = useState([]);
  const [scope, setScope] = useState('mine');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', due_date: '', priority: 'normal' });
  const [busy, setBusy] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const params = { scope };
      if (statusFilter) params.status = statusFilter;
      if (overdueOnly) params.overdue_only = 'true';
      const qs = new URLSearchParams(params).toString();
      const res = await api.get(`/tasks?${qs}`);
      setTasks(res?.data || []);
    } catch (err) {
      showError(err, 'Failed to load tasks');
    }
  }, [api, scope, statusFilter, overdueOnly]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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
      });
      setNewTask({ title: '', description: '', due_date: '', priority: 'normal' });
      showSuccess('Task created');
      await fetchTasks();
    } catch (err) {
      showError(err, 'Failed to create task');
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (id, status) => {
    try {
      await api.patch(`/tasks/${id}`, { status });
      await fetchTasks();
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
    } catch (err) {
      showError(err, 'Failed to delete');
    }
  };

  return (
    <>
      <style>{styles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <main className="tsk-main">
          <div className="tsk-header">
            <h1>My Tasks</h1>
            <p>Personal + delegated task list. Create here, or ask the Copilot: &quot;create a task to X by Friday&quot;.</p>
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
                  placeholder="e.g. Sign rent renewal"
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label>Due date</label>
                <input
                  type="date"
                  value={newTask.due_date}
                  onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                />
              </div>
              <div>
                <label>Priority</label>
                <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
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

          <div className="tsk-panel">
            <div className="tsk-filters">
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="mine">My tasks</option>
                <option value="created">Tasks I created</option>
                {isPrivileged && <option value="all">All entity tasks</option>}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Any status</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--erp-text)' }}>
                <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                Overdue only
              </label>
            </div>

            {tasks.length === 0 ? (
              <div className="empty">No tasks. Add one above, or say &quot;create a task&quot; to the Copilot.</div>
            ) : (
              <table className="tsk-table">
                <thead>
                  <tr>
                    <th>Title</th>
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
                    return (
                      <tr key={t._id}>
                        <td>
                          <strong>{t.title}</strong>
                          {t.description ? <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 2 }}>{t.description.slice(0, 120)}</div> : null}
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
        </main>
      </div>
    </>
  );
}
