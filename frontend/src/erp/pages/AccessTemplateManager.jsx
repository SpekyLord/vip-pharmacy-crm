import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useErpAccess from '../hooks/useErpAccess';

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
  .atm-panel { background: var(--erp-panel, #fff); border-radius: 16px; padding: 24px; width: 95%; max-width: 600px; max-height: 85vh; overflow-y: auto; }
  .atm-panel h3 { margin: 0 0 16px; font-size: 16px; }
  .atm-field { margin-bottom: 12px; }
  .atm-field label { display: block; font-size: 12px; font-weight: 600; color: var(--erp-muted, #64748b); margin-bottom: 4px; }
  .atm-field input, .atm-field textarea { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; box-sizing: border-box; }
  .atm-grid { display: grid; grid-template-columns: 1fr repeat(3, auto); gap: 4px 12px; align-items: center; margin: 12px 0; }
  .atm-grid-head { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-align: center; }
  .atm-grid label { font-size: 12px; text-align: center; cursor: pointer; }
  .atm-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .atm-check { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 8px 0; }
  @media(max-width: 768px) { .atm-main { padding: 12px; } .atm-table { font-size: 12px; } }
`;

export default function AccessTemplateManager() {
  const api = useErpAccess();
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null | 'new' | template object
  const [form, setForm] = useState({ template_name: '', description: '', modules: {}, can_approve: false });

  const load = useCallback(async () => {
    try {
      const res = await api.getTemplates();
      setTemplates(res?.data || []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ template_name: '', description: '', modules: {}, can_approve: false });
    setEditing('new');
  };

  const openEdit = (tpl) => {
    setForm({
      template_name: tpl.template_name,
      description: tpl.description || '',
      modules: { ...tpl.modules },
      can_approve: tpl.can_approve || false,
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
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.deleteTemplate(id);
      load();
    } catch {}
  };

  return (
    <div className="admin-page erp-page atm-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="atm-main">
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
                    return (
                      <td key={m.key}>
                        <span className="atm-badge" style={{ background: c.bg, color: c.text }}>{lv}</span>
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
                            onChange={() => setForm(f => ({ ...f, modules: { ...f.modules, [m.key]: lv } }))} />
                        </label>
                      ))}
                    </React.Fragment>
                  ))}
                </div>

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
        </main>
      </div>
    </div>
  );
}
