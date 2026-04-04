import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useCollections from '../hooks/useCollections';

const BUCKET_COLORS = {
  CURRENT: '#16a34a', OVERDUE_30: '#ca8a04', OVERDUE_60: '#d97706', OVERDUE_90: '#ea580c', OVERDUE_120: '#dc2626'
};
const BUCKET_LABELS = {
  CURRENT: '0-30d', OVERDUE_30: '31-60d', OVERDUE_60: '61-90d', OVERDUE_90: '91-120d', OVERDUE_120: '120+d'
};

const pageStyles = `
  .ar-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ar-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1300px; margin: 0 auto; }
  .ar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .ar-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .summary-cards { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .summary-card { flex: 1; min-width: 160px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; text-align: center; }
  .summary-card .value { font-size: 22px; font-weight: 700; color: var(--erp-text); }
  .summary-card .label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-top: 4px; }
  .ar-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .ar-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: right; font-weight: 600; white-space: nowrap; }
  .ar-table th:first-child, .ar-table th:last-child { text-align: left; }
  .ar-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); text-align: right; }
  .ar-table td:first-child, .ar-table td:last-child { text-align: left; }
  .ar-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .csi-detail { margin: 8px 0 8px 24px; font-size: 12px; }
  .csi-detail table { width: 100%; border-collapse: collapse; }
  .csi-detail th { text-align: left; padding: 4px 8px; background: var(--erp-bg); font-weight: 600; color: var(--erp-muted); }
  .csi-detail td { padding: 4px 8px; border-top: 1px solid var(--erp-border); }
  @media(max-width: 768px) { .ar-main { padding: 12px; } .ar-table { font-size: 11px; } }
`;

function fmt(n) { return 'P' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function AccountsReceivable() {
  const { user } = useAuth();
  const coll = useCollections();
  const [arData, setArData] = useState(null);
  const [rateData, setRateData] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      coll.getArAging({}),
      coll.getCollectionRate({})
    ]).then(([ar, rate]) => {
      setArData(ar?.data || null);
      setRateData(rate?.data || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hospitals = arData?.hospitals || [];
  const summary = arData?.summary || {};
  const buckets = summary.buckets || {};

  const handleSoa = async (hospitalId) => {
    try {
      const res = await coll.generateSoa(hospitalId);
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `SOA_${hospitalId}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert('SOA generation failed'); }
  };

  return (
    <div className="admin-page erp-page ar-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="ar-main">
          <div className="ar-header">
            <h1>Accounts Receivable</h1>
          </div>

          {/* Summary Cards */}
          <div className="summary-cards">
            <div className="summary-card">
              <div className="value">{fmt(summary.total_ar)}</div>
              <div className="label">Total AR</div>
            </div>
            <div className="summary-card">
              <div className="value">{summary.total_csis || 0}</div>
              <div className="label">Open CSIs</div>
            </div>
            <div className="summary-card">
              <div className="value" style={{ color: rateData?.status === 'GREEN' ? '#16a34a' : '#dc2626' }}>
                {rateData?.collection_rate?.toFixed(1) || '0'}%
              </div>
              <div className="label">Collection Rate (70% target)</div>
            </div>
            <div className="summary-card">
              <div className="value">{hospitals.length}</div>
              <div className="label">Hospitals with AR</div>
            </div>
          </div>

          {/* AR Aging Table */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>
          ) : (
            <table className="ar-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Hospital</th>
                  {Object.keys(BUCKET_LABELS).map(b => <th key={b} style={{ color: BUCKET_COLORS[b] }}>{BUCKET_LABELS[b]}</th>)}
                  <th>Total AR</th>
                  <th style={{ textAlign: 'left' }}>Dunning</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {hospitals.map(h => (
                  <>
                    <tr key={h.hospital_id} onClick={() => setExpanded(expanded === h.hospital_id ? null : h.hospital_id)}>
                      <td style={{ fontWeight: 600, textAlign: 'left' }}>{h.hospital_name}</td>
                      {Object.keys(BUCKET_LABELS).map(b => (
                        <td key={b} style={{ color: h[b] > 0 ? BUCKET_COLORS[b] : 'var(--erp-muted)', fontWeight: h[b] > 0 ? 600 : 400 }}>
                          {h[b] > 0 ? fmt(h[b]) : '—'}
                        </td>
                      ))}
                      <td style={{ fontWeight: 700 }}>{fmt(h.total_ar)}</td>
                      <td style={{ textAlign: 'left' }}>
                        {h.dunning && <span className="badge" style={{ background: h.dunning.color, color: '#fff' }}>{h.dunning.label}</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm btn-outline" onClick={() => handleSoa(h.hospital_id)}>SOA</button>
                      </td>
                    </tr>
                    {expanded === h.hospital_id && h.csis?.length > 0 && (
                      <tr key={`${h.hospital_id}-detail`}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <div className="csi-detail">
                            <table>
                              <thead><tr><th>CSI #</th><th>Date</th><th>Invoice</th><th>Collected</th><th>Balance</th><th>Days</th><th>Dunning</th></tr></thead>
                              <tbody>
                                {h.csis.map((csi) => (
                                  <tr key={csi._id || csi.doc_ref}>
                                    <td style={{ fontWeight: 600 }}>{csi.doc_ref}</td>
                                    <td>{new Date(csi.csi_date).toLocaleDateString('en-PH')}</td>
                                    <td>{fmt(csi.invoice_total)}</td>
                                    <td>{fmt(csi.amount_collected)}</td>
                                    <td style={{ fontWeight: 600 }}>{fmt(csi.balance_due)}</td>
                                    <td>{csi.days_outstanding}d</td>
                                    <td>{csi.dunning && <span className="badge" style={{ background: csi.dunning.color, color: '#fff', fontSize: 10 }}>{csi.dunning.label}</span>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {!hospitals.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>No outstanding AR</td></tr>}
              </tbody>
            </table>
          )}
        </main>
      </div>
    </div>
  );
}
