/**
 * NewClientVisitPage
 *
 * Page for logging an extra call visit to a regular (non-VIP) client.
 * Simplified version of NewVisitPage — no products, no visit frequency checks.
 * Enforces 30 daily extra call limit.
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import CameraCapture from '../../components/employee/CameraCapture';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import clientService from '../../services/clientService';
import toast from 'react-hot-toast';

const pageStyles = `
  .dashboard-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .dashboard-content {
    display: flex;
  }

  .main-content {
    flex: 1;
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 12px 0 0 0;
    font-size: 28px;
    color: #1f2937;
  }

  .back-link {
    color: #8b5cf6;
    text-decoration: none;
    font-size: 14px;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .error-message {
    background: #fee2e2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }

  .error-message p {
    color: #dc2626;
    margin: 0 0 16px 0;
  }

  .limit-reached-message {
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }

  .limit-reached-message h2 {
    color: #92400e;
    margin: 0 0 8px 0;
  }

  .limit-reached-message p {
    color: #a16207;
    margin: 0 0 16px 0;
  }

  .limit-stats {
    display: flex;
    gap: 24px;
    justify-content: center;
    margin-bottom: 20px;
  }

  .limit-stats span {
    background: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
  }

  .client-visit-form {
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .client-info-header {
    background: linear-gradient(135deg, #8b5cf6, #a78bfa);
    color: white;
    padding: 20px 24px;
  }

  .client-info-header h2 {
    margin: 0 0 4px 0;
    font-size: 20px;
  }

  .client-info-header p {
    margin: 0;
    opacity: 0.9;
    font-size: 14px;
  }

  .form-body {
    padding: 24px;
  }

  .form-section {
    margin-bottom: 24px;
  }

  .form-section h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
    color: #374151;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    margin-bottom: 6px;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .form-group textarea {
    min-height: 80px;
    resize: vertical;
  }

  .submit-btn {
    width: 100%;
    padding: 14px 24px;
    background: #8b5cf6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .submit-btn:hover:not(:disabled) {
    background: #7c3aed;
  }

  .submit-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .btn {
    display: inline-block;
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #8b5cf6;
    color: white;
  }

  .btn-primary:hover {
    background: #7c3aed;
  }
`;

const NewClientVisitPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clientId = searchParams.get('clientId');

  const [client, setClient] = useState(null);
  const [dailyCount, setDailyCount] = useState(0);
  const [dailyLimit, setDailyLimit] = useState(30);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [photos, setPhotos] = useState([]);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!clientId) {
        setError('No client selected. Please select a client from the dashboard.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [clientRes, countRes] = await Promise.all([
          clientService.getById(clientId),
          clientService.getTodayVisitCount(),
        ]);

        if (isMounted) {
          setClient(clientRes.data);
          setDailyCount(countRes.data?.dailyCount || 0);
          setDailyLimit(countRes.data?.dailyLimit || 30);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || 'Failed to load client information');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [clientId]);

  const handlePhotosChange = (capturedPhotos) => {
    setPhotos(capturedPhotos);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (photos.length === 0) {
      toast.error('At least one photo is required as proof of visit.');
      return;
    }

    // Get GPS location from first photo with location data
    const visitLocation = photos.find((p) => p.location)?.location;
    if (!visitLocation) {
      toast.error('GPS location required. Please enable location services and try again.');
      return;
    }

    setSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append('client', clientId);
      submitData.append('purpose', purpose);
      submitData.append('notes', notes);

      // Add location as JSON string
      submitData.append(
        'location',
        JSON.stringify({
          latitude: visitLocation.latitude,
          longitude: visitLocation.longitude,
          accuracy: visitLocation.accuracy,
        })
      );

      // Add photos — CameraCapture stores photos as base64 data URLs in photo.data
      for (const photo of photos) {
        if (photo.file) {
          submitData.append('photos', photo.file);
        } else if (photo.blob) {
          submitData.append('photos', photo.blob, `photo_${Date.now()}.jpg`);
        } else if (photo.data) {
          // Convert base64 data URL to Blob
          const res = await fetch(photo.data);
          const blob = await res.blob();
          submitData.append('photos', blob, `photo_${Date.now()}.jpg`);
        }
      }

      await clientService.createVisit(submitData);
      toast.success('Extra call logged successfully!');
      navigate('/employee');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to log visit';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  const atLimit = dailyCount >= dailyLimit;

  return (
    <div className="dashboard-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <Link to="/employee" className="back-link">
              &larr; Back to Dashboard
            </Link>
            <h1>Log Extra Call</h1>
          </div>

          {error && (
            <div className="error-message">
              <p>{error}</p>
              <Link to="/employee" className="btn btn-primary">
                Go to Dashboard
              </Link>
            </div>
          )}

          {!error && client && atLimit && (
            <div className="limit-reached-message">
              <h2>Daily Limit Reached</h2>
              <p>You have reached the maximum of {dailyLimit} extra calls for today.</p>
              <div className="limit-stats">
                <span>Today&apos;s calls: {dailyCount}/{dailyLimit}</span>
              </div>
              <Link to="/employee" className="btn btn-primary">
                Back to Dashboard
              </Link>
            </div>
          )}

          {!error && client && !atLimit && (
            <form onSubmit={handleSubmit} className="client-visit-form">
              {/* Client Info Header */}
              <div className="client-info-header">
                <h2>{client.fullName || `${client.firstName} ${client.lastName}`}</h2>
                <p>
                  {[client.specialization, client.clinicOfficeAddress]
                    .filter(Boolean)
                    .join(' | ') || 'Regular Client'}
                </p>
                <p style={{ marginTop: '4px', fontSize: '13px', opacity: 0.8 }}>
                  Extra calls today: {dailyCount}/{dailyLimit}
                </p>
              </div>

              <div className="form-body">
                {/* Photo Capture */}
                <div className="form-section">
                  <h3>Photos (Required)</h3>
                  <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                    Take a photo or upload from gallery. GPS will be captured automatically.
                  </p>
                  <CameraCapture onCapture={handlePhotosChange} maxPhotos={5} />
                </div>

                {/* Purpose */}
                <div className="form-group">
                  <label htmlFor="purpose">Purpose</label>
                  <input
                    id="purpose"
                    type="text"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="Purpose of this visit"
                    maxLength={500}
                  />
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label htmlFor="notes">Notes</label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes"
                    maxLength={1000}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  className="submit-btn"
                  disabled={submitting || photos.length === 0}
                >
                  {submitting ? 'Logging Visit...' : 'Log Extra Call'}
                </button>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};

export default NewClientVisitPage;
