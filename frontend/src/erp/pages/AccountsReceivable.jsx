import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useCollections from '../hooks/useCollections';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const BUCKET_COLORS = {
  CURRENT: '#16a34a', OVERDUE_30: '#ca8a04', OVERDUE_60: '#d97706', OVERDUE_90: '#ea580c', OVERDUE_120: '#dc2626'
};
const BUCKET_LABELS = {
  CURRENT: '0-30d', OVERDUE_30: '31-60d', OVERDUE_60: '61-90d', OVERDUE_90: '91-120d', OVERDUE_120: '120+d'
};

const pageStyles = `
  .ar-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ar-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; max-width: 1360px; margin: 0 auto; }
  .ar-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .ar-header h1 { font-size: 24px; color: var(--erp-text); margin: 0; }
  .ar-header p { margin: 4px 0 0; color: var(--erp-muted); font-size: 13px; line-height: 1.5; max-width: 760px; }
  .summary-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
  .summary-card { min-width: 0; background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid var(--erp-border); border-radius: 16px; padding: 16px; text-align: center; box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05); }
  .summary-card .value { font-size: 24px; font-weight: 800; color: var(--erp-text); }
  .summary-card .label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-top: 4px; }
  .ar-table-wrap { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 16px; overflow: hidden; box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05); }
  .ar-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); }
  .ar-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: right; font-weight: 700; white-space: nowrap; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; color: var(--erp-muted); }
  .ar-table th:first-child, .ar-table th:last-child { text-align: left; }
  .ar-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); text-align: right; background: var(--erp-panel); }
  .ar-table td:first-child, .ar-table td:last-child { text-align: left; }
  .ar-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .btn { padding: 8px 16px; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .csi-detail { margin: 8px 0 8px 24px; font-size: 12px; }
  .csi-detail table { width: 100%; border-collapse: collapse; }
  .csi-detail th { text-align: left; padding: 4px 8px; background: var(--erp-bg); font-weight: 600; color: var(--erp-muted); }
  .csi-detail td { padding: 4px 8px; border-top: 1px solid var(--erp-border); }
  .ar-mobile-list { display: none; }
  .ar-card { border: 1px solid var(--erp-border); border-radius: 16px; background: var(--erp-panel); padding: 14px; box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05); }
  .ar-card + .ar-card { margin-top: 10px; }
  .ar-card-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .ar-card-title { font-weight: 800; font-size: 14px; color: var(--erp-text); }
  .ar-card-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .ar-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
  .ar-card-item { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 12px; padding: 10px 12px; }
  .ar-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .ar-card-value { font-size: 13px; font-weight: 700; color: var(--erp-text); margin-top: 4px; }
  .ar-card-actions { display: flex; gap: 8px; margin-top: 12px; }
  .ar-mini-table { display: grid; gap: 8px; margin-top: 10px; }
  .ar-mini-row { border-top: 1px solid var(--erp-border); padding-top: 8px; font-size: 12px; color: var(--erp-text); }
  .ar-mini-row strong { display: block; margin-bottom: 4px; }
  @media(max-width: 768px) {
    .ar-main { padding: 76px 12px 96px; }
    .ar-header { flex-direction: column; align-items: flex-start; }
    .summary-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .summary-card .value { font-size: 20px; }
    .ar-table-wrap { display: none; }
    .ar-mobile-list { display: grid; gap: 10px; }
    .ar-card-grid { grid-template-columns: 1fr 1fr; }
    .ar-card-actions .btn { width: 100%; }
  }
  @media(max-width: 480px) {
    .ar-main { padding-top: 72px; padding-bottom: 104px; }
    .summary-cards { grid-template-columns: 1fr; }
    .summary-card { padding: 14px; }
    .summary-card .value { font-size: 18px; }
    .ar-card-grid { grid-template-columns: 1fr; }
    .csi-detail { margin-left: 0; }
    .csi-detail table { display: block; overflow-x: auto; }
  }
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
    }).catch(err => console.error('[AccountsReceivable]', err.message)).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hospitals = arData?.hospitals || [];
  const summary = arData?.summary || {};
  const buckets = summary.buckets || {};
  const arBuckets = Object.keys(BUCKET_LABELS);

  const handleSoa = async (hospitalId) => {
    try {
      const res = await coll.generateSoa(hospitalId);
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `SOA_${hospitalId}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { showError(err, 'Could not generate SOA'); }
  };

  return (
    <div className="admin-page erp-page ar-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="ar-main">
          <WorkflowGuide pageKey="ar-aging" />
          <div className="ar-header">
            <div>
              <h1>Accounts Receivable</h1>
              <p>Track aging by hospital, review collection buckets, and open CSI detail rows for individual balances.</p>
            </div>
            <Link to="/erp/reports" className="erp-back-btn">
              Back to Reports
            </Link>
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
            <>
              <div className="ar-table-wrap">
                <table className="ar-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Hospital</th>
                      {arBuckets.map(b => <th key={b} style={{ color: BUCKET_COLORS[b] }}>{BUCKET_LABELS[b]}</th>)}
                      <th>Total AR</th>
                      <th style={{ textAlign: 'left' }}>Dunning</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {hospitals.map(h => (
                      <>
                        <tr key={h.hospital_id} onClick={() => setExpanded(expanded === h.hospital_id ? null : h.hospital_id)}>
                          <td style={{ fontWeight: 700, textAlign: 'left' }}>{h.hospital_name}</td>
                          {arBuckets.map(b => (
                            <td key={b} style={{ color: h[b] > 0 ? BUCKET_COLORS[b] : 'var(--erp-muted)', fontWeight: h[b] > 0 ? 700 : 400 }}>
                              {h[b] > 0 ? fmt(h[b]) : '—'}
                            </td>
                          ))}
                          <td style={{ fontWeight: 800 }}>{fmt(h.total_ar)}</td>
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
              </div>

              <div className="ar-mobile-list">
                {hospitals.map((h) => {
                  const isOpen = expanded === h.hospital_id;
                  return (
                    <div className="ar-card" key={`mobile-${h.hospital_id}`}>
                      <div className="ar-card-header">
                        <div>
                          <div className="ar-card-title">{h.hospital_name}</div>
                          <div className="ar-card-sub">{fmt(h.total_ar)} total AR</div>
                        </div>
                        {h.dunning && <span className="badge" style={{ background: h.dunning.color, color: '#fff' }}>{h.dunning.label}</span>}
                      </div>

                      <div className="ar-card-grid">
                        {arBuckets.map((b) => (
                          <div className="ar-card-item" key={b}>
                            <div className="ar-card-label">{BUCKET_LABELS[b]}</div>
                            <div className="ar-card-value" style={{ color: h[b] > 0 ? BUCKET_COLORS[b] : 'var(--erp-muted)' }}>
                              {h[b] > 0 ? fmt(h[b]) : '—'}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="ar-card-actions">
                        <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => setExpanded(isOpen ? null : h.hospital_id)}>
                          {isOpen ? 'Hide CSI' : 'View CSI'}
                        </button>
                        <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => handleSoa(h.hospital_id)}>SOA</button>
                      </div>

                      {isOpen && h.csis?.length > 0 && (
                        <div className="csi-detail" style={{ marginLeft: 0 }}>
                          <div className="ar-mini-table">
                            {h.csis.map((csi) => (
                              <div className="ar-mini-row" key={csi._id || csi.doc_ref}>
                                <strong>{csi.doc_ref}</strong>
                                <div>{new Date(csi.csi_date).toLocaleDateString('en-PH')} | Inv: {fmt(csi.invoice_total)} | Col: {fmt(csi.amount_collected)}</div>
                                <div>Bal: {fmt(csi.balance_due)} | {csi.days_outstanding}d {csi.dunning && <span className="badge" style={{ background: csi.dunning.color, color: '#fff', fontSize: 10, marginLeft: 6 }}>{csi.dunning.label}</span>}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!hospitals.length && <div className="ar-card" style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No outstanding AR</div>}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
