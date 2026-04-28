/**
 * Hospital PO Backlog — Phase CSI-X1 (Apr 2026)
 *
 * Lists OPEN + PARTIAL hospital purchase orders with filters by hospital,
 * BDM, and date range. Summary tiles show open count, total unserved ₱, and
 * top unserved SKUs (drives reorder priority).
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { listHospitalPos, getBacklogSummary, expireStalePos } from '../services/hospitalPoService';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

const peso = (n) => '₱' + (Number(n || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_COLORS = {
  OPEN: { bg: '#dbeafe', fg: '#1d4ed8' },
  PARTIAL: { bg: '#fef3c7', fg: '#b45309' },
  FULFILLED: { bg: '#dcfce7', fg: '#15803d' },
  CANCELLED: { bg: '#f3f4f6', fg: '#6b7280' },
  EXPIRED: { bg: '#fee2e2', fg: '#b91c1c' }
};

export default function HospitalPoBacklog() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ hospital_id: '', status: 'OPEN,PARTIAL', from: '', to: '' });

  useEffect(() => {
    (async () => {
      try {
        const h = await api.get('/erp/hospitals', { params: { limit: 500 } });
        setHospitals(h.data?.data || []);
      } catch (e) {
        console.error('[Backlog] hospital load failed:', e?.response?.data?.message || e.message);
      }
    })();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [poRes, sumRes] = await Promise.all([
        listHospitalPos(filters),
        getBacklogSummary()
      ]);
      setRows(poRes.data || []);
      setSummary(sumRes);
    } catch (e) {
      showError(e, 'Could not load PO backlog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [filters.hospital_id, filters.status, filters.from, filters.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExpireStale = async () => {
    if (!window.confirm('Flag stale POs (past expiry_date) as EXPIRED?')) return;
    try {
      const res = await expireStalePos();
      showSuccess(`Expired ${res?.data?.modified || 0} stale PO(s)`);
      await loadAll();
    } catch (e) {
      showError(e, 'Could not expire stale POs');
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>Hospital PO Backlog</h2>
      <div style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>
        Open + partially-served hospital purchase orders. Use this to drive reorder priority and BDM follow-up.
      </div>

      <WorkflowGuide pageKey="hospital-po-backlog" />

      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Open Backlog</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1e40af', marginTop: 4 }}>{summary.open_po_count}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>POs awaiting fulfillment</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Top Hospital by Unserved ₱</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginTop: 4, lineHeight: 1.3 }}>
              {summary.by_hospital?.[0]?.hospital_name || '—'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#b45309', marginTop: 4 }}>
              {peso(summary.by_hospital?.[0]?.total_unserved_amount)}
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Top Unserved SKU</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginTop: 4, lineHeight: 1.3 }}>
              {summary.top_unserved_skus?.[0]?.brand_name || '—'} {summary.top_unserved_skus?.[0]?.dosage_strength || ''}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#b45309', marginTop: 4 }}>
              {(summary.top_unserved_skus?.[0]?.total_unserved_qty || 0).toLocaleString()} units
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filters.hospital_id} onChange={e => setFilters(f => ({ ...f, hospital_id: e.target.value }))}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
          <option value="">All Hospitals</option>
          {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
          <option value="OPEN,PARTIAL">Open + Partial (default)</option>
          <option value="OPEN">Open only</option>
          <option value="PARTIAL">Partial only</option>
          <option value="FULFILLED">Fulfilled</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
          <option value="">All</option>
        </select>
        <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
          From
          <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                 style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        </label>
        <label style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
          To
          <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                 style={{ padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={handleExpireStale}
                  style={{ background: 'transparent', color: '#b91c1c', border: '1px solid #fca5a5', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            Expire Stale POs
          </button>
          <button onClick={() => navigate('/erp/hospital-pos/entry')}
                  style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            + New Hospital PO
          </button>
        </div>
      </div>

      {loading && <div>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          No hospital POs match the current filters.
        </div>
      )}
      {!loading && rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>PO #</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Hospital</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>BDM</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>PO Date</th>
              <th style={{ padding: 10, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Total ₱</th>
              <th style={{ padding: 10, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Served ₱</th>
              <th style={{ padding: 10, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Unserved ₱</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Status</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const unserved = (r.total_amount_ordered || 0) - (r.total_amount_served || 0);
              const c = STATUS_COLORS[r.status] || STATUS_COLORS.OPEN;
              return (
                <tr key={r._id} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer' }}
                    onClick={() => navigate(`/erp/hospital-pos/${r._id}`)}>
                  <td style={{ padding: 10, fontFamily: 'monospace', fontWeight: 600 }}>{r.po_number}</td>
                  <td style={{ padding: 10 }}>{r.hospital_id?.hospital_name || '—'}</td>
                  <td style={{ padding: 10 }}>{r.bdm_id?.name || '—'}</td>
                  <td style={{ padding: 10 }}>{r.po_date ? new Date(r.po_date).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: 10, textAlign: 'right' }}>{peso(r.total_amount_ordered)}</td>
                  <td style={{ padding: 10, textAlign: 'right', color: '#15803d' }}>{peso(r.total_amount_served)}</td>
                  <td style={{ padding: 10, textAlign: 'right', fontWeight: 600, color: '#b45309' }}>{peso(unserved)}</td>
                  <td style={{ padding: 10 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: 10 }}>
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/erp/hospital-pos/${r._id}`); }}
                            style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
