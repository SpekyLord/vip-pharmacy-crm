/**
 * MdMergePage — Phase A.5.5 (Apr 2026)
 *
 * Admin operator surface for the canonical VIP-Client (MD / Doctor) merge tool.
 * Unblocks Iloilo MD de-duplication so A.5.2 (unique-index flip) can ship next.
 *
 * Three tabs:
 *   1. Candidates — duplicate canonical-key groups (count >= 2)
 *   2. History    — past merges with rollback within 30-day grace
 *
 * Workflow per group:
 *   - Pick a Winner (the survivor) — usually the record with the most history.
 *   - Pick a Loser  (the absorbed) — usually the empty/orphaned duplicate.
 *   - Click Preview to see the cascade blast radius (loser_rows + collisions).
 *   - Confirm with a Reason → merge cascades + writes audit row.
 *
 * Access: server-side gated via VIP_CLIENT_LIFECYCLE_ROLES lookup (admin +
 * president by default). 403s surface the allowed-roles list.
 *
 * Route: /admin/md-merge
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  RefreshCw,
  Search,
  Loader,
  CheckCircle2,
  AlertTriangle,
  X,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import mdMergeService from '../../services/mdMergeService';

const styles = `
  .mm-layout { min-height: 100vh; background: #f3f4f6; }
  .mm-content { display: flex; }
  .mm-main { flex: 1; padding: 24px; max-width: 1400px; }
  .mm-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .mm-header-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #f97316, #ea580c); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(234,88,12,.3); }
  .mm-header h1 { margin: 0; font-size: 28px; color: #1f2937; }
  .mm-header-sub { color: #6b7280; font-size: 13px; margin-top: 4px; }

  .mm-tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 2px solid #e5e7eb; }
  .mm-tab { padding: 10px 16px; cursor: pointer; font-size: 14px; font-weight: 600; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .mm-tab.active { color: #ea580c; border-bottom-color: #ea580c; }

  .mm-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .mm-search { flex: 1; min-width: 220px; position: relative; }
  .mm-search input { width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
  .mm-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; }
  .mm-refresh { padding: 8px 14px; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; }
  .mm-refresh:hover { background: #f9fafb; }

  .mm-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
  .mm-summary-card { background: #fff; border-radius: 10px; padding: 10px 14px; border: 1px solid #e5e7eb; }
  .mm-summary-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
  .mm-summary-value { font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px; }

  .mm-group-card { background: #fff; border-radius: 12px; padding: 14px 16px; border: 1px solid #e5e7eb; margin-bottom: 10px; }
  .mm-group-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .mm-group-key { font-size: 13px; font-weight: 700; color: #ea580c; font-family: ui-monospace, SFMono-Regular, monospace; }
  .mm-group-count { font-size: 11px; color: #6b7280; background: #fef3c7; padding: 3px 8px; border-radius: 999px; font-weight: 600; }

  .mm-doctors-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
  .mm-doctor-row { padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
  .mm-doctor-row:hover { background: #f9fafb; }
  .mm-doctor-row.winner { border: 2px solid #16a34a; background: #f0fdf4; }
  .mm-doctor-row.loser { border: 2px solid #dc2626; background: #fef2f2; }
  .mm-doctor-radio { font-size: 11px; padding: 4px 8px; border-radius: 6px; background: #f3f4f6; color: #374151; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; }
  .mm-doctor-radio.active.winner { background: #16a34a; color: #fff; border-color: #16a34a; }
  .mm-doctor-radio.active.loser { background: #dc2626; color: #fff; border-color: #dc2626; }
  .mm-doctor-info { flex: 1; }
  .mm-doctor-name { font-weight: 600; color: #111827; font-size: 13px; }
  .mm-doctor-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .mm-doctor-meta { display: flex; gap: 12px; font-size: 11px; color: #6b7280; margin-top: 4px; }
  .mm-meta-item { display: inline-flex; align-items: center; gap: 4px; }

  .mm-group-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #f3f4f6; }
  .mm-btn { padding: 8px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d1d5db; background: #fff; color: #374151; }
  .mm-btn:hover { background: #f9fafb; }
  .mm-btn.primary { background: #ea580c; border-color: #ea580c; color: #fff; }
  .mm-btn.primary:hover { background: #c2410c; border-color: #c2410c; }
  .mm-btn.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
  .mm-btn.danger:hover { background: #b91c1c; border-color: #b91c1c; }
  .mm-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .mm-empty { padding: 60px 20px; text-align: center; color: #6b7280; }
  .mm-empty-icon { width: 48px; height: 48px; margin: 0 auto 12px; color: #d1d5db; }
  .mm-loading { padding: 40px; text-align: center; color: #6b7280; }

  /* Preview / Confirm modal */
  .mm-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: 16px; }
  .mm-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 720px; max-height: 90vh; overflow: auto; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
  .mm-modal-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; background: #fff; }
  .mm-modal-header h3 { margin: 0; font-size: 16px; color: #111827; display: flex; align-items: center; gap: 8px; }
  .mm-modal-close { background: none; border: none; cursor: pointer; color: #6b7280; padding: 4px; }
  .mm-modal-body { padding: 20px; }
  .mm-modal-warning { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.5; margin-bottom: 14px; display: flex; gap: 8px; }
  .mm-modal-warning.danger { background: #fee2e2; border-color: #fecaca; color: #991b1b; }
  .mm-modal-row { margin-bottom: 14px; }
  .mm-modal-row label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
  .mm-modal-row textarea, .mm-modal-row input { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; box-sizing: border-box; font-family: inherit; }
  .mm-modal-row textarea { min-height: 80px; resize: vertical; }
  .mm-cascade-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .mm-cascade-table th, .mm-cascade-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f3f4f6; }
  .mm-cascade-table th { background: #f9fafb; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; color: #6b7280; font-weight: 600; }
  .mm-cascade-bad { color: #dc2626; font-weight: 600; }
  .mm-modal-footer { padding: 14px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; gap: 8px; background: #f9fafb; position: sticky; bottom: 0; }

  /* History tab */
  .mm-table { width: 100%; border-collapse: collapse; }
  .mm-table th { text-align: left; padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
  .mm-table td { padding: 12px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .mm-status { padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; display: inline-block; }
  .mm-status.APPLIED { background: #dbeafe; color: #1e40af; }
  .mm-status.ROLLED_BACK { background: #f3f4f6; color: #6b7280; }
  .mm-status.HARD_DELETED { background: #fee2e2; color: #991b1b; }

  @media (max-width: 768px) {
    .mm-summary { grid-template-columns: repeat(2, 1fr); }
    .mm-main { padding: 12px; }
  }
`;

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString(); } catch { return '—'; }
}

function rowKey(d) { return String(d._id); }

export default function MdMergePage() {
  const [tab, setTab] = useState('candidates'); // 'candidates' | 'history'
  const [groups, setGroups] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Per-group selection state: { [groupKey]: { winnerId, loserId } }
  const [selection, setSelection] = useState({});
  // Preview modal: { groupKey, winnerId, loserId, preview, executing }
  const [previewModal, setPreviewModal] = useState(null);
  const [reason, setReason] = useState('');
  // Rollback modal: { auditId, summary }
  const [rollbackModal, setRollbackModal] = useState(null);
  const [rollbackReason, setRollbackReason] = useState('');

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await mdMergeService.findCandidates({ search, limit: 200 });
      setGroups(resp?.data?.groups || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [search]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await mdMergeService.history({ limit: 200 });
      setHistory(resp?.data?.rows || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'candidates') loadCandidates();
    else loadHistory();
  }, [tab, loadCandidates, loadHistory]);

  // Per-group radio handler — sets winner OR loser. Auto-clears the other
  // when the same row is clicked, prevents winner==loser.
  const handlePick = (groupKey, doctorId, role) => {
    setSelection((prev) => {
      const cur = prev[groupKey] || {};
      const next = { ...cur };
      if (role === 'winner') {
        next.winnerId = next.winnerId === doctorId ? null : doctorId;
        if (next.loserId === doctorId) next.loserId = null;
      } else {
        next.loserId = next.loserId === doctorId ? null : doctorId;
        if (next.winnerId === doctorId) next.winnerId = null;
      }
      return { ...prev, [groupKey]: next };
    });
  };

  const openPreview = async (groupKey) => {
    const sel = selection[groupKey];
    if (!sel?.winnerId || !sel?.loserId) {
      toast.error('Pick both a Winner (kept) and a Loser (absorbed)');
      return;
    }
    setPreviewModal({ groupKey, ...sel, preview: null, executing: false });
    try {
      const resp = await mdMergeService.preview(sel.winnerId, sel.loserId);
      setPreviewModal((m) => (m ? { ...m, preview: resp?.data || null } : m));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Preview failed');
      setPreviewModal(null);
    }
  };

  const closePreview = () => {
    setPreviewModal(null);
    setReason('');
  };

  const confirmExecute = async () => {
    if (!previewModal?.preview) return;
    if (!reason.trim()) {
      toast.error('Reason is required for the audit trail');
      return;
    }
    setPreviewModal((m) => ({ ...m, executing: true }));
    try {
      await mdMergeService.execute(previewModal.winnerId, previewModal.loserId, reason.trim());
      toast.success('Merge applied. Loser soft-deleted. Rollback available 30 days.');
      closePreview();
      // Clear selection for this group + reload candidates.
      setSelection((prev) => {
        const next = { ...prev };
        delete next[previewModal.groupKey];
        return next;
      });
      await loadCandidates();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Merge failed');
      setPreviewModal((m) => (m ? { ...m, executing: false } : null));
    }
  };

  const confirmRollback = async () => {
    if (!rollbackModal) return;
    if (!rollbackReason.trim()) {
      toast.error('Rollback reason is required for the audit trail');
      return;
    }
    try {
      await mdMergeService.rollback(rollbackModal.auditId, rollbackReason.trim());
      toast.success('Merge rolled back. Loser restored.');
      setRollbackModal(null);
      setRollbackReason('');
      await loadHistory();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Rollback failed');
    }
  };

  const totalDoctors = groups.reduce((sum, g) => sum + (g.count || 0), 0);
  const totalGroups = groups.length;
  const totalSavings = totalDoctors - totalGroups; // duplicates that will go away after merge

  return (
    <div className="mm-layout">
      <style>{styles}</style>
      <Navbar />
      <div className="mm-content">
        <Sidebar />
        <main className="mm-main">
          <PageGuide pageKey="md-merge" />

          <div className="mm-header">
            <div className="mm-header-icon"><ArrowLeftRight size={28} /></div>
            <div>
              <h1>MD Merge Tool</h1>
              <div className="mm-header-sub">
                Phase A.5.5 — De-duplicate VIP Clients before A.5.2 unique-index flip.
                Cascades 13+ FK references; rollback grace 30 days.
              </div>
            </div>
          </div>

          <div className="mm-tabs">
            <div
              className={`mm-tab ${tab === 'candidates' ? 'active' : ''}`}
              onClick={() => setTab('candidates')}
            >
              Duplicate Candidates
            </div>
            <div
              className={`mm-tab ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
            >
              Merge History
            </div>
          </div>

          {tab === 'candidates' && (
            <>
              <div className="mm-summary">
                <div className="mm-summary-card">
                  <div className="mm-summary-label">Duplicate groups</div>
                  <div className="mm-summary-value">{totalGroups}</div>
                </div>
                <div className="mm-summary-card">
                  <div className="mm-summary-label">Total doctors in groups</div>
                  <div className="mm-summary-value">{totalDoctors}</div>
                </div>
                <div className="mm-summary-card">
                  <div className="mm-summary-label">Removable after merge</div>
                  <div className="mm-summary-value">{totalSavings}</div>
                </div>
              </div>

              <div className="mm-toolbar">
                <div className="mm-search">
                  <Search size={16} className="mm-search-icon" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') loadCandidates(); }}
                    placeholder="Search canonical key (lastname|firstname)…"
                  />
                </div>
                <button className="mm-refresh" onClick={loadCandidates}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {loading ? (
                <div className="mm-loading"><Loader size={24} className="animate-spin" /> Loading candidates…</div>
              ) : groups.length === 0 ? (
                <div className="mm-empty">
                  <CheckCircle2 className="mm-empty-icon" />
                  <div>No duplicate canonical-key groups found.</div>
                  <div style={{ fontSize: 12, marginTop: 8 }}>
                    All VIP Clients have unique <code>lastname|firstname</code> keys — A.5.2 unique-index flip is safe to run.
                  </div>
                </div>
              ) : (
                groups.map((g) => {
                  const sel = selection[g._id] || {};
                  return (
                    <div className="mm-group-card" key={g._id}>
                      <div className="mm-group-header">
                        <div>
                          <div className="mm-group-key">{g._id}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                            Pick the survivor (Winner, green) and the absorbed record (Loser, red).
                          </div>
                        </div>
                        <span className="mm-group-count">{g.count} duplicates</span>
                      </div>

                      <div className="mm-doctors-grid">
                        {g.doctors.map((d) => {
                          const isWinner = sel.winnerId === d._id;
                          const isLoser = sel.loserId === d._id;
                          const cls = isWinner ? 'winner' : isLoser ? 'loser' : '';
                          return (
                            <div className={`mm-doctor-row ${cls}`} key={rowKey(d)}>
                              <div className="mm-doctor-info">
                                <div className="mm-doctor-name">{d.lastName}, {d.firstName}</div>
                                <div className="mm-doctor-sub">
                                  {d.specialization || '—'} · {[d.locality, d.province].filter(Boolean).join(', ') || '—'}
                                </div>
                                <div className="mm-doctor-meta">
                                  <span className="mm-meta-item">Status: <strong>{d.partnership_status || '—'}</strong></span>
                                  <span className="mm-meta-item">PRC: {d.prc_license_number || '—'}</span>
                                  <span className="mm-meta-item">Created: {formatDate(d.createdAt)}</span>
                                </div>
                              </div>
                              <button
                                className={`mm-doctor-radio winner ${isWinner ? 'active' : ''}`}
                                onClick={() => handlePick(g._id, d._id, 'winner')}
                                type="button"
                              >
                                Winner
                              </button>
                              <button
                                className={`mm-doctor-radio loser ${isLoser ? 'active' : ''}`}
                                onClick={() => handlePick(g._id, d._id, 'loser')}
                                type="button"
                              >
                                Loser
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mm-group-actions">
                        <button
                          className="mm-btn primary"
                          onClick={() => openPreview(g._id)}
                          disabled={!sel.winnerId || !sel.loserId}
                        >
                          Preview merge <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {tab === 'history' && (
            <>
              <div className="mm-toolbar">
                <button className="mm-refresh" onClick={loadHistory}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
              {loading ? (
                <div className="mm-loading"><Loader size={24} className="animate-spin" /> Loading history…</div>
              ) : history.length === 0 ? (
                <div className="mm-empty">
                  <CheckCircle2 className="mm-empty-icon" />
                  <div>No merges recorded yet.</div>
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <table className="mm-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Winner ← Loser</th>
                        <th>Reason</th>
                        <th>By</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row) => {
                        const grace = row.createdAt
                          ? Math.max(0, 30 - Math.floor((Date.now() - new Date(row.createdAt)) / 86400000))
                          : 0;
                        return (
                          <tr key={row._id}>
                            <td>{formatDate(row.createdAt)}</td>
                            <td>
                              <div style={{ fontSize: 12, fontWeight: 600 }}>
                                {row.winner_id?.firstName} {row.winner_id?.lastName}
                              </div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>
                                ← {row.loser_snapshot?.firstName} {row.loser_snapshot?.lastName}
                              </div>
                            </td>
                            <td style={{ fontSize: 12 }}>{row.reason || '—'}</td>
                            <td style={{ fontSize: 12 }}>{row.actor_user_id?.firstName} {row.actor_user_id?.lastName}</td>
                            <td>
                              <span className={`mm-status ${row.status}`}>{row.status}</span>
                              {row.status === 'APPLIED' && (
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                                  {grace} day{grace === 1 ? '' : 's'} grace left
                                </div>
                              )}
                            </td>
                            <td>
                              {row.status === 'APPLIED' && (
                                <button
                                  className="mm-btn"
                                  onClick={() => setRollbackModal({ auditId: row._id, summary: row })}
                                  title="Rollback merge"
                                >
                                  <RotateCcw size={14} /> Rollback
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Preview / Confirm modal */}
      {previewModal && (
        <div className="mm-modal-overlay" onClick={closePreview}>
          <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mm-modal-header">
              <h3><ArrowLeftRight size={18} /> Confirm merge</h3>
              <button className="mm-modal-close" onClick={closePreview} type="button"><X size={18} /></button>
            </div>
            <div className="mm-modal-body">
              {!previewModal.preview ? (
                <div className="mm-loading"><Loader size={20} className="animate-spin" /> Computing cascade preview…</div>
              ) : (
                <>
                  <div className="mm-modal-warning">
                    <AlertTriangle size={16} />
                    <div>
                      <strong>{previewModal.preview.winner.firstName} {previewModal.preview.winner.lastName}</strong> will absorb{' '}
                      <strong>{previewModal.preview.loser.firstName} {previewModal.preview.loser.lastName}</strong>.
                      The loser is soft-deleted (<code>mergedInto</code> + <code>isActive: false</code>).
                      Rollback available for 30 days, then hard-deleted by daily cron.
                    </div>
                  </div>

                  {previewModal.preview.total_collisions > 0 && (
                    <div className="mm-modal-warning danger">
                      <AlertTriangle size={16} />
                      <div>
                        <strong>{previewModal.preview.total_collisions} collisions detected.</strong>{' '}
                        Visits/Schedules with conflicting unique keys will be defused with a sentinel marker.{' '}
                        ProductAssignment + PatientMdAttribution dupes will be deactivated on the loser side.
                        All collision rows are captured in the audit snapshot for rollback.
                      </div>
                    </div>
                  )}

                  <h4 style={{ margin: '16px 0 8px', fontSize: 13, color: '#374151' }}>Cascade blast radius</h4>
                  <table className="mm-cascade-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Field</th>
                        <th>DB</th>
                        <th>Loser rows</th>
                        <th>Collisions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewModal.preview.cascade.map((c, i) => (
                        <tr key={i}>
                          <td>{c.model}</td>
                          <td><code style={{ fontSize: 11 }}>{c.field}</code></td>
                          <td>{c.db}</td>
                          <td>{c.loser_rows}</td>
                          <td className={c.potential_collisions > 0 ? 'mm-cascade-bad' : ''}>{c.potential_collisions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
                    Total rows to repoint: <strong>{previewModal.preview.total_rows}</strong>
                  </div>

                  <div className="mm-modal-row" style={{ marginTop: 16 }}>
                    <label htmlFor="merge-reason">Reason (required for audit trail)</label>
                    <textarea
                      id="merge-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={`e.g. "Iloilo dedup — Jake and Romela both registered Dr. Sharon. Keeping Jake's record (more visit history)."`}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="mm-modal-footer">
              <button className="mm-btn" onClick={closePreview} type="button">Cancel</button>
              <button
                className="mm-btn danger"
                onClick={confirmExecute}
                disabled={!previewModal.preview || previewModal.executing || !reason.trim()}
                type="button"
              >
                {previewModal.executing ? 'Merging…' : 'Merge now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rollback modal */}
      {rollbackModal && (
        <div className="mm-modal-overlay" onClick={() => setRollbackModal(null)}>
          <div className="mm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="mm-modal-header">
              <h3><RotateCcw size={18} /> Rollback merge</h3>
              <button className="mm-modal-close" onClick={() => setRollbackModal(null)} type="button"><X size={18} /></button>
            </div>
            <div className="mm-modal-body">
              <div className="mm-modal-warning">
                <AlertTriangle size={16} />
                <div>
                  Restoring <strong>{rollbackModal.summary.loser_snapshot?.firstName} {rollbackModal.summary.loser_snapshot?.lastName}</strong>.
                  Cascade FKs will be re-pointed back; sentinel rows restored; deactivated rows re-activated.
                </div>
              </div>
              <div className="mm-modal-row">
                <label htmlFor="rollback-reason">Reason (required)</label>
                <textarea
                  id="rollback-reason"
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  placeholder={`e.g. "Wrong winner picked — Jake's record had stale data; should have absorbed Jake into Romela."`}
                />
              </div>
            </div>
            <div className="mm-modal-footer">
              <button className="mm-btn" onClick={() => setRollbackModal(null)} type="button">Cancel</button>
              <button
                className="mm-btn danger"
                onClick={confirmRollback}
                disabled={!rollbackReason.trim()}
                type="button"
              >
                Rollback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
