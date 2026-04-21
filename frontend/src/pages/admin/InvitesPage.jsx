/**
 * InvitesPage — Admin Invite Triage (Phase M1, Apr 2026)
 *
 * Lists InviteLink records with status filters. Admins see all BDMs' invites;
 * BDMs see only their own (enforced server-side). Use this to nudge unconverted
 * invites (MDs who received the link but haven't tapped/replied).
 */

import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import inviteService from '../../services/inviteService';

const STATUS_COLORS = {
  sent: { bg: '#e0e7ff', fg: '#3730a3', label: 'Sent' },
  opened: { bg: '#fef3c7', fg: '#92400e', label: 'Opened' },
  converted: { bg: '#dcfce7', fg: '#15803d', label: 'Converted' },
  expired: { bg: '#f1f5f9', fg: '#64748b', label: 'Expired' },
};

const CHANNEL_COLORS = {
  MESSENGER: { bg: '#dbeafe', fg: '#1d4ed8' },
  VIBER: { bg: '#e9d5ff', fg: '#7c3aed' },
  WHATSAPP: { bg: '#dcfce7', fg: '#15803d' },
  EMAIL: { bg: '#fef3c7', fg: '#92400e' },
  SMS: { bg: '#fee2e2', fg: '#b91c1c' },
};

const styles = `
  .inv-page { padding: 20px; max-width: 1280px; margin: 0 auto; }
  .inv-title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 16px; }
  .inv-filters { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .inv-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; min-height: 40px; background: #fff; min-width: 160px; }
  .inv-table-wrap { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
  .inv-table { width: 100%; border-collapse: collapse; }
  .inv-table th { background: #f8fafc; text-align: left; font-size: 11px; text-transform: uppercase; color: #475569; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; letter-spacing: 0.3px; }
  .inv-table td { padding: 10px 12px; font-size: 13px; color: #0f172a; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  .inv-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .inv-empty { text-align: center; padding: 40px 20px; color: #64748b; font-size: 14px; }
  .inv-link { font-family: monospace; font-size: 11px; color: #475569; word-break: break-all; max-width: 320px; display: inline-block; }
  .inv-page-btn { padding: 8px 14px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; font-size: 13px; cursor: pointer; }
  .inv-page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  body.dark-mode .inv-title { color: #e2e8f0; }
  body.dark-mode .inv-select { background: #0b1220; border-color: #334155; color: #e2e8f0; }
  body.dark-mode .inv-table-wrap { background: #0f172a; border-color: #1e293b; }
  body.dark-mode .inv-table th { background: #0b1220; color: #94a3b8; border-color: #1e293b; }
  body.dark-mode .inv-table td { color: #e2e8f0; border-color: #1e293b; }
  body.dark-mode .inv-empty { color: #94a3b8; }
  body.dark-mode .inv-link { color: #94a3b8; }
  body.dark-mode .inv-page-btn { background: #0b1220; color: #e2e8f0; border-color: #334155; }
`;

export default function InvitesPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');

  const fetchInvites = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inviteService.list({ page, limit: 20, status, channel });
      setItems(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, status, channel]);

  useEffect(() => { fetchInvites(); }, [fetchInvites]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div>
      <style>{styles}</style>
      <Navbar />
      <Sidebar />
      <div className="inv-page">
        <h1 className="inv-title">Invite Triage</h1>
        <PageGuide pageKey="admin-invites" />

        <div className="inv-filters">
          <select className="inv-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="opened">Opened</option>
            <option value="converted">Converted</option>
            <option value="expired">Expired</option>
          </select>
          <select className="inv-select" value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }}>
            <option value="">All channels</option>
            <option value="MESSENGER">Messenger</option>
            <option value="VIBER">Viber</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">Email</option>
          </select>
        </div>

        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Recipient</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Sent By</th>
                <th>Replied</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="inv-empty">Loading invites…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} className="inv-empty">No invites yet. Open a VIP Client's chat and tap a channel with no ID set to generate one.</td></tr>
              )}
              {!loading && items.map((inv) => {
                const recipient = inv.doctor
                  ? `${inv.doctor.firstName || ''} ${inv.doctor.lastName || ''}`.trim() + (inv.doctor.specialization ? ` (${inv.doctor.specialization})` : '')
                  : inv.client
                    ? `${inv.client.firstName || ''} ${inv.client.lastName || ''}`.trim()
                    : '—';
                const statusMeta = STATUS_COLORS[inv.status] || STATUS_COLORS.sent;
                const chMeta = CHANNEL_COLORS[inv.channel] || { bg: '#f1f5f9', fg: '#475569' };
                return (
                  <tr key={inv._id}>
                    <td>{new Date(inv.sentAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{recipient}</td>
                    <td>
                      <span className="inv-badge" style={{ background: chMeta.bg, color: chMeta.fg }}>{inv.channel}</span>
                    </td>
                    <td>
                      <span className="inv-badge" style={{ background: statusMeta.bg, color: statusMeta.fg }}>{statusMeta.label}</span>
                    </td>
                    <td>{inv.sentBy?.name || '—'}</td>
                    <td>{inv.repliedAt ? new Date(inv.repliedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    <td><span className="inv-link">{inv.linkUrl || '—'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
            <button className="inv-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Prev
            </button>
            <span style={{ fontSize: 13, color: '#64748b' }}>Page {page} of {totalPages} · {total} total</span>
            <button className="inv-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
