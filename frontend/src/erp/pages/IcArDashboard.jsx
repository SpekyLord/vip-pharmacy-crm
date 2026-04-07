import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useIcSettlements from '../hooks/useIcSettlements';
import { showError } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  POSTED: { bg: '#dbeafe', text: '#1e40af' }
};

const pageStyles = `
  .icar-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .icar-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .icar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .icar-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }

  .summary-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .summary-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; }
  .summary-card .label { font-size: 11px; color: var(--erp-muted, #5f7188); font-weight: 600; text-transform: uppercase; }
  .summary-card .value { font-size: 22px; font-weight: 700; color: var(--erp-text); margin-top: 4px; }

  .section { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .section h2 { font-size: 16px; margin: 0 0 14px; color: var(--erp-text); }

  .sub-card { border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; margin-bottom: 10px; cursor: pointer; }
  .sub-card:hover { background: var(--erp-accent-soft, #e8efff); }
  .sub-card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; }
  .sub-card-meta { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--erp-muted); flex-wrap: wrap; }

  .tfr-detail { margin-top: 10px; padding: 12px; background: var(--erp-bg); border-radius: 8px; }
  .tfr-row { display: flex; justify-content: space-between; padding: 6px 0; border-top: 1px solid var(--erp-border); font-size: 12px; flex-wrap: wrap; gap: 8px; }
  .tfr-row:first-child { border-top: none; }

  .settle-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
  .settle-table th { background: var(--erp-bg); padding: 8px 10px; text-align: left; font-weight: 600; color: var(--erp-muted); font-size: 11px; text-transform: uppercase; }
  .settle-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }

  @media(max-width: 768px) { .icar-main { padding: 12px; } .summary-cards { grid-template-columns: 1fr 1fr; } }
`;

export default function IcArDashboard() {
  const { user } = useAuth();
  const ic = useIcSettlements();

  const [summary, setSummary] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [expandedSub, setExpandedSub] = useState(null);
  const [subTransfers, setSubTransfers] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, settRes] = await Promise.all([
        ic.getIcArSummary(),
        ic.getSettlements({ limit: 0 })
      ]);
      setSummary(sumRes?.data || null);
      setSettlements(settRes?.data || []);
    } catch (err) { console.error('[IcArDashboard] load error:', err.message); } finally { setLoading(false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSubsidiary = async (debtorId) => {
    if (expandedSub === debtorId) { setExpandedSub(null); return; }
    setExpandedSub(debtorId);
    try {
      const res = await ic.getOpenIcTransfers(debtorId);
      setSubTransfers(res?.data || []);
    } catch (err) { showError(err, 'Could not load IC transfers'); setSubTransfers([]); }
  };

  const handlePost = async (id) => {
    if (!window.confirm('Post this IC Settlement?')) return;
    try {
      await ic.postSettlement(id);
      loadData();
    } catch (err) { showError(err, 'Could not post settlement'); }
  };

  const totalSettled = settlements.filter(s => s.status === 'POSTED').reduce((sum, s) => sum + (s.cr_amount || 0), 0);

  return (
    <div className="admin-page erp-page icar-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="icar-main">
          <div className="icar-header">
            <h1>IC Receivables — Subsidiary Collections</h1>
            <Link to="/erp/ic-settlements/new" className="btn btn-primary">+ New IC Settlement</Link>
          </div>

          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="label">Total IC AR Outstanding</div>
              <div className="value" style={{ color: '#dc2626' }}>P{(summary?.total_ic_ar || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="summary-card">
              <div className="label">Open Transfers</div>
              <div className="value">{summary?.total_open_transfers || 0}</div>
            </div>
            <div className="summary-card">
              <div className="label">Total Collected</div>
              <div className="value" style={{ color: '#16a34a' }}>P{totalSettled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            </div>
            <div className="summary-card">
              <div className="label">Subsidiaries</div>
              <div className="value">{summary?.subsidiaries?.length || 0}</div>
            </div>
          </div>

          {/* Per-Subsidiary Breakdown */}
          <div className="section">
            <h2>Outstanding per Subsidiary</h2>
            {loading && <p style={{ color: 'var(--erp-muted)' }}>Loading...</p>}
            {!loading && (!summary?.subsidiaries?.length) && (
              <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No outstanding IC receivables</p>
            )}
            {(summary?.subsidiaries || []).map(sub => (
              <div key={sub.debtor_entity_id}>
                <div className="sub-card" onClick={() => toggleSubsidiary(sub.debtor_entity_id.toString())}>
                  <div className="sub-card-header">
                    <strong style={{ fontSize: 15 }}>{sub.debtor_name}</strong>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#dc2626' }}>
                      P{(sub.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="sub-card-meta">
                    <span>Open transfers: {sub.open_transfers}</span>
                    <span>Total owed: P{(sub.total_owed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span>Settled: P{(sub.total_settled || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span>Worst: {sub.worst_days}d outstanding</span>
                  </div>
                </div>
                {expandedSub === sub.debtor_entity_id.toString() && (
                  <div className="tfr-detail">
                    {subTransfers.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--erp-muted)' }}>No open transfers</p>
                    ) : subTransfers.map(t => (
                      <div key={t._id} className="tfr-row">
                        <span><strong>{t.csi_ref || t.transfer_ref}</strong></span>
                        <span>{new Date(t.transfer_date).toLocaleDateString('en-PH')}</span>
                        <span>Total: P{(t.total_amount || 0).toFixed(2)}</span>
                        <span>Settled: P{(t.amount_settled || 0).toFixed(2)}</span>
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>Due: P{(t.balance_due || 0).toFixed(2)}</span>
                        <span>{t.days_outstanding}d</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Settlement History */}
          <div className="section">
            <h2>Settlement History</h2>
            {settlements.length === 0 ? (
              <p style={{ color: 'var(--erp-muted)', fontSize: 13 }}>No settlements recorded yet</p>
            ) : (
              <table className="settle-table">
                <thead>
                  <tr><th>CR #</th><th>Subsidiary</th><th>Date</th><th>Amount</th><th>Transfers</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {settlements.map(s => {
                    const sc = STATUS_COLORS[s.status] || {};
                    return (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600 }}>{s.cr_no}</td>
                        <td>{s.debtor_entity_id?.entity_name || '—'}</td>
                        <td>{new Date(s.cr_date).toLocaleDateString('en-PH')}</td>
                        <td>P{(s.cr_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td>{s.settled_transfers?.length || 0}</td>
                        <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{s.status}</span></td>
                        <td>
                          {s.status === 'DRAFT' && (
                            <button className="btn btn-sm btn-success" onClick={() => handlePost(s._id)}>Post</button>
                          )}
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
    </div>
  );
}
