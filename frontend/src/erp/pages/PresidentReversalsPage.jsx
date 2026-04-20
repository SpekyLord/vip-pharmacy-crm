/**
 * President Reversals Console — Phase 31
 *
 * Cross-module read + dispatch UI for SAP Storno reversals across all ERP modules.
 * Two tabs:
 *   1. Reversible Transactions — POSTED docs that can be reversed (filterable)
 *   2. Reversal History — audit log of completed reversals
 *
 * Read access requires sub-permission `accounting.reversal_console`. Reverse
 * action requires `accounting.reverse_posted`. Both are seeded as ERP_SUB_PERMISSION
 * lookups so subscribers configure them via Access Templates — no code changes.
 *
 * The doc-type filter is populated from the backend registry (lookup-driven).
 * A new reversible module added to documentReversalService appears here automatically.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import usePresidentReversals from '../hooks/usePresidentReversals';
import PresidentReverseModal from '../components/PresidentReverseModal';
import WorkflowGuide from '../components/WorkflowGuide';
import DocumentDetailPanel from '../components/DocumentDetailPanel';
import { useLookupBatch } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';

const styles = `
  .pr-page { padding: 20px; max-width: 1320px; margin: 0 auto; }
  .pr-header { margin-bottom: 14px; }
  .pr-title { font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
  .pr-sub { color: #475569; font-size: 13px; margin: 0; }
  .pr-tabs { display: flex; gap: 6px; border-bottom: 2px solid #e2e8f0; margin: 16px 0 14px; }
  .pr-tab { background: transparent; border: none; padding: 9px 14px; cursor: pointer; font-size: 13px; font-weight: 600; color: #64748b; border-bottom: 2px solid transparent; margin-bottom: -2px; }
  .pr-tab.active { color: #dc2626; border-bottom-color: #dc2626; }
  .pr-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 12px; }
  .pr-filter { display: flex; flex-direction: column; gap: 4px; }
  .pr-filter label { font-size: 11px; font-weight: 600; color: #475569; }
  .pr-filter select, .pr-filter input { padding: 7px 9px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 12px; min-width: 150px; }
  .pr-filter button { padding: 8px 14px; border-radius: 6px; border: none; background: #0f172a; color: #fff; font-weight: 600; font-size: 12px; cursor: pointer; }
  .pr-table-wrap { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: auto; }
  table.pr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pr-table th { text-align: left; padding: 10px 12px; background: #f1f5f9; font-weight: 600; color: #334155; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
  .pr-table td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .pr-table tr:hover td { background: #f8fafc; }
  .pr-type-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 600; }
  .pr-type-SALES_LINE { background: #dcfce7; color: #166534; }
  .pr-type-COLLECTION { background: #dbeafe; color: #1e40af; }
  .pr-type-EXPENSE { background: #fef3c7; color: #92400e; }
  .pr-type-CALF, .pr-type-PRF { background: #fce7f3; color: #9d174d; }
  .pr-type-GRN { background: #e0e7ff; color: #3730a3; }
  .pr-type-IC_TRANSFER { background: #cffafe; color: #155e75; }
  .pr-type-CONSIGNMENT_TRANSFER { background: #f3e8ff; color: #6b21a8; }
  .pr-type-INCOME_REPORT { background: #ecfccb; color: #3f6212; }
  .pr-type-PAYSLIP { background: #fee2e2; color: #991b1b; }
  .pr-type-PETTY_CASH_TXN { background: #fef9c3; color: #854d0e; }
  .pr-type-JOURNAL_ENTRY { background: #f1f5f9; color: #334155; }
  .pr-btn-reverse { padding: 5px 10px; border-radius: 5px; border: 1px solid #fca5a5; background: #fef2f2; color: #991b1b; font-weight: 600; font-size: 12px; cursor: pointer; }
  .pr-btn-reverse:hover { background: #fecaca; }
  .pr-empty { padding: 40px; text-align: center; color: #64748b; font-size: 13px; }
  .pr-pager { display: flex; justify-content: space-between; align-items: center; padding: 12px; }
  .pr-mode-pill { display: inline-block; padding: 2px 7px; border-radius: 4px; background: #e2e8f0; color: #334155; font-size: 11px; font-weight: 600; }
  .pr-mode-SAP_STORNO { background: #fee2e2; color: #991b1b; }
  .pr-mode-HARD_DELETE { background: #fef3c7; color: #854d0e; }
  .pr-mode-VOID { background: #ecfccb; color: #3f6212; }
  body.dark-mode .pr-page { color: #e2e8f0; }
  body.dark-mode .pr-title { color: #f1f5f9; }
  body.dark-mode .pr-sub { color: #94a3b8; }
  body.dark-mode .pr-table-wrap { background: #1e293b; border-color: #334155; }
  body.dark-mode .pr-table th { background: #0f172a; color: #cbd5e1; border-color: #334155; }
  body.dark-mode .pr-table td { border-color: #334155; }
  body.dark-mode .pr-table tr:hover td { background: #0f172a; }
  body.dark-mode .pr-filters { background: #0f172a; border-color: #334155; }
  body.dark-mode .pr-filter select, body.dark-mode .pr-filter input { background: #1e293b; border-color: #334155; color: #e2e8f0; }
`;

const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

export default function PresidentReversalsPage() {
  const api = usePresidentReversals();
  const { data: lookups } = useLookupBatch(['CYCLE']);
  const [tab, setTab] = useState('reversible'); // 'reversible' | 'history'
  const [registry, setRegistry] = useState([]);
  const [filters, setFilters] = useState({ doc_type: '', from_date: '', to_date: '' });
  const [page, setPage] = useState(1);
  const LIMIT = 50;
  const [data, setData] = useState({ rows: [], total: 0, page: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reverseTarget, setReverseTarget] = useState(null); // { doc_type, doc_id, doc_ref, status }
  // Phase 31 — expandable-row lazy detail fetch (keyed by `${doc_type}:${doc_id}`)
  const [expandedKey, setExpandedKey] = useState(null);
  const [detailCache, setDetailCache] = useState({}); // { [key]: { data, error, loading } }
  const [previewImage, setPreviewImage] = useState(null);

  const cycleLabel = useCallback((code) => {
    const row = (lookups.CYCLE || []).find(c => c.code === code);
    return row?.label || code;
  }, [lookups.CYCLE]);

  const onToggleExpand = useCallback(async (row) => {
    const key = `${row.doc_type}:${row.doc_id}`;
    if (expandedKey === key) { setExpandedKey(null); return; }
    setExpandedKey(key);
    if (detailCache[key]?.data) return; // already fetched
    setDetailCache(c => ({ ...c, [key]: { loading: true } }));
    try {
      const res = await api.getDetail(row.doc_type, row.doc_id);
      setDetailCache(c => ({ ...c, [key]: { data: res?.data || null, loading: false } }));
    } catch (err) {
      setDetailCache(c => ({ ...c, [key]: { error: err?.response?.data?.message || err?.message || 'Failed to load detail', loading: false } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedKey, detailCache]);

  // Lookup-driven type filter — no hardcoded enum.
  useEffect(() => {
    api.getRegistry().then(r => setRegistry(r?.data || [])).catch(() => setRegistry([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const params = {
        page, limit: LIMIT,
        ...(filters.doc_type ? { doc_types: filters.doc_type } : {}),
        ...(filters.from_date ? { from_date: filters.from_date } : {}),
        ...(filters.to_date ? { to_date: filters.to_date } : {}),
        ...(filters.doc_type && tab === 'history' ? { doc_type: filters.doc_type } : {}),
      };
      const fn = tab === 'reversible' ? api.getReversible : api.getHistory;
      const res = await fn(params);
      setData({ rows: res?.data || [], total: res?.total || 0, page: res?.page || page });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load');
      setData({ rows: [], total: 0, page: 1 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page]);

  const switchTab = (next) => {
    if (next === tab) return;
    // Reset page atomically with tab — avoids a double-fetch from two effects racing.
    setPage(1);
    setTab(next);
  };

  const onReverseClick = async (row) => {
    // Preview dependents first (informational — backend re-checks on submit).
    try {
      const pv = await api.getPreview(row.doc_type, row.doc_id);
      const deps = pv?.data?.dependents || [];
      setReverseTarget({
        doc_type: row.doc_type, doc_id: row.doc_id,
        doc_ref: row.doc_ref, status: row.status, dependents: deps,
      });
    } catch {
      // Even if preview fails (e.g., already reversed), let the modal open and
      // surface backend-side errors on submit.
      setReverseTarget({ doc_type: row.doc_type, doc_id: row.doc_id, doc_ref: row.doc_ref, status: row.status, dependents: [] });
    }
  };

  const onConfirmReverse = async ({ reason, confirm }) => {
    try {
      await api.reverse({
        doc_type: reverseTarget.doc_type,
        doc_id: reverseTarget.doc_id,
        reason, confirm,
      });
      setReverseTarget(null);
      await load();
    } catch (err) {
      const deps = err?.response?.data?.dependents;
      const baseMsg = err?.response?.data?.message || err?.message || 'Reversal failed';
      const full = deps?.length
        ? `${baseMsg} — depends on: ${deps.map(d => `${d.type} ${d.ref}${d.message ? ` (${d.message})` : ''}`).join(', ')}`
        : baseMsg;
      showError({ message: full }, full);
      throw err; // keep modal open for retry
    }
  };

  const reversibleColumns = useMemo(() => (
    <thead>
      <tr>
        <th>Type</th>
        <th>Document</th>
        <th>Status</th>
        <th>Posted At</th>
        <th>Detail</th>
        <th></th>
      </tr>
    </thead>
  ), []);

  const historyColumns = useMemo(() => (
    <thead>
      <tr>
        <th>Reversed At</th>
        <th>Type</th>
        <th>Document</th>
        <th>Mode</th>
        <th>Side Effects</th>
        <th>By</th>
        <th>Reason</th>
      </tr>
    </thead>
  ), []);

  return (
    <div className="pr-page">
      <style>{styles}</style>

      <div className="pr-header">
        <h1 className="pr-title">President Reversal Console</h1>
        <p className="pr-sub">
          Cross-module SAP Storno dispatch. Reversal entries land in the current open period;
          original documents stay POSTED for audit. Dependent-doc check runs before any reversal.
        </p>
      </div>

      <WorkflowGuide pageKey="president-reversals" />

      <div className="pr-tabs">
        <button className={`pr-tab ${tab === 'reversible' ? 'active' : ''}`} onClick={() => switchTab('reversible')}>
          Reversible Transactions
        </button>
        <button className={`pr-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => switchTab('history')}>
          Reversal History
        </button>
      </div>

      <div className="pr-filters">
        <div className="pr-filter">
          <label>Document Type</label>
          <select value={filters.doc_type} onChange={(e) => setFilters(f => ({ ...f, doc_type: e.target.value }))}>
            <option value="">All Types</option>
            {registry.map(t => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="pr-filter">
          <label>From</label>
          <input type="date" value={filters.from_date} onChange={(e) => setFilters(f => ({ ...f, from_date: e.target.value }))} />
        </div>
        <div className="pr-filter">
          <label>To</label>
          <input type="date" value={filters.to_date} onChange={(e) => setFilters(f => ({ ...f, to_date: e.target.value }))} />
        </div>
        <div className="pr-filter">
          <label>&nbsp;</label>
          <button onClick={() => (page === 1 ? load() : setPage(1))}>{loading ? 'Loading…' : 'Apply'}</button>
        </div>
      </div>

      <div className="pr-table-wrap">
        <table className="pr-table">
          {tab === 'reversible' ? reversibleColumns : historyColumns}
          <tbody>
            {error && (
              <tr><td colSpan="7" className="pr-empty" style={{ color: '#dc2626' }}>{error}</td></tr>
            )}
            {!error && !data.rows.length && !loading && (
              <tr><td colSpan="7" className="pr-empty">
                {tab === 'reversible' ? 'No reversible transactions match the current filter.' : 'No reversal history yet.'}
              </td></tr>
            )}
            {tab === 'reversible' && data.rows.map(row => {
              const key = `${row.doc_type}:${row.doc_id}`;
              const isExpanded = expandedKey === key;
              const cache = detailCache[key];
              return (
                <React.Fragment key={`${row.doc_type}-${row.doc_id}`}>
                  <tr>
                    <td><span className={`pr-type-badge pr-type-${row.doc_type}`}>{row.label || row.doc_type}</span></td>
                    <td><strong>{row.doc_ref}</strong></td>
                    <td>{row.status}</td>
                    <td>{fmtDate(row.posted_at)}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{row.sub || '—'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => onToggleExpand(row)}
                        style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #cbd5e1', background: isExpanded ? '#eff6ff' : '#fff', color: isExpanded ? '#1d4ed8' : '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                      <button className="pr-btn-reverse" onClick={() => onReverseClick(row)}>Reverse…</button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} style={{ background: '#f8fafc', padding: 12 }}>
                        {cache?.loading && (
                          <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading detail…</div>
                        )}
                        {cache?.error && (
                          <div style={{ padding: 12, color: '#991b1b', fontSize: 13 }}>
                            {cache.error}{' '}
                            <button onClick={() => onToggleExpand(row)} style={{ marginLeft: 8, color: '#1d4ed8', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
                          </div>
                        )}
                        {cache?.data && (
                          <DocumentDetailPanel
                            module={cache.data.module}
                            details={cache.data.details}
                            mode="reversal"
                            item={{ id: key }}
                            cycleLabel={cycleLabel}
                            onPreviewImage={setPreviewImage}
                          />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {tab === 'history' && data.rows.map(row => (
              <tr key={String(row._id)}>
                <td>{fmtDate(row.changed_at)}</td>
                <td><span className={`pr-type-badge pr-type-${row.target_model}`}>{row.target_model}</span></td>
                <td><strong>{row.new_value?.doc_ref || row.target_ref}</strong></td>
                <td><span className={`pr-mode-pill pr-mode-${row.new_value?.mode || ''}`}>{row.new_value?.mode || '—'}</span></td>
                <td style={{ color: '#64748b', fontSize: 12 }}>{(row.new_value?.side_effects || []).join(', ') || '—'}</td>
                <td>{row.changed_by?.name || row.changed_by?.email || '—'}</td>
                <td style={{ maxWidth: 280, color: '#475569', fontSize: 12 }}>{row.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pr-pager">
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {loading
            ? 'Loading…'
            : (() => {
                const start = data.total === 0 ? 0 : (page - 1) * LIMIT + 1;
                const end = (page - 1) * LIMIT + data.rows.length;
                return `Showing ${start}–${end} of ${data.total}`;
              })()}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid #cbd5e1', background: page <= 1 ? '#f1f5f9' : '#fff', color: '#334155', fontSize: 12, fontWeight: 600, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
          >
            ← Prev
          </button>
          <span style={{ fontSize: 12, color: '#475569', padding: '0 4px' }}>
            Page {page} of {Math.max(1, Math.ceil((data.total || 0) / LIMIT))}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={loading || page * LIMIT >= (data.total || 0)}
            style={{ padding: '6px 12px', borderRadius: 5, border: '1px solid #cbd5e1', background: page * LIMIT >= (data.total || 0) ? '#f1f5f9' : '#fff', color: '#334155', fontSize: 12, fontWeight: 600, cursor: page * LIMIT >= (data.total || 0) ? 'not-allowed' : 'pointer' }}
          >
            Next →
          </button>
        </div>
      </div>

      {reverseTarget && (
        <PresidentReverseModal
          docLabel={
            `${reverseTarget.doc_type}: ${reverseTarget.doc_ref}` +
            (reverseTarget.dependents?.length ? `\n⚠ ${reverseTarget.dependents.length} dependent(s) detected — backend may block.` : '')
          }
          docStatus={reverseTarget.status}
          onConfirm={onConfirmReverse}
          onClose={() => setReverseTarget(null)}
        />
      )}

      {/* Image preview modal — triggered by onPreviewImage from the shared DocumentDetailPanel */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20, cursor: 'zoom-out' }}
        >
          <img src={previewImage} alt="Preview" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 6 }} />
        </div>
      )}
    </div>
  );
}
