/**
 * RebateMatrixPage — Phase VIP-1.B Phase 4 (Apr 2026)
 *
 * Tier-A MD per-product rebate matrix administration. Lists active +
 * inactive MdProductRebate rows with Doctor enrichment + filter by PARTNER
 * status. Create modal enforces the schema's 3-gate validation server-side
 * (we surface the error verbatim — keep error messaging consistent with
 * the matrix's authoritative source of truth).
 *
 * Route: /admin/rebate-matrix
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Handshake, RefreshCw, Plus, X, AlertTriangle, Loader, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import doctorService from '../../services/doctorService';
import productService from '../../services/productService';
import rebateCommissionService from '../../erp/services/rebateCommissionService';

// Format real product label per Rule #4: brand + (generic) + dosage
function formatProductLabel(p) {
  if (!p) return '';
  const brand = p.name || '';
  const generic = p.genericName ? ` (${p.genericName})` : '';
  const dosage = p.dosage ? ` ${p.dosage}` : '';
  return `${brand}${generic}${dosage}`.trim();
}

const fmtPct = (n) => `${(Number(n || 0)).toFixed(2)}%`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export default function RebateMatrixPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterActive, setFilterActive] = useState('true'); // 'true' | 'false' | ''
  const [partnerDoctors, setPartnerDoctors] = useState([]);
  const [products, setProducts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (filterActive !== '') params.is_active = filterActive;
      const res = await rebateCommissionService.listMdProductRebates(params);
      setRows(res?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [filterActive]);

  // Pre-load PARTNER MDs for create modal — matches the 3-gate
  // (PARTNER + agreement_date) so rejected rules surface fast.
  const loadPartners = useCallback(async () => {
    try {
      const res = await doctorService.getAll({ partnership_status: 'PARTNER', limit: 500 });
      const list = (res?.data || []).filter(d => d.partner_agreement_date);
      setPartnerDoctors(list);
    } catch (err) {
      console.warn('Failed to load PARTNER doctors:', err.message);
      setPartnerDoctors([]);
    }
  }, []);

  // Load real products from website DB so admin picks brand+generic+dosage
  // (Rule #4: never just brand_name — always show full identifier).
  const loadProducts = useCallback(async () => {
    try {
      const res = await productService.getAll({ limit: 1000 });
      setProducts(res?.data || []);
    } catch (err) {
      console.warn('Failed to load products:', err.message);
      setProducts([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPartners(); }, [loadPartners]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleDeactivate = async (id, label) => {
    if (!window.confirm(`Deactivate "${label}"? Future Collection rebates will stop matching this rule.`)) return;
    try {
      await rebateCommissionService.deactivateMdProductRebate(id);
      toast.success('Deactivated');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <PageGuide pageKey="rebate-matrix" />

          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Handshake size={22} /> Tier-A MD Product Rebate Matrix
            </h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
              >
                <option value="true">Active only</option>
                <option value="false">Inactive only</option>
                <option value="">All</option>
              </select>
              <button
                onClick={load}
                style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RefreshCw size={14} /> Refresh
              </button>
              <button
                onClick={() => setShowCreate(true)}
                style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={14} /> Add Rule
              </button>
            </div>
          </header>

          {error && (
            <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}><Loader className="animate-spin" size={20} /></div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              No rebate rules yet. Click <strong>Add Rule</strong> to seed the matrix.
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: '#f1f5f9' }}>
                  <tr>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>MD</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Product</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rebate %</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Effective From</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Effective To</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '10px 12px' }}>
                        {r.doctor ? (
                          <>
                            Dr. {r.doctor.firstName} {r.doctor.lastName}
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              {r.doctor.partnership_status} · agreement {fmtDate(r.doctor.partner_agreement_date)}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>(missing)</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{r.product_label || <span style={{ color: '#94a3b8' }}>{String(r.product_id).slice(-6)}</span>}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtPct(r.rebate_pct)}</td>
                      <td style={{ padding: '10px 12px' }}>{fmtDate(r.effective_from)}</td>
                      <td style={{ padding: '10px 12px' }}>{fmtDate(r.effective_to)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: r.is_active ? '#dcfce7' : '#f3f4f6', color: r.is_active ? '#15803d' : '#64748b' }}>
                          {r.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        {r.is_active && (
                          <button
                            onClick={() => handleDeactivate(r._id, `Dr. ${r.doctor?.lastName || ''} · ${r.product_label || r.product_id}`)}
                            style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                          >
                            <Trash2 size={12} /> Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {showCreate && (
        <CreateRebateModal
          partners={partnerDoctors}
          products={products}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateRebateModal({ partners, products, onClose, onCreated }) {
  const [form, setForm] = useState({
    doctor_id: '',
    product_id: '',
    product_label: '',
    rebate_pct: 5,
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const payload = {
        doctor_id: form.doctor_id,
        product_id: form.product_id,
        product_label: form.product_label,
        rebate_pct: Number(form.rebate_pct),
        effective_from: form.effective_from || new Date().toISOString(),
        effective_to: form.effective_to || null,
        notes: form.notes,
      };
      await rebateCommissionService.createMdProductRebate(payload);
      toast.success('Rebate rule created');
      onCreated();
    } catch (e) {
      setErr(e?.response?.data?.message || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onSubmit={onSubmit} style={{ background: '#fff', borderRadius: 8, padding: 24, width: '90%', maxWidth: 540 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add Tier-A Rebate Rule</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </header>

        {err && (
          <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>MD (PARTNER status with signed agreement)</label>
          <select
            value={form.doctor_id}
            onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
            required
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            <option value="">Select MD…</option>
            {partners.map(p => (
              <option key={p._id} value={p._id}>
                Dr. {p.firstName} {p.lastName} (agreement {fmtDate(p.partner_agreement_date)})
              </option>
            ))}
          </select>
          {partners.length === 0 && (
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
              No PARTNER MDs with agreement_date. Promote via /admin/md-leads first.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Product (brand + generic + dosage)</label>
            <select
              value={form.product_id}
              onChange={(e) => {
                const pid = e.target.value;
                const p = products.find(x => x._id === pid);
                // Auto-fill product_label from real product (Rule #4: brand + generic + dosage).
                setForm({ ...form, product_id: pid, product_label: formatProductLabel(p) });
              }}
              required
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            >
              <option value="">Select product…</option>
              {products.map(p => (
                <option key={p._id} value={p._id}>
                  {formatProductLabel(p)}
                </option>
              ))}
            </select>
            {products.length === 0 && (
              <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
                No products loaded. Check /admin/products or website DB connection.
              </div>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Rebate %</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.rebate_pct}
              onChange={(e) => setForm({ ...form, rebate_pct: e.target.value })}
              required
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        {form.product_label && (
          <div style={{ marginBottom: 12, padding: '8px 10px', background: '#f1f5f9', borderRadius: 6, fontSize: 12 }}>
            <span style={{ color: '#64748b' }}>Stored label: </span>
            <strong>{form.product_label}</strong>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Effective from</label>
            <input
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Effective to (optional)</label>
            <input
              type="date"
              value={form.effective_to}
              onChange={(e) => setForm({ ...form, effective_to: e.target.value })}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={submitting} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer' }}>
            {submitting ? 'Creating…' : 'Create rule'}
          </button>
        </div>
      </form>
    </div>
  );
}
