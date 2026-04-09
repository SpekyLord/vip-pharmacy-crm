import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpAccess from '../hooks/useErpAccess';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const MODULES = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inv' },
  { key: 'collections', label: 'Coll' },
  { key: 'expenses', label: 'Exp' },
  { key: 'reports', label: 'Rep' },
  { key: 'people', label: 'People' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'accounting', label: 'Acctg' },
  { key: 'purchasing', label: 'Purch' },
  { key: 'banking', label: 'Bank' },
  { key: 'sales_goals', label: 'Goals' },
];

const LEVEL_COLORS = {
  FULL: { bg: '#dcfce7', text: '#166534' },
  VIEW: { bg: '#dbeafe', text: '#1e40af' },
  NONE: { bg: '#f3f4f6', text: '#6b7280' },
};

const pageStyles = `
  .atm-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .atm-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .atm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
  .atm-header h2 { font-size: 20px; font-weight: 700; color: var(--erp-text, #1a1a2e); margin: 0; }
  .atm-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .atm-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 8px; text-align: center; font-size: 11px; font-weight: 600; color: var(--erp-muted, #64748b); }
  .atm-table th:first-child { text-align: left; padding-left: 14px; }
  .atm-table td { padding: 10px 8px; text-align: center; border-top: 1px solid var(--erp-border, #e5e7eb); }
  .atm-table td:first-child { text-align: left; padding-left: 14px; font-weight: 500; }
  .atm-table tr:hover { background: var(--erp-accent-soft, #f0f4ff); }
  .atm-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .atm-sys { font-size: 10px; color: #64748b; background: #f1f5f9; border-radius: 4px; padding: 1px 6px; margin-left: 6px; }
  .atm-btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .atm-btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .atm-btn-sm { padding: 4px 10px; font-size: 12px; }
  .atm-btn-danger { background: #fee2e2; color: #dc2626; }
  .atm-btn-outline { background: transparent; border: 1px solid var(--erp-border, #d1d5db); }
  .atm-actions { display: flex; gap: 4px; justify-content: center; }
  .atm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .atm-panel { background: var(--erp-panel, #fff); border-radius: 16px; padding: 24px; width: 95%; max-width: 700px; max-height: 85vh; overflow-y: auto; }
  .atm-panel h3 { margin: 0 0 16px; font-size: 16px; }
  .atm-field { margin-bottom: 12px; }
  .atm-field label { display: block; font-size: 12px; font-weight: 600; color: var(--erp-muted, #64748b); margin-bottom: 4px; }
  .atm-field input, .atm-field textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; box-sizing: border-box; }
  .atm-grid { display: grid; grid-template-columns: 1fr repeat(3, auto); gap: 4px 12px; align-items: center; margin: 12px 0; }
  .atm-grid-head { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-align: center; }
  .atm-grid label { font-size: 12px; text-align: center; cursor: pointer; }
  .atm-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .atm-check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 8px 0; }
  .atm-sub-section { background: var(--erp-accent-soft, #f0f4ff); border-radius: 8px; padding: 10px 14px; margin: 8px 0 16px; }
  .atm-sub-section h4 { font-size: 12px; font-weight: 600; color: var(--erp-muted, #64748b); margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; }
  .atm-sub-grid { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; }
  .atm-sub-grid span { font-size: 12px; }
  .atm-sub-all { font-size: 11px; color: var(--erp-accent, #1e5eff); cursor: pointer; text-decoration: underline; }
  .atm-sub-badge { font-size: 10px; color: #22c55e; font-weight: 500; margin-left: 8px; }
  @media(max-width: 768px) { .atm-main { padding: 12px; } .atm-table { font-size: 12px; } }
`;

export function AccessTemplateManagerContent() {
  const api = useErpAccess();
  const [templates, setTemplates] = useState([]);
  const [subPermKeys, setSubPermKeys] = useState({});
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ template_name: '', description: '', modules: {}, can_approve: false, sub_permissions: {} });

  const load = useCallback(async () => {
    try {
      const [tplRes, spkRes] = await Promise.all([
        api.getTemplates(),
        api.getSubPermissionKeys(),
      ]);
      setTemplates(tplRes?.data || []);
      setSubPermKeys(spkRes?.data || {});
    } catch (err) { console.error('[AccessTemplateManager] load error:', err.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ template_name: '', description: '', modules: {}, can_approve: false, sub_permissions: {} });
    setEditing('new');
  };

  const openEdit = (tpl) => {
    setForm({
      template_name: tpl.template_name,
      description: tpl.description || '',
      modules: { ...tpl.modules },
      can_approve: tpl.can_approve || false,
      sub_permissions: tpl.sub_permissions ? JSON.parse(JSON.stringify(tpl.sub_permissions)) : {},
    });
    setEditing(tpl);
  };

  const handleSave = async () => {
    try {
      if (editing === 'new') {
        await api.createTemplate(form);
      } else {
        await api.updateTemplate(editing._id, form);
      }
      setEditing(null);
      load();
    } catch (err) { showError(err, 'Could not save access template'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.deleteTemplate(id);
      load();
    } catch (err) { showError(err, 'Could not delete access template'); }
  };

  const setModuleLevel = (modKey, level) => {
    setForm(f => {
      const updated = { ...f, modules: { ...f.modules, [modKey]: level } };
      // Clear sub-permissions if module set to NONE
      if (level === 'NONE' && f.sub_permissions[modKey]) {
        const sp = { ...f.sub_permissions };
        delete sp[modKey];
        updated.sub_permissions = sp;
      }
      return updated;
    });
  };

  const toggleSubPerm = (modKey, subKey) => {
    setForm(f => {
      const sp = { ...f.sub_permissions };
      if (!sp[modKey]) sp[modKey] = {};
      sp[modKey] = { ...sp[modKey], [subKey]: !sp[modKey][subKey] };
      return { ...f, sub_permissions: sp };
    });
  };

  const selectAllSubs = (modKey, value) => {
    const keys = subPermKeys[modKey];
    if (!keys) return;
    setForm(f => {
      const sp = { ...f.sub_permissions };
      sp[modKey] = {};
      keys.forEach(k => { sp[modKey][k.key] = value; });
      return { ...f, sub_permissions: sp };
    });
  };

  // Count how many sub-perms are enabled for a template's module
  const subPermCount = (tpl, modKey) => {
    const subs = tpl.sub_permissions?.[modKey];
    if (!subs) return null;
    const total = subPermKeys[modKey]?.length || 0;
    const enabled = Object.values(subs).filter(Boolean).length;
    return total > 0 ? `${enabled}/${total}` : null;
  };

  return (
    <>
      <style>{pageStyles}</style>
          <div className="atm-header">
            <h2>ERP Access Templates</h2>
            <button className="atm-btn atm-btn-primary" onClick={openNew}>+ New Template</button>
          </div>

          <table className="atm-table">
            <thead>
              <tr>
                <th>Template</th>
                {MODULES.map(m => <th key={m.key}>{m.label}</th>)}
                <th>Approve</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(tpl => (
                <tr key={tpl._id}>
                  <td>
                    {tpl.template_name}
                    {tpl.is_system && <span className="atm-sys">SYSTEM</span>}
                  </td>
                  {MODULES.map(m => {
                    const lv = tpl.modules?.[m.key] || 'NONE';
                    const c = LEVEL_COLORS[lv];
                    const spc = subPermCount(tpl, m.key);
                    return (
                      <td key={m.key}>
                        <span className="atm-badge" style={{ background: c.bg, color: c.text }}>{lv}</span>
                        {spc && <span className="atm-sub-badge">{spc}</span>}
                      </td>
                    );
                  })}
                  <td>{tpl.can_approve ? '✓' : '—'}</td>
                  <td>
                    <div className="atm-actions">
                      {!tpl.is_system && (
                        <>
                          <button className="atm-btn atm-btn-sm atm-btn-outline" onClick={() => openEdit(tpl)}>Edit</button>
                          <button className="atm-btn atm-btn-sm atm-btn-danger" onClick={() => handleDelete(tpl._id)}>Del</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!templates.length && (
                <tr><td colSpan={MODULES.length + 3} style={{ textAlign: 'center', color: '#64748b', padding: 20 }}>No templates found</td></tr>
              )}
            </tbody>
          </table>

          {/* Edit/Create Modal */}
          {editing && (
            <div className="atm-modal" onClick={() => setEditing(null)}>
              <div className="atm-panel" onClick={e => e.stopPropagation()}>
                <h3>{editing === 'new' ? 'New Template' : `Edit: ${editing.template_name}`}</h3>
                <div className="atm-field">
                  <label>Template Name</label>
                  <input value={form.template_name} onChange={e => setForm(f => ({ ...f, template_name: e.target.value }))} />
                </div>
                <div className="atm-field">
                  <label>Description</label>
                  <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>

                <div className="atm-grid">
                  <div style={{ fontWeight: 600, fontSize: 12 }}>Module</div>
                  <div className="atm-grid-head">NONE</div>
                  <div className="atm-grid-head">VIEW</div>
                  <div className="atm-grid-head">FULL</div>
                  {MODULES.map(m => (
                    <React.Fragment key={m.key}>
                      <div style={{ fontSize: 13 }}>{m.label}</div>
                      {['NONE', 'VIEW', 'FULL'].map(lv => (
                        <label key={lv} style={{ textAlign: 'center' }}>
                          <input type="radio" name={`tpl-${m.key}`}
                            checked={(form.modules[m.key] || 'NONE') === lv}
                            onChange={() => setModuleLevel(m.key, lv)} />
                        </label>
                      ))}
                    </React.Fragment>
                  ))}
                </div>

                {/* Sub-Permissions for modules that have them and are VIEW or FULL */}
                {MODULES.filter(m => subPermKeys[m.key] && (form.modules[m.key] === 'VIEW' || form.modules[m.key] === 'FULL')).map(m => {
                  const keys = subPermKeys[m.key];
                  const modSubs = form.sub_permissions[m.key] || {};
                  const allEnabled = keys.every(k => modSubs[k.key]);
                  const hasAnySubs = Object.keys(modSubs).length > 0;
                  return (
                    <div key={m.key} className="atm-sub-section">
                      <h4>
                        <span>{m.label} — Sub-Permissions</span>
                        <span>
                          {!hasAnySubs && form.modules[m.key] === 'FULL' && (
                            <span style={{ fontSize: 11, color: '#22c55e', marginRight: 8 }}>All functions enabled</span>
                          )}
                          <span className="atm-sub-all" onClick={() => selectAllSubs(m.key, !allEnabled)}>
                            {allEnabled ? 'Deselect All' : 'Select All'}
                          </span>
                        </span>
                      </h4>
                      <div className="atm-sub-grid">
                        {keys.map(sk => (
                          <React.Fragment key={sk.key}>
                            <span>{sk.label}</span>
                            <label style={{ textAlign: 'center', cursor: 'pointer' }}>
                              <input type="checkbox"
                                checked={!!modSubs[sk.key]}
                                onChange={() => toggleSubPerm(m.key, sk.key)} />
                            </label>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="atm-check">
                  <input type="checkbox" checked={form.can_approve}
                    onChange={e => setForm(f => ({ ...f, can_approve: e.target.checked }))} />
                  <span>Can Approve</span>
                </div>

                <div className="atm-footer">
                  <button className="atm-btn atm-btn-outline" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="atm-btn atm-btn-primary" onClick={handleSave}>
                    {editing === 'new' ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}

export default function AccessTemplateManager() {
  return (
    <div className="admin-page erp-page atm-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="atm-main">
          <WorkflowGuide pageKey="access-templates" />
          <AccessTemplateManagerContent />
        </main>
      </div>
    </div>
  );
}
