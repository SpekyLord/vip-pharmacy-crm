/**
 * GRN Receipt HTML Template — Phase 25
 * Goods Received Note printable document
 */
function renderGrnReceipt(grn, lineProducts = []) {
  const dateStr = grn.grn_date
    ? new Date(grn.grn_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const lineItemsHtml = (grn.line_items || []).map((item, i) => {
    const prod = lineProducts.find(p => p._id?.toString() === item.product_id?.toString());
    const productName = prod?.brand_name || prod?.product_name || item.item_key || 'Item';
    const expiryStr = item.expiry_date
      ? new Date(item.expiry_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })
      : '—';

    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${productName}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.batch_lot_no || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${expiryStr}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
      </tr>`;
  }).join('');

  const totalQty = (grn.line_items || []).reduce((sum, li) => sum + (li.qty || 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GRN - ${grn._id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .meta-item { font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 12px; }
    .footer { margin-top: 24px; display: flex; justify-content: space-between; }
    .sig-block { width: 45%; text-align: center; padding-top: 40px; border-top: 1px solid #333; font-size: 12px; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print { .print-btn { display: none; } body { padding: 10px; font-size: 11px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>GOODS RECEIVED NOTE</h1>
    <div>Status: ${grn.status}</div>
  </div>
  <div class="meta">
    <div class="meta-item"><strong>Date:</strong> ${dateStr}</div>
    <div class="meta-item"><strong>Status:</strong> ${grn.status}</div>
    ${grn.notes ? `<div class="meta-item"><strong>Notes:</strong> ${grn.notes}</div>` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th>Product</th>
        <th>Batch/Lot</th>
        <th style="text-align:center;">Expiry</th>
        <th style="text-align:center;width:60px;">Qty</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
    <tfoot>
      <tr style="font-weight:bold;border-top:2px solid #333;">
        <td colspan="4" style="padding:8px;text-align:right;">Total Quantity:</td>
        <td style="padding:8px;text-align:center;">${totalQty}</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">
    <div class="sig-block">Received By</div>
    <div class="sig-block">Approved By</div>
  </div>
  <button class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;
}

module.exports = { renderGrnReceipt };
