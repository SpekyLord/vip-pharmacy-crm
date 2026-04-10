import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLES, ROLE_SETS } from '../../constants/roles';
import useErpApi from '../hooks/useErpApi';
import { useLookupBatch } from '../hooks/useLookups';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const pageStyles = `
  .govr-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .govr-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .govr-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .govr-header h2 { font-size: 20px; font-weight: 700; margin: 0; color: var(--erp-text); }
  .govr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer; font-size: 13px; font-weight: 600; transition: .15s; }
  .btn-primary { background: var(--erp-accent, #2563eb); color: #fff; }
  .btn-primary:hover { opacity: .9; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .btn-sm { padding: 5px 10px; font-size: 12px; }
  .govr-tabs { display: flex; gap: 0; border-bottom: 2px solid var(--erp-border); margin-bottom: 16px; overflow-x: auto; }
  .govr-tab { padding: 10px 18px; font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; color: var(--erp-muted); white-space: nowrap; background: none; border-top: none; border-left: none; border-right: none; }
  .govr-tab.active { color: var(--erp-accent); border-bottom-color: var(--erp-accent); }
  .govr-panel { background: var(--erp-panel); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .govr-meta { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; align-items: flex-end; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group label { font-size: 11px; font-weight: 600; color: var(--erp-muted); text-transform: uppercase; }
  .form-group input, .form-group select { padding: 8px 12px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel); color: var(--erp-text); box-sizing: border-box; }
  .govr-table-wrap { overflow-x: auto; }
  .govr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .govr-table th { background: var(--erp-accent-soft, #e8efff); padding: 8px 10px; text-align: right; font-size: 11px; font-weight: 600; color: var(--erp-muted); white-space: nowrap; }
  .govr-table th:first-child { text-align: left; }
  .govr-table td { padding: 6px 8px; border-top: 1px solid var(--erp-border); }
  .govr-table td input { width: 100%; padding: 5px 8px; border: 1px solid var(--erp-border); border-radius: 6px; font-size: 13px; text-align: right; background: var(--erp-panel); color: var(--erp-text); box-sizing: border-box; }
  .govr-table tr:hover { background: var(--erp-accent-soft); }
  .govr-empty { text-align: center; color: var(--erp-muted); padding: 40px; }
  .govr-modal { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .govr-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 500px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .govr-modal-body h3 { margin: 0 0 16px; font-size: 16px; color: var(--erp-text); }
  .badge-active { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; background: #dcfce7; color: #166534; }
  .badge-expired { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; background: #fee2e2; color: #dc2626; }
  .govr-rate-card { border: 1px solid var(--erp-border); border-radius: 10px; padding: 14px; margin-bottom: 12px; background: var(--erp-panel); }
  .govr-rate-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px; }
  .upload-input { display: none; }
  @media(max-width: 768px) {
    .govr-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .govr-meta { flex-direction: column; }
    .govr-actions { width: 100%; }
    .govr-actions .btn { flex: 1; min-width: 0; }
  }
  @media(max-width: 375px) {
    .govr-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }
    .btn { font-size: 12px; padding: 6px 10px; }
    .form-group input, .form-group select { font-size: 16px; }
  }
`;

const fmt = (v) => v != null && v !== '' ? Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

export function GovernmentRatesContent() {
  const { user } = useAuth();
  const api = useErpApi();
  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  // Lookup-driven rate types (database-driven)
  const { data: lookups } = useLookupBatch(['GOV_RATE_TYPE', 'GOV_RATE_BRACKET_TYPE', 'GOV_RATE_FLAT_TYPE']);
  const RATE_TABS = (lookups.GOV_RATE_TYPE || []).map(o => ({ key: o.code, label: o.label }));
  const BRACKET_TYPES = (lookups.GOV_RATE_BRACKET_TYPE || []).map(o => o.code);
  const FLAT_TYPES = (lookups.GOV_RATE_FLAT_TYPE || []).map(o => o.code);

  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('SSS');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [form, setForm] = useState({ effective_date: '', expiry_date: '', notes: '', brackets: [], flat_rate: '', employee_split: '', employer_split: '', min_contribution: '', max_contribution: '', benefit_limits: [] });

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/government-rates');
      setRates(res?.data || []);
    } catch (err) { showError(err, 'Government rates operation failed'); }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRates(); }, [loadRates]);

  const filteredRates = rates.filter(r => r.rate_type === activeTab).sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
  const isActive = (r) => {
    const now = new Date();
    return new Date(r.effective_date) <= now && (!r.expiry_date || new Date(r.expiry_date) > now);
  };

  const openCreate = () => {
    const today = new Date().toISOString().slice(0, 10);
    if (BRACKET_TYPES.includes(activeTab)) {
      setForm({ effective_date: today, expiry_date: '', notes: '', brackets: [{ min_salary: 0, max_salary: '', employee_share: 0, employer_share: 0, ec: 0 }] });
    } else if (activeTab === 'DE_MINIMIS') {
      setForm({ effective_date: today, expiry_date: '', notes: '', benefit_limits: [{ benefit_code: '', description: '', limit_amount: 0, limit_period: 'MONTHLY' }] });
    } else {
      setForm({ effective_date: today, expiry_date: '', notes: '', flat_rate: '', employee_split: 0.5, employer_split: 0.5, min_contribution: '', max_contribution: '' });
    }
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (rate) => {
    setForm({
      effective_date: rate.effective_date ? new Date(rate.effective_date).toISOString().slice(0, 10) : '',
      expiry_date: rate.expiry_date ? new Date(rate.expiry_date).toISOString().slice(0, 10) : '',
      notes: rate.notes || '',
      brackets: rate.brackets?.map(b => ({ ...b })) || [],
      flat_rate: rate.flat_rate || '',
      employee_split: rate.employee_split || '',
      employer_split: rate.employer_split || '',
      min_contribution: rate.min_contribution || '',
      max_contribution: rate.max_contribution || '',
      benefit_limits: rate.benefit_limits?.map(b => ({ ...b })) || [],
    });
    setEditing(rate._id);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { rate_type: activeTab, effective_date: form.effective_date, notes: form.notes };
      if (form.expiry_date) payload.expiry_date = form.expiry_date;
      if (BRACKET_TYPES.includes(activeTab)) {
        payload.brackets = form.brackets.map(b => ({
          min_salary: Number(b.min_salary) || 0,
          max_salary: b.max_salary !== '' && b.max_salary != null ? Number(b.max_salary) : null,
          employee_share: Number(b.employee_share) || 0,
          employer_share: Number(b.employer_share) || 0,
          ec: Number(b.ec) || 0,
        }));
      } else if (activeTab === 'DE_MINIMIS') {
        payload.benefit_limits = form.benefit_limits;
      } else {
        payload.flat_rate = Number(form.flat_rate) || 0;
        payload.employee_split = Number(form.employee_split) || 0;
        payload.employer_split = Number(form.employer_split) || 0;
        payload.min_contribution = Number(form.min_contribution) || 0;
        payload.max_contribution = Number(form.max_contribution) || 0;
      }
      if (editing) {
        await api.put(`/government-rates/${editing}`, payload);
      } else {
        await api.post('/government-rates', payload);
      }
      setShowModal(false);
      loadRates();
    } catch (err) { showError(err, 'Government rates operation failed'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this rate schedule?')) return;
    try {
      await api.del(`/government-rates/${id}`);
      loadRates();
    } catch (err) { showError(err, 'Government rates operation failed'); }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/government-rates/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'government-rates-export.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { showError(err, 'Government rates operation failed'); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/government-rates/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSuccess(res?.message || 'Import complete');
      loadRates();
    } catch (err) { showError(err, 'Government rates operation failed'); }
    e.target.value = '';
  };

  // Bracket row helpers
  const addBracketRow = () => setForm(f => ({ ...f, brackets: [...f.brackets, { min_salary: 0, max_salary: '', employee_share: 0, employer_share: 0, ec: 0 }] }));
  const removeBracketRow = (i) => setForm(f => ({ ...f, brackets: f.brackets.filter((_, idx) => idx !== i) }));
  const updateBracket = (i, field, val) => setForm(f => ({ ...f, brackets: f.brackets.map((b, idx) => idx === i ? { ...b, [field]: val } : b) }));

  // Benefit limit helpers
  const addBenefitRow = () => setForm(f => ({ ...f, benefit_limits: [...f.benefit_limits, { benefit_code: '', description: '', limit_amount: 0, limit_period: 'MONTHLY' }] }));
  const removeBenefitRow = (i) => setForm(f => ({ ...f, benefit_limits: f.benefit_limits.filter((_, idx) => idx !== i) }));
  const updateBenefit = (i, field, val) => setForm(f => ({ ...f, benefit_limits: f.benefit_limits.map((b, idx) => idx === i ? { ...b, [field]: val } : b) }));

  const renderBracketTable = (brackets, readOnly = true) => (
    <div className="govr-table-wrap">
      <table className="govr-table">
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>#</th>
            <th>Min Salary</th>
            <th>Max Salary</th>
            <th>{activeTab === 'WITHHOLDING_TAX' ? 'Marginal Rate' : 'EE Share'}</th>
            <th>{activeTab === 'WITHHOLDING_TAX' ? 'Base Tax' : 'ER Share'}</th>
            {activeTab === 'SSS' && <th>EC</th>}
            {!readOnly && <th></th>}
          </tr>
        </thead>
        <tbody>
          {brackets.map((b, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td style={{ textAlign: 'right' }}>{readOnly ? fmt(b.min_salary) : <input type="number" value={b.min_salary} onChange={e => updateBracket(i, 'min_salary', e.target.value)} />}</td>
              <td style={{ textAlign: 'right' }}>{readOnly ? (b.max_salary != null && b.max_salary !== '' ? fmt(b.max_salary) : '∞') : <input type="number" value={b.max_salary} onChange={e => updateBracket(i, 'max_salary', e.target.value)} placeholder="∞" />}</td>
              <td style={{ textAlign: 'right' }}>{readOnly ? fmt(b.employee_share) : <input type="number" step="any" value={b.employee_share} onChange={e => updateBracket(i, 'employee_share', e.target.value)} />}</td>
              <td style={{ textAlign: 'right' }}>{readOnly ? fmt(b.employer_share) : <input type="number" step="any" value={b.employer_share} onChange={e => updateBracket(i, 'employer_share', e.target.value)} />}</td>
              {activeTab === 'SSS' && <td style={{ textAlign: 'right' }}>{readOnly ? fmt(b.ec) : <input type="number" step="any" value={b.ec} onChange={e => updateBracket(i, 'ec', e.target.value)} />}</td>}
              {!readOnly && <td><button className="btn btn-danger btn-sm" onClick={() => removeBracketRow(i)}>✕</button></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderFlatRate = (rate) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      <div className="form-group"><label>Flat Rate</label><div style={{ fontSize: 16, fontWeight: 600 }}>{rate.flat_rate != null ? `${(rate.flat_rate * 100).toFixed(2)}%` : '—'}</div></div>
      <div className="form-group"><label>EE Split</label><div style={{ fontSize: 16, fontWeight: 600 }}>{rate.employee_split != null ? `${(rate.employee_split * 100).toFixed(0)}%` : '—'}</div></div>
      <div className="form-group"><label>ER Split</label><div style={{ fontSize: 16, fontWeight: 600 }}>{rate.employer_split != null ? `${(rate.employer_split * 100).toFixed(0)}%` : '—'}</div></div>
      <div className="form-group"><label>Min Contribution</label><div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(rate.min_contribution) || '—'}</div></div>
      <div className="form-group"><label>Max Contribution</label><div style={{ fontSize: 16, fontWeight: 600 }}>{fmt(rate.max_contribution) || '—'}</div></div>
    </div>
  );

  const renderBenefitLimits = (limits) => (
    <div className="govr-table-wrap">
      <table className="govr-table">
        <thead><tr><th style={{ textAlign: 'left' }}>Code</th><th style={{ textAlign: 'left' }}>Description</th><th>Limit Amount</th><th>Period</th></tr></thead>
        <tbody>
          {(limits || []).map((b, i) => (
            <tr key={i}>
              <td>{b.benefit_code}</td>
              <td>{b.description}</td>
              <td style={{ textAlign: 'right' }}>{fmt(b.limit_amount)}</td>
              <td style={{ textAlign: 'right' }}>{b.limit_period}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <style>{pageStyles}</style>
          <div className="govr-header">
            <h2>Government Rates</h2>
            <div className="govr-actions">
              <button className="btn btn-outline" onClick={handleExport}>Export Excel</button>
              {isAdmin && <>
                <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
                  Import Excel
                  <input type="file" accept=".xlsx,.xls,.csv" className="upload-input" onChange={handleImport} />
                </label>
                <button className="btn btn-primary" onClick={openCreate}>+ New Rate</button>
              </>}
            </div>
          </div>

          <div className="govr-tabs">
            {RATE_TABS.map(t => (
              <button key={t.key} className={`govr-tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {loading ? (
            <div className="govr-empty">Loading...</div>
          ) : filteredRates.length === 0 ? (
            <div className="govr-empty">No {RATE_TABS.find(t => t.key === activeTab)?.label} rates found. {isAdmin && 'Click "+ New Rate" to add one.'}</div>
          ) : (
            filteredRates.map(rate => (
              <div key={rate._id} className="govr-rate-card">
                <div className="govr-rate-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className={isActive(rate) ? 'badge-active' : 'badge-expired'}>{isActive(rate) ? 'Active' : 'Expired'}</span>
                    <span style={{ fontSize: 13, color: 'var(--erp-muted)' }}>
                      Effective: {new Date(rate.effective_date).toLocaleDateString()}
                      {rate.expiry_date && ` — Expires: ${new Date(rate.expiry_date).toLocaleDateString()}`}
                    </span>
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(rate)}>Edit</button>
                      {[ROLES.ADMIN, ROLES.PRESIDENT].includes(user?.role) && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rate._id)}>Delete</button>}
                    </div>
                  )}
                </div>
                {rate.notes && <p style={{ fontSize: 12, color: 'var(--erp-muted)', margin: '0 0 10px' }}>{rate.notes}</p>}
                {BRACKET_TYPES.includes(activeTab) && renderBracketTable(rate.brackets || [])}
                {FLAT_TYPES.includes(activeTab) && renderFlatRate(rate)}
                {activeTab === 'DE_MINIMIS' && renderBenefitLimits(rate.benefit_limits)}
              </div>
            ))
          )}

          {/* Create / Edit Modal */}
          {showModal && (
            <div className="govr-modal" onClick={() => setShowModal(false)}>
              <div className="govr-modal-body" onClick={e => e.stopPropagation()}>
                <h3>{editing ? 'Edit' : 'New'} {RATE_TABS.find(t => t.key === activeTab)?.label} Rate</h3>
                <div className="govr-meta">
                  <div className="form-group"><label>Effective Date</label><input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} /></div>
                  <div className="form-group"><label>Expiry Date</label><input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} /></div>
                </div>
                <div className="form-group" style={{ marginBottom: 12 }}><label>Notes</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

                {BRACKET_TYPES.includes(activeTab) && <>
                  {renderBracketTable(form.brackets, false)}
                  <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={addBracketRow}>+ Add Bracket</button>
                </>}

                {FLAT_TYPES.includes(activeTab) && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group"><label>Flat Rate (decimal)</label><input type="number" step="any" value={form.flat_rate} onChange={e => setForm(f => ({ ...f, flat_rate: e.target.value }))} placeholder="e.g. 0.05 for 5%" /></div>
                    <div className="form-group"><label>EE Split (decimal)</label><input type="number" step="any" value={form.employee_split} onChange={e => setForm(f => ({ ...f, employee_split: e.target.value }))} /></div>
                    <div className="form-group"><label>ER Split (decimal)</label><input type="number" step="any" value={form.employer_split} onChange={e => setForm(f => ({ ...f, employer_split: e.target.value }))} /></div>
                    <div className="form-group"><label>Min Contribution</label><input type="number" value={form.min_contribution} onChange={e => setForm(f => ({ ...f, min_contribution: e.target.value }))} /></div>
                    <div className="form-group"><label>Max Contribution</label><input type="number" value={form.max_contribution} onChange={e => setForm(f => ({ ...f, max_contribution: e.target.value }))} /></div>
                  </div>
                )}

                {activeTab === 'DE_MINIMIS' && <>
                  <div className="govr-table-wrap">
                    <table className="govr-table">
                      <thead><tr><th style={{ textAlign: 'left' }}>Code</th><th style={{ textAlign: 'left' }}>Description</th><th>Limit Amount</th><th>Period</th><th></th></tr></thead>
                      <tbody>
                        {form.benefit_limits.map((b, i) => (
                          <tr key={i}>
                            <td><input value={b.benefit_code} onChange={e => updateBenefit(i, 'benefit_code', e.target.value)} style={{ textAlign: 'left' }} /></td>
                            <td><input value={b.description} onChange={e => updateBenefit(i, 'description', e.target.value)} style={{ textAlign: 'left' }} /></td>
                            <td><input type="number" value={b.limit_amount} onChange={e => updateBenefit(i, 'limit_amount', Number(e.target.value))} /></td>
                            <td>
                              <select value={b.limit_period} onChange={e => updateBenefit(i, 'limit_period', e.target.value)} style={{ padding: '5px 8px', border: '1px solid var(--erp-border)', borderRadius: 6, fontSize: 13, background: 'var(--erp-panel)', color: 'var(--erp-text)' }}>
                                <option value="MONTHLY">MONTHLY</option><option value="YEARLY">YEARLY</option>
                              </select>
                            </td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => removeBenefitRow(i)}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={addBenefitRow}>+ Add Benefit</button>
                </>}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                  <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                </div>
              </div>
            </div>
          )}
    </>
  );
}

export default function GovernmentRates() {
  return (
    <div className="govr-page">
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main className="govr-main admin-main">
          <WorkflowGuide pageKey="government-rates" />
          <GovernmentRatesContent />
        </main>
      </div>
    </div>
  );
}
