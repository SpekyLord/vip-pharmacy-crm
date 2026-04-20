/**
 * UndertakingList — Phase 32
 *
 * Entry page for Undertaking (receipt-confirmation) documents. Auto-created
 * as siblings to every GRN; DRAFT rows are the BDM's capture queue.
 *
 * Filter tabs: ALL / DRAFT / SUBMITTED / ACKNOWLEDGED / REJECTED.
 * Columns: UT#, Linked GRN + source-type badge, vendor, receipt date, lines,
 * scan ratio, variance count, status. Row click → /erp/undertaking/:id.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Pagination from '../../components/common/Pagination';
import WorkflowGuide from '../components/WorkflowGuide';
import { listUndertakings } from '../services/undertakingService';
import { showError } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT:        { bg: '#e5e7eb', fg: '#374151', label: 'Review Pending' },
  SUBMITTED:    { bg: '#fef3c7', fg: '#92400e', label: 'Submitted' },
  ACKNOWLEDGED: { bg: '#dcfce7', fg: '#166534', label: 'Acknowledged' },
  REJECTED:     { bg: '#fee2e2', fg: '#991b1b', label: 'Rejected' },
};

const SOURCE_BADGES = {
  PO:                { bg: '#dbeafe', fg: '#1e40af', label: 'PO' },
  INTERNAL_TRANSFER: { bg: '#f3e8ff', fg: '#7c3aed', label: 'TRANSFER' },
  STANDALONE:        { bg: '#f1f5f9', fg: '#475569', label: 'STANDALONE' },
};

const TABS = ['', 'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'REJECTED'];

const PAGE_SIZE = 25;

function scanRatio(row) {
  const total = row.line_items?.length || 0;
  const scanned = (row.line_items || []).filter(l => l.scan_confirmed).length;
  return { total, scanned };
}

function varianceCount(row) {
  return (row.line_items || []).filter(l => l.variance_flag).length;
}

export default function UndertakingList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [period, setPeriod] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = { limit: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE };
        if (statusFilter) params.status = statusFilter;
        if (period) params.period = period;
        const res = await listUndertakings(params);
        if (cancelled) return;
        setRows(Array.isArray(res?.data) ? res.data : []);
        setTotal(res?.pagination?.total || 0);
      } catch (err) {
        if (!cancelled) showError(err, 'Failed to load undertakings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, period, page]);

  const handleTab = (val) => {
    setStatusFilter(val);
    setPage(1);
  };

  return (
    <div className="admin-page erp-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main ut-main">
          <WorkflowGuide pageKey="undertaking-entry" />

          <div className="ut-header">
            <div>
              <h1>Undertaking (Review & Approval)</h1>
              <p>
                Every GRN auto-creates an Undertaking as a read-only review wrapper. BDM opens a DRAFT
                to double-check the captured batch/expiry/qty + waybill, then Validate &amp; Submit.
                Acknowledging an Undertaking auto-approves the linked GRN in the same session.
              </p>
            </div>
          </div>

          <div className="ut-filters">
            <div className="filter-tabs">
              {TABS.map(t => (
                <button
                  key={t || 'ALL'}
                  className={`filter-tab ${statusFilter === t ? 'active' : ''}`}
                  onClick={() => handleTab(t)}
                >
                  {t ? STATUS_COLORS[t]?.label || t : 'All'}
                </button>
              ))}
            </div>
            <div className="ut-period">
              <label>
                Period&nbsp;
                <input
                  type="month"
                  value={period}
                  onChange={e => { setPeriod(e.target.value); setPage(1); }}
                />
              </label>
              {period && (
                <button className="btn btn-outline btn-sm" onClick={() => { setPeriod(''); setPage(1); }}>
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="ut-table-wrap">
            <table className="ut-table">
              <thead>
                <tr>
                  <th>UT #</th>
                  <th>Linked GRN</th>
                  <th>Vendor</th>
                  <th>Receipt Date</th>
                  <th>Lines</th>
                  <th>Scans</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--erp-muted)' }}>Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: 'var(--erp-muted)' }}>No undertakings found</td></tr>
                )}
                {!loading && rows.map(row => {
                  const grn = row.linked_grn_id || {};
                  const src = SOURCE_BADGES[grn.source_type] || SOURCE_BADGES.STANDALONE;
                  const st = STATUS_COLORS[row.status] || { bg: '#e5e7eb', fg: '#374151', label: row.status };
                  const ratio = scanRatio(row);
                  const variances = varianceCount(row);
                  return (
                    <tr key={row._id} onClick={() => navigate(`/erp/undertaking/${row._id}`)} className="ut-row">
                      <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{row.undertaking_number}</td>
                      <td>
                        {grn._id ? (
                          <Link to={`/erp/grn/${grn._id}/audit`} onClick={e => e.stopPropagation()} style={{ color: '#2563eb', fontSize: 12 }}>
                            {/* Phase 32R-GRN#: prefer human-readable grn_number, then PO#, then id-tail for legacy rows */}
                            {grn.grn_number || (grn.po_number ? `GRN · ${grn.po_number}` : `GRN · ${grn._id.slice(-6)}`)}
                          </Link>
                        ) : '—'}
                        {' '}
                        <span className="src-badge" style={{ background: src.bg, color: src.fg }}>{src.label}</span>
                      </td>
                      <td style={{ fontSize: 12 }}>{grn.vendor_id?.vendor_name || '—'}</td>
                      <td style={{ fontSize: 12 }}>{row.receipt_date ? new Date(row.receipt_date).toLocaleDateString('en-PH') : '—'}</td>
                      <td style={{ textAlign: 'center' }}>{ratio.total}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>
                        <span style={{ color: ratio.scanned === ratio.total ? '#166534' : '#92400e', fontWeight: 600 }}>
                          {ratio.scanned}/{ratio.total}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {variances > 0
                          ? <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700 }}>{variances}</span>
                          : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td>
                        <span className="status-pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pages={pages} total={total} onPageChange={setPage} />
        </main>
      </div>
    </div>
  );
}

const pageStyles = `
  .ut-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; max-width: 1280px; margin: 0 auto; }
  .ut-header { margin-bottom: 16px; }
  .ut-header h1 { font-size: 24px; color: var(--erp-text, #132238); margin: 0; }
  .ut-header p { margin: 4px 0 0; color: var(--erp-muted); font-size: 13px; line-height: 1.5; max-width: 860px; }
  .ut-filters { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .filter-tabs { display: flex; gap: 0; border-bottom: 1px solid var(--erp-border); }
  .filter-tab { padding: 8px 14px; border: none; background: none; font-size: 13px; font-weight: 600; color: var(--erp-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
  .filter-tab.active { color: var(--erp-accent); border-bottom-color: var(--erp-accent); }
  .ut-period { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--erp-muted); }
  .ut-period input { padding: 6px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; }
  .ut-table-wrap { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .ut-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ut-table th { padding: 10px 14px; text-align: left; font-weight: 600; color: var(--erp-muted); background: var(--erp-bg); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .ut-table td { padding: 10px 14px; border-top: 1px solid var(--erp-border); vertical-align: middle; }
  .ut-row { cursor: pointer; transition: background 0.1s; }
  .ut-row:hover { background: #f8fafc; }
  .status-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
  .src-badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; margin-left: 4px; letter-spacing: 0.04em; }
  .btn { padding: 6px 12px; border: 1px solid var(--erp-border); border-radius: 6px; background: transparent; font-size: 12px; cursor: pointer; }
  .btn-outline { background: transparent; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  @media (max-width: 640px) {
    .ut-main { padding: 76px 12px 96px; }
    .ut-header h1 { font-size: 20px; }
    .ut-table th:nth-child(3), .ut-table td:nth-child(3) { display: none; }
    .ut-table th:nth-child(5), .ut-table td:nth-child(5) { display: none; }
    .ut-table th, .ut-table td { padding: 8px 10px; font-size: 12px; }
  }
`;
