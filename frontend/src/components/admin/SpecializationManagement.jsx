import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import specializationService from '../../services/specializationService';

const smStyles = `
  .sm-container {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    padding: 24px;
  }

  .sm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .sm-search {
    flex: 1;
    min-width: 200px;
    max-width: 400px;
    position: relative;
  }

  .sm-search input {
    width: 100%;
    padding: 10px 12px 10px 36px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .sm-search input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .sm-search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }

  .sm-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sm-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .sm-btn-primary {
    background: #2563eb;
    color: white;
  }

  .sm-btn-primary:hover {
    background: #1d4ed8;
  }

  .sm-btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .sm-btn-secondary:hover {
    background: #e5e7eb;
  }

  .sm-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sm-table {
    width: 100%;
    border-collapse: collapse;
  }

  .sm-table th,
  .sm-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }

  .sm-table th {
    background: #f9fafb;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.05em;
  }

  .sm-table td {
    font-size: 14px;
    color: #111827;
  }

  .sm-table tbody tr:hover {
    background: #f9fafb;
  }

  .sm-status {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 500;
  }

  .sm-status-active {
    background: #dcfce7;
    color: #166534;
  }

  .sm-status-inactive {
    background: #fee2e2;
    color: #991b1b;
  }

  .sm-action-btns {
    display: flex;
    gap: 8px;
  }

  .sm-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: white;
    cursor: pointer;
    color: #6b7280;
  }

  .sm-icon-btn:hover {
    background: #f3f4f6;
    color: #111827;
  }

  .sm-icon-btn.danger:hover {
    background: #fee2e2;
    color: #dc2626;
    border-color: #fca5a5;
  }

  .sm-empty {
    text-align: center;
    padding: 48px 16px;
    color: #6b7280;
  }

  .sm-empty p {
    margin: 8px 0;
  }

  .sm-count {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 12px;
  }

  /* Modal */
  .sm-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .sm-modal {
    background: white;
    border-radius: 12px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  }

  .sm-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .sm-modal-header h3 {
    margin: 0;
    font-size: 18px;
    color: #111827;
  }

  .sm-modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    cursor: pointer;
    color: #6b7280;
    border-radius: 6px;
  }

  .sm-modal-close:hover {
    background: #f3f4f6;
    color: #111827;
  }

  .sm-modal-body {
    padding: 24px;
  }

  .sm-form-group {
    margin-bottom: 16px;
  }

  .sm-form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }

  .sm-form-group input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .sm-form-group input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .sm-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .sm-container {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .sm-search input {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  body.dark-mode .sm-search input:focus {
    border-color: #3b82f6;
  }

  body.dark-mode .sm-btn-secondary {
    background: #334155;
    color: #e2e8f0;
    border-color: #475569;
  }

  body.dark-mode .sm-btn-secondary:hover {
    background: #475569;
  }

  body.dark-mode .sm-table th {
    background: #0f172a;
    color: #94a3b8;
  }

  body.dark-mode .sm-table td {
    color: #e2e8f0;
    border-color: #334155;
  }

  body.dark-mode .sm-table th {
    border-color: #334155;
  }

  body.dark-mode .sm-table tbody tr:hover {
    background: #0f172a;
  }

  body.dark-mode .sm-status-active {
    background: #064e3b;
    color: #6ee7b7;
  }

  body.dark-mode .sm-status-inactive {
    background: #450a0a;
    color: #fca5a5;
  }

  body.dark-mode .sm-icon-btn {
    background: #334155;
    border-color: #475569;
    color: #94a3b8;
  }

  body.dark-mode .sm-icon-btn:hover {
    background: #475569;
    color: #f1f5f9;
  }

  body.dark-mode .sm-icon-btn.danger:hover {
    background: #450a0a;
    color: #fca5a5;
    border-color: #7f1d1d;
  }

  body.dark-mode .sm-empty {
    color: #94a3b8;
  }

  body.dark-mode .sm-count {
    color: #94a3b8;
  }

  body.dark-mode .sm-modal {
    background: #1e293b;
  }

  body.dark-mode .sm-modal-header {
    border-color: #334155;
  }

  body.dark-mode .sm-modal-header h3 {
    color: #f1f5f9;
  }

  body.dark-mode .sm-modal-close:hover {
    background: #334155;
    color: #f1f5f9;
  }

  body.dark-mode .sm-modal-body {
    color: #e2e8f0;
  }

  body.dark-mode .sm-form-group label {
    color: #cbd5e1;
  }

  body.dark-mode .sm-form-group input {
    background: #0f172a;
    border-color: #475569;
    color: #f1f5f9;
  }

  body.dark-mode .sm-form-group input:focus {
    border-color: #3b82f6;
  }

  body.dark-mode .sm-modal-footer {
    border-color: #334155;
  }

  @media (max-width: 640px) {
    .sm-container {
      padding: 16px;
    }

    .sm-header {
      flex-direction: column;
      align-items: stretch;
    }

    .sm-search {
      max-width: 100%;
    }

    .sm-actions {
      justify-content: flex-end;
    }

    .sm-table th:nth-child(2),
    .sm-table td:nth-child(2) {
      display: none;
    }
  }
`;

const SpecializationManagement = () => {
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchSpecializations = async () => {
    try {
      setLoading(true);
      const res = await specializationService.getAll();
      setSpecializations(res.data || []);
    } catch {
      toast.error('Failed to load specializations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecializations();
  }, []);

  const filtered = specializations.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditItem(null);
    setFormName('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setFormName(item.name);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditItem(null);
    setFormName('');
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (editItem) {
        await specializationService.update(editItem._id, { name: formName.trim() });
        toast.success('Specialization updated');
      } else {
        await specializationService.create({ name: formName.trim() });
        toast.success('Specialization created');
      }
      closeModal();
      fetchSpecializations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item) => {
    if (!confirm(`Deactivate "${item.name}"? It will no longer appear in dropdowns.`)) return;

    try {
      await specializationService.delete(item._id);
      toast.success('Specialization deactivated');
      fetchSpecializations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate');
    }
  };

  const handleReactivate = async (item) => {
    try {
      await specializationService.update(item._id, { isActive: true });
      toast.success('Specialization reactivated');
      fetchSpecializations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reactivate');
    }
  };

  const handleSeed = async () => {
    if (!confirm('Import all existing specializations from VIP Client and Product records? Duplicates will be skipped.')) return;

    setSeeding(true);
    try {
      const res = await specializationService.seed();
      toast.success(res.message || 'Import complete');
      fetchSpecializations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setSeeding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
  };

  return (
    <div className="sm-container">
      <style>{smStyles}</style>

      <div className="sm-header">
        <div className="sm-search">
          <Search size={16} className="sm-search-icon" />
          <input
            type="text"
            placeholder="Search specializations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="sm-actions">
          <button className="sm-btn sm-btn-secondary" onClick={handleSeed} disabled={seeding}>
            <RefreshCw size={16} className={seeding ? 'spinning' : ''} />
            {seeding ? 'Importing...' : 'Import from VIP Clients'}
          </button>
          <button className="sm-btn sm-btn-primary" onClick={openAdd}>
            <Plus size={16} />
            Add Specialization
          </button>
        </div>
      </div>

      <div className="sm-count">
        {filtered.length} specialization{filtered.length !== 1 ? 's' : ''}
        {search && ` matching "${search}"`}
      </div>

      {loading ? (
        <div className="sm-empty"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="sm-empty">
          <p>{search ? 'No specializations match your search.' : 'No specializations yet.'}</p>
          {!search && <p>Click "Import from VIP Clients" to seed from existing data, or add one manually.</p>}
        </div>
      ) : (
        <table className="sm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item._id}>
                <td>{item.name}</td>
                <td>
                  <span className={`sm-status ${item.isActive ? 'sm-status-active' : 'sm-status-inactive'}`}>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="sm-action-btns">
                    <button className="sm-icon-btn" onClick={() => openEdit(item)} title="Edit">
                      <Edit2 size={14} />
                    </button>
                    {item.isActive ? (
                      <button className="sm-icon-btn danger" onClick={() => handleDeactivate(item)} title="Deactivate">
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <button className="sm-icon-btn" onClick={() => handleReactivate(item)} title="Reactivate">
                        <RefreshCw size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="sm-modal-overlay" onClick={closeModal}>
          <div className="sm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sm-modal-header">
              <h3>{editItem ? 'Edit Specialization' : 'Add Specialization'}</h3>
              <button className="sm-modal-close" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="sm-modal-body">
              <div className="sm-form-group">
                <label>Specialization Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. OB-GYN, Surgery, Internal Medicine"
                  autoFocus
                />
              </div>
            </div>
            <div className="sm-modal-footer">
              <button className="sm-btn sm-btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button className="sm-btn sm-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecializationManagement;
