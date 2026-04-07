/**
 * Income Page — BDM Payslip View
 *
 * PRD §10: GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
 * Earnings: SMER + CORE Commission + Bonus + Profit Sharing + Reimbursements
 * Deductions: Cash Advance + Credit Card + Credit Payment + Purchased Goods + Other + Over Payment
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useIncome from '../hooks/useIncome';

import { showError } from '../utils/errorToast';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .income-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .income-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .income-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .income-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .controls select, .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .payslip-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .payslip-card h3 { margin: 0 0 12px; font-size: 15px; color: var(--erp-text); }
  .payslip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .payslip-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .payslip-table th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft, #e8efff); font-weight: 600; }
  .payslip-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .payslip-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .payslip-table input { width: 100px; padding: 4px 8px; border: 1px solid var(--erp-border); border-radius: 4px; text-align: right; font-size: 13px; }
  .total-row { font-weight: 700; background: var(--erp-accent-soft); }
  .net-pay { font-size: 24px; font-weight: 700; text-align: center; padding: 16px; background: var(--erp-accent-soft); border-radius: 12px; margin-top: 16px; }
  .net-pay .label { font-size: 12px; color: var(--erp-muted); text-transform: uppercase; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-generated { background: #dbeafe; color: #1d4ed8; }
  .badge-reviewed { background: #fef3c7; color: #92400e; }
  .badge-returned { background: #fee2e2; color: #991b1b; }
  .badge-confirmed { background: #d1fae5; color: #065f46; }
  .badge-credited { background: #a7f3d0; color: #047857; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-primary:hover { background: #1d4ed8; }
  .btn-success { background: #16a34a; color: white; }
  .btn-warning { background: #d97706; color: white; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .workflow-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .list-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .list-table th { background: var(--erp-accent-soft); padding: 10px 12px; text-align: left; font-weight: 600; }
  .list-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .list-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }
  .return-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .return-modal-content { background: var(--erp-panel); border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
  .return-modal textarea { width: 100%; padding: 8px; border: 1px solid var(--erp-border); border-radius: 8px; min-height: 80px; font-size: 13px; margin: 12px 0; }
  @media(max-width: 768px) { .income-main { padding: 12px; } .payslip-grid { grid-template-columns: 1fr; } }
`;

const STATUS_BADGES = {
  GENERATED: 'badge-generated', REVIEWED: 'badge-reviewed', RETURNED: 'badge-returned',
  BDM_CONFIRMED: 'badge-confirmed', CREDITED: 'badge-credited'
};

function fmt(n) { return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Income() {
  const { user } = useAuth();
  const inc = useIncome();
  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  const [view, setView] = useState('list'); // list | detail
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [cycle, setCycle] = useState('MONTHLY');
  const [bdmId, setBdmId] = useState('');
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [manualEdits, setManualEdits] = useState({});

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (cycle !== 'ALL') params.cycle = cycle;
      if (bdmId) params.bdm_id = bdmId;
      const res = await inc.getIncomeList(params);
      setReports(res?.data || []);
    } catch (err) { showError(err, 'Could not load income reports'); }
    setLoading(false);
  }, [period, cycle, bdmId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleGenerate = async () => {
    if (!bdmId && !isAdmin) return;
    const targetBdm = bdmId || user?._id;
    if (!targetBdm) return;
    setLoading(true);
    try {
      const res = await inc.generateIncome({ bdm_id: targetBdm, period, cycle: cycle === 'ALL' ? 'MONTHLY' : cycle });
      if (res?.data) { setSelected(res.data); setView('detail'); }
      loadReports();
    } catch (err) { showError(err, 'Could not generate income report'); }
    setLoading(false);
  };

  const handleSelect = async (report) => {
    setLoading(true);
    try {
      const res = await inc.getIncomeById(report._id);
      if (res?.data) { setSelected(res.data); setView('detail'); setManualEdits({}); }
    } catch (err) { showError(err, 'Could not load income detail'); }
    setLoading(false);
  };

  const handleSaveManual = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await inc.updateIncomeManual(selected._id, manualEdits);
      const res = await inc.getIncomeById(selected._id);
      if (res?.data) setSelected(res.data);
      setManualEdits({});
    } catch (err) { showError(err, 'Could not save manual edits'); }
    setLoading(false);
  };

  const handleWorkflow = async (action) => {
    if (!selected) return;
    setLoading(true);
    try {
      let res;
      switch (action) {
        case 'review': res = await inc.reviewIncome(selected._id); break;
        case 'return': res = await inc.returnIncome(selected._id, returnReason); setShowReturn(false); break;
        case 'confirm': res = await inc.confirmIncome(selected._id); break;
        case 'credit': res = await inc.creditIncome(selected._id); break;
        default: break;
      }
      if (res?.data) setSelected(res.data);
      loadReports();
    } catch (err) { showError(err, 'Workflow action failed'); }
    setLoading(false);
  };

  const canEdit = selected && ['GENERATED', 'REVIEWED'].includes(selected.status) && isAdmin;
  const bdmName = (r) => r.bdm_id ? `${r.bdm_id.firstName || ''} ${r.bdm_id.lastName || ''}`.trim() : 'N/A';

  return (
    <div className="income-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="income-main">
          <WorkflowGuide pageKey="income" />
          <div className="income-header">
            <h1>Income Reports</h1>
            <div className="controls">
              <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
              <SelectField value={cycle} onChange={e => setCycle(e.target.value)}>
                <option value="ALL">All Cycles</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
                <option value="MONTHLY">Monthly</option>
              </SelectField>
              {isAdmin && (
                <input type="text" placeholder="BDM ID (optional)" value={bdmId}
                  onChange={e => setBdmId(e.target.value)} style={{ width: 160 }} />
              )}
              {isAdmin && (
                <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
                  Generate Payslip
                </button>
              )}
              {view === 'detail' && (
                <button className="btn btn-outline" onClick={() => { setView('list'); setSelected(null); }}>
                  ← Back to List
                </button>
              )}
            </div>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {/* ═══ LIST VIEW ═══ */}
          {view === 'list' && !loading && (
            <table className="list-table">
              <thead>
                <tr>
                  <th>BDM</th>
                  <th>Period</th>
                  <th>Cycle</th>
                  <th>Earnings</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>No income reports found</td></tr>
                )}
                {reports.map(r => (
                  <tr key={r._id} onClick={() => handleSelect(r)}>
                    <td>{bdmName(r)}</td>
                    <td>{r.period}</td>
                    <td>{r.cycle}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.total_earnings)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.total_deductions)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.net_pay)}</td>
                    <td><span className={`badge ${STATUS_BADGES[r.status] || ''}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ═══ DETAIL VIEW ═══ */}
          {view === 'detail' && selected && !loading && (
            <>
              <div className="payslip-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3>Payslip — {bdmName(selected)} | {selected.period} {selected.cycle}</h3>
                  <span className={`badge ${STATUS_BADGES[selected.status] || ''}`}>{selected.status}</span>
                </div>

                {selected.return_reason && selected.status === 'RETURNED' && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                    <strong>Return Reason:</strong> {selected.return_reason}
                  </div>
                )}

                <div className="payslip-grid">
                  {/* Earnings */}
                  <div>
                    <table className="payslip-table">
                      <thead><tr><th colSpan={2}>Earnings</th></tr></thead>
                      <tbody>
                        <tr><td>SMER (Per Diem + Transport)</td><td>{fmt(selected.earnings?.smer)}</td></tr>
                        <tr><td>CORE Commission</td><td>{fmt(selected.earnings?.core_commission)}</td></tr>
                        <tr>
                          <td>Bonus</td>
                          <td>{canEdit ? <input type="number" defaultValue={selected.earnings?.bonus || 0}
                            onChange={e => setManualEdits(p => ({ ...p, earnings: { ...p.earnings, bonus: parseFloat(e.target.value) || 0 } }))} /> : fmt(selected.earnings?.bonus)}</td>
                        </tr>
                        <tr><td>Profit Sharing</td><td>{fmt(selected.earnings?.profit_sharing)}</td></tr>
                        <tr>
                          <td>Reimbursements</td>
                          <td>{canEdit ? <input type="number" defaultValue={selected.earnings?.reimbursements || 0}
                            onChange={e => setManualEdits(p => ({ ...p, earnings: { ...p.earnings, reimbursements: parseFloat(e.target.value) || 0 } }))} /> : fmt(selected.earnings?.reimbursements)}</td>
                        </tr>
                        <tr className="total-row"><td>Total Earnings</td><td>{fmt(selected.total_earnings)}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Deductions */}
                  <div>
                    <table className="payslip-table">
                      <thead><tr><th colSpan={2}>Deductions</th></tr></thead>
                      <tbody>
                        {[
                          ['Cash Advance', 'cash_advance'],
                          ['Credit Card Payment', 'credit_card_payment'],
                          ['Credit Payment', 'credit_payment'],
                          ['Purchased Goods', 'purchased_goods'],
                          ['Other Deductions', 'other_deductions'],
                          ['Over Payment', 'over_payment']
                        ].map(([label, field]) => (
                          <tr key={field}>
                            <td>{label}</td>
                            <td>
                              {canEdit && field !== 'cash_advance' ? (
                                <input type="number" defaultValue={selected.deductions?.[field] || 0}
                                  onChange={e => setManualEdits(p => ({ ...p, deductions: { ...p.deductions, [field]: parseFloat(e.target.value) || 0 } }))} />
                              ) : fmt(selected.deductions?.[field])}
                            </td>
                          </tr>
                        ))}
                        <tr className="total-row"><td>Total Deductions</td><td>{fmt(selected.total_deductions)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="net-pay">
                  <div className="label">Net Pay</div>
                  <div style={{ color: (selected.net_pay || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(selected.net_pay)}</div>
                </div>
              </div>

              {/* Workflow Actions */}
              <div className="workflow-actions">
                {canEdit && Object.keys(manualEdits).length > 0 && (
                  <button className="btn btn-primary" onClick={handleSaveManual} disabled={loading}>Save Manual Entries</button>
                )}
                {isAdmin && selected.status === 'GENERATED' && (
                  <button className="btn btn-success" onClick={() => handleWorkflow('review')} disabled={loading}>Mark Reviewed</button>
                )}
                {isAdmin && selected.status === 'REVIEWED' && (
                  <>
                    <button className="btn btn-warning" onClick={() => setShowReturn(true)} disabled={loading}>Return to BDM</button>
                  </>
                )}
                {selected.status === 'REVIEWED' && (selected.bdm_id?._id === user?._id || isAdmin) && (
                  <button className="btn btn-success" onClick={() => handleWorkflow('confirm')} disabled={loading}>BDM Confirm</button>
                )}
                {isAdmin && selected.status === 'BDM_CONFIRMED' && (
                  <button className="btn btn-primary" onClick={() => handleWorkflow('credit')} disabled={loading}>Mark Credited (Paid)</button>
                )}
              </div>
            </>
          )}

          {/* Return Modal */}
          {showReturn && (
            <div className="return-modal" onClick={() => setShowReturn(false)}>
              <div className="return-modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px' }}>Return to BDM</h3>
                <p style={{ fontSize: 13, color: 'var(--erp-muted)' }}>Provide a reason for returning this income report.</p>
                <textarea value={returnReason} onChange={e => setReturnReason(e.target.value)} placeholder="Reason for return..." />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setShowReturn(false)}>Cancel</button>
                  <button className="btn btn-warning" onClick={() => handleWorkflow('return')} disabled={!returnReason.trim()}>Return</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
