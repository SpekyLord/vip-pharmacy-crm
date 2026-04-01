import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useSales from '../hooks/useSales';
import useInventory from '../hooks/useInventory';
import useHospitals from '../hooks/useHospitals';

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569', label: 'Draft' },
  VALID: { bg: '#dcfce7', text: '#166534', label: 'Valid' },
  ERROR: { bg: '#fef2f2', text: '#991b1b', label: 'Error' },
  POSTED: { bg: '#dbeafe', text: '#1e40af', label: 'Posted' },
  DELETION_REQUESTED: { bg: '#fef3c7', text: '#92400e', label: 'Del. Req.' }
};

const emptyRow = () => ({
  _tempId: Date.now() + Math.random(),
  hospital_id: '',
  csi_date: new Date().toISOString().split('T')[0],
  doc_ref: '',
  line_items: [{ product_id: '', qty: '', unit: '', unit_price: '', item_key: '' }],
  status: 'DRAFT',
  validation_errors: [],
  _isNew: true
});

const pageStyles = `
  .sales-entry-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .sales-main { padding: 20px; max-width: 1400px; margin: 0 auto; }
  .sales-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
  .sales-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0; }
  .sales-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-warning { background: #d97706; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border, #dbe4f0); color: var(--erp-text); }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }

  .sales-grid { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; overflow-x: auto; }
  .sales-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sales-table th { background: var(--erp-accent-soft, #e8efff); color: var(--erp-text); padding: 10px 8px; text-align: left; font-weight: 600; white-space: nowrap; position: sticky; top: 0; }
  .sales-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border, #dbe4f0); vertical-align: top; }
  .sales-table input, .sales-table select { width: 100%; padding: 6px 8px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 6px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .sales-table input:focus, .sales-table select:focus { outline: none; border-color: var(--erp-accent, #1e5eff); }
  .sales-table .readonly { background: var(--erp-bg, #f4f7fb); color: var(--erp-muted, #5f7188); border: none; }

  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .error-panel { margin-top: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; }
  .error-panel h3 { margin: 0 0 8px; font-size: 14px; color: #991b1b; }
  .error-panel ul { margin: 0; padding-left: 20px; }
  .error-panel li { font-size: 13px; color: #991b1b; margin-bottom: 4px; }

  .near-expiry-badge { background: #fef3c7; color: #92400e; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-left: 4px; }
  .add-row-btn { display: block; width: 100%; padding: 10px; text-align: center; color: var(--erp-accent); background: transparent; border: 2px dashed var(--erp-border); border-radius: 0 0 12px 12px; cursor: pointer; font-weight: 600; }

  /* Mobile cards */
  @media (max-width: 768px) {
    .sales-table-wrapper { display: none; }
    .sales-cards { display: flex; flex-direction: column; gap: 12px; padding: 12px; }
    .sale-card { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 12px; padding: 14px; }
    .sale-card label { font-size: 11px; color: var(--erp-muted); font-weight: 600; text-transform: uppercase; }
    .sale-card input, .sale-card select { width: 100%; padding: 8px; margin-top: 4px; margin-bottom: 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 14px; }
    .sale-card .card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  }
  @media (min-width: 769px) {
    .sales-cards { display: none; }
  }
`;

export default function SalesEntry() {
  const { user } = useAuth();
  const sales = useSales();
  const inventory = useInventory();
  const { hospitals } = useHospitals();

  const [rows, setRows] = useState([emptyRow()]);
  const [stockProducts, setStockProducts] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [actionLoading, setActionLoading] = useState('');

  // Load stock on mount (only products with stock > 0)
  useEffect(() => {
    inventory.getMyStock().then(res => {
      if (res?.data) setStockProducts(res.data);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Build product dropdown options from stock
  const productOptions = useMemo(() => {
    return stockProducts.map(sp => ({
      product_id: sp.product_id,
      label: `${sp.product?.brand_name || 'Unknown'} ${sp.product?.dosage_strength || ''} — ${sp.total_qty} ${sp.product?.unit_code || 'PC'}`,
      brand_name: sp.product?.brand_name,
      unit_code: sp.product?.unit_code || 'PC',
      selling_price: sp.product?.selling_price || 0,
      item_key: sp.product?.item_key || '',
      near_expiry: sp.near_expiry,
      total_qty: sp.total_qty
    }));
  }, [stockProducts]);

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
          items[itemIdx].unit_price = product.selling_price;
          items[itemIdx].item_key = product.item_key;
        }
      }

      row.line_items = items;
      updated[rowIdx] = row;
      return updated;
    });
  }, [productOptions]);

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const removeRow = (idx) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const computeLineTotal = (item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.unit_price) || 0;
    return (qty * price).toFixed(2);
  };

  // Save all new/dirty rows as DRAFTs
  const saveAll = async () => {
    setActionLoading('save');
    try {
      const savedIds = [];
      for (const row of rows) {
        if (!row._isNew) continue;
        if (!row.hospital_id || !row.doc_ref) continue;

        const payload = {
          hospital_id: row.hospital_id,
          csi_date: row.csi_date,
          doc_ref: row.doc_ref,
          line_items: row.line_items.filter(li => li.product_id && li.qty).map(li => ({
            product_id: li.product_id,
            item_key: li.item_key,
            qty: parseFloat(li.qty),
            unit: li.unit,
            unit_price: parseFloat(li.unit_price)
          }))
        };

        const res = await sales.createSale(payload);
        if (res?.data) savedIds.push(res.data._id);
      }

      if (savedIds.length) {
        // Reload from server
        await loadSales();
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const loadSales = async () => {
    try {
      const res = await sales.getSales({ status: 'DRAFT', limit: 100 });
      if (res?.data?.length) {
        setRows(res.data.map(s => ({ ...s, _isNew: false })));
      } else {
        setRows([emptyRow()]);
      }
    } catch {}
  };

  const handleValidate = async () => {
    setActionLoading('validate');
    try {
      // Save unsaved rows first
      await saveAll();
      const res = await sales.validateSales();
      if (res?.errors?.length) {
        setValidationErrors(res.errors);
      } else {
        setValidationErrors([]);
      }
      await loadSales();
    } catch (err) {
      console.error('Validate error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const handleSubmit = async () => {
    setActionLoading('submit');
    try {
      const res = await sales.submitSales();
      if (res?.posted_count) {
        setValidationErrors([]);
        await loadSales();
      }
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const handleReopen = async () => {
    setActionLoading('reopen');
    try {
      const postedIds = rows.filter(r => r.status === 'POSTED' && r._id).map(r => r._id);
      if (postedIds.length) {
        await sales.reopenSales(postedIds);
        await loadSales();
      }
    } catch (err) {
      console.error('Reopen error:', err);
    } finally {
      setActionLoading('');
    }
  };

  const hasPosted = rows.some(r => r.status === 'POSTED');
  const hasDraftOrError = rows.some(r => r.status === 'DRAFT' || r.status === 'ERROR');
  const allValid = rows.length > 0 && rows.every(r => r.status === 'VALID' || r.status === 'POSTED');

  return (
    <div className="admin-page erp-page sales-entry-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-content sales-main">
          <div className="sales-header">
            <h1>Sales Entry</h1>
            <div className="sales-actions">
              <button className="btn btn-outline" onClick={addRow}>+ Add Row</button>
              <button className="btn btn-primary" onClick={saveAll} disabled={actionLoading === 'save'}>
                {actionLoading === 'save' ? 'Saving...' : 'Save Drafts'}
              </button>
              <button className="btn btn-warning" onClick={handleValidate} disabled={!hasDraftOrError || !!actionLoading}>
                {actionLoading === 'validate' ? 'Validating...' : 'Validate Sales'}
              </button>
              <button className="btn btn-success" onClick={handleSubmit} disabled={!allValid || !!actionLoading}>
                {actionLoading === 'submit' ? 'Submitting...' : 'Submit Sales'}
              </button>
              {hasPosted && (
                <button className="btn btn-danger" onClick={handleReopen} disabled={!!actionLoading}>
                  {actionLoading === 'reopen' ? 'Reopening...' : 'Re-open'}
                </button>
              )}
            </div>
          </div>

          {/* Desktop Table */}
          <div className="sales-grid sales-table-wrapper">
            <table className="sales-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th style={{ width: 200 }}>Hospital</th>
                  <th style={{ width: 120 }}>CSI Date</th>
                  <th style={{ width: 100 }}>CSI #</th>
                  <th style={{ width: 200 }}>Product</th>
                  <th style={{ width: 70 }}>Qty</th>
                  <th style={{ width: 70 }}>Unit</th>
                  <th style={{ width: 90 }}>Unit Price</th>
                  <th style={{ width: 100 }}>Line Total</th>
                  <th style={{ width: 80 }}>Status</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row._id || row._tempId}>
                    <td style={{ color: 'var(--erp-muted)', fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <select value={row.hospital_id?._id || row.hospital_id || ''} onChange={e => updateRow(idx, 'hospital_id', e.target.value)} disabled={row.status === 'POSTED'}>
                        <option value="">Select hospital...</option>
                        {hospitals.map(h => (
                          <option key={h._id} value={h._id}>{h.hospital_name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="date" value={row.csi_date ? (typeof row.csi_date === 'string' ? row.csi_date.split('T')[0] : new Date(row.csi_date).toISOString().split('T')[0]) : ''} onChange={e => updateRow(idx, 'csi_date', e.target.value)} disabled={row.status === 'POSTED'} />
                    </td>
                    <td>
                      <input value={row.doc_ref || ''} onChange={e => updateRow(idx, 'doc_ref', e.target.value)} placeholder="CSI#" disabled={row.status === 'POSTED'} />
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <div key={li}>
                          <select value={item.product_id?._id || item.product_id || ''} onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)} disabled={row.status === 'POSTED'}>
                            <option value="">Select product...</option>
                            {productOptions.map(p => (
                              <option key={p.product_id} value={p.product_id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          {item.product_id && productOptions.find(p => (p.product_id?.toString() || p.product_id) === (item.product_id?.toString() || item.product_id))?.near_expiry && (
                            <span className="near-expiry-badge">Near Expiry</span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} type="number" min="1" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} disabled={row.status === 'POSTED'} />
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} className="readonly" value={item.unit || ''} readOnly tabIndex={-1} />
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} type="number" step="0.01" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} disabled={row.status === 'POSTED'} />
                      ))}
                    </td>
                    <td>
                      {row.line_items?.map((item, li) => (
                        <input key={li} className="readonly" value={computeLineTotal(item)} readOnly tabIndex={-1} />
                      ))}
                    </td>
                    <td>
                      <span className="status-badge" style={{ background: STATUS_COLORS[row.status]?.bg, color: STATUS_COLORS[row.status]?.text }}>
                        {STATUS_COLORS[row.status]?.label || row.status}
                      </span>
                    </td>
                    <td>
                      {row.status === 'DRAFT' && (
                        <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)} title="Remove row">&times;</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="add-row-btn" onClick={addRow}>+ Add Row</button>
          </div>

          {/* Mobile Cards */}
          <div className="sales-cards">
            {rows.map((row, idx) => (
              <div className="sale-card" key={row._id || row._tempId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Row {idx + 1}</span>
                  <span className="status-badge" style={{ background: STATUS_COLORS[row.status]?.bg, color: STATUS_COLORS[row.status]?.text }}>
                    {STATUS_COLORS[row.status]?.label}
                  </span>
                </div>
                <label>Hospital</label>
                <select value={row.hospital_id?._id || row.hospital_id || ''} onChange={e => updateRow(idx, 'hospital_id', e.target.value)}>
                  <option value="">Select...</option>
                  {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
                </select>
                <label>CSI Date</label>
                <input type="date" value={row.csi_date ? (typeof row.csi_date === 'string' ? row.csi_date.split('T')[0] : '') : ''} onChange={e => updateRow(idx, 'csi_date', e.target.value)} />
                <label>CSI #</label>
                <input value={row.doc_ref || ''} onChange={e => updateRow(idx, 'doc_ref', e.target.value)} />
                {row.line_items?.map((item, li) => (
                  <div key={li}>
                    <label>Product</label>
                    <select value={item.product_id || ''} onChange={e => updateLineItem(idx, li, 'product_id', e.target.value)}>
                      <option value="">Select...</option>
                      {productOptions.map(p => <option key={p.product_id} value={p.product_id}>{p.label}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}><label>Qty</label><input type="number" value={item.qty || ''} onChange={e => updateLineItem(idx, li, 'qty', e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label>Price</label><input type="number" value={item.unit_price || ''} onChange={e => updateLineItem(idx, li, 'unit_price', e.target.value)} /></div>
                      <div style={{ flex: 1 }}><label>Total</label><input value={computeLineTotal(item)} readOnly /></div>
                    </div>
                  </div>
                ))}
                {row.status === 'DRAFT' && (
                  <div className="card-footer">
                    <button className="btn btn-danger btn-sm" onClick={() => removeRow(idx)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Validation Error Panel */}
          {validationErrors.length > 0 && (
            <div className="error-panel">
              <h3>Validation Errors ({validationErrors.length})</h3>
              <ul>
                {validationErrors.map((err, i) => (
                  <li key={i}>
                    <strong>CSI# {err.doc_ref || err.sale_id}:</strong>{' '}
                    {err.messages.join('; ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
