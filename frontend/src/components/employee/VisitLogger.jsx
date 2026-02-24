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

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import CameraCapture from './CameraCapture';
import visitService from '../../services/visitService';
import doctorService from '../../services/doctorService';

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

  .product-checkboxes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: #f9fafb;
    border-radius: 6px;
    cursor: pointer;
  }

  .checkbox-label:hover {
    background: #f3f4f6;
  }

  .checkbox-label input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
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
`;

const VisitLogger = ({ doctor, onSuccess }) => {
  const [photos, setPhotos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    visitType: 'regular',
    purpose: '',
    productsDiscussed: [],
    doctorFeedback: '',
    notes: '',
    nextVisitDate: '',
  });

  // Fetch assigned products for this doctor
  useEffect(() => {
    const fetchProducts = async () => {
      if (!doctor?._id) return;
      try {
        const response = await doctorService.getAssignedProducts(doctor._id);
        setProducts(response.data?.products || []);
      } catch (err) {
        console.error('Failed to fetch products:', err);
      }
    };
    fetchProducts();
  }, [doctor?._id]);

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

  // Check if today is a work day (Mon-Fri)
  const isWorkDay = () => {
    const day = new Date().getDay();
    return day >= 1 && day <= 5;
  };

  // Convert base64 to File object
  const base64ToFile = (base64Data, filename) => {
    const arr = base64Data.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate photos
    if (photos.length === 0) {
      toast.error('At least 1 photo is required as proof of visit');
      return;
    }

    // Validate work day
    if (!isWorkDay()) {
      toast.error('Visits can only be logged on work days (Monday-Friday)');
      return;
    }

    // Get GPS location - prefer first photo, fall back to any photo with GPS
    const visitLocation = photos.find(p => p.location)?.location;
    if (!visitLocation) {
      toast.error('GPS location required. Please enable location services and try again.');
      return;
    }

    setLoading(true);

    try {
      // Create FormData for multipart upload
      const submitData = new FormData();
      submitData.append('doctor', doctor._id);
      submitData.append('visitType', formData.visitType);
      submitData.append('purpose', formData.purpose);
      submitData.append('doctorFeedback', formData.doctorFeedback);
      submitData.append('notes', formData.notes);

      // Add location as JSON string
      submitData.append('location', JSON.stringify({
        latitude: visitLocation.latitude,
        longitude: visitLocation.longitude,
        accuracy: visitLocation.accuracy,
        capturedAt: photos[0].capturedAt,
      }));

      // Add products discussed
      if (formData.productsDiscussed.length > 0) {
        const productsData = formData.productsDiscussed.map((productId) => ({
          product: productId,
          presented: true,
        }));
        submitData.append('productsDiscussed', JSON.stringify(productsData));
      }

      // Add next visit date if set
      if (formData.nextVisitDate) {
        submitData.append('nextVisitDate', formData.nextVisitDate);
      }

      // Convert and append photos
      photos.forEach((photo, index) => {
        const file = base64ToFile(photo.data, `visit-photo-${index + 1}.jpg`);
        submitData.append('photos', file);
      });

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
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="visit-logger">
      <style>{visitLoggerStyles}</style>
      {/* Doctor Info Header */}
      <div className="doctor-info-header">
        <h2>{doctor?.name}</h2>
        <p className="doctor-details">
          {doctor?.specialization} | {doctor?.hospital}
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
          <select
            id="visitType"
            name="visitType"
            value={formData.visitType}
            onChange={handleChange}
          >
            <option value="regular">Regular</option>
            <option value="follow-up">Follow-up</option>
            <option value="emergency">Emergency</option>
          </select>
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
          <div className="product-checkboxes">
            {products.map((item) => (
              <label key={item.product?._id || item._id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.productsDiscussed.includes(item.product?._id || item._id)}
                  onChange={() => handleProductToggle(item.product?._id || item._id)}
                />
                {item.product?.name || item.name}
              </label>
            ))}
          </div>
        </div>
      )}

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
