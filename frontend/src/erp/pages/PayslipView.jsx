import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePayroll from '../hooks/usePayroll';

const pageStyles = `
  .psv-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .psv-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 800px; margin: 0 auto; }
  .psv-back { font-size: 13px; color: var(--erp-accent, #1e5eff); cursor: pointer; margin-bottom: 12px; display: inline-block; }
  .psv-card { background: var(--erp-panel, #fff); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .psv-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; }
  .psv-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .psv-header h2 { font-size: 18px; font-weight: 700; margin: 0; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .psv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .psv-table td { padding: 6px 0; }
  .psv-table td:first-child { color: var(--erp-muted, #64748b); }
  .psv-table td:last-child { text-align: right; font-weight: 500; }
  .psv-total { border-top: 2px solid var(--erp-text, #1a1a2e); font-weight: 700; font-size: 14px; }
  .psv-net { font-size: 20px; font-weight: 800; color: #16a34a; text-align: right; margin-top: 4px; }
  .psv-meta { font-size: 12px; color: var(--erp-muted); margin-top: 8px; }
  .psv-empty { color: #64748b; text-align: center; padding: 40px; }
  @media(max-width: 768px) { .psv-main { padding: 12px; } }
`;

const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function PayslipView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = usePayroll();
  const [ps, setPs] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getPayslip(id);
      setPs(res?.data || null);
    } catch (err) { console.error('[PayslipView] load error:', err.message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="admin-page erp-page psv-page"><Navbar /><div className="admin-layout"><Sidebar /><main className="psv-main"><div className="psv-empty">Loading...</div></main></div></div>;
  if (!ps) return <div className="admin-page erp-page psv-page"><Navbar /><div className="admin-layout"><Sidebar /><main className="psv-main"><div className="psv-empty">Payslip not found</div></main></div></div>;

  const e = ps.earnings || {};
  const d = ps.deductions || {};
  const ec = ps.employer_contributions || {};
  const statusColor = ps.status === 'POSTED' ? '#dcfce7' : ps.status === 'APPROVED' ? '#e0e7ff' : '#fef3c7';
  const statusText = ps.status === 'POSTED' ? '#166534' : ps.status === 'APPROVED' ? '#3730a3' : '#92400e';

  return (
    <div className="admin-page erp-page psv-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="psv-main">
          <span className="psv-back" onClick={() => navigate(-1)}>← Back</span>

          <div className="psv-card">
            <div className="psv-header">
              <h2>{ps.person_id?.full_name || 'Payslip'}</h2>
              <span className="badge" style={{ background: statusColor, color: statusText }}>{ps.status}</span>
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {ps.period} &middot; {ps.cycle} &middot; {ps.person_id?.person_type?.replace(/_/g, ' ')}
            </div>
          </div>

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
                {e.bonus > 0 && <tr><td>Bonus</td><td>{fmt(e.bonus)}</td></tr>}
                {e.thirteenth_month > 0 && <tr><td>13th Month</td><td>{fmt(e.thirteenth_month)}</td></tr>}
                {e.reimbursements > 0 && <tr><td>Reimbursements</td><td>{fmt(e.reimbursements)}</td></tr>}
                {e.other_earnings > 0 && <tr><td>Other Earnings</td><td>{fmt(e.other_earnings)}</td></tr>}
                <tr className="psv-total"><td>Total Earnings</td><td>{fmt(ps.total_earnings)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="psv-card">
            <h3>Deductions</h3>
            <table className="psv-table">
              <tbody>
                {d.sss_employee > 0 && <tr><td>SSS</td><td>{fmt(d.sss_employee)}</td></tr>}
                {d.philhealth_employee > 0 && <tr><td>PhilHealth</td><td>{fmt(d.philhealth_employee)}</td></tr>}
                {d.pagibig_employee > 0 && <tr><td>PagIBIG</td><td>{fmt(d.pagibig_employee)}</td></tr>}
                {d.withholding_tax > 0 && <tr><td>Withholding Tax</td><td>{fmt(d.withholding_tax)}</td></tr>}
                {d.cash_advance > 0 && <tr><td>Cash Advance</td><td>{fmt(d.cash_advance)}</td></tr>}
                {d.loan_payments > 0 && <tr><td>Loan Payments</td><td>{fmt(d.loan_payments)}</td></tr>}
                {d.other_deductions > 0 && <tr><td>Other Deductions</td><td>{fmt(d.other_deductions)}</td></tr>}
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
