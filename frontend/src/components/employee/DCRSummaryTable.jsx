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

  /* ===== DARK MODE ===== */
  body.dark-mode .dcr-section-title {
    color: #f1f5f9;
  }

  body.dark-mode .dcr-table th,
  body.dark-mode .dcr-table td {
    border-color: #1e293b;
  }

  body.dark-mode .dcr-table tbody td {
    background: #0b1220;
    color: #e2e8f0;
  }

  body.dark-mode .dcr-table tbody td:first-child {
    background: #0f172a;
    color: #e2e8f0;
  }

  body.dark-mode .dcr-table .total-row td {
    background: #0f172a;
    border-top-color: #334155;
  }

  .dcr-hdr-short {
    display: none;
  }

  @media (max-width: 480px) {
    .dcr-hdr-full { display: none; }
    .dcr-hdr-short { display: inline; }
    .dcr-table-wrap {
      overflow-x: hidden;
    }
    .dcr-table {
      min-width: unset;
      width: 100%;
      table-layout: fixed;
      font-size: 11px;
    }
    .dcr-table th, .dcr-table td {
      padding: 5px 2px;
      white-space: nowrap;
    }
    .dcr-table thead th {
      font-size: 9px;
      letter-spacing: 0;
    }
    .dcr-table tbody td:first-child {
      font-size: 10px;
    }
    .dcr-section-title {
      font-size: 14px;
    }
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
              <th>Rate</th>
              <th><span className="dcr-hdr-full">TXT</span><span className="dcr-hdr-short">TXT</span></th>
              <th><span className="dcr-hdr-full">MES/GIF</span><span className="dcr-hdr-short">M/G</span></th>
              <th><span className="dcr-hdr-full">PIC</span><span className="dcr-hdr-short">PIC</span></th>
              <th><span className="dcr-hdr-full">SIGNED</span><span className="dcr-hdr-short">SGN</span></th>
              <th><span className="dcr-hdr-full">VOICE</span><span className="dcr-hdr-short">VOC</span></th>
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
