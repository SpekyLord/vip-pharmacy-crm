/**
 * SchedulePage
 *
 * Full-page schedule view with:
 * - Cycle navigation (prev / current / next)
 * - Summary stats bar (Completed / Carried / Missed / Remaining)
 * - "Today's Schedule" section with visitable VIP Clients
 * - Full 4-week calendar grid
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import ScheduleCalendar from '../../components/employee/ScheduleCalendar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import scheduleService from '../../services/scheduleService';

const pageStyles = `
  .schedule-page .main-content h1 {
    margin: 0 0 24px 0;
    font-size: 28px;
    font-weight: 600;
    color: #1f2937;
  }

  /* Cycle Nav */
  .cycle-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .cycle-nav-btn {
    padding: 8px 16px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #475569;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cycle-nav-btn:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  .cycle-nav-label {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    min-width: 200px;
    text-align: center;
  }

  .cycle-nav-label small {
    display: block;
    font-size: 12px;
    font-weight: 400;
    color: #6b7280;
    margin-top: 2px;
  }

  /* Summary Stats */
  .schedule-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin-bottom: 24px;
  }

  .summary-stat {
    background: white;
    padding: 16px;
    border-radius: 10px;
    text-align: center;
    border: 1px solid #e5e7eb;
  }

  .summary-stat .stat-num {
    font-size: 28px;
    font-weight: 700;
    line-height: 1;
    margin-bottom: 4px;
  }

  .summary-stat .stat-lbl {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .summary-stat.stat-completed .stat-num { color: #16a34a; }
  .summary-stat.stat-carried .stat-num { color: #d97706; }
  .summary-stat.stat-missed .stat-num { color: #dc2626; }
  .summary-stat.stat-planned .stat-num { color: #2563eb; }
  .summary-stat.stat-total .stat-num { color: #1e293b; }

  /* Today's Schedule */
  .today-schedule {
    background: white;
    padding: 20px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    margin-bottom: 24px;
  }

  .today-schedule h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .today-schedule h2 .today-badge {
    background: #2563eb;
    color: white;
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
  }

  .today-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .today-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
    background: #f8fafc;
    transition: border-color 0.15s;
  }

  .today-card:hover {
    border-color: #3b82f6;
  }

  .today-card-info h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .today-card-info p {
    margin: 2px 0 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  .today-card-info .carried-tag {
    display: inline-block;
    margin-top: 4px;
    font-size: 11px;
    font-weight: 600;
    color: #92400e;
    background: #fef3c7;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .today-card .log-btn {
    padding: 8px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .today-card .log-btn:hover {
    background: #1d4ed8;
  }

  .today-empty {
    text-align: center;
    padding: 20px;
    color: #9ca3af;
    font-size: 14px;
  }

  /* Calendar Section */
  .calendar-section {
    background: white;
    padding: 24px;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
  }

  .calendar-section h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  /* Legend */
  .schedule-legend {
    display: flex;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #6b7280;
  }

  .legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
  }

  .legend-dot.dot-planned { background: #dbeafe; border: 1px solid #3b82f6; }
  .legend-dot.dot-completed { background: #dcfce7; border: 1px solid #22c55e; }
  .legend-dot.dot-carried { background: #fef3c7; border: 1px solid #f59e0b; }
  .legend-dot.dot-missed { background: #fecaca; border: 1px solid #ef4444; }

  /* ===== DARK MODE ===== */
  body.dark-mode .schedule-page .main-content h1 {
    color: #f1f5f9;
  }

  body.dark-mode .cycle-nav-btn {
    background: #0f172a;
    border-color: #1e293b;
    color: #cbd5e1;
  }

  body.dark-mode .cycle-nav-btn:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  body.dark-mode .cycle-nav-label {
    color: #f1f5f9;
  }

  body.dark-mode .cycle-nav-label small {
    color: #94a3b8;
  }

  body.dark-mode .summary-stat,
  body.dark-mode .today-schedule,
  body.dark-mode .calendar-section {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .summary-stat .stat-lbl,
  body.dark-mode .legend-item {
    color: #94a3b8;
  }

  body.dark-mode .today-card {
    background: #0b1220;
    border-color: #1e293b;
  }

  body.dark-mode .today-card:hover {
    border-color: #60a5fa;
  }

  body.dark-mode .today-card-info h4,
  body.dark-mode .today-schedule h2,
  body.dark-mode .calendar-section h2 {
    color: #f1f5f9;
  }

  body.dark-mode .today-card-info p {
    color: #94a3b8;
  }

  body.dark-mode .today-empty {
    color: #64748b;
  }

  @media (max-width: 768px) {
    .schedule-page .main-content h1 {
      font-size: 22px;
    }
    .cycle-nav {
      flex-wrap: wrap;
    }
    .summary-stat .stat-num {
      font-size: 22px;
    }
  }

  @media (max-width: 480px) {
    .schedule-page .main-content {
      padding: 16px;
    }

    .schedule-page .main-content h1 {
      font-size: 22px;
      margin-bottom: 16px;
    }

    .cycle-nav {
      gap: 8px;
    }

    .cycle-nav-btn {
      min-height: 44px;
      padding: 8px 12px;
    }

    .cycle-nav-label {
      min-width: 140px;
      font-size: 14px;
    }

    .schedule-summary {
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .summary-stat {
      padding: 12px 8px;
    }

    .summary-stat .stat-num {
      font-size: 20px;
    }

    .today-schedule {
      padding: 14px;
    }

    .today-cards {
      grid-template-columns: 1fr;
    }

    .today-card .log-btn {
      min-height: 44px;
      padding: 10px 14px;
    }

    .calendar-section {
      padding: 14px;
    }

    .schedule-legend {
      gap: 10px;
    }
  }
`;

const SchedulePage = () => {
  const navigate = useNavigate();
  const [cycleData, setCycleData] = useState(null);
  const [todayEntries, setTodayEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentCycleNumber, setCurrentCycleNumber] = useState(null);

  const fetchData = useCallback(async (cycleNum) => {
    try {
      setLoading(true);
      setError(null);

      const params = cycleNum != null ? cycleNum : undefined;

      const results = await Promise.allSettled([
        scheduleService.getCycleSchedule(params),
        scheduleService.getToday(),
      ]);

      const [cycleResult, todayResult] = results;

      if (cycleResult.status === 'fulfilled') {
        setCycleData(cycleResult.value.data);
        if (currentCycleNumber == null) {
          setCurrentCycleNumber(cycleResult.value.data.cycleNumber);
        }
      } else {
        setError('Failed to load schedule');
      }

      if (todayResult.status === 'fulfilled') {
        setTodayEntries(todayResult.value.data || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [currentCycleNumber]);

  useEffect(() => {
    fetchData(currentCycleNumber);
  }, [currentCycleNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrevCycle = () => {
    const target = (cycleData?.cycleNumber ?? currentCycleNumber ?? 0) - 1;
    setCurrentCycleNumber(target);
  };

  const handleNextCycle = () => {
    const target = (cycleData?.cycleNumber ?? currentCycleNumber ?? 0) + 1;
    setCurrentCycleNumber(target);
  };

  const handleCurrentCycle = () => {
    setCurrentCycleNumber(null);
    fetchData(null);
  };

  const handleLogVisit = (entry) => {
    navigate(`/bdm/visit/new?doctorId=${entry.doctor?._id}`);
  };

  const formatCycleDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDoctorName = (entry) => {
    if (!entry.doctor) return 'Unknown';
    return `${entry.doctor.firstName || ''} ${entry.doctor.lastName || ''}`.trim();
  };

  if (loading && !cycleData) {
    return <LoadingSpinner fullScreen />;
  }

  const summary = cycleData?.summary || {};
  const isCurrentCycle = cycleData?.currentWeek != null;

  return (
    <div className="dashboard-layout schedule-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <h1>Schedule</h1>

          {error && <ErrorMessage message={error} onRetry={() => fetchData(currentCycleNumber)} />}

          {/* Cycle Navigation */}
          <div className="cycle-nav">
            <button className="cycle-nav-btn" onClick={handlePrevCycle}>&larr; Prev</button>
            <div className="cycle-nav-label">
              Cycle {(cycleData?.displayCycleNumber ?? cycleData?.cycleNumber ?? 0) + 1}
              <small>
                {cycleData?.cycleStart ? formatCycleDate(cycleData.cycleStart) : ''}
                {isCurrentCycle && ' (Current)'}
              </small>
            </div>
            <button className="cycle-nav-btn" onClick={handleNextCycle}>Next &rarr;</button>
            {!isCurrentCycle && (
              <button className="cycle-nav-btn" onClick={handleCurrentCycle}>Today</button>
            )}
          </div>

          {/* Summary Stats */}
          {summary.total > 0 && (
            <div className="schedule-summary">
              <div className="summary-stat stat-completed">
                <div className="stat-num">{summary.completed || 0}</div>
                <div className="stat-lbl">Completed</div>
              </div>
              <div className="summary-stat stat-carried">
                <div className="stat-num">{summary.carried || 0}</div>
                <div className="stat-lbl">Carried</div>
              </div>
              <div className="summary-stat stat-missed">
                <div className="stat-num">{summary.missed || 0}</div>
                <div className="stat-lbl">Missed</div>
              </div>
              <div className="summary-stat stat-planned">
                <div className="stat-num">{summary.planned || 0}</div>
                <div className="stat-lbl">Remaining</div>
              </div>
              <div className="summary-stat stat-total">
                <div className="stat-num">{summary.total || 0}</div>
                <div className="stat-lbl">Total</div>
              </div>
            </div>
          )}

          {/* Today's Schedule */}
          {isCurrentCycle && (
            <div className="today-schedule">
              <h2>
                Today&apos;s Schedule
                {todayEntries.length > 0 && (
                  <span className="today-badge">{todayEntries.length}</span>
                )}
              </h2>
              {todayEntries.length > 0 ? (
                <div className="today-cards">
                  {todayEntries.map((entry) => (
                    <div key={entry._id} className="today-card">
                      <div className="today-card-info">
                        <h4>{getDoctorName(entry)}</h4>
                        <p>{entry.doctor?.specialization || 'N/A'} — {entry.scheduledLabel}</p>
                        {entry.status === 'carried' && (
                          <span className="carried-tag">Carried from W{entry.scheduledWeek}</span>
                        )}
                      </div>
                      <button className="log-btn" onClick={() => handleLogVisit(entry)}>
                        Log Visit
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="today-empty">
                  No visits scheduled for today
                </div>
              )}
            </div>
          )}

          {/* Calendar Grid */}
          <div className="calendar-section">
            <h2>Cycle Calendar</h2>
            <div className="schedule-legend">
              <div className="legend-item"><span className="legend-dot dot-planned" /> Planned</div>
              <div className="legend-item"><span className="legend-dot dot-completed" /> Completed</div>
              <div className="legend-item"><span className="legend-dot dot-carried" /> Carried</div>
              <div className="legend-item"><span className="legend-dot dot-missed" /> Missed</div>
            </div>
            <ScheduleCalendar
              entries={cycleData?.entries || []}
              currentWeek={cycleData?.currentWeek}
              currentDay={cycleData?.currentDay}
              onLogVisit={handleLogVisit}
              loading={loading}
            />
          </div>
        </main>
      </div>
    </div>
  );
};

export default SchedulePage;
