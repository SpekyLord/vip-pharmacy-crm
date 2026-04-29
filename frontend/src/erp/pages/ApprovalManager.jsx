import { useState, useEffect, useCallback, useMemo } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_SETS } from '../../constants/roles';
import useApprovals from '../hooks/useApprovals';
import { useLookupBatch } from '../hooks/useLookups';
import { showError } from '../utils/errorToast';
import WorkflowGuide from '../components/WorkflowGuide';
import DocumentDetailPanel from '../components/DocumentDetailPanel';
import toast from 'react-hot-toast';
import { getGrnSettings } from '../services/undertakingService';


export default function ApprovalManager() {
  const { user } = useAuth();
  const {
    rules, requests, loading, error: _error, // eslint-disable-line no-unused-vars
    fetchRules, createRule, updateRule, deleteRule,
    fetchRequests, fetchMyPending: _fetchMyPending, approve, reject, cancel: _cancel, // eslint-disable-line no-unused-vars
    checkStatus,
    universalItems, universalCount, fetchUniversalPending, universalApprove, universalEdit,
  } = useApprovals();

  const [tab, setTab] = useState('all-pending'); // 'all-pending' | 'requests' | 'rules'
  // Phase G4.1 — Requests tab is now the Approval History log (APPROVED /
  // REJECTED / CANCELLED). Pending items live in All Pending, hydrated with
  // full DocumentDetailPanel details via the APPROVAL_REQUEST query + dedup.
  const [statusFilter, setStatusFilter] = useState('APPROVED');
  const [moduleFilter, setModuleFilter] = useState('');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [decisionModal, setDecisionModal] = useState(null); // { requestId, action }
  const [reason, setReason] = useState('');
  const [rejectModal, setRejectModal] = useState(null); // { item } for universal hub reject
  const [rejectReason, setRejectReason] = useState('');

  // Lookup-driven options (database-driven via useLookupBatch)
  const { data: lookups } = useLookupBatch(['APPROVAL_MODULE', 'APPROVER_TYPE', 'APPROVER_ROLE', 'APPROVAL_EDITABLE_FIELDS', 'APPROVAL_EDITABLE_LINE_FIELDS', 'CYCLE']);

  const MODULE_OPTIONS = (lookups.APPROVAL_MODULE || []).map(o => o.code || o.value);
  const APPROVER_TYPES = (lookups.APPROVER_TYPE || []).map(o => ({ value: o.code || o.value, label: o.label }));
  const APPROVER_ROLES = (lookups.APPROVER_ROLE || []).length > 0
    ? (lookups.APPROVER_ROLE || []).map(o => (o.code || o.value).toLowerCase())
    : [...ROLE_SETS.MANAGEMENT];

  const cycleLabel = (code) => (lookups.CYCLE || []).find(c => c.code === code)?.label || code;
  // Rules tab: lookup-driven via sub-permission (president always, others via erp_access)
  const canManageRules = user?.role === 'president'
    || (user?.erp_access?.modules?.approvals === 'FULL' && (!user?.erp_access?.sub_permissions?.approvals || user?.erp_access?.sub_permissions?.approvals?.rule_manage))
    || (user?.role === 'admin' && (!user?.erp_access || !user?.erp_access?.enabled));  // backward compat
  const isAdmin = canManageRules;

  useEffect(() => {
    checkStatus().then(d => setApprovalEnabled(d.enabled)).catch(() => {});
  }, [checkStatus]);

  const [hubModuleFilter, setHubModuleFilter] = useState('');
  const [expandedItem, setExpandedItem] = useState(null); // item.id to expand
  // Phase G4.5h-W (Apr 29, 2026) — lookup-driven waybill-required flag for
  // UNDERTAKING rows. Subscribers who don't require courier waybills (internal-
  // only workflows) shouldn't see "approval will be blocked" warnings. Reads
  // GRN_SETTINGS.WAYBILL_REQUIRED via the cached settings fetcher.
  const [waybillRequired, setWaybillRequired] = useState(true);
  useEffect(() => {
    getGrnSettings().then(s => setWaybillRequired(!!s?.waybillRequired)).catch(() => {});
  }, []);

  // Phase G3: Quick-edit state
  const [editingItem, setEditingItem] = useState(null);   // item.id being edited
  const [editForm, setEditForm] = useState({});            // { field: value }
  const [editSaving, setEditSaving] = useState(false);

  // Phase 34: Image preview + line-item edit state
  const [previewImage, setPreviewImage] = useState(null); // URL of image to preview full-size
  const [editingLineItem, setEditingLineItem] = useState(null); // { itemId, lineIndex }
  const [lineEditForm, setLineEditForm] = useState({});
  const [lineEditSaving, setLineEditSaving] = useState(false);

  // Lookup-driven editable fields map: { type_key: [field1, field2, ...] }
  const editableFieldsMap = useMemo(() => {
    const map = {};
    (lookups.APPROVAL_EDITABLE_FIELDS || []).forEach(entry => {
      map[(entry.code || '').toLowerCase()] = entry.metadata?.fields || [];
    });
    return map;
  }, [lookups.APPROVAL_EDITABLE_FIELDS]);

  // Phase 34: Lookup-driven editable line-item fields map
  const editableLineFieldsMap = useMemo(() => {
    const map = {};
    (lookups.APPROVAL_EDITABLE_LINE_FIELDS || []).forEach(entry => {
      map[(entry.code || '').toLowerCase()] = entry.metadata?.fields || [];
    });
    return map;
  }, [lookups.APPROVAL_EDITABLE_LINE_FIELDS]);

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
      // Open reject modal instead of browser prompt()
      setRejectModal({ item });
      setRejectReason('');
      return;
    }
    try {
      await universalApprove({ ...item.approve_data, action: item.approve_data.action || 'approve' });
      toast.success(`${item.current_action} successful`);
      fetchUniversalPending().catch(() => {});
    } catch (e) { showError(e); }
  }, [universalApprove, fetchUniversalPending]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectModal) return;
    if (!rejectReason.trim()) return toast.error('Reason is required for rejection');
    try {
      await universalApprove({ ...rejectModal.item.approve_data, action: 'reject', reason: rejectReason });
      toast.success('Rejected');
      setRejectModal(null);
      setRejectReason('');
      fetchUniversalPending().catch(() => {});
    } catch (e) { showError(e); }
  }, [rejectModal, rejectReason, universalApprove, fetchUniversalPending]);

  // Phase G3: Save quick-edit
  const handleSaveEdit = useCallback(async () => {
    if (!editingItem) return;
    const item = (hubModuleFilter ? universalItems.filter(i => i.module === hubModuleFilter) : universalItems)
      .find(i => i.id === editingItem);
    if (!item) return;
    setEditSaving(true);
    try {
      await universalEdit({
        type: item.approve_data.type,
        id: item.approve_data.id,
        updates: editForm
      });
      toast.success('Saved — you can now approve');
      setEditingItem(null);
      setEditForm({});
      fetchUniversalPending().catch(() => {});
    } catch (e) {
      showError(e);
    } finally {
      setEditSaving(false);
    }
  }, [editingItem, editForm, universalEdit, fetchUniversalPending, universalItems, hubModuleFilter]);

  // Phase 34: Save line-item edit
  const handleSaveLineEdit = useCallback(async (item) => {
    if (!editingLineItem) return;
    setLineEditSaving(true);
    try {
      await universalEdit({
        type: item.approve_data.type,
        id: item.approve_data.id,
        updates: { line_items: [{ index: editingLineItem.lineIndex, ...lineEditForm }] },
        edit_reason: 'Line item edit from Approval Hub',
      });
      toast.success('Line item updated');
      setEditingLineItem(null);
      setLineEditForm({});
      fetchUniversalPending().catch(() => {});
    } catch (e) {
      showError(e);
    } finally {
      setLineEditSaving(false);
    }
  }, [editingLineItem, lineEditForm, universalEdit, fetchUniversalPending]);

  const MODULE_COLORS = {
    INCOME: '#2563eb', DEDUCTION_SCHEDULE: '#7c3aed', PURCHASING: '#16a34a',
    INVENTORY: '#d97706', PAYROLL: '#0891b2', KPI: '#4f46e5', APPROVAL_REQUEST: '#6b7280',
    SALES: '#059669', COLLECTION: '#0d9488', SMER: '#ea580c', CAR_LOGBOOK: '#64748b',
    EXPENSES: '#b45309', PRF_CALF: '#7c3aed',
    IC_TRANSFER: '#9333ea', JOURNAL: '#1e40af', BANKING: '#0e7490', PETTY_CASH: '#c2410c',
    PERDIEM_OVERRIDE: '#a16207',
    CREDIT_NOTE: '#be185d', SALES_GOAL_PLAN: '#1d4ed8', INCENTIVE_PAYOUT: '#047857',
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
                title="Historical approval requests (APPROVED / REJECTED / CANCELLED). Pending items live in All Pending with expandable details."
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'requests' ? 'var(--erp-accent, #2563eb)' : 'transparent', color: tab === 'requests' ? '#fff' : 'var(--erp-text)', borderWidth: 1, borderStyle: 'solid', borderColor: tab === 'requests' ? 'transparent' : 'var(--erp-border)' }}
              >
                Approval History {requests.length > 0 ? `(${requests.length})` : ''}
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
                        {item.submitted_by} · {item.submitted_at && !isNaN(new Date(item.submitted_at)) ? new Date(item.submitted_at).toLocaleDateString() : '—'}
                        {item.amount > 0 && <span style={{ marginLeft: 8, fontWeight: 600 }}>{fmt(item.amount)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'var(--erp-panel)', color: 'var(--erp-text)' }}>
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                      {(editableFieldsMap[item.approve_data?.type] || []).length > 0 && (
                        <button onClick={() => {
                          if (editingItem === item.id) {
                            setEditingItem(null); setEditForm({});
                          } else {
                            const fields = editableFieldsMap[item.approve_data.type];
                            const initial = {};
                            fields.forEach(f => { initial[f] = item.details?.[f] ?? ''; });
                            setEditingItem(item.id);
                            setEditForm(initial);
                            if (expandedItem !== item.id) setExpandedItem(item.id);
                          }
                        }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: editingItem === item.id ? '#dbeafe' : 'var(--erp-panel)', color: editingItem === item.id ? '#1d4ed8' : 'var(--erp-text)' }}>
                          {editingItem === item.id ? 'Cancel Edit' : 'Edit'}
                        </button>
                      )}
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

                  {/* Phase G4.5g — UNDERTAKING approvals show BDM owner + linked GRN +
                      waybill thumbnail on the row itself. The president-level bug this
                      closes: approving the wrong UT because the approver couldn't tell
                      two Hub rows apart without expanding, and the waybill was only
                      visible inside DocumentDetailPanel.
                      Phase G4.5h-W (Apr 29, 2026) — buildUndertakingDetails now falls
                      back to the UT's own waybill mirror when the linked-GRN populate
                      is partial. The "approval will be blocked" warning is gated on
                      GRN_SETTINGS.WAYBILL_REQUIRED so non-pharmacy subscribers
                      who don't capture courier waybills don't see false-positives, and
                      it links the approver back to the UT page where they can re-upload
                      the waybill (the GRN has no edit endpoint — UT recovery is the
                      only path). */}
                  {item.module === 'UNDERTAKING' && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 6 }}>
                      {d.waybill_photo_url ? (
                        <img
                          src={d.waybill_photo_url}
                          alt="Waybill"
                          onClick={(e) => { e.stopPropagation(); setPreviewImage(d.waybill_photo_url); }}
                          style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #d97706', flexShrink: 0 }}
                        />
                      ) : (
                        <div title={waybillRequired ? 'Missing waybill photo' : 'No waybill on file (not required by GRN settings)'} style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: waybillRequired ? '#fee2e2' : '#f1f5f9', borderRadius: 4, border: `1px solid ${waybillRequired ? '#dc2626' : '#94a3b8'}`, color: waybillRequired ? '#dc2626' : '#475569', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
                          {waybillRequired ? '⚠' : '–'}
                        </div>
                      )}
                      <div style={{ fontSize: 12, flex: 1, lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700, color: '#92400e' }}>
                          BDM: {d.bdm || '—'}
                        </div>
                        <div style={{ color: '#78350f' }}>
                          GRN {d.linked_grn?.grn_number || '—'}
                          {d.linked_grn?.vendor_name && <> · {d.linked_grn.vendor_name}</>}
                        </div>
                        {!d.waybill_photo_url && waybillRequired && (
                          <div style={{ color: '#dc2626', fontWeight: 700, marginTop: 2 }}>
                            No waybill photo — approval will be blocked.{' '}
                            <a
                              href={`/erp/undertaking/${item.doc_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: '#dc2626', textDecoration: 'underline' }}
                            >
                              Open UT to upload →
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── Expandable Detail Panel ──
                      Phase 31: detail rendering extracted to <DocumentDetailPanel />
                      so the same component serves both the Approval Hub AND the
                      President Reversal Console. Passed state allows inline line-edit
                      in approval mode; reversal mode renders read-only. */}
                  {isExpanded && d && (
                    <div style={{ marginTop: 12, padding: 12, background: 'var(--erp-panel)', border: '1px solid var(--erp-border)', borderRadius: 8, fontSize: 13 }}>

                      <DocumentDetailPanel
                        module={item.module}
                        details={d}
                        mode="approval"
                        item={item}
                        cycleLabel={cycleLabel}
                        editableLineFieldsMap={editableLineFieldsMap}
                        editingLineItem={editingLineItem}
                        lineEditForm={lineEditForm}
                        setLineEditForm={setLineEditForm}
                        setEditingLineItem={setEditingLineItem}
                        onSaveLineEdit={handleSaveLineEdit}
                        lineEditSaving={lineEditSaving}
                        onPreviewImage={setPreviewImage}
                      />

                      {/* ── Phase G3: Inline Quick-Edit Form (kept in ApprovalManager — approval-specific) ── */}
                      {editingItem === item.id && (editableFieldsMap[item.approve_data?.type] || []).length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '2px dashed var(--erp-border)', paddingTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }} />
                            Quick Edit — fix typos before approving
                          </div>
                          {(editableFieldsMap[item.approve_data?.type] || []).map(field => (
                            <div key={field} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                              <label style={{ width: 150, fontSize: 12, fontWeight: 600, color: 'var(--erp-text)', textTransform: 'capitalize', flexShrink: 0 }}>
                                {field.replace(/_/g, ' ')}
                              </label>
                              {field === 'total_amount' ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm[field] ?? ''}
                                  onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #93c5fd', fontSize: 13, background: '#eff6ff', outline: 'none' }}
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={editForm[field] ?? ''}
                                  onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #93c5fd', fontSize: 13, background: '#eff6ff', outline: 'none' }}
                                />
                              )}
                            </div>
                          ))}
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                            <button
                              onClick={() => { setEditingItem(null); setEditForm({}); }}
                              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: 'var(--erp-panel)', color: 'var(--erp-text)' }}>
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              disabled={editSaving}
                              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: editSaving ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, background: '#2563eb', color: '#fff', opacity: editSaving ? 0.6 : 1 }}>
                              {editSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* ─── Requests Tab → Approval History (Phase G4.1) ─── */}
          {tab === 'requests' && (
            <div style={{ background: 'var(--erp-panel)', borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <div style={{ marginBottom: 12, padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, color: '#1e40af', lineHeight: 1.5 }}>
                <strong>Approval History</strong> — historical decisions (APPROVED / REJECTED / CANCELLED) from the Default-Roles Gate and Authority Matrix. Pending items now appear in <strong>All Pending</strong> with full expandable details.
              </div>
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

          {/* ─── Universal Hub Reject Modal ─── */}
          {rejectModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: 'var(--erp-panel, #fff)', borderRadius: 12, padding: 24, width: 400, maxWidth: '95vw' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#dc2626' }}>Reject — {rejectModal.item?.description || rejectModal.item?.doc_ref}</h3>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--erp-muted)' }}>
                  {rejectModal.item?.module?.replace(/_/g, ' ')} · {rejectModal.item?.submitted_by}
                </p>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (required)"
                  rows={3}
                  autoFocus
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid var(--erp-border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--erp-border)', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'transparent' }}>Cancel</button>
                  <button onClick={handleRejectConfirm} disabled={loading}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: '#dc2626', color: '#fff' }}>
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Phase 34 — Image Preview Modal */}
          {previewImage && (
            <div
              onClick={() => setPreviewImage(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, cursor: 'zoom-out' }}
            >
              <img
                src={previewImage}
                alt="Preview"
                style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,.3)' }}
                onClick={e => e.stopPropagation()}
              />
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
 
