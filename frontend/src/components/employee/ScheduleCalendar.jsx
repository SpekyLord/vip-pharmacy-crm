/**
 * ScheduleCalendar Component
 *
 * 4-week × 5-day grid displaying schedule entries with status colors.
 * - Green: completed
 * - Blue: planned (current/future)
 * - Orange: carried
 * - Red: missed
 * Current day cell highlighted. Tap card for detail / "Log Visit" link.
 * Mobile: collapses to stacked day-by-day list.
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const calendarStyles = `
  .schedule-calendar {
    width: 100%;
  }

  /* Desktop Grid */
  .schedule-grid {
    display: grid;
    grid-template-columns: 60px repeat(5, 1fr);
    gap: 2px;
    background: #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
  }

  .schedule-grid-header {
    background: #1e293b;
    color: white;
    padding: 12px 8px;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
  }

  .schedule-week-label {
    background: #1e293b;
    color: white;
    padding: 12px 8px;
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .schedule-cell {
    background: white;
    padding: 8px;
    min-height: 80px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: background 0.15s;
  }

  .schedule-cell.is-today {
    background: #eff6ff;
    box-shadow: inset 0 0 0 2px #3b82f6;
  }

  .schedule-cell.is-past {
    background: #f9fafb;
  }

  /* Entry chips */
  .schedule-entry {
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .schedule-entry:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .schedule-entry.status-completed {
    background: #dcfce7;
    color: #166534;
    border-left: 3px solid #22c55e;
  }

  .schedule-entry.status-planned {
    background: #dbeafe;
    color: #1e40af;
    border-left: 3px solid #3b82f6;
  }

  .schedule-entry.status-carried {
    background: #fef3c7;
    color: #92400e;
    border-left: 3px solid #f59e0b;
  }

  .schedule-entry.status-missed {
    background: #fecaca;
    color: #991b1b;
    border-left: 3px solid #ef4444;
  }

  /* Popover */
  .schedule-popover-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
  }

  .schedule-popover {
    position: fixed;
    z-index: 101;
    background: white;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
    padding: 16px;
    min-width: 240px;
    max-width: 300px;
  }

  .schedule-popover h4 {
    margin: 0 0 4px 0;
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }

  .schedule-popover .popover-spec {
    font-size: 13px;
    color: #6b7280;
    margin: 0 0 8px 0;
  }

  .schedule-popover .popover-status {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    margin-bottom: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    display: inline-block;
  }

  .schedule-popover .popover-status.status-completed { background: #dcfce7; color: #166534; }
  .schedule-popover .popover-status.status-planned { background: #dbeafe; color: #1e40af; }
  .schedule-popover .popover-status.status-carried { background: #fef3c7; color: #92400e; }
  .schedule-popover .popover-status.status-missed { background: #fecaca; color: #991b1b; }

  .schedule-popover .popover-btn {
    display: block;
    width: 100%;
    padding: 10px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
    transition: background 0.15s;
  }

  .schedule-popover .popover-btn:hover {
    background: #1d4ed8;
  }

  .schedule-popover .popover-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  /* Mobile: stacked list */
  .schedule-mobile-list {
    display: none;
  }

  @media (max-width: 768px) {
    .schedule-grid {
      display: none;
    }

    .schedule-mobile-list {
      display: block;
    }

    .schedule-mobile-week {
      margin-bottom: 16px;
    }

    .schedule-mobile-week-header {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      padding: 8px 12px;
      background: #f1f5f9;
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .schedule-mobile-day {
      margin-bottom: 8px;
      padding-left: 12px;
    }

    .schedule-mobile-day-label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 4px;
    }

    .schedule-mobile-day.is-today .schedule-mobile-day-label {
      color: #2563eb;
    }

    .schedule-mobile-entries {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .schedule-mobile-entry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
    }

    .schedule-mobile-entry.status-completed { background: #dcfce7; color: #166534; }
    .schedule-mobile-entry.status-planned { background: #dbeafe; color: #1e40af; }
    .schedule-mobile-entry.status-carried { background: #fef3c7; color: #92400e; }
    .schedule-mobile-entry.status-missed { background: #fecaca; color: #991b1b; }

    .schedule-mobile-entry .mobile-log-btn {
      padding: 6px 12px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }

    .schedule-mobile-empty {
      font-size: 12px;
      color: #9ca3af;
      padding: 6px 0;
      font-style: italic;
    }
  }
`;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const FULL_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const ScheduleCalendar = ({ entries = [], currentWeek, currentDay, onLogVisit, loading }) => {
  const navigate = useNavigate();
  const [popover, setPopover] = useState(null);

  // Build grid: week (1-4) × day (1-5) → entries
  const grid = useMemo(() => {
    const g = {};
    for (let w = 1; w <= 4; w++) {
      g[w] = {};
      for (let d = 1; d <= 5; d++) {
        g[w][d] = [];
      }
    }
    entries.forEach((entry) => {
      const w = entry.scheduledWeek;
      const d = entry.scheduledDay;
      if (g[w] && g[w][d]) {
        g[w][d].push(entry);
      }
    });
    return g;
  }, [entries]);

  const getDoctorName = (entry) => {
    if (!entry.doctor) return 'Unknown';
    return `${entry.doctor.lastName || ''}, ${entry.doctor.firstName || ''}`.trim().replace(/^,\s*/, '');
  };

  const isVisitable = (entry) => {
    return entry.status === 'planned' || entry.status === 'carried';
  };

  const handleEntryClick = (entry, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPopover({
      entry,
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 320),
    });
  };

  const handleLogVisit = (entry) => {
    setPopover(null);
    if (onLogVisit) {
      onLogVisit(entry);
    } else {
      navigate(`/bdm/visit/new?doctorId=${entry.doctor?._id}`);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Loading schedule...</div>;
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        <p style={{ fontSize: '16px', fontWeight: 500, margin: '0 0 8px 0' }}>No schedule for this cycle</p>
        <p style={{ fontSize: '14px', margin: 0 }}>Contact your Admin to generate a schedule.</p>
      </div>
    );
  }

  return (
    <div className="schedule-calendar">
      <style>{calendarStyles}</style>

      {/* Desktop Grid */}
      <div className="schedule-grid">
        {/* Header row */}
        <div className="schedule-grid-header" />
        {DAY_NAMES.map((day, i) => (
          <div key={day} className="schedule-grid-header">
            {day}
          </div>
        ))}

        {/* Week rows */}
        {[1, 2, 3, 4].map((week) => (
          <>
            <div key={`label-${week}`} className="schedule-week-label">W{week}</div>
            {[1, 2, 3, 4, 5].map((day) => {
              const isToday = currentWeek === week && currentDay === day;
              const isPast = currentWeek != null && (week < currentWeek || (week === currentWeek && day < currentDay));
              const cellEntries = grid[week][day];

              return (
                <div
                  key={`${week}-${day}`}
                  className={`schedule-cell ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}`}
                >
                  {cellEntries.map((entry) => (
                    <div
                      key={entry._id}
                      className={`schedule-entry status-${entry.status}`}
                      onClick={(e) => handleEntryClick(entry, e)}
                      title={getDoctorName(entry)}
                    >
                      {getDoctorName(entry)}
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {/* Mobile List */}
      <div className="schedule-mobile-list">
        {[1, 2, 3, 4].map((week) => (
          <div key={week} className="schedule-mobile-week">
            <div className="schedule-mobile-week-header">Week {week}</div>
            {[1, 2, 3, 4, 5].map((day) => {
              const isToday = currentWeek === week && currentDay === day;
              const cellEntries = grid[week][day];

              return (
                <div key={day} className={`schedule-mobile-day ${isToday ? 'is-today' : ''}`}>
                  <div className="schedule-mobile-day-label">
                    {FULL_DAY_NAMES[day - 1]} {isToday && '(Today)'}
                  </div>
                  <div className="schedule-mobile-entries">
                    {cellEntries.length === 0 ? (
                      <div className="schedule-mobile-empty">No visits scheduled</div>
                    ) : (
                      cellEntries.map((entry) => (
                        <div key={entry._id} className={`schedule-mobile-entry status-${entry.status}`}>
                          <span>{getDoctorName(entry)}</span>
                          {isVisitable(entry) && (
                            <button
                              className="mobile-log-btn"
                              onClick={() => handleLogVisit(entry)}
                            >
                              Log Visit
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Popover */}
      {popover && (
        <>
          <div className="schedule-popover-overlay" onClick={() => setPopover(null)} />
          <div
            className="schedule-popover"
            style={{ top: popover.top, left: popover.left }}
          >
            <h4>{getDoctorName(popover.entry)}</h4>
            <p className="popover-spec">
              {popover.entry.doctor?.specialization || 'N/A'}
            </p>
            <div className={`popover-status status-${popover.entry.status}`}>
              {popover.entry.status}
            </div>
            {popover.entry.doctor?.clinicOfficeAddress && (
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px 0' }}>
                {popover.entry.doctor.clinicOfficeAddress}
              </p>
            )}
            {isVisitable(popover.entry) ? (
              <button
                className="popover-btn"
                onClick={() => handleLogVisit(popover.entry)}
              >
                Log Visit
              </button>
            ) : (
              <button className="popover-btn" disabled>
                {popover.entry.status === 'completed' ? 'Completed' : 'Missed'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ScheduleCalendar;
