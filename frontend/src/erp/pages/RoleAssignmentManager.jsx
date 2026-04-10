/**
 * RoleAssignmentManager — Phase 31
 *
 * Cross-entity functional role assignments.
 * Two views: "By Entity" (who's assigned here) and "By Person" (search person, see all assignments).
 * Admin/President can create, edit, deactivate assignments.
 *
 * Exports RoleAssignmentManagerContent for ControlCenter embedding.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { useSearchParams } from 'react-router-dom';
import { ROLE_SETS } from '../../constants/roles';
import useFunctionalRoles from '../hooks/useFunctionalRoles';
import usePeople from '../hooks/usePeople';
import useEntities from '../hooks/useEntities';
import { useLookupOptions } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  ACTIVE:    { bg: '#dcfce7', text: '#166534' },
  SUSPENDED: { bg: '#fef3c7', text: '#92400e' },
  EXPIRED:   { bg: '#f1f5f9', text: '#475569' },
  REVOKED:   { bg: '#fee2e2', text: '#991b1b' },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtLimit = (v) => v != null ? `₱${Number(v).toLocaleString()}` : '—';

function RoleAssignmentManagerContent() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const {
    assignments, loading, fetchAssignments, fetchByPerson,
    createAssignment, bulkCreate, updateAssignment, deactivateAssignment,
  } = useFunctionalRoles();
  const { getPeopleList } = usePeople();
  const { entities, refresh: refreshEntities } = useEntities();
  const { options: roleOptions } = useLookupOptions('FUNCTIONAL_ROLE');

  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  // Tab state
  const [tab, setTab] = useState(searchParams.get('person') ? 'person' : 'entity');

  // Entity tab filters
  const [roleFilter, setRoleFilter] = useState('');

  // Person tab state
  const [personSearch, setPersonSearch] = useState('');
  const [people, setPeople] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [personAssignments, setPersonAssignments] = useState([]);

  // Create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ person_id: '', entity_id: '', functional_role: '', valid_from: '', valid_to: '', approval_limit: '', description: '' });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkEntityIds, setBulkEntityIds] = useState([]);
  const [bulkRoles, setBulkRoles] = useState([]);

  // Role options with fallback
  const ROLE_OPTIONS = useMemo(() => {
    if (roleOptions.length > 0) return roleOptions;
    return ['PURCHASING', 'ACCOUNTING', 'COLLECTIONS', 'INVENTORY', 'SALES', 'ADMIN', 'AUDIT', 'PAYROLL', 'LOGISTICS']
      .map(c => ({ code: c, label: c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ') }));
  }, [roleOptions]);

  // ─── Load data ───────────────────────
  useEffect(() => { refreshEntities(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'entity') {
      const params = {};
      if (roleFilter) params.functional_role = roleFilter;
      fetchAssignments(params).catch(e => showError(e));
    }
  }, [tab, roleFilter, fetchAssignments]);

  // Auto-load person from URL param
  useEffect(() => {
    const pid = searchParams.get('person');
    if (pid && tab === 'person') {
      setSelectedPerson({ _id: pid });
      fetchByPerson(pid).then(setPersonAssignments).catch(e => showError(e));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Person search ───────────────────
  const handlePersonSearch = useCallback(async () => {
    if (!personSearch.trim()) return;
    try {
      const res = await getPeopleList({ search: personSearch, limit: 20 });
      setPeople(res?.data || []);
    } catch (e) { showError(e); }
  }, [personSearch, getPeopleList]);

  const selectPerson = useCallback(async (person) => {
    setSelectedPerson(person);
    try {
      const data = await fetchByPerson(person._id);
      setPersonAssignments(data);
    } catch (e) { showError(e); }
  }, [fetchByPerson]);

  // ─── Modal helpers ───────────────────
  const openCreate = (presetPerson) => {
    setEditing(null);
    setBulkMode(false);
    setBulkEntityIds([]);
    setBulkRoles([]);
    setForm({
      person_id: presetPerson?._id || '',
      entity_id: '',
      functional_role: '',
      valid_from: new Date().toISOString().slice(0, 10),
      valid_to: '',
      approval_limit: '',
      description: '',
    });
    setShowModal(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setBulkMode(false);
    setForm({
      person_id: a.person_id?._id || a.person_id,
      entity_id: a.entity_id?._id || a.entity_id,
      functional_role: a.functional_role,
      valid_from: a.valid_from ? new Date(a.valid_from).toISOString().slice(0, 10) : '',
      valid_to: a.valid_to ? new Date(a.valid_to).toISOString().slice(0, 10) : '',
      approval_limit: a.approval_limit ?? '',
      description: a.description || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.person_id && !editing) return toast.error('Select a person');
    if (!form.valid_from) return toast.error('Valid From date is required');
    if (!editing && !bulkMode && !form.functional_role) return toast.error('Select a function');
    if (!editing && !bulkMode && !form.entity_id) return toast.error('Select a target entity');
    if (bulkMode && bulkEntityIds.length === 0) return toast.error('Select at least one entity');
    try {
      if (editing) {
        await updateAssignment(editing._id, {
          functional_role: form.functional_role,
          valid_from: form.valid_from,
          valid_to: form.valid_to || null,
          approval_limit: form.approval_limit ? Number(form.approval_limit) : null,
          description: form.description,
        });
        toast.success('Assignment updated');
      } else if (bulkMode && bulkEntityIds.length > 0) {
        const rolesToSend = bulkRoles.length > 0 ? bulkRoles : (form.functional_role ? [form.functional_role] : []);
        if (rolesToSend.length === 0) return toast.error('Select at least one function');
        const res = await bulkCreate({
          person_id: form.person_id,
          entity_ids: bulkEntityIds,
          functional_roles: rolesToSend,
          valid_from: form.valid_from,
          valid_to: form.valid_to || null,
          approval_limit: form.approval_limit ? Number(form.approval_limit) : null,
          description: form.description,
        });
        toast.success(res.message || 'Assignments created');
      } else {
        await createAssignment({
          person_id: form.person_id,
          entity_id: form.entity_id,
          functional_role: form.functional_role,
          valid_from: form.valid_from,
          valid_to: form.valid_to || null,
          approval_limit: form.approval_limit ? Number(form.approval_limit) : null,
          description: form.description,
        });
        toast.success('Assignment created');
      }
      setShowModal(false);
      // Refresh
      if (tab === 'entity') fetchAssignments({ functional_role: roleFilter }).catch(() => {});
      if (selectedPerson) fetchByPerson(selectedPerson._id).then(setPersonAssignments).catch(() => {});
    } catch (e) { showError(e); }
  };

  const handleDeactivate = async (a) => {
    if (!window.confirm(`Revoke ${a.functional_role} assignment for ${a.person_id?.full_name || 'this person'}?`)) return;
    try {
      await deactivateAssignment(a._id);
      toast.success('Assignment revoked');
      if (tab === 'entity') fetchAssignments({ functional_role: roleFilter }).catch(() => {});
      if (selectedPerson) fetchByPerson(selectedPerson._id).then(setPersonAssignments).catch(() => {});
    } catch (e) { showError(e); }
  };

  const toggleBulkEntity = (eid) => {
    setBulkEntityIds(prev => prev.includes(eid) ? prev.filter(id => id !== eid) : [...prev, eid]);
  };

  const toggleBulkRole = (code) => {
    setBulkRoles(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  // ─── People selector for modal ──────
  const [modalPeopleSearch, setModalPeopleSearch] = useState('');
  const [modalPeople, setModalPeople] = useState([]);
  const searchModalPeople = async () => {
    if (!modalPeopleSearch.trim()) return;
    try {
      const res = await getPeopleList({ search: modalPeopleSearch, limit: 15 });
      setModalPeople(res?.data || []);
    } catch (e) { showError(e); }
  };

  // ─── Render helpers ──────────────────
  const renderStatusBadge = (status) => {
    const c = STATUS_COLORS[status] || STATUS_COLORS.ACTIVE;
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: c.bg, color: c.text }}>{status}</span>;
  };

  const renderAssignmentRow = (a, showEntity = true) => (
    <tr key={a._id}>
      <td style={{ padding: '8px 10px', fontSize: 13 }}>{a.person_id?.full_name || '—'}</td>
      <td style={{ padding: '8px 10px', fontSize: 13, color: '#64748b' }}>{a.person_id?.position || '—'}</td>
      {showEntity && <td style={{ padding: '8px 10px', fontSize: 13 }}>{a.entity_id?.short_name || a.entity_id?.entity_name || '—'}</td>}
      <td style={{ padding: '8px 10px', fontSize: 13 }}>{a.home_entity_id?.short_name || '—'}</td>
      <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600 }}>{a.functional_role}</td>
      <td style={{ padding: '8px 10px', fontSize: 12 }}>{fmtDate(a.valid_from)}</td>
      <td style={{ padding: '8px 10px', fontSize: 12 }}>{fmtDate(a.valid_to)}</td>
      <td style={{ padding: '8px 10px', fontSize: 12 }}>{fmtLimit(a.approval_limit)}</td>
      <td style={{ padding: '8px 10px' }}>{renderStatusBadge(a.status)}</td>
      {isAdmin && (
        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
          <button onClick={() => openEdit(a)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', marginRight: 4 }}>Edit</button>
          {a.status === 'ACTIVE' && (
            <button onClick={() => handleDeactivate(a)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid #fca5a5', color: '#dc2626', background: '#fff', cursor: 'pointer' }}>Revoke</button>
          )}
        </td>
      )}
    </tr>
  );

  const tableHeaders = (showEntity = true) => (
    <thead>
      <tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}>
        <th style={thStyle}>Person</th>
        <th style={thStyle}>Position</th>
        {showEntity && <th style={thStyle}>Target Entity</th>}
        <th style={thStyle}>Home Entity</th>
        <th style={thStyle}>Function</th>
        <th style={thStyle}>From</th>
        <th style={thStyle}>To</th>
        <th style={thStyle}>Limit</th>
        <th style={thStyle}>Status</th>
        {isAdmin && <th style={thStyle}>Actions</th>}
      </tr>
    </thead>
  );

  return (
    <>
      <WorkflowGuide pageKey="role-assignment-manager" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Functional Role Assignments</h2>
        {isAdmin && (
          <button onClick={() => openCreate()} style={btnPrimary}>+ New Assignment</button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {['entity', 'person'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '6px 16px', borderRadius: 6, fontSize: 13, fontWeight: tab === t ? 600 : 400, border: '1px solid', borderColor: tab === t ? 'var(--erp-accent, #1e5eff)' : '#d1d5db', background: tab === t ? 'var(--erp-accent, #1e5eff)' : '#fff', color: tab === t ? '#fff' : 'var(--erp-text)', cursor: 'pointer' }}>
            {t === 'entity' ? 'By Entity' : 'By Person'}
          </button>
        ))}
      </div>

      {/* ═══ BY ENTITY TAB ═══ */}
      {tab === 'entity' && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}>
              <option value="">All Functions</option>
              {ROLE_OPTIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </div>

          <div style={{ background: 'var(--erp-panel, #fff)', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              {tableHeaders(false)}
              <tbody>
                {loading ? (
                  <tr><td colSpan={isAdmin ? 9 : 8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading...</td></tr>
                ) : assignments.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 9 : 8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No assignments at this entity</td></tr>
                ) : assignments.map(a => renderAssignmentRow(a, false))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ BY PERSON TAB ═══ */}
      {tab === 'person' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <input value={personSearch} onChange={e => setPersonSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePersonSearch()}
              placeholder="Search person by name..." style={{ flex: 1, maxWidth: 300, padding: '7px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }} />
            <button onClick={handlePersonSearch} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 13, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Search</button>
          </div>

          {/* Person results */}
          {people.length > 0 && !selectedPerson && (
            <div style={{ background: 'var(--erp-panel, #fff)', borderRadius: 8, padding: 8, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              {people.map(p => (
                <div key={p._id} onClick={() => selectPerson(p)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderRadius: 6, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontWeight: 600 }}>{p.full_name}</span>
                  <span style={{ color: '#64748b' }}>{p.position || p.person_type} — {p.department || ''}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected person's assignments */}
          {selectedPerson && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <button onClick={() => { setSelectedPerson(null); setPersonAssignments([]); setPeople([]); }}
                  style={{ fontSize: 12, color: 'var(--erp-accent)', cursor: 'pointer', background: 'none', border: 'none' }}>
                  &larr; Back to search
                </button>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedPerson.full_name || 'Person'}</span>
                {isAdmin && (
                  <button onClick={() => openCreate(selectedPerson)} style={{ ...btnPrimary, fontSize: 12, padding: '4px 12px' }}>+ Assign Role</button>
                )}
              </div>

              <div style={{ background: 'var(--erp-panel, #fff)', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHeaders(true)}
                  <tbody>
                    {personAssignments.length === 0 ? (
                      <tr><td colSpan={isAdmin ? 10 : 9} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No cross-entity assignments</td></tr>
                    ) : personAssignments.map(a => renderAssignmentRow(a, true))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CREATE/EDIT MODAL ═══ */}
      {showModal && (
        <div style={overlay} onClick={() => setShowModal(false)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>
              {editing ? 'Edit Assignment' : 'New Functional Role Assignment'}
            </h3>

            {/* Person selector */}
            {!editing && !form.person_id && (
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Person</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={modalPeopleSearch} onChange={e => setModalPeopleSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchModalPeople()}
                    placeholder="Search by name..." style={inputStyle} />
                  <button onClick={searchModalPeople} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Find</button>
                </div>
                {modalPeople.length > 0 && (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                    {modalPeople.map(p => (
                      <div key={p._id} onClick={() => { setForm(f => ({ ...f, person_id: p._id })); setModalPeople([]); setModalPeopleSearch(p.full_name); }}
                        style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                        {p.full_name} <span style={{ color: '#64748b' }}>({p.position || p.person_type})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.person_id && !editing && (
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Person</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{modalPeopleSearch || selectedPerson?.full_name || form.person_id}</span>
                  <button onClick={() => { setForm(f => ({ ...f, person_id: '' })); setModalPeopleSearch(''); }} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>change</button>
                </div>
              </div>
            )}

            {/* Bulk mode toggle */}
            {!editing && form.person_id && (
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={bulkMode} onChange={e => setBulkMode(e.target.checked)} id="bulk-toggle" />
                <label htmlFor="bulk-toggle" style={{ fontSize: 12, color: '#64748b' }}>Assign to multiple entities at once</label>
              </div>
            )}

            {/* Entity selector */}
            {!editing && !bulkMode && (
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Target Entity</label>
                <select value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))} style={inputStyle}>
                  <option value="">Select entity...</option>
                  {entities.map(ent => <option key={ent._id} value={ent._id}>{ent.short_name || ent.entity_name}</option>)}
                </select>
              </div>
            )}

            {/* Bulk entity checkboxes */}
            {!editing && bulkMode && (
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Target Entities ({bulkEntityIds.length} selected)</label>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {entities.map(ent => (
                    <label key={ent._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={bulkEntityIds.includes(ent._id)} onChange={() => toggleBulkEntity(ent._id)} />
                      {ent.short_name || ent.entity_name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Functional role — single dropdown for normal/edit, multi-checkbox for bulk */}
            {(!bulkMode || editing) ? (
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Function</label>
                <select value={form.functional_role} onChange={e => setForm(f => ({ ...f, functional_role: e.target.value }))} style={inputStyle}>
                  <option value="">Select function...</option>
                  {ROLE_OPTIONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Functions ({bulkRoles.length} selected)</label>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {ROLE_OPTIONS.map(r => (
                    <label key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 13, cursor: 'pointer' }}>
                      <input type="checkbox" checked={bulkRoles.includes(r.code)} onChange={() => toggleBulkRole(r.code)} />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Date range */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lblStyle}>Valid From</label>
                <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={lblStyle}>Valid To <span style={{ color: '#94a3b8', fontWeight: 400 }}>(blank = permanent)</span></label>
                <input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} style={inputStyle} />
              </div>
            </div>

            {/* Approval limit */}
            <div style={{ marginBottom: 12 }}>
              <label style={lblStyle}>Approval Limit (₱) <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
              <input type="number" value={form.approval_limit} onChange={e => setForm(f => ({ ...f, approval_limit: e.target.value }))} placeholder="e.g. 50000" style={inputStyle} />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={lblStyle}>Notes</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="e.g. Handles month-end close for MG" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 13, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} style={btnPrimary}>{editing ? 'Save Changes' : (bulkMode ? `Create ${bulkEntityIds.length * (bulkRoles.length || 1)} Assignment(s)` : 'Create Assignment')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══ Standalone page with Navbar + Sidebar ═══
export default function RoleAssignmentManager() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--erp-bg, #f4f7fb)' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 20, maxWidth: 1200, margin: '0 auto' }}>
          <RoleAssignmentManagerContent />
        </main>
      </div>
    </div>
  );
}

// Named export for ControlCenter embedding
export { RoleAssignmentManagerContent };

// ─── Shared styles ──────────────────────
const thStyle = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--erp-muted, #64748b)', whiteSpace: 'nowrap' };
const btnPrimary = { padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: 'var(--erp-accent, #1e5eff)', color: '#fff', cursor: 'pointer' };
const lblStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--erp-muted, #64748b)', marginBottom: 3 };
const inputStyle = { width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--erp-border, #d1d5db)', fontSize: 13, boxSizing: 'border-box' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' };
