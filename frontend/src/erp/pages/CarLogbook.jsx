import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useExpenses from '../hooks/useExpenses';
import useSettings from '../hooks/useSettings';

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const FUEL_TYPES = ['UNLEADED', 'DIESEL', 'PREMIUM', 'V-POWER', 'XCS', 'OTHER'];
const PAYMENT_MODES = ['CASH', 'SHELL_FLEET_CARD', 'GCASH', 'CARD', 'OTHER'];

export default function CarLogbook() {
  const { getCarLogbookList, getCarLogbookById, createCarLogbook, updateCarLogbook, deleteDraftCarLogbook, validateCarLogbook, submitCarLogbook, reopenCarLogbook, loading } = useExpenses();
  const { settings } = useSettings();

  const [entries, setEntries] = useState([]);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');

  // Form state
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    starting_km: 0, ending_km: 0, personal_km: 0,
    fuel_entries: [], notes: ''
  });

  const loadEntries = useCallback(async () => {
    try {
      const res = await getCarLogbookList({ period, cycle, limit: 50 });
      setEntries(res?.data || []);
    } catch { /* ignore */ }
  }, [period, cycle]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const resetForm = () => setForm({
    entry_date: new Date().toISOString().split('T')[0],
    starting_km: 0, ending_km: 0, personal_km: 0,
    fuel_entries: [], notes: ''
  });

  const handleNew = () => { setEditingEntry(null); resetForm(); setShowForm(true); };

  const handleEdit = async (entry) => {
    try {
      const res = await getCarLogbookById(entry._id);
      const data = res?.data;
      setEditingEntry(data);
      setForm({
        entry_date: data.entry_date ? new Date(data.entry_date).toISOString().split('T')[0] : '',
        starting_km: data.starting_km || 0,
        ending_km: data.ending_km || 0,
        personal_km: data.personal_km || 0,
        fuel_entries: data.fuel_entries || [],
        notes: data.notes || ''
      });
      setShowForm(true);
    } catch { /* ignore */ }
  };

  const addFuelEntry = () => {
    setForm(prev => ({
      ...prev,
      fuel_entries: [...prev.fuel_entries, { station_name: '', fuel_type: 'UNLEADED', liters: 0, price_per_liter: 0, total_amount: 0, payment_mode: 'CASH' }]
    }));
  };

  const updateFuelEntry = (idx, field, value) => {
    setForm(prev => {
      const updated = [...prev.fuel_entries];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'liters' || field === 'price_per_liter') {
        updated[idx].total_amount = Math.round((updated[idx].liters || 0) * (updated[idx].price_per_liter || 0) * 100) / 100;
      }
      return { ...prev, fuel_entries: updated };
    });
  };

  const removeFuelEntry = (idx) => {
    setForm(prev => ({ ...prev, fuel_entries: prev.fuel_entries.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    const data = { ...form, period, cycle, km_per_liter: settings?.FUEL_EFFICIENCY_DEFAULT || 12 };
    try {
      if (editingEntry) { await updateCarLogbook(editingEntry._id, data); }
      else { await createCarLogbook(data); }
      setShowForm(false);
      loadEntries();
    } catch { /* ignore */ }
  };

  const handleValidate = async () => { try { await validateCarLogbook(); loadEntries(); } catch {} };
  const handleSubmit = async () => { try { await submitCarLogbook(); loadEntries(); } catch {} };
  const handleReopen = async (id) => { try { await reopenCarLogbook([id]); loadEntries(); } catch {} };
  const handleDelete = async (id) => { try { await deleteDraftCarLogbook(id); loadEntries(); } catch {} };

  // Computed values
  const totalKm = Math.max(0, form.ending_km - form.starting_km);
  const officialKm = Math.max(0, totalKm - form.personal_km);
  const totalLiters = form.fuel_entries.reduce((sum, f) => sum + (f.liters || 0), 0);
  const totalFuel = form.fuel_entries.reduce((sum, f) => sum + (f.total_amount || 0), 0);
  const kpl = settings?.FUEL_EFFICIENCY_DEFAULT || 12;
  const expectedLiters = Math.round((totalKm / kpl) * 1000) / 1000;

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>Car Logbook</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1</option><option value="C2">Cycle 2</option><option value="MONTHLY">Monthly</option>
            </select>
            <button onClick={handleNew} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New Entry</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
          </div>

          {/* Entry List */}
          {!showForm && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Date</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Start KM</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>End KM</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total KM</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Personal</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Official</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Fuel (L)</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Fuel ₱</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(e => (
                    <tr key={e._id} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: e.overconsumption_flag ? '#fef2f2' : undefined }}>
                      <td style={{ padding: 8 }}>{e.entry_date ? new Date(e.entry_date).toLocaleDateString() : '—'}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.starting_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.ending_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.total_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.personal_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.official_km || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{(e.actual_liters || 0).toFixed(1)}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(e.total_fuel_amount || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[e.status] || '#6b7280' }}>{e.status}</span>
                        {e.overconsumption_flag && <span style={{ marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5' }}>OVER</span>}
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
                  {!entries.length && <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No logbook entries</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* Entry Form */}
          {showForm && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{editingEntry ? 'Edit' : 'New'} Logbook Entry</h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Odometer */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13 }}>Date: <input type="date" value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <label style={{ fontSize: 13 }}>Starting KM (Morning): <input type="number" value={form.starting_km} onChange={e => setForm(p => ({ ...p, starting_km: Number(e.target.value) }))} style={{ width: 100, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <label style={{ fontSize: 13 }}>Ending KM (Night): <input type="number" value={form.ending_km} onChange={e => setForm(p => ({ ...p, ending_km: Number(e.target.value) }))} style={{ width: 100, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <label style={{ fontSize: 13 }}>Personal KM: <input type="number" value={form.personal_km} onChange={e => setForm(p => ({ ...p, personal_km: Number(e.target.value) }))} style={{ width: 80, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
              </div>

              {/* KM Summary */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Total KM</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{totalKm}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Official KM</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#2563eb' }}>{officialKm}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Expected L</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{expectedLiters}</div>
                </div>
                <div style={{ padding: 8, borderRadius: 6, border: `1px solid ${totalLiters > expectedLiters * 1.3 ? '#ef4444' : 'var(--erp-border, #dbe4f0)'}`, minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>Actual L</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: totalLiters > expectedLiters * 1.3 ? '#dc2626' : undefined }}>{totalLiters.toFixed(1)}</div>
                </div>
              </div>

              {/* Fuel Entries */}
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Fuel Entries</h3>
              {form.fuel_entries.map((fuel, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center', padding: 8, borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
                  <input placeholder="Station" value={fuel.station_name} onChange={e => updateFuelEntry(idx, 'station_name', e.target.value)} style={{ width: 120, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                  <select value={fuel.fuel_type} onChange={e => updateFuelEntry(idx, 'fuel_type', e.target.value)} style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                    {FUEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" placeholder="Liters" value={fuel.liters || ''} onChange={e => updateFuelEntry(idx, 'liters', Number(e.target.value))} style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                  <input type="number" placeholder="₱/L" value={fuel.price_per_liter || ''} onChange={e => updateFuelEntry(idx, 'price_per_liter', Number(e.target.value))} style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80 }}>₱{(fuel.total_amount || 0).toLocaleString()}</span>
                  <select value={fuel.payment_mode} onChange={e => updateFuelEntry(idx, 'payment_mode', e.target.value)} style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }}>
                    {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={() => removeFuelEntry(idx)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fff', cursor: 'pointer', fontSize: 12 }}>X</button>
                </div>
              ))}
              <button onClick={addFuelEntry} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer', fontSize: 12, marginBottom: 16 }}>+ Add Fuel Entry</button>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13 }}>Notes: <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ width: 300, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Total Fuel: ₱{totalFuel.toLocaleString()}</span>
              </div>

              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingEntry ? 'Update' : 'Save as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
