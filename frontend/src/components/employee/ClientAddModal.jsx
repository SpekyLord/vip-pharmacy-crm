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
import useLookupData from '../../hooks/useLookupData';
import { useLookupOptions } from '../../erp/hooks/useLookups';

import SelectField from '../common/Select';

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

  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }

  .chip-btn {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: 1.5px solid #d1d5db;
    background: #fff;
    color: #4b5563;
    user-select: none;
  }

  .chip-btn:hover {
    border-color: #8b5cf6;
    color: #6d28d9;
  }

  .chip-btn.selected {
    background: #8b5cf6;
    border-color: #8b5cf6;
    color: #fff;
  }

  .chip-btn.selected:hover {
    background: #7c3aed;
    border-color: #7c3aed;
    color: #fff;
  }

  @media (max-width: 640px) {
    .client-form-row {
      grid-template-columns: 1fr;
    }

    .chip-btn {
      font-size: 0.75rem;
      padding: 5px 12px;
    }
  }
`;

const ClientAddModal = ({ client, onClose, onSaved }) => {
  const { programs: PROGRAMS, supportTypes: SUPPORT_TYPES } = useLookupData();
  const { options: ENGAGEMENT_LEVELS } = useLookupOptions('ENGAGEMENT_LEVEL');
  const isEdit = !!client;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    firstName: client?.firstName || '',
    lastName: client?.lastName || '',
    specialization: client?.specialization || '',
    clinicOfficeAddress: client?.clinicOfficeAddress || '',
    phone: client?.phone || '',
    email: client?.email || '',
    notes: client?.notes || '',
    schedulingMode: client?.schedulingMode || 'flexible',
    visitFrequency: client?.visitFrequency || 4,
    weekPattern: client?.weekSchedule?.w2 != null && client?.weekSchedule?.w4 != null && client?.weekSchedule?.w1 == null ? 'w2w4' : 'w1w3',
    weekSchedule: {
      w1: client?.weekSchedule?.w1 || '',
      w2: client?.weekSchedule?.w2 || '',
      w3: client?.weekSchedule?.w3 || '',
      w4: client?.weekSchedule?.w4 || '',
    },
    outletIndicator: client?.outletIndicator || '',
    programsToImplement: client?.programsToImplement || [],
    supportDuringCoverage: client?.supportDuringCoverage || [],
    levelOfEngagement: client?.levelOfEngagement || '',
    secretaryName: client?.secretaryName || '',
    secretaryPhone: client?.secretaryPhone || '',
    birthday: client?.birthday ? client.birthday.split('T')[0] : '',
    anniversary: client?.anniversary ? client.anniversary.split('T')[0] : '',
    otherDetails: client?.otherDetails || '',
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

    // Build submission data
    const submitData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      specialization: formData.specialization,
      clinicOfficeAddress: formData.clinicOfficeAddress,
      phone: formData.phone,
      notes: formData.notes,
      schedulingMode: formData.schedulingMode,
    };

    // Only include visit frequency for strict mode
    if (formData.schedulingMode === 'strict') {
      submitData.visitFrequency = parseInt(formData.visitFrequency);
    }

    if (formData.email) submitData.email = formData.email;
    if (formData.outletIndicator) submitData.outletIndicator = formData.outletIndicator;
    if (formData.programsToImplement.length > 0) submitData.programsToImplement = formData.programsToImplement;
    if (formData.supportDuringCoverage.length > 0) submitData.supportDuringCoverage = formData.supportDuringCoverage;
    if (formData.levelOfEngagement) submitData.levelOfEngagement = parseInt(formData.levelOfEngagement);
    if (formData.secretaryName) submitData.secretaryName = formData.secretaryName;
    if (formData.secretaryPhone) submitData.secretaryPhone = formData.secretaryPhone;
    if (formData.birthday) submitData.birthday = formData.birthday;
    if (formData.anniversary) submitData.anniversary = formData.anniversary;
    if (formData.otherDetails) submitData.otherDetails = formData.otherDetails;

    // Build weekSchedule based on frequency and pattern (only for strict mode)
    if (formData.schedulingMode === 'strict') {
      const ws = {};
      if (parseInt(formData.visitFrequency) === 2) {
        if (formData.weekPattern === 'w1w3') {
          if (formData.weekSchedule.w1) ws.w1 = parseInt(formData.weekSchedule.w1);
          if (formData.weekSchedule.w3) ws.w3 = parseInt(formData.weekSchedule.w3);
        } else {
          if (formData.weekSchedule.w2) ws.w2 = parseInt(formData.weekSchedule.w2);
          if (formData.weekSchedule.w4) ws.w4 = parseInt(formData.weekSchedule.w4);
        }
      } else {
        if (formData.weekSchedule.w1) ws.w1 = parseInt(formData.weekSchedule.w1);
        if (formData.weekSchedule.w2) ws.w2 = parseInt(formData.weekSchedule.w2);
        if (formData.weekSchedule.w3) ws.w3 = parseInt(formData.weekSchedule.w3);
        if (formData.weekSchedule.w4) ws.w4 = parseInt(formData.weekSchedule.w4);
      }
      submitData.weekSchedule = ws;
    } else {
      // Clear week schedule for flexible mode
      submitData.weekSchedule = {};
    }

    try {
      if (isEdit) {
        await clientService.update(client._id, submitData);
        toast.success('Client updated successfully');
      } else {
        await clientService.create(submitData);
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

            <div className="client-form-row">
              <div className="client-form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="client-form-group">
                <label>Outlet Indicator</label>
                <input
                  type="text"
                  value={formData.outletIndicator}
                  onChange={(e) => handleChange('outletIndicator', e.target.value)}
                  placeholder="e.g. MMC, AMC, PHC"
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

            <div className="client-form-group">
              <label>Programs to Implement</label>
              <div className="chip-group">
                {PROGRAMS.map((p) => {
                  const isSelected = formData.programsToImplement.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      className={`chip-btn${isSelected ? ' selected' : ''}`}
                      onClick={() => {
                        const updated = isSelected
                          ? formData.programsToImplement.filter((v) => v !== p)
                          : [...formData.programsToImplement, p];
                        handleChange('programsToImplement', updated);
                      }}
                    >
                      {isSelected ? '\u2713 ' : ''}{p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="client-form-group">
              <label>Support During Coverage</label>
              <div className="chip-group">
                {SUPPORT_TYPES.map((s) => {
                  const isSelected = formData.supportDuringCoverage.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      className={`chip-btn${isSelected ? ' selected' : ''}`}
                      onClick={() => {
                        const updated = isSelected
                          ? formData.supportDuringCoverage.filter((v) => v !== s)
                          : [...formData.supportDuringCoverage, s];
                        handleChange('supportDuringCoverage', updated);
                      }}
                    >
                      {isSelected ? '\u2713 ' : ''}{s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="client-form-row">
              <div className="client-form-group">
                <label>Level of Engagement</label>
                <SelectField
                  value={formData.levelOfEngagement}
                  onChange={(e) => handleChange('levelOfEngagement', e.target.value)}
                >
                  <option value="">-- Select --</option>
                  {ENGAGEMENT_LEVELS.map((lvl) => (
                    <option key={lvl.value} value={lvl.value}>{lvl.label}</option>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="client-form-row">
              <div className="client-form-group">
                <label>Secretary Name</label>
                <input
                  type="text"
                  value={formData.secretaryName}
                  onChange={(e) => handleChange('secretaryName', e.target.value)}
                />
              </div>
              <div className="client-form-group">
                <label>Secretary Phone</label>
                <input
                  type="text"
                  value={formData.secretaryPhone}
                  onChange={(e) => handleChange('secretaryPhone', e.target.value)}
                />
              </div>
            </div>

            <div className="client-form-row">
              <div className="client-form-group">
                <label>Birthday</label>
                <input
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => handleChange('birthday', e.target.value)}
                />
              </div>
              <div className="client-form-group">
                <label>Anniversary</label>
                <input
                  type="date"
                  value={formData.anniversary}
                  onChange={(e) => handleChange('anniversary', e.target.value)}
                />
              </div>
            </div>

            <div className="client-form-group">
              <label>Other Details</label>
              <textarea
                value={formData.otherDetails}
                onChange={(e) => handleChange('otherDetails', e.target.value)}
                placeholder="Any other relevant information"
                maxLength={2000}
              />
            </div>

            <div className="client-form-group">
              <label>Scheduling Mode</label>
              <SelectField
                value={formData.schedulingMode}
                onChange={(e) => handleChange('schedulingMode', e.target.value)}
              >
                <option value="flexible">Flexible — Visit anytime, no schedule enforcement</option>
                <option value="strict">Strict — Enforced schedule (appears in Today tab)</option>
              </SelectField>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0 0' }}>
                {formData.schedulingMode === 'flexible'
                  ? 'No weekly limits or missed visit tracking. Visit this client whenever needed.'
                  : 'Uses visit frequency and weekly schedule like VIP clients. Appears in your Today schedule.'}
              </p>
            </div>

            {formData.schedulingMode === 'strict' && (
              <>
                <div className="client-form-row">
                  <div className="client-form-group">
                    <label>Visit Frequency</label>
                    <SelectField
                      value={formData.visitFrequency}
                      onChange={(e) => handleChange('visitFrequency', parseInt(e.target.value))}
                    >
                      <option value={4}>4x / month (every week)</option>
                      <option value={2}>2x / month (alternating weeks)</option>
                    </SelectField>
                  </div>

                  {parseInt(formData.visitFrequency) === 2 && (
                    <div className="client-form-group">
                      <label>Week Pattern</label>
                      <SelectField
                        value={formData.weekPattern}
                        onChange={(e) => handleChange('weekPattern', e.target.value)}
                      >
                        <option value="w1w3">Week 1 + Week 3</option>
                        <option value="w2w4">Week 2 + Week 4</option>
                      </SelectField>
                    </div>
                  )}
                </div>

                {parseInt(formData.visitFrequency) === 4 ? (
                  <div className="client-form-row">
                    {['w1', 'w2', 'w3', 'w4'].map((wk) => (
                      <div className="client-form-group" key={wk}>
                        <label>{wk.toUpperCase()} Day</label>
                        <SelectField
                          value={formData.weekSchedule[wk]}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              weekSchedule: { ...prev.weekSchedule, [wk]: e.target.value },
                            }))
                          }
                        >
                          <option value="">-- Select --</option>
                          <option value="1">Monday</option>
                          <option value="2">Tuesday</option>
                          <option value="3">Wednesday</option>
                          <option value="4">Thursday</option>
                          <option value="5">Friday</option>
                        </SelectField>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="client-form-row">
                    {(formData.weekPattern === 'w1w3' ? ['w1', 'w3'] : ['w2', 'w4']).map((wk) => (
                      <div className="client-form-group" key={wk}>
                        <label>{wk.toUpperCase()} Day</label>
                        <SelectField
                          value={formData.weekSchedule[wk]}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              weekSchedule: { ...prev.weekSchedule, [wk]: e.target.value },
                            }))
                          }
                        >
                          <option value="">-- Select --</option>
                          <option value="1">Monday</option>
                          <option value="2">Tuesday</option>
                          <option value="3">Wednesday</option>
                          <option value="4">Thursday</option>
                          <option value="5">Friday</option>
                        </SelectField>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
