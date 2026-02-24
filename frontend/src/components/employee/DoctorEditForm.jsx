/**
 * DoctorEditForm Component
 *
 * Modal form for BDMs to edit their assigned VIP Client details.
 * BDMs cannot edit: assignedTo, isActive, isVipAssociated (enforced server-side too).
 *
 * Props:
 * - doctor: the VIP Client object to edit
 * - onClose: callback to close the modal
 * - onSaved: callback after successful save (receives updated doctor data)
 */

import { useState, useEffect } from 'react';
import doctorService from '../../services/doctorService';
import regionService from '../../services/regionService';

// Enum options matching backend Doctor.js
const PROGRAMS = ['CME GRANT', 'REBATES / MONEY', 'REST AND RECREATION', 'MED SOCIETY PARTICIPATION'];
const SUPPORT_TYPES = ['STARTER DOSES', 'PROMATS', 'FULL DOSE', 'PATIENT DISCOUNT', 'AIR FRESHENER'];
const ENGAGEMENT_LEVELS = [
  { value: 1, label: '1 - Visited 4 times' },
  { value: 2, label: '2 - Knows BDM/products' },
  { value: 3, label: '3 - Tried products' },
  { value: 4, label: '4 - In group chat' },
  { value: 5, label: '5 - Active partner' },
];

const ensureArray = (val) => (Array.isArray(val) ? val : []);

const DoctorEditForm = ({ doctor, onClose, onSaved }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    firstName: doctor?.firstName || '',
    lastName: doctor?.lastName || '',
    specialization: doctor?.specialization || '',
    outletIndicator: doctor?.outletIndicator || '',
    clinicOfficeAddress: doctor?.clinicOfficeAddress || '',
    region: doctor?.region?._id || doctor?.region || '',
    phone: doctor?.phone || '',
    email: doctor?.email || '',
    visitFrequency: doctor?.visitFrequency || 4,
    levelOfEngagement: doctor?.levelOfEngagement || '',
    programsToImplement: doctor?.programsToImplement || [],
    supportDuringCoverage: doctor?.supportDuringCoverage || [],
    secretaryName: doctor?.secretaryName || '',
    secretaryPhone: doctor?.secretaryPhone || '',
    birthday: doctor?.birthday ? doctor.birthday.split('T')[0] : '',
    anniversary: doctor?.anniversary ? doctor.anniversary.split('T')[0] : '',
    notes: doctor?.notes || '',
    otherDetails: doctor?.otherDetails || '',
  });

  // Cascading region dropdown state
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');

  const [countries, setCountries] = useState([]);
  const [regionOptions, setRegionOptions] = useState([]);
  const [provinceOptions, setProvinceOptions] = useState([]);
  const [cityOptions, setCityOptions] = useState([]);
  const [districtOptions, setDistrictOptions] = useState([]);
  const [loadingRegions, setLoadingRegions] = useState(false);

  // Load countries and populate cascading dropdowns on mount
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const hierarchyResponse = await regionService.getHierarchy();
        const hierarchy = ensureArray(hierarchyResponse?.data);
        if (cancelled) return;
        setCountries(hierarchy);

        // Populate cascading dropdowns from doctor's current region
        const regionId = doctor?.region?._id || doctor?.region;
        if (regionId && hierarchy.length > 0) {
          populateCascadingDropdowns(hierarchy, regionId);
        }
      } catch (err) {
        console.error('Failed to load regions:', err);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // Update formData.region when any cascading selection changes
  useEffect(() => {
    const finalRegion = selectedDistrict || selectedCity || selectedProvince || selectedRegion || selectedCountry || '';
    setFormData((prev) => ({ ...prev, region: finalRegion }));
  }, [selectedCountry, selectedRegion, selectedProvince, selectedCity, selectedDistrict]);

  // Populate cascading dropdowns from a region hierarchy + target region ID
  const populateCascadingDropdowns = (hierarchy, regionId) => {
    const findRegionPath = (nodes, targetId, path = []) => {
      for (const node of nodes) {
        const currentPath = [...path, node];
        if (node._id === targetId) return currentPath;
        if (node.children && node.children.length > 0) {
          const found = findRegionPath(node.children, targetId, currentPath);
          if (found) return found;
        }
      }
      return null;
    };

    const regionPath = findRegionPath(hierarchy, regionId);
    if (!regionPath || regionPath.length === 0) return;

    const countryNode = regionPath[0];
    setSelectedCountry(countryNode._id);

    if (regionPath.length > 1) {
      setRegionOptions(ensureArray(countryNode.children));
      setSelectedRegion(regionPath[1]._id);

      if (regionPath.length > 2) {
        setProvinceOptions(ensureArray(regionPath[1].children));
        setSelectedProvince(regionPath[2]._id);

        if (regionPath.length > 3) {
          setCityOptions(ensureArray(regionPath[2].children));
          setSelectedCity(regionPath[3]._id);

          if (regionPath.length > 4) {
            setDistrictOptions(ensureArray(regionPath[3].children));
            setSelectedDistrict(regionPath[4]._id);
          }
        }
      }
    }
  };

  // Cascading change handlers
  const handleCountryChange = async (countryId) => {
    setSelectedCountry(countryId);
    setSelectedRegion('');
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedDistrict('');
    setProvinceOptions([]);
    setCityOptions([]);
    setDistrictOptions([]);

    if (countryId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(countryId);
        setRegionOptions(response.data?.children || []);
      } catch {
        setRegionOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setRegionOptions([]);
    }
  };

  const handleRegionChange = async (regionId) => {
    setSelectedRegion(regionId);
    setSelectedProvince('');
    setSelectedCity('');
    setSelectedDistrict('');
    setCityOptions([]);
    setDistrictOptions([]);

    if (regionId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(regionId);
        setProvinceOptions(response.data?.children || []);
      } catch {
        setProvinceOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setProvinceOptions([]);
    }
  };

  const handleProvinceChange = async (provinceId) => {
    setSelectedProvince(provinceId);
    setSelectedCity('');
    setSelectedDistrict('');
    setDistrictOptions([]);

    if (provinceId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(provinceId);
        setCityOptions(response.data?.children || []);
      } catch {
        setCityOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setCityOptions([]);
    }
  };

  const handleCityChange = async (cityId) => {
    setSelectedCity(cityId);
    setSelectedDistrict('');

    if (cityId) {
      setLoadingRegions(true);
      try {
        const response = await regionService.getChildren(cityId);
        setDistrictOptions(response.data?.children || []);
      } catch {
        setDistrictOptions([]);
      }
      setLoadingRegions(false);
    } else {
      setDistrictOptions([]);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'visitFrequency' || name === 'levelOfEngagement' ? (value ? parseInt(value) : '') : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    // Build payload with only non-empty optional fields
    const payload = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      region: formData.region,
      visitFrequency: formData.visitFrequency,
    };

    if (formData.specialization?.trim()) payload.specialization = formData.specialization.trim();
    if (formData.outletIndicator?.trim()) payload.outletIndicator = formData.outletIndicator.trim();
    if (formData.clinicOfficeAddress?.trim()) payload.clinicOfficeAddress = formData.clinicOfficeAddress.trim();
    if (formData.phone?.trim()) payload.phone = formData.phone.trim();
    if (formData.email?.trim()) payload.email = formData.email.trim();
    if (formData.notes?.trim()) payload.notes = formData.notes.trim();
    if (formData.otherDetails?.trim()) payload.otherDetails = formData.otherDetails.trim();
    if (formData.secretaryName?.trim()) payload.secretaryName = formData.secretaryName.trim();
    if (formData.secretaryPhone?.trim()) payload.secretaryPhone = formData.secretaryPhone.trim();
    if (formData.levelOfEngagement) payload.levelOfEngagement = formData.levelOfEngagement;
    if (formData.programsToImplement?.length > 0) payload.programsToImplement = formData.programsToImplement;
    if (formData.supportDuringCoverage?.length > 0) payload.supportDuringCoverage = formData.supportDuringCoverage;
    if (formData.birthday) payload.birthday = formData.birthday;
    if (formData.anniversary) payload.anniversary = formData.anniversary;

    try {
      const res = await doctorService.update(doctor._id, payload);
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update VIP Client');
    } finally {
      setSaving(false);
    }
  };

  const doctorName = doctor?.fullName || `${doctor?.firstName || ''} ${doctor?.lastName || ''}`.trim();

  return (
    <div className="def-overlay" onClick={onClose}>
      <div className="def-modal" onClick={(e) => e.stopPropagation()}>
        <div className="def-header">
          <h3>Edit VIP Client</h3>
          <p className="def-subtitle">{doctorName}</p>
          <button className="def-close" onClick={onClose} type="button">&times;</button>
        </div>

        {error && <div className="def-error">{error}</div>}

        <form onSubmit={handleSubmit} className="def-form">
          {/* Name */}
          <div className="def-row">
            <div className="def-field">
              <label>First Name *</label>
              <input
                type="text"
                name="firstName"
                value={formData.firstName}
                onChange={handleFormChange}
                required
              />
            </div>
            <div className="def-field">
              <label>Last Name *</label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleFormChange}
                required
              />
            </div>
          </div>

          {/* Specialization + Outlet */}
          <div className="def-row">
            <div className="def-field">
              <label>VIP Specialty</label>
              <input
                type="text"
                name="specialization"
                value={formData.specialization}
                onChange={handleFormChange}
                placeholder="e.g. Pedia Hema, Im Car"
              />
            </div>
            <div className="def-field">
              <label>Outlet Indicator</label>
              <input
                type="text"
                name="outletIndicator"
                value={formData.outletIndicator}
                onChange={handleFormChange}
              />
            </div>
          </div>

          {/* Address */}
          <div className="def-field">
            <label>Clinic/Office Address</label>
            <input
              type="text"
              name="clinicOfficeAddress"
              value={formData.clinicOfficeAddress}
              onChange={handleFormChange}
              placeholder="Hospital, clinic, or office address"
            />
          </div>

          {/* Cascading Region Dropdowns */}
          <div className="def-row">
            <div className="def-field">
              <label>Country *</label>
              <select
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                required
                disabled={loadingRegions}
              >
                <option value="">Select Country</option>
                {countries.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="def-field">
              <label>Region</label>
              <select
                value={selectedRegion}
                onChange={(e) => handleRegionChange(e.target.value)}
                disabled={!selectedCountry || loadingRegions}
              >
                <option value="">{regionOptions.length > 0 ? 'Select Region' : 'No regions'}</option>
                {regionOptions.map((r) => (
                  <option key={r._id} value={r._id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="def-row">
            <div className="def-field">
              <label>Province</label>
              <select
                value={selectedProvince}
                onChange={(e) => handleProvinceChange(e.target.value)}
                disabled={!selectedRegion || loadingRegions}
              >
                <option value="">{provinceOptions.length > 0 ? 'Select Province' : 'No provinces'}</option>
                {provinceOptions.map((p) => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="def-field">
              <label>City/Municipality</label>
              <select
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                disabled={!selectedProvince || loadingRegions}
              >
                <option value="">{cityOptions.length > 0 ? 'Select City' : 'No cities'}</option>
                {cityOptions.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {districtOptions.length > 0 && (
            <div className="def-field">
              <label>District/Area</label>
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                disabled={!selectedCity || loadingRegions}
              >
                <option value="">Select District (optional)</option>
                {districtOptions.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {loadingRegions && (
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0' }}>Loading regions...</p>
          )}

          {/* Phone + Email */}
          <div className="def-row">
            <div className="def-field">
              <label>Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleFormChange} />
            </div>
            <div className="def-field">
              <label>Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleFormChange} />
            </div>
          </div>

          {/* Visit Frequency + Engagement */}
          <div className="def-row">
            <div className="def-field">
              <label>Visit Frequency *</label>
              <select name="visitFrequency" value={formData.visitFrequency} onChange={handleFormChange} required>
                <option value={2}>2x per month</option>
                <option value={4}>4x per month</option>
              </select>
            </div>
            <div className="def-field">
              <label>Level of Engagement</label>
              <select name="levelOfEngagement" value={formData.levelOfEngagement} onChange={handleFormChange}>
                <option value="">Select Level</option>
                {ENGAGEMENT_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Programs */}
          <div className="def-field">
            <label>Programs to Implement</label>
            <div className="def-checkbox-group">
              {PROGRAMS.map((program) => (
                <label key={program} className="def-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.programsToImplement?.includes(program) || false}
                    onChange={(e) => {
                      const updated = e.target.checked
                        ? [...(formData.programsToImplement || []), program]
                        : (formData.programsToImplement || []).filter((p) => p !== program);
                      setFormData((prev) => ({ ...prev, programsToImplement: updated }));
                    }}
                  />
                  {program}
                </label>
              ))}
            </div>
          </div>

          {/* Support types */}
          <div className="def-field">
            <label>Support During Coverage</label>
            <div className="def-checkbox-group">
              {SUPPORT_TYPES.map((support) => (
                <label key={support} className="def-checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.supportDuringCoverage?.includes(support) || false}
                    onChange={(e) => {
                      const updated = e.target.checked
                        ? [...(formData.supportDuringCoverage || []), support]
                        : (formData.supportDuringCoverage || []).filter((s) => s !== support);
                      setFormData((prev) => ({ ...prev, supportDuringCoverage: updated }));
                    }}
                  />
                  {support}
                </label>
              ))}
            </div>
          </div>

          {/* Secretary */}
          <div className="def-row">
            <div className="def-field">
              <label>Secretary Name</label>
              <input type="text" name="secretaryName" value={formData.secretaryName} onChange={handleFormChange} />
            </div>
            <div className="def-field">
              <label>Secretary Phone</label>
              <input type="tel" name="secretaryPhone" value={formData.secretaryPhone} onChange={handleFormChange} />
            </div>
          </div>

          {/* Dates */}
          <div className="def-row">
            <div className="def-field">
              <label>Birthday</label>
              <input type="date" name="birthday" value={formData.birthday} onChange={handleFormChange} />
            </div>
            <div className="def-field">
              <label>Anniversary</label>
              <input type="date" name="anniversary" value={formData.anniversary} onChange={handleFormChange} />
            </div>
          </div>

          {/* Notes */}
          <div className="def-field">
            <label>Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleFormChange} placeholder="Additional notes..." />
          </div>

          <div className="def-field">
            <label>Other Details</label>
            <textarea name="otherDetails" value={formData.otherDetails} onChange={handleFormChange} placeholder="Any additional information..." />
          </div>

          {/* Actions */}
          <div className="def-actions">
            <button type="button" className="def-btn def-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="def-btn def-btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .def-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .def-modal {
          background: #fff;
          border-radius: 16px;
          width: 100%; max-width: 520px;
          box-shadow: 0 20px 60px rgba(0,0,0,.2);
          display: flex; flex-direction: column;
          max-height: 90vh;
          overflow-y: auto;
        }

        .def-header {
          padding: 20px 24px 12px;
          position: relative;
          border-bottom: 1px solid #f3f4f6;
        }

        .def-header h3 {
          margin: 0; font-size: 18px; font-weight: 700; color: #111827;
        }

        .def-subtitle {
          margin: 4px 0 0; font-size: 13px; color: #6b7280;
        }

        .def-close {
          position: absolute; top: 16px; right: 16px;
          background: none; border: none;
          font-size: 22px; color: #9ca3af;
          cursor: pointer; line-height: 1;
        }
        .def-close:hover { color: #374151; }

        .def-error {
          margin: 12px 24px 0;
          padding: 10px 14px;
          background: #fef2f2; border: 1px solid #fecaca;
          border-radius: 8px; color: #b91c1c;
          font-size: 13px; font-weight: 500;
        }

        .def-form {
          padding: 16px 24px 20px;
          display: flex; flex-direction: column; gap: 14px;
        }

        .def-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .def-field {
          display: flex; flex-direction: column; gap: 4px;
        }

        .def-field label {
          font-size: 12px; font-weight: 600; color: #374151;
        }

        .def-field input,
        .def-field select,
        .def-field textarea {
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          background: #fff;
          transition: border-color .2s;
        }

        .def-field input:focus,
        .def-field select:focus,
        .def-field textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59,130,246,.1);
        }

        .def-field textarea {
          min-height: 60px;
          resize: vertical;
        }

        .def-field select:disabled,
        .def-field input:disabled {
          background: #f3f4f6;
          cursor: not-allowed;
        }

        .def-checkbox-group {
          display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px;
        }

        .def-checkbox-label {
          display: flex; align-items: center; gap: 4px;
          font-size: 13px; cursor: pointer; color: #374151;
        }

        .def-checkbox-label input[type="checkbox"] {
          width: 14px; height: 14px; flex-shrink: 0;
          padding: 0; border-radius: 3px;
        }

        .def-actions {
          display: flex; justify-content: flex-end; gap: 10px;
          padding-top: 8px;
          border-top: 1px solid #f3f4f6;
        }

        .def-btn {
          padding: 10px 20px;
          border: none; border-radius: 8px;
          font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all .15s;
        }

        .def-btn:disabled {
          opacity: .6; cursor: not-allowed;
        }

        .def-btn-primary {
          background: #2563eb; color: #fff;
        }
        .def-btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .def-btn-secondary {
          background: #f3f4f6; color: #374151;
        }
        .def-btn-secondary:hover {
          background: #e5e7eb;
        }

        @media (max-width: 480px) {
          .def-modal { max-width: 100%; border-radius: 12px; }
          .def-form { padding: 12px 16px 16px; }
          .def-header { padding: 16px 16px 10px; }
          .def-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default DoctorEditForm;
