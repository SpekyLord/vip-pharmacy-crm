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
// Phase P1.2 Slice 7-extension Round 2C — picker on the Mark-Received modal.
// The page's `cert_2307_url` field is a typed URL (Drive / S3 / shared folder
// link), not a re-uploaded file. The picker uses skipFetch=true so it bypasses
// the in-browser cross-origin S3 fetch (private bucket has no CORS allowlist
// for browser origins) and writes the bare S3 URL straight into the field —
// the same Round 2A pattern that SalesList per-row Attach CSI uses.
import PendingCapturesPicker from '../components/PendingCapturesPicker';

const STATUS_META = {
  PENDING_2307: { label: 'Pending 2307',  bg: '#fef9c3', fg: '#854d0e' },
  RECEIVED:     { label: 'Received',      bg: '#dcfce7', fg: '#15803d' },
  EXCLUDED:     { label: 'Excluded',      bg: '#fee2e2', fg: '#b91c1c' },
  // Phase P1.2 Phase 1 (May 06 2026) — implicit pseudo-status for the row
  // pill when status='PENDING_2307' AND cert_2307_url IS NOT NULL AND
  // physical_received_at IS NULL. The DB row is still PENDING_2307; this
  // is purely a frontend visual state for the new PHOTO_ATTACHED tab.
  PHOTO_ATTACHED: { label: 'Photo attached', bg: '#fef3c7', fg: '#92400e' },
};

// Phase P1.2 Phase 1 (May 06 2026) — row classifier for the PHOTO_ATTACHED
// tab + per-row pill. Returns the EFFECTIVE status the UI shows, not the DB
// `status` column. Used by both the tab filter and the row pill renderer.
function effectiveStatus(row) {
  if (row.status === 'PENDING_2307' && row.cert_2307_url && !row.physical_received_at) {
    return 'PHOTO_ATTACHED';
  }
  return row.status;
}

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
  // Phase P1.2 Slice 7-extension Round 2C — when finance picks a 2307 photo
  // via the "From BDM Captures" picker, this holds the source CaptureSubmission
  // _id so onSubmitReceive can forward it to the controller for back-link +
  // lifecycle advance. Cleared on modal close + on receive success.
  const [pickedCaptureId, setPickedCaptureId] = useState(null);
  // Phase P1.2 Phase 1 (May 06 2026) — Option D audit gate. Default UNCHECKED
  // so finance must explicitly attest the paper certificate is in the Iloilo
  // office archive before the row flips to RECEIVED + 1702 credit unlocks.
  // Photo-only saves (unchecked) keep status='PENDING_2307' but stamp cert_*
  // — that's the new PHOTO_ATTACHED state.
  const [paperReceived, setPaperReceived] = useState(false);
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

  // Phase P1.2 Phase 1 (May 06 2026) — pre-compute effectiveStatus for every
  // row so the tab counts AND the filter both stay consistent (no risk of a
  // row appearing on the PHOTO_ATTACHED tab but showing a "Pending" pill in
  // its row, or vice versa).
  const rowsWithEffective = useMemo(
    () => rows.map(r => ({ ...r, _effective: effectiveStatus(r) })),
    [rows],
  );

  // Tab counts are computed off the SAME effective-status that drives the
  // tab filter, so the Pending count shrinks when rows move into
  // PHOTO_ATTACHED state (matches the user's mental model — "pending" means
  // "we have no photo yet").
  const tabCounts = useMemo(() => {
    const c = { PENDING_2307: 0, PHOTO_ATTACHED: 0, RECEIVED: 0, EXCLUDED: 0, ALL: rowsWithEffective.length };
    for (const r of rowsWithEffective) {
      if (c[r._effective] !== undefined) c[r._effective] += 1;
    }
    return c;
  }, [rowsWithEffective]);

  const filteredRows = useMemo(() => {
    let r = rowsWithEffective;
    if (activeTab !== 'ALL') r = r.filter(x => x._effective === activeTab);
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
  }, [rowsWithEffective, activeTab, search, hospitalFilter]);

  const onOpenReceive = (row) => {
    setReceiveModalRow(row);
    setReceiveDraft({
      cert_2307_url: row.cert_2307_url || '',
      cert_filename: row.cert_filename || '',
      cert_content_hash: row.cert_content_hash || '',
      cert_notes: row.cert_notes || '',
    });
    // Round 2C — fresh modal open clears the previously-picked capture
    // (typed-URL flow + manual entry don't carry a capture_id audit link).
    setPickedCaptureId(null);
    // Phase P1.2 Phase 1 (May 06 2026) — Option D audit gate. Pre-tick the
    // checkbox if the row is ALREADY RECEIVED + has physical_received_at set
    // (re-opening a previously-attested row to fix a typo in cert_filename).
    // Otherwise default UNCHECKED — finance must explicitly attest each time.
    setPaperReceived(row.status === 'RECEIVED' && !!row.physical_received_at);
  };

  const onCloseReceive = () => {
    setReceiveModalRow(null);
    setPickedCaptureId(null);
    setPaperReceived(false);
  };

  // Round 2C picker callback (skipFetch=true mode). The picker hands back
  // raw capture rows in meta.captures — we take the first artifact's bare S3
  // URL and write it straight into cert_2307_url, auto-fill cert_filename
  // from the artifact key when available, and remember capture_id so
  // onSubmitReceive can forward it for back-linking + lifecycle advance.
  const onPickFromCaptures = (_files, meta) => {
    const cap = meta?.captures?.[0];
    if (!cap) return;
    const bareUrl = cap?.captured_artifacts?.[0]?.url || '';
    if (!bareUrl) {
      toast.error('Picked capture has no photo URL. Pick a different one or fall back to manual entry.');
      return;
    }
    // Cert filename: prefer the artifact key tail (the captured photo's
    // original filename), fall back to whatever finance had typed manually.
    const artifactKey = cap?.captured_artifacts?.[0]?.key || '';
    const fnameTail = artifactKey ? artifactKey.split('/').pop() : '';
    setReceiveDraft((prev) => ({
      ...prev,
      cert_2307_url: bareUrl,
      cert_filename: fnameTail || prev.cert_filename || '',
      // cert_content_hash + cert_notes stay manual — hash is computed by
      // finance from the actual file bytes (defeats Round 2A's CORS-avoidance
      // if we tried to compute it client-side); notes are human judgment.
    }));
    setPickedCaptureId(cap._id);
  };

  const onSubmitReceive = async () => {
    if (!receiveModalRow) return;
    // Phase P1.2 Phase 1 (May 06 2026) — Option D defense in depth. Cannot
    // attest paper-received without first attaching photo evidence. The
    // checkbox is also disabled in the render path; this is the redundant
    // client gate before the API call.
    if (paperReceived && !receiveDraft.cert_2307_url?.trim()) {
      toast.error('Attach the photo evidence (Certificate URL) before attesting paper-received.');
      return;
    }
    setSavingId(receiveModalRow._id);
    try {
      // Round 2C — capture_id is appended to the body when the URL came from
      // the picker. Backend extracts it before delegating to
      // cwt2307ReconciliationService and best-effort calls
      // linkCaptureToDocument so the source CaptureSubmission flips out of
      // PENDING_PROXY and back-links to this CwtLedger row.
      //
      // Phase 1 — paper_received attestation forwarded so the controller
      // knows whether to flip status RECEIVED + stamp physical_received_at
      // (true) or just stamp cert_* fields and leave status PENDING_2307
      // (false → PHOTO_ATTACHED implicit state).
      const payload = {
        ...receiveDraft,
        paper_received: !!paperReceived,
      };
      if (pickedCaptureId) payload.capture_id = pickedCaptureId;
      await birService.markReceived2307Inbound(year, receiveModalRow._id, payload);
      toast.success(paperReceived
        ? 'Marked RECEIVED — paper attested, credit will roll into 1702.'
        : 'Photo evidence attached — mark received when paper arrives at the Iloilo office.');
      onCloseReceive();
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
                  {/*
                    Phase P1.2 Phase 1 (May 06 2026) — tabs split PENDING into
                    two: rows with no photo evidence (no cert_2307_url), and
                    rows with photo attached but paper not yet attested
                    (PHOTO_ATTACHED). Counts come from `tabCounts` (computed
                    off effective-status) not `totals` (server's status-only
                    breakdown), so the Pending count shrinks as rows move
                    into PHOTO_ATTACHED — matches the user's mental model.
                  */}
                  <div role="tab" className={`ib-tab ${activeTab === 'PENDING_2307' ? 'active' : ''}`} onClick={() => setActiveTab('PENDING_2307')}>
                    Pending ({tabCounts.PENDING_2307})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'PHOTO_ATTACHED' ? 'active' : ''}`} onClick={() => setActiveTab('PHOTO_ATTACHED')}>
                    Photo attached ({tabCounts.PHOTO_ATTACHED})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'RECEIVED' ? 'active' : ''}`} onClick={() => setActiveTab('RECEIVED')}>
                    Received ({tabCounts.RECEIVED})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'EXCLUDED' ? 'active' : ''}`} onClick={() => setActiveTab('EXCLUDED')}>
                    Excluded ({tabCounts.EXCLUDED})
                  </div>
                  <div role="tab" className={`ib-tab ${activeTab === 'ALL' ? 'active' : ''}`} onClick={() => setActiveTab('ALL')}>
                    All ({tabCounts.ALL})
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
                          // Phase P1.2 Phase 1 (May 06 2026) — render via
                          // effective-status so PHOTO_ATTACHED rows show the
                          // amber "Photo attached" pill instead of bare
                          // "Pending 2307". Falls through to legacy
                          // STATUS_META[r.status] for the canonical statuses.
                          const meta = STATUS_META[r._effective] || STATUS_META[r.status] || STATUS_META.PENDING_2307;
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
            <div className="ib-modal-backdrop" onClick={onCloseReceive}>
              <div className="ib-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ib-row" style={{ justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Mark 2307 Received</h2>
                  <button className="ib-btn ib-btn-secondary" onClick={onCloseReceive}><X size={14} /></button>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '0.75rem' }}>
                  CR <strong>{receiveModalRow.cr_no || receiveModalRow._id}</strong> · {receiveModalRow.hospital_name} ·
                  {' '}<strong>₱{fmtMoney(receiveModalRow.cwt_amount)}</strong> CWT · {receiveModalRow.quarter} {receiveModalRow.year}
                </p>

                {/* Phase P1.2 Slice 7-extension Round 2C — pull the 2307 photo
                    a BDM uploaded via Capture Hub. bdmId={null} → cross-BDM
                    scope (the page is finance-organized by CR row, not by
                    BDM, so finance visually matches by amount + hospital).
                    skipFetch=true bypasses the cross-origin S3 fetch (private
                    bucket has no CORS allowlist) and writes the bare S3 URL
                    straight into cert_2307_url. Server still gates the queue
                    read via lookup-driven CAPTURE_LIFECYCLE_ROLES.PROXY_PULL_CAPTURE
                    (defaults admin / finance / president).

                    Phase P1.2 Phase 1 (May 06 2026) — workflow_type flipped
                    from 'CWT_INBOUND' (dropped) to 'COLLECTION' + sub_type
                    filter 'CWT'. CWT collapsed into COLLECTION because
                    hospitals send CR + DEPOSIT + CWT together as one
                    package. UNCATEGORIZED stays in the workflowTypes array
                    as a fallback (Quick Capture rows the proxy hasn't yet
                    classified) — and intentionally has NO sub_type entry in
                    subTypeFilter so it iterates without narrowing. */}
                <div style={{ marginBottom: '0.75rem', padding: '0.6rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
                  <div style={{ fontSize: '0.78rem', color: '#075985', fontWeight: 600, marginBottom: 6 }}>
                    Pull from Capture Hub
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#0369a1', marginBottom: 8 }}>
                    Pick a 2307 photo a BDM already uploaded — saves you re-uploading from a shared drive.
                  </div>
                  <PendingCapturesPicker
                    workflowTypes={['COLLECTION', 'UNCATEGORIZED']}
                    subTypeFilter={{ COLLECTION: 'CWT' }}
                    bdmId={null}
                    skipFetch={true}
                    maxSelect={1}
                    buttonLabel="From BDM Captures"
                    onPick={onPickFromCaptures}
                  />
                  {pickedCaptureId && (
                    <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: 6 }}>
                      ✓ Linked to BDM Capture — saving will mark the source capture PROCESSED.
                    </div>
                  )}
                </div>

                <div className="ib-form-cell">
                  <label className="ib-form-label">Certificate URL or path</label>
                  <input
                    className="ib-input"
                    placeholder="https://drive.google.com/… or s3://… or /shared/2307s/2026/Q2/cr-1234.pdf"
                    value={receiveDraft.cert_2307_url}
                    onChange={(e) => {
                      // Manual edit invalidates the picker linkage — finance
                      // is overriding the picked URL, so we drop capture_id
                      // to avoid stamping a stale back-link.
                      setReceiveDraft({ ...receiveDraft, cert_2307_url: e.target.value });
                      if (pickedCaptureId) setPickedCaptureId(null);
                    }}
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

                {/*
                  Phase P1.2 Phase 1 (May 06 2026) — Option D audit gate.
                  The paper attestation is the ONLY signal that flips status
                  → RECEIVED + unlocks the 1702 credit. Photo evidence alone
                  (cert_2307_url) keeps status at PENDING_2307 / PHOTO_ATTACHED.
                  Disabled until cert_2307_url is non-empty (server-side mirror
                  rejects paper_received=true with empty URL — defense in depth).
                  Default UNCHECKED on fresh modal open so finance must act.
                */}
                <div
                  style={{
                    marginTop: '0.4rem',
                    marginBottom: '0.6rem',
                    padding: '0.7rem',
                    background: paperReceived ? '#f0fdf4' : '#fef9c3',
                    border: `1px solid ${paperReceived ? '#86efac' : '#fde68a'}`,
                    borderRadius: 6,
                  }}
                >
                  <label
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: receiveDraft.cert_2307_url?.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    <input
                      type="checkbox"
                      checked={paperReceived}
                      disabled={!receiveDraft.cert_2307_url?.trim()}
                      onChange={(e) => setPaperReceived(e.target.checked)}
                      style={{ marginTop: 3, width: 18, height: 18, accentColor: '#15803d' }}
                      data-testid="paper-received-checkbox"
                    />
                    <span style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.4 }}>
                      <strong>I confirm the paper certificate is in the Iloilo office archive.</strong>
                      <br />
                      <span style={{ fontSize: '0.74rem', color: '#6b7280' }}>
                        BIR RR No. 2-98 requires the paper certificate as documentary evidence
                        for the 1702 Creditable Tax Withheld credit. Photo evidence alone is
                        not sufficient — the credit only unlocks when the paper is filed in
                        audit-defendable storage.
                      </span>
                    </span>
                  </label>
                  {!receiveDraft.cert_2307_url?.trim() && (
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginTop: 6 }}>
                      Attach photo evidence first (paste a URL or pick from BDM Captures).
                    </div>
                  )}
                </div>

                <div className="ib-row" style={{ justifyContent: 'flex-end' }}>
                  <button className="ib-btn ib-btn-secondary" onClick={onCloseReceive}>Cancel</button>
                  <button
                    className="ib-btn ib-btn-primary"
                    disabled={!!savingId || !receiveDraft.cert_2307_url?.trim()}
                    onClick={onSubmitReceive}
                    data-testid="save-receive-btn"
                  >
                    <Save size={14} />
                    {savingId
                      ? 'Saving…'
                      : (paperReceived ? 'Save — Mark RECEIVED' : 'Save Photo Only')}
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
