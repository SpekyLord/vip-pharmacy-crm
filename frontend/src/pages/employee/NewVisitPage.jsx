/**
 * NewVisitPage
 *
 * Page wrapper for logging a new visit:
 * - Gets doctor ID from URL query params
 * - Fetches doctor details
 * - Checks if user can visit (weekly/monthly limits)
 * - Shows error if limit reached
 * - Renders VisitLogger component
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitLogger from '../../components/employee/VisitLogger';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import doctorService from '../../services/doctorService';
import visitService from '../../services/visitService';

const NewVisitPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const doctorId = searchParams.get('doctorId');

  const [doctor, setDoctor] = useState(null);
  const [canVisit, setCanVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!doctorId) {
        setError('No doctor selected. Please select a doctor from the dashboard.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch doctor details and visit eligibility in parallel
        const [doctorRes, canVisitRes] = await Promise.all([
          doctorService.getById(doctorId),
          visitService.canVisit(doctorId),
        ]);

        setDoctor(doctorRes.data);
        setCanVisit(canVisitRes.data);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.response?.data?.message || 'Failed to load doctor information');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [doctorId]);

  // Handle successful visit submission
  const handleVisitSuccess = () => {
    navigate('/employee/visits');
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <Link to="/employee" className="back-link">
              &larr; Back to Dashboard
            </Link>
            <h1>Log Visit</h1>
          </div>

          {error && (
            <div className="error-message">
              <p>{error}</p>
              <Link to="/employee" className="btn btn-primary">
                Go to Dashboard
              </Link>
            </div>
          )}

          {!error && doctor && !canVisit?.canVisit && (
            <div className="limit-reached-message">
              <h2>Cannot Log Visit</h2>
              <p>{canVisit?.reason}</p>
              <div className="visit-stats">
                <span>Weekly visits: {canVisit?.weeklyCount || 0}</span>
                <span>Monthly visits: {canVisit?.monthlyCount || 0} / {canVisit?.monthlyLimit || doctor.visitFrequency}</span>
              </div>
              <Link to="/employee" className="btn btn-primary">
                Back to Dashboard
              </Link>
            </div>
          )}

          {!error && doctor && canVisit?.canVisit && (
            <VisitLogger
              doctor={doctor}
              onSuccess={handleVisitSuccess}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default NewVisitPage;
