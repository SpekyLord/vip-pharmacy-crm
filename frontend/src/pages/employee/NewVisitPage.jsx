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
import PageGuide from '../../components/common/PageGuide';
// Phase N — offline fallback: when the BDM is offline, the canVisit /
// getById network calls fail and would otherwise block the entire page,
// preventing the offline-aware VisitLogger from ever rendering. Read the
// doctor from IndexedDB instead and trust the SW's idempotent replay
// (Visit unique index { doctor, user, yearWeekKey } enforces the limit
// authoritatively at sync time).
import { offlineStore } from '../../utils/offlineStore';
import { offlineManager } from '../../utils/offlineManager';

const newVisitStyles = `
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
    color: #2563eb;
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

  .visit-stats {
    display: flex;
    gap: 24px;
    justify-content: center;
    margin-bottom: 20px;
  }

  .visit-stats span {
    background: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
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
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  @media (max-width: 480px) {
    .main-content {
      padding: 16px;
      padding-bottom: 80px;
    }
    .page-header h1 {
      font-size: 22px;
    }
    .visit-stats {
      flex-direction: column;
      gap: 12px;
      align-items: center;
    }
    .btn-primary {
      width: 100%;
      text-align: center;
      min-height: 44px;
    }
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .dashboard-layout {
    background: #0b1220;
  }

  body.dark-mode .page-header h1 {
    color: #f1f5f9;
  }

  body.dark-mode .back-link {
    color: #60a5fa;
  }

  body.dark-mode .visit-stats span {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #1e293b;
  }

  body.dark-mode .error-message {
    background: #450a0a;
    border-color: #7f1d1d;
  }

  body.dark-mode .error-message p {
    color: #fca5a5;
  }

  body.dark-mode .limit-reached-message {
    background: #451a03;
    border-color: #92400e;
  }

  body.dark-mode .limit-reached-message h2 {
    color: #fcd34d;
  }

  body.dark-mode .limit-reached-message p {
    color: #fde68a;
  }
`;

const NewVisitPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const doctorId = searchParams.get('doctorId');

  const [doctor, setDoctor] = useState(null);
  const [canVisit, setCanVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (!doctorId) {
        setError('No doctor selected. Please select a doctor from the dashboard.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch doctor details and visit eligibility in parallel.
        // allSettled instead of all so a single failure (typically the
        // canVisit call when offline) doesn't sink the whole page.
        const [doctorResult, canVisitResult] = await Promise.allSettled([
          doctorService.getById(doctorId),
          visitService.canVisit(doctorId),
        ]);

        let resolvedDoctor = doctorResult.status === 'fulfilled'
          ? doctorResult.value.data
          : null;
        let resolvedCanVisit = canVisitResult.status === 'fulfilled'
          ? canVisitResult.value.data
          : null;

        // Phase N — offline fallback. If the network failed and we're
        // offline, read the doctor from the IndexedDB cache (populated by
        // EmployeeDashboard / PartnershipCLM while online). Stub canVisit
        // to true: the Visit unique index + SW idempotent replay handles
        // weekly-limit enforcement when the queued submit reaches the
        // server.
        if (!resolvedDoctor && !offlineManager.isOnline) {
          try {
            const cached = await offlineStore.getCachedDoctors();
            resolvedDoctor = cached.find((d) => d._id === doctorId) || null;
          } catch {
            resolvedDoctor = null;
          }
        }
        if (!resolvedCanVisit && !offlineManager.isOnline && resolvedDoctor) {
          resolvedCanVisit = {
            canVisit: true,
            offlineFallback: true,
            reason: 'Weekly limit will be enforced when this visit syncs.',
          };
        }

        if (isMounted) {
          if (resolvedDoctor) {
            setDoctor(resolvedDoctor);
            setCanVisit(resolvedCanVisit);
          } else if (!offlineManager.isOnline) {
            setError('You are offline and this VIP Client is not in your local cache. Open them while online once to enable offline visits.');
          } else {
            const reason = doctorResult.status === 'rejected'
              ? doctorResult.reason?.response?.data?.message
              : null;
            setError(reason || 'Failed to load doctor information');
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || 'Failed to load doctor information');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [doctorId]);

  // Handle successful visit submission
  const handleVisitSuccess = () => {
    navigate('/bdm/visits');
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="dashboard-layout">
      <style>{newVisitStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <PageGuide pageKey="new-visit" />
          <div className="page-header">
            <Link to="/bdm" className="back-link">
              &larr; Back to Dashboard
            </Link>
            <h1>Log Visit</h1>
          </div>

          {error && (
            <div className="error-message">
              <p>{error}</p>
              <Link to="/bdm" className="btn btn-primary">
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
              <Link to="/bdm" className="btn btn-primary">
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
