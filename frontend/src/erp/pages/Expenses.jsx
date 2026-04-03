import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useExpenses from '../hooks/useExpenses';

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const EXPENSE_TYPES = ['ORE', 'ACCESS'];
const PAYMENT_MODES = ['CASH', 'GCASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'ONLINE', 'OTHER'];
const EXPENSE_CATEGORIES = ['Courier/Shipping', 'Parking', 'Toll', 'Hotel/Accommodation', 'Food/Meals', 'Office Supplies', 'Communication', 'Transportation', 'Miscellaneous'];

export default function Expenses() {
  const { getExpenseList, getExpenseById, createExpense, updateExpense, deleteDraftExpense, validateExpenses, submitExpenses, reopenExpenses, getExpenseSummary, loading } = useExpenses();

  const [expenses, setExpenses] = useState([]);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState(null);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');
  const [lines, setLines] = useState([]);

  const loadExpenses = useCallback(async () => {
    try {
      const [res, sumRes] = await Promise.all([
        getExpenseList({ period, cycle }),
        getExpenseSummary(period, cycle).catch(() => null)
      ]);
      setExpenses(res?.data || []);
      if (sumRes?.data) setSummary(sumRes.data);
    } catch { /* ignore */ }
  }, [period, cycle]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const addLine = () => {
    setLines(prev => [...prev, {
      expense_date: new Date().toISOString().split('T')[0],
      expense_type: 'ORE',
      expense_category: '',
      establishment: '',
      particulars: '',
      amount: 0,
      or_number: '',
      payment_mode: 'CASH',
      notes: ''
    }]);
  };

  const updateLine = (idx, field, value) => {
    setLines(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      // Auto-set CALF required for ACCESS non-cash
      if (field === 'expense_type' || field === 'payment_mode') {
        updated[idx].calf_required = updated[idx].expense_type === 'ACCESS' && updated[idx].payment_mode !== 'CASH';
      }
      return updated;
    });
  };

  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleNew = () => { setEditingExpense(null); setLines([]); addLine(); setShowForm(true); };

  const handleEdit = async (expense) => {
    try {
      const res = await getExpenseById(expense._id);
      const data = res?.data;
      setEditingExpense(data);
      setLines(data.lines || []);
      setShowForm(true);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    const data = { period, cycle, lines };
    try {
      if (editingExpense) { await updateExpense(editingExpense._id, data); }
      else { await createExpense(data); }
      setShowForm(false);
      loadExpenses();
    } catch { /* ignore */ }
  };

  const handleValidate = async () => { try { await validateExpenses(); loadExpenses(); } catch {} };
  const handleSubmit = async () => { try { await submitExpenses(); loadExpenses(); } catch {} };
  const handleReopen = async (id) => { try { await reopenExpenses([id]); loadExpenses(); } catch {} };
  const handleDelete = async (id) => { try { await deleteDraftExpense(id); loadExpenses(); } catch {} };

  const totalOre = lines.filter(l => l.expense_type === 'ORE').reduce((s, l) => s + (l.amount || 0), 0);
  const totalAccess = lines.filter(l => l.expense_type === 'ACCESS').reduce((s, l) => s + (l.amount || 0), 0);

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <h1 style={{ marginBottom: 8, color: 'var(--erp-text, #132238)' }}>Expenses</h1>

          {/* Module navigation */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <Link to="/erp/smer" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>SMER Per Diem</Link>
            <Link to="/erp/car-logbook" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>Car Logbook</Link>
            <span style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', fontSize: 13, fontWeight: 600 }}>ORE / ACCESS</span>
            <Link to="/erp/prf-calf" style={{ padding: '6px 14px', borderRadius: 6, background: '#f1f5f9', color: 'var(--erp-text, #132238)', textDecoration: 'none', fontSize: 13, border: '1px solid var(--erp-border, #dbe4f0)' }}>PRF / CALF</Link>
          </div>

          {/* Summary cards */}
          {summary && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'SMER', value: summary.categories?.smer_reimbursable, status: summary.smer_status },
                { label: 'Gas (Official)', value: summary.categories?.gasoline_less_personal },
                { label: 'ORE', value: summary.categories?.ore_total },
                { label: 'ACCESS', value: summary.categories?.access_total },
                { label: 'Partners', value: summary.categories?.partners_insurance },
                { label: 'CORE Commission', value: summary.categories?.core_commission }
              ].map((c, i) => (
                <div key={i} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 120, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>{c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>₱{(c.value || 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
            </select>
            <button onClick={handleNew} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New Expense</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
          </div>

          {/* Expense List */}
          {!showForm && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Period</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Cycle</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Lines</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>ORE</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>ACCESS</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e._id} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                      <td style={{ padding: 8 }}>{e.period}</td>
                      <td style={{ padding: 8 }}>{e.cycle}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{e.line_count || 0}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(e.total_ore || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(e.total_access || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>₱{(e.total_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {['DRAFT', 'ERROR'].includes(e.status) && (
                          <>
                            <button onClick={() => handleEdit(e)} style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                            <button onClick={() => handleDelete(e._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                          </>
                        )}
                        {e.status === 'POSTED' && <button onClick={() => handleReopen(e._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>}
                      </td>
                    </tr>
                  ))}
                  {!expenses.length && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No expenses for this period</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Expense Form */}
          {showForm && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingExpense ? 'Edit' : 'New'} Expense — {period} {cycle}</h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Expense Lines */}
              {lines.map((line, idx) => (
                <div key={idx} style={{ padding: 12, marginBottom: 8, borderRadius: 8, border: `1px solid ${line.calf_required ? '#f59e0b' : 'var(--erp-border, #dbe4f0)'}`, background: line.expense_type === 'ACCESS' ? '#fffbeb' : '#fff' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--erp-muted)' }}>#{idx + 1}</span>
                    <select value={line.expense_type} onChange={e => updateLine(idx, 'expense_type', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12, fontWeight: 600 }}>
                      {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="date" value={line.expense_date?.split('T')[0] || ''} onChange={e => updateLine(idx, 'expense_date', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <select value={line.expense_category} onChange={e => updateLine(idx, 'expense_category', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                      <option value="">Category...</option>
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={() => removeLine(idx)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 11 }}>X</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input placeholder="Establishment" value={line.establishment} onChange={e => updateLine(idx, 'establishment', e.target.value)} style={{ flex: 1, minWidth: 120, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <input placeholder="Particulars" value={line.particulars} onChange={e => updateLine(idx, 'particulars', e.target.value)} style={{ flex: 1, minWidth: 120, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <input type="number" placeholder="Amount" value={line.amount || ''} onChange={e => updateLine(idx, 'amount', Number(e.target.value))} style={{ width: 90, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <input placeholder="OR#" value={line.or_number} onChange={e => updateLine(idx, 'or_number', e.target.value)} style={{ width: 80, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                    <select value={line.payment_mode} onChange={e => updateLine(idx, 'payment_mode', e.target.value)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                      {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {line.calf_required && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>CALF Required</span>}
                  </div>
                </div>
              ))}
              <button onClick={addLine} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>+ Add Line</button>

              {/* Totals */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>ORE Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>₱{totalOre.toLocaleString()}</div>
                </div>
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid #f59e0b', minWidth: 120, background: '#fffbeb' }}>
                  <div style={{ fontSize: 11, color: '#92400e' }}>ACCESS Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#92400e' }}>₱{totalAccess.toLocaleString()}</div>
                </div>
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--erp-accent, #1e5eff)', minWidth: 120 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Grand Total</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--erp-accent, #1e5eff)' }}>₱{(totalOre + totalAccess).toLocaleString()}</div>
                </div>
              </div>

              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingExpense ? 'Update' : 'Save as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
