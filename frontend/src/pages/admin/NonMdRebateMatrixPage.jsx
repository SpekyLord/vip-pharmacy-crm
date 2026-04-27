/**
 * NonMdRebateMatrixPage — Phase VIP-1.B Phase 4
 *
 * Non-MD partner rebate matrix (pharmacist / hospital staff). Specificity
 * walk happens at apply-time in matrixWalker; admin just maintains the
 * rule rows. Lookup-driven role gate REBATE_ROLES.MANAGE_NONMD_MATRIX.
 *
 * Route: /admin/non-md-rebate-matrix
 */
import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Plus, X, AlertTriangle, Loader, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import doctorService from '../../services/doctorService';
import rebateCommissionService from '../../erp/services/rebateCommissionService';

const fmtPct = (n) => `${(Number(n || 0)).toFixed(2)}%`;

export default function NonMdRebateMatrixPage() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterActive, setFilterActive] = useState('true');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {};
      if (filterActive !== '') params.is_active = filterActive;
      const res = await rebateCommissionService.listNonMdRules(params);
      setRows(res?.data || []);
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setLoading(false); }
  }, [filterActive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    doctorService.getAll({ limit: 500 })
      .then(r => setPartners(r?.data || []))
      .catch(() => setPartners([]));
  }, []);

  const onDeactivate = async (id, label) => {
    if (!window.confirm(`Deactivate "${label}"?`)) return;
    try { await rebateCommissionService.deactivateNonMdRule(id); toast.success('Deactivated'); load(); }
    catch (e) { toast.error(e?.response?.data?.message || e.message); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <PageGuide pageKey="non-md-rebate-matrix" />
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Users size={22} /> Non-MD Partner Rebate Matrix
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

          {err && <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, display: 'flex', gap: 8 }}><AlertTriangle size={16} />{err}</div>}

          {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Loader className="animate-spin" size={20} /></div>
            : rows.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>No rules. Click <strong>Add Rule</strong>.</div>
            : (
              <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: '#f1f5f9' }}>
                    <tr>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Partner</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rebate %</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Hospital</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Customer</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Product code</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Priority</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>{r.partner ? `${r.partner.firstName} ${r.partner.lastName}` : <span style={{ color: '#94a3b8' }}>(missing)</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtPct(r.rebate_pct)}</td>
                        <td style={{ padding: '10px 12px' }}>{r.hospital_id ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{String(r.hospital_id).slice(-6)}</span> : <span style={{ color: '#94a3b8' }}>any</span>}</td>
                        <td style={{ padding: '10px 12px' }}>{r.customer_id ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{String(r.customer_id).slice(-6)}</span> : <span style={{ color: '#94a3b8' }}>any</span>}</td>
                        <td style={{ padding: '10px 12px' }}>{r.product_code || <span style={{ color: '#94a3b8' }}>any</span>}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{r.priority}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: r.is_active ? '#dcfce7' : '#f3f4f6', color: r.is_active ? '#15803d' : '#64748b' }}>{r.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {r.is_active && (
                            <button onClick={() => onDeactivate(r._id, `${r.partner?.lastName || ''} · ${r.rebate_pct}%`)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
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
      {showCreate && <CreateNonMdModal partners={partners} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateNonMdModal({ partners, onClose, onCreated }) {
  const [form, setForm] = useState({ partner_id: '', rebate_pct: 5, hospital_id: '', customer_id: '', product_code: '', priority: 100, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setErr(null);
    try {
      const payload = {
        partner_id: form.partner_id,
        rebate_pct: Number(form.rebate_pct),
        hospital_id: form.hospital_id || undefined,
        customer_id: form.customer_id || undefined,
        product_code: form.product_code || '',
        priority: Number(form.priority || 100),
        notes: form.notes,
      };
      await rebateCommissionService.createNonMdRule(payload);
      toast.success('Rule created'); onCreated();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onSubmit={onSubmit} style={{ background: '#fff', borderRadius: 8, padding: 24, width: '90%', maxWidth: 540 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add Non-MD Partner Rule</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </header>
        {err && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Partner (any Doctor record — non-MD partners reuse the Doctor coll)</label>
          <select value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <option value="">Select partner…</option>
            {partners.map(p => <option key={p._id} value={p._id}>{p.firstName} {p.lastName}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Rebate %</label>
            <input type="number" min="0.01" step="0.01" value={form.rebate_pct} onChange={(e) => setForm({ ...form, rebate_pct: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Priority (lower = runs first)</label>
            <input type="number" min="0" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Hospital ID (optional, ObjectId)</label>
          <input type="text" pattern="[0-9a-fA-F]{24}" value={form.hospital_id} onChange={(e) => setForm({ ...form, hospital_id: e.target.value })} placeholder="leave blank to match any hospital" style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'monospace' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Customer ID (optional, ObjectId)</label>
          <input type="text" pattern="[0-9a-fA-F]{24}" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} placeholder="leave blank to match any customer" style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontFamily: 'monospace' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Product code (optional)</label>
          <input type="text" value={form.product_code} onChange={(e) => setForm({ ...form, product_code: e.target.value })} placeholder="leave blank to match any product" style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
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
