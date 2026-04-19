import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePeople from '../hooks/usePeople';
import useErpSubAccess from '../hooks/useErpSubAccess';

import SelectField from '../../components/common/Select';
import { useLookupOptions } from '../hooks/useLookups';
import { showError, showSuccess } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';


const ROLE_COLORS = {
  president: { bg: '#fce7f3', text: '#9d174d' },
  admin: { bg: '#fee2e2', text: '#991b1b' },
  finance: { bg: '#fef3c7', text: '#92400e' },
  contractor: { bg: '#dbeafe', text: '#1e40af' },
  ceo: { bg: '#f3e8ff', text: '#6b21a8' },
};

const EMP_COLORS = {
  REGULAR: { bg: '#dcfce7', text: '#166534' },
  PROBATIONARY: { bg: '#fef3c7', text: '#92400e' },
  CONTRACTUAL: { bg: '#dbeafe', text: '#1e40af' },
  CONSULTANT: { bg: '#f3e8ff', text: '#6b21a8' },
  PARTNERSHIP: { bg: '#fce7f3', text: '#9d174d' },
};

const STAGE_COLORS = {
  CONTRACTOR: { bg: '#e0e7ff', text: '#3730a3' },
  PS_ELIGIBLE: { bg: '#fef3c7', text: '#92400e' },
  TRANSITIONING: { bg: '#ffedd5', text: '#9a3412' },
  SUBSIDIARY: { bg: '#dcfce7', text: '#166534' },
  SHAREHOLDER: { bg: '#fce7f3', text: '#9d174d' },
};

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
  @media(max-width: 1024px) { .ppl-hide-tablet { display: none; } }
  @media(max-width: 768px) { .ppl-main { padding: 12px; padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } .ppl-table { font-size: 12px; } .ppl-hide-mobile { display: none; } }
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
  // Phase 3c — bulk-change-role gated by danger-baseline people.manage_login.
  // Mirrors backend peopleRoutes /bulk-change-role.
  const { hasSubPermission } = useErpSubAccess();
  const canManageLogin = hasSubPermission('people', 'manage_login');
  const { options: personTypeOpts } = useLookupOptions('PERSON_TYPE');
  const { options: systemRoleOpts } = useLookupOptions('SYSTEM_ROLE');
  const getRoleLabel = (code) => {
    if (!code) return '—';
    const opt = systemRoleOpts.find(r => r.code.toLowerCase() === code);
    return opt ? opt.label : code.charAt(0).toUpperCase() + code.slice(1);
  };
  const { options: statusOpts } = useLookupOptions('PEOPLE_STATUS');
  const STATUS_LIST = statusOpts.map(s => s.code);
  const PERSON_TYPES = personTypeOpts.map(o => o.code);
  const { options: empTypeOpts } = useLookupOptions('EMPLOYMENT_TYPE');
  const EMP_TYPES = empTypeOpts.map(o => o.code);
  const [people, setPeople] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [tab, setTab] = useState('active'); // 'active' | 'archive'
  const [filters, setFilters] = useState({ search: '', person_type: '', status: '', role: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [legacyCounts, setLegacyCounts] = useState({});

  // Client-side role filter (backend filters handle type/status/search, role filter is client-side)
  const filteredPeople = useMemo(() => {
    if (!filters.role) return people;
    if (filters.role === '__none__') return people.filter(p => !p.user_id);
    return people.filter(p => p.user_id?.role === filters.role);
  }, [people, filters.role]);
  const [migrating, setMigrating] = useState(false);

  const ACTIVE_STATUSES = STATUS_LIST.filter(s => s !== 'SEPARATED');

  const load = useCallback(async (page = 1, bust = false) => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (filters.search) params.search = filters.search;
      if (filters.person_type) params.person_type = filters.person_type;
      if (filters.status) params.status = filters.status;
      // Tab-based filtering: use status as the authoritative field
      // (handles legacy data where status=SEPARATED but is_active wasn't toggled)
      if (tab === 'active') {
        params.exclude_status = 'SEPARATED';
      } else {
        if (!filters.status) params.status = 'SEPARATED';
      }
      if (bust) params._t = Date.now(); // bypass 304 cache after mutations
      const res = await api.getPeopleList(params);
      setPeople(res?.data || []);
      setPagination(res?.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch (err) { console.error('[PeopleList] load error:', err.message); } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, tab]);

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

      {/* Legacy Role Migration Banner — bulk-change-role gated by people.manage_login (Phase 3c) */}
      {Object.keys(legacyCounts).length > 0 && canManageLogin && (
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

      {/* Active / Archive Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {[{ key: 'active', label: 'Active' }, { key: 'archive', label: 'Archive (Separated)' }].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setFilters(f => ({ ...f, status: '' })); }}
            style={{
              padding: '7px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: '1px solid', background: tab === t.key ? 'var(--erp-accent, #1e5eff)' : '#fff',
              color: tab === t.key ? '#fff' : '#374151', borderColor: tab === t.key ? 'transparent' : '#d1d5db',
            }}>{t.label}</button>
        ))}
      </div>

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
        <SelectField value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value }))}>
          <option value="">All Roles</option>
          {systemRoleOpts.map(r => <option key={r.code} value={r.code.toLowerCase()}>{r.label}</option>)}
          <option value="__none__">No Login</option>
        </SelectField>
        {tab === 'active' && (
          <SelectField value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Status</option>
            {ACTIVE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </SelectField>
        )}
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
                <th className="ppl-hide-mobile">Role</th>
                <th className="ppl-hide-mobile">Login</th>
                <th className="ppl-hide-mobile">Position</th>
                <th className="ppl-hide-mobile">Department</th>
                <th className="ppl-hide-tablet">Employment</th>
                <th className="ppl-hide-tablet">BDM Code</th>
                <th className="ppl-hide-tablet">Stage</th>
                <th className="ppl-hide-tablet">Territory</th>
                <th>Status</th>
                {tab === 'archive' && <th>Separated</th>}
                {tab === 'archive' && <th style={{ width: 90 }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map(p => {
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
                    <td className="ppl-hide-mobile">
                      {p.user_id?.role ? (() => {
                        const rc = ROLE_COLORS[p.user_id.role] || { bg: '#f3f4f6', text: '#374151' };
                        return <span className="badge" style={{ background: rc.bg, color: rc.text }}>{getRoleLabel(p.user_id.role)}</span>;
                      })() : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td className="ppl-hide-mobile" style={{ fontSize: 11 }}>
                      {p.user_id ? (
                        p.user_id.isActive === false
                          ? <span style={{ color: '#dc2626', fontWeight: 600 }}>DISABLED</span>
                          : <span style={{ color: '#16a34a' }}>Active</span>
                      ) : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td className="ppl-hide-mobile">{p.position || '—'}</td>
                    <td className="ppl-hide-mobile">{p.department || '—'}</td>
                    <td className="ppl-hide-tablet">
                      {p.employment_type ? (() => {
                        const ec = EMP_COLORS[p.employment_type] || { bg: '#f3f4f6', text: '#374151' };
                        return <span className="badge" style={{ background: ec.bg, color: ec.text, fontSize: 10 }}>{p.employment_type}</span>;
                      })() : '—'}
                    </td>
                    <td className="ppl-hide-tablet" style={{ fontSize: 12 }}>{p.bdm_code || '—'}</td>
                    <td className="ppl-hide-tablet">
                      {p.bdm_stage ? (() => {
                        const sg = STAGE_COLORS[p.bdm_stage] || { bg: '#f3f4f6', text: '#374151' };
                        return <span className="badge" style={{ background: sg.bg, color: sg.text, fontSize: 10 }}>{p.bdm_stage.replace(/_/g, ' ')}</span>;
                      })() : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td className="ppl-hide-tablet" style={{ fontSize: 11, color: '#64748b' }}>
                      {p.territory_id?.territory_name || p.territory_id?.territory_code || '—'}
                    </td>
                    <td><span className="badge" style={{ background: sc.bg, color: sc.text }}>{p.status}</span></td>
                    {tab === 'archive' && (
                      <td style={{ fontSize: 12, color: '#64748b' }}>
                        {p.date_separated ? new Date(p.date_separated).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    )}
                    {tab === 'archive' && (
                      <td>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!window.confirm(`Reactivate ${p.full_name}? Their status will be set to ACTIVE.\nYou will need to manually re-enable login and role assignments if needed.`)) return;
                            try {
                              await api.reactivatePerson(p._id);
                              showSuccess(`${p.full_name} reactivated`);
                              load(pagination.page, true);
                            } catch (err) { showError(err, 'Could not reactivate'); }
                          }}
                          style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #bbf7d0', background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          Reactivate
                        </button>
                      </td>
                    )}
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
