import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Pagination from '../../components/common/Pagination';
import DocumentFlowChain from '../components/DocumentFlowChain';
import { useAuth } from '../../hooks/useAuth';
import { isAdminLike } from '../../constants/roles';
import useCollections from '../hooks/useCollections';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  VALID: { bg: '#dcfce7', text: '#166534' },
  ERROR: { bg: '#fef2f2', text: '#991b1b' },
  POSTED: { bg: '#dbeafe', text: '#1e40af' },
  DELETION_REQUESTED: { bg: '#fef3c7', text: '#92400e' }
};

const pageStyles = `
  .coll-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .coll-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .coll-list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .coll-list-header h1 { font-size: 22px; color: var(--erp-text); margin: 0; }
  .coll-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .coll-actions .btn { flex: 0 0 auto; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .filter-bar { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .filter-bar select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); height: 38px; }
  .coll-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .coll-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 14px; text-align: left; font-weight: 600; }
  .coll-table td { padding: 10px 14px; border-top: 1px solid var(--erp-border); }
  .coll-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .detail-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .detail-panel { background: var(--erp-panel); border-radius: 16px; padding: 24px; max-width: 700px; width: 95%; max-height: 85vh; overflow-y: auto; }
  @media(max-width: 768px) {
    .coll-page { padding-top: 12px; }
    .coll-main { padding: 76px 12px calc(96px + env(safe-area-inset-bottom, 0px)); }
    .coll-list-header { flex-direction: column; align-items: flex-start; }
    .coll-actions { width: 100%; }
    .coll-actions .btn { width: 100%; }
    .filter-bar { flex-direction: column; align-items: stretch; }
    .filter-bar .vip-select__control { width: 100%; }
    .coll-table { display: none; }
    .coll-card-list { display: grid; gap: 10px; padding: 0 0 12px; }
    .coll-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 12px 14px; }
    .coll-card-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .coll-card-title { font-weight: 700; font-size: 14px; color: var(--erp-text); }
    .coll-card-sub { font-size: 12px; color: var(--erp-muted); }
    .coll-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .coll-card-item { display: flex; flex-direction: column; gap: 2px; }
    .coll-card-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #94a3b8; font-weight: 700; }
    .coll-card-value { font-size: 12px; color: var(--erp-text); }
  }

  @media(max-width: 480px) {
    .coll-page { padding-top: 16px; }
    .coll-main { padding-top: 72px; padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px)); }
    .coll-card-grid { grid-template-columns: 1fr; }
  }
`;

export default function Collections() {
  const { user } = useAuth();
  const coll = useCollections();
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: '' });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const isAdmin = isAdminLike(user?.role);

  const loadData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.status) params.status = filters.status;
      const res = await coll.getCollections(params);
      setData(res?.data || []);
      setPagination(res?.pagination || { page: 1, limit: 20, total: 0, pages: 0 });
    } catch (err) { console.error('[Collections] load error:', err.message); } finally { setLoading(false); }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const handleValidate = async (ids) => {
    try {
      const res = await coll.validateCollections(ids);
      const msg = `Validated: ${res?.valid_count || 0} valid, ${res?.error_count || 0} errors`;
      if (res?.error_count) showError(null, msg + '. Check missing documents (CR photo, CSI photos, deposit slip, CWT cert) or CR formula mismatch.');
      else showSuccess(msg);
      loadData(pagination.page);
    } catch (err) { showError(err, 'Could not validate collection'); }
  };
  const handleSubmit = async (collectionId) => {
    const msg = collectionId
      ? 'Submit this collection?'
      : 'Submit all validated collections?';
    if (!window.confirm(msg)) return;
    try { await coll.submitCollections(collectionId ? [collectionId] : undefined); loadData(pagination.page); } catch (err) { showError(err, 'Could not submit collections'); }
  };
  const handleReopen = async (id) => {
    if (!window.confirm('Re-open this collection?')) return;
    try { await coll.reopenCollections([id]); loadData(pagination.page); } catch (err) { showError(err, 'Could not reopen collection'); }
  };
  const handleDeleteDraft = async (id) => {
    if (!window.confirm('Delete this draft collection?')) return;
    try { await coll.deleteDraft(id); loadData(pagination.page); } catch (err) { showError(err, 'Could not delete collection'); }
  };
  const viewDetail = async (id) => {
    try { const res = await coll.getCollectionById(id); if (res?.data) setSelected(res.data); } catch (err) { console.error('[Collections] load error:', err.message); }
  };

  return (
    <div className="admin-page erp-page coll-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="coll-main">
          <WorkflowGuide pageKey="collections" />
          <div className="coll-list-header">
            <h1>Collections</h1>
            <div className="coll-actions">
              <Link to="/erp/collections/session" className="btn btn-primary">+ New Collection</Link>
              <Link to="/erp/collections/ar" className="btn btn-success">AR Aging</Link>
              <Link to="/erp/collections/soa" className="btn btn-success">SOA</Link>
            </div>
          </div>

          <div className="filter-bar">
            <SelectField value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All Status</option>
              {['DRAFT', 'VALID', 'ERROR', 'POSTED'].map(s => <option key={s} value={s}>{s}</option>)}
            </SelectField>
          </div>

          <table className="coll-table">
            <thead><tr><th>CR #</th><th>Hospital / Customer</th><th>Date</th><th>Amount</th><th>CWT</th><th>Comm</th><th>Rebates</th><th>Invoices</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {data.map(c => {
                const sc = STATUS_COLORS[c.status] || {};
                return (
                  <tr key={c._id} onClick={() => viewDetail(c._id)}>
                    <td style={{ fontWeight: 600 }}>{c.cr_no}</td>
                    <td>{c.hospital_id?.hospital_name || c.customer_id?.customer_name || '—'}</td>
                    <td>{new Date(c.cr_date).toLocaleDateString('en-PH')}</td>
                    <td>P{(c.cr_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{c.cwt_na ? 'N/A' : `P${(c.cwt_amount || 0).toFixed(2)}`}</td>
                    <td style={{ color: '#16a34a' }}>{c.total_commission ? `P${c.total_commission.toFixed(2)}` : '—'}</td>
                    <td style={{ color: '#7c3aed' }}>{c.total_partner_rebates ? `P${c.total_partner_rebates.toFixed(2)}` : '—'}</td>
                    <td>{c.settled_csis?.length || 0}</td>
                    <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{c.status}</span></td>
                    <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(c.status === 'DRAFT' || c.status === 'ERROR') && <button className="btn btn-sm btn-primary" onClick={() => handleValidate([c._id])}>Validate</button>}
                      {c.status === 'DRAFT' && <button className="btn btn-sm" style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff' }} onClick={() => handleDeleteDraft(c._id)}>Del</button>}
                      {c.status === 'VALID' && <button className="btn btn-sm btn-success" onClick={() => handleSubmit(c._id)}>Submit</button>}
                      {c.status === 'POSTED' && isAdmin && <button className="btn btn-sm btn-warning" onClick={() => handleReopen(c._id)}>Re-open</button>}
                    </td>
                  </tr>
                );
              })}
              {!data.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>{loading ? 'Loading...' : 'No collections found'}</td></tr>}
            </tbody>
          </table>
          <div className="coll-card-list">
            {data.map(c => {
              const sc = STATUS_COLORS[c.status] || {};
              return (
                <div key={c._id} className="coll-card" onClick={() => viewDetail(c._id)}>
                  <div className="coll-card-header">
                    <div>
                      <div className="coll-card-title">CR #{c.cr_no}</div>
                      <div className="coll-card-sub">{new Date(c.cr_date).toLocaleDateString('en-PH')}</div>
                    </div>
                    <span className="badge" style={{ background: sc.bg, color: sc.text }}>{c.status}</span>
                  </div>
                  <div className="coll-card-grid">
                    <div className="coll-card-item">
                      <span className="coll-card-label">Customer</span>
                      <span className="coll-card-value">{c.hospital_id?.hospital_name || c.customer_id?.customer_name || '—'}</span>
                    </div>
                    <div className="coll-card-item">
                      <span className="coll-card-label">Amount</span>
                      <span className="coll-card-value">P{(c.cr_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="coll-card-item">
                      <span className="coll-card-label">Invoices</span>
                      <span className="coll-card-value">{c.settled_csis?.length || 0}</span>
                    </div>
                    <div className="coll-card-item">
                      <span className="coll-card-label">CWT</span>
                      <span className="coll-card-value">{c.cwt_na ? 'N/A' : `P${(c.cwt_amount || 0).toFixed(2)}`}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    {(c.status === 'DRAFT' || c.status === 'ERROR') && <button className="btn btn-sm btn-primary" onClick={() => handleValidate([c._id])}>Validate</button>}
                    {c.status === 'DRAFT' && <button className="btn btn-sm" style={{ border: '1px solid #ef4444', color: '#ef4444', background: '#fff' }} onClick={() => handleDeleteDraft(c._id)}>Del</button>}
                    {c.status === 'VALID' && <button className="btn btn-sm btn-success" onClick={() => handleSubmit(c._id)}>Submit</button>}
                    {c.status === 'POSTED' && isAdmin && <button className="btn btn-sm btn-warning" onClick={() => handleReopen(c._id)}>Re-open</button>}
                  </div>
                </div>
              );
            })}
            {!data.length && (
              <div className="coll-card" style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>
                {loading ? 'Loading...' : 'No collections found'}
              </div>
            )}
          </div>
          {pagination.pages > 1 && <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadData} />}

          {selected && (
            <div className="detail-modal" onClick={() => setSelected(null)}>
              <div className="detail-panel" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h2>CR# {selected.cr_no}</h2>
                  <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>&times;</button>
                </div>
                <p><strong>Hospital / Customer:</strong> {selected.hospital_id?.hospital_name || selected.customer_id?.customer_name || '—'}</p>
                <p><strong>Date:</strong> {new Date(selected.cr_date).toLocaleDateString('en-PH')}</p>
                <p><strong>Amount:</strong> P{(selected.cr_amount || 0).toFixed(2)}</p>
                <p><strong>CWT:</strong> {selected.cwt_na ? 'N/A' : `P${(selected.cwt_amount || 0).toFixed(2)}`}</p>
                <p><strong>Payment:</strong> {selected.payment_mode}{selected.check_no ? ` — #${selected.check_no}` : ''}</p>
                <p><strong>Status:</strong> <span className="badge" style={STATUS_COLORS[selected.status] || {}}>{selected.status}</span></p>
                <p><strong>Commission:</strong> P{(selected.total_commission || 0).toFixed(2)}</p>
                <p><strong>Partner Rebates:</strong> P{(selected.total_partner_rebates || 0).toFixed(2)}</p>
                <h3 style={{ marginTop: 16, fontSize: 14 }}>Settled CSIs ({selected.settled_csis?.length || 0})</h3>
                {selected.settled_csis?.map((s) => (
                  <div key={s._id || s.doc_ref} style={{ border: '1px solid var(--erp-border)', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                      <strong>CSI# {s.doc_ref}</strong>
                      <span style={{ fontWeight: 600 }}>P{(s.invoice_amount || 0).toFixed(2)}</span>
                    </div>
                    <div style={{ color: 'var(--erp-muted)', marginTop: 4 }}>
                      Commission: {((s.commission_rate || 0) * 100).toFixed(1)}% = P{(s.commission_amount || 0).toFixed(2)}
                      {s.source === 'OPENING_AR' && <span style={{ marginLeft: 8, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>Opening AR</span>}
                    </div>
                    {s.partner_tags?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {s.partner_tags.map((t, j) => (
                          <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
                            <span style={{ background: '#ede9fe', color: '#5b21b6', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{t.doctor_name}</span>
                            <span style={{ fontSize: 11, color: '#16a34a' }}>Rebate: {t.rebate_pct}% = P{(t.rebate_amount || 0).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {/* Phase 9.3: Document Flow Chain */}
                {selected.event_id && (
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--erp-border)', paddingTop: 12 }}>
                    <DocumentFlowChain eventId={selected.event_id} />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
