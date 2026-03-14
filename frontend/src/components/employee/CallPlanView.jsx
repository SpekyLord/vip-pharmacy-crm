/**
 * CallPlanView Component
 *
 * Main CPT grid displaying:
 * A) Doctor-row x 20 day-column grid (like EmployeeVisitReport)
 * B) DCR Summary table
 * C) Daily MD count (VIP vs Extra Call)
 * D) Extra Call section (non-VIP visits per day)
 *
 * Read-only view. Editing is done via Excel export → Admin uploads approved CPT.
 */

import { useState, useMemo } from 'react';
import DCRSummaryTable from './DCRSummaryTable';

const DAY_LABELS = [];
for (let w = 1; w <= 4; w++) {
  for (let d = 1; d <= 5; d++) {
    DAY_LABELS.push(`W${w}D${d}`);
  }
}

const WEEK_HEADERS = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];

const viewStyles = `
  .cpv-container {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  .cpv-header {
    padding: 16px 20px;
    background: #f8fafc;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }

  .cpv-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .cpv-stat {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
  }

  .cpv-stat.freq-2x {
    background: #fef3c7;
    color: #92400e;
  }

  .cpv-stat.freq-4x {
    background: #dbeafe;
    color: #1e40af;
  }

  .cpv-stat.total {
    background: #f3e8ff;
    color: #6b21a8;
  }

  .cpv-legend {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #6b7280;
  }

  .cpv-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .cpv-legend-dot {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    display: inline-block;
  }

  /* Grid table */
  .cpv-grid-mobile {
    display: none;
  }

  .cpv-grid-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .cpv-grid {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    min-width: 900px;
  }

  .cpv-grid th,
  .cpv-grid td {
    border: 1px solid #e5e7eb;
    padding: 6px 4px;
    text-align: center;
    white-space: nowrap;
  }

  /* Week header row */
  .cpv-grid .week-header th {
    background: #1e293b;
    color: white;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 4px;
  }

  /* Day header row */
  .cpv-grid .day-header th {
    background: #334155;
    color: #e2e8f0;
    font-weight: 600;
    font-size: 10px;
    padding: 6px 4px;
  }

  /* Sticky columns */
  .cpv-grid .col-no,
  .cpv-grid .col-name,
  .cpv-grid .col-spec {
    position: sticky;
    z-index: 3;
    background: inherit;
  }

  .cpv-grid .col-no { left: 0; min-width: 32px; }
  .cpv-grid .col-name { left: 32px; min-width: 120px; text-align: left; }
  .cpv-grid .col-spec { left: 152px; min-width: 80px; }

  .cpv-grid thead .col-no,
  .cpv-grid thead .col-name,
  .cpv-grid thead .col-spec {
    z-index: 5;
  }

  /* Doctor rows */
  .cpv-grid tbody tr {
    transition: background 0.1s;
  }

  .cpv-grid tbody tr:hover {
    background: #f8fafc;
  }

  .cpv-grid tbody td.col-no {
    background: #f8fafc;
    font-weight: 600;
    color: #6b7280;
  }

  .cpv-grid tbody td.col-name {
    background: white;
    font-weight: 500;
    color: #1f2937;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cpv-grid tbody td.col-spec {
    background: white;
    color: #6b7280;
    font-size: 11px;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Cell statuses */
  .cpv-cell {
    min-width: 28px;
    min-height: 28px;
    cursor: default;
  }

  .cpv-cell.status-completed {
    background: #dcfce7;
    color: #16a34a;
    font-weight: 700;
  }

  .cpv-cell.status-planned {
    background: #dbeafe;
    color: #2563eb;
    font-weight: 600;
  }

  .cpv-cell.status-carried {
    background: #fed7aa;
    color: #c2410c;
    font-weight: 600;
  }

  .cpv-cell.status-missed {
    background: #fecaca;
    color: #dc2626;
    font-weight: 600;
  }

  .cpv-cell.status-current-day {
    outline: 2px solid #2563eb;
    outline-offset: -2px;
  }

  /* Summary columns */
  .cpv-grid .col-count {
    min-width: 36px;
    font-weight: 600;
    background: #f1f5f9;
  }

  /* Bottom row: daily VIP counts */
  .cpv-grid .daily-count-row td {
    background: #f1f5f9;
    font-weight: 700;
    border-top: 2px solid #94a3b8;
    color: #1e293b;
  }

  /* MD Count table */
  .cpv-md-section {
    padding: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .cpv-section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 12px 0;
  }

  .cpv-md-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .cpv-md-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 600px;
  }

  .cpv-md-table th,
  .cpv-md-table td {
    padding: 8px 10px;
    text-align: center;
    border: 1px solid #e5e7eb;
  }

  .cpv-md-table thead th {
    background: #1e293b;
    color: white;
    font-weight: 600;
    font-size: 12px;
  }

  .cpv-md-table tbody td:first-child {
    font-weight: 600;
    text-align: left;
    background: #f8fafc;
  }

  .cpv-md-table .total-row td {
    background: #f1f5f9;
    font-weight: 700;
    border-top: 2px solid #94a3b8;
  }

  /* Extra calls section */
  .cpv-extra-section {
    padding: 20px;
    border-top: 1px solid #e5e7eb;
  }

  .cpv-extra-day {
    margin-bottom: 8px;
  }

  .cpv-extra-day-header {
    font-weight: 600;
    font-size: 13px;
    color: #374151;
    cursor: pointer;
    padding: 6px 8px;
    background: #f9fafb;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cpv-extra-day-header:hover {
    background: #f3f4f6;
  }

  .cpv-extra-count {
    font-size: 11px;
    color: #6b7280;
    font-weight: 400;
  }

  .cpv-extra-list {
    padding: 4px 0 4px 20px;
    font-size: 13px;
    color: #4b5563;
  }

  .cpv-extra-client {
    padding: 4px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cpv-extra-engagement {
    display: inline-flex;
    gap: 4px;
  }

  .cpv-extra-engagement span {
    font-size: 10px;
    padding: 1px 6px;
    background: #e5e7eb;
    border-radius: 4px;
    color: #4b5563;
  }

  .cpv-empty {
    text-align: center;
    padding: 48px 20px;
    color: #9ca3af;
  }

  .cpv-empty h3 {
    margin: 0 0 8px 0;
    color: #6b7280;
  }

  .cpv-loading {
    text-align: center;
    padding: 48px 20px;
    color: #6b7280;
  }

  /* Week tabs for mobile */
  .cpv-week-tabs {
    display: none;
    gap: 4px;
    margin-bottom: 12px;
    background: white;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
  }

  .cpv-week-tab-btn {
    flex: 1;
    padding: 8px 12px;
    border: none;
    background: transparent;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cpv-week-tab-btn:hover {
    color: #374151;
    background: #f3f4f6;
  }

  .cpv-week-tab-btn.active {
    background: #1e293b;
    color: white;
  }

  /* Tablet: show all 20 days but compact */
  @media (min-width: 481px) and (max-width: 1024px) {
    .cpv-grid {
      min-width: 750px;
      font-size: 11px;
    }
    .cpv-grid th, .cpv-grid td {
      padding: 4px 2px;
    }
    .cpv-grid .col-name {
      min-width: 100px;
    }
    .cpv-grid .col-spec {
      display: none;
    }
    .cpv-grid .col-name {
      left: 32px;
    }
    .cpv-md-table {
      min-width: 480px;
      font-size: 12px;
    }
    .cpv-md-table th, .cpv-md-table td {
      padding: 6px 4px;
    }
  }

  /* Mobile: show week tabs + mobile grid, hide desktop grid */
  @media (max-width: 480px) {
    .cpv-week-tabs {
      display: flex;
    }
    .cpv-grid-desktop {
      display: none;
    }
    .cpv-grid-mobile {
      display: table;
      width: 100%;
      table-layout: fixed;
      min-width: unset;
      font-size: 11px;
    }
    .cpv-grid-mobile th,
    .cpv-grid-mobile td {
      padding: 4px 2px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Remove sticky on mobile grid */
    .cpv-grid-mobile .col-no,
    .cpv-grid-mobile .col-name {
      position: static;
      left: auto;
    }
    .cpv-grid-mobile .col-no {
      width: 22px;
      min-width: unset;
    }
    .cpv-grid-mobile .col-name {
      min-width: unset;
      max-width: unset;
      font-size: 11px;
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cpv-grid .col-spec {
      display: none;
    }
    .cpv-grid-mobile .cpv-cell {
      min-width: unset;
      min-height: 24px;
      width: 28px;
    }
    .cpv-grid-mobile .col-count {
      min-width: unset;
      width: 36px;
    }
    .cpv-grid-wrap {
      overflow-x: hidden;
    }
    .cpv-md-table-wrap {
      overflow-x: hidden;
    }
    .cpv-header {
      padding: 12px;
      flex-direction: column;
      align-items: flex-start;
    }
    .cpv-container {
      border-radius: 8px;
      overflow: hidden;
    }
    .cpv-stat {
      font-size: 11px;
    }
    .cpv-legend {
      font-size: 11px;
    }
    .cpv-md-table {
      min-width: unset;
      width: 100%;
      table-layout: fixed;
      font-size: 11px;
    }
    .cpv-md-table th, .cpv-md-table td {
      padding: 6px 4px;
    }
    .cpv-md-section {
      padding: 12px;
    }
    .cpv-section-title {
      font-size: 14px;
    }
    .cpv-extra-section {
      padding: 12px;
    }
  }
`;

const CELL_SYMBOLS = {
  completed: '\u2713', // checkmark
  planned: '1',
  carried: '\u25C6',   // diamond
  missed: '\u2715',    // x
};

const CallPlanView = ({ cptData, loading = false }) => {
  const [expandedExtraDays, setExpandedExtraDays] = useState({});
  const [activeWeek, setActiveWeek] = useState(() => {
    // Default to current cycle week or 1
    if (cptData?.currentWeek) return cptData.currentWeek;
    return 1;
  });

  const {
    doctors = [],
    dcrSummary = [],
    dcrTotal = {},
    dailyMDCount = [],
    extraCalls = [],
    summary = {},
    currentWeek,
    currentDay,
  } = cptData || {};

  // Sync activeWeek with cptData.currentWeek when data loads
  const effectiveActiveWeek = activeWeek;

  // Mobile day columns for the active week (5 columns)
  const mobileStartIdx = (effectiveActiveWeek - 1) * 5;
  const mobileDayLabels = DAY_LABELS.slice(mobileStartIdx, mobileStartIdx + 5);
  const mobileDayIndices = [0, 1, 2, 3, 4].map(i => mobileStartIdx + i);

  // Compute frequency counts
  const freqCounts = useMemo(() => {
    const count2x = doctors.filter((d) => d.visitFrequency === 2).length;
    const count4x = doctors.filter((d) => d.visitFrequency === 4).length;
    return { count2x, count4x, total: doctors.length };
  }, [doctors]);

  // Determine if a grid index is the current day
  const isCurrentDay = (dayIdx) => {
    if (currentWeek == null || currentDay == null) return false;
    const idx = (currentWeek - 1) * 5 + (currentDay - 1);
    return dayIdx === idx;
  };

  const toggleExtraDay = (dayIdx) => {
    setExpandedExtraDays((prev) => ({ ...prev, [dayIdx]: !prev[dayIdx] }));
  };

  if (loading) {
    return (
      <div className="cpv-container">
        <style>{viewStyles}</style>
        <div className="cpv-loading">Loading Call Plan data...</div>
      </div>
    );
  }

  if (!cptData || doctors.length === 0) {
    return (
      <div className="cpv-container">
        <style>{viewStyles}</style>
        <div className="cpv-empty">
          <h3>No Schedule Data</h3>
          <p>No schedule entries found for this cycle. Generate a schedule first.</p>
        </div>
      </div>
    );
  }

  // Daily VIP counts from grid
  const dailyVIPFromGrid = Array(20).fill(0);
  doctors.forEach((doc) => {
    doc.grid.forEach((cell, idx) => {
      if (cell.status === 'completed') {
        dailyVIPFromGrid[idx]++;
      }
    });
  });

  // Extra calls that have clients
  const extraCallsWithData = extraCalls.filter((ec) => ec.clients && ec.clients.length > 0);

  return (
    <div className="cpv-container">
      <style>{viewStyles}</style>

      {/* Header */}
      <div className="cpv-header">
        <div className="cpv-header-left">
          <span className="cpv-stat freq-2x">2x: {freqCounts.count2x}</span>
          <span className="cpv-stat freq-4x">4x: {freqCounts.count4x}</span>
          <span className="cpv-stat total">Total: {freqCounts.total}</span>
        </div>
        <div className="cpv-legend">
          <span className="cpv-legend-item">
            <span className="cpv-legend-dot" style={{ background: '#dcfce7', border: '1px solid #16a34a', color: '#16a34a', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✓</span>
            Completed
          </span>
          <span className="cpv-legend-item">
            <span className="cpv-legend-dot" style={{ background: '#dbeafe', border: '1px solid #2563eb', color: '#2563eb', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>1</span>
            Planned
          </span>
          <span className="cpv-legend-item">
            <span className="cpv-legend-dot" style={{ background: '#fed7aa', border: '1px solid #c2410c', color: '#c2410c', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>◆</span>
            Carried
          </span>
          <span className="cpv-legend-item">
            <span className="cpv-legend-dot" style={{ background: '#fecaca', border: '1px solid #dc2626', color: '#dc2626', fontSize: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✕</span>
            Missed
          </span>
        </div>
      </div>

      {/* Week Tabs (mobile only, shown via CSS) */}
      <div className="cpv-week-tabs">
        {[1, 2, 3, 4].map((w) => (
          <button
            key={w}
            className={`cpv-week-tab-btn ${effectiveActiveWeek === w ? 'active' : ''}`}
            onClick={() => setActiveWeek(w)}
          >
            W{w}
          </button>
        ))}
      </div>

      {/* CPT Grid */}
      <div className="cpv-grid-wrap">
        {/* Desktop grid: all 20 days (hidden cols via CSS on mobile) */}
        <table className="cpv-grid cpv-grid-desktop">
          <thead>
            {/* Week header row */}
            <tr className="week-header">
              <th className="col-no" rowSpan={2}>No.</th>
              <th className="col-name" rowSpan={2}>Last Name</th>
              <th className="col-spec" rowSpan={2}>Specialty</th>
              {WEEK_HEADERS.map((wh, wi) => (
                <th key={wi} colSpan={5}>{wh}</th>
              ))}
              <th rowSpan={2}>Sched</th>
              <th rowSpan={2}>Done</th>
            </tr>
            {/* Day header row */}
            <tr className="day-header">
              {DAY_LABELS.map((label, idx) => (
                <th key={idx} className={`${isCurrentDay(idx) ? 'status-current-day' : ''} cpv-day-col cpv-day-w${Math.floor(idx / 5) + 1}`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doctors.map((doc, docIdx) => (
              <tr key={doc._id}>
                <td className="col-no">{docIdx + 1}</td>
                <td className="col-name" title={`${doc.lastName}, ${doc.firstName}`}>
                  {doc.lastName}
                </td>
                <td className="col-spec" title={doc.specialization}>
                  {doc.specialization || '-'}
                </td>
                {doc.grid.map((cell, dayIdx) => (
                  <td
                    key={dayIdx}
                    className={[
                      'cpv-cell',
                      `cpv-day-col cpv-day-w${Math.floor(dayIdx / 5) + 1}`,
                      cell.status ? `status-${cell.status}` : '',
                      isCurrentDay(dayIdx) ? 'status-current-day' : '',
                    ].filter(Boolean).join(' ')}
                    title={cell.status ? `${cell.status}${cell.engagementTypes?.length ? ` (${cell.engagementTypes.join(', ')})` : ''}` : ''}
                  >
                    {cell.status ? (CELL_SYMBOLS[cell.status] || '') : ''}
                  </td>
                ))}
                <td className="col-count">{doc.totalScheduled}</td>
                <td className="col-count">{doc.totalCompleted}</td>
              </tr>
            ))}
            {/* Daily VIP count row */}
            <tr className="daily-count-row">
              <td className="col-no" colSpan={3} style={{ textAlign: 'right' }}>Daily VIP</td>
              {dailyVIPFromGrid.map((count, idx) => (
                <td key={idx} className={`cpv-day-col cpv-day-w${Math.floor(idx / 5) + 1}`}>{count || ''}</td>
              ))}
              <td>{summary.total || 0}</td>
              <td>{summary.completed || 0}</td>
            </tr>
          </tbody>
        </table>

        {/* Mobile grid: only 5 days for activeWeek (shown via CSS) */}
        <table className="cpv-grid cpv-grid-mobile">
          <colgroup>
            <col style={{ width: '20px' }} />
            <col style={{ width: '55px' }} />
            <col style={{ width: '26px' }} />
            <col style={{ width: '26px' }} />
            <col style={{ width: '26px' }} />
            <col style={{ width: '26px' }} />
            <col style={{ width: '26px' }} />
            <col style={{ width: '34px' }} />
          </colgroup>
          <thead>
            <tr className="week-header">
              <th className="col-no" rowSpan={2}>No.</th>
              <th className="col-name" rowSpan={2}>Name</th>
              {mobileDayLabels.map((label, i) => (
                <th key={i}>{`D${(i % 5) + 1}`}</th>
              ))}
              <th rowSpan={2}>Done</th>
            </tr>
            <tr className="day-header">
              {mobileDayLabels.map((label, i) => (
                <th key={i} className={isCurrentDay(mobileDayIndices[i]) ? 'status-current-day' : ''}>
                  {['M', 'T', 'W', 'T', 'F'][i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doctors.map((doc, docIdx) => (
              <tr key={doc._id}>
                <td className="col-no">{docIdx + 1}</td>
                <td className="col-name" title={`${doc.lastName}, ${doc.firstName}`}>
                  {doc.lastName}
                </td>
                {mobileDayIndices.map((dayIdx, i) => {
                  const cell = doc.grid[dayIdx] || {};
                  return (
                    <td
                      key={i}
                      className={[
                        'cpv-cell',
                        cell.status ? `status-${cell.status}` : '',
                        isCurrentDay(dayIdx) ? 'status-current-day' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {cell.status ? (CELL_SYMBOLS[cell.status] || '') : ''}
                    </td>
                  );
                })}
                <td className="col-count">{doc.totalCompleted}</td>
              </tr>
            ))}
            <tr className="daily-count-row">
              <td className="col-no" colSpan={2} style={{ textAlign: 'right' }}>VIP</td>
              {mobileDayIndices.map((idx, i) => (
                <td key={i}>{dailyVIPFromGrid[idx] || ''}</td>
              ))}
              <td>{summary.completed || 0}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* DCR Summary */}
      <div className="cpv-md-section">
        <DCRSummaryTable dcrSummary={dcrSummary} dcrTotal={dcrTotal} />
      </div>

      {/* Daily MD Count */}
      {dailyMDCount.length > 0 && (
        <div className="cpv-md-section">
          <h3 className="cpv-section-title">Daily MD Count</h3>
          <div className="cpv-md-table-wrap">
            <table className="cpv-md-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>VIP</th>
                  <th>Extra Call</th>
                  <th>Total MD</th>
                </tr>
              </thead>
              <tbody>
                {dailyMDCount.map((day) => (
                  <tr key={day.day}>
                    <td>{day.label}</td>
                    <td>{day.vipCount}</td>
                    <td>{day.extraCallCount}</td>
                    <td>{day.totalMD}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>TOTAL</td>
                  <td>{dailyMDCount.reduce((s, d) => s + d.vipCount, 0)}</td>
                  <td>{dailyMDCount.reduce((s, d) => s + d.extraCallCount, 0)}</td>
                  <td>{dailyMDCount.reduce((s, d) => s + d.totalMD, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Extra Calls Section */}
      {extraCallsWithData.length > 0 && (
        <div className="cpv-extra-section">
          <h3 className="cpv-section-title">Extra Calls (Non-VIP)</h3>
          {extraCallsWithData.map((ec) => (
            <div key={ec.day} className="cpv-extra-day">
              <div
                className="cpv-extra-day-header"
                onClick={() => toggleExtraDay(ec.day)}
              >
                {expandedExtraDays[ec.day] ? '\u25BC' : '\u25B6'} {ec.label}
                <span className="cpv-extra-count">{ec.clients.length} client{ec.clients.length !== 1 ? 's' : ''}</span>
              </div>
              {expandedExtraDays[ec.day] && (
                <div className="cpv-extra-list">
                  {ec.clients.map((client, ci) => (
                    <div key={ci} className="cpv-extra-client">
                      <span>{client.lastName}, {client.firstName}</span>
                      {client.engagementTypes?.length > 0 && (
                        <span className="cpv-extra-engagement">
                          {client.engagementTypes.map((et) => (
                            <span key={et}>{et.replace('_', '/')}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CallPlanView;
