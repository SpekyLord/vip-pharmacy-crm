/**
 * Hospital Management Page — ERP
 * Full CRUD + BDM tagging for hospitals
 */
import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import SelectField from '../../components/common/Select';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useHospitals from '../hooks/useHospitals';
import usePeople from '../hooks/usePeople';
import useWarehouses from '../hooks/useWarehouses';
import useErpApi from '../hooks/useErpApi';
import useErpSubAccess from '../hooks/useErpSubAccess';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess } from '../utils/errorToast';

export function HospitalListContent() {
  const { user } = useAuth();
  const { hospitals, loading, refresh } = useHospitals();
  // Phase MD-1 (Apr 2026) — Add/Edit/Assign now lookup-driven via master.hospital_manage.
  // Backwards-compat: management roles (admin/finance/president) implicitly pass via the
  // backend role-bypass in erpSubAccessCheck, so the UI keeps the legacy MANAGEMENT
  // fallback to avoid hiding buttons from admins who haven't been re-assigned an
  // access template yet. Staff with the explicit grant get the buttons too.
  const { hasSubPermission } = useErpSubAccess();
  const canManageHospitals =
    ROLE_SETS.MANAGEMENT.includes(user?.role) ||
    hasSubPermission('master', 'hospital_manage');
  const erpApi = useErpApi();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [showBdmOverrides, setShowBdmOverrides] = useState(false);
  const [bdmList, setBdmList] = useState([]);
  const [warehouseList, setWarehouseList] = useState([]);
  const [form, setForm] = useState({
    hospital_name: '', tin: '', address: '', contact_person: '',
    hospital_type: '', bed_capacity: '', engagement_level: '',
    payment_terms: 30, vat_status: 'VATABLE', cwt_rate: 0.01,
    credit_limit: '', credit_limit_action: 'WARN',
    warehouse_ids: []
  });

  const { getAsUsers } = usePeople();
  const whApi = useWarehouses();
  useEffect(() => {
    getAsUsers().then(res => setBdmList(res?.data || [])).catch(err => console.error('[HospitalList]', err.message));
    whApi.getWarehouses({ all: true }).then(res => setWarehouseList(res?.data || [])).catch(err => console.error('[HospitalList]', err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = hospitals.filter(h =>
    !search || h.hospital_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ hospital_name: '', tin: '', address: '', contact_person: '', hospital_type: '', bed_capacity: '', engagement_level: '', payment_terms: 30, vat_status: 'VATABLE', cwt_rate: 0.01, credit_limit: '', credit_limit_action: 'WARN', warehouse_ids: [] });
    setModalOpen(true);
  };

  const openEdit = (h) => {
    setEditing(h);
    setForm({
      hospital_name: h.hospital_name || '', tin: h.tin || '', address: h.address || '',
      contact_person: h.contact_person || '', hospital_type: h.hospital_type || '',
      bed_capacity: h.bed_capacity || '', engagement_level: h.engagement_level || '',
      payment_terms: h.payment_terms ?? 30, vat_status: h.vat_status || 'VATABLE',
      cwt_rate: h.cwt_rate ?? 0.01, credit_limit: h.credit_limit || '',
      credit_limit_action: h.credit_limit_action || 'WARN',
      warehouse_ids: (h.warehouse_ids || []).map(id => id?._id || id)
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      // Only send non-empty fields
      const data = { hospital_name: form.hospital_name.trim() };
      if (form.tin?.trim()) data.tin = form.tin.trim();
      if (form.address?.trim()) data.address = form.address.trim();
      if (form.contact_person?.trim()) data.contact_person = form.contact_person.trim();
      if (form.hospital_type?.trim()) data.hospital_type = form.hospital_type.trim();
      if (form.bed_capacity) data.bed_capacity = parseInt(form.bed_capacity);
      if (form.engagement_level) data.engagement_level = parseInt(form.engagement_level);
      if (form.payment_terms != null) data.payment_terms = form.payment_terms;
      if (form.vat_status) data.vat_status = form.vat_status;
      if (form.cwt_rate != null) data.cwt_rate = form.cwt_rate;
      if (form.credit_limit) data.credit_limit = parseFloat(form.credit_limit);
      if (form.credit_limit_action) data.credit_limit_action = form.credit_limit_action;
      data.warehouse_ids = form.warehouse_ids || [];

      if (editing) {
        await erpApi.put(`/hospitals/${editing._id}`, data);
      } else {
        await erpApi.post('/hospitals', data);
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      showError(err, 'Could not save hospital');
    }
  };

  const handleWarehouseToggle = async (hospitalId, whId) => {
    try {
      const h = assignModal;
      const current = (h.warehouse_ids || []).map(id => id?._id || id);
      const has = current.includes(whId);
      const newIds = has ? current.filter(id => id !== whId) : [...current, whId];
      const res = await erpApi.put(`/hospitals/${hospitalId}`, { warehouse_ids: newIds });
      if (res.data?.data) {
        setAssignModal(res.data.data);
      } else {
        setAssignModal(prev => prev ? { ...prev, warehouse_ids: newIds } : null);
      }
    } catch (err) {
      showError(err, 'Could not update warehouse assignment');
    }
  };

  const handleBdmTag = async (hospitalId, bdmId) => {
    try {
      const h = assignModal;
      const isTagged = h?.tagged_bdms?.some(t => (t.bdm_id?._id || t.bdm_id) === bdmId && t.is_active !== false);
      let newTags;
      if (isTagged) {
        newTags = (h.tagged_bdms || []).filter(t => (t.bdm_id?._id || t.bdm_id) !== bdmId);
      } else {
        newTags = [...(h.tagged_bdms || []), { bdm_id: bdmId, tagged_by: user._id, is_active: true }];
      }
      const res = await erpApi.put(`/hospitals/${hospitalId}`, { tagged_bdms: newTags });
      if (res.data?.data) {
        setAssignModal(res.data.data);
      } else {
        setAssignModal(prev => prev ? { ...prev, tagged_bdms: newTags } : null);
      }
    } catch (err) {
      showError(err, 'Could not tag hospital');
    }
  };

  const handleExport = async () => {
    try {
      const res = await erpApi.get('/hospitals/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res]));
      const a = document.createElement('a'); a.href = url; a.download = 'hospitals-export.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await erpApi.post('/hospitals/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSuccess(res?.message || 'Import complete');
      refresh();
    } catch (err) { console.error(err); }
    e.target.value = '';
  };

  const pageStyles = `
    .hospital-card-list { display: none; }

    @media (max-width: 900px) {
      .hospital-table-wrap { overflow-x: auto; border-radius: 12px; }
      .hospital-table { min-width: 720px; }
    }

    @media (max-width: 768px) {
      .hospital-page { padding-top: 12px; }
      .hospital-main { padding-top: 76px !important; padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)) !important; }
      .hospital-table-wrap { display: none; }
      .hospital-card-list { display: grid; gap: 12px; }
      .hospital-card { background: #fff; border: 1px solid #dbe4f0; border-radius: 14px; padding: 12px; }
      .hospital-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .hospital-card-title { font-weight: 700; font-size: 14px; color: #0f172a; }
      .hospital-card-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
      .hospital-card-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
      .hospital-card-item { display: flex; flex-direction: column; gap: 2px; }
      .hospital-card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.04em; }
      .hospital-card-value { font-size: 12px; color: #0f172a; }
      .hospital-card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
      .hospital-card-actions { display: flex; gap: 6px; margin-top: 10px; }
    }

    @media (max-width: 480px) {
      .hospital-page { padding-top: 16px; }
      .hospital-main { padding-top: 72px !important; padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px)) !important; }
      .hospital-card-grid { grid-template-columns: 1fr; }
    }
  `;

  const styles = {
    page: { background: '#f4f7fb', minHeight: '100vh' },
    main: { flex: 1, padding: 20, maxWidth: 1200, margin: '0 auto', overflow: 'auto' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 },
    filters: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
    input: { padding: '8px 12px', border: '1px solid #dbe4f0', borderRadius: 8, fontSize: 14 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #dbe4f0' },
    th: { padding: '10px 12px', textAlign: 'left', background: '#e8efff', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', color: '#475569' },
    td: { padding: '10px 12px', borderTop: '1px solid #f1f5f9' },
    btn: { padding: '6px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
    btnPrimary: { background: '#1e5eff', color: '#fff' },
    btnOutline: { background: '#fff', border: '1px solid #dbe4f0', color: '#475569' },
    btnSuccess: { background: '#16a34a', color: '#fff' },
    btnDanger: { background: '#dc2626', color: '#fff' },
    badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600 },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    modalContent: { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' },
    formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
    formGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
    label: { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' },
  };

  return (
    <>
      <style>{pageStyles}</style>
      <main className="hospital-main" style={styles.main}>
          <WorkflowGuide pageKey="hospitals" />
          <div style={styles.header}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Hospitals</h1>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{filtered.length} hospitals</p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={handleExport}>Export Excel</button>
              {canManageHospitals && (
                <label style={{ ...styles.btn, ...styles.btnOutline, cursor: 'pointer' }}>Import Excel<input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleImport} /></label>
              )}
              {canManageHospitals && (
                <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={openCreate}>+ New Hospital</button>
              )}
            </div>
          </div>

          <div style={styles.filters}>
            <input style={{ ...styles.input, flex: 1, minWidth: 200 }} placeholder="Search hospitals..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="hospital-table-wrap">
            <table className="hospital-table" style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Hospital Name</th>
                <th style={styles.th}>TIN</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Terms</th>
                <th style={styles.th}>CWT</th>
                <th style={styles.th}>Warehouses</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(h => (
                <tr key={h._id}>
                  <td style={{ ...styles.td, fontWeight: 600 }}>{h.hospital_name}</td>
                  <td style={styles.td}>{h.tin || '—'}</td>
                  <td style={styles.td}>{h.hospital_type || '—'}</td>
                  <td style={styles.td}>{h.payment_terms}d</td>
                  <td style={styles.td}>{(h.cwt_rate * 100).toFixed(0)}%</td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(h.warehouse_ids || []).map((wId, i) => {
                        const wh = warehouseList.find(w => w._id === (wId?._id || wId));
                        return <span key={i} style={{ ...styles.badge, background: '#dbeafe', color: '#1e40af' }}>{wh?.warehouse_code || '?'}</span>;
                      })}
                      {!(h.warehouse_ids || []).length && <span style={{ color: '#9ca3af', fontSize: 12 }}>None</span>}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {canManageHospitals && (
                        <>
                          <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => openEdit(h)}>Edit</button>
                          <button style={{ ...styles.btn, ...styles.btnSuccess }} onClick={() => { setAssignModal(h); setShowBdmOverrides(false); }}>Assign</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} style={{ ...styles.td, textAlign: 'center', padding: 40, color: '#9ca3af' }}>{loading ? 'Loading...' : 'No hospitals found'}</td></tr>}
            </tbody>
            </table>
          </div>

          <div className="hospital-card-list">
            {filtered.map(h => (
              <div key={h._id} className="hospital-card">
                <div className="hospital-card-header">
                  <div>
                    <div className="hospital-card-title">{h.hospital_name}</div>
                    <div className="hospital-card-meta">{h.hospital_type || '—'} · {h.payment_terms}d terms</div>
                  </div>
                  <div className="hospital-card-meta">{h.tin || '—'}</div>
                </div>

                <div className="hospital-card-grid">
                  <div className="hospital-card-item">
                    <span className="hospital-card-label">CWT</span>
                    <span className="hospital-card-value">{(h.cwt_rate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="hospital-card-item">
                    <span className="hospital-card-label">Warehouses</span>
                    <span className="hospital-card-value">{(h.warehouse_ids || []).length || 'None'}</span>
                  </div>
                </div>

                <div className="hospital-card-tags">
                  {(h.warehouse_ids || []).map((wId, i) => {
                    const wh = warehouseList.find(w => w._id === (wId?._id || wId));
                    return <span key={i} style={{ ...styles.badge, background: '#dbeafe', color: '#1e40af' }}>{wh?.warehouse_code || '?'}</span>;
                  })}
                  {!(h.warehouse_ids || []).length && <span style={{ color: '#9ca3af', fontSize: 12 }}>None</span>}
                </div>

                {canManageHospitals && (
                  <div className="hospital-card-actions">
                    <button style={{ ...styles.btn, ...styles.btnOutline, flex: 1 }} onClick={() => openEdit(h)}>Edit</button>
                    <button style={{ ...styles.btn, ...styles.btnSuccess, flex: 1 }} onClick={() => { setAssignModal(h); setShowBdmOverrides(false); }}>Assign</button>
                  </div>
                )}
              </div>
            ))}
            {!filtered.length && (
              <div className="hospital-card" style={{ textAlign: 'center', color: '#9ca3af' }}>
                {loading ? 'Loading...' : 'No hospitals found'}
              </div>
            )}
          </div>

          {/* Create/Edit Modal */}
          {modalOpen && (
            <div style={styles.modal} onClick={() => setModalOpen(false)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>{editing ? 'Edit Hospital' : 'New Hospital'}</h2>
                <div style={styles.formGrid}>
                  <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>Hospital Name *</label>
                    <input style={styles.input} value={form.hospital_name} onChange={e => setForm(f => ({ ...f, hospital_name: e.target.value }))} />
                  </div>
                  <div style={styles.formGroup}><label style={styles.label}>TIN</label><input style={styles.input} value={form.tin} onChange={e => setForm(f => ({ ...f, tin: e.target.value }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Hospital Type</label><input style={styles.input} value={form.hospital_type} onChange={e => setForm(f => ({ ...f, hospital_type: e.target.value }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Contact Person</label><input style={styles.input} value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Address</label><input style={styles.input} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Payment Terms (days)</label><input type="number" style={styles.input} value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: parseInt(e.target.value) || 30 }))} /></div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>VAT Status</label>
                    <SelectField style={styles.input} value={form.vat_status} onChange={e => setForm(f => ({ ...f, vat_status: e.target.value }))}>
                      <option value="VATABLE">VATABLE</option>
                      <option value="EXEMPT">EXEMPT</option>
                      <option value="ZERO">ZERO</option>
                    </SelectField>
                  </div>
                  <div style={styles.formGroup}><label style={styles.label}>CWT Rate</label><input type="number" step="0.001" style={styles.input} value={form.cwt_rate} onChange={e => setForm(f => ({ ...f, cwt_rate: parseFloat(e.target.value) || 0 }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Credit Limit</label><input type="number" style={styles.input} value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="No limit" /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Bed Capacity</label><input type="number" style={styles.input} value={form.bed_capacity} onChange={e => setForm(f => ({ ...f, bed_capacity: e.target.value }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Engagement Level (1-5)</label><input type="number" min="1" max="5" style={styles.input} value={form.engagement_level} onChange={e => setForm(f => ({ ...f, engagement_level: e.target.value }))} /></div>
                  <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                    <label style={styles.label}>Warehouses (BDMs inherit access)</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {warehouseList.map(w => {
                        const checked = (form.warehouse_ids || []).includes(w._id);
                        return (
                          <label key={w._id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: checked ? '#eff6ff' : '#f9fafb', borderRadius: 6, cursor: 'pointer', border: checked ? '1px solid #93c5fd' : '1px solid #e5e7eb', fontSize: 12 }}>
                            <input type="checkbox" checked={checked} onChange={() => setForm(f => ({ ...f, warehouse_ids: checked ? f.warehouse_ids.filter(id => id !== w._id) : [...f.warehouse_ids, w._id] }))} style={{ width: 'auto' }} />
                            <span style={{ fontWeight: 600 }}>{w.warehouse_code}</span>
                            <span style={{ color: '#6b7280' }}>{w.warehouse_name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setModalOpen(false)}>Cancel</button>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Assign Warehouses Modal */}
          {assignModal && (
            <div style={styles.modal} onClick={() => setAssignModal(null)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Assign Warehouses — {assignModal.hospital_name}</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>BDMs automatically see hospitals assigned to their warehouse</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {warehouseList.map(w => {
                    const isAssigned = (assignModal.warehouse_ids || []).some(id => (id?._id || id) === w._id);
                    return (
                      <label key={w._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: isAssigned ? '#eff6ff' : '#f9fafb', borderRadius: 8, cursor: 'pointer', border: isAssigned ? '1px solid #93c5fd' : '1px solid #e5e7eb' }}>
                        <input type="checkbox" checked={isAssigned} onChange={() => handleWarehouseToggle(assignModal._id, w._id)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: 700 }}>{w.warehouse_code}</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{w.warehouse_name}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Legacy BDM Overrides (collapsible) */}
                <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
                  <button style={{ ...styles.btn, ...styles.btnOutline, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }} onClick={() => setShowBdmOverrides(!showBdmOverrides)}>
                    <span>BDM Overrides (Legacy)</span>
                    <span>{showBdmOverrides ? '—' : '+'}</span>
                  </button>
                  {showBdmOverrides && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>For edge cases only — use warehouse assignment above instead</p>
                      {bdmList.map(b => {
                        const isTagged = (assignModal.tagged_bdms || []).some(t => (t.bdm_id?._id || t.bdm_id) === b._id && t.is_active !== false);
                        return (
                          <label key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', background: isTagged ? '#f0fdf4' : '#f9fafb', borderRadius: 8, cursor: 'pointer', border: isTagged ? '1px solid #86efac' : '1px solid #e5e7eb', fontSize: 13 }}>
                            <input type="checkbox" checked={isTagged} onChange={() => handleBdmTag(assignModal._id, b._id)} style={{ width: 'auto' }} />
                            <span style={{ fontWeight: 600 }}>{b.name}</span>
                            <span style={{ fontSize: 11, color: '#6b7280' }}>{b.email}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => { setAssignModal(null); refresh(); }}>Done</button>
                </div>
              </div>
            </div>
          )}
        </main>
    </>
  );
}

export default function HospitalList() {
  return (
    <div className="admin-page erp-page hospital-page" style={{ background: '#f4f7fb', minHeight: '100vh' }}>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <HospitalListContent />
      </div>
    </div>
  );
}
