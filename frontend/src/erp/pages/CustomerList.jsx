import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import useCustomers from '../hooks/useCustomers';

const CUSTOMER_TYPES = ['ALL', 'PERSON', 'PHARMACY', 'DIAGNOSTIC_CENTER', 'INDUSTRIAL', 'OTHER'];
const SALE_TYPES = ['CSI', 'SERVICE_INVOICE', 'CASH_RECEIPT'];
const STATUS_OPTIONS = ['ALL', 'ACTIVE', 'INACTIVE'];
const VAT_OPTIONS = ['VAT', 'NON_VAT', 'ZERO_RATED'];

const TYPE_BADGE_COLORS = {
  PERSON: { bg: '#dbeafe', text: '#1e40af' },
  PHARMACY: { bg: '#dcfce7', text: '#166534' },
  DIAGNOSTIC_CENTER: { bg: '#fef3c7', text: '#92400e' },
  INDUSTRIAL: { bg: '#e0e7ff', text: '#3730a3' },
  OTHER: { bg: '#f3f4f6', text: '#4b5563' },
};

const STATUS_BADGE = {
  ACTIVE: { bg: '#dcfce7', text: '#166534' },
  INACTIVE: { bg: '#fef2f2', text: '#991b1b' },
};

const pageStyles = `
  .cust-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .cust-main { flex: 1; min-width: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 20px; max-width: 1200px; margin: 0 auto; }
  .cust-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  .cust-header h1 { font-size: 22px; color: var(--erp-text, #132238); margin: 0 0 4px; }
  .cust-header p { color: var(--erp-muted, #5f7188); font-size: 14px; margin: 0; }

  .cust-filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
  .cust-filters input,
  .cust-filters select { padding: 7px 10px; border: 1px solid var(--erp-border, #dbe4f0); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); }
  .cust-filters input { min-width: 200px; }

  .cust-table { width: 100%; border-collapse: collapse; font-size: 13px; background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #dbe4f0); border-radius: 12px; overflow: hidden; }
  .cust-table th { background: var(--erp-accent-soft, #e8efff); padding: 10px 12px; text-align: left; font-weight: 600; color: var(--erp-text); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .cust-table td { padding: 10px 12px; border-top: 1px solid var(--erp-border); }
  .cust-table tr:hover { background: var(--erp-accent-soft, #f0f4ff); }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }

  .btn { padding: 7px 14px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .btn-primary { background: var(--erp-accent, #1e5eff); color: #fff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-sm { padding: 4px 10px; font-size: 12px; }
  .btn-danger { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
  .btn-ghost { background: transparent; color: var(--erp-accent, #1e5eff); border: 1px solid var(--erp-border); }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .modal { background: var(--erp-panel, #fff); border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; padding: 24px; position: relative; }
  .modal h2 { margin: 0 0 16px; font-size: 18px; color: var(--erp-text); }
  .modal .close-btn { position: absolute; top: 12px; right: 16px; background: none; border: none; font-size: 22px; cursor: pointer; color: var(--erp-muted); }

  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-group { display: flex; flex-direction: column; gap: 4px; }
  .form-group.full { grid-column: 1 / -1; }
  .form-group label { font-size: 12px; font-weight: 600; color: var(--erp-muted); }
  .form-group input,
  .form-group select { padding: 8px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; }
  .form-group input:focus,
  .form-group select:focus { outline: none; border-color: var(--erp-accent); }
  .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }

  .pagination { display: flex; gap: 6px; align-items: center; justify-content: center; margin-top: 16px; }
  .pagination button { padding: 6px 12px; border: 1px solid var(--erp-border); border-radius: 6px; background: var(--erp-panel); font-size: 13px; cursor: pointer; }
  .pagination button:disabled { opacity: 0.4; cursor: default; }
  .pagination button.active { background: var(--erp-accent); color: #fff; border-color: var(--erp-accent); }
  .pagination span { font-size: 13px; color: var(--erp-muted); }

  .empty-row { text-align: center; padding: 40px 12px; color: var(--erp-muted); }

  @media (max-width: 768px) {
    .cust-filters { flex-direction: column; }
    .cust-filters input { min-width: 100%; }
    .form-grid { grid-template-columns: 1fr; }
    .cust-table { font-size: 12px; }
    .cust-table th, .cust-table td { padding: 8px 8px; }
  }
`;

const EMPTY_FORM = {
  customer_name: '',
  customer_type: '',
  default_sale_type: 'CSI',
  tin: '',
  address: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  vat_status: 'VAT',
  payment_terms: 30,
  credit_limit: 0,
};

export default function CustomerList() {
  const customers = useCustomers();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ q: '', customer_type: 'ALL', status: 'ALL' });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filters.q) params.q = filters.q;
      if (filters.customer_type !== 'ALL') params.customer_type = filters.customer_type;
      if (filters.status !== 'ALL') params.status = filters.status;

      const res = await customers.getAll(params);
      setData(res?.data || []);
      if (res?.pagination) {
        setTotalPages(res.pagination.pages || 1);
        setTotal(res.pagination.total || 0);
      }
    } catch {
      // error is captured by useErpApi
    } finally {
      setLoading(false);
    }
  }, [page, filters.q, filters.customer_type, filters.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters(prev => ({ ...prev, q: searchInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  // Modal open/close
  const openCreate = () => {
    setEditingCustomer(null);
    setForm({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (cust) => {
    setEditingCustomer(cust);
    setForm({
      customer_name: cust.customer_name || '',
      customer_type: cust.customer_type || '',
      default_sale_type: cust.default_sale_type || 'CSI',
      tin: cust.tin || '',
      address: cust.address || '',
      contact_person: cust.contact_person || '',
      contact_phone: cust.contact_phone || '',
      contact_email: cust.contact_email || '',
      vat_status: cust.vat_status || 'VAT',
      payment_terms: cust.payment_terms ?? 30,
      credit_limit: cust.credit_limit ?? 0,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingCustomer(null);
  };

  const handleFormChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!form.customer_name.trim()) return;
    setSaving(true);
    try {
      if (editingCustomer) {
        await customers.update(editingCustomer._id, form);
      } else {
        await customers.create(form);
      }
      closeModal();
      fetchCustomers();
    } catch {
      // error shown via useErpApi
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this customer?')) return;
    try {
      await customers.deactivate(id);
      fetchCustomers();
    } catch {
      // error shown via useErpApi
    }
  };

  const formatType = (type) => (type || '').replace(/_/g, ' ');

  return (
    <div className="admin-page erp-page cust-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="cust-main">
          <div className="cust-header">
            <div>
              <h1>Customers</h1>
              <p>{total} customer{total !== 1 ? 's' : ''} total</p>
            </div>
            <button className="btn btn-primary" onClick={openCreate}>+ New Customer</button>
          </div>

          {/* Filters */}
          <div className="cust-filters">
            <input
              type="text"
              placeholder="Search customers..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
            />
            <select
              value={filters.customer_type}
              onChange={e => handleFilterChange('customer_type', e.target.value)}
            >
              {CUSTOMER_TYPES.map(t => (
                <option key={t} value={t}>{t === 'ALL' ? 'All Types' : formatType(t)}</option>
              ))}
            </select>
            <select
              value={filters.status}
              onChange={e => handleFilterChange('status', e.target.value)}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s === 'ALL' ? 'All Status' : s}</option>
              ))}
            </select>
          </div>

          {/* Table */}
          <table className="cust-table">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th>Type</th>
                <th>Sale Type</th>
                <th>Contact Person</th>
                <th>Payment Terms</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(cust => {
                const typeColor = TYPE_BADGE_COLORS[cust.customer_type] || TYPE_BADGE_COLORS.OTHER;
                const statusColor = STATUS_BADGE[cust.status] || STATUS_BADGE.ACTIVE;
                return (
                  <tr key={cust._id}>
                    <td>
                      <strong>{cust.customer_name}</strong>
                      {cust.tin && <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>TIN: {cust.tin}</div>}
                    </td>
                    <td>
                      {cust.customer_type && (
                        <span className="badge" style={{ background: typeColor.bg, color: typeColor.text }}>
                          {formatType(cust.customer_type)}
                        </span>
                      )}
                    </td>
                    <td>{cust.default_sale_type || '-'}</td>
                    <td>
                      {cust.contact_person || '-'}
                      {cust.contact_phone && <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{cust.contact_phone}</div>}
                    </td>
                    <td>{cust.payment_terms != null ? `${cust.payment_terms} days` : '-'}</td>
                    <td>
                      <span className="badge" style={{ background: statusColor.bg, color: statusColor.text }}>
                        {cust.status || 'ACTIVE'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(cust)}>Edit</button>
                        {(cust.status || 'ACTIVE') === 'ACTIVE' && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(cust._id)}>Deactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!data.length && !loading && (
                <tr><td colSpan={7} className="empty-row">No customers found</td></tr>
              )}
              {loading && (
                <tr><td colSpan={7} className="empty-row">Loading...</td></tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}

          {/* Error display */}
          {customers.error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#fef2f2', color: '#991b1b', borderRadius: 8, fontSize: 13 }}>
              {customers.error}
            </div>
          )}

          {/* Create / Edit Modal */}
          {modalOpen && (
            <div className="modal-overlay" onClick={closeModal}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={closeModal}>&times;</button>
                <h2>{editingCustomer ? 'Edit Customer' : 'New Customer'}</h2>

                <div className="form-grid">
                  <div className="form-group full">
                    <label>Customer Name *</label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={e => handleFormChange('customer_name', e.target.value)}
                      placeholder="e.g. MG AND CO. INC."
                    />
                  </div>

                  <div className="form-group">
                    <label>Customer Type</label>
                    <select value={form.customer_type} onChange={e => handleFormChange('customer_type', e.target.value)}>
                      <option value="">-- Optional --</option>
                      {CUSTOMER_TYPES.filter(t => t !== 'ALL').map(t => (
                        <option key={t} value={t}>{formatType(t)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Default Sale Type</label>
                    <select value={form.default_sale_type} onChange={e => handleFormChange('default_sale_type', e.target.value)}>
                      {SALE_TYPES.map(t => (
                        <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>TIN</label>
                    <input
                      type="text"
                      value={form.tin}
                      onChange={e => handleFormChange('tin', e.target.value)}
                      placeholder="000-000-000-000"
                    />
                  </div>

                  <div className="form-group">
                    <label>VAT Status</label>
                    <select value={form.vat_status} onChange={e => handleFormChange('vat_status', e.target.value)}>
                      {VAT_OPTIONS.map(v => (
                        <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group full">
                    <label>Address</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={e => handleFormChange('address', e.target.value)}
                      placeholder="Full address"
                    />
                  </div>

                  <div className="form-group">
                    <label>Contact Person</label>
                    <input
                      type="text"
                      value={form.contact_person}
                      onChange={e => handleFormChange('contact_person', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Contact Phone</label>
                    <input
                      type="text"
                      value={form.contact_phone}
                      onChange={e => handleFormChange('contact_phone', e.target.value)}
                      placeholder="09xx-xxx-xxxx"
                    />
                  </div>

                  <div className="form-group full">
                    <label>Contact Email</label>
                    <input
                      type="email"
                      value={form.contact_email}
                      onChange={e => handleFormChange('contact_email', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Payment Terms (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.payment_terms}
                      onChange={e => handleFormChange('payment_terms', parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Credit Limit</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.credit_limit}
                      onChange={e => handleFormChange('credit_limit', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.customer_name.trim()}>
                    {saving ? 'Saving...' : editingCustomer ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
