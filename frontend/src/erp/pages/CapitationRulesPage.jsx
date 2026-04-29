/**
 * CapitationRulesPage — Phase VIP-1.B / Phase R1 (Apr 2026)
 *
 * Tier-B per-MD per-patient capitation rules. Same 3-gate (PARTNER +
 * agreement_date) as Tier-A. Excluded products view shows the active
 * MdProductRebate union for the same MD (computed at apply-time).
 *
 * Phase R1 (Apr 29 2026):
 *   - Surface labels updated to operator vocabulary:
 *       "Rule name" → "Program label"
 *       "Frequency window" → "Cadence"
 *   - Added "Online Pharmacy only — VIP-1.D" dependency banner so admin
 *     understands rules created here are dormant until VIP-1.D ships the
 *     storefront patient attribution + Order.paid listener.
 *   - Schema unchanged (no migration needed) — labels-only refresh.
 *
 * Route: /erp/capitation-rules
 */
import { useState, useEffect, useCallback } from 'react';
import { Heart, RefreshCw, Plus, X, AlertTriangle, Loader, Trash2, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import doctorService from '../../services/doctorService';
import rebateCommissionService from '../../erp/services/rebateCommissionService';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH') : '—';
const FREQ_LABEL = {
  PER_PATIENT_PER_MONTH: 'Monthly',
  PER_PATIENT_PER_QUARTER: 'Quarterly',
  PER_PATIENT_PER_YEAR: 'Annually',
  PER_ORDER: 'Every order',
};

export default function CapitationRulesPage() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filterActive, setFilterActive] = useState('true');
  const [excludedFor, setExcludedFor] = useState(null);
  const [excluded, setExcluded] = useState([]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = {};
      if (filterActive !== '') params.is_active = filterActive;
      const res = await rebateCommissionService.listCapitationRules(params);
      setRows(res?.data || []);
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setLoading(false); }
  }, [filterActive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    doctorService.getAll({ partnership_status: 'PARTNER', limit: 500 })
      .then(r => setPartners((r?.data || []).filter(d => d.partner_agreement_date)))
      .catch(() => setPartners([]));
  }, []);

  const onDeactivate = async (id, label) => {
    if (!window.confirm(`Deactivate "${label}"?`)) return;
    try { await rebateCommissionService.deactivateCapitationRule(id); toast.success('Deactivated'); load(); }
    catch (e) { toast.error(e?.response?.data?.message || e.message); }
  };

  const viewExcluded = async (rule) => {
    try {
      const res = await rebateCommissionService.getExcludedProducts(rule._id);
      setExcludedFor(rule);
      setExcluded(res?.products || []);
    } catch (e) { toast.error(e?.response?.data?.message || e.message); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ padding: 20, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          <PageGuide pageKey="capitation-rules" />

          {/* Phase R1 — VIP-1.D dependency banner. Capitation rules are
              dormant until the storefront patient attribution + Order.paid
              listener ships. Admins can stage rules now; the rebate engine
              picks them up automatically once VIP-1.D activates. */}
          <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#78350f' }}>
            <strong>Online Pharmacy only — activates with VIP-1.D.</strong> Capitation
            accruals fire on storefront <code>Order.paid</code> events via the patient ↔ MD
            attribution pipeline. Rules staged here are inert in the ERP until VIP-1.D
            ships the storefront listener. Tier-A (per-product) rebates are unaffected.
          </div>

          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              <Heart size={22} /> Tier-B MD Capitation Rules
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
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>MD</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Rule name</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Capitation</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Frequency</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Effective</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>{r.doctor ? `Dr. ${r.doctor.firstName} ${r.doctor.lastName}` : <span style={{ color: '#94a3b8' }}>(missing)</span>}</td>
                        <td style={{ padding: '10px 12px' }}>{r.rule_name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                          {r.capitation_amount > 0 ? `₱${r.capitation_amount.toLocaleString()}` : `${r.capitation_pct}%`}
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>{r.capitation_amount > 0 ? 'flat per patient' : 'of order net'}</div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>{FREQ_LABEL[r.frequency_window] || r.frequency_window}</td>
                        <td style={{ padding: '10px 12px' }}>{fmtDate(r.effective_from)} → {fmtDate(r.effective_to)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: r.is_active ? '#dcfce7' : '#f3f4f6', color: r.is_active ? '#15803d' : '#64748b' }}>{r.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <button onClick={() => viewExcluded(r)} title="View Tier-A excluded products" style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, marginRight: 4 }}>
                            <Eye size={12} /> Excluded
                          </button>
                          {r.is_active && (
                            <button onClick={() => onDeactivate(r._id, r.rule_name)} style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
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
      {showCreate && <CreateCapitationModal partners={partners} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {excludedFor && <ExcludedProductsModal rule={excludedFor} products={excluded} onClose={() => setExcludedFor(null)} />}
    </div>
  );
}

function CreateCapitationModal({ partners, onClose, onCreated }) {
  const [form, setForm] = useState({ doctor_id: '', rule_name: '', mode: 'AMOUNT', capitation_amount: 100, capitation_pct: 0, frequency_window: 'PER_PATIENT_PER_MONTH', effective_from: new Date().toISOString().slice(0, 10), notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setErr(null);
    try {
      const payload = {
        doctor_id: form.doctor_id,
        rule_name: form.rule_name,
        capitation_amount: form.mode === 'AMOUNT' ? Number(form.capitation_amount) : 0,
        capitation_pct: form.mode === 'PCT' ? Number(form.capitation_pct) : 0,
        frequency_window: form.frequency_window,
        effective_from: form.effective_from || new Date().toISOString(),
        notes: form.notes,
      };
      await rebateCommissionService.createCapitationRule(payload);
      toast.success('Capitation rule created'); onCreated();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onSubmit={onSubmit} style={{ background: '#fff', borderRadius: 8, padding: 24, width: '90%', maxWidth: 540 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add Capitation Rule</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </header>
        {err && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>MD (PARTNER + signed agreement)</label>
          <select value={form.doctor_id} onChange={(e) => setForm({ ...form, doctor_id: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <option value="">Select MD…</option>
            {partners.map(p => <option key={p._id} value={p._id}>Dr. {p.firstName} {p.lastName}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          {/* Phase R1: relabeled "Rule name" → "Program label" — operator
              vocabulary that matches how admin actually thinks about these. */}
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Program label</label>
          <input
            type="text"
            value={form.rule_name}
            onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
            required
            placeholder="e.g. Dr. Reyes — Diabetes panel (Q2 2026)"
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Mode</label>
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
              <option value="AMOUNT">Flat ₱ per patient</option>
              <option value="PCT">% of order net</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>{form.mode === 'AMOUNT' ? 'Amount (₱)' : 'Percent (%)'}</label>
            {form.mode === 'AMOUNT'
              ? <input type="number" min="0.01" step="0.01" value={form.capitation_amount} onChange={(e) => setForm({ ...form, capitation_amount: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
              : <input type="number" min="0.01" step="0.01" max="100" value={form.capitation_pct} onChange={(e) => setForm({ ...form, capitation_pct: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
            }
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {/* Phase R1: relabeled "Frequency window" → "Cadence". */}
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Cadence</label>
          <select value={form.frequency_window} onChange={(e) => setForm({ ...form, frequency_window: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Effective from</label>
          <input type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
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

function ExcludedProductsModal({ rule, products, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: '90%', maxWidth: 600 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Tier-A excluded products — {rule.rule_name}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </header>
        <p style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          These products have an active Tier-A rebate row for this MD and are EXCLUDED from capitation accrual to prevent double-pay.
        </p>
        {products.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No Tier-A overlap. Capitation applies to all qualifying patients.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#f1f5f9' }}>
              <tr>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Product</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tier-A %</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 12px' }}>{p.product_label || <span style={{ fontFamily: 'monospace' }}>{String(p.product_id).slice(-6)}</span>}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{p.rebate_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
