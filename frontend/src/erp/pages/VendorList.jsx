import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import usePurchasing from '../hooks/usePurchasing';

const styles = `
  .vl-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .vl-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .vl-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
  .vl-header h2 { font-size: 20px; font-weight: 700; margin: 0; }
  .vl-search { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--erp-border, #e2e8f0); font-size: 13px; width: 260px; }
  .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .vl-table { width: 100%; border-collapse: collapse; background: var(--erp-panel, #fff); border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .vl-table th, .vl-table td { padding: 10px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid var(--erp-border, #f1f5f9); }
  .vl-table th { background: var(--erp-accent-soft, #e8efff); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--erp-muted, #64748b); }
  .vl-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 500; }
  .vl-badge-active { background: #dcfce7; color: #166534; }
  .vl-badge-inactive { background: #fee2e2; color: #dc2626; }
  .vl-badge-vat { background: #dbeafe; color: #1e40af; }
  .vl-badge-exempt { background: #fef3c7; color: #92400e; }
  .vl-modal { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .vl-modal-body { background: var(--erp-panel, #fff); border-radius: 12px; padding: 24px; width: 520px; max-width: 95vw; max-height: 90vh; overflow-y: auto; }
  .vl-modal-body h3 { margin: 0 0 16px; font-size: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--erp-muted); }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--erp-border); font-size: 13px; box-sizing: border-box; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .vl-msg { font-size: 13px; margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; }
  .vl-msg-ok { background: #dcfce7; color: #166534; }
  .vl-msg-err { background: #fee2e2; color: #dc2626; }
  .vl-empty { text-align: center; color: #64748b; padding: 40px; }
  .vl-actions { display: flex; gap: 6px; }
  @media(max-width: 768px) { .vl-main { padding: 12px; } .vl-search { width: 100%; } .form-row { grid-template-columns: 1fr; } }
`;

const EMPTY_FORM = {
  vendor_name: '', vendor_code: '', tin: '', address: '',
  contact_person: '', phone: '', email: '',
  payment_terms_days: 30, vat_status: 'VATABLE',
  bank_account: { bank: '', account_no: '', account_name: '' }
};

export default function VendorList() {
  const { user } = useAuth();
  const api = usePurchasing();

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [msg, setMsg] = useState({ text: '', type: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.q = search;
      const res = await api.listVendors(params);
      setVendors(res?.data || []);
    } catch { /* */ }
    setLoading(false);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditing(v);
    setForm({
      vendor_name: v.vendor_name || '',
      vendor_code: v.vendor_code || '',
      tin: v.tin || '',
      address: v.address || '',
      contact_person: v.contact_person || '',
      phone: v.phone || '',
      email: v.email || '',
      payment_terms_days: v.payment_terms_days ?? 30,
      vat_status: v.vat_status || 'VATABLE',
      bank_account: { bank: v.bank_account?.bank || '', account_no: v.bank_account?.account_no || '', account_name: v.bank_account?.account_name || '' }
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.updateVendor(editing._id, form);
        showMsg('Vendor updated');
      } else {
        await api.createVendor(form);
        showMsg('Vendor created');
      }
      setShowModal(false);
      load();
    } catch (e) {
      showMsg(e.response?.data?.message || 'Error saving vendor', 'err');
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this vendor?')) return;
    try {
      await api.deactivateVendor(id);
      showMsg('Vendor deactivated');
      load();
    } catch (e) {
      showMsg(e.response?.data?.message || 'Error', 'err');
    }
  };

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setBankField = (key, val) => setForm(f => ({ ...f, bank_account: { ...f.bank_account, [key]: val } }));

  return (
    <>
      <style>{styles}</style>
      <div className="vl-page">
        <Navbar />
        <div style={{ display: 'flex' }}>
          <Sidebar />
          <main className="vl-main">
            <div className="vl-header">
              <h2>Vendor Master</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="vl-search" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="btn btn-primary" onClick={openCreate}>+ Add Vendor</button>
              </div>
            </div>

            {msg.text && <div className={`vl-msg vl-msg-${msg.type}`}>{msg.text}</div>}

            {loading ? <p>Loading...</p> : vendors.length === 0 ? (
              <div className="vl-empty">No vendors found</div>
            ) : (
              <table className="vl-table">
                <thead>
                  <tr>
                    <th>Vendor Name</th>
                    <th>Code</th>
                    <th>TIN</th>
                    <th>Terms</th>
                    <th>VAT</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map(v => (
                    <tr key={v._id}>
                      <td style={{ fontWeight: 600 }}>{v.vendor_name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.vendor_code || '—'}</td>
                      <td>{v.tin || '—'}</td>
                      <td>{v.payment_terms_days || 0}d</td>
                      <td><span className={`vl-badge ${v.vat_status === 'VATABLE' ? 'vl-badge-vat' : 'vl-badge-exempt'}`}>{v.vat_status}</span></td>
                      <td><span className={`vl-badge ${v.is_active !== false ? 'vl-badge-active' : 'vl-badge-inactive'}`}>{v.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div className="vl-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => openEdit(v)}>Edit</button>
                          {v.is_active !== false && <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(v._id)}>Deactivate</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {showModal && (
              <div className="vl-modal" onClick={() => setShowModal(false)}>
                <div className="vl-modal-body" onClick={e => e.stopPropagation()}>
                  <h3>{editing ? 'Edit Vendor' : 'New Vendor'}</h3>
                  <div className="form-group">
                    <label>Vendor Name *</label>
                    <input value={form.vendor_name} onChange={e => setField('vendor_name', e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vendor Code</label>
                      <input value={form.vendor_code} onChange={e => setField('vendor_code', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>TIN</label>
                      <input value={form.tin} onChange={e => setField('tin', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Address</label>
                    <input value={form.address} onChange={e => setField('address', e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Contact Person</label>
                      <input value={form.contact_person} onChange={e => setField('contact_person', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Phone</label>
                      <input value={form.phone} onChange={e => setField('phone', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Payment Terms (days)</label>
                      <input type="number" value={form.payment_terms_days} onChange={e => setField('payment_terms_days', Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>VAT Status</label>
                      <select value={form.vat_status} onChange={e => setField('vat_status', e.target.value)}>
                        <option value="VATABLE">Vatable</option>
                        <option value="EXEMPT">Exempt</option>
                        <option value="ZERO">Zero-rated</option>
                      </select>
                    </div>
                  </div>
                  <h4 style={{ fontSize: 13, margin: '14px 0 8px', fontWeight: 600 }}>Bank Details</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Bank</label>
                      <input value={form.bank_account.bank} onChange={e => setBankField('bank', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Account No.</label>
                      <input value={form.bank_account.account_no} onChange={e => setBankField('account_no', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Account Name</label>
                    <input value={form.bank_account.account_name} onChange={e => setBankField('account_name', e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button className="btn" style={{ background: '#e2e8f0' }} onClick={() => setShowModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
