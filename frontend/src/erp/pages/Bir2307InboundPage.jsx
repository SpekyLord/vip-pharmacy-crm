/**
 * Bir2307InboundPage — Phase VIP-1.J / J6 (May 2026).
 *
 * Inbound BIR 2307 certificate reconciliation cockpit.
 *
 * Data flow:
 *   Hospital pays VIP collection (collection.cwt_amount > 0)
 *     → CwtLedger row auto-created with status='PENDING_2307'
 *       (collectionController.js:614 → cwtService.createCwtEntry)
 *     → Hospital eventually mails / emails the BIR Form 2307 paper / PDF
 *     → Bookkeeper opens THIS page, finds the matching CR, clicks
 *       "Mark Received", types the file URL / filename / hash, hits Save
 *     → CwtLedger row status flips to RECEIVED with cert_* fields stamped
 *     → Phase J7 1702 reads RECEIVED rows tagged for the year as the
 *       "Less: Creditable Tax Withheld" credit
 *
 * Routes:
 *   /erp/bir/2307-IN/:year             — annual view (4 quarters stacked)
 *   /erp/bir/2307-IN/:year/:quarter    — single quarter view
 *
 * Backend: birController.compute2307Inbound + list2307InboundRows +
 *   markReceived2307Inbound + markPending2307Inbound + exclude2307InboundRow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck, ArrowLeft, FileCheck2, Upload, RotateCcw, Ban,
  AlertTriangle, RefreshCw, Loader, ExternalLink, X, Save, Filter, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import birService from '../../erp/services/birService';

const STATUS_META = {
  PENDING_2307: { label: 'Pending 2307',  bg: '#fef9c3', fg: '#854d0e' },
  RECEIVED:     { label: 'Received',      bg: '#dcfce7', fg: '#15803d' },
  EXCLUDED:     { label: 'Excluded',      bg: '#fee2e2', fg: '#b91c1c' },
};

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

function fmtMoney(n) {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
}

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString(); } catch { return ''; }
}

const styles = `
  .ib-layout { min-height: 100vh; background: #f3f4f6; }
  .ib-content { display: flex; }
  .ib-main { flex: 1; padding: 1.5rem; max-width: 100vw; }
  .ib-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .ib-row { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
  .ib-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.78rem; font-weight: 600; }
  .ib-h1 { font-size: 1.4rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; }
  .ib-h2 { font-size: 1rem; font-weight: 700; margin-bottom: 0.6rem; display: flex; align-items: center; gap: 0.4rem; }
  .ib-totals-grid { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .ib-totals-cell { border: 1px solid #e5e7eb; border-radius: 8px; padding: 0.7rem; background: #f9fafb; display: flex; flex-direction: column; gap: 0.3rem; }
  .ib-totals-label { font-size: 0.74rem; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .ib-totals-value { font-size: 1.1rem; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
  .ib-totals-meta { font-size: 0.72rem; color: #6b7280; }
  .ib-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 0.5rem; }
  .ib-table th, .ib-table td { padding: 0.45rem 0.6rem; text-align: left; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .ib-table th { font-size: 0.72rem; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; background: #f9fafb; position: sticky; top: 0; z-index: 1; }
  .ib-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .ib-table tbody tr:hover { background: #f9fafb; }
  .ib-actions-cell { display: flex; gap: 0.35rem; flex-wrap: wrap; justify-content: flex-end; }
  .ib-input { padding: 0.45rem 0.6rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.85rem; width: 100%; box-sizing: border-box; }
  .ib-textarea { padding: 0.45rem 0.6rem; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.85rem; width: 100%; box-sizing: border-box; min-height: 60px; resize: vertical; font-family: inherit; }
  .ib-btn { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: filter .12s; background: transparent; }
  .ib-btn-primary { background: #2563eb; color: #fff; }
  .ib-btn-primary:hover { filter: brightness(0.92); }
  .ib-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .ib-btn-secondary { background: #fff; color: #374151; border-color: #d1d5db; }
  .ib-btn-secondary:hover { background: #f9fafb; }
  .ib-btn-danger { background: #fff; color: #b91c1c; border-color: #fecaca; }
  .ib-btn-danger:hover { background: #fef2f2; }
  .ib-modal-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .ib-modal { background: #fff; border-radius: 12px; padding: 1.25rem; max-width: 540px; width: 92%; max-height: 90vh; overflow: auto; }
  .ib-form-cell { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.6rem; }
  .ib-form-label { font-size: 0.78rem; color: #4b5563; font-weight: 600; }
  .ib-form-help { font-size: 0.72rem; color: #6b7280; }
  .ib-tabs { display: flex; gap: 0.4rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .ib-tab { padding: 0.5rem 0.85rem; font-size: 0.85rem; font-weight: 600; color: #4b5563; cursor: pointer; border-bottom: 2px solid transparent; }
  .ib-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
  .ib-table-wrap { overflow: auto; max-height: 70vh; border: 1px solid #e5e7eb; border-radius: 6px; }
`;

export default function Bir2307InboundPage() {
  const { year: yearParam, quarter: quarterParam } = useParams();
  const navigate = useNavigate();
  const year = parseInt(yearParam, 10) || new Date().getFullYear();
  const isQuarterView = !!quarterParam;
  const quarterFilter = useMemo(() => {
    if (!isQuarterView) return null;
    const upper = String(quarterParam).toUpperCase();
    if (['Q1', 'Q2', 'Q3', 'Q4'].includes(upper)) return upper;
    const numeric = parseInt(quarterParam, 10);
    if (numeric >= 1 && numeric <= 4) return `Q${numeric}`;
    return null;
  }, [isQuarterView, quarterParam]);

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [activeTab, setActiveTab] = useState('PENDING_2307');
  const [search, setSearch] = useState('');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [receiveModalRow, setReceiveModalRow] = useState(null);
  const [receiveDraft, setReceiveDraft] = useState({ cert_2307_url: '', cert_filename: '', cert_content_hash: '', cert_notes: '' });
  const [excludeModalRow, setExcludeModalRow] = useState(null);
  const [excludeReason, setExcludeReason] = useState('');
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summ, listResp] = await Promise.all([
        birService.compute2307Inbound(year, quarterFilter),
        birService.list2307InboundRows(year, { quarter: quarterFilter }),
      ]);
      setSummary(summ);
      setRows(listResp.rows || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load 2307 inbound page.');
    } finally {
      setLoading(false);
    }
  }, [year, quarterFilter]);

  useEffect(() => { load(); }, [load]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (activeTab !== 'ALL') r = r.filter(x => x.status === activeTab);
    const term = search.trim().toLowerCase();
    if (term) {
      r = r.filter(x =>
        (x.cr_no || '').toLowerCase().includes(term)
        || (x.hospital_name || '').toLowerCase().includes(term)
        || (x.hospital_tin || '').toLowerCase().includes(term)
      );
    }
    if (hospitalFilter) r = r.filter(x => String(x.hospital_id || '') === hospitalFilter);
    return r;
  }, [rows, activeTab, search, hospitalFilter]);

  const onOpenReceive = (row) => {
    setReceiveModalRow(row);
    setReceiveDraft({
      cert_2307_url: row.cert_2307_url || '',
      cert_filename: row.cert_filename || '',
      cert_content_hash: row.cert_content_hash || '',
      cert_notes: row.cert_notes || '',
    });
  };

  const onSubmitReceive = async () => {
    if (!receiveModalRow) return;
    setSavingId(receiveModalRow._id);
    try {
      await birService.markReceived2307Inbound(year, receiveModalRow._id, receiveDraft);
      toast.success('Marked RECEIVED — credit will roll into 1702.');
      setReceiveModalRow(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to mark received.');
    } finally {
      setSavingId(null);
    }
  };

  const onMarkPending = async (row) => {
    if (!window.confirm(`Revert CR ${row.cr_no || row._id} to PENDING_2307? Credit will be removed from 1702 rollup until re-received.`)) return;
    setSavingId(row._id);
    try {
      await birService.markPending2307Inbound(year, row._id);
      toast.success('Reverted to PENDING_2307.');
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to revert.');
    } finally {
      setSavingId(null);
    }
  };

  const onOpenExclude = (row) => {
    setExcludeModalRow(row);
    setExcludeReason('');
  };

  const onSubmitExclude = async () => {
    if (!excludeModalRow) return;
    if (!excludeReason.trim()) {
      toast.error('A reason is required.');
      return;
    }
    setSavingId(excludeModalRow._id);
    try {
      await birService.exclude2307InboundRow(year, excludeModalRow._id, excludeReason.trim());
      toast.success('Row excluded.');
      setExcludeModalRow(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to exclude row.');
    } finally {
      setSavingId(null);
    }
  };

  const totals = summary?.totals || {
    PENDING_2307: { count: 0, cwt_amount: 0 },
    RECEIVED: { count: 0, cwt_amount: 0 },
    EXCLUDED: { count: 0, cwt_amount: 0 },
    cwt_credit_received: 0,
    cwt_exposure_pending: 0,
    cwt_total_all: 0,
    row_count: 0,
  };

  const hospitalOptions = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      if (r.hospital_id) seen.set(String(r.hospital_id), r.hospital_name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  return (
    <div className="ib-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="ib-content">
        <Sidebar />
        <main className="ib-main">
          <div className="ib-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div className="ib-row">
              <button className="ib-btn ib-btn-secondary" onClick={() => navigate('/erp/bir')}>
                <ArrowLeft size={14} /> BIR Compliance
              </button>
              <h1 className="ib-h1">
                <ShieldCheck size={22} color="#2563eb" />
                Inbound 2307 Reconciliation — {year}{isQuarterView && quarterFilter ? ` ${quarterFilter}` : ''}
              </h1>
            </div>
            <button className="ib-btn ib-btn-secondary" onClick={load}><RefreshCw size={14} /> Refresh</button>
          </div>

          <PageGuide pageKey="bir-2307-inbound" />

          {loading && <div className="ib-card"><Loader size={16} /> Loading…</div>}

          {!loading && summary && (
            <>
              {/* Quarter selector strip */}
              <div className="ib-card">
                <div className="ib-row" style={{ justifyContent: 'space-between' }}>
                  <div className="ib-row">
                    <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>Period:</span>
                    <Link
                      to={`/erp/bir/2307-IN/${year}`}
                      className={`ib-btn ${!isQuarterView ? 'ib-btn-primary' : 'ib-btn-secondary'}`}
                    >
                      Annual {year}
                    </Link>
                    {QUARTER_LABELS.map(q => (
                      <Link
                        key={q}
                        to={`/erp/bir/2307-IN/${year}/${q}`}
                        className={`ib-btn ${quarterFilter === q ? 'ib-btn-primary' : 'ib-btn-secondary'}`}
                      >
                        {year}-{q}
                      </Link>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    {totals.row_count} CWT row(s) total
                  </span>
                </div>
              </div>

              {/* Totals card */}
              <div className="ib-card">
                <div className="ib-h2"><FileCheck2 size={16} /> Reconciliation totals — {summary.period_label}</div>
                <div className="ib-totals-grid">
                  <div className="ib-totals-cell">
                    <span className="ib-totals-label">Pending CWT</span>
                    <span className="ib-totals-value" style={{ color: '#854d0e' }}>₱{fmtMoney(totals.PENDING_2307?.cwt_amount || 0)}</span>
                    <span className="ib-totals-meta">{totals.PENDING_2307?.count || 0} certs awaiting receipt</span>
                  </div>
                  <div className="ib-totals-cell">
                    <span className="ib-totals-label">Received (1702 credit)</span>
                    <span className="ib-totals-value" style={{ color: '#15803d' }}>₱{fmtMoney(totals.cwt_credit_received || 0)}</span>
                    <span className="ib-totals-meta">{totals.RECEIVED?.count || 0} certs filed</span>
                  </div>
                  <div className="ib-totals-cell">
                    <span className="ib-totals-label">Excluded</span>
                    <span className="ib-totals-value" style={{ color: '#b91c1c' }}>₱{fmtMoney(totals.EXCLUDED?.cwt_amount || 0)}</span>
                    <span className="ib-totals-meta">{totals.EXCLUDED?.count || 0} disqualified</span>
                  </div>
                  <div className="ib-totals-cell">
                    <span className="ib-totals-label">Total CWT this period</span>
                    <span className="ib-totals-value">₱{fmtMoney(totals.cwt_total_all || 0)}</span>
                    <span className="ib-totals-meta">All collection-driven CWT</span>
                  </div>
                </div>
                {(totals.PENDING_2307?.count || 0) > 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#854d0e', marginTop: '0.6rem' }}>
                    <AlertTriangle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                    ₱{fmtMoney(totals.cwt_exposure_pending || 0)} of CWT credit is at risk if these {totals.PENDING_2307?.count || 0} pending 2307s don&apos;t arrive before 1702 closes.
                  </p>
                )}
              </div>

              {/* Per-hospital breakdown */}
              {summary.hospitals.length > 0 && (
                <div className="ib-card">
                  <div className="ib-h2">Per-hospital breakdown ({summary.hospitals.length} hospital{summary.hospitals.length === 1 ? '' : 's'})</div>
                  <div className="ib-table-wrap">
                    <table className="ib-table">
                      <thead>
                        <tr>
                          <th>Hospital</th>
                          <th>TIN</th>
                          <th className="num">Pending</th>
                          <th className="num">Received</th>
                          <th className="num">Excluded</th>
                          <th className="num">Total CWT</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.hospitals.map(h => (
                          <tr key={String(h.hospital_id || '__unmapped__')}>
                            <td>{h.hospital_name}</td>
                            <td>{h.hospital_tin || '—'}</td>
                            <td className="num" style={{ color: '#854d0e' }}>
                              {h.totals.PENDING_2307?.count || 0} / ₱{fmtMoney(h.totals.PENDING_2307?.cwt_amount || 0)}
                            </td>
                            <td className="num" style={{ color: '#15803d' }}>
                              {h.totals.RECEIVED?.count || 0} / ₱{fmtMoney(h.totals.RECEIVED?.cwt_amount || 0)}
                            </td>
                            <td className="num" style={{ color: '#b91c1c' }}>
                              {h.totals.EXCLUDED?.count || 0} / ₱{fmtMoney(h.totals.EXCLUDED?.cwt_amount || 0)}
                            </td>
                            <td className="num">₱{fmtMoney(h.totals.cwt_amount || 0)}</td>
                            <td>
                              {h.hospital_id && (
                                <button
                                  className="ib-btn ib-btn-secondary"
                                  onClick={() => setHospitalFilter(String(h.hospital_id))}
                                  title="Filter rows by this hospital"
                                >
                                  <Filter size={12} /> Filter
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Row list with status tabs */}
              <div className="ib-card">
                <div className="ib-tabs" role="tablist">
                  <div role="tab" className={`ib-tab ${activeTab === 'PENDING_2307' ? 'active' : ''}`} onClick={() => setActiveTab('PENDING_2307')}>
                    Pending ({totals.PENDING_2307?.count || 0})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'RECEIVED' ? 'active' : ''}`} onClick={() => setActiveTab('RECEIVED')}>
                    Received ({totals.RECEIVED?.count || 0})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'EXCLUDED' ? 'active' : ''}`} onClick={() => setActiveTab('EXCLUDED')}>
                    Excluded ({totals.EXCLUDED?.count || 0})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'ALL' ? 'active' : ''}`} onClick={() => setActiveTab('ALL')}>
                    All ({totals.row_count || 0})
                  </div>
                </div>

                <div className="ib-row" style={{ marginBottom: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: 8, top: 11, color: '#9ca3af' }} />
                    <input
                      className="ib-input"
                      style={{ paddingLeft: '1.85rem' }}
                      placeholder="Search CR no, hospital name, TIN…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {hospitalOptions.length > 0 && (
                    <select className="ib-input" style={{ width: 'auto', minWidth: 200 }} value={hospitalFilter} onChange={(e) => setHospitalFilter(e.target.value)}>
                      <option value="">All hospitals</option>
                      {hospitalOptions.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  )}
                  {(search || hospitalFilter) && (
                    <button className="ib-btn ib-btn-secondary" onClick={() => { setSearch(''); setHospitalFilter(''); }}>
                      <X size={14} /> Clear
                    </button>
                  )}
                </div>

                {filteredRows.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', padding: '1rem', textAlign: 'center' }}>
                    No rows in this view.
                  </p>
                ) : (
                  <div className="ib-table-wrap">
                    <table className="ib-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>CR no</th>
                          <th>CR date</th>
                          <th>Hospital</th>
                          <th>TIN</th>
                          <th>Quarter</th>
                          <th className="num">CR amount</th>
                          <th className="num">CWT</th>
                          <th>Cert ref</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map(r => {
                          const meta = STATUS_META[r.status] || STATUS_META.PENDING_2307;
                          return (
                            <tr key={String(r._id)}>
                              <td>
                                <span className="ib-pill" style={{ background: meta.bg, color: meta.fg }}>
                                  {meta.label}
                                </span>
                              </td>
                              <td>{r.cr_no || '—'}</td>
                              <td>{fmtDate(r.cr_date)}</td>
                              <td>{r.hospital_name}</td>
                              <td>{r.hospital_tin || '—'}</td>
                              <td>{r.quarter}</td>
                              <td className="num">₱{fmtMoney(r.cr_amount)}</td>
                              <td className="num"><strong>₱{fmtMoney(r.cwt_amount)}</strong></td>
                              <td style={{ maxWidth: 200, wordBreak: 'break-all' }}>
                                {r.cert_2307_url
                                  ? (
                                    <a href={r.cert_2307_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.78rem' }}>
                                      <ExternalLink size={12} style={{ verticalAlign: 'text-bottom' }} /> {r.cert_filename || 'open'}
                                    </a>
                                  )
                                  : <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>—</span>
                                }
                                {r.excluded_reason && (
                                  <div style={{ fontSize: '0.72rem', color: '#b91c1c', marginTop: 2 }}>Excluded: {r.excluded_reason}</div>
                                )}
                              </td>
                              <td>
                                <div className="ib-actions-cell">
                                  {r.status !== 'RECEIVED' && (
                                    <button
                                      className="ib-btn ib-btn-primary"
                                      disabled={savingId === r._id}
                                      onClick={() => onOpenReceive(r)}
                                    >
                                      <Upload size={12} /> Mark Received
                                    </button>
                                  )}
                                  {r.status === 'RECEIVED' && (
                                    <button
                                      className="ib-btn ib-btn-secondary"
                                      disabled={savingId === r._id}
                                      onClick={() => onMarkPending(r)}
                                    >
                                      <RotateCcw size={12} /> Revert
                                    </button>
                                  )}
                                  {r.status !== 'EXCLUDED' && (
                                    <button
                                      className="ib-btn ib-btn-danger"
                                      disabled={savingId === r._id}
                                      onClick={() => onOpenExclude(r)}
                                    >
                                      <Ban size={12} /> Exclude
                                    </button>
                                  )}
                                  {r.status === 'EXCLUDED' && (
                                    <button
                                      className="ib-btn ib-btn-secondary"
                                      disabled={savingId === r._id}
                                      onClick={() => onMarkPending(r)}
                                    >
                                      <RotateCcw size={12} /> Restore
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mark Received modal */}
          {receiveModalRow && (
            <div className="ib-modal-backdrop" onClick={() => setReceiveModalRow(null)}>
              <div className="ib-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ib-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Mark 2307 Received</h2>
                  <button className="ib-btn ib-btn-secondary" onClick={() => setReceiveModalRow(null)}><X size={14} /></button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.75rem' }}>
                  CR <strong>{receiveModalRow.cr_no || receiveModalRow._id}</strong> · {receiveModalRow.hospital_name} ·
                  {' '}<strong>₱{fmtMoney(receiveModalRow.cwt_amount)}</strong> CWT · {receiveModalRow.quarter} {receiveModalRow.year}
                </p>
                <div className="ib-form-cell">
                  <label className="ib-form-label">Certificate URL or path</label>
                  <input
                    className="ib-input"
                    placeholder="https://drive.google.com/… or s3://… or /shared/2307s/2026/Q2/cr-1234.pdf"
                    value={receiveDraft.cert_2307_url}
                    onChange={(e) => setReceiveDraft({ ...receiveDraft, cert_2307_url: e.target.value })}
                  />
                  <span className="ib-form-help">Where you saved the PDF — Drive, S3, shared folder, etc. We do NOT store the file bytes; only the reference for audit.</span>
                </div>
                <div className="ib-form-cell">
                  <label className="ib-form-label">Filename</label>
                  <input
                    className="ib-input"
                    placeholder="2307_StLukes_Q2-2026_CR-1234.pdf"
                    value={receiveDraft.cert_filename}
                    onChange={(e) => setReceiveDraft({ ...receiveDraft, cert_filename: e.target.value })}
                  />
                </div>
                <div className="ib-form-cell">
                  <label className="ib-form-label">SHA-256 content hash <span style={{ color: '#6b7280' }}>(optional)</span></label>
                  <input
                    className="ib-input"
                    placeholder="64-hex-char hash if you want tamper detect"
                    value={receiveDraft.cert_content_hash}
                    onChange={(e) => setReceiveDraft({ ...receiveDraft, cert_content_hash: e.target.value })}
                  />
                  <span className="ib-form-help">Run `sha256sum 2307.pdf` and paste — re-receipts with different bytes will be detectable.</span>
                </div>
                <div className="ib-form-cell">
                  <label className="ib-form-label">Notes <span style={{ color: '#6b7280' }}>(optional)</span></label>
                  <textarea
                    className="ib-textarea"
                    placeholder='e.g. "Received via email 5/15", "BIR-stamped original"'
                    value={receiveDraft.cert_notes}
                    onChange={(e) => setReceiveDraft({ ...receiveDraft, cert_notes: e.target.value })}
                  />
                </div>
                <div className="ib-row" style={{ justifyContent: 'flex-end' }}>
                  <button className="ib-btn ib-btn-secondary" onClick={() => setReceiveModalRow(null)}>Cancel</button>
                  <button className="ib-btn ib-btn-primary" disabled={!!savingId} onClick={onSubmitReceive}>
                    <Save size={14} /> {savingId ? 'Saving…' : 'Save Received'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Exclude modal */}
          {excludeModalRow && (
            <div className="ib-modal-backdrop" onClick={() => setExcludeModalRow(null)}>
              <div className="ib-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ib-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Exclude row from 1702 credit</h2>
                  <button className="ib-btn ib-btn-secondary" onClick={() => setExcludeModalRow(null)}><X size={14} /></button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.75rem' }}>
                  CR <strong>{excludeModalRow.cr_no || excludeModalRow._id}</strong> · {excludeModalRow.hospital_name} ·
                  {' '}<strong>₱{fmtMoney(excludeModalRow.cwt_amount)}</strong> CWT
                </p>
                <div className="ib-form-cell">
                  <label className="ib-form-label">Reason <span style={{ color: '#b91c1c' }}>*</span></label>
                  <textarea
                    className="ib-textarea"
                    placeholder='e.g. "Duplicate of CR 1232 — hospital re-issued", "Void — collection reversed"'
                    value={excludeReason}
                    onChange={(e) => setExcludeReason(e.target.value)}
                  />
                </div>
                <div className="ib-row" style={{ justifyContent: 'flex-end' }}>
                  <button className="ib-btn ib-btn-secondary" onClick={() => setExcludeModalRow(null)}>Cancel</button>
                  <button className="ib-btn ib-btn-danger" disabled={!!savingId || !excludeReason.trim()} onClick={onSubmitExclude}>
                    <Ban size={14} /> Exclude
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
