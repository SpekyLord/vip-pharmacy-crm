import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLES, ROLE_SETS } from '../../constants/roles';
import useExpenses from '../hooks/useExpenses';
import useSettings from '../hooks/useSettings';
import useHospitals from '../hooks/useHospitals';
import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT: '#6b7280', VALID: '#22c55e', ERROR: '#ef4444', POSTED: '#2563eb', DELETION_REQUESTED: '#eab308'
};
const DAYS_OF_WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// ── Mobile-responsive SMER styles ──
const smerMobileStyles = `
  @media (max-width: 768px) {
    .smer-desktop-grid { display: none !important; }
    .smer-mobile-cards { display: block !important; }
    .smer-summary-row { flex-direction: column; }
    .smer-summary-row > div { min-width: auto !important; flex: 1; }
    .smer-controls { flex-direction: column; gap: 8px !important; }
    .smer-controls > * { width: 100%; }
    .smer-controls select, .smer-controls input[type="month"] { width: 100%; }
  }
  @media (min-width: 769px) {
    .smer-mobile-cards { display: none !important; }
  }
  .smer-card {
    background: #fff;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 10px;
    padding: 12px;
    margin-bottom: 8px;
  }
  .smer-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #f1f5f9;
  }
  .smer-card-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .smer-card-field label {
    display: block;
    font-size: 10px;
    color: var(--erp-muted, #5f7188);
    margin-bottom: 2px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .smer-card-field input, .smer-card-field select {
    width: 100%;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--erp-border, #dbe4f0);
    font-size: 14px;
  }
  .smer-card-field.full-width { grid-column: 1 / -1; }
  .hospital-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }
  .hospital-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    font-size: 11px;
    color: #1e40af;
  }
  .hospital-chip button {
    background: none;
    border: none;
    color: #93c5fd;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
    line-height: 1;
  }
  .hospital-picker-dropdown {
    position: absolute;
    z-index: 50;
    background: #fff;
    border: 1px solid var(--erp-border, #dbe4f0);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    max-height: 200px;
    overflow-y: auto;
    width: 100%;
    left: 0;
    top: 100%;
    margin-top: 2px;
  }
  .hospital-picker-item {
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    border-bottom: 1px solid #f8fafc;
  }
  .hospital-picker-item:hover { background: #f0f9ff; }
`;

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
  const { getSmerList, getSmerById, createSmer, updateSmer, deleteDraftSmer, validateSmer, submitSmer, reopenSmer, getSmerCrmMdCounts, getRevolvingFundAmount, getPerdiemConfig, overridePerdiemDay, loading } = useExpenses();
  const { settings } = useSettings();
  const { options: activityTypeOpts } = useLookupOptions('ACTIVITY_TYPE');
  const ACTIVITY_TYPES = activityTypeOpts.map(o => o.code);

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
  const [travelAdvanceSource, setTravelAdvanceSource] = useState('');  // 'COMP_PROFILE' | 'SETTINGS' | 'MANUAL'
  const [travelAdvanceOverride, setTravelAdvanceOverride] = useState(false);
  const [perdiemRate, setPerdiemRate] = useState(800);
  // Per diem thresholds: resolved from CompProfile (per-person) → Settings (global fallback)
  const [perdiemThresholds, setPerdiemThresholds] = useState({ full: 8, half: 3, source: '' });

  // Hospital picker state
  const { hospitals } = useHospitals();
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [activeHospitalPicker, setActiveHospitalPicker] = useState(null); // index of entry with open picker
  const hospitalPickerRef = useRef(null);

  // Close hospital picker on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (hospitalPickerRef.current && !hospitalPickerRef.current.contains(e.target)) {
        setActiveHospitalPicker(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadSmers = useCallback(async () => {
    try {
      const res = await getSmerList({ period, cycle });
      setSmers(res?.data || []);
    } catch (err) { console.error('[SMER]', err.message); showError(err, 'Could not load SMER list'); }
  }, [period, cycle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSmers(); }, [loadSmers]);

  useEffect(() => {
    if (settings) {
      setPerdiemRate(settings.PERDIEM_RATE_DEFAULT || 800);
      // Set global fallback thresholds; per-person overrides load when SMER is opened
      if (!perdiemThresholds.source) {
        setPerdiemThresholds(prev => ({ ...prev, full: settings.PERDIEM_MD_FULL ?? 8, half: settings.PERDIEM_MD_HALF ?? 3 }));
      }
    }
  }, [settings, perdiemThresholds.source]);

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
        hospital_ids: [],
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
    // Uses resolved thresholds (CompProfile per-person → Settings global fallback)
    const fullThreshold = perdiemThresholds.full;
    const halfThreshold = perdiemThresholds.half;
    if (count >= fullThreshold) return { tier: 'FULL', amount: perdiemRate };
    if (count >= halfThreshold) return { tier: 'HALF', amount: Math.round(perdiemRate * 0.5 * 100) / 100 };
    return { tier: 'ZERO', amount: 0 };
  };

  const handleNewSmer = async () => {
    setEditingSmer(null);
    setDailyEntries(generateDays());
    setTravelAdvanceOverride(false);
    // Fetch revolving fund + per diem config in parallel
    try {
      const [rfRes, pdRes] = await Promise.all([
        getRevolvingFundAmount(),
        getPerdiemConfig()
      ]);
      const { amount, source } = rfRes?.data || {};
      setTravelAdvance(amount || 0);
      setTravelAdvanceSource(source || 'SETTINGS');
      const pd = pdRes?.data || {};
      setPerdiemThresholds({ full: pd.fullThreshold ?? 8, half: pd.halfThreshold ?? 3, source: pd.source || '' });
    } catch {
      setTravelAdvance(0);
      setTravelAdvanceSource('');
    }
    setShowForm(true);
  };

  const handleEditSmer = async (smer) => {
    try {
      const [res, pdRes] = await Promise.all([
        getSmerById(smer._id),
        getPerdiemConfig()
      ]);
      const data = res?.data;
      setEditingSmer(data);
      setDailyEntries(data.daily_entries || []);
      setTravelAdvance(data.travel_advance || 0);
      setTravelAdvanceSource('');
      setTravelAdvanceOverride(false);
      setPerdiemRate(data.perdiem_rate || 800);
      const pd = pdRes?.data || {};
      setPerdiemThresholds({ full: pd.fullThreshold ?? 8, half: pd.halfThreshold ?? 3, source: pd.source || '' });
      setShowForm(true);
    } catch (err) { console.error('[SMER]', err.message); showError(err, 'Could not load SMER'); }
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
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current || loading) return; // prevent double-submit on slow mobile
    // Frontend validation: activity_type required when md_count > 0
    const issues = [];
    dailyEntries.forEach(e => {
      if (e.md_count > 0 && !e.activity_type) issues.push(`${e.day_of_week} ${e.entry_date?.split('T')[0] || ''}: Activity type required when MDs > 0`);
    });
    if (issues.length) { showError(null, issues.join('. ')); return; }

    const data = {
      period, cycle,
      perdiem_rate: perdiemRate,
      travel_advance: travelAdvance,
      daily_entries: dailyEntries
    };
    setSaveError(null);
    savingRef.current = true;
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
    } finally { savingRef.current = false; }
  };

  // CRM pull — only for field BDMs with CRM visit data
  const isCrmLinked = user?.role === ROLES.CONTRACTOR; // field BDMs have CRM visits
  const handlePullFromCrm = async () => {
    try {
      const res = await getSmerCrmMdCounts(period, cycle);
      const crmEntries = res?.data?.daily_entries || [];
      if (!crmEntries.length) return;
      const crmMap = Object.fromEntries(crmEntries.map(e => [e.entry_date, e]));

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

  const handleValidate = async () => { try { await validateSmer(); loadSmers(); } catch (err) { showError(err, 'Could not validate SMER'); } };
  const handleSubmit = async () => { try { await submitSmer(); loadSmers(); } catch (err) { showError(err, 'Could not submit SMER'); } };
  const handleReopen = async (id) => { try { await reopenSmer([id]); loadSmers(); } catch (err) { showError(err, 'Could not reopen SMER'); } };
  const handleDelete = async (id) => { try { await deleteDraftSmer(id); loadSmers(); } catch (err) { showError(err, 'Could not delete SMER'); } };

  const isManagement = ROLE_SETS.MANAGEMENT.includes(user?.role);

  // Override Request Modal state
  const [overrideModal, setOverrideModal] = useState(null); // { index, entry }
  const [overrideForm, setOverrideForm] = useState({ tier: 'FULL', reason: '' });
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);

  const handleOverride = (index) => {
    const entry = dailyEntries[index];
    if (!editingSmer?._id) {
      showError(null, 'Save the SMER first before requesting an override.');
      return;
    }
    setOverrideForm({ tier: 'FULL', reason: '' });
    setOverrideModal({ index, entry });
  };

  const handleOverrideSubmit = async () => {
    if (!overrideModal) return;
    const { index, entry } = overrideModal;
    const { tier, reason } = overrideForm;
    if (!reason.trim()) { showError(null, 'Please enter a reason for the override.'); return; }

    setOverrideSubmitting(true);
    try {
      const res = await overridePerdiemDay(editingSmer._id, {
        entry_id: entry._id,
        override_tier: tier,
        override_reason: reason.trim(),
      });
      if (res?.approval_pending) {
        // Approval required — update local entry with pending state
        const smerData = res?.data;
        if (smerData?.daily_entries) {
          setDailyEntries(smerData.daily_entries);
        } else {
          setDailyEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], override_status: 'PENDING', requested_override_tier: tier, override_reason: reason.trim() };
            return updated;
          });
        }
        setOverrideModal(null);
      } else {
        // No approval rules — override applied directly
        const smerData = res?.data;
        if (smerData?.daily_entries) {
          setDailyEntries(smerData.daily_entries);
        } else {
          const { amount } = computePerdiem(tier === 'FULL' ? 999 : 3);
          setDailyEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], perdiem_override: true, override_tier: tier, override_reason: reason, perdiem_tier: tier, perdiem_amount: amount };
            return updated;
          });
        }
        setOverrideModal(null);
      }
    } catch (err) {
      if (err?.response?.status === 202 || err?.response?.data?.approval_pending) {
        const smerData = err?.response?.data?.data;
        if (smerData?.daily_entries) {
          setDailyEntries(smerData.daily_entries);
        } else {
          setDailyEntries(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], override_status: 'PENDING', requested_override_tier: tier, override_reason: reason.trim() };
            return updated;
          });
        }
        setOverrideModal(null);
      } else {
        showError(err, 'Could not request override');
      }
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleRemoveOverride = async (index) => {
    const entry = dailyEntries[index];
    if (editingSmer?._id && entry._id) {
      try {
        const res = await overridePerdiemDay(editingSmer._id, {
          entry_id: entry._id,
          remove_override: true,
        });
        if (res?.data?.daily_entries) {
          setDailyEntries(res.data.daily_entries);
          return;
        }
      } catch (err) {
        showError(err, 'Could not remove override');
        return;
      }
    }
    // Fallback: local state update for unsaved SMERs
    setDailyEntries(prev => {
      const updated = [...prev];
      const e = updated[index];
      const { tier, amount } = computePerdiem(e.md_count || 0);
      updated[index] = { ...e, perdiem_override: false, override_tier: undefined, override_reason: undefined, perdiem_tier: tier, perdiem_amount: amount };
      return updated;
    });
  };

  // Hospital multi-picker helpers
  const handleAddHospital = (entryIdx, hospital) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      const entry = { ...updated[entryIdx] };
      const ids = [...(entry.hospital_ids || [])];
      if (!ids.includes(hospital._id)) ids.push(hospital._id);
      entry.hospital_ids = ids;
      // Auto-fill hospital_covered as comma-joined names
      entry.hospital_covered = ids.map(id => {
        const h = hospitals.find(h => h._id === id);
        return h?.hospital_name || id;
      }).join(', ');
      updated[entryIdx] = entry;
      return updated;
    });
    setActiveHospitalPicker(null);
    setHospitalSearch('');
  };

  const handleRemoveHospital = (entryIdx, hospitalId) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      const entry = { ...updated[entryIdx] };
      const ids = (entry.hospital_ids || []).filter(id => id !== hospitalId);
      entry.hospital_ids = ids;
      entry.hospital_covered = ids.map(id => {
        const h = hospitals.find(h => h._id === id);
        return h?.hospital_name || id;
      }).join(', ');
      updated[entryIdx] = entry;
      return updated;
    });
  };

  const filteredHospitals = (entryIdx) => {
    const entry = dailyEntries[entryIdx];
    const selectedIds = entry?.hospital_ids || [];
    const q = hospitalSearch.toLowerCase();
    return hospitals
      .filter(h => !selectedIds.includes(h._id))
      .filter(h => !q || h.hospital_name?.toLowerCase().includes(q))
      .slice(0, 15);
  };

  // Hospital chip renderer
   
  const HospitalChips = ({ entryIdx }) => {
    const entry = dailyEntries[entryIdx];
    const ids = entry?.hospital_ids || [];
    if (!ids.length && entry?.activity_type !== 'Field') return null;
    return (
      <div className="hospital-chips">
        {ids.map(id => {
          const h = hospitals.find(h => h._id === id);
          return (
            <span key={id} className="hospital-chip">
              {h?.hospital_name || id}
              <button onClick={() => handleRemoveHospital(entryIdx, id)}>&times;</button>
            </span>
          );
        })}
        {entry?.activity_type === 'Field' && (
          <span style={{ position: 'relative', display: 'inline-block' }} ref={activeHospitalPicker === entryIdx ? hospitalPickerRef : undefined}>
            <button
              onClick={() => { setActiveHospitalPicker(activeHospitalPicker === entryIdx ? null : entryIdx); setHospitalSearch(''); }}
              style={{ padding: '1px 6px', borderRadius: 10, border: '1px dashed #93c5fd', background: '#f8fafc', color: '#3b82f6', fontSize: 11, cursor: 'pointer' }}
            >+ Hospital</button>
            {activeHospitalPicker === entryIdx && (
              <div className="hospital-picker-dropdown">
                <input
                  autoFocus
                  placeholder="Search hospital..."
                  value={hospitalSearch}
                  onChange={e => setHospitalSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: 'none', borderBottom: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
                />
                {filteredHospitals(entryIdx).map(h => (
                  <div key={h._id} className="hospital-picker-item" onClick={() => handleAddHospital(entryIdx, h)}>
                    {h.hospital_name}
                  </div>
                ))}
                {filteredHospitals(entryIdx).length === 0 && (
                  <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 12 }}>No hospitals found</div>
                )}
              </div>
            )}
          </span>
        )}
      </div>
    );
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
      <style>{smerMobileStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main" style={{ padding: 24 }}>
          <WorkflowGuide pageKey="smer" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ margin: 0, color: 'var(--erp-text, #132238)' }}>SMER — Per Diem</h1>
            <Link to="/erp/expenses" style={{ color: 'var(--erp-accent, #1e5eff)', fontSize: 14 }}>&larr; Back to Expenses</Link>
          </div>

          {/* Period/Cycle selector */}
          <div className="smer-controls" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }} />
            <SelectField value={cycle} onChange={e => setCycle(e.target.value)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)' }}>
              <option value="C1">Cycle 1 (1st-15th)</option>
              <option value="C2">Cycle 2 (16th-end)</option>
              <option value="MONTHLY">Monthly</option>
            </SelectField>
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
              <div className="smer-summary-row" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
                <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Advance:{' '}
                  {travelAdvanceOverride ? (
                    <input type="number" value={travelAdvance} onChange={e => setTravelAdvance(Number(e.target.value))} style={{ width: 90, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)' }} />
                  ) : (
                    <span style={{ fontWeight: 600 }}>{'\u20B1'}{travelAdvance.toLocaleString()}</span>
                  )}
                  <button type="button" onClick={() => { const next = !travelAdvanceOverride; setTravelAdvanceOverride(next); if (next) setTravelAdvanceSource('MANUAL'); }} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', background: travelAdvanceOverride ? '#fef3c7' : 'transparent', cursor: 'pointer', color: 'var(--erp-muted)' }}>
                    {travelAdvanceOverride ? 'Lock' : 'Override'}
                  </button>
                  {travelAdvanceSource && !travelAdvanceOverride && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 2 }}>{travelAdvanceSource === 'COMP_PROFILE' ? 'CompProfile' : 'Default'}</span>}
                </span>
                {isCrmLinked && (
                  <button onClick={handlePullFromCrm} disabled={loading} style={{ padding: '4px 14px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Pull from CRM</button>
                )}
                <span style={{ fontSize: 11, color: 'var(--erp-muted, #5f7188)' }}>
                  Full ≥ {perdiemThresholds.full} | Half ≥ {perdiemThresholds.half}
                  {perdiemThresholds.source === 'COMP_PROFILE' && <span style={{ marginLeft: 4, color: '#2563eb', fontWeight: 600 }}>(per-person)</span>}
                </span>
              </div>
              {isCrmLinked && (
                <div style={{ padding: '6px 12px', marginBottom: 12, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                  BDMs: Click <strong>Pull from CRM</strong> to auto-fill MDs/Engagements from your logged visits. You can still edit manually after pulling.
                </div>
              )}

              {/* Daily Entries Grid — Desktop */}
              <div className="smer-desktop-grid" style={{ overflowX: 'auto', marginBottom: 16 }}>
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
                      <th style={{ padding: 6, textAlign: 'center', width: 65 }}>Ovrd</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>P2P</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>Special</th>
                      <th style={{ padding: 6, textAlign: 'right', width: 70 }}>ORE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyEntries.map((entry, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--erp-border, #dbe4f0)', background: entry.perdiem_override ? '#faf5ff' : entry.override_status === 'PENDING' ? '#fffbeb' : entry.override_status === 'REJECTED' ? '#fef2f2' : undefined }}>
                        <td style={{ padding: 3, textAlign: 'center', fontSize: 11 }}>{displayDate(entry.entry_date).slice(0, 5)}</td>
                        <td style={{ padding: 3, textAlign: 'center', fontSize: 10, color: 'var(--erp-muted, #5f7188)' }}>{entry.day_of_week}</td>
                        <td style={{ padding: 3 }}>
                          <SelectField value={entry.activity_type || entry.hospital_covered || ''} onChange={e => handleEntryChange(idx, 'activity_type', e.target.value)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 }}>
                            <option value="">—</option>
                            {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </SelectField>
                        </td>
                        <td style={{ padding: 3 }}>
                          <input placeholder="Details..." value={entry.notes || ''} onChange={e => handleEntryChange(idx, 'notes', e.target.value)} style={{ width: '100%', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 11 }} />
                          <HospitalChips entryIdx={idx} />
                        </td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          <input type="number" min={0} value={entry.md_count} onChange={e => handleEntryChange(idx, 'md_count', Number(e.target.value))} style={{ width: 45, padding: '2px 3px', textAlign: 'center', borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 600, color: entry.perdiem_tier === 'FULL' ? '#16a34a' : entry.perdiem_tier === 'HALF' ? '#d97706' : '#9ca3af', background: entry.perdiem_tier === 'FULL' ? '#dcfce7' : entry.perdiem_tier === 'HALF' ? '#fef3c7' : '#f3f4f6' }}>
                            {entry.perdiem_tier}
                          </span>
                          {entry.perdiem_override && <span title={entry.override_reason} style={{ marginLeft: 1, cursor: 'help', fontSize: 9, color: '#7c3aed' }}>★</span>}
                          {entry.override_status === 'PENDING' && <div style={{ fontSize: 8, fontWeight: 600, color: '#92400e' }}>REQ: {entry.requested_override_tier}</div>}
                          {entry.override_status === 'REJECTED' && <div style={{ fontSize: 8, fontWeight: 600, color: '#991b1b' }}>REJECTED</div>}
                        </td>
                        <td style={{ padding: 3, textAlign: 'right', fontWeight: 500, fontSize: 12 }}>₱{(entry.perdiem_amount || 0).toLocaleString()}</td>
                        <td style={{ padding: 3, textAlign: 'center' }}>
                          {entry.perdiem_override ? (
                            isManagement ? (
                              <button onClick={() => handleRemoveOverride(idx)} title={entry.override_reason} style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid #7c3aed', color: '#7c3aed', background: '#f5f3ff', cursor: 'pointer' }}>Undo</button>
                            ) : (
                              <span title={entry.override_reason} style={{ fontSize: 9, color: '#7c3aed' }}>&#9733;</span>
                            )
                          ) : entry.override_status === 'PENDING' ? (
                            <span title={`Requested: ${entry.requested_override_tier}`} style={{ padding: '1px 4px', fontSize: 8, borderRadius: 4, fontWeight: 600, color: '#92400e', background: '#fef3c7' }}>Pending</span>
                          ) : entry.override_status === 'REJECTED' ? (
                            <button onClick={() => handleOverride(idx)} title="Previous request was rejected — retry" style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid #ef4444', color: '#ef4444', background: '#fef2f2', cursor: 'pointer' }}>Retry</button>
                          ) : (
                            <button onClick={() => handleOverride(idx)} style={{ padding: '1px 5px', fontSize: 9, borderRadius: 4, border: '1px solid var(--erp-border, #dbe4f0)', color: 'var(--erp-muted)', background: '#fff', cursor: 'pointer' }}>+</button>
                          )}
                        </td>
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
                      <td colSpan={7} style={{ padding: 6, textAlign: 'right' }}>Totals:</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.perdiem.toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.transpo.toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.special.toLocaleString()}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>₱{totals.ore.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Daily Entries — Mobile Card Layout */}
              <div className="smer-mobile-cards" style={{ marginBottom: 16 }}>
                {dailyEntries.map((entry, idx) => (
                  <div key={idx} className="smer-card" style={entry.perdiem_override ? { borderColor: '#c4b5fd', background: '#faf5ff' } : entry.override_status === 'PENDING' ? { borderColor: '#fbbf24', background: '#fffbeb' } : entry.override_status === 'REJECTED' ? { borderColor: '#fca5a5', background: '#fef2f2' } : undefined}>
                    <div className="smer-card-header">
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{entry.day_of_week}</span>
                        <span style={{ marginLeft: 8, color: 'var(--erp-muted, #5f7188)', fontSize: 13 }}>{displayDate(entry.entry_date)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, color: entry.perdiem_tier === 'FULL' ? '#16a34a' : entry.perdiem_tier === 'HALF' ? '#d97706' : '#9ca3af', background: entry.perdiem_tier === 'FULL' ? '#dcfce7' : entry.perdiem_tier === 'HALF' ? '#fef3c7' : '#f3f4f6' }}>
                          {entry.perdiem_tier} — ₱{(entry.perdiem_amount || 0).toLocaleString()}
                          {entry.perdiem_override && <span style={{ marginLeft: 4, color: '#7c3aed' }}>★</span>}
                        </span>
                        {entry.override_status === 'PENDING' && <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: '#92400e', background: '#fef3c7' }}>PENDING</span>}
                        {entry.override_status === 'REJECTED' && <span style={{ padding: '1px 5px', borderRadius: 4, fontSize: 9, fontWeight: 600, color: '#991b1b', background: '#fee2e2' }}>REJECTED</span>}
                      </div>
                    </div>
                    <div className="smer-card-fields">
                      <div className="smer-card-field">
                        <label>Activity</label>
                        <select value={entry.activity_type || ''} onChange={e => handleEntryChange(idx, 'activity_type', e.target.value)}>
                          <option value="">—</option>
                          {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="smer-card-field">
                        <label>MDs / Eng.</label>
                        <input type="number" min={0} value={entry.md_count} onChange={e => handleEntryChange(idx, 'md_count', Number(e.target.value))} />
                      </div>
                      <div className="smer-card-field full-width">
                        <label>Hospitals</label>
                        <HospitalChips entryIdx={idx} />
                      </div>
                      <div className="smer-card-field full-width">
                        <label>Notes</label>
                        <input placeholder="Details..." value={entry.notes || ''} onChange={e => handleEntryChange(idx, 'notes', e.target.value)} />
                      </div>
                      <div className="smer-card-field">
                        <label>P2P Transport</label>
                        <input type="number" min={0} value={entry.transpo_p2p || 0} onChange={e => handleEntryChange(idx, 'transpo_p2p', Number(e.target.value))} />
                      </div>
                      <div className="smer-card-field">
                        <label>Special Transport</label>
                        <input type="number" min={0} value={entry.transpo_special || 0} onChange={e => handleEntryChange(idx, 'transpo_special', Number(e.target.value))} />
                      </div>
                      <div className="smer-card-field">
                        <label>ORE Amount</label>
                        <input type="number" min={0} value={entry.ore_amount || 0} onChange={e => handleEntryChange(idx, 'ore_amount', Number(e.target.value))} />
                      </div>
                      <div className="smer-card-field">
                        <label>Override</label>
                        {entry.perdiem_override ? (
                          isManagement ? (
                            <button onClick={() => handleRemoveOverride(idx)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #7c3aed', color: '#7c3aed', background: '#f5f3ff', cursor: 'pointer', fontSize: 12, width: '100%' }}>
                              Undo ({entry.override_reason?.slice(0, 20)})
                            </button>
                          ) : (
                            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>★ Overridden</span>
                          )
                        ) : entry.override_status === 'PENDING' ? (
                          <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fef3c7', display: 'block', textAlign: 'center' }}>Pending approval...</span>
                        ) : entry.override_status === 'REJECTED' ? (
                          <button onClick={() => handleOverride(idx)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444', color: '#ef4444', background: '#fef2f2', cursor: 'pointer', fontSize: 12, width: '100%' }}>
                            Retry Override
                          </button>
                        ) : (
                          <button onClick={() => handleOverride(idx)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', color: 'var(--erp-muted)', background: '#fff', cursor: 'pointer', fontSize: 12, width: '100%' }}>
                            + Override
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {/* Mobile totals */}
                <div className="smer-card" style={{ background: 'var(--erp-bg-alt, #f1f5f9)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <div>Per Diem: ₱{totals.perdiem.toLocaleString()}</div>
                    <div>Transport: ₱{totals.transpo.toLocaleString()}</div>
                    <div>Special: ₱{totals.special.toLocaleString()}</div>
                    <div>ORE: ₱{totals.ore.toLocaleString()}</div>
                  </div>
                </div>
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

      {/* Override Request Modal */}
      {overrideModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => !overrideSubmitting && setOverrideModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Override Per Diem — Day {overrideModal.entry?.day}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--erp-muted, #5f7188)' }}>
              Current: {overrideModal.entry?.md_count || 0} engagements = {overrideModal.entry?.perdiem_tier} (₱{(overrideModal.entry?.perdiem_amount || 0).toLocaleString()})
            </p>

            {/* Info banner for non-management */}
            {!isManagement && (
              <div style={{ padding: '8px 12px', marginBottom: 12, borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: 12 }}>
                This override requires approval from your admin/president. You will be notified once a decision is made.
              </div>
            )}

            {/* Tier selector */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--erp-muted, #5f7188)' }}>Override Tier</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {['FULL', 'HALF'].map(t => (
                <button key={t} type="button" onClick={() => setOverrideForm(f => ({ ...f, tier: t }))}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 6, border: `2px solid ${overrideForm.tier === t ? (t === 'FULL' ? '#16a34a' : '#d97706') : '#e5e7eb'}`, background: overrideForm.tier === t ? (t === 'FULL' ? '#dcfce7' : '#fef3c7') : '#fff', color: overrideForm.tier === t ? (t === 'FULL' ? '#166534' : '#92400e') : '#6b7280', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  {t} — ₱{(t === 'FULL' ? perdiemRate : Math.round(perdiemRate * 0.5)).toLocaleString()}
                </button>
              ))}
            </div>

            {/* Reason */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--erp-muted, #5f7188)' }}>Reason (required)</label>
            <textarea rows={3} placeholder='e.g. "Meeting with President", "Training day"' value={overrideForm.reason} onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setOverrideModal(null)} disabled={overrideSubmitting}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--erp-border, #dbe4f0)', background: '#fff', color: 'var(--erp-muted)', cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button type="button" onClick={handleOverrideSubmit} disabled={overrideSubmitting || !overrideForm.reason.trim()}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: isManagement ? '#7c3aed' : '#2563eb', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: overrideSubmitting || !overrideForm.reason.trim() ? 0.5 : 1 }}>
                {overrideSubmitting ? 'Submitting...' : isManagement ? 'Apply Override' : 'Request Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
