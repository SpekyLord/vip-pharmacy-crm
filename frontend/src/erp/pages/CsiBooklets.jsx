/**
 * CSI Booklets Page — Phase 15.2
 * Booklet master, weekly allocation, usage stats
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

const pageStyles = `
  .booklet-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .booklet-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .booklet-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .booklet-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .form-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: flex-end; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-exhausted { background: #fef2f2; color: #991b1b; }
  .badge-void { background: #e2e8f0; color: #475569; }
  .usage-bar { width: 80px; height: 8px; background: #e2e8f0; border-radius: 4px; display: inline-block; }
  .usage-fill { height: 100%; background: #2563eb; border-radius: 4px; }
  .alloc-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--erp-border); }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 900px) {
    .booklet-main { padding: 16px; }
    .data-table { font-size: 12px; }
    .panel { padding: 16px; }
  }

  @media(max-width: 768px) {
    .booklet-page { padding-top: 12px; }
    .booklet-main { padding: 76px 12px 96px; }
    .form-row { flex-direction: column; align-items: stretch; }
    .form-group input { width: 100%; }
    .btn { width: 100%; }
    .data-table th, .data-table td { padding: 6px 8px; }
    .usage-bar { width: 64px; }
  }

  @media(max-width: 480px) {
    .booklet-page { padding-top: 16px; }
    .booklet-main { padding-top: 72px; padding-bottom: 104px; }
    .booklet-header h1 { font-size: 18px; }
    .booklet-header p { font-size: 12px; }
    .panel { padding: 12px; border-radius: 12px; }
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

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await rpt.getCsiBooklets(); setBooklets(res?.data || []); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.booklet_code || !form.series_start || !form.series_end) return;
    try {
      await rpt.createBooklet({ booklet_code: form.booklet_code, series_start: Number(form.series_start), series_end: Number(form.series_end) });
      setForm({ booklet_code: '', series_start: '', series_end: '' });
      load();
    } catch {}
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
    } catch {}
  };

  return (
    <div className="booklet-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="booklet-main">
          <div className="booklet-header">
            <h1>CSI Booklets</h1>
            <p>Manage CSI booklet series, weekly allocations, and number validation</p>
          </div>

          <div className="panel">
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>New Booklet</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Booklet Code</label>
                <input value={form.booklet_code} onChange={e => setForm(f => ({ ...f, booklet_code: e.target.value }))} placeholder="e.g., BK-001" />
              </div>
              <div className="form-group">
                <label>Series Start</label>
                <input type="number" value={form.series_start} onChange={e => setForm(f => ({ ...f, series_start: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Series End</label>
                <input type="number" value={form.series_end} onChange={e => setForm(f => ({ ...f, series_end: e.target.value }))} />
              </div>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>

          {loading && <div className="loading">Loading...</div>}

          <div className="panel">
            <table className="data-table">
              <thead>
                <tr><th>Code</th><th>Series</th><th>Assigned To</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Remaining</th><th>Usage</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {booklets.map(b => [
                    <tr key={b._id}>
                      <td style={{ fontWeight: 600 }}>{b.booklet_code}</td>
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
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No booklets created yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
