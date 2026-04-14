/**
 * Income Page — BDM Payslip View
 *
 * PRD §10: GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
 * Earnings: SMER + CORE Commission + Bonus + Profit Sharing + Reimbursements
 * Deductions: Cash Advance + Credit Card + Credit Payment + Purchased Goods + Other + Over Payment
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useIncome from '../hooks/useIncome';
import useDeductionSchedule from '../hooks/useDeductionSchedule';

import { showError } from '../utils/errorToast';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { useLookupOptions } from '../hooks/useLookups';

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
  .list-table-wrap { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow-x: auto; }
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
  .return-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .return-modal-content { background: var(--erp-panel); border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
  .return-modal textarea { width: 100%; padding: 8px; border: 1px solid var(--erp-border); border-radius: 8px; min-height: 80px; font-size: 13px; margin: 12px 0; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-verified { background: #d1fae5; color: #065f46; }
  .badge-corrected { background: #dbeafe; color: #1d4ed8; }
  .badge-rejected { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
  .line-actions { display: flex; gap: 4px; }
  .line-actions button { padding: 2px 8px; font-size: 11px; border: 1px solid var(--erp-border); border-radius: 4px; cursor: pointer; background: var(--erp-panel); }
  .line-actions button:hover { background: var(--erp-accent-soft); }
  .correction-note { font-size: 11px; color: #b45309; font-style: italic; display: block; margin-top: 2px; }
  .original-amount { font-size: 11px; color: var(--erp-muted); text-decoration: line-through; margin-right: 6px; }
  .deduction-desc { font-size: 11px; color: var(--erp-muted); display: block; margin-top: 2px; }
  .finance-add-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--erp-border); }
  .finance-add-form .field { display: flex; flex-direction: column; gap: 4px; }
  .finance-add-form label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--erp-muted); }
  .finance-add-form input, .finance-add-form select { padding: 4px 8px; border: 1px solid var(--erp-border); border-radius: 4px; font-size: 12px; }
  .correct-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .correct-modal-content { background: var(--erp-panel); border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; }
  .correct-modal input, .correct-modal textarea { width: 100%; padding: 8px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; margin: 8px 0; }
  .tab-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid var(--erp-border); }
  .tab-btn { padding: 10px 20px; border: none; background: none; font-size: 14px; font-weight: 600; color: var(--erp-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; }
  .sched-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .sched-card h4 { margin: 0 0 8px; font-size: 14px; }
  .badge-active { background: #d1fae5; color: #065f46; } .badge-completed { background: #a7f3d0; color: #047857; }
  .badge-cancelled { background: #fee2e2; color: #991b1b; } .badge-pending_approval { background: #fef3c7; color: #92400e; }
  .sched-actions { display: flex; gap: 8px; margin-top: 10px; }
  .inst-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
  .inst-table th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft); font-weight: 600; }
  .inst-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .badge-injected { background: #e0e7ff; color: #3730a3; } .badge-posted { background: #a7f3d0; color: #047857; }
  @media(max-width: 768px) { .income-main { padding: 12px; } .payslip-grid { grid-template-columns: 1fr; } .list-table-wrap { display: none; } .list-mobile-list { display: grid; } .finance-add-form { flex-direction: column; } }
  @media(max-width: 480px) { .list-mobile-grid { grid-template-columns: 1fr; } .workflow-actions { flex-direction: column; } }
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
  const schedApi = useDeductionSchedule();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const { options: deductionTypes } = useLookupOptions('INCOME_DEDUCTION_TYPE');
  const { options: cycleOptions } = useLookupOptions('CYCLE');
  const cycleLabel = (code) => cycleOptions.find(c => c.code === code)?.label || code;

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
  // Finance deduction line states
  const [showCorrect, setShowCorrect] = useState(null); // { lineId, amount, note }
  const [correctAmount, setCorrectAmount] = useState('');
  const [correctNote, setCorrectNote] = useState('');
  const [finAddType, setFinAddType] = useState('');
  const [finAddAmount, setFinAddAmount] = useState('');
  const [finAddDesc, setFinAddDesc] = useState('');
  // Finance schedule management
  const [incomeTab, setIncomeTab] = useState('payslips'); // payslips | schedules
  const [allSchedules, setAllSchedules] = useState([]);
  const [selectedSched, setSelectedSched] = useState(null);

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

  useEffect(() => { if (incomeTab === 'payslips') loadReports(); }, [loadReports, incomeTab]);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await schedApi.getScheduleList();
      setAllSchedules(res?.data || []);
    } catch (err) { showError(err, 'Could not load schedules'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (incomeTab === 'schedules') loadSchedules(); }, [incomeTab, loadSchedules]);

  const handleApproveSchedule = async (id) => {
    setLoading(true);
    try { await schedApi.approveSchedule(id); loadSchedules(); }
    catch (err) { showError(err, 'Could not approve'); }
    setLoading(false);
  };

  const handleRejectSchedule = async (id) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    setLoading(true);
    try { await schedApi.rejectSchedule(id, reason); loadSchedules(); }
    catch (err) { showError(err, 'Could not reject'); }
    setLoading(false);
  };

  const handleCancelSchedule = async (id) => {
    if (!confirm('Cancel this schedule? Remaining installments will be cancelled.')) return;
    setLoading(true);
    try { await schedApi.cancelSchedule(id, 'Cancelled by Finance'); loadSchedules(); }
    catch (err) { showError(err, 'Could not cancel'); }
    setLoading(false);
  };

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

  // Finance deduction line handlers
  const handleVerifyLine = async (lineId) => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await inc.verifyDeductionLine(selected._id, lineId, { action: 'verify' });
      if (res?.data) setSelected(res.data);
    } catch (err) { showError(err, 'Could not verify deduction'); }
    setLoading(false);
  };

  const handleRejectLine = async (lineId) => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await inc.verifyDeductionLine(selected._id, lineId, { action: 'reject', finance_note: 'Rejected by Finance' });
      if (res?.data) setSelected(res.data);
    } catch (err) { showError(err, 'Could not reject deduction'); }
    setLoading(false);
  };

  const handleCorrectLine = async () => {
    if (!selected || !showCorrect) return;
    setLoading(true);
    try {
      const res = await inc.verifyDeductionLine(selected._id, showCorrect.lineId, {
        action: 'correct', amount: parseFloat(correctAmount), finance_note: correctNote
      });
      if (res?.data) setSelected(res.data);
      setShowCorrect(null);
      setCorrectAmount('');
      setCorrectNote('');
    } catch (err) { showError(err, 'Could not correct deduction'); }
    setLoading(false);
  };

  const handleFinanceAddLine = async () => {
    if (!selected || !finAddType || !finAddAmount) return;
    const dedOption = deductionTypes.find(d => d.code === finAddType);
    if (!dedOption) return;
    setLoading(true);
    try {
      const res = await inc.financeAddDeductionLine(selected._id, {
        deduction_type: finAddType,
        deduction_label: dedOption.label,
        amount: parseFloat(finAddAmount),
        description: finAddDesc,
        finance_note: 'Added by Finance'
      });
      if (res?.data) setSelected(res.data);
      setFinAddType('');
      setFinAddAmount('');
      setFinAddDesc('');
    } catch (err) { showError(err, 'Could not add deduction'); }
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
                {cycleOptions.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
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
              <Link to="/erp/reports" className="erp-back-btn">
                Back to Reports
              </Link>
            </div>
          </div>

          {/* ═══ TAB BAR (Finance) ═══ */}
          {isAdmin && (
            <div className="tab-bar">
              <button className={`tab-btn ${incomeTab === 'payslips' ? 'active' : ''}`}
                onClick={() => { setIncomeTab('payslips'); setView('list'); setSelected(null); }}>Payslips</button>
              <button className={`tab-btn ${incomeTab === 'schedules' ? 'active' : ''}`}
                onClick={() => { setIncomeTab('schedules'); setSelectedSched(null); }}>Deduction Schedules</button>
            </div>
          )}

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {/* ═══ SCHEDULES TAB (Finance) ═══ */}
          {incomeTab === 'schedules' && isAdmin && !loading && (
            <>
              {!selectedSched && allSchedules.map(s => {
                const bdmName = s.bdm_id ? `${s.bdm_id.name || s.bdm_id.email || 'BDM'}` : 'N/A';
                return (
                  <div className="sched-card" key={s._id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4>{s.deduction_label} — {bdmName}</h4>
                        <div style={{ fontSize: 12, color: 'var(--erp-muted)' }}>
                          {s.schedule_code} · {s.term_months === 1 ? 'One-time' : `${s.term_months} months`} · {fmt(s.total_amount)} · Start: {s.start_period} · {cycleLabel(s.target_cycle || 'C2')}
                        </div>
                      </div>
                      <span className={`badge ${s.status === 'PENDING_APPROVAL' ? 'badge-pending_approval' : s.status === 'ACTIVE' ? 'badge-active' : s.status === 'COMPLETED' ? 'badge-completed' : s.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-rejected'}`}>{s.status.replace('_', ' ')}</span>
                    </div>
                    <div className="sched-actions">
                      {s.status === 'PENDING_APPROVAL' && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={() => handleApproveSchedule(s._id)}>Approve</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleRejectSchedule(s._id)}>Reject</button>
                        </>
                      )}
                      {s.status === 'ACTIVE' && (
                        <button className="btn btn-outline btn-sm" onClick={() => handleCancelSchedule(s._id)}>Cancel</button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        try {
                          const res = await schedApi.getScheduleById(s._id);
                          if (res?.data) setSelectedSched(res.data);
                        } catch (err) { showError(err, 'Could not load'); }
                      }}>View Detail</button>
                    </div>
                  </div>
                );
              })}
              {!selectedSched && allSchedules.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 40 }}>No deduction schedules found.</div>
              )}
              {selectedSched && (
                <div className="sched-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h4>{selectedSched.deduction_label} — {selectedSched.schedule_code}</h4>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedSched(null)}>← Back</button>
                  </div>
                  {selectedSched.status === 'ACTIVE' && (
                    <div className="sched-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => handleCancelSchedule(selectedSched._id)}>Cancel Schedule</button>
                      <button className="btn btn-primary btn-sm" onClick={async () => {
                        const payoffPeriod = prompt('Early payoff period (YYYY-MM):');
                        if (!payoffPeriod || !/^\d{4}-\d{2}$/.test(payoffPeriod)) return;
                        setLoading(true);
                        try {
                          const res = await schedApi.earlyPayoff(selectedSched._id, { payoff_period: payoffPeriod });
                          if (res?.data) setSelectedSched(res.data);
                          loadSchedules();
                        } catch (err) { showError(err, 'Early payoff failed'); }
                        setLoading(false);
                      }}>Early Payoff</button>
                    </div>
                  )}
                  <table className="inst-table">
                    <thead><tr><th>#</th><th>Period</th><th>Amount</th><th>Status</th><th>Note</th></tr></thead>
                    <tbody>
                      {(selectedSched.installments || []).map(inst => (
                        <tr key={inst._id} style={inst.status === 'CANCELLED' ? { opacity: 0.5 } : {}}>
                          <td>{inst.installment_no}</td>
                          <td>{inst.period}</td>
                          <td>{fmt(inst.amount)}</td>
                          <td><span className={`badge ${inst.status === 'POSTED' ? 'badge-posted' : inst.status === 'VERIFIED' ? 'badge-verified' : inst.status === 'INJECTED' ? 'badge-injected' : inst.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-pending'}`}>{inst.status}</span></td>
                          <td style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{inst.note || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ═══ LIST VIEW ═══ */}
          {incomeTab === 'payslips' && view === 'list' && !loading && (
            <>
              <div className="list-table-wrap">
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
                        <td>{cycleLabel(r.cycle)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.total_earnings)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.total_deductions)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.net_pay)}</td>
                        <td><span className={`badge ${STATUS_BADGES[r.status] || ''}`}>{r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="list-mobile-list">
                {reports.length === 0 && (
                  <div className="list-mobile-card" style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No income reports found</div>
                )}
                {reports.map(r => (
                  <div className="list-mobile-card" key={`mobile-${r._id}`} onClick={() => handleSelect(r)} role="button" tabIndex={0}>
                    <div className="list-mobile-top">
                      <div>
                        <div className="list-mobile-title">{bdmName(r)}</div>
                        <div className="list-mobile-sub">{r.period} · {cycleLabel(r.cycle)}</div>
                      </div>
                      <span className={`badge ${STATUS_BADGES[r.status] || ''}`}>{r.status}</span>
                    </div>
                    <div className="list-mobile-grid">
                      <div className="list-mobile-item"><div className="list-mobile-label">Earnings</div><div className="list-mobile-value">{fmt(r.total_earnings)}</div></div>
                      <div className="list-mobile-item"><div className="list-mobile-label">Deductions</div><div className="list-mobile-value">{fmt(r.total_deductions)}</div></div>
                      <div className="list-mobile-item"><div className="list-mobile-label">Net Pay</div><div className="list-mobile-value">{fmt(r.net_pay)}</div></div>
                      <div className="list-mobile-item"><div className="list-mobile-label">Status</div><div className="list-mobile-value">{r.status}</div></div>
                    </div>
                    <div className="list-mobile-actions">
                      <button className="btn btn-outline" type="button">Open Payslip</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ═══ DETAIL VIEW ═══ */}
          {incomeTab === 'payslips' && view === 'detail' && selected && !loading && (
            <>
              <div className="payslip-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3>Payslip — {bdmName(selected)} | {selected.period} {cycleLabel(selected.cycle)}</h3>
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

                  {/* Deductions (line-item based) */}
                  <div>
                    <table className="payslip-table">
                      <thead><tr><th>Deductions</th><th>Amount</th>{canEdit && <th>Actions</th>}</tr></thead>
                      <tbody>
                        {(selected.deduction_lines || []).length === 0 && !selected.deductions?.cash_advance && (
                          <tr><td colSpan={canEdit ? 3 : 2} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No deductions</td></tr>
                        )}
                        {(selected.deduction_lines || []).map(line => (
                          <tr key={line._id} style={line.status === 'REJECTED' ? { opacity: 0.5 } : {}}>
                            <td>
                              {line.deduction_label}
                              <span className={`badge ${line.status === 'PENDING' ? 'badge-pending' : line.status === 'VERIFIED' ? 'badge-verified' : line.status === 'CORRECTED' ? 'badge-corrected' : 'badge-rejected'}`} style={{ marginLeft: 6 }}>{line.status}</span>
                              {line.auto_source && <span style={{ fontSize: 10, color: 'var(--erp-muted)', marginLeft: 4 }}>(auto)</span>}
                              {line.description && <span className="deduction-desc">{line.description}</span>}
                              {line.entered_by && <span className="deduction-desc">By: {line.entered_by.name || 'Unknown'}</span>}
                              {line.finance_note && <span className="correction-note">Finance: {line.finance_note}</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {line.original_amount != null && <span className="original-amount">{fmt(line.original_amount)}</span>}
                              {fmt(line.amount)}
                            </td>
                            {canEdit && (
                              <td>
                                {line.status === 'PENDING' && (
                                  <div className="line-actions">
                                    <button onClick={() => handleVerifyLine(line._id)} title="Accept">✓</button>
                                    <button onClick={() => { setShowCorrect({ lineId: line._id }); setCorrectAmount(String(line.amount)); setCorrectNote(''); }} title="Correct">✎</button>
                                    <button onClick={() => handleRejectLine(line._id)} title="Reject">✕</button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        {/* Legacy flat deductions fallback (only if no deduction_lines) */}
                        {(selected.deduction_lines || []).length === 0 && [
                          ['Cash Advance', 'cash_advance'],
                          ['Credit Card Payment', 'credit_card_payment'],
                          ['Credit Payment', 'credit_payment'],
                          ['Purchased Goods', 'purchased_goods'],
                          ['Other Deductions', 'other_deductions'],
                          ['Over Payment', 'over_payment']
                        ].filter(([, f]) => (selected.deductions?.[f] || 0) > 0).map(([label, field]) => (
                          <tr key={field}>
                            <td>{label} <span style={{ fontSize: 10, color: 'var(--erp-muted)' }}>(legacy)</span></td>
                            <td style={{ textAlign: 'right' }}>{fmt(selected.deductions?.[field])}</td>
                            {canEdit && <td />}
                          </tr>
                        ))}
                        <tr className="total-row"><td>Total Deductions</td><td style={{ textAlign: 'right' }}>{fmt(selected.total_deductions)}</td>{canEdit && <td />}</tr>
                      </tbody>
                    </table>

                    {/* Finance: Add missing deduction */}
                    {canEdit && (
                      <div className="finance-add-form">
                        <div className="field">
                          <label>Add Deduction</label>
                          <select value={finAddType} onChange={e => setFinAddType(e.target.value)} style={{ minWidth: 150 }}>
                            <option value="">Type...</option>
                            {deductionTypes.map(d => (
                              <option key={d.code} value={d.code}>{d.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Amount</label>
                          <input type="number" min="0" step="0.01" value={finAddAmount} onChange={e => setFinAddAmount(e.target.value)} style={{ width: 100 }} />
                        </div>
                        <div className="field" style={{ flex: 1 }}>
                          <label>Note</label>
                          <input type="text" value={finAddDesc} onChange={e => setFinAddDesc(e.target.value)} placeholder="Reason..." />
                        </div>
                        <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={handleFinanceAddLine}
                          disabled={!finAddType || !finAddAmount || parseFloat(finAddAmount) <= 0}>+ Add</button>
                      </div>
                    )}
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

          {/* Correction Modal */}
          {showCorrect && (
            <div className="correct-modal" onClick={() => setShowCorrect(null)}>
              <div className="correct-modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px' }}>Correct Deduction Amount</h3>
                <p style={{ fontSize: 13, color: 'var(--erp-muted)' }}>Enter the corrected amount and reason.</p>
                <input type="number" min="0" step="0.01" value={correctAmount} onChange={e => setCorrectAmount(e.target.value)} placeholder="Corrected amount" />
                <textarea value={correctNote} onChange={e => setCorrectNote(e.target.value)} placeholder="Reason for correction..." style={{ minHeight: 60 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setShowCorrect(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCorrectLine} disabled={!correctAmount || parseFloat(correctAmount) < 0}>Save Correction</button>
                </div>
              </div>
            </div>
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
