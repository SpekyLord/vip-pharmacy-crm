/**
 * BatchTrace — Phase 25
 * Batch traceability report: receipt → sale path per batch.
 * Shows full lifecycle timeline of a specific product batch.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';
import useInventory from '../hooks/useInventory';
import WorkflowGuide from '../components/WorkflowGuide';
import SelectField from '../../components/common/Select';
import { showError } from '../utils/errorToast';

const TXN_COLORS = {
  OPENING_BALANCE: { bg: '#dbeafe', text: '#1e40af', label: 'Opening' },
  GRN:             { bg: '#dcfce7', text: '#166534', label: 'GRN (Receipt)' },
  CSI:             { bg: '#fef3c7', text: '#92400e', label: 'Sale (CSI)' },
  DR_SAMPLING:     { bg: '#fce7f3', text: '#9d174d', label: 'DR Sampling' },
  DR_CONSIGNMENT:  { bg: '#f3e8ff', text: '#7c3aed', label: 'DR Consignment' },
  RETURN_IN:       { bg: '#ecfeff', text: '#0891b2', label: 'Return In' },
  TRANSFER_OUT:    { bg: '#fef2f2', text: '#991b1b', label: 'Transfer Out' },
  TRANSFER_IN:     { bg: '#f0fdf4', text: '#15803d', label: 'Transfer In' },
  ADJUSTMENT:      { bg: '#f1f5f9', text: '#475569', label: 'Adjustment' }
};

export default function BatchTrace() {
  const api = useErpApi();
  const { getMyStock } = useInventory();
  const [searchParams] = useSearchParams();

  const [productOptions, setProductOptions] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(searchParams.get('product') || '');
  const [batchInput, setBatchInput] = useState(searchParams.get('batch') || '');
  const [traceData, setTraceData] = useState(null);
  const [searching, setSearching] = useState(false);

  // Load product list for dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await getMyStock();
        const seen = new Set();
        const opts = [];
        for (const p of (res?.data || [])) {
          if (!seen.has(p.product_id)) {
            seen.add(p.product_id);
            opts.push({ value: p.product_id, label: `${p.brand_name || ''} ${p.dosage_strength || ''}`.trim() });
          }
        }
        setProductOptions(opts);
      } catch { /* */ }
    })();
  }, [getMyStock]);

  // Auto-search if params provided
  useEffect(() => {
    if (selectedProduct && batchInput) handleSearch();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = useCallback(async () => {
    if (!selectedProduct || !batchInput.trim()) {
      showError(null, 'Select a product and enter a batch/lot number');
      return;
    }
    setSearching(true);
    try {
      const res = await api.get(`/inventory/batch-trace/${selectedProduct}/${encodeURIComponent(batchInput.trim())}`);
      setTraceData(res?.data || null);
    } catch (err) {
      setTraceData(null);
      showError(err, 'Batch not found or no records');
    } finally { setSearching(false); }
  }, [api, selectedProduct, batchInput]);

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
          <WorkflowGuide pageKey="batch-trace" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0 }}>Batch Traceability</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/erp/my-stock" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', textDecoration: 'none', fontSize: 13, border: '1px solid #dbe4f0' }}>My Stock</Link>
              <Link to="/erp/expiry-dashboard" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', textDecoration: 'none', fontSize: 13, border: '1px solid #dbe4f0' }}>Expiry Dashboard</Link>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: 16, borderRadius: 10, background: '#fff', border: '1px solid #dbe4f0', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 13, flex: 1, minWidth: 200 }}>Product:
              <SelectField value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                <option value="">Select product...</option>
                {productOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </SelectField>
            </label>
            <label style={{ fontSize: 13, flex: 1, minWidth: 150 }}>Batch/Lot No:
              <input value={batchInput} onChange={e => setBatchInput(e.target.value)} placeholder="e.g. BN2026-001"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                style={{ width: '100%', marginTop: 4, padding: '6px 10px', borderRadius: 4, border: '1px solid #dbe4f0' }} />
            </label>
            <button onClick={handleSearch} disabled={searching}
              style={{ padding: '8px 20px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, height: 36 }}>
              {searching ? 'Searching...' : 'Trace'}
            </button>
          </div>

          {/* Results */}
          {traceData && (
            <div>
              {/* Batch summary card */}
              <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid #dbe4f0', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{traceData.product?.brand_name || 'Product'}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{traceData.product?.generic_name || ''} {traceData.product?.dosage_strength || ''}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Batch: <strong>{traceData.batch_lot_no}</strong></div>
                    {traceData.expiry_date && <div style={{ fontSize: 13 }}>Expiry: <strong>{new Date(traceData.expiry_date).toLocaleDateString()}</strong></div>}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 8, background: '#dcfce7' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#166534' }}>{traceData.summary?.total_received || 0}</div>
                      <div style={{ fontSize: 11, color: '#166534' }}>Total In</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 8, background: '#fef2f2' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#991b1b' }}>{traceData.summary?.total_dispensed || 0}</div>
                      <div style={{ fontSize: 11, color: '#991b1b' }}>Total Out</div>
                    </div>
                    <div style={{ textAlign: 'center', padding: '8px 16px', borderRadius: 8, background: '#dbeafe' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#1e40af' }}>{traceData.summary?.current_balance || 0}</div>
                      <div style={{ fontSize: 11, color: '#1e40af' }}>Balance</div>
                    </div>
                  </div>
                </div>

                {/* Breakdown */}
                {traceData.breakdown && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {Object.entries(traceData.breakdown).map(([type, info]) => {
                      const conf = TXN_COLORS[type] || TXN_COLORS.ADJUSTMENT;
                      return (
                        <span key={type} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: conf.bg, color: conf.text }}>
                          {conf.label}: {info.qty_in > 0 ? `+${info.qty_in}` : ''}{info.qty_out > 0 ? ` -${info.qty_out}` : ''} ({info.count}x)
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <style>{`
                .bt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
                .bt-table th { padding: 8px 12px; background: #f8fafc; }
                .bt-table td { padding: 8px 12px; }
                .bt-table tr + tr { border-top: 1px solid #f1f5f9; }
                .bt-cards { display: none; }
                @media (max-width: 640px) {
                  .bt-table { display: none; }
                  .bt-cards { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
                  .bt-card {
                    padding: 12px; border-radius: 10px; background: #fff;
                    border: 1px solid #e5e7eb;
                  }
                  .bt-card-row { display: flex; justify-content: space-between; gap: 8px; }
                  .bt-card-label { font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 700; }
                  .bt-card-value { font-size: 13px; font-weight: 600; }
                  .bt-card-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 8px; }
                }
              `}</style>
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #dbe4f0', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', fontWeight: 700, borderBottom: '1px solid #dbe4f0', fontSize: 14 }}>
                  Transaction Timeline ({traceData.timeline?.length || 0} entries)
                </div>
                <table className="bt-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th>Type</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Balance</th>
                      <th>Warehouse</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(traceData.timeline || []).map((entry, i) => {
                      const conf = TXN_COLORS[entry.type] || TXN_COLORS.ADJUSTMENT;
                      return (
                        <tr key={i}>
                          <td>{entry.date ? new Date(entry.date).toLocaleString() : '—'}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: conf.bg, color: conf.text }}>{conf.label}</span>
                          </td>
                          <td style={{ textAlign: 'center', color: entry.qty_in > 0 ? '#166534' : '#ccc', fontWeight: entry.qty_in > 0 ? 700 : 400 }}>
                            {entry.qty_in > 0 ? `+${entry.qty_in}` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', color: entry.qty_out > 0 ? '#991b1b' : '#ccc', fontWeight: entry.qty_out > 0 ? 700 : 400 }}>
                            {entry.qty_out > 0 ? `-${entry.qty_out}` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>{entry.running_balance ?? '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: 12 }}>{entry.warehouse || '—'}</td>
                          <td style={{ textAlign: 'center', fontSize: 12 }}>{entry.recorded_by}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="bt-cards">
                  {(traceData.timeline || []).map((entry, i) => {
                    const conf = TXN_COLORS[entry.type] || TXN_COLORS.ADJUSTMENT;
                    return (
                      <div key={i} className="bt-card">
                        <div className="bt-card-row">
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: conf.bg, color: conf.text }}>{conf.label}</span>
                          <span style={{ fontSize: 12, color: '#6b7280' }}>{entry.date ? new Date(entry.date).toLocaleDateString() : '—'}</span>
                        </div>
                        <div className="bt-card-grid">
                          <div>
                            <div className="bt-card-label">In</div>
                            <div className="bt-card-value" style={{ color: entry.qty_in > 0 ? '#166534' : '#ccc' }}>
                              {entry.qty_in > 0 ? `+${entry.qty_in}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="bt-card-label">Out</div>
                            <div className="bt-card-value" style={{ color: entry.qty_out > 0 ? '#991b1b' : '#ccc' }}>
                              {entry.qty_out > 0 ? `-${entry.qty_out}` : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="bt-card-label">Balance</div>
                            <div className="bt-card-value">{entry.running_balance ?? '—'}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                          {entry.warehouse || '—'} {entry.recorded_by ? `· ${entry.recorded_by}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!traceData && !searching && (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div>Select a product and batch number to trace its full lifecycle</div>
              <div style={{ fontSize: 12, marginTop: 8 }}>Receipt → Storage → Sale/Transfer — every movement tracked</div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
