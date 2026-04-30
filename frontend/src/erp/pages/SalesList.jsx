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
import ScanCSIModal from '../components/ScanCSIModal';
import ConfirmModal from '../components/ConfirmModal';

import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess, showWarning, showApprovalPending } from '../utils/errorToast';
import { useLookupOptions } from '../hooks/useLookups';

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
    padding: 24px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  }
  .saleslist-inner { max-width: 1200px; margin: 0 auto; }
  .saleslist-toolbar-card {
    background: var(--erp-panel, #fff);
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 14px;
    padding: 14px;
    margin-bottom: 14px;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
  }
  .saleslist-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  .saleslist-header:last-child { margin-bottom: 0; }
  .saleslist-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .saleslist-subtitle {
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
  .sales-nav-tab.active {
    background: var(--erp-accent, #1e5eff);
    color: #fff;
  }
  .sales-nav-tab:hover {
    border-color: var(--erp-border, #dbe4f0);
  }

  .filter-bar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
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

  .filter-bar select {
    min-width: 0;
  }

  .saleslist-table-card {
    background: var(--erp-panel, #fff);
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 14px;
    padding: 12px;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
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
    min-height: 38px;
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
    .saleslist-toolbar-card,
    .saleslist-table-card { padding: 12px; }
    .sales-list-table { font-size: 12px; }
    .filter-bar { grid-template-columns: 1fr; }
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
    .sales-list-table td[data-label="Actions"] {
      display: block;
    }
    .sales-list-table td[data-label="Actions"]::before {
      display: block;
      margin-bottom: 8px;
    }
    .sales-list-table td[data-label="Actions"] .sales-actions {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .sales-list-table td[data-label="Actions"] .sales-actions .btn {
      width: 100%;
      min-width: 0;
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
    .sales-list-table td[data-label="Actions"] .sales-actions {
      grid-template-columns: 1fr;
    }
  }
`;

export default function SalesList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const sales = useSales();
  const { getEntityById } = useEntities();
  const { hasSubPermission } = useErpSubAccess();
  const isMultiEntity = [ROLES.PRESIDENT, ROLES.CEO, ROLES.ADMIN].includes(user?.role);
  const canPresidentReverse = hasSubPermission('accounting', 'reverse_posted');
  const { options: sourceOptions } = useLookupOptions('SALE_SOURCE');

  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: '', csi_date_from: '', csi_date_to: '', source: '' });
  const [selectedSale, setSelectedSale] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);
  // Row id of the sale currently targeted by the Attach Received CSI modal.
  // Null = modal closed. The modal is ScanCSIModal in photoOnly mode — no
  // OCR, just upload → returns { csi_photo_url, csi_attachment_id } which we
  // route into PUT /sales/:id/received-csi as the received-CSI proof.
  const [attachReceivedTarget, setAttachReceivedTarget] = useState(null);
  // Lifecycle confirm state (Submit/Validate/Reopen/Request-Delete/Approve-Delete).
  // Replaces window.confirm() with the styled ERP ConfirmModal. See ConfirmModal.jsx.
  const [confirm, setConfirm] = useState(null);

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
    } catch (err) { showError(err, 'Could not load sales'); } finally { setLoading(false); }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSales(); }, [loadSales]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (saleId) => {
    const target = saleId ? data.find(s => s._id === saleId) : null;
    const isOpeningAr = target?.source === 'OPENING_AR';
    const msg = saleId
      ? isOpeningAr
        ? 'Submit this Opening AR entry? AR journal will be created (no stock deduction).'
        : 'Submit this sale? Stock will be deducted via FIFO.'
      : 'Submit all validated sales? Stock will be deducted via FIFO (Opening AR entries skip stock).';
    setConfirm({
      title: saleId ? 'Submit sale' : 'Submit all validated',
      message: msg,
      confirmText: 'Submit',
      variant: 'primary',
      onConfirm: async () => {
        setConfirm(null);
        try {
          // Submit returns 202 with { approval_pending: true, message } when the
          // caller's role is not in MODULE_DEFAULT_ROLES.SALES (lookup-driven, per
          // CLAUDE-ERP Phase G4). axios resolves 2xx, so the pending case lands in
          // the success branch. Mirror SalesEntry/OpeningArEntry belt-and-braces
          // handling — some backends still throw on 202 (legacy interceptors).
          const res = await sales.submitSales(saleId ? [saleId] : undefined);
          if (res?.approval_pending) {
            showApprovalPending(res.message);
          }
          loadSales(pagination.page);
        } catch (err) {
          if (err?.response?.data?.approval_pending) {
            showApprovalPending(err.response.data.message);
            loadSales(pagination.page);
          } else {
            showError(err, 'Could not submit sales');
          }
        }
      },
    });
  };

  const handleAttachReceivedCsi = async (scannedData) => {
    if (!attachReceivedTarget) return;
    const saleId = attachReceivedTarget;
    setAttachReceivedTarget(null);
    try {
      await sales.attachReceivedCsi(saleId, {
        // ScanCSIModal in photoOnly mode returns the upload in the csi_photo_url
        // / csi_attachment_id slots. Re-label them to the received-CSI fields
        // that the backend expects.
        csi_received_photo_url: scannedData.csi_photo_url || '',
        csi_received_attachment_id: scannedData.csi_attachment_id || null,
      });
      showSuccess('Signed CSI attached — dunning-ready.');
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not attach received CSI photo');
    }
  };

  const handleValidate = (saleId) => {
    setConfirm({
      title: 'Validate sale',
      message: 'Validate this sale? Stock, VAT, and required fields will be checked.',
      confirmText: 'Validate',
      variant: 'primary',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const res = await sales.validateSales([saleId]);
          const rowResult = res?.errors?.find(e => String(e.sale_id) === String(saleId));
          if (rowResult?.messages?.length) {
            showError(null, `Validation failed:\n${rowResult.messages.join('\n')}`);
          } else if (rowResult?.warnings?.length) {
            showWarning(rowResult.warnings.join('\n'));
          } else {
            showSuccess('Sale validated — Submit button is now available.');
          }
          loadSales(pagination.page);
        } catch (err) {
          showError(err, 'Could not validate sale');
        }
      },
    });
  };

  const handleReopen = (id) => {
    setConfirm({
      title: 'Re-open sale',
      message: 'Re-open this posted sale? Stock will be reversed.',
      confirmText: 'Re-open',
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        try {
          const res = await sales.reopenSales([id]);
          const failed = res?.failed || [];
          if (failed.length) {
            showWarning(failed.map(f => `${f.doc_ref || f._id}: ${f.error}`).join('\n'));
          } else {
            showSuccess(res?.message || 'Sale reopened');
          }
          loadSales(pagination.page);
        } catch (err) {
          showError(err, 'Could not reopen sale');
        }
      },
    });
  };

  const handleRequestDeletion = (id) => {
    setConfirm({
      title: 'Request deletion',
      message: 'Request deletion for this sale?',
      confirmText: 'Request deletion',
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await sales.requestDeletion(id);
          loadSales(pagination.page);
        } catch (err) { showError(err, 'Could not request deletion'); }
      },
    });
  };

  const handleApproveDeletion = (id) => {
    setConfirm({
      title: 'Approve deletion',
      message: 'Approve deletion? A reversal entry will be created (SAP Storno).',
      confirmText: 'Approve deletion',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await sales.approveDeletion(id, 'Approved by admin');
          loadSales(pagination.page);
        } catch (err) { showError(err, 'Could not approve deletion'); }
      },
    });
  };

  const handlePresidentReverse = async ({ reason, confirm }) => {
    if (!reverseTarget) return;
    try {
      await sales.presidentReverseSale(reverseTarget._id, { reason, confirm });
      setReverseTarget(null);
      loadSales(pagination.page);
    } catch (err) {
      showError(err, 'Could not reverse sale');
      throw err;
    }
  };

  const viewDetail = async (id) => {
    try {
      const res = await sales.getSaleById(id);
      if (res?.data) setSelectedSale(res.data);
    } catch (err) { showError(err, 'Could not load sale details'); }
  };

  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);
  const canCreateSales = ROLE_SETS.BDM_ADMIN.includes(user?.role);
  // Phase 3c — approve-deletion gated by Tier 2 lookup-only accounting.approve_deletion
  // (legacy path; President Reverse is preferred for full cleanup). Mirrors backend salesRoutes /:id/approve-deletion.
  const canApproveDeletion = hasSubPermission('accounting', 'approve_deletion');
  // Option B (Apr 2026) — Opening AR is now a sibling page pair (Entry + List),
  // reachable from every sales-family nav. Both gates are lookup-driven; list
  // falls back to entry's sub-perm while the new `opening_ar_list` seed rolls
  // out across entities.
  const canOpeningArEntry = hasSubPermission('sales', 'opening_ar');
  const canOpeningArList = hasSubPermission('sales', 'opening_ar_list') || canOpeningArEntry;

  return (
    <div className="admin-page erp-page saleslist-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="saleslist-main">
          <WorkflowGuide pageKey="sales-list" />
          <div className="saleslist-inner">
            <div className="saleslist-toolbar-card">
              <div className="sales-nav-tabs" role="tablist" aria-label="Sales navigation">
                {canCreateSales && <Link to="/erp/sales/entry" className="sales-nav-tab">Sales</Link>}
                <Link to="/erp/sales" className="sales-nav-tab active" aria-current="page">Sales Transactions</Link>
                {canOpeningArEntry && <Link to="/erp/sales/opening-ar" className="sales-nav-tab">Opening AR</Link>}
                {canOpeningArList && <Link to="/erp/sales/opening-ar/list" className="sales-nav-tab">Opening AR Transactions</Link>}
                <Link to="/erp/csi-booklets" className="sales-nav-tab">
                  {hasSubPermission('inventory', 'csi_booklets') ? 'CSI Booklets' : 'My CSI'}
                </Link>
              </div>
              <div className="saleslist-header">
                <div>
                  <h1>Sales Transactions</h1>
                  <p className="saleslist-subtitle">Track draft, validated, posted, and deletion-requested sales in one place.</p>
                </div>
                {canCreateSales && <Link to="/erp/sales/entry" className="btn btn-primary">+ New Sales Entry</Link>}
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
                  {sourceOptions.map(o => (
                    <option key={o.code} value={o.code}>{o.label}</option>
                  ))}
                </SelectField>
                <input type="date" value={filters.csi_date_from} onChange={e => handleFilterChange('csi_date_from', e.target.value)} placeholder="From" />
                <input type="date" value={filters.csi_date_to} onChange={e => handleFilterChange('csi_date_to', e.target.value)} placeholder="To" />
              </div>
            </div>

            <div className="saleslist-table-card">
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
                <th title="Signed received-CSI attached = dunning-ready">📷</th>
                {isMultiEntity && <th>Entity</th>}
                <th>Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(sale => (
                <tr key={sale._id} onClick={() => viewDetail(sale._id)}>
                  <td data-label="Date">{new Date(sale.csi_date).toLocaleDateString('en-PH')}</td>
                  <td data-label="CSI #">
                    <strong>{sale.doc_ref}</strong>
                    {sale.recorded_on_behalf_of && (
                      <span
                        className="badge"
                        style={{ marginLeft: 6, background: '#ede9fe', color: '#6d28d9', fontSize: 10, padding: '1px 6px', borderRadius: 8 }}
                        title={`Keyed by ${sale.recorded_on_behalf_of?.name || sale.created_by?.name || 'proxy user'} on behalf of ${sale.bdm_id?.name || 'BDM'}`}
                      >
                        Proxied
                      </span>
                    )}
                  </td>
                  <td data-label="Hospital">{toTitleCase(sale.hospital_id?.hospital_name) || sale.customer_id?.customer_name || '-'}</td>
                  <td data-label="Total">P{(sale.invoice_total || 0).toLocaleString()}</td>
                  <td data-label="Source" style={{ fontSize: 11 }}>
                    <span className="badge" style={sale.source === 'OPENING_AR' ? { background: '#fef3c7', color: '#92400e' } : { background: '#e0f2fe', color: '#0369a1' }}>
                      {sourceOptions.find(o => o.code === sale.source)?.label || sale.source}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className="badge" style={STATUS_COLORS[sale.status] || {}}>
                      {sale.status}
                    </span>
                  </td>
                  <td data-label="Dunning" style={{ textAlign: 'center', fontSize: 14 }} title={(() => {
                    // OPENING_AR: either csi_photo_url (entry scan) OR the
                    // received field satisfies "any proof OK" — matches the
                    // arEngine.getArAging dunning_ready rule so this list
                    // view and the AR aging report never disagree on the
                    // same row.
                    if (sale.source === 'OPENING_AR') {
                      return (sale.csi_received_photo_url || sale.csi_photo_url)
                        ? 'Historical signed CSI on file — dunning-ready'
                        : 'No signed CSI on file';
                    }
                    return sale.csi_received_photo_url
                      ? 'Signed CSI attached — dunning-ready'
                      : (sale.status === 'POSTED' ? 'POSTED — signed CSI not yet attached' : 'No signed CSI yet');
                  })()}>
                    {(() => {
                      const hasProof = sale.source === 'OPENING_AR'
                        ? !!(sale.csi_received_photo_url || sale.csi_photo_url)
                        : !!sale.csi_received_photo_url;
                      if (hasProof) return '✓';
                      return sale.status === 'POSTED' ? '⚠️' : '—';
                    })()}
                  </td>
                  {isMultiEntity && (
                    <td data-label="Entity"><EntityBadge entity={getEntityById(sale.entity_id)} size="sm" /></td>
                  )}
                  <td data-label="Products" style={{ fontSize: 11, maxWidth: 220, whiteSpace: 'pre-line' }}>
                    {sale.line_items?.map((li, i) => {
                      // Rule #4 — show brand_name + dosage_strength alongside
                      // the SKU. Backend enriches line_items via
                      // enrichLineItemsWithProductDisplay (salesController).
                      const display = [li.product_name, li.dosage].filter(Boolean).join(' ');
                      return (
                        <div key={i}>
                          {li.item_key || '—'}
                          {display && <> — {display}</>}
                          {' '}× {li.qty}
                        </div>
                      );
                    })}
                  </td>
                  <td data-label="Actions" onClick={e => e.stopPropagation()}>
                    <div className="sales-actions">
                    {(sale.status === 'DRAFT' || sale.status === 'ERROR') && (
                      <button className="btn btn-warning btn-sm" onClick={() => handleValidate(sale._id)}>
                        Validate
                      </button>
                    )}
                    {/* Attach Received CSI — t=4 dunning proof. Available on
                        DRAFT / VALID / ERROR / POSTED (not reversed, not
                        DELETION_REQUESTED). ERROR included so BDMs can
                        pre-stage the signed photo while fixing unrelated
                        validation issues. Skipped for OPENING_AR: historical
                        entries carry their signed CSI on csi_photo_url at
                        entry time. */}
                    {sale.source !== 'OPENING_AR'
                      && !sale.deletion_event_id
                      && ['DRAFT', 'VALID', 'ERROR', 'POSTED'].includes(sale.status) && (
                      <button
                        className="btn btn-sm"
                        style={{ background: sale.csi_received_photo_url ? '#64748b' : '#2563eb', color: '#fff' }}
                        title={sale.csi_received_photo_url ? 'Replace the signed CSI photo' : 'Attach the signed CSI photo (dunning proof)'}
                        onClick={() => setAttachReceivedTarget(sale._id)}
                      >
                        📷 {sale.csi_received_photo_url ? 'Replace CSI' : 'Attach CSI'}
                      </button>
                    )}
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
                <tr><td colSpan={isMultiEntity ? 10 : 9} style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>
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
            </div>

          {/* Attach Received CSI Modal — photo-only (no OCR). */}
          <ScanCSIModal
            open={!!attachReceivedTarget}
            onClose={() => setAttachReceivedTarget(null)}
            onApply={handleAttachReceivedCsi}
            photoOnly={true}
            docType="CSI"
          />

          {/* President Reverse Modal */}
          {reverseTarget && (
            <PresidentReverseModal
              docLabel={`CSI #${reverseTarget.doc_ref || reverseTarget.invoice_number || '—'} · ₱${(reverseTarget.invoice_total || 0).toLocaleString()} · ${reverseTarget.status}`}
              docStatus={reverseTarget.status}
              onConfirm={handlePresidentReverse}
              onClose={() => setReverseTarget(null)}
            />
          )}

          {/* Lifecycle Confirm Modal — Submit / Validate / Reopen / Request-Delete / Approve-Delete */}
          <ConfirmModal
            isOpen={!!confirm}
            title={confirm?.title}
            message={confirm?.message}
            confirmText={confirm?.confirmText}
            variant={confirm?.variant}
            onConfirm={confirm?.onConfirm}
            onCancel={() => setConfirm(null)}
          />

          {/* Detail Modal */}
          {selectedSale && (
            <div className="detail-modal" onClick={() => setSelectedSale(null)}>
              <div className="detail-panel" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2>CSI# {selectedSale.doc_ref}</h2>
                  <button className="btn" onClick={() => setSelectedSale(null)} style={{ background: 'none', fontSize: 20, padding: 4 }}>&times;</button>
                </div>
                <p><strong>Hospital/Customer:</strong> {toTitleCase(selectedSale.hospital_id?.hospital_name) || selectedSale.customer_id?.customer_name || '-'}</p>
                <p><strong>Date:</strong> {new Date(selectedSale.csi_date).toLocaleDateString('en-PH')}</p>
                <p><strong>Status:</strong> <span className="badge" style={STATUS_COLORS[selectedSale.status] || {}}>{selectedSale.status}</span></p>
                <p><strong>Source:</strong> <span className="badge" style={selectedSale.source === 'OPENING_AR' ? { background: '#fef3c7', color: '#92400e' } : { background: '#e0f2fe', color: '#0369a1' }}>{sourceOptions.find(o => o.code === selectedSale.source)?.label || selectedSale.source}</span></p>
                {selectedSale.source === 'OPENING_AR' && <p style={{ fontSize: 12, color: '#92400e' }}>Pre-live-date entry — no inventory deduction on post</p>}
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

                {/* Received CSI (dunning proof) — shown when attached. Detail
                    modal's selectedSale comes from the list response, which is
                    a lean-select; the received fields are added to the list
                    projection below. Raw S3 URLs render inline; signed URLs
                    come back through the document detail hydrator when
                    accessed via Approval Hub / Reversal Console.*/}
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: 13 }}>Received CSI (signed):</strong>{' '}
                  {selectedSale.csi_received_photo_url ? (
                    <>
                      <a href={selectedSale.csi_received_photo_url} target="_blank" rel="noopener noreferrer">📷 View</a>
                      {selectedSale.csi_received_at && (
                        <span style={{ fontSize: 11, color: 'var(--erp-muted)', marginLeft: 8 }}>
                          attached {new Date(selectedSale.csi_received_at).toLocaleDateString('en-PH')}
                        </span>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--erp-muted)' }}>not yet attached — use 📷 Attach CSI to upload</span>
                  )}
                </div>

                <div style={{ marginTop: 12 }}>
                  <RejectionBanner
                    row={selectedSale}
                    moduleKey="SALES"
                    variant="page"
                    docLabel={selectedSale.invoice_number || selectedSale.csi_no}
                    onResubmit={(row) => {
                      setSelectedSale(null);
                      navigate(`/erp/sales/entry?edit=${row._id}`);
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
