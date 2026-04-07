import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Pagination from '../../components/common/Pagination';
import { useAuth } from '../../hooks/useAuth';
import useSales from '../hooks/useSales';
import useEntities from '../hooks/useEntities';
import EntityBadge from '../components/EntityBadge';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

function toTitleCase(str) {
  if (!str) return str;
  return str.toLowerCase()
    .replace(/(?:^|\s|[-/])\S/g, c => c.toUpperCase())
    .replace(/\b(Of|And|The|De|In|At|To|For|On)\b/g, w => w.toLowerCase())
    .replace(/^\S/, c => c.toUpperCase());
}

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  VALID: { bg: '#dcfce7', text: '#166534' },
  ERROR: { bg: '#fef2f2', text: '#991b1b' },
  POSTED: { bg: '#dbeafe', text: '#1e40af' },
  DELETION_REQUESTED: { bg: '#fef3c7', text: '#92400e' }
};

const pageStyles = `
  .saleslist-page { background: var(--erp-bg, #f4f7fb); }
  .saleslist-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .saleslist-inner { max-width: 1200px; margin: 0 auto; }
  .saleslist-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .saleslist-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }

  .filter-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; align-items: center; }
  .filter-bar input, .filter-bar select {
    padding: 8px 12px;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 8px;
    font-size: 13px;
    background: var(--erp-panel, #fff);
    color: var(--erp-text);
    height: 38px;
  }

  .filter-bar select {
    min-width: 140px;
  }

  .sales-list-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .sales-list-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 14px; text-align: left; font-weight: 600; color: var(--erp-text); white-space: nowrap; }
  .sales-list-table td { padding: 10px 14px; border-top: 1px solid var(--erp-border); }
  .sales-list-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }

  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }

  .sales-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sales-actions .btn {
    min-width: 86px;
  }

  .detail-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .detail-panel { background: var(--erp-panel, #fff); border-radius: 16px; padding: 24px; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .detail-panel h2 { margin: 0 0 16px; font-size: 18px; }
  .detail-panel table { width: 100%; font-size: 13px; border-collapse: collapse; }
  .detail-panel table th { text-align: left; padding: 8px; background: var(--erp-bg); }
  .detail-panel table td { padding: 8px; border-top: 1px solid var(--erp-border); }

  @media (max-width: 768px) {
    .saleslist-main { padding: 16px; }
    .saleslist-main { padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .sales-list-table { font-size: 12px; }
    .filter-bar { flex-direction: column; }
    .filter-bar input, .filter-bar select { width: 100%; }

    .sales-list-table { border: none; background: transparent; }
    .sales-list-table thead { display: none; }
    .sales-list-table tbody { display: block; }
    .sales-list-table tr {
      display: block;
      background: var(--erp-panel, #fff);
      border: 1px solid var(--erp-border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .sales-list-table td {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-top: 1px solid var(--erp-border);
      white-space: normal;
    }
    .sales-list-table td:first-child { border-top: none; }
    .sales-list-table td::before {
      content: attr(data-label);
      font-weight: 600;
      color: var(--erp-muted, #6b7280);
      flex-shrink: 0;
    }
  }
  @media (max-width: 375px) {
    .saleslist-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .btn { font-size: 12px; padding: 6px 10px; }
    .filter-bar input, .filter-bar select { font-size: 16px; }
  }
`;

export default function SalesList() {
  const { user } = useAuth();
  const sales = useSales();
  const { getEntityById } = useEntities();
  const isMultiEntity = ['president', 'ceo', 'admin'].includes(user?.role);

  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: '', csi_date_from: '', csi_date_to: '', source: '' });
  const [selectedSale, setSelectedSale] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadSales = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.status) params.status = filters.status;
      if (filters.csi_date_from) params.csi_date_from = filters.csi_date_from;
      if (filters.csi_date_to) params.csi_date_to = filters.csi_date_to;
      if (filters.source) params.source = filters.source;

      const res = await sales.getSales(params);
      if (res?.data) setData(res.data);
      if (res?.pagination) setPagination(res.pagination);
    } catch {} finally { setLoading(false); }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!window.confirm('Submit all validated sales? Stock will be deducted via FIFO.')) return;
    try {
      await sales.submitSales();
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not submit sales');
    }
  };

  const handleReopen = async (id) => {
    if (!window.confirm('Re-open this posted sale? Stock will be reversed.')) return;
    try {
      await sales.reopenSales([id]);
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not reopen sale');
    }
  };

  const handleRequestDeletion = async (id) => {
    if (!window.confirm('Request deletion for this sale?')) return;
    try {
      await sales.requestDeletion(id);
      loadSales(pagination.page);
    } catch {}
  };

  const handleApproveDeletion = async (id) => {
    if (!window.confirm('Approve deletion? A reversal entry will be created (SAP Storno).')) return;
    try {
      await sales.approveDeletion(id, 'Approved by admin');
      loadSales(pagination.page);
    } catch {}
  };

  const viewDetail = async (id) => {
    try {
      const res = await sales.getSaleById(id);
      if (res?.data) setSelectedSale(res.data);
    } catch {}
  };

  const isAdmin = ['admin', 'finance', 'president'].includes(user?.role);

  return (
    <div className="admin-page erp-page saleslist-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="saleslist-main">
          <WorkflowGuide pageKey="sales-list" />
          <div className="saleslist-inner">
          <div className="saleslist-header">
            <h1>Sales</h1>
            <Link to="/erp/sales/entry" className="btn btn-primary">+ New Sales Entry</Link>
          </div>

          {/* Filters */}
          <div className="filter-bar">
            <SelectField value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="VALID">Valid</option>
              <option value="ERROR">Error</option>
              <option value="POSTED">Posted</option>
              <option value="DELETION_REQUESTED">Deletion Requested</option>
            </SelectField>
            <SelectField value={filters.source} onChange={e => handleFilterChange('source', e.target.value)}>
              <option value="">All Sources</option>
              <option value="SALES_LINE">Sales Line</option>
              <option value="OPENING_AR">Opening AR</option>
            </SelectField>
            <input type="date" value={filters.csi_date_from} onChange={e => handleFilterChange('csi_date_from', e.target.value)} placeholder="From" />
            <input type="date" value={filters.csi_date_to} onChange={e => handleFilterChange('csi_date_to', e.target.value)} placeholder="To" />
          </div>

          {/* Table */}
          <table className="sales-list-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>CSI #</th>
                <th>Hospital</th>
                <th>Total</th>
                <th>Source</th>
                <th>Status</th>
                {isMultiEntity && <th>Entity</th>}
                <th>Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(sale => (
                <tr key={sale._id} onClick={() => viewDetail(sale._id)}>
                  <td data-label="Date">{new Date(sale.csi_date).toLocaleDateString('en-PH')}</td>
                  <td data-label="CSI #"><strong>{sale.doc_ref}</strong></td>
                  <td data-label="Hospital">{toTitleCase(sale.hospital_id?.hospital_name) || '-'}</td>
                  <td data-label="Total">P{(sale.invoice_total || 0).toLocaleString()}</td>
                  <td data-label="Source" style={{ fontSize: 11 }}>{sale.source}</td>
                  <td data-label="Status">
                    <span className="badge" style={STATUS_COLORS[sale.status] || {}}>
                      {sale.status}
                    </span>
                  </td>
                  {isMultiEntity && (
                    <td data-label="Entity"><EntityBadge entity={getEntityById(sale.entity_id)} size="sm" /></td>
                  )}
                  <td data-label="Products" style={{ fontSize: 11, maxWidth: 220, whiteSpace: 'pre-line' }}>
                    {sale.line_items?.map((li, i) => (
                      <div key={i}>{li.item_key || '—'} × {li.qty}</div>
                    ))}
                  </td>
                  <td data-label="Actions" onClick={e => e.stopPropagation()}>
                    <div className="sales-actions">
                    {sale.status === 'VALID' && (
                      <button className="btn btn-sm" style={{ background: '#16a34a', color: '#fff' }} onClick={() => handleSubmit()}>
                        Submit
                      </button>
                    )}
                    {sale.status === 'POSTED' && (
                      <button className="btn btn-warning btn-sm" onClick={() => handleReopen(sale._id)}>
                        Re-open
                      </button>
                    )}
                    {sale.status === 'POSTED' && !isAdmin && (
                      <button className="btn btn-sm" style={{ background: '#991b1b', color: '#fff' }} onClick={() => handleRequestDeletion(sale._id)}>
                        Req. Delete
                      </button>
                    )}
                    {sale.status === 'DELETION_REQUESTED' && isAdmin && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleApproveDeletion(sale._id)}>
                        Approve Delete
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {!data.length && (
                <tr><td colSpan={isMultiEntity ? 9 : 8} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>
                  {loading ? 'Loading...' : 'No sales found'}
                </td></tr>
              )}
            </tbody>
          </table>

          {pagination.pages > 1 && (
            <div style={{ marginTop: 16 }}>
              <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadSales} />
            </div>
          )}

          {/* Detail Modal */}
          {selectedSale && (
            <div className="detail-modal" onClick={() => setSelectedSale(null)}>
              <div className="detail-panel" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>CSI# {selectedSale.doc_ref}</h2>
                  <button className="btn" onClick={() => setSelectedSale(null)} style={{ background: 'none', fontSize: 20, padding: 4 }}>&times;</button>
                </div>
                <p><strong>Hospital:</strong> {toTitleCase(selectedSale.hospital_id?.hospital_name) || '-'}</p>
                <p><strong>Date:</strong> {new Date(selectedSale.csi_date).toLocaleDateString('en-PH')}</p>
                <p><strong>Status:</strong> <span className="badge" style={STATUS_COLORS[selectedSale.status] || {}}>{selectedSale.status}</span></p>
                <p><strong>Source:</strong> {selectedSale.source}</p>
                {selectedSale.reopen_count > 0 && <p><strong>Reopened:</strong> {selectedSale.reopen_count} time(s)</p>}

                <h3 style={{ marginTop: 16, fontSize: 14 }}>Line Items</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Batch</th>
                      <th>Expiry</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Unit Price</th>
                      <th>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.line_items?.map((li, i) => (
                      <tr key={i}>
                        <td>{li.item_key || li.product_id}</td>
                        <td style={{ fontSize: 11 }}>{li.batch_lot_no || '-'}</td>
                        <td style={{ fontSize: 11 }}>{li.expiry_date ? new Date(li.expiry_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' }) : '-'}</td>
                        <td>{li.qty}</td>
                        <td>{li.unit}</td>
                        <td>P{li.unit_price?.toLocaleString()}</td>
                        <td>P{li.line_total?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <strong>Invoice Total: P{selectedSale.invoice_total?.toLocaleString()}</strong>
                  <br /><span style={{ fontSize: 12, color: 'var(--erp-muted)' }}>VAT: P{selectedSale.total_vat?.toFixed(2)} | Net: P{selectedSale.total_net_of_vat?.toFixed(2)}</span>
                </div>

                {selectedSale.validation_errors?.length > 0 && (
                  <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', borderRadius: 8 }}>
                    <strong style={{ color: '#991b1b', fontSize: 13 }}>Validation Errors:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {selectedSale.validation_errors.map((err, i) => (
                        <li key={i} style={{ fontSize: 12, color: '#991b1b' }}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        </main>
      </div>
    </div>
  );
}
