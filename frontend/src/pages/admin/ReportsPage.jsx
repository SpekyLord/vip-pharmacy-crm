/**
 * ReportsPage
 *
 * Admin page for Employee Visit Reports:
 * - Select employee from dropdown
 * - Select month/year
 * - Generate report in Call Plan Template format
 * - Export to Excel/CSV
 */

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmployeeVisitReport from '../../components/admin/EmployeeVisitReport';
import userService from '../../services/userService';
import visitService from '../../services/visitService';
import {
  exportEmployeeReportToExcel,
  exportEmployeeReportToCSV,
} from '../../utils/exportEmployeeReport';

const reportsPageStyles = `
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
    max-width: 100%;
    overflow-x: hidden;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .page-header h1 {
    margin: 0;
    font-size: 28px;
    color: #1f2937;
  }

  .report-controls {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    margin-bottom: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-end;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 200px;
  }

  .control-group label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .control-group select,
  .control-group input {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    color: #1f2937;
    background: white;
  }

  .control-group select:focus,
  .control-group input:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-excel {
    background: #22c55e;
    color: white;
  }

  .btn-excel:hover:not(:disabled) {
    background: #16a34a;
  }

  .btn-csv {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .btn-csv:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .export-buttons {
    display: flex;
    gap: 12px;
    margin-left: auto;
  }

  .report-placeholder {
    background: white;
    padding: 48px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: center;
    color: #6b7280;
  }

  .report-placeholder h3 {
    margin: 0 0 8px;
    font-size: 18px;
    color: #374151;
  }

  .report-placeholder p {
    margin: 0;
    font-size: 14px;
  }

  .loading-container {
    background: white;
    padding: 48px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .error-banner {
    background: #fee2e2;
    color: #dc2626;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }
`;

const ReportsPage = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch employees on mount
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        setLoadingEmployees(true);
        const response = await userService.getAll({ role: 'employee', limit: 0 });
        setEmployees(response.data || []);
      } catch (err) {
        toast.error('Failed to load employees');
      } finally {
        setLoadingEmployees(false);
      }
    };

    fetchEmployees();
  }, []);

  // Generate current month as default
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${year}-${month}`);
  }, []);

  // Generate report
  const handleGenerateReport = useCallback(async () => {
    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }

    if (!selectedMonth) {
      toast.error('Please select a month');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setReportData(null);

      const response = await visitService.getEmployeeReport(selectedEmployee, selectedMonth);
      setReportData(response.data);
      toast.success('Report generated successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate report');
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [selectedEmployee, selectedMonth]);

  // Export to Excel
  const handleExportExcel = useCallback(() => {
    if (!reportData) {
      toast.error('Generate a report first');
      return;
    }

    try {
      setExporting(true);
      exportEmployeeReportToExcel(reportData, selectedMonth);
      toast.success('Exported to Excel');
    } catch (err) {
      toast.error('Failed to export to Excel');
    } finally {
      setExporting(false);
    }
  }, [reportData, selectedMonth]);

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    if (!reportData) {
      toast.error('Generate a report first');
      return;
    }

    try {
      setExporting(true);
      exportEmployeeReportToCSV(reportData, selectedMonth);
      toast.success('Exported to CSV');
    } catch (err) {
      toast.error('Failed to export to CSV');
    } finally {
      setExporting(false);
    }
  }, [reportData, selectedMonth]);

  return (
    <div className="dashboard-layout">
      <style>{reportsPageStyles}</style>
      <Navbar />
      <div className="dashboard-content">
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1>Employee Visit Report</h1>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="report-controls">
            <div className="control-group">
              <label htmlFor="employee-select">Employee</label>
              <select
                id="employee-select"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                disabled={loadingEmployees}
              >
                <option value="">
                  {loadingEmployees ? 'Loading...' : 'Select Employee'}
                </option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label htmlFor="month-select">Month</label>
              <input
                id="month-select"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleGenerateReport}
              disabled={loading || !selectedEmployee || !selectedMonth}
            >
              {loading ? 'Generating...' : 'Generate Report'}
            </button>

            <div className="export-buttons">
              <button
                className="btn btn-excel"
                onClick={handleExportExcel}
                disabled={!reportData || exporting}
              >
                {exporting ? 'Exporting...' : 'Export Excel'}
              </button>
              <button
                className="btn btn-csv"
                onClick={handleExportCSV}
                disabled={!reportData || exporting}
              >
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-container">
              <LoadingSpinner />
            </div>
          ) : reportData ? (
            <EmployeeVisitReport reportData={reportData} monthYear={selectedMonth} />
          ) : (
            <div className="report-placeholder">
              <h3>No Report Generated</h3>
              <p>Select an employee and month, then click &quot;Generate Report&quot; to view the Call Plan Template.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ReportsPage;
