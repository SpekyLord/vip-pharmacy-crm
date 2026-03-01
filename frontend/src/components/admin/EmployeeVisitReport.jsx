/**
 * EmployeeVisitReport
 *
 * Displays employee visit data in Call Plan Template format:
 * - Yellow header rows with summary stats
 * - Day1-Day20 grid columns
 * - Green highlights for actual visits
 * - Assigned products display
 */

import { useMemo } from 'react';
import PropTypes from 'prop-types';

const reportStyles = `
  .report-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .report-header {
    background: #fef08a;
    padding: 16px 20px;
    border-bottom: 2px solid #eab308;
  }

  .header-row {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }

  .header-row:last-child {
    margin-bottom: 0;
  }

  .header-label {
    font-weight: 600;
    color: #1f2937;
    min-width: 150px;
  }

  .header-value {
    font-weight: 500;
    color: #374151;
    margin-right: 24px;
  }

  .header-instruction {
    font-size: 13px;
    color: #6b7280;
    font-style: italic;
  }

  .frequency-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
    margin-left: 8px;
  }

  .frequency-2x {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .frequency-4x {
    background: #dcfce7;
    color: #16a34a;
  }

  .employee-info {
    background: #fef9c3;
    padding: 12px 20px;
    border-bottom: 1px solid #eab308;
  }

  .daily-counts {
    background: #fefce8;
    padding: 12px 20px;
    border-bottom: 1px solid #eab308;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
  }

  .daily-counts-label {
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    min-width: 180px;
  }

  .daily-count-cell {
    min-width: 36px;
    text-align: center;
    font-weight: 500;
    color: #374151;
    padding: 4px;
    background: white;
    border-radius: 4px;
    font-size: 13px;
  }

  .report-table-wrapper {
    overflow-x: auto;
  }

  .report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .report-table th {
    background: #1e3a5f;
    color: white;
    padding: 10px 8px;
    text-align: center;
    font-weight: 600;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .report-table th.col-no { min-width: 40px; }
  .report-table th.col-name { min-width: 120px; text-align: left; }
  .report-table th.col-specialty { min-width: 100px; text-align: left; }
  .report-table th.col-day { min-width: 36px; }
  .report-table th.col-freq { min-width: 50px; }
  .report-table th.col-address { min-width: 150px; text-align: left; }
  .report-table th.col-product { min-width: 100px; text-align: left; }

  .day-header-cell {
    font-size: 11px;
  }

  .day-header-cell .day-name {
    display: block;
    text-transform: uppercase;
  }

  .day-header-cell .day-num {
    display: block;
    font-size: 10px;
    opacity: 0.8;
  }

  .report-table td {
    padding: 8px;
    border-bottom: 1px solid #e5e7eb;
    text-align: center;
  }

  .report-table td.text-left {
    text-align: left;
  }

  .report-table tr:nth-child(even) {
    background: #f9fafb;
  }

  .report-table tr:hover {
    background: #f3f4f6;
  }

  .visit-cell {
    width: 36px;
    height: 28px;
  }

  .visit-cell.has-visit {
    background: #dcfce7;
    color: #16a34a;
    font-weight: 700;
  }

  .visit-cell.no-visit {
    color: #d1d5db;
  }

  .product-cell {
    font-size: 12px;
    max-width: 100px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-data {
    padding: 48px;
    text-align: center;
    color: #6b7280;
  }

  .no-data h3 {
    margin: 0 0 8px;
    font-size: 16px;
    color: #374151;
  }

  .week-separator {
    border-left: 2px solid #94a3b8;
  }

  .end-row td {
    background: #f3f4f6;
    font-weight: 600;
    color: #6b7280;
  }
`;

const dayNames = ['mon', 'tue', 'wed', 'thu', 'fri'];

const EmployeeVisitReport = ({ reportData, monthYear }) => {
  // Format month/year for display
  const formatMonthYear = (my) => {
    if (!my) return '';
    const [year, month] = my.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  // Sort doctors alphabetically by lastName
  const sortedDoctors = useMemo(() => {
    if (!reportData?.doctors) return [];
    return [...reportData.doctors]
      .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  }, [reportData]);

  if (!reportData) {
    return (
      <div className="report-container">
        <style>{reportStyles}</style>
        <div className="no-data">
          <h3>No Report Data</h3>
          <p>Select a BDM and month to generate the report.</p>
        </div>
      </div>
    );
  }

  const { employee, summary, areaAssigned } = reportData;

  return (
    <div className="report-container">
      <style>{reportStyles}</style>

      {/* Header Section - Yellow Background */}
      <div className="report-header">
        <div className="header-row">
          <span className="header-label">Total No. Of 2X:</span>
          <span className="header-value">{summary.count2x}</span>
          <span className="header-instruction">
            Minimum of 20 VIP | Put &quot;1&quot; TWICE if VIP is to be covered twice a month
          </span>
          <span className="frequency-badge frequency-2x">2x</span>
        </div>
        <div className="header-row">
          <span className="header-label">Total No. Of 4X:</span>
          <span className="header-value">{summary.count4x}</span>
          <span className="header-instruction">
            Put &quot;1&quot; FOUR TIMES if VIP is to be covered four times a month
          </span>
          <span className="frequency-badge frequency-4x">4x</span>
        </div>
        <div className="header-row">
          <span className="header-label">Total No. of VIP:</span>
          <span className="header-value">{summary.totalDoctors}</span>
          <span className="header-instruction">Minimum of 130 VIP</span>
        </div>
        <div className="header-row">
          <span className="header-label">CALL PLANNING TOOL (CPT):</span>
          <span className="header-value">Month/Year: {formatMonthYear(monthYear)}</span>
        </div>
      </div>

      {/* Employee Info - Lighter Yellow */}
      <div className="employee-info">
        <div className="header-row">
          <span className="header-label">NAME:</span>
          <span className="header-value">{employee.name}</span>
          <span className="header-label">Area Assigned:</span>
          <span className="header-value">{areaAssigned}</span>
        </div>
      </div>

      {/* Daily VIP Counts */}
      <div className="daily-counts">
        <span className="daily-counts-label">VIP CUSTOMER (VIP) per Day:</span>
        {summary.dailyVIPCounts.map((count, idx) => (
          <span key={idx} className="daily-count-cell">
            {count}
          </span>
        ))}
      </div>

      {/* Data Table */}
      <div className="report-table-wrapper">
        <table className="report-table">
          <thead>
            <tr>
              <th className="col-no">NO.</th>
              <th className="col-name">LASTNAME</th>
              <th className="col-name">FIRSTNAME</th>
              <th className="col-specialty">VIP SPECIALTY</th>
              {/* Day headers - 4 weeks x 5 days */}
              {[0, 1, 2, 3].map((week) =>
                dayNames.map((day, dayIdx) => (
                  <th
                    key={`${week}-${dayIdx}`}
                    className={`col-day ${dayIdx === 0 && week > 0 ? 'week-separator' : ''}`}
                  >
                    <div className="day-header-cell">
                      <span className="day-name">{day}</span>
                      <span className="day-num">{week * 5 + dayIdx + 1}</span>
                    </div>
                  </th>
                ))
              )}
              <th className="col-freq">No. Of</th>
              <th className="col-freq">SUM OF</th>
              <th className="col-address">CLINIC/OFFICE ADDRESS</th>
              <th className="col-product">TARGET PRODUCT 1</th>
              <th className="col-product">TARGET PRODUCT 2</th>
              <th className="col-product">TARGET PRODUCT 3</th>
            </tr>
          </thead>
          <tbody>
            {sortedDoctors.length === 0 ? (
              <tr>
                <td colSpan={30} style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                  No VIP Clients found for this BDM.
                </td>
              </tr>
            ) : (
              <>
                {sortedDoctors.map((doctor, idx) => (
                  <tr key={doctor._id}>
                    <td>{idx + 1}</td>
                    <td className="text-left">{doctor.lastName}</td>
                    <td className="text-left">{doctor.firstName}</td>
                    <td className="text-left">{doctor.specialization || '-'}</td>
                    {/* Visit grid - 20 days */}
                    {doctor.visitGrid.map((hasVisit, dayIdx) => (
                      <td
                        key={dayIdx}
                        className={`visit-cell ${hasVisit ? 'has-visit' : 'no-visit'} ${
                          dayIdx % 5 === 0 && dayIdx > 0 ? 'week-separator' : ''
                        }`}
                      >
                        {hasVisit ? '1' : ''}
                      </td>
                    ))}
                    <td>{doctor.visitFrequency}</td>
                    <td>{doctor.visitCount}</td>
                    <td className="text-left">{doctor.clinicOfficeAddress || '-'}</td>
                    <td className="text-left product-cell" title={doctor.assignedProducts[0]?.name}>
                      {doctor.assignedProducts[0]?.name || '-'}
                    </td>
                    <td className="text-left product-cell" title={doctor.assignedProducts[1]?.name}>
                      {doctor.assignedProducts[1]?.name || '-'}
                    </td>
                    <td className="text-left product-cell" title={doctor.assignedProducts[2]?.name}>
                      {doctor.assignedProducts[2]?.name || '-'}
                    </td>
                  </tr>
                ))}
                {/* END row */}
                <tr className="end-row">
                  <td>END</td>
                  <td>END</td>
                  <td>END</td>
                  <td>END</td>
                  {Array(20)
                    .fill(null)
                    .map((_, idx) => (
                      <td key={idx}>END</td>
                    ))}
                  <td>END</td>
                  <td>END</td>
                  <td>END</td>
                  <td>END</td>
                  <td>END</td>
                  <td>END</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

EmployeeVisitReport.propTypes = {
  reportData: PropTypes.shape({
    employee: PropTypes.shape({
      _id: PropTypes.string,
      name: PropTypes.string,
      email: PropTypes.string,
    }),
    areaAssigned: PropTypes.string,
    doctors: PropTypes.arrayOf(
      PropTypes.shape({
        _id: PropTypes.string,
        name: PropTypes.string,
        specialization: PropTypes.string,
        hospital: PropTypes.string,
        visitFrequency: PropTypes.number,
        visitGrid: PropTypes.arrayOf(PropTypes.number),
        visitCount: PropTypes.number,
        assignedProducts: PropTypes.arrayOf(
          PropTypes.shape({
            name: PropTypes.string,
            priority: PropTypes.number,
          })
        ),
      })
    ),
    summary: PropTypes.shape({
      totalDoctors: PropTypes.number,
      count2x: PropTypes.number,
      count4x: PropTypes.number,
      totalVisits: PropTypes.number,
      dailyVIPCounts: PropTypes.arrayOf(PropTypes.number),
    }),
  }),
  monthYear: PropTypes.string,
};

export default EmployeeVisitReport;
