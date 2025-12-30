/**
 * ReportsPage
 *
 * Admin page for reports and analytics:
 * - BDM Visit Report (Call Plan Template)
 * - GPS Location Verification Panel
 * - Export functionality (Excel/CSV)
 *
 * Route: /admin/reports
 */

import { useState, useMemo } from 'react';
import {
  FileText,
  Calendar,
  Download,
  MapPin,
  Table,
  Eye,
  CheckCircle,
  AlertTriangle,
  Navigation,
  Building,
  Clock,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import VisitLocationMap from '../../components/admin/VisitLocationMap';
import EmployeeAnalytics from '../../components/admin/EmployeeAnalytics';

/* =============================================================================
   MOCK DATA
   ============================================================================= */

const MOCK_BDMS = [
  { id: 'bdm-001', name: 'Juan Dela Cruz', region: 'Region VI' },
  { id: 'bdm-002', name: 'Maria Garcia', region: 'NCR' },
  { id: 'bdm-003', name: 'Pedro Martinez', region: 'Region VII' },
];

const MOCK_VISITS = [
  {
    id: 'visit-001',
    bdmId: 'bdm-001',
    bdmName: 'Juan Dela Cruz',
    doctorName: 'Dr. Maria Santos',
    clinicName: 'Santos Medical Clinic',
    date: '2025-12-02',
    time: '09:30 AM',
    clinicLat: 10.6969,
    clinicLng: 122.5648,
    employeeLat: 10.6975,
    employeeLng: 122.5652,
    accuracy: 10,
    gpsStatus: 'verified',
  },
  {
    id: 'visit-002',
    bdmId: 'bdm-001',
    bdmName: 'Juan Dela Cruz',
    doctorName: 'Dr. Jose Rizal',
    clinicName: 'Rizal Health Center',
    date: '2025-12-05',
    time: '02:00 PM',
    clinicLat: 10.7006,
    clinicLng: 122.5656,
    employeeLat: 10.7050,
    employeeLng: 122.5700,
    accuracy: 15,
    gpsStatus: 'warning',
  },
  {
    id: 'visit-003',
    bdmId: 'bdm-002',
    bdmName: 'Maria Garcia',
    doctorName: 'Dr. Chen Wei',
    clinicName: 'Wei Medical Arts',
    date: '2025-12-03',
    time: '11:00 AM',
    clinicLat: 14.5995,
    clinicLng: 120.9842,
    employeeLat: 14.6050,
    employeeLng: 120.9900,
    accuracy: 20,
    gpsStatus: 'warning',
  },
];

/* =============================================================================
   STYLES
   ============================================================================= */

const pageStyles = `
  .reports-layout {
    min-height: 100vh;
    background: #f3f4f6;
  }

  .reports-content {
    display: flex;
  }

  .reports-main {
    flex: 1;
    padding: 24px;
    max-width: 1400px;
  }

  .page-header h1 {
    margin: 0 0 24px 0;
    font-size: 28px;
    color: #1f2937;
  }

  /* Report Card */
  .report-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    border: 1px solid #e5e7eb;
    overflow: hidden;
    margin-bottom: 24px;
  }

  .report-card-header {
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }

  .report-card-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .filter-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .filter-group label {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    display: block;
    margin-bottom: 4px;
  }

  .filter-select, .filter-input {
    padding: 10px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    min-width: 160px;
  }

  .btn-generate {
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-generate:hover {
    background: #2563eb;
  }

  .export-buttons {
    display: flex;
    gap: 8px;
  }

  .btn-export {
    padding: 10px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .btn-export.excel {
    background: #22c55e;
    color: white;
  }

  .btn-export.csv {
    background: white;
    color: #374151;
    border: 1px solid #e5e7eb;
  }

  /* Table */
  .report-table {
    width: 100%;
    border-collapse: collapse;
  }

  .report-table th {
    padding: 14px 16px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .report-table td {
    padding: 14px 16px;
    font-size: 14px;
    border-bottom: 1px solid #f3f4f6;
  }

  .report-table tr:hover {
    background: #f9fafb;
  }

  .report-table tr.selected {
    background: #eff6ff;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.verified {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.warning {
    background: #fee2e2;
    color: #dc2626;
  }

  .btn-view {
    padding: 8px 14px;
    background: #f3f4f6;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .btn-view:hover {
    background: #e5e7eb;
  }

  .empty-state {
    padding: 60px 20px;
    text-align: center;
    color: #6b7280;
  }

  .gps-section {
    margin-top: 24px;
  }

  .gps-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .gps-section-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }

  .selected-visit-info {
    padding: 8px 16px;
    background: #eff6ff;
    border-radius: 8px;
    font-size: 14px;
    color: #1e40af;
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const ReportsPage = () => {
  const [selectedBdm, setSelectedBdm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('2025-12');
  const [reportGenerated, setReportGenerated] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);

  const filteredVisits = useMemo(() => {
    if (!selectedBdm) return [];
    return MOCK_VISITS.filter((v) => v.bdmId === selectedBdm);
  }, [selectedBdm]);

  const handleGenerateReport = () => {
    if (!selectedBdm) {
      alert('Please select a BDM first');
      return;
    }
    setReportGenerated(true);
    setSelectedVisit(null);
  };

  const handleExport = (format) => {
    alert(`Exporting ${format.toUpperCase()} report`);
  };

  return (
    <div className="reports-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="reports-content">
        <Sidebar />
        <main className="reports-main">
          <div className="page-header">
            <h1>BDM Visit Report</h1>
          </div>

          <div className="report-card">
            <div className="report-card-header">
              <div className="filter-controls">
                <div className="filter-group">
                  <label>BDM</label>
                  <select
                    className="filter-select"
                    value={selectedBdm}
                    onChange={(e) => {
                      setSelectedBdm(e.target.value);
                      setReportGenerated(false);
                      setSelectedVisit(null);
                    }}
                  >
                    <option value="">Select BDM</option>
                    {MOCK_BDMS.map((bdm) => (
                      <option key={bdm.id} value={bdm.id}>{bdm.name}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Month</label>
                  <input
                    type="month"
                    className="filter-input"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                </div>
                <button className="btn-generate" onClick={handleGenerateReport}>
                  Generate Report
                </button>
              </div>
              <div className="export-buttons">
                <button className="btn-export excel" onClick={() => handleExport('excel')}>
                  Export Excel
                </button>
                <button className="btn-export csv" onClick={() => handleExport('csv')}>
                  Export CSV
                </button>
              </div>
            </div>

            {!reportGenerated ? (
              <div className="empty-state">
                <h3>No Report Generated</h3>
                <p>Select a BDM and month, then click "Generate Report" to view the Call Plan Template.</p>
              </div>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Doctor / Clinic</th>
                    <th>GPS Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVisits.map((visit) => (
                    <tr key={visit.id} className={selectedVisit?.id === visit.id ? 'selected' : ''}>
                      <td>{visit.date}</td>
                      <td>{visit.time}</td>
                      <td>
                        <div><strong>{visit.doctorName}</strong></div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{visit.clinicName}</div>
                      </td>
                      <td>
                        <span className={`status-badge ${visit.gpsStatus}`}>
                          {visit.gpsStatus === 'verified' ? (
                            <><CheckCircle size={12} /> Verified</>
                          ) : (
                            <><AlertTriangle size={12} /> Warning</>
                          )}
                        </span>
                      </td>
                      <td>
                        <button className="btn-view" onClick={() => setSelectedVisit(visit)}>
                          <Eye size={14} style={{ marginRight: 4 }} />
                          View GPS
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* GPS Verification Section */}
          {selectedVisit && (
            <div className="gps-section">
              <div className="gps-section-header">
                <span className="gps-section-title">GPS Location Verification</span>
                <span className="selected-visit-info">
                  {selectedVisit.clinicName} • {selectedVisit.doctorName}
                </span>
              </div>
              <VisitLocationMap
                clinicCoords={{ lat: selectedVisit.clinicLat, lng: selectedVisit.clinicLng }}
                employeeCoords={{ lat: selectedVisit.employeeLat, lng: selectedVisit.employeeLng }}
                allowedRadius={400}
                accuracy={selectedVisit.accuracy}
              />
            </div>
          )}

          {/* Employee Performance Analytics (Task 2.10) */}
          {reportGenerated && selectedBdm && (
            <EmployeeAnalytics
              employeeId={selectedBdm}
              employeeName={MOCK_BDMS.find(b => b.id === selectedBdm)?.name || 'Unknown'}
              month={selectedMonth}
              visits={filteredVisits}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default ReportsPage;