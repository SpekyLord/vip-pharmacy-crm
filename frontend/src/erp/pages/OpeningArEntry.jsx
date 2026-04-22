/**
 * Opening AR Entry — historical (pre-go-live) CSI entry surface.
 *
 * Why this page exists:
 *   The live SalesEntry product dropdown is sourced from inventory.getMyStock(),
 *   which only returns products with current stock > 0 in a warehouse. For opening
 *   AR (e.g., a CSI dated 2025-10-10 entered when the system goes live in 2026),
 *   the historical product may have zero current stock or be discontinued — so it
 *   never appears in the dropdown and the contractor cannot enter the row.
 *
 * What this page does differently:
 *   - Product dropdown sourced from ProductMaster directly (entity-scoped, is_active=true)
 *   - csi_date is constrained to BEFORE user.live_date (the go-live date set by admin)
 *   - No warehouse picker, no FIFO override controls (no inventory impact at post)
 *   - Backend auto-routes source='OPENING_AR' when csi_date < user.live_date,
 *     skipping inventory deduction + COGS journal (existing behavior).
 *   - Period lock is bypassed for OPENING_AR rows (utils/periodLock.js).
 *   - AR aging + Collections include OPENING_AR rows automatically (no source filter
 *     downstream — verified in arEngine.js + collectionController.js).
 *
 * Rejection fallback:
 *   When a posted row is rejected by an approver, rejection_reason is set and the
 *   row reverts to DRAFT/ERROR. The UI surfaces a "Re-upload CSI Photo" button so
 *   the contractor can attach a clearer photo + resubmit without re-keying line
 *   items — same pattern as Expenses / SMER.
 */
import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useSales from '../hooks/useSales';
import useHospitals from '../hooks/useHospitals';
import useCustomers from '../hooks/useCustomers';
import useErpApi from '../hooks/useErpApi';
import useErpSubAccess from '../hooks/useErpSubAccess';
import SelectField from '../../components/common/Select';
import WorkflowGuide from '../components/WorkflowGuide';
import ScanCSIModal from '../components/ScanCSIModal';
import CsiPhoto, { csiPhotoStyles } from '../components/CsiPhoto';
import OwnerPicker from '../components/OwnerPicker';
import { useRejectionConfig } from '../hooks/useRejectionConfig';
import { showError, showApprovalPending, showSuccess } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569', label: 'Draft' },
  VALID: { bg: '#dcfce7', text: '#166534', label: 'Valid' },
  ERROR: { bg: '#fef2f2', text: '#991b1b', label: 'Error' },
  POSTED: { bg: '#dbeafe', text: '#1e40af', label: 'Posted' },
  DELETION_REQUESTED: { bg: '#fef3c7', text: '#92400e', label: 'Del. Req.' }
};

const toDateInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return '';
  return date.toISOString().split('T')[0];
};

const oneDayBefore = (d) => {
  const date = new Date(d);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
};

function buildEmptyRow(defaultDate) {
  return {
    _tempId: Date.now() + Math.random(),
    hospital_id: '',
    customer_id: '',
    csi_date: defaultDate,
    doc_ref: '',
    csi_photo_url: '',
    csi_attachment_id: null,
    line_items: [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }],
    status: 'DRAFT',
    validation_errors: [],
    rejection_reason: '',
    _isNew: true
  };
}

const pageStyles = `
  .oar-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .oar-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .oar-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 14px; padding: 16px; margin-bottom: 14px; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04); }
  .oar-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .oar-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .oar-subtitle { margin: 4px 0 0; color: var(--erp-muted, #5f7188); font-size: 13px; font-weight: 500; }
  .oar-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .oar-banner { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 10px; padding: 10px 14px; color: #78350f; font-size: 13px; margin-bottom: 12px; line-height: 1.5; }
  .oar-banner strong { color: #92400e; }
  .oar-error-banner { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; font-size: 13px; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; min-height: 42px; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; min-height: 32px; }
  .oar-grid { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; overflow-x: auto; }
  .oar-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .oar-table th { background: var(--erp-accent-soft, #e8efff); color: var(--erp-text); padding: 10px 8px; text-align: left; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
  .oar-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border, #dbe4f0); vertical-align: top; }
  .oar-table input, .oar-table select { width: 100%; padding: 8px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 6px; font-size: 14px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .oar-row-status { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .oar-rejection-banner { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-top: 4px; max-width: 220px; }
  /* Line items live in a dedicated sub-row spanning the full table width,
     so the product dropdown gets the room it needs without squeezing the
     CSI #, Hospital, and Date inputs in the main row. */
  .oar-line-item { display: grid; grid-template-columns: minmax(280px, 3fr) 90px 100px 130px 32px; gap: 8px; align-items: center; margin-bottom: 6px; }
  .oar-line-item > * { min-width: 0; }
  .oar-table { table-layout: auto; min-width: 980px; }
  .oar-row-main td { border-top: 1px solid var(--erp-border, #dbe4f0); padding-bottom: 4px; }
  .oar-row-items td { border-top: none; background: var(--erp-bg, #f4f7fb); }
  .oar-li-section-label { font-size: 10px; color: var(--erp-muted, #5f7188); text-transform: uppercase; font-weight: 700; letter-spacing: 0.4px; margin: 4px 0 6px; }
  .oar-li-add { background: transparent; border: 1px dashed var(--erp-border); color: var(--erp-muted); padding: 4px 8px; font-size: 11px; border-radius: 6px; cursor: pointer; }
  .oar-li-add:hover { background: var(--erp-bg); }
  .oar-li-remove { background: transparent; border: none; color: #dc2626; cursor: pointer; font-size: 14px; }
  /* Shared top nav tabs — mirrors SalesEntry/SalesList so the five sales-family
     pages (Sales, Sales Transactions, Opening AR, Opening AR Transactions,
     CSI Booklets) share one visual navigation widget. Class names match
     SalesEntry/SalesList so theming stays in sync. */
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
  .oar-cards { display: none; }
  @media (max-width: 768px) {
    .oar-grid { display: none; }
    .oar-cards { display: flex; flex-direction: column; gap: 10px; }
    .oar-card { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border); border-radius: 10px; padding: 12px; }
    .oar-card-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .oar-card label { font-size: 11px; color: var(--erp-muted); text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 2px; }
    .oar-line-item { grid-template-columns: 1fr; }
  }
`;

export default function OpeningArEntry() {
  const { user } = useAuth();
  const sales = useSales();
  const { hospitals } = useHospitals();
  const customers = useCustomers();
  const erpApi = useErpApi();
  const { hasSubPermission } = useErpSubAccess();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const liveDate = user?.live_date ? toDateInput(user.live_date) : '';
  const defaultBackdate = liveDate ? oneDayBefore(liveDate) : '';

  // Nav-tab visibility — lookup-driven sub-permissions so subscribers control
  // which sales-family surfaces BDMs see. Entry + List gates are separate so
  // subscribers can revoke "opening_ar" post-cutover while keeping "opening_ar_list"
  // available for read-only historical audit. `opening_ar_list` lazy-falls-back
  // to `opening_ar` while the new sub-perm is still being seeded across entities.
  const canCreateSales = ROLE_SETS.BDM_ADMIN.includes(user?.role);
  const canOpeningArEntry = hasSubPermission('sales', 'opening_ar');
  const canOpeningArList = hasSubPermission('sales', 'opening_ar_list') || canOpeningArEntry;
  const canCsiBooklets = hasSubPermission('inventory', 'csi_booklets');

  const [productMaster, setProductMaster] = useState([]);
  const [customerList, setCustomerList] = useState([]);
  const [rows, setRows] = useState(() => [buildEmptyRow(defaultBackdate)]);
  // Phase G4.5a — proxy entry for Opening AR (uses sales.opening_ar_proxy sub-perm).
  const [assignedTo, setAssignedTo] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  // null = full OCR scan (create new row from extracted data);
  // number = re-upload photo to that existing row (rejection fallback);
  // 'NEW' = proof-only upload: create a fresh row with just the photo, no OCR.
  const [photoOnlyRowIdx, setPhotoOnlyRowIdx] = useState(null);
  const [productLoading, setProductLoading] = useState(false);

  // Lookup-driven rejection config (MODULE_REJECTION_CONFIG → SALES; Opening AR reuses
  // the same rejection flow since source-doc is SalesLine with source='OPENING_AR').
  // Drives which statuses accept validate / re-upload. Fallback preserves prior
  // hardcoded behavior if the lookup is not yet seeded for the current entity.
  const { config: rejectionConfig } = useRejectionConfig('SALES');
  const editableStatuses = rejectionConfig?.editable_statuses || ['DRAFT', 'ERROR'];

  // ── Fetch ProductMaster (entity-scoped, active only — no inventory filter) ──
  // `catalog=true` is REQUIRED: the /erp/products endpoint silently narrows the
  // list to "products stocked in this BDM's warehouse" for CONTRACTOR role
  // unless catalog mode is set. Opening AR must show the full ProductMaster
  // because historical CSIs may reference discontinued / out-of-stock SKUs.
  useEffect(() => {
    let cancelled = false;
    setProductLoading(true);
    erpApi.get('/products', { params: { is_active: 'true', limit: 0, catalog: 'true' } })
      .then(res => {
        if (cancelled) return;
        setProductMaster(res?.data || []);
      })
      .catch(err => {
        if (!cancelled) console.error('[OpeningArEntry] product load:', err.message);
      })
      .finally(() => { if (!cancelled) setProductLoading(false); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch active customers (for non-hospital opening AR) ──
  useEffect(() => {
    let cancelled = false;
    customers.getAll({ limit: 0, status: 'ACTIVE' })
      .then(res => { if (!cancelled && res?.data) setCustomerList(res.data); })
      .catch(err => { if (!cancelled) console.error('[OpeningArEntry] customer load:', err.message); });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Single-row edit mode (arrived via `?edit=<id>` from Opening AR Transactions) ──
  // Entry page no longer auto-loads the full backlog of DRAFT/VALID/ERROR rows — those
  // live on /erp/sales/opening-ar/list (the Transactions surface). Rationale: mirror the
  // SalesEntry/SalesList split so the Entry surface stays a clean slate for new CSIs and
  // the List surface owns the backlog. Subscription-model note: the sub-permissions
  // `sales.opening_ar` (Entry) and `sales.opening_ar_list` (Transactions) are already
  // independently gated in lookupGenericController.js — no new lookup is introduced by
  // this behavior change, so multi-tenant rollout is a zero-config cut-over.
  //
  // When a reviewer taps "Re-upload" / "Edit" on the List, we deep-link here with the
  // row id and hydrate just that one row for correction.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    sales.getSaleById(editId)
      .then(res => {
        if (cancelled || !res?.data) return;
        const row = res.data;
        if (row.source !== 'OPENING_AR') return;
        setRows([{ ...row, csi_date: toDateInput(row.csi_date), _isNew: false }]);
      })
      .catch(err => {
        if (!cancelled) console.error('[OpeningArEntry] load edit row:', err.message);
      });
    return () => { cancelled = true; };
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Build product dropdown options from ProductMaster (no stock filter) ──
  const productOptions = useMemo(() => {
    return productMaster.map(p => ({
      product_id: p._id,
      // Per Global Rule #4 + memory: brand_name dosage — qty unit_code (qty omitted here, no inventory)
      label: `${p.brand_name || 'Unknown'}${p.dosage_strength ? ' ' + p.dosage_strength : ''}${p.unit_code ? ' (' + p.unit_code + ')' : ''}`,
      brand_name: p.brand_name,
      dosage_strength: p.dosage_strength,
      unit_code: p.unit_code || 'PC',
      selling_price: p.selling_price || 0,
      item_key: p.item_key || ''
    }));
  }, [productMaster]);

  // ── Row mutators ─────────────────────────────────────────────────────────
  const updateRow = useCallback((idx, field, value) => {
    setRows(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }, []);

  const updateLineItem = useCallback((rowIdx, itemIdx, field, value) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx] };
      const items = [...row.line_items];
      items[itemIdx] = { ...items[itemIdx], [field]: value };

      // Auto-fill on product selection
      if (field === 'product_id' && value) {
        const product = productOptions.find(p => p.product_id?.toString() === value || p.product_id === value);
        if (product) {
          items[itemIdx].unit = product.unit_code;
          items[itemIdx].unit_price = product.selling_price ? String(product.selling_price) : items[itemIdx].unit_price;
          items[itemIdx].item_key = product.item_key;
        }
      }

      row.line_items = items;
      updated[rowIdx] = row;
      return updated;
    });
  }, [productOptions]);

  const addLineItem = useCallback((rowIdx) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx] };
      row.line_items = [...row.line_items, { product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }];
      updated[rowIdx] = row;
      return updated;
    });
  }, []);

  const removeLineItem = useCallback((rowIdx, itemIdx) => {
    setRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIdx] };
      row.line_items = row.line_items.filter((_, i) => i !== itemIdx);
      if (row.line_items.length === 0) {
        row.line_items = [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }];
      }
      updated[rowIdx] = row;
      return updated;
    });
  }, []);

  const addRow = () => setRows(prev => [...prev, buildEmptyRow(defaultBackdate)]);

  const removeRow = (idx) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Apply handler — routes based on photoOnlyRowIdx sentinel ────────────
  // null     → full OCR: create new row pre-filled from extracted fields
  // number   → re-upload: update csi_photo_url/attachment_id on that row only
  // 'NEW'    → proof-only: create fresh row with just the photo, no OCR fields
  const handleScanApply = useCallback((scannedData) => {
    // Re-upload path: attach photo to the targeted existing row (keeps line items).
    if (typeof photoOnlyRowIdx === 'number') {
      setRows(prev => {
        const updated = [...prev];
        if (!updated[photoOnlyRowIdx]) return prev;
        updated[photoOnlyRowIdx] = {
          ...updated[photoOnlyRowIdx],
          csi_photo_url: scannedData.csi_photo_url || updated[photoOnlyRowIdx].csi_photo_url,
          csi_attachment_id: scannedData.csi_attachment_id || updated[photoOnlyRowIdx].csi_attachment_id
        };
        return updated;
      });
      setPhotoOnlyRowIdx(null);
      showSuccess('Photo attached. Resubmit when ready.');
      return;
    }

    // Proof-only path: create a fresh row with just the photo attached.
    // BDM fills in hospital, CSI#, date, and line items manually.
    if (photoOnlyRowIdx === 'NEW') {
      const newRow = {
        ...buildEmptyRow(defaultBackdate),
        csi_photo_url: scannedData.csi_photo_url || '',
        csi_attachment_id: scannedData.csi_attachment_id || null
      };
      setRows(prev => [...prev, newRow]);
      setPhotoOnlyRowIdx(null);
      showSuccess('Photo attached to new row. Fill in the hospital, CSI#, date, and line items, then save.');
      return;
    }

    // Full OCR scan: create a new row with extracted data pre-filled.
    // Clamp csi_date to before live_date if OCR returned a future/today date.
    let csiDate = scannedData.csi_date;
    if (liveDate && csiDate >= liveDate) {
      csiDate = defaultBackdate;
    }
    const newRow = {
      ...buildEmptyRow(csiDate || defaultBackdate),
      hospital_id: scannedData.hospital_id || '',
      doc_ref: scannedData.doc_ref || '',
      csi_photo_url: scannedData.csi_photo_url || '',
      csi_attachment_id: scannedData.csi_attachment_id || null,
      line_items: scannedData.line_items?.length
        ? scannedData.line_items.map(li => ({
            product_id: li.product_id || '',
            qty: li.qty || '',
            unit: li.unit || '',
            unit_price: li.unit_price || '',
            item_key: li.item_key || ''
          }))
        : [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }]
    };
    setRows(prev => [...prev, newRow]);
  }, [photoOnlyRowIdx, liveDate, defaultBackdate]);

  const openPhotoReupload = (idx) => {
    setPhotoOnlyRowIdx(idx);
    setScanModalOpen(true);
  };

  // ── Save / Validate / Submit ────────────────────────────────────────────
  const computeLineTotal = (item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return (qty * price).toFixed(2);
  };

  const validateRowForSave = (row) => {
    const errs = [];
    if (!row.hospital_id && !row.customer_id) errs.push('Hospital or customer is required');
    if (!row.doc_ref) errs.push('CSI # is required');
    if (!row.csi_date) errs.push('CSI date is required');
    if (liveDate && row.csi_date >= liveDate) {
      errs.push(`CSI date must be before your go-live date (${liveDate}). Use the live Sales Entry page for current sales.`);
    }
    return errs;
  };

  // Internal save routine — persists every `_isNew` row, returns the saved ids and
  // collected warnings. Separated from the user-facing "Save Drafts" handler so
  // that Validate / Post can chain a save without triggering the Entry→Transactions
  // reset that Save Drafts does on its own.
  const persistNewRows = async () => {
    const warnings = [];
    const savedIds = [];
    const savedFull = [];
    for (const row of rows) {
      if (!row._isNew) continue;

      const rowErrs = validateRowForSave(row);
      if (rowErrs.length) { warnings.push(`Row skipped: ${rowErrs.join('; ')}`); continue; }

      const validItems = row.line_items.filter(li => li.product_id && li.qty && parseFloat(li.qty) > 0);
      const dropped = row.line_items.filter(li => li.product_id && (!li.qty || parseFloat(li.qty) <= 0));
      if (dropped.length) warnings.push(`${dropped.length} line item(s) dropped: qty must be > 0`);
      const zeroPrice = validItems.filter(li => !li.unit_price || parseFloat(li.unit_price) <= 0);
      if (zeroPrice.length) warnings.push(`${zeroPrice.length} line item(s) have ₱0 unit price`);

      if (validItems.length === 0) { warnings.push('Row skipped: no valid line items'); continue; }

      const payload = {
        sale_type: 'CSI',
        // Phase G4.5a proxy entry (gated by sales.opening_ar_proxy sub-perm + PROXY_ENTRY_ROLES.OPENING_AR)
        assigned_to: assignedTo || undefined,
        hospital_id: row.hospital_id || undefined,
        customer_id: row.customer_id || undefined,
        csi_date: row.csi_date,
        doc_ref: row.doc_ref,
        // No warehouse_id — opening AR has no inventory impact
        csi_photo_url: row.csi_photo_url || undefined,
        csi_attachment_id: row.csi_attachment_id || undefined,
        line_items: validItems.map(li => ({
          product_id: li.product_id,
          item_key: li.item_key,
          qty: parseFloat(li.qty),
          unit: li.unit,
          unit_price: parseFloat(li.unit_price)
        }))
      };

      const res = await sales.createSale(payload);
      if (res?.data) {
        savedIds.push(res.data._id);
        savedFull.push(res.data);
      }
    }
    return { warnings, savedIds, savedFull };
  };

  const saveAll = async () => {
    setActionLoading('save');
    try {
      const { warnings, savedIds } = await persistNewRows();
      if (warnings.length) showError(null, warnings.join('\n'));
      if (savedIds.length) {
        // Saved drafts now belong to Opening AR Transactions — do NOT re-hydrate
        // them back onto Entry. Reset to a blank row so the user can keep typing
        // new CSIs, and surface a success banner directing them to the List.
        showSuccess(`${savedIds.length} draft${savedIds.length === 1 ? '' : 's'} saved. View in Opening AR Transactions.`);
        setRows([buildEmptyRow(defaultBackdate)]);
      } else if (!warnings.length) {
        showError(null, 'No rows saved. Each row needs a hospital/customer, CSI #, backdated date, and at least one valid line item.');
      }
    } catch (err) {
      console.error('[OpeningArEntry] save:', err);
      showError(err, 'Could not save opening AR row');
    } finally {
      setActionLoading('');
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────
  if (!liveDate) {
    return (
      <div className="oar-page" style={{ display: 'flex' }}>
        <Sidebar />
        <div style={{ flex: 1 }}>
          <Navbar />
          <main className="oar-main">
            <style>{pageStyles}</style>
            <style>{csiPhotoStyles}</style>
            <div className="oar-error-banner">
              <strong>Your ERP go-live date is not set.</strong>
              <div style={{ marginTop: 4 }}>
                Opening AR Entry requires a <code>live_date</code> on your user profile to determine which CSIs are pre-cutover.
                Contact your admin to set this in <Link to="/erp/people">People Master</Link>, then refresh.
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const hasNew = rows.some(r => r._isNew);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="oar-page" style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Navbar />
        <main className="oar-main">
          <style>{pageStyles}</style>
          <style>{csiPhotoStyles}</style>

          <WorkflowGuide pageKey="sales-opening-ar" />

          {/* Shared sales-family navigation. Mirrors SalesEntry / SalesList /
              OpeningArList so the five pages share one nav widget. Each tab
              gates off its own sub-permission so subscribers can hide entry
              post-cutover while keeping the transaction history visible. */}
          <div className="sales-nav-tabs" role="tablist" aria-label="Sales navigation">
            {canCreateSales && <Link to="/erp/sales/entry" className="sales-nav-tab">Sales</Link>}
            <Link to="/erp/sales" className="sales-nav-tab">Sales Transactions</Link>
            {canOpeningArEntry && <Link to="/erp/sales/opening-ar" className="sales-nav-tab active" aria-current="page">Opening AR</Link>}
            {canOpeningArList && <Link to="/erp/sales/opening-ar/list" className="sales-nav-tab">Opening AR Transactions</Link>}
            <Link to="/erp/csi-booklets" className="sales-nav-tab">
              {canCsiBooklets ? 'CSI Booklets' : 'My CSI'}
            </Link>
          </div>

          {/* Phase G4.5a — proxy entry dropdown (hidden unless caller is eligible) */}
          <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'flex-end' }}>
            <OwnerPicker module="sales" subKey="opening_ar_proxy" moduleLookupCode="OPENING_AR" value={assignedTo} onChange={setAssignedTo} label="Opening AR — record on behalf of" />
          </div>

          <div className="oar-banner">
            <strong>Opening AR Entry — pre-go-live CSIs only.</strong>
            <div style={{ marginTop: 4 }}>
              Your live date is <strong>{liveDate}</strong>. CSIs dated before this go to AR + Sales Revenue
              with <strong>no inventory deduction and no COGS</strong> (opening inventory is loaded separately
              via the import script). All entries route through the same Approval Hub as live sales.
              <br />
              After you click <strong>Save Drafts</strong>, rows move to{' '}
              {canOpeningArList
                ? <Link to="/erp/sales/opening-ar/list" style={{ color: '#1e40af', fontWeight: 600 }}>Opening AR Transactions →</Link>
                : <strong>Opening AR Transactions</strong>}{' '}
              where you continue validating, posting, or editing them.
            </div>
          </div>

          <div className="oar-panel">
            <div className="oar-header">
              <div>
                <h1>Opening AR Entry</h1>
                <p className="oar-subtitle">Historical CSIs · Product list = ProductMaster (no stock filter)</p>
              </div>
              <div className="oar-actions">
                <button className="btn btn-outline" onClick={() => { setPhotoOnlyRowIdx(null); setScanModalOpen(true); }} title="Scan a CSI photo with OCR — auto-fills hospital, CSI#, and line items">
                  📷 Scan CSI
                </button>
                <button className="btn btn-outline" onClick={() => { setPhotoOnlyRowIdx('NEW'); setScanModalOpen(true); }} title="Upload a CSI photo as proof only — no OCR; you type the row details manually">
                  📎 Upload CSI
                </button>
                <button className="btn btn-outline" onClick={addRow}>+ Add Row</button>
                <button className="btn btn-primary" onClick={saveAll} disabled={!hasNew || actionLoading === 'save'}>
                  {actionLoading === 'save' ? 'Saving...' : 'Save Drafts'}
                </button>
              </div>
            </div>

            {productLoading && <div style={{ fontSize: 12, color: 'var(--erp-muted)', marginBottom: 8 }}>Loading product master...</div>}

            {/* ── Desktop / Tablet table ──
                Layout: header fields (Hospital / Date / CSI# / Totals / Photo / Status)
                live in the MAIN row. Line items get a SEPARATE sub-row spanning the
                full width below, so neither side fights for space and the product
                dropdown isn't squeezed by a narrow grid track. */}
            <div className="oar-grid">
              <table className="oar-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th style={{ minWidth: 240 }}>Hospital / Customer</th>
                    <th style={{ width: 160 }}>CSI Date</th>
                    <th style={{ width: 180 }}>CSI #</th>
                    <th style={{ width: 130 }} className="num">Total</th>
                    <th style={{ width: 70 }}>Photo</th>
                    <th style={{ width: 160 }}>Status</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const status = STATUS_COLORS[row.status] || STATUS_COLORS.DRAFT;
                    const total = (row.line_items || []).reduce((sum, li) => sum + (parseFloat(computeLineTotal(li)) || 0), 0);
                    const isPosted = row.status === 'POSTED';
                    const dateMaxOk = !liveDate || row.csi_date < liveDate;
                    const showRejection = row.rejection_reason && editableStatuses.includes(row.status);
                    return (
                      <Fragment key={row._id || row._tempId}>
                        <tr className="oar-row-main">
                          <td style={{ verticalAlign: 'middle' }}>{idx + 1}</td>
                          <td>
                            <SelectField
                              value={row.hospital_id || ''}
                              onChange={e => updateRow(idx, 'hospital_id', e.target.value)}
                              disabled={isPosted}
                            >
                              <option value="">— Select hospital —</option>
                              {(hospitals || []).map(h => (
                                <option key={h._id} value={h._id}>{h.hospital_name || h.name}</option>
                              ))}
                            </SelectField>
                            {!row.hospital_id && customerList.length > 0 && (
                              <SelectField
                                value={row.customer_id || ''}
                                onChange={e => updateRow(idx, 'customer_id', e.target.value)}
                                disabled={isPosted}
                              >
                                <option value="">— or non-hospital customer —</option>
                                {customerList.map(c => (
                                  <option key={c._id} value={c._id}>{c.customer_name || c.name}</option>
                                ))}
                              </SelectField>
                            )}
                          </td>
                          <td>
                            <input
                              type="date"
                              value={row.csi_date || ''}
                              onChange={e => updateRow(idx, 'csi_date', e.target.value)}
                              max={liveDate ? oneDayBefore(liveDate) : undefined}
                              disabled={isPosted}
                              style={!dateMaxOk ? { borderColor: '#dc2626' } : undefined}
                            />
                            {!dateMaxOk && (
                              <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>Must be before {liveDate}</div>
                            )}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={row.doc_ref || ''}
                              onChange={e => updateRow(idx, 'doc_ref', e.target.value)}
                              placeholder="CSI booklet #"
                              disabled={isPosted}
                            />
                          </td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'middle' }}>
                            ₱{total.toFixed(2)}
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <CsiPhoto
                              url={row.csi_photo_url}
                              attachmentId={row.csi_attachment_id}
                              onReupload={!isPosted ? () => openPhotoReupload(idx) : undefined}
                            />
                          </td>
                          <td>
                            <div className="oar-row-status">
                              <span className="status-badge" style={{ background: status.bg, color: status.text }}>
                                {status.label}
                              </span>
                              {showRejection && (
                                <>
                                  <div className="oar-rejection-banner" title={row.rejection_reason}>
                                    Rejected: {row.rejection_reason.length > 60 ? row.rejection_reason.slice(0, 60) + '…' : row.rejection_reason}
                                  </div>
                                  <button className="btn btn-sm btn-outline" onClick={() => openPhotoReupload(idx)}>
                                    📷 Re-upload CSI Photo
                                  </button>
                                </>
                              )}
                              {(row.validation_errors || []).slice(0, 2).map((ve, vi) => (
                                <div key={vi} style={{ fontSize: 10, color: '#991b1b' }}>• {ve}</div>
                              ))}
                            </div>
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            {!isPosted && rows.length > 1 && (
                              <button className="btn btn-sm btn-outline" onClick={() => removeRow(idx)} title="Remove row">×</button>
                            )}
                          </td>
                        </tr>
                        <tr className="oar-row-items">
                          <td></td>
                          <td colSpan={7} style={{ paddingTop: 0 }}>
                            <div className="oar-li-section-label">Line items</div>
                            {(row.line_items || []).map((item, li) => (
                              <div key={li} className="oar-line-item">
                                <SelectField
                                  value={item.product_id?._id || item.product_id || ''}
                                  onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)}
                                  disabled={isPosted}
                                >
                                  <option value="">— Product —</option>
                                  {productOptions.map(p => (
                                    <option key={p.product_id} value={p.product_id}>{p.label}</option>
                                  ))}
                                </SelectField>
                                <input
                                  type="number"
                                  min="1"
                                  step="any"
                                  value={item.qty || ''}
                                  onChange={e => updateLineItem(idx, li, 'qty', e.target.value)}
                                  placeholder="Qty"
                                  disabled={isPosted}
                                />
                                <input
                                  type="text"
                                  value={item.unit || ''}
                                  onChange={e => updateLineItem(idx, li, 'unit', e.target.value)}
                                  placeholder="Unit"
                                  disabled={isPosted}
                                  readOnly={!!item.product_id}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unit_price || ''}
                                  onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)}
                                  placeholder="Price"
                                  disabled={isPosted}
                                />
                                {!isPosted && (
                                  <button className="oar-li-remove" title="Remove" onClick={() => removeLineItem(idx, li)}>×</button>
                                )}
                              </div>
                            ))}
                            {!isPosted && (
                              <button className="oar-li-add" onClick={() => addLineItem(idx)}>+ Line Item</button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile cards (≤768px) ── */}
            <div className="oar-cards">
              {rows.map((row, idx) => {
                const status = STATUS_COLORS[row.status] || STATUS_COLORS.DRAFT;
                const total = (row.line_items || []).reduce((sum, li) => sum + (parseFloat(computeLineTotal(li)) || 0), 0);
                const isPosted = row.status === 'POSTED';
                const showRejection = row.rejection_reason && editableStatuses.includes(row.status);
                return (
                  <div className="oar-card" key={row._id || row._tempId}>
                    <div className="oar-card-row">
                      <strong>Row {idx + 1}</strong>
                      <span className="status-badge" style={{ background: status.bg, color: status.text }}>{status.label}</span>
                    </div>
                    <label>Hospital</label>
                    <SelectField
                      value={row.hospital_id || ''}
                      onChange={e => updateRow(idx, 'hospital_id', e.target.value)}
                      disabled={isPosted}
                    >
                      <option value="">— Select hospital —</option>
                      {(hospitals || []).map(h => (
                        <option key={h._id} value={h._id}>{h.hospital_name || h.name}</option>
                      ))}
                    </SelectField>
                    <label style={{ marginTop: 8 }}>CSI Date (must be before {liveDate})</label>
                    <input
                      type="date"
                      value={row.csi_date || ''}
                      onChange={e => updateRow(idx, 'csi_date', e.target.value)}
                      max={liveDate ? oneDayBefore(liveDate) : undefined}
                      disabled={isPosted}
                    />
                    <label style={{ marginTop: 8 }}>CSI #</label>
                    <input
                      type="text"
                      value={row.doc_ref || ''}
                      onChange={e => updateRow(idx, 'doc_ref', e.target.value)}
                      disabled={isPosted}
                    />
                    <label style={{ marginTop: 8 }}>Line Items</label>
                    {(row.line_items || []).map((item, li) => (
                      <div key={li} style={{ display: 'flex', gap: 6, marginBottom: 4, flexDirection: 'column', border: '1px solid var(--erp-border)', borderRadius: 6, padding: 6 }}>
                        <SelectField
                          value={item.product_id?._id || item.product_id || ''}
                          onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)}
                          disabled={isPosted}
                        >
                          <option value="">— Product —</option>
                          {productOptions.map(p => (
                            <option key={p.product_id} value={p.product_id}>{p.label}</option>
                          ))}
                        </SelectField>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input type="number" placeholder="Qty" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} disabled={isPosted} style={{ flex: 1 }} />
                          <input type="number" placeholder="Price" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} disabled={isPosted} style={{ flex: 1 }} />
                          {!isPosted && <button className="btn btn-sm btn-outline" onClick={() => removeLineItem(idx, li)}>×</button>}
                        </div>
                      </div>
                    ))}
                    {!isPosted && <button className="oar-li-add" onClick={() => addLineItem(idx)}>+ Line Item</button>}
                    <div className="oar-card-row" style={{ marginTop: 8 }}>
                      <span><strong>Total: ₱{total.toFixed(2)}</strong></span>
                      {row.csi_photo_url && <a href={row.csi_photo_url} target="_blank" rel="noopener noreferrer">📷 Photo</a>}
                    </div>
                    {showRejection && (
                      <div style={{ marginTop: 8 }}>
                        <div className="oar-rejection-banner">Rejected: {row.rejection_reason}</div>
                        <button className="btn btn-sm btn-outline" style={{ marginTop: 4 }} onClick={() => openPhotoReupload(idx)}>
                          📷 Re-upload CSI Photo
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <ScanCSIModal
            open={scanModalOpen}
            onClose={() => { setScanModalOpen(false); setPhotoOnlyRowIdx(null); }}
            onApply={handleScanApply}
            hospitals={hospitals || []}
            productOptions={productOptions}
            photoOnly={photoOnlyRowIdx !== null}
            docType="CSI"
          />
        </main>
      </div>
    </div>
  );
}
