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
      {module === 'DEDUCTION_SCHEDULE' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Type:</strong> {d.deduction_label} · <strong>Total:</strong> {fmt(d.total_amount)} · <strong>Term:</strong> {d.term_months === 1 ? 'One-time' : `${d.term_months} months @ ${fmt(d.installment_amount)}/mo`} · <strong>Start:</strong> {d.start_period} · <strong>Cycle:</strong> {cycleLabel ? cycleLabel(d.target_cycle || 'C2') : (d.target_cycle || 'C2')}
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
      {module === 'INVENTORY' && (
        <div>
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
        </div>
      )}

      {/* Payslip Details */}
      {module === 'PAYROLL' && (
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
      {module === 'KPI' && (
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
      {module === 'APPROVAL_REQUEST' && (
        <div style={{ color: 'var(--erp-muted)' }}>Authority matrix approval request. View full document in the originating module.</div>
      )}

      {/* Sales / CSI Details */}
      {module === 'SALES' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Type:</strong> {d.sale_type || 'CSI'} · <strong>Date:</strong> {d.csi_date ? new Date(d.csi_date).toLocaleDateString() : '—'} · <strong>Invoice:</strong> {d.invoice_number || '—'}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Customer:</strong> {d.hospital || d.customer || '—'} · <strong>Payment:</strong> {d.payment_mode || '—'}
          </div>
          {(d.line_items || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 6 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Product</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Stock</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Unit Price</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Line Total</th>{!readOnly && (editableLineFieldsMap.sales_line || []).length > 0 && <th style={{ padding: '4px 8px' }} />}</tr></thead>
              <tbody>
                {(d.line_items || []).map((li, i) => {
                  const isEditingLine = !readOnly && editingLineItem?.itemId === item?.id && editingLineItem?.lineIndex === i;
                  return (
                    <tr key={i}>
                      <td style={{ padding: '3px 8px' }}>{li.product_name || li.item_key || '—'}</td>
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
        </div>
      )}

      {/* Collection / CR Details */}
      {module === 'COLLECTION' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>CR Date:</strong> {d.cr_date ? new Date(d.cr_date).toLocaleDateString() : '—'} · <strong>Customer:</strong> {d.hospital || d.customer || '—'} · <strong>Payment:</strong> {d.payment_mode || '—'} {d.check_no ? `#${d.check_no}` : ''}
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
        </div>
      )}

      {/* SMER Details */}
      {module === 'SMER' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Period:</strong> {d.period} {d.cycle || ''} · <strong>Working Days:</strong> {d.working_days || '—'} · <strong>Daily Entries:</strong> {d.daily_entries_count || 0}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div><span style={{ color: 'var(--erp-muted)' }}>Per Diem:</span> <strong>{fmt(d.total_perdiem)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Transport:</span> <strong>{fmt(d.total_transpo)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>ORE:</span> <strong>{fmt(d.total_ore)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Reimbursable:</span> <strong style={{ color: '#059669' }}>{fmt(d.total_reimbursable)}</strong></div>
            {d.travel_advance > 0 && <div><span style={{ color: 'var(--erp-muted)' }}>Advance:</span> <strong>{fmt(d.travel_advance)}</strong></div>}
            {d.balance_on_hand != null && <div><span style={{ color: 'var(--erp-muted)' }}>Balance:</span> <strong style={{ color: (d.balance_on_hand || 0) >= 0 ? '#059669' : '#dc2626' }}>{fmt(d.balance_on_hand)}</strong></div>}
          </div>
        </div>
      )}

      {/* Car Logbook Details */}
      {module === 'CAR_LOGBOOK' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Period:</strong> {d.period} {d.cycle || ''} {d.entry_date ? `· Date: ${new Date(d.entry_date).toLocaleDateString()}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            <div><span style={{ color: 'var(--erp-muted)' }}>Total KM:</span> <strong>{d.total_km || 0}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Official:</span> <strong>{d.official_km || 0} km</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Personal:</span> <strong>{d.personal_km || 0} km</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Fuel Total:</span> <strong>{fmt(d.total_fuel_amount)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Official Gas:</span> <strong>{fmt(d.official_gas_amount)}</strong></div>
            <div><span style={{ color: 'var(--erp-muted)' }}>Efficiency:</span> <strong>{d.km_per_liter || '—'} km/L</strong></div>
            {d.overconsumption_flag && <div><span style={{ padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>OVERCONSUMPTION</span></div>}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--erp-muted)' }}>{d.fuel_entries_count || 0} fuel entries · {d.actual_liters || 0}L total</div>
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
        </div>
      )}

      {/* Expenses (ORE/ACCESS) Details */}
      {module === 'EXPENSES' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Period:</strong> {d.period} {d.cycle || ''} · <strong>Lines:</strong> {d.line_count || 0}
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontWeight: 700 }}>
            <span>ORE: {fmt(d.total_ore)}</span>
            <span>ACCESS: {fmt(d.total_access)}</span>
            <span>Total: {fmt(d.total_amount)}</span>
            {d.total_vat > 0 && <span>VAT: {fmt(d.total_vat)}</span>}
          </div>
          {(d.lines || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Type</th><th style={{ padding: '4px 8px', textAlign: 'left' }}>Category</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount</th><th style={{ padding: '4px 8px' }}>OR#</th><th style={{ padding: '4px 8px' }}>CALF?</th><th style={{ padding: '4px 8px' }}>OR</th></tr></thead>
              <tbody>
                {(d.lines || []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{l.expense_type}</td>
                    <td style={{ padding: '3px 8px' }}>{l.expense_category}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(l.amount)}</td>
                    <td style={{ padding: '3px 8px' }}>{l.or_number || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'center' }}>{l.calf_required ? 'Yes' : '—'}</td>
                    <td style={{ padding: '3px 8px' }}>{l.or_photo_url && <img src={l.or_photo_url} alt="OR" style={{ maxWidth: 40, maxHeight: 30, borderRadius: 4, cursor: 'pointer' }} onClick={() => onPreviewImage?.(l.or_photo_url)} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* PRF/CALF Details */}
      {module === 'PRF_CALF' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Type:</strong> {d.doc_type} {d.prf_type ? `(${d.prf_type})` : ''} · <strong>Period:</strong> {d.period} {d.cycle || ''}
          </div>
          {d.doc_type === 'PRF' && (
            <div style={{ marginBottom: 6 }}>
              <strong>Payee:</strong> {d.payee_name || '—'} ({d.payee_type || '—'}) · <strong>Rebate:</strong> {fmt(d.rebate_amount)} · <strong>Payment:</strong> {d.payment_mode || '—'}
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
          {d.bir_flag && <div style={{ fontSize: 11, color: 'var(--erp-muted)', marginTop: 4 }}>BIR: {d.bir_flag}</div>}
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
        </div>
      )}

      {/* Perdiem Override Details */}
      {module === 'PERDIEM_OVERRIDE' && (
        <div>
          <div style={{ marginBottom: 6 }}><strong>Type:</strong> {d.doc_type || '—'}</div>
          <div style={{ marginBottom: 6 }}><strong>Requested by:</strong> {d.requested_by || '—'}</div>
          {d.amount != null && <div style={{ marginBottom: 6 }}><strong>Amount:</strong> {fmt(d.amount)}</div>}
          {d.description && <div style={{ color: 'var(--erp-muted)' }}>{d.description}</div>}
        </div>
      )}

      {/* ─── Phase 31 new panels ─── */}

      {/* IC Transfer / IC Settlement Details */}
      {module === 'IC_TRANSFER' && d.kind === 'IC_SETTLEMENT' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>CR#:</strong> {d.cr_no || '—'} · <strong>Date:</strong> {d.cr_date ? new Date(d.cr_date).toLocaleDateString() : '—'} · <strong>Payment:</strong> {d.payment_mode || '—'} {d.check_no ? `#${d.check_no}` : ''}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>From:</strong> {d.debtor_entity || '—'} → <strong>To:</strong> {d.creditor_entity || '—'}
          </div>
          <div style={{ fontWeight: 700 }}>Amount: {fmt(d.cr_amount)}</div>
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
        </div>
      )}

      {module === 'IC_TRANSFER' && d.kind !== 'IC_SETTLEMENT' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Ref:</strong> {d.transfer_ref || '—'} · <strong>Date:</strong> {d.transfer_date ? new Date(d.transfer_date).toLocaleDateString() : '—'}
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
          <div style={{ marginTop: 8, fontWeight: 700 }}>Total: {fmt(d.total_amount)}</div>
          {d.notes && <div style={{ color: 'var(--erp-muted)', marginTop: 6 }}>{d.notes}</div>}
        </div>
      )}

      {/* Journal Entry Details */}
      {module === 'JOURNAL' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Ref:</strong> {d.je_number || '—'} · <strong>Date:</strong> {d.je_date ? new Date(d.je_date).toLocaleDateString() : '—'} · <strong>Source:</strong> {d.source_module || '—'}
            {d.is_reversal && <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700 }}>REVERSAL</span>}
          </div>
          {d.source_doc_ref && <div style={{ marginBottom: 6 }}><strong>Source Doc:</strong> {d.source_doc_ref}</div>}
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
              ⚠ Unbalanced: debits and credits don't match
            </div>
          )}
        </div>
      )}

      {/* Banking / Bank Reconciliation Details */}
      {module === 'BANKING' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Account:</strong> {d.bank_account || '—'}{d.coa_code ? ` · COA ${d.coa_code}` : ''}
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
        </div>
      )}

      {/* Purchasing / Supplier Invoice Details */}
      {module === 'PURCHASING' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Invoice#:</strong> {d.invoice_ref || '—'} · <strong>Date:</strong> {d.invoice_date ? new Date(d.invoice_date).toLocaleDateString() : '—'}
            {d.due_date && <> · <strong>Due:</strong> {new Date(d.due_date).toLocaleDateString()}</>}
          </div>
          <div style={{ marginBottom: 6 }}>
            <strong>Vendor:</strong> {d.vendor_name || '—'}{d.vendor_tin ? ` (TIN ${d.vendor_tin})` : ''}
            {d.po_number && <> · <strong>PO#:</strong> {d.po_number}</>}
          </div>
          {(d.line_items || []).length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--erp-accent-soft, #e8efff)' }}><th style={{ padding: '4px 8px', textAlign: 'left' }}>Item</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Qty</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Unit Price</th><th style={{ padding: '4px 8px', textAlign: 'right' }}>Line Total</th></tr></thead>
              <tbody>
                {(d.line_items || []).map((li, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 8px' }}>{li.product_name || li.item_key || li.description || '—'}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{li.qty}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.unit_price)}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(li.line_total)}</td>
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
        </div>
      )}

      {/* Petty Cash Details */}
      {module === 'PETTY_CASH' && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>Txn#:</strong> {d.txn_number || d.txn_no || '—'} · <strong>Type:</strong> <span style={{ padding: '2px 6px', borderRadius: 4, background: d.txn_type === 'DEPOSIT' ? '#dcfce7' : '#fef3c7', color: d.txn_type === 'DEPOSIT' ? '#166534' : '#854d0e', fontSize: 11, fontWeight: 700 }}>{d.txn_type || '—'}</span> · <strong>Date:</strong> {d.txn_date ? new Date(d.txn_date).toLocaleDateString() : '—'}
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
        </div>
      )}

    </>
  );
}
