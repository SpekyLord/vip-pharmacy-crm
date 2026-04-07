/**
 * Credit Note HTML Template — Phase 25
 * Return/Credit Note printable document
 */
function renderCreditNote(cn, lineProducts = []) {
  const dateStr = cn.cn_date
    ? new Date(cn.cn_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const customerName = cn.hospital_id?.hospital_name || cn.customer_id?.customer_name || '';

  const REASON_LABELS = {
    DAMAGED: 'Damaged', EXPIRED: 'Expired', WRONG_ITEM: 'Wrong Item',
    EXCESS_STOCK: 'Excess Stock', QUALITY_ISSUE: 'Quality Issue', RECALL: 'Recall', OTHER: 'Other'
  };

  const lineItemsHtml = (cn.line_items || []).map((item, i) => {
    const prod = lineProducts.find(p => p._id?.toString() === item.product_id?.toString());
    const productName = prod?.brand_name || prod?.product_name || item.item_key || 'Item';
    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${productName}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.batch_lot_no || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.line_total || item.qty * item.unit_price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${REASON_LABELS[item.return_reason] || item.return_reason}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Credit Note - ${cn.cn_number || cn._id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #c0392b; }
    .header h1 { font-size: 18px; margin-bottom: 4px; color: #c0392b; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .meta-item { font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #fef2f2; padding: 8px; text-align: left; border-bottom: 2px solid #c0392b; font-size: 12px; color: #991b1b; }
    .totals { text-align: right; margin-top: 8px; }
    .totals .row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 4px; }
    .totals .row.grand { font-weight: bold; font-size: 16px; border-top: 2px solid #c0392b; padding-top: 8px; margin-top: 8px; color: #c0392b; }
    .footer { margin-top: 24px; display: flex; justify-content: space-between; }
    .sig-block { width: 45%; text-align: center; padding-top: 40px; border-top: 1px solid #333; font-size: 12px; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #c0392b; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print { .print-btn { display: none; } body { padding: 10px; font-size: 11px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>CREDIT NOTE</h1>
    <div>${cn.cn_number || ''}</div>
  </div>
  <div class="meta">
    <div class="meta-item"><strong>Customer:</strong> ${customerName}</div>
    <div class="meta-item"><strong>Date:</strong> ${dateStr}</div>
    ${cn.original_doc_ref ? `<div class="meta-item"><strong>Ref Invoice:</strong> ${cn.original_doc_ref}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th>Product</th>
        <th>Batch</th>
        <th style="text-align:center;width:50px;">Qty</th>
        <th style="text-align:right;width:80px;">Price</th>
        <th style="text-align:right;width:90px;">Amount</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>
  <div class="totals">
    ${cn.total_vat > 0 ? `
      <div class="row"><span>Net of VAT:</span><span>${formatCurrency(cn.total_net_of_vat)}</span></div>
      <div class="row"><span>VAT (12%):</span><span>${formatCurrency(cn.total_vat)}</span></div>
    ` : ''}
    <div class="row grand"><span>CREDIT TOTAL:</span><span>${formatCurrency(cn.credit_total)}</span></div>
  </div>
  ${cn.notes ? `<div style="margin-top:12px;padding:8px;background:#f9f9f9;border-radius:4px;font-size:12px;"><strong>Notes:</strong> ${cn.notes}</div>` : ''}
  <div class="footer">
    <div class="sig-block">Prepared By</div>
    <div class="sig-block">Approved By</div>
  </div>
  <button class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
}

module.exports = { renderCreditNote };
