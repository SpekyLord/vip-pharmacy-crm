/**
 * My Income Page — Contractor (BDM) Self-Service Payslip + Deduction Schedules
 *
 * Two tabs:
 *   1. Payslips — view own payslips, add one-off deduction lines, confirm
 *   2. My Deduction Schedules — create one-time or installment deductions, view timeline
 *
 * Contractor-only (not employees — they use Payroll module).
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useIncome from '../hooks/useIncome';
import useDeductionSchedule from '../hooks/useDeductionSchedule';
import { useLookupOptions } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .my-income-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .my-income-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 960px; margin: 0 auto; }
  .my-income-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .my-income-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .controls select, .controls input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .tab-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid var(--erp-border); }
  .tab-btn { padding: 10px 20px; border: none; background: none; font-size: 14px; font-weight: 600; color: var(--erp-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .tab-btn.active { color: #2563eb; border-bottom-color: #2563eb; }
  .payslip-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
  .payslip-card h3 { margin: 0 0 12px; font-size: 15px; color: var(--erp-text); }
  .payslip-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .payslip-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .payslip-table th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft, #e8efff); font-weight: 600; }
  .payslip-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .payslip-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row { font-weight: 700; background: var(--erp-accent-soft); }
  .net-pay { font-size: 24px; font-weight: 700; text-align: center; padding: 16px; background: var(--erp-accent-soft); border-radius: 12px; margin-top: 16px; }
  .net-pay .label { font-size: 12px; color: var(--erp-muted); text-transform: uppercase; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-generated { background: #dbeafe; color: #1d4ed8; } .badge-reviewed { background: #fef3c7; color: #92400e; }
  .badge-returned { background: #fee2e2; color: #991b1b; } .badge-confirmed { background: #d1fae5; color: #065f46; }
  .badge-credited { background: #a7f3d0; color: #047857; } .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-verified { background: #d1fae5; color: #065f46; } .badge-corrected { background: #dbeafe; color: #1d4ed8; }
  .badge-rejected { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
  .badge-active { background: #d1fae5; color: #065f46; } .badge-completed { background: #a7f3d0; color: #047857; }
  .badge-cancelled { background: #fee2e2; color: #991b1b; } .badge-pending_approval { background: #fef3c7; color: #92400e; }
  .badge-injected { background: #e0e7ff; color: #3730a3; } .badge-posted { background: #a7f3d0; color: #047857; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; } .btn-primary:hover { background: #1d4ed8; }
  .btn-success { background: #16a34a; color: white; } .btn-danger { background: #dc2626; color: white; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .workflow-actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
  .add-deduction { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; margin-top: 12px; }
  .add-deduction h4 { margin: 0 0 12px; font-size: 14px; color: var(--erp-text); }
  .add-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
  .add-form .field { display: flex; flex-direction: column; gap: 4px; }
  .add-form label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--erp-muted); }
  .add-form input, .add-form select, .add-form textarea { padding: 6px 10px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .correction-note { font-size: 11px; color: #b45309; font-style: italic; display: block; margin-top: 2px; }
  .original-amount { font-size: 11px; color: var(--erp-muted); text-decoration: line-through; margin-right: 6px; }
  .deduction-desc { font-size: 11px; color: var(--erp-muted); display: block; margin-top: 2px; }
  .list-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 14px; margin-bottom: 10px; cursor: pointer; box-shadow: 0 4px 12px rgba(15,23,42,0.04); }
  .list-card:hover { border-color: #2563eb; }
  .list-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .list-title { font-size: 14px; font-weight: 700; color: var(--erp-text); }
  .list-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .list-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .list-item { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 10px; padding: 8px 10px; }
  .list-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .list-value { font-size: 13px; font-weight: 700; color: var(--erp-text); margin-top: 2px; }
  .return-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 12px; font-size: 13px; }
  .sched-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .sched-card h4 { margin: 0 0 8px; font-size: 14px; }
  .progress-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; margin-top: 8px; }
  .progress-fill { height: 100%; background: #16a34a; border-radius: 3px; transition: width 0.3s; }
  .inst-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
  .inst-table th { text-align: left; padding: 6px 8px; background: var(--erp-accent-soft); font-weight: 600; }
  .inst-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .create-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .create-modal-content { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 480px; max-width: 95vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .create-modal h3 { margin: 0 0 16px; font-size: 16px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-field { display: flex; flex-direction: column; gap: 4px; }
  .form-field.full { grid-column: 1 / -1; }
  .form-field label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--erp-muted); }
  .form-field input, .form-field select, .form-field textarea { padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; }
  .form-field textarea { min-height: 50px; resize: vertical; }
  .preview-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; margin-top: 12px; font-size: 13px; }
  @media(max-width: 768px) { .my-income-main { padding: 12px; } .payslip-grid { grid-template-columns: 1fr; } .list-grid { grid-template-columns: 1fr 1fr; } .add-form { flex-direction: column; } .form-grid { grid-template-columns: 1fr; } }
  @media(max-width: 480px) { .list-grid { grid-template-columns: 1fr; } }
`;

const STATUS_BADGES = {
  GENERATED: 'badge-generated', REVIEWED: 'badge-reviewed', RETURNED: 'badge-returned',
  BDM_CONFIRMED: 'badge-confirmed', CREDITED: 'badge-credited'
};
const LINE_BADGES = {
  PENDING: 'badge-pending', VERIFIED: 'badge-verified', CORRECTED: 'badge-corrected', REJECTED: 'badge-rejected'
};
const SCHED_BADGES = {
  PENDING_APPROVAL: 'badge-pending_approval', ACTIVE: 'badge-active', COMPLETED: 'badge-completed',
  CANCELLED: 'badge-cancelled', REJECTED: 'badge-rejected'
};
const INST_BADGES = {
  PENDING: 'badge-pending', INJECTED: 'badge-injected', VERIFIED: 'badge-verified',
  POSTED: 'badge-posted', CANCELLED: 'badge-cancelled'
};

function fmt(n) { return '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function incrementPeriod(period, n) {
  const [year, month] = period.split('-').map(Number);
  const total = year * 12 + (month - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export default function MyIncome() {
  const inc = useIncome();
  const sched = useDeductionSchedule();
  const { options: deductionTypes } = useLookupOptions('INCOME_DEDUCTION_TYPE');
  const { options: cycleOptions } = useLookupOptions('CYCLE');

  const [activeTab, setActiveTab] = useState('payslips');
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [cycle, setCycle] = useState('ALL');
  const [loading, setLoading] = useState(false);

  // ── Payslip state ──
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [payslipView, setPayslipView] = useState('list');
  const [newDedType, setNewDedType] = useState('');
  const [newDedAmount, setNewDedAmount] = useState('');
  const [newDedDesc, setNewDedDesc] = useState('');

  // ── Projection state ──
  const [projection, setProjection] = useState(null);
  const [projLoading, setProjLoading] = useState(false);

  // ── Schedule state ──
  const [schedules, setSchedules] = useState([]);
  const [selectedSched, setSelectedSched] = useState(null);
  const [showCreate, setShowCreate] = useState(null); // 'one-time' | 'installment' | null
  const [schedForm, setSchedForm] = useState({ type: '', amount: '', term: '1', start: getCurrentPeriod(), target_cycle: 'C2', desc: '' });

  // ── Load payslips ──
  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period };
      if (cycle !== 'ALL') params.cycle = cycle;
      const res = await inc.getIncomeList(params);
      setReports(res?.data || []);
    } catch (err) { showError(err, 'Could not load payslips'); }
    setLoading(false);
  }, [period, cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load schedules ──
  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sched.getMySchedules();
      setSchedules(res?.data || []);
    } catch (err) { showError(err, 'Could not load schedules'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load projection ──
  const loadProjection = useCallback(async () => {
    if (cycle === 'ALL') { setProjection(null); return; }
    setProjLoading(true);
    try {
      const res = await inc.getIncomeProjection({ period, cycle });
      setProjection(res?.data || null);
    } catch { setProjection(null); }
    setProjLoading(false);
  }, [period, cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'payslips') { loadReports(); loadProjection(); }
    else loadSchedules();
  }, [activeTab, loadReports, loadSchedules, loadProjection]);

  // ── Projection handlers ──
  const handleRequestGeneration = async () => {
    if (cycle === 'ALL') { showError(null, 'Select a specific cycle (C1, C2, or Monthly)'); return; }
    setLoading(true);
    try {
      await inc.requestIncomeGeneration({ period, cycle });
      await loadReports();
      await loadProjection();
    } catch (err) { showError(err, 'Could not generate payslip'); }
    setLoading(false);
  };

  // ── Payslip handlers ──
  const handleSelectPayslip = async (report) => {
    setLoading(true);
    try {
      const res = await inc.getIncomeById(report._id);
      if (res?.data) { setSelected(res.data); setPayslipView('detail'); }
    } catch (err) { showError(err, 'Could not load payslip'); }
    setLoading(false);
  };

  const handleAddDeduction = async () => {
    if (!selected || !newDedType || !newDedAmount) return;
    const dedOption = deductionTypes.find(d => d.code === newDedType);
    if (!dedOption) return;
    setLoading(true);
    try {
      const res = await inc.addDeductionLine(selected._id, {
        deduction_type: newDedType, deduction_label: dedOption.label,
        amount: parseFloat(newDedAmount), description: newDedDesc
      });
      if (res?.data) setSelected(res.data);
      setNewDedType(''); setNewDedAmount(''); setNewDedDesc('');
    } catch (err) { showError(err, 'Could not add deduction'); }
    setLoading(false);
  };

  const handleRemoveDeduction = async (lineId) => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await inc.removeDeductionLine(selected._id, lineId);
      if (res?.data) setSelected(res.data);
    } catch (err) { showError(err, 'Could not remove deduction'); }
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await inc.confirmIncome(selected._id);
      if (res?.data) setSelected(res.data);
      loadReports();
    } catch (err) { showError(err, 'Could not confirm payslip'); }
    setLoading(false);
  };

  // ── Schedule handlers ──
  const handleCreateSchedule = async () => {
    const dedOption = deductionTypes.find(d => d.code === schedForm.type);
    if (!dedOption || !schedForm.amount || !schedForm.start) return;
    setLoading(true);
    try {
      await sched.createSchedule({
        deduction_type: schedForm.type,
        deduction_label: dedOption.label,
        total_amount: parseFloat(schedForm.amount),
        term_months: parseInt(schedForm.term) || 1,
        start_period: schedForm.start,
        target_cycle: schedForm.target_cycle,
        description: schedForm.desc
      });
      setShowCreate(null);
      setSchedForm({ type: '', amount: '', term: '1', start: getCurrentPeriod(), target_cycle: 'C2', desc: '' });
      loadSchedules();
    } catch (err) { showError(err, 'Could not create schedule'); }
    setLoading(false);
  };

  const handleSelectSchedule = async (s) => {
    setLoading(true);
    try {
      const res = await sched.getScheduleById(s._id);
      if (res?.data) setSelectedSched(res.data);
    } catch (err) { showError(err, 'Could not load schedule'); }
    setLoading(false);
  };

  const canAddDeductions = selected?.status === 'GENERATED';
  const canConfirm = selected?.status === 'REVIEWED';
  const lines = selected?.deduction_lines || [];

  // Resolve cycle code → label
  const cycleLabel = (code) => cycleOptions.find(c => c.code === code)?.label || code;

  // Schedule form computed preview
  const previewInstAmount = schedForm.amount && schedForm.term
    ? Math.floor(parseFloat(schedForm.amount) / parseInt(schedForm.term) * 100) / 100
    : 0;
  const previewEndPeriod = schedForm.start && schedForm.term
    ? incrementPeriod(schedForm.start, parseInt(schedForm.term) - 1)
    : '';

  return (
    <div className="my-income-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="my-income-main">
          <WorkflowGuide pageKey="myIncome" />

          <div className="my-income-header">
            <h1>My Income</h1>
            <div className="controls">
              {activeTab === 'payslips' && (
                <>
                  <input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
                  <SelectField value={cycle} onChange={e => setCycle(e.target.value)}>
                    <option value="ALL">All Cycles</option>
                    {cycleOptions.map(c => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </SelectField>
                </>
              )}
              {payslipView === 'detail' && activeTab === 'payslips' && (
                <button className="btn btn-outline" onClick={() => { setPayslipView('list'); setSelected(null); }}>← Back</button>
              )}
              {selectedSched && activeTab === 'schedules' && (
                <button className="btn btn-outline" onClick={() => setSelectedSched(null)}>← Back</button>
              )}
            </div>
          </div>

          {/* ═══ TAB BAR ═══ */}
          <div className="tab-bar">
            <button className={`tab-btn ${activeTab === 'payslips' ? 'active' : ''}`}
              onClick={() => { setActiveTab('payslips'); setPayslipView('list'); setSelected(null); }}>
              Payslips
            </button>
            <button className={`tab-btn ${activeTab === 'schedules' ? 'active' : ''}`}
              onClick={() => { setActiveTab('schedules'); setSelectedSched(null); }}>
              My Deduction Schedules
            </button>
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {/* ═══════════════════ PAYSLIPS TAB ═══════════════════ */}
          {activeTab === 'payslips' && !loading && (
            <>
              {/* ── Income Projection Card ── */}
              {projection && cycle !== 'ALL' && (() => {
                const p = projection.projection || {};
                const d = projection.deductions || {};
                const t = projection.totals || {};
                const rf = projection.revolving_fund || {};
                const cs = projection.calf_summary || {};
                const smer = p.smer || {};
                const comm = p.core_commission || {};
                const calfR = p.calf_reimbursement || {};
                const ps = p.profit_sharing || {};
                const bon = p.bonus || {};
                const dCalf = d.calf_excess || {};
                const dGas = d.personal_gas || {};
                const dSched = d.schedule_installments || {};
                const dMan = d.manual_lines || {};
                return (
                <div className="payslip-card" style={{ borderColor: '#93c5fd', background: 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)' }}>
                  <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Income Projection ({period}, {cycleLabel(cycle)})</span>
                    {projection.has_official_report && <span className={`badge ${STATUS_BADGES[projection.official_status] || ''}`}>{projection.official_status}</span>}
                  </h3>

                  <div className="payslip-grid">
                    {/* Earnings */}
                    <div>
                      <table className="payslip-table">
                        <thead><tr><th colSpan={2}>Earnings</th></tr></thead>
                        <tbody>
                          <tr><td>SMER Reimbursable</td><td>{fmt(smer.amount)}{(smer.ore_included || 0) > 0 && <span style={{ fontSize: 10, color: '#6b7280' }}> (incl. ORE {fmt(smer.ore_included)})</span>}</td></tr>
                          <tr><td>Commission (confirmed)</td><td>{fmt(comm.posted)} <span style={{ fontSize: 10, color: '#6b7280' }}>{comm.posted_count || 0} CRs</span></td></tr>
                          {(comm.pending || 0) > 0 && <tr><td>Commission (pending)</td><td style={{ color: '#b45309' }}>{fmt(comm.pending)} <span style={{ fontSize: 10 }}>{comm.pending_count || 0} CRs</span></td></tr>}
                          {(calfR.amount || 0) > 0 && <tr><td>CALF Reimbursement</td><td>{fmt(calfR.amount)}</td></tr>}
                          {(ps.amount || 0) > 0 && <tr><td>Profit Sharing</td><td>{fmt(ps.amount)}</td></tr>}
                          {(bon.amount || 0) > 0 && <tr><td>Bonus</td><td>{fmt(bon.amount)}</td></tr>}
                          <tr className="total-row"><td>Projected Earnings</td><td>{fmt(t.projected_earnings)}</td></tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Deductions + Revolving Fund */}
                    <div>
                      <table className="payslip-table">
                        <thead><tr><th colSpan={2}>Deductions</th></tr></thead>
                        <tbody>
                          {(dCalf.amount || 0) > 0 && <tr><td>CALF Excess Return</td><td>{fmt(dCalf.amount)}</td></tr>}
                          {(dGas.amount || 0) > 0 && <tr><td>Personal Gas</td><td>{fmt(dGas.amount)}</td></tr>}
                          {(dSched.amount || 0) > 0 && <tr><td>Schedule ({dSched.count || 0})</td><td>{fmt(dSched.amount)}</td></tr>}
                          {(dMan.count || 0) > 0 && <tr><td>Manual ({dMan.count})</td><td>{fmt(dMan.amount)}</td></tr>}
                          <tr className="total-row"><td>Total Deductions</td><td>{fmt(t.total_deductions)}</td></tr>
                        </tbody>
                      </table>

                      {(rf.travel_advance || 0) > 0 && (
                        <table className="payslip-table" style={{ marginTop: 8 }}>
                          <thead><tr><th colSpan={2}>Revolving Fund</th></tr></thead>
                          <tbody>
                            <tr><td>Travel Advance</td><td>{fmt(rf.travel_advance)}</td></tr>
                            <tr><td>Reimbursable</td><td>{fmt(rf.total_reimbursable)}</td></tr>
                            <tr style={{ fontWeight: 600 }}><td>Balance on Hand</td><td style={{ color: (rf.balance_on_hand || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(rf.balance_on_hand)}</td></tr>
                          </tbody>
                        </table>
                      )}

                      {(cs.total_advance || 0) > 0 && (
                        <table className="payslip-table" style={{ marginTop: 8 }}>
                          <thead><tr><th colSpan={2}>CALF Summary</th></tr></thead>
                          <tbody>
                            <tr><td>Advance</td><td>{fmt(cs.total_advance)}</td></tr>
                            <tr><td>Liquidated</td><td>{fmt(cs.total_liquidated)}</td></tr>
                            <tr style={{ fontWeight: 600 }}><td>Balance</td><td style={{ color: (cs.balance || 0) >= 0 ? '#b45309' : '#16a34a' }}>{fmt(cs.balance)} {(cs.balance || 0) > 0 ? '(deducted)' : (cs.balance || 0) < 0 ? '(reimbursed)' : ''}</td></tr>
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  <div className="net-pay" style={{ marginTop: 12 }}>
                    <div className="label">Projected Net Pay</div>
                    {fmt(t.projected_net)}
                  </div>

                  <div className="workflow-actions" style={{ marginTop: 12 }}>
                    {(!projection.has_official_report || ['GENERATED', 'RETURNED', 'REVIEWED'].includes(projection.official_status)) && (
                      <button className="btn btn-primary" onClick={handleRequestGeneration} disabled={loading}>
                        {projection.has_official_report ? 'Regenerate Payslip' : 'Request Payslip Generation'}
                      </button>
                    )}
                    {projection.has_official_report && ['BDM_CONFIRMED', 'CREDITED'].includes(projection.official_status) && (
                      <span style={{ fontSize: 12, color: 'var(--erp-muted)', alignSelf: 'center' }}>Payslip is locked ({projection.official_status})</span>
                    )}
                  </div>
                </div>
                );
              })()}
              {cycle === 'ALL' && !projLoading && (
                <div style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 12, fontSize: 13, background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
                  Select a specific cycle (C1, C2, or Monthly) to see your income projection.
                </div>
              )}

              {/* List */}
              {payslipView === 'list' && (
                <div>
                  {reports.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 40 }}>
                      No payslips found for this period. Payslips are generated by Finance.
                    </div>
                  )}
                  {reports.map(r => (
                    <div className="list-card" key={r._id} onClick={() => handleSelectPayslip(r)} role="button" tabIndex={0}>
                      <div className="list-top">
                        <div>
                          <div className="list-title">{r.period} — {cycleLabel(r.cycle)}</div>
                          <div className="list-sub">{r.deduction_lines?.length || 0} deduction line(s)</div>
                        </div>
                        <span className={`badge ${STATUS_BADGES[r.status] || ''}`}>{r.status}</span>
                      </div>
                      <div className="list-grid">
                        <div className="list-item"><div className="list-label">Earnings</div><div className="list-value">{fmt(r.total_earnings)}</div></div>
                        <div className="list-item"><div className="list-label">Deductions</div><div className="list-value">{fmt(r.total_deductions)}</div></div>
                        <div className="list-item"><div className="list-label">Net Pay</div><div className="list-value" style={{ color: (r.net_pay || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(r.net_pay)}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Detail */}
              {payslipView === 'detail' && selected && (
                <>
                  <div className="payslip-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3>Payslip — {selected.period} {cycleLabel(selected.cycle)}</h3>
                      <span className={`badge ${STATUS_BADGES[selected.status] || ''}`}>{selected.status}</span>
                    </div>
                    {selected.return_reason && selected.status === 'RETURNED' && (
                      <div className="return-banner"><strong>Returned by Finance:</strong> {selected.return_reason}</div>
                    )}
                    <div className="payslip-grid">
                      <div>
                        <table className="payslip-table">
                          <thead><tr><th colSpan={2}>Earnings</th></tr></thead>
                          <tbody>
                            <tr><td>SMER</td><td>{fmt(selected.earnings?.smer)}</td></tr>
                            <tr><td>CORE Commission</td><td>{fmt(selected.earnings?.core_commission)}</td></tr>
                            <tr><td>Bonus</td><td>{fmt(selected.earnings?.bonus)}</td></tr>
                            <tr><td>Profit Sharing</td><td>{fmt(selected.earnings?.profit_sharing)}</td></tr>
                            <tr><td>Reimbursements</td><td>{fmt(selected.earnings?.reimbursements)}</td></tr>
                            <tr className="total-row"><td>Total Earnings</td><td>{fmt(selected.total_earnings)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <table className="payslip-table">
                          <thead><tr><th colSpan={3}>Deductions</th></tr></thead>
                          <tbody>
                            {lines.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No deductions</td></tr>}
                            {lines.map(line => (
                              <tr key={line._id} style={line.status === 'REJECTED' ? { opacity: 0.5 } : {}}>
                                <td>
                                  {line.deduction_label}
                                  <span className={`badge ${LINE_BADGES[line.status] || ''}`} style={{ marginLeft: 6 }}>{line.status}</span>
                                  {line.auto_source === 'SCHEDULE' && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 4 }}>(scheduled)</span>}
                                  {line.auto_source === 'CALF' && <span style={{ fontSize: 10, color: 'var(--erp-muted)', marginLeft: 4 }}>(auto)</span>}
                                  {line.description && <span className="deduction-desc">{line.description}</span>}
                                  {line.finance_note && <span className="correction-note">Finance: {line.finance_note}</span>}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  {line.original_amount != null && <span className="original-amount">{fmt(line.original_amount)}</span>}
                                  {fmt(line.amount)}
                                </td>
                                <td style={{ width: 40, textAlign: 'center' }}>
                                  {canAddDeductions && line.status === 'PENDING' && !line.auto_source && (
                                    <button className="btn btn-danger btn-sm" onClick={() => handleRemoveDeduction(line._id)}>✕</button>
                                  )}
                                </td>
                              </tr>
                            ))}
                            <tr className="total-row"><td colSpan={2}>Total Deductions</td><td style={{ textAlign: 'right' }}>{fmt(selected.total_deductions)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="net-pay">
                      <div className="label">Net Pay</div>
                      <div style={{ color: (selected.net_pay || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(selected.net_pay)}</div>
                    </div>
                  </div>

                  {canAddDeductions && (
                    <div className="add-deduction">
                      <h4>Add One-Off Deduction</h4>
                      <div className="add-form">
                        <div className="field">
                          <label>Type</label>
                          <select value={newDedType} onChange={e => setNewDedType(e.target.value)} style={{ minWidth: 180 }}>
                            <option value="">Select type...</option>
                            {deductionTypes.filter(d => d.code !== 'CASH_ADVANCE').map(d => (
                              <option key={d.code} value={d.code}>{d.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field">
                          <label>Amount (₱)</label>
                          <input type="number" min="0" step="0.01" value={newDedAmount} onChange={e => setNewDedAmount(e.target.value)} style={{ width: 120 }} />
                        </div>
                        <div className="field" style={{ flex: 1 }}>
                          <label>Description</label>
                          <input type="text" value={newDedDesc} onChange={e => setNewDedDesc(e.target.value)} placeholder="e.g. Personal grocery" />
                        </div>
                        <button className="btn btn-primary" onClick={handleAddDeduction}
                          disabled={loading || !newDedType || !newDedAmount || parseFloat(newDedAmount) <= 0}>Add</button>
                      </div>
                    </div>
                  )}

                  <div className="workflow-actions">
                    {canConfirm && <button className="btn btn-success" onClick={handleConfirm} disabled={loading}>Confirm Payslip</button>}
                    {selected.status === 'BDM_CONFIRMED' && <div style={{ fontSize: 13, color: '#065f46', fontWeight: 600 }}>✓ Confirmed. Waiting for Finance to credit.</div>}
                    {selected.status === 'CREDITED' && <div style={{ fontSize: 13, color: '#047857', fontWeight: 600 }}>✓ Payslip credited (paid).</div>}
                  </div>
                </>
              )}
            </>
          )}

          {/* ═══════════════════ SCHEDULES TAB ═══════════════════ */}
          {activeTab === 'schedules' && !loading && (
            <>
              {!selectedSched && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <button className="btn btn-primary" onClick={() => { setShowCreate('one-time'); setSchedForm(f => ({ ...f, term: '1' })); }}>
                      + One-Time Deduction
                    </button>
                    <button className="btn btn-outline" onClick={() => { setShowCreate('installment'); setSchedForm(f => ({ ...f, term: '' })); }}>
                      + Installment Plan
                    </button>
                  </div>

                  {schedules.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 40 }}>
                      No deduction schedules yet. Create one to start.
                    </div>
                  )}

                  {schedules.map(s => {
                    const completed = (s.installments || []).filter(i => i.status === 'POSTED').length;
                    const total = (s.installments || []).filter(i => i.status !== 'CANCELLED').length;
                    const pct = total > 0 ? Math.round(completed / total * 100) : 0;
                    return (
                      <div className="sched-card" key={s._id} onClick={() => handleSelectSchedule(s)} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <h4>{s.deduction_label}</h4>
                            <div style={{ fontSize: 12, color: 'var(--erp-muted)' }}>
                              {s.schedule_code} · {s.term_months === 1 ? 'One-time' : `${s.term_months} months`} · Start: {s.start_period} · {cycleLabel(s.target_cycle || 'C2')}
                            </div>
                            {s.description && <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginTop: 2 }}>{s.description}</div>}
                          </div>
                          <span className={`badge ${SCHED_BADGES[s.status] || ''}`}>{s.status.replace('_', ' ')}</span>
                        </div>
                        <div className="list-grid" style={{ marginTop: 10 }}>
                          <div className="list-item"><div className="list-label">Total</div><div className="list-value">{fmt(s.total_amount)}</div></div>
                          <div className="list-item"><div className="list-label">Per Month</div><div className="list-value">{fmt(s.installment_amount)}</div></div>
                          <div className="list-item"><div className="list-label">Remaining</div><div className="list-value">{fmt(s.remaining_balance)}</div></div>
                        </div>
                        {s.term_months > 1 && (
                          <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {/* Schedule Detail */}
              {selectedSched && (
                <div className="sched-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4>{selectedSched.deduction_label} — {selectedSched.schedule_code}</h4>
                    <span className={`badge ${SCHED_BADGES[selectedSched.status] || ''}`}>{selectedSched.status.replace('_', ' ')}</span>
                  </div>
                  {selectedSched.description && <p style={{ fontSize: 13, color: 'var(--erp-muted)', margin: '0 0 12px' }}>{selectedSched.description}</p>}
                  {selectedSched.reject_reason && (
                    <div className="return-banner"><strong>Rejected:</strong> {selectedSched.reject_reason}</div>
                  )}
                  <div className="list-grid" style={{ marginBottom: 12 }}>
                    <div className="list-item"><div className="list-label">Total</div><div className="list-value">{fmt(selectedSched.total_amount)}</div></div>
                    <div className="list-item"><div className="list-label">Per Installment</div><div className="list-value">{fmt(selectedSched.installment_amount)}</div></div>
                    <div className="list-item"><div className="list-label">Remaining</div><div className="list-value">{fmt(selectedSched.remaining_balance)}</div></div>
                  </div>

                  <table className="inst-table">
                    <thead>
                      <tr><th>#</th><th>Period</th><th>Amount</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {(selectedSched.installments || []).map(inst => (
                        <tr key={inst._id} style={inst.status === 'CANCELLED' ? { opacity: 0.5 } : {}}>
                          <td>{inst.installment_no}</td>
                          <td>{inst.period}</td>
                          <td>{fmt(inst.amount)}</td>
                          <td><span className={`badge ${INST_BADGES[inst.status] || ''}`}>{inst.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ═══ CREATE SCHEDULE MODAL ═══ */}
          {showCreate && (
            <div className="create-modal" onClick={() => setShowCreate(null)}>
              <div className="create-modal-content" onClick={e => e.stopPropagation()}>
                <h3>{showCreate === 'one-time' ? 'One-Time Deduction' : 'Installment Plan'}</h3>
                <div className="form-grid">
                  <div className="form-field full">
                    <label>Deduction Type</label>
                    <select value={schedForm.type} onChange={e => setSchedForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="">Select type...</option>
                      {deductionTypes.filter(d => d.code !== 'CASH_ADVANCE').map(d => (
                        <option key={d.code} value={d.code}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>{showCreate === 'one-time' ? 'Amount' : 'Total Amount'}</label>
                    <input type="number" min="0.01" step="0.01" value={schedForm.amount}
                      onChange={e => setSchedForm(f => ({ ...f, amount: e.target.value }))} placeholder="₱0.00" />
                  </div>
                  {showCreate === 'installment' && (
                    <div className="form-field">
                      <label>Term (months)</label>
                      <input type="number" min="2" step="1" value={schedForm.term}
                        onChange={e => setSchedForm(f => ({ ...f, term: e.target.value }))} placeholder="e.g. 10" />
                    </div>
                  )}
                  <div className="form-field">
                    <label>{showCreate === 'one-time' ? 'Deduct In Period' : 'Start Period'}</label>
                    <input type="month" value={schedForm.start}
                      onChange={e => setSchedForm(f => ({ ...f, start: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Deduct In Cycle</label>
                    <select value={schedForm.target_cycle} onChange={e => setSchedForm(f => ({ ...f, target_cycle: e.target.value }))}>
                      {cycleOptions.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field full">
                    <label>Description</label>
                    <textarea value={schedForm.desc} onChange={e => setSchedForm(f => ({ ...f, desc: e.target.value }))}
                      placeholder="e.g. SM grocery ₱9,000 CC installment via SBC Mastercard" />
                  </div>
                </div>

                {showCreate === 'installment' && schedForm.amount && schedForm.term && parseInt(schedForm.term) >= 2 && (
                  <div className="preview-box">
                    <strong>Preview:</strong> {fmt(previewInstAmount)}/month × {schedForm.term} months
                    ({schedForm.start} → {previewEndPeriod})
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowCreate(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleCreateSchedule}
                    disabled={loading || !schedForm.type || !schedForm.amount || parseFloat(schedForm.amount) <= 0 || !schedForm.start
                      || (showCreate === 'installment' && (!schedForm.term || parseInt(schedForm.term) < 2))}>
                    {showCreate === 'one-time' ? 'Create Deduction' : 'Create Installment Plan'}
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
