import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePeople from '../hooks/usePeople';
import usePayroll from '../hooks/usePayroll';

const pageStyles = `
  .pd-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pd-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 900px; margin: 0 auto; }
  .pd-back { font-size: 13px; color: var(--erp-accent, #1e5eff); cursor: pointer; margin-bottom: 12px; display: inline-block; }
  .pd-card { background: var(--erp-panel, #fff); border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .pd-card h3 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: var(--erp-text); }
  .pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
  .pd-item { font-size: 13px; }
  .pd-item .lbl { font-size: 11px; color: var(--erp-muted, #64748b); font-weight: 600; }
  .pd-item .val { color: var(--erp-text, #1a1a2e); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .pd-comp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  .pd-comp-table th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft, #e8efff); font-size: 11px; color: var(--erp-muted); }
  .pd-comp-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .pd-ps-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  .pd-ps-table th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft); font-size: 11px; color: var(--erp-muted); }
  .pd-ps-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .pd-empty { color: #64748b; font-size: 13px; padding: 12px 0; }
  @media(max-width: 768px) { .pd-main { padding: 12px; } .pd-grid { grid-template-columns: 1fr; } }
`;

export default function PersonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const pplApi = usePeople();
  const payApi = usePayroll();
  const [person, setPerson] = useState(null);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, psRes] = await Promise.all([
        pplApi.getPersonById(id),
        payApi.getPayslipHistory(id, { limit: 12 }),
      ]);
      setPerson(pRes?.data || null);
      setPayslips(psRes?.data || []);
    } catch (err) { console.error('[PersonDetail] load error:', err.message); } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="admin-page erp-page pd-page"><Navbar /><div className="admin-layout"><Sidebar /><main className="pd-main"><div className="pd-empty">Loading...</div></main></div></div>;
  if (!person) return <div className="admin-page erp-page pd-page"><Navbar /><div className="admin-layout"><Sidebar /><main className="pd-main"><div className="pd-empty">Person not found</div></main></div></div>;

  const comp = person.comp_profile;
  const fmt = (n) => n != null ? `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—';

  return (
    <div className="admin-page erp-page pd-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="pd-main">
          <span className="pd-back" onClick={() => navigate('/erp/people')}>← Back to People</span>

          <div className="pd-card">
            <h3>{person.full_name}</h3>
            <div className="pd-grid">
              <div className="pd-item"><div className="lbl">Type</div><span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>{person.person_type?.replace(/_/g, ' ')}</span></div>
              <div className="pd-item"><div className="lbl">Status</div><span className="badge" style={{ background: person.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: person.status === 'ACTIVE' ? '#166534' : '#dc2626' }}>{person.status}</span></div>
              <div className="pd-item"><div className="lbl">Position</div><div className="val">{person.position || '—'}</div></div>
              <div className="pd-item"><div className="lbl">Department</div><div className="val">{person.department || '—'}</div></div>
              <div className="pd-item"><div className="lbl">Employment</div><div className="val">{person.employment_type || '—'}</div></div>
              <div className="pd-item"><div className="lbl">Date Hired</div><div className="val">{person.date_hired ? new Date(person.date_hired).toLocaleDateString() : '—'}</div></div>
              <div className="pd-item"><div className="lbl">Civil Status</div><div className="val">{person.civil_status || '—'}</div></div>
              <div className="pd-item"><div className="lbl">Date of Birth</div><div className="val">{person.date_of_birth ? new Date(person.date_of_birth).toLocaleDateString() : '—'}</div></div>
            </div>
          </div>

          <div className="pd-card">
            <h3>Compensation Profile</h3>
            {comp ? (
              <div className="pd-grid">
                <div className="pd-item"><div className="lbl">Salary Type</div><div className="val">{comp.salary_type?.replace(/_/g, ' ')}</div></div>
                <div className="pd-item"><div className="lbl">Effective Date</div><div className="val">{new Date(comp.effective_date).toLocaleDateString()}</div></div>
                <div className="pd-item"><div className="lbl">Basic Salary</div><div className="val">{fmt(comp.basic_salary)}</div></div>
                <div className="pd-item"><div className="lbl">Monthly Gross</div><div className="val" style={{ fontWeight: 600 }}>{fmt(comp.monthly_gross)}</div></div>
                <div className="pd-item"><div className="lbl">Rice</div><div className="val">{fmt(comp.rice_allowance)}</div></div>
                <div className="pd-item"><div className="lbl">Clothing</div><div className="val">{fmt(comp.clothing_allowance)}</div></div>
                <div className="pd-item"><div className="lbl">Medical</div><div className="val">{fmt(comp.medical_allowance)}</div></div>
                <div className="pd-item"><div className="lbl">Transport</div><div className="val">{fmt(comp.transport_allowance)}</div></div>
                <div className="pd-item"><div className="lbl">Tax Status</div><div className="val">{comp.tax_status}</div></div>
                <div className="pd-item"><div className="lbl">Per Diem Rate</div><div className="val">{fmt(comp.perdiem_rate)}</div></div>
              </div>
            ) : (
              <div className="pd-empty">No compensation profile set</div>
            )}

            {person.comp_history?.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Compensation History</h3>
                <table className="pd-comp-table">
                  <thead><tr><th>Effective</th><th>Type</th><th>Basic</th><th>Gross</th><th>Status</th></tr></thead>
                  <tbody>
                    {person.comp_history.map((c) => (
                      <tr key={c._id || c.effective_date}>
                        <td>{new Date(c.effective_date).toLocaleDateString()}</td>
                        <td>{c.salary_type?.replace(/_/g, ' ')}</td>
                        <td>{fmt(c.basic_salary)}</td>
                        <td>{fmt(c.monthly_gross)}</td>
                        <td>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          <div className="pd-card">
            <h3>Payslip History</h3>
            {payslips.length ? (
              <table className="pd-ps-table">
                <thead><tr><th>Period</th><th>Cycle</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
                <tbody>
                  {payslips.map(ps => (
                    <tr key={ps._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/payslip/${ps._id}`)}>
                      <td>{ps.period}</td>
                      <td>{ps.cycle}</td>
                      <td>{fmt(ps.total_earnings)}</td>
                      <td>{fmt(ps.total_deductions)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(ps.net_pay)}</td>
                      <td><span className="badge" style={{ background: ps.status === 'POSTED' ? '#dcfce7' : '#fef3c7', color: ps.status === 'POSTED' ? '#166534' : '#92400e' }}>{ps.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="pd-empty">No payslips yet</div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
