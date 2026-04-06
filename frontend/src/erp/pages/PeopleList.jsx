import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import usePeople from '../hooks/usePeople';

import SelectField from '../../components/common/Select';

const PERSON_TYPES = ['BDM', 'ECOMMERCE_BDM', 'EMPLOYEE', 'SALES_REP', 'CONSULTANT', 'DIRECTOR'];
const STATUS_LIST = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'SEPARATED'];
const EMP_TYPES = ['REGULAR', 'PROBATIONARY', 'CONTRACTUAL', 'CONSULTANT', 'PARTNERSHIP'];

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
  position: '', department: '', employment_type: 'REGULAR', status: 'ACTIVE',
};

export function PeopleListContent() {
  const navigate = useNavigate();
  const api = usePeople();
  const [people, setPeople] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: '', person_type: '', status: '' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 50 };
      if (filters.search) params.search = filters.search;
      if (filters.person_type) params.person_type = filters.person_type;
      if (filters.status) params.status = filters.status;
      const res = await api.getPeopleList(params);
      setPeople(res?.data || []);
      setPagination(res?.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch (err) { console.error('[PeopleList] load error:', err.message); } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const full_name = `${form.first_name} ${form.last_name}`.trim();
    try {
      await api.createPerson({ ...form, full_name });
      setShowForm(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) { alert(err?.response?.data?.message || err.message || 'Operation failed'); }
  };

  return (
    <>
      <style>{pageStyles}</style>
      <div className="ppl-header">
        <h2>People Master</h2>
        <button style={{ padding: '8px 16px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, marginRight: 8 }}
          onClick={async () => {
            try {
              const res = await api.post('/people/sync-from-crm', {});
              alert(res?.message || `Synced: ${res?.data?.created || 0} created, ${res?.data?.skipped || 0} already exist`);
              load();
            } catch (err) { alert(err.response?.data?.message || 'Sync failed'); }
          }}>Sync from CRM</button>
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
                <th>Type</th>
                <th>Position</th>
                <th>Department</th>
                <th>Employment</th>
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
                    <td><span className="badge" style={{ background: tc.bg, color: tc.text }}>{p.person_type.replace(/_/g, ' ')}</span></td>
                    <td>{p.position || '—'}</td>
                    <td>{p.department || '—'}</td>
                    <td>{p.employment_type || '—'}</td>
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
                <label>First Name</label>
                <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="ppl-field">
                <label>Last Name</label>
                <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
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
            <div className="ppl-footer">
              <button className="btn" style={{ background: '#f3f4f6' }} onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
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
