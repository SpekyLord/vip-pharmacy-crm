/**
 * IncentivePayoutLedger — Phase SG-Q2 Week 2
 *
 * Lifecycle ledger for SalesGoal-driven incentive payouts. Rows are created
 * automatically by computeBdmSnapshot → accrueIncentive (no public create
 * endpoint — only lifecycle transitions live here).
 *
 * Columns: BDM, period, tier, budget, attainment %, status, journal refs.
 * Actions per row (gated by sub-perms + gateApproval → HTTP 202 handled):
 *   Approve  — ACCRUED → APPROVED (no JE)
 *   Pay      — ACCRUED/APPROVED → PAID (settlement JE posts)
 *   Reverse  — any → REVERSED (SAP-Storno reversal JE posts)
 *
 * Filters: BDM, period (YYYY-MM), status, fiscal year. BDMs (non-privileged)
 * automatically see only their own rows (backend enforces bdm_id=req.user._id).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSalesGoals from '../hooks/useSalesGoals';
import useErpSubAccess from '../hooks/useErpSubAccess';
import { useLookupOptions } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import RejectionBanner from '../components/RejectionBanner';
import { showError, showSuccess, showApprovalPending, isApprovalPending } from '../utils/errorToast';

const php = (n) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const STATUS_BADGE = {
  ACCRUED: { bg: '#dbeafe', color: '#1e40af', label: 'Accrued' },
  APPROVED: { bg: '#fef3c7', color: '#92400e', label: 'Approved' },
  PAID: { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  REVERSED: { bg: '#fee2e2', color: '#991b1b', label: 'Reversed' },
};

const pageStyles = `
  .ipl-main { flex: 1; min-width: 0; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .ipl-header { margin-bottom: 20px; }
  .ipl-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .ipl-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .ipl-summary-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .ipl-summary-card { flex: 1; min-width: 160px; padding: 14px 18px; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 12px; }
  .ipl-summary-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--erp-muted); letter-spacing: 0.02em; }
  .ipl-summary-value { font-size: 20px; font-weight: 700; color: var(--erp-text); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .ipl-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 18px; margin-bottom: 16px; overflow-x: auto; }
  .ipl-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .ipl-filters input, .ipl-filters select { padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); min-width: 140px; }
  .ipl-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ipl-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; white-space: nowrap; color: var(--erp-text); }
  .ipl-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); white-space: nowrap; vertical-align: middle; }
  .ipl-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ipl-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
  .ipl-btn { padding: 5px 10px; border: 1px solid var(--erp-border); background: var(--erp-panel); color: var(--erp-text); font-size: 12px; border-radius: 6px; cursor: pointer; }
  .ipl-btn-primary { background: var(--erp-accent, #2563eb); color: white; border-color: var(--erp-accent, #2563eb); }
  .ipl-btn-success { background: #16a34a; color: white; border-color: #16a34a; }
  .ipl-btn-danger  { background: #dc2626; color: white; border-color: #dc2626; }
  .ipl-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
  .ipl-btn + .ipl-btn { margin-left: 6px; }
  .ipl-empty { text-align: center; padding: 40px; color: var(--erp-muted); }
  .ipl-muted-link { color: var(--erp-accent, #2563eb); font-size: 11px; text-decoration: none; }
  .ipl-muted-link:hover { text-decoration: underline; }
  @media(max-width: 768px) { .ipl-main { padding: 12px; } .ipl-filters { flex-direction: column; } .ipl-filters input, .ipl-filters select { min-width: 0; width: 100%; } }
  /* Phase SG-Q2 W3 — full 360px phone breakpoint */
  @media(max-width: 360px) {
    .ipl-main { padding: 8px; }
    .ipl-header h1 { font-size: 18px; }
    .ipl-summary-row { flex-direction: column; gap: 8px; }
    .ipl-summary-card { min-width: 0; padding: 10px 12px; }
    .ipl-summary-value { font-size: 17px; }
    .ipl-panel { padding: 12px; overflow-x: auto; }
    .ipl-table th, .ipl-table td { padding: 6px 4px; font-size: 11px; }
    .ipl-btn { padding: 6px 8px; font-size: 11px; }
    .ipl-btn + .ipl-btn { margin-left: 4px; margin-top: 4px; }
  }
`;

export default function IncentivePayoutLedger() {
  const { user } = useAuth();
  const sg = useSalesGoals();
  const { hasSubPermission } = useErpSubAccess();
  const { options: paymentModeOpts } = useLookupOptions('PAYMENT_MODE');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(null); // payout._id currently being acted on

  const thisYear = new Date().getFullYear();
  const [filters, setFilters] = useState({
    fiscal_year: String(thisYear),
    status: '',
    period: '',
    bdm_id: '',
  });

  // Role + sub-perm derived action caps. President always bypasses; the
  // backend will still HTTP-202 non-authorized approve/pay/reverse through
  // gateApproval so buttons are always "safe to click", but we hide the
  // ones a user has no chance of executing directly.
  const isPresident = user?.role === 'president';
  const isFinanceOrAdmin = ['admin', 'finance'].includes(user?.role);
  const canApprove = isPresident || isFinanceOrAdmin || hasSubPermission('sales_goals', 'payout_approve');
  const canPay = isPresident || isFinanceOrAdmin || hasSubPermission('sales_goals', 'payout_pay');
  const canReverse = isPresident || hasSubPermission('sales_goals', 'payout_reverse');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.fiscal_year) params.fiscal_year = filters.fiscal_year;
      if (filters.status) params.status = filters.status;
      if (filters.period) params.period = filters.period;
      if (filters.bdm_id) params.bdm_id = filters.bdm_id;
      // useErpApi unwraps to the HTTP body, so res is { success, data: [...], summary: {...} }.
      // Backend `summary` is not persisted in state — `statusTotals` below recomputes it from
      // `rows` with the exact same math, so keeping the server copy would be dead weight.
      const res = await sg.getPayouts(params);
      const data = res?.data || [];
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err, 'Failed to load payout ledger');
      setRows([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.fiscal_year, filters.status, filters.period, filters.bdm_id]);

  useEffect(() => { load(); }, [load]);

  const doApprove = async (row) => {
    if (!canApprove && !isPresident) return;
    if (!window.confirm(`Approve incentive payout for ${row.person_id?.full_name || row.bdm_id?.name || 'BDM'} — ${php(row.tier_budget)} (${row.tier_label || row.tier_code})?`)) return;
    setWorking(row._id);
    try {
      const res = await sg.approvePayout(row._id);
      if (isApprovalPending(res)) {
        showApprovalPending(res?.message || 'Approval request sent — awaiting authority.');
      } else {
        showSuccess('Payout approved');
        await load();
      }
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('Approval request sent — awaiting authority.');
      else showError(err, 'Failed to approve payout');
    } finally {
      setWorking(null);
    }
  };

  const doPay = async (row) => {
    if (!canPay && !isPresident) return;
    const paidVia = window.prompt(
      `Pay incentive payout ${php(row.tier_budget)} to ${row.person_id?.full_name || row.bdm_id?.name || 'BDM'}.\n\n`
      + `Enter payment mode code (leave blank for cash-on-hand fallback):\n`
      + (paymentModeOpts?.length ? `Available: ${paymentModeOpts.map(o => o.code || o.value).filter(Boolean).join(', ')}` : ''),
      ''
    );
    if (paidVia === null) return;
    setWorking(row._id);
    try {
      const res = await sg.payPayout(row._id, { paid_via: (paidVia || '').trim() });
      if (isApprovalPending(res)) {
        showApprovalPending(res?.message || 'Payment request sent — awaiting authority.');
      } else {
        showSuccess('Payout paid — settlement journal posted');
        await load();
      }
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('Payment request sent — awaiting authority.');
      else showError(err, 'Failed to pay payout');
    } finally {
      setWorking(null);
    }
  };

  const doReverse = async (row) => {
    if (!canReverse && !isPresident) return;
    const reason = window.prompt('Reason for reversal (required — audit log):', '');
    if (!reason || !reason.trim()) return;
    setWorking(row._id);
    try {
      const res = await sg.reversePayout(row._id, { reason: reason.trim() });
      if (isApprovalPending(res)) {
        showApprovalPending(res?.message || 'Reversal request sent — awaiting authority.');
      } else {
        showSuccess('Payout reversed — storno journal posted');
        await load();
      }
    } catch (err) {
      if (isApprovalPending(null, err)) showApprovalPending('Reversal request sent — awaiting authority.');
      else showError(err, 'Failed to reverse payout');
    } finally {
      setWorking(null);
    }
  };

  const statusTotals = useMemo(() => {
    const totals = { accrued: 0, approved: 0, paid: 0, reversed: 0, total: 0, count: rows.length };
    for (const r of rows) {
      const amt = Number(r.tier_budget) || 0;
      totals.total += amt;
      const key = (r.status || 'ACCRUED').toLowerCase();
      totals[key] = (totals[key] || 0) + amt;
    }
    return totals;
  }, [rows]);

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main className="ipl-main">
          <div className="ipl-header">
            <h1>Incentive Payout Ledger</h1>
            <p>Accrue → Approve → Pay → Reverse. Every state change posts or reverses a journal entry and writes an audit log.</p>
          </div>

          <WorkflowGuide pageKey="incentivePayoutLedger" />

          <div className="ipl-summary-row">
            <div className="ipl-summary-card">
              <div className="ipl-summary-label">Total Rows</div>
              <div className="ipl-summary-value">{statusTotals.count}</div>
            </div>
            <div className="ipl-summary-card" style={{ background: '#eff6ff' }}>
              <div className="ipl-summary-label">Accrued</div>
              <div className="ipl-summary-value">{php(statusTotals.accrued)}</div>
            </div>
            <div className="ipl-summary-card" style={{ background: '#fef3c7' }}>
              <div className="ipl-summary-label">Approved</div>
              <div className="ipl-summary-value">{php(statusTotals.approved)}</div>
            </div>
            <div className="ipl-summary-card" style={{ background: '#dcfce7' }}>
              <div className="ipl-summary-label">Paid (YTD)</div>
              <div className="ipl-summary-value">{php(statusTotals.paid)}</div>
            </div>
            <div className="ipl-summary-card" style={{ background: '#fee2e2' }}>
              <div className="ipl-summary-label">Reversed</div>
              <div className="ipl-summary-value">{php(statusTotals.reversed)}</div>
            </div>
          </div>

          <div className="ipl-panel">
            <div className="ipl-filters">
              <select value={filters.fiscal_year} onChange={e => setFilters(f => ({ ...f, fiscal_year: e.target.value }))}>
                <option value="">All fiscal years</option>
                {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map(y => (
                  <option key={y} value={y}>FY {y}</option>
                ))}
              </select>
              <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
                <option value="">All statuses</option>
                <option value="ACCRUED">Accrued</option>
                <option value="APPROVED">Approved</option>
                <option value="PAID">Paid</option>
                <option value="REVERSED">Reversed</option>
              </select>
              <input
                type="text"
                placeholder="Period (YYYY-MM or year)"
                value={filters.period}
                onChange={e => setFilters(f => ({ ...f, period: e.target.value }))}
              />
              <input
                type="text"
                placeholder="BDM user id (optional)"
                value={filters.bdm_id}
                onChange={e => setFilters(f => ({ ...f, bdm_id: e.target.value }))}
              />
              <button className="ipl-btn" onClick={load} disabled={loading}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>

            {loading ? (
              <div className="ipl-empty">Loading payout ledger…</div>
            ) : rows.length === 0 ? (
              <div className="ipl-empty">
                No payouts match these filters. Run KPI Snapshots from the{' '}
                <Link to="/erp/sales-goals" className="ipl-muted-link">Goal Dashboard</Link>{' '}
                to trigger accruals for qualified BDMs.
              </div>
            ) : (
              <table className="ipl-table">
                <thead>
                  <tr>
                    <th>BDM</th>
                    <th>Plan</th>
                    <th>Period</th>
                    <th>Tier</th>
                    <th className="num">Budget</th>
                    <th className="num">Attainment</th>
                    <th>Status</th>
                    <th>Accrual JE</th>
                    <th>Settlement JE</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.ACCRUED;
                    const acting = working === r._id;
                    const showApprove = r.status === 'ACCRUED';
                    const showPay = ['ACCRUED', 'APPROVED'].includes(r.status);
                    const showReverse = r.status !== 'REVERSED' && r.journal_id;
                    return (
                      <tr key={r._id}>
                        <td>
                          {r.person_id?.full_name || r.bdm_id?.name || '—'}
                          {r.person_id?.bdm_code ? <span style={{ color: 'var(--erp-muted)', fontSize: 11 }}> ({r.person_id.bdm_code})</span> : null}
                        </td>
                        <td>{r.plan_id?.reference || r.plan_id?.plan_name || '—'}</td>
                        <td>{r.period}</td>
                        <td>
                          {r.tier_label || r.tier_code}
                          {Number(r.uncapped_budget) > Number(r.tier_budget)
                            ? <span title={`Uncapped: ${php(r.uncapped_budget)} — reduced by CompProfile cap`} style={{ color: 'var(--erp-muted)', fontSize: 10, marginLeft: 4 }}>⚠ capped</span>
                            : null}
                        </td>
                        <td className="num">{php(r.tier_budget)}</td>
                        <td className="num">{(Number(r.attainment_pct) || 0).toFixed(1)}%</td>
                        <td>
                          <span className="ipl-badge" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                          <div style={{ marginTop: 4 }}>
                            <RejectionBanner row={r} moduleKey="INCENTIVE_PAYOUT" variant="row" />
                          </div>
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {r.journal_id
                            ? <>{r.journal_id.je_number || r.journal_number}<br /><span style={{ color: 'var(--erp-muted)' }}>{fmtDate(r.journal_id.je_date)}</span></>
                            : <span style={{ color: 'var(--erp-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {r.settlement_journal_id
                            ? <>{r.settlement_journal_id.je_number}<br /><span style={{ color: 'var(--erp-muted)' }}>{fmtDate(r.settlement_journal_id.je_date)}</span></>
                            : r.reversal_journal_id
                              ? <>{r.reversal_journal_id.je_number} <span style={{ color: '#991b1b' }}>(reversal)</span></>
                              : <span style={{ color: 'var(--erp-muted)' }}>—</span>}
                        </td>
                        <td>
                          {showApprove && canApprove ? (
                            <button className="ipl-btn ipl-btn-primary" disabled={acting} onClick={() => doApprove(r)}>Approve</button>
                          ) : null}
                          {showPay && canPay ? (
                            <button className="ipl-btn ipl-btn-success" disabled={acting} onClick={() => doPay(r)}>Pay</button>
                          ) : null}
                          {showReverse && canReverse ? (
                            <button className="ipl-btn ipl-btn-danger" disabled={acting} onClick={() => doReverse(r)}>Reverse</button>
                          ) : null}
                          {!showApprove && !showPay && !showReverse ? <span style={{ color: 'var(--erp-muted)', fontSize: 12 }}>—</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
