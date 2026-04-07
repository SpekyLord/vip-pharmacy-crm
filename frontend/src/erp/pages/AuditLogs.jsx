/**
 * Audit Logs Page — Searchable ERP audit log viewer
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useDashboard from '../hooks/useDashboard';

import SelectField from '../../components/common/Select';

const pageStyles = `
  .audit-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .audit-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1300px; margin: 0 auto; }
  .audit-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .audit-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
  .filters select, .filters input { padding: 7px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 12px; background: var(--erp-panel); color: var(--erp-text); }
  .audit-table { width: 100%; border-collapse: collapse; font-size: 12px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .audit-table th { background: var(--erp-accent-soft, #e8efff); padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap; font-size: 11px; }
  .audit-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); word-break: break-word; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .badge-edit { background: #fef3c7; color: #92400e; }
  .badge-delete { background: #fee2e2; color: #991b1b; }
  .badge-status { background: #dbeafe; color: #1d4ed8; }
  .badge-price { background: #d1fae5; color: #065f46; }
  .pagination { display: flex; gap: 6px; align-items: center; justify-content: center; margin-top: 16px; }
  .pagination button { padding: 6px 12px; border: 1px solid var(--erp-border); border-radius: 6px; background: var(--erp-panel); color: var(--erp-text); font-size: 12px; cursor: pointer; }
  .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
  .pagination button.active { background: var(--erp-accent); color: white; border-color: var(--erp-accent); }
  @media(max-width: 768px) { .audit-main { padding: 12px; } .audit-table { font-size: 11px; } }
`;

const LOG_TYPE_BADGES = {
  SALES_EDIT: 'badge-edit', PRICE_CHANGE: 'badge-price', ITEM_CHANGE: 'badge-edit',
  DELETION: 'badge-delete', REOPEN: 'badge-status', STATUS_CHANGE: 'badge-status'
};

export default function AuditLogs() {
  const { user } = useAuth();
  const dash = useDashboard();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({ log_type: '', target_model: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (filters.log_type) params.log_type = filters.log_type;
      if (filters.target_model) params.target_model = filters.target_model;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      const res = await dash.getAuditLogs(params);
      setLogs(res?.data || []);
      setPagination(res?.pagination || { page: 1, pages: 1, total: 0 });
    } catch { /* handled */ }
    setLoading(false);
  }, [page, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleFilter = (key, value) => {
    setFilters(p => ({ ...p, [key]: value }));
    setPage(1);
  };

  return (
    <div className="audit-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="audit-main">
          <div className="audit-header">
            <h1>Audit Logs</h1>
            <span style={{ fontSize: 13, color: 'var(--erp-muted)' }}>{pagination.total} entries</span>
          </div>

          <div className="filters">
            <SelectField value={filters.log_type} onChange={e => handleFilter('log_type', e.target.value)}>
              <option value="">All Types</option>
              <option value="SALES_EDIT">Sales Edit</option>
              <option value="PRICE_CHANGE">Price Change</option>
              <option value="ITEM_CHANGE">Item Change</option>
              <option value="DELETION">Deletion</option>
              <option value="REOPEN">Re-open</option>
              <option value="STATUS_CHANGE">Status Change</option>
            </SelectField>
            <SelectField value={filters.target_model} onChange={e => handleFilter('target_model', e.target.value)}>
              <option value="">All Models</option>
              <option value="SalesLine">Sales</option>
              <option value="Collection">Collection</option>
              <option value="ExpenseEntry">Expense</option>
              <option value="SmerEntry">SMER</option>
              <option value="GrnEntry">GRN</option>
            </SelectField>
            <input type="date" value={filters.from} onChange={e => handleFilter('from', e.target.value)} placeholder="From" />
            <input type="date" value={filters.to} onChange={e => handleFilter('to', e.target.value)} placeholder="To" />
          </div>

          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>Loading...</div>}

          {!loading && (
            <>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Model</th>
                    <th>Reference</th>
                    <th>Field</th>
                    <th>Old Value</th>
                    <th>New Value</th>
                    <th>Changed By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>No audit logs found</td></tr>
                  )}
                  {logs.map(log => (
                    <tr key={log._id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.changed_at).toLocaleString()}</td>
                      <td><span className={`badge ${LOG_TYPE_BADGES[log.log_type] || ''}`}>{log.log_type}</span></td>
                      <td>{log.target_model || '-'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{log.target_ref ? log.target_ref.slice(-8) : '-'}</td>
                      <td>{log.field_changed || '-'}</td>
                      <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.old_value != null ? String(log.old_value) : '-'}</td>
                      <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.new_value != null ? String(log.new_value) : '-'}</td>
                      <td>{log.changed_by ? `${log.changed_by.firstName || ''} ${log.changed_by.lastName || ''}`.trim() : '-'}</td>
                      <td style={{ maxWidth: 150, fontSize: 11 }}>{log.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pagination.pages > 1 && (
                <div className="pagination">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                  <span style={{ fontSize: 12, color: 'var(--erp-muted)' }}>Page {page} of {pagination.pages}</span>
                  <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
