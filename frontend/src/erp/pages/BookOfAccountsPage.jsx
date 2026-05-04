/**
 * BookOfAccountsPage — Phase VIP-1.J / J5 (May 2026)
 *
 * BIR Loose-Leaf Books of Accounts cockpit. Renders six books:
 *   • Sales Journal              (SALES_JOURNAL)
 *   • Purchase Journal           (PURCHASE_JOURNAL)
 *   • Cash Receipts Journal      (CASH_RECEIPTS)
 *   • Cash Disbursements Journal (CASH_DISBURSEMENTS)
 *   • General Journal            (GENERAL_JOURNAL)
 *   • General Ledger             (GENERAL_LEDGER)
 *
 * Each book is a row with:
 *   • Compute (preview totals for selected month / annual)
 *   • Per-month export buttons (12)
 *   • Annual binding export button
 *   • Sworn declaration download
 *
 * Backend: backend/erp/controllers/birController.js
 *   getBooksCatalog / computeBook / exportBookPdf /
 *   exportBookSwornDeclarationPdf
 *
 * Route: /erp/bir/BOOKS/:year
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, BookOpen, Download, FileText,
  AlertTriangle, Loader, RefreshCw, FileSignature,
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

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

const styles = `
  .boa-layout { min-height: 100vh; background: #f3f4f6; }
  .boa-content { display: flex; }
  .boa-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .boa-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .boa-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .boa-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .boa-h1 { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
  .boa-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .boa-meta-row { display: flex; flex-wrap: wrap; gap: 1.5rem; font-size: 0.85rem; color: #4b5563; padding: 0.5rem 0; }
  .boa-meta-row strong { color: #111827; }
  .boa-totals-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin-top: 0.5rem; }
  .boa-totals-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.7rem; background: #f9fafb; display: flex; flex-direction: column; gap: 0.3rem; }
  .boa-totals-label { font-size: 0.74rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .boa-totals-value { font-size: 1.2rem; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
  .boa-book-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .boa-book-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
  .boa-book-title { font-size: 1.05rem; font-weight: 700; color: #111827; display: flex; align-items: center; gap: 0.4rem; }
  .boa-book-section { font-size: 0.78rem; color: #6b7280; }
  .boa-book-desc { font-size: 0.82rem; color: #4b5563; margin-top: 0.3rem; }
  .boa-month-grid { display: grid; grid-template-columns: repeat(12, minmax(60px, 1fr)); gap: 0.4rem; margin-top: 0.6rem; }
  .boa-month-btn { padding: 0.4rem 0.5rem; font-size: 0.78rem; border: 1px solid #d1d5db; background: #fff; color: #374151; border-radius: 6px; cursor: pointer; transition: filter .12s; font-weight: 600; }
  .boa-month-btn:hover { background: #f9fafb; }
  .boa-month-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .boa-month-btn.active { border-color: #2563eb; color: #2563eb; background: #eff6ff; }
  .boa-month-btn.empty { opacity: 0.5; }
  .boa-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.6rem; }
  .boa-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.45rem 0.85rem; border-radius: 6px; font-size: 0.85rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .12s; background: transparent; }
  .boa-btn-primary { background: #2563eb; color: #fff; }
  .boa-btn-primary:hover { filter: brightness(0.9); }
  .boa-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .boa-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .boa-btn-secondary:hover { background: #f9fafb; }
  .boa-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
  .boa-btn-tertiary { background: transparent; color: #4b5563; border-color: #e5e7eb; }
  .boa-btn-tertiary:hover { background: #f3f4f6; }
  .boa-loading { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: #6b7280; }
  .boa-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 0.5rem; }
  .boa-table th, .boa-table td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #f3f4f6; }
  .boa-table th { font-size: 0.72rem; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
  .boa-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .boa-table tbody tr:hover { background: #f9fafb; }
  .boa-empty { padding: 1rem; text-align: center; color: #6b7280; font-style: italic; font-size: 0.85rem; }
  .boa-audit { font-size: 0.78rem; color: #4b5563; margin-top: 0.4rem; }
  .boa-audit strong { color: #111827; font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) {
    .boa-month-grid { grid-template-columns: repeat(6, minmax(50px, 1fr)); }
  }
`;

export default function BookOfAccountsPage() {
  const { year: yearRaw } = useParams();
  const navigate = useNavigate();
  const year = useMemo(() => {
    const y = parseInt(yearRaw, 10);
    return Number.isInteger(y) && y >= 2024 && y <= 2099 ? y : new Date().getFullYear();
  }, [yearRaw]);

  const [catalog, setCatalog] = useState(null);
  const [filingRow, setFilingRow] = useState(null);
  const [previews, setPreviews] = useState({}); // { bookCode: { month: previewObj } }
  const [exporting, setExporting] = useState({}); // { 'bookCode:month': true }
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState({});
  const [error, setError] = useState(null);

  // Per-book selected month (null = annual)
  const [selectedMonth, setSelectedMonth] = useState({}); // { bookCode: month|null }

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const data = await birService.getBooksCatalog(year);
      setCatalog(data || null);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load book catalog.';
      setError(msg);
    } finally {
      setLoadingCatalog(false);
    }
  }, [year]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const handlePreview = useCallback(async (bookCode, month) => {
    const cacheKey = month ?? 'annual';
    setLoadingPreview(prev => ({ ...prev, [`${bookCode}:${cacheKey}`]: true }));
    try {
      const data = await birService.computeBook(year, bookCode, month);
      setPreviews(prev => ({
        ...prev,
        [bookCode]: { ...(prev[bookCode] || {}), [cacheKey]: data },
      }));
      if (data?.filing_row) setFilingRow(data.filing_row);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Preview failed.';
      toast.error(msg);
    } finally {
      setLoadingPreview(prev => ({ ...prev, [`${bookCode}:${cacheKey}`]: false }));
    }
  }, [year]);

  const handleExport = useCallback(async (bookCode, month) => {
    const cacheKey = month ?? 'annual';
    setExporting(prev => ({ ...prev, [`${bookCode}:${cacheKey}`]: true }));
    try {
      const result = await birService.exportBookPdf(year, bookCode, month);
      toast.success(`Exported ${result.filename}${result.contentHash ? ` (${result.contentHash.slice(0, 12)}…)` : ''}`);
      // Refresh filing row so audit log reflects the export.
      handlePreview(bookCode, month);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Export failed.';
      toast.error(msg);
    } finally {
      setExporting(prev => ({ ...prev, [`${bookCode}:${cacheKey}`]: false }));
    }
  }, [year, handlePreview]);

  const handleSwornDeclaration = useCallback(async (bookCode) => {
    setExporting(prev => ({ ...prev, [`${bookCode}:sworn`]: true }));
    try {
      const result = await birService.exportBookSwornDeclaration(year, bookCode);
      toast.success(`Exported ${result.filename}${result.contentHash ? ` (${result.contentHash.slice(0, 12)}…)` : ''}`);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Export failed.';
      toast.error(msg);
    } finally {
      setExporting(prev => ({ ...prev, [`${bookCode}:sworn`]: false }));
    }
  }, [year]);

  const handleSelectMonth = useCallback((bookCode, month) => {
    setSelectedMonth(prev => ({ ...prev, [bookCode]: month }));
    handlePreview(bookCode, month);
  }, [handlePreview]);

  return (
    <div className="boa-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="boa-content">
        <Sidebar />
        <main className="boa-main">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h1 className="boa-h1">
              <ShieldCheck size={20} />
              Books of Accounts — {year}
              <span className="boa-pill" style={{ background: '#eef2ff', color: '#3730a3' }}>Loose-Leaf</span>
            </h1>
            <button className="boa-btn boa-btn-tertiary" onClick={() => navigate('/erp/bir')}>
              <ArrowLeft size={14} /> Back to BIR Compliance
            </button>
          </div>

          <PageGuide pageKey="bir-boa-books" />

          <div className="boa-card">
            <div className="boa-meta-row">
              <span><strong>Year:</strong> {year}</span>
              <span><strong>Form:</strong> BOOKS (annual loose-leaf)</span>
              <span><strong>Status:</strong> {filingRow ? (
                <span className="boa-pill" style={{ background: STATUS_META[filingRow.status]?.bg || '#fff', color: STATUS_META[filingRow.status]?.fg || '#000' }}>
                  {STATUS_META[filingRow.status]?.label || filingRow.status}
                </span>
              ) : 'No filing row yet'}</span>
              <span><strong>Cash accounts:</strong> {catalog?.cash_account_codes?.length ? catalog.cash_account_codes.join(', ') : '— (none configured; CASH_RECEIPTS / CASH_DISBURSEMENTS will be empty)'}</span>
              <span><strong>Responsible Officer:</strong> {catalog?.responsible_officer?.name || '—'}</span>
              <button className="boa-btn boa-btn-secondary" onClick={loadCatalog} disabled={loadingCatalog}>
                {loadingCatalog ? <Loader size={14} className="boa-spin" /> : <RefreshCw size={14} />}
                Reload Catalog
              </button>
            </div>
          </div>

          {error && (
            <div className="boa-card" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
              <div className="boa-row"><AlertTriangle size={16} /> {error}</div>
            </div>
          )}

          {loadingCatalog && !catalog && (
            <div className="boa-card boa-loading"><Loader size={16} /> Loading book catalog…</div>
          )}

          {catalog?.books?.map(book => {
            const sel = selectedMonth[book.code] ?? null;
            const cacheKey = sel ?? 'annual';
            const preview = previews[book.code]?.[cacheKey];
            const isLoading = !!loadingPreview[`${book.code}:${cacheKey}`];
            const isExporting = !!exporting[`${book.code}:${cacheKey}`];
            const isExportingSworn = !!exporting[`${book.code}:sworn`];

            return (
              <div key={book.code} className="boa-book-card">
                <div className="boa-book-head">
                  <div>
                    <div className="boa-book-title">
                      <BookOpen size={16} /> {book.label}
                    </div>
                    <div className="boa-book-section">{book.bir_section}</div>
                    <div className="boa-book-desc">{book.description}</div>
                  </div>
                  <div className="boa-actions">
                    <button
                      className="boa-btn boa-btn-secondary"
                      onClick={() => handleSwornDeclaration(book.code)}
                      disabled={isExportingSworn}
                      title="Per-book annual sworn declaration template (notary block, RR 9-2009 §4)."
                    >
                      {isExportingSworn ? <Loader size={14} /> : <FileSignature size={14} />}
                      Sworn Declaration PDF
                    </button>
                  </div>
                </div>

                <div className="boa-month-grid" role="group" aria-label={`Select month for ${book.label}`}>
                  {MONTH_LABELS.map((m, i) => (
                    <button
                      key={m}
                      type="button"
                      className={`boa-month-btn ${sel === i + 1 ? 'active' : ''}`}
                      onClick={() => handleSelectMonth(book.code, i + 1)}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <div className="boa-actions" style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className={`boa-btn boa-btn-secondary ${sel === null ? 'active' : ''}`}
                    onClick={() => handleSelectMonth(book.code, null)}
                  >
                    Annual ({year})
                  </button>
                  <button
                    type="button"
                    className="boa-btn boa-btn-tertiary"
                    onClick={() => handlePreview(book.code, sel)}
                    disabled={isLoading}
                    title={`Recompute totals for the selected period.`}
                  >
                    {isLoading ? <Loader size={14} /> : <RefreshCw size={14} />}
                    Recompute
                  </button>
                  <button
                    type="button"
                    className="boa-btn boa-btn-primary"
                    onClick={() => handleExport(book.code, sel)}
                    disabled={isExporting}
                  >
                    {isExporting ? <Loader size={14} /> : <Download size={14} />}
                    Export {sel ? `${MONTH_LABELS[sel - 1]} ${year}` : `Annual ${year}`} PDF
                  </button>
                </div>

                {preview && (
                  <div className="boa-totals-grid">
                    <div className="boa-totals-cell">
                      <span className="boa-totals-label">{book.code === 'GENERAL_LEDGER' ? 'Lines' : 'Entries'}</span>
                      <span className="boa-totals-value">
                        {book.code === 'GENERAL_LEDGER'
                          ? (preview.totals?.line_count ?? 0)
                          : (preview.totals?.row_count ?? 0)}
                      </span>
                    </div>
                    {book.code === 'GENERAL_LEDGER' && (
                      <div className="boa-totals-cell">
                        <span className="boa-totals-label">Accounts</span>
                        <span className="boa-totals-value">{preview.totals?.account_count ?? 0}</span>
                      </div>
                    )}
                    <div className="boa-totals-cell">
                      <span className="boa-totals-label">Total Debits</span>
                      <span className="boa-totals-value">₱{fmtMoney(preview.totals?.total_debit)}</span>
                    </div>
                    <div className="boa-totals-cell">
                      <span className="boa-totals-label">Total Credits</span>
                      <span className="boa-totals-value">₱{fmtMoney(preview.totals?.total_credit)}</span>
                    </div>
                    <div className="boa-totals-cell">
                      <span className="boa-totals-label">Period</span>
                      <span className="boa-totals-value" style={{ fontSize: '0.95rem' }}>{preview.period_label}</span>
                    </div>
                  </div>
                )}

                {preview && book.code !== 'GENERAL_LEDGER' && preview.rows?.length > 0 && (
                  <details style={{ marginTop: '0.6rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#4b5563' }}>
                      Preview first 20 entries
                    </summary>
                    <table className="boa-table">
                      <thead>
                        <tr>
                          <th>JE #</th>
                          <th>Date</th>
                          <th>Source</th>
                          <th>Doc Ref</th>
                          <th>Description</th>
                          <th className="num">Debit</th>
                          <th className="num">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.slice(0, 20).map((r, idx) => (
                          <tr key={`${r.je_number}-${idx}`}>
                            <td>{r.je_number}</td>
                            <td>{r.je_date ? new Date(r.je_date).toISOString().slice(0, 10) : ''}</td>
                            <td>{r.source_module}</td>
                            <td>{r.source_doc_ref}</td>
                            <td title={r.description}>{(r.description || '').slice(0, 60)}</td>
                            <td className="num">₱{fmtMoney(r.total_debit)}</td>
                            <td className="num">₱{fmtMoney(r.total_credit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.rows.length > 20 && (
                      <div className="boa-empty" style={{ fontSize: '0.78rem' }}>
                        … {preview.rows.length - 20} more entries (full list in the PDF export).
                      </div>
                    )}
                  </details>
                )}

                {preview && book.code === 'GENERAL_LEDGER' && preview.accounts?.length > 0 && (
                  <details style={{ marginTop: '0.6rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#4b5563' }}>
                      Preview accounts ({preview.accounts.length} total)
                    </summary>
                    <table className="boa-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Account Name</th>
                          <th className="num">Lines</th>
                          <th className="num">Debits</th>
                          <th className="num">Credits</th>
                          <th className="num">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.accounts.slice(0, 30).map(a => (
                          <tr key={a.account_code}>
                            <td>{a.account_code}</td>
                            <td>{a.account_name}</td>
                            <td className="num">{a.lines.length}</td>
                            <td className="num">₱{fmtMoney(a.total_debit)}</td>
                            <td className="num">₱{fmtMoney(a.total_credit)}</td>
                            <td className="num">₱{fmtMoney(a.closing_balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.accounts.length > 30 && (
                      <div className="boa-empty" style={{ fontSize: '0.78rem' }}>
                        … {preview.accounts.length - 30} more accounts (full breakdown in the PDF export).
                      </div>
                    )}
                  </details>
                )}

                {preview && (
                  (book.code === 'GENERAL_LEDGER' ? (preview.accounts?.length || 0) === 0 : (preview.rows?.length || 0) === 0)
                ) && (
                  <div className="boa-empty">
                    No entries for this period. Either nothing was POSTED in the period or the classification rules (BIR_BOA_BOOK_CATALOG, BIR_BOA_CASH_ACCOUNTS) routed transactions to a different book.
                  </div>
                )}
              </div>
            );
          })}

          {filingRow?.export_audit_log?.length > 0 && (
            <div className="boa-card">
              <div className="boa-h2"><FileText size={16} /> Recent Exports — Year {year}</div>
              <table className="boa-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Filename</th>
                    <th>Notes</th>
                    <th className="num">Bytes</th>
                    <th>Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {filingRow.export_audit_log.slice().reverse().slice(0, 30).map((e, idx) => (
                    <tr key={idx}>
                      <td>{e.exported_at ? new Date(e.exported_at).toISOString().replace('T', ' ').slice(0, 19) : ''}</td>
                      <td>{e.filename}</td>
                      <td>{e.notes}</td>
                      <td className="num">{(e.byte_length || 0).toLocaleString()}</td>
                      <td title={e.content_hash} style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>{(e.content_hash || '').slice(0, 14)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
