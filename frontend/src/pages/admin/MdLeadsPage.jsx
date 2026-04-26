/**
 * MdLeadsPage — Phase VIP-1.A (Apr 2026)
 *
 * Operator surface for the MD Partner Lead pipeline. Lists Doctor records by
 * partnership_status (default LEAD) with action buttons to drive the pipeline:
 *   LEAD → CONTACTED → VISITED → PARTNER (or INACTIVE)
 *
 * Promoting to PARTNER opens a modal that requires `partner_agreement_date`
 * — that's gate #2 of the rebate engine the next sub-phase (VIP-1.B) will wire.
 *
 * Access: route guard is admin-like (CRM admin pages are ROLE_SETS.ADMIN_ONLY
 * today; lookup-driven gating ships with VIP-1.B). Backend setPartnershipStatus
 * controller does the full role + ownership cascade so direct API calls also
 * respect the lookup-driven gate.
 *
 * Route: /admin/md-leads
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Handshake,
  RefreshCw,
  Search,
  Loader,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import doctorService from '../../services/doctorService';

const STATUSES = ['LEAD', 'CONTACTED', 'VISITED', 'PARTNER', 'INACTIVE'];

// Display metadata. Subscriber overrides should land via the
// MD_PARTNER_ROLES lookup category (backend) + a future labels lookup;
// for VIP-1.A this is inline (UI-only, schema enum is the validation gate).
const STATUS_META = {
  LEAD:      { label: 'LEAD',      bg: '#dbeafe', fg: '#1d4ed8' },
  CONTACTED: { label: 'CONTACTED', bg: '#cffafe', fg: '#0891b2' },
  VISITED:   { label: 'VISITED',   bg: '#fef3c7', fg: '#b45309' },
  PARTNER:   { label: 'PARTNER',   bg: '#dcfce7', fg: '#15803d' },
  INACTIVE:  { label: 'INACTIVE',  bg: '#f3f4f6', fg: '#6b7280' },
};

// Allowed transitions from each status (UI hint; backend is the source of truth).
const NEXT_STEPS = {
  LEAD:      ['CONTACTED', 'INACTIVE'],
  CONTACTED: ['VISITED', 'INACTIVE'],
  VISITED:   ['PARTNER', 'INACTIVE'],
  PARTNER:   ['INACTIVE'],
  INACTIVE:  ['LEAD'],
};

const styles = `
  .ml-layout { min-height: 100vh; background: #f3f4f6; }
  .ml-content { display: flex; }
  .ml-main { flex: 1; padding: 24px; max-width: 1400px; }
  .ml-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  .ml-header-icon { width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #4f46e5); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; box-shadow: 0 4px 12px rgba(79,70,229,.3); }
  .ml-header h1 { margin: 0; font-size: 28px; color: #1f2937; }
  .ml-header-sub { color: #6b7280; font-size: 13px; margin-top: 4px; }

  .ml-toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .ml-search { flex: 1; min-width: 220px; position: relative; }
  .ml-search input { width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
  .ml-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; }
  .ml-status-pill { padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #374151; }
  .ml-status-pill.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .ml-refresh { padding: 8px 14px; background: #fff; border: 1px solid #d1d5db; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #374151; }
  .ml-refresh:hover { background: #f9fafb; }

  .ml-counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
  .ml-count-card { background: #fff; border-radius: 10px; padding: 10px 12px; border: 1px solid #e5e7eb; }
  .ml-count-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
  .ml-count-value { font-size: 22px; font-weight: 700; color: #111827; margin-top: 4px; }

  .ml-table-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.05); overflow: hidden; border: 1px solid #e5e7eb; }
  .ml-table { width: 100%; border-collapse: collapse; }
  .ml-table th { text-align: left; padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #e5e7eb; }
  .ml-table td { padding: 12px 14px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .ml-table tr:last-child td { border-bottom: none; }
  .ml-table tr:hover td { background: #fafafa; }
  .ml-name { font-weight: 600; color: #111827; }
  .ml-name-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .ml-pill { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .ml-action-btn { padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #374151; display: inline-flex; align-items: center; gap: 4px; }
  .ml-action-btn:hover { background: #f9fafb; border-color: #9ca3af; }
  .ml-action-btn.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
  .ml-action-btn.primary:hover { background: #4338ca; border-color: #4338ca; }
  .ml-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ml-actions-cell { display: flex; flex-wrap: wrap; gap: 6px; }

  .ml-empty { padding: 60px 20px; text-align: center; color: #6b7280; }
  .ml-empty-icon { width: 48px; height: 48px; margin: 0 auto 12px; color: #d1d5db; }
  .ml-loading { padding: 40px; text-align: center; color: #6b7280; }

  /* Modal for PARTNER promotion */
  .ml-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 1100; padding: 16px; }
  .ml-modal { background: #fff; border-radius: 12px; width: 100%; max-width: 480px; box-shadow: 0 20px 50px rgba(0,0,0,.2); overflow: hidden; }
  .ml-modal-header { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
  .ml-modal-header h3 { margin: 0; font-size: 16px; color: #111827; display: flex; align-items: center; gap: 8px; }
  .ml-modal-close { background: none; border: none; cursor: pointer; color: #6b7280; padding: 4px; }
  .ml-modal-body { padding: 20px; }
  .ml-modal-row { margin-bottom: 14px; }
  .ml-modal-row label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 6px; }
  .ml-modal-row input, .ml-modal-row textarea { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; box-sizing: border-box; font-family: inherit; }
  .ml-modal-row textarea { min-height: 80px; resize: vertical; }
  .ml-modal-warning { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 10px 12px; border-radius: 8px; font-size: 12px; line-height: 1.5; margin-bottom: 14px; display: flex; gap: 8px; }
  .ml-modal-footer { padding: 14px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 8px; background: #f9fafb; }
  .ml-cancel { padding: 8px 14px; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 13px; color: #374151; }

  @media (max-width: 768px) {
    .ml-counts { grid-template-columns: repeat(2, 1fr); }
    .ml-main { padding: 12px; }
    .ml-table { font-size: 12px; }
    .ml-table th, .ml-table td { padding: 8px 10px; }
  }
`;

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

export default function MdLeadsPage() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({}); // {LEAD: 12, CONTACTED: 4, ...}
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('LEAD');
  const [search, setSearch] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [partnerModal, setPartnerModal] = useState(null); // {doctor} or null

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await doctorService.getMdLeads({
        partnership_status: filterStatus,
        search: search.trim() || undefined,
        limit: 100,
      });
      setItems(res?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load leads');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search]);

  // Counts: fire one call per status (small N, totally acceptable). If this
  // ever gets heavy, expose a /doctors/partnership-counts aggregate endpoint.
  const fetchCounts = useCallback(async () => {
    try {
      const out = {};
      await Promise.all(STATUSES.map(async (s) => {
        const res = await doctorService.getAll({ partnership_status: s, limit: 0 });
        out[s] = res?.pagination?.total ?? (res?.data?.length || 0);
      }));
      setCounts(out);
    } catch {
      // silent — counts are decorative
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  const handleTransition = async (doctor, nextStatus) => {
    if (nextStatus === 'PARTNER') {
      setPartnerModal({ doctor });
      return;
    }
    setPendingId(doctor._id);
    try {
      await doctorService.setPartnershipStatus(doctor._id, { status: nextStatus });
      toast.success(`Moved ${doctor.firstName || ''} ${doctor.lastName || ''} to ${nextStatus}`);
      fetchList();
      fetchCounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update status');
    } finally {
      setPendingId(null);
    }
  };

  const handlePromotePartner = async (e) => {
    e.preventDefault();
    if (!partnerModal) return;
    const form = new FormData(e.currentTarget);
    const partner_agreement_date = form.get('partner_agreement_date');
    const partnership_notes = form.get('partnership_notes') || undefined;
    if (!partner_agreement_date) {
      toast.error('Partner agreement date is required');
      return;
    }
    setPendingId(partnerModal.doctor._id);
    try {
      await doctorService.setPartnershipStatus(partnerModal.doctor._id, {
        status: 'PARTNER',
        partner_agreement_date,
        partnership_notes,
      });
      toast.success(`${partnerModal.doctor.firstName || ''} ${partnerModal.doctor.lastName || ''} is now a PARTNER`);
      setPartnerModal(null);
      fetchList();
      fetchCounts();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to promote to PARTNER');
    } finally {
      setPendingId(null);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchList();
  };

  return (
    <>
      <style>{styles}</style>
      <div className="ml-layout">
        <Navbar />
        <div className="ml-content">
          <Sidebar />
          <main className="ml-main">
            <div className="ml-header">
              <div className="ml-header-icon"><Handshake size={26} /></div>
              <div>
                <h1>MD Partner Leads</h1>
                <div className="ml-header-sub">Drive the LEAD → CONTACTED → VISITED → PARTNER pipeline. PARTNER promotion locks rebate gate #2.</div>
              </div>
            </div>

            <PageGuide pageKey="md-leads" />

            {/* Counts strip */}
            <div className="ml-counts">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  className="ml-count-card"
                  style={filterStatus === s ? { borderColor: STATUS_META[s].fg, background: STATUS_META[s].bg } : {}}
                  onClick={() => setFilterStatus(s)}
                  type="button"
                >
                  <div className="ml-count-label" style={{ color: STATUS_META[s].fg }}>{STATUS_META[s].label}</div>
                  <div className="ml-count-value">{counts[s] ?? '—'}</div>
                </button>
              ))}
            </div>

            {/* Toolbar */}
            <form className="ml-toolbar" onSubmit={handleSearchSubmit}>
              <div className="ml-search">
                <Search className="ml-search-icon" size={16} />
                <input
                  type="text"
                  placeholder="Search by name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button type="button" className="ml-refresh" onClick={() => { fetchList(); fetchCounts(); }} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'ml-spin' : ''} />
                Refresh
              </button>
            </form>

            <div className="ml-table-card">
              {loading ? (
                <div className="ml-loading"><Loader size={20} className="ml-spin" /> Loading…</div>
              ) : items.length === 0 ? (
                <div className="ml-empty">
                  <Handshake className="ml-empty-icon" />
                  <div>No {STATUS_META[filterStatus]?.label || filterStatus} doctors{search ? ' match your search' : ''}.</div>
                </div>
              ) : (
                <table className="ml-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Lead Source</th>
                      <th>Created</th>
                      <th>Assigned BDM</th>
                      <th>Agreement Date</th>
                      <th style={{ minWidth: 220 }}>Move To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => {
                      const meta = STATUS_META[d.partnership_status] || STATUS_META.LEAD;
                      const next = NEXT_STEPS[d.partnership_status] || [];
                      return (
                        <tr key={d._id}>
                          <td>
                            <div className="ml-name">{d.firstName} {d.lastName}</div>
                            <div className="ml-name-sub">{d.specialization || '—'} · {d.locality || d.province || d.clinicOfficeAddress || ''}</div>
                          </td>
                          <td>
                            <span className="ml-pill" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                          </td>
                          <td>{d.lead_source || '—'}</td>
                          <td>{formatDate(d.createdAt)}</td>
                          <td>{d.assignedTo?.name || '—'}</td>
                          <td>{formatDate(d.partner_agreement_date)}</td>
                          <td>
                            <div className="ml-actions-cell">
                              {next.map((target) => (
                                <button
                                  key={target}
                                  className={`ml-action-btn ${target === 'PARTNER' ? 'primary' : ''}`}
                                  onClick={() => handleTransition(d, target)}
                                  disabled={pendingId === d._id}
                                  type="button"
                                >
                                  {target === 'PARTNER' ? <CheckCircle2 size={14} /> : <ArrowRight size={14} />}
                                  {target}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* PARTNER promotion modal */}
            {partnerModal && (
              <div className="ml-modal-overlay" onClick={() => setPartnerModal(null)}>
                <div className="ml-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="ml-modal-header">
                    <h3><CheckCircle2 size={18} color="#15803d" /> Promote to PARTNER</h3>
                    <button className="ml-modal-close" onClick={() => setPartnerModal(null)} type="button"><X size={18} /></button>
                  </div>
                  <form onSubmit={handlePromotePartner}>
                    <div className="ml-modal-body">
                      <div className="ml-modal-warning">
                        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                          Promoting <strong>{partnerModal.doctor.firstName} {partnerModal.doctor.lastName}</strong> to PARTNER locks rebate gate #2 (signed partnership agreement). Confirm the agreement is signed before saving.
                        </div>
                      </div>
                      <div className="ml-modal-row">
                        <label htmlFor="partner_agreement_date">Partner agreement date *</label>
                        <input id="partner_agreement_date" name="partner_agreement_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                      </div>
                      <div className="ml-modal-row">
                        <label htmlFor="partnership_notes">Partnership notes (optional)</label>
                        <textarea id="partnership_notes" name="partnership_notes" placeholder="Agreement reference, conditions, contract URL…" />
                      </div>
                    </div>
                    <div className="ml-modal-footer">
                      <button type="button" className="ml-cancel" onClick={() => setPartnerModal(null)}>Cancel</button>
                      <button type="submit" className="ml-action-btn primary" disabled={pendingId === partnerModal.doctor._id}>
                        <CheckCircle2 size={14} /> {pendingId === partnerModal.doctor._id ? 'Saving…' : 'Confirm PARTNER'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
