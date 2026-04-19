/**
 * KpiTemplateManager — Phase SG-3R
 *
 * Admin/President curates reusable KPI target defaults. Plan creation opts in
 * via `template_id` or `template_name` in the POST /sales-goals/plans body.
 * Completely lookup-driven: driver_code (GROWTH_DRIVER), kpi_code (KPI_CODE),
 * unit_code (KPI_UNIT), computation (KPI_COMPUTATION), direction (KPI_DIRECTION).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useSalesGoals from '../hooks/useSalesGoals';
import { useLookupBatch } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

const styles = `
  .ktm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ktm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .ktm-header { margin-bottom: 16px; }
  .ktm-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .ktm-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .ktm-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .ktm-actions { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
  .ktm-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .ktm-btn-primary { background: var(--erp-accent, #2563eb); color: white; }
  .ktm-btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .ktm-btn-danger { background: #ef4444; color: white; }
  .ktm-btn-sm { padding: 4px 10px; font-size: 12px; }
  .ktm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ktm-input, .ktm-select { padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); }
  .ktm-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; }
  .ktm-field label { font-size: 12px; font-weight: 600; color: var(--erp-muted); }
  .ktm-row { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .ktm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ktm-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; color: var(--erp-text); white-space: nowrap; }
  .ktm-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); }
  .ktm-set-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; padding: 8px 12px; background: var(--erp-accent-soft, #eef2ff); border-radius: 8px; }
  .ktm-set-header h3 { margin: 0; font-size: 14px; font-weight: 700; color: var(--erp-text); }
  .ktm-set-meta { font-size: 12px; color: var(--erp-muted); }
  .ktm-empty { text-align: center; padding: 40px 20px; color: var(--erp-muted); }
  .ktm-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; background: var(--erp-accent-soft, #eef2ff); color: var(--erp-accent, #2563eb); }
  @media(max-width: 768px) {
    .ktm-main { padding: 12px; }
    .ktm-row { flex-direction: column; }
    .ktm-table { font-size: 12px; }
    .ktm-table th, .ktm-table td { padding: 6px 8px; }
  }
  @media(max-width: 360px) {
    .ktm-main { padding: 8px; }
    .ktm-header h1 { font-size: 18px; }
    .ktm-btn { width: 100%; padding: 10px; font-size: 13px; }
    .ktm-actions { flex-direction: column; align-items: stretch; }
  }
`;

const blankRow = () => ({
  template_name: '',
  driver_code: '',
  kpi_code: '',
  kpi_label: '',
  default_target: 0,
  unit_code: '',
  computation: 'manual',
  direction: 'higher_better',
  sort_order: 0,
  description: '',
  is_active: true,
});

export default function KpiTemplateManager() {
  const { user } = useAuth();
  const sg = useSalesGoals();
  const { data: lookups } = useLookupBatch(['GROWTH_DRIVER', 'KPI_CODE', 'KPI_UNIT', 'KPI_COMPUTATION', 'KPI_DIRECTION']);
  const driverOptions = lookups.GROWTH_DRIVER || [];
  const kpiOptions = lookups.KPI_CODE || [];
  const unitOptions = lookups.KPI_UNIT || [];
  const computationOptions = lookups.KPI_COMPUTATION || [];
  const directionOptions = lookups.KPI_DIRECTION || [];

  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  const [sets, setSets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankRow());
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sg.listKpiTemplates();
      setSets(res?.data?.sets || []);
    } catch (e) {
      showError(e, 'Failed to load KPI templates');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-fill kpi_label / unit when kpi_code picked
  const onPickKpiCode = (code) => {
    const k = kpiOptions.find(x => x.code === code);
    setForm(f => ({
      ...f,
      kpi_code: code,
      kpi_label: f.kpi_label || k?.label || '',
      unit_code: f.unit_code || k?.metadata?.unit || '',
      direction: f.direction || k?.metadata?.direction || 'higher_better',
      computation: f.computation || k?.metadata?.computation || 'manual',
    }));
  };

  const onSave = async () => {
    if (!form.template_name || !form.driver_code || !form.kpi_code) {
      showError(null, 'Template name, driver, and KPI code are all required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await sg.updateKpiTemplate(editingId, form);
        showSuccess('Template row updated');
      } else {
        await sg.createKpiTemplate(form);
        showSuccess('Template row created');
      }
      setForm(blankRow());
      setEditingId(null);
      await load();
    } catch (e) {
      showError(e, 'Failed to save template row');
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditingId(row._id);
    setForm({
      template_name: row.template_name || '',
      driver_code: row.driver_code || '',
      kpi_code: row.kpi_code || '',
      kpi_label: row.kpi_label || '',
      default_target: row.default_target || 0,
      unit_code: row.unit_code || '',
      computation: row.computation || 'manual',
      direction: row.direction || 'higher_better',
      sort_order: row.sort_order || 0,
      description: row.description || '',
      is_active: row.is_active !== false,
    });
  };

  const onDeleteRow = async (row) => {
    if (!window.confirm(`Delete template row "${row.kpi_code}" from set "${row.template_name}"?`)) return;
    try {
      await sg.deleteKpiTemplate(row._id);
      showSuccess('Row deleted');
      await load();
    } catch (e) {
      showError(e, 'Failed to delete row');
    }
  };

  const onDeleteSet = async (name) => {
    if (!window.confirm(`Delete the entire template set "${name}"? This removes every KPI row in it. The action is audit-logged.`)) return;
    try {
      const res = await sg.deleteKpiTemplateSet(name);
      showSuccess(res?.message || 'Template set deleted');
      await load();
    } catch (e) {
      showError(e, 'Failed to delete template set');
    }
  };

  const cancel = () => {
    setForm(blankRow());
    setEditingId(null);
  };

  const totalRows = useMemo(() => sets.reduce((s, g) => s + (g.kpi_count || 0), 0), [sets]);

  return (
    <div className="ktm-page" style={{ display: 'flex', minHeight: '100vh' }}>
      <style>{styles}</style>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="ktm-main">
          <div className="ktm-header">
            <h1>KPI Template Library</h1>
            <p>
              Curate reusable KPI target defaults per entity. Plan creation can pre-populate growth-driver KPIs
              from a template — no retyping when you spin up next year&#39;s plan or a new subsidiary.
            </p>
          </div>

          <WorkflowGuide pageKey="kpiTemplateManager" />

          {isAdmin && (
            <div className="ktm-panel">
              <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>{editingId ? 'Edit Template Row' : 'Add Template Row'}</h3>
              <div className="ktm-row">
                <div className="ktm-field">
                  <label>Template set name *</label>
                  <input
                    className="ktm-input"
                    placeholder="e.g. VIP FY2026 Base"
                    value={form.template_name}
                    onChange={(e) => setForm(f => ({ ...f, template_name: e.target.value }))}
                  />
                </div>
                <div className="ktm-field">
                  <label>Driver *</label>
                  <select
                    className="ktm-select"
                    value={form.driver_code}
                    onChange={(e) => setForm(f => ({ ...f, driver_code: e.target.value }))}
                  >
                    <option value="">— select driver —</option>
                    {driverOptions.map(d => <option key={d.code} value={d.code}>{d.label || d.code}</option>)}
                  </select>
                </div>
                <div className="ktm-field">
                  <label>KPI code *</label>
                  <select
                    className="ktm-select"
                    value={form.kpi_code}
                    onChange={(e) => onPickKpiCode(e.target.value)}
                  >
                    <option value="">— select KPI —</option>
                    {kpiOptions.map(k => <option key={k.code} value={k.code}>{k.label || k.code}</option>)}
                  </select>
                </div>
              </div>

              <div className="ktm-row">
                <div className="ktm-field">
                  <label>Label override</label>
                  <input className="ktm-input" value={form.kpi_label} onChange={(e) => setForm(f => ({ ...f, kpi_label: e.target.value }))} />
                </div>
                <div className="ktm-field">
                  <label>Default target</label>
                  <input
                    className="ktm-input"
                    type="number"
                    value={form.default_target}
                    onChange={(e) => setForm(f => ({ ...f, default_target: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="ktm-field">
                  <label>Unit</label>
                  <select className="ktm-select" value={form.unit_code} onChange={(e) => setForm(f => ({ ...f, unit_code: e.target.value }))}>
                    <option value="">—</option>
                    {unitOptions.map(u => <option key={u.code} value={u.code}>{u.label || u.code}</option>)}
                  </select>
                </div>
              </div>

              <div className="ktm-row">
                <div className="ktm-field">
                  <label>Computation</label>
                  <select className="ktm-select" value={form.computation} onChange={(e) => setForm(f => ({ ...f, computation: e.target.value }))}>
                    {computationOptions.length === 0 && (<><option value="manual">manual</option><option value="auto">auto</option></>)}
                    {computationOptions.map(c => <option key={c.code} value={c.code}>{c.label || c.code}</option>)}
                  </select>
                </div>
                <div className="ktm-field">
                  <label>Direction</label>
                  <select className="ktm-select" value={form.direction} onChange={(e) => setForm(f => ({ ...f, direction: e.target.value }))}>
                    {directionOptions.length === 0 && (<><option value="higher_better">higher is better</option><option value="lower_better">lower is better</option></>)}
                    {directionOptions.map(d => <option key={d.code} value={d.code}>{d.label || d.code}</option>)}
                  </select>
                </div>
                <div className="ktm-field">
                  <label>Sort order</label>
                  <input className="ktm-input" type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))} />
                </div>
              </div>

              <div className="ktm-row">
                <div className="ktm-field" style={{ flex: 2 }}>
                  <label>Description (admin notes, optional)</label>
                  <input className="ktm-input" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="ktm-field" style={{ alignSelf: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active
                  </label>
                </div>
              </div>

              <div className="ktm-actions" style={{ marginTop: 8, marginBottom: 0 }}>
                <button className="ktm-btn ktm-btn-primary" onClick={onSave} disabled={saving}>
                  {saving ? 'Saving…' : (editingId ? 'Save changes' : 'Add row')}
                </button>
                {editingId && <button className="ktm-btn ktm-btn-outline" onClick={cancel}>Cancel</button>}
              </div>
            </div>
          )}

          {loading && <div className="ktm-panel ktm-empty">Loading templates…</div>}

          {!loading && sets.length === 0 && (
            <div className="ktm-panel ktm-empty">
              No templates yet. Create a row above to bootstrap a reusable defaults set (e.g. &quot;VIP FY2026 Base&quot;).
            </div>
          )}

          {!loading && sets.map(set => (
            <div key={set.template_name} className="ktm-panel">
              <div className="ktm-set-header">
                <div>
                  <h3>{set.template_name}</h3>
                  <div className="ktm-set-meta">{set.driver_count} driver(s) · {set.kpi_count} KPI row(s)</div>
                </div>
                {isAdmin && (
                  <button className="ktm-btn ktm-btn-danger ktm-btn-sm" onClick={() => onDeleteSet(set.template_name)}>
                    Delete set
                  </button>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="ktm-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>KPI</th>
                      <th>Label</th>
                      <th style={{ textAlign: 'right' }}>Target</th>
                      <th>Unit</th>
                      <th>Computation</th>
                      <th>Direction</th>
                      <th>Active</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {set.rows.map(r => (
                      <tr key={r._id}>
                        <td><span className="ktm-tag">{r.driver_code}</span></td>
                        <td>{r.kpi_code}</td>
                        <td>{r.kpi_label}</td>
                        <td style={{ textAlign: 'right' }}>{r.default_target}</td>
                        <td>{r.unit_code || '—'}</td>
                        <td>{r.computation}</td>
                        <td>{r.direction}</td>
                        <td>{r.is_active ? 'Yes' : 'No'}</td>
                        {isAdmin && (
                          <td>
                            <button className="ktm-btn ktm-btn-outline ktm-btn-sm" onClick={() => onEdit(r)} style={{ marginRight: 6 }}>Edit</button>
                            <button className="ktm-btn ktm-btn-danger ktm-btn-sm" onClick={() => onDeleteRow(r)}>Delete</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="ktm-panel" style={{ fontSize: 12, color: 'var(--erp-muted)' }}>
            <strong>Total rows:</strong> {totalRows}. To apply a template when creating a plan, send{' '}
            <code>template_name</code> (or <code>template_id</code>) in the POST <code>/sales-goals/plans</code> body.
            Pass <code>use_driver_defaults: true</code> to additionally seed KPIs from each driver&#39;s{' '}
            <code>GROWTH_DRIVER.metadata.default_kpi_codes</code>. Templates are advisory only — the plan owns its
            own copy after creation, so editing templates here never mutates existing plans.
          </div>
        </main>
      </div>
    </div>
  );
}
