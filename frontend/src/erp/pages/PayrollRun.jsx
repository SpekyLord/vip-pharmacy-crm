import React, { useState, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import usePayroll from '../hooks/usePayroll';

import SelectField from '../../components/common/Select';

const STATUS_COLORS = {
  COMPUTED: { bg: '#dbeafe', text: '#1e40af' },
  REVIEWED: { bg: '#fef3c7', text: '#92400e' },
  APPROVED: { bg: '#e0e7ff', text: '#3730a3' },
  POSTED: { bg: '#dcfce7', text: '#166534' },
};

const pageStyles = `
  .pr-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .pr-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .pr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .pr-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .pr-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
  .pr-controls input, .pr-controls select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #f59e0b; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .pr-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .pr-stat { background: var(--erp-panel, #fff); border-radius: 10px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .pr-stat .lbl { font-size: 11px; color: var(--erp-muted); font-weight: 600; }
  .pr-stat .val { font-size: 18px; font-weight: 700; color: var(--erp-text); }
  .pr-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .pr-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 10px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted); }
  .pr-table td { padding: 10px 10px; border-top: 1px solid var(--erp-border); }
  .pr-table tr:hover { background: var(--erp-accent-soft); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .pr-actions { display: flex; gap: 4px; }
  .pr-msg { font-size: 13px; margin-top: 8px; padding: 8px 12px; border-radius: 8px; }
  .pr-msg-ok { background: #dcfce7; color: #166534; }
  .pr-msg-err { background: #fee2e2; color: #dc2626; }
  .pr-empty { text-align: center; color: #64748b; padding: 40px; }
  @media(max-width: 768px) { .pr-main { padding: 12px; } }
`;

const getCurrentPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const fmt = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function PayrollRun() {
  const { user } = useAuth();
  const api = usePayroll();
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [cycle, setCycle] = useState('MONTHLY');
  const [payslips, setPayslips] = useState([]);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const isFinance = ['admin', 'finance', 'president'].includes(user?.role);

  const loadStaging = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getPayrollStaging({ period, cycle });
      setPayslips(res?.data || []);
      setSummary(res?.summary || null);
    } catch {} finally { setLoading(false); }
  }, [period, cycle]);

  const handleCompute = async () => {
    setMsg(null);
    try {
      const res = await api.computePayroll({ period, cycle });
      setMsg({ type: 'ok', text: res?.message || 'Payroll computed' });
      loadStaging();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Failed to compute' });
    }
  };

  const handleAction = async (id, action) => {
    try {
      if (action === 'review') await api.reviewPayslip(id);
      if (action === 'approve') await api.approvePayslip(id);
      loadStaging();
    } catch {}
  };

  const handlePostAll = async () => {
    try {
      const res = await api.postPayroll({ period, cycle });
      setMsg({ type: 'ok', text: res?.message || 'Posted' });
      loadStaging();
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.message || 'Failed to post' });
    }
  };

  return (
    <div className="admin-page erp-page pr-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="pr-main">
          <div className="pr-header">
            <h2>Payroll Run</h2>
          </div>

          <div className="pr-controls">
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
            <SelectField value={cycle} onChange={e => setCycle(e.target.value)}>
              <option value="MONTHLY">Monthly</option>
              <option value="C1">C1 (1st half)</option>
              <option value="C2">C2 (2nd half)</option>
            </SelectField>
            <button className="btn btn-primary" onClick={loadStaging}>Load Staging</button>
            {isFinance && <button className="btn btn-warning" onClick={handleCompute}>Compute Payroll</button>}
            {isFinance && <button className="btn btn-success" onClick={handlePostAll}>Post All Approved</button>}
          </div>

          {msg && <div className={`pr-msg ${msg.type === 'ok' ? 'pr-msg-ok' : 'pr-msg-err'}`}>{msg.text}</div>}

          {summary && (
            <div className="pr-summary">
              <div className="pr-stat"><div className="lbl">Payslips</div><div className="val">{summary.count}</div></div>
              <div className="pr-stat"><div className="lbl">Total Gross</div><div className="val">{fmt(summary.total_gross)}</div></div>
              <div className="pr-stat"><div className="lbl">Total Deductions</div><div className="val">{fmt(summary.total_deductions)}</div></div>
              <div className="pr-stat"><div className="lbl">Total Net Pay</div><div className="val" style={{ color: '#16a34a' }}>{fmt(summary.total_net)}</div></div>
              <div className="pr-stat"><div className="lbl">Employer Cost</div><div className="val">{fmt(summary.total_employer)}</div></div>
            </div>
          )}

          {loading ? (
            <div className="pr-empty">Loading...</div>
          ) : !payslips.length ? (
            <div className="pr-empty">No payslips. Click "Compute Payroll" to generate.</div>
          ) : (
            <table className="pr-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Status</th>
                  {isFinance && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {payslips.map(ps => {
                  const sc = STATUS_COLORS[ps.status] || { bg: '#f3f4f6', text: '#374151' };
                  const name = ps.person_id?.full_name || '—';
                  const type = ps.person_id?.person_type?.replace(/_/g, ' ') || '';
                  return (
                    <tr key={ps._id}>
                      <td style={{ fontWeight: 500 }}>{name}</td>
                      <td>{type}</td>
                      <td>{fmt(ps.total_earnings)}</td>
                      <td>{fmt(ps.total_deductions)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(ps.net_pay)}</td>
                      <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{ps.status}</span></td>
                      {isFinance && (
                        <td>
                          <div className="pr-actions">
                            {ps.status === 'COMPUTED' && <button className="btn btn-sm btn-primary" onClick={() => handleAction(ps._id, 'review')}>Review</button>}
                            {ps.status === 'REVIEWED' && <button className="btn btn-sm btn-success" onClick={() => handleAction(ps._id, 'approve')}>Approve</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </main>
      </div>
    </div>
  );
}
