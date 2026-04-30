/**
 * BirVatReturnDetailPage — Phase VIP-1.J / J1 (Apr 2026)
 *
 * Form-detail page for BIR 2550M (Monthly VAT Declaration) and 2550Q
 * (Quarterly VAT Return). Driven by /api/erp/bir/forms/2550M/:year/:month/compute
 * and the 2550Q sibling. Each BIR box is rendered as a copyable card so
 * the bookkeeper can paste the value directly into eBIRForms 7.x.
 *
 * Lookup-driven status colors are intentionally inlined (matches BIR_FILING_STATUS
 * lookup defaults) so the page never goes dark on a Lookup outage; the
 * lookup remains the source of truth for subscriber re-skinning.
 *
 * Routes:
 *   /erp/bir/2550M/:year/:month
 *   /erp/bir/2550Q/:year/:quarter
 *
 * Backend: backend/erp/controllers/birController.js
 *   compute2550M / compute2550Q / exportVatReturnCsv
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, Copy, Check, Download, AlertTriangle,
  CheckCircle2, FileText, Loader, RefreshCw,
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
  SALES:   'Sales / Receipts',
  OUTPUT:  'Output Tax',
  INPUT:   'Input Tax',
  PAYABLE: 'Net VAT Payable',
};

function fmtMoney(n) {
  const x = Number(n || 0);
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

function periodLabel(formCode, periodValue) {
  if (formCode === '2550M') return `Month ${String(periodValue).padStart(2, '0')}`;
  if (formCode === '2550Q') return `Q${periodValue}`;
  return periodValue;
}

const styles = `
  .vat-layout { min-height: 100vh; background: #f3f4f6; }
  .vat-content { display: flex; }
  .vat-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .vat-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .vat-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .vat-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .vat-h1 { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
  .vat-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .vat-section-label { font-size: 0.75rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin: 1rem 0 0.5rem; font-weight: 600; }
  .vat-box-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .vat-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.75rem; background: #fafafa; display: flex; flex-direction: column; gap: 0.35rem; transition: filter .12s; }
  .vat-box.readonly { background: #f3f4f6; }
  .vat-box-label { font-size: 0.78rem; color: #6b7280; }
  .vat-box-value { font-size: 1.4rem; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
  .vat-box-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .vat-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .12s; background: transparent; }
  .vat-btn-primary { background: #2563eb; color: #fff; }
  .vat-btn-primary:hover { filter: brightness(0.9); }
  .vat-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .vat-btn-secondary:hover { background: #f9fafb; }
  .vat-btn-icon { padding: 0.4rem; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; transition: filter .12s; }
  .vat-btn-icon:hover { filter: brightness(0.96); background: #eef2ff; }
  .vat-warn { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem 0.75rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 0.85rem; color: #92400e; }
  .vat-meta-row { display: flex; flex-wrap: wrap; gap: 1.5rem; font-size: 0.85rem; color: #4b5563; padding: 0.5rem 0; }
  .vat-meta-row strong { color: #111827; }
  .vat-empty { font-size: 0.85rem; color: #6b7280; padding: 1rem; text-align: center; }
`;

export default function BirVatReturnDetailPage() {
  const { formCode: formCodeRaw, year: yearRaw, period: periodRaw } = useParams();
  const navigate = useNavigate();

  const formCode = (formCodeRaw || '').toUpperCase();
  const year = parseInt(yearRaw, 10);
  const period = parseInt(periodRaw, 10);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [filing, setFiling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const validParams = useMemo(() => {
    if (formCode !== '2550M' && formCode !== '2550Q') return false;
    if (!Number.isInteger(year) || year < 2024 || year > 2099) return false;
    if (formCode === '2550M' && (!Number.isInteger(period) || period < 1 || period > 12)) return false;
    if (formCode === '2550Q' && (!Number.isInteger(period) || period < 1 || period > 4)) return false;
    return true;
  }, [formCode, year, period]);

  const load = useCallback(async () => {
    if (!validParams) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = formCode === '2550M'
        ? await birService.compute2550M(year, period)
        : await birService.compute2550Q(year, period);
      setData(result);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to compute VAT return';
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
      const { filename, contentHash } = await birService.exportVatReturnCsv(formCode, year, period);
      toast.success(`Downloaded ${filename}${contentHash ? ` — hash ${contentHash.slice(0, 12)}…` : ''}`);
      // Refresh — exporting refreshes totals_snapshot + appends to audit log.
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
  // early-return so React's hook order stays stable across renders. Reads
  // through optional-chaining so an empty `data` does not throw.
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
      <div className="vat-layout">
        <style>{styles}</style>
        <Navbar />
        <div className="vat-content">
          <Sidebar />
          <main className="vat-main">
            <div className="vat-card">
              <h1 className="vat-h1"><AlertTriangle size={20} color="#b91c1c" /> Invalid form parameters</h1>
              <p>This route requires <code>/erp/bir/2550M/:year/:month</code> or <code>/erp/bir/2550Q/:year/:quarter</code>.</p>
              <button className="vat-btn vat-btn-secondary" onClick={() => navigate('/erp/bir')}>
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
  const pendingNotes = Object.entries(meta.pending_j11 || {});

  return (
    <div className="vat-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="vat-content">
        <Sidebar />
        <main className="vat-main">
          <div className="vat-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <button className="vat-btn vat-btn-secondary" onClick={() => navigate('/erp/bir')}>
                <ArrowLeft size={14} /> BIR Dashboard
              </button>
            </div>
            <div className="vat-row">
              <button className="vat-btn vat-btn-secondary" onClick={load}>
                <RefreshCw size={14} /> Recompute
              </button>
              <button className="vat-btn vat-btn-primary" onClick={onExport} disabled={exporting || loading}>
                {exporting ? <Loader size={14} /> : <Download size={14} />} Export CSV
              </button>
            </div>
          </div>

          <div className="vat-card">
            <h1 className="vat-h1">
              <ShieldCheck size={22} color="#2563eb" />
              BIR {formCode} — {year} {periodLabel(formCode, period)}
              <span className="vat-pill" style={{ background: statusMeta.bg, color: statusMeta.fg, marginLeft: '0.75rem' }}>
                {statusMeta.label}
              </span>
            </h1>
            <PageGuide pageKey="bir-vat-return" />
            {filingRow?.bir_reference_number && (
              <div className="vat-meta-row">
                <span>Filing reference: <strong>{filingRow.bir_reference_number}</strong></span>
                {filingRow.filed_at && <span>Filed at: <strong>{new Date(filingRow.filed_at).toLocaleString()}</strong></span>}
                {filingRow.confirmed_at && <span>Confirmed at: <strong>{new Date(filingRow.confirmed_at).toLocaleString()}</strong></span>}
              </div>
            )}
          </div>

          {loading && (
            <div className="vat-card vat-empty"><Loader size={16} /> Computing aggregation…</div>
          )}

          {!loading && data && (
            <>
              {/* Source-data summary so the bookkeeper sees how many rows fed the totals. */}
              <div className="vat-card">
                <h2 className="vat-h2"><FileText size={16} /> Aggregation summary</h2>
                <div className="vat-meta-row">
                  <span>Output VAT rows: <strong>{meta?.source_counts?.output_vat_rows ?? 0}</strong></span>
                  <span>Input VAT rows: <strong>{meta?.source_counts?.input_vat_rows ?? 0}</strong></span>
                  <span>SC/PWD exempt rows: <strong>{meta?.source_counts?.scpwd_exempt_rows ?? 0}</strong></span>
                  <span>Computed at: <strong>{meta.computed_at ? new Date(meta.computed_at).toLocaleString() : '—'}</strong></span>
                </div>
                {pendingNotes.length > 0 && (
                  <div className="vat-warn" style={{ marginTop: '0.75rem' }}>
                    <AlertTriangle size={16} />
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Phase J1.1 stubs — review before filing:</div>
                      <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                        {pendingNotes.map(([k, v]) => (
                          <li key={k}><code>{k}</code>: {v}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Sectioned BIR boxes */}
              {sectioned.map(([section, boxes]) => (
                <div className="vat-card" key={section}>
                  <h2 className="vat-h2">{SECTION_LABELS[section] || section}</h2>
                  <div className="vat-box-grid">
                    {boxes.map(b => {
                      const value = totals[b.code] ?? 0;
                      const display = fmtMoney(value);
                      return (
                        <div key={b.code} className={`vat-box ${b.readonly ? 'readonly' : ''}`}>
                          <div className="vat-box-label">{b.label}</div>
                          <div className="vat-box-row">
                            <div className="vat-box-value">{display}</div>
                            <button
                              className="vat-btn-icon"
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

              {/* Lifecycle actions */}
              <div className="vat-card">
                <h2 className="vat-h2"><CheckCircle2 size={16} /> Lifecycle</h2>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.6rem' }}>
                  Export creates / refreshes the filing row, signs the export with a SHA-256 content hash, and refreshes
                  the dashboard heatmap. Mark <strong>Reviewed</strong> after president sign-off, <strong>Filed</strong> after
                  eBIRForms submission, and <strong>Confirmed</strong> when the BIR confirmation email lands. The auto-confirm
                  email bridge (J0) flips Filed → Confirmed automatically when configured.
                </p>
                <div className="vat-row">
                  <button className="vat-btn vat-btn-secondary" onClick={onMarkReviewed} disabled={reviewing || !filingRow?._id}>
                    {reviewing ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Reviewed
                  </button>
                  <button className="vat-btn vat-btn-secondary" onClick={onMarkFiled} disabled={filing || !filingRow?._id}>
                    {filing ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Filed
                  </button>
                  <button className="vat-btn vat-btn-secondary" onClick={onMarkConfirmed} disabled={confirming || !filingRow?._id}>
                    {confirming ? <Loader size={14} /> : <CheckCircle2 size={14} />} Mark Confirmed
                  </button>
                </div>
              </div>

              {/* Export audit log — full traceability per Rule #20 */}
              {filingRow?.export_audit_log?.length > 0 && (
                <div className="vat-card">
                  <h2 className="vat-h2"><FileText size={16} /> Export audit log ({filingRow.export_audit_log.length})</h2>
                  {filingRow.export_audit_log.slice(-10).reverse().map((e, idx) => (
                    <div key={idx} className="vat-meta-row" style={{ borderBottom: '1px solid #f3f4f6' }}>
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
