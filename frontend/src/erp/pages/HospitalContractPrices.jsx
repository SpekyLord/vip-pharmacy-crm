/**
 * Hospital Contract Prices — Phase CSI-X1 (Apr 2026)
 *
 * Admin-facing master-data CRUD for per-hospital BDM-negotiated contract
 * pricing. Resolves before ProductMaster.selling_price for sales to that
 * hospital. Approval-gated via gateApproval('PRICE_LIST').
 */
import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import {
  listContractPrices, createContractPrice, cancelContractPrice
} from '../services/hospitalContractPriceService';
import WorkflowGuide from '../components/WorkflowGuide';
import { showApprovalPending, showError, showSuccess } from '../utils/errorToast';

export default function HospitalContractPrices() {
  const [rows, setRows] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ hospital_id: '', product_id: '', status: '' });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    hospital_id: '', product_id: '', contract_price: '',
    effective_from: '', effective_to: '', change_reason: '', notes: ''
  });

  // Load lookup-driven dropdowns
  useEffect(() => {
    (async () => {
      try {
        const [h, p] = await Promise.all([
          api.get('/erp/hospitals', { params: { limit: 500 } }),
          api.get('/erp/products', { params: { limit: 500 } })
        ]);
        setHospitals(h.data?.data || []);
        setProducts(p.data?.data || []);
      } catch (e) {
        console.error('[HospitalContractPrices] dropdown load failed:', e?.response?.data?.message || e.message);
      }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.hospital_id) params.hospital_id = filters.hospital_id;
      if (filters.product_id) params.product_id = filters.product_id;
      if (filters.status) params.status = filters.status;
      const res = await listContractPrices(params);
      setRows(res.data || []);
    } catch (e) {
      showError(e, 'Could not load contract prices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters.hospital_id, filters.product_id, filters.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.hospital_id || !form.product_id || !form.contract_price) {
      showError(null, 'Hospital, Product, and Contract Price are required');
      return;
    }
    try {
      const payload = {
        hospital_id: form.hospital_id,
        product_id: form.product_id,
        contract_price: Number(form.contract_price),
        effective_from: form.effective_from || undefined,
        effective_to: form.effective_to || undefined,
        change_reason: form.change_reason,
        notes: form.notes
      };
      const res = await createContractPrice(payload);
      if (res?.approval_pending) {
        showApprovalPending(res.message);
      } else {
        showSuccess('Contract price created');
      }
      setShowCreate(false);
      setForm({ hospital_id: '', product_id: '', contract_price: '', effective_from: '', effective_to: '', change_reason: '', notes: '' });
      await load();
    } catch (e) {
      if (e?.response?.status === 202) {
        showApprovalPending(e.response.data?.message);
        setShowCreate(false);
      } else {
        showError(e, 'Could not create contract price');
      }
    }
  };

  const handleCancel = async (row) => {
    const reason = window.prompt('Reason for cancellation:');
    if (reason === null) return;  // user dismissed
    try {
      await cancelContractPrice(row._id, reason);
      showSuccess('Contract price cancelled');
      await load();
    } catch (e) {
      showError(e, 'Could not cancel contract price');
    }
  };

  const productLabel = (p) => p ? `${p.brand_name || ''} ${p.dosage_strength || ''}`.trim() : '—';
  const peso = (n) => '₱' + (Number(n || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const productMap = useMemo(() => new Map(products.map(p => [String(p._id), p])), [products]);

  return (
    <div style={{ padding: '20px', maxWidth: 1400, margin: '0 auto' }}>
      <h2 style={{ marginBottom: 4 }}>Hospital Contract Prices</h2>
      <div style={{ color: '#64748b', marginBottom: 16, fontSize: 13 }}>
        BDM-negotiated per-hospital pricing. Resolves before ProductMaster SRP for sales to that hospital.
      </div>

      <WorkflowGuide pageKey="hospital-contract-prices" />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filters.hospital_id} onChange={e => setFilters(f => ({ ...f, hospital_id: e.target.value }))}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
          <option value="">All Hospitals</option>
          {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
        </select>
        <select value={filters.product_id} onChange={e => setFilters(f => ({ ...f, product_id: e.target.value }))}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
          <option value="">All Products</option>
          {products.map(p => <option key={p._id} value={p._id}>{productLabel(p)}</option>)}
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                style={{ padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
          <option value="">All (except Cancelled)</option>
          <option value="ACTIVE">Active</option>
          <option value="SUPERSEDED">Superseded</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button onClick={() => setShowCreate(true)}
                style={{ marginLeft: 'auto', background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
          + New Contract Price
        </button>
      </div>

      {loading && <div>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          No contract prices yet. Click &quot;New Contract Price&quot; to create one.
        </div>
      )}
      {!loading && rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f1f5f9' }}>
            <tr>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Hospital</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Product</th>
              <th style={{ padding: 10, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>Contract Price</th>
              <th style={{ padding: 10, textAlign: 'right', borderBottom: '2px solid #cbd5e1' }}>SRP</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Effective</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>BDM</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>Status</th>
              <th style={{ padding: 10, textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r._id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: 10 }}>{r.hospital_id?.hospital_name || '—'}</td>
                <td style={{ padding: 10 }}>{productLabel(r.product_id)}</td>
                <td style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>{peso(r.contract_price)}</td>
                <td style={{ padding: 10, textAlign: 'right', color: '#94a3b8' }}>{peso(productMap.get(String(r.product_id?._id || r.product_id))?.selling_price || r.product_id?.selling_price)}</td>
                <td style={{ padding: 10 }}>
                  {r.effective_from ? new Date(r.effective_from).toLocaleDateString() : '—'}
                  {r.effective_to ? ` → ${new Date(r.effective_to).toLocaleDateString()}` : ''}
                </td>
                <td style={{ padding: 10 }}>{r.negotiated_by?.name || '—'}</td>
                <td style={{ padding: 10 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: r.status === 'ACTIVE' ? '#dcfce7' : (r.status === 'CANCELLED' ? '#fee2e2' : '#f3f4f6'),
                    color: r.status === 'ACTIVE' ? '#15803d' : (r.status === 'CANCELLED' ? '#b91c1c' : '#64748b')
                  }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ padding: 10 }}>
                  {r.status === 'ACTIVE' && (
                    <button onClick={() => handleCancel(r)}
                            style={{ background: 'transparent', color: '#dc2626', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={handleCreate}
                style={{ background: '#fff', padding: 24, borderRadius: 12, width: '90%', maxWidth: 540 }}>
            <h3 style={{ marginTop: 0 }}>New Hospital Contract Price</h3>
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              <label>
                Hospital *
                <select value={form.hospital_id} onChange={e => setForm(f => ({ ...f, hospital_id: e.target.value }))}
                        required
                        style={{ width: '100%', padding: 8, marginTop: 4 }}>
                  <option value="">— select hospital —</option>
                  {hospitals.map(h => <option key={h._id} value={h._id}>{h.hospital_name}</option>)}
                </select>
              </label>
              <label>
                Product *
                <select value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                        required
                        style={{ width: '100%', padding: 8, marginTop: 4 }}>
                  <option value="">— select product —</option>
                  {products.map(p => <option key={p._id} value={p._id}>{productLabel(p)}{p.selling_price ? ` (SRP ${peso(p.selling_price)})` : ''}</option>)}
                </select>
              </label>
              <label>
                Contract Price (₱) *
                <input type="number" step="0.01" min="0" value={form.contract_price}
                       onChange={e => setForm(f => ({ ...f, contract_price: e.target.value }))}
                       required
                       style={{ width: '100%', padding: 8, marginTop: 4 }} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>
                  Effective From
                  <input type="date" value={form.effective_from}
                         onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))}
                         style={{ width: '100%', padding: 8, marginTop: 4 }} />
                </label>
                <label>
                  Effective To (optional)
                  <input type="date" value={form.effective_to}
                         onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))}
                         style={{ width: '100%', padding: 8, marginTop: 4 }} />
                </label>
              </div>
              <label>
                Change Reason
                <input type="text" value={form.change_reason}
                       placeholder="e.g. Volume tier negotiated"
                       onChange={e => setForm(f => ({ ...f, change_reason: e.target.value }))}
                       style={{ width: '100%', padding: 8, marginTop: 4 }} />
              </label>
              <label>
                Notes
                <textarea value={form.notes} rows={2}
                          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                          style={{ width: '100%', padding: 8, marginTop: 4 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowCreate(false)}
                      style={{ padding: '8px 16px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit"
                      style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
