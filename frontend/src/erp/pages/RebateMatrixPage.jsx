/**
 * RebateMatrixPage — Phase VIP-1.B / Phase R1 (Apr 2026)
 *
 * Tier-A MD per-(MD × hospital × product) rebate matrix administration.
 * Lists active + inactive MdProductRebate rows with Doctor + Hospital +
 * ProductMaster enrichment, filter by PARTNER status.
 *
 * Phase R1 (Apr 29 2026):
 *   - hospital_id required on every rule (same MD at different hospitals
 *     routinely has different rates — separate MOA per institution).
 *   - Hospital dropdown is sourced from the selected MD's `hospitals[]`
 *     array (auto-fill if exactly 1; pickable if multiple). No standalone
 *     hospital input — admin maintains MD↔hospital affiliations on the
 *     VIP Client profile.
 *   - Product dropdown swaps from CRM `productService` (storefront DB) to
 *     ERP `useProducts()` (ProductMaster — full hospital distribution
 *     catalog). Label uses brand_name + generic_name + dosage_strength
 *     per Rule #4.
 *   - MD-only filter: `clientType='MD' AND partnership_status='PARTNER'
 *     AND partner_agreement_date IS NOT NULL`. Pharmacists, purchasers,
 *     administrators belong on the Non-MD form.
 *   - All MD Tier-A rebates route to PRF/CALF (single-flow design,
 *     bir_flag=INTERNAL even after disbursement; PRC Code of Ethics
 *     guardrail). No payout_mode dropdown — see CLAUDE.md SaaS Spin-Out
 *     Scope section.
 *
 * Route: /erp/rebate-matrix
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Handshake, RefreshCw, Plus, X, AlertTriangle, Loader, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import doctorService from '../../services/doctorService';
import useProducts from '../hooks/useProducts';
import rebateCommissionService from '../../erp/services/rebateCommissionService';
import api from '../../services/api';

// Phase R1: ERP ProductMaster shape (brand_name + generic_name + dosage_strength)
// per Rule #4 (full identifier, never just brand_name).
function formatProductLabel(p) {
  if (!p) return '';
  const brand = p.brand_name || p.name || '';
  const generic = p.generic_name ? ` (${p.generic_name})` : (p.genericName ? ` (${p.genericName})` : '');
  const dosage = p.dosage_strength ? ` ${p.dosage_strength}` : (p.dosage ? ` ${p.dosage}` : '');
  return `${brand}${generic}${dosage}`.trim();
}

// MD discriminator. The Doctor model stores the lookup CODE (default 'MD');
// the lookup LABEL is 'Medical Doctor'. Treat both as MD for back-compat.
function isMd(d) {
  return d?.clientType === 'MD' || d?.clientType === 'Medical Doctor';
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
  const [hospitals, setHospitals] = useState([]);
  const { products } = useProducts();

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

  // Phase R1: only MDs (clientType='MD') with PARTNER + agreement_date.
  // Pharmacists, purchasers, administrators belong on the Non-MD form.
  const loadPartners = useCallback(async () => {
    try {
      const res = await doctorService.getAll({ partnership_status: 'PARTNER', limit: 500 });
      const list = (res?.data || []).filter(d => isMd(d) && d.partner_agreement_date);
      setPartnerDoctors(list);
    } catch (err) {
      console.warn('Failed to load PARTNER MDs:', err.message);
      setPartnerDoctors([]);
    }
  }, []);

  // Phase R1: pre-load hospitals so the MD's hospitals[] array can be
  // resolved to readable names in the dropdown.
  const loadHospitals = useCallback(async () => {
    try {
      const res = await api.get('/erp/hospitals', { params: { limit: 500 } });
      setHospitals(res?.data?.data || res?.data || []);
    } catch (err) {
      console.warn('Failed to load hospitals:', err.message);
      setHospitals([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadPartners(); }, [loadPartners]);
  useEffect(() => { loadHospitals(); }, [loadHospitals]);

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
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Hospital</th>
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
                      <td style={{ padding: '10px 12px' }}>
                        {(() => {
                          const hid = r.hospital_id?._id || r.hospital_id;
                          const h = hospitals.find(x => String(x._id) === String(hid));
                          if (h) return h.hospital_name || h.name || '—';
                          return hid ? <span style={{ color: '#94a3b8' }}>{String(hid).slice(-6)}</span> : <span style={{ color: '#dc2626' }}>(unset)</span>;
                        })()}
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
          hospitals={hospitals}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateRebateModal({ partners, products, hospitals, onClose, onCreated }) {
  const [form, setForm] = useState({
    doctor_id: '',
    hospital_id: '',
    product_id: '',
    product_label: '',
    rebate_pct: 5,
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  // Phase R1: Hospital options derived from the selected MD's hospitals[].
  // Auto-fill if exactly one; pickable otherwise.
  const selectedMd = useMemo(() => partners.find(p => p._id === form.doctor_id), [partners, form.doctor_id]);
  const mdHospitalOptions = useMemo(() => {
    if (!selectedMd?.hospitals?.length) return [];
    return selectedMd.hospitals
      .map(h => {
        const hid = h.hospital_id?._id || h.hospital_id;
        const full = hospitals.find(x => String(x._id) === String(hid));
        return {
          _id: hid,
          name: full?.hospital_name || full?.name || (hid ? `Hospital ${String(hid).slice(-6)}` : '(unknown)'),
          is_primary: !!h.is_primary,
        };
      })
      .filter(o => o._id);
  }, [selectedMd, hospitals]);

  // Auto-fill hospital_id when there is exactly one (and clear when MD changes).
  useEffect(() => {
    if (mdHospitalOptions.length === 1) {
      setForm(f => ({ ...f, hospital_id: mdHospitalOptions[0]._id }));
    } else if (mdHospitalOptions.length === 0) {
      setForm(f => ({ ...f, hospital_id: '' }));
    }
    // multiple → leave the user to pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.doctor_id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      const payload = {
        doctor_id: form.doctor_id,
        hospital_id: form.hospital_id,
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

        {/* Phase R1: Hospital is REQUIRED. Sourced from selected MD's hospitals[].
            Auto-fills when there is exactly 1; pickable otherwise. If the MD has
            no hospitals[], admin must add one on the VIP Client profile first. */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Hospital (Phase R1 — required)</label>
          <select
            value={form.hospital_id}
            onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}
            required
            disabled={!form.doctor_id}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', background: !form.doctor_id ? '#f8fafc' : '#fff' }}
          >
            <option value="">{form.doctor_id ? 'Select hospital…' : 'Pick an MD first'}</option>
            {mdHospitalOptions.map(h => (
              <option key={h._id} value={h._id}>
                {h.name}{h.is_primary ? ' (primary)' : ''}
              </option>
            ))}
          </select>
          {form.doctor_id && mdHospitalOptions.length === 0 && (
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
              This MD has no hospital affiliations. Add at least one on the VIP Client profile before creating a Tier-A rule.
            </div>
          )}
          {mdHospitalOptions.length === 1 && (
            <div style={{ fontSize: 11, color: '#0369a1', marginTop: 4 }}>
              Only hospital affiliation — auto-filled. Add more on the VIP Client profile if the MD also serves elsewhere.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 4 }}>Product (ProductMaster — brand + generic + dosage)</label>
            <select
              value={form.product_id}
              onChange={(e) => {
                const pid = e.target.value;
                const p = products.find(x => x._id === pid);
                // Auto-fill product_label from ProductMaster (Phase R1: ERP catalog,
                // not CRM storefront). Rule #4: brand + generic + dosage.
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
                No products loaded. Confirm /erp/product-master has rows for this entity.
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
