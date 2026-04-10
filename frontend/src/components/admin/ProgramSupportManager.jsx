/**
 * ProgramSupportManager — Reusable CRUD list for Programs or Support Types.
 *
 * Props:
 *   service  — { getAll, create, update, delete, seed } (programService or supportTypeService)
 *   label    — "Program" or "Support Type"
 */

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { invalidateLookupCache } from '../../hooks/useLookupData';

const styles = `
  .psm-container { max-width: 700px; }

  .psm-toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .psm-toolbar input {
    flex: 1;
    min-width: 200px;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: #fff;
  }

  body.dark-mode .psm-toolbar input {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
  }

  .psm-btn {
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .psm-btn-primary {
    background: #2563eb;
    color: #fff;
  }
  .psm-btn-primary:hover { background: #1d4ed8; }
  .psm-btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }

  .psm-btn-secondary {
    background: #f1f5f9;
    color: #334155;
    border: 1px solid #d1d5db;
  }
  .psm-btn-secondary:hover { background: #e2e8f0; }

  body.dark-mode .psm-btn-secondary {
    background: #334155;
    color: #e2e8f0;
    border-color: #475569;
  }

  .psm-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .psm-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  body.dark-mode .psm-item {
    background: #1e293b;
    border-color: #334155;
  }

  .psm-item.inactive {
    opacity: 0.5;
  }

  .psm-item-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: #1f2937;
  }

  body.dark-mode .psm-item-name { color: #e2e8f0; }

  .psm-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .psm-badge-active {
    background: #dcfce7;
    color: #166534;
  }

  .psm-badge-inactive {
    background: #fee2e2;
    color: #991b1b;
  }

  body.dark-mode .psm-badge-active { background: #14532d; color: #86efac; }
  body.dark-mode .psm-badge-inactive { background: #450a0a; color: #fca5a5; }

  .psm-item-actions {
    display: flex;
    gap: 6px;
  }

  .psm-action-btn {
    padding: 6px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #fff;
    font-size: 12px;
    cursor: pointer;
    color: #374151;
  }

  .psm-action-btn:hover { background: #f3f4f6; }

  body.dark-mode .psm-action-btn {
    background: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }

  .psm-action-btn.danger { color: #dc2626; border-color: #fca5a5; }
  .psm-action-btn.danger:hover { background: #fef2f2; }
  .psm-action-btn.success { color: #16a34a; border-color: #86efac; }
  .psm-action-btn.success:hover { background: #f0fdf4; }

  .psm-edit-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid #2563eb;
    border-radius: 6px;
    font-size: 14px;
    background: #fff;
  }

  body.dark-mode .psm-edit-input {
    background: #1e293b;
    color: #e2e8f0;
    border-color: #3b82f6;
  }

  .psm-empty {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
    font-size: 14px;
  }

  .psm-count {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 12px;
  }

  @media (max-width: 640px) {
    .psm-container {
      max-width: 100%;
    }

    .psm-toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .psm-toolbar input {
      min-width: 0;
      width: 100%;
    }

    .psm-btn {
      width: 100%;
      justify-content: center;
    }

    .psm-item {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .psm-item-actions {
      width: 100%;
      justify-content: flex-end;
      flex-wrap: wrap;
    }

    .psm-action-btn {
      flex: 1 1 auto;
    }
  }
`;

const ProgramSupportManager = ({ service, label }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      // Add cache-busting param to avoid 5-min browser cache after mutations
      const res = await service.getAll({ _t: Date.now() });
      setItems(res.data || []);
    } catch {
      toast.error(`Failed to load ${label.toLowerCase()}s`);
    } finally {
      setLoading(false);
    }
  }, [service, label]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreate = async () => {
    if (!newName.trim() || saving) return;
    setSaving(true);
    try {
      await service.create({ name: newName.trim() });
      setNewName('');
      toast.success(`${label} created`);
      invalidateLookupCache();
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to create ${label.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id) => {
    if (!editName.trim() || saving) return;
    setSaving(true);
    try {
      await service.update(id, { name: editName.trim() });
      setEditingId(null);
      toast.success(`${label} updated`);
      invalidateLookupCache();
      fetchItems();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to update ${label.toLowerCase()}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await service.update(item._id, { isActive: !item.isActive });
      toast.success(`${label} ${item.isActive ? 'deactivated' : 'reactivated'}`);
      invalidateLookupCache();
      fetchItems();
    } catch {
      toast.error(`Failed to update ${label.toLowerCase()}`);
    }
  };

  const handleSeed = async () => {
    setSaving(true);
    try {
      const res = await service.seed();
      toast.success(res.message || 'Seed complete');
      invalidateLookupCache();
      fetchItems();
    } catch {
      toast.error('Seed failed');
    } finally {
      setSaving(false);
    }
  };

  const activeCount = items.filter((i) => i.isActive).length;

  if (loading) {
    return <div className="psm-empty">Loading...</div>;
  }

  return (
    <>
      <style>{styles}</style>
      <div className="psm-container">
        <div className="psm-toolbar">
          <input
            type="text"
            placeholder={`New ${label.toLowerCase()} name...`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button className="psm-btn psm-btn-primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
            Add
          </button>
          <button className="psm-btn psm-btn-secondary" onClick={handleSeed} disabled={saving}>
            Seed from Existing
          </button>
        </div>

        <div className="psm-count">
          {activeCount} active, {items.length - activeCount} inactive
        </div>

        <div className="psm-list">
          {items.length === 0 ? (
            <div className="psm-empty">
              No {label.toLowerCase()}s yet. Add one above or click &quot;Seed from Existing&quot; to import from VIP Client records.
            </div>
          ) : (
            items.map((item) => (
              <div key={item._id} className={`psm-item ${!item.isActive ? 'inactive' : ''}`}>
                {editingId === item._id ? (
                  <>
                    <input
                      className="psm-edit-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUpdate(item._id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autoFocus
                    />
                    <div className="psm-item-actions">
                      <button className="psm-action-btn success" onClick={() => handleUpdate(item._id)} disabled={saving}>
                        Save
                      </button>
                      <button className="psm-action-btn" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="psm-item-name">{item.name}</span>
                    <span className={`psm-badge ${item.isActive ? 'psm-badge-active' : 'psm-badge-inactive'}`}>
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <div className="psm-item-actions">
                      <button
                        className="psm-action-btn"
                        onClick={() => {
                          setEditingId(item._id);
                          setEditName(item.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        className={`psm-action-btn ${item.isActive ? 'danger' : 'success'}`}
                        onClick={() => handleToggleActive(item)}
                      >
                        {item.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default ProgramSupportManager;
