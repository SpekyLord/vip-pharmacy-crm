/**
 * TargetProductsModal Component
 *
 * Modal for BDMs to manage target products (max 3 slots) on a VIP Client.
 * Each slot has a product picker and status toggle (showcasing / accepted).
 *
 * Props:
 * - doctor: the VIP Client object (must have _id, fullName/firstName+lastName, targetProducts)
 * - onClose: callback to close the modal
 * - onSaved: callback after successful save (receives updated doctor data)
 */

import { useEffect, useState } from 'react';
import doctorService from '../../services/doctorService';
import productService from '../../services/productService';

import SelectField from '../common/Select';

const MAX_SLOTS = 3;

const TargetProductsModal = ({ doctor, onClose, onSaved }) => {
  const [products, setProducts] = useState([]); // all available products
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Slots: array of { product: string (id) | '', status: 'showcasing' | 'accepted' }
  const [slots, setSlots] = useState(() => {
    const initial = (doctor?.targetProducts || []).slice(0, MAX_SLOTS).map((tp) => ({
      product: tp.product?._id || tp.product || '',
      status: tp.status || 'showcasing',
    }));
    // Pad to MAX_SLOTS
    while (initial.length < MAX_SLOTS) {
      initial.push({ product: '', status: 'showcasing' });
    }
    return initial;
  });

  // Fetch products filtered by doctor's specialization (fallback to all)
  useEffect(() => {
    let cancelled = false;
    const fetchProducts = async () => {
      try {
        let res;
        if (doctor?.specialization) {
          res = await productService.getBySpecialization(doctor.specialization);
        } else {
          res = await productService.getAll({ limit: 0 });
        }
        if (!cancelled) {
          setProducts(res.data || []);
        }
      } catch {
        if (!cancelled) setError('Failed to load products');
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    };
    fetchProducts();
    return () => { cancelled = true; };
  }, [doctor?.specialization]);

  const updateSlot = (index, field, value) => {
    setSlots((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const clearSlot = (index) => {
    setSlots((prev) => {
      const updated = [...prev];
      updated[index] = { product: '', status: 'showcasing' };
      return updated;
    });
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);

    // Filter out empty slots
    const payload = slots
      .filter((s) => s.product)
      .map((s) => ({ product: s.product, status: s.status }));

    // Check for duplicates
    const ids = payload.map((p) => p.product);
    if (new Set(ids).size !== ids.length) {
      setError('Each slot must have a different product');
      setSaving(false);
      return;
    }

    try {
      const res = await doctorService.updateTargetProducts(doctor._id, payload);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save target products');
    } finally {
      setSaving(false);
    }
  };

  // Products already selected in other slots (for disabling in dropdown)
  const selectedIds = slots.map((s) => s.product).filter(Boolean);

  const doctorName = doctor?.fullName || `${doctor?.firstName || ''} ${doctor?.lastName || ''}`.trim();

  return (
    <div className="tpm-overlay" onClick={onClose}>
      <div className="tpm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tpm-header">
          <h3>Target Products</h3>
          <p className="tpm-subtitle">{doctorName}</p>
          <button className="tpm-close" onClick={onClose} type="button">&times;</button>
        </div>

        {error && <div className="tpm-error">{error}</div>}

        <div className="tpm-slots">
          {slots.map((slot, i) => (
            <div key={i} className={`tpm-slot ${slot.product ? 'tpm-slot-filled' : ''}`}>
              <div className="tpm-slot-header">
                <span className="tpm-slot-label">Slot {i + 1}</span>
                {slot.product && (
                  <button
                    type="button"
                    className="tpm-slot-clear"
                    onClick={() => clearSlot(i)}
                    title="Remove product"
                  >
                    &times;
                  </button>
                )}
              </div>

              <SelectField
                className="tpm-select"
                value={slot.product}
                onChange={(e) => updateSlot(i, 'product', e.target.value)}
                disabled={loadingProducts}
              >
                <option value="">— Select product —</option>
                {products.map((p) => (
                  <option
                    key={p._id}
                    value={p._id}
                    disabled={selectedIds.includes(p._id) && slot.product !== p._id}
                  >
                    {p.name}{p.category ? ` (${p.category})` : ''}
                  </option>
                ))}
              </SelectField>

              {slot.product && (
                <div className="tpm-status-toggle">
                  <button
                    type="button"
                    className={`tpm-status-btn ${slot.status === 'showcasing' ? 'active' : ''}`}
                    onClick={() => updateSlot(i, 'status', 'showcasing')}
                  >
                    Showcasing
                  </button>
                  <button
                    type="button"
                    className={`tpm-status-btn ${slot.status === 'accepted' ? 'active' : ''}`}
                    onClick={() => updateSlot(i, 'status', 'accepted')}
                  >
                    Accepted
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="tpm-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <style>{`
        .tpm-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .tpm-modal {
          background: #fff;
          border-radius: 16px;
          width: 100%; max-width: 440px;
          box-shadow: 0 20px 60px rgba(0,0,0,.2);
          display: flex; flex-direction: column;
          max-height: 90vh;
          overflow-y: auto;
        }

        .tpm-header {
          padding: 20px 24px 12px;
          position: relative;
        }

        .tpm-header h3 {
          margin: 0; font-size: 18px; font-weight: 700; color: #111827;
        }

        .tpm-subtitle {
          margin: 4px 0 0; font-size: 13px; color: #6b7280;
        }

        .tpm-close {
          position: absolute; top: 16px; right: 16px;
          background: none; border: none;
          font-size: 22px; color: #9ca3af;
          cursor: pointer; line-height: 1;
        }
        .tpm-close:hover { color: #374151; }

        .tpm-error {
          margin: 0 24px 8px;
          padding: 10px 14px;
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; color: #b91c1c;
          font-size: 13px; font-weight: 500;
        }

        .tpm-slots {
          padding: 8px 24px 16px;
          display: flex; flex-direction: column; gap: 14px;
        }

        .tpm-slot {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 14px;
          background: #f9fafb;
          transition: border-color .2s;
        }

        .tpm-slot-filled {
          border-color: #bfdbfe;
          background: #eff6ff;
        }

        .tpm-slot-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 10px;
        }

        .tpm-slot-label {
          font-size: 12px; font-weight: 700; color: #6b7280;
          text-transform: uppercase; letter-spacing: .5px;
        }

        .tpm-slot-clear {
          background: none; border: none;
          font-size: 18px; color: #9ca3af; cursor: pointer; line-height: 1;
        }
        .tpm-slot-clear:hover { color: #ef4444; }

        .tpm-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          background: #fff;
          cursor: pointer;
        }
        .tpm-select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,.1);
        }

        .tpm-status-toggle {
          display: flex; gap: 8px; margin-top: 10px;
        }

        .tpm-status-btn {
          flex: 1;
          padding: 8px 0;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          background: #fff;
          font-size: 13px; font-weight: 600;
          cursor: pointer;
          color: #6b7280;
          transition: all .15s;
        }

        .tpm-status-btn.active {
          border-color: #3b82f6;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .tpm-status-btn:hover:not(.active) {
          background: #f3f4f6;
        }

        .tpm-actions {
          padding: 12px 24px 20px;
          display: flex; justify-content: flex-end; gap: 10px;
          border-top: 1px solid #f3f4f6;
        }

        @media (max-width: 480px) {
          .tpm-modal { max-width: 100%; border-radius: 12px; }
          .tpm-slots { padding: 8px 16px 16px; }
          .tpm-header { padding: 16px 16px 10px; }
          .tpm-actions { padding: 12px 16px 16px; }
        }
      `}</style>
    </div>
  );
};

export default TargetProductsModal;
