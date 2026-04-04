/**
 * Budget Allocations Page
 * Admin page to create/edit per-BDM budget allocations per period,
 * with component-level amounts and approval workflow.
 * Convention: target_id = User._id (same as bdm_id in transaction models)
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useReports from '../hooks/useReports';
import usePeople from '../hooks/usePeople';

const EXPENSE_COMPONENTS = [
  { code: 'SMER', label: 'SMER (Per Diem + Transport)' },
  { code: 'GAS', label: 'Gasoline (Official)' },
  { code: 'INSURANCE', label: 'Partners Insurance' },
  { code: 'ACCESS', label: 'ACCESS Expenses' },
  { code: 'ORE', label: 'ORE (Reimbursable)' },
  { code: 'CORE_COMM', label: 'Core Commission' },
];

const STATUS_COLORS = {
  DRAFT: { bg: '#e2e8f0', text: '#475569' },
  APPROVED: { bg: '#dcfce7', text: '#166534' },
  CLOSED: { bg: '#dbeafe', text: '#1e40af' },
};

const pageStyles = `
  .ba-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ba-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .ba-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .ba-header p { color: var(--erp-muted); font-size: 13px; margin: 0 0 16px; }
  .controls { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
  .controls input, .controls select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-success { background: #16a34a; color: white; }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .btn:disabled { opacity: 0.5; }
  .panel { background: var(--erp-panel); border: 1px solid var(--erp-border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input, .form-group select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); }
  .comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .comp-card { background: var(--erp-bg); border: 1px solid var(--erp-border); border-radius: 10px; padding: 12px; }
  .comp-card label { font-size: 11px; font-weight: 600; color: var(--erp-muted); display: block; margin-bottom: 4px; }
  .comp-card input { width: 100%; padding: 6px 10px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 14px; font-weight: 600; text-align: right; }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft); font-weight: 600; white-space: nowrap; }
  .data-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); white-space: nowrap; }
  .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .total-row { font-weight: 700; background: var(--erp-accent-soft); }
  .loading { text-align: center; padding: 40px; color: var(--erp-muted); }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .modal-content { background: var(--erp-panel); border-radius: 16px; padding: 24px; width: 90%; max-width: 640px; max-height: 80vh; overflow-y: auto; }
  .modal-content h3 { margin: 0 0 16px; font-size: 17px; }
  @media(max-width: 768px) { .ba-main { padding: 12px; } .form-grid { grid-template-columns: 1fr; } .comp-grid { grid-template-columns: 1fr; } }
`;

function fmt(n) { return '\u20B1' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function getCurrentPeriod() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

export default function BudgetAllocations() {
  const { user } = useAuth();
  const rpt = useReports();
  const ppl = usePeople();
  const [allocations, setAllocations] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ period: getCurrentPeriod(), status: '' });
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    target_type: 'BDM',
    target_id: '',
    target_name: '',
    period: getCurrentPeriod(),
    components: EXPENSE_COMPONENTS.map(c => ({ component_code: c.code, budgeted_amount: 0 }))
  });

  const loadAllocations = useCallback(async () => {
    setLoading(true);
    try {
      const params = { period: filters.period };
      if (filters.status) params.status = filters.status;
      const res = await rpt.getBudgetAllocations(params);
      setAllocations(res?.data || []);
    } catch {}
    setLoading(false);
  }, [filters]);

  const loadPeople = useCallback(async () => {
    try {
      const res = await ppl.getPeopleList({ is_active: true });
      setPeople(res?.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadAllocations(); loadPeople(); }, []);

  const handlePersonChange = (personId) => {
    const person = people.find(p => p._id === personId);
    setForm(f => ({
      ...f,
      target_id: person?.user_id || personId,  // Store User._id as target_id
      target_name: person?.full_name || ''
    }));
  };

  const handleComponentChange = (code, amount) => {
    setForm(f => ({
      ...f,
      components: f.components.map(c =>
        c.component_code === code ? { ...c, budgeted_amount: Number(amount) || 0 } : c
      )
    }));
  };

  const totalBudget = form.components.reduce((s, c) => s + (c.budgeted_amount || 0), 0);

  const handleSubmit = async () => {
    if (!form.target_id || !form.period) return;
    try {
      const payload = {
        target_type: form.target_type,
        target_id: form.target_id,
        target_name: form.target_name,
        period: form.period,
        components: form.components.filter(c => c.budgeted_amount > 0)
      };
      if (editId) {
        await rpt.updateBudgetAllocation(editId, payload);
      } else {
        await rpt.createBudgetAllocation(payload);
      }
      setShowForm(false);
      setEditId(null);
      resetForm();
      loadAllocations();
    } catch {}
  };

  const handleApprove = async (id) => {
    try { await rpt.approveBudgetAllocation(id); loadAllocations(); } catch {}
  };

  const handleEdit = (alloc) => {
    const compMap = new Map((alloc.components || []).map(c => [c.component_code, c.budgeted_amount]));
    setForm({
      target_type: alloc.target_type,
      target_id: alloc.target_id,
      target_name: alloc.target_name || '',
      period: alloc.period,
      components: EXPENSE_COMPONENTS.map(c => ({
        component_code: c.code,
        budgeted_amount: compMap.get(c.code) || 0
      }))
    });
    setEditId(alloc._id);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      target_type: 'BDM',
      target_id: '',
      target_name: '',
      period: filters.period,
      components: EXPENSE_COMPONENTS.map(c => ({ component_code: c.code, budgeted_amount: 0 }))
    });
  };

  return (
    <div className="ba-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div className="ba-main">
          <div className="ba-header">
            <h1>Budget Allocations</h1>
            <p>Set per-BDM expense budgets by period. Approved budgets feed into Expense Anomalies &gt; Budget Overruns.</p>
          </div>

          <div className="controls">
            <input type="month" value={filters.period} onChange={e => setFilters(f => ({ ...f, period: e.target.value }))} />
            <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="APPROVED">Approved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <button className="btn btn-primary" onClick={loadAllocations} disabled={loading}>Load</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={() => { resetForm(); setEditId(null); setShowForm(true); }}>
              + New Allocation
            </button>
          </div>

          {loading && <div className="loading">Loading...</div>}

          <div className="panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th>BDM / Target</th><th>Type</th><th>Period</th>
                  {EXPENSE_COMPONENTS.map(c => <th key={c.code} style={{ textAlign: 'right' }}>{c.code}</th>)}
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map(a => {
                  const compMap = new Map((a.components || []).map(c => [c.component_code, c.budgeted_amount]));
                  const sc = STATUS_COLORS[a.status] || STATUS_COLORS.DRAFT;
                  return (
                    <tr key={a._id}>
                      <td style={{ fontWeight: 600 }}>{a.target_name || 'Unknown'}</td>
                      <td>{a.target_type}</td>
                      <td>{a.period}</td>
                      {EXPENSE_COMPONENTS.map(c => (
                        <td key={c.code} className="num">{fmt(compMap.get(c.code) || 0)}</td>
                      ))}
                      <td className="num" style={{ fontWeight: 700 }}>{fmt(a.total_budget)}</td>
                      <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{a.status}</span></td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {a.status === 'DRAFT' && (
                          <>
                            <button className="btn btn-sm" onClick={() => handleEdit(a)}>Edit</button>
                            <button className="btn btn-success btn-sm" onClick={() => handleApprove(a._id)}>Approve</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {allocations.length === 0 && !loading && (
                  <tr><td colSpan={4 + EXPENSE_COMPONENTS.length + 3} style={{ textAlign: 'center', color: 'var(--erp-muted)' }}>
                    No budget allocations for {filters.period}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Create / Edit Modal */}
          {showForm && (
            <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
              <div className="modal-content">
                <h3>{editId ? 'Edit' : 'New'} Budget Allocation</h3>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Target Type</label>
                    <select value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}>
                      <option value="BDM">BDM</option>
                      <option value="EMPLOYEE">Employee</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>BDM / Person</label>
                    <select
                      value={people.find(p => p.user_id === form.target_id)?._id || ''}
                      onChange={e => handlePersonChange(e.target.value)}
                    >
                      <option value="">Select...</option>
                      {people
                        .filter(p => form.target_type === 'BDM'
                          ? ['BDM', 'ECOMMERCE_BDM', 'SALES_REP'].includes(p.person_type)
                          : true)
                        .map(p => (
                          <option key={p._id} value={p._id}>{p.full_name} ({p.person_type})</option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Period</label>
                    <input type="month" value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} />
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Component Budgets
                </div>
                <div className="comp-grid">
                  {EXPENSE_COMPONENTS.map(c => (
                    <div className="comp-card" key={c.code}>
                      <label>{c.label}</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={form.components.find(fc => fc.component_code === c.code)?.budgeted_amount || 0}
                        onChange={e => handleComponentChange(c.code, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Total: {fmt(totalBudget)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" style={{ background: 'var(--erp-border)' }} onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSubmit} disabled={!form.target_id || !form.period || totalBudget === 0}>
                      {editId ? 'Update' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
