/**
 * Profit Sharing Page — Per-Product Eligibility + Year-End Close
 *
 * PRD §9.2-9.3:
 *   Condition A: Product ordered by ≥ 2 hospitals
 *   Condition B: ≥ 1 MD tagged per product per collection
 *   Condition C: A + B met for 3 consecutive months
 *
 * Year-End Close section for admin/finance roles.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useIncome from '../hooks/useIncome';
import { showError } from '../utils/errorToast';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .ps-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ps-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .ps-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .ps-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .controls select, .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .summary-cards { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
  .summary-card { flex: 1; min-width: 160px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; text-align: center; }
  .summary-card .value { font-size: 20px; font-weight: 700; }
  .summary-card .label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; margin-top: 4px; }
  .ps-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .ps-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; white-space: nowrap; }
  .ps-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .ps-table-wrap { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow-x: auto; }
  .ps-mobile-list { display: none; gap: 10px; }
  .ps-mobile-card { border: 1px solid var(--erp-border); border-radius: 14px; background: var(--erp-panel); padding: 14px; box-shadow: 0 8px 18px rgba(15,23,42,0.05); }
  .ps-mobile-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 10px; }
  .ps-mobile-title { font-size: 14px; font-weight: 800; color: var(--erp-text); }
  .ps-mobile-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .ps-mobile-item { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 12px; padding: 10px 12px; }
  .ps-mobile-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .ps-mobile-value { font-size: 13px; font-weight: 700; color: var(--erp-text); margin-top: 4px; }
  .cond { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; }
  .cond-pass { background: #d1fae5; color: #065f46; }
  .cond-fail { background: #fee2e2; color: #991b1b; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-qualified { background: #d1fae5; color: #065f46; }
  .badge-building { background: #fef3c7; color: #92400e; }
  .badge-not-met { background: #f3f4f6; color: #6b7280; }
  .fy-section { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-top: 24px; }
  .fy-section h3 { margin: 0 0 12px; font-size: 16px; }
  .fy-status { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
  .fy-checklist { list-style: none; padding: 0; margin: 12px 0; font-size: 13px; }
  .fy-checklist li { padding: 6px 0; display: flex; align-items: center; gap: 8px; }
  .fy-checklist .check { color: #16a34a; font-weight: 700; }
  .fy-checklist .cross { color: #dc2626; font-weight: 700; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .confirm-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .confirm-modal-content { background: var(--erp-panel); border-radius: 12px; padding: 24px; width: 420px; max-width: 90vw; }
  @media(max-width: 768px) { .ps-main { padding: 12px; } .ps-table { font-size: 11px; } .ps-table-wrap { display: none; } .ps-mobile-list { display: grid; } }
  @media(max-width: 480px) { .ps-mobile-grid { grid-template-columns: 1fr; } }
`;

function fmt(n) { return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ProfitSharing() {
  const { user } = useAuth();
  const inc = useIncome();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [period, setPeriod] = useState(getCurrentPeriod());
  const [bdmId, setBdmId] = useState('');
  const [psData, setPsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Year-End Close state
  const [fyYear, setFyYear] = useState(new Date().getFullYear());
  const [fyValidation, setFyValidation] = useState(null);
  const [fyStatus, setFyStatus] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const loadPsData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (bdmId) params.bdm_id = bdmId;
      const res = await inc.getProfitShareStatus(params);
      setPsData(res?.data || null);
    } catch (err) { showError(err, 'Could not load profit sharing data'); setPsData(null); }
    setLoading(false);
  }, [period, bdmId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPsData(); }, [loadPsData]);

  const loadFyStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await inc.getFiscalYearStatus({ fiscal_year: fyYear });
      setFyStatus(res?.data || null);
    } catch (err) { showError(err, 'Could not load fiscal year status'); setFyStatus(null); }
  }, [fyYear, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadFyStatus(); }, [loadFyStatus]);

  const handleValidateYearEnd = async () => {
    setLoading(true);
    try {
      const res = await inc.validateYearEnd({ fiscal_year: fyYear });
      setFyValidation(res?.data || null);
    } catch (err) { showError(err, 'Year-end validation failed'); }
    setLoading(false);
  };

  const handleExecuteYearEnd = async () => {
    setLoading(true);
    try {
      await inc.executeYearEnd({ fiscal_year: fyYear });
      setShowConfirm(false);
      setFyValidation(null);
      loadFyStatus();
    } catch (err) { showError(err, 'Year-end close failed'); }
    setLoading(false);
  };

  const products = psData?.ps_products || [];
  const qualifiedCount = products.filter(p => p.qualified).length;

  return (
    <div className="ps-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="ps-main">
          <WorkflowGuide pageKey="profit-sharing" />
          <div className="ps-header">
            <h1>Profit Sharing</h1>
            <div className="controls">
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
              {isAdmin && (
                <input type="text" placeholder="BDM ID (optional)" value={bdmId}
                  onChange={e => setBdmId(e.target.value)} style={{ width: 160 }} />
              )}
              <Link to="/erp/reports" className="erp-back-btn">
                Back to Reports
              </Link>
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {/* ═══ Summary Cards ═══ */}
          {psData && !loading && (
            <>
              <div className="summary-cards">
                <div className="summary-card">
                  <div className="value" style={{ color: psData.eligible ? '#16a34a' : '#6b7280' }}>
                    {psData.eligible ? 'Yes' : 'No'}
                  </div>
                  <div className="label">PS Eligible</div>
                </div>
                <div className="summary-card">
                  <div className="value">{qualifiedCount} / {products.length}</div>
                  <div className="label">Qualifying Products</div>
                </div>
                <div className="summary-card">
                  <div className="value" style={{ color: '#16a34a' }}>{fmt(psData.bdm_share)}</div>
                  <div className="label">BDM Share (30%)</div>
                </div>
                <div className="summary-card">
                  <div className="value">{fmt(psData.vip_share)}</div>
                  <div className="label">VIP Share (70%)</div>
                </div>
                {psData.deficit_flag && (
                  <div className="summary-card" style={{ borderColor: '#fca5a5' }}>
                    <div className="value" style={{ color: '#dc2626' }}>Deficit</div>
                    <div className="label">Reverted to Commission</div>
                  </div>
                )}
              </div>

              {/* ═══ Product Eligibility Table ═══ */}
              <div className="ps-table-wrap">
                <table className="ps-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ textAlign: 'center' }}>Hospitals (A)</th>
                      <th style={{ textAlign: 'center' }}>MD Tags (B)</th>
                      <th style={{ textAlign: 'center' }}>Streak (C)</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>No product data for this period</td></tr>
                    )}
                    {products.map((p) => {
                      const passA = p.hospital_count >= 2;
                      const passB = p.md_count >= 1;
                      return (
                        <tr key={p.product_id || p.product_name}>
                          <td>{p.product_name || p.product_id}</td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`cond ${passA ? 'cond-pass' : 'cond-fail'}`}>{passA ? '✓' : '✗'}</span>
                            <span style={{ marginLeft: 6, fontSize: 12 }}>{p.hospital_count}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`cond ${passB ? 'cond-pass' : 'cond-fail'}`}>{passB ? '✓' : '✗'}</span>
                            <span style={{ marginLeft: 6, fontSize: 12 }}>{p.md_count}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{p.consecutive_months}</span>
                            <span style={{ fontSize: 11, color: 'var(--erp-muted)', marginLeft: 4 }}>months</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {p.qualified
                              ? <span className="badge badge-qualified">Qualified</span>
                              : passA && passB
                                ? <span className="badge badge-building">Building ({p.consecutive_months}/3)</span>
                                : <span className="badge badge-not-met">Not Met</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="ps-mobile-list">
                {products.length === 0 && (
                  <div className="ps-mobile-card" style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No product data for this period</div>
                )}
                {products.map((p) => {
                  const passA = p.hospital_count >= 2;
                  const passB = p.md_count >= 1;
                  return (
                    <div className="ps-mobile-card" key={`mobile-${p.product_id || p.product_name}`}>
                      <div className="ps-mobile-top">
                        <div>
                          <div className="ps-mobile-title">{p.product_name || p.product_id}</div>
                          <div className="list-mobile-sub">Eligibility by product</div>
                        </div>
                        {p.qualified
                          ? <span className="badge badge-qualified">Qualified</span>
                          : passA && passB
                            ? <span className="badge badge-building">Building ({p.consecutive_months}/3)</span>
                            : <span className="badge badge-not-met">Not Met</span>}
                      </div>
                      <div className="ps-mobile-grid">
                        <div className="ps-mobile-item"><div className="ps-mobile-label">Hospitals</div><div className="ps-mobile-value">{p.hospital_count} {passA ? '✓' : '✗'}</div></div>
                        <div className="ps-mobile-item"><div className="ps-mobile-label">MD Tags</div><div className="ps-mobile-value">{p.md_count} {passB ? '✓' : '✗'}</div></div>
                        <div className="ps-mobile-item"><div className="ps-mobile-label">Streak</div><div className="ps-mobile-value">{p.consecutive_months} months</div></div>
                        <div className="ps-mobile-item"><div className="ps-mobile-label">Status</div><div className="ps-mobile-value">{p.qualified ? 'Qualified' : 'Not Met'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ Year-End Close Section (Admin Only) ═══ */}
          {isAdmin && (
            <div className="fy-section">
              <h3>Year-End Close</h3>
              <div className="fy-status">
                <SelectField value={fyYear} onChange={e => setFyYear(parseInt(e.target.value))}>
                  {[...Array(5)].map((_, i) => {
                    const y = new Date().getFullYear() - 2 + i;
                    return <option key={y} value={y}>{y}</option>;
                  })}
                </SelectField>
                {fyStatus && (
                  <span className={`badge ${fyStatus.status === 'CLOSED' ? 'badge-qualified' : 'badge-not-met'}`}>
                    FY {fyYear}: {fyStatus.status}
                  </span>
                )}
                {fyStatus?.closed_at && (
                  <span style={{ fontSize: 12, color: 'var(--erp-muted)' }}>
                    Closed: {new Date(fyStatus.closed_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {fyStatus?.status !== 'CLOSED' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline" onClick={handleValidateYearEnd} disabled={loading}>
                    Validate Readiness
                  </button>
                  {fyValidation?.ready && (
                    <button className="btn btn-danger" onClick={() => setShowConfirm(true)} disabled={loading}>
                      Close Year {fyYear}
                    </button>
                  )}
                </div>
              )}

              {/* Validation Results */}
              {fyValidation && (
                <ul className="fy-checklist">
                  <li>
                    <span className={fyValidation.missing_periods.length === 0 ? 'check' : 'cross'}>
                      {fyValidation.missing_periods.length === 0 ? '✓' : '✗'}
                    </span>
                    All monthly archives exist
                    {fyValidation.missing_periods.length > 0 && (
                      <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 8 }}>
                        Missing: {fyValidation.missing_periods.join(', ')}
                      </span>
                    )}
                  </li>
                  <li>
                    <span className={fyValidation.open_periods.length === 0 ? 'check' : 'cross'}>
                      {fyValidation.open_periods.length === 0 ? '✓' : '✗'}
                    </span>
                    All periods closed
                    {fyValidation.open_periods.length > 0 && (
                      <span style={{ fontSize: 11, color: '#dc2626', marginLeft: 8 }}>
                        Open: {fyValidation.open_periods.join(', ')}
                      </span>
                    )}
                  </li>
                  <li>
                    <span className={!fyValidation.already_closed ? 'check' : 'cross'}>
                      {!fyValidation.already_closed ? '✓' : '✗'}
                    </span>
                    Fiscal year not already closed
                  </li>
                  <li>
                    <span className={fyValidation.ready ? 'check' : 'cross'}>
                      {fyValidation.ready ? '✓' : '✗'}
                    </span>
                    <strong>{fyValidation.ready ? 'Ready for year-end close' : 'Not ready — resolve issues above'}</strong>
                  </li>
                </ul>
              )}

              {/* Year-End Data Summary */}
              {fyStatus?.data && (
                <div style={{ marginTop: 12, fontSize: 13, padding: 12, background: 'var(--erp-bg)', borderRadius: 8 }}>
                  <div><strong>Total Revenue:</strong> {fmt(fyStatus.data.total_revenue)}</div>
                  <div><strong>Total Expenses:</strong> {fmt(fyStatus.data.total_expenses)}</div>
                  <div><strong>Net Income:</strong> <span style={{ color: (fyStatus.data.net_income || 0) >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{fmt(fyStatus.data.net_income)}</span></div>
                  <div><strong>Retained Earnings Transfer:</strong> {fmt(fyStatus.data.retained_earnings_transfer)}</div>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 4 }}>
                    {fyStatus.data.closing_entries_pending ? 'Journal entries pending (Phase 11)' : 'Journal entries posted'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confirmation Modal */}
          {showConfirm && (
            <div className="confirm-modal" onClick={() => setShowConfirm(false)}>
              <div className="confirm-modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 12px', color: '#dc2626' }}>Close Fiscal Year {fyYear}?</h3>
                <p style={{ fontSize: 13 }}>This action will:</p>
                <ul style={{ fontSize: 13, margin: '8px 0', paddingLeft: 20 }}>
                  <li>Lock all 12 monthly periods</li>
                  <li>Lock all PNL reports for the year</li>
                  <li>Compute retained earnings transfer</li>
                  <li>Prevent any future posting to this fiscal year</li>
                </ul>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>This cannot be undone.</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleExecuteYearEnd} disabled={loading}>
                    Close Year {fyYear}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
