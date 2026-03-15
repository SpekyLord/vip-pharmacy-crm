/**
 * BatchDetailModal (formerly VisitApproval)
 *
 * Modal for viewing a full import batch detail.
 * Shows batch metadata, parsed doctor table, and action buttons.
 *
 * Props:
 *   batch     - Full batch object with parsedDoctors
 *   onClose   - Close modal callback
 *   onApproved - Callback after successful approval (refreshes parent)
 */

import { useState } from 'react';
import {
  X,
  CheckCircle,
  XCircle,
  Clock,
  FileSpreadsheet,
  Users,
  Calendar,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import * as importService from '../../services/importService';

/* =============================================================================
   STYLES
   ============================================================================= */

const modalStyles = `
  .bdm-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 20px;
  }

  .bdm-modal {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 1100px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  }

  .bdm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #e2e8f0;
  }

  .bdm-header h2 {
    font-size: 18px;
    font-weight: 600;
    color: #0f172a;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bdm-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    padding: 4px;
    border-radius: 8px;
    transition: all 0.2s;
  }

  .bdm-close:hover {
    background: #f1f5f9;
    color: #334155;
  }

  .bdm-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .bdm-meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .bdm-meta-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #64748b;
    padding: 10px 12px;
    background: #f8fafc;
    border-radius: 8px;
  }

  .bdm-meta-item strong {
    color: #0f172a;
  }

  .bdm-stats {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .bdm-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }

  .bdm-stat-total { background: #f0f4ff; color: #3b82f6; }
  .bdm-stat-new { background: #f0fdf4; color: #16a34a; }
  .bdm-stat-update { background: #fffbeb; color: #d97706; }
  .bdm-stat-invalid { background: #fef2f2; color: #dc2626; }

  .bdm-table-wrap {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .bdm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .bdm-table th {
    background: #f8fafc;
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  .bdm-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
  }

  .bdm-table tr:hover td {
    background: #f8fafc;
  }

  .bdm-table tr.row-new td { background: #f0fdf4; }
  .bdm-table tr.row-update td { background: #fffbeb; }
  .bdm-table tr.row-invalid td { background: #fef2f2; }

  .bdm-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
  }

  .bdm-badge-new { background: #dcfce7; color: #16a34a; }
  .bdm-badge-update { background: #fef3c7; color: #d97706; }
  .bdm-badge-invalid { background: #fee2e2; color: #dc2626; }
  .bdm-badge-pending { background: #fef3c7; color: #d97706; }
  .bdm-badge-approved { background: #dcfce7; color: #16a34a; }
  .bdm-badge-rejected { background: #fee2e2; color: #dc2626; }

  .bdm-reject-reason {
    padding: 12px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #dc2626;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .bdm-dayflags {
    display: flex;
    gap: 1px;
  }

  .bdm-dayflag {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    font-size: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bdm-dayflag.on { background: #3b82f6; color: white; }
  .bdm-dayflag.off { background: #f1f5f9; }

  .bdm-changes {
    font-size: 11px;
    color: #d97706;
    margin-top: 2px;
    list-style: disc;
    padding-left: 16px;
  }

  .bdm-expand-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    color: #64748b;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .bdm-footer {
    padding: 16px 24px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .bdm-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .bdm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bdm-btn-success { background: #22c55e; color: white; }
  .bdm-btn-success:hover:not(:disabled) { background: #16a34a; }
  .bdm-btn-danger { background: #ef4444; color: white; }
  .bdm-btn-danger:hover:not(:disabled) { background: #dc2626; }
  .bdm-btn-outline { background: white; color: #475569; border: 1px solid #d1d5db; }
  .bdm-btn-outline:hover { background: #f8fafc; }

  .bdm-alert {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bdm-alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .bdm-alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

  .bdm-reject-dialog {
    margin-top: 16px;
    padding: 16px;
    background: #fef2f2;
    border-radius: 8px;
    border: 1px solid #fecaca;
  }

  .bdm-reject-dialog textarea {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 13px;
    resize: vertical;
    min-height: 60px;
    margin: 8px 0;
    font-family: inherit;
  }
`;

/* =============================================================================
   COMPONENT
   ============================================================================= */

const BatchDetailModal = ({ batch, onClose, onApproved }) => {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!batch) return null;

  const doctors = batch.parsedDoctors || [];
  const isPending = batch.status === 'pending';

  const toggleExpand = (idx) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleApprove = async () => {
    setApproving(true);
    setError('');
    try {
      const result = await importService.approve(batch._id);
      setSuccessMsg(result.message);
      setTimeout(() => onApproved?.(), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setError('');
    try {
      await importService.reject(batch._id, rejectReason);
      setSuccessMsg('Batch rejected.');
      setTimeout(() => onApproved?.(), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Rejection failed');
    } finally {
      setRejecting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bdm-overlay" onClick={onClose}>
      <style>{modalStyles}</style>
      <div className="bdm-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bdm-header">
          <h2>
            <FileSpreadsheet size={20} />
            Import Batch Detail
            <span className={`bdm-badge bdm-badge-${batch.status}`}>
              {batch.status === 'pending' && <Clock size={10} />}
              {batch.status === 'approved' && <CheckCircle size={10} />}
              {batch.status === 'rejected' && <XCircle size={10} />}
              {batch.status}
            </span>
          </h2>
          <button className="bdm-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="bdm-body">
          {error && (
            <div className="bdm-alert bdm-alert-error">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          {successMsg && (
            <div className="bdm-alert bdm-alert-success">
              <CheckCircle size={14} /> {successMsg}
            </div>
          )}

          {/* Metadata */}
          <div className="bdm-meta">
            <div className="bdm-meta-item">
              <Users size={14} />
              BDM: <strong>{batch.assignedToBDM?.name || batch.assignedToBDM?.email || '—'}</strong>
            </div>
            <div className="bdm-meta-item">
              <Calendar size={14} />
              Cycle: <strong>{(batch.cycleNumber ?? 0) + 1}</strong>
            </div>
            <div className="bdm-meta-item">
              <FileSpreadsheet size={14} />
              File: <strong>{batch.fileName}</strong>
            </div>
            <div className="bdm-meta-item">
              <Clock size={14} />
              Uploaded: <strong>{formatDate(batch.createdAt)}</strong>
            </div>
            {batch.approvedAt && (
              <div className="bdm-meta-item">
                <CheckCircle size={14} />
                Approved: <strong>{formatDate(batch.approvedAt)}</strong>
              </div>
            )}
          </div>

          {/* Rejection reason */}
          {batch.status === 'rejected' && batch.rejectionReason && (
            <div className="bdm-reject-reason">
              <strong>Rejection reason:</strong> {batch.rejectionReason}
            </div>
          )}

          {/* Stats */}
          <div className="bdm-stats">
            <div className="bdm-stat bdm-stat-total">
              Total: {batch.doctorCount}
            </div>
            <div className="bdm-stat bdm-stat-new">
              New: {batch.newCount}
            </div>
            <div className="bdm-stat bdm-stat-update">
              Update: {batch.updateCount}
            </div>
            {batch.invalidCount > 0 && (
              <div className="bdm-stat bdm-stat-invalid">
                Invalid: {batch.invalidCount}
              </div>
            )}
          </div>

          {/* Doctor table */}
          <div className="bdm-table-wrap">
            <table className="bdm-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Last Name</th>
                  <th>First Name</th>
                  <th>Specialty</th>
                  <th>Freq</th>
                  <th>Day Flags</th>
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
                    <tr key={idx} className={rowClass}>
                      <td>{doc.rowNumber}</td>
                      <td>
                        {doc.validationStatus === 'INVALID' ? (
                          <span className="bdm-badge bdm-badge-invalid">INVALID</span>
                        ) : doc.isExisting ? (
                          <span className="bdm-badge bdm-badge-update">UPDATE</span>
                        ) : (
                          <span className="bdm-badge bdm-badge-new">NEW</span>
                        )}
                      </td>
                      <td>{doc.lastName}</td>
                      <td>{doc.firstName}</td>
                      <td>{doc.specialization}</td>
                      <td>{doc.visitFrequency}x</td>
                      <td>
                        <div className="bdm-dayflags">
                          {(doc.dayFlags || []).map((flag, di) => (
                            <div key={di} className={`bdm-dayflag ${flag ? 'on' : 'off'}`}>
                              {flag ? '1' : ''}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td>
                        {doc.isExisting && doc.changes?.length > 0 ? (
                          <>
                            <button className="bdm-expand-btn" onClick={() => toggleExpand(idx)}>
                              {expandedRows.has(idx) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              {doc.changes.length} change{doc.changes.length > 1 ? 's' : ''}
                            </button>
                            {expandedRows.has(idx) && (
                              <ul className="bdm-changes">
                                {doc.changes.map((c, ci) => <li key={ci}>{c}</li>)}
                              </ul>
                            )}
                          </>
                        ) : doc.isExisting ? (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>No changes</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Reject form */}
          {showRejectForm && (
            <div className="bdm-reject-dialog">
              <strong>Reject this batch:</strong>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection..."
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bdm-btn bdm-btn-danger" onClick={handleReject} disabled={rejecting}>
                  {rejecting ? <><RefreshCw size={12} /> Rejecting...</> : 'Confirm Reject'}
                </button>
                <button className="bdm-btn bdm-btn-outline" onClick={() => setShowRejectForm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bdm-footer">
          {isPending && !successMsg && (
            <>
              <button className="bdm-btn bdm-btn-success" onClick={handleApprove} disabled={approving}>
                {approving ? <><RefreshCw size={14} /> Approving...</> : <><CheckCircle size={14} /> Approve</>}
              </button>
              <button
                className="bdm-btn bdm-btn-danger"
                onClick={() => setShowRejectForm(!showRejectForm)}
                disabled={rejecting}
              >
                <XCircle size={14} /> Reject
              </button>
            </>
          )}
          <button className="bdm-btn bdm-btn-outline" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchDetailModal;
