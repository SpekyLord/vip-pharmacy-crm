/**
 * CallPlanPage
 *
 * BDM's Call Planning Tool (CPT) view (read-only).
 * Shows 20-day grid, DCR summary, daily MD count, extra calls.
 * Editing is done via Excel export → Admin uploads approved CPT.
 *
 * Route: /employee/cpt
 */

import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import CallPlanView from '../../components/employee/CallPlanView';
import scheduleService from '../../services/scheduleService';
import toast from 'react-hot-toast';

const pageStyles = `
  .cpt-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .cpt-content {
    display: flex;
  }

  .cpt-main {
    flex: 1;
    padding: 24px;
    max-width: 1600px;
  }

  .cpt-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    flex-wrap: wrap;
    gap: 16px;
  }

  .cpt-page-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
  }

  .cpt-page-header p {
    margin: 4px 0 0 0;
    font-size: 14px;
    color: #6b7280;
  }

  .cpt-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .cpt-cycle-nav {
    display: flex;
    align-items: center;
    gap: 8px;
    background: white;
    padding: 6px 12px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
  }

  .cpt-cycle-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: #374151;
    transition: all 0.15s;
  }

  .cpt-cycle-btn:hover {
    background: #e5e7eb;
  }

  .cpt-cycle-label {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    min-width: 90px;
    text-align: center;
  }

  .cpt-cycle-dates {
    font-size: 11px;
    color: #9ca3af;
    text-align: center;
  }

  .cpt-summary-bar {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .cpt-summary-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 140px;
  }

  .cpt-summary-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .cpt-summary-value {
    font-size: 20px;
    font-weight: 700;
    color: #1f2937;
  }

  .cpt-summary-label {
    font-size: 12px;
    color: #6b7280;
  }

  @media (max-width: 768px) {
    .cpt-main {
      padding: 16px;
    }

    .cpt-page-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .cpt-controls {
      width: 100%;
    }

    .cpt-summary-bar {
      gap: 8px;
    }

    .cpt-summary-card {
      min-width: 120px;
    }
  }
`;

const CallPlanPage = () => {
  const [cptData, setCptData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cycleNumber, setCycleNumber] = useState(null);

  const fetchData = useCallback(async (cycle) => {
    try {
      setLoading(true);
      const response = await scheduleService.getCPTGrid(cycle);
      setCptData(response.data);
      if (cycle == null && response.data?.cycleNumber != null) {
        setCycleNumber(response.data.cycleNumber);
      }
    } catch (err) {
      console.error('Failed to fetch CPT grid:', err);
      toast.error(err.response?.data?.message || 'Failed to load Call Plan data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(cycleNumber);
  }, [cycleNumber, fetchData]);

  const handleCycleChange = (delta) => {
    setCycleNumber((prev) => (prev != null ? prev + delta : delta));
  };

  const formatCycleDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const summary = cptData?.summary || {};

  return (
    <div className="cpt-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="cpt-content">
        <Sidebar />
        <main className="cpt-main">
          {/* Page Header */}
          <div className="cpt-page-header">
            <div>
              <h1>Call Plan</h1>
              <p>4-week visit schedule with DCR summary</p>
            </div>

            <div className="cpt-controls">
              {/* Cycle Navigation */}
              <div className="cpt-cycle-nav">
                <button className="cpt-cycle-btn" onClick={() => handleCycleChange(-1)}>
                  &#8249;
                </button>
                <div>
                  <div className="cpt-cycle-label">
                    Cycle {cptData?.cycleNumber ?? cycleNumber ?? '...'}
                  </div>
                  {cptData?.cycleStart && (
                    <div className="cpt-cycle-dates">
                      {formatCycleDate(cptData.cycleStart)}
                    </div>
                  )}
                </div>
                <button className="cpt-cycle-btn" onClick={() => handleCycleChange(1)}>
                  &#8250;
                </button>
              </div>
            </div>
          </div>

          {/* Summary Bar */}
          {cptData && !loading && (
            <div className="cpt-summary-bar">
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#16a34a' }} />
                <div>
                  <div className="cpt-summary-value">{summary.completed || 0}</div>
                  <div className="cpt-summary-label">Completed</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#2563eb' }} />
                <div>
                  <div className="cpt-summary-value">{summary.planned || 0}</div>
                  <div className="cpt-summary-label">Planned</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#c2410c' }} />
                <div>
                  <div className="cpt-summary-value">{summary.carried || 0}</div>
                  <div className="cpt-summary-label">Carried</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#dc2626' }} />
                <div>
                  <div className="cpt-summary-value">{summary.missed || 0}</div>
                  <div className="cpt-summary-label">Missed</div>
                </div>
              </div>
              <div className="cpt-summary-card">
                <span className="cpt-summary-dot" style={{ background: '#6b7280' }} />
                <div>
                  <div className="cpt-summary-value">{summary.total || 0}</div>
                  <div className="cpt-summary-label">Total</div>
                </div>
              </div>
            </div>
          )}

          {/* Call Plan View */}
          <CallPlanView
            cptData={cptData}
            loading={loading}
          />
        </main>
      </div>
    </div>
  );
};

export default CallPlanPage;
