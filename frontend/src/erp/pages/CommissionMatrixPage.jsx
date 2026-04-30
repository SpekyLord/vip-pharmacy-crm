/**
 * CommissionMatrixPage — Phase VIP-1.B / Phase R1 (Apr 2026)
 *
 * BDM/ECOMM_REP/AREA_BDM commission rule matrix. Tabs by payee_role.
 * Lookup-driven role gate COMMISSION_ROLES.MANAGE_RULES.
 *
 * Phase R1 (Apr 29 2026):
 *   - Payee dropdown filters by `role='staff'` server-side (Phase S2 —
 *     `staff` is the runtime auth role for BDM/employee/contractor; admins
 *     are excluded since they don't draw commission).
 *   - Product picker swaps from free-text to ERP ProductMaster (full
 *     hospital distribution catalog, brand_name + generic_name +
 *     dosage_strength per Rule #4). Stored value is product_id (string).
 *   - Per-line routing banner explains how commission attaches per
 *     SalesLine via SalesLine.bdm_id — multi-product CSI with multiple
 *     BDMs splits commission across all of them automatically.
 *
 * Route: /erp/commission-matrix
 */
import { useState, useEffect, useCallback } from 'react';
import { Trophy, RefreshCw, Plus, X, AlertTriangle, Loader, Trash2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import userService from '../../services/userService';
import useProducts from '../hooks/useProducts';
import rebateCommissionService from '../../erp/services/rebateCommissionService';

const fmtMoney = (n) => n == null ? 'unbounded' : `₱${Number(n).toLocaleString()}`;
const ROLES = ['BDM', 'ECOMM_REP', 'AREA_BDM'];

// ProductMaster label (Rule #4: brand + generic + dosage). Defensive vs
// pre-Phase-R1 callers that pass CRM-storefront product shape.
function formatProductLabel(p) {
  if (!p) return '';
  const brand = p.brand_name || p.name || '';
  const generic = p.generic_name ? ` (${p.generic_name})` : (p.genericName ? ` (${p.genericName})` : '');
  const dosage = p.dosage_strength ? ` ${p.dosage_strength}` : (p.dosage ? ` ${p.dosage}` : '');
  return `${brand}${generic}${dosage}`.trim();
}

export default function CommissionMatrixPage() {
  const [rows, setRows] = useState([]);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState('BDM');
  const [filterActive, setFilterActive] = useState('true');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const { products } = useProducts();

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = { payee_role: tab };
      if (filterActive !== '') params.is_active = filterActive;
      const res = await rebateCommissionService.listCommissionRules(params);
      setRows(res?.data || []);
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setLoading(false); }
  }, [tab, filterActive]);

  useEffect(() => { load(); }, [load]);
  // Phase R1: filter Payee dropdown to role='staff' server-side (Phase S2 —
  // 'staff' replaced 'employee'/'contractor'; admins don't draw commission).
  useEffect(() => {
    userService.getAll({ role: 'staff', limit: 200 })
      .then(r => setUsers(r?.data || []))
      .catch(() => setUsers([]));
  }, []);

  const onDeactivate = async (id, label) => {
    if (!window.confirm(`Deactivate "${label}"?`)) return;
    try { await rebateCommissionService.deactivateCommissionRule(id); toast.success('Deactivated'); load(); }
    catch (e) { toast.error(e?.response?.data?.message || e.message); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <PageGuide pageKey="commission-matrix" />

          {/* Phase R1 — per-line routing banner. Surface the SalesLine.bdm_id
              attribution model so admin understands how commission flows on
              multi-product CSIs with multiple BDMs. */}
          <div style={{ padding: 12, background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#075985', display: 'flex', gap: 8 }}>
            <Info size={16} style={{ flex: '0 0 auto', marginTop: 2 }} />
            <div>
              <strong>Per-line routing:</strong> commission attaches to each
              <code> SalesLine.bdm_id</code>. Multi-product CSIs with multiple
              BDMs split commission across all of them automatically — no
              splits configured here. Auto-fill happens in the Collection
              pre-save bridge: most-specific matrix match per (payee_role,
              payee_id, product, hospital, customer) wins; ties broken by
              priority asc.
            </div>
          </div>

          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Trophy size={22} /> Staff Commission Matrix
            </h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <option value="true">Active only</option>
                <option value="false">Inactive only</option>
                <option value="">All</option>
              </select>
              <button onClick={load} style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={14} /> Refresh</button>
              <button onClick={() => setShowCreate(true)} style={{ padding: '8px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> Add Rule</button>
            </div>
          </header>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
            {ROLES.map(r => (
              <button key={r} onClick={() => setTab(r)} style={{ padding: '8px 16px', background: tab === r ? '#2563eb' : 'transparent', color: tab === r ? '#fff' : '#475569', border: 'none', cursor: 'pointer', borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: 13 }}>
                {r}
              </button>
            ))}
          </div>

          {err && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, display: 'flex', gap: 8 }}><AlertTriangle size={16} />{err}</div>}

          {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader className="animate-spin" size={20} /></div>
            : rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>No {tab} commission rules. Click <strong>Add Rule</strong>.</div>
            : (
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Payee</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Commission %</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Min amount</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Max amount</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Product</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Priority</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>{r.payee ? r.payee.name : <span style={{ color: '#94a3b8' }}>any {r.payee_role}</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{Number(r.commission_pct || 0).toFixed(2)}%</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtMoney(r.min_amount)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmtMoney(r.max_amount)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {r.product_code ? (() => {
                            const prod = (products || []).find(p => String(p._id) === String(r.product_code));
                            return prod ? formatProductLabel(prod) : <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{String(r.product_code).slice(-6)}</span>;
                          })() : <span style={{ color: '#94a3b8' }}>any</span>}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{r.priority}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: r.is_active ? '#dcfce7' : '#f3f4f6', color: r.is_active ? '#15803d' : '#64748b' }}>{r.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {r.is_active && (
                            <button onClick={() => onDeactivate(r._id, `${tab} ${r.payee?.name || 'any'} ${r.commission_pct}%`)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                              <Trash2 size={12} /> Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </main>
      </div>
      {showCreate && <CreateCommissionModal payeeRole={tab} users={users} products={products} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateCommissionModal({ payeeRole, users, products, onClose, onCreated }) {
  const [form, setForm] = useState({ payee_id: '', commission_pct: 5, min_amount: 0, max_amount: '', product_code: '', priority: 100, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setErr(null);
    try {
      const payload = {
        payee_role: payeeRole,
        payee_id: form.payee_id || undefined,
        commission_pct: Number(form.commission_pct),
        min_amount: Number(form.min_amount || 0),
        max_amount: form.max_amount === '' ? null : Number(form.max_amount),
        product_code: form.product_code || '',
        priority: Number(form.priority || 100),
        notes: form.notes,
      };
      await rebateCommissionService.createCommissionRule(payload);
      toast.success('Commission rule created'); onCreated();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onSubmit={onSubmit} style={{ background: '#fff', borderRadius: 8, padding: 24, width: '90%', maxWidth: 540 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add {payeeRole} Commission Rule</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </header>
        {err && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Payee (optional — blank = any {payeeRole})</label>
          <select value={form.payee_id} onChange={(e) => setForm({ ...form, payee_id: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <option value="">— any {payeeRole} —</option>
            {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Commission %</label>
            <input type="number" min="0.01" step="0.01" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Min ₱ (incl)</label>
            <input type="number" min="0" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Max ₱ (excl, blank = ∞)</label>
            <input type="number" min="0" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            {/* Phase R1: free-text product_code → ProductMaster picker. The
                stored value is the product _id (string) so the matrix walker
                matches on a canonical reference; admin can't typo a code that
                doesn't exist. Empty selection still means "match any". */}
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Product (optional — blank matches any)</label>
            <select
              value={form.product_code}
              onChange={(e) => setForm({ ...form, product_code: e.target.value })}
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            >
              <option value="">— any product —</option>
              {(products || []).map(p => (
                <option key={p._id} value={String(p._id)}>{formatProductLabel(p)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Priority (lower wins ties)</label>
            <input type="number" min="0" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={submitting} style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: submitting ? 'not-allowed' : 'pointer' }}>{submitting ? 'Creating…' : 'Create rule'}</button>
        </div>
      </form>
    </div>
  );
}
