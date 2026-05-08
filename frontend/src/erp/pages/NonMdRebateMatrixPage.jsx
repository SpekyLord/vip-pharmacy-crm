/**
 * NonMdRebateMatrixPage — Phase VIP-1.B / Phase R1 (Apr 2026)
 *
 * Non-MD partner rebate matrix (pharmacist / purchaser / administrator /
 * other hospital staff). Match grain is per-(partner × hospital) only —
 * Phase R1 dropped the customer_id / product_code / priority dimensions.
 *
 * Phase R1 (Apr 29 2026):
 *   - Partner dropdown filters by `clientType != 'MD' AND
 *     partnership_status='PARTNER' AND partner_agreement_date IS NOT NULL`.
 *     MDs belong on the Tier-A form; this page is for non-MD stakeholders.
 *   - Hospital is REQUIRED. Sourced from the selected partner's
 *     Doctor.hospitals[] array (auto-fill if 1; pickable if multiple).
 *   - calculation_mode toggle (lookup-driven via NONMD_REBATE_CALC_MODE):
 *       * EXCLUDE_MD_COVERED (default, locked safe — no double-paying)
 *       * TOTAL_COLLECTION (admin opts in; doubles cost on MD overlap)
 *   - Multiple non-MD partners at the same hospital each earn full %
 *     independently per their own calculation_mode.
 *   - All accruals route to PRF/CALF (single-flow), bir_flag=INTERNAL even
 *     after disbursement — internal cost allocation, never on BIR P&L.
 *
 * Lookup-driven role gate: REBATE_ROLES.MANAGE_NONMD_MATRIX.
 *
 * Route: /erp/non-md-rebate-matrix
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, RefreshCw, Plus, X, AlertTriangle, Loader, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import doctorService from '../../services/doctorService';
import rebateCommissionService from '../../erp/services/rebateCommissionService';
import api from '../../services/api';
import { useLookupOptions } from '../hooks/useLookups';
// Phase E1 (May 2026) — entity scoping on the partner picker. Without this hook
// the partner dropdown leaked PARTNER doctors across every entity in the cluster
// (Doctor.find had no entity filter for admin-like roles, see CLAUDE.md Phase E1
// notes). We forward `workingEntityId` to `doctorService.getAll` and re-run the
// fetch on every entity switch so a multi-entity admin sees the right set.
import useWorkingEntity from '../../hooks/useWorkingEntity';

const fmtPct = (n) => `${(Number(n || 0)).toFixed(2)}%`;

// MD discriminator (matches RebateMatrixPage). 'MD' is the lookup CODE;
// 'Medical Doctor' is the lookup LABEL — accept either for back-compat.
function isMd(d) {
  return d?.clientType === 'MD' || d?.clientType === 'Medical Doctor';
}

// Inline fallback labels for NONMD_REBATE_CALC_MODE so the form never goes
// dark on a Lookup outage (Rule #3: schema enum is the validation gate;
// lookups drive UI labels). Subscribers can edit labels via Control Center
// without a code deploy.
const CALC_MODE_FALLBACK = {
  EXCLUDE_MD_COVERED: 'Exclude MD-covered lines (default — safe)',
  TOTAL_COLLECTION: 'Total collection (allows overlap with MD Tier-A)',
};

export default function NonMdRebateMatrixPage() {
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  // Phase R1 Apr-30 fix: switched from bespoke `api.get('/erp/lookup-values', {params:{category}})`
  // (404 — that route only matches path-segment `/:category`) to the canonical
  // useLookupOptions hook. Mirrors RebateMatrixPage / DoctorManagement / ClientAddModal pattern.
  // Adds 5-min entity-aware cache + auto-busts on entity switch — SaaS-tenant safe (Rule #0d).
  const { options: calcModes } = useLookupOptions('NONMD_REBATE_CALC_MODE');
  // Phase E1 — working-entity context. The list re-fetches on switch (the
  // backend list controller filters by req.entityId via tenantFilter; a switch
  // changes X-Entity-Id, so the response shape changes too). The picker
  // additionally forwards `entity_id` as a query param so the privileged
  // doctor-fetch in getAllDoctors applies the entity_ids ceiling (Rule #21
  // — privileged opt-in via explicit query param).
  const { workingEntityId } = useWorkingEntity();
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
    // Phase E1 — workingEntityId is a load dependency: switching entities must
    // refetch even though the X-Entity-Id header change happens automatically,
    // because React doesn't otherwise know the data is stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterActive, workingEntityId]);

  useEffect(() => { load(); }, [load]);

  // Phase R1 + E1: only NON-MDs (clientType != 'MD') with PARTNER + agreement_date,
  // scoped to the working entity (Phase E1) so the picker doesn't surface
  // doctors covered only in sibling entities.
  useEffect(() => {
    const params = { partnership_status: 'PARTNER', limit: 500 };
    if (workingEntityId) params.entity_id = workingEntityId;
    doctorService.getAll(params)
      .then(r => {
        const list = (r?.data || []).filter(d => !isMd(d) && d.partner_agreement_date);
        setPartners(list);
      })
      .catch(() => setPartners([]));
  }, [workingEntityId]);

  // Hospitals fetch — also entity-aware (the backend hospitalController scopes
  // by warehouse_ids ↔ entity for non-admin; admin still sees all but the
  // dependency makes the list a stable function of working-entity, which keeps
  // the partner.hospitals[] join consistent after a switch).
  useEffect(() => {
    api.get('/erp/hospitals', { params: { limit: 500 } })
      .then(r => setHospitals(r?.data?.data || r?.data || []))
      .catch(() => setHospitals([]));
  }, [workingEntityId]);

  const labelForCalcMode = useCallback((code) => {
    const found = calcModes.find(m => m.code === code);
    return found?.label || CALC_MODE_FALLBACK[code] || code;
  }, [calcModes]);

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
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Hospital</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Rebate %</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left' }}>Calculation Mode</th>
                      <th style={{ padding: '10px 12px', textAlign: 'center' }}>Status</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const hid = r.hospital_id?._id || r.hospital_id;
                      const h = hospitals.find(x => String(x._id) === String(hid));
                      const partnerType = r.partner?.clientType ? ` · ${r.partner.clientType}` : '';
                      return (
                        <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px 12px' }}>
                            {r.partner ? (
                              <>
                                {r.partner.firstName} {r.partner.lastName}
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                  {r.partner.partnership_status}{partnerType}
                                </div>
                              </>
                            ) : <span style={{ color: '#94a3b8' }}>(missing)</span>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {h ? (h.hospital_name || h.name) : (hid ? <span style={{ color: '#94a3b8' }}>{String(hid).slice(-6)}</span> : <span style={{ color: '#dc2626' }}>(unset)</span>)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtPct(r.rebate_pct)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: r.calculation_mode === 'TOTAL_COLLECTION' ? '#fef3c7' : '#e0f2fe', color: r.calculation_mode === 'TOTAL_COLLECTION' ? '#92400e' : '#075985' }}>
                              {labelForCalcMode(r.calculation_mode || 'EXCLUDE_MD_COVERED')}
                            </span>
                          </td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </main>
      </div>
      {showCreate && (
        <CreateNonMdModal
          partners={partners}
          hospitals={hospitals}
          calcModes={calcModes}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateNonMdModal({ partners, hospitals, calcModes, onClose, onCreated }) {
  const [form, setForm] = useState({
    partner_id: '',
    hospital_id: '',
    rebate_pct: 5,
    calculation_mode: 'EXCLUDE_MD_COVERED',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState(null);

  // Phase R1: Hospital options derived from selected partner's hospitals[].
  const selectedPartner = useMemo(() => partners.find(p => p._id === form.partner_id), [partners, form.partner_id]);
  const partnerHospitalOptions = useMemo(() => {
    if (!selectedPartner?.hospitals?.length) return [];
    return selectedPartner.hospitals
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
  }, [selectedPartner, hospitals]);

  // Auto-fill hospital_id when there is exactly one (and clear when partner changes).
  useEffect(() => {
    if (partnerHospitalOptions.length === 1) {
      setForm(f => ({ ...f, hospital_id: partnerHospitalOptions[0]._id }));
    } else if (partnerHospitalOptions.length === 0) {
      setForm(f => ({ ...f, hospital_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.partner_id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setErr(null);
    try {
      const payload = {
        partner_id: form.partner_id,
        hospital_id: form.hospital_id,
        rebate_pct: Number(form.rebate_pct),
        calculation_mode: form.calculation_mode,
        notes: form.notes,
        // Denormalize partner_name so the matrix UI can render fast without
        // an extra populate; the bridge re-resolves the live name on save.
        partner_name: selectedPartner ? `${selectedPartner.firstName || ''} ${selectedPartner.lastName || ''}`.trim() : undefined,
        rule_name: selectedPartner
          ? `${selectedPartner.firstName || ''} ${selectedPartner.lastName || ''} @ hospital`.trim()
          : 'Non-MD Rule',
      };
      await rebateCommissionService.createNonMdRule(payload);
      toast.success('Rule created'); onCreated();
    } catch (e) { setErr(e?.response?.data?.message || e.message); }
    finally { setSubmitting(false); }
  };

  // Lookup-driven labels with inline fallback.
  const calcModeChoices = (calcModes && calcModes.length)
    ? calcModes
    : Object.entries(CALC_MODE_FALLBACK).map(([code, label]) => ({ code, label }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onSubmit={onSubmit} style={{ background: '#fff', borderRadius: 8, padding: 24, width: '90%', maxWidth: 540 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Add Non-MD Partner Rule</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </header>
        {err && <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Non-MD Partner (PARTNER status with signed agreement)</label>
          <select value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}>
            <option value="">Select non-MD partner…</option>
            {partners.map(p => (
              <option key={p._id} value={p._id}>
                {p.firstName} {p.lastName}{p.clientType ? ` — ${p.clientType}` : ''}
              </option>
            ))}
          </select>
          {partners.length === 0 && (
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
              No non-MD PARTNERs with agreement_date. Promote via /admin/md-leads (clientType ≠ MD) first.
            </div>
          )}
        </div>

        {/* Phase R1: Hospital required, sourced from partner.hospitals[]. */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Hospital (Phase R1 — required)</label>
          <select
            value={form.hospital_id}
            onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}
            required
            disabled={!form.partner_id}
            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', background: !form.partner_id ? '#f8fafc' : '#fff' }}
          >
            <option value="">{form.partner_id ? 'Select hospital…' : 'Pick a partner first'}</option>
            {partnerHospitalOptions.map(h => (
              <option key={h._id} value={h._id}>
                {h.name}{h.is_primary ? ' (primary)' : ''}
              </option>
            ))}
          </select>
          {form.partner_id && partnerHospitalOptions.length === 0 && (
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>
              This partner has no hospital affiliations. Add at least one on the VIP Client profile first.
            </div>
          )}
          {partnerHospitalOptions.length === 1 && (
            <div style={{ fontSize: 11, color: '#0369a1', marginTop: 4 }}>
              Only hospital affiliation — auto-filled.
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Rebate %</label>
            <input type="number" min="0.01" max="100" step="0.01" value={form.rebate_pct} onChange={(e) => setForm({ ...form, rebate_pct: e.target.value })} required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Calculation Mode</label>
            <select
              value={form.calculation_mode}
              onChange={(e) => setForm({ ...form, calculation_mode: e.target.value })}
              required
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
            >
              {calcModeChoices.map(m => (
                <option key={m.code} value={m.code}>{m.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: form.calculation_mode === 'TOTAL_COLLECTION' ? '#92400e' : '#475569', marginTop: 4 }}>
              {form.calculation_mode === 'TOTAL_COLLECTION'
                ? '⚠ TOTAL_COLLECTION pays % of full net even if MD Tier-A also fires on the same products. Doubled cost is accepted only by explicit policy.'
                : 'Default — base = Σ collected lines NOT covered by MD Tier-A on the same hospital. Safe.'}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Notes (optional)</label>
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
