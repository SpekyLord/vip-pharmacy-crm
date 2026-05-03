/**
 * BirEwtReturnDetailPage — Phase VIP-1.J / J2 (Apr 2026)
 *
 * Form-detail page for BIR 1601-EQ (Quarterly Expanded Withholding Tax)
 * and 1606 (Monthly Real-Property Withholding). Each box is a copyable
 * card so the bookkeeper can paste totals into eBIRForms 7.x.
 *
 * Mirrors BirVatReturnDetailPage's hook-order discipline (useMemo before
 * any conditional return) and the J1 export-then-mark-FILED lifecycle.
 *
 * Adds — beyond J1 — a per-payee Schedule table (under the box grid) so
 * the bookkeeper can see which contractor / landlord drove each ATC bucket
 * before signing off. The Schedule rows feed 2307 PDF generation
 * (`Generate 2307 PDF` button per row, gated by EXPORT_FORM at the
 * backend). SAWT export shortcut sits in the toolbar — it's quarterly
 * only, so the button hides for 1606.
 *
 * Routes:
 *   /erp/bir/1601-EQ/:year/:quarter
 *   /erp/bir/1606/:year/:month
 *
 * Backend: backend/erp/controllers/birController.js
 *   compute1601EQ / compute1606 / listEwtPayees / exportEwtCsv /
 *   exportSawtDat / export2307Pdf
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, Copy, Check, Download, AlertTriangle,
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

const SECTION_LABELS = {
  SCH1:  'Schedule 1 — Professional Fees & Withholding',
  SCH2:  'Schedule 2 — TWA Goods & Services',
  RENT:  'Rent — Withholding by Lessor Class',
  TOTAL: 'Totals',
};

function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function periodLabel(formCode, periodValue) {
  if (formCode === '1606') return `Month ${String(periodValue).padStart(2, '0')}`;
  if (formCode === '1601-EQ') return `Q${periodValue}`;
  return periodValue;
}

const styles = `
  .ewt-layout { min-height: 100vh; background: #f3f4f6; }
  .ewt-content { display: flex; }
  .ewt-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .ewt-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .ewt-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .ewt-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .ewt-h1 { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
  .ewt-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .ewt-box-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .ewt-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; background: #fafafa; display: flex; flex-direction: column; gap: 0.35rem; }
  .ewt-box.readonly { background: #f3f4f6; }
  .ewt-box-label { font-size: 0.78rem; color: #6b7280; }
  .ewt-box-value { font-size: 1.4rem; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
  .ewt-box-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .ewt-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .12s; background: transparent; }
  .ewt-btn-primary { background: #2563eb; color: #fff; }
  .ewt-btn-primary:hover { filter: brightness(0.9); }
  .ewt-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .ewt-btn-secondary:hover { background: #f9fafb; }
  .ewt-btn-icon { padding: 0.4rem; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
  .ewt-btn-icon:hover { filter: brightness(0.96); background: #eef2ff; }
  .ewt-meta-row { display: flex; flex-wrap: wrap; gap: 1.5rem; font-size: 0.85rem; color: #4b5563; padding: 0.5rem 0; }
  .ewt-meta-row strong { color: #111827; }
  .ewt-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .ewt-table th, .ewt-table td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #f3f4f6; }
  .ewt-table th { font-size: 0.74rem; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
  .ewt-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ewt-empty { font-size: 0.85rem; color: #6b7280; padding: 1rem; text-align: center; }
`;

export default function BirEwtReturnDetailPage({ formCodeOverride }) {
  const { formCode: formCodeRaw, year: yearRaw, period: periodRaw } = useParams();
  const navigate = useNavigate();

  // App.jsx mounts this component on TWO route patterns: explicit
  // /erp/bir/1601-EQ/:year/:period (no :formCode segment, formCodeOverride="1601-EQ")
  // and the same for 1606. The override prop wins; useParams.formCode is the
  // fallback for any future shared :formCode wildcard route.
  const formCode = (formCodeOverride || formCodeRaw || '').toUpperCase();
  const year = parseInt(yearRaw, 10);
  const period = parseInt(periodRaw, 10);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingSawt, setExportingSawt] = useState(false);
  const [exporting2307, setExporting2307] = useState(null); // payeeKey
  const [filing, setFiling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const validParams = useMemo(() => {
    if (formCode !== '1601-EQ' && formCode !== '1606') return false;
    if (!Number.isInteger(year) || year < 2024 || year > 2099) return false;
    if (formCode === '1606' && (!Number.isInteger(period) || period < 1 || period > 12)) return false;
    if (formCode === '1601-EQ' && (!Number.isInteger(period) || period < 1 || period > 4)) return false;
    return true;
  }, [formCode, year, period]);

  const load = useCallback(async () => {
    if (!validParams) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = formCode === '1601-EQ'
        ? await birService.compute1601EQ(year, period)
        : await birService.compute1606(year, period);
      setData(result);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to compute EWT return';
      const scope = err?.response?.data?.required_scope;
      toast.error(scope ? `${msg} (scope: ${scope})` : msg);
    } finally {
      setLoading(false);
    }
  }, [formCode, year, period, validParams]);

  useEffect(() => { load(); }, [load]);

  const onCopy = async (code, value) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(c => (c === code ? null : c)), 1400);
    } catch {
      toast.error('Clipboard write failed — select the value and copy manually.');
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      const { filename, contentHash } = await birService.exportEwtCsv(formCode, year, period);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
      await load();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Export failed';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const onExportSawt = async () => {
    if (formCode !== '1601-EQ') return;
    setExportingSawt(true);
    try {
      const { filename, contentHash } = await birService.exportSawtDat(year, period);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'SAWT export failed');
    } finally {
      setExportingSawt(false);
    }
  };

  const onExport2307 = async (payee) => {
    if (formCode !== '1601-EQ') return;
    const key = `${payee.payee_kind}|${payee.payee_id}`;
    setExporting2307(key);
    try {
      const { filename, contentHash } = await birService.export2307Pdf(year, period, payee.payee_kind, payee.payee_id);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || '2307 PDF export failed');
    } finally {
      setExporting2307(null);
    }
  };

  const onMarkReviewed = async () => {
    if (!data?.filing_row?._id) {
      toast.error('Export the form first — that creates the filing row.');
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
      toast.error('Export the form first to create the filing row, then mark filed.');
      return;
    }
    const ref = window.prompt('Enter the BIR / eBIRForms reference number for this filing:');
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

  // Hook order MUST be unconditional — `sectioned` is computed BEFORE any
  // early-return so React's hook order stays stable.
  const sectioned = useMemo(() => {
    const layout = data?.meta?.box_layout || [];
    const map = new Map();
    layout.forEach(b => {
      if (!map.has(b.section)) map.set(b.section, []);
      map.get(b.section).push(b);
    });
    return Array.from(map.entries());
  }, [data]);

  if (!validParams) {
    return (
      <div className="ewt-layout">
        <style>{styles}</style>
        <Navbar />
        <div className="ewt-content">
          <Sidebar />
          <main className="ewt-main">
            <div className="ewt-card">
              <h1 className="ewt-h1"><AlertTriangle size={20} color="#b91c1c" /> Invalid form parameters</h1>
              <p>This route requires <code>/erp/bir/1601-EQ/:year/:quarter</code> or <code>/erp/bir/1606/:year/:month</code>.</p>
              <button className="ewt-btn ewt-btn-secondary" onClick={() => navigate('/erp/bir')}>
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
  const schedule = meta?.schedule || [];

  return (
    <div className="ewt-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="ewt-content">
        <Sidebar />
        <main className="ewt-main">
          <div className="ewt-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <button className="ewt-btn ewt-btn-secondary" onClick={() => navigate('/erp/bir')}>
                <ArrowLeft size={14} /> BIR Dashboard
              </button>
            </div>
            <div className="ewt-row">
              <button className="ewt-btn ewt-btn-secondary" onClick={load}>
                <RefreshCw size={14} /> Recompute
              </button>
              {formCode === '1601-EQ' && (
                <button className="ewt-btn ewt-btn-secondary" onClick={onExportSawt} disabled={exportingSawt || loading}>
                  {exportingSawt ? <Loader size={14} /> : <FileDown size={14} />} SAWT (.dat)
                </button>
              )}
              <button className="ewt-btn ewt-btn-primary" onClick={onExport} disabled={exporting || loading}>
                {exporting ? <Loader size={14} /> : <Download size={14} />} Export CSV
              </button>
            </div>
          </div>

          <div className="ewt-card">
            <h1 className="ewt-h1">
              <ShieldCheck size={22} color="#2563eb" />
              BIR {formCode} — {year} {periodLabel(formCode, period)}
              <span className="ewt-pill" style={{ background: statusMeta.bg, color: statusMeta.fg, marginLeft: '0.75rem' }}>
                {statusMeta.label}
              </span>
            </h1>
            <PageGuide pageKey="bir-ewt-return" />
            {filingRow?.bir_reference_number && (
              <div className="ewt-meta-row">
                <span>Filing reference: <strong>{filingRow.bir_reference_number}</strong></span>
                {filingRow.filed_at && <span>Filed at: <strong>{new Date(filingRow.filed_at).toLocaleString()}</strong></span>}
                {filingRow.confirmed_at && <span>Confirmed at: <strong>{new Date(filingRow.confirmed_at).toLocaleString()}</strong></span>}
              </div>
            )}
          </div>

          {loading && (
            <div className="ewt-card ewt-empty"><Loader size={16} /> Computing aggregation…</div>
          )}

          {!loading && data && (
            <>
              {/* Source-data summary */}
              <div className="ewt-card">
                <h2 className="ewt-h2"><FileText size={16} /> Aggregation summary</h2>
                <div className="ewt-meta-row">
                  <span>ATC buckets: <strong>{meta?.source_counts?.atc_buckets ?? 0}</strong></span>
                  <span>{formCode === '1601-EQ' ? 'Payee lines' : 'Landlord lines'}: <strong>{meta?.source_counts?.payee_lines ?? meta?.source_counts?.landlord_lines ?? 0}</strong></span>
                  <span>Computed at: <strong>{meta.computed_at ? new Date(meta.computed_at).toLocaleString() : '—'}</strong></span>
                </div>
              </div>

              {/* Sectioned BIR boxes */}
              {sectioned.map(([section, boxes]) => (
                <div className="ewt-card" key={section}>
                  <h2 className="ewt-h2">{SECTION_LABELS[section] || section}</h2>
                  <div className="ewt-box-grid">
                    {boxes.map(b => {
                      const value = totals[b.code] ?? 0;
                      const display = fmtMoney(value);
                      return (
                        <div key={b.code} className={`ewt-box ${b.readonly ? 'readonly' : ''}`}>
                          <div className="ewt-box-label">{b.label}</div>
                          <div className="ewt-box-row">
                            <div className="ewt-box-value">{display}</div>
                            <button
                              className="ewt-btn-icon"
                              title={`Copy ${b.code}`}
                              onClick={() => onCopy(b.code, Number(value).toFixed(b.decimals || 2))}
                            >
                              {copiedCode === b.code ? <Check size={14} color="#15803d" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Per-payee schedule */}
              {schedule.length > 0 && (
                <div className="ewt-card">
                  <h2 className="ewt-h2">
                    <Users size={16} /> Per-{formCode === '1606' ? 'Landlord' : 'Payee'} Schedule
                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#6b7280', fontWeight: 400 }}>
                      {schedule.length} row{schedule.length === 1 ? '' : 's'}
                    </span>
                  </h2>
                  <table className="ewt-table">
                    <thead>
                      <tr>
                        <th>ATC</th>
                        <th>Payee</th>
                        <th>TIN</th>
                        <th className="num">Gross</th>
                        <th className="num">Withheld</th>
                        <th className="num">Lines</th>
                        {formCode === '1601-EQ' && <th aria-label="Actions" />}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((p, idx) => {
                        const key = `${p.payee_kind}|${p.payee_id}|${p.atc_code}`;
                        const exporting2307Key = `${p.payee_kind}|${p.payee_id}`;
                        return (
                          <tr key={key + idx}>
                            <td><span className="ewt-pill" style={{ background: '#dbeafe', color: '#1e40af' }}>{p.atc_code}</span></td>
                            <td>{p.payee_name || '(unnamed)'}</td>
                            <td style={{ color: p.payee_tin ? '#111827' : '#b91c1c' }}>{p.payee_tin || 'TIN missing'}</td>
                            <td className="num">{fmtMoney(p.gross)}</td>
                            <td className="num">{fmtMoney(p.withheld)}</td>
                            <td className="num">{p.count}</td>
                            {formCode === '1601-EQ' && (
                              <td>
                                {p.payee_id && (
                                  <button
                                    className="ewt-btn ewt-btn-secondary"
                                    onClick={() => onExport2307(p)}
                                    disabled={exporting2307 === exporting2307Key}
                                    title="Generate 2307 PDF"
                                  >
                                    {exporting2307 === exporting2307Key ? <Loader size={12} /> : <FileDown size={12} />}
                                    2307 PDF
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Lifecycle actions */}
              <div className="ewt-card">
                <h2 className="ewt-h2"><CheckCircle2 size={16} /> Lifecycle</h2>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.6rem' }}>
                  Export creates / refreshes the filing row, signs the export with a SHA-256 content hash, and refreshes
                  the dashboard heatmap. Mark <strong>Reviewed</strong> after president sign-off, <strong>Filed</strong> after
                  eBIRForms submission, and <strong>Confirmed</strong> when the BIR confirmation email lands. The auto-confirm
                  email bridge (J0) flips Filed → Confirmed automatically when configured.
                </p>
                <div className="ewt-row">
                  <button className="ewt-btn ewt-btn-secondary" onClick={onMarkReviewed} disabled={reviewing || !filingRow?._id}>
                    {reviewing ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Reviewed
                  </button>
                  <button className="ewt-btn ewt-btn-secondary" onClick={onMarkFiled} disabled={filing || !filingRow?._id}>
                    {filing ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Filed
                  </button>
                  <button className="ewt-btn ewt-btn-secondary" onClick={onMarkConfirmed} disabled={confirming || !filingRow?._id}>
                    {confirming ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Confirmed
                  </button>
                </div>
              </div>

              {/* Export audit log */}
              {filingRow?.export_audit_log?.length > 0 && (
                <div className="ewt-card">
                  <h2 className="ewt-h2"><FileText size={16} /> Export audit log ({filingRow.export_audit_log.length})</h2>
                  {filingRow.export_audit_log.slice(-10).reverse().map((e, idx) => (
                    <div key={idx} className="ewt-meta-row" style={{ borderBottom: '1px solid #f3f4f6' }}>
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
