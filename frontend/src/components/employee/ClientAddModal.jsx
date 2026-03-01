/**
 * ClientAddModal Component
 *
 * Modal form for BDMs to add/edit regular (non-VIP) clients.
 * Simplified version of DoctorEditForm — no visit frequency,
 * no engagement level, no products, no programs.
 *
 * Props:
 * - client: optional client object for editing (null = add mode)
 * - onClose: callback to close the modal
 * - onSaved: callback after successful save
 */

import { useState } from 'react';
import clientService from '../../services/clientService';
import toast from 'react-hot-toast';

const modalStyles = `
  .client-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    padding: 1rem;
  }

  .client-modal {
    background: white;
    border-radius: 12px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .client-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .client-modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #1f2937;
  }

  .client-modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6b7280;
    padding: 4px;
  }

  .client-modal-body {
    padding: 1.5rem;
  }

  .client-form-group {
    margin-bottom: 1rem;
  }

  .client-form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.375rem;
  }

  .client-form-group input,
  .client-form-group select,
  .client-form-group textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 0.875rem;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .client-form-group input:focus,
  .client-form-group select:focus,
  .client-form-group textarea:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .client-form-group textarea {
    min-height: 80px;
    resize: vertical;
  }

  .client-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .client-modal-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }

  .client-modal-footer button {
    padding: 0.625rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .client-cancel-btn {
    background: white;
    border: 1px solid #d1d5db;
    color: #374151;
  }

  .client-cancel-btn:hover {
    background: #f3f4f6;
  }

  .client-save-btn {
    background: #8b5cf6;
    border: none;
    color: white;
  }

  .client-save-btn:hover:not(:disabled) {
    background: #7c3aed;
  }

  .client-save-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .client-form-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #dc2626;
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 640px) {
    .client-form-row {
      grid-template-columns: 1fr;
    }
  }
`;

const ClientAddModal = ({ client, onClose, onSaved }) => {
  const isEdit = !!client;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    firstName: client?.firstName || '',
    lastName: client?.lastName || '',
    specialization: client?.specialization || '',
    clinicOfficeAddress: client?.clinicOfficeAddress || '',
    phone: client?.phone || '',
    notes: client?.notes || '',
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.firstName.trim() || !formData.lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (isEdit) {
        await clientService.update(client._id, formData);
        toast.success('Client updated successfully');
      } else {
        await clientService.create(formData);
        toast.success('Client added successfully');
      }
      onSaved?.();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save client';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <style>{modalStyles}</style>
      <div className="client-modal" onClick={(e) => e.stopPropagation()}>
        <div className="client-modal-header">
          <h2>{isEdit ? 'Edit Client' : 'Add Regular Client'}</h2>
          <button className="client-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="client-modal-body">
            {error && <div className="client-form-error">{error}</div>}

            <div className="client-form-row">
              <div className="client-form-group">
                <label>First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => handleChange('firstName', e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
              <div className="client-form-group">
                <label>Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => handleChange('lastName', e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
            </div>

            <div className="client-form-row">
              <div className="client-form-group">
                <label>Specialization</label>
                <input
                  type="text"
                  value={formData.specialization}
                  onChange={(e) => handleChange('specialization', e.target.value)}
                  placeholder="e.g. General Practice"
                  maxLength={100}
                />
              </div>
              <div className="client-form-group">
                <label>Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="e.g. +63 912 345 6789"
                />
              </div>
            </div>

            <div className="client-form-group">
              <label>Clinic/Office Address</label>
              <input
                type="text"
                value={formData.clinicOfficeAddress}
                onChange={(e) => handleChange('clinicOfficeAddress', e.target.value)}
                placeholder="Full address"
                maxLength={500}
              />
            </div>

            <div className="client-form-group">
              <label>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Additional notes about this client"
                maxLength={1000}
              />
            </div>
          </div>

          <div className="client-modal-footer">
            <button
              type="button"
              className="client-cancel-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="client-save-btn"
              disabled={saving}
            >
              {saving ? 'Saving...' : isEdit ? 'Update Client' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientAddModal;
