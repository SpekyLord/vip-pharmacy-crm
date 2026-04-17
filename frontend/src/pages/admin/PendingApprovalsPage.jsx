/**
 * Import / Export Page (formerly PendingApprovalsPage)
 *
 * Admin page for CPT Excel import/export management.
 *
 * Tabs:
 *   1. Import - Upload CPT Excel, preview parsed data, approve/reject
 *   2. Export - Select BDM + cycle, download 23-sheet CPT workbook
 *   3. History - View past import batches with status
 *
 * Route: /admin/approvals
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  History,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  AlertTriangle,
  Clock,
  Users,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import PageGuide from '../../components/common/PageGuide';
import BatchDetailModal from '../../components/admin/VisitApproval';
import * as importService from '../../services/importService';
import userService from '../../services/userService';
import doctorService from '../../services/doctorService';
import scheduleService from '../../services/scheduleService';
import { exportCPTWorkbook } from '../../utils/exportCPTWorkbook';

import SelectField from '../../components/common/Select';

/* =============================================================================
   STYLES
   ============================================================================= */

const styles = `
  .ie-page {
    display: flex;
    min-height: calc(100vh - 68px);
    background: #f1f5f9;
  }

  .ie-content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    max-width: 1400px;
  }

  .ie-header {
    margin-bottom: 24px;
  }

  .ie-header h1 {
    font-size: 24px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 4px;
  }

  .ie-header p {
    color: #64748b;
    font-size: 14px;
    margin: 0;
  }

  /* Tabs */
  .ie-tabs {
    display: flex;
    gap: 4px;
    background: #e2e8f0;
    border-radius: 12px;
    padding: 4px;
    margin-bottom: 24px;
    width: fit-content;
  }

  .ie-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .ie-tab:hover {
    color: #334155;
    background: rgba(255, 255, 255, 0.5);
  }

  .ie-tab.active {
    background: white;
    color: #0f172a;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* Card */
  .ie-card {
    background: white;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    padding: 24px;
    margin-bottom: 16px;
  }

  .ie-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #0f172a;
    margin: 0 0 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Form */
  .ie-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .ie-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ie-field label {
    font-size: 13px;
    font-weight: 500;
    color: #475569;
  }

  .ie-field select,
  .ie-field input {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    background: white;
    color: #0f172a;
    outline: none;
    transition: border-color 0.2s;
  }

  .ie-field select:focus,
  .ie-field input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .ie-file-input {
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 32px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #fafafa;
  }

  .ie-file-input:hover {
    border-color: #3b82f6;
    background: #f0f7ff;
  }

  .ie-file-input.has-file {
    border-color: #22c55e;
    background: #f0fdf4;
  }

  .ie-file-input input {
    display: none;
  }

  .ie-file-icon {
    color: #94a3b8;
    margin-bottom: 8px;
  }

  .ie-file-text {
    font-size: 14px;
    color: #64748b;
  }

  .ie-file-name {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    margin-top: 4px;
  }

  /* Buttons */
  .ie-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: 8px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .ie-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ie-btn-primary {
    background: #3b82f6;
    color: white;
  }

  .ie-btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .ie-btn-success {
    background: #22c55e;
    color: white;
  }

  .ie-btn-success:hover:not(:disabled) {
    background: #16a34a;
  }

  .ie-btn-danger {
    background: #ef4444;
    color: white;
  }

  .ie-btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .ie-btn-outline {
    background: white;
    color: #475569;
    border: 1px solid #d1d5db;
  }

  .ie-btn-outline:hover:not(:disabled) {
    background: #f8fafc;
    border-color: #94a3b8;
  }

  .ie-btn-group {
    display: flex;
    gap: 8px;
    margin-top: 16px;
  }

  /* Stats bar */
  .ie-stats {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .ie-stat {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
  }

  .ie-stat-total { background: #f0f4ff; color: #3b82f6; }
  .ie-stat-new { background: #f0fdf4; color: #16a34a; }
  .ie-stat-update { background: #fffbeb; color: #d97706; }
  .ie-stat-invalid { background: #fef2f2; color: #dc2626; }

  /* Preview table */
  .ie-table-wrap {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .ie-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .ie-table th {
    background: #f8fafc;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  .ie-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
  }

  .ie-table tr:hover {
    background: #f8fafc;
  }

  .ie-table tr.row-new td { background: #f0fdf4; }
  .ie-table tr.row-update td { background: #fffbeb; }
  .ie-table tr.row-invalid td { background: #fef2f2; }

  /* Status badges */
  .ie-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .ie-badge-new { background: #dcfce7; color: #16a34a; }
  .ie-badge-update { background: #fef3c7; color: #d97706; }
  .ie-badge-invalid { background: #fee2e2; color: #dc2626; }
  .ie-badge-pending { background: #fef3c7; color: #d97706; }
  .ie-badge-approved { background: #dcfce7; color: #16a34a; }
  .ie-badge-rejected { background: #fee2e2; color: #dc2626; }

  /* Day flags grid */
  .ie-dayflags {
    display: flex;
    gap: 1px;
  }

  .ie-dayflag {
    width: 14px;
    height: 14px;
    border-radius: 2px;
    font-size: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ie-dayflag.on { background: #3b82f6; color: white; }
  .ie-dayflag.off { background: #f1f5f9; color: #94a3b8; }

  /* Changes list */
  .ie-changes {
    font-size: 12px;
    color: #d97706;
    margin-top: 4px;
  }

  .ie-changes li {
    margin-left: 16px;
  }

  /* Expandable row */
  .ie-expand-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    color: #64748b;
  }

  /* Alert / message */
  .ie-alert {
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ie-alert-info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .ie-alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
  .ie-alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .ie-alert-warning { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }

  /* Loading */
  .ie-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #64748b;
    gap: 8px;
  }

  .ie-loading svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Reject dialog */
  .ie-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .ie-dialog {
    background: white;
    border-radius: 16px;
    padding: 24px;
    width: 400px;
    max-width: 90vw;
  }

  .ie-dialog h3 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 12px;
    color: #0f172a;
  }

  .ie-dialog textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    resize: vertical;
    min-height: 80px;
    margin-bottom: 16px;
    font-family: inherit;
  }

  /* History filter row */
  .ie-filter-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    align-items: center;
  }

  .ie-filter-select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 13px;
    background: white;
  }

  /* Empty state */
  .ie-empty {
    text-align: center;
    padding: 40px 20px;
    color: #94a3b8;
  }

  .ie-empty svg {
    margin-bottom: 12px;
    opacity: 0.5;
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .ie-page {
    background: #0b1220;
  }

  body.dark-mode .ie-header h1 {
    color: #f1f5f9;
  }

  body.dark-mode .ie-header p {
    color: #94a3b8;
  }

  body.dark-mode .ie-tabs {
    background: #0f172a;
  }

  body.dark-mode .ie-tab {
    color: #94a3b8;
  }

  body.dark-mode .ie-tab:hover {
    color: #f1f5f9;
    background: #1e293b;
  }

  body.dark-mode .ie-tab.active {
    background: #1e293b;
    color: #f1f5f9;
    box-shadow: none;
  }

  body.dark-mode .ie-card {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .ie-card-title,
  body.dark-mode .ie-dialog h3 {
    color: #f1f5f9;
  }

  body.dark-mode .ie-card input,
  body.dark-mode .ie-card select,
  body.dark-mode .ie-card textarea,
  body.dark-mode .ie-filter-select,
  body.dark-mode .ie-dialog textarea {
    background: #0b1220;
    border-color: #1e293b;
    color: #e2e8f0;
  }

  body.dark-mode .ie-dialog {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .ie-table-wrap {
    border-color: #1e293b;
  }

  body.dark-mode .ie-table th {
    background: #0b1220;
    color: #e2e8f0;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .ie-table td {
    color: #e2e8f0;
    border-bottom-color: #1e293b;
  }

  body.dark-mode .ie-table tr:hover {
    background: #1e293b;
  }

  body.dark-mode .ie-table tr.row-new td { background: rgba(34, 197, 94, 0.14); }
  body.dark-mode .ie-table tr.row-update td { background: rgba(245, 158, 11, 0.14); }
  body.dark-mode .ie-table tr.row-invalid td { background: rgba(239, 68, 68, 0.14); }

  body.dark-mode .ie-badge {
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  body.dark-mode .ie-badge-new { background: rgba(34, 197, 94, 0.16); color: #86efac; }
  body.dark-mode .ie-badge-update { background: rgba(245, 158, 11, 0.16); color: #fcd34d; }
  body.dark-mode .ie-badge-invalid { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }
  body.dark-mode .ie-badge-pending { background: rgba(245, 158, 11, 0.16); color: #fcd34d; }
  body.dark-mode .ie-badge-approved { background: rgba(34, 197, 94, 0.16); color: #86efac; }
  body.dark-mode .ie-badge-rejected { background: rgba(239, 68, 68, 0.16); color: #fca5a5; }

  body.dark-mode .ie-btn-outline {
    background: #0b1220;
    color: #e2e8f0;
    border-color: #1e293b;
  }

  body.dark-mode .ie-btn-outline:hover:not(:disabled) {
    background: #1e293b;
    border-color: #334155;
  }

  @media (max-width: 768px) {
    .ie-content {
      padding: 104px 16px 96px;
    }
    .ie-form-row {
      grid-template-columns: 1fr;
    }
    .ie-stats {
      flex-direction: column;
    }
  }

  @media (max-width: 480px) {
    .ie-content {
      padding: 104px 16px 96px;
    }
    .ie-header h1 {
      font-size: 22px;
    }
    .ie-tabs {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .ie-tab {
      padding: 10px 14px;
      font-size: 13px;
      white-space: nowrap;
    }
    .ie-card {
      padding: 16px;
    }
    .ie-field select,
    .ie-field input {
      min-height: 44px;
    }
    .ie-btn {
      width: 100%;
      justify-content: center;
      min-height: 44px;
    }
    .ie-btn-group {
      flex-direction: column;
    }
    .ie-file-input {
      padding: 20px;
    }
    .ie-dialog {
      width: calc(100vw - 32px);
    }
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const PendingApprovalsPage = () => {
  const [activeTab, setActiveTab] = useState('import');

  return (
    <>
      <Navbar />
      <div className="ie-page">
        <style>{styles}</style>
        <Sidebar />
        <main className="ie-content">
          <PageGuide pageKey="import-export" />
          <div className="ie-header">
            <h1>Import / Export</h1>
            <p>Upload CPT Excel files, export workbooks, and manage import history</p>
          </div>

          <div className="ie-tabs">
            <button
              className={`ie-tab ${activeTab === 'import' ? 'active' : ''}`}
              onClick={() => setActiveTab('import')}
            >
              <Upload size={16} /> Import
            </button>
            <button
              className={`ie-tab ${activeTab === 'export' ? 'active' : ''}`}
              onClick={() => setActiveTab('export')}
            >
              <Download size={16} /> Export
            </button>
            <button
              className={`ie-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              <History size={16} /> History
            </button>
          </div>

          {activeTab === 'import' && <ImportTab />}
          {activeTab === 'export' && <ExportTab />}
          {activeTab === 'history' && <HistoryTab />}
        </main>
      </div>
    </>
  );
};

/* =============================================================================
   HELPER FUNCTIONS
   ============================================================================= */

/**
 * Calculate the date range for a given cycle number
 * Each cycle = 4 weeks (Mon-Fri only), 20 work days total
 * @param {number|string} cycleNum - The cycle number (0, 1, 2, etc.)
 * @returns {string} Formatted date range (e.g., "Jan 5 - 30" for Cycle 0)
 */
const getCycleDateRange = (cycleNum) => {
  const num = parseInt(cycleNum, 10) - 1;
  if (isNaN(num) || num < 0) return '';

  const anchor = new Date(2026, 0, 5); // January 5, 2026 (Monday)

  // Each cycle starts 4 weeks apart (28 calendar days, Monday to Monday)
  const startDate = new Date(anchor);
  startDate.setDate(startDate.getDate() + (num * 28));

  // End date is the Friday of the 4th week (25 days after Monday start)
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 25);

  const formatDate = (date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  };

  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

/* =============================================================================
   IMPORT TAB
   ============================================================================= */

const ImportTab = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedBDM, setSelectedBDM] = useState('');
  const [cycleNumber, setCycleNumber] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Preview state
  const [batch, setBatch] = useState(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Load employees and regions
  useEffect(() => {
    const load = async () => {
      try {
        const empRes = await userService.getEmployees();
        setEmployees(empRes.data || []);
      } catch {
        // Silently handle
      }

      // Default cycle number
      const anchor = new Date(2026, 0, 5);
      const diffMs = new Date().getTime() - anchor.getTime();
      const diffDays = Math.floor(diffMs / 86400000);
      setCycleNumber(String(Math.floor(diffDays / 28)));
    };
    load();
  }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError('');
    }
  };

  const handleUpload = async () => {
    setError('');
    setSuccess('');

    if (!file) return setError('Please select an Excel file');
    if (!selectedBDM) return setError('Please select a BDM');
    if (!cycleNumber) return setError('Please enter a cycle number');

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assignedToBDM', selectedBDM);
      formData.append('cycleNumber', parseInt(cycleNumber, 10) - 1);

      const result = await importService.upload(formData);
      setSuccess(result.message);

      // Load the full batch for preview
      if (result.data?.batchId) {
        setLoadingBatch(true);
        const batchResult = await importService.getById(result.data.batchId);
        setBatch(batchResult.data);
        setLoadingBatch(false);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async () => {
    if (!batch) return;
    setApproving(true);
    setError('');
    try {
      const result = await importService.approve(batch._id);
      setSuccess(result.message);
      setBatch(null);
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!batch) return;
    try {
      await importService.reject(batch._id, rejectReason);
      setSuccess('Batch rejected.');
      setBatch(null);
      setFile(null);
      setShowRejectDialog(false);
      setRejectReason('');
    } catch (err) {
      setError(err.response?.data?.message || 'Rejection failed');
    }
  };

  const toggleExpand = (idx) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const resetForm = () => {
    setBatch(null);
    setFile(null);
    setSuccess('');
    setError('');
  };

  return (
    <>
      {error && (
        <div className="ie-alert ie-alert-error">
          <AlertTriangle size={16} /> {error}
          <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="ie-alert ie-alert-success">
          <CheckCircle size={16} /> {success}
        </div>
      )}
      {!batch ? (
        <div className="ie-card">
          <h2 className="ie-card-title"><Upload size={18} /> Upload CPT Excel</h2>

          <div className="ie-form-row">
            <div className="ie-field">
              <label>BDM</label>
              <SelectField value={selectedBDM} onChange={(e) => setSelectedBDM(e.target.value)}>
                <option value="">Select BDM...</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>{emp.name || `${emp.firstName} ${emp.lastName}`}</option>
                ))}
              </SelectField>
            </div>
          </div>

          <div className="ie-form-row">
            <div className="ie-field">
              <label>Cycle Number</label>
              <input
                type="number"
                min="1"
                value={cycleNumber}
                onChange={(e) => setCycleNumber(e.target.value)}
                placeholder="e.g., 2"
              />
            </div>
            <div className="ie-field">
              <label>&nbsp;</label>
              <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 10 }}>
                {cycleNumber !== '' && getCycleDateRange(cycleNumber) ? (
                  <>Cycle {cycleNumber} = {getCycleDateRange(cycleNumber)}. Each cycle = 4 weeks (20 work days, Mon-Fri only).</>
                ) : (
                  <>Enter a cycle number (e.g., Cycle 1 = Jan 5 - Feb 1). Each cycle = 4 weeks (20 work days, Mon-Fri only).</>
                )}
              </div>
            </div>
          </div>

          <div
            className={`ie-file-input ${file ? 'has-file' : ''}`}
            onClick={() => document.getElementById('cpt-file-input').click()}
          >
            <input
              id="cpt-file-input"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
            />
            <FileSpreadsheet size={32} className="ie-file-icon" />
            {file ? (
              <>
                <div className="ie-file-name">{file.name}</div>
                <div className="ie-file-text">{(file.size / 1024).toFixed(1)} KB</div>
              </>
            ) : (
              <div className="ie-file-text">Click to select CPT Excel file (.xlsx)</div>
            )}
          </div>

          <div className="ie-btn-group">
            <button
              className="ie-btn ie-btn-primary"
              onClick={handleUpload}
              disabled={uploading || !file || !selectedBDM}
            >
              {uploading ? <><RefreshCw size={14} /> Parsing...</> : <><Upload size={14} /> Upload & Parse</>}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Preview */}
          {loadingBatch ? (
            <div className="ie-loading"><RefreshCw size={16} /> Loading preview...</div>
          ) : (
            <PreviewSection
              batch={batch}
              expandedRows={expandedRows}
              toggleExpand={toggleExpand}
              onApprove={handleApprove}
              onReject={() => setShowRejectDialog(true)}
              onReset={resetForm}
              approving={approving}
            />
          )}
        </>
      )}
      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="ie-dialog-overlay" onClick={() => setShowRejectDialog(false)}>
          <div className="ie-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Reject Import Batch</h3>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 12 }}>
              Provide a reason for rejecting this batch. No data will be written.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
            />
            <div className="ie-btn-group">
              <button className="ie-btn ie-btn-danger" onClick={handleReject}>
                <XCircle size={14} /> Reject
              </button>
              <button className="ie-btn ie-btn-outline" onClick={() => setShowRejectDialog(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/* =============================================================================
   PREVIEW SECTION
   ============================================================================= */

const PreviewSection = ({ batch, expandedRows, toggleExpand, onApprove, onReject, onReset, approving }) => {
  const doctors = batch?.parsedDoctors || [];
  const [confirmApprove, setConfirmApprove] = useState(false);

  return (
    <>
      <div className="ie-card">
        <h2 className="ie-card-title"><Eye size={18} /> Parsed Preview — {batch.fileName}</h2>

        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
          BDM: <strong>{batch.assignedToBDM?.name || batch.assignedToBDM?.email}</strong>
          {' | '}Cycle: <strong>{(batch.cycleNumber ?? 0) + 1}</strong>
        </div>

        <div className="ie-stats">
          <div className="ie-stat ie-stat-total">
            <FileSpreadsheet size={14} /> Total: {batch.doctorCount}
          </div>
          <div className="ie-stat ie-stat-new">
            <CheckCircle size={14} /> New: {batch.newCount}
          </div>
          <div className="ie-stat ie-stat-update">
            <AlertTriangle size={14} /> Update: {batch.updateCount}
          </div>
          {batch.invalidCount > 0 && (
            <div className="ie-stat ie-stat-invalid">
              <XCircle size={14} /> Invalid: {batch.invalidCount}
            </div>
          )}
        </div>

        <div className="ie-table-wrap">
          <table className="ie-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th style={{ width: 70 }}>Status</th>
                <th>Last Name</th>
                <th>First Name</th>
                <th>Specialty</th>
                <th style={{ width: 50 }}>Freq</th>
                <th style={{ width: 300 }}>Day Flags</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((doc, idx) => {
                const rowClass = doc.validationStatus === 'INVALID'
                  ? 'row-invalid'
                  : doc.isExisting
                    ? 'row-update'
                    : 'row-new';

                return (
                  <tr key={doc.rowNumber} className={rowClass}>
                    <td>{doc.rowNumber}</td>
                    <td>
                      {doc.validationStatus === 'INVALID' ? (
                        <span className="ie-badge ie-badge-invalid">INVALID</span>
                      ) : doc.isExisting ? (
                        <span className="ie-badge ie-badge-update">UPDATE</span>
                      ) : (
                        <span className="ie-badge ie-badge-new">NEW</span>
                      )}
                    </td>
                    <td>{doc.lastName}</td>
                    <td>{doc.firstName}</td>
                    <td>{doc.specialization}</td>
                    <td>{doc.visitFrequency}x</td>
                    <td>
                      <div className="ie-dayflags">
                        {(doc.dayFlags || []).map((flag, di) => (
                          <div key={di} className={`ie-dayflag ${flag ? 'on' : 'off'}`}>
                            {flag ? '1' : ''}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      {doc.isExisting && doc.changes?.length > 0 ? (
                        <>
                          <button className="ie-expand-btn" onClick={() => toggleExpand(idx)}>
                            {expandedRows.has(idx) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {doc.changes.length} change{doc.changes.length > 1 ? 's' : ''}
                          </button>
                          {expandedRows.has(idx) && (
                            <ul className="ie-changes">
                              {doc.changes.map((c, ci) => <li key={ci}>{c}</li>)}
                            </ul>
                          )}
                        </>
                      ) : doc.isExisting ? (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>No field changes</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ie-btn-group">
          {!confirmApprove ? (
            <button className="ie-btn ie-btn-success" onClick={() => setConfirmApprove(true)}>
              <CheckCircle size={14} /> Approve & Import
            </button>
          ) : (
            <button className="ie-btn ie-btn-success" onClick={onApprove} disabled={approving}>
              {approving
                ? <><RefreshCw size={14} /> Writing to database...</>
                : <><CheckCircle size={14} /> Confirm — Write {batch.doctorCount} VIP Clients + Schedules</>}
            </button>
          )}
          <button className="ie-btn ie-btn-danger" onClick={onReject}>
            <XCircle size={14} /> Reject
          </button>
          <button className="ie-btn ie-btn-outline" onClick={onReset}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
};

/* =============================================================================
   EXPORT TAB
   ============================================================================= */

const ExportTab = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedBDM, setSelectedBDM] = useState('');
  const [cycleNumber, setCycleNumber] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewStats, setPreviewStats] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const empRes = await userService.getEmployees();
        setEmployees(empRes.data || []);
      } catch {
        // Silently handle
      }

      const anchor = new Date(2026, 0, 5);
      const diffMs = new Date().getTime() - anchor.getTime();
      const diffDays = Math.floor(diffMs / 86400000);
      setCycleNumber(String(Math.floor(diffDays / 28)));
    };
    load();
  }, []);

  const handlePreview = async () => {
    if (!selectedBDM || !cycleNumber) return;
    setError('');
    try {
      const gridRes = await scheduleService.getCPTGrid(parseInt(cycleNumber, 10) - 1, selectedBDM);
      const gridData = gridRes.data || gridRes;
      const doctorCount = gridData.doctors?.length || 0;
      const scheduledCount = gridData.doctors?.reduce(
        (sum, d) => sum + (d.grid?.filter((c) => c.status !== null).length || 0), 0
      ) || 0;
      setPreviewStats({ doctorCount, scheduledCount });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load preview');
    }
  };

  const handleExport = async () => {
    if (!selectedBDM || !cycleNumber) return;
    setExporting(true);
    setError('');
    try {
      const cycle = parseInt(cycleNumber, 10) - 1;

      // Fetch data in parallel
      const [gridRes, doctorRes] = await Promise.all([
        scheduleService.getCPTGrid(cycle, selectedBDM),
        doctorService.getAll({ assignedTo: selectedBDM, limit: 300 }),
      ]);

      const gridData = gridRes.data || gridRes;
      const doctors = doctorRes.data || [];
      const bdm = employees.find((e) => e._id === selectedBDM);

      // Calculate month/year from cycle start
      const anchor = new Date(2026, 0, 5);
      const cycleStart = new Date(anchor);
      cycleStart.setDate(cycleStart.getDate() + cycle * 28);
      const monthYear = `${String(cycleStart.getMonth() + 1).padStart(2, '0')}/${cycleStart.getFullYear()}`;

      exportCPTWorkbook({
        doctors,
        cptGridData: gridData,
        config: {
          bdmName: bdm?.name || 'BDM',
          territory: '',
          monthYear,
          cycleNumber: cycle,
        },
      });

      setSuccess('CPT workbook downloaded successfully.');
    } catch (err) {
      setError(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {error && (
        <div className="ie-alert ie-alert-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}
      {success && (
        <div className="ie-alert ie-alert-success">
          <CheckCircle size={16} /> {success}
        </div>
      )}
      <div className="ie-card">
        <h2 className="ie-card-title"><Download size={18} /> Export CPT Workbook</h2>

        <div className="ie-form-row">
          <div className="ie-field">
            <label>BDM</label>
            <SelectField value={selectedBDM} onChange={(e) => { setSelectedBDM(e.target.value); setPreviewStats(null); }}>
              <option value="">Select BDM...</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name || `${emp.firstName} ${emp.lastName}`}</option>
              ))}
            </SelectField>
          </div>
          <div className="ie-field">
            <label>Cycle Number</label>
            <input
              type="number"
              min="1"
              value={cycleNumber}
              onChange={(e) => { setCycleNumber(e.target.value); setPreviewStats(null); }}
              placeholder="e.g., 2"
            />
          </div>
        </div>

        <div className="ie-form-row">
          <div className="ie-field">
            <label>&nbsp;</label>
            <div style={{ fontSize: 12, color: '#94a3b8', paddingTop: 10 }}>
              {cycleNumber !== '' && getCycleDateRange(cycleNumber) ? (
                <>Cycle {cycleNumber} = {getCycleDateRange(cycleNumber)}. Each cycle = 4 weeks (20 work days, Mon-Fri only).</>
              ) : (
                <>Enter a cycle number (e.g., Cycle 1 = Jan 5 - Feb 1). Each cycle = 4 weeks (20 work days, Mon-Fri only).</>
              )}
            </div>
          </div>
        </div>

        {previewStats && (
          <div className="ie-stats">
            <div className="ie-stat ie-stat-total">
              <Users size={14} /> {previewStats.doctorCount} VIP Clients
            </div>
            <div className="ie-stat ie-stat-new">
              <FileSpreadsheet size={14} /> {previewStats.scheduledCount} schedule entries
            </div>
          </div>
        )}

        <div className="ie-btn-group">
          <button
            className="ie-btn ie-btn-outline"
            onClick={handlePreview}
            disabled={!selectedBDM || !cycleNumber}
          >
            <Eye size={14} /> Preview Stats
          </button>
          <button
            className="ie-btn ie-btn-primary"
            onClick={handleExport}
            disabled={exporting || !selectedBDM || !cycleNumber}
          >
            {exporting ? <><RefreshCw size={14} /> Generating...</> : <><Download size={14} /> Download CPT Workbook</>}
          </button>
        </div>
      </div>
    </>
  );
};

/* =============================================================================
   HISTORY TAB
   ============================================================================= */

const HistoryTab = () => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const result = await importService.list(params);
      setBatches(result.data || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleViewDetail = async (batch) => {
    try {
      const result = await importService.getById(batch._id);
      setSelectedBatch(result.data);
      setShowDetail(true);
    } catch {
      // Silently handle
    }
  };

  const handleDelete = async (batchId) => {
    if (!confirm('Delete this import batch?')) return;
    try {
      await importService.deleteBatch(batchId);
      loadBatches();
    } catch {
      // Silently handle
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <div className="ie-card">
        <h2 className="ie-card-title"><History size={18} /> Import History</h2>

        <div className="ie-filter-row">
          <SelectField
            className="ie-filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </SelectField>
          <button className="ie-btn ie-btn-outline" onClick={loadBatches} style={{ padding: '8px 12px' }}>
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="ie-loading"><RefreshCw size={16} /> Loading...</div>
        ) : batches.length === 0 ? (
          <div className="ie-empty">
            <FileSpreadsheet size={40} />
            <p>No import batches found</p>
          </div>
        ) : (
          <div className="ie-table-wrap">
            <table className="ie-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>File</th>
                  <th>BDM</th>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Doctors</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch._id}>
                    <td>{formatDate(batch.createdAt)}</td>
                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {batch.fileName}
                    </td>
                    <td>{batch.assignedToBDM?.name || batch.assignedToBDM?.email || '—'}</td>
                    <td>{(batch.cycleNumber ?? 0) + 1}</td>
                    <td>
                      <span className={`ie-badge ie-badge-${batch.status}`}>
                        {batch.status === 'pending' && <Clock size={10} />}
                        {batch.status === 'approved' && <CheckCircle size={10} />}
                        {batch.status === 'rejected' && <XCircle size={10} />}
                        {batch.status}
                      </span>
                    </td>
                    <td>
                      {batch.doctorCount}
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
                        ({batch.newCount}N/{batch.updateCount}U)
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="ie-btn ie-btn-outline"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => handleViewDetail(batch)}
                        >
                          <Eye size={12} />
                        </button>
                        {batch.status === 'pending' && (
                          <button
                            className="ie-btn ie-btn-outline"
                            style={{ padding: '6px 10px', fontSize: 12, color: '#ef4444' }}
                            onClick={() => handleDelete(batch._id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showDetail && selectedBatch && (
        <BatchDetailModal
          batch={selectedBatch}
          onClose={() => { setShowDetail(false); setSelectedBatch(null); }}
          onApproved={() => { setShowDetail(false); setSelectedBatch(null); loadBatches(); }}
        />
      )}
    </>
  );
};

export default PendingApprovalsPage;
