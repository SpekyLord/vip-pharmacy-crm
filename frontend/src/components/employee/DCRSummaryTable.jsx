/**
 * DCRSummaryTable Component
 *
 * Displays Daily Call Report summary with:
 * - Target vs Total engagements per day
 * - Call Rate percentage with color coding
 * - Engagement type breakdown
 * - Total row
 */

const tableStyles = `
  .dcr-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 24px;
  }

  .dcr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: 600px;
  }

  .dcr-table th,
  .dcr-table td {
    padding: 10px 12px;
    text-align: center;
    border: 1px solid #e5e7eb;
    white-space: nowrap;
  }

  .dcr-table thead th {
    background: #1e293b;
    color: white;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    position: sticky;
    top: 0;
    z-index: 2;
  }

  .dcr-table tbody td {
    background: white;
  }

  .dcr-table tbody td:first-child {
    font-weight: 600;
    background: #f8fafc;
    text-align: left;
  }

  .dcr-table .rate-green {
    color: #16a34a;
    font-weight: 700;
  }

  .dcr-table .rate-yellow {
    color: #ca8a04;
    font-weight: 700;
  }

  .dcr-table .rate-red {
    color: #dc2626;
    font-weight: 700;
  }

  .dcr-table .total-row td {
    background: #f1f5f9;
    font-weight: 700;
    border-top: 2px solid #94a3b8;
  }

  .dcr-section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
`;

const getRateClass = (rate) => {
  if (rate >= 80) return 'rate-green';
  if (rate >= 50) return 'rate-yellow';
  return 'rate-red';
};

const DCRSummaryTable = ({ dcrSummary = [], dcrTotal = {} }) => {
  if (!dcrSummary.length) return null;

  return (
    <div>
      <style>{tableStyles}</style>
      <h3 className="dcr-section-title">DCR Summary</h3>
      <div className="dcr-table-wrap">
        <table className="dcr-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Target</th>
              <th>Total</th>
              <th>Call Rate</th>
              <th>TXT</th>
              <th>MES/GIF</th>
              <th>PIC</th>
              <th>SIGNED</th>
              <th>VOICE</th>
            </tr>
          </thead>
          <tbody>
            {dcrSummary.map((day) => (
              <tr key={day.day}>
                <td>{day.label}</td>
                <td>{day.targetEngagements}</td>
                <td>{day.totalEngagements}</td>
                <td className={getRateClass(day.callRate)}>
                  {day.callRate}%
                </td>
                <td>{day.engagementBreakdown?.TXT_PROMATS || 0}</td>
                <td>{day.engagementBreakdown?.MES_VIBER_GIF || 0}</td>
                <td>{day.engagementBreakdown?.PICTURE || 0}</td>
                <td>{day.engagementBreakdown?.SIGNED_CALL || 0}</td>
                <td>{day.engagementBreakdown?.VOICE_CALL || 0}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>TOTAL</td>
              <td>{dcrTotal.targetEngagements || 0}</td>
              <td>{dcrTotal.totalEngagements || 0}</td>
              <td className={getRateClass(dcrTotal.callRate || 0)}>
                {dcrTotal.callRate || 0}%
              </td>
              <td>{dcrSummary.reduce((s, d) => s + (d.engagementBreakdown?.TXT_PROMATS || 0), 0)}</td>
              <td>{dcrSummary.reduce((s, d) => s + (d.engagementBreakdown?.MES_VIBER_GIF || 0), 0)}</td>
              <td>{dcrSummary.reduce((s, d) => s + (d.engagementBreakdown?.PICTURE || 0), 0)}</td>
              <td>{dcrSummary.reduce((s, d) => s + (d.engagementBreakdown?.SIGNED_CALL || 0), 0)}</td>
              <td>{dcrSummary.reduce((s, d) => s + (d.engagementBreakdown?.VOICE_CALL || 0), 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DCRSummaryTable;
