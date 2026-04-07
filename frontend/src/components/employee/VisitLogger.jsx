/**
 * VisitLogger Component
 *
 * Form for logging doctor visits with:
 * - Photo capture with GPS location
 * - Visit type and purpose
 * - Doctor feedback and notes
 * - Work day validation
 * - FormData submission to backend
 */

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import CameraCapture from './CameraCapture';
import ProductDetailModal from './ProductDetailModal';
import EngagementTypeSelector from './EngagementTypeSelector';
import visitService from '../../services/visitService';
import productService from '../../services/productService';

import SelectField from '../common/Select';

const visitLoggerStyles = `
  .visit-logger {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  }

  .doctor-info-header {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 24px;
    text-align: center;
  }

  .doctor-info-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
  }

  .doctor-details {
    margin: 0 0 12px 0;
    opacity: 0.9;
  }

  .visit-frequency-badge {
    display: inline-block;
    background: rgba(255, 255, 255, 0.2);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 14px;
  }

  .form-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .form-section h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #1f2937;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 8px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .vl-product-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .vl-product-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .vl-product-card:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .vl-product-card.selected {
    background: #eff6ff;
    border-color: #2563eb;
  }

  .vl-product-thumb {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    background: #e5e7eb;
    flex-shrink: 0;
  }

  .vl-product-thumb-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    background: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .vl-product-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vl-product-name {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vl-product-sub {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vl-product-card input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .vl-view-hint {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 6px;
    text-align: center;
  }

  .form-actions {
    text-align: center;
    padding: 20px 0;
  }

  .btn {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .btn-large {
    padding: 16px 48px;
    font-size: 18px;
    font-weight: 600;
  }

  .submit-hint {
    color: #6b7280;
    font-size: 14px;
    margin-top: 12px;
  }

  @media (max-width: 480px) {
    .visit-logger {
      padding: 12px;
    }
    .doctor-info-header h2 {
      font-size: 20px;
    }
    .form-group input,
    .form-group select,
    .form-group textarea {
      min-height: 44px;
      font-size: 16px;
    }
    .btn {
      min-height: 44px;
    }
    .btn-large {
      width: 100%;
      padding: 14px 24px;
      font-size: 16px;
    }
  }
`;

const VisitLogger = ({ doctor, onSuccess }) => {
  const [photos, setPhotos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailIndex, setDetailIndex] = useState(0);
  const submittingRef = useRef(false);
  const [formData, setFormData] = useState({
    visitType: 'regular',
    purpose: '',
    productsDiscussed: [],
    engagementTypes: [],
    doctorFeedback: '',
    notes: '',
    nextVisitDate: '',
  });

  // Fetch products by doctor's specialization (fallback to all)
  useEffect(() => {
    const fetchProducts = async () => {
      if (!doctor?._id) return;
      try {
        let response;
        if (doctor?.specialization) {
          response = await productService.getBySpecialization(doctor.specialization);
        } else {
          response = await productService.getAll({ limit: 0 });
        }
        setProducts(response.data || []);
      } catch (err) {
        console.error('Failed to fetch products:', err);
      }
    };
    fetchProducts();
  }, [doctor?._id, doctor?.specialization]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProductToggle = (productId) => {
    setFormData((prev) => ({
      ...prev,
      productsDiscussed: prev.productsDiscussed.includes(productId)
        ? prev.productsDiscussed.filter((id) => id !== productId)
        : [...prev.productsDiscussed, productId],
    }));
  };

  const handlePhotosChange = (capturedPhotos) => {
    setPhotos(capturedPhotos);
  };

  // Convert a base64 data URL to File object with strict validation
  const dataUrlToFile = (dataUrl, filename) => {
    if (typeof dataUrl !== 'string') {
      throw new Error('Photo data is missing or invalid');
    }

    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) {
      throw new Error('Photo data must be a base64 data URL');
    }

    const [, mimeType, base64Body] = match;
    if (!base64Body) {
      throw new Error('Photo data is empty');
    }

    let binaryString;
    try {
      binaryString = atob(base64Body);
    } catch {
      throw new Error('Photo base64 payload is corrupted');
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new File([bytes], filename, { type: mimeType || 'image/jpeg' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading || submittingRef.current) {
      return;
    }

    // Validate photos
    if (photos.length === 0) {
      toast.error('At least 1 photo is required as proof of visit');
      return;
    }

    // Get GPS location if available - prefer first photo with GPS, not required
    const visitLocation = photos.find(p => p.location)?.location;

    submittingRef.current = true;
    setLoading(true);

    try {
      // Create FormData for multipart upload
      const submitData = new FormData();
      submitData.append('doctor', doctor._id);
      submitData.append('visitType', formData.visitType);
      submitData.append('purpose', formData.purpose);
      submitData.append('doctorFeedback', formData.doctorFeedback);
      submitData.append('notes', formData.notes);

      // Add location as JSON string (optional — attached when available)
      if (visitLocation) {
        submitData.append('location', JSON.stringify({
          latitude: visitLocation.latitude,
          longitude: visitLocation.longitude,
          accuracy: visitLocation.accuracy,
          capturedAt: photos[0].capturedAt,
        }));
      }

      // Add photo metadata (capturedAt, source per photo)
      const photoMeta = photos.map((p, i) => ({
        index: i,
        capturedAt: p.capturedAt,
        source: p.source || 'camera',
        hasGps: !!p.location,
      }));
      submitData.append('photoMetadata', JSON.stringify(photoMeta));

      // Add products discussed
      if (formData.productsDiscussed.length > 0) {
        const productsData = formData.productsDiscussed.map((productId) => ({
          product: productId,
          presented: true,
        }));
        submitData.append('productsDiscussed', JSON.stringify(productsData));
      }

      // Add engagement types
      if (formData.engagementTypes.length > 0) {
        submitData.append('engagementTypes', JSON.stringify(formData.engagementTypes));
      }

      // Add next visit date if set
      if (formData.nextVisitDate) {
        submitData.append('nextVisitDate', formData.nextVisitDate);
      }

      // Convert and append photos
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        let file;

        try {
          if (photo.file instanceof File) {
            file = photo.file;
          } else if (photo.blob instanceof Blob) {
            file = new File([photo.blob], `visit-photo-${index + 1}.jpg`, {
              type: photo.blob.type || 'image/jpeg',
            });
          } else {
            file = dataUrlToFile(photo.data, `visit-photo-${index + 1}.jpg`);
          }
        } catch {
          toast.error(`Photo ${index + 1} is invalid. Please remove and recapture/upload it.`);
          return;
        }

        submitData.append('photos', file);
      }

      await visitService.create(submitData);
      toast.success('Visit logged successfully!');
      onSuccess?.();
    } catch (err) {
      console.error('Failed to log visit:', err);
      console.error('Error response:', err.response?.data);
      // Show detailed validation errors if available
      if (err.response?.data?.errors?.length > 0) {
        const errorMessages = err.response.data.errors.map(e => `${e.field}: ${e.message}`).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        toast.error(err.response?.data?.message || 'Failed to log visit');
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="visit-logger">
      <style>{visitLoggerStyles}</style>
      {/* Doctor Info Header */}
      <div className="doctor-info-header">
        <h2>{doctor?.firstName} {doctor?.lastName}</h2>
        <p className="doctor-details">
          {[doctor?.specialization, doctor?.clinicOfficeAddress].filter(Boolean).join(' — ')}
        </p>
        <span className="visit-frequency-badge">
          {doctor?.visitFrequency}x per month
        </span>
      </div>
      {/* Photo Capture Section */}
      <div className="form-section">
        <h3>Photo Proof *</h3>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>
          Use camera, upload from gallery, or paste from clipboard
        </p>
        <CameraCapture
          onCapture={handlePhotosChange}
          maxPhotos={5}
        />
      </div>
      {/* Visit Details */}
      <div className="form-section">
        <h3>Visit Details</h3>

        <div className="form-group">
          <label htmlFor="visitType">Visit Type</label>
          <SelectField
            id="visitType"
            name="visitType"
            value={formData.visitType}
            onChange={handleChange}
          >
            <option value="regular">Regular</option>
            <option value="follow-up">Follow-up</option>
            <option value="emergency">Emergency</option>
          </SelectField>
        </div>

        <div className="form-group">
          <label htmlFor="purpose">Purpose</label>
          <input
            type="text"
            id="purpose"
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            placeholder="Enter visit purpose"
          />
        </div>
      </div>
      {/* Products Discussed */}
      {products.length > 0 && (
        <div className="form-section">
          <h3>Products Discussed</h3>
          <div className="vl-product-cards">
            {products.map((item, idx) => {
              const prod = item.product || item;
              const productId = prod._id || item._id;
              const isSelected = formData.productsDiscussed.includes(productId);
              return (
                <div
                  key={productId}
                  className={`vl-product-card${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    setDetailIndex(idx);
                    setDetailProduct(prod);
                  }}
                >
                  {prod.image ? (
                    <img className="vl-product-thumb" src={prod.image} alt={prod.name} />
                  ) : (
                    <div className="vl-product-thumb-placeholder">&#128138;</div>
                  )}
                  <div className="vl-product-info">
                    <span className="vl-product-name">{prod.name || 'Unknown'}</span>
                    {(prod.genericName || prod.dosage) && (
                      <span className="vl-product-sub">
                        {[prod.genericName, prod.dosage].filter(Boolean).join(' - ')}
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleProductToggle(productId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>
          <p className="vl-view-hint">Tap a product to view details</p>
        </div>
      )}
      {/* Product Detail Modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          products={products.map((item) => item.product || item)}
          currentIndex={detailIndex}
        />
      )}
      {/* Engagement Types */}
      <div className="form-section">
        <h3>Engagement Type</h3>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>
          Select all engagement types used during this visit
        </p>
        <EngagementTypeSelector
          selected={formData.engagementTypes}
          onChange={(types) => setFormData((prev) => ({ ...prev, engagementTypes: types }))}
        />
      </div>
      {/* Feedback & Notes */}
      <div className="form-section">
        <h3>Feedback & Notes</h3>

        <div className="form-group">
          <label htmlFor="doctorFeedback">VIP Client Feedback</label>
          <textarea
            id="doctorFeedback"
            name="doctorFeedback"
            value={formData.doctorFeedback}
            onChange={handleChange}
            placeholder="Enter VIP Client's feedback or response"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="notes">Additional Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Any additional notes about the visit"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="nextVisitDate">Next Visit Date (Optional)</label>
          <input
            type="date"
            id="nextVisitDate"
            name="nextVisitDate"
            value={formData.nextVisitDate}
            onChange={handleChange}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>
      {/* Submit Button */}
      <div className="form-actions">
        <button
          type="submit"
          disabled={loading || photos.length === 0}
          className="btn btn-primary btn-large"
        >
          {loading ? 'Submitting...' : 'Submit Visit'}
        </button>
        {photos.length === 0 && (
          <p className="submit-hint">Take at least 1 photo to submit</p>
        )}
      </div>
    </form>
  );
};

export default VisitLogger;
