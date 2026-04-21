/**
 * My Income Page — Contractor (BDM) Self-Service Payslip + Deduction Schedules
 *
 * Two tabs:
 *   1. Payslips — view own payslips, add one-off deduction lines, confirm
 *   2. My Deduction Schedules — create one-time or installment deductions, view timeline
 *
 * Contractor-only (not employees — they use Payroll module).
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useIncome from '../hooks/useIncome';
import useDeductionSchedule from '../hooks/useDeductionSchedule';
import { useLookupOptions } from '../hooks/useLookups';
import { showError, showSuccess, showApprovalPending, isApprovalPending } from '../utils/errorToast';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';

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
  .bd-toggle { cursor: pointer; user-select: none; transition: background 0.15s; }
  .bd-toggle:hover { background: var(--erp-accent-soft, #e8efff); }
  .bd-arrow { display: inline-block; width: 16px; font-size: 10px; color: var(--erp-muted); transition: transform 0.2s; }
  .bd-arrow.open { transform: rotate(90deg); }
  .bd-panel { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 8px; padding: 12px; margin: 4px 0 8px; animation: bdSlide 0.2s ease-out; }
  @keyframes bdSlide { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 2000px; } }
  .bd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .bd-table th { text-align: left; padding: 4px 6px; background: #e8efff; font-weight: 600; font-size: 11px; }
  .bd-table td { padding: 4px 6px; border-top: 1px solid #e2e8f0; }
  .bd-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .bd-subtotal { font-weight: 600; background: #f0f4ff; }
  .bd-section-title { font-size: 12px; font-weight: 700; color: var(--erp-text); margin: 8px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .bd-chip { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 4px; }
  .bd-chip-full { background: #d1fae5; color: #065f46; } .bd-chip-half { background: #fef3c7; color: #92400e; } .bd-chip-zero { background: #fee2e2; color: #991b1b; }
  .bd-chip-yes { background: #d1fae5; color: #065f46; } .bd-chip-no { background: #fee2e2; color: #991b1b; }
  .bd-override { background: #fef3c7; border-left: 3px solid #f59e0b; padding: 2px 6px; font-size: 11px; color: #92400e; }
  .bd-empty { text-align: center; color: var(--erp-muted); padding: 12px; font-size: 12px; font-style: italic; }
  .bd-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .bd-load-btn { padding: 6px 14px; border: 1px solid #2563eb; border-radius: 8px; background: transparent; color: #2563eb; font-size: 12px; font-weight: 600; cursor: pointer; margin-bottom: 8px; }
  .bd-load-btn:hover { background: #eff6ff; }
  .bd-load-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  @media(max-width: 768px) { .my-income-main { padding: 12px; } .payslip-grid { grid-template-columns: 1fr; } .list-grid { grid-template-columns: 1fr 1fr; } .add-form { flex-direction: column; } .form-grid { grid-template-columns: 1fr; } .bd-panel { padding: 8px; } }
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

  // ── Breakdown state (transparent payslip) ──
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  // ── Projection state ──
  const [projection, setProjection] = useState(null);
  const [projLoading, setProjLoading] = useState(false);

  // ── Schedule state ──
  const [schedules, setSchedules] = useState([]);
  const [selectedSched, setSelectedSched] = useState(null);
  const [showCreate, setShowCreate] = useState(null); // 'one-time' | 'installment' | null
  const [schedForm, setSchedForm] = useState({ type: '', amount: '', term: '1', start: getCurrentPeriod(), target_cycle: 'C2', desc: '' });
  const [editingScheduleId, setEditingScheduleId] = useState(null); // non-null = editing mode
  const [schedStatusFilter, setSchedStatusFilter] = useState('');

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
      const params = {};
      if (schedStatusFilter) params.status = schedStatusFilter;
      const res = await sched.getMySchedules(params);
      setSchedules(res?.data || []);
    } catch (err) { showError(err, 'Could not load schedules'); }
    setLoading(false);
  }, [schedStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (res?.data) { setSelected(res.data); setPayslipView('detail'); setBreakdown(null); setExpandedSections({}); }
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

  const handleSelectSchedule = async (s) => {
    setLoading(true);
    try {
      const res = await sched.getScheduleById(s._id);
      if (res?.data) setSelectedSched(res.data);
    } catch (err) { showError(err, 'Could not load schedule'); }
    setLoading(false);
  };

  // ── BDM Self-Service handlers ──
  const handleWithdrawSchedule = async () => {
    if (!selectedSched || !window.confirm('Withdraw this schedule? This cannot be undone.')) return;
    setLoading(true);
    try {
      await sched.withdrawSchedule(selectedSched._id);
      setSelectedSched(null);
      loadSchedules();
    } catch (err) { showError(err, 'Could not withdraw schedule'); }
    setLoading(false);
  };

  const handleEditSchedule = () => {
    if (!selectedSched) return;
    const s = selectedSched;
    setEditingScheduleId(s._id);
    setSchedForm({
      type: s.deduction_type,
      amount: String(s.total_amount),
      term: String(s.term_months),
      start: s.start_period,
      target_cycle: s.target_cycle || 'C2',
      desc: s.description || ''
    });
    setShowCreate(s.term_months === 1 ? 'one-time' : 'installment');
  };

  const handleResubmitSchedule = () => {
    if (!selectedSched) return;
    const s = selectedSched;
    setEditingScheduleId(null); // new schedule, not edit
    setSchedForm({
      type: s.deduction_type,
      amount: String(s.total_amount),
      term: String(s.term_months),
      start: s.start_period,
      target_cycle: s.target_cycle || 'C2',
      desc: s.description || ''
    });
    setShowCreate(s.term_months === 1 ? 'one-time' : 'installment');
    setSelectedSched(null);
  };

  const handleSaveSchedule = async () => {
    const dedOption = deductionTypes.find(d => d.code === schedForm.type);
    if (!dedOption || !schedForm.amount || !schedForm.start) return;
    setLoading(true);
    try {
      const payload = {
        deduction_type: schedForm.type,
        deduction_label: dedOption.label,
        total_amount: parseFloat(schedForm.amount),
        term_months: parseInt(schedForm.term) || 1,
        start_period: schedForm.start,
        target_cycle: schedForm.target_cycle,
        description: schedForm.desc
      };
      let result;
      if (editingScheduleId) {
        result = await sched.editSchedule(editingScheduleId, payload);
      } else {
        result = await sched.createSchedule(payload);
      }
      // Phase G4.2 — createSchedule may return HTTP 202 approval_pending when the
      // BDM's role isn't in MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE. Surface the
      // info toast so the BDM sees "Approval required" instead of silent success.
      if (isApprovalPending(result)) {
        showApprovalPending(result?.message || 'Deduction schedule sent to Approval Hub.');
      } else if (!editingScheduleId) {
        showSuccess('Deduction schedule submitted.');
      }
      setShowCreate(null);
      setEditingScheduleId(null);
      setSchedForm({ type: '', amount: '', term: '1', start: getCurrentPeriod(), target_cycle: 'C2', desc: '' });
      setSelectedSched(null);
      loadSchedules();
    } catch (err) { showError(err, editingScheduleId ? 'Could not update schedule' : 'Could not create schedule'); }
    setLoading(false);
  };

  const canAddDeductions = selected?.status === 'GENERATED';
  const canConfirm = selected?.status === 'REVIEWED';
  const lines = selected?.deduction_lines || [];

  // ── Breakdown helpers ──
  const loadBreakdown = async (reportId) => {
    if (breakdown?.report_id === reportId) return; // already loaded
    setBreakdownLoading(true);
    try {
      const res = await inc.getIncomeBreakdown(reportId);
      setBreakdown(res?.data || null);
    } catch (err) { showError(err, 'Could not load breakdown'); setBreakdown(null); }
    setBreakdownLoading(false);
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    // Lazy-load breakdown on first expand
    if (!breakdown && selected?._id && !expandedSections[key]) {
      loadBreakdown(selected._id);
    }
  };

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
                    <RejectionBanner
                      row={selected}
                      moduleKey="INCOME"
                      variant="page"
                      docLabel={`${selected.period} ${cycleLabel(selected.cycle)}`}
                    />

                    {/* ── Breakdown toggle ── */}
                    <button className="bd-load-btn" disabled={breakdownLoading}
                      onClick={() => { if (!breakdown) loadBreakdown(selected._id); setExpandedSections(prev => { const allOpen = Object.values(prev).some(v => v); return allOpen ? {} : { smer: true, commission: true, profitSharing: true, calf: true, personalGas: true }; }); }}>
                      {breakdownLoading ? 'Loading...' : breakdown ? (Object.values(expandedSections).some(v => v) ? 'Collapse All' : 'Expand All') : 'View Breakdown'}
                    </button>

                    <div className="payslip-grid">
                      {/* ═══ EARNINGS ═══ */}
                      <div>
                        <table className="payslip-table">
                          <thead><tr><th colSpan={2}>Earnings</th></tr></thead>
                          <tbody>
                            {/* SMER */}
                            <tr className="bd-toggle" onClick={() => toggleSection('smer')}>
                              <td><span className={`bd-arrow ${expandedSections.smer ? 'open' : ''}`}>▸</span> SMER (Reimbursable)</td>
                              <td>{fmt(selected.earnings?.smer)}</td>
                            </tr>
                            {expandedSections.smer && breakdown?.smer && (
                              <tr><td colSpan={2} style={{ padding: 0 }}>
                                <div className="bd-panel">
                                  <div className="bd-section-title">Subtotals</div>
                                  <table className="bd-table">
                                    <tbody>
                                      <tr><td>Per Diem ({breakdown.smer.working_days} working days)</td><td>{fmt(breakdown.smer.subtotals.perdiem)}</td></tr>
                                      <tr><td>Transport (P2P)</td><td>{fmt(breakdown.smer.subtotals.transport_p2p)}</td></tr>
                                      <tr><td>Transport (Special)</td><td>{fmt(breakdown.smer.subtotals.transport_special)}</td></tr>
                                      <tr><td>ORE (Cash Expenses)</td><td>{fmt(breakdown.smer.subtotals.ore)}</td></tr>
                                      <tr className="bd-subtotal"><td>Total Reimbursable</td><td>{fmt(breakdown.smer.subtotals.total_reimbursable)}</td></tr>
                                    </tbody>
                                  </table>

                                  <div className="bd-section-title" style={{ marginTop: 10 }}>Daily Entries</div>
                                  <div className="bd-scroll">
                                    <table className="bd-table">
                                      <thead><tr><th>Day</th><th>Hospital</th><th>MDs</th><th>Tier</th><th>Per Diem</th><th>Transport</th><th>ORE</th></tr></thead>
                                      <tbody>
                                        {breakdown.smer.daily_entries.map((d, i) => (
                                          <tr key={i}>
                                            <td>{d.day}{d.entry_date ? ` (${new Date(d.entry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })})` : ''}</td>
                                            <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.hospital_covered || '-'}</td>
                                            <td>{d.md_count}</td>
                                            <td>
                                              <span className={`bd-chip bd-chip-${(d.perdiem_tier || 'zero').toLowerCase()}`}>{d.perdiem_tier}</span>
                                              {d.perdiem_override && <span className="bd-chip" style={{ background: '#fef3c7', color: '#92400e', marginLeft: 2 }}>OVR</span>}
                                            </td>
                                            <td>{fmt(d.perdiem_amount)}</td>
                                            <td>{fmt((d.transpo_p2p || 0) + (d.transpo_special || 0))}</td>
                                            <td>{fmt(d.ore_amount)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* ORE expense breakdown — grouped by category */}
                                  {breakdown.ore && (breakdown.ore.by_category?.length > 0 || breakdown.ore.expense_lines?.length > 0) && (
                                    <>
                                      <div className="bd-section-title" style={{ marginTop: 10 }}>ORE / Cash Expenses (from Expenses module)</div>
                                      {/* Category subtotals */}
                                      {breakdown.ore.by_category?.length > 0 && (
                                        <table className="bd-table" style={{ marginBottom: 8 }}>
                                          <thead><tr><th>Category</th><th>Lines</th><th>Subtotal</th></tr></thead>
                                          <tbody>
                                            {breakdown.ore.by_category.map((cat, ci) => (
                                              <tr key={ci}>
                                                <td>{cat.category}</td>
                                                <td>{cat.lines.length}</td>
                                                <td>{fmt(cat.subtotal)}</td>
                                              </tr>
                                            ))}
                                            <tr className="bd-subtotal"><td>Total ORE from Expenses</td><td>{breakdown.ore.expense_lines?.length || 0}</td><td>{fmt(breakdown.ore.expense_ore || 0)}</td></tr>
                                          </tbody>
                                        </table>
                                      )}
                                      {/* Detailed lines */}
                                      <div className="bd-scroll">
                                        <table className="bd-table">
                                          <thead><tr><th>Date</th><th>Category</th><th>Establishment</th><th>Particulars</th><th>OR#</th><th>Amount</th></tr></thead>
                                          <tbody>
                                            {(breakdown.ore.expense_lines || []).map((l, i) => (
                                              <tr key={i}>
                                                <td>{l.expense_date ? new Date(l.expense_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '-'}</td>
                                                <td>{l.expense_category || '-'}</td>
                                                <td>{l.establishment || '-'}</td>
                                                <td>{l.particulars || '-'}</td>
                                                <td>{l.or_number || '-'}</td>
                                                <td>{fmt(l.amount)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  )}

                                  {/* Revolving Fund */}
                                  {(breakdown.smer.revolving_fund.travel_advance || 0) > 0 && (
                                    <>
                                      <div className="bd-section-title" style={{ marginTop: 10 }}>Revolving Fund</div>
                                      <table className="bd-table">
                                        <tbody>
                                          <tr><td>Travel Advance</td><td>{fmt(breakdown.smer.revolving_fund.travel_advance)}</td></tr>
                                          <tr><td>Reimbursable</td><td>{fmt(breakdown.smer.revolving_fund.total_reimbursable)}</td></tr>
                                          <tr className="bd-subtotal"><td>Balance on Hand</td><td style={{ color: (breakdown.smer.revolving_fund.balance_on_hand || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(breakdown.smer.revolving_fund.balance_on_hand)}</td></tr>
                                        </tbody>
                                      </table>
                                    </>
                                  )}
                                </div>
                              </td></tr>
                            )}
                            {expandedSections.smer && !breakdown?.smer && !breakdownLoading && (
                              <tr><td colSpan={2}><div className="bd-empty">No SMER data for this period</div></td></tr>
                            )}

                            {/* Commission */}
                            <tr className="bd-toggle" onClick={() => toggleSection('commission')}>
                              <td><span className={`bd-arrow ${expandedSections.commission ? 'open' : ''}`}>▸</span> CORE Commission</td>
                              <td>{fmt(selected.earnings?.core_commission)}</td>
                            </tr>
                            {expandedSections.commission && breakdown?.commission && (
                              <tr><td colSpan={2} style={{ padding: 0 }}>
                                <div className="bd-panel">
                                  {breakdown.commission.collections.length === 0 && <div className="bd-empty">No posted collections for this period</div>}
                                  {breakdown.commission.collections.map(c => (
                                    <div key={c._id} style={{ marginBottom: 8 }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                                        CR# {c.cr_no} — {c.hospital_name} — {c.cr_date ? new Date(c.cr_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                      </div>
                                      <table className="bd-table">
                                        <thead><tr><th>CSI Ref</th><th>Invoice</th><th>Net of VAT</th><th>Rate</th><th>Commission</th></tr></thead>
                                        <tbody>
                                          {c.settled_csis.map((csi, i) => (
                                            <tr key={i}>
                                              <td>{csi.doc_ref || '-'}</td>
                                              <td>{fmt(csi.invoice_amount)}</td>
                                              <td>{fmt(csi.net_of_vat)}</td>
                                              <td>{((csi.commission_rate || 0) * 100).toFixed(1)}%</td>
                                              <td>{fmt(csi.commission_amount)}</td>
                                            </tr>
                                          ))}
                                          <tr className="bd-subtotal"><td colSpan={4}>CR Total Commission</td><td>{fmt(c.total_commission)}</td></tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  ))}
                                </div>
                              </td></tr>
                            )}

                            {/* Bonus */}
                            <tr><td>Bonus</td><td>{fmt(selected.earnings?.bonus)}</td></tr>

                            {/* Profit Sharing */}
                            <tr className="bd-toggle" onClick={() => toggleSection('profitSharing')}>
                              <td><span className={`bd-arrow ${expandedSections.profitSharing ? 'open' : ''}`}>▸</span> Profit Sharing</td>
                              <td>{fmt(selected.earnings?.profit_sharing)}</td>
                            </tr>
                            {expandedSections.profitSharing && breakdown?.profit_sharing && (
                              <tr><td colSpan={2} style={{ padding: 0 }}>
                                <div className="bd-panel">
                                  <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <span className={`bd-chip ${breakdown.profit_sharing.eligible ? 'bd-chip-yes' : 'bd-chip-no'}`}>
                                      {breakdown.profit_sharing.eligible ? 'Eligible' : 'Not Eligible'}
                                    </span>
                                    {breakdown.profit_sharing.deficit_flag && <span className="bd-chip bd-chip-no">Deficit — reverted to commission</span>}
                                  </div>

                                  <div className="bd-section-title">P&L Summary</div>
                                  <table className="bd-table">
                                    <tbody>
                                      <tr><td>Gross Profit</td><td>{fmt(breakdown.profit_sharing.pnl_summary.gross_profit)}</td></tr>
                                      <tr><td>Total Expenses</td><td>{fmt(breakdown.profit_sharing.pnl_summary.total_expenses)}</td></tr>
                                      <tr className="bd-subtotal"><td>Net Income</td><td style={{ color: (breakdown.profit_sharing.pnl_summary.net_income || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(breakdown.profit_sharing.pnl_summary.net_income)}</td></tr>
                                      {breakdown.profit_sharing.eligible && (
                                        <>
                                          <tr><td>BDM Share (30%)</td><td>{fmt(breakdown.profit_sharing.bdm_share)}</td></tr>
                                          <tr><td>VIP Share (70%)</td><td>{fmt(breakdown.profit_sharing.vip_share)}</td></tr>
                                        </>
                                      )}
                                    </tbody>
                                  </table>

                                  {breakdown.profit_sharing.products?.length > 0 && (
                                    <>
                                      <div className="bd-section-title" style={{ marginTop: 10 }}>Product Eligibility</div>
                                      <div className="bd-scroll">
                                        <table className="bd-table">
                                          <thead><tr><th>Product</th><th>Hospitals</th><th>MDs</th><th>Months</th><th>Status</th></tr></thead>
                                          <tbody>
                                            {breakdown.profit_sharing.products.map((p, i) => (
                                              <tr key={i}>
                                                <td>{p.product_name}</td>
                                                <td>{p.hospital_count}</td>
                                                <td>{p.md_count}</td>
                                                <td>{p.consecutive_months}</td>
                                                <td><span className={`bd-chip ${p.qualified ? 'bd-chip-yes' : p.conditions_met ? 'bd-chip-half' : 'bd-chip-no'}`}>
                                                  {p.qualified ? 'Qualified' : p.conditions_met ? 'Building' : 'Not Met'}
                                                </span></td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </td></tr>
                            )}
                            {expandedSections.profitSharing && !breakdown?.profit_sharing && !breakdownLoading && (
                              <tr><td colSpan={2}><div className="bd-empty">No P&L / Profit Sharing data for this period</div></td></tr>
                            )}

                            {/* Reimbursements */}
                            <tr><td>Reimbursements</td><td>{fmt(selected.earnings?.reimbursements)}</td></tr>

                            {/* CALF Reimbursement (earnings side) */}
                            {(selected.earnings?.calf_reimbursement || 0) > 0 && (
                              <>
                                <tr className="bd-toggle" onClick={() => toggleSection('calf')}>
                                  <td><span className={`bd-arrow ${expandedSections.calf ? 'open' : ''}`}>▸</span> CALF Reimbursement</td>
                                  <td>{fmt(selected.earnings?.calf_reimbursement)}</td>
                                </tr>
                                {expandedSections.calf && breakdown?.calf && (
                                  <tr><td colSpan={2} style={{ padding: 0 }}>
                                    <div className="bd-panel">
                                      <table className="bd-table">
                                        <thead><tr><th>CALF#</th><th>Advance</th><th>Liquidated</th><th>Balance</th><th>Status</th></tr></thead>
                                        <tbody>
                                          {breakdown.calf.documents.map(c => (
                                            <tr key={c._id}>
                                              <td>{c.calf_number || '-'}</td>
                                              <td>{fmt(c.advance_amount)}</td>
                                              <td>{fmt(c.liquidation_amount)}</td>
                                              <td style={{ color: c.balance > 0 ? '#b45309' : '#16a34a' }}>{fmt(c.balance)}</td>
                                              <td>{c.status}</td>
                                            </tr>
                                          ))}
                                          <tr className="bd-subtotal">
                                            <td>Total</td>
                                            <td>{fmt(breakdown.calf.total_advance)}</td>
                                            <td>{fmt(breakdown.calf.total_liquidation)}</td>
                                            <td style={{ color: breakdown.calf.balance > 0 ? '#b45309' : '#16a34a' }}>{fmt(breakdown.calf.balance)}</td>
                                            <td>{breakdown.calf.is_reimbursement ? 'Company reimburses you' : ''}</td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </td></tr>
                                )}
                              </>
                            )}

                            <tr className="total-row"><td>Total Earnings</td><td>{fmt(selected.total_earnings)}</td></tr>
                          </tbody>
                        </table>
                      </div>

                      {/* ═══ DEDUCTIONS ═══ */}
                      <div>
                        <table className="payslip-table">
                          <thead><tr><th colSpan={3}>Deductions</th></tr></thead>
                          <tbody>
                            {lines.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No deductions</td></tr>}
                            {lines.map(line => {
                              const isPersonalGas = line.auto_source === 'PERSONAL_GAS';
                              const isCalfDed = line.auto_source === 'CALF';
                              const isExpandable = isPersonalGas || isCalfDed;
                              const sectionKey = isPersonalGas ? 'personalGas' : isCalfDed ? 'calfDed' : null;
                              return (
                                <Fragment key={line._id}>
                                  <tr className={isExpandable ? 'bd-toggle' : ''} style={line.status === 'REJECTED' ? { opacity: 0.5 } : {}}
                                    onClick={isExpandable ? () => toggleSection(sectionKey) : undefined}>
                                    <td>
                                      {isExpandable && <span className={`bd-arrow ${expandedSections[sectionKey] ? 'open' : ''}`}>▸</span>}
                                      {line.deduction_label}
                                      <span className={`badge ${LINE_BADGES[line.status] || ''}`} style={{ marginLeft: 6 }}>{line.status}</span>
                                      {line.auto_source === 'SCHEDULE' && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 4 }}>(scheduled)</span>}
                                      {isCalfDed && <span style={{ fontSize: 10, color: 'var(--erp-muted)', marginLeft: 4 }}>(auto)</span>}
                                      {line.description && <span className="deduction-desc">{line.description}</span>}
                                      {line.finance_note && <span className="correction-note">Finance: {line.finance_note}</span>}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      {line.original_amount != null && <span className="original-amount">{fmt(line.original_amount)}</span>}
                                      {fmt(line.amount)}
                                    </td>
                                    <td style={{ width: 40, textAlign: 'center' }}>
                                      {canAddDeductions && line.status === 'PENDING' && !line.auto_source && (
                                        <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); handleRemoveDeduction(line._id); }}>✕</button>
                                      )}
                                    </td>
                                  </tr>

                                  {/* Personal Gas breakdown */}
                                  {isPersonalGas && expandedSections.personalGas && breakdown?.personal_gas && (
                                    <tr><td colSpan={3} style={{ padding: 0 }}>
                                      <div className="bd-panel">
                                        {breakdown.personal_gas.entries.length === 0 && <div className="bd-empty">No car logbook entries for this period</div>}
                                        {breakdown.personal_gas.entries.length > 0 && (
                                          <>
                                            <div className="bd-section-title">Daily Logbook</div>
                                            <div className="bd-scroll">
                                              <table className="bd-table">
                                                <thead><tr><th>Date</th><th>Start KM</th><th>End KM</th><th>Total</th><th>Personal</th><th>Official</th><th>Fuel</th><th>Gas Ded.</th></tr></thead>
                                                <tbody>
                                                  {breakdown.personal_gas.entries.map(e => (
                                                    <tr key={e._id}>
                                                      <td>{e.entry_date ? new Date(e.entry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '-'}</td>
                                                      <td>{e.starting_km?.toLocaleString()}</td>
                                                      <td>{e.ending_km?.toLocaleString()}</td>
                                                      <td>{e.total_km}</td>
                                                      <td>{e.personal_km}</td>
                                                      <td>{e.official_km}</td>
                                                      <td>
                                                        {e.fuel_entries.map((f, fi) => (
                                                          <div key={fi} style={{ fontSize: 10 }}>{f.station_name || 'Fuel'}: {f.liters}L @ {fmt(f.price_per_liter)}</div>
                                                        ))}
                                                        {e.fuel_entries.length === 0 && '-'}
                                                      </td>
                                                      <td>{fmt(e.personal_gas_amount)}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>

                                            <div className="bd-section-title" style={{ marginTop: 10 }}>Computation Summary</div>
                                            <table className="bd-table">
                                              <tbody>
                                                <tr><td>Total KM</td><td>{breakdown.personal_gas.summary.total_km?.toLocaleString()}</td></tr>
                                                <tr><td>Personal KM</td><td>{breakdown.personal_gas.summary.total_personal_km?.toLocaleString()}</td></tr>
                                                <tr><td>Official KM</td><td>{breakdown.personal_gas.summary.total_official_km?.toLocaleString()}</td></tr>
                                                <tr><td>Total Fuel</td><td>{breakdown.personal_gas.summary.total_fuel_liters?.toFixed(2)}L @ avg {fmt(breakdown.personal_gas.summary.avg_price_per_liter)}/L</td></tr>
                                                <tr><td>Total Fuel Cost</td><td>{fmt(breakdown.personal_gas.summary.total_fuel_cost)}</td></tr>
                                                <tr className="bd-subtotal"><td>Personal Gas Deduction</td><td>{fmt(breakdown.personal_gas.total_deduction)}</td></tr>
                                              </tbody>
                                            </table>
                                          </>
                                        )}
                                      </div>
                                    </td></tr>
                                  )}

                                  {/* CALF deduction breakdown */}
                                  {isCalfDed && expandedSections.calfDed && breakdown?.calf && (
                                    <tr><td colSpan={3} style={{ padding: 0 }}>
                                      <div className="bd-panel">
                                        <table className="bd-table">
                                          <thead><tr><th>CALF#</th><th>Advance</th><th>Liquidated</th><th>Balance</th><th>Status</th></tr></thead>
                                          <tbody>
                                            {breakdown.calf.documents.map(c => (
                                              <tr key={c._id}>
                                                <td>{c.calf_number || '-'}</td>
                                                <td>{fmt(c.advance_amount)}</td>
                                                <td>{fmt(c.liquidation_amount)}</td>
                                                <td style={{ color: c.balance > 0 ? '#b45309' : '#16a34a' }}>{fmt(c.balance)}</td>
                                                <td>{c.status}</td>
                                              </tr>
                                            ))}
                                            <tr className="bd-subtotal">
                                              <td>Total</td>
                                              <td>{fmt(breakdown.calf.total_advance)}</td>
                                              <td>{fmt(breakdown.calf.total_liquidation)}</td>
                                              <td>{fmt(breakdown.calf.balance)}</td>
                                              <td>{breakdown.calf.is_deduction ? 'Return excess to company' : ''}</td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    </td></tr>
                                  )}
                                </Fragment>
                              );
                            })}
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
                  {/* Summary Stats */}
                  {schedules.length > 0 && !schedStatusFilter && (
                    <div className="list-grid" style={{ marginBottom: 16 }}>
                      <div className="list-item">
                        <div className="list-label">Active</div>
                        <div className="list-value">{schedules.filter(s => s.status === 'ACTIVE').length}</div>
                      </div>
                      <div className="list-item">
                        <div className="list-label">Total Remaining</div>
                        <div className="list-value">{fmt(schedules.filter(s => s.status === 'ACTIVE').reduce((sum, s) => sum + (s.remaining_balance || 0), 0))}</div>
                      </div>
                      <div className="list-item">
                        <div className="list-label">Pending Approval</div>
                        <div className="list-value">{schedules.filter(s => s.status === 'PENDING_APPROVAL').length}</div>
                      </div>
                    </div>
                  )}

                  {/* Filter + Create */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={schedStatusFilter} onChange={e => setSchedStatusFilter(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13, background: 'var(--erp-panel)' }}>
                      <option value="">All Statuses</option>
                      <option value="PENDING_APPROVAL">Pending Approval</option>
                      <option value="ACTIVE">Active</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                    <div style={{ flex: 1 }} />
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
                  {/* Audit Trail */}
                  <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginBottom: 12 }}>
                    Created {selectedSched.created_at ? new Date(selectedSched.created_at).toLocaleDateString() : 'N/A'}
                    {selectedSched.approved_by && <> · Approved by {selectedSched.approved_by.name} on {selectedSched.approved_at ? new Date(selectedSched.approved_at).toLocaleDateString() : 'N/A'}</>}
                  </div>
                  <div className="list-grid" style={{ marginBottom: 12 }}>
                    <div className="list-item"><div className="list-label">Total</div><div className="list-value">{fmt(selectedSched.total_amount)}</div></div>
                    <div className="list-item"><div className="list-label">Per Installment</div><div className="list-value">{fmt(selectedSched.installment_amount)}</div></div>
                    <div className="list-item"><div className="list-label">Remaining</div><div className="list-value">{fmt(selectedSched.remaining_balance)}</div></div>
                  </div>

                  {/* BDM Self-Service Actions */}
                  {selectedSched.status === 'PENDING_APPROVAL' && (
                    <div className="workflow-actions" style={{ marginBottom: 12 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleEditSchedule} disabled={loading}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={handleWithdrawSchedule} disabled={loading}>Withdraw</button>
                    </div>
                  )}
                  {selectedSched.status === 'REJECTED' && (
                    <div className="workflow-actions" style={{ marginBottom: 12 }}>
                      <button className="btn btn-primary btn-sm" onClick={handleResubmitSchedule} disabled={loading}>Resubmit with Changes</button>
                    </div>
                  )}

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
            <div className="create-modal" onClick={() => { setShowCreate(null); setEditingScheduleId(null); }}>
              <div className="create-modal-content" onClick={e => e.stopPropagation()}>
                <h3>{editingScheduleId ? 'Edit Schedule' : showCreate === 'one-time' ? 'One-Time Deduction' : 'Installment Plan'}</h3>
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
                  <button className="btn btn-outline" onClick={() => { setShowCreate(null); setEditingScheduleId(null); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveSchedule}
                    disabled={loading || !schedForm.type || !schedForm.amount || parseFloat(schedForm.amount) <= 0 || !schedForm.start
                      || (showCreate === 'installment' && (!schedForm.term || parseInt(schedForm.term) < 2))}>
                    {editingScheduleId ? 'Save Changes' : showCreate === 'one-time' ? 'Create Deduction' : 'Create Installment Plan'}
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
