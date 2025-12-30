/**
 * ReportGenerator Component
 *
 * Modal/Panel for generating various report types with filters and export options.
 *
 * Report Types:
 * - Weekly Compliance Report
 * - Monthly Visit Summary
 * - Employee Performance Report
 * - Regional Comparison Report
 * - Product Presentation Report
 *
 * Features:
 * - Date range selection
 * - Region/Employee filters
 * - Export to PDF/CSV/Excel
 * - Schedule recurring reports
 */

import { useState } from 'react';
import {
  X,
  Calendar,
  Download,
  FileText,
  Users,
  MapPin,
  Package,
  TrendingUp,
  Clock,
  CheckCircle,
  Loader2,
  FileSpreadsheet,
  File,
  Mail,
  Bell,
  CalendarClock,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';

/* =============================================================================
   MOCK DATA
   ============================================================================= */

const MOCK_REGIONS = [
  { id: 'all', name: 'All Regions' },
  { id: 'ncr', name: 'NCR - National Capital Region' },
  { id: 'region-3', name: 'Region III - Central Luzon' },
  { id: 'region-4a', name: 'Region IV-A - CALABARZON' },
  { id: 'region-6', name: 'Region VI - Western Visayas' },
  { id: 'region-7', name: 'Region VII - Central Visayas' },
];

const MOCK_EMPLOYEES = [
  { id: 'all', name: 'All Employees' },
  { id: 'emp-001', name: 'Juan Dela Cruz', region: 'region-6' },
  { id: 'emp-002', name: 'Maria Garcia', region: 'ncr' },
  { id: 'emp-003', name: 'Pedro Martinez', region: 'region-7' },
  { id: 'emp-004', name: 'Ana Lopez', region: 'region-3' },
  { id: 'emp-005', name: 'Carlos Santos', region: 'region-4a' },
];

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .rg-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .rg-modal {
    background: white;
    border-radius: 20px;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    animation: modalSlide 0.3s ease-out;
  }

  @keyframes modalSlide {
    from { opacity: 0; transform: scale(0.95) translateY(-20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  /* Header */
  .rg-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .rg-header-info {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .rg-header-icon {
    width: 48px;
    height: 48px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .rg-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }

  .rg-header p {
    margin: 4px 0 0 0;
    font-size: 13px;
    opacity: 0.9;
  }

  .rg-close {
    width: 40px;
    height: 40px;
    border: none;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition: all 0.2s;
  }

  .rg-close:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  /* Body */
  .rg-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  /* Section */
  .rg-section {
    margin-bottom: 24px;
  }

  .rg-section:last-child {
    margin-bottom: 0;
  }

  .rg-section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  /* Form Row */
  .rg-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .rg-row.single {
    grid-template-columns: 1fr;
  }

  .rg-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rg-label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  .rg-input,
  .rg-select {
    padding: 12px 14px;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    font-size: 14px;
    color: #1f2937;
    background: white;
    transition: all 0.2s;
  }

  .rg-input:focus,
  .rg-select:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .rg-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 40px;
    cursor: pointer;
  }

  /* Export Options */
  .rg-export-options {
    display: flex;
    gap: 12px;
  }

  .rg-export-option {
    flex: 1;
    padding: 16px;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    background: white;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
  }

  .rg-export-option:hover {
    border-color: #d1d5db;
    background: #f9fafb;
  }

  .rg-export-option.selected {
    border-color: #8b5cf6;
    background: #faf5ff;
  }

  .rg-export-option .icon {
    width: 40px;
    height: 40px;
    margin: 0 auto 8px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .rg-export-option.pdf .icon { background: #fee2e2; color: #dc2626; }
  .rg-export-option.csv .icon { background: #dcfce7; color: #16a34a; }
  .rg-export-option.excel .icon { background: #dbeafe; color: #2563eb; }

  .rg-export-option span {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }

  /* Schedule Toggle */
  .rg-schedule-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    background: #f9fafb;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    margin-bottom: 16px;
  }

  .rg-schedule-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .rg-schedule-info .icon {
    width: 40px;
    height: 40px;
    background: #fef3c7;
    color: #d97706;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .rg-schedule-info h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
  }

  .rg-schedule-info p {
    margin: 2px 0 0 0;
    font-size: 12px;
    color: #6b7280;
  }

  /* Toggle Switch */
  .rg-switch {
    position: relative;
    width: 48px;
    height: 26px;
    flex-shrink: 0;
  }

  .rg-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .rg-switch-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: #d1d5db;
    border-radius: 13px;
    transition: all 0.3s;
  }

  .rg-switch-slider::before {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: all 0.3s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  .rg-switch input:checked + .rg-switch-slider {
    background: #8b5cf6;
  }

  .rg-switch input:checked + .rg-switch-slider::before {
    transform: translateX(22px);
  }

  /* Schedule Options */
  .rg-schedule-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-top: 16px;
    padding: 16px;
    background: #faf5ff;
    border-radius: 12px;
    border: 1px solid #e9d5ff;
  }

  .rg-schedule-opt {
    padding: 12px;
    border: 1px solid #e9d5ff;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    text-align: center;
    transition: all 0.2s;
  }

  .rg-schedule-opt:hover {
    border-color: #c4b5fd;
  }

  .rg-schedule-opt.selected {
    border-color: #8b5cf6;
    background: #8b5cf6;
    color: white;
  }

  .rg-schedule-opt span {
    font-size: 13px;
    font-weight: 500;
  }

  .rg-email-field {
    margin-top: 12px;
  }

  /* Footer */
  .rg-footer {
    padding: 20px 24px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .rg-footer-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #6b7280;
  }

  .rg-footer-actions {
    display: flex;
    gap: 12px;
  }

  .rg-btn {
    padding: 12px 24px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    transition: all 0.2s;
  }

  .rg-btn.cancel {
    background: white;
    color: #6b7280;
    border: 1px solid #e5e7eb;
  }

  .rg-btn.cancel:hover {
    background: #f3f4f6;
  }

  .rg-btn.generate {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .rg-btn.generate:hover {
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .rg-btn.generate:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .rg-btn .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Preview Panel */
  .rg-preview {
    margin-top: 16px;
    padding: 16px;
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 12px;
  }

  .rg-preview-header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #16a34a;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .rg-preview-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .rg-preview-item {
    padding: 6px 12px;
    background: white;
    border-radius: 6px;
    font-size: 12px;
    color: #374151;
    border: 1px solid #d1fae5;
  }

  @media (max-width: 600px) {
    .rg-modal {
      max-height: 100vh;
      border-radius: 0;
    }
    .rg-row {
      grid-template-columns: 1fr;
    }
    .rg-export-options {
      flex-direction: column;
    }
    .rg-schedule-options {
      grid-template-columns: 1fr;
    }
    .rg-footer {
      flex-direction: column;
      gap: 12px;
    }
    .rg-footer-actions {
      width: 100%;
    }
    .rg-btn {
      flex: 1;
      justify-content: center;
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const ReportGenerator = ({
  isOpen = false,
  onClose = () => {},
  reportType = null,
  onGenerate = null,
}) => {
  // Form state
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf');
  
  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState('weekly');
  const [scheduleEmail, setScheduleEmail] = useState('');
  
  // Loading state
  const [isGenerating, setIsGenerating] = useState(false);

  // Filter employees by region
  const filteredEmployees = selectedRegion === 'all'
    ? MOCK_EMPLOYEES
    : MOCK_EMPLOYEES.filter(e => e.id === 'all' || e.region === selectedRegion);

  // Get report type info
  const getReportInfo = () => {
    switch (reportType) {
      case 'compliance':
        return { title: 'Weekly Compliance Report', icon: CheckCircle, color: '#22c55e' };
      case 'visits':
        return { title: 'Monthly Visit Summary', icon: Calendar, color: '#3b82f6' };
      case 'performance':
        return { title: 'Employee Performance Report', icon: TrendingUp, color: '#8b5cf6' };
      case 'regional':
        return { title: 'Regional Comparison Report', icon: MapPin, color: '#f59e0b' };
      case 'products':
        return { title: 'Product Presentation Report', icon: Package, color: '#ec4899' };
      default:
        return { title: 'Generate Report', icon: FileText, color: '#6b7280' };
    }
  };

  const reportInfo = getReportInfo();
  const ReportIcon = reportInfo.icon;

  // Handle generate
  const handleGenerate = async () => {
    setIsGenerating(true);

    const reportData = {
      type: reportType,
      dateRange: { start: startDate, end: endDate },
      region: selectedRegion,
      employee: selectedEmployee,
      format: exportFormat,
      schedule: scheduleEnabled ? {
        frequency: scheduleFrequency,
        email: scheduleEmail,
      } : null,
    };

    console.log('📊 Generating Report:', reportData);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('✅ Report generated successfully!');
    console.log(`📄 Export format: ${exportFormat.toUpperCase()}`);
    
    if (scheduleEnabled) {
      console.log(`📅 Scheduled: ${scheduleFrequency} to ${scheduleEmail}`);
    }

    setIsGenerating(false);

    if (onGenerate) {
      onGenerate(reportData);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="rg-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <style>{styles}</style>
      <div className="rg-modal">
        {/* Header */}
        <div className="rg-header">
          <div className="rg-header-info">
            <div className="rg-header-icon">
              <ReportIcon size={24} />
            </div>
            <div>
              <h2>{reportInfo.title}</h2>
              <p>Configure your report parameters</p>
            </div>
          </div>
          <button className="rg-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="rg-body">
          {/* Date Range */}
          <div className="rg-section">
            <div className="rg-section-title">
              <Calendar size={14} />
              Date Range
            </div>
            <div className="rg-row">
              <div className="rg-field">
                <label className="rg-label">Start Date</label>
                <input
                  type="date"
                  className="rg-input"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="rg-field">
                <label className="rg-label">End Date</label>
                <input
                  type="date"
                  className="rg-input"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rg-section">
            <div className="rg-section-title">
              <Users size={14} />
              Filters
            </div>
            <div className="rg-row">
              <div className="rg-field">
                <label className="rg-label">Region</label>
                <select
                  className="rg-select"
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedEmployee('all');
                  }}
                >
                  {MOCK_REGIONS.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="rg-field">
                <label className="rg-label">Employee</label>
                <select
                  className="rg-select"
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                >
                  {filteredEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Export Format */}
          <div className="rg-section">
            <div className="rg-section-title">
              <Download size={14} />
              Export Format
            </div>
            <div className="rg-export-options">
              <div
                className={`rg-export-option pdf ${exportFormat === 'pdf' ? 'selected' : ''}`}
                onClick={() => setExportFormat('pdf')}
              >
                <div className="icon">
                  <File size={20} />
                </div>
                <span>PDF</span>
              </div>
              <div
                className={`rg-export-option csv ${exportFormat === 'csv' ? 'selected' : ''}`}
                onClick={() => setExportFormat('csv')}
              >
                <div className="icon">
                  <FileText size={20} />
                </div>
                <span>CSV</span>
              </div>
              <div
                className={`rg-export-option excel ${exportFormat === 'excel' ? 'selected' : ''}`}
                onClick={() => setExportFormat('excel')}
              >
                <div className="icon">
                  <FileSpreadsheet size={20} />
                </div>
                <span>Excel</span>
              </div>
            </div>
          </div>

          {/* Schedule */}
          <div className="rg-section">
            <div className="rg-section-title">
              <CalendarClock size={14} />
              Schedule (Optional)
            </div>
            <div className="rg-schedule-toggle">
              <div className="rg-schedule-info">
                <div className="icon">
                  <Bell size={20} />
                </div>
                <div>
                  <h4>Schedule Recurring Report</h4>
                  <p>Automatically generate and send via email</p>
                </div>
              </div>
              <label className="rg-switch">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                />
                <span className="rg-switch-slider" />
              </label>
            </div>

            {scheduleEnabled && (
              <>
                <div className="rg-schedule-options">
                  {['daily', 'weekly', 'monthly'].map(freq => (
                    <div
                      key={freq}
                      className={`rg-schedule-opt ${scheduleFrequency === freq ? 'selected' : ''}`}
                      onClick={() => setScheduleFrequency(freq)}
                    >
                      <span>{freq.charAt(0).toUpperCase() + freq.slice(1)}</span>
                    </div>
                  ))}
                </div>
                <div className="rg-field rg-email-field">
                  <label className="rg-label">Email Recipients</label>
                  <input
                    type="email"
                    className="rg-input"
                    placeholder="Enter email address"
                    value={scheduleEmail}
                    onChange={(e) => setScheduleEmail(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {/* Preview */}
          <div className="rg-preview">
            <div className="rg-preview-header">
              <CheckCircle size={16} />
              Report Preview
            </div>
            <div className="rg-preview-list">
              <span className="rg-preview-item">
                📅 {startDate} to {endDate}
              </span>
              <span className="rg-preview-item">
                🗺️ {MOCK_REGIONS.find(r => r.id === selectedRegion)?.name}
              </span>
              <span className="rg-preview-item">
                👤 {MOCK_EMPLOYEES.find(e => e.id === selectedEmployee)?.name || 'All Employees'}
              </span>
              <span className="rg-preview-item">
                📄 {exportFormat.toUpperCase()}
              </span>
              {scheduleEnabled && (
                <span className="rg-preview-item">
                  🔄 {scheduleFrequency}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="rg-footer">
          <div className="rg-footer-info">
            <AlertCircle size={16} />
            Report will be generated based on available data
          </div>
          <div className="rg-footer-actions">
            <button className="rg-btn cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              className="rg-btn generate"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={18} className="spinner" />
                  Generating...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Generate Report
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportGenerator;