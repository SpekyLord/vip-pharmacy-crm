/**
 * CSI Booklets Page — Phase 15.2
 * Booklet master, weekly allocation, usage stats
 */
import { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { showError } from '../utils/errorToast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useReports from '../hooks/useReports';
import usePeople from '../hooks/usePeople';
import useSales from '../hooks/useSales';
import { useLookupOptions } from '../hooks/useLookups';
import useErpSubAccess from '../hooks/useErpSubAccess';
import WorkflowGuide from '../components/WorkflowGuide';
import { AuthContext } from '../../context/AuthContextObject';
import api from '../../services/api';

const pageStyles = `
  /* Mirrors SalesList .sales-nav-tabs for visual parity (Apr 2026). */
  .sales-nav-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 12px;
    padding: 6px;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 10px;
    background: var(--erp-panel, #fff);
  }
  .sales-nav-tabs::-webkit-scrollbar { height: 0; }
  .sales-nav-tab {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    color: var(--erp-text, #132238);
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    line-height: 1.2;
  }
  .sales-nav-tab.active {
    background: var(--erp-accent, #1e5eff);
    color: #fff;
  }
  .sales-nav-tab:hover {
    border-color: var(--erp-border, #dbe4f0);
  }

  .booklet-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .booklet-shell { display: flex; flex: 1; min-width: 0; }
  .booklet-main { flex: 1; min-width: 0; padding: 24px; max-width: 1240px; margin: 0 auto; }
  .booklet-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-end; margin-bottom: 18px; flex-wrap: wrap; }
  .booklet-header h1 { font-size: 24px; color: var(--erp-text); margin: 0 0 4px; }
  .booklet-header p { color: var(--erp-muted); font-size: 13px; margin: 0; max-width: 680px; line-height: 1.5; }
  .booklet-hero { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr); gap: 14px; margin-bottom: 18px; }
  .booklet-panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 18px; padding: 18px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
  .booklet-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .booklet-kpi { background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%); border: 1px solid var(--erp-border); border-radius: 14px; padding: 14px; }
  .booklet-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .booklet-kpi-value { font-size: 24px; font-weight: 800; color: var(--erp-text); margin-top: 4px; }
  .booklet-kpi-sub { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .booklet-quick { display: flex; flex-direction: column; gap: 10px; }
  .booklet-quick-note { font-size: 13px; color: var(--erp-muted); line-height: 1.55; }
  .booklet-quick-list { display: grid; gap: 8px; }
  .booklet-quick-item { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: #f8fafc; border: 1px solid var(--erp-border); font-size: 12px; color: var(--erp-text); }
  .booklet-quick-dot { width: 8px; height: 8px; border-radius: 999px; background: #2563eb; margin-top: 5px; flex-shrink: 0; }
  .form-row { display: grid; grid-template-columns: 1.25fr 0.8fr 0.8fr auto; gap: 10px; align-items: end; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 10px 16px; border: none; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .btn-primary { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 18px; padding: 18px; margin-bottom: 16px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06); }
  .panel-title-row { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; margin-bottom: 14px; flex-wrap: wrap; }
  .panel-title-row h3 { margin: 0; font-size: 15px; color: var(--erp-text); }
  .panel-title-row p { margin: 4px 0 0; font-size: 12px; color: var(--erp-muted); line-height: 1.45; }
  .table-wrap { overflow-x: auto; border-radius: 14px; border: 1px solid var(--erp-border); }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 10px 10px; background: var(--erp-accent-soft); font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--erp-muted); position: sticky; top: 0; z-index: 1; }
  .data-table td { padding: 10px 10px; border-top: 1px solid var(--erp-border); background: var(--erp-panel); vertical-align: top; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-exhausted { background: #fef2f2; color: #991b1b; }
  .badge-void { background: #e2e8f0; color: #475569; }
  .usage-bar { width: 80px; height: 8px; background: #e2e8f0; border-radius: 4px; display: inline-block; }
  .usage-fill { height: 100%; background: #2563eb; border-radius: 4px; }
  .alloc-section { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--erp-border); }
  .empty-state { text-align: center; color: var(--erp-muted); padding: 28px 16px; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  .booklet-body { display: grid; gap: 16px; }
  .booklet-mobile-list { display: none; }
  .booklet-card { border: 1px solid var(--erp-border); border-radius: 16px; background: var(--erp-panel); padding: 14px; box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05); }
  .booklet-card-top { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .booklet-card-code { font-size: 15px; font-weight: 800; color: var(--erp-text); }
  .booklet-card-series { font-size: 12px; color: var(--erp-muted); margin-top: 2px; }
  .booklet-card-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
  .booklet-card-chip { background: #f8fafc; border: 1px solid var(--erp-border); border-radius: 12px; padding: 10px 12px; }
  .booklet-card-chip-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--erp-muted); font-weight: 700; }
  .booklet-card-chip-value { font-size: 13px; font-weight: 700; color: var(--erp-text); margin-top: 4px; }
  .booklet-card-footer { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
  .booklet-card-progress { flex: 1; min-width: 140px; }
  .booklet-card-actions { display: flex; gap: 8px; margin-top: 12px; }
  .booklet-alloc-card { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--erp-border); }
  @media(max-width: 900px) {
    .booklet-main { padding: 16px; }
    .booklet-hero { grid-template-columns: 1fr; }
    .booklet-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .data-table { font-size: 12px; }
    .panel { padding: 16px; }
    .form-row { grid-template-columns: 1fr 1fr; }
    .form-row .btn { grid-column: 1 / -1; width: 100%; }
  }

  @media(max-width: 768px) {
    .booklet-page { padding-top: 12px; }
    .booklet-main { padding: 76px 12px 96px; }
    .booklet-header h1 { font-size: 20px; }
    .booklet-kpis { grid-template-columns: 1fr 1fr; }
    .booklet-mobile-list { display: grid; gap: 10px; }
    .table-wrap { display: none; }
    .form-row { grid-template-columns: 1fr; }
    .form-group input { width: 100%; }
    .btn { width: 100%; }
    .booklet-card-meta { grid-template-columns: 1fr 1fr; }
    .booklet-card-actions .btn { width: 100%; }
    .usage-bar { width: 100%; }
  }

  @media(max-width: 480px) {
    .booklet-page { padding-top: 16px; }
    .booklet-main { padding-top: 72px; padding-bottom: 104px; }
    .booklet-panel { padding: 14px; border-radius: 16px; }
    .booklet-header h1 { font-size: 18px; }
    .booklet-header p { font-size: 12px; }
    .booklet-kpi-value { font-size: 20px; }
    .panel { padding: 12px; border-radius: 14px; }
    .booklet-card-meta { grid-template-columns: 1fr; }
    .booklet-card-top { flex-direction: column; }
    .booklet-card-actions { flex-direction: column; }
  }
`;

export default function CsiBooklets() {
  const rpt = useReports();
  const people = usePeople();
  const sales = useSales();
  const { options: voidReasons } = useLookupOptions('ERP_CSI_VOID_REASONS');
  const { hasSubPermission } = useErpSubAccess();
  const { user } = useContext(AuthContext);
  // Contractor/admin view vs BDM self-service view. Drives page layout.
  const canManage = hasSubPermission('inventory', 'csi_booklets');

  // ── Tab nav (Apr 2026) — splits the busy CSI page into 3 sub-tabs.
  // Same visual pattern as SalesList/Expenses sales-nav-tabs, but the
  // tabs are state-driven so they live under one /erp/csi-booklets URL.
  // Hash-synced so the tab is shareable: /erp/csi-booklets#calibration
  const VALID_TABS = canManage
    ? ['drafts', 'booklets', 'calibration']
    : ['drafts', 'numbers', 'calibration'];
  const [activeTab, setActiveTab] = useState(() => {
    const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
    return VALID_TABS.includes(hash) ? hash : 'drafts';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash.replace('#', '') === activeTab) return;
    window.history.replaceState(null, '', `#${activeTab}`);
  }, [activeTab]);
  // If role changes (rare), keep tab valid
  useEffect(() => {
    if (!VALID_TABS.includes(activeTab)) setActiveTab('drafts');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  // ── Phase 15.3 — Drafts Pending Print + Printer Calibration ─────
  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [calib, setCalib] = useState({
    x: Number(user?.csi_printer_offset_x_mm) || 0,
    y: Number(user?.csi_printer_offset_y_mm) || 0,
  });
  const [calibSaving, setCalibSaving] = useState(false);

  const loadDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await sales.getDraftsPendingCsi();
      setDrafts(res?.data || []);
    } catch (err) {
      console.warn('[CsiBooklets] drafts load failed:', err.message);
    }
    setDraftsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [calibSavedFlash, setCalibSavedFlash] = useState(false);
  const saveCalibration = useCallback(async () => {
    setCalibSaving(true);
    try {
      await api.put('/users/profile', {
        csi_printer_offset_x_mm: Number(calib.x) || 0,
        csi_printer_offset_y_mm: Number(calib.y) || 0,
      });
      setCalibSavedFlash(true);
      setTimeout(() => setCalibSavedFlash(false), 2500);
    } catch (err) {
      showError(err, 'Could not save calibration');
    }
    setCalibSaving(false);
  }, [calib]);

  useEffect(() => {
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local calib input in sync if user profile refreshes elsewhere
  useEffect(() => {
    setCalib({
      x: Number(user?.csi_printer_offset_x_mm) || 0,
      y: Number(user?.csi_printer_offset_y_mm) || 0,
    });
  }, [user?.csi_printer_offset_x_mm, user?.csi_printer_offset_y_mm]);
  // ─────────────────────────────────────────────────────────────────
  const [booklets, setBooklets] = useState([]);
  const [bdms, setBdms] = useState([]);
  // BDM self-service: just their available numbers (read-only list).
  const [myAvailable, setMyAvailable] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ booklet_code: '', series_start: '', series_end: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [allocForm, setAllocForm] = useState({
    assigned_to: '',
    week_start: '',
    week_end: '',
    range_start: '',
    range_end: ''
  });
  const [voidModal, setVoidModal] = useState(null); // { booklet, allocIdx, number } or null
  const [voidForm, setVoidForm] = useState({ reason: '', reason_note: '', file: null });
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [proofPreview, setProofPreview] = useState(null); // { url } or null

  const stats = useMemo(() => {
    const total = booklets.length;
    const active = booklets.filter(b => b.status === 'ACTIVE').length;
    const exhausted = booklets.filter(b => b.status === 'EXHAUSTED').length;
    const assigned = booklets.filter(b => !!b.assigned_to).length;
    const used = booklets.reduce((sum, b) => sum + (Number(b.used_count) || 0), 0);
    const totalNumbers = booklets.reduce((sum, b) => sum + (Number(b.total_numbers) || 0), 0);
    const usageRate = totalNumbers > 0 ? Math.round((used / totalNumbers) * 100) : 0;
    return { total, active, exhausted, assigned, used, totalNumbers, usageRate };
  }, [booklets]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpt.getCsiBooklets();
      setBooklets(res?.data || []);
    } catch (err) {
      console.error('[CsiBooklets] load error:', err.message);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBdms = useCallback(async () => {
    try {
      // Fetch people who can receive CSI allocations — any active person with a login.
      const res = await people.getPeopleList({ status: 'ACTIVE', has_login: true });
      setBdms(res?.data || []);
    } catch (err) {
      console.warn('[CsiBooklets] BDM list load failed:', err.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMyAvailable = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rpt.getAvailableCsiNumbers();
      setMyAvailable(res?.data || []);
    } catch (err) {
      console.error('[CsiBooklets] my-available load error:', err.message);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Contractor/admin sees the full management UI; BDM sees a read-only
    // "My CSI" list pulled from the non-gated /my-csi/available endpoint.
    if (canManage) {
      load();
      loadBdms();
    } else {
      loadMyAvailable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  const handleCreate = async () => {
    if (!form.booklet_code || !form.series_start || !form.series_end) return;
    try {
      await rpt.createBooklet({ booklet_code: form.booklet_code, series_start: Number(form.series_start), series_end: Number(form.series_end) });
      setForm({ booklet_code: '', series_start: '', series_end: '' });
      load();
    } catch (err) { showError(err, 'Could not save booklet'); }
  };

  const handleAllocate = async (bookletId) => {
    if (!allocForm.range_start || !allocForm.range_end) {
      showError({ message: 'Range Start and Range End are required' }, 'Missing fields');
      return;
    }
    try {
      const payload = {
        range_start: Number(allocForm.range_start),
        range_end: Number(allocForm.range_end)
      };
      // Optional fields — only include if set
      if (allocForm.assigned_to) payload.assigned_to = allocForm.assigned_to;
      if (allocForm.week_start) payload.week_start = allocForm.week_start;
      if (allocForm.week_end) payload.week_end = allocForm.week_end;

      await rpt.allocateCsiRange(bookletId, payload);
      setAllocForm({ assigned_to: '', week_start: '', week_end: '', range_start: '', range_end: '' });
      load();
    } catch (err) {
      showError(err, 'Could not allocate numbers');
    }
  };

  const openVoidModal = (booklet, allocIdx, number) => {
    setVoidForm({ reason: '', reason_note: '', file: null });
    setVoidModal({ booklet, allocIdx, number });
  };

  const closeVoidModal = () => {
    setVoidModal(null);
    setVoidForm({ reason: '', reason_note: '', file: null });
  };

  const submitVoid = async () => {
    if (!voidModal || !voidForm.reason || !voidForm.file) {
      showError({ message: 'Reason and proof image are required' }, 'Missing fields');
      return;
    }
    setVoidSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('number', String(voidModal.number));
      fd.append('reason', voidForm.reason);
      if (voidForm.reason_note) fd.append('reason_note', voidForm.reason_note);
      fd.append('proof', voidForm.file);
      await rpt.voidCsiNumber(voidModal.booklet._id, voidModal.allocIdx, fd);
      closeVoidModal();
      load();
    } catch (err) {
      showError(err, 'Could not void CSI number');
    }
    setVoidSubmitting(false);
  };

  const viewProof = async (bookletId, allocIdx, voidIdx) => {
    try {
      const res = await rpt.getCsiVoidProof(bookletId, allocIdx, voidIdx);
      const url = res?.data?.url;
      if (url) setProofPreview({ url });
    } catch (err) {
      showError(err, 'Could not fetch proof image');
    }
  };

  return (
    <div className="booklet-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="booklet-shell">
        <Sidebar />
        <div className="booklet-main">
          <WorkflowGuide pageKey="csi-booklets" />

          {/* Apr 2026 — sub-tabs (matches SalesList sales-nav-tabs styling) */}
          <div className="sales-nav-tabs" role="tablist" aria-label="CSI navigation" style={{ marginBottom: 16 }}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'drafts'}
              className={`sales-nav-tab${activeTab === 'drafts' ? ' active' : ''}`}
              onClick={() => setActiveTab('drafts')}
            >Drafts to Print</button>
            {canManage ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'booklets'}
                className={`sales-nav-tab${activeTab === 'booklets' ? ' active' : ''}`}
                onClick={() => setActiveTab('booklets')}
              >Booklets &amp; Allocations</button>
            ) : (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'numbers'}
                className={`sales-nav-tab${activeTab === 'numbers' ? ' active' : ''}`}
                onClick={() => setActiveTab('numbers')}
              >My CSI Numbers</button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'calibration'}
              className={`sales-nav-tab${activeTab === 'calibration' ? ' active' : ''}`}
              onClick={() => setActiveTab('calibration')}
            >Calibration</button>
          </div>

          {/* Phase 15.3 — Drafts Pending Print */}
          {activeTab === 'drafts' && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title-row">
              <div>
                <h3>Drafts Pending Print</h3>
                <p>
                  Sales keyed in the ERP that still need the BDM to print the overlay PDF onto a
                  BIR booklet page, write the real CSI#, and scan it back.
                  &nbsp;<em>This PDF is NOT a valid BIR receipt — it only overlays variable data
                  onto the pre-printed booklet.</em>
                </p>
              </div>
              <button
                className="btn btn-sm"
                onClick={loadDrafts}
                disabled={draftsLoading}
              >
                {draftsLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {draftsLoading && <div className="loading">Loading drafts…</div>}
            {!draftsLoading && drafts.length === 0 && (
              <div className="empty-state">
                <p>No sales waiting for CSI overlay. You&apos;re all caught up.</p>
              </div>
            )}
            {!draftsLoading && drafts.length > 0 && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>CSI Date</th>
                      <th>BDM (Owner)</th>
                      <th>Customer</th>
                      <th style={{ textAlign: 'right' }}>Lines</th>
                      <th style={{ textAlign: 'right' }}>Amount Due</th>
                      <th>Status</th>
                      <th style={{ width: 180 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d) => (
                      <tr key={d._id}>
                        <td>{d.csi_date ? new Date(d.csi_date).toLocaleDateString() : '-'}</td>
                        <td>{d.bdm_name || '-'}</td>
                        <td>{d.customer_name || '-'}</td>
                        <td className="num">{d.line_count}</td>
                        <td className="num">
                          {typeof d.total_amount_due === 'number'
                            ? d.total_amount_due.toLocaleString('en-PH', { minimumFractionDigits: 2 })
                            : '-'}
                        </td>
                        <td><span className="badge">{d.status}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              className="btn btn-outline btn-sm"
                              title="Download overlay PDF for booklet feed"
                              onClick={() => window.open(sales.csiDraftUrl(d._id), '_blank')}
                            >
                              ⬇ Draft PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          )}

          {/* Phase 15.3 — Printer Calibration */}
          {activeTab === 'calibration' && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panel-title-row">
              <div>
                <h3>Printer Calibration</h3>
                <p>
                  Align the overlay with your printer once. Print the calibration grid onto a
                  <strong> blank booklet page</strong>, measure mm delta between the booklet&apos;s
                  &quot;Registered Name&quot; / &quot;Charged to&quot; line and the grid&apos;s red NAME crosshair. Enter
                  the delta here. Repeat if you change printers.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ minWidth: 140 }}>
                <label>Offset X (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="20"
                  value={calib.x}
                  onChange={(e) => setCalib((c) => ({ ...c, x: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ minWidth: 140 }}>
                <label>Offset Y (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="-20"
                  max="20"
                  value={calib.y}
                  onChange={(e) => setCalib((c) => ({ ...c, y: e.target.value }))}
                />
              </div>
              <button
                className="btn btn-outline btn-sm"
                title="Uses your current working entity's CSI template"
                onClick={() => window.open(sales.csiCalibrationUrl(), '_blank')}
              >
                ⬇ Print Calibration Grid
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={calibSaving}
                onClick={saveCalibration}
              >
                {calibSaving ? 'Saving…' : 'Save Calibration'}
              </button>
              {calibSavedFlash && (
                <span style={{ fontSize: 12, color: '#047857', fontWeight: 700 }}>✓ Saved</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 8, fontStyle: 'italic' }}>
              Tip: positive X shifts overlay RIGHT, positive Y shifts DOWN. Typical calibration
              is ±1–3 mm. Larger deltas usually mean wrong paper size selected in the print dialog.
            </div>
          </div>
          )}

          {(activeTab === 'booklets' || activeTab === 'numbers') && (
          <div className="booklet-header">
            <div>
              <h1>{canManage ? 'CSI Booklets' : 'My CSI Numbers'}</h1>
              <p>{canManage
                ? 'Record BIR-registered booklets, allocate small number ranges (typically 3–7) to BDMs, and track usage. Validation is monitoring-only — sales will never be blocked.'
                : 'Here are the CSI numbers allocated to you by HQ. Use them on your sales. Numbers get auto-marked "used" when your sales post.'}
              </p>
            </div>
          </div>
          )}

          {/* BDM self-service view — simple read-only list */}
          {!canManage && activeTab === 'numbers' && (
            <div className="panel" style={{ marginTop: 14 }}>
              {loading && <div className="loading">Loading your CSI numbers…</div>}
              {!loading && myAvailable.length === 0 && (
                <div className="empty-state">
                  <p style={{ marginBottom: 8 }}><strong>No CSI numbers allocated to you.</strong></p>
                  <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                    If you are based in Iloilo HQ and use the physical booklets directly, no allocation is needed — you can type any valid CSI on your sales.
                    <br />
                    If you are based outside Iloilo, please contact HQ to request an allocation.
                  </p>
                </div>
              )}
              {!loading && myAvailable.length > 0 && (() => {
                // Group by booklet for a cleaner display
                const grouped = myAvailable.reduce((acc, n) => {
                  const key = n.booklet_id?.toString() || 'unknown';
                  if (!acc[key]) acc[key] = { booklet_code: n.booklet_code, numbers: [] };
                  acc[key].numbers.push(n.number);
                  return acc;
                }, {});
                return (
                  <>
                    <div className="booklet-kpis" style={{ marginBottom: 14 }}>
                      <div className="booklet-kpi">
                        <div className="booklet-kpi-label">Available</div>
                        <div className="booklet-kpi-value">{myAvailable.length}</div>
                        <div className="booklet-kpi-sub">CSI numbers ready to use</div>
                      </div>
                      <div className="booklet-kpi">
                        <div className="booklet-kpi-label">Booklets</div>
                        <div className="booklet-kpi-value">{Object.keys(grouped).length}</div>
                        <div className="booklet-kpi-sub">Source booklets</div>
                      </div>
                    </div>
                    {Object.entries(grouped).map(([key, g]) => (
                      <div key={key} style={{ padding: 12, background: '#f8fafc', borderRadius: 12, marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Booklet {g.booklet_code}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {g.numbers.map(n => (
                            <span key={n} style={{
                              fontSize: 13, padding: '4px 10px', borderRadius: 6,
                              background: '#dbeafe', color: '#1e40af',
                              border: '1px solid #93c5fd', fontWeight: 600
                            }}>#{n}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginTop: 10, fontStyle: 'italic' }}>
                      Used or voided numbers are removed from this list automatically. If you think a number is missing, contact HQ.
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Contractor/admin view — full management UI */}
          {canManage && activeTab === 'booklets' && <>


          <div className="booklet-hero">
            <div className="booklet-panel">
              <div className="booklet-kpis">
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Booklets</div>
                  <div className="booklet-kpi-value">{stats.total}</div>
                  <div className="booklet-kpi-sub">Total series created</div>
                </div>
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Active</div>
                  <div className="booklet-kpi-value">{stats.active}</div>
                  <div className="booklet-kpi-sub">Available for allocation</div>
                </div>
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Assigned</div>
                  <div className="booklet-kpi-value">{stats.assigned}</div>
                  <div className="booklet-kpi-sub">Linked to people</div>
                </div>
                <div className="booklet-kpi">
                  <div className="booklet-kpi-label">Usage</div>
                  <div className="booklet-kpi-value">{stats.usageRate}%</div>
                  <div className="booklet-kpi-sub">Across all numbers</div>
                </div>
              </div>
            </div>

            <div className="booklet-panel booklet-quick">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--erp-text)' }}>How it works</div>
                <div className="booklet-quick-note">Iloilo HQ holds the physical BIR booklets. Contractors allocate small ranges (3–7 numbers) to each BDM. When a sale posts, the CSI number is auto-marked used — pure traceability.</div>
              </div>
              <div className="booklet-quick-list">
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Create a booklet (the BIR permit + number range).</div>
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Open a booklet → allocate a small range to a specific BDM.</div>
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Click any available number to void it with a photo proof — protects against off-book sales.</div>
                <div className="booklet-quick-item"><span className="booklet-quick-dot" />Monitoring-only: unknown CSIs get a yellow warning on sales, never blocked.</div>
              </div>
            </div>
          </div>

          <div className="booklet-body">
            <div className="panel">
              <div className="panel-title-row">
                <div>
                  <h3>New Booklet</h3>
                  <p>Enter the booklet code and full series range. Keep the range continuous to avoid number gaps.</p>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Booklet Code</label>
                  <input value={form.booklet_code} onChange={e => setForm(f => ({ ...f, booklet_code: e.target.value }))} placeholder="e.g., BK-001" />
                </div>
                <div className="form-group">
                  <label>Series Start</label>
                  <input type="number" value={form.series_start} onChange={e => setForm(f => ({ ...f, series_start: e.target.value }))} placeholder="1001" />
                </div>
                <div className="form-group">
                  <label>Series End</label>
                  <input type="number" value={form.series_end} onChange={e => setForm(f => ({ ...f, series_end: e.target.value }))} placeholder="1100" />
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>Create Booklet</button>
              </div>
            </div>

            {loading && <div className="loading">Loading...</div>}

            <div className="panel">
              <div className="panel-title-row">
                <div>
                  <h3>Booklet Inventory</h3>
                  <p>Open a booklet row to add weekly allocations and monitor usage.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>Code</th><th>Series</th><th>Assigned To</th><th style={{ textAlign: 'right' }}>Used</th><th style={{ textAlign: 'right' }}>Remaining</th><th>Usage</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {booklets.map(b => [
                        <tr key={b._id}>
                          <td style={{ fontWeight: 700 }}>{b.booklet_code}</td>
                          <td>{b.series_start} - {b.series_end}</td>
                          <td>{b.assigned_to?.name || b.assigned_to?.full_name || '-'}</td>
                          <td className="num">{b.used_count}</td>
                          <td className="num">{b.remaining_count}</td>
                          <td>
                            <div className="usage-bar">
                              <div className="usage-fill" style={{ width: `${b.total_numbers > 0 ? (b.used_count / b.total_numbers) * 100 : 0}%` }} />
                            </div>
                          </td>
                          <td><span className={`badge badge-${b.status?.toLowerCase()}`}>{b.status}</span></td>
                          <td>
                            <button className="btn btn-sm" onClick={() => setExpandedId(expandedId === b._id ? null : b._id)}>
                              {expandedId === b._id ? 'Close' : 'Allocate'}
                            </button>
                          </td>
                        </tr>,
                        expandedId === b._id && (
                          <tr key={b._id + '-alloc'}>
                            <td colSpan={8}>
                              <div className="alloc-section">
                                <strong style={{ fontSize: 12 }}>Allocations ({(b.allocations || []).length})</strong>
                                {(b.allocations || []).map((a, i) => {
                                  const allocOwner = a.assigned_to?.name || a.assigned_to?.full_name || b.assigned_to?.name || b.assigned_to?.full_name || 'Unassigned';
                                  const usedCount = a.used_numbers?.length || 0;
                                  const voidCount = a.voided_numbers?.length || 0;
                                  return (
                                    <div key={i} style={{ fontSize: 12, marginTop: 8, padding: 10, background: '#f8fafc', borderRadius: 8 }}>
                                      <div style={{ fontWeight: 700, color: 'var(--erp-text)' }}>
                                        #{a.range_start}–#{a.range_end} <span style={{ color: 'var(--erp-muted)', fontWeight: 500 }}>→ {allocOwner}</span>
                                      </div>
                                      <div style={{ color: 'var(--erp-muted)', marginTop: 2 }}>
                                        Used {usedCount} · Voided {voidCount} · {a.status}
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                        {Array.from({ length: a.range_end - a.range_start + 1 }, (_, idx) => a.range_start + idx).map(n => {
                                          const isUsed = (a.used_numbers || []).includes(n);
                                          const voidedIdx = (a.voided_numbers || []).findIndex(v => v.number === n);
                                          const isVoided = voidedIdx !== -1;
                                          const style = {
                                            fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid',
                                            background: isVoided ? '#fee2e2' : isUsed ? '#dbeafe' : '#f1f5f9',
                                            color: isVoided ? '#991b1b' : isUsed ? '#1e40af' : '#475569',
                                            borderColor: isVoided ? '#fca5a5' : isUsed ? '#93c5fd' : '#cbd5e1',
                                            cursor: isVoided ? 'pointer' : isUsed ? 'default' : 'pointer'
                                          };
                                          if (isVoided) {
                                            return <span key={n} style={style} title={a.voided_numbers[voidedIdx].reason} onClick={() => viewProof(b._id, i, voidedIdx)}>#{n} VOID</span>;
                                          }
                                          if (isUsed) {
                                            return <span key={n} style={style} title="Used on posted sale">#{n}</span>;
                                          }
                                          return <span key={n} style={style} title="Click to void" onClick={() => openVoidModal(b, i, n)}>#{n}</span>;
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                                <div style={{ marginTop: 12, padding: 10, border: '1px dashed var(--erp-border)', borderRadius: 8 }}>
                                  <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Allocate Numbers to BDM</strong>
                                  <div className="form-row">
                                    <div className="form-group">
                                      <label>Assign to BDM</label>
                                      <select value={allocForm.assigned_to} onChange={e => setAllocForm(f => ({ ...f, assigned_to: e.target.value }))}>
                                        <option value="">— Select BDM —</option>
                                        {bdms.filter(p => p.user_id).map(p => (
                                          <option key={p._id} value={typeof p.user_id === 'object' ? p.user_id._id : p.user_id}>{p.full_name || p.name}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="form-group">
                                      <label>Range Start</label>
                                      <input type="number" value={allocForm.range_start} onChange={e => setAllocForm(f => ({ ...f, range_start: e.target.value }))} />
                                    </div>
                                    <div className="form-group">
                                      <label>Range End</label>
                                      <input type="number" value={allocForm.range_end} onChange={e => setAllocForm(f => ({ ...f, range_end: e.target.value }))} />
                                    </div>
                                    <button className="btn btn-primary btn-sm" onClick={() => handleAllocate(b._id)}>Add Allocation</button>
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 6 }}>
                                    Tip: allocate a small range (typically 3–7 numbers) per BDM. Dates are no longer required.
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      ])}
                    {booklets.length === 0 && !loading && (
                      <tr><td colSpan={8}><div className="empty-state">No booklets created yet</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="booklet-mobile-list">
                {booklets.map((b) => {
                  const usagePercent = b.total_numbers > 0 ? (b.used_count / b.total_numbers) * 100 : 0;
                  const isOpen = expandedId === b._id;
                  return (
                    <div className="booklet-card" key={`mobile-${b._id}`}>
                      <div className="booklet-card-top">
                        <div>
                          <div className="booklet-card-code">{b.booklet_code}</div>
                          <div className="booklet-card-series">{b.series_start} - {b.series_end}</div>
                        </div>
                        <span className={`badge badge-${b.status?.toLowerCase()}`}>{b.status}</span>
                      </div>

                      <div className="booklet-card-meta">
                        <div className="booklet-card-chip">
                          <div className="booklet-card-chip-label">Assigned To</div>
                          <div className="booklet-card-chip-value">{b.assigned_to?.name || b.assigned_to?.full_name || 'Unassigned'}</div>
                        </div>
                        <div className="booklet-card-chip">
                          <div className="booklet-card-chip-label">Remaining</div>
                          <div className="booklet-card-chip-value">{b.remaining_count}</div>
                        </div>
                        <div className="booklet-card-chip">
                          <div className="booklet-card-chip-label">Used</div>
                          <div className="booklet-card-chip-value">{b.used_count}</div>
                        </div>
                        <div className="booklet-card-chip">
                          <div className="booklet-card-chip-label">Usage</div>
                          <div className="booklet-card-chip-value">{Math.round(usagePercent)}%</div>
                        </div>
                      </div>

                      <div className="booklet-card-footer">
                        <div className="booklet-card-progress">
                          <div className="usage-bar" style={{ width: '100%' }}>
                            <div className="usage-fill" style={{ width: `${usagePercent}%` }} />
                          </div>
                        </div>
                        <button className="btn btn-sm" onClick={() => setExpandedId(isOpen ? null : b._id)}>
                          {isOpen ? 'Hide Allocation' : 'Allocate'}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="booklet-alloc-card">
                          <div className="alloc-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                            <strong style={{ fontSize: 12 }}>Allocations ({(b.allocations || []).length})</strong>
                            {(b.allocations || []).map((a, i) => {
                              const allocOwner = a.assigned_to?.full_name || b.assigned_to?.full_name || 'Unassigned';
                              return (
                                <div key={i} style={{ fontSize: 12, marginTop: 6, padding: 8, background: '#f8fafc', borderRadius: 8 }}>
                                  <div style={{ fontWeight: 700 }}>#{a.range_start}–#{a.range_end} → {allocOwner}</div>
                                  <div style={{ color: 'var(--erp-muted)' }}>
                                    Used {a.used_numbers?.length || 0} · Voided {a.voided_numbers?.length || 0}
                                  </div>
                                </div>
                              );
                            })}
                            <div style={{ marginTop: 10 }}>
                              <div className="form-group">
                                <label>Assign to BDM</label>
                                <select value={allocForm.assigned_to} onChange={e => setAllocForm(f => ({ ...f, assigned_to: e.target.value }))}>
                                  <option value="">— Select BDM —</option>
                                  {bdms.map(p => (
                                    <option key={p._id} value={p._id}>{p.full_name || p.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label>Range Start</label>
                                <input type="number" value={allocForm.range_start} onChange={e => setAllocForm(f => ({ ...f, range_start: e.target.value }))} />
                              </div>
                              <div className="form-group">
                                <label>Range End</label>
                                <input type="number" value={allocForm.range_end} onChange={e => setAllocForm(f => ({ ...f, range_end: e.target.value }))} />
                              </div>
                              <button className="btn btn-primary btn-sm" onClick={() => handleAllocate(b._id)}>Add Allocation</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {booklets.length === 0 && !loading && (
                  <div className="empty-state">No booklets created yet</div>
                )}
              </div>
            </div>
          </div>
          </>}
        </div>
      </div>

      {voidModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
             onClick={(e) => { if (e.target === e.currentTarget) closeVoidModal(); }}>
          <div style={{ background: 'var(--erp-panel, #fff)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 460, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>Void CSI #{voidModal.number}</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--erp-muted)' }}>
              Upload a photo of the physical unused CSI (torn, cancelled, misprinted). This is your audit evidence.
            </p>
            <div style={{ marginTop: 14 }}>
              <div className="form-group">
                <label>Reason</label>
                <select value={voidForm.reason} onChange={e => setVoidForm(f => ({ ...f, reason: e.target.value }))}>
                  <option value="">— Select reason —</option>
                  {voidReasons.map(r => (<option key={r.code} value={r.code}>{r.label}</option>))}
                </select>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label>Note (optional)</label>
                <input type="text" value={voidForm.reason_note} onChange={e => setVoidForm(f => ({ ...f, reason_note: e.target.value }))} placeholder="What happened?" />
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <label>Proof image (required)</label>
                <input type="file" accept="image/*" onChange={e => setVoidForm(f => ({ ...f, file: e.target.files?.[0] || null }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={closeVoidModal} disabled={voidSubmitting} style={{ background: '#e2e8f0', color: '#475569' }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={submitVoid} disabled={voidSubmitting || !voidForm.reason || !voidForm.file}>
                {voidSubmitting ? 'Uploading…' : 'Void Number'}
              </button>
            </div>
          </div>
        </div>
      )}

      {proofPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }}
             onClick={() => setProofPreview(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 12, maxWidth: '95vw', maxHeight: '95vh', display: 'flex', flexDirection: 'column', gap: 8 }}
               onClick={e => e.stopPropagation()}>
            <img src={proofPreview.url} alt="Void proof" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain' }} />
            <button className="btn btn-sm" onClick={() => setProofPreview(null)} style={{ alignSelf: 'flex-end' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
