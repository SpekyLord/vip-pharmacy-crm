/**
 * Consignment Aging Page — Phase 14.7
 * Cross-BDM consignment aging with color-coded status and drill-down
 */
import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';
import WarehousePicker from '../components/WarehousePicker';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .aging-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .aging-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .aging-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .aging-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn:disabled { opacity: 0.5; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .summary-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; text-align: center; }
  .summary-card .value { font-size: 24px; font-weight: 700; color: var(--erp-text); }
  .summary-card .label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; margin-top: 2px; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; overflow-x: auto; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; white-space: nowrap; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-open { background: #dbeafe; color: #1e40af; }
  .badge-overdue { background: #fef2f2; color: #991b1b; }
  .badge-force { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
  .badge-collected { background: #dcfce7; color: #166534; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .aging-main { padding: 12px; } }
`;

const BADGE_CLASS = { OPEN: 'badge-open', OVERDUE: 'badge-overdue', FORCE_CSI: 'badge-force', COLLECTED: 'badge-collected' };

export default function ConsignmentAging() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const rpt = useReports();
  const [warehouseId, setWarehouseId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ bdm_id: '', hospital_id: '', aging_status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (warehouseId) params.warehouse_id = warehouseId;
      if (filters.bdm_id) params.bdm_id = filters.bdm_id;
      if (filters.hospital_id) params.hospital_id = filters.hospital_id;
      if (filters.aging_status) params.aging_status = filters.aging_status;
      const res = await rpt.getConsignmentAging(params);
      setData(res?.data || null);
    } catch (err) { console.error('[ConsignmentAging] load error:', err.message); }
    setLoading(false);
  }, [filters, warehouseId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="aging-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="aging-main">
          <WorkflowGuide pageKey="consignment-aging" />
          <WarehousePicker value={warehouseId} onChange={setWarehouseId} filterType="PHARMA" compact />
          <div className="aging-header">
            <h1>Consignment Aging</h1>
            <p>Consolidated cross-BDM consignment status with aging indicators</p>
            <div style={{ marginTop: 10 }}>
              <Link to="/erp/reports" className="btn" style={{ textDecoration: 'none', border: '1px solid var(--erp-border)', color: 'var(--erp-text)', background: 'transparent' }}>
                Back to Reports
              </Link>
            </div>
          </div>

          <div className="controls">
            <SelectField value={filters.aging_status} onChange={e => setFilters(f => ({ ...f, aging_status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="OPEN">Open</option>
              <option value="OVERDUE">Overdue</option>
              <option value="FORCE_CSI">Force CSI</option>
              <option value="COLLECTED">Collected</option>
            </SelectField>
            <button className="btn btn-primary" onClick={load} disabled={loading}>Load Report</button>
          </div>

          {data?.summary && (
            <div className="summary-grid">
              <div className="summary-card"><div className="value">{data.summary.total}</div><div className="label">Total</div></div>
              <div className="summary-card"><div className="value" style={{ color: '#1e40af' }}>{data.summary.open}</div><div className="label">Open</div></div>
              <div className="summary-card"><div className="value" style={{ color: '#dc2626' }}>{data.summary.overdue}</div><div className="label">Overdue</div></div>
              <div className="summary-card"><div className="value" style={{ color: '#991b1b' }}>{data.summary.force_csi}</div><div className="label">Force CSI</div></div>
              <div className="summary-card"><div className="value" style={{ color: '#16a34a' }}>{data.summary.collected}</div><div className="label">Collected</div></div>
            </div>
          )}

          {loading && <div className="loading">Loading...</div>}

          {data && !loading && (
            <div className="panel">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>BDM</th><th>Hospital</th><th>DR#</th><th>DR Date</th>
                    <th>Product</th><th style={{ textAlign: 'right' }}>Delivered</th>
                    <th style={{ textAlign: 'right' }}>Consumed</th><th style={{ textAlign: 'right' }}>Remaining</th>
                    <th style={{ textAlign: 'right' }}>Days</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((r, i) => (
                    <tr key={r.dr_ref + '-' + i}>
                      <td style={{ fontWeight: 600 }}>{r.bdm_name}</td>
                      <td>{r.hospital_name}</td>
                      <td>{r.dr_ref}</td>
                      <td>{r.dr_date ? new Date(r.dr_date).toLocaleDateString() : ''}</td>
                      <td>{r.product_name}</td>
                      <td className="num">{r.qty_delivered}</td>
                      <td className="num">{r.qty_consumed}</td>
                      <td className="num">{r.qty_remaining}</td>
                      <td className="num">{r.days_outstanding}</td>
                      <td><span className={`badge ${BADGE_CLASS[r.aging_status] || ''}`}>{r.aging_status}</span></td>
                      <td>
                        {r.aging_status !== 'COLLECTED' && r.qty_remaining > 0 && (
                          <button
                            style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#1e5eff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                            onClick={() => navigate('/erp/sales/entry', { state: { prefill: { hospital_id: r.hospital_id, hospital_name: r.hospital_name, product_id: r.product_id, product_name: r.product_name, qty: r.qty_remaining, warehouse_id: warehouseId } } })}
                          >
                            Issue CSI
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!data.items || data.items.length === 0) && (
                    <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No consignment data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
