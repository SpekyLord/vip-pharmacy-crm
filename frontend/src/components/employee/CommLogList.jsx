/**
 * CommLogList — Communication Log List with Filters
 *
 * Displays BDM communication logs (screenshots + API messages).
 * Channel filter chips, date range, expandable cards.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLookupOptions } from '../../erp/hooks/useLookups';
import communicationLogService from '../../services/communicationLogService';
import Pagination from '../common/Pagination';
import LoadingSpinner from '../common/LoadingSpinner';

const listStyles = `
  .cll-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; align-items: center; }
  .cll-chip { display: inline-flex; align-items: center; min-height: 36px; padding: 6px 14px; border: 1px solid #d1d5db; border-radius: 20px; background: #f9fafb; color: #4b5563; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
  .cll-chip:hover { border-color: #93c5fd; background: #eff6ff; }
  .cll-chip.active { border-color: #2563eb; background: #2563eb; color: #fff; }
  .cll-date-input { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 12px; min-height: 36px; }
  .cll-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s; }
  .cll-card:hover { border-color: #93c5fd; box-shadow: 0 1px 4px rgba(37,99,235,0.08); }
  .cll-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .cll-badge { display: inline-flex; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  .cll-badge-viber { background: #f3e8ff; color: #7c3aed; }
  .cll-badge-messenger { background: #dbeafe; color: #2563eb; }
  .cll-badge-whatsapp { background: #dcfce7; color: #16a34a; }
  .cll-badge-email { background: #fef3c7; color: #d97706; }
  .cll-badge-google_chat { background: #e0f2fe; color: #0284c7; }
  .cll-badge-default { background: #f1f5f9; color: #64748b; }
  .cll-client-name { font-weight: 600; font-size: 14px; color: #1e293b; flex: 1; }
  .cll-client-tag { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .cll-tag-vip { background: #fef3c7; color: #92400e; }
  .cll-tag-regular { background: #e2e8f0; color: #475569; }
  .cll-date { font-size: 12px; color: #94a3b8; }
  .cll-notes { font-size: 13px; color: #64748b; margin-top: 4px; line-height: 1.4; }
  .cll-photos { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .cll-thumb { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; border: 1px solid #e2e8f0; cursor: pointer; }
  .cll-msg-content { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-top: 6px; font-size: 13px; color: #334155; white-space: pre-wrap; }
  .cll-delivery { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; margin-left: 8px; }
  .cll-delivery-sent { color: #94a3b8; }
  .cll-delivery-delivered { color: #2563eb; }
  .cll-delivery-read { color: #16a34a; }
  .cll-delivery-failed { color: #ef4444; }
  .cll-direction { font-size: 11px; color: #94a3b8; }
  .cll-empty { text-align: center; padding: 40px 20px; color: #94a3b8; }
  .cll-photo-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .cll-photo-modal img { max-width: 100%; max-height: 90vh; border-radius: 8px; }
  .cll-photo-modal-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,0.2); border: none; color: #fff; font-size: 24px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; }
  body.dark-mode .cll-card { background: #0f172a; border-color: #1e293b; }
  body.dark-mode .cll-client-name { color: #e2e8f0; }
  body.dark-mode .cll-notes { color: #94a3b8; }
  body.dark-mode .cll-msg-content { background: #0b1220; border-color: #1e293b; color: #e2e8f0; }
  body.dark-mode .cll-date-input { background: #0b1220; border-color: #334155; color: #e2e8f0; }
`;

const CHANNEL_BADGE_MAP = {
  VIBER: 'cll-badge-viber',
  MESSENGER: 'cll-badge-messenger',
  WHATSAPP: 'cll-badge-whatsapp',
  EMAIL: 'cll-badge-email',
  GOOGLE_CHAT: 'cll-badge-google_chat',
};

const CommLogList = ({ mode = 'my', doctorId, clientId, refreshKey = 0, adminFilters }) => {
  const { options: channelOpts } = useLookupOptions('COMM_CHANNEL');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [expandedId, setExpandedId] = useState(null);
  const [photoModal, setPhotoModal] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...(channelFilter && { channel: channelFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(adminFilters || {}),
      };

      let result;
      if (mode === 'doctor' && doctorId) {
        result = await communicationLogService.getByDoctor(doctorId, params);
      } else if (mode === 'client' && clientId) {
        result = await communicationLogService.getByClient(clientId, params);
      } else if (mode === 'admin') {
        result = await communicationLogService.getAll(params);
      } else {
        result = await communicationLogService.getMy(params);
      }

      setLogs(result.data || []);
      if (result.pagination) setPagination((prev) => ({ ...prev, ...result.pagination }));
    } catch (err) {
      console.error('Failed to fetch comm logs:', err);
    }
    setLoading(false);
  }, [mode, doctorId, clientId, pagination.page, pagination.limit, channelFilter, startDate, endDate, adminFilters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const getClientName = (log) => {
    const doc = log.doctor;
    const cl = log.client;
    const target = doc || cl;
    return target ? `${target.firstName || ''} ${target.lastName || ''}`.trim() : 'Unknown';
  };

  const getClientTag = (log) => (log.doctor ? 'vip' : 'regular');

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <style>{listStyles}</style>

      {/* Filters */}
      <div className="cll-filters">
        <button
          className={`cll-chip${!channelFilter ? ' active' : ''}`}
          onClick={() => { setChannelFilter(''); setPagination((p) => ({ ...p, page: 1 })); }}
        >
          All
        </button>
        {channelOpts.map((opt) => (
          <button
            key={opt.value}
            className={`cll-chip${channelFilter === opt.value ? ' active' : ''}`}
            onClick={() => { setChannelFilter(channelFilter === opt.value ? '' : opt.value); setPagination((p) => ({ ...p, page: 1 })); }}
          >
            {opt.label}
          </button>
        ))}
        <input type="date" className="cll-date-input" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} placeholder="From" />
        <input type="date" className="cll-date-input" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} placeholder="To" />
      </div>

      {/* Loading */}
      {loading && <LoadingSpinner />}

      {/* Empty state */}
      {!loading && logs.length === 0 && (
        <div className="cll-empty">No communication logs found.</div>
      )}

      {/* Log cards */}
      {!loading && logs.map((log) => (
        <div key={log._id} className="cll-card" onClick={() => setExpandedId(expandedId === log._id ? null : log._id)}>
          <div className="cll-card-header">
            <span className={`cll-badge ${CHANNEL_BADGE_MAP[log.channel] || 'cll-badge-default'}`}>
              {log.channel?.replace('_', ' ')}
            </span>
            <span className="cll-client-name">{getClientName(log)}</span>
            <span className={`cll-client-tag ${getClientTag(log) === 'vip' ? 'cll-tag-vip' : 'cll-tag-regular'}`}>
              {getClientTag(log) === 'vip' ? 'VIP' : 'Regular'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="cll-date">{formatDate(log.contactedAt)}</span>
            <span className="cll-direction">{log.direction === 'inbound' ? '← Inbound' : '→ Outbound'}</span>
            {log.deliveryStatus && (
              <span className={`cll-delivery cll-delivery-${log.deliveryStatus}`}>
                {log.deliveryStatus === 'sent' && '○ Sent'}
                {log.deliveryStatus === 'delivered' && '◉ Delivered'}
                {log.deliveryStatus === 'read' && '✓ Read'}
                {log.deliveryStatus === 'failed' && '✗ Failed'}
              </span>
            )}
          </div>
          {log.notes && <div className="cll-notes">{log.notes.length > 120 && expandedId !== log._id ? log.notes.slice(0, 120) + '...' : log.notes}</div>}

          {/* API message content */}
          {log.source === 'api' && log.messageContent && expandedId === log._id && (
            <div className="cll-msg-content">{log.messageContent}</div>
          )}

          {/* BDM name (admin view) */}
          {mode === 'admin' && log.user && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>BDM: {log.user.name || log.user.email}</div>
          )}

          {/* Screenshot thumbnails */}
          {log.photos && log.photos.length > 0 && (
            <div className="cll-photos">
              {(expandedId === log._id ? log.photos : log.photos.slice(0, 3)).map((photo, i) => (
                <img
                  key={i}
                  src={photo.url}
                  alt={`Screenshot ${i + 1}`}
                  className="cll-thumb"
                  onClick={(e) => { e.stopPropagation(); setPhotoModal(photo.url); }}
                />
              ))}
              {expandedId !== log._id && log.photos.length > 3 && (
                <div style={{ width: 56, height: 56, borderRadius: 6, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  +{log.photos.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <Pagination
          page={pagination.page}
          pages={pagination.pages}
          total={pagination.total}
          onPageChange={handlePageChange}
        />
      )}

      {/* Photo modal */}
      {photoModal && (
        <div className="cll-photo-modal" onClick={() => setPhotoModal(null)}>
          <button className="cll-photo-modal-close" onClick={() => setPhotoModal(null)}>&times;</button>
          <img src={photoModal} alt="Screenshot" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
};

export default CommLogList;
