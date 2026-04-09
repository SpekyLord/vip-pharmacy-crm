import { useState, useEffect, useCallback } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import useApprovals from '../hooks/useApprovals';
import useLookups from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';
import toast from 'react-hot-toast';

const MODULE_OPTIONS = [
  'SALES', 'COLLECTIONS', 'EXPENSES', 'PURCHASING',
  'PAYROLL', 'INVENTORY', 'JOURNAL', 'BANKING',
  'PETTY_CASH', 'IC_TRANSFER', 'INCOME',
];

const APPROVER_TYPES = [
  { value: 'ROLE', label: 'By Role' },
  { value: 'USER', label: 'Specific Users' },
  { value: 'REPORTS_TO', label: 'Direct Manager' },
];

export default function ApprovalManager() {
  const { user } = useAuth();
  const {
    rules, requests, loading, error,
    fetchRules, createRule, updateRule, deleteRule,
    fetchRequests, fetchMyPending, approve, reject, cancel,
    checkStatus,
  } = useApprovals();

  const [tab, setTab] = useState('requests'); // 'requests' | 'rules'
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [decisionModal, setDecisionModal] = useState(null); // { requestId, action }
  const [reason, setReason] = useState('');

  const isAdmin = ['admin', 'president', 'finance'].includes(user?.role);

  useEffect(() => {
    checkStatus().then(d => setApprovalEnabled(d.enabled)).catch(() => {});
  }, [checkStatus]);

  useEffect(() => {
    if (tab === 'requests') {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (moduleFilter) params.module = moduleFilter;
      fetchRequests(params).catch(e => showError(e));
    } else {
      fetchRules().catch(e => showError(e));
    }
  }, [tab, statusFilter, moduleFilter, fetchRequests, fetchRules]);

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
          {showRuleForm && <RuleFormModal rule={editingRule} onSave={handleSaveRule} onClose={() => { setShowRuleForm(false); setEditingRule(null); }} />}
        </main>
      </div>
    </div>
  );
}

// Exported for Control Center embedding
export { ApprovalManager as ApprovalManagerContent };

// ─── Rule Form Modal ────────────────────────────────────────────────

function RuleFormModal({ rule, onSave, onClose }) {
  const [form, setForm] = useState({
    module: rule?.module || 'PURCHASING',
    doc_type: rule?.doc_type || '',
    level: rule?.level || 1,
    amount_threshold: rule?.amount_threshold ?? '',
    approver_type: rule?.approver_type || 'ROLE',
    approver_roles: rule?.approver_roles || ['admin', 'finance'],
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
              {MODULE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
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
              {APPROVER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
