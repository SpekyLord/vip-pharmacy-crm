/**
 * Bir1702DetailPage — Phase VIP-1.J / J7 (May 2026).
 *
 * BIR Form 1702 (Corporation / OPC / Partnership) annual income tax return
 * detail page. Renders one box per BIR field with a Copy button so the
 * bookkeeper can paste each total into eBIRForms 7.x. The CWT credit
 * section reads from J6's compute1702CwtRollup. Manual fields (1702-Q
 * paid YTD, foreign tax credit, prior-year overpayment) are admin-supplied
 * via the Manual Credits panel and persisted into BirFilingStatus.totals
 * _snapshot via PATCH /api/erp/bir/forms/1702/:year/manual.
 *
 * Routes:
 *   /erp/bir/1702/:year     — annual 1702 (CORP/OPC/PARTNERSHIP)
 *   /erp/bir/1701/:year     — annual 1701 (SOLE_PROP) — same shape, stub
 *                              if entity isn't sole-prop.
 *
 * Backend: birController.compute1702 / compute1701 / update1702Manual /
 *          mark1702Filed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, RefreshCw, Loader, Calculator,
  Copy, Check, Save, FileCheck2, AlertTriangle, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import birService from '../../erp/services/birService';

const STATUS_META = {
  DATA_INCOMPLETE: { label: 'Data Incomplete', bg: '#fef2f2', fg: '#991b1b' },
  DRAFT:           { label: 'Draft',            bg: '#fef9c3', fg: '#854d0e' },
  REVIEWED:        { label: 'Reviewed',         bg: '#dbeafe', fg: '#1e40af' },
  FILED:           { label: 'Filed',            bg: '#e0e7ff', fg: '#3730a3' },
  CONFIRMED:       { label: 'Confirmed',        bg: '#dcfce7', fg: '#15803d' },
};

function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

const styles = `
  .it-layout { min-height: 100vh; background: #f3f4f6; }
  .it-content { display: flex; }
  .it-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .it-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .it-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .it-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .it-h1 { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
  .it-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .it-box-grid { display: grid; gap: 0.7rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .it-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; background: #f9fafb; display: flex; flex-direction: column; gap: 0.3rem; }
  .it-box-label { font-size: 0.74rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .it-box-value { font-size: 1.1rem; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; }
  .it-box-value-emph { color: #2563eb; font-size: 1.25rem; }
  .it-box-meta { font-size: 0.72rem; color: #6b7280; }
  .it-box-warn { border-color: #fecaca; background: #fef2f2; }
  .it-box-warn .it-box-value { color: #b91c1c; }
  .it-box-good { border-color: #bbf7d0; background: #f0fdf4; }
  .it-box-good .it-box-value { color: #15803d; }
  .it-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .12s; background: transparent; }
  .it-btn-primary { background: #2563eb; color: #fff; }
  .it-btn-primary:hover { filter: brightness(0.92); }
  .it-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .it-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .it-btn-secondary:hover { background: #f9fafb; }
  .it-input { padding: 0.45rem 0.6rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.85rem; width: 100%; box-sizing: border-box; }
  .it-form-cell { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
  .it-form-label { font-size: 0.78rem; color: #4b5563; font-weight: 600; }
  .it-form-help { font-size: 0.72rem; color: #6b7280; }
  .it-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 0.5rem; }
  .it-table th, .it-table td { padding: 0.45rem 0.6rem; text-align: left; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .it-table th { font-size: 0.72rem; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; background: #f9fafb; }
  .it-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .it-copy-btn { background: transparent; border: 1px solid #e5e7eb; border-radius: 4px; padding: 0.25rem 0.4rem; cursor: pointer; color: #6b7280; }
  .it-copy-btn:hover { background: #fff; color: #2563eb; border-color: #2563eb; }
  .it-banner { padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.85rem; display: flex; gap: 0.5rem; align-items: flex-start; margin-bottom: 0.75rem; }
  .it-banner-warn { background: #fef9c3; color: #854d0e; border: 1px solid #fde68a; }
  .it-banner-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .it-banner-info { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
`;

function Box({ label, value, meta, emph = false, warn = false, good = false, copyText = null, fmt = fmtMoney, prefix = '₱' }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (copyText === null) return;
    navigator.clipboard?.writeText(String(copyText)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className={`it-box ${warn ? 'it-box-warn' : ''} ${good ? 'it-box-good' : ''}`}>
      <span className="it-box-label">{label}</span>
      <div className={`it-box-value ${emph ? 'it-box-value-emph' : ''}`}>
        <span>{prefix}{fmt(value)}</span>
        {copyText !== null && (
          <button className="it-copy-btn" onClick={onCopy} title="Copy">
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}
      </div>
      {meta && <span className="it-box-meta">{meta}</span>}
    </div>
  );
}

export default function Bir1702DetailPage({ formCodeOverride }) {
  const { year: yearParam } = useParams();
  const navigate = useNavigate();
  const year = parseInt(yearParam, 10) || new Date().getFullYear();
  const formCode = formCodeOverride === '1701' ? '1701' : '1702';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [manualDraft, setManualDraft] = useState({
    quarterly_paid_ytd_php: 0,
    foreign_tax_credit_php: 0,
    prior_year_overpayment_php: 0,
    other_credits_php: 0,
    manual_cwt_override: 0,
  });
  const [savingManual, setSavingManual] = useState(false);
  const [filing, setFiling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = formCode === '1701'
        ? await birService.compute1701(year)
        : await birService.compute1702(year);
      setData(result);
      // Hydrate the manual draft from filing_row.totals_snapshot
      const snap = result?.filing_row?.totals_snapshot || {};
      setManualDraft({
        quarterly_paid_ytd_php: Number(snap.quarterly_paid_ytd_php || 0),
        foreign_tax_credit_php: Number(snap.foreign_tax_credit_php || 0),
        prior_year_overpayment_php: Number(snap.prior_year_overpayment_php || 0),
        other_credits_php: Number(snap.other_credits_php || 0),
        manual_cwt_override: Number(snap.manual_cwt_override || 0),
      });
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'USE_1701') {
        toast.error('This entity is sole-proprietorship — redirecting to 1701.');
        navigate(`/erp/bir/1701/${year}`);
        return;
      }
      toast.error(err?.response?.data?.message || `Failed to load ${formCode} ${year}.`);
    } finally {
      setLoading(false);
    }
  }, [year, formCode, navigate]);

  useEffect(() => { load(); }, [load]);

  const onSaveManual = async () => {
    setSavingManual(true);
    try {
      await birService.update1702Manual(year, { manual: manualDraft }, formCode);
      toast.success('Manual credits saved. Recomputing…');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save manual credits.');
    } finally {
      setSavingManual(false);
    }
  };

  const onMarkFiled = async () => {
    const ref = window.prompt('Enter the BIR eBIRForms reference number for this filing:');
    if (ref === null) return;
    if (!ref.trim()) {
      toast.error('Reference number required.');
      return;
    }
    setFiling(true);
    try {
      await birService.mark1702Filed(year, { bir_reference_number: ref.trim() }, formCode);
      toast.success(`${formCode} ${year} marked FILED. 2307-IN annual closure stamped.`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark filed.');
    } finally {
      setFiling(false);
    }
  };

  const boxes = data?.boxes || {};
  const integrity = data?.integrity || { is_balanced: true, abnormal_count: 0, other_lines_count: 0 };
  const filingRow = data?.filing_row;
  const lifecycleStatus = filingRow?.status || 'DRAFT';
  const statusMeta = STATUS_META[lifecycleStatus] || STATUS_META.DRAFT;

  const stub = data?.stub;

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, []);

  return (
    <div className="it-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="it-content">
        <Sidebar />
        <main className="it-main">
          <div className="it-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div className="it-row">
              <button className="it-btn it-btn-secondary" onClick={() => navigate('/erp/bir')}>
                <ArrowLeft size={14} /> BIR Compliance
              </button>
              <h1 className="it-h1">
                <ShieldCheck size={22} color="#2563eb" />
                {formCode === '1701'
                  ? `BIR 1701 — Annual Income Tax (Sole Prop) — ${year}`
                  : `BIR 1702 — Annual Income Tax (Corp) — ${year}`}
              </h1>
            </div>
            <div className="it-row">
              <select
                className="it-input"
                style={{ width: 'auto' }}
                value={year}
                onChange={(e) => navigate(`/erp/bir/${formCode}/${e.target.value}`)}
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="it-pill" style={{ background: statusMeta.bg, color: statusMeta.fg }}>
                {statusMeta.label}
              </span>
              <button className="it-btn it-btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
            </div>
          </div>

          <PageGuide pageKey="bir-1702" />

          {loading && <div className="it-card"><Loader size={16} /> Computing…</div>}

          {!loading && stub && (
            <div className="it-banner it-banner-warn">
              <AlertTriangle size={18} />
              <div>
                <strong>1701 stub:</strong> {data.reason}
              </div>
            </div>
          )}

          {!loading && data && !stub && (
            <>
              {!integrity.is_balanced && (
                <div className="it-banner it-banner-error">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Trial balance does NOT balance.</strong> Total Debit ₱{fmtMoney(integrity.total_debit)} ≠
                    {' '}Total Credit ₱{fmtMoney(integrity.total_credit)}. Investigate before filing — every JE is balanced individually so a sum mismatch indicates corrupted aggregation or a stale-period leak.
                  </div>
                </div>
              )}
              {integrity.abnormal_count > 0 && (
                <div className="it-banner it-banner-warn">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{integrity.abnormal_count} account(s) have ABNORMAL balance.</strong> Review the schedules below — revenue with net debit / expense with net credit usually means a misposted reversal or contra-account.
                  </div>
                </div>
              )}
              {integrity.other_lines_count > 0 && (
                <div className="it-banner it-banner-warn">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>{integrity.other_lines_count} balance-sheet line(s)</strong> were tagged BIR/BOTH and surfaced in the income tax aggregation. These should normally be tagged INTERNAL — review under Mis-tagged Lines below.
                  </div>
                </div>
              )}

              {/* Entity card */}
              <div className="it-card">
                <div className="it-h2"><FileCheck2 size={16} /> Filing entity</div>
                <div className="it-box-grid">
                  <Box label="Entity" value={data.entity?.entity_name || '—'} fmt={x => x} prefix="" />
                  <Box label="TIN" value={data.entity?.tin || '— missing —'} fmt={x => x} prefix="" />
                  <Box label="RDO Code" value={data.entity?.rdo_code || '— missing —'} fmt={x => x} prefix="" />
                  <Box label="Tax Type" value={data.entity?.tax_type || '—'} fmt={x => x} prefix="" />
                  <Box label="Business Style" value={data.entity?.business_style || '—'} fmt={x => x} prefix="" />
                  <Box label="Total Assets (PHP, ex-land)" value={data.entity?.total_assets_php || 0} meta={data.entity?.total_assets_php ? null : 'Set in Tax Config to qualify for SME rate'} />
                </div>
              </div>

              {/* Computation core */}
              {formCode === '1702' && (
                <div className="it-card">
                  <div className="it-h2"><Calculator size={16} /> Tax Computation — {data.rates_used?.applied_rate_basis} ({fmtMoney(data.rates_used?.applied_rate * 100)}%)</div>
                  <div className="it-box-grid">
                    <Box label="13. Gross Sales / Revenue"      value={boxes.gross_sales}              copyText={boxes.gross_sales} />
                    <Box label="14. Less: Cost of Sales"         value={boxes.cost_of_sales}            copyText={boxes.cost_of_sales} />
                    <Box label="15. Gross Income"                value={boxes.gross_income}             copyText={boxes.gross_income} emph />
                    <Box label="16. Operating Expenses"          value={boxes.total_opex}               copyText={boxes.total_opex} />
                    <Box label="17. Non-Operating Expenses"      value={boxes.total_non_opex}           copyText={boxes.total_non_opex} />
                    <Box label="18. BIR-Only Deductions"         value={boxes.total_bir_only_deductions} copyText={boxes.total_bir_only_deductions} />
                    <Box label="19. Total Allowable Deductions"  value={boxes.allowable_deductions}     copyText={boxes.allowable_deductions} emph />
                    <Box label="20. Net Taxable Income"          value={boxes.net_taxable_income}       copyText={boxes.net_taxable_income} emph />
                    <Box label={`21. RCIT @ ${fmtMoney(boxes.rcit_rate_pct)}%`}              value={boxes.rcit_tax_due} copyText={boxes.rcit_tax_due} />
                    <Box label={`22. MCIT @ ${fmtMoney(boxes.mcit_rate_pct)}%`}              value={boxes.mcit_amount} meta={boxes.mcit_basis} copyText={boxes.mcit_amount} />
                    <Box label="23. Income Tax Due (higher of)"  value={boxes.tax_due}                  copyText={boxes.tax_due} emph warn={boxes.tax_due > 0} />
                  </div>
                </div>
              )}

              {formCode === '1701' && (
                <div className="it-card">
                  <div className="it-h2"><Calculator size={16} /> Tax Computation — {data.election?.basis} (rate {fmtMoney((data.rates_used?.applied_rate || 0) * 100)}%)</div>
                  <div className="it-box-grid">
                    <Box label="Gross Sales / Receipts"          value={boxes.gross_sales}              copyText={boxes.gross_sales} />
                    <Box label="Less: Cost of Sales"             value={boxes.cost_of_sales}            copyText={boxes.cost_of_sales} />
                    <Box label="Gross Income"                    value={boxes.gross_income}             copyText={boxes.gross_income} emph />
                    <Box label="Total Allowable Deductions"      value={boxes.allowable_deductions}     copyText={boxes.allowable_deductions} />
                    <Box label="Net Taxable Income"              value={boxes.net_taxable_income}       copyText={boxes.net_taxable_income} emph />
                    <Box label="Tax Due"                         value={boxes.tax_due}                  copyText={boxes.tax_due} emph warn={boxes.tax_due > 0} />
                  </div>
                </div>
              )}

              {/* Tax Credits */}
              <div className="it-card">
                <div className="it-h2"><FileCheck2 size={16} /> Tax Credits</div>
                <div className="it-box-grid">
                  <Box label={`${formCode === '1702' ? '24' : ''}. Creditable Tax Withheld (J6 rollup)`}
                       value={boxes.cwt_credit}
                       meta={`From RECEIVED 2307s tagged ${year}. ${manualDraft.manual_cwt_override > 0 ? '(MANUAL OVERRIDE active)' : ''}`}
                       copyText={boxes.cwt_credit} good={boxes.cwt_credit > 0} />
                  <Box label="Quarterly Income Tax Paid YTD (1702-Q)" value={boxes.quarterly_paid_ytd} copyText={boxes.quarterly_paid_ytd} />
                  <Box label="Foreign Tax Credit"               value={boxes.foreign_tax_credit} copyText={boxes.foreign_tax_credit} />
                  <Box label="Prior Year Overpayment Applied"   value={boxes.prior_year_overpayment} copyText={boxes.prior_year_overpayment} />
                  <Box label="Other Credits"                    value={boxes.other_credits} copyText={boxes.other_credits} />
                  <Box label="Total Credits"                    value={boxes.total_credits} copyText={boxes.total_credits} emph />
                  <Box label={`${formCode === '1702' ? '30' : ''}. Net Tax Payable / (Refund)`}
                       value={boxes.net_payable} copyText={boxes.net_payable} emph
                       warn={boxes.net_payable > 0} good={boxes.net_payable < 0} />
                </div>

                {boxes.cwt_pending_exposure > 0 && (
                  <div className="it-banner it-banner-warn" style={{ marginTop: '0.75rem' }}>
                    <AlertTriangle size={18} />
                    <div>
                      <strong>₱{fmtMoney(boxes.cwt_pending_exposure)} of CWT credit at risk.</strong> Pending 2307s — chase the hospitals before April 15 or the credit is forfeit.{' '}
                      <button className="it-btn it-btn-secondary" style={{ marginLeft: 8 }} onClick={() => navigate(`/erp/bir/2307-IN/${year}`)}>
                        Reconcile 2307-IN →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Manual credits panel */}
              <div className="it-card">
                <div className="it-h2"><Save size={16} /> Manual Credits (admin-supplied)</div>
                <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  Stored on BirFilingStatus.totals_snapshot. Recompute fires automatically on save. Set <em>Manual CWT Override</em> to 0 to use the J6 auto-rollup (recommended).
                </p>
                <div className="it-box-grid">
                  <ManualField label="Quarterly Income Tax Paid YTD (1702-Q sum)" value={manualDraft.quarterly_paid_ytd_php} onChange={v => setManualDraft({ ...manualDraft, quarterly_paid_ytd_php: v })} help="Sum of all 1702-Q payments for the year." />
                  <ManualField label="Foreign Tax Credit" value={manualDraft.foreign_tax_credit_php} onChange={v => setManualDraft({ ...manualDraft, foreign_tax_credit_php: v })} help="Tax paid to a foreign jurisdiction (RA 8424 §34(C))." />
                  <ManualField label="Prior Year Overpayment Applied" value={manualDraft.prior_year_overpayment_php} onChange={v => setManualDraft({ ...manualDraft, prior_year_overpayment_php: v })} help="Carry-forward from previous 1702 overpayment elected as carry-over." />
                  <ManualField label="Other Credits" value={manualDraft.other_credits_php} onChange={v => setManualDraft({ ...manualDraft, other_credits_php: v })} help="BMBE / NOLCO / other special credits with documentation." />
                  <ManualField label="Manual CWT Override (₱) — leave 0 to use auto" value={manualDraft.manual_cwt_override} onChange={v => setManualDraft({ ...manualDraft, manual_cwt_override: v })} help="Use only when a 2307 cert is verified outside the J6 reconciliation flow." />
                </div>
                <div className="it-row" style={{ marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="it-btn it-btn-primary" onClick={onSaveManual} disabled={savingManual || lifecycleStatus === 'CONFIRMED'}>
                    <Save size={14} /> {savingManual ? 'Saving…' : 'Save Manual Credits'}
                  </button>
                </div>
              </div>

              {/* CWT quarterly breakdown */}
              {data.cwt_rollup && (
                <div className="it-card">
                  <div className="it-h2"><FileCheck2 size={16} /> CWT Credit — Per-Quarter Breakdown (J6)</div>
                  <table className="it-table">
                    <thead>
                      <tr>
                        <th>Quarter</th>
                        <th className="num">CWT Credited</th>
                        <th className="num">CR Amount</th>
                        <th className="num">Cert Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
                        const breakdown = data.cwt_rollup.quarter_breakdown || {};
                        const lines = (data.cwt_rollup.by_atc || []).filter(l => l.quarter === q);
                        const cwt = breakdown[q] || 0;
                        const cr = lines.reduce((s, l) => s + (l.cr_amount || 0), 0);
                        const count = lines.reduce((s, l) => s + (l.count || 0), 0);
                        return (
                          <tr key={q}>
                            <td>{q}</td>
                            <td className="num">₱{fmtMoney(cwt)}</td>
                            <td className="num">₱{fmtMoney(cr)}</td>
                            <td className="num">{count}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ fontWeight: 700, background: '#f9fafb' }}>
                        <td>Total</td>
                        <td className="num">₱{fmtMoney(data.cwt_rollup.cwt_credit_for_1702)}</td>
                        <td className="num">—</td>
                        <td className="num">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Schedules */}
              {data.schedules && (
                <div className="it-card">
                  <div className="it-h2"><Info size={16} /> Schedules — Revenue / COGS / OPEX</div>
                  {[
                    { key: 'revenue_lines', label: 'Revenue (4000-4999)' },
                    { key: 'cost_of_sales_lines', label: 'Cost of Sales (5000-5999)' },
                    { key: 'opex_lines', label: 'Operating Expenses (6000-6999)' },
                    { key: 'non_opex_lines', label: 'Non-Operating Expenses (7000-7999)' },
                    { key: 'bir_only_lines', label: 'BIR-Only Deductions (8000-8999)' },
                  ].map(s => {
                    const lines = data.schedules[s.key] || [];
                    if (lines.length === 0) return null;
                    return (
                      <details key={s.key} style={{ marginBottom: '0.5rem' }}>
                        <summary style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: '0.4rem 0' }}>
                          {s.label} — {lines.length} account(s) — ₱{fmtMoney(lines.reduce((sum, l) => sum + (l.amount || 0), 0))}
                        </summary>
                        <table className="it-table">
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Account</th>
                              <th className="num">Debit</th>
                              <th className="num">Credit</th>
                              <th className="num">Net</th>
                              <th>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map(l => (
                              <tr key={l.account_code} style={l.abnormal ? { background: '#fef2f2' } : {}}>
                                <td>{l.account_code}</td>
                                <td>{l.account_name}{l.abnormal && ' ⚠ ABNORMAL'}</td>
                                <td className="num">₱{fmtMoney(l.total_debit)}</td>
                                <td className="num">₱{fmtMoney(l.total_credit)}</td>
                                <td className="num"><strong>₱{fmtMoney(l.amount)}</strong></td>
                                <td style={{ fontSize: '0.72rem', color: '#6b7280' }}>{l.account_type}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    );
                  })}
                  {(data.schedules.other_lines_warning || []).length > 0 && (
                    <details style={{ marginBottom: '0.5rem' }}>
                      <summary style={{ fontSize: '0.85rem', fontWeight: 600, color: '#b91c1c', cursor: 'pointer', padding: '0.4rem 0' }}>
                        ⚠ Mis-tagged Lines (balance-sheet accounts in BIR/BOTH JEs) — {data.schedules.other_lines_warning.length}
                      </summary>
                      <table className="it-table">
                        <thead>
                          <tr><th>Code</th><th>Account</th><th>Type</th><th className="num">Net</th></tr>
                        </thead>
                        <tbody>
                          {data.schedules.other_lines_warning.map(l => (
                            <tr key={l.account_code} style={{ background: '#fef2f2' }}>
                              <td>{l.account_code}</td>
                              <td>{l.account_name}</td>
                              <td>{l.account_type}</td>
                              <td className="num">₱{fmtMoney(l.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
              )}

              {/* Lifecycle actions */}
              <div className="it-card">
                <div className="it-h2"><FileCheck2 size={16} /> Filing Lifecycle</div>
                <div className="it-row">
                  <span style={{ fontSize: '0.85rem' }}>Current status:</span>
                  <span className="it-pill" style={{ background: statusMeta.bg, color: statusMeta.fg }}>{statusMeta.label}</span>
                  {filingRow?.bir_reference_number && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      BIR ref: <strong>{filingRow.bir_reference_number}</strong>
                    </span>
                  )}
                  {filingRow?.filed_at && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      Filed at: {new Date(filingRow.filed_at).toLocaleString()}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto' }}></span>
                  <button
                    className="it-btn it-btn-primary"
                    onClick={onMarkFiled}
                    disabled={filing || lifecycleStatus === 'FILED' || lifecycleStatus === 'CONFIRMED'}
                  >
                    <FileCheck2 size={14} /> {filing ? 'Filing…' : 'Mark FILED'}
                  </button>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.5rem' }}>
                  Mark FILED stamps the computed totals into BirFilingStatus.totals_snapshot (immutable historical record) AND lazy-creates a 2307-IN annual-closure row stamping the CWT credit you claimed against this year. Period-lock fires after CONFIRMED (forwarded BIR confirmation email auto-flips DRAFT→CONFIRMED via the email-bridge parser).
                </p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function ManualField({ label, value, onChange, help }) {
  return (
    <div className="it-form-cell">
      <label className="it-form-label">{label}</label>
      <input
        className="it-input"
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
      {help && <span className="it-form-help">{help}</span>}
    </div>
  );
}
