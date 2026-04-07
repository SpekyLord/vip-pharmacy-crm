/**
 * CSI Booklets Page — Phase 15.2
 * Booklet master, weekly allocation, usage stats
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

const pageStyles = `
  .booklet-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .booklet-shell { display: flex; flex: 1; min-width: 0; }
  .booklet-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; max-width: 1240px; margin: 0 auto; }
  .booklet-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 18px; flex-wrap: wrap; }
  .booklet-header h1 { font-size: 24px; color: var(--erp-text); margin: 0 0 4px; }
  .booklet-header p { color: var(--erp-muted); font-size: 13px; margin: 0; max-width: 680px; line-height: 1.5; }
  .booklet-hero { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr); gap: 14px; margin-bottom: 18px; }
  .booklet-panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 18px; padding: 18px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
  .booklet-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .booklet-kpi { background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid var(--erp-border); border-radius: 14px; padding: 14px; }
  .booklet-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .booklet-kpi-value { font-size: 24px; font-weight: 800; color: var(--erp-text); margin-top: 4px; }
  .booklet-kpi-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .booklet-quick { display: flex; flex-direction: column; gap: 10px; }
  .booklet-quick-note { font-size: 13px; color: var(--erp-muted); line-height: 1.55; }
  .booklet-quick-list { display: grid; gap: 8px; }
  .booklet-quick-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: #f8fafc; border: 1px solid var(--erp-border); font-size: 12px; color: var(--erp-text); }
  .booklet-quick-dot { width: 8px; height: 8px; border-radius: 999px; background: #2563eb; margin-top: 5px; flex-shrink: 0; }
  .form-row { display: grid; grid-template-columns: 1.25fr 0.8fr 0.8fr auto; gap: 10px; align-items: end; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 10px 16px; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn-primary { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 18px; padding: 18px; margin-bottom: 16px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
  .panel-title-row { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; }
  .panel-title-row h3 { margin: 0; font-size: 15px; color: var(--erp-text); }
  .panel-title-row p { margin: 4px 0 0; font-size: 12px; color: var(--erp-muted); line-height: 1.45; }
  .table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid var(--erp-border); }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 10px 10px; background: var(--erp-accent-soft); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--erp-muted); position: sticky; top: 0; z-index: 1; }
  .data-table td { padding: 10px 10px; border-top: 1px solid var(--erp-border); background: var(--erp-panel); vertical-align: top; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-exhausted { background: #fef2f2; color: #991b1b; }
  .badge-void { background: #e2e8f0; color: #475569; }
  .usage-bar { width: 80px; height: 8px; background: #e2e8f0; border-radius: 4px; display: inline-block; }
  .usage-fill { height: 100%; background: #2563eb; border-radius: 4px; }
  .alloc-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--erp-border); }
  .empty-state { text-align: center; color: var(--erp-muted); padding: 28px 16px; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  .booklet-body { display: grid; gap: 16px; }
  @media(max-width: 900px) {
    .booklet-main { padding: 16px; }
    .booklet-hero { grid-template-columns: 1fr; }
    .booklet-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .data-table { font-size: 12px; }
    .panel { padding: 16px; }
    .form-row { grid-template-columns: 1fr 1fr; }
    .form-row .btn { grid-column: 1 / -1; width: 100%; }
  }

  @media(max-width: 768px) {
    .booklet-page { padding-top: 12px; }
    .booklet-main { padding: 76px 12px 96px; }
    .booklet-header h1 { font-size: 20px; }
    .booklet-kpis { grid-template-columns: 1fr 1fr; }
    .form-row { grid-template-columns: 1fr; }
    .form-group input { width: 100%; }
    .btn { width: 100%; }
    .data-table th, .data-table td { padding: 6px 8px; }
    .usage-bar { width: 64px; }
  }

  @media(max-width: 480px) {
    .booklet-page { padding-top: 16px; }
    .booklet-main { padding-top: 72px; padding-bottom: 104px; }
    .booklet-panel { padding: 14px; border-radius: 16px; }
    .booklet-header h1 { font-size: 18px; }
    .booklet-header p { font-size: 12px; }
    .booklet-kpi-value { font-size: 20px; }
    .panel { padding: 12px; border-radius: 14px; }
    .data-table th, .data-table td { padding: 6px; }
  }
`;

export default function CsiBooklets() {
  const { user } = useAuth();
  const rpt = useReports();
  const [booklets, setBooklets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ booklet_code: '', series_start: '', series_end: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [allocForm, setAllocForm] = useState({ week_start: '', week_end: '', range_start: '', range_end: '' });

  const stats = useMemo(() => {
    const total = booklets.length;
    const active = booklets.filter(b => b.status === 'ACTIVE').length;
    const exhausted = booklets.filter(b => b.status === 'EXHAUSTED').length;
    const assigned = booklets.filter(b => !!b.assigned_to).length;
    const used = booklets.reduce((sum, b) => sum + (Number(b.used_count) || 0), 0);
    const totalNumbers = booklets.reduce((sum, b) => sum + (Number(b.total_numbers) || 0), 0);
    const usageRate = totalNumbers > 0 ? Math.round((used / totalNumbers) * 100) : 0;
    return { total, active, exhausted, assigned, used, totalNumbers, usageRate };
  }, [booklets]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await rpt.getCsiBooklets(); setBooklets(res?.data || []); } catch (err) { console.error('[CsiBooklets] load error:', err.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.booklet_code || !form.series_start || !form.series_end) return;
    try {
      await rpt.createBooklet({ booklet_code: form.booklet_code, series_start: Number(form.series_start), series_end: Number(form.series_end) });
      setForm({ booklet_code: '', series_start: '', series_end: '' });
      load();
    } catch (err) { alert(err?.response?.data?.message || err.message || 'Operation failed'); }
  };

  const handleAllocate = async (bookletId) => {
    if (!allocForm.week_start || !allocForm.range_start || !allocForm.range_end) return;
    try {
      await rpt.allocateWeek(bookletId, {
        week_start: allocForm.week_start, week_end: allocForm.week_end,
        range_start: Number(allocForm.range_start), range_end: Number(allocForm.range_end)
      });
      setAllocForm({ week_start: '', week_end: '', range_start: '', range_end: '' });
      load();
    } catch (err) { alert(err?.response?.data?.message || err.message || 'Operation failed'); }
  };

  return (
    <div className="booklet-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="booklet-shell">
        <Sidebar />
        <div className="booklet-main">
          <div className="booklet-header">
            <div>
              <h1>CSI Booklets</h1>
              <p>Manage booklet series, weekly allocations, and number validation from one screen.</p>
            </div>
          </div>

          <div className="booklet-hero">
            <div className="booklet-panel">
              <div className="booklet-kpis">
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Booklets</div>
                  <div className="booklet-kpi-value">{stats.total}</div>
                  <div className="booklet-kpi-sub">Total series created</div>
                </div>
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Active</div>
                  <div className="booklet-kpi-value">{stats.active}</div>
                  <div className="booklet-kpi-sub">Available for allocation</div>
                </div>
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Assigned</div>
                  <div className="booklet-kpi-value">{stats.assigned}</div>
                  <div className="booklet-kpi-sub">Linked to people</div>
                </div>
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Usage</div>
                  <div className="booklet-kpi-value">{stats.usageRate}%</div>
                  <div className="booklet-kpi-sub">Across all numbers</div>
                </div>
              </div>
            </div>

            <div className="booklet-panel booklet-quick">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--erp-text)' }}>What this page does</div>
                <div className="booklet-quick-note">Create booklet ranges, assign weekly allocations, and verify how much of each series has already been consumed.</div>
              </div>
              <div className="booklet-quick-list">
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Create a booklet range first, then allocate week blocks later.</div>
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Use the table below to open one booklet at a time and manage allocations.</div>
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Progress bars show how much of each number series has already been used.</div>
              </div>
            </div>
          </div>

          <div className="booklet-body">
            <div className="panel">
              <div className="panel-title-row">
                <div>
                  <h3>New Booklet</h3>
                  <p>Enter the booklet code and full series range. Keep the range continuous to avoid number gaps.</p>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Booklet Code</label>
                  <input value={form.booklet_code} onChange={e => setForm(f => ({ ...f, booklet_code: e.target.value }))} placeholder="e.g., BK-001" />
                </div>
                <div className="form-group">
                  <label>Series Start</label>
                  <input type="number" value={form.series_start} onChange={e => setForm(f => ({ ...f, series_start: e.target.value }))} placeholder="1001" />
                </div>
                <div className="form-group">
                  <label>Series End</label>
                  <input type="number" value={form.series_end} onChange={e => setForm(f => ({ ...f, series_end: e.target.value }))} placeholder="1100" />
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>Create Booklet</button>
              </div>
            </div>

            {loading && <div className="loading">Loading...</div>}

            <div className="panel">
              <div className="panel-title-row">
                <div>
                  <h3>Booklet Inventory</h3>
                  <p>Open a booklet row to add weekly allocations and monitor usage.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Code</th><th>Series</th><th>Assigned To</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Remaining</th><th>Usage</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {booklets.map(b => [
                        <tr key={b._id}>
                          <td style={{ fontWeight: 700 }}>{b.booklet_code}</td>
                          <td>{b.series_start} - {b.series_end}</td>
                          <td>{b.assigned_to?.full_name || '-'}</td>
                          <td className="num">{b.used_count}</td>
                          <td className="num">{b.remaining_count}</td>
                          <td>
                            <div className="usage-bar">
                              <div className="usage-fill" style={{ width: `${b.total_numbers > 0 ? (b.used_count / b.total_numbers) * 100 : 0}%` }} />
                            </div>
                          </td>
                          <td><span className={`badge badge-${b.status?.toLowerCase()}`}>{b.status}</span></td>
                          <td>
                            <button className="btn btn-sm" onClick={() => setExpandedId(expandedId === b._id ? null : b._id)}>
                              {expandedId === b._id ? 'Close' : 'Allocate'}
                            </button>
                          </td>
                        </tr>,
                        expandedId === b._id && (
                          <tr key={b._id + '-alloc'}>
                            <td colSpan={8}>
                              <div className="alloc-section">
                                <strong style={{ fontSize: 12 }}>Allocations ({(b.allocations || []).length})</strong>
                                {(b.allocations || []).map((a, i) => (
                                  <div key={i} style={{ fontSize: 12, color: 'var(--erp-muted)', marginTop: 4 }}>
                                    {a.range_start}-{a.range_end} | Used: {a.used_numbers?.length || 0}/{a.allocated_count} | {a.status}
                                  </div>
                                ))}
                                <div className="form-row" style={{ marginTop: 10 }}>
                                  <div className="form-group">
                                    <label>Week Start</label>
                                    <input type="date" value={allocForm.week_start} onChange={e => setAllocForm(f => ({ ...f, week_start: e.target.value }))} />
                                  </div>
                                  <div className="form-group">
                                    <label>Week End</label>
                                    <input type="date" value={allocForm.week_end} onChange={e => setAllocForm(f => ({ ...f, week_end: e.target.value }))} />
                                  </div>
                                  <div className="form-group">
                                    <label>Range Start</label>
                                    <input type="number" value={allocForm.range_start} onChange={e => setAllocForm(f => ({ ...f, range_start: e.target.value }))} />
                                  </div>
                                  <div className="form-group">
                                    <label>Range End</label>
                                    <input type="number" value={allocForm.range_end} onChange={e => setAllocForm(f => ({ ...f, range_end: e.target.value }))} />
                                  </div>
                                  <button className="btn btn-primary btn-sm" onClick={() => handleAllocate(b._id)}>Add Allocation</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      ])}
                    {booklets.length === 0 && !loading && (
                      <tr><td colSpan={8}><div className="empty-state">No booklets created yet</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
