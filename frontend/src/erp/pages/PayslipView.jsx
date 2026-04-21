import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePayroll from '../hooks/usePayroll';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';

/**
 * PayslipView — Phase G1.3 transparent layout.
 *
 * Every deduction row carries: label + amount + kind badge (ONE-STOP /
 * INSTALLMENT N/M) + status pill + optional expandable source detail. Mirrors
 * the contractor Income.jsx / MyIncome.jsx layout so the two render identical
 * transparency contracts — a BDM who graduates to employee sees the same
 * payslip format they used as a contractor.
 *
 * Historical pre-G1.3 POSTED payslips have no deduction_lines[] persisted.
 * The backend lazy-backfills an in-memory array from the flat fields on read
 * so this page renders without a one-shot migration. See
 * payslipCalc.backfillDeductionLines for the shape and the (historical) mark.
 */

const pageStyles = `
  .psv-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .psv-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 900px; margin: 0 auto; }
  .psv-back { font-size: 13px; color: var(--erp-accent, #1e5eff); cursor: pointer; margin-bottom: 12px; display: inline-block; }
  .psv-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e2e8f0); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .psv-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; }
  .psv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .psv-header h2 { font-size: 18px; font-weight: 700; margin: 0; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-verified { background: #d1fae5; color: #065f46; }
  .badge-corrected { background: #dbeafe; color: #1d4ed8; }
  .badge-rejected { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
  .badge-onestop { background: #e2e8f0; color: #475569; }
  .badge-installment { background: #fef3c7; color: #92400e; font-weight: 600; }
  .psv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .psv-table td { padding: 6px 0; vertical-align: top; }
  .psv-table td:first-child { color: var(--erp-muted, #64748b); }
  .psv-table td:last-child { text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; }
  .psv-total { border-top: 2px solid var(--erp-text, #1a1a2e); font-weight: 700; font-size: 14px; }
  .psv-total td { padding-top: 10px; }
  .psv-net { font-size: 22px; font-weight: 800; color: #16a34a; text-align: right; margin-top: 4px; }
  .psv-meta { font-size: 12px; color: var(--erp-muted); margin-top: 8px; }
  .psv-empty { color: #64748b; text-align: center; padding: 40px; }
  .deduction-desc { font-size: 11px; color: var(--erp-muted); display: block; margin-top: 2px; }
  .bd-toggle { cursor: pointer; user-select: none; transition: background 0.15s; }
  .bd-toggle:hover { background: var(--erp-accent-soft, #e8efff); }
  .bd-arrow { display: inline-block; width: 16px; font-size: 10px; color: var(--erp-muted); transition: transform 0.2s; }
  .bd-arrow.open { transform: rotate(90deg); }
  .bd-panel { background: #f8fafc; border: 1px solid var(--erp-border, #e2e8f0); border-radius: 8px; padding: 12px; margin: 4px 0 8px; animation: bdSlide 0.2s ease-out; }
  @keyframes bdSlide { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
  .bd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .bd-table th { text-align: left; padding: 4px 6px; background: #e8efff; font-weight: 600; font-size: 11px; }
  .bd-table td { padding: 4px 6px; border-top: 1px solid #e2e8f0; vertical-align: top; }
  .bd-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .bd-subtotal { font-weight: 600; background: #f0f4ff; }
  .bd-section-title { font-size: 12px; font-weight: 700; color: var(--erp-text, #1a1a2e); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bd-empty { text-align: center; color: var(--erp-muted, #64748b); padding: 12px; font-size: 12px; font-style: italic; }
  .bd-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .bd-load-hint { font-size: 11px; color: var(--erp-muted, #64748b); margin-top: 4px; font-style: italic; }
  @media(max-width: 768px) { .psv-main { padding: 12px; } }
`;

const fmt = (n) => '\u20B1' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CHIPS = {
  PENDING: 'badge-pending',
  VERIFIED: 'badge-verified',
  CORRECTED: 'badge-corrected',
  REJECTED: 'badge-rejected',
};

export default function PayslipView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = usePayroll();
  const [ps, setPs] = useState(null);
  const [loading, setLoading] = useState(true);

  // Phase G1.3 — transparent breakdown (Car Logbook for Personal Gas, etc.)
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await api.getPayslip(id);
      setPs(res?.data || null);
    } catch (err) {
      console.error('[PayslipView] load error:', err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const loadBreakdown = async () => {
    if (breakdown?.payslip_id === id || breakdownLoading) return;
    setBreakdownLoading(true);
    try {
      const res = await api.getPayslipBreakdown(id);
      setBreakdown(res?.data || null);
    } catch (err) {
      console.error('[PayslipView] breakdown load error:', err.message);
      setBreakdown(null);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    // Lazy-load breakdown on first expand of any expandable row
    if (!breakdown && !expandedSections[key]) {
      loadBreakdown();
    }
  };

  if (loading) {
    return (
      <div className="admin-page erp-page psv-page">
        <style>{pageStyles}</style>
        <Navbar />
        <div className="admin-layout">
          <Sidebar />
          <main className="psv-main"><div className="psv-empty">Loading...</div></main>
        </div>
      </div>
    );
  }
  if (!ps) {
    return (
      <div className="admin-page erp-page psv-page">
        <style>{pageStyles}</style>
        <Navbar />
        <div className="admin-layout">
          <Sidebar />
          <main className="psv-main"><div className="psv-empty">Payslip not found</div></main>
        </div>
      </div>
    );
  }

  const e = ps.earnings || {};
  const ec = ps.employer_contributions || {};
  const lines = ps.deduction_lines || [];
  const statusColor = ps.status === 'POSTED' ? '#dcfce7' : ps.status === 'APPROVED' ? '#e0e7ff' : '#fef3c7';
  const statusText = ps.status === 'POSTED' ? '#166534' : ps.status === 'APPROVED' ? '#3730a3' : '#92400e';

  return (
    <div className="admin-page erp-page psv-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="psv-main">
          <span className="psv-back" onClick={() => navigate(-1)}>\u2190 Back</span>
          <WorkflowGuide pageKey="payslip-view" />

          <RejectionBanner
            row={ps}
            moduleKey="PAYROLL"
            variant="page"
            docLabel={`${ps.person_id?.full_name || 'Payslip'} \u2014 ${ps.period} ${ps.cycle}`}
            onResubmit={() => navigate('/erp/payroll')}
          />

          <div className="psv-card">
            <div className="psv-header">
              <h2>{ps.person_id?.full_name || 'Payslip'}</h2>
              <span className="badge" style={{ background: statusColor, color: statusText }}>{ps.status}</span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {ps.period} &middot; {ps.cycle} &middot; {ps.person_id?.person_type?.replace(/_/g, ' ')}
            </div>
          </div>

          {/* ═══ Earnings ═══ */}
          <div className="psv-card">
            <h3>Earnings</h3>
            <table className="psv-table">
              <tbody>
                {e.basic_salary > 0 && <tr><td>Basic Salary</td><td>{fmt(e.basic_salary)}</td></tr>}
                {e.rice_allowance > 0 && <tr><td>Rice Allowance</td><td>{fmt(e.rice_allowance)}</td></tr>}
                {e.clothing_allowance > 0 && <tr><td>Clothing Allowance</td><td>{fmt(e.clothing_allowance)}</td></tr>}
                {e.medical_allowance > 0 && <tr><td>Medical Allowance</td><td>{fmt(e.medical_allowance)}</td></tr>}
                {e.laundry_allowance > 0 && <tr><td>Laundry Allowance</td><td>{fmt(e.laundry_allowance)}</td></tr>}
                {e.transport_allowance > 0 && <tr><td>Transport Allowance</td><td>{fmt(e.transport_allowance)}</td></tr>}
                {e.incentive > 0 && <tr><td>Incentive</td><td>{fmt(e.incentive)}</td></tr>}
                {e.overtime > 0 && <tr><td>Overtime</td><td>{fmt(e.overtime)}</td></tr>}
                {e.holiday_pay > 0 && <tr><td>Holiday Pay</td><td>{fmt(e.holiday_pay)}</td></tr>}
                {e.night_diff > 0 && <tr><td>Night Differential</td><td>{fmt(e.night_diff)}</td></tr>}
                {e.bonus > 0 && <tr><td>Bonus</td><td>{fmt(e.bonus)}</td></tr>}
                {e.thirteenth_month > 0 && <tr><td>13th Month</td><td>{fmt(e.thirteenth_month)}</td></tr>}
                {e.reimbursements > 0 && <tr><td>Reimbursements</td><td>{fmt(e.reimbursements)}</td></tr>}
                {e.other_earnings > 0 && <tr><td>Other Earnings</td><td>{fmt(e.other_earnings)}</td></tr>}
                <tr className="psv-total"><td>Total Earnings</td><td>{fmt(ps.total_earnings)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* ═══ Deductions — transparent deduction_lines render ═══ */}
          <div className="psv-card">
            <h3>Deductions</h3>
            <table className="psv-table">
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No deductions</td></tr>
                )}
                {lines.map(line => {
                  const isPersonalGas = line.auto_source === 'PERSONAL_GAS';
                  const isExpandable = isPersonalGas;
                  const sectionKey = isPersonalGas ? 'personalGas' : null;
                  const kindBadge = 'ONE-STOP'; // Employee payslip has no installments today
                  const kindBadgeClass = 'badge-onestop';
                  const isZeroInfo = isPersonalGas && (line.amount || 0) === 0;
                  return (
                    <Fragment key={line._id}>
                      <tr
                        className={isExpandable ? 'bd-toggle' : ''}
                        style={{
                          ...(line.status === 'REJECTED' ? { opacity: 0.5 } : {}),
                          ...(isExpandable ? { cursor: 'pointer' } : {}),
                        }}
                        onClick={isExpandable ? () => toggleSection(sectionKey) : undefined}
                      >
                        <td>
                          {isExpandable && <span className={`bd-arrow ${expandedSections[sectionKey] ? 'open' : ''}`}>&#9656;</span>}
                          {line.deduction_label}
                          <span className={`badge ${STATUS_CHIPS[line.status] || ''}`} style={{ marginLeft: 6 }}>{line.status}</span>
                          <span className={`badge ${kindBadgeClass}`} style={{ marginLeft: 4 }}>{kindBadge}</span>
                          {line.auto_source && <span style={{ fontSize: 10, color: 'var(--erp-muted)', marginLeft: 4 }}>(auto)</span>}
                          {line.description && <span className="deduction-desc">{line.description}</span>}
                          {line.finance_note && <span className="deduction-desc" style={{ color: '#b45309' }}>Finance: {line.finance_note}</span>}
                        </td>
                        <td style={{ color: isZeroInfo ? 'var(--erp-muted)' : undefined }}>
                          {line.original_amount != null && (
                            <span style={{ fontSize: 11, color: 'var(--erp-muted)', textDecoration: 'line-through', marginRight: 6 }}>
                              {fmt(line.original_amount)}
                            </span>
                          )}
                          {fmt(line.amount)}
                        </td>
                      </tr>

                      {isPersonalGas && expandedSections.personalGas && (
                        <tr><td colSpan={2} style={{ padding: 0 }}>
                          <div className="bd-panel">
                            {breakdownLoading && <div className="bd-empty">Loading logbook...</div>}
                            {!breakdownLoading && !breakdown?.personal_gas && (
                              <div className="bd-empty">No breakdown available</div>
                            )}
                            {breakdown?.personal_gas && breakdown.personal_gas.entries.length === 0 && (
                              <div className="bd-empty">No car logbook entries for this period</div>
                            )}
                            {breakdown?.personal_gas && breakdown.personal_gas.entries.length > 0 && (
                              <>
                                <div className="bd-section-title">Daily Logbook</div>
                                <div className="bd-scroll">
                                  <table className="bd-table">
                                    <thead><tr><th>Date</th><th>Start KM</th><th>End KM</th><th>Total</th><th>Personal</th><th>Official</th><th>Fuel</th><th>Gas Ded.</th></tr></thead>
                                    <tbody>
                                      {breakdown.personal_gas.entries.map(entry => (
                                        <tr key={entry._id}>
                                          <td>{entry.entry_date ? new Date(entry.entry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '-'}</td>
                                          <td>{entry.starting_km?.toLocaleString()}</td>
                                          <td>{entry.ending_km?.toLocaleString()}</td>
                                          <td>{entry.total_km}</td>
                                          <td>{entry.personal_km}</td>
                                          <td>{entry.official_km}</td>
                                          <td>
                                            {entry.fuel_entries.map((f, fi) => (
                                              <div key={fi} style={{ fontSize: 10 }}>{f.station_name || 'Fuel'}: {f.liters}L @ {fmt(f.price_per_liter)}</div>
                                            ))}
                                            {entry.fuel_entries.length === 0 && '-'}
                                          </td>
                                          <td>{fmt(entry.personal_gas_amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="bd-section-title" style={{ marginTop: 10 }}>Summary</div>
                                <table className="bd-table">
                                  <tbody>
                                    <tr><td>Total KM</td><td>{breakdown.personal_gas.summary.total_km?.toLocaleString()}</td></tr>
                                    <tr><td>Personal KM</td><td>{breakdown.personal_gas.summary.total_personal_km?.toLocaleString()}</td></tr>
                                    <tr><td>Official KM</td><td>{breakdown.personal_gas.summary.total_official_km?.toLocaleString()}</td></tr>
                                    <tr><td>Total Fuel</td><td>{breakdown.personal_gas.summary.total_fuel_liters?.toFixed(2)}L @ avg {fmt(breakdown.personal_gas.summary.avg_price_per_liter)}/L</td></tr>
                                    <tr className="bd-subtotal"><td>Personal Gas Deduction</td><td>{fmt(breakdown.personal_gas.total_deduction)}</td></tr>
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="psv-total"><td>Total Deductions</td><td>{fmt(ps.total_deductions)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="psv-card">
            <div className="psv-net">Net Pay: {fmt(ps.net_pay)}</div>
          </div>

          <div className="psv-card">
            <h3>Employer Contributions</h3>
            <table className="psv-table">
              <tbody>
                <tr><td>SSS (Employer)</td><td>{fmt(ec.sss_employer)}</td></tr>
                <tr><td>PhilHealth (Employer)</td><td>{fmt(ec.philhealth_employer)}</td></tr>
                <tr><td>PagIBIG (Employer)</td><td>{fmt(ec.pagibig_employer)}</td></tr>
                <tr><td>EC (Employer)</td><td>{fmt(ec.ec_employer)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="psv-meta">
            {ps.computed_at && <div>Computed: {new Date(ps.computed_at).toLocaleString()}</div>}
            {ps.reviewed_by && <div>Reviewed by: {ps.reviewed_by.name} on {new Date(ps.reviewed_at).toLocaleString()}</div>}
            {ps.approved_by && <div>Approved by: {ps.approved_by.name} on {new Date(ps.approved_at).toLocaleString()}</div>}
            {ps.posted_at && <div>Posted: {new Date(ps.posted_at).toLocaleString()}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
