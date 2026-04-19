/**
 * DisputeCenter — Phase SG-4 #24
 *
 * One page for the entire dispute lifecycle:
 *   - BDMs file disputes against payouts/credits and track their own.
 *   - Reviewers (finance/admin/president) take review, resolve, close.
 *   - Every transition routes through gateApproval('INCENTIVE_DISPUTE') —
 *     the page handles HTTP 202 (approval pending) via showApprovalPending.
 *
 * SLA breaches are visible inline (red badge) — written by disputeSlaAgent.
 */
import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS, ROLES } from '../../constants/roles';
import useSalesGoals from '../hooks/useSalesGoals';
import { useLookupBatch } from '../hooks/useLookups';
import WorkflowGuide from '../components/WorkflowGuide';
import { showError, showSuccess, showApprovalPending } from '../utils/errorToast';

const styles = `
  .dsp-page { background: var(--erp-bg, #f4f7fb); min-height: 100vh; }
  .dsp-main { flex: 1; min-width: 0; overflow-y: auto; padding: 20px; max-width: 1400px; margin: 0 auto; }
  .dsp-header { margin-bottom: 16px; }
  .dsp-header h1 { font-size: 22px; color: var(--erp-text); margin: 0 0 4px; }
  .dsp-header p { color: var(--erp-muted); font-size: 13px; margin: 0; }
  .dsp-panel { background: var(--erp-panel, #fff); border: 1px solid var(--erp-border, #e5e7eb); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
  .dsp-actions { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
  .dsp-btn { padding: 8px 16px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .dsp-btn-primary { background: var(--erp-accent, #2563eb); color: white; }
  .dsp-btn-outline { background: transparent; border: 1px solid var(--erp-border); color: var(--erp-text); }
  .dsp-btn-success { background: #16a34a; color: white; }
  .dsp-btn-danger { background: #ef4444; color: white; }
  .dsp-btn-warning { background: #f59e0b; color: white; }
  .dsp-btn-sm { padding: 4px 10px; font-size: 12px; }
  .dsp-input, .dsp-select, .dsp-textarea { padding: 7px 10px; border: 1px solid var(--erp-border); border-radius: 8px; font-size: 13px; background: var(--erp-panel, #fff); color: var(--erp-text); width: 100%; box-sizing: border-box; }
  .dsp-textarea { min-height: 80px; resize: vertical; }
  .dsp-field { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 160px; }
  .dsp-field label { font-size: 12px; font-weight: 600; color: var(--erp-muted); }
  .dsp-row { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .dsp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .dsp-table th { text-align: left; padding: 8px 10px; background: var(--erp-accent-soft, #eef2ff); font-weight: 600; color: var(--erp-text); white-space: nowrap; }
  .dsp-table td { padding: 8px 10px; border-top: 1px solid var(--erp-border); color: var(--erp-text); vertical-align: top; }
  .dsp-tag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
  .dsp-tag-open    { background: #fef3c7; color: #92400e; }
  .dsp-tag-review  { background: #dbeafe; color: #1e40af; }
  .dsp-tag-approved{ background: #dcfce7; color: #166534; }
  .dsp-tag-denied  { background: #fee2e2; color: #991b1b; }
  .dsp-tag-closed  { background: #f3f4f6; color: #374151; }
  .dsp-tag-breach  { background: #991b1b; color: #fff; }
  .dsp-empty { text-align: center; padding: 40px 20px; color: var(--erp-muted); }
  .dsp-modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .dsp-modal { background: var(--erp-panel, #fff); border-radius: 14px; max-width: 720px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px; }
  .dsp-modal h2 { margin: 0 0 12px; font-size: 18px; color: var(--erp-text); }
  .dsp-history { margin-top: 12px; border-top: 1px solid var(--erp-border); padding-top: 12px; }
  .dsp-history-row { display: flex; gap: 12px; padding: 6px 0; font-size: 12px; color: var(--erp-text); }
  .dsp-history-row .dsp-h-time { color: var(--erp-muted); min-width: 130px; }
  @media(max-width: 768px) {
    .dsp-main { padding: 12px; }
    .dsp-row { flex-direction: column; }
  }
  @media(max-width: 360px) {
    .dsp-main { padding: 8px; }
    .dsp-header h1 { font-size: 18px; }
    .dsp-btn { width: 100%; padding: 10px; font-size: 13px; }
    .dsp-actions { flex-direction: column; align-items: stretch; }
  }
`;

const stateClass = {
  OPEN: 'dsp-tag-open',
  UNDER_REVIEW: 'dsp-tag-review',
  RESOLVED_APPROVED: 'dsp-tag-approved',
  RESOLVED_DENIED: 'dsp-tag-denied',
  CLOSED: 'dsp-tag-closed',
};

export default function DisputeCenter() {
  const { user } = useAuth();
  const sg = useSalesGoals();
  const { data: lookups } = useLookupBatch(['INCENTIVE_DISPUTE_TYPE']);
  const disputeTypes = lookups.INCENTIVE_DISPUTE_TYPE || [];

  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ current_state: '', dispute_type: '' });
  const [showForm, setShowForm] = useState(false);
  const [showResolve, setShowResolve] = useState(null); // dispute being resolved
  const [showDetail, setShowDetail] = useState(null);   // dispute being viewed
  const [form, setForm] = useState({
    dispute_type: '',
    payout_id: '',
    sales_credit_id: '',
    sale_line_id: '',
    plan_id: '',
    claim_amount: 0,
    reason: '',
    evidence_urls: '',
  });
  const [resolveForm, setResolveForm] = useState({ outcome: 'APPROVED', resolution_summary: '' });

  const isPrivileged = ROLE_SETS.ADMIN_LIKE.includes(user?.role) || user?.role === ROLES.FINANCE || user?.role === ROLES.PRESIDENT;

  // useSalesGoals() returns a fresh object every render — including `sg` in
  // useCallback deps causes an infinite re-render loop. Same fix as
  // CreditRuleManager: depend only on real state (`filter`).
  /* eslint-disable react-hooks/exhaustive-deps */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter.current_state) params.current_state = filter.current_state;
      if (filter.dispute_type) params.dispute_type = filter.dispute_type;
      const res = await sg.listDisputes(params);
      setDisputes(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      showError(err, 'Failed to load disputes');
    } finally {
      setLoading(false);
    }
  }, [filter]);
  /* eslint-enable react-hooks/exhaustive-deps */

  useEffect(() => { load(); }, [load]);

  const submitFile = async () => {
    if (!form.dispute_type) return showError(null, 'Dispute type is required');
    if (!form.reason.trim()) return showError(null, 'Reason is required');
    try {
      const body = {
        dispute_type: form.dispute_type,
        reason: form.reason.trim(),
        claim_amount: Number(form.claim_amount) || 0,
        evidence_urls: form.evidence_urls.split(',').map(s => s.trim()).filter(Boolean),
      };
      if (form.payout_id) body.payout_id = form.payout_id;
      if (form.sales_credit_id) body.sales_credit_id = form.sales_credit_id;
      if (form.sale_line_id) body.sale_line_id = form.sale_line_id;
      if (form.plan_id) body.plan_id = form.plan_id;
      const res = await sg.fileDispute(body);
      if (res?.approval_pending) {
        showApprovalPending(res);
      } else {
        showSuccess('Dispute filed — awaiting reviewer pickup');
      }
      setShowForm(false);
      setForm({ dispute_type: '', payout_id: '', sales_credit_id: '', sale_line_id: '', plan_id: '', claim_amount: 0, reason: '', evidence_urls: '' });
      load();
    } catch (err) {
      showError(err, 'Failed to file dispute');
    }
  };

  const takeReview = async (d) => {
    try {
      const res = await sg.takeReviewDispute(d._id, {});
      if (res?.approval_pending) showApprovalPending(res);
      else showSuccess('Review started');
      load();
    } catch (err) {
      showError(err, 'Failed to take review');
    }
  };

  const submitResolve = async () => {
    if (!resolveForm.resolution_summary.trim()) return showError(null, 'Resolution summary is required');
    try {
      const res = await sg.resolveDispute(showResolve._id, resolveForm);
      if (res?.approval_pending) showApprovalPending(res);
      else showSuccess(`Dispute ${resolveForm.outcome}`);
      setShowResolve(null);
      setResolveForm({ outcome: 'APPROVED', resolution_summary: '' });
      load();
    } catch (err) {
      showError(err, 'Failed to resolve');
    }
  };

  const close = async (d) => {
    if (!window.confirm('Close this resolved dispute?')) return;
    try {
      const res = await sg.closeDispute(d._id, {});
      if (res?.approval_pending) showApprovalPending(res);
      else showSuccess('Dispute closed');
      load();
    } catch (err) {
      showError(err, 'Failed to close');
    }
  };

  const cancel = async (d) => {
    if (!window.confirm('Cancel this dispute? It will be closed and no longer reviewable.')) return;
    try {
      await sg.cancelDispute(d._id, { reason: 'Cancelled by filer' });
      showSuccess('Dispute cancelled');
      load();
    } catch (err) {
      showError(err, 'Failed to cancel');
    }
  };

  const openDetail = async (d) => {
    try {
      const res = await sg.getDispute(d._id);
      setShowDetail(res?.data || d);
    } catch (err) {
      showError(err, 'Failed to load dispute detail');
    }
  };

  const hasOpenSlaBreach = (d) => Array.isArray(d.sla_breaches) && d.sla_breaches.some(b => new Date(b.breached_at) > new Date(d.state_changed_at || d.filed_at));

  return (
    <div className="dsp-page" style={{ display: 'flex' }}>
      <style>{styles}</style>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Navbar />
        <main className="dsp-main">
          <div className="dsp-header">
            <h1>Dispute Center</h1>
            <p>File disputes against incentive payouts or sales credits. Each transition routes through the Approval Hub. SLA breaches are flagged daily by the Dispute SLA Escalator agent.</p>
          </div>

          <WorkflowGuide pageKey="dispute-center" />

          <div className="dsp-panel">
            <div className="dsp-actions">
              <select className="dsp-select" style={{ maxWidth: 180 }} value={filter.current_state} onChange={(e) => setFilter({ ...filter, current_state: e.target.value })}>
                <option value="">All states</option>
                <option value="OPEN">Open</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="RESOLVED_APPROVED">Approved</option>
                <option value="RESOLVED_DENIED">Denied</option>
                <option value="CLOSED">Closed</option>
              </select>
              <select className="dsp-select" style={{ maxWidth: 200 }} value={filter.dispute_type} onChange={(e) => setFilter({ ...filter, dispute_type: e.target.value })}>
                <option value="">All types</option>
                {disputeTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
              <button className="dsp-btn dsp-btn-primary" onClick={() => setShowForm(true)} style={{ marginLeft: 'auto' }}>+ File Dispute</button>
            </div>

            {loading ? <div className="dsp-empty">Loading…</div>
            : disputes.length === 0 ? <div className="dsp-empty">No disputes match the current filter.</div>
            : (
              <table className="dsp-table">
                <thead>
                  <tr>
                    <th>State</th>
                    <th>Filed</th>
                    <th>Type</th>
                    <th>Affected BDM</th>
                    <th>Claim</th>
                    <th>Period</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map(d => (
                    <tr key={d._id}>
                      <td>
                        <span className={`dsp-tag ${stateClass[d.current_state] || 'dsp-tag-closed'}`}>{d.current_state}</span>
                        {hasOpenSlaBreach(d) && <span className="dsp-tag dsp-tag-breach" style={{ marginLeft: 4 }}>SLA</span>}
                      </td>
                      <td style={{ fontSize: 11 }}>{d.filed_at ? new Date(d.filed_at).toISOString().slice(0, 10) : ''}<br /><span style={{ color: 'var(--erp-muted)' }}>{d.filed_by?.name || d.filed_by_name || ''}</span></td>
                      <td>{d.dispute_type}</td>
                      <td>{d.affected_bdm_id?.name || d.affected_bdm_id?.email || String(d.affected_bdm_id || '').slice(-6)}</td>
                      <td>₱{Number(d.claim_amount || 0).toLocaleString()}</td>
                      <td>{d.period || `FY${d.fiscal_year || ''}`}</td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.reason}>{d.reason}</td>
                      <td>
                        <button className="dsp-btn dsp-btn-outline dsp-btn-sm" onClick={() => openDetail(d)}>View</button>
                        {d.current_state === 'OPEN' && isPrivileged && (
                          <button className="dsp-btn dsp-btn-primary dsp-btn-sm" onClick={() => takeReview(d)} style={{ marginLeft: 6 }}>Take Review</button>
                        )}
                        {d.current_state === 'OPEN' && (String(d.filed_by?._id || d.filed_by) === String(user?._id) || isPrivileged) && (
                          <button className="dsp-btn dsp-btn-warning dsp-btn-sm" onClick={() => cancel(d)} style={{ marginLeft: 6 }}>Cancel</button>
                        )}
                        {d.current_state === 'UNDER_REVIEW' && isPrivileged && (
                          <button className="dsp-btn dsp-btn-success dsp-btn-sm" onClick={() => { setShowResolve(d); setResolveForm({ outcome: 'APPROVED', resolution_summary: '' }); }} style={{ marginLeft: 6 }}>Resolve</button>
                        )}
                        {(d.current_state === 'RESOLVED_APPROVED' || d.current_state === 'RESOLVED_DENIED') && isPrivileged && (
                          <button className="dsp-btn dsp-btn-outline dsp-btn-sm" onClick={() => close(d)} style={{ marginLeft: 6 }}>Close</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* File Dispute Modal */}
          {showForm && (
            <div className="dsp-modal-bg" onClick={() => setShowForm(false)}>
              <div className="dsp-modal" onClick={(e) => e.stopPropagation()}>
                <h2>File a Dispute</h2>
                <div className="dsp-row">
                  <div className="dsp-field"><label>Dispute Type *</label>
                    <select className="dsp-select" value={form.dispute_type} onChange={(e) => setForm({ ...form, dispute_type: e.target.value })}>
                      <option value="">— Select type —</option>
                      {disputeTypes.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="dsp-field" style={{ maxWidth: 160 }}><label>Claim Amount ₱</label>
                    <input className="dsp-input" type="number" value={form.claim_amount} onChange={(e) => setForm({ ...form, claim_amount: e.target.value })} />
                  </div>
                </div>
                <div className="dsp-row">
                  <div className="dsp-field"><label>Linked Payout ID (optional)</label>
                    <input className="dsp-input" placeholder="IncentivePayout _id" value={form.payout_id} onChange={(e) => setForm({ ...form, payout_id: e.target.value })} />
                  </div>
                  <div className="dsp-field"><label>Linked Sales Credit ID (optional)</label>
                    <input className="dsp-input" placeholder="SalesCredit _id" value={form.sales_credit_id} onChange={(e) => setForm({ ...form, sales_credit_id: e.target.value })} />
                  </div>
                </div>
                <div className="dsp-row">
                  <div className="dsp-field"><label>Reason *</label>
                    <textarea className="dsp-textarea" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Describe the issue in detail" />
                  </div>
                </div>
                <div className="dsp-row">
                  <div className="dsp-field"><label>Evidence URLs (comma-separated)</label>
                    <input className="dsp-input" placeholder="S3 / external links" value={form.evidence_urls} onChange={(e) => setForm({ ...form, evidence_urls: e.target.value })} />
                  </div>
                </div>
                <div className="dsp-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <button className="dsp-btn dsp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                  <button className="dsp-btn dsp-btn-primary" onClick={submitFile}>File Dispute</button>
                </div>
              </div>
            </div>
          )}

          {/* Resolve Modal */}
          {showResolve && (
            <div className="dsp-modal-bg" onClick={() => setShowResolve(null)}>
              <div className="dsp-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Resolve Dispute DSP-{String(showResolve._id).slice(-6)}</h2>
                <p style={{ fontSize: 13, color: 'var(--erp-muted)' }}>{showResolve.reason}</p>
                <div className="dsp-row">
                  <div className="dsp-field"><label>Outcome</label>
                    <select className="dsp-select" value={resolveForm.outcome} onChange={(e) => setResolveForm({ ...resolveForm, outcome: e.target.value })}>
                      <option value="APPROVED">APPROVED — uphold dispute (cascade reversal if linked)</option>
                      <option value="DENIED">DENIED — reject dispute</option>
                    </select>
                  </div>
                </div>
                <div className="dsp-row">
                  <div className="dsp-field"><label>Resolution Summary *</label>
                    <textarea className="dsp-textarea" value={resolveForm.resolution_summary} onChange={(e) => setResolveForm({ ...resolveForm, resolution_summary: e.target.value })} placeholder="Explain the decision" />
                  </div>
                </div>
                {resolveForm.outcome === 'APPROVED' && showResolve.artifact_type === 'payout' && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', padding: 10, borderRadius: 8, fontSize: 12 }}>
                    Approving will cascade-reverse the linked IncentivePayout&apos;s accrual journal (SAP Storno) and flip the payout to REVERSED. Period locks still apply.
                  </div>
                )}
                <div className="dsp-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <button className="dsp-btn dsp-btn-outline" onClick={() => setShowResolve(null)}>Cancel</button>
                  <button className="dsp-btn dsp-btn-success" onClick={submitResolve}>Resolve</button>
                </div>
              </div>
            </div>
          )}

          {/* Detail Modal */}
          {showDetail && (
            <div className="dsp-modal-bg" onClick={() => setShowDetail(null)}>
              <div className="dsp-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Dispute DSP-{String(showDetail._id).slice(-6)}</h2>
                <div style={{ marginBottom: 8 }}>
                  <span className={`dsp-tag ${stateClass[showDetail.current_state]}`}>{showDetail.current_state}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--erp-muted)' }}>
                    {showDetail.dispute_type} · ₱{Number(showDetail.claim_amount || 0).toLocaleString()} · {showDetail.period}
                  </span>
                </div>
                <p style={{ marginBottom: 8 }}><strong>Filed by:</strong> {showDetail.filed_by?.name || showDetail.filed_by_name}</p>
                <p style={{ marginBottom: 8 }}><strong>Affected BDM:</strong> {showDetail.affected_bdm_id?.name || showDetail.affected_bdm_id?.email}</p>
                <p style={{ marginBottom: 8 }}><strong>Reason:</strong> {showDetail.reason}</p>
                {showDetail.resolution_summary && <p style={{ marginBottom: 8 }}><strong>Resolution:</strong> {showDetail.resolution_summary}</p>}
                {Array.isArray(showDetail.evidence_urls) && showDetail.evidence_urls.length > 0 && (
                  <p style={{ marginBottom: 8 }}><strong>Evidence:</strong> {showDetail.evidence_urls.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>link {i + 1}</a>)}</p>
                )}
                {Array.isArray(showDetail.sla_breaches) && showDetail.sla_breaches.length > 0 && (
                  <div style={{ marginTop: 12, background: '#fee2e2', border: '1px solid #fecaca', padding: 10, borderRadius: 8 }}>
                    <strong style={{ color: '#991b1b' }}>SLA Breaches:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 12 }}>
                      {showDetail.sla_breaches.map((b, i) => (
                        <li key={i}>State <strong>{b.state}</strong> breached on {new Date(b.breached_at).toISOString().slice(0, 10)} — {b.notified_user_ids?.length || 0} notified</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="dsp-history">
                  <strong style={{ fontSize: 13 }}>History</strong>
                  {(showDetail.history || []).map((h, i) => (
                    <div key={i} className="dsp-history-row">
                      <div className="dsp-h-time">{h.at ? new Date(h.at).toISOString().slice(0, 16).replace('T', ' ') : ''}</div>
                      <div>
                        {h.from_state ? `${h.from_state} → ` : ''}<strong>{h.to_state}</strong>
                        {h.by?.name && ` · ${h.by.name}`}
                        {h.reason && <div style={{ color: 'var(--erp-muted)', marginTop: 2 }}>{h.reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="dsp-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                  <button className="dsp-btn dsp-btn-outline" onClick={() => setShowDetail(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
