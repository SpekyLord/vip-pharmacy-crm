import { useState, useEffect, useCallback, Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePayroll from '../hooks/usePayroll';
import { useLookupOptions } from '../hooks/useLookups';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { showError, showApprovalPending } from '../utils/errorToast';

/**
 * PayslipView — Phase G1.3 transparent layout + Phase G1.4 installments & Finance UI.
 *
 * Every deduction row carries: label + amount + kind badge (ONE-STOP /
 * INSTALLMENT N/M) + status pill + optional expandable source detail. Mirrors
 * the contractor Income.jsx / MyIncome.jsx layout so the two render identical
 * transparency contracts — a BDM who graduates to employee sees the same
 * payslip format they used as a contractor.
 *
 * Phase G1.4:
 *   - INSTALLMENT N/M badge is derived from breakdown.schedules keyed by
 *     schedule_ref.schedule_id (same pattern as Income.jsx).
 *   - Finance (admin/finance/president) gets per-line verify (✓) / correct (✎) /
 *     reject (✕) actions plus a "+ Add Deduction" button, but only while the
 *     payslip is COMPUTED or REVIEWED. After APPROVED/POSTED the page reverts
 *     to read-only — President-Reverse is the only backwards path.
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
  .line-actions { display: inline-flex; gap: 4px; margin-left: 8px; vertical-align: middle; }
  .line-actions button { border: 1px solid var(--erp-border, #e2e8f0); background: #fff; border-radius: 4px; width: 24px; height: 24px; cursor: pointer; font-size: 12px; line-height: 1; padding: 0; }
  .line-actions button:hover { background: var(--erp-accent-soft, #e8efff); }
  .line-actions button.danger:hover { background: #fee2e2; border-color: #fca5a5; }
  .psv-add-btn { display: inline-block; padding: 6px 12px; border-radius: 6px; border: 1px dashed var(--erp-accent, #1e5eff); background: #fff; color: var(--erp-accent, #1e5eff); cursor: pointer; font-size: 12px; font-weight: 600; margin-top: 10px; }
  .psv-add-btn:hover { background: var(--erp-accent-soft, #e8efff); }
  .psv-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .psv-modal { background: #fff; border-radius: 12px; padding: 20px; width: min(420px, 92vw); box-shadow: 0 12px 32px rgba(0,0,0,0.2); }
  .psv-modal h4 { margin: 0 0 12px; font-size: 15px; font-weight: 700; }
  .psv-modal label { display: block; font-size: 12px; color: var(--erp-muted); margin-top: 10px; margin-bottom: 4px; }
  .psv-modal input, .psv-modal select, .psv-modal textarea { width: 100%; border: 1px solid var(--erp-border); border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; box-sizing: border-box; }
  .psv-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .psv-modal-actions button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--erp-border); background: #fff; cursor: pointer; font-size: 13px; }
  .psv-modal-actions button.primary { background: var(--erp-accent, #1e5eff); color: #fff; border-color: var(--erp-accent, #1e5eff); }
  .psv-modal-actions button:disabled { opacity: 0.5; cursor: not-allowed; }
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
  const { user } = useAuth();
  // Lookup-driven deduction type options for the Finance Add Deduction modal.
  // EMPLOYEE_DEDUCTION_TYPE is pre-seeded per-entity (Rule #3) and editable
  // via Control Center so subscribers can extend without a code change.
  const { options: deductionTypes } = useLookupOptions('EMPLOYEE_DEDUCTION_TYPE');
  const [ps, setPs] = useState(null);
  const [loading, setLoading] = useState(true);

  // Phase G1.3 — transparent breakdown (Car Logbook for Personal Gas, etc.)
  const [breakdown, setBreakdown] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  // Phase G1.4 — Finance per-line state
  const [actionBusy, setActionBusy] = useState(null); // lineId currently being mutated
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ deduction_type: '', deduction_label: '', amount: '', description: '', finance_note: '' });
  const [showCorrect, setShowCorrect] = useState(null); // { lineId, currentAmount }
  const [correctAmount, setCorrectAmount] = useState('');
  const [correctNote, setCorrectNote] = useState('');

  const isFinance = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const canEdit = isFinance && ps && ['COMPUTED', 'REVIEWED'].includes(ps.status);

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

  // `force=true` skips the cache guard so Finance handlers can re-fetch the
  // installment timeline immediately after a SCHEDULE cascade without waiting
  // for the `setBreakdown(null)` state update to flush (stale-closure trap).
  const loadBreakdown = async (force = false) => {
    if (!force && (breakdown?.payslip_id === id || breakdownLoading)) return;
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

  // Phase G1.4 — schedule timeline breakdown auto-loads after the payslip does
  // so INSTALLMENT N/M badges and the installment expander render eagerly. The
  // Personal Gas breakdown stays lazy (only loads on first expand) because it
  // involves a CarLogbook scan; schedules are a single lean query per line.
  useEffect(() => {
    if (!ps) return;
    const hasSchedule = (ps.deduction_lines || []).some(l => l.auto_source === 'SCHEDULE');
    if (hasSchedule && !breakdown && !breakdownLoading) {
      loadBreakdown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps]);

  const toggleSection = (key) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    // Lazy-load breakdown on first expand of any expandable row
    if (!breakdown && !expandedSections[key]) {
      loadBreakdown();
    }
  };

  // ── Phase G1.4 Finance handlers ──
  // Each handler reloads the payslip + (where relevant) the breakdown so the
  // UI reflects installment state changes immediately. On error we surface the
  // backend message verbatim — closed periods, wrong status, auto-source locks.
  const handleVerifyLine = async (lineId) => {
    if (actionBusy) return;
    setActionBusy(lineId);
    try {
      const res = await api.verifyPayslipDeductionLine(id, lineId, { action: 'verify' });
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      }
      setPs(res?.data || null);
      // Schedule sync (cascade) changes installment statuses — refresh timeline.
      if ((res?.data?.deduction_lines || []).some(l => l.auto_source === 'SCHEDULE' && l._id === lineId)) {
        await loadBreakdown(true);
      }
    } catch (err) {
      if (err?.response?.data?.approval_pending) {
        showApprovalPending(err.response.data.message);
      } else {
        showError(err, 'Verify failed');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleRejectLine = async (lineId) => {
    if (actionBusy) return;
    const reason = window.prompt('Reason for rejection (shown on payslip)?', '');
    if (reason === null) return; // user cancelled
    setActionBusy(lineId);
    try {
      const res = await api.verifyPayslipDeductionLine(id, lineId, { action: 'reject', finance_note: reason });
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      }
      setPs(res?.data || null);
      await loadBreakdown(true);
    } catch (err) {
      if (err?.response?.data?.approval_pending) {
        showApprovalPending(err.response.data.message);
      } else {
        showError(err, 'Reject failed');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleRemoveLine = async (lineId) => {
    if (actionBusy) return;
    if (!window.confirm('Remove this deduction line? Auto-generated lines cannot be removed — use Reject instead.')) return;
    setActionBusy(lineId);
    try {
      const res = await api.removePayslipDeductionLine(id, lineId);
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      }
      setPs(res?.data || null);
    } catch (err) {
      if (err?.response?.data?.approval_pending) {
        showApprovalPending(err.response.data.message);
      } else {
        showError(err, 'Remove failed');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const submitCorrect = async () => {
    if (!showCorrect) return;
    const amount = Number(correctAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      showError(null, 'Enter a valid non-negative amount');
      return;
    }
    setActionBusy(showCorrect.lineId);
    try {
      const res = await api.verifyPayslipDeductionLine(id, showCorrect.lineId, {
        action: 'correct',
        amount,
        finance_note: correctNote,
      });
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      }
      setPs(res?.data || null);
      setShowCorrect(null);
      setCorrectAmount('');
      setCorrectNote('');
    } catch (err) {
      if (err?.response?.data?.approval_pending) {
        showApprovalPending(err.response.data.message);
      } else {
        showError(err, 'Correct failed');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const submitAdd = async () => {
    const { deduction_type, deduction_label, amount } = addForm;
    const amt = Number(amount);
    if (!deduction_type || !deduction_label || !Number.isFinite(amt) || amt < 0) {
      showError(null, 'Fill in type, label, and a non-negative amount');
      return;
    }
    setActionBusy('add');
    try {
      const res = await api.addPayslipDeductionLine(id, {
        deduction_type,
        deduction_label,
        amount: amt,
        description: addForm.description,
        finance_note: addForm.finance_note,
      });
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      }
      setPs(res?.data || null);
      setShowAdd(false);
      setAddForm({ deduction_type: '', deduction_label: '', amount: '', description: '', finance_note: '' });
    } catch (err) {
      if (err?.response?.data?.approval_pending) {
        showApprovalPending(err.response.data.message);
      } else {
        showError(err, 'Add failed');
      }
    } finally {
      setActionBusy(null);
    }
  };

  // Auto-fill the label when Finance picks a deduction type in the add modal.
  // Uses the lookup label snapshot (Rule #3 — label comes from the DB, not code).
  const onPickAddType = (code) => {
    const match = deductionTypes.find(d => d.code === code);
    setAddForm(prev => ({
      ...prev,
      deduction_type: code,
      deduction_label: prev.deduction_label || match?.label || code,
    }));
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
                  <tr><td colSpan={canEdit ? 3 : 2} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>No deductions</td></tr>
                )}
                {lines.map(line => {
                  const isPersonalGas = line.auto_source === 'PERSONAL_GAS';
                  const isSchedule = line.auto_source === 'SCHEDULE';
                  const isExpandable = isPersonalGas || isSchedule;
                  const scheduleKey = line.schedule_ref?.schedule_id?.toString();
                  const schedule = isSchedule && scheduleKey ? breakdown?.schedules?.[scheduleKey] : null;
                  const currentInstallment = schedule?.installments?.find(
                    i => i._id?.toString() === line.schedule_ref?.installment_id?.toString()
                  );
                  // Phase G1.4 — kind badge: INSTALLMENT N/M when the line is a
                  // DeductionSchedule installment (breakdown hydrated), ONE-STOP
                  // otherwise. Same pattern used on contractor Income.jsx so the
                  // two surfaces carry identical labels.
                  const kindBadge = isSchedule && currentInstallment
                    ? `INSTALLMENT ${currentInstallment.installment_no}/${schedule.term_months}`
                    : 'ONE-STOP';
                  const kindBadgeClass = isSchedule && currentInstallment ? 'badge-installment' : 'badge-onestop';
                  const sectionKey = isPersonalGas ? 'personalGas'
                    : isSchedule ? `sched_${line._id}`
                    : null;
                  const isZeroInfo = isPersonalGas && (line.amount || 0) === 0;
                  const canMutate = canEdit && line.status !== 'REJECTED';
                  const busy = actionBusy === line._id;
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
                        {canEdit && (
                          <td style={{ width: 140 }}>
                            {canMutate && line.status === 'PENDING' && (
                              <span className="line-actions" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => handleVerifyLine(line._id)} disabled={busy} title="Verify">&#10003;</button>
                                <button onClick={() => { setShowCorrect({ lineId: line._id, currentAmount: line.amount }); setCorrectAmount(String(line.amount)); setCorrectNote(''); }} disabled={busy} title="Correct amount">&#9998;</button>
                                <button className="danger" onClick={() => handleRejectLine(line._id)} disabled={busy} title="Reject">&#10005;</button>
                              </span>
                            )}
                            {canMutate && line.status === 'VERIFIED' && (
                              <span className="line-actions" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { setShowCorrect({ lineId: line._id, currentAmount: line.amount }); setCorrectAmount(String(line.amount)); setCorrectNote(''); }} disabled={busy} title="Correct amount">&#9998;</button>
                                <button className="danger" onClick={() => handleRejectLine(line._id)} disabled={busy} title="Reject">&#10005;</button>
                                {!line.auto_source && (
                                  <button className="danger" onClick={() => handleRemoveLine(line._id)} disabled={busy} title="Remove line">&#128465;</button>
                                )}
                              </span>
                            )}
                            {canMutate && line.status === 'CORRECTED' && (
                              <span className="line-actions" onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => handleVerifyLine(line._id)} disabled={busy} title="Re-verify">&#10003;</button>
                                <button className="danger" onClick={() => handleRejectLine(line._id)} disabled={busy} title="Reject">&#10005;</button>
                              </span>
                            )}
                          </td>
                        )}
                      </tr>

                      {isPersonalGas && expandedSections.personalGas && (
                        <tr><td colSpan={canEdit ? 3 : 2} style={{ padding: 0 }}>
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

                      {/* Phase G1.4 — Schedule installment timeline. Shows every
                          installment with its status (paid, injected, pending,
                          cancelled) so Finance and the employee can audit the
                          full plan and know what's still outstanding. */}
                      {isSchedule && expandedSections[sectionKey] && (
                        <tr><td colSpan={canEdit ? 3 : 2} style={{ padding: 0 }}>
                          <div className="bd-panel">
                            {breakdownLoading && !schedule && <div className="bd-empty">Loading schedule...</div>}
                            {!breakdownLoading && !schedule && <div className="bd-empty">Schedule detail unavailable</div>}
                            {schedule && (
                              <>
                                <div className="bd-section-title">{schedule.schedule_code || schedule.deduction_label}</div>
                                <table className="bd-table" style={{ marginBottom: 8 }}>
                                  <tbody>
                                    <tr><td>Total Amount</td><td>{fmt(schedule.total_amount)}</td></tr>
                                    <tr><td>Per Installment</td><td>{fmt(schedule.installment_amount)} &times; {schedule.term_months} month{schedule.term_months > 1 ? 's' : ''}</td></tr>
                                    <tr><td>Start Period / Cycle</td><td>{schedule.start_period} / {schedule.target_cycle || 'C2'}</td></tr>
                                    <tr className="bd-subtotal"><td>Remaining Balance</td><td>{fmt(schedule.remaining_balance)}</td></tr>
                                  </tbody>
                                </table>
                                <div className="bd-section-title">Installment Timeline</div>
                                <div className="bd-scroll">
                                  <table className="bd-table">
                                    <thead><tr><th>#</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
                                    <tbody>
                                      {schedule.installments.map(i => {
                                        const isCurrent = i._id?.toString() === line.schedule_ref?.installment_id?.toString();
                                        return (
                                          <tr key={i._id} style={isCurrent ? { background: '#fef3c7', fontWeight: 600 } : undefined}>
                                            <td>{i.installment_no}</td>
                                            <td>{i.period}</td>
                                            <td>{fmt(i.amount)}</td>
                                            <td>{i.status}{isCurrent ? ' \u2190 this payslip' : ''}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="psv-total"><td colSpan={canEdit ? 2 : 1}>Total Deductions</td><td>{fmt(ps.total_deductions)}</td></tr>
              </tbody>
            </table>
            {canEdit && (
              <button className="psv-add-btn" onClick={() => setShowAdd(true)}>
                + Add Deduction Line
              </button>
            )}
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

      {/* Phase G1.4 — Add Deduction modal. Deduction type dropdown is lookup-driven
          (EMPLOYEE_DEDUCTION_TYPE) per Rule #3. Label defaults to the lookup label
          but Finance can override so one-off descriptions still read naturally. */}
      {showAdd && (
        <div className="psv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="psv-modal" role="dialog" aria-label="Add Deduction Line">
            <h4>Add Deduction Line</h4>
            <label>Deduction Type</label>
            <select value={addForm.deduction_type} onChange={(e) => onPickAddType(e.target.value)}>
              <option value="">Select type...</option>
              {deductionTypes.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
            <label>Label</label>
            <input
              type="text"
              value={addForm.deduction_label}
              onChange={(e) => setAddForm({ ...addForm, deduction_label: e.target.value })}
              placeholder="Shown on the payslip row"
            />
            <label>Amount (\u20B1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={addForm.amount}
              onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
            />
            <label>Description</label>
            <textarea
              rows={2}
              value={addForm.description}
              onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
              placeholder="Explain the deduction for the employee"
            />
            <label>Finance Note (internal)</label>
            <textarea
              rows={2}
              value={addForm.finance_note}
              onChange={(e) => setAddForm({ ...addForm, finance_note: e.target.value })}
              placeholder="Why Finance added this line"
            />
            <div className="psv-modal-actions">
              <button onClick={() => setShowAdd(false)} disabled={actionBusy === 'add'}>Cancel</button>
              <button className="primary" onClick={submitAdd} disabled={actionBusy === 'add'}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Phase G1.4 — Correct Amount modal. original_amount is preserved server-side
          and rendered strikethrough on the line so the audit trail is visible. */}
      {showCorrect && (
        <div className="psv-modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowCorrect(null)}>
          <div className="psv-modal" role="dialog" aria-label="Correct Deduction Amount">
            <h4>Correct Deduction Amount</h4>
            <label>New Amount (\u20B1)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={correctAmount}
              onChange={(e) => setCorrectAmount(e.target.value)}
              autoFocus
            />
            <label>Finance Note (shown to employee)</label>
            <textarea
              rows={3}
              value={correctNote}
              onChange={(e) => setCorrectNote(e.target.value)}
              placeholder="e.g. adjusted per HR memo 2026-04-18"
            />
            <div className="psv-modal-actions">
              <button onClick={() => setShowCorrect(null)} disabled={!!actionBusy}>Cancel</button>
              <button className="primary" onClick={submitCorrect} disabled={!!actionBusy}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
