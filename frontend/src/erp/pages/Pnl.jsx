/**
 * PNL Page — Territory Profit & Loss Statement
 *
 * Classic P&L layout: Revenue → Less COGS → Gross Profit → Expenses → Net Income
 * Includes manual fields for depreciation and loan amortization.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useIncome from '../hooks/useIncome';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .pnl-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pnl-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1100px; margin: 0 auto; }
  .pnl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .pnl-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .controls select, .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .pnl-statement { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .pnl-section { padding: 0; }
  .pnl-section-header { background: var(--erp-accent-soft, #e8efff); padding: 10px 16px; font-weight: 700; font-size: 14px; color: var(--erp-text); border-bottom: 1px solid var(--erp-border); }
  .pnl-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 13px; border-bottom: 1px solid var(--erp-border-light, #f0f0f0); }
  .pnl-row:hover { background: var(--erp-bg); }
  .pnl-row .label { color: var(--erp-text); }
  .pnl-row .value { font-variant-numeric: tabular-nums; font-weight: 500; }
  .pnl-row.subtotal { font-weight: 700; background: var(--erp-accent-soft); border-bottom: 2px solid var(--erp-border); }
  .pnl-row.total { font-weight: 700; font-size: 16px; background: var(--erp-accent-soft); padding: 12px 16px; }
  .pnl-row.positive .value { color: #16a34a; }
  .pnl-row.negative .value { color: #dc2626; }
  .pnl-row input { width: 120px; padding: 4px 8px; border: 1px solid var(--erp-border); border-radius: 4px; text-align: right; font-size: 13px; }
  .ps-indicator { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .ps-eligible { background: #d1fae5; color: #065f46; }
  .ps-deficit { background: #fee2e2; color: #991b1b; }
  .ps-not-eligible { background: #f3f4f6; color: #6b7280; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-generated { background: #dbeafe; color: #1d4ed8; }
  .badge-posted { background: #d1fae5; color: #065f46; }
  .badge-locked { background: #f3f4f6; color: #6b7280; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-success { background: #16a34a; color: white; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .list-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .list-table th { background: var(--erp-accent-soft); padding: 10px 12px; text-align: left; font-weight: 600; }
  .list-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .list-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }
  .pnl-list-wrap { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow-x: auto; }
  .list-mobile-list { display: none; gap: 10px; }
  .list-mobile-card { border: 1px solid var(--erp-border); border-radius: 14px; background: var(--erp-panel); padding: 14px; box-shadow: 0 8px 18px rgba(15,23,42,0.05); }
  .list-mobile-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
  .list-mobile-title { font-size: 14px; font-weight: 800; color: var(--erp-text); }
  .list-mobile-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .list-mobile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .list-mobile-item { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 12px; padding: 10px 12px; }
  .list-mobile-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .list-mobile-value { font-size: 13px; font-weight: 700; color: var(--erp-text); margin-top: 4px; }
  .list-mobile-actions { display: flex; gap: 8px; margin-top: 12px; }
  @media(max-width: 768px) { .pnl-main { padding: 12px; } .pnl-row { font-size: 12px; padding: 6px 12px; } .pnl-list-wrap { display: none; } .list-mobile-list { display: grid; } }
  @media(max-width: 480px) { .list-mobile-grid { grid-template-columns: 1fr; } .list-mobile-actions { flex-direction: column; } }
`;

function fmt(n) { return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Pnl() {
  const { user } = useAuth();
  const inc = useIncome();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [view, setView] = useState('list');
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [bdmId, setBdmId] = useState('');
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manualEdits, setManualEdits] = useState({});

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (period) params.period = period;
      if (bdmId) params.bdm_id = bdmId;
      const res = await inc.getPnlList(params);
      setReports(res?.data || []);
    } catch (err) { showError(err, 'Could not load P&L reports'); }
    setLoading(false);
  }, [period, bdmId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleGenerate = async () => {
    const targetBdm = bdmId || user?._id;
    if (!targetBdm || !period) return;
    setLoading(true);
    try {
      const res = await inc.generatePnl({ bdm_id: targetBdm, period });
      if (res?.data) { setSelected(res.data); setView('detail'); }
      loadReports();
    } catch (err) { showError(err, 'Could not generate P&L'); }
    setLoading(false);
  };

  const handleSelect = async (report) => {
    setLoading(true);
    try {
      const res = await inc.getPnlById(report._id);
      if (res?.data) { setSelected(res.data); setView('detail'); setManualEdits({}); }
    } catch (err) { showError(err, 'Could not load P&L detail'); }
    setLoading(false);
  };

  const handleSaveManual = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await inc.updatePnlManual(selected._id, { expenses: manualEdits });
      const res = await inc.getPnlById(selected._id);
      if (res?.data) setSelected(res.data);
      setManualEdits({});
    } catch (err) { showError(err, 'Could not save P&L manual edits'); }
    setLoading(false);
  };

  const handlePost = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await inc.postPnl(selected._id);
      if (res?.data) setSelected(res.data);
      loadReports();
    } catch (err) { showError(err, 'Could not post P&L'); }
    setLoading(false);
  };

  const canEdit = selected && ['GENERATED', 'REVIEWED'].includes(selected.status) && !selected.locked && isAdmin;
  const bdmName = (r) => r.bdm_id ? `${r.bdm_id.firstName || ''} ${r.bdm_id.lastName || ''}`.trim() : 'N/A';
  const r = selected?.revenue || {};
  const c = selected?.cogs || {};
  const e = selected?.expenses || {};
  const ps = selected?.profit_sharing || {};

  return (
    <div className="pnl-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="pnl-main">
          <WorkflowGuide pageKey="pnl" />
          <div className="pnl-header">
            <h1>Territory P&L</h1>
            <div className="controls">
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
              {isAdmin && (
                <input type="text" placeholder="BDM ID (optional)" value={bdmId}
                  onChange={e => setBdmId(e.target.value)} style={{ width: 160 }} />
              )}
              {isAdmin && (
                <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                  Generate P&L
                </button>
              )}
              {view === 'detail' && (
                <button className="btn btn-outline" onClick={() => { setView('list'); setSelected(null); }}>
                  ← Back to List
                </button>
              )}
              <Link to="/erp/reports" className="erp-back-btn">
                Back to Reports
              </Link>
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {/* ═══ LIST VIEW ═══ */}
          {view === 'list' && !loading && (
            <>
              <div className="pnl-list-wrap">
                <table className="list-table">
                  <thead>
                    <tr>
                      <th>BDM</th><th>Period</th><th>Net Sales</th><th>COGS</th>
                      <th>Gross Profit</th><th>Expenses</th><th>Net Income</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>No PNL reports found</td></tr>
                    )}
                    {reports.map(r => (
                      <tr key={r._id} onClick={() => handleSelect(r)}>
                        <td>{bdmName(r)}</td>
                        <td>{r.period}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.revenue?.net_sales)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.cogs?.total_cogs)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.gross_profit)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.total_expenses)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: (r.net_income || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.net_income)}</td>
                        <td>
                          <span className={`badge badge-${(r.status || '').toLowerCase()}`}>{r.status}</span>
                          {r.locked && <span className="badge badge-locked" style={{ marginLeft: 4 }}>LOCKED</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="list-mobile-list">
                {reports.length === 0 && (
                  <div className="list-mobile-card" style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No PNL reports found</div>
                )}
                {reports.map(r => (
                  <div className="list-mobile-card" key={`mobile-${r._id}`} onClick={() => handleSelect(r)} role="button" tabIndex={0}>
                    <div className="list-mobile-top">
                      <div>
                        <div className="list-mobile-title">{bdmName(r)}</div>
                        <div className="list-mobile-sub">{r.period}</div>
                      </div>
                      <div>
                        <span className={`badge badge-${(r.status || '').toLowerCase()}`}>{r.status}</span>
                        {r.locked && <span className="badge badge-locked" style={{ marginLeft: 4 }}>LOCKED</span>}
                      </div>
                    </div>
                    <div className="list-mobile-grid">
                      <div className="list-mobile-item"><div className="list-mobile-label">Net Sales</div><div className="list-mobile-value">{fmt(r.revenue?.net_sales)}</div></div>
                      <div className="list-mobile-item"><div className="list-mobile-label">COGS</div><div className="list-mobile-value">{fmt(r.cogs?.total_cogs)}</div></div>
                      <div className="list-mobile-item"><div className="list-mobile-label">Gross Profit</div><div className="list-mobile-value">{fmt(r.gross_profit)}</div></div>
                      <div className="list-mobile-item"><div className="list-mobile-label">Net Income</div><div className="list-mobile-value" style={{ color: (r.net_income || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.net_income)}</div></div>
                    </div>
                    <div className="list-mobile-actions">
                      <button className="btn btn-outline" type="button">Open Report</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ DETAIL VIEW ═══ */}
          {view === 'detail' && selected && !loading && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>P&L — {bdmName(selected)} | {selected.period}</span>
                  <span className={`badge badge-${(selected.status || '').toLowerCase()}`} style={{ marginLeft: 8 }}>{selected.status}</span>
                  {selected.locked && <span className="badge badge-locked" style={{ marginLeft: 4 }}>LOCKED</span>}
                </div>
                <div>
                  {ps.eligible && <span className="ps-indicator ps-eligible">PS Eligible ✓</span>}
                  {ps.deficit_flag && <span className="ps-indicator ps-deficit">PS Deficit — Reverted to Commission</span>}
                  {!ps.eligible && !ps.deficit_flag && <span className="ps-indicator ps-not-eligible">PS Not Eligible</span>}
                </div>
              </div>

              <div className="pnl-statement">
                {/* Revenue */}
                <div className="pnl-section">
                  <div className="pnl-section-header">Revenue</div>
                  <div className="pnl-row"><span className="label">Gross Sales</span><span className="value">{fmt(r.gross_sales)}</span></div>
                  <div className="pnl-row"><span className="label">Less: VAT</span><span className="value">({fmt(r.total_vat)})</span></div>
                  <div className="pnl-row subtotal"><span className="label">Net Sales</span><span className="value">{fmt(r.net_sales)}</span></div>
                  <div className="pnl-row"><span className="label">Collections (Net of VAT)</span><span className="value">{fmt(r.collections_net_of_vat)}</span></div>
                </div>

                {/* COGS */}
                <div className="pnl-section">
                  <div className="pnl-section-header">Cost of Goods Sold</div>
                  <div className="pnl-row"><span className="label">COGS</span><span className="value">({fmt(c.total_cogs)})</span></div>
                </div>

                {/* Gross Profit */}
                <div className={`pnl-row subtotal ${(selected.gross_profit || 0) >= 0 ? 'positive' : 'negative'}`}>
                  <span className="label">Gross Profit</span>
                  <span className="value">{fmt(selected.gross_profit)}</span>
                </div>

                {/* Expenses */}
                <div className="pnl-section">
                  <div className="pnl-section-header">Operating Expenses</div>
                  <div className="pnl-row"><span className="label">SMER Reimbursable</span><span className="value">{fmt(e.smer_reimbursable)}</span></div>
                  <div className="pnl-row"><span className="label">Gasoline less Personal</span><span className="value">{fmt(e.gasoline_less_personal)}</span></div>
                  <div className="pnl-row"><span className="label">Partners' Insurance</span><span className="value">{fmt(e.partners_insurance)}</span></div>
                  <div className="pnl-row"><span className="label">ACCESS Total</span><span className="value">{fmt(e.access_total)}</span></div>
                  <div className="pnl-row"><span className="label">ORE Total</span><span className="value">{fmt(e.ore_total)}</span></div>
                  <div className="pnl-row"><span className="label">Sampling / DR Cost</span><span className="value">{fmt(e.sampling_dr_cost)}</span></div>
                  <div className="pnl-row">
                    <span className="label">Depreciation</span>
                    <span className="value">
                      {canEdit ? <input type="number" defaultValue={e.depreciation || 0}
                        onChange={ev => setManualEdits(p => ({ ...p, depreciation: parseFloat(ev.target.value) || 0 }))} /> : fmt(e.depreciation)}
                    </span>
                  </div>
                  <div className="pnl-row">
                    <span className="label">Loan Amortization</span>
                    <span className="value">
                      {canEdit ? <input type="number" defaultValue={e.loan_amortization || 0}
                        onChange={ev => setManualEdits(p => ({ ...p, loan_amortization: parseFloat(ev.target.value) || 0 }))} /> : fmt(e.loan_amortization)}
                    </span>
                  </div>
                  <div className="pnl-row subtotal"><span className="label">Total Expenses</span><span className="value">({fmt(selected.total_expenses)})</span></div>
                </div>

                {/* Net Income */}
                <div className={`pnl-row total ${(selected.net_income || 0) >= 0 ? 'positive' : 'negative'}`}>
                  <span className="label">Net Income</span>
                  <span className="value">{fmt(selected.net_income)}</span>
                </div>

                {/* Profit Sharing Summary */}
                {ps.eligible && (
                  <div className="pnl-section">
                    <div className="pnl-section-header">Profit Sharing</div>
                    <div className="pnl-row"><span className="label">BDM Share (30%)</span><span className="value" style={{ color: '#16a34a' }}>{fmt(ps.bdm_share)}</span></div>
                    <div className="pnl-row"><span className="label">VIP Share (70%)</span><span className="value">{fmt(ps.vip_share)}</span></div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {canEdit && Object.keys(manualEdits).length > 0 && (
                  <button className="btn btn-primary" onClick={handleSaveManual} disabled={loading}>Save Manual Entries</button>
                )}
                {isAdmin && ['GENERATED', 'REVIEWED'].includes(selected.status) && !selected.locked && (
                  <button className="btn btn-success" onClick={handlePost} disabled={loading}>Post P&L</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
