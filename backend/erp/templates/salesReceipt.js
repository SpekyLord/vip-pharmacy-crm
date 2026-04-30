/**
 * Sales Receipt HTML Template — Phase 18
 * Flexible: VIP pharma (product+batch+expiry) vs BLW (description)
 * No company header. Mobile-friendly for WiFi printers via window.print()
 */

function renderSalesReceipt(sale, lineProducts = []) {
  const isService = sale.sale_type === 'SERVICE_INVOICE';
  const docNumber = sale.invoice_number || sale.doc_ref || '';
  const customerName = sale.hospital_id?.hospital_name
    || sale.customer_id?.customer_name
    || sale.customer_name || '';
  const dateStr = sale.csi_date
    ? new Date(sale.csi_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  let lineItemsHtml = '';

  if (isService) {
    lineItemsHtml = `
      <tr>
        <td colspan="4" style="padding:8px;border-bottom:1px solid #ddd;">${sale.service_description || 'Service'}</td>
        <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">
          ${formatCurrency(sale.invoice_total || 0)}
        </td>
      </tr>`;
  } else if (sale.line_items?.length) {
    lineItemsHtml = sale.line_items.map((item, i) => {
      const prod = lineProducts.find(p => p._id?.toString() === item.product_id?.toString());
      const productName = prod?.brand_name || prod?.product_name || item.item_key || 'Item';
      const batchInfo = item.batch_lot_no ? ` | Batch: ${item.batch_lot_no}` : '';
      const expiryInfo = item.expiry_date
        ? ` | Exp: ${new Date(item.expiry_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })}`
        : '';
      // Phase R2 — show GROSS amount per line; per-line discount is shown in
      // a small chip under the product name, the discount sum is in the totals
      // block. Keeps `Qty × Price = Amount` math correct on the printed line.
      const grossAmount = Number(item.line_gross_amount)
        || (Number(item.qty) || 0) * (Number(item.unit_price) || 0);
      const discountPct = Number(item.line_discount_percent) || 0;
      const discountChip = discountPct > 0
        ? `<div style="font-size:11px;color:#b45309;margin-top:2px;">Less ${discountPct}% (${formatCurrency(item.line_discount_amount || 0)})</div>`
        : '';

      return `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i + 1}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;">
            ${productName}${batchInfo}${expiryInfo}
            ${discountChip}
          </td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.qty}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.unit_price)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(grossAmount)}</td>
        </tr>`;
    }).join('');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${sale.sale_type === 'SERVICE_INVOICE' ? 'Service Invoice' : 'Sales Receipt'} - ${docNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .meta-item { font-size: 13px; }
    .meta-item strong { display: inline; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 12px; }
    .totals { text-align: right; margin-top: 8px; }
    .totals .row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 4px; }
    .totals .row.grand { font-weight: bold; font-size: 16px; border-top: 2px solid #333; padding-top: 8px; margin-top: 8px; }
    .payment-note { margin-top: 16px; padding: 8px; background: #f9f9f9; border-radius: 4px; text-align: center; font-size: 12px; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print {
      .print-btn { display: none; }
      body { padding: 10px; font-size: 11px; }
      .header h1 { font-size: 16px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${sale.sale_type === 'SERVICE_INVOICE' ? 'SERVICE INVOICE' : sale.sale_type === 'CASH_RECEIPT' ? 'CASH RECEIPT' : 'SALES INVOICE'}</h1>
    <div>${docNumber}</div>
  </div>

  <div class="meta">
    <div class="meta-item"><strong>Customer:</strong> ${customerName}</div>
    <div class="meta-item"><strong>Date:</strong> ${dateStr}</div>
    ${sale.payment_mode ? `<div class="meta-item"><strong>Payment:</strong> ${sale.payment_mode}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th>Description</th>
        <th style="text-align:center;width:60px;">Qty</th>
        <th style="text-align:right;width:90px;">Price</th>
        <th style="text-align:right;width:100px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHtml}
    </tbody>
  </table>

  <div class="totals">
    ${sale.total_discount > 0 ? `
      <div class="row"><span>Total Sales (VAT Inclusive):</span><span>${formatCurrency(sale.total_gross_before_discount || ((sale.invoice_total || 0) + (sale.total_discount || 0)))}</span></div>
      <div class="row" style="color:#b45309;"><span>Less: Discount:</span><span>(${formatCurrency(sale.total_discount)})</span></div>
    ` : ''}
    ${sale.total_vat > 0 ? `
      <div class="row"><span>Net of VAT:</span><span>${formatCurrency(sale.total_net_of_vat)}</span></div>
      <div class="row"><span>VAT (12%):</span><span>${formatCurrency(sale.total_vat)}</span></div>
    ` : ''}
    <div class="row grand"><span>TOTAL:</span><span>${formatCurrency(sale.invoice_total)}</span></div>
  </div>

  ${sale.payment_mode ? '<div class="payment-note">Payment Received</div>' : ''}

  <button class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
}

module.exports = { renderSalesReceipt };
