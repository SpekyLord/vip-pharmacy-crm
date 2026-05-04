/**
 * Bir1604CFDetailPage — Phase VIP-1.J / J3 Part B (May 2026)
 *
 * Annual Compensation Alphalist (BIR 1604-CF) detail page.
 *
 * Different shape from BirEwtReturnDetailPage (which renders monthly /
 * quarterly box layouts) because 1604-CF is annual + schedule-based:
 *   • Aggregation summary card
 *   • Three schedule tables: 7.1 Regular, 7.2 MWE, 7.3 Terminated
 *   • Per-employee 2316 PDF button on every row
 *   • Toolbar: Recompute, Export .dat (Alphalist Data Entry import), lifecycle
 *
 * Mirrors BirEwtReturnDetailPage's hook-order discipline (useMemo before
 * any conditional return) and the J1/J2 export-then-mark-FILED lifecycle.
 *
 * Route: /erp/bir/1604-CF/:year
 * Backend: backend/erp/controllers/birController.js
 *   compute1604CF / export1604CFDat / export2316Pdf
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, Download, AlertTriangle,
  CheckCircle2, FileText, Loader, RefreshCw, FileDown, Users,
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

const SCHEDULE_META = {
  '7.1': {
    title: 'Schedule 7.1 — Regular Employees (Taxable)',
    pillBg: '#dbeafe', pillFg: '#1e40af',
    description: 'Regular taxable compensation. Tax withheld via the BIR graduated tax table at payroll-post time.',
    emptyMsg: 'No regular taxable employees this year.',
  },
  '7.2': {
    title: 'Schedule 7.2 — Minimum Wage Earners (Exempt under TRAIN)',
    pillBg: '#dcfce7', pillFg: '#15803d',
    description: 'MWE compensation is non-taxable under RA 10963. Withheld is structurally 0 — the row exists for BIR audit posture.',
    emptyMsg: 'No MWE-classified employees this year.',
  },
  '7.3': {
    title: 'Schedule 7.3 — Employees Terminated During the Year',
    pillBg: '#fef9c3', pillFg: '#854d0e',
    description: 'Employees with PeopleMaster.date_separated falling within the year. Partitioned out so BIR auditors can reconcile against the entity HR separation roster.',
    emptyMsg: 'No employees terminated during the year.',
  },
};

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
  .alpha-schedule-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0; }
  .alpha-schedule-desc { font-size: 0.78rem; color: #6b7280; margin-bottom: 0.4rem; }
`;

export default function Bir1604CFDetailPage() {
  const { year: yearRaw } = useParams();
  const navigate = useNavigate();

  const year = parseInt(yearRaw, 10);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exporting2316, setExporting2316] = useState(null); // payeeId
  const [filing, setFiling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const validParams = useMemo(() => {
    if (!Number.isInteger(year) || year < 2024 || year > 2099) return false;
    return true;
  }, [year]);

  const load = useCallback(async () => {
    if (!validParams) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await birService.compute1604CF(year);
      setData(result);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to compute 1604-CF';
      const scope = err?.response?.data?.required_scope;
      toast.error(scope ? `${msg} (scope: ${scope})` : msg);
    } finally {
      setLoading(false);
    }
  }, [year, validParams]);

  useEffect(() => { load(); }, [load]);

  const onExportDat = async () => {
    setExporting(true);
    try {
      const { filename, contentHash } = await birService.export1604CFDat(year);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
      await load();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const onExport2316 = async (payeeId) => {
    setExporting2316(payeeId);
    try {
      const { filename, contentHash } = await birService.export2316Pdf(year, payeeId);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || '2316 PDF export failed');
    } finally {
      setExporting2316(null);
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

  // Hook order MUST be unconditional — derived schedules computed BEFORE
  // the validParams early-return so React's hook order stays stable.
  const schedules = useMemo(() => {
    const s = data?.meta?.schedules || {};
    return [
      { key: '7.1', rows: s['7.1'] || [] },
      { key: '7.2', rows: s['7.2'] || [] },
      { key: '7.3', rows: s['7.3'] || [] },
    ];
  }, [data]);

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
              <p>This route requires <code>/erp/bir/1604-CF/:year</code> with year ≥ 2024.</p>
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
              BIR 1604-CF — {year} Annual Compensation Alphalist
              <span className="alpha-pill" style={{ background: statusMeta.bg, color: statusMeta.fg, marginLeft: '0.75rem' }}>
                {statusMeta.label}
              </span>
            </h1>
            <PageGuide pageKey="bir-1604cf-alphalist" />
            {filingRow?.bir_reference_number && (
              <div className="alpha-meta-row">
                <span>Filing reference: <strong>{filingRow.bir_reference_number}</strong></span>
                {filingRow.filed_at && <span>Filed at: <strong>{new Date(filingRow.filed_at).toLocaleString()}</strong></span>}
                {filingRow.confirmed_at && <span>Confirmed at: <strong>{new Date(filingRow.confirmed_at).toLocaleString()}</strong></span>}
              </div>
            )}
          </div>

          {loading && (
            <div className="alpha-card alpha-empty"><Loader size={16} /> Computing aggregation across 12 monthly periods…</div>
          )}

          {!loading && data && (
            <>
              {/* Aggregation summary */}
              <div className="alpha-card">
                <h2 className="alpha-h2"><FileText size={16} /> Aggregation summary</h2>
                <div className="alpha-meta-row">
                  <span>Ledger rows: <strong>{meta?.source_counts?.ledger_rows ?? 0}</strong></span>
                  <span>Distinct employees: <strong>{meta?.source_counts?.employees ?? 0}</strong></span>
                  <span>Schedule 7.1: <strong>{meta?.source_counts?.schedule_7_1 ?? 0}</strong></span>
                  <span>Schedule 7.2: <strong>{meta?.source_counts?.schedule_7_2 ?? 0}</strong></span>
                  <span>Schedule 7.3: <strong>{meta?.source_counts?.schedule_7_3 ?? 0}</strong></span>
                  <span>Computed at: <strong>{meta.computed_at ? new Date(meta.computed_at).toLocaleString() : '—'}</strong></span>
                </div>
              </div>

              {/* Annual totals (header card — analog of the box grid in the monthly form pages) */}
              <div className="alpha-card">
                <h2 className="alpha-h2">Annual totals</h2>
                <div className="alpha-totals-grid">
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Employees Reported</div>
                    <div className="alpha-totals-value">{totals.employees_total || 0}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Gross Compensation Paid</div>
                    <div className="alpha-totals-value">₱{fmtMoney(totals.gross_compensation_total)}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Taxable Compensation</div>
                    <div className="alpha-totals-value">₱{fmtMoney(totals.taxable_compensation_total)}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Non-Taxable (MWE pool)</div>
                    <div className="alpha-totals-value">₱{fmtMoney(totals.non_taxable_compensation_total)}</div>
                  </div>
                  <div className="alpha-totals-cell">
                    <div className="alpha-totals-label">Total Tax Withheld</div>
                    <div className="alpha-totals-value">₱{fmtMoney(totals.withheld_total)}</div>
                  </div>
                </div>
              </div>

              {/* Three schedule tables */}
              {schedules.map(({ key, rows }) => {
                const sm = SCHEDULE_META[key];
                return (
                  <div className="alpha-card" key={key}>
                    <div className="alpha-schedule-header">
                      <Users size={16} />
                      <h2 className="alpha-h2" style={{ marginBottom: 0 }}>{sm.title}</h2>
                      <span className="alpha-pill" style={{ background: sm.pillBg, color: sm.pillFg, marginLeft: 'auto' }}>
                        {rows.length} employee{rows.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="alpha-schedule-desc">{sm.description}</p>
                    {rows.length === 0 ? (
                      <div className="alpha-empty">{sm.emptyMsg}</div>
                    ) : (
                      <table className="alpha-table">
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>TIN</th>
                            <th className="num">Gross</th>
                            <th className="num">Non-Taxable</th>
                            <th className="num">Taxable</th>
                            <th className="num">Tax Withheld</th>
                            <th>Months</th>
                            <th aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={String(r.payee_id)}>
                              <td>{r.payee_name || '(unnamed)'}</td>
                              <td style={{ color: r.payee_tin ? '#111827' : '#b91c1c' }}>
                                {r.payee_tin || 'TIN missing'}
                              </td>
                              <td className="num">{fmtMoney(r.gross_compensation)}</td>
                              <td className="num">{fmtMoney(r.non_taxable_compensation)}</td>
                              <td className="num">{fmtMoney(r.taxable_compensation)}</td>
                              <td className="num">{fmtMoney(r.tax_withheld)}</td>
                              <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                {r.first_period}{r.first_period !== r.last_period ? ` → ${r.last_period}` : ''}
                              </td>
                              <td>
                                <button
                                  className="alpha-btn alpha-btn-secondary"
                                  onClick={() => onExport2316(r.payee_id)}
                                  disabled={exporting2316 === r.payee_id}
                                  title="Generate Form 2316 PDF (annual employee certificate)"
                                >
                                  {exporting2316 === r.payee_id ? <Loader size={12} /> : <FileDown size={12} />}
                                  2316 PDF
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}

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
