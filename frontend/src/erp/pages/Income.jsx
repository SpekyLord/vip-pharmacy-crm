/**
 * Income Page — BDM Payslip View
 *
 * PRD §10: GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED
 * Earnings: SMER + CORE Commission + Bonus + Profit Sharing + Reimbursements
 * Deductions: Cash Advance + Credit Card + Credit Payment + Purchased Goods + Other + Over Payment
 */
import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useIncome from '../hooks/useIncome';
import useDeductionSchedule from '../hooks/useDeductionSchedule';
import usePeople from '../hooks/usePeople';

import { showError } from '../utils/errorToast';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { useLookupOptions } from '../hooks/useLookups';

const pageStyles = `
  .income-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .income-main { flex: 1; min-width: 0; padding: 20px; max-width: 1200px; margin: 0 auto; }
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
  .btn-sm { padding: 4px 10px; font-size: 12px; }
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
  .return-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .return-modal-content { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25); }
  .return-modal textarea { width: 100%; padding: 8px; border: 1px solid var(--erp-border); border-radius: 8px; min-height: 80px; font-size: 13px; margin: 12px 0; }
  .badge-pending { background: #fef3c7; color: #92400e; }
  .badge-verified { background: #d1fae5; color: #065f46; }
  .badge-corrected { background: #dbeafe; color: #1d4ed8; }
  .badge-rejected { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
  .badge-onestop { background: #e2e8f0; color: #475569; }
  .badge-installment { background: #fef3c7; color: #92400e; font-weight: 600; }
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
  .correct-modal { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .correct-modal-content { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 400px; max-width: 90vw; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25); }
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
  .bd-toggle { cursor: pointer; user-select: none; transition: background 0.15s; }
  .bd-toggle:hover { background: var(--erp-accent-soft, #e8efff); }
  .bd-arrow { display: inline-block; width: 16px; font-size: 10px; color: var(--erp-muted); transition: transform 0.2s; }
  .bd-arrow.open { transform: rotate(90deg); }
  .bd-panel { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 8px; padding: 12px; margin: 4px 0 8px; }
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
  @media(max-width: 768px) { .income-main { padding: 12px; } .payslip-grid { grid-template-columns: 1fr; } .list-table-wrap { display: none; } .list-mobile-list { display: grid; } .finance-add-form { flex-direction: column; } .bd-panel { padding: 8px; } }
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
  const { getPeopleList } = usePeople();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const { options: deductionTypes } = useLookupOptions('INCOME_DEDUCTION_TYPE');
  const { options: cycleOptions } = useLookupOptions('CYCLE');
  const cycleLabel = (code) => cycleOptions.find(c => c.code === code)?.label || code;

  const [view, setView] = useState('list'); // list | detail
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [cycle, setCycle] = useState('MONTHLY');
  const [bdmId, setBdmId] = useState('');
  const [people, setPeople] = useState([]);
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
  // Schedule filters
  const [schedStatusFilter, setSchedStatusFilter] = useState('');
  const [schedBdmFilter, setSchedBdmFilter] = useState('');
  // Schedule modals
  const [showRejectSchedModal, setShowRejectSchedModal] = useState(null); // schedule _id
  const [rejectSchedReason, setRejectSchedReason] = useState('');
  const [showPayoffModal, setShowPayoffModal] = useState(null); // schedule _id
  const [payoffPeriod, setPayoffPeriod] = useState('');
  const [showFinCreateModal, setShowFinCreateModal] = useState(false);
  const [finSchedForm, setFinSchedForm] = useState({ bdm_id: '', type: '', amount: '', term: '1', start: getCurrentPeriod(), target_cycle: 'C2', desc: '' });
  // Installment adjustment
  const [showAdjustModal, setShowAdjustModal] = useState(null); // { instId }
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  // Bulk approve
  const [bulkSelected, setBulkSelected] = useState(new Set());
  // Breakdown state (transparent payslip)
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  // Load contractor list for dropdown (admin/finance/president only)
  useEffect(() => {
    if (isAdmin) {
      getPeopleList({ limit: 0, status: 'ACTIVE' })
        .then(res => {
          // Filter to people with linked user accounts (contractors who can receive income)
          const all = (res?.data || []).filter(p => p.user_id);
          setPeople(all);
        })
        .catch(err => console.error('[Income] People load failed:', err.message));
    }
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const params = {};
      if (schedStatusFilter) params.status = schedStatusFilter;
      if (schedBdmFilter) params.bdm_id = schedBdmFilter;
      const res = await schedApi.getScheduleList(params);
      setAllSchedules(res?.data || []);
    } catch (err) { showError(err, 'Could not load schedules'); }
    setLoading(false);
  }, [schedStatusFilter, schedBdmFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (incomeTab === 'schedules') loadSchedules(); }, [incomeTab, loadSchedules]);

  const handleApproveSchedule = async (id) => {
    setLoading(true);
    try { await schedApi.approveSchedule(id); loadSchedules(); }
    catch (err) { showError(err, 'Could not approve'); }
    setLoading(false);
  };

  const handleRejectSchedule = async () => {
    if (!showRejectSchedModal || !rejectSchedReason.trim()) return;
    setLoading(true);
    try {
      await schedApi.rejectSchedule(showRejectSchedModal, rejectSchedReason);
      setShowRejectSchedModal(null);
      setRejectSchedReason('');
      loadSchedules();
    } catch (err) { showError(err, 'Could not reject'); }
    setLoading(false);
  };

  const handleCancelSchedule = async (id) => {
    if (!confirm('Cancel this schedule? Remaining installments will be cancelled.')) return;
    setLoading(true);
    try { await schedApi.cancelSchedule(id, 'Cancelled by Finance'); loadSchedules(); }
    catch (err) { showError(err, 'Could not cancel'); }
    setLoading(false);
  };

  const handleEarlyPayoff = async () => {
    if (!showPayoffModal || !payoffPeriod || !/^\d{4}-\d{2}$/.test(payoffPeriod)) return;
    setLoading(true);
    try {
      const res = await schedApi.earlyPayoff(showPayoffModal, { payoff_period: payoffPeriod });
      if (res?.data) setSelectedSched(res.data);
      setShowPayoffModal(null);
      setPayoffPeriod('');
      loadSchedules();
    } catch (err) { showError(err, 'Early payoff failed'); }
    setLoading(false);
  };

  const handleFinCreateSchedule = async () => {
    const dedOption = deductionTypes.find(d => d.code === finSchedForm.type);
    if (!dedOption || !finSchedForm.amount || !finSchedForm.start || !finSchedForm.bdm_id) return;
    setLoading(true);
    try {
      await schedApi.financeCreateSchedule({
        bdm_id: finSchedForm.bdm_id,
        deduction_type: finSchedForm.type,
        deduction_label: dedOption.label,
        total_amount: parseFloat(finSchedForm.amount),
        term_months: parseInt(finSchedForm.term) || 1,
        start_period: finSchedForm.start,
        target_cycle: finSchedForm.target_cycle,
        description: finSchedForm.desc
      });
      setShowFinCreateModal(false);
      setFinSchedForm({ bdm_id: '', type: '', amount: '', term: '1', start: getCurrentPeriod(), target_cycle: 'C2', desc: '' });
      loadSchedules();
    } catch (err) { showError(err, 'Could not create schedule'); }
    setLoading(false);
  };

  const handleAdjustInstallment = async () => {
    if (!selectedSched || !showAdjustModal || !adjustAmount) return;
    setLoading(true);
    try {
      const res = await schedApi.adjustInstallment(selectedSched._id, showAdjustModal.instId, {
        amount: parseFloat(adjustAmount),
        note: adjustNote
      });
      if (res?.data) setSelectedSched(res.data);
      setShowAdjustModal(null);
      setAdjustAmount('');
      setAdjustNote('');
    } catch (err) { showError(err, 'Could not adjust installment'); }
    setLoading(false);
  };

  const handleBulkApprove = async () => {
    if (bulkSelected.size === 0) return;
    setLoading(true);
    try {
      for (const id of bulkSelected) {
        await schedApi.approveSchedule(id);
      }
      setBulkSelected(new Set());
      loadSchedules();
    } catch (err) { showError(err, 'Bulk approve failed'); }
    setLoading(false);
  };

  const toggleBulkSelect = (id) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
      if (res?.data) { setSelected(res.data); setView('detail'); setManualEdits({}); setBreakdown(null); setExpandedSections({}); }
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
  const bdmName = (r) => r.bdm_id ? (r.bdm_id.name || r.bdm_id.email || 'N/A') : 'N/A';

  // ── Breakdown helpers (transparent payslip) ──
  const loadBreakdown = async (reportId) => {
    if (breakdown?.report_id === reportId) return;
    setBreakdownLoading(true);
    try {
      const res = await inc.getIncomeBreakdown(reportId);
      setBreakdown(res?.data || null);
    } catch (err) { showError(err, 'Could not load breakdown'); setBreakdown(null); }
    setBreakdownLoading(false);
  };

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    if (!breakdown && selected?._id && !expandedSections[key]) {
      loadBreakdown(selected._id);
    }
  };

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
                <SelectField value={bdmId} onChange={e => setBdmId(e.target.value)} style={{ minWidth: 200 }}>
                  <option value="">All Contractors</option>
                  {people.map(p => (
                    <option key={p._id} value={p.user_id?._id || p.user_id}>
                      {p.full_name}
                    </option>
                  ))}
                </SelectField>
              )}
              {isAdmin && bdmId && (
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
              {!selectedSched && (
                <>
                  {/* Filters + Create */}
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={schedStatusFilter} onChange={e => setSchedStatusFilter(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13, background: 'var(--erp-panel)' }}>
                      <option value="">All Statuses</option>
                      <option value="PENDING_APPROVAL">Pending Approval</option>
                      <option value="ACTIVE">Active</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="REJECTED">Rejected</option>
                    </select>
                    <select value={schedBdmFilter} onChange={e => setSchedBdmFilter(e.target.value)}
                      style={{ padding: '8px 12px', border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13, background: 'var(--erp-panel)' }}>
                      <option value="">All BDMs</option>
                      {people.map(p => (
                        <option key={p.user_id?._id || p._id} value={p.user_id?._id || p._id}>{p.first_name} {p.last_name}</option>
                      ))}
                    </select>
                    <div style={{ flex: 1 }} />
                    <button className="btn btn-primary" onClick={() => setShowFinCreateModal(true)}>+ Create Deduction</button>
                    {bulkSelected.size > 0 && (
                      <button className="btn btn-success" onClick={handleBulkApprove} disabled={loading}>
                        Approve Selected ({bulkSelected.size})
                      </button>
                    )}
                  </div>

                  {allSchedules.map(s => {
                    const sBdmName = s.bdm_id ? `${s.bdm_id.name || s.bdm_id.email || 'BDM'}` : 'N/A';
                    return (
                      <div className="sched-card" key={s._id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            {s.status === 'PENDING_APPROVAL' && (
                              <input type="checkbox" checked={bulkSelected.has(s._id)}
                                onChange={() => toggleBulkSelect(s._id)}
                                onClick={e => e.stopPropagation()}
                                style={{ marginTop: 4 }} />
                            )}
                            <div>
                              <h4 style={{ margin: 0 }}>{s.deduction_label} — {sBdmName}</h4>
                              <div style={{ fontSize: 12, color: 'var(--erp-muted)' }}>
                                {s.schedule_code} · {s.term_months === 1 ? 'One-time' : `${s.term_months} months`} · {fmt(s.total_amount)} · Start: {s.start_period} · {cycleLabel(s.target_cycle || 'C2')}
                              </div>
                            </div>
                          </div>
                          <span className={`badge ${s.status === 'PENDING_APPROVAL' ? 'badge-pending_approval' : s.status === 'ACTIVE' ? 'badge-active' : s.status === 'COMPLETED' ? 'badge-completed' : s.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-rejected'}`}>{s.status.replace('_', ' ')}</span>
                        </div>
                        <div className="sched-actions">
                          {s.status === 'PENDING_APPROVAL' && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => handleApproveSchedule(s._id)}>Approve</button>
                              <button className="btn btn-danger btn-sm" onClick={() => { setShowRejectSchedModal(s._id); setRejectSchedReason(''); }}>Reject</button>
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
                </>
              )}
              {!selectedSched && allSchedules.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 40 }}>No deduction schedules found.</div>
              )}
              {selectedSched && (
                <div className="sched-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h4>{selectedSched.deduction_label} — {selectedSched.schedule_code}</h4>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedSched(null)}>← Back</button>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--erp-muted)', marginBottom: 8 }}>
                    BDM: {selectedSched.bdm_id?.name || 'N/A'} · Status: <span className={`badge ${selectedSched.status === 'PENDING_APPROVAL' ? 'badge-pending_approval' : selectedSched.status === 'ACTIVE' ? 'badge-active' : selectedSched.status === 'COMPLETED' ? 'badge-completed' : selectedSched.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-rejected'}`}>{selectedSched.status.replace('_', ' ')}</span>
                  </div>
                  {selectedSched.reject_reason && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                      <strong>Rejected:</strong> {selectedSched.reject_reason}
                    </div>
                  )}
                  {/* Audit Trail */}
                  <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginBottom: 12 }}>
                    Created by {selectedSched.created_by?.name || 'N/A'} on {selectedSched.created_at ? new Date(selectedSched.created_at).toLocaleDateString() : 'N/A'}
                    {selectedSched.approved_by && <> · Approved by {selectedSched.approved_by.name} on {selectedSched.approved_at ? new Date(selectedSched.approved_at).toLocaleDateString() : 'N/A'}</>}
                  </div>
                  {selectedSched.status === 'ACTIVE' && (
                    <div className="sched-actions">
                      <button className="btn btn-outline btn-sm" onClick={() => handleCancelSchedule(selectedSched._id)}>Cancel Schedule</button>
                      <button className="btn btn-primary btn-sm" onClick={() => { setShowPayoffModal(selectedSched._id); setPayoffPeriod(''); }}>Early Payoff</button>
                    </div>
                  )}
                  <table className="inst-table">
                    <thead><tr><th>#</th><th>Period</th><th>Amount</th><th>Status</th><th>Note</th><th></th></tr></thead>
                    <tbody>
                      {(selectedSched.installments || []).map(inst => (
                        <tr key={inst._id} style={inst.status === 'CANCELLED' ? { opacity: 0.5 } : {}}>
                          <td>{inst.installment_no}</td>
                          <td>{inst.period}</td>
                          <td>{fmt(inst.amount)}</td>
                          <td><span className={`badge ${inst.status === 'POSTED' ? 'badge-posted' : inst.status === 'VERIFIED' ? 'badge-verified' : inst.status === 'INJECTED' ? 'badge-injected' : inst.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-pending'}`}>{inst.status}</span></td>
                          <td style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{inst.note || ''}</td>
                          <td>
                            {['PENDING', 'INJECTED'].includes(inst.status) && (
                              <button className="btn btn-outline btn-sm" style={{ padding: '2px 8px', fontSize: 11 }}
                                onClick={() => { setShowAdjustModal({ instId: inst._id }); setAdjustAmount(String(inst.amount)); setAdjustNote(''); }}>
                                Adjust
                              </button>
                            )}
                          </td>
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

                <RejectionBanner
                  row={selected}
                  moduleKey="INCOME"
                  variant="page"
                  docLabel={`${bdmName(selected)} | ${selected.period} ${cycleLabel(selected.cycle)}`}
                  onResubmit={() => {
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />


                {/* ── Breakdown toggle ── */}
                <button style={{ padding: '6px 14px', border: '1px solid #2563eb', borderRadius: 8, background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}
                  disabled={breakdownLoading}
                  onClick={() => { if (!breakdown) loadBreakdown(selected._id); setExpandedSections(prev => { const allOpen = Object.values(prev).some(v => v); if (allOpen) return {}; const next = { smer: true, commission: true, profitSharing: true, calf: true, personalGas: true, calfDed: true }; (selected?.deduction_lines || []).forEach(l => { if (l.auto_source === 'SCHEDULE' && l._id) next[`sched_${l._id}`] = true; }); return next; }); }}>
                  {breakdownLoading ? 'Loading...' : breakdown ? (Object.values(expandedSections).some(v => v) ? 'Collapse All' : 'Expand All') : 'View Breakdown'}
                </button>

                <div className="payslip-grid">
                  {/* ═══ Earnings ═══ */}
                  <div>
                    <table className="payslip-table">
                      <thead><tr><th colSpan={2}>Earnings</th></tr></thead>
                      <tbody>
                        {/* SMER */}
                        <tr className="bd-toggle" onClick={() => toggleSection('smer')} style={{ cursor: 'pointer' }}>
                          <td><span className={`bd-arrow ${expandedSections.smer ? 'open' : ''}`}>▸</span> SMER (Per Diem + Transport + ORE)</td>
                          <td>{fmt(selected.earnings?.smer)}</td>
                        </tr>
                        {expandedSections.smer && breakdown?.smer && (
                          <tr><td colSpan={2} style={{ padding: 0 }}>
                            <div className="bd-panel">
                              <div className="bd-section-title">Subtotals</div>
                              <table className="bd-table">
                                <tbody>
                                  <tr><td>Per Diem ({breakdown.smer.working_days} days)</td><td>{fmt(breakdown.smer.subtotals.perdiem)}</td></tr>
                                  <tr><td>Transport (P2P)</td><td>{fmt(breakdown.smer.subtotals.transport_p2p)}</td></tr>
                                  <tr><td>Transport (Special)</td><td>{fmt(breakdown.smer.subtotals.transport_special)}</td></tr>
                                  <tr><td>ORE (from Expenses, receipt-backed)</td><td>{fmt(breakdown.smer.subtotals.ore)}</td></tr>
                                  {(breakdown.smer.subtotals.ore_legacy_smer || 0) > 0 && (
                                    <tr style={{ color: 'var(--erp-muted)', fontSize: 11 }}><td>Legacy SMER-ORE (audit only)</td><td>{fmt(breakdown.smer.subtotals.ore_legacy_smer)}</td></tr>
                                  )}
                                  <tr className="bd-subtotal"><td>Total</td><td>{fmt(breakdown.smer.subtotals.total_reimbursable)}</td></tr>
                                </tbody>
                              </table>
                              <div className="bd-section-title" style={{ marginTop: 10 }}>Daily Entries</div>
                              <div style={{ overflowX: 'auto' }}>
                                {(() => {
                                  const hasLegacyOre = (breakdown.smer.daily_entries || []).some(d => (d.ore_amount || 0) > 0);
                                  return (
                                    <table className="bd-table">
                                      <thead><tr><th>Day</th><th>Hospital</th><th>MDs</th><th>Tier</th><th>Per Diem</th><th>Transport</th>{hasLegacyOre && <th>ORE (legacy)</th>}</tr></thead>
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
                                            {hasLegacyOre && <td style={{ color: 'var(--erp-muted)' }}>{fmt(d.ore_amount)}</td>}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  );
                                })()}
                              </div>
                              {breakdown.ore && (breakdown.ore.by_category?.length > 0 || breakdown.ore.expense_lines?.length > 0) && (
                                <>
                                  <div className="bd-section-title" style={{ marginTop: 10 }}>ORE / Cash Expenses</div>
                                  {breakdown.ore.by_category?.length > 0 && (
                                    <table className="bd-table" style={{ marginBottom: 8 }}>
                                      <thead><tr><th>Category</th><th>Lines</th><th>Subtotal</th></tr></thead>
                                      <tbody>
                                        {breakdown.ore.by_category.map((cat, ci) => (
                                          <tr key={ci}><td>{cat.category}</td><td>{cat.lines.length}</td><td>{fmt(cat.subtotal)}</td></tr>
                                        ))}
                                        <tr className="bd-subtotal"><td>Total ORE</td><td>{breakdown.ore.expense_lines?.length || 0}</td><td>{fmt(breakdown.ore.expense_ore || 0)}</td></tr>
                                      </tbody>
                                    </table>
                                  )}
                                  <div style={{ overflowX: 'auto' }}>
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
                              {breakdown.smer.daily_entries.some(d => d.perdiem_override) && (
                                <>
                                  <div className="bd-section-title" style={{ marginTop: 10 }}>Per Diem Overrides</div>
                                  {breakdown.smer.daily_entries.filter(d => d.perdiem_override).map((d, i) => (
                                    <div key={i} className="bd-override" style={{ marginBottom: 4 }}>
                                      Day {d.day}: Overridden to <strong>{d.override_tier || d.perdiem_tier}</strong>
                                      {d.override_reason && <> — Reason: {d.override_reason}</>}
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>
                          </td></tr>
                        )}
                        {expandedSections.smer && !breakdown?.smer && !breakdownLoading && (
                          <tr><td colSpan={2}><div className="bd-empty">No SMER data for this period</div></td></tr>
                        )}

                        {/* Commission */}
                        <tr className="bd-toggle" onClick={() => toggleSection('commission')} style={{ cursor: 'pointer' }}>
                          <td><span className={`bd-arrow ${expandedSections.commission ? 'open' : ''}`}>▸</span> CORE Commission</td>
                          <td>{fmt(selected.earnings?.core_commission)}</td>
                        </tr>
                        {expandedSections.commission && breakdown?.commission && (
                          <tr><td colSpan={2} style={{ padding: 0 }}>
                            <div className="bd-panel">
                              {breakdown.commission.collections.length === 0 && <div className="bd-empty">No posted collections</div>}
                              {breakdown.commission.collections.map(c => (
                                <div key={c._id} style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                                    CR# {c.cr_no} — {c.hospital_name} — {c.cr_date ? new Date(c.cr_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                                  </div>
                                  <table className="bd-table">
                                    <thead><tr><th>CSI Ref</th><th>Invoice</th><th>Net VAT</th><th>Rate</th><th>Commission</th></tr></thead>
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
                                      <tr className="bd-subtotal"><td colSpan={4}>CR Total</td><td>{fmt(c.total_commission)}</td></tr>
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          </td></tr>
                        )}

                        {/* Bonus (editable) */}
                        <tr>
                          <td>Bonus</td>
                          <td>{canEdit ? <input type="number" defaultValue={selected.earnings?.bonus || 0}
                            onChange={e => setManualEdits(p => ({ ...p, earnings: { ...p.earnings, bonus: parseFloat(e.target.value) || 0 } }))} /> : fmt(selected.earnings?.bonus)}</td>
                        </tr>

                        {/* Profit Sharing */}
                        <tr className="bd-toggle" onClick={() => toggleSection('profitSharing')} style={{ cursor: 'pointer' }}>
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
                                {breakdown.profit_sharing.deficit_flag && <span className="bd-chip bd-chip-no">Deficit</span>}
                              </div>
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
                                  <div style={{ overflowX: 'auto' }}>
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
                          <tr><td colSpan={2}><div className="bd-empty">No P&L data for this period</div></td></tr>
                        )}

                        {/* Reimbursements (editable) */}
                        <tr>
                          <td>Reimbursements</td>
                          <td>{canEdit ? <input type="number" defaultValue={selected.earnings?.reimbursements || 0}
                            onChange={e => setManualEdits(p => ({ ...p, earnings: { ...p.earnings, reimbursements: parseFloat(e.target.value) || 0 } }))} /> : fmt(selected.earnings?.reimbursements)}</td>
                        </tr>

                        {/* CALF Reimbursement (earnings side) */}
                        {(selected.earnings?.calf_reimbursement || 0) > 0 && (
                          <>
                            <tr className="bd-toggle" onClick={() => toggleSection('calf')} style={{ cursor: 'pointer' }}>
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
                                      <tr className="bd-subtotal"><td>Total</td><td>{fmt(breakdown.calf.total_advance)}</td><td>{fmt(breakdown.calf.total_liquidation)}</td><td>{fmt(breakdown.calf.balance)}</td><td /></tr>
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

                  {/* ═══ Deductions ═══ */}
                  <div>
                    <table className="payslip-table">
                      <thead><tr><th>Deductions</th><th>Amount</th>{canEdit && <th>Actions</th>}</tr></thead>
                      <tbody>
                        {(selected.deduction_lines || []).length === 0 && !selected.deductions?.cash_advance && (
                          <tr><td colSpan={canEdit ? 3 : 2} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No deductions</td></tr>
                        )}
                        {(selected.deduction_lines || []).map(line => {
                          const isPersonalGas = line.auto_source === 'PERSONAL_GAS';
                          const isCalfDed = line.auto_source === 'CALF';
                          const isSchedule = line.auto_source === 'SCHEDULE';
                          const isExpandable = isPersonalGas || isCalfDed || isSchedule;
                          const scheduleKey = line.schedule_ref?.schedule_id?.toString();
                          const schedule = isSchedule && scheduleKey ? breakdown?.schedules?.[scheduleKey] : null;
                          const currentInstallment = schedule?.installments?.find(
                            i => i._id?.toString() === line.schedule_ref?.installment_id?.toString()
                          );
                          const kindBadge = isSchedule && currentInstallment
                            ? `INSTALLMENT ${currentInstallment.installment_no}/${schedule.term_months}`
                            : 'ONE-STOP';
                          const kindBadgeClass = isSchedule ? 'badge-installment' : 'badge-onestop';
                          const sectionKey = isPersonalGas ? 'personalGas'
                            : isCalfDed ? 'calfDed'
                            : isSchedule ? `sched_${line._id}`
                            : null;
                          const isZeroInfo = isPersonalGas && (line.amount || 0) === 0;
                          return (
                            <Fragment key={line._id}>
                              <tr className={isExpandable ? 'bd-toggle' : ''} style={{ ...(line.status === 'REJECTED' ? { opacity: 0.5 } : {}), ...(isExpandable ? { cursor: 'pointer' } : {}) }}
                                onClick={isExpandable ? () => toggleSection(sectionKey) : undefined}>
                                <td>
                                  {isExpandable && <span className={`bd-arrow ${expandedSections[sectionKey] ? 'open' : ''}`}>▸</span>}
                                  {line.deduction_label}
                                  <span className={`badge ${line.status === 'PENDING' ? 'badge-pending' : line.status === 'VERIFIED' ? 'badge-verified' : line.status === 'CORRECTED' ? 'badge-corrected' : 'badge-rejected'}`} style={{ marginLeft: 6 }}>{line.status}</span>
                                  <span className={`badge ${kindBadgeClass}`} style={{ marginLeft: 4 }}>{kindBadge}</span>
                                  {line.auto_source && <span style={{ fontSize: 10, color: 'var(--erp-muted)', marginLeft: 4 }}>(auto)</span>}
                                  {line.description && <span className="deduction-desc">{line.description}</span>}
                                  {line.entered_by && <span className="deduction-desc">By: {line.entered_by.name || 'Unknown'}</span>}
                                  {line.finance_note && <span className="correction-note">Finance: {line.finance_note}</span>}
                                </td>
                                <td style={{ textAlign: 'right', color: isZeroInfo ? 'var(--erp-muted)' : undefined }}>
                                  {line.original_amount != null && <span className="original-amount">{fmt(line.original_amount)}</span>}
                                  {fmt(line.amount)}
                                </td>
                                {canEdit && (
                                  <td>
                                    {line.status === 'PENDING' && (
                                      <div className="line-actions">
                                        <button onClick={(e) => { e.stopPropagation(); handleVerifyLine(line._id); }} title="Accept">✓</button>
                                        <button onClick={(e) => { e.stopPropagation(); setShowCorrect({ lineId: line._id }); setCorrectAmount(String(line.amount)); setCorrectNote(''); }} title="Correct">✎</button>
                                        <button onClick={(e) => { e.stopPropagation(); handleRejectLine(line._id); }} title="Reject">✕</button>
                                      </div>
                                    )}
                                  </td>
                                )}
                              </tr>

                              {/* Personal Gas breakdown */}
                              {isPersonalGas && expandedSections.personalGas && breakdown?.personal_gas && (
                                <tr><td colSpan={canEdit ? 3 : 2} style={{ padding: 0 }}>
                                  <div className="bd-panel">
                                    {breakdown.personal_gas.entries.length === 0 && <div className="bd-empty">No car logbook entries</div>}
                                    {breakdown.personal_gas.entries.length > 0 && (
                                      <>
                                        <div className="bd-section-title">Daily Logbook</div>
                                        <div style={{ overflowX: 'auto' }}>
                                          <table className="bd-table">
                                            <thead><tr><th>Date</th><th>Start</th><th>End</th><th>Total</th><th>Personal</th><th>Official</th><th>Fuel</th><th>Gas Ded.</th></tr></thead>
                                            <tbody>
                                              {breakdown.personal_gas.entries.map(e => (
                                                <tr key={e._id}>
                                                  <td>{e.entry_date ? new Date(e.entry_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '-'}</td>
                                                  <td>{e.starting_km?.toLocaleString()}</td>
                                                  <td>{e.ending_km?.toLocaleString()}</td>
                                                  <td>{e.total_km}</td>
                                                  <td>{e.personal_km}</td>
                                                  <td>{e.official_km}</td>
                                                  <td>{e.fuel_entries.map((f, fi) => <div key={fi} style={{ fontSize: 10 }}>{f.station_name || 'Fuel'}: {f.liters}L @ {fmt(f.price_per_liter)}</div>)}{e.fuel_entries.length === 0 && '-'}</td>
                                                  <td>{fmt(e.personal_gas_amount)}</td>
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

                              {/* CALF deduction breakdown */}
                              {isCalfDed && expandedSections.calfDed && breakdown?.calf && (
                                <tr><td colSpan={canEdit ? 3 : 2} style={{ padding: 0 }}>
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
                                        <tr className="bd-subtotal"><td>Total</td><td>{fmt(breakdown.calf.total_advance)}</td><td>{fmt(breakdown.calf.total_liquidation)}</td><td>{fmt(breakdown.calf.balance)}</td><td /></tr>
                                      </tbody>
                                    </table>
                                  </div>
                                </td></tr>
                              )}

                              {/* Installment schedule breakdown */}
                              {isSchedule && expandedSections[sectionKey] && schedule && (
                                <tr><td colSpan={canEdit ? 3 : 2} style={{ padding: 0 }}>
                                  <div className="bd-panel">
                                    <div className="bd-section-title">{schedule.schedule_code || schedule.deduction_label}</div>
                                    <table className="bd-table" style={{ marginBottom: 8 }}>
                                      <tbody>
                                        <tr><td>Total Amount</td><td>{fmt(schedule.total_amount)}</td></tr>
                                        <tr><td>Per Installment</td><td>{fmt(schedule.installment_amount)} &times; {schedule.term_months} month{schedule.term_months > 1 ? 's' : ''}</td></tr>
                                        <tr><td>Start Period / Cycle</td><td>{schedule.start_period} / {schedule.target_cycle || 'C2'}</td></tr>
                                        <tr className="bd-subtotal"><td>Remaining Balance</td><td>{fmt(schedule.remaining_balance)}</td></tr>
                                      </tbody>
                                    </table>
                                    <div className="bd-section-title">Installments</div>
                                    <table className="bd-table">
                                      <thead><tr><th>#</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
                                      <tbody>
                                        {(schedule.installments || []).map(i => {
                                          const isCurrent = i._id?.toString() === line.schedule_ref?.installment_id?.toString();
                                          return (
                                            <tr key={i._id} style={isCurrent ? { background: '#fef3c7', fontWeight: 600 } : undefined}>
                                              <td>{i.installment_no}</td>
                                              <td>{i.period}</td>
                                              <td>{fmt(i.amount)}</td>
                                              <td>{i.status}{isCurrent ? ' ← this cycle' : ''}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td></tr>
                              )}
                            </Fragment>
                          );
                        })}
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

          {/* Reject Schedule Modal */}
          {showRejectSchedModal && (
            <div className="return-modal" onClick={() => setShowRejectSchedModal(null)}>
              <div className="return-modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px' }}>Reject Schedule</h3>
                <p style={{ fontSize: 13, color: 'var(--erp-muted)' }}>Provide a reason for rejection.</p>
                <textarea value={rejectSchedReason} onChange={e => setRejectSchedReason(e.target.value)} placeholder="Rejection reason..." />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setShowRejectSchedModal(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleRejectSchedule} disabled={!rejectSchedReason.trim()}>Reject</button>
                </div>
              </div>
            </div>
          )}

          {/* Early Payoff Modal */}
          {showPayoffModal && (
            <div className="return-modal" onClick={() => setShowPayoffModal(null)}>
              <div className="return-modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px' }}>Early Payoff</h3>
                <p style={{ fontSize: 13, color: 'var(--erp-muted)' }}>Consolidate all remaining installments into a single lump-sum deduction.</p>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Payoff Period (YYYY-MM)</label>
                <input type="month" value={payoffPeriod} onChange={e => setPayoffPeriod(e.target.value)}
                  style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13, margin: '8px 0' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setShowPayoffModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleEarlyPayoff} disabled={!payoffPeriod}>Apply Early Payoff</button>
                </div>
              </div>
            </div>
          )}

          {/* Installment Adjustment Modal */}
          {showAdjustModal && (
            <div className="correct-modal" onClick={() => setShowAdjustModal(null)}>
              <div className="correct-modal-content" onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 8px' }}>Adjust Installment</h3>
                <p style={{ fontSize: 13, color: 'var(--erp-muted)' }}>Change the deduction amount for this installment.</p>
                <input type="number" min="0" step="0.01" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} placeholder="New amount" />
                <textarea value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="Reason for adjustment..." style={{ minHeight: 60 }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline" onClick={() => setShowAdjustModal(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleAdjustInstallment} disabled={!adjustAmount || parseFloat(adjustAmount) < 0}>Save</button>
                </div>
              </div>
            </div>
          )}

          {/* Finance Create Schedule Modal */}
          {showFinCreateModal && (
            <div className="return-modal" onClick={() => setShowFinCreateModal(false)}>
              <div className="return-modal-content" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
                <h3 style={{ margin: '0 0 16px' }}>Create Deduction Schedule</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>BDM</label>
                    <select value={finSchedForm.bdm_id} onChange={e => setFinSchedForm(f => ({ ...f, bdm_id: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4 }}>
                      <option value="">Select BDM...</option>
                      {people.map(p => (
                        <option key={p.user_id?._id || p._id} value={p.user_id?._id || p._id}>{p.first_name} {p.last_name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>Deduction Type</label>
                    <select value={finSchedForm.type} onChange={e => setFinSchedForm(f => ({ ...f, type: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4 }}>
                      <option value="">Select type...</option>
                      {deductionTypes.map(d => (
                        <option key={d.code} value={d.code}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>Total Amount</label>
                    <input type="number" min="0.01" step="0.01" value={finSchedForm.amount}
                      onChange={e => setFinSchedForm(f => ({ ...f, amount: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>Term (months)</label>
                    <input type="number" min="1" step="1" value={finSchedForm.term}
                      onChange={e => setFinSchedForm(f => ({ ...f, term: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>Start Period</label>
                    <input type="month" value={finSchedForm.start}
                      onChange={e => setFinSchedForm(f => ({ ...f, start: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>Target Cycle</label>
                    <select value={finSchedForm.target_cycle} onChange={e => setFinSchedForm(f => ({ ...f, target_cycle: e.target.value }))}
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4 }}>
                      {cycleOptions.map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--erp-muted)' }}>Description</label>
                    <textarea value={finSchedForm.desc} onChange={e => setFinSchedForm(f => ({ ...f, desc: e.target.value }))}
                      placeholder="Optional description..."
                      style={{ width: '100%', padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, marginTop: 4, minHeight: 50 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-outline" onClick={() => setShowFinCreateModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleFinCreateSchedule}
                    disabled={loading || !finSchedForm.bdm_id || !finSchedForm.type || !finSchedForm.amount || parseFloat(finSchedForm.amount) <= 0 || !finSchedForm.start}>
                    Create (Active)
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
