/**
 * Cost Centers Page — Phase 15.5
 * Cost center master with tree view and CRUD
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';

import SelectField from '../../components/common/Select';

const pageStyles = `
  .cc-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .cc-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1000px; margin: 0 auto; }
  .cc-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .cc-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .form-row { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: flex-end; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input, .form-group select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-inactive { background: #e2e8f0; color: #475569; }
  .tree-node { padding-left: 0; }
  .tree-node .tree-node { padding-left: 24px; }
  .tree-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--erp-border); font-size: 13px; }
  .tree-item:hover { background: var(--erp-accent-soft); }
  .tree-code { font-weight: 700; color: var(--erp-accent); min-width: 120px; }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  @media(max-width: 768px) { .cc-main { padding: 12px; } .form-row { flex-direction: column; } }
`;

function TreeView({ nodes, onToggle }) {
  if (!nodes || nodes.length === 0) return null;
  return (
    <div className="tree-node">
      {nodes.map(n => (
        <div key={n._id}>
          <div className="tree-item">
            <span className="tree-code">{n.code}</span>
            <span style={{ flex: 1 }}>{n.name}</span>
            <span className={`badge badge-${n.is_active ? 'active' : 'inactive'}`}>{n.is_active ? 'Active' : 'Inactive'}</span>
            {onToggle && (
              <button className="btn btn-sm" onClick={() => onToggle(n._id, !n.is_active)}>
                {n.is_active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
          {n.children && n.children.length > 0 && <TreeView nodes={n.children} onToggle={onToggle} />}
        </div>
      ))}
    </div>
  );
}

export default function CostCenters() {
  const { user } = useAuth();
  const rpt = useReports();
  const [tree, setTree] = useState([]);
  const [flatList, setFlatList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', parent_cost_center: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [treeRes, listRes] = await Promise.all([rpt.getCostCenterTree(), rpt.getCostCenters({ include_inactive: true })]);
      setTree(treeRes?.data || []);
      setFlatList(listRes?.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.code || !form.name) return;
    try {
      await rpt.createCostCenter(form);
      setForm({ code: '', name: '', parent_cost_center: '', description: '' });
      load();
    } catch {}
  };

  const handleToggle = async (id, is_active) => {
    try { await rpt.updateCostCenter(id, { is_active }); load(); } catch {}
  };

  return (
    <div className="cc-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="cc-main">
          <div className="cc-header">
            <h1>Cost Centers</h1>
            <p>Manage cost center hierarchy for financial reporting</p>
          </div>

          <div className="panel">
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>New Cost Center</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Code</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g., CC-SALES-MNL" />
              </div>
              <div className="form-group">
                <label>Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Sales - Manila" />
              </div>
              <div className="form-group">
                <label>Parent</label>
                <SelectField value={form.parent_cost_center} onChange={e => setForm(f => ({ ...f, parent_cost_center: e.target.value }))}>
                  <option value="">None (Root)</option>
                  {flatList.filter(c => c.is_active).map(c => (
                    <option key={c._id} value={c._id}>{c.code} - {c.name}</option>
                  ))}
                </SelectField>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
            </div>
          </div>

          {loading && <div className="loading">Loading...</div>}

          <div className="panel">
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Cost Center Hierarchy</h3>
            {tree.length > 0 ? <TreeView nodes={tree} onToggle={handleToggle} /> : (
              <div style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 20 }}>No cost centers created yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
