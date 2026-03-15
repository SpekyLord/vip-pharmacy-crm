/**
 * SpecializationProductsModal
 *
 * Shared modal for admins and BDMs to manage which products belong to a specialization.
 * Shows all active products as a toggleable checklist.
 *
 * Props:
 * - specialization: { _id, name }
 * - onClose: callback
 * - onSaved: optional callback after save
 */

import { useState, useEffect, useMemo } from 'react';
import specializationService from '../../services/specializationService';

const SpecializationProductsModal = ({ specialization, onClose, onSaved }) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [toggles, setToggles] = useState({}); // productId → boolean (current state)
  const [original, setOriginal] = useState({}); // productId → boolean (original state)

  useEffect(() => {
    if (!specialization?._id) return;
    setLoading(true);
    specializationService.getProducts(specialization._id)
      .then((res) => {
        const items = res.data || [];
        setProducts(items);
        const state = {};
        items.forEach((p) => { state[p._id] = p.isAssigned; });
        setToggles({ ...state });
        setOriginal({ ...state });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [specialization?._id]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = q
      ? products.filter((p) =>
          p.name.toLowerCase().includes(q) ||
          (p.genericName || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
        )
      : products;

    // Sort: assigned first, then alphabetical
    return [...list].sort((a, b) => {
      const aOn = toggles[a._id] ? 0 : 1;
      const bOn = toggles[b._id] ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.name.localeCompare(b.name);
    });
  }, [products, search, toggles]);

  const hasChanges = useMemo(() => {
    return Object.keys(toggles).some((id) => toggles[id] !== original[id]);
  }, [toggles, original]);

  const changeCount = useMemo(() => {
    return Object.keys(toggles).filter((id) => toggles[id] !== original[id]).length;
  }, [toggles, original]);

  const handleToggle = (productId) => {
    setToggles((prev) => ({ ...prev, [productId]: !prev[productId] }));
  };

  const handleSave = async () => {
    const addProductIds = [];
    const removeProductIds = [];

    Object.keys(toggles).forEach((id) => {
      if (toggles[id] && !original[id]) addProductIds.push(id);
      if (!toggles[id] && original[id]) removeProductIds.push(id);
    });

    if (addProductIds.length === 0 && removeProductIds.length === 0) return;

    setSaving(true);
    try {
      await specializationService.updateProducts(specialization._id, { addProductIds, removeProductIds });
      onSaved?.();
      onClose();
    } catch {
      // stay open on error
    } finally {
      setSaving(false);
    }
  };

  const assignedCount = Object.values(toggles).filter(Boolean).length;

  return (
    <div className="spm-overlay" onClick={onClose}>
      <div className="spm-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="spm-header">
          <div>
            <div className="spm-title">{specialization?.name}</div>
            <div className="spm-subtitle">{assignedCount} product{assignedCount !== 1 ? 's' : ''} assigned</div>
          </div>
          <button className="spm-close" onClick={onClose}>&times;</button>
        </div>

        {/* Search */}
        <div className="spm-search-wrap">
          <input
            className="spm-search"
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Product List */}
        <div className="spm-list">
          {loading ? (
            <div className="spm-empty">Loading products...</div>
          ) : filtered.length === 0 ? (
            <div className="spm-empty">No products found</div>
          ) : (
            filtered.map((p) => (
              <div
                key={p._id}
                className={`spm-item ${toggles[p._id] ? 'spm-item-on' : ''}`}
                onClick={() => handleToggle(p._id)}
              >
                <div className="spm-item-info">
                  <div className="spm-item-name">{p.name}</div>
                  {p.genericName && <div className="spm-item-meta">{p.genericName}</div>}
                  {p.category && <div className="spm-item-cat">{p.category}</div>}
                </div>
                <div className={`spm-toggle ${toggles[p._id] ? 'spm-toggle-on' : ''}`}>
                  <div className="spm-toggle-knob" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="spm-footer">
          <button className="spm-btn spm-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="spm-btn spm-btn-save"
            disabled={!hasChanges || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : hasChanges ? `Save (${changeCount})` : 'No Changes'}
          </button>
        </div>
      </div>

      <style>{`
        .spm-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 1100; padding: 16px;
        }
        .spm-modal {
          background: #fff;
          border-radius: 16px;
          width: 100%; max-width: 480px;
          max-height: 90vh;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,.2);
          overflow: hidden;
        }

        /* Header */
        .spm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid #f3f4f6;
          flex-shrink: 0;
        }
        .spm-title {
          font-size: 17px; font-weight: 700; color: #111827;
        }
        .spm-subtitle {
          font-size: 12px; color: #6b7280; margin-top: 2px;
        }
        .spm-close {
          background: none; border: none;
          font-size: 24px; color: #9ca3af; cursor: pointer;
          line-height: 1; flex-shrink: 0;
        }
        .spm-close:hover { color: #374151; }

        /* Search */
        .spm-search-wrap {
          padding: 10px 16px 6px;
          flex-shrink: 0;
        }
        .spm-search {
          width: 100%; padding: 10px 12px;
          border: 1px solid #e5e7eb; border-radius: 8px;
          font-size: 14px; outline: none;
          box-sizing: border-box;
          background: #f9fafb;
        }
        .spm-search:focus {
          border-color: #3b82f6;
          background: #fff;
        }

        /* List */
        .spm-list {
          flex: 1; overflow-y: auto;
          padding: 6px 16px 12px;
        }
        .spm-empty {
          text-align: center; padding: 32px 0;
          color: #9ca3af; font-size: 14px;
        }
        .spm-item {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          transition: background .15s;
          border: 1px solid transparent;
          margin-bottom: 2px;
        }
        .spm-item:hover {
          background: #f9fafb;
        }
        .spm-item-on {
          background: #eff6ff;
          border-color: #bfdbfe;
        }
        .spm-item-on:hover {
          background: #dbeafe;
        }
        .spm-item-info {
          flex: 1; min-width: 0;
        }
        .spm-item-name {
          font-size: 14px; font-weight: 600; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .spm-item-meta {
          font-size: 12px; color: #6b7280; margin-top: 1px;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .spm-item-cat {
          display: inline-block;
          font-size: 11px; color: #6b7280;
          background: #f3f4f6; border-radius: 4px;
          padding: 1px 6px; margin-top: 3px;
        }

        /* Toggle switch */
        .spm-toggle {
          width: 40px; height: 22px;
          background: #d1d5db;
          border-radius: 11px;
          position: relative;
          flex-shrink: 0;
          transition: background .2s;
        }
        .spm-toggle-on {
          background: #3b82f6;
        }
        .spm-toggle-knob {
          position: absolute;
          top: 2px; left: 2px;
          width: 18px; height: 18px;
          background: #fff;
          border-radius: 50%;
          transition: transform .2s;
          box-shadow: 0 1px 3px rgba(0,0,0,.15);
        }
        .spm-toggle-on .spm-toggle-knob {
          transform: translateX(18px);
        }

        /* Footer */
        .spm-footer {
          display: flex; gap: 10px;
          padding: 12px 16px 16px;
          border-top: 1px solid #f3f4f6;
          flex-shrink: 0;
        }
        .spm-btn {
          flex: 1;
          padding: 10px 16px;
          border: none; border-radius: 8px;
          font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all .15s;
        }
        .spm-btn:disabled {
          opacity: .45; cursor: not-allowed;
        }
        .spm-btn-cancel {
          background: #f3f4f6; color: #374151;
        }
        .spm-btn-cancel:hover { background: #e5e7eb; }
        .spm-btn-save {
          background: #2563eb; color: #fff;
        }
        .spm-btn-save:hover:not(:disabled) { background: #1d4ed8; }

        /* ===== DARK MODE ===== */
        body.dark-mode .spm-modal { background: #0f172a; }
        body.dark-mode .spm-header { border-bottom-color: #1e293b; }
        body.dark-mode .spm-title { color: #f1f5f9; }
        body.dark-mode .spm-subtitle { color: #94a3b8; }
        body.dark-mode .spm-close { color: #64748b; }
        body.dark-mode .spm-close:hover { color: #e2e8f0; }
        body.dark-mode .spm-search { background: #1e293b; border-color: #334155; color: #e2e8f0; }
        body.dark-mode .spm-search:focus { border-color: #3b82f6; background: #0f172a; }
        body.dark-mode .spm-empty { color: #64748b; }
        body.dark-mode .spm-item:hover { background: #1e293b; }
        body.dark-mode .spm-item-on { background: #172554; border-color: #1e3a5f; }
        body.dark-mode .spm-item-on:hover { background: #1e3a5f; }
        body.dark-mode .spm-item-name { color: #f1f5f9; }
        body.dark-mode .spm-item-meta { color: #94a3b8; }
        body.dark-mode .spm-item-cat { background: #1e293b; color: #94a3b8; }
        body.dark-mode .spm-toggle { background: #334155; }
        body.dark-mode .spm-toggle-on { background: #3b82f6; }
        body.dark-mode .spm-footer { border-top-color: #1e293b; }
        body.dark-mode .spm-btn-cancel { background: #1e293b; color: #e2e8f0; }
        body.dark-mode .spm-btn-cancel:hover { background: #334155; }

        /* Mobile */
        @media (max-width: 480px) {
          .spm-overlay { padding: 0; align-items: flex-end; }
          .spm-modal {
            max-width: 100%; max-height: 95vh;
            border-radius: 16px 16px 0 0;
          }
          .spm-item { padding: 12px; min-height: 48px; }
          .spm-toggle { width: 44px; height: 24px; }
          .spm-toggle-knob { width: 20px; height: 20px; }
          .spm-toggle-on .spm-toggle-knob { transform: translateX(20px); }
          .spm-btn { min-height: 44px; }
        }
      `}</style>
    </div>
  );
};

export default SpecializationProductsModal;
