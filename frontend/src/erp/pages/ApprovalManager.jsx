import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useApprovals from '../hooks/useApprovals';
import { useLookupBatch } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';
import toast from 'react-hot-toast';


export default function ApprovalManager() {
  const { user } = useAuth();
  const {
    rules, requests, loading, error: _error, // eslint-disable-line no-unused-vars
    fetchRules, createRule, updateRule, deleteRule,
    fetchRequests, fetchMyPending: _fetchMyPending, approve, reject, cancel: _cancel, // eslint-disable-line no-unused-vars
    checkStatus,
    universalItems, universalCount, fetchUniversalPending, universalApprove,
  } = useApprovals();

  const [tab, setTab] = useState('all-pending'); // 'all-pending' | 'requests' | 'rules'
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [decisionModal, setDecisionModal] = useState(null); // { requestId, action }
  const [reason, setReason] = useState('');

  // Lookup-driven options (database-driven via useLookupBatch)
  const { data: lookups } = useLookupBatch(['APPROVAL_MODULE', 'APPROVER_TYPE', 'APPROVER_ROLE']);

  const MODULE_OPTIONS = (lookups.APPROVAL_MODULE || []).map(o => o.code || o.value);
  const APPROVER_TYPES = (lookups.APPROVER_TYPE || []).map(o => ({ value: o.code || o.value, label: o.label }));
  const APPROVER_ROLES = (lookups.APPROVER_ROLE || []).length > 0
    ? (lookups.APPROVER_ROLE || []).map(o => (o.code || o.value).toLowerCase())
    : [...ROLE_SETS.MANAGEMENT];

  const isAdmin = ROLE_SETS.MANAGEMENT.includes(user?.role);

  useEffect(() => {
    checkStatus().then(d => setApprovalEnabled(d.enabled)).catch(() => {});
  }, [checkStatus]);

  const [hubModuleFilter, setHubModuleFilter] = useState('');
  const [expandedItem, setExpandedItem] = useState(null); // item.id to expand

  useEffect(() => {
    if (tab === 'all-pending') {
      fetchUniversalPending().catch(e => showError(e));
    } else if (tab === 'requests') {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (moduleFilter) params.module = moduleFilter;
      fetchRequests(params).catch(e => showError(e));
    } else {
      fetchRules().catch(e => showError(e));
    }
  }, [tab, statusFilter, moduleFilter, fetchRequests, fetchRules, fetchUniversalPending]);

  const handleDecision = useCallback(async () => {
    if (!decisionModal) return;
    try {
      if (decisionModal.action === 'approve') {
        await approve(decisionModal.requestId, reason);
        toast.success('Approved');
      } else {
        if (!reason.trim()) return toast.error('Reason required for rejection');
        await reject(decisionModal.requestId, reason);
        toast.success('Rejected');
      }
      setDecisionModal(null);
      setReason('');
      fetchRequests({ status: statusFilter, module: moduleFilter }).catch(() => {});
    } catch (e) {
      showError(e);
    }
  }, [decisionModal, reason, approve, reject, fetchRequests, statusFilter, moduleFilter]);

  const handleSaveRule = useCallback(async (formData) => {
    try {
      if (editingRule) {
        await updateRule(editingRule._id, formData);
        toast.success('Rule updated');
      } else {
        await createRule(formData);
        toast.success('Rule created');
      }
      setShowRuleForm(false);
      setEditingRule(null);
      fetchRules().catch(() => {});
    } catch (e) {
      showError(e);
    }
  }, [editingRule, createRule, updateRule, fetchRules]);

  const handleDeleteRule = useCallback(async (id) => {
    if (!window.confirm('Delete this approval rule?')) return;
    try {
      await deleteRule(id);
      toast.success('Rule deleted');
      fetchRules().catch(() => {});
    } catch (e) {
      showError(e);
    }
  }, [deleteRule, fetchRules]);

  const handleUniversalAction = useCallback(async (item, action) => {
    if (action === 'reject') {
      const r = prompt('Reason for rejection:');
      if (!r) return;
      try {
        await universalApprove({ ...item.approve_data, action: 'reject', reason: r });
        toast.success('Rejected');
        fetchUniversalPending().catch(() => {});
      } catch (e) { showError(e); }
      return;
    }
    try {
      await universalApprove({ ...item.approve_data, action: item.approve_data.action || 'approve' });
      toast.success(`${item.current_action} successful`);
      fetchUniversalPending().catch(() => {});
    } catch (e) { showError(e); }
  }, [universalApprove, fetchUniversalPending]);

  const MODULE_COLORS = {
    INCOME: '#2563eb', DEDUCTION_SCHEDULE: '#7c3aed', PURCHASING: '#16a34a',
    INVENTORY: '#d97706', PAYROLL: '#0891b2', KPI: '#4f46e5', APPROVAL_REQUEST: '#6b7280'
  };

  const filteredHubItems = hubModuleFilter
    ? universalItems.filter(i => i.module === hubModuleFilter)
    : universalItems;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--erp-bg, #f4f7fb)' }}>
      <Navbar />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 20, maxWidth: 1200, margin: '0 auto' }}>
          <WorkflowGuide pageKey="approval-manager" />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              Approval Workflow
              {!approvalEnabled && (
                <span style={{ fontSize: 12, color: '#d97706', marginLeft: 8, fontWeight: 500, background: '#fef3c7', padding: '2px 8px', borderRadius: 8 }}>
                  Authority Matrix Disabled
                </span>
              )}
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setTab('all-pending')}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'all-pending' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: tab === 'all-pending' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: tab === 'all-pending' ? 'transparent' : 'var(--erp-border)' }}
              >
                All Pending {universalCount > 0 ? `(${universalCount})` : ''}
              </button>
              <button
                onClick={() => setTab('requests')}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'requests' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: tab === 'requests' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: tab === 'requests' ? 'transparent' : 'var(--erp-border)' }}
              >
                Requests {requests.length > 0 ? `(${requests.length})` : ''}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setTab('rules')}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'rules' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: tab === 'rules' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: tab === 'rules' ? 'transparent' : 'var(--erp-border)' }}
                >
                  Rules ({rules.length})
                </button>
              )}
            </div>
          </div>

          {/* ─── All Pending Tab (Universal Hub) ─── */}
          {tab === 'all-pending' && (
            <div style={{ background: 'var(--erp-panel)', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--erp-muted)' }}>Filter:</span>
                <button onClick={() => setHubModuleFilter('')}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: !hubModuleFilter ? '#2563eb' : 'transparent', color: !hubModuleFilter ? '#fff' : 'var(--erp-text)' }}>
                  All
                </button>
                {[...new Set(universalItems.map(i => i.module))].map(mod => (
                  <button key={mod} onClick={() => setHubModuleFilter(mod)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: hubModuleFilter === mod ? (MODULE_COLORS[mod] || '#6b7280') : 'transparent', color: hubModuleFilter === mod ? '#fff' : 'var(--erp-text)' }}>
                    {mod.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--erp-muted)' }}>Loading...</div>}

              {!loading && filteredHubItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--erp-muted)' }}>
                  Nothing needs your attention right now.
                </div>
              )}

              {!loading && filteredHubItems.map(item => {
                const isExpanded = expandedItem === item.id;
                const d = item.details || {};
                const fmt = (n) => '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return (
                <div key={item.id} style={{ background: 'var(--erp-bg)', border: '1px solid var(--erp-border)', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, color: '#fff', background: MODULE_COLORS[item.module] || '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {item.module.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--erp-muted)' }}>{item.doc_ref}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--erp-text)', marginBottom: 2 }}>{item.description}</div>
                      <div style={{ fontSize: 12, color: 'var(--erp-muted)' }}>
                        {item.submitted_by} · {new Date(item.submitted_at).toLocaleDateString()}
                        {item.amount > 0 && <span style={{ marginLeft: 8, fontWeight: 600 }}>{fmt(item.amount)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'var(--erp-panel)', color: 'var(--erp-text)' }}>
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                      <button onClick={() => handleUniversalAction(item, 'approve')} disabled={loading}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: item.action_key === 'CREDIT' ? '#047857' : '#16a34a', color: '#fff' }}>
                        {item.current_action}
                      </button>
                      <button onClick={() => handleUniversalAction(item, 'reject')} disabled={loading}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: '#dc2626', color: '#fff' }}>
                        Reject
                      </button>
                    </div>
                  </div>

                  {/* ── Expandable Detail Panel ── */}
                  {isExpanded && d && (
                    <div style={{ marginTop: 12, padding: 12, background: 'var(--erp-panel)', border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13 }}>

                      {/* Income Report Details */}
                      {item.module === 'INCOME' && (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: 6, color: '#16a34a' }}>Earnings</div>
                              {d.earnings?.smer > 0 && <div>SMER: {fmt(d.earnings.smer)}</div>}
                              {d.earnings?.core_commission > 0 && <div>Commission: {fmt(d.earnings.core_commission)}</div>}
                              {d.earnings?.calf_reimbursement > 0 && <div>CALF Reimburse: {fmt(d.earnings.calf_reimbursement)}</div>}
                              {d.earnings?.bonus > 0 && <div>Bonus: {fmt(d.earnings.bonus)}</div>}
                              {d.earnings?.profit_sharing > 0 && <div>Profit Sharing: {fmt(d.earnings.profit_sharing)}</div>}
                              <div style={{ fontWeight: 700, marginTop: 4 }}>Total: {fmt(d.total_earnings)}</div>
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: 6, color: '#dc2626' }}>Deductions ({(d.deduction_lines || []).length} lines)</div>
                              {(d.deduction_lines || []).map((l, i) => (
                                <div key={i} style={l.status === 'REJECTED' ? { textDecoration: 'line-through', opacity: 0.5 } : {}}>
                                  {l.deduction_label}: {fmt(l.amount)} <span style={{ fontSize: 10, color: 'var(--erp-muted)' }}>({l.status}{l.auto_source ? ` · ${l.auto_source}` : ''})</span>
                                </div>
                              ))}
                              <div style={{ fontWeight: 700, marginTop: 4 }}>Total: {fmt(d.total_deductions)}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, marginTop: 8, color: (d.net_pay || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
                            Net Pay: {fmt(d.net_pay)}
                          </div>
                        </div>
                      )}

                      {/* Deduction Schedule Details */}
                      {item.module === 'DEDUCTION_SCHEDULE' && (
                        <div>
                          <div style={{ marginBottom: 8 }}>
                            <strong>Type:</strong> {d.deduction_label} · <strong>Total:</strong> {fmt(d.total_amount)} · <strong>Term:</strong> {d.term_months === 1 ? 'One-time' : `${d.term_months} months @ ${fmt(d.installment_amount)}/mo`} · <strong>Start:</strong> {d.start_period}
                          </div>
                          {d.description && <div style={{ color: 'var(--erp-muted)', marginBottom: 8 }}>{d.description}</div>}
                          {d.term_months > 1 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>#</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Period</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount</th></tr></thead>
                              <tbody>
                                {(d.installments || []).slice(0, 6).map(inst => (
                                  <tr key={inst.installment_no}><td style={{ padding: '3px 8px' }}>{inst.installment_no}</td><td style={{ padding: '3px 8px' }}>{inst.period}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(inst.amount)}</td></tr>
                                ))}
                                {(d.installments || []).length > 6 && <tr><td colSpan={3} style={{ padding: '3px 8px', color: 'var(--erp-muted)', textAlign: 'center' }}>...and {d.installments.length - 6} more</td></tr>}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}

                      {/* GRN Details */}
                      {item.module === 'INVENTORY' && (
                        <div>
                          {d.grn_date && <div><strong>GRN Date:</strong> {new Date(d.grn_date).toLocaleDateString()}</div>}
                          {d.notes && <div style={{ color: 'var(--erp-muted)', marginBottom: 6 }}>{d.notes}</div>}
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
                            <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th><th style={{ padding: '4px 8px' }}>Batch</th><th style={{ padding: '4px 8px' }}>Expiry</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th></tr></thead>
                            <tbody>
                              {(d.line_items || []).map((li, i) => (
                                <tr key={i}><td style={{ padding: '3px 8px' }}>{li.item_key}</td><td style={{ padding: '3px 8px' }}>{li.batch_lot_no}</td><td style={{ padding: '3px 8px' }}>{li.expiry_date ? new Date(li.expiry_date).toLocaleDateString() : '-'}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{li.qty}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Payslip Details */}
                      {item.module === 'PAYROLL' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Earnings</div>
                            {Object.entries(d.earnings || {}).filter(([, v]) => v > 0).map(([k, v]) => (
                              <div key={k}>{k.replace(/_/g, ' ')}: {fmt(v)}</div>
                            ))}
                            <div style={{ fontWeight: 700, marginTop: 4 }}>Total: {fmt(d.total_earnings)}</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Deductions</div>
                            {Object.entries(d.deductions || {}).filter(([, v]) => v > 0).map(([k, v]) => (
                              <div key={k}>{k.replace(/_/g, ' ')}: {fmt(v)}</div>
                            ))}
                            <div style={{ fontWeight: 700, marginTop: 4 }}>Total: {fmt(d.total_deductions)}</div>
                          </div>
                          <div style={{ gridColumn: '1 / -1', textAlign: 'center', fontWeight: 700, fontSize: 15 }}>Net: {fmt(d.net_pay)}</div>
                        </div>
                      )}

                      {/* KPI Rating Details */}
                      {item.module === 'KPI' && (
                        <div>
                          <div style={{ marginBottom: 6 }}><strong>Period:</strong> {d.period} {d.period_type}</div>
                          {(d.kpi_ratings || []).map((k, i) => (
                            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--erp-border)' }}>
                              <strong>{k.kpi_name || k.kpi_code}</strong>: Self {k.self_score || '-'}/5
                              {k.manager_score != null && <span> · Manager {k.manager_score}/5</span>}
                              {k.self_comment && <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>{k.self_comment}</div>}
                            </div>
                          ))}
                          {d.overall_self_score && <div style={{ fontWeight: 700, marginTop: 6 }}>Overall Self: {d.overall_self_score}/5</div>}
                        </div>
                      )}

                      {/* Approval Request Details (Phase 29) */}
                      {item.module === 'APPROVAL_REQUEST' && (
                        <div style={{ color: 'var(--erp-muted)' }}>Authority matrix approval request. View full document in the originating module.</div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* ─── Requests Tab ─── */}
          {tab === 'requests' && (
            <div style={{ background: 'var(--erp-panel)', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {['PENDING', 'APPROVED', 'REJECTED', ''].map(s => (
                  <button key={s || 'all'} onClick={() => setStatusFilter(s)}
                    style={{ padding: '5px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', background: statusFilter === s ? 'var(--erp-accent, #2563eb)' : 'transparent', color: statusFilter === s ? '#fff' : 'var(--erp-text)', fontWeight: 600 }}>
                    {s || 'All'}
                  </button>
                ))}
                <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
                  style={{ padding: '5px 10px', fontSize: 12, borderRadius: 8, border: '1px solid var(--erp-border)', background: 'var(--erp-panel)' }}>
                  <option value="">All Modules</option>
                  {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {loading && <p style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>Loading...</p>}
              {!loading && requests.length === 0 && <p style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>No approval requests found</p>}

              {requests.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'left' }}>Module</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'left' }}>Document</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>Amount</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>Level</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'left' }}>Requested By</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map(r => (
                        <tr key={r._id} style={{ borderTop: '1px solid var(--erp-border)' }}>
                          <td style={{ padding: 6 }}>{r.module}</td>
                          <td style={{ padding: 6 }}>{r.doc_type} {r.doc_ref || ''}</td>
                          <td style={{ padding: 6, textAlign: 'right' }}>{r.amount != null ? `₱${Number(r.amount).toLocaleString()}` : '—'}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{r.level}</td>
                          <td style={{ padding: 6 }}>{r.requested_by?.name || '—'}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                              background: r.status === 'PENDING' ? '#fef3c7' : r.status === 'APPROVED' ? '#dcfce7' : r.status === 'REJECTED' ? '#fee2e2' : '#f3f4f6',
                              color: r.status === 'PENDING' ? '#92400e' : r.status === 'APPROVED' ? '#166534' : r.status === 'REJECTED' ? '#991b1b' : '#6b7280',
                            }}>{r.status}</span>
                          </td>
                          <td style={{ padding: 6, textAlign: 'center' }}>
                            {r.status === 'PENDING' && (
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                                <button onClick={() => { setDecisionModal({ requestId: r._id, action: 'approve' }); setReason(''); }}
                                  style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#059669', color: '#fff', fontWeight: 600 }}>Approve</button>
                                <button onClick={() => { setDecisionModal({ requestId: r._id, action: 'reject' }); setReason(''); }}
                                  style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#dc2626', color: '#fff', fontWeight: 600 }}>Reject</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Rules Tab ─── */}
          {tab === 'rules' && isAdmin && (
            <div style={{ background: 'var(--erp-panel)', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Approval Rules</h3>
                <button onClick={() => { setEditingRule(null); setShowRuleForm(true); }}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'var(--erp-accent, #2563eb)', color: '#fff' }}>
                  + Add Rule
                </button>
              </div>

              {rules.length === 0 && !loading && (
                <p style={{ textAlign: 'center', color: 'var(--erp-muted)', padding: 24 }}>
                  No approval rules configured. Enable ENFORCE_AUTHORITY_MATRIX in Settings to activate.
                </p>
              )}

              {rules.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
                    <thead>
                      <tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'left' }}>Module</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'left' }}>Doc Type</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>Level</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'right' }}>Threshold</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'left' }}>Approver</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>Active</th>
                        <th style={{ padding: '8px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map(rule => (
                        <tr key={rule._id} style={{ borderTop: '1px solid var(--erp-border)' }}>
                          <td style={{ padding: 6 }}>{rule.module}</td>
                          <td style={{ padding: 6 }}>{rule.doc_type || 'All'}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{rule.level}</td>
                          <td style={{ padding: 6, textAlign: 'right' }}>{rule.amount_threshold != null ? `₱${Number(rule.amount_threshold).toLocaleString()}` : 'Any'}</td>
                          <td style={{ padding: 6 }}>
                            {rule.approver_type === 'ROLE' ? rule.approver_roles?.join(', ') : rule.approver_type === 'REPORTS_TO' ? 'Direct Manager' : rule.approver_user_ids?.map(u => u.name || u).join(', ')}
                          </td>
                          <td style={{ padding: 6, textAlign: 'center' }}>{rule.is_active ? '✓' : '—'}</td>
                          <td style={{ padding: 6, textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                              <button onClick={() => { setEditingRule(rule); setShowRuleForm(true); }}
                                style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid var(--erp-border)', cursor: 'pointer', background: 'transparent', fontWeight: 600 }}>Edit</button>
                              <button onClick={() => handleDeleteRule(rule._id)}
                                style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: 'none', cursor: 'pointer', background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Decision Modal ─── */}
          {decisionModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: 'var(--erp-panel, #fff)', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
                  {decisionModal.action === 'approve' ? 'Approve Request' : 'Reject Request'}
                </h3>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={decisionModal.action === 'reject' ? 'Reason (required)' : 'Reason (optional)'}
                  rows={3}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button onClick={() => setDecisionModal(null)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'transparent' }}>Cancel</button>
                  <button onClick={handleDecision}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: decisionModal.action === 'approve' ? '#059669' : '#dc2626', color: '#fff' }}>
                    {decisionModal.action === 'approve' ? 'Approve' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Rule Form Modal ─── */}
          {showRuleForm && <RuleFormModal rule={editingRule} onSave={handleSaveRule} onClose={() => { setShowRuleForm(false); setEditingRule(null); }} moduleOptions={MODULE_OPTIONS} approverTypes={APPROVER_TYPES} approverRoles={APPROVER_ROLES} />}
        </main>
      </div>
    </div>
  );
}

// Exported for Control Center embedding
export { ApprovalManager as ApprovalManagerContent };

// ─── Rule Form Modal ────────────────────────────────────────────────

 
function RuleFormModal({ rule, onSave, onClose, moduleOptions, approverTypes, approverRoles }) {
  const [form, setForm] = useState({
    module: rule?.module || (moduleOptions[0] || 'PURCHASING'),
    doc_type: rule?.doc_type || '',
    level: rule?.level || 1,
    amount_threshold: rule?.amount_threshold ?? '',
    approver_type: rule?.approver_type || (approverTypes[0]?.value || 'ROLE'),
    approver_roles: rule?.approver_roles || approverRoles.slice(0, 2),
    description: rule?.description || '',
    is_active: rule?.is_active ?? true,
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      amount_threshold: form.amount_threshold === '' ? null : Number(form.amount_threshold),
      doc_type: form.doc_type || null,
    });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <form onSubmit={handleSubmit} style={{ background: 'var(--erp-panel, #fff)', borderRadius: 12, padding: 24, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{rule ? 'Edit Rule' : 'New Approval Rule'}</h3>

        <div style={{ display: 'grid', gap: 12 }}>
          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Module</span>
            <select value={form.module} onChange={e => update('module', e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13 }}>
              {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Document Type (optional)</span>
            <input value={form.doc_type} onChange={e => update('doc_type', e.target.value)}
              placeholder="e.g., PO, CSI, PAYSLIP (blank = all)"
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, boxSizing: 'border-box' }} />
          </label>

          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ fontSize: 13, flex: 1 }}>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Level</span>
              <input type="number" min={1} max={5} value={form.level} onChange={e => update('level', Number(e.target.value))}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, boxSizing: 'border-box' }} />
            </label>

            <label style={{ fontSize: 13, flex: 1 }}>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Amount Threshold (₱)</span>
              <input type="number" min={0} value={form.amount_threshold} onChange={e => update('amount_threshold', e.target.value)}
                placeholder="Any amount"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, boxSizing: 'border-box' }} />
            </label>
          </div>

          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Approver Type</span>
            <select value={form.approver_type} onChange={e => update('approver_type', e.target.value)}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13 }}>
              {approverTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          {form.approver_type === 'ROLE' && (
            <label style={{ fontSize: 13 }}>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Approver Roles (comma-separated)</span>
              <input value={form.approver_roles.join(', ')} onChange={e => update('approver_roles', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                placeholder="admin, finance, president"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, boxSizing: 'border-box' }} />
            </label>
          )}

          <label style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</span>
            <input value={form.description} onChange={e => update('description', e.target.value)}
              placeholder="e.g., POs over ₱50,000 require finance approval"
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, boxSizing: 'border-box' }} />
          </label>

          <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.is_active} onChange={e => update('is_active', e.target.checked)} />
            <span style={{ fontWeight: 600 }}>Active</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'transparent' }}>Cancel</button>
          <button type="submit"
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'var(--erp-accent, #2563eb)', color: '#fff' }}>
            {rule ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
 
