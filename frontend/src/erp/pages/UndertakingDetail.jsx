/**
 * UndertakingDetail — Phase 32R (read-only review + approval wrapper)
 *
 * The Undertaking is the admin-side approval wrapper over an already-captured
 * GRN. Capture happens on GrnEntry (product + qty + batch/lot + expiry +
 * waybill). This page just mirrors the captured data with a read-only line
 * table so the BDM can double-check before routing for approval.
 *
 * Actions by status:
 *   - DRAFT (BDM / privileged)      → "Validate & Submit" → DRAFT → SUBMITTED
 *     (backend gateApproval may return 202 → Approval Hub)
 *   - SUBMITTED (management role)   → Acknowledge (cascade-approves GRN) or
 *     Reject with reason (terminal REJECTED; GRN stays PENDING for reversal)
 *   - ACKNOWLEDGED + reverse grant  → President-Reverse (cascade storno to GRN)
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import WorkflowGuide from '../components/WorkflowGuide';
import UndertakingLineRow from '../components/UndertakingLineRow';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import {
  getUndertakingById,
  submitUndertaking,
  acknowledgeUndertaking,
  rejectUndertaking,
  presidentReverseUndertaking,
  getGrnSettings,
} from '../services/undertakingService';
import { showError, showSuccess, showApprovalPending, isApprovalPending } from '../utils/errorToast';

const STATUS_COLORS = {
  DRAFT:        { bg: '#e5e7eb', fg: '#374151' },
  SUBMITTED:    { bg: '#fef3c7', fg: '#92400e' },
  ACKNOWLEDGED: { bg: '#dcfce7', fg: '#166534' },
  REJECTED:     { bg: '#fee2e2', fg: '#991b1b' },
};

const SOURCE_LABELS = {
  PO: 'Purchase Order',
  INTERNAL_TRANSFER: 'Internal Transfer',
  STANDALONE: 'Standalone',
};

function isManagementRole(role) {
  return role === ROLES.ADMIN || role === ROLES.FINANCE || role === ROLES.PRESIDENT || role === ROLES.CEO;
}

function canSeePresidentReverse(user) {
  if (!user) return false;
  if (user.role === ROLES.PRESIDENT || user.role === ROLES.CEO) return true;
  const grants = user.erp_access?.sub_permissions?.inventory || {};
  return !!grants.reverse_undertaking;
}

export default function UndertakingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [settings, setSettings] = useState({ minExpiryDays: 30, varianceTolerancePct: 10 });

  const managementLike = isManagementRole(user?.role);
  const showPresidentReverse = canSeePresidentReverse(user);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getUndertakingById(id);
      const d = res?.data;
      if (!d) throw new Error('Undertaking not found');
      setDoc(d);
    } catch (err) {
      showError(err, 'Failed to load undertaking');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getGrnSettings().then(setSettings).catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDraft = doc?.status === 'DRAFT';
  const isSubmitted = doc?.status === 'SUBMITTED';
  const isAcknowledged = doc?.status === 'ACKNOWLEDGED';
  const isRejected = doc?.status === 'REJECTED';
  const linkedGrn = doc?.linked_grn_id && typeof doc.linked_grn_id === 'object' ? doc.linked_grn_id : null;
  const lines = useMemo(() => Array.isArray(doc?.line_items) ? doc.line_items : [], [doc]);

  const scanSummary = useMemo(() => {
    const total = lines.length;
    const scanned = lines.filter(l => l.scan_confirmed).length;
    return { total, scanned, manual: total - scanned };
  }, [lines]);

  const varianceSummary = useMemo(() => {
    return lines.reduce((n, l) => n + (l.variance_flag ? 1 : 0), 0);
  }, [lines]);

  // Only the BDM owner or a privileged user can submit a DRAFT for approval.
  const canSubmit = isDraft && (
    managementLike ||
    (doc?.bdm_id && user?._id && String(doc.bdm_id._id || doc.bdm_id) === String(user._id))
  );

  const handleSubmit = async () => {
    if (!doc || !isDraft) return;
    setSubmitting(true);
    try {
      const res = await submitUndertaking(id);
      if (isApprovalPending(res)) {
        showApprovalPending(res?.message || 'Approval required — sent to Approval Hub.');
        await load();
        return;
      }
      showSuccess('Undertaking submitted.');
      await load();
    } catch (err) {
      if (isApprovalPending(null, err)) {
        showApprovalPending(err?.response?.data?.message);
        await load();
      } else {
        showError(err, 'Failed to submit undertaking');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!doc || !isSubmitted) return;
    setDecisionBusy(true);
    try {
      const res = await acknowledgeUndertaking(id);
      if (res?.success) {
        showSuccess('Undertaking acknowledged — GRN auto-approved.');
        await load();
      }
    } catch (err) {
      showError(err, 'Acknowledge failed');
    } finally {
      setDecisionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!doc || !isSubmitted) return;
    if (!rejectReason.trim()) {
      showError(null, 'Rejection reason is required');
      return;
    }
    setDecisionBusy(true);
    try {
      const res = await rejectUndertaking(id, rejectReason.trim());
      if (res?.success) {
        showSuccess('Undertaking rejected. GRN stays pending — BDM can reverse and re-capture.');
        setRejectReason('');
        await load();
      }
    } catch (err) {
      showError(err, 'Reject failed');
    } finally {
      setDecisionBusy(false);
    }
  };

  const handlePresidentReverse = async () => {
    if (!doc) return;
    const reason = prompt('Reversal reason (required):');
    if (!reason || !reason.trim()) return;
    const confirmTxt = prompt('This will cascade-reverse the linked GRN and remove inventory entries. Type DELETE to confirm:');
    if (confirmTxt !== 'DELETE') return;
    setDecisionBusy(true);
    try {
      await presidentReverseUndertaking(id, { reason: reason.trim(), confirm: 'DELETE' });
      showSuccess('Undertaking reversed — GRN cascaded.');
      navigate('/erp/undertaking');
    } catch (err) {
      showError(err, 'President-reverse failed');
    } finally {
      setDecisionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page erp-page">
        <Navbar />
        <div className="admin-layout">
          <Sidebar />
          <main className="admin-main" style={{ padding: 24 }}>Loading…</main>
        </div>
      </div>
    );
  }

  if (!doc) return null;

  const st = STATUS_COLORS[doc.status] || { bg: '#e5e7eb', fg: '#374151' };
  const waybillUrl = doc.waybill_photo_url || linkedGrn?.waybill_photo_url || null;
  const undertakingPaperUrl = linkedGrn?.undertaking_photo_url || null;

  return (
    <div className="admin-page erp-page">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="admin-layout">
        <Sidebar />
        <main className="admin-main ut-detail-main">
          <WorkflowGuide pageKey="undertaking-entry" />

          <div className="ut-detail-head">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Link to="/erp/undertaking" style={{ fontSize: 13, color: '#2563eb' }}>← All Undertakings</Link>
                <h1 style={{ margin: 0, fontSize: 22 }}>{doc.undertaking_number}</h1>
                <span className="status-pill" style={{ background: st.bg, color: st.fg }}>{doc.status}</span>
              </div>
              <div className="ut-detail-sub">
                {linkedGrn ? (
                  <>
                    Linked GRN:{' '}
                    <Link to={`/erp/grn/${linkedGrn._id}/audit`} style={{ color: '#2563eb' }}>
                      {/* Phase 32R-GRN#: prefer grn_number, then PO#, then id-tail for legacy rows */}
                      {linkedGrn.grn_number || linkedGrn.po_number || linkedGrn._id?.slice(-6)}
                    </Link>
                    {linkedGrn.source_type && <> · {SOURCE_LABELS[linkedGrn.source_type] || linkedGrn.source_type}</>}
                    {linkedGrn.vendor_id?.vendor_name && <> · {linkedGrn.vendor_id.vendor_name}</>}
                  </>
                ) : 'No linked GRN'}
                <br />
                Receipt date: {doc.receipt_date ? new Date(doc.receipt_date).toLocaleDateString('en-PH') : '—'}
                {doc.warehouse_id?.warehouse_name && <> · Warehouse: {doc.warehouse_id.warehouse_name}</>}
                {doc.bdm_id?.name && <> · BDM: {doc.bdm_id.name}</>}
              </div>
            </div>
            <div className="ut-head-attachments">
              {waybillUrl && (
                <div className="ut-attach">
                  <div className="ut-attach-label">Waybill</div>
                  <a href={waybillUrl} target="_blank" rel="noreferrer">
                    <img src={waybillUrl} alt="Waybill" className="ut-waybill-thumb" />
                  </a>
                </div>
              )}
              {undertakingPaperUrl && (
                <div className="ut-attach">
                  <div className="ut-attach-label">Undertaking Paper</div>
                  <a href={undertakingPaperUrl} target="_blank" rel="noreferrer">
                    <img src={undertakingPaperUrl} alt="Undertaking paper" className="ut-waybill-thumb" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {doc.reopen_count > 0 && doc.rejection_reason && (
            <div className="ut-reopen-banner">
              <strong>Reopened ({doc.reopen_count}×)</strong> — {doc.rejection_reason}
            </div>
          )}
          {isAcknowledged && (
            <div className="ut-acknowledged-banner">
              Acknowledged {doc.acknowledged_at ? `on ${new Date(doc.acknowledged_at).toLocaleString()}` : ''}
              {doc.acknowledged_by?.name ? ` by ${doc.acknowledged_by.name}` : ''}. GRN auto-approved.
            </div>
          )}
          {isRejected && (
            <div className="ut-reopen-banner">
              <strong>Rejected</strong> — {doc.rejection_reason || 'No reason provided.'} The linked GRN stays PENDING. BDM must reverse the GRN and re-capture to retry.
            </div>
          )}

          <div className="ut-scan-summary">
            <span className="ut-chip">{lines.length} line(s)</span>
            <span
              className="ut-chip"
              style={{ color: scanSummary.scanned === scanSummary.total && scanSummary.total > 0 ? '#166534' : '#92400e' }}
            >
              {scanSummary.scanned}/{scanSummary.total} OCR-confirmed
            </span>
            {scanSummary.manual > 0 && <span className="ut-chip">{scanSummary.manual} manual</span>}
            {varianceSummary > 0 && <span className="ut-chip" style={{ color: '#991b1b' }}>{varianceSummary} variance flag(s)</span>}
            <span className="ut-chip" style={{ color: '#475569' }}>Min expiry floor: {settings.minExpiryDays}d</span>
          </div>

          <div className="ut-table-wrap">
            <table className="ut-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Product</th>
                  <th style={{ width: '10%' }}>Expected</th>
                  <th style={{ width: '12%' }}>Received</th>
                  <th style={{ width: '20%' }}>Batch/Lot #</th>
                  <th style={{ width: '16%' }}>Expiry</th>
                  <th style={{ width: '8%' }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <UndertakingLineRow key={i} line={line} index={i} />
                ))}
              </tbody>
            </table>
          </div>

          {doc.notes && (
            <div className="ut-notes"><strong>Notes:</strong> {doc.notes}</div>
          )}

          <div className="ut-actions">
            {isDraft && canSubmit && (
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting}
                title="Validate and send to approver"
              >
                {submitting ? 'Submitting…' : 'Validate & Submit'}
              </button>
            )}
            {isSubmitted && managementLike && (
              <div className="ut-approver">
                <button className="btn btn-success" onClick={handleAcknowledge} disabled={decisionBusy}>
                  {decisionBusy ? '…' : 'Acknowledge & Approve GRN'}
                </button>
                <div className="ut-reject-row">
                  <input
                    type="text"
                    placeholder="Rejection reason…"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-danger" onClick={handleReject} disabled={decisionBusy || !rejectReason.trim()}>
                    Reject
                  </button>
                </div>
              </div>
            )}
            {isAcknowledged && showPresidentReverse && (
              <button className="btn btn-danger" onClick={handlePresidentReverse} disabled={decisionBusy}>
                President-Reverse (cascade)
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

const pageStyles = `
  .ut-detail-main { flex: 1; min-width: 0; overflow-y: auto; padding: 24px; max-width: 1280px; margin: 0 auto; }
  .ut-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
  .ut-detail-sub { font-size: 12px; color: #475569; margin-top: 6px; line-height: 1.5; }
  .ut-head-attachments { display: flex; gap: 12px; flex-wrap: wrap; }
  .ut-attach { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .ut-attach-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .ut-waybill-thumb { max-width: 140px; max-height: 100px; border-radius: 8px; border: 1px solid #dbe4f0; cursor: zoom-in; }

  .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }

  .ut-reopen-banner { padding: 10px 14px; border-radius: 10px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; font-size: 13px; margin-bottom: 12px; }
  .ut-acknowledged-banner { padding: 10px 14px; border-radius: 10px; background: #dcfce7; color: #166534; border: 1px solid #86efac; font-size: 13px; margin-bottom: 12px; }

  .ut-scan-summary { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .ut-chip { padding: 4px 10px; background: #f1f5f9; border: 1px solid #dbe4f0; border-radius: 999px; font-size: 12px; font-weight: 600; color: #334155; }

  .ut-table-wrap { background: #fff; border: 1px solid #dbe4f0; border-radius: 12px; overflow: hidden; margin-bottom: 12px; }
  .ut-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ut-table th { background: #f8fafc; padding: 10px 12px; text-align: left; font-weight: 600; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .ut-table td { padding: 10px 12px; border-top: 1px solid #eef2f7; vertical-align: top; }

  .ut-notes { padding: 10px 12px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #334155; margin-bottom: 12px; }

  .ut-actions { display: flex; gap: 10px; justify-content: flex-end; align-items: flex-start; flex-wrap: wrap; margin-top: 8px; }
  .ut-approver { display: flex; flex-direction: column; gap: 8px; min-width: 300px; }
  .ut-reject-row { display: flex; gap: 6px; }

  .btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; transition: all 0.15s; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #2563eb; color: #fff; }
  .btn-success { background: #16a34a; color: #fff; }
  .btn-danger { background: #dc2626; color: #fff; }
  .btn-outline { background: #fff; border: 1px solid #cbd5f5; color: #334155; }

  @media (max-width: 640px) {
    .ut-detail-main { padding: 76px 12px 96px; }
    .ut-table th:nth-child(2), .ut-table td:nth-child(2) { display: none; }
    .ut-actions { justify-content: stretch; }
    .ut-actions .btn { flex: 1; }
    .ut-approver { min-width: 0; width: 100%; }
  }
`;
