/**
 * Hospital Management Page — ERP
 * Full CRUD + BDM tagging for hospitals
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useHospitals from '../hooks/useHospitals';
import api from '../../services/api';

export default function HospitalList() {
  const { user } = useAuth();
  const { hospitals, loading, refresh } = useHospitals();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tagModal, setTagModal] = useState(null);
  const [bdmList, setBdmList] = useState([]);
  const [form, setForm] = useState({
    hospital_name: '', tin: '', address: '', contact_person: '',
    hospital_type: '', bed_capacity: '', engagement_level: '',
    payment_terms: 30, vat_status: 'VATABLE', cwt_rate: 0.01,
    credit_limit: '', credit_limit_action: 'WARN'
  });

  useEffect(() => {
    api.get('/users?role=employee&limit=0').then(res => {
      setBdmList(res.data?.data || res.data || []);
    }).catch(err => console.error('[HospitalList]', err.message));
  }, []);

  const filtered = hospitals.filter(h =>
    !search || h.hospital_name?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ hospital_name: '', tin: '', address: '', contact_person: '', hospital_type: '', bed_capacity: '', engagement_level: '', payment_terms: 30, vat_status: 'VATABLE', cwt_rate: 0.01, credit_limit: '', credit_limit_action: 'WARN' });
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
      credit_limit_action: h.credit_limit_action || 'WARN'
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

      if (editing) {
        await api.put(`/erp/hospitals/${editing._id}`, data);
      } else {
        await api.post('/erp/hospitals', data);
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed');
    }
  };

  const handleTag = async (hospitalId, bdmId) => {
    try {
      const h = tagModal || hospitals.find(h => h._id === hospitalId);
      const isTagged = h?.tagged_bdms?.some(t => (t.bdm_id?._id || t.bdm_id) === bdmId && t.is_active !== false);
      let newTags;
      if (isTagged) {
        newTags = (h.tagged_bdms || []).filter(t => (t.bdm_id?._id || t.bdm_id) !== bdmId);
      } else {
        newTags = [...(h.tagged_bdms || []), { bdm_id: bdmId, tagged_by: user._id, is_active: true }];
      }
      const res = await api.put(`/erp/hospitals/${hospitalId}`, { tagged_bdms: newTags });
      // Update tagModal immediately so checkboxes reflect change
      if (res.data?.data) {
        setTagModal(res.data.data);
      } else {
        setTagModal(prev => prev ? { ...prev, tagged_bdms: newTags } : null);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Tag failed');
    }
  };

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
    <div className="admin-page erp-page" style={styles.page}>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main style={styles.main}>
          <div style={styles.header}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Hospitals</h1>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>{filtered.length} hospitals</p>
            </div>
            {['admin', 'finance', 'president'].includes(user?.role) && (
              <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={openCreate}>+ New Hospital</button>
            )}
          </div>

          <div style={styles.filters}>
            <input style={{ ...styles.input, flex: 1, minWidth: 200 }} placeholder="Search hospitals..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Hospital Name</th>
                <th style={styles.th}>TIN</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Terms</th>
                <th style={styles.th}>CWT</th>
                <th style={styles.th}>Tagged BDMs</th>
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
                      {(h.tagged_bdms || []).filter(t => t.is_active !== false).map((t, i) => {
                        const bdm = bdmList.find(b => b._id === (t.bdm_id?._id || t.bdm_id));
                        return <span key={i} style={{ ...styles.badge, background: '#e0e7ff', color: '#3730a3' }}>{bdm?.name || 'BDM'}</span>;
                      })}
                      {(!h.tagged_bdms?.length) && <span style={{ color: '#9ca3af', fontSize: 12 }}>None</span>}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['admin', 'finance', 'president'].includes(user?.role) && (
                        <>
                          <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => openEdit(h)}>Edit</button>
                          <button style={{ ...styles.btn, ...styles.btnSuccess }} onClick={() => setTagModal(h)}>Tag</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={7} style={{ ...styles.td, textAlign: 'center', padding: 40, color: '#9ca3af' }}>{loading ? 'Loading...' : 'No hospitals found'}</td></tr>}
            </tbody>
          </table>

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
                  <div style={styles.formGroup}><label style={styles.label}>VAT Status</label><select style={styles.input} value={form.vat_status} onChange={e => setForm(f => ({ ...f, vat_status: e.target.value }))}><option>VATABLE</option><option>EXEMPT</option><option>ZERO</option></select></div>
                  <div style={styles.formGroup}><label style={styles.label}>CWT Rate</label><input type="number" step="0.001" style={styles.input} value={form.cwt_rate} onChange={e => setForm(f => ({ ...f, cwt_rate: parseFloat(e.target.value) || 0 }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Credit Limit</label><input type="number" style={styles.input} value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="No limit" /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Bed Capacity</label><input type="number" style={styles.input} value={form.bed_capacity} onChange={e => setForm(f => ({ ...f, bed_capacity: e.target.value }))} /></div>
                  <div style={styles.formGroup}><label style={styles.label}>Engagement Level (1-5)</label><input type="number" min="1" max="5" style={styles.input} value={form.engagement_level} onChange={e => setForm(f => ({ ...f, engagement_level: e.target.value }))} /></div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setModalOpen(false)}>Cancel</button>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
                </div>
              </div>
            </div>
          )}

          {/* Tag BDM Modal */}
          {tagModal && (
            <div style={styles.modal} onClick={() => setTagModal(null)}>
              <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Tag BDMs — {tagModal.hospital_name}</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Select which BDMs can access this hospital</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {bdmList.map(b => {
                    const isTagged = (tagModal.tagged_bdms || []).some(t => (t.bdm_id?._id || t.bdm_id) === b._id && t.is_active !== false);
                    return (
                      <label key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: isTagged ? '#f0fdf4' : '#f9fafb', borderRadius: 8, cursor: 'pointer', border: isTagged ? '1px solid #86efac' : '1px solid #e5e7eb' }}>
                        <input type="checkbox" checked={isTagged} onChange={() => handleTag(tagModal._id, b._id)} style={{ width: 'auto' }} />
                        <span style={{ fontWeight: 600 }}>{b.name}</span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{b.email}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => { setTagModal(null); refresh(); }}>Done</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
