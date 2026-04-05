import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useExpenses from '../hooks/useExpenses';
import useSettings from '../hooks/useSettings';

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ACTIVITY_TYPES = ['Office', 'Field', 'Other'];

// Timezone-safe date formatting (avoids UTC shift that causes day-1 bug in +08:00)
function formatLocalDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// Display date as MM/DD/YYYY
function displayDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('T')[0].split('-');
  return `${m}/${d}/${y}`;
}

export default function Smer() {
  const { user } = useAuth();
  const { getSmerList, getSmerById, createSmer, updateSmer, deleteDraftSmer, validateSmer, submitSmer, reopenSmer, getSmerCrmMdCounts, loading } = useExpenses();
  const { settings } = useSettings();

  const [smers, setSmers] = useState([]);
  const [editingSmer, setEditingSmer] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [cycle, setCycle] = useState('C1');

  // Form state
  const [dailyEntries, setDailyEntries] = useState([]);
  const [travelAdvance, setTravelAdvance] = useState(0);
  const [perdiemRate, setPerdiemRate] = useState(800);

  const loadSmers = useCallback(async () => {
    try {
      const res = await getSmerList({ period, cycle });
      setSmers(res?.data || []);
    } catch { /* ignore */ }
  }, [period, cycle]);

  useEffect(() => { loadSmers(); }, [loadSmers]);

  useEffect(() => {
    if (settings) setPerdiemRate(settings.PERDIEM_RATE_DEFAULT || 800);
  }, [settings]);

  // Generate empty daily entries for the period
  const generateDays = () => {
    const [year, month] = period.split('-').map(Number);
    const startDay = cycle === 'C1' ? 1 : 16;
    const endDay = cycle === 'C1' ? 15 : new Date(year, month, 0).getDate();
    const entries = [];

    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue; // Skip weekends
      entries.push({
        day,
        entry_date: formatLocalDate(year, month, day),
        day_of_week: DAYS_OF_WEEK[dow - 1],
        activity_type: '',
        hospital_covered: '',
        md_count: 0,
        perdiem_tier: 'ZERO',
        perdiem_amount: 0,
        transpo_p2p: 0,
        transpo_special: 0,
        ore_amount: 0,
        notes: ''
      });
    }
    return entries;
  };

  const computePerdiem = (count) => {
    const fullThreshold = settings?.PERDIEM_MD_FULL || 8;
    const halfThreshold = settings?.PERDIEM_MD_HALF || 3;
    if (count >= fullThreshold) return { tier: 'FULL', amount: perdiemRate };
    if (count >= halfThreshold) return { tier: 'HALF', amount: Math.round(perdiemRate * 0.5 * 100) / 100 };
    return { tier: 'ZERO', amount: 0 };
  };

  const handleNewSmer = () => {
    setEditingSmer(null);
    setDailyEntries(generateDays());
    setTravelAdvance(0);
    setShowForm(true);
  };

  const handleEditSmer = async (smer) => {
    try {
      const res = await getSmerById(smer._id);
      const data = res?.data;
      setEditingSmer(data);
      setDailyEntries(data.daily_entries || []);
      setTravelAdvance(data.travel_advance || 0);
      setPerdiemRate(data.perdiem_rate || 800);
      setShowForm(true);
    } catch { /* ignore */ }
  };

  const handleEntryChange = (index, field, value) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // Auto-compute per diem when engagement count changes — but NOT if overridden
      if (field === 'md_count' && !updated[index].perdiem_override) {
        const { tier, amount } = computePerdiem(Number(value) || 0);
        updated[index].perdiem_tier = tier;
        updated[index].perdiem_amount = amount;
      }
      return updated;
    });
  };

  const [saveError, setSaveError] = useState(null);

  const handleSave = async () => {
    if (loading) return; // prevent double-click
    const data = {
      period, cycle,
      perdiem_rate: perdiemRate,
      travel_advance: travelAdvance,
      daily_entries: dailyEntries
    };
    setSaveError(null);
    try {
      if (editingSmer) { await updateSmer(editingSmer._id, data); }
      else { await createSmer(data); }
      setShowForm(false);
      loadSmers();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Save failed';
      setSaveError(msg.includes('already exists')
        ? `SMER for ${period} ${cycle} already exists. Use Edit on the existing entry instead of creating a new one.`
        : msg);
    }
  };

  // CRM pull — only for field BDMs with CRM visit data
  const isCrmLinked = user?.role === 'employee'; // field BDMs have CRM visits
  const handlePullFromCrm = async () => {
    try {
      const res = await getSmerCrmMdCounts(period, cycle);
      console.log('[SMER] CRM pull response:', res);
      const crmEntries = res?.data?.daily_entries || [];
      console.log('[SMER] CRM entries:', crmEntries.length, 'Frontend entries:', dailyEntries.length);
      if (!crmEntries.length) {
        console.warn('[SMER] No CRM entries returned');
        return;
      }
      // Log date matching
      const crmMap = Object.fromEntries(crmEntries.map(e => [e.entry_date, e]));
      console.log('[SMER] CRM dates:', Object.keys(crmMap));
      console.log('[SMER] Frontend dates:', dailyEntries.map(e => e.entry_date));

      setDailyEntries(prev => {
        return prev.map(entry => {
          const crm = crmMap[entry.entry_date];
          if (!crm) return entry;
          const updated = { ...entry, md_count: crm.md_count };
          if (!entry.perdiem_override) {
            updated.perdiem_tier = crm.perdiem_tier;
            updated.perdiem_amount = crm.perdiem_amount;
          }
          return updated;
        });
      });
    } catch (err) {
      console.error('[SMER] CRM pull failed:', err.response?.data || err.message);
    }
  };

  const handleValidate = async () => { try { await validateSmer(); loadSmers(); } catch (err) { alert(err?.response?.data?.message || err.message || 'Validation failed'); } };
  const handleSubmit = async () => { try { await submitSmer(); loadSmers(); } catch (err) { alert(err?.response?.data?.message || err.message || 'Submit failed'); } };
  const handleReopen = async (id) => { try { await reopenSmer([id]); loadSmers(); } catch (err) { alert(err?.response?.data?.message || err.message || 'Reopen failed'); } };
  const handleDelete = async (id) => { try { await deleteDraftSmer(id); loadSmers(); } catch (err) { alert(err?.response?.data?.message || err.message || 'Delete failed'); } };

  const canOverride = ['admin', 'finance', 'president'].includes(user?.role);

  const handleOverride = (index) => {
    const entry = dailyEntries[index];
    const reason = prompt(`Override reason for Day ${entry.day} (Current: ${entry.md_count} engagements):\ne.g. "Meeting with President", "Training day"`);
    if (!reason) return;
    const tier = prompt('Override tier: FULL or HALF?', 'FULL')?.toUpperCase();
    if (!tier || !['FULL', 'HALF'].includes(tier)) return;
    setDailyEntries(prev => {
      const updated = [...prev];
      const { amount } = computePerdiem(tier === 'FULL' ? 999 : 3);
      updated[index] = { ...updated[index], perdiem_override: true, override_tier: tier, override_reason: reason, perdiem_tier: tier, perdiem_amount: amount };
      return updated;
    });
  };

  const handleRemoveOverride = (index) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      const entry = updated[index];
      const { tier, amount } = computePerdiem(entry.md_count || 0);
      updated[index] = { ...entry, perdiem_override: false, override_tier: undefined, override_reason: undefined, perdiem_tier: tier, perdiem_amount: amount };
      return updated;
    });
  };

  // Compute totals
  const totals = dailyEntries.reduce((acc, e) => ({
    perdiem: acc.perdiem + (e.perdiem_amount || 0),
    transpo: acc.transpo + (e.transpo_p2p || 0),
    special: acc.special + (e.transpo_special || 0),
    ore: acc.ore + (e.ore_amount || 0)
  }), { perdiem: 0, transpo: 0, special: 0, ore: 0 });
  const totalReimbursable = totals.perdiem + totals.transpo + totals.special + totals.ore;
  const balanceOnHand = travelAdvance - totalReimbursable;

  return (
    <div className="admin-page erp-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>SMER — Per Diem</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          {/* Period/Cycle selector */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1 (1st-15th)</option>
              <option value="C2">Cycle 2 (16th-end)</option>
              <option value="MONTHLY">Monthly</option>
            </select>
            <button onClick={handleNewSmer} style={{ padding: '6px 16px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New SMER</button>
            <button onClick={handleValidate} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>Validate</button>
            <button onClick={handleSubmit} disabled={loading} style={{ padding: '6px 16px', borderRadius: 6, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>Submit</button>
          </div>

          {/* SMER List */}
          {!showForm && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                    <th style={{ padding: 8, textAlign: 'left' }}>Period</th>
                    <th style={{ padding: 8, textAlign: 'left' }}>Cycle</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Days</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Per Diem</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Transport</th>
                    <th style={{ padding: 8, textAlign: 'right' }}>Total</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Status</th>
                    <th style={{ padding: 8, textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {smers.map(s => (
                    <React.Fragment key={s._id}>
                    <tr style={{ borderBottom: s.status === 'ERROR' ? 'none' : '1px solid var(--erp-border, #dbe4f0)' }}>
                      <td style={{ padding: 8 }}>{s.period}</td>
                      <td style={{ padding: 8 }}>{s.cycle}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>{s.working_days}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(s.total_perdiem || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}>₱{(s.total_transpo || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>₱{(s.total_reimbursable || 0).toLocaleString()}</td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, color: '#fff', background: STATUS_COLORS[s.status] || '#6b7280' }}>{s.status}</span>
                      </td>
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {['DRAFT', 'ERROR'].includes(s.status) && (
                          <button onClick={() => handleEditSmer(s)} style={{ marginRight: 4, padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Edit</button>
                        )}
                        {s.status === 'DRAFT' && (
                          <button onClick={() => handleDelete(s._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>Del</button>
                        )}
                        {s.status === 'POSTED' && (
                          <button onClick={() => handleReopen(s._id)} style={{ padding: '2px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #eab308', background: '#fff', color: '#b45309', cursor: 'pointer' }}>Re-open</button>
                        )}
                      </td>
                    </tr>
                    {s.status === 'ERROR' && s.validation_errors?.length > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)' }}>
                        <td colSpan={8} style={{ padding: '4px 8px 8px', background: '#fef2f2' }}>
                          <div style={{ fontSize: 12, color: '#dc2626' }}>
                            {s.validation_errors.map((err, i) => <div key={i}>- {err}</div>)}
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                  {!smers.length && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--erp-muted, #5f7188)' }}>No SMER entries for this period</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {/* SMER Form */}
          {showForm && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontSize: 18, color: 'var(--erp-text, #132238)' }}>{editingSmer ? 'Edit SMER' : 'New SMER'} — {period} {cycle}</h2>
                <button onClick={() => setShowForm(false)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              </div>

              {/* Summary cards — ABOVE grid so they're always visible */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Total Reimbursable</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--erp-text, #132238)' }}>₱{totalReimbursable.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--erp-border, #dbe4f0)', minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Travel Advance</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>₱{travelAdvance.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${balanceOnHand >= 0 ? '#22c55e' : '#ef4444'}`, minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Balance on Hand</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: balanceOnHand >= 0 ? '#16a34a' : '#dc2626' }}>₱{balanceOnHand.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', minWidth: 80 }}>
                  <div style={{ fontSize: 11, color: '#166534' }}>Per Diem</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#166534' }}>₱{totals.perdiem.toLocaleString()}</div>
                </div>
                <div style={{ padding: '8px 14px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', minWidth: 80 }}>
                  <div style={{ fontSize: 11, color: '#1e40af' }}>Transport</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#1e40af' }}>₱{(totals.transpo + totals.special).toLocaleString()}</div>
                </div>
              </div>

              {/* Per Diem Rate + Travel Advance + CRM Pull */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>Rate: <input type="number" value={perdiemRate} onChange={e => setPerdiemRate(Number(e.target.value))} style={{ width: 70, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                <label style={{ fontSize: 13 }}>Advance: <input type="number" value={travelAdvance} onChange={e => setTravelAdvance(Number(e.target.value))} style={{ width: 90, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} /></label>
                {isCrmLinked && (
                  <button onClick={handlePullFromCrm} disabled={loading} style={{ padding: '4px 14px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Pull from CRM</button>
                )}
                <span style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>Full ≥ {settings?.PERDIEM_MD_FULL || 8} | Half ≥ {settings?.PERDIEM_MD_HALF || 3}</span>
              </div>
              {isCrmLinked && (
                <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                  BDMs: Click <strong>Pull from CRM</strong> to auto-fill MDs/Engagements from your logged visits. You can still edit manually after pulling.
                </div>
              )}

              {/* Daily Entries Grid */}
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', borderBottom: '2px solid var(--erp-border, #dbe4f0)' }}>
                      <th style={{ padding: 6, textAlign: 'center', width: 65 }}>Date</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 36 }}>DOW</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 80 }}>Activity</th>
                      <th style={{ padding: 6, textAlign: 'left', width: 140 }}>Notes</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 55 }}>MDs/<br/>Eng.</th>
                      <th style={{ padding: 6, textAlign: 'center', width: 50 }}>Tier</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>Per Diem</th>
                      {canOverride && <th style={{ padding: 6, textAlign: 'center', width: 65 }}>Ovrd</th>}
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>P2P</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>Special</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>ORE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyEntries.map((entry, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: entry.perdiem_override ? '#faf5ff' : undefined }}>
                        <td style={{ padding: 3, textAlign: 'center', fontSize: 11 }}>{displayDate(entry.entry_date).slice(0, 5)}</td>
                        <td style={{ padding: 3, textAlign: 'center', fontSize: 10, color: 'var(--erp-muted, #5f7188)' }}>{entry.day_of_week}</td>
                        <td style={{ padding: 3 }}>
                          <select value={entry.activity_type || entry.hospital_covered || ''} onChange={e => handleEntryChange(idx, 'activity_type', e.target.value)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 }}>
                            <option value="">—</option>
                            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: 3 }}>
                          <input placeholder="Details..." value={entry.notes || ''} onChange={e => handleEntryChange(idx, 'notes', e.target.value)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 }} />
                        </td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          <input type="number" min={0} value={entry.md_count} onChange={e => handleEntryChange(idx, 'md_count', Number(e.target.value))} style={{ width: 45, padding: '2px 3px', textAlign: 'center', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: entry.perdiem_tier === 'FULL' ? '#16a34a' : entry.perdiem_tier === 'HALF' ? '#d97706' : '#9ca3af', background: entry.perdiem_tier === 'FULL' ? '#dcfce7' : entry.perdiem_tier === 'HALF' ? '#fef3c7' : '#f3f4f6' }}>
                            {entry.perdiem_tier}
                          </span>
                          {entry.perdiem_override && <span title={entry.override_reason} style={{ marginLeft: 1, cursor: 'help', fontSize: 9, color: '#7c3aed' }}>★</span>}
                        </td>
                        <td style={{ padding: 3, textAlign: 'right', fontWeight: 500, fontSize: 12 }}>₱{(entry.perdiem_amount || 0).toLocaleString()}</td>
                        {canOverride && (
                          <td style={{ padding: 3, textAlign: 'center' }}>
                            {entry.perdiem_override ? (
                              <button onClick={() => handleRemoveOverride(idx)} title={entry.override_reason} style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid #7c3aed', color: '#7c3aed', background: '#f5f3ff', cursor: 'pointer' }}>Undo</button>
                            ) : (
                              <button onClick={() => handleOverride(idx)} style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', color: 'var(--erp-muted)', background: '#fff', cursor: 'pointer' }}>+</button>
                            )}
                          </td>
                        )}
                        <td style={{ padding: 3 }}>
                          <input type="number" min={0} value={entry.transpo_p2p || 0} onChange={e => handleEntryChange(idx, 'transpo_p2p', Number(e.target.value))} style={{ width: 60, padding: '2px 3px', textAlign: 'right', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: 3 }}>
                          <input type="number" min={0} value={entry.transpo_special || 0} onChange={e => handleEntryChange(idx, 'transpo_special', Number(e.target.value))} style={{ width: 60, padding: '2px 3px', textAlign: 'right', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: 3 }}>
                          <input type="number" min={0} value={entry.ore_amount || 0} onChange={e => handleEntryChange(idx, 'ore_amount', Number(e.target.value))} style={{ width: 60, padding: '2px 3px', textAlign: 'right', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--erp-bg-alt, #f1f5f9)', fontWeight: 600, fontSize: 12 }}>
                      <td colSpan={canOverride ? 7 : 6} style={{ padding: 6, textAlign: 'right' }}>Totals:</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.perdiem.toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.transpo.toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.special.toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.ore.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {saveError && (
                <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 13 }}>
                  {saveError}
                </div>
              )}
              <button onClick={handleSave} disabled={loading} style={{ padding: '8px 24px', borderRadius: 6, background: 'var(--erp-accent, #1e5eff)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                {editingSmer ? 'Update SMER' : 'Save SMER as Draft'}
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
