/**
 * KpiLibrary — Phase 32
 *
 * Admin-friendly KPI Library form (SAP SuccessFactors pattern).
 * SMART goal creation for all functions. Manages KPI_CODE lookups
 * via a user-friendly form instead of raw JSON editing.
 *
 * Exports KpiLibraryContent for ControlCenter embedding.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { ROLE_SETS } from '../../constants/roles';
import useErpApi from '../hooks/useErpApi';
import { useLookupOptions } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';
import toast from 'react-hot-toast';

const DIRECTION_OPTIONS = [
  { value: 'higher_better', label: 'Higher is better' },
  { value: 'lower_better', label: 'Lower is better' },
];

const UNIT_OPTIONS = ['%', 'count', 'days', 'PHP', 'ratio', 'score'];

const COMPUTATION_OPTIONS = [
  { value: 'manual', label: 'Self-reported (manual)' },
  { value: 'auto', label: 'Auto-computed from ERP data' },
];

function KpiLibraryContent() {
  const { user } = useAuth();
  const api = useErpApi();
  const [searchParams] = useSearchParams();
  const { options: roleOptions } = useLookupOptions('FUNCTIONAL_ROLE');
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [kpis, setKpis] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterRole, setFilterRole] = useState(searchParams.get('role') || '');
  const [search, setSearch] = useState('');

  const FUNC_ROLES = useMemo(() => {
    if (roleOptions.length > 0) return [{ code: 'ALL', label: 'All Functions (Universal)' }, ...roleOptions];
    return [
      { code: 'ALL', label: 'All Functions (Universal)' },
      { code: 'PURCHASING', label: 'Purchasing' },
      { code: 'ACCOUNTING', label: 'Accounting' },
      { code: 'COLLECTIONS', label: 'Collections' },
      { code: 'INVENTORY', label: 'Inventory Management' },
      { code: 'SALES', label: 'Sales' },
      { code: 'ADMIN', label: 'Administration' },
      { code: 'AUDIT', label: 'Audit' },
      { code: 'PAYROLL', label: 'Payroll' },
      { code: 'LOGISTICS', label: 'Logistics & Distribution' },
    ];
  }, [roleOptions]);

  const defaultForm = {
    code: '', label: '', metadata: {
      description: '', unit: '%', direction: 'higher_better',
      computation: 'manual', functional_roles: ['ALL'], default_target: '',
    },
  };
  const [form, setForm] = useState(defaultForm);

  // ─── Load KPIs ────────────────────────
  const loadKpis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/lookup-values/KPI_CODE');
      setKpis(res.data || []);
    } catch (e) { showError(e); }
    setLoading(false);
  }, [api.get]);

  useEffect(() => { loadKpis(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered list ────────────────────
  const filteredKpis = useMemo(() => {
    let list = kpis;
    if (filterRole) {
      list = list.filter(k => {
        const fr = k.metadata?.functional_roles;
        if (!fr) return false;
        return fr.includes(filterRole) || fr.includes('ALL');
      });
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(k => k.label.toLowerCase().includes(s) || k.code.toLowerCase().includes(s) ||
        (k.metadata?.description || '').toLowerCase().includes(s));
    }
    return list;
  }, [kpis, filterRole, search]);

  // ─── Group by function ────────────────
  const grouped = useMemo(() => {
    const groups = {};
    filteredKpis.forEach(k => {
      const roles = k.metadata?.functional_roles || ['UNASSIGNED'];
      roles.forEach(r => {
        if (!groups[r]) groups[r] = [];
        groups[r].push(k);
      });
    });
    return groups;
  }, [filteredKpis]);

  // ─── Save KPI ─────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.label.trim()) {
      toast.error('KPI Code and Name are required');
      return;
    }

    try {
      const payload = {
        code: form.code.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        label: form.label,
        metadata: {
          ...form.metadata,
          default_target: form.metadata.default_target ? Number(form.metadata.default_target) : null,
        },
      };

      if (editing) {
        await api.put(`/lookup-values/KPI_CODE/${editing._id}`, payload);
        toast.success('KPI updated');
      } else {
        await api.post('/lookup-values/KPI_CODE', payload);
        toast.success('KPI created');
      }

      setShowForm(false);
      setEditing(null);
      setForm(defaultForm);
      loadKpis();
    } catch (e) { showError(e); }
  };

  const openEdit = (kpi) => {
    setEditing(kpi);
    setForm({
      code: kpi.code,
      label: kpi.label,
      metadata: {
        description: kpi.metadata?.description || '',
        unit: kpi.metadata?.unit || '%',
        direction: kpi.metadata?.direction || 'higher_better',
        computation: kpi.metadata?.computation || 'manual',
        functional_roles: kpi.metadata?.functional_roles || ['ALL'],
        default_target: kpi.metadata?.default_target || '',
      },
    });
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm(defaultForm);
    setShowForm(true);
  };

  const toggleRole = (code) => {
    setForm(prev => {
      const roles = prev.metadata.functional_roles || [];
      if (code === 'ALL') return { ...prev, metadata: { ...prev.metadata, functional_roles: ['ALL'] } };
      const next = roles.filter(r => r !== 'ALL');
      return {
        ...prev,
        metadata: {
          ...prev.metadata,
          functional_roles: next.includes(code) ? next.filter(r => r !== code) : [...next, code],
        },
      };
    });
  };

  const directionBadge = (d) => d === 'higher_better'
    ? <span style={{ color: '#166534', fontSize: 11 }}>▲ Higher</span>
    : <span style={{ color: '#991b1b', fontSize: 11 }}>▼ Lower</span>;

  const roleBadge = (r) => {
    const label = FUNC_ROLES.find(f => f.code === r)?.label || r;
    const isAll = r === 'ALL';
    return (
      <span key={r} style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, marginRight: 4, marginBottom: 2,
        background: isAll ? '#dbeafe' : '#f0fdf4', color: isAll ? '#1e40af' : '#166534', fontWeight: 500,
      }}>{label}</span>
    );
  };

  // ═══ RENDER ═══
  return (
    <div style={{ padding: 0 }}>
      <WorkflowGuide pageKey="kpiLibrary" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>KPI Library</h2>
        {isAdmin && (
          <button onClick={openNew} style={{
            padding: '8px 16px', background: 'var(--erp-accent, #1e5eff)', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
          }}>+ New KPI</button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Search KPIs..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, minWidth: 200 }}
        />
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
          <option value="">All Functions</option>
          {FUNC_ROLES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
          {filteredKpis.length} KPI{filteredKpis.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* KPI List grouped by function */}
      {loading ? <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>Loading KPIs...</div> : (
        Object.keys(grouped).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>No KPIs found. {isAdmin && 'Click "+ New KPI" to create one.'}</div>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a === 'ALL' ? 1 : b === 'ALL' ? -1 : a.localeCompare(b)).map(([role, items]) => (
            <div key={role} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {FUNC_ROLES.find(f => f.code === role)?.label || role} ({items.length})
              </h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map(kpi => (
                  <div key={kpi._id} style={{
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{kpi.label}</div>
                      {kpi.metadata?.description && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, lineHeight: 1.4 }}>
                          {kpi.metadata.description}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 3 }}>
                          {kpi.metadata?.unit || '—'}
                        </span>
                        {directionBadge(kpi.metadata?.direction)}
                        <span style={{ fontSize: 11, color: '#6b7280' }}>
                          {kpi.metadata?.computation === 'auto' ? '⚡ Auto' : '✍ Manual'}
                        </span>
                        {kpi.metadata?.default_target != null && (
                          <span style={{ fontSize: 11, color: '#6b7280' }}>Target: {kpi.metadata.default_target}</span>
                        )}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {(kpi.metadata?.functional_roles || []).map(r => roleBadge(r))}
                      </div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => openEdit(kpi)} style={{
                        padding: '4px 12px', background: '#f3f4f6', border: '1px solid #d1d5db',
                        borderRadius: 4, cursor: 'pointer', fontSize: 12, flexShrink: 0,
                      }}>Edit</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowForm(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560,
            maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>
              {editing ? 'Edit KPI' : 'New KPI'}
            </h3>
            <form onSubmit={handleSave}>
              {/* KPI Code */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>KPI Code</label>
                <input
                  value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                  disabled={!!editing} placeholder="e.g., PO_PROCESSING_TIME"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: editing ? '#f9fafb' : '#fff' }}
                />
              </div>

              {/* KPI Name */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>KPI Name</label>
                <input
                  value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g., PO Processing Time (days)"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Description (SMART sentence) */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>
                  Description <span style={{ fontWeight: 400, color: '#6b7280' }}>(SMART goal sentence)</span>
                </label>
                <textarea
                  value={form.metadata.description}
                  onChange={e => setForm(p => ({ ...p, metadata: { ...p.metadata, description: e.target.value } }))}
                  placeholder="e.g., Process all purchase orders within 3 business days of receipt"
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                />
              </div>

              {/* Row: Unit + Direction + Computation */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Unit</label>
                  <select value={form.metadata.unit}
                    onChange={e => setForm(p => ({ ...p, metadata: { ...p.metadata, unit: e.target.value } }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Direction</label>
                  <select value={form.metadata.direction}
                    onChange={e => setForm(p => ({ ...p, metadata: { ...p.metadata, direction: e.target.value } }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    {DIRECTION_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>How measured</label>
                  <select value={form.metadata.computation}
                    onChange={e => setForm(p => ({ ...p, metadata: { ...p.metadata, computation: e.target.value } }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                    {COMPUTATION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Default Target */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Default Target</label>
                <input
                  type="number" value={form.metadata.default_target}
                  onChange={e => setForm(p => ({ ...p, metadata: { ...p.metadata, default_target: e.target.value } }))}
                  placeholder="Optional — e.g., 3"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Function Assignment */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Assign to Function(s)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {FUNC_ROLES.map(r => {
                    const sel = (form.metadata.functional_roles || []).includes(r.code);
                    return (
                      <button key={r.code} type="button" onClick={() => toggleRole(r.code)} style={{
                        padding: '4px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid',
                        background: sel ? (r.code === 'ALL' ? '#dbeafe' : '#dcfce7') : '#fff',
                        borderColor: sel ? (r.code === 'ALL' ? '#93c5fd' : '#86efac') : '#d1d5db',
                        color: sel ? (r.code === 'ALL' ? '#1e40af' : '#166534') : '#6b7280',
                        fontWeight: sel ? 600 : 400,
                      }}>{r.label}</button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={{
                  padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db',
                  borderRadius: 6, cursor: 'pointer', fontSize: 13,
                }}>Cancel</button>
                <button type="submit" style={{
                  padding: '8px 20px', background: 'var(--erp-accent, #1e5eff)', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}>{editing ? 'Update KPI' : 'Create KPI'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ Standalone Page Wrapper ═══
export default function KpiLibrary() {
  return (
    <div className="erp-page">
      <Navbar />
      <div className="erp-layout">
        <Sidebar />
        <main className="erp-main" style={{ padding: 24 }}>
          <KpiLibraryContent />
        </main>
      </div>
    </div>
  );
}

export { KpiLibraryContent };
