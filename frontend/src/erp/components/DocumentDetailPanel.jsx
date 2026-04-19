/**
 * DocumentDetailPanel — Shared rich detail renderer
 *
 * Used by:
 *   - Approval Hub (ApprovalManager.jsx) — mode="approval": shows inline edit UI
 *     for fields and line items based on APPROVAL_EDITABLE_FIELDS /
 *     APPROVAL_EDITABLE_LINE_FIELDS lookups.
 *   - President Reversal Console (PresidentReversalsPage.jsx) — mode="reversal":
 *     read-only, no edit buttons. Image previews still clickable.
 *
 * Renders one of 17 per-module panels (12 extracted from ApprovalManager Phase 31,
 * plus 5 new panels for the Approval Hub coverage gap closure: IC_TRANSFER,
 * JOURNAL, BANKING, PURCHASING, PETTY_CASH).
 *
 * The backend detail builder (documentDetailBuilder.js) produces the `details`
 * object; this component knows how to render each module's shape.
 */

const fmt = (n) => '₱' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Lifecycle status palette — derived purely from the literal status string the
// builder passes through. New status values added by future modules degrade
// gracefully to the neutral grey style (no hardcoded enum required).
const STATUS_COLORS = {
  DRAFT:               { bg: '#e5e7eb', fg: '#374151' },
  PENDING:             { bg: '#fef3c7', fg: '#854d0e' },
  PENDING_APPROVAL:    { bg: '#fef3c7', fg: '#854d0e' },
  PENDING_REVIEW:      { bg: '#fef3c7', fg: '#854d0e' },
  PENDING_POST:        { bg: '#fef3c7', fg: '#854d0e' },
  PENDING_CREDIT:      { bg: '#fef3c7', fg: '#854d0e' },
  COMPUTED:            { bg: '#fef3c7', fg: '#854d0e' },
  GENERATED:           { bg: '#fef3c7', fg: '#854d0e' },
  SUBMITTED:           { bg: '#fef3c7', fg: '#854d0e' },
  IN_PROGRESS:         { bg: '#fef3c7', fg: '#854d0e' },
  VALID:               { bg: '#dbeafe', fg: '#1e40af' },
  VALIDATED:           { bg: '#dbeafe', fg: '#1e40af' },
  REVIEWED:            { bg: '#dbeafe', fg: '#1e40af' },
  BDM_CONFIRMED:       { bg: '#dbeafe', fg: '#1e40af' },
  APPROVED:            { bg: '#dcfce7', fg: '#166534' },
  ACTIVE:              { bg: '#dcfce7', fg: '#166534' },
  POSTED:              { bg: '#dcfce7', fg: '#166534' },
  CREDITED:            { bg: '#dcfce7', fg: '#166534' },
  COMPLETED:           { bg: '#dcfce7', fg: '#166534' },
  FINALIZED:           { bg: '#dcfce7', fg: '#166534' },
  RECEIVED:            { bg: '#dcfce7', fg: '#166534' },
  PAID:                { bg: '#dcfce7', fg: '#166534' },
  FULL_MATCH:          { bg: '#dcfce7', fg: '#166534' },
  PARTIAL:             { bg: '#fde68a', fg: '#92400e' },
  PARTIAL_MATCH:       { bg: '#fde68a', fg: '#92400e' },
  SHIPPED:             { bg: '#bfdbfe', fg: '#1e40af' },
  RETURNED:            { bg: '#fed7aa', fg: '#9a3412' },
  ERROR:               { bg: '#fee2e2', fg: '#991b1b' },
  REJECTED:            { bg: '#fee2e2', fg: '#991b1b' },
  CANCELLED:           { bg: '#fee2e2', fg: '#991b1b' },
  VOID:                { bg: '#fee2e2', fg: '#991b1b' },
  VOIDED:              { bg: '#fee2e2', fg: '#991b1b' },
  DISCREPANCY:         { bg: '#fee2e2', fg: '#991b1b' },
  UNPAID:              { bg: '#fee2e2', fg: '#991b1b' },
  UNMATCHED:           { bg: '#fee2e2', fg: '#991b1b' },
  DELETION_REQUESTED:  { bg: '#fee2e2', fg: '#991b1b' },
};

function StatusChip({ status }) {
  if (!status) return null;
  const c = STATUS_COLORS[status] || { bg: '#e5e7eb', fg: '#374151' };
  return (
    <span style={{ padding: '2px 6px', borderRadius: 4, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700, marginLeft: 6 }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// Shared audit footer — surfaces lifecycle context the approver needs:
// status, rejection/return reason, validation errors, and any "by/at" pairs the
// builder populated. Renders nothing if there's nothing to show.
function AuditFooter({ d }) {
  const rows = [];
  if (d.posted_by || d.posted_at) rows.push(['Posted', d.posted_by, d.posted_at]);
  if (d.approved_by || d.approved_at) rows.push(['Approved', d.approved_by, d.approved_at]);
  if (d.reviewed_by || d.reviewed_at) rows.push(['Reviewed', d.reviewed_by, d.reviewed_at]);
  if (d.credited_by || d.credited_at) rows.push(['Credited', d.credited_by, d.credited_at]);
  if (d.shipped_by || d.shipped_at) rows.push(['Shipped', d.shipped_by, d.shipped_at]);
  if (d.received_by || d.received_at) rows.push(['Received', d.received_by, d.received_at]);
  if (d.cancelled_by || d.cancelled_at) rows.push(['Cancelled', d.cancelled_by, d.cancelled_at]);
  if (d.voided_by || d.voided_at) rows.push(['Voided', d.voided_by, d.voided_at]);
  const reason = d.rejection_reason || d.reject_reason || d.return_reason || d.cancel_reason || d.void_reason || null;
  const errs = d.validation_errors || [];
  const warns = d.validation_warnings || [];
  if (!rows.length && !reason && !errs.length && !warns.length) return null;
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--erp-border)', fontSize: 11, color: 'var(--erp-muted)' }}>
      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: reason || errs.length ? 4 : 0 }}>
          {rows.map(([label, who, when], i) => (
            <span key={i}>
              <strong>{label}:</strong> {who || '—'}
              {when ? ` · ${new Date(when).toLocaleString()}` : ''}
            </span>
          ))}
        </div>
      )}
      {reason && (
        <div style={{ padding: '4px 6px', background: '#fee2e2', color: '#991b1b', borderRadius: 4, marginTop: 4 }}>
          <strong>Reason:</strong> {reason}
        </div>
      )}
      {errs.length > 0 && (
        <div style={{ padding: '4px 6px', background: '#fee2e2', color: '#991b1b', borderRadius: 4, marginTop: 4 }}>
          <strong>Validation errors:</strong> {errs.join('; ')}
        </div>
      )}
      {warns.length > 0 && (
        <div style={{ padding: '4px 6px', background: '#fef3c7', color: '#854d0e', borderRadius: 4, marginTop: 4 }}>
          <strong>Warnings:</strong> {warns.join('; ')}
        </div>
      )}
    </div>
  );
}

export default function DocumentDetailPanel(props) {
  const {
    module, details, mode = 'approval', item, cycleLabel,
    editableLineFieldsMap = {},
    editingLineItem, lineEditForm, setLineEditForm, setEditingLineItem,
    onSaveLineEdit, lineEditSaving,
    onPreviewImage,
  } = props;

  const d = details || {};
  const readOnly = mode === 'reversal';

  // NOTE: callers wrap this component in their own container (approval hub uses
  // the per-row expanded-detail box; reversal console uses an expandable row
  // inside the table). Keeping the component wrapper-less avoids double borders.
  return (
    <>

      {/* Income Report Details */}
      {module === 'INCOME' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Status:</strong><StatusChip status={d.status} />
            {d.notes && <span style={{ marginLeft: 8, fontStyle: 'italic', color: 'var(--erp-muted)' }}>{d.notes}</span>}
          </div>
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
                  {l.original_amount != null && l.original_amount !== l.amount && (
                    <span style={{ fontSize: 10, marginLeft: 4, color: '#9a3412' }}>was {fmt(l.original_amount)}</span>
                  )}
                  {l.finance_note && <div style={{ fontSize: 10, color: 'var(--erp-muted)', paddingLeft: 8 }}>↳ {l.finance_note}</div>}
                </div>
              ))}
              <div style={{ fontWeight: 700, marginTop: 4 }}>Total: {fmt(d.total_deductions)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, marginTop: 8, color: (d.net_pay || 0) >= 0 ? '#16a34a' : '#dc2626' }}>
            Net Pay: {fmt(d.net_pay)}
          </div>
          <AuditFooter d={d} />
        </div>
      )}

      {/* Deduction Schedule Details */}
      {module === 'DEDUCTION_SCHEDULE' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            {d.schedule_code && <><strong>Code:</strong> {d.schedule_code} · </>}
            <strong>Status:</strong><StatusChip status={d.status} />
            {d.remaining_balance != null && <> · <strong>Remaining:</strong> {fmt(d.remaining_balance)}</>}
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Type:</strong> {d.deduction_label} · <strong>Total:</strong> {fmt(d.total_amount)} · <strong>Term:</strong> {d.term_months === 1 ? 'One-time' : `${d.term_months} months @ ${fmt(d.installment_amount)}/mo`} · <strong>Start:</strong> {d.start_period} · <strong>Cycle:</strong> {cycleLabel ? cycleLabel(d.target_cycle || 'C2') : (d.target_cycle || 'C2')}
          </div>
          {d.description && <div style={{ color: 'var(--erp-muted)', marginBottom: 8 }}>{d.description}</div>}
          {d.term_months > 1 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>#</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Period</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Status</th></tr></thead>
              <tbody>
                {(d.installments || []).slice(0, 6).map(inst => (
                  <tr key={inst.installment_no}>
                    <td style={{ padding: '3px 8px' }}>{inst.installment_no}</td>
                    <td style={{ padding: '3px 8px' }}>{inst.period}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(inst.amount)}</td>
                    <td style={{ padding: '3px 8px', fontSize: 11 }}>{inst.status || '—'}</td>
                  </tr>
                ))}
                {(d.installments || []).length > 6 && <tr><td colSpan={4} style={{ padding: '3px 8px', color: 'var(--erp-muted)', textAlign: 'center' }}>...and {d.installments.length - 6} more</td></tr>}
              </tbody>
            </table>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* GRN Details */}
      {module === 'INVENTORY' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Status:</strong><StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>GRN Date:</strong> {d.grn_date ? new Date(d.grn_date).toLocaleDateString() : '—'}
            {d.warehouse_name && <> · <strong>Warehouse:</strong> {d.warehouse_name}</>}
            {d.source_type && <> · <strong>Source:</strong> {d.source_type === 'PO' ? 'Purchase Order' : d.source_type === 'INTERNAL_TRANSFER' ? 'Internal Transfer' : 'Standalone'}</>}
          </div>
          {(d.po_number || d.vendor_name) && (
            <div style={{ marginBottom: 6 }}>
              {d.po_number && <><strong>PO#:</strong> {d.po_number}</>}
              {d.po_number && d.vendor_name && ' · '}
              {d.vendor_name && <><strong>Vendor:</strong> {d.vendor_name}</>}
            </div>
          )}
          {d.notes && <div style={{ color: 'var(--erp-muted)', marginBottom: 6 }}>{d.notes}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
            <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th><th style={{ padding: '4px 8px' }}>Batch</th><th style={{ padding: '4px 8px' }}>Expiry</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Stock</th>{!readOnly && (editableLineFieldsMap.grn || []).length > 0 && <th style={{ padding: '4px 8px' }} />}</tr></thead>
            <tbody>
              {(d.line_items || []).map((li, i) => {
                const isEditingLine = !readOnly && editingLineItem?.itemId === item?.id && editingLineItem?.lineIndex === i;
                return (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{li.product_name || li.item_key || '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{isEditingLine && (editableLineFieldsMap.grn || []).includes('batch_lot_no') ? <input type="text" value={lineEditForm.batch_lot_no ?? li.batch_lot_no ?? ''} onChange={e => setLineEditForm(f => ({ ...f, batch_lot_no: e.target.value }))} style={{ width: 80, padding: '2px 4px', fontSize: 12, border: '1px solid #93c5fd', borderRadius: 4 }} /> : li.batch_lot_no}</td>
                    <td style={{ padding: '3px 8px' }}>{isEditingLine && (editableLineFieldsMap.grn || []).includes('expiry_date') ? <input type="date" value={lineEditForm.expiry_date ?? (li.expiry_date ? li.expiry_date.slice(0, 10) : '')} onChange={e => setLineEditForm(f => ({ ...f, expiry_date: e.target.value }))} style={{ padding: '2px 4px', fontSize: 12, border: '1px solid #93c5fd', borderRadius: 4 }} /> : (li.expiry_date ? new Date(li.expiry_date).toLocaleDateString() : '-')}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{isEditingLine && (editableLineFieldsMap.grn || []).includes('qty') ? <input type="number" value={lineEditForm.qty ?? li.qty ?? ''} onChange={e => setLineEditForm(f => ({ ...f, qty: Number(e.target.value) }))} style={{ width: 60, padding: '2px 4px', fontSize: 12, border: '1px solid #93c5fd', borderRadius: 4, textAlign: 'right' }} /> : li.qty}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{li.available_stock != null ? li.available_stock : '—'}</td>
                    {!readOnly && (editableLineFieldsMap.grn || []).length > 0 && (
                      <td style={{ padding: '3px 8px' }}>
                        {isEditingLine ? (
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => onSaveLineEdit?.(item)} disabled={lineEditSaving} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>{lineEditSaving ? '...' : 'Save'}</button>
                            <button onClick={() => { setEditingLineItem?.(null); setLineEditForm?.({}); }} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--erp-border)', background: 'transparent', cursor: 'pointer' }}>X</button>
                          </span>
                        ) : (
                          <button onClick={() => { setEditingLineItem?.({ itemId: item.id, lineIndex: i }); setLineEditForm?.({}); }} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid #93c5fd', background: '#eff6ff', cursor: 'pointer', color: '#2563eb' }}>Edit</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(d.waybill_photo_url || d.undertaking_photo_url) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {d.waybill_photo_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Waybill</div>
                  <img src={d.waybill_photo_url} alt="Waybill" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.waybill_photo_url)} />
                </div>
              )}
              {d.undertaking_photo_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Undertaking</div>
                  <img src={d.undertaking_photo_url} alt="Undertaking" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.undertaking_photo_url)} />
                </div>
              )}
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Payslip Details */}
      {module === 'PAYROLL' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            {d.person_name && <><strong>Employee:</strong> {d.person_name}{d.person_type ? ` (${d.person_type})` : ''} · </>}
            <strong>Status:</strong><StatusChip status={d.status} />
          </div>
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
          </div>
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15, marginTop: 6 }}>Net: {fmt(d.net_pay)}</div>
          {d.employer_contributions && Object.values(d.employer_contributions).some(v => v > 0) && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--erp-muted)' }}>
              <strong>Employer share:</strong>{' '}
              {Object.entries(d.employer_contributions).filter(([, v]) => v > 0).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${fmt(v)}`).join(' · ')}
            </div>
          )}
          {d.notes && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--erp-muted)' }}>{d.notes}</div>}
          <AuditFooter d={d} />
        </div>
      )}

      {/* KPI Rating Details */}
      {module === 'KPI' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Period:</strong> {d.period} {d.period_type}{d.fiscal_year ? ` · FY${d.fiscal_year}` : ''}
            <StatusChip status={d.status} />
          </div>
          {(d.person_name || d.reviewer_name) && (
            <div style={{ marginBottom: 6, fontSize: 12 }}>
              {d.person_name && <><strong>Person:</strong> {d.person_name}</>}
              {d.reviewer_name && <> · <strong>Reviewer:</strong> {d.reviewer_name}</>}
            </div>
          )}
          {(d.kpi_ratings || []).map((k, i) => (
            <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--erp-border)' }}>
              <strong>{k.kpi_name || k.kpi_code}</strong>:
              {k.target_value != null && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--erp-muted)' }}>target {k.target_value}</span>}
              {k.actual_value != null && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--erp-muted)' }}>· actual {k.actual_value}</span>}
              <span style={{ marginLeft: 6 }}>Self {k.self_score || '-'}/5</span>
              {k.manager_score != null && <span> · Manager {k.manager_score}/5</span>}
              {k.self_comment && <div style={{ fontSize: 11, color: 'var(--erp-muted)' }}>↳ {k.self_comment}</div>}
              {k.manager_comment && <div style={{ fontSize: 11, color: '#1e40af' }}>↳ Mgr: {k.manager_comment}</div>}
            </div>
          ))}
          {(d.competency_ratings || []).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Competencies</div>
              {(d.competency_ratings || []).map((c, i) => (
                <div key={i} style={{ fontSize: 12 }}>
                  {c.competency_label || c.competency_code}: Self {c.self_score || '-'}/5
                  {c.manager_score != null && ` · Mgr ${c.manager_score}/5`}
                </div>
              ))}
            </div>
          )}
          {(d.overall_self_score || d.overall_manager_score) && (
            <div style={{ fontWeight: 700, marginTop: 6 }}>
              Overall: Self {d.overall_self_score || '-'}/5
              {d.overall_manager_score != null && ` · Manager ${d.overall_manager_score}/5`}
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Approval Request Details (Phase 29) */}
      {module === 'APPROVAL_REQUEST' && (
        <div style={{ color: 'var(--erp-muted)' }}>Authority matrix approval request. View full document in the originating module.</div>
      )}

      {/* Sales / CSI Details */}
      {module === 'SALES' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Type:</strong> {d.sale_type || 'CSI'} · <strong>Date:</strong> {d.csi_date ? new Date(d.csi_date).toLocaleDateString() : '—'}
            {d.doc_ref && <> · <strong>Doc Ref:</strong> {d.doc_ref}</>}
            {d.invoice_number && <> · <strong>Invoice:</strong> {d.invoice_number}</>}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Customer:</strong> {d.hospital || d.customer || '—'} · <strong>Payment:</strong> {d.payment_mode || '—'}
            {d.fifo_override_count > 0 && (
              <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#854d0e', fontSize: 11, fontWeight: 700 }}>
                FIFO OVERRIDE × {d.fifo_override_count}
              </span>
            )}
          </div>
          {d.service_description && <div style={{ marginBottom: 6, fontStyle: 'italic', color: 'var(--erp-muted)' }}>{d.service_description}</div>}
          {(d.line_items || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Product</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Stock</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Unit Price</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Line Total</th>{!readOnly && (editableLineFieldsMap.sales_line || []).length > 0 && <th style={{ padding: '4px 8px' }} />}</tr></thead>
              <tbody>
                {(d.line_items || []).map((li, i) => {
                  const isEditingLine = !readOnly && editingLineItem?.itemId === item?.id && editingLineItem?.lineIndex === i;
                  return (
                    <tr key={i} style={li.fifo_override ? { background: '#fffbeb' } : undefined}>
                      <td style={{ padding: '3px 8px' }}>
                        {li.product_name || li.item_key || '—'}
                        {li.batch_lot_no && <div style={{ fontSize: 10, color: 'var(--erp-muted)' }}>Batch: {li.batch_lot_no}</div>}
                        {li.fifo_override && (
                          <div style={{ fontSize: 10, color: '#854d0e' }}>
                            ⚠ FIFO override{li.override_reason ? ` — ${li.override_reason}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '3px 8px', textAlign: 'right' }}>{isEditingLine && (editableLineFieldsMap.sales_line || []).includes('qty') ? <input type="number" value={lineEditForm.qty ?? li.qty ?? ''} onChange={e => setLineEditForm(f => ({ ...f, qty: Number(e.target.value) }))} style={{ width: 60, padding: '2px 4px', fontSize: 12, border: '1px solid #93c5fd', borderRadius: 4, textAlign: 'right' }} /> : li.qty}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'right', color: li.available_stock != null && li.available_stock < li.qty ? 'var(--erp-danger, #d32f2f)' : undefined }}>{li.available_stock != null ? li.available_stock : '—'}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'right' }}>{isEditingLine && (editableLineFieldsMap.sales_line || []).includes('unit_price') ? <input type="number" step="0.01" value={lineEditForm.unit_price ?? li.unit_price ?? ''} onChange={e => setLineEditForm(f => ({ ...f, unit_price: Number(e.target.value) }))} style={{ width: 80, padding: '2px 4px', fontSize: 12, border: '1px solid #93c5fd', borderRadius: 4, textAlign: 'right' }} /> : fmt(li.unit_price)}</td>
                      <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.line_total)}</td>
                      {!readOnly && (editableLineFieldsMap.sales_line || []).length > 0 && (
                        <td style={{ padding: '3px 8px' }}>
                          {isEditingLine ? (
                            <span style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => onSaveLineEdit?.(item)} disabled={lineEditSaving} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>{lineEditSaving ? '...' : 'Save'}</button>
                              <button onClick={() => { setEditingLineItem?.(null); setLineEditForm?.({}); }} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid var(--erp-border)', background: 'transparent', cursor: 'pointer' }}>X</button>
                            </span>
                          ) : (
                            <button onClick={() => { setEditingLineItem?.({ itemId: item.id, lineIndex: i }); setLineEditForm?.({}); }} style={{ padding: '2px 6px', fontSize: 11, borderRadius: 4, border: '1px solid #93c5fd', background: '#eff6ff', cursor: 'pointer', color: '#2563eb' }}>Edit</button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontWeight: 700 }}>
            <span>Net of VAT: {fmt(d.total_net_of_vat)}</span>
            <span>VAT: {fmt(d.total_vat)}</span>
            <span>Total: {fmt(d.invoice_total)}</span>
          </div>
          {d.csi_photo_url && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>CSI Document</div>
              <img src={d.csi_photo_url} alt="CSI" style={{ maxWidth: 220, maxHeight: 160, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.csi_photo_url)} />
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Collection / CR Details */}
      {module === 'COLLECTION' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            {d.cr_no && <><strong>CR#:</strong> {d.cr_no} · </>}
            <strong>CR Date:</strong> {d.cr_date ? new Date(d.cr_date).toLocaleDateString() : '—'}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <strong>Customer:</strong> {d.hospital || d.customer || '—'} · <strong>Payment:</strong> {d.payment_mode || '—'}
            {d.check_no && <> · #{d.check_no}{d.bank ? ` (${d.bank})` : ''}</>}
            {d.deposit_date && <> · Deposited {new Date(d.deposit_date).toLocaleDateString()}</>}
          </div>
          {(d.settled_csis || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>CSI Ref</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Invoice Amt</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Commission</th></tr></thead>
              <tbody>
                {(d.settled_csis || []).map((c, i) => (
                  <tr key={i}><td style={{ padding: '3px 8px' }}>{c.doc_ref || '—'}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(c.invoice_amount)}</td><td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(c.commission_amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontWeight: 700, flexWrap: 'wrap' }}>
            <span>CR Amount: {fmt(d.cr_amount)}</span>
            <span>Commission: {fmt(d.total_commission)}</span>
            {d.total_partner_rebates > 0 && <span>Rebates: {fmt(d.total_partner_rebates)}</span>}
            {d.cwt_amount > 0 && <span>CWT: {fmt(d.cwt_amount)}</span>}
          </div>
          {(d.deposit_slip_url || d.cr_photo_url || d.cwt_certificate_url || (d.csi_photo_urls || []).length > 0) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {d.deposit_slip_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Deposit Slip</div>
                  <img src={d.deposit_slip_url} alt="Deposit Slip" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.deposit_slip_url)} />
                </div>
              )}
              {d.cr_photo_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>CR Photo</div>
                  <img src={d.cr_photo_url} alt="CR" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.cr_photo_url)} />
                </div>
              )}
              {d.cwt_certificate_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>CWT Certificate</div>
                  <img src={d.cwt_certificate_url} alt="CWT" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.cwt_certificate_url)} />
                </div>
              )}
              {(d.csi_photo_urls || []).map((url, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>CSI Photo {i + 1}</div>
                  <img src={url} alt={`CSI ${i + 1}`} style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(url)} />
                </div>
              ))}
            </div>
          )}
          {d.notes && <div style={{ marginTop: 8, fontStyle: 'italic', color: 'var(--erp-muted)' }}>{d.notes}</div>}
          <AuditFooter d={d} />
        </div>
      )}

      {/* SMER Details */}
      {module === 'SMER' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Period:</strong> {d.period} {d.cycle || ''} · <strong>Working Days:</strong> {d.working_days || '—'} · <strong>Daily Entries:</strong> {d.daily_entries_count || 0}
            <StatusChip status={d.status} />
            {d.override_count > 0 && (
              <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#854d0e', fontSize: 11, fontWeight: 700 }}>
                {d.override_count} OVERRIDE{d.override_count === 1 ? '' : 'S'}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div><span style={{ color: 'var(--erp-muted)' }}>Per Diem:</span> <strong>{fmt(d.total_perdiem)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Transport:</span> <strong>{fmt(d.total_transpo)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>ORE:</span> <strong>{fmt(d.total_ore)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Reimbursable:</span> <strong style={{ color: '#059669' }}>{fmt(d.total_reimbursable)}</strong></div>
            {d.travel_advance > 0 && <div><span style={{ color: 'var(--erp-muted)' }}>Advance:</span> <strong>{fmt(d.travel_advance)}</strong></div>}
            {d.balance_on_hand != null && <div><span style={{ color: 'var(--erp-muted)' }}>Balance:</span> <strong style={{ color: (d.balance_on_hand || 0) >= 0 ? '#059669' : '#dc2626' }}>{fmt(d.balance_on_hand)}</strong></div>}
          </div>
          {(d.daily_entries || []).length > 0 && (
            <div style={{ marginTop: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Day</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Activity</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Hospital(s) Covered</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>MD</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Tier</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Per Diem</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>Transpo</th>
                    <th style={{ padding: '4px 6px', textAlign: 'right' }}>ORE</th>
                    <th style={{ padding: '4px 6px', textAlign: 'left' }}>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.daily_entries || []).map((e, i) => (
                    <tr key={i} style={e.perdiem_override ? { background: '#fffbeb' } : undefined}>
                      <td style={{ padding: '3px 6px' }}>
                        {e.day}
                        {e.day_of_week && <span style={{ marginLeft: 4, color: 'var(--erp-muted)' }}>{e.day_of_week}</span>}
                      </td>
                      <td style={{ padding: '3px 6px' }}>{e.activity_type || '—'}</td>
                      <td style={{ padding: '3px 6px' }}>{e.hospital_covered || '—'}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{e.md_count || 0}</td>
                      <td style={{ padding: '3px 6px' }}>{e.perdiem_tier || '—'}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmt(e.perdiem_amount)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmt((e.transpo_p2p || 0) + (e.transpo_special || 0))}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmt(e.ore_amount)}</td>
                      <td style={{ padding: '3px 6px' }}>
                        {e.perdiem_override ? (
                          <span title={e.override_reason || ''} style={{ color: '#854d0e', fontWeight: 700 }}>
                            {e.override_tier || '✓'}
                            {e.overridden_by && <div style={{ fontWeight: 400, color: 'var(--erp-muted)', fontSize: 10 }}>by {e.overridden_by}</div>}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Car Logbook Details */}
      {module === 'CAR_LOGBOOK' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Period:</strong> {d.period} {d.cycle || ''}
            {d.entry_date ? ` · Date: ${new Date(d.entry_date).toLocaleDateString()}` : ''}
            {d.day_of_week ? ` · ${d.day_of_week}` : ''}
            <StatusChip status={d.status} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div><span style={{ color: 'var(--erp-muted)' }}>Start KM:</span> <strong>{d.starting_km ?? '—'}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>End KM:</span> <strong>{d.ending_km ?? '—'}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Total KM:</span> <strong>{d.total_km || 0}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Official:</span> <strong>{d.official_km || 0} km</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Personal:</span> <strong>{d.personal_km || 0} km</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Fuel Total:</span> <strong>{fmt(d.total_fuel_amount)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Official Gas:</span> <strong>{fmt(d.official_gas_amount)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Efficiency:</span> <strong>{d.km_per_liter || '—'} km/L</strong></div>
            {d.overconsumption_flag && <div><span style={{ padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>OVERCONSUMPTION</span></div>}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--erp-muted)' }}>
            {d.fuel_entries_count || 0} fuel entries · {d.actual_liters || 0}L total
            {typeof d.efficiency_variance === 'number' && d.efficiency_variance !== 0
              ? ` · variance ${d.efficiency_variance > 0 ? '+' : ''}${d.efficiency_variance}L`
              : ''}
          </div>
          {(d.destination || d.notes) && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--erp-accent-soft, #f1f5f9)', borderRadius: 6, fontSize: 12 }}>
              {d.destination && <div><strong>Destination:</strong> {d.destination}</div>}
              {d.notes && <div style={{ marginTop: d.destination ? 4 : 0 }}><strong>Notes:</strong> {d.notes}</div>}
            </div>
          )}
          {/* CRM cross-reference: cities + MDs visited that day (pulled from Visit logs) */}
          <div style={{ marginTop: 10, padding: 8, border: '1px solid var(--erp-border)', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--erp-muted)' }}>
              CRM Visits on {d.entry_date ? new Date(d.entry_date).toLocaleDateString() : 'this date'}
              {typeof d.crm_visit_count === 'number' ? ` · ${d.crm_visit_count} visit${d.crm_visit_count === 1 ? '' : 's'}` : ''}
            </div>
            {d.crm_lookup_error && (
              <div style={{ fontSize: 11, color: '#991b1b' }}>CRM lookup failed: {d.crm_lookup_error}</div>
            )}
            {!d.crm_lookup_error && (d.cities_visited || []).length > 0 && (
              <div style={{ marginBottom: 6, fontSize: 12 }}>
                <strong>Cities/Clinics:</strong>{' '}
                {(d.cities_visited || []).map((c, i) => (
                  <span key={i} style={{ display: 'inline-block', marginRight: 6, padding: '1px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: 4, fontSize: 11 }}>{c}</span>
                ))}
              </div>
            )}
            {!d.crm_lookup_error && (d.crm_visits || []).length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                {(d.crm_visits || []).map((v, i) => (
                  <li key={i}>
                    <strong>{v.doctor_name}</strong>
                    {v.specialization ? ` (${v.specialization})` : ''}
                    {v.clinic_address ? ` — ${v.clinic_address}` : ''}
                    {v.visit_time ? ` · ${new Date(v.visit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {!d.crm_lookup_error && (d.crm_visits || []).length === 0 && d.crm_visit_count !== null && (
              <div style={{ fontSize: 11, color: 'var(--erp-muted)', fontStyle: 'italic' }}>
                No CRM visits logged for this BDM on this date.
              </div>
            )}
          </div>
          {(d.fuel_receipts || []).length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {(d.fuel_receipts || []).map((fe, i) => (
                <div key={i}>
                  {fe.receipt_url && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Day {fe.day} Receipt</div>
                      <img src={fe.receipt_url} alt={`Receipt Day ${fe.day}`} style={{ maxWidth: 140, maxHeight: 100, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(fe.receipt_url)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Odometer photo evidence (was hydrated upstream by signed-URL phase) */}
          {(d.starting_km_photo_url || d.ending_km_photo_url) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {d.starting_km_photo_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Starting KM Photo</div>
                  <img src={d.starting_km_photo_url} alt="Starting KM" style={{ maxWidth: 140, maxHeight: 100, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.starting_km_photo_url)} />
                </div>
              )}
              {d.ending_km_photo_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Ending KM Photo</div>
                  <img src={d.ending_km_photo_url} alt="Ending KM" style={{ maxWidth: 140, maxHeight: 100, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.ending_km_photo_url)} />
                </div>
              )}
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Expenses (ORE/ACCESS) Details */}
      {module === 'EXPENSES' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Period:</strong> {d.period} {d.cycle || ''} · <strong>Lines:</strong> {d.line_count || 0}
            <StatusChip status={d.status} />
            {d.bir_flag && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--erp-muted)' }}>BIR: {d.bir_flag}</span>}
            {d.recorded_on_behalf_of && (
              <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3', fontSize: 11, fontWeight: 700 }}>
                On behalf of {d.recorded_on_behalf_of}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontWeight: 700 }}>
            <span>ORE: {fmt(d.total_ore)}</span>
            <span>ACCESS: {fmt(d.total_access)}</span>
            <span>Total: {fmt(d.total_amount)}</span>
            {d.total_vat > 0 && <span>VAT: {fmt(d.total_vat)}</span>}
          </div>
          {(d.lines || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Type</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Category</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Establishment</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>VAT</th><th style={{ padding: '4px 8px' }}>OR#</th><th style={{ padding: '4px 8px' }}>Pay</th><th style={{ padding: '4px 8px' }}>CALF?</th><th style={{ padding: '4px 8px' }}>OR</th></tr></thead>
              <tbody>
                {(d.lines || []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px', fontSize: 11 }}>{l.expense_date ? new Date(l.expense_date).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{l.expense_type}</td>
                    <td style={{ padding: '3px 8px' }}>{l.expense_category || '—'}</td>
                    <td style={{ padding: '3px 8px', fontSize: 11 }}>{l.establishment || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(l.amount)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', color: 'var(--erp-muted)', fontSize: 11 }}>{l.vat_amount > 0 ? fmt(l.vat_amount) : '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{l.or_number || '—'}</td>
                    <td style={{ padding: '3px 8px', fontSize: 11 }}>{l.payment_mode || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'center' }}>{l.calf_required ? 'Yes' : '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{l.or_photo_url && <img src={l.or_photo_url} alt="OR" style={{ maxWidth: 40, maxHeight: 30, borderRadius: 4, cursor: 'pointer' }} onClick={() => onPreviewImage?.(l.or_photo_url)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* PRF/CALF Details */}
      {module === 'PRF_CALF' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Type:</strong> {d.doc_type} {d.prf_type ? `(${d.prf_type})` : ''}
            {(d.prf_number || d.calf_number) && <> · <strong>{d.doc_type}#:</strong> {d.prf_number || d.calf_number}</>}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 8 }}><strong>Period:</strong> {d.period} {d.cycle || ''}</div>
          {d.doc_type === 'PRF' && (
            <div style={{ marginBottom: 6 }}>
              <strong>Payee:</strong> {d.payee_name || '—'} ({d.payee_type || '—'}) · <strong>Rebate:</strong> {fmt(d.rebate_amount)} · <strong>Payment:</strong> {d.payment_mode || '—'}
              {(d.partner_bank || d.partner_account_no) && (
                <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 2 }}>
                  Partner bank: {d.partner_bank || '—'} · {d.partner_account_name || '—'} · {d.partner_account_no || '—'}
                </div>
              )}
            </div>
          )}
          {d.doc_type === 'CALF' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
              <div><span style={{ color: 'var(--erp-muted)' }}>Advance:</span> <strong>{fmt(d.advance_amount)}</strong></div>
              <div><span style={{ color: 'var(--erp-muted)' }}>Liquidation:</span> <strong>{fmt(d.liquidation_amount)}</strong></div>
              <div><span style={{ color: 'var(--erp-muted)' }}>Balance:</span> <strong style={{ color: (d.balance || 0) >= 0 ? '#059669' : '#dc2626' }}>{fmt(d.balance)}</strong></div>
            </div>
          )}
          {d.purpose && <div style={{ color: 'var(--erp-muted)' }}><strong>Purpose:</strong> {d.purpose}</div>}
          {d.bir_flag && <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 4 }}>BIR: {d.bir_flag}{d.check_no ? ` · Check #${d.check_no}` : ''}{d.bank ? ` (${d.bank})` : ''}</div>}
          {d.notes && <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--erp-muted)' }}>{d.notes}</div>}
          {(d.photo_urls || []).length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {(d.photo_urls || []).map((url, i) => (
                <div key={i}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Doc {i + 1}</div>
                  <img src={url} alt={`Doc ${i + 1}`} style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(url)} />
                </div>
              ))}
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Perdiem Override Details */}
      {module === 'PERDIEM_OVERRIDE' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Type:</strong> {d.doc_type || '—'}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Requested by:</strong> {d.requested_by || '—'}
            {d.requested_at && <> · {new Date(d.requested_at).toLocaleString()}</>}
          </div>
          {d.requested_override_tier && (
            <div style={{ marginBottom: 6, fontSize: 12 }}>
              <strong>Requested tier:</strong>{' '}
              <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#854d0e', fontWeight: 700 }}>{d.requested_override_tier}</span>
            </div>
          )}
          {d.amount != null && <div style={{ marginBottom: 6 }}><strong>Amount:</strong> {fmt(d.amount)}</div>}
          {d.description && <div style={{ color: 'var(--erp-muted)' }}>{d.description}</div>}
          {(d.decided_by || d.decision_reason) && (
            <div style={{ marginTop: 6, padding: 6, background: 'var(--erp-accent-soft, #f1f5f9)', borderRadius: 4, fontSize: 12 }}>
              {d.decided_by && <div><strong>Decided by:</strong> {d.decided_by}{d.decided_at ? ` · ${new Date(d.decided_at).toLocaleString()}` : ''}</div>}
              {d.decision_reason && <div style={{ marginTop: 2 }}><strong>Reason:</strong> {d.decision_reason}</div>}
            </div>
          )}
        </div>
      )}

      {/* ─── Phase 31 new panels ─── */}

      {/* IC Transfer / IC Settlement Details */}
      {module === 'IC_TRANSFER' && d.kind === 'IC_SETTLEMENT' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>CR#:</strong> {d.cr_no || '—'} · <strong>Date:</strong> {d.cr_date ? new Date(d.cr_date).toLocaleDateString() : '—'}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Payment:</strong> {d.payment_mode || '—'} {d.check_no ? `#${d.check_no}` : ''}
            {d.check_date && <> · {new Date(d.check_date).toLocaleDateString()}</>}
            {d.bank && <> · {d.bank}</>}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>From:</strong> {d.debtor_entity || '—'} → <strong>To:</strong> {d.creditor_entity || '—'}
          </div>
          <div style={{ display: 'flex', gap: 16, fontWeight: 700 }}>
            <span>Amount: {fmt(d.cr_amount)}</span>
            {d.total_settled > 0 && <span>Settled: {fmt(d.total_settled)}</span>}
            {d.cwt_amount > 0 && <span style={{ color: '#854d0e' }}>CWT: {fmt(d.cwt_amount)}</span>}
          </div>
          {(d.settled_transfers || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Transfer Ref</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>VIP CSI</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Transfer Amt</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Settled</th></tr></thead>
              <tbody>
                {(d.settled_transfers || []).map((t, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{t.transfer_ref}</td>
                    <td style={{ padding: '3px 8px' }}>{t.vip_csi_ref || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(t.transfer_amount)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(t.amount_settled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.notes && <div style={{ color: 'var(--erp-muted)', marginTop: 6 }}>{d.notes}</div>}
          {(d.deposit_slip_url || d.cr_photo_url) && (
            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {d.deposit_slip_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>Deposit Slip</div>
                  <img src={d.deposit_slip_url} alt="Deposit Slip" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.deposit_slip_url)} />
                </div>
              )}
              {d.cr_photo_url && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>CR Photo</div>
                  <img src={d.cr_photo_url} alt="CR" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.cr_photo_url)} />
                </div>
              )}
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {module === 'IC_TRANSFER' && d.kind !== 'IC_SETTLEMENT' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Ref:</strong> {d.transfer_ref || '—'} · <strong>Date:</strong> {d.transfer_date ? new Date(d.transfer_date).toLocaleDateString() : '—'}
            {d.csi_ref && <> · <strong>CSI:</strong> {d.csi_ref}</>}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Source:</strong> {d.source_entity || '—'}{d.source_warehouse ? ` (${d.source_warehouse})` : ''}
            &nbsp;→&nbsp;
            <strong>Target:</strong> {d.target_entity || '—'}{d.target_warehouse ? ` (${d.target_warehouse})` : ''}
          </div>
          {(d.line_items || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Product</th><th style={{ padding: '4px 8px' }}>Batch</th><th style={{ padding: '4px 8px' }}>Expiry</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Transfer Price</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Line Total</th></tr></thead>
              <tbody>
                {(d.line_items || []).map((li, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{li.product_name || li.item_key || String(li.product_id)}</td>
                    <td style={{ padding: '3px 8px' }}>{li.batch_lot_no || '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{li.expiry_date ? new Date(li.expiry_date).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{li.qty}{li.unit ? ` ${li.unit}` : ''}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.transfer_price ?? li.unit_cost)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ marginTop: 8, fontWeight: 700 }}>Total: {fmt(d.total_amount)} · {d.total_items || 0} items</div>
          {d.notes && <div style={{ color: 'var(--erp-muted)', marginTop: 6 }}>{d.notes}</div>}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Journal Entry Details */}
      {module === 'JOURNAL' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Ref:</strong> {d.je_number || '—'} · <strong>Date:</strong> {d.je_date ? new Date(d.je_date).toLocaleDateString() : '—'}
            {d.period && <> · <strong>Period:</strong> {d.period}</>}
            <StatusChip status={d.status} />
            {d.is_reversal && <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>REVERSAL</span>}
          </div>
          <div style={{ marginBottom: 6, fontSize: 12 }}>
            <strong>Source:</strong> {d.source_module || '—'}
            {d.source_doc_ref && <> · <strong>Source Doc:</strong> {d.source_doc_ref}</>}
            {d.bir_flag && <> · <strong>BIR:</strong> {d.bir_flag}</>}
            {d.vat_flag && d.vat_flag !== 'N/A' && <> · <strong>VAT:</strong> {d.vat_flag}</>}
          </div>
          {d.is_reversal && d.corrects_je_number && (
            <div style={{ marginBottom: 6, fontSize: 12, color: '#991b1b' }}>
              <strong>Reverses:</strong> JE {d.corrects_je_number}
            </div>
          )}
          {d.memo && <div style={{ color: 'var(--erp-muted)', marginBottom: 8 }}><em>{d.memo}</em></div>}
          {(d.lines || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Account</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Debit</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Credit</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Memo</th></tr></thead>
              <tbody>
                {(d.lines || []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{l.account_code} {l.account_name ? `— ${l.account_name}` : ''}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{l.debit > 0 ? fmt(l.debit) : ''}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{l.credit > 0 ? fmt(l.credit) : ''}</td>
                    <td style={{ padding: '3px 8px', color: 'var(--erp-muted)', fontSize: 11 }}>{l.memo || ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--erp-border)' }}>
                  <td style={{ padding: '4px 8px' }}>Totals</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(d.total_debits)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(d.total_credits)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
          {(Math.abs((d.total_debits || 0) - (d.total_credits || 0)) > 0.01) && (
            <div style={{ marginTop: 6, padding: '6px 8px', background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
              ⚠ Unbalanced: debits and credits don&apos;t match
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Banking / Bank Reconciliation Details */}
      {module === 'BANKING' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Account:</strong> {d.bank_account || '—'}{d.coa_code ? ` · COA ${d.coa_code}` : ''}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Statement Date:</strong> {d.statement_date ? new Date(d.statement_date).toLocaleDateString() : '—'} · <strong>Period:</strong> {d.period || '—'} · <strong>Closing Balance:</strong> {fmt(d.closing_balance)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
            <span><strong>Entries:</strong> {d.entries_count || 0}</span>
            <span style={{ color: '#059669' }}><strong>Matched:</strong> {d.matched_count || 0}</span>
            <span style={{ color: '#dc2626' }}><strong>Unmatched:</strong> {d.unmatched_count || 0}</span>
            {d.reconciling_items_count > 0 && <span style={{ color: '#b45309' }}><strong>Reconciling:</strong> {d.reconciling_items_count}</span>}
          </div>
          {(d.entries_preview || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px' }}>Date</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Description</th><th style={{ padding: '4px 8px' }}>Ref</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Debit</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Credit</th><th style={{ padding: '4px 8px' }}>Status</th></tr></thead>
              <tbody>
                {(d.entries_preview || []).map((e, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{e.txn_date ? new Date(e.txn_date).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{e.description || '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{e.reference || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{e.debit > 0 ? fmt(e.debit) : ''}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{e.credit > 0 ? fmt(e.credit) : ''}</td>
                    <td style={{ padding: '3px 8px', fontSize: 11, color: e.match_status === 'MATCHED' ? '#059669' : e.match_status === 'RECONCILING_ITEM' ? '#b45309' : '#dc2626' }}>{e.match_status || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.entries_count > (d.entries_preview || []).length && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--erp-muted)' }}>
              Showing first {(d.entries_preview || []).length} of {d.entries_count} entries
            </div>
          )}
          {d.uploaded_by && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--erp-muted)' }}>
              Uploaded by {d.uploaded_by}{d.uploaded_at ? ` on ${new Date(d.uploaded_at).toLocaleString()}` : ''}
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

      {/* Purchasing / Supplier Invoice Details */}
      {module === 'PURCHASING' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Invoice#:</strong> {d.invoice_ref || '—'} · <strong>Date:</strong> {d.invoice_date ? new Date(d.invoice_date).toLocaleDateString() : '—'}
            {d.due_date && <> · <strong>Due:</strong> {new Date(d.due_date).toLocaleDateString()}</>}
            <StatusChip status={d.status} />
            {d.overdue && <span style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>OVERDUE</span>}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Vendor:</strong> {d.vendor_name || '—'}{d.vendor_tin ? ` (TIN ${d.vendor_tin})` : ''}
            {d.po_number && <> · <strong>PO#:</strong> {d.po_number}</>}
          </div>
          <div style={{ marginBottom: 8, fontSize: 12 }}>
            {d.match_status && <><strong>Match:</strong> <StatusChip status={d.match_status} /></>}
            {d.payment_status && <span style={{ marginLeft: 8 }}><strong>Payment:</strong> <StatusChip status={d.payment_status} /></span>}
            {d.amount_paid > 0 && <span style={{ marginLeft: 8 }}>Paid {fmt(d.amount_paid)}</span>}
            {d.balance_due > 0 && <span style={{ marginLeft: 8, color: '#991b1b' }}>· Balance {fmt(d.balance_due)}</span>}
          </div>
          {(d.line_items || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Unit Price</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Line Total</th><th style={{ padding: '4px 8px', textAlign: 'center' }}>PO/GRN</th></tr></thead>
              <tbody>
                {(d.line_items || []).map((li, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{li.product_name || li.item_key || li.description || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{li.qty}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.unit_price)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.line_total)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'center', fontSize: 11 }}>
                      <span style={{ color: li.po_line_matched ? '#059669' : '#9ca3af' }}>{li.po_line_matched ? '✓PO' : '–PO'}</span>
                      <span style={{ marginLeft: 4, color: li.grn_line_matched ? '#059669' : '#9ca3af' }}>{li.grn_line_matched ? '✓GRN' : '–GRN'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontWeight: 700 }}>
            <span>Net of VAT: {fmt(d.net_amount)}</span>
            <span>VAT: {fmt(d.vat_amount)}</span>
            <span>Total: {fmt(d.total_amount)}</span>
          </div>
          <AuditFooter d={d} />
        </div>
      )}

      {/* Petty Cash Details */}
      {module === 'PETTY_CASH' && (
        <div>
          <div style={{ marginBottom: 6 }}>
            <strong>Txn#:</strong> {d.txn_number || d.txn_no || '—'} · <strong>Type:</strong> <span style={{ padding: '2px 6px', borderRadius: 4, background: d.txn_type === 'DEPOSIT' ? '#dcfce7' : '#fef3c7', color: d.txn_type === 'DEPOSIT' ? '#166534' : '#854d0e', fontSize: 11, fontWeight: 700 }}>{d.txn_type || '—'}</span> · <strong>Date:</strong> {d.txn_date ? new Date(d.txn_date).toLocaleDateString() : '—'}
            <StatusChip status={d.status} />
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Fund:</strong> {d.fund_label || '—'}
            {d.fund_current_balance != null && <> · <strong>Fund Balance:</strong> {fmt(d.fund_current_balance)}</>}
            {d.running_balance != null && <> · <strong>After Txn:</strong> {fmt(d.running_balance)}</>}
          </div>
          <div style={{ marginBottom: 6 }}>
            {d.payee && <><strong>Payee:</strong> {d.payee} · </>}
            {d.or_number && <><strong>OR#:</strong> {d.or_number} · </>}
            {d.expense_category && <><strong>Category:</strong> {d.expense_category} · </>}
            {d.is_pcv && <span style={{ padding: '1px 6px', borderRadius: 4, background: '#fef3c7', color: '#854d0e', fontSize: 11, fontWeight: 700 }}>PCV</span>}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Amount: {fmt(d.amount)}</div>
          {(d.vat_amount > 0 || d.net_of_vat > 0) && (
            <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 12, color: 'var(--erp-muted)' }}>
              <span>Net of VAT: {fmt(d.net_of_vat)}</span>
              <span>VAT: {fmt(d.vat_amount)}</span>
            </div>
          )}
          {(d.particulars || d.source_description || d.pcv_remarks) && (
            <div style={{ color: 'var(--erp-muted)', marginTop: 6 }}>
              <em>{d.particulars || d.source_description || d.pcv_remarks}</em>
            </div>
          )}
          {d.or_photo_url && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--erp-muted)', marginBottom: 4 }}>OR / Receipt</div>
              <img src={d.or_photo_url} alt="Receipt" style={{ maxWidth: 180, maxHeight: 140, borderRadius: 6, cursor: 'pointer', border: '1px solid var(--erp-border)' }} onClick={() => onPreviewImage?.(d.or_photo_url)} />
            </div>
          )}
          <AuditFooter d={d} />
        </div>
      )}

    </>
  );
}
