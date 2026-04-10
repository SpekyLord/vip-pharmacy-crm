import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useConsignment from '../hooks/useConsignment';
import WarehousePicker from '../components/WarehousePicker';
import WorkflowGuide from '../components/WorkflowGuide';

const AGING_COLORS = {
  OPEN: { bg: '#dbeafe', text: '#1e40af' },
  OVERDUE: { bg: '#fef2f2', text: '#991b1b' },
  FORCE_CSI: { bg: '#fef3c7', text: '#92400e' },
  COLLECTED: { bg: '#dcfce7', text: '#166534' }
};

const pageStyles = `
  .consignment-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .consignment-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .consignment-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 16px; }

  .summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .summary-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; text-align: center; }
  .summary-card .value { font-size: 24px; font-weight: 700; color: var(--erp-text); }
  .summary-card .label { font-size: 12px; color: var(--erp-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }

  .hospital-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
  .hospital-header { padding: 14px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .hospital-header:hover { background: var(--erp-accent-soft, #e8efff); }
  .hospital-name { font-weight: 700; font-size: 15px; color: var(--erp-text); }
  .hospital-meta { font-size: 12px; color: var(--erp-muted); }

  .consignment-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .consignment-table th { padding: 8px 16px; text-align: left; font-weight: 600; color: var(--erp-muted); background: var(--erp-bg); font-size: 11px; text-transform: uppercase; }
  .consignment-table td { padding: 8px 16px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }

  .convert-form { display: flex; gap: 6px; align-items: center; }
  .convert-form input { padding: 4px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 12px; width: 70px; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .empty-state { text-align: center; padding: 60px 20px; color: var(--erp-muted); }
  .consignment-cards { display: none; }
  @media (max-width: 768px) {
    .summary-bar { grid-template-columns: repeat(2, 1fr); }
    .consignment-table { display: none; }
    .consignment-cards { display: flex; flex-direction: column; gap: 8px; padding: 0 4px 12px; }
    .consignment-card {
      background: var(--erp-panel, #fff);
      border: 1px solid var(--erp-border);
      border-radius: 10px;
      padding: 12px;
    }
    .consignment-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 8px;
    }
    .consignment-card-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6px;
    }
    .consignment-card-label { font-size: 10px; text-transform: uppercase; color: var(--erp-muted); font-weight: 700; letter-spacing: 0.04em; }
    .consignment-card-value { font-size: 13px; font-weight: 600; color: var(--erp-text); }
  }
`;

export default function ConsignmentDashboard() {
  const consignment = useConsignment();

  const [warehouseId, setWarehouseId] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [summary, setSummary] = useState({});
  const [expandedHospital, setExpandedHospital] = useState(null);
  const [converting, setConverting] = useState(null); // consignment_id being converted
  const [convertForm, setConvertForm] = useState({ qty: '', csi_doc_ref: '', csi_date: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadPool(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPool = async () => {
    setLoading(true);
    try {
      const res = await consignment.getConsignmentPool();
      if (res?.data) setHospitals(res.data);
      if (res?.summary) setSummary(res.summary);
    } catch (err) { console.error('[ConsignmentDashboard] load error:', err.message); } finally { setLoading(false); }
  };

  const handleConvert = async (consignmentId) => {
    if (!convertForm.qty || !convertForm.csi_doc_ref) return;
    try {
      await consignment.convertConsignment({
        consignment_id: consignmentId,
        qty_converted: parseFloat(convertForm.qty),
        csi_doc_ref: convertForm.csi_doc_ref,
        csi_date: convertForm.csi_date || undefined
      });
      setConverting(null);
      setConvertForm({ qty: '', csi_doc_ref: '', csi_date: '' });
      await loadPool();
    } catch (err) { console.error('Convert error:', err); }
  };

  return (
    <div className="admin-page erp-page consignment-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="consignment-main">
          <WorkflowGuide pageKey="consignment-dashboard" />
          <WarehousePicker value={warehouseId} onChange={setWarehouseId} filterType="PHARMA" compact />
          <div className="consignment-header">
            <h1>Consignment Tracking</h1>
          </div>

          <div className="summary-bar">
            <div className="summary-card">
              <div className="value">{summary.total_open || 0}</div>
              <div className="label">Open</div>
            </div>
            <div className="summary-card">
              <div className="value" style={{ color: (summary.total_overdue || 0) > 0 ? '#dc2626' : undefined }}>
                {summary.total_overdue || 0}
              </div>
              <div className="label">Overdue</div>
            </div>
            <div className="summary-card">
              <div className="value" style={{ color: (summary.total_force_csi || 0) > 0 ? '#d97706' : undefined }}>
                {summary.total_force_csi || 0}
              </div>
              <div className="label">Force CSI</div>
            </div>
            <div className="summary-card">
              <div className="value">P{(summary.total_value || 0).toLocaleString()}</div>
              <div className="label">Value at Risk</div>
            </div>
          </div>

          {hospitals.length === 0 && !loading && (
            <div className="empty-state">No open consignments</div>
          )}

          {hospitals.map(h => (
            <div className="hospital-card" key={h.hospital_id}>
              <div className="hospital-header" onClick={() => setExpandedHospital(prev => prev === h.hospital_id ? null : h.hospital_id)}>
                <div>
                  <span className="hospital-name">{h.hospital_name_display || h.hospital_name}</span>
                  <span className="hospital-meta" style={{ marginLeft: 12 }}>{h.consignments.length} consignment(s)</span>
                </div>
                <span style={{ fontSize: 18 }}>{expandedHospital === h.hospital_id ? '▾' : '▸'}</span>
              </div>

              {expandedHospital === h.hospital_id && (
                <>
                <table className="consignment-table">
                  <thead>
                    <tr><th>DR #</th><th>Product</th><th>Delivered</th><th>Consumed</th><th>Remaining</th><th>Days</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {h.consignments.map(c => (
                      <tr key={c._id}>
                        <td>{c.dr_ref}</td>
                        <td>
                          <strong>{c.product_id?.brand_name || c.item_key || '—'}</strong>
                          {c.product_id?.unit_code && <span style={{ color: 'var(--erp-muted)', marginLeft: 4 }}>{c.product_id.unit_code}</span>}
                        </td>
                        <td>{c.qty_delivered}</td>
                        <td>{c.qty_consumed}</td>
                        <td style={{ fontWeight: 700 }}>{c.qty_remaining}</td>
                        <td>{c.days_outstanding}d</td>
                        <td>
                          <span className="badge" style={AGING_COLORS[c.aging_status] || {}}>
                            {c.aging_status}
                          </span>
                        </td>
                        <td>
                          {c.qty_remaining > 0 && converting !== c._id && (
                            <button className="btn btn-primary btn-sm" onClick={() => { setConverting(c._id); setConvertForm({ qty: String(c.qty_remaining), csi_doc_ref: '', csi_date: '' }); }}>
                              Convert to CSI
                            </button>
                          )}
                          {converting === c._id && (
                            <div className="convert-form">
                              <input type="number" placeholder="Qty" value={convertForm.qty} onChange={e => setConvertForm(f => ({ ...f, qty: e.target.value }))} min="1" max={c.qty_remaining} />
                              <input placeholder="CSI #" value={convertForm.csi_doc_ref} onChange={e => setConvertForm(f => ({ ...f, csi_doc_ref: e.target.value }))} style={{ width: 90 }} />
                              <button className="btn btn-primary btn-sm" onClick={() => handleConvert(c._id)} disabled={!convertForm.qty || !convertForm.csi_doc_ref}>OK</button>
                              <button className="btn btn-sm" style={{ background: 'var(--erp-bg)', color: 'var(--erp-muted)' }} onClick={() => setConverting(null)}>X</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="consignment-cards">
                  {h.consignments.map(c => (
                    <div key={c._id} className="consignment-card">
                      <div className="consignment-card-header">
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{c.product_id?.brand_name || c.item_key || '—'}</div>
                          <div style={{ fontSize: 12, color: 'var(--erp-muted)' }}>DR# {c.dr_ref}</div>
                        </div>
                        <span className="badge" style={AGING_COLORS[c.aging_status] || {}}>{c.aging_status}</span>
                      </div>
                      <div className="consignment-card-grid">
                        <div><div className="consignment-card-label">Delivered</div><div className="consignment-card-value">{c.qty_delivered}</div></div>
                        <div><div className="consignment-card-label">Consumed</div><div className="consignment-card-value">{c.qty_consumed}</div></div>
                        <div><div className="consignment-card-label">Remaining</div><div className="consignment-card-value" style={{ color: c.qty_remaining > 0 ? '#dc2626' : '#16a34a' }}>{c.qty_remaining}</div></div>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginTop: 6 }}>{c.days_outstanding} days outstanding</div>
                      {c.qty_remaining > 0 && converting !== c._id && (
                        <button className="btn btn-primary btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={() => { setConverting(c._id); setConvertForm({ qty: String(c.qty_remaining), csi_doc_ref: '', csi_date: '' }); }}>
                          Convert to CSI
                        </button>
                      )}
                      {converting === c._id && (
                        <div className="convert-form" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                          <input type="number" placeholder="Qty" value={convertForm.qty} onChange={e => setConvertForm(f => ({ ...f, qty: e.target.value }))} min="1" max={c.qty_remaining} />
                          <input placeholder="CSI #" value={convertForm.csi_doc_ref} onChange={e => setConvertForm(f => ({ ...f, csi_doc_ref: e.target.value }))} style={{ width: 90 }} />
                          <button className="btn btn-primary btn-sm" onClick={() => handleConvert(c._id)} disabled={!convertForm.qty || !convertForm.csi_doc_ref}>OK</button>
                          <button className="btn btn-sm" style={{ background: 'var(--erp-bg)', color: 'var(--erp-muted)' }} onClick={() => setConverting(null)}>X</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>
          ))}

          {loading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--erp-muted)' }}>Loading...</div>}
        </main>
      </div>
    </div>
  );
}
