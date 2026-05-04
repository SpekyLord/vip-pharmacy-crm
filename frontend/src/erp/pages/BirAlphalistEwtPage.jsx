/**
 * BirAlphalistEwtPage — Phase VIP-1.J / J4 (May 2026)
 *
 * Handles BOTH 1604-E (annual EWT alphalist) and QAP (quarterly EWT
 * alphalist) via the `formCodeOverride` prop, mirroring the
 * BirEwtReturnDetailPage 3-form pattern. The two forms share:
 *   • Single flat per-(payee × ATC) schedule (no schedule decomposition)
 *   • Per-ATC totals card (the 6 OUTBOUND EWT ATCs)
 *   • Lifecycle (Recompute → Export .dat → Reviewed → Filed → Confirmed)
 *
 * The annual / quarterly difference is just URL params + title + filename:
 *   • 1604-E: /erp/bir/1604-E/:year         — formCodeOverride="1604-E"
 *   • QAP:    /erp/bir/QAP/:year/:quarter   — formCodeOverride="QAP"
 *
 * Different shape from Bir1604CFDetailPage (which has the 3-schedule
 * compensation partition) and BirEwtReturnDetailPage (which has the BIR
 * box-grid layout). 1604-E + QAP are alphalists — pure payee schedules
 * without box layouts.
 *
 * Backend: backend/erp/controllers/birController.js
 *   compute1604E / export1604EDat / computeQAP / exportQAPDat
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, Download, AlertTriangle,
  CheckCircle2, FileText, Loader, RefreshCw, Users,
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
  OVERDUE:         { label: 'Overdue',          bg: '#fee2e2', fg: '#b91c1c' },
};

const ATC_LABELS = {
  WI010: 'WI010 — Prof. fees (indiv ≤ 720k)',
  WI011: 'WI011 — Prof. fees (indiv > 720k)',
  WC010: 'WC010 — Prof. fees (corp ≤ 720k)',
  WC011: 'WC011 — Prof. fees (corp > 720k)',
  WI080: 'WI080 — TWA Goods (1%)',
  WI081: 'WI081 — TWA Services (2%)',
};

const ATC_ORDER = ['WI010', 'WI011', 'WC010', 'WC011', 'WI080', 'WI081'];

function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

const styles = `
  .alpha-layout { min-height: 100vh; background: #f3f4f6; }
  .alpha-content { display: flex; }
  .alpha-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .alpha-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .alpha-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .alpha-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .alpha-h1 { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
  .alpha-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .alpha-meta-row { display: flex; flex-wrap: wrap; gap: 1.5rem; font-size: 0.85rem; color: #4b5563; padding: 0.5rem 0; }
  .alpha-meta-row strong { color: #111827; }
  .alpha-totals-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .alpha-totals-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; background: #f9fafb; display: flex; flex-direction: column; gap: 0.35rem; }
  .alpha-totals-label { font-size: 0.78rem; color: #6b7280; }
  .alpha-totals-value { font-size: 1.4rem; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
  .alpha-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .alpha-table th, .alpha-table td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #f3f4f6; }
  .alpha-table th { font-size: 0.74rem; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
  .alpha-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .alpha-empty { font-size: 0.85rem; color: #6b7280; padding: 1rem; text-align: center; font-style: italic; }
  .alpha-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .12s; background: transparent; }
  .alpha-btn-primary { background: #2563eb; color: #fff; }
  .alpha-btn-primary:hover { filter: brightness(0.9); }
  .alpha-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .alpha-btn-secondary:hover { background: #f9fafb; }
  .alpha-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .alpha-atc-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .alpha-atc-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.6rem 0.75rem; background: #f9fafb; }
  .alpha-atc-code { font-size: 0.78rem; color: #6b7280; margin-bottom: 0.2rem; }
  .alpha-atc-row { display: flex; justify-content: space-between; font-size: 0.82rem; }
  .alpha-atc-row .num { font-variant-numeric: tabular-nums; font-weight: 600; }
`;

export default function BirAlphalistEwtPage({ formCodeOverride }) {
  const params = useParams();
  const navigate = useNavigate();

  const formCode = (formCodeOverride || '').toUpperCase();
  const isAnnual = formCode === '1604-E';
  const isQuarterly = formCode === 'QAP';

  const year = parseInt(params.year, 10);
  const quarter = isQuarterly ? parseInt(params.quarter, 10) : null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const validParams = useMemo(() => {
    if (!isAnnual && !isQuarterly) return false;
    if (!Number.isInteger(year) || year < 2024 || year > 2099) return false;
    if (isQuarterly && (!Number.isInteger(quarter) || quarter < 1 || quarter > 4)) return false;
    return true;
  }, [isAnnual, isQuarterly, year, quarter]);

  const periodLabel = isAnnual ? `${year}` : `${year}-Q${quarter}`;
  const formTitle = isAnnual
    ? `BIR 1604-E — ${year} Annual Alphalist of Payees Subject to Expanded Withholding`
    : `BIR QAP — ${year}-Q${quarter} Quarterly Alphalist of Payees`;
  const guideKey = isAnnual ? 'bir-1604e-alphalist' : 'bir-qap-alphalist';
  const aggregationLabel = isAnnual
    ? 'Computing aggregation across 12 monthly periods…'
    : 'Computing aggregation across 3 monthly periods…';

  const load = useCallback(async () => {
    if (!validParams) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = isAnnual
        ? await birService.compute1604E(year)
        : await birService.computeQAP(year, quarter);
      setData(result);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || `Failed to compute ${formCode}`;
      const scope = err?.response?.data?.required_scope;
      toast.error(scope ? `${msg} (scope: ${scope})` : msg);
    } finally {
      setLoading(false);
    }
  }, [validParams, isAnnual, year, quarter, formCode]);

  useEffect(() => { load(); }, [load]);

  const onExportDat = async () => {
    setExporting(true);
    try {
      const { filename, contentHash } = isAnnual
        ? await birService.export1604EDat(year)
        : await birService.exportQAPDat(year, quarter);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
      await load();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const onMarkReviewed = async () => {
    if (!data?.filing_row?._id) {
      toast.error('Export the .dat first — that creates the filing row.');
      return;
    }
    setReviewing(true);
    try {
      await birService.markReviewed(data.filing_row._id);
      toast.success('Marked REVIEWED. Bookkeeper may now file.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mark reviewed failed');
    } finally {
      setReviewing(false);
    }
  };

  const onMarkFiled = async () => {
    if (!data?.filing_row?._id) {
      toast.error('Export the .dat first to create the filing row, then mark filed.');
      return;
    }
    const ref = window.prompt('Enter the BIR / Alphalist Data Entry reference number for this filing:');
    if (!ref) return;
    setFiling(true);
    try {
      await birService.markFiled(data.filing_row._id, { bir_reference_number: ref.trim() });
      toast.success('Marked FILED. Forward the BIR confirmation email to your filing inbox to auto-flip to CONFIRMED.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mark filed failed');
    } finally {
      setFiling(false);
    }
  };

  const onMarkConfirmed = async () => {
    if (!data?.filing_row?._id) {
      toast.error('No filing row yet — export then file first.');
      return;
    }
    const ref = window.prompt('Enter / confirm the BIR reference number:', data.filing_row.bir_reference_number || '');
    if (!ref) return;
    setConfirming(true);
    try {
      await birService.markConfirmed(data.filing_row._id, { bir_reference_number: ref.trim() });
      toast.success('Marked CONFIRMED. Period locked.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Mark confirmed failed');
    } finally {
      setConfirming(false);
    }
  };

  const schedule = useMemo(() => data?.meta?.schedule || [], [data]);

  if (!validParams) {
    return (
      <div className="alpha-layout">
        <style>{styles}</style>
        <Navbar />
        <div className="alpha-content">
          <Sidebar />
          <main className="alpha-main">
            <div className="alpha-card">
              <h1 className="alpha-h1"><AlertTriangle size={20} color="#b91c1c" /> Invalid form parameters</h1>
              <p>
                {isAnnual && (<>This route requires <code>/erp/bir/1604-E/:year</code> with year ≥ 2024.</>)}
                {isQuarterly && (<>This route requires <code>/erp/bir/QAP/:year/:quarter</code> with year ≥ 2024 and quarter 1-4.</>)}
                {!isAnnual && !isQuarterly && (<>Unknown form code: <code>{formCode || '(none)'}</code>.</>)}
              </p>
              <button className="alpha-btn alpha-btn-secondary" onClick={() => navigate('/erp/bir')}>
                <ArrowLeft size={14} /> Back to dashboard
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const totals = data?.totals || {};
  const meta = data?.meta || {};
  const filingRow = data?.filing_row;
  const stagedStatus = filingRow?.status || 'DRAFT';
  const statusMeta = STATUS_META[stagedStatus] || STATUS_META.DRAFT;

  return (
    <div className="alpha-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="alpha-content">
        <Sidebar />
        <main className="alpha-main">
          <div className="alpha-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <button className="alpha-btn alpha-btn-secondary" onClick={() => navigate('/erp/bir')}>
                <ArrowLeft size={14} /> BIR Dashboard
              </button>
            </div>
            <div className="alpha-row">
              <button className="alpha-btn alpha-btn-secondary" onClick={load}>
                <RefreshCw size={14} /> Recompute
              </button>
              <button className="alpha-btn alpha-btn-primary" onClick={onExportDat} disabled={exporting || loading}>
                {exporting ? <Loader size={14} /> : <Download size={14} />} Export .dat
              </button>
            </div>
          </div>

          <div className="alpha-card">
            <h1 className="alpha-h1">
              <ShieldCheck size={22} color="#2563eb" />
              {formTitle}
              <span className="alpha-pill" style={{ background: statusMeta.bg, color: statusMeta.fg, marginLeft: '0.75rem' }}>
                {statusMeta.label}
              </span>
            </h1>
            <PageGuide pageKey={guideKey} />
            {filingRow?.bir_reference_number && (
              <div className="alpha-meta-row">
                <span>Filing reference: <strong>{filingRow.bir_reference_number}</strong></span>
                {filingRow.filed_at && <span>Filed at: <strong>{new Date(filingRow.filed_at).toLocaleString()}</strong></span>}
                {filingRow.confirmed_at && <span>Confirmed at: <strong>{new Date(filingRow.confirmed_at).toLocaleString()}</strong></span>}
              </div>
            )}
          </div>

          {loading && (
            <div className="alpha-card alpha-empty"><Loader size={16} /> {aggregationLabel}</div>
          )}

          {!loading && data && (
            <>
              {/* Aggregation summary */}
              <div className="alpha-card">
                <h2 className="alpha-h2"><FileText size={16} /> Aggregation summary</h2>
                <div className="alpha-meta-row">
                  <span>Period: <strong>{periodLabel}</strong></span>
                  <span>Ledger payee × ATC rows: <strong>{meta?.source_counts?.ledger_payee_atc_rows ?? 0}</strong></span>
                  <span>Distinct payees: <strong>{meta?.source_counts?.distinct_payees ?? 0}</strong></span>
                  <span>ATC buckets used: <strong>{meta?.source_counts?.atc_buckets ?? 0}</strong></span>
                  <span>Computed at: <strong>{meta.computed_at ? new Date(meta.computed_at).toLocaleString() : '—'}</strong></span>
                </div>
              </div>

              {/* Aggregate totals */}
              <div className="alpha-card">
                <h2 className="alpha-h2">{isAnnual ? 'Annual totals' : 'Quarter totals'}</h2>
                <div className="alpha-totals-grid">
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Distinct Payees</div>
                    <div className="alpha-totals-value">{totals.distinct_payees || 0}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Payee × ATC Lines</div>
                    <div className="alpha-totals-value">{totals.payee_lines || 0}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Total Gross Income Payments</div>
                    <div className="alpha-totals-value">₱{fmtMoney(totals.gross_total)}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Total Tax Withheld</div>
                    <div className="alpha-totals-value">₱{fmtMoney(totals.withheld_total)}</div>
                  </div>
                </div>
              </div>

              {/* Per-ATC breakdown */}
              <div className="alpha-card">
                <h2 className="alpha-h2"><Users size={16} /> Per-ATC breakdown</h2>
                <div className="alpha-atc-grid">
                  {ATC_ORDER.map(code => {
                    const lc = code.toLowerCase();
                    const gross = totals[`${lc}_gross`] || 0;
                    const tax = totals[`${lc}_tax`] || 0;
                    const count = totals[`${lc}_count`] || 0;
                    return (
                      <div className="alpha-atc-cell" key={code}>
                        <div className="alpha-atc-code">{ATC_LABELS[code] || code}</div>
                        <div className="alpha-atc-row"><span>Gross</span><span className="num">₱{fmtMoney(gross)}</span></div>
                        <div className="alpha-atc-row"><span>Tax Withheld</span><span className="num">₱{fmtMoney(tax)}</span></div>
                        <div className="alpha-atc-row" style={{ color: '#6b7280' }}><span>Lines</span><span className="num">{count}</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-(payee × ATC) schedule */}
              <div className="alpha-card">
                <h2 className="alpha-h2"><Users size={16} /> Per-payee × ATC schedule</h2>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.4rem' }}>
                  One row per (payee × ATC) pair — matches the BIR Alphalist Data Entry v7.x D1 line shape.
                  Sorted by gross descending so big-ticket payees appear first.
                </p>
                {schedule.length === 0 ? (
                  <div className="alpha-empty">
                    No INCLUDE-tagged OUTBOUND withholding rows for {periodLabel}. Tag rows in finance review first
                    (Withholding Posture card on /erp/bir).
                  </div>
                ) : (
                  <table className="alpha-table">
                    <thead>
                      <tr>
                        <th>Payee</th>
                        <th>Kind</th>
                        <th>TIN</th>
                        <th>ATC</th>
                        <th className="num">Gross</th>
                        <th className="num">Tax Withheld</th>
                        <th>Months</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((r, idx) => (
                        <tr key={`${r.payee_kind}:${r.payee_id}:${r.atc_code}:${idx}`}>
                          <td>{r.payee_name || '(unnamed)'}</td>
                          <td style={{ fontSize: '0.78rem', color: '#6b7280' }}>{r.payee_kind}</td>
                          <td style={{ color: r.payee_tin ? '#111827' : '#b91c1c' }}>
                            {r.payee_tin || 'TIN missing'}
                          </td>
                          <td><strong>{r.atc_code}</strong></td>
                          <td className="num">{fmtMoney(r.gross)}</td>
                          <td className="num">{fmtMoney(r.withheld)}</td>
                          <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {r.first_period}{r.first_period !== r.last_period ? ` → ${r.last_period}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Lifecycle actions */}
              <div className="alpha-card">
                <h2 className="alpha-h2"><CheckCircle2 size={16} /> Lifecycle</h2>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.6rem' }}>
                  Export .dat creates / refreshes the filing row, signs the export with a SHA-256 content hash, and refreshes
                  the dashboard heatmap. Import the .dat into BIR Alphalist Data Entry v7.x and submit. Mark <strong>Reviewed</strong> after
                  president sign-off, <strong>Filed</strong> after submission, and <strong>Confirmed</strong> when the BIR confirmation email
                  lands. The auto-confirm email bridge (J0) flips Filed → Confirmed automatically when configured.
                </p>
                <div className="alpha-row">
                  <button className="alpha-btn alpha-btn-secondary" onClick={onMarkReviewed} disabled={reviewing || !filingRow?._id}>
                    {reviewing ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Reviewed
                  </button>
                  <button className="alpha-btn alpha-btn-secondary" onClick={onMarkFiled} disabled={filing || !filingRow?._id}>
                    {filing ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Filed
                  </button>
                  <button className="alpha-btn alpha-btn-secondary" onClick={onMarkConfirmed} disabled={confirming || !filingRow?._id}>
                    {confirming ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Confirmed
                  </button>
                </div>
              </div>

              {/* Export audit log */}
              {filingRow?.export_audit_log?.length > 0 && (
                <div className="alpha-card">
                  <h2 className="alpha-h2"><FileText size={16} /> Export audit log ({filingRow.export_audit_log.length})</h2>
                  {filingRow.export_audit_log.slice(-10).reverse().map((e, idx) => (
                    <div key={idx} className="alpha-meta-row" style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <span>{new Date(e.exported_at).toLocaleString()}</span>
                      <span>{e.artifact_kind}</span>
                      <span>{e.filename}</span>
                      <span>{(e.byte_length / 1024).toFixed(1)} KB</span>
                      <span title={e.content_hash}>hash {e.content_hash?.slice(0, 12) || '—'}…</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
