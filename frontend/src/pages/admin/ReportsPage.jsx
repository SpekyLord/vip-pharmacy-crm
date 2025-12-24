/**
 * ReportsPage
 *
 * Admin page for reports and analytics:
 * - Visit reports
 * - Employee performance
 * - Product analytics
 * - Export functionality
 */

import { useState } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';

const ReportsPage = () => {
  const [reportType, setReportType] = useState('visits');
  const [dateRange, setDateRange] = useState({
    start: '',
    end: '',
  });

  const handleGenerateReport = () => {
    // TODO: Generate report based on type and date range
    console.log('Generating report:', { reportType, dateRange });
  };

  const handleExport = (format) => {
    // TODO: Export report in specified format
    console.log('Exporting as:', format);
  };

  return (
    <div className="dashboard-layout">
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <h1>Reports & Analytics</h1>

          <div className="report-controls">
            <div className="control-group">
              <label>Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="visits">Visit Reports</option>
                <option value="employees">Employee Performance</option>
                <option value="doctors">Doctor Coverage</option>
                <option value="products">Product Analytics</option>
              </select>
            </div>

            <div className="control-group">
              <label>Date Range</label>
              <div className="date-inputs">
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, start: e.target.value }))
                  }
                />
                <span>to</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) =>
                    setDateRange((prev) => ({ ...prev, end: e.target.value }))
                  }
                />
              </div>
            </div>

            <button onClick={handleGenerateReport} className="btn btn-primary">
              Generate Report
            </button>
          </div>

          <div className="report-actions">
            <button onClick={() => handleExport('pdf')} className="btn btn-secondary">
              Export PDF
            </button>
            <button onClick={() => handleExport('excel')} className="btn btn-secondary">
              Export Excel
            </button>
            <button onClick={() => handleExport('csv')} className="btn btn-secondary">
              Export CSV
            </button>
          </div>

          <div className="report-content">
            <p className="placeholder">Select report type and date range to generate report</p>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ReportsPage;
