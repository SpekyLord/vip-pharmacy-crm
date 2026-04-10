import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePeople from '../hooks/usePeople';

import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';

const STATUS_LIST_FALLBACK = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED'];

const TYPE_COLORS = {
  BDM: { bg: '#dbeafe', text: '#1e40af' },
  ECOMMERCE_BDM: { bg: '#e0e7ff', text: '#3730a3' },
  EMPLOYEE: { bg: '#dcfce7', text: '#166534' },
  SALES_REP: { bg: '#fef3c7', text: '#92400e' },
  CONSULTANT: { bg: '#f3e8ff', text: '#6b21a8' },
  DIRECTOR: { bg: '#fce7f3', text: '#9d174d' },
};

const STATUS_COLORS = {
  ACTIVE: { bg: '#dcfce7', text: '#166534' },
  ON_LEAVE: { bg: '#fef3c7', text: '#92400e' },
  SUSPENDED: { bg: '#fee2e2', text: '#dc2626' },
  SEPARATED: { bg: '#f3f4f6', text: '#6b7280' },
};

const pageStyles = `
  .ppl-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .ppl-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .ppl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .ppl-header h2 { font-size: 20px; font-weight: 700; color: var(--erp-text, #1a1a2e); margin: 0; }
  .ppl-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .ppl-filters input, .ppl-filters select { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--erp-border, #d1d5db); font-size: 13px; }
  .ppl-filters input { min-width: 180px; }
  .ppl-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .ppl-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; color: var(--erp-muted, #64748b); }
  .ppl-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border, #e5e7eb); }
  .ppl-table tr:hover { background: var(--erp-accent-soft, #f0f4ff); cursor: pointer; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .ppl-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }
  .ppl-panel { background: var(--erp-panel, #fff); border-radius: 16px; padding: 24px; width: 95%; max-width: 550px; max-height: 85vh; overflow-y: auto; }
  .ppl-field { margin-bottom: 10px; }
  .ppl-field label { display: block; font-size: 12px; font-weight: 600; color: var(--erp-muted); margin-bottom: 3px; }
  .ppl-field input, .ppl-field select { width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .ppl-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ppl-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  .ppl-empty { text-align: center; color: #64748b; padding: 40px; }
  .ppl-pag { display: flex; justify-content: center; gap: 8px; margin-top: 14px; }
  .ppl-pag button { padding: 4px 12px; border-radius: 6px; border: 1px solid var(--erp-border); background: var(--erp-panel); font-size: 12px; cursor: pointer; }
  .ppl-pag button.active { background: var(--erp-accent); color: #fff; border-color: var(--erp-accent); }
  @media(max-width: 768px) { .ppl-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .ppl-table { font-size: 12px; } }
  @media(max-width: 375px) { .ppl-main { padding: 8px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .ppl-main input, .ppl-main select { font-size: 16px; } }
`;

const EMPTY_FORM = {
  first_name: '', last_name: '', full_name: '', person_type: 'EMPLOYEE',
  email: '', phone: '', password: '',
  position: '', department: '', reports_to: null,
  employment_type: 'REGULAR', status: 'ACTIVE',
  create_login: true,
};

export function PeopleListContent() {
  const navigate = useNavigate();
  const api = usePeople();
  const { options: personTypeOpts } = useLookupOptions('PERSON_TYPE');
  const { options: statusOpts } = useLookupOptions('PEOPLE_STATUS');
  const STATUS_LIST = statusOpts.length > 0 ? statusOpts.map(s => s.code) : STATUS_LIST_FALLBACK;
  const PERSON_TYPES = personTypeOpts.map(o => o.code);
  const { options: empTypeOpts } = useLookupOptions('EMPLOYMENT_TYPE');
  const EMP_TYPES = empTypeOpts.map(o => o.code);
  const [people, setPeople] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: '', person_type: '', status: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [legacyCounts, setLegacyCounts] = useState({});
  const [migrating, setMigrating] = useState(false);

  const load = useCallback(async (page = 1, bust = false) => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (filters.search) params.search = filters.search;
      if (filters.person_type) params.person_type = filters.person_type;
      if (filters.status) params.status = filters.status;
      if (bust) params._t = Date.now(); // bypass 304 cache after mutations
      const res = await api.getPeopleList(params);
      setPeople(res?.data || []);
      setPagination(res?.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch (err) { console.error('[PeopleList] load error:', err.message); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  // Check for legacy roles on mount
  useEffect(() => {
    api.getLegacyRoleCounts().then(res => setLegacyCounts(res?.data || {})).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBulkMigrate = async (fromRole, toRole) => {
    if (!window.confirm(`Migrate ALL "${fromRole}" users to "${toRole}"? This cannot be undone.`)) return;
    setMigrating(true);
    try {
      const res = await api.bulkChangeRole(fromRole, toRole);
      showSuccess(res?.message || `Migrated ${res?.data?.migrated_count || 0} user(s)`);
      setLegacyCounts(prev => { const next = { ...prev }; delete next[fromRole]; return next; });
      load(1, true);
    } catch (err) { showError(err, 'Could not migrate roles'); } finally { setMigrating(false); }
  };

  const handleCreate = async () => {
    try {
      await api.createPersonUnified({
        ...form,
        reports_to: form.reports_to || null,
        create_login: form.create_login && form.email && form.password,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      load(1, true);
    } catch (err) { showError(err, 'Could not create person'); }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <WorkflowGuide pageKey="people-list" />

      {/* Legacy Role Migration Banner */}
      {Object.keys(legacyCounts).length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Legacy Roles Detected</span>
            <span style={{ fontSize: 12, color: '#78350f', marginLeft: 8 }}>
              {Object.entries(legacyCounts).map(([role, count]) => `${count} ${role} user(s)`).join(', ')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {legacyCounts.medrep > 0 && (
              <button disabled={migrating} onClick={() => handleBulkMigrate('medrep', 'contractor')}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 600, fontSize: 12, cursor: migrating ? 'not-allowed' : 'pointer', opacity: migrating ? 0.6 : 1 }}>
                {migrating ? 'Migrating...' : `Migrate medrep → contractor`}
              </button>
            )}
            {legacyCounts.employee > 0 && (
              <button disabled={migrating} onClick={() => handleBulkMigrate('employee', 'contractor')}
                style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 600, fontSize: 12, cursor: migrating ? 'not-allowed' : 'pointer', opacity: migrating ? 0.6 : 1 }}>
                {migrating ? 'Migrating...' : `Migrate employee → contractor`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="ppl-header">
        <h2>People Master</h2>
        <button
          style={{ padding: '8px 16px', borderRadius: 6, background: syncing ? '#6d28d9' : '#7c3aed', color: '#fff', border: 'none', cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13, marginRight: 8, opacity: syncing ? 0.7 : 1 }}
          disabled={syncing}
          onClick={async () => {
            setSyncing(true);
            try {
              const res = await api.post('/people/sync-from-crm', {});
              showSuccess(res?.message || `Synced: ${res?.data?.created || 0} created, ${res?.data?.skipped || 0} already exist`);
              load(1, true);
            } catch (err) { showError(err, 'Could not sync from CRM'); } finally { setSyncing(false); }
          }}>{syncing ? 'Syncing...' : 'Sync from CRM'}</button>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Person</button>
      </div>

      <div className="ppl-filters">
        <input placeholder="Search name..." value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        <SelectField value={filters.person_type} onChange={e => setFilters(f => ({ ...f, person_type: e.target.value }))}>
          <option value="">All Types</option>
          {PERSON_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </SelectField>
        <SelectField value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </SelectField>
      </div>

      {loading ? (
        <div className="ppl-empty">Loading...</div>
      ) : !people.length ? (
        <div className="ppl-empty">No people found</div>
      ) : (
        <>
          <table className="ppl-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email / Phone</th>
                <th>Type</th>
                <th>Position</th>
                <th>Department</th>
                <th>Reports To</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const tc = TYPE_COLORS[p.person_type] || { bg: '#f3f4f6', text: '#374151' };
                const sc = STATUS_COLORS[p.status] || { bg: '#f3f4f6', text: '#6b7280' };
                return (
                  <tr key={p._id} onClick={() => navigate(`/erp/people/${p._id}`)}>
                    <td style={{ fontWeight: 500 }}>{p.full_name}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.email && <div style={{ color: '#1e40af' }}>{p.email}</div>}
                      {p.phone && <div style={{ color: '#64748b' }}>{p.phone}</div>}
                      {!p.email && !p.phone && '—'}
                    </td>
                    <td><span className="badge" style={{ background: tc.bg, color: tc.text }}>{p.person_type.replace(/_/g, ' ')}</span></td>
                    <td>{p.position || '—'}</td>
                    <td>{p.department || '—'}</td>
                    <td style={{ fontSize: 12, color: '#64748b' }}>{p.reports_to?.full_name || '—'}</td>
                    <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{p.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination.pages > 1 && (
            <div className="ppl-pag">
              {Array.from({ length: pagination.pages }, (_, i) => (
                <button key={i} className={pagination.page === i + 1 ? 'active' : ''} onClick={() => load(i + 1)}>{i + 1}</button>
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="ppl-modal" onClick={() => setShowForm(false)}>
          <div className="ppl-panel" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Add Person</h3>
            <div className="ppl-row2">
              <div className="ppl-field">
                <label>First Name *</label>
                <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="ppl-field">
                <label>Last Name *</label>
                <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="ppl-row2">
              <div className="ppl-field">
                <label>Email{form.create_login ? ' *' : ''}</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div className="ppl-field">
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+639171234567" />
              </div>
            </div>
            <div className="ppl-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.create_login} onChange={e => setForm(f => ({ ...f, create_login: e.target.checked }))} id="create_login" />
              <label htmlFor="create_login" style={{ margin: 0, cursor: 'pointer' }}>Create system login (allows this person to log in to CRM/ERP)</label>
            </div>
            {form.create_login && (
              <div className="ppl-field">
                <label>Password *</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 chars, upper+lower+number+special" />
              </div>
            )}
            <div className="ppl-row2">
              <div className="ppl-field">
                <label>Person Type</label>
                <SelectField value={form.person_type} onChange={e => setForm(f => ({ ...f, person_type: e.target.value }))}>
                  {PERSON_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </SelectField>
              </div>
              <div className="ppl-field">
                <label>Employment Type</label>
                <SelectField value={form.employment_type} onChange={e => setForm(f => ({ ...f, employment_type: e.target.value }))}>
                  {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </SelectField>
              </div>
            </div>
            <div className="ppl-row2">
              <div className="ppl-field">
                <label>Position</label>
                <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
              </div>
              <div className="ppl-field">
                <label>Department</label>
                <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
              </div>
            </div>
            <div className="ppl-field">
              <label>Reports To</label>
              <SelectField value={form.reports_to || ''} onChange={e => setForm(f => ({ ...f, reports_to: e.target.value || null }))}>
                <option value="">None (Top Level)</option>
                {people.filter(p => p._id !== form._id).map(p => (
                  <option key={p._id} value={p._id}>{p.full_name}{p.position ? ` (${p.position})` : ''}</option>
                ))}
              </SelectField>
            </div>
            <div className="ppl-footer">
              <button className="btn" style={{ background: '#f3f4f6' }} onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!form.first_name.trim() || !form.last_name.trim() || (form.create_login && (!form.email || !form.password))}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function PeopleList() {
  return (
    <div className="admin-page erp-page ppl-page">
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="ppl-main">
          <PeopleListContent />
        </main>
      </div>
    </div>
  );
}
