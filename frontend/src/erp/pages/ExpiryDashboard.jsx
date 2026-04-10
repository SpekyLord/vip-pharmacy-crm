/**
 * ExpiryDashboard — Phase 25
 * Near-expiry and expired batch management dashboard.
 * Buckets: Expired | Critical (<30d) | Warning (30-90d) | Caution (90-Nd)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpApi from '../hooks/useErpApi';
import WarehousePicker from '../components/WarehousePicker';
import WorkflowGuide from '../components/WorkflowGuide';

const BUCKET_CONFIG = {
  expired:  { label: 'Expired',          color: '#991b1b', bg: '#fef2f2', icon: '🔴' },
  critical: { label: 'Critical (<30d)',   color: '#c2410c', bg: '#fff7ed', icon: '🟠' },
  warning:  { label: 'Warning (30-90d)',  color: '#a16207', bg: '#fefce8', icon: '🟡' },
  caution:  { label: 'Caution',           color: '#15803d', bg: '#f0fdf4', icon: '🟢' }
};

export default function ExpiryDashboard() {
  const api = useErpApi();
  const [data, setData] = useState({ expired: [], critical: [], warning: [], caution: [] });
  const [, setSummary] = useState({});
  const [warehouseId, setWarehouseId] = useState('');
  const [activeBucket, setActiveBucket] = useState('expired');

  const load = useCallback(async () => {
    try {
      const res = await api.get('/inventory/expiry-dashboard', {
        params: { ...(warehouseId && { warehouse_id: warehouseId }) }
      });
      setData(res?.data || {});
      setSummary(res?.summary || {});
    } catch (err) { console.error('[ExpiryDashboard]', err.message); }
  }, [api, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const activeItems = data[activeBucket] || [];
  const bucketConf = BUCKET_CONFIG[activeBucket];

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
          <WorkflowGuide pageKey="expiry-dashboard" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0 }}>Expiry Management</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/erp/my-stock" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', textDecoration: 'none', fontSize: 13, border: '1px solid #dbe4f0' }}>My Stock</Link>
              <Link to="/erp/batch-trace" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', textDecoration: 'none', fontSize: 13, border: '1px solid #dbe4f0' }}>Batch Trace</Link>
            </div>
          </div>

          <WarehousePicker value={warehouseId} onChange={setWarehouseId} />

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
            {Object.entries(BUCKET_CONFIG).map(([key, conf]) => {
              const count = data[key]?.length || 0;
              const isActive = activeBucket === key;
              return (
                <button key={key} onClick={() => setActiveBucket(key)}
                  style={{
                    padding: 16, borderRadius: 10, border: isActive ? `2px solid ${conf.color}` : '1px solid #dbe4f0',
                    background: isActive ? conf.bg : '#fff', cursor: 'pointer', textAlign: 'left',
                    boxShadow: isActive ? `0 2px 8px ${conf.color}20` : 'none'
                  }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: conf.color }}>{conf.icon} {count}</div>
                  <div style={{ fontSize: 12, color: conf.color, fontWeight: 600, marginTop: 4 }}>{conf.label}</div>
                </button>
              );
            })}
          </div>

          {/* Active bucket detail */}
          <style>{`
            .expiry-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .expiry-table th { padding: 8px 12px; background: #f8fafc; }
            .expiry-table td { padding: 8px 12px; }
            .expiry-table tr + tr { border-top: 1px solid #f1f5f9; }
            .expiry-cards { display: none; }
            @media (max-width: 640px) {
              .expiry-table { display: none; }
              .expiry-cards { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
              .expiry-card {
                padding: 12px; border-radius: 10px; background: #fff;
                border: 1px solid #e5e7eb; display: grid;
                grid-template-columns: 1fr auto; gap: 6px 12px;
              }
              .expiry-card-product { grid-column: 1 / -1; }
              .expiry-card-label { font-size: 11px; color: #6b7280; }
              .expiry-card-value { font-size: 13px; font-weight: 600; }
            }
          `}</style>
          <div style={{ background: bucketConf.bg, borderRadius: 12, border: `1px solid ${bucketConf.color}30`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', fontWeight: 700, color: bucketConf.color, borderBottom: `1px solid ${bucketConf.color}30` }}>
              {bucketConf.icon} {bucketConf.label} — {activeItems.length} batch(es)
            </div>
            {activeItems.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>No batches in this category</div>
            ) : (
              <>
                {/* Desktop table */}
                <table className="expiry-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Product</th>
                      <th>Batch/Lot</th>
                      <th>Expiry</th>
                      <th>Days Left</th>
                      <th>Qty</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeItems.map((item, i) => (
                      <tr key={i}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{item.product?.brand_name || 'N/A'}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{item.product?.generic_name || ''} {item.product?.dosage_strength || ''}</div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{item.batch_lot_no}</td>
                        <td style={{ textAlign: 'center' }}>{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: bucketConf.color }}>
                          {item.days_remaining <= 0 ? 'EXPIRED' : `${item.days_remaining}d`}
                        </td>
                        <td style={{ textAlign: 'center' }}>{item.available_qty}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Link to={`/erp/batch-trace?product=${item.product_id}&batch=${encodeURIComponent(item.batch_lot_no)}`}
                            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #2563eb', color: '#2563eb', textDecoration: 'none' }}>
                            Trace
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile cards */}
                <div className="expiry-cards">
                  {activeItems.map((item, i) => (
                    <div key={i} className="expiry-card">
                      <div className="expiry-card-product">
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.product?.brand_name || 'N/A'}</div>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{item.product?.generic_name || ''} {item.product?.dosage_strength || ''}</div>
                      </div>
                      <div>
                        <div className="expiry-card-label">Batch/Lot</div>
                        <div className="expiry-card-value">{item.batch_lot_no}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="expiry-card-label">Expiry</div>
                        <div className="expiry-card-value">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '—'}</div>
                      </div>
                      <div>
                        <div className="expiry-card-label">Days Left</div>
                        <div className="expiry-card-value" style={{ color: bucketConf.color }}>
                          {item.days_remaining <= 0 ? 'EXPIRED' : `${item.days_remaining}d`}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="expiry-card-label">Qty</div>
                        <div className="expiry-card-value">{item.available_qty}</div>
                      </div>
                      <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                        <Link to={`/erp/batch-trace?product=${item.product_id}&batch=${encodeURIComponent(item.batch_lot_no)}`}
                          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #2563eb', color: '#2563eb', textDecoration: 'none', display: 'inline-block' }}>
                          Trace Batch
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
