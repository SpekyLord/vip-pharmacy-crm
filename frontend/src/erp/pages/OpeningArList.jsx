/**
 * OpeningArList — posted-history surface for pre-go-live CSIs.
 *
 * Why this page exists (Option B split — Apr 2026):
 *   Previously OpeningArEntry shipped with inline Entry/Transactions tabs on
 *   a single page. To harmonize with the Sales pattern (SalesEntry + SalesList
 *   are two separate pages wired through a shared `.sales-nav-tabs` widget),
 *   the Transactions tab was lifted out into this standalone page. All four
 *   sales-family surfaces (Sales, Sales Transactions, Opening AR, Opening AR
 *   Transactions) now share the same top navigation.
 *
 * What this page does:
 *   - Reads Sales rows filtered to `source: 'OPENING_AR'` via the same
 *     useSales hook SalesList uses (no parallel controller / service).
 *   - Surfaces POSTED / DELETION_REQUESTED rows by default (the entry page
 *     still handles DRAFT / VALID / ERROR editing). Status filter lets the
 *     user widen the scope if needed.
 *   - Preserves every action wired on SalesList: submit, reopen, request /
 *     approve deletion, President Delete, detail panel, rejection banner.
 *
 * Subscription-model scaling:
 *   Gated by `sales.opening_ar_list` sub-permission (seeded in
 *   lookupGenericController.js). Subscribers can keep this page visible for
 *   read-only audit while revoking `sales.opening_ar` to hide Entry once
 *   cutover is complete.
 *
 * Wiring integrity:
 *   - Reuses useSales (no new API surface) — server-side filter via GET /sales?source=OPENING_AR
 *   - WorkflowGuide key: `sales-opening-ar-list` (registered in WorkflowGuide.jsx)
 *   - Sidebar: `Sales → Opening AR Transactions` link gated on sub-permission
 *   - Period-lock and approval flow untouched — all action handlers delegate to
 *     the same controller paths SalesList uses, which already handle OPENING_AR
 *     identically to SALES_LINE for submit / reopen / delete / president-reverse.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Pagination from '../../components/common/Pagination';
import { useAuth } from '../../hooks/useAuth';
import { ROLES, ROLE_SETS } from '../../constants/roles';
import useSales from '../hooks/useSales';
import useEntities from '../hooks/useEntities';
import useErpSubAccess from '../hooks/useErpSubAccess';
import EntityBadge from '../components/EntityBadge';
import PresidentReverseModal from '../components/PresidentReverseModal';
import RejectionBanner from '../components/RejectionBanner';
import CsiPhoto, { csiPhotoStyles } from '../components/CsiPhoto';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess, showWarning } from '../utils/errorToast';

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

// Opening AR is always amber per CLAUDE-ERP convention (same chip as SalesList
// and CollectionSession). Kept local (not a lookup) because it's tied to the
// source-type visual language, not a configurable business rule.
const OPENING_AR_BADGE = { background: '#fef3c7', color: '#92400e' };

const pageStyles = `
  .oarlist-page { background: var(--erp-bg, #f4f7fb); }
  .oarlist-main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 24px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .oarlist-inner { max-width: 1200px; margin: 0 auto; }
  .oarlist-toolbar-card {
    background: var(--erp-panel, #fff);
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 14px;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
  }
  .oarlist-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .oarlist-header:last-child { margin-bottom: 0; }
  .oarlist-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .oarlist-subtitle {
    margin: 4px 0 0;
    color: var(--erp-muted, #5f7188);
    font-size: 13px;
    font-weight: 500;
  }
  .sales-nav-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 12px;
    padding: 6px;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 10px;
    background: var(--erp-panel, #fff);
  }
  .sales-nav-tabs::-webkit-scrollbar { height: 0; }
  .sales-nav-tab {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    color: var(--erp-text, #132238);
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sales-nav-tab.active { background: var(--erp-accent, #1e5eff); color: #fff; }
  .sales-nav-tab:hover { border-color: var(--erp-border, #dbe4f0); }

  .oarlist-banner { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 10px 14px; color: #78350f; font-size: 13px; margin-bottom: 12px; line-height: 1.5; }
  .oarlist-banner strong { color: #92400e; }

  .filter-bar {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 0;
    align-items: center;
  }
  .filter-bar input, .filter-bar select {
    padding: 8px 12px;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 8px;
    font-size: 13px;
    background: var(--erp-panel, #fff);
    color: var(--erp-text);
    height: 38px;
  }

  .oarlist-table-card {
    background: var(--erp-panel, #fff);
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 14px;
    padding: 12px;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
  }

  .oarlist-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 12px; overflow: hidden; }
  .oarlist-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 14px; text-align: left; font-weight: 600; color: var(--erp-text); white-space: nowrap; }
  .oarlist-table td { padding: 10px 14px; border-top: 1px solid var(--erp-border); vertical-align: middle; }
  .oarlist-table tr:hover { background: var(--erp-accent-soft); cursor: pointer; }

  .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-block; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 11px; }

  .oarlist-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .oarlist-actions .btn {
    min-width: 86px;
    min-height: 38px;
  }

  .detail-modal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .detail-panel { background: var(--erp-panel, #fff); border-radius: 16px; padding: 24px; max-width: 700px; width: 90%; max-height: 80vh; overflow-y: auto; }
  .detail-panel h2 { margin: 0 0 16px; font-size: 18px; }
  .detail-panel table { width: 100%; font-size: 13px; border-collapse: collapse; }
  .detail-panel table th { text-align: left; padding: 8px; background: var(--erp-bg); }
  .detail-panel table td { padding: 8px; border-top: 1px solid var(--erp-border); }

  @media (max-width: 768px) {
    .oarlist-main { padding: 16px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .oarlist-toolbar-card, .oarlist-table-card { padding: 12px; }
    .oarlist-table { font-size: 12px; }
    .filter-bar { grid-template-columns: 1fr; }
    .filter-bar input, .filter-bar select { width: 100%; }

    .oarlist-table { border: none; background: transparent; }
    .oarlist-table thead { display: none; }
    .oarlist-table tbody { display: block; }
    .oarlist-table tr {
      display: block;
      background: var(--erp-panel, #fff);
      border: 1px solid var(--erp-border);
      border-radius: 12px;
      margin-bottom: 12px;
      overflow: hidden;
    }
    .oarlist-table td {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-top: 1px solid var(--erp-border);
      white-space: normal;
    }
    .oarlist-table td:first-child { border-top: none; }
    .oarlist-table td::before {
      content: attr(data-label);
      font-weight: 600;
      color: var(--erp-muted, #6b7280);
      flex-shrink: 0;
    }
    .oarlist-table td[data-label="Actions"] {
      display: block;
    }
    .oarlist-table td[data-label="Actions"]::before {
      display: block;
      margin-bottom: 8px;
    }
    .oarlist-table td[data-label="Actions"] .oarlist-actions {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .oarlist-table td[data-label="Actions"] .oarlist-actions .btn {
      width: 100%;
      min-width: 0;
    }
  }
  @media (max-width: 375px) {
    .oarlist-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .btn { font-size: 12px; padding: 6px 10px; }
    .filter-bar input, .filter-bar select { font-size: 16px; }
    .oarlist-table td[data-label="Actions"] .oarlist-actions {
      grid-template-columns: 1fr;
    }
  }
`;

export default function OpeningArList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const sales = useSales();
  const { getEntityById } = useEntities();
  const { hasSubPermission } = useErpSubAccess();
  const isMultiEntity = [ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN].includes(user?.role);
  const canPresidentReverse = hasSubPermission('accounting', 'reverse_posted');
  const canApproveDeletion = hasSubPermission('accounting', 'approve_deletion');
  const canCreateSales = ROLE_SETS.BDM_ADMIN.includes(user?.role);

  // Nav-tab visibility — same lookup-driven sub-permission pattern as OpeningArEntry.
  // `opening_ar_list` is a new sub-perm; falls back to `opening_ar` while it's
  // still being seeded across entities (both link to the same backend route so
  // one lookup is enough to expose both).
  const canOpeningArEntry = hasSubPermission('sales', 'opening_ar');
  const canOpeningArList = hasSubPermission('sales', 'opening_ar_list') || canOpeningArEntry;
  const canCsiBooklets = hasSubPermission('inventory', 'csi_booklets');

  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  // Default status scope = POSTED + DELETION_REQUESTED (read-only history).
  // Draft/Valid/Error rows live on the Entry page; switching status filter to
  // one of those shows them here too for convenience (e.g., president needs a
  // single spot to see all opening-AR activity).
  const [filters, setFilters] = useState({ status: '', csi_date_from: '', csi_date_to: '' });
  const [selectedSale, setSelectedSale] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);

  const loadSales = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      // `source: 'OPENING_AR'` is always sent — this is the page's contract.
      // Backend salesController filters `SalesLine.find({ source, ... })`.
      const params = { page, limit: 20, source: 'OPENING_AR' };
      if (filters.status) params.status = filters.status;
      if (filters.csi_date_from) params.csi_date_from = filters.csi_date_from;
      if (filters.csi_date_to) params.csi_date_to = filters.csi_date_to;

      const res = await sales.getSales(params);
      if (res?.data) setData(res.data);
      if (res?.pagination) setPagination(res.pagination);
    } catch (err) {
      showError(err, 'Could not load Opening AR transactions');
    } finally {
      setLoading(false);
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (saleId) => {
    // Opening AR rows never deduct stock — message reflects that explicitly
    // so the president isn't confused by a generic "FIFO deduction" prompt.
    if (!window.confirm('Submit this Opening AR entry? AR journal will be created (no stock deduction).')) return;
    try {
      await sales.submitSales([saleId]);
      loadSales(pagination.page);
    } catch (err) {
      // Approval-gated posts raise 202 with approval_pending — delegate the
      // message surface to the shared error classifier (keeps the banner
      // consistent with SalesList).
      showError(err, 'Could not submit Opening AR');
    }
  };

  const handleReopen = async (id) => {
    // Reopen is safe for OPENING_AR (no InventoryLedger entries), but the
    // confirmation still mentions the general re-open semantics in case a
    // subscriber ever flips the source during edit.
    if (!window.confirm('Re-open this posted Opening AR entry? The AR journal will be reversed (SAP Storno).')) return;
    try {
      const res = await sales.reopenSales([id]);
      const failed = res?.failed || [];
      if (failed.length) {
        showWarning(failed.map(f => `${f.doc_ref || f._id}: ${f.error}`).join('\n'));
      } else {
        showSuccess(res?.message || 'Opening AR reopened');
      }
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not reopen Opening AR');
    }
  };

  const handleRequestDeletion = async (id) => {
    if (!window.confirm('Request deletion for this Opening AR entry?')) return;
    try {
      await sales.requestDeletion(id);
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not request deletion');
    }
  };

  const handleApproveDeletion = async (id) => {
    if (!window.confirm('Approve deletion? A reversal entry will be created (SAP Storno).')) return;
    try {
      await sales.approveDeletion(id, 'Approved by admin');
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not approve deletion');
    }
  };

  const handlePresidentReverse = async ({ reason, confirm }) => {
    if (!reverseTarget) return;
    try {
      await sales.presidentReverseSale(reverseTarget._id, { reason, confirm });
      setReverseTarget(null);
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not reverse Opening AR');
      throw err;
    }
  };

  const viewDetail = async (id) => {
    try {
      const res = await sales.getSaleById(id);
      if (res?.data) setSelectedSale(res.data);
    } catch (err) {
      showError(err, 'Could not load Opening AR details');
    }
  };

  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  return (
    <div className="admin-page erp-page oarlist-page">
      <style>{pageStyles}</style>
      <style>{csiPhotoStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="oarlist-main">
          <WorkflowGuide pageKey="sales-opening-ar-list" />
          <div className="oarlist-inner">
            <div className="oarlist-toolbar-card">
              <div className="sales-nav-tabs" role="tablist" aria-label="Sales navigation">
                {canCreateSales && <Link to="/erp/sales/entry" className="sales-nav-tab">Sales</Link>}
                <Link to="/erp/sales" className="sales-nav-tab">Sales Transactions</Link>
                {canOpeningArEntry && <Link to="/erp/sales/opening-ar" className="sales-nav-tab">Opening AR</Link>}
                {canOpeningArList && <Link to="/erp/sales/opening-ar/list" className="sales-nav-tab active" aria-current="page">Opening AR Transactions</Link>}
                <Link to="/erp/csi-booklets" className="sales-nav-tab">
                  {canCsiBooklets ? 'CSI Booklets' : 'My CSI'}
                </Link>
              </div>

              <div className="oarlist-banner">
                <strong>Opening AR Transactions — historical CSIs, read-only audit trail.</strong>
                <div style={{ marginTop: 4 }}>
                  Entries dated before your ERP go-live date. Posted rows hit AR + Sales Revenue
                  only — no inventory deduction, no COGS. Use <Link to="/erp/sales/opening-ar" style={{ color: '#1e40af', fontWeight: 600 }}>Opening AR Entry</Link> to
                  add new drafts; use this page to review, fix-and-resubmit rejected rows, re-open, or request deletion.
                </div>
              </div>

              <div className="oarlist-header">
                <div>
                  <h1>Opening AR Transactions</h1>
                  <p className="oarlist-subtitle">All CSIs with source = OPENING_AR, filtered by status and date.</p>
                </div>
                {canOpeningArEntry && <Link to="/erp/sales/opening-ar" className="btn btn-primary">+ New Opening AR</Link>}
              </div>

              <div className="filter-bar">
                <SelectField value={filters.status} onChange={e => handleFilterChange('status', e.target.value)}>
                  <option value="">All Status</option>
                  <option value="DRAFT">Draft</option>
                  <option value="VALID">Valid</option>
                  <option value="ERROR">Error</option>
                  <option value="POSTED">Posted</option>
                  <option value="DELETION_REQUESTED">Deletion Requested</option>
                </SelectField>
                <input type="date" value={filters.csi_date_from} onChange={e => handleFilterChange('csi_date_from', e.target.value)} placeholder="From" />
                <input type="date" value={filters.csi_date_to} onChange={e => handleFilterChange('csi_date_to', e.target.value)} placeholder="To" />
              </div>
            </div>

            <div className="oarlist-table-card">
              <table className="oarlist-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>CSI #</th>
                    <th>Hospital / Customer</th>
                    <th>Total</th>
                    <th>Status</th>
                    {isMultiEntity && <th>Entity</th>}
                    <th>Photo</th>
                    <th>Products</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(sale => (
                    <tr key={sale._id} onClick={() => viewDetail(sale._id)}>
                      <td data-label="Date">{new Date(sale.csi_date).toLocaleDateString('en-PH')}</td>
                      <td data-label="CSI #"><strong>{sale.doc_ref}</strong></td>
                      <td data-label="Hospital">
                        {toTitleCase(sale.hospital_id?.hospital_name) || sale.customer_id?.customer_name || '-'}
                        <span className="badge" style={{ ...OPENING_AR_BADGE, marginLeft: 6, fontSize: 10 }}>Opening AR</span>
                      </td>
                      <td data-label="Total">P{(sale.invoice_total || 0).toLocaleString()}</td>
                      <td data-label="Status">
                        <span className="badge" style={STATUS_COLORS[sale.status] || {}}>{sale.status}</span>
                      </td>
                      {isMultiEntity && (
                        <td data-label="Entity"><EntityBadge entity={getEntityById(sale.entity_id)} size="sm" /></td>
                      )}
                      <td data-label="Photo" onClick={e => e.stopPropagation()}>
                        <CsiPhoto url={sale.csi_photo_url} attachmentId={sale.csi_attachment_id} size={44} />
                      </td>
                      <td data-label="Products" style={{ fontSize: 11, maxWidth: 220, whiteSpace: 'pre-line' }}>
                        {sale.line_items?.map((li, i) => (
                          <div key={i}>{li.item_key || '—'} × {li.qty}</div>
                        ))}
                      </td>
                      <td data-label="Actions" onClick={e => e.stopPropagation()}>
                        <div className="oarlist-actions">
                          {sale.status === 'VALID' && (
                            <button className="btn btn-sm" style={{ background: '#16a34a', color: '#fff' }} onClick={() => handleSubmit(sale._id)}>
                              Submit
                            </button>
                          )}
                          {sale.status === 'POSTED' && isAdmin && (
                            <button className="btn btn-warning btn-sm" onClick={() => handleReopen(sale._id)}>
                              Re-open
                            </button>
                          )}
                          {sale.status === 'POSTED' && !isAdmin && (
                            <button className="btn btn-sm" style={{ background: '#991b1b', color: '#fff' }} onClick={() => handleRequestDeletion(sale._id)}>
                              Req. Delete
                            </button>
                          )}
                          {sale.status === 'DELETION_REQUESTED' && canApproveDeletion && (
                            <button className="btn btn-danger btn-sm" onClick={() => handleApproveDeletion(sale._id)}>
                              Approve Delete
                            </button>
                          )}
                          {canPresidentReverse && !sale.deletion_event_id && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#7f1d1d', color: '#fff' }}
                              title="President: delete & reverse this transaction (SAP Storno for POSTED, hard-delete for DRAFT/ERROR)"
                              onClick={() => setReverseTarget(sale)}
                            >
                              President Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!data.length && (
                    <tr><td colSpan={isMultiEntity ? 9 : 8} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>
                      {loading ? 'Loading...' : 'No Opening AR transactions found'}
                    </td></tr>
                  )}
                </tbody>
              </table>

              {pagination.pages > 1 && (
                <div style={{ marginTop: 16 }}>
                  <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadSales} />
                </div>
              )}
            </div>

            {reverseTarget && (
              <PresidentReverseModal
                docLabel={`CSI #${reverseTarget.doc_ref || '—'} · ₱${(reverseTarget.invoice_total || 0).toLocaleString()} · ${reverseTarget.status} (Opening AR)`}
                docStatus={reverseTarget.status}
                onConfirm={handlePresidentReverse}
                onClose={() => setReverseTarget(null)}
              />
            )}

            {selectedSale && (
              <div className="detail-modal" onClick={() => setSelectedSale(null)}>
                <div className="detail-panel" onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>CSI# {selectedSale.doc_ref}</h2>
                    <button className="btn" onClick={() => setSelectedSale(null)} style={{ background: 'none', fontSize: 20, padding: 4 }}>&times;</button>
                  </div>
                  <p><strong>Hospital/Customer:</strong> {toTitleCase(selectedSale.hospital_id?.hospital_name) || selectedSale.customer_id?.customer_name || '-'}</p>
                  <p><strong>CSI Date:</strong> {new Date(selectedSale.csi_date).toLocaleDateString('en-PH')}</p>
                  <p><strong>Status:</strong> <span className="badge" style={STATUS_COLORS[selectedSale.status] || {}}>{selectedSale.status}</span></p>
                  <p><strong>Source:</strong> <span className="badge" style={OPENING_AR_BADGE}>Opening AR</span></p>
                  <p style={{ fontSize: 12, color: '#92400e' }}>Pre-go-live entry — no inventory deduction on post</p>
                  {selectedSale.reopen_count > 0 && <p><strong>Reopened:</strong> {selectedSale.reopen_count} time(s)</p>}

                  {selectedSale.csi_photo_url && (
                    <div style={{ margin: '12px 0' }}>
                      <CsiPhoto url={selectedSale.csi_photo_url} attachmentId={selectedSale.csi_attachment_id} size={120} />
                    </div>
                  )}

                  <h3 style={{ marginTop: 16, fontSize: 14 }}>Line Items</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
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

                  <div style={{ marginTop: 12 }}>
                    <RejectionBanner
                      row={selectedSale}
                      moduleKey="SALES"
                      variant="page"
                      docLabel={selectedSale.doc_ref}
                      onResubmit={(row) => {
                        // Opening AR re-edits go back to the entry page — same
                        // pattern SalesList uses for SALES_LINE rejections.
                        setSelectedSale(null);
                        navigate(`/erp/sales/opening-ar?edit=${row._id}`);
                      }}
                    />
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
