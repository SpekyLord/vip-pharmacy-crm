/**
 * Purchase Order HTML Template
 * Printable PO document for screenshot/PDF sharing via messenger or email.
 */
function renderPurchaseOrderHtml(po, lineProducts = []) {
  const fmtDate = (d) => d
    ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const fmtNum = (n) => (n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const entityName = po.entity_id?.entity_name || '';

  const vendorName = po.vendor_id?.vendor_name || '';
  const vendorCode = po.vendor_id?.vendor_code || '';
  const warehouseName = po.warehouse_id?.warehouse_name || '';
  const warehouseCode = po.warehouse_id?.warehouse_code || '';
  const warehouseAddress = [po.warehouse_id?.location?.address, po.warehouse_id?.location?.city, po.warehouse_id?.location?.region].filter(Boolean).join(', ');
  const contactPerson = po.warehouse_id?.contact_person || '';
  const contactPhone = po.warehouse_id?.contact_phone || '';

  const createdByName = po.created_by
    ? `${po.created_by.firstName || ''} ${po.created_by.lastName || ''}`.trim()
    : '';
  const approvedByName = po.approved_by
    ? `${po.approved_by.firstName || ''} ${po.approved_by.lastName || ''}`.trim()
    : '';

  const lineItemsHtml = (po.line_items || []).map((item, i) => {
    const prod = lineProducts.find(p => p._id?.toString() === item.product_id?.toString());
    // Global rule 4: show brand_name + dosage_strength
    const productName = prod
      ? `${prod.brand_name || prod.product_name || ''}${prod.dosage_strength ? ' ' + prod.dosage_strength : ''}`.trim()
      : item.item_key || 'Item';
    const unitCode = item.uom || prod?.purchase_uom || prod?.unit_code || '';
    const lineTotal = (item.qty_ordered || 0) * (item.unit_price || 0);

    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${productName}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${unitCode}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.qty_ordered || 0}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${fmtNum(item.unit_price)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${fmtNum(lineTotal)}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PO ${po.po_number || po._id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 18px; margin-bottom: 4px; }
    .header .po-num { font-size: 15px; font-weight: 600; margin-bottom: 2px; }
    .header .status { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; background: #e2e8f0; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-bottom: 16px; font-size: 13px; }
    .meta-item strong { display: inline; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 12px; }
    .totals { text-align: right; margin-bottom: 16px; font-size: 13px; }
    .totals div { padding: 3px 0; }
    .totals .grand { font-size: 15px; font-weight: 700; border-top: 2px solid #333; padding-top: 6px; margin-top: 4px; }
    .notes { margin-bottom: 16px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; font-size: 12px; }
    .footer { margin-top: 32px; display: flex; justify-content: space-between; }
    .sig-block { width: 45%; text-align: center; padding-top: 40px; border-top: 1px solid #333; font-size: 12px; }
    .sig-name { font-weight: 600; margin-top: 4px; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print { .print-btn { display: none; } body { padding: 10px; font-size: 11px; } }
  </style>
</head>
<body>
  <div class="header">
    ${entityName ? `<div style="font-size:16px;font-weight:700;margin-bottom:2px;">${entityName}</div>` : ''}
    <h1>PURCHASE ORDER</h1>
    <div class="po-num">${po.po_number || '—'}</div>
    <span class="status">${po.status}</span>
  </div>

  <div class="meta">
    <div class="meta-item"><strong>Vendor:</strong> ${vendorName}${vendorCode ? ' (' + vendorCode + ')' : ''}</div>
    <div class="meta-item"><strong>Warehouse:</strong> ${warehouseName}${warehouseCode ? ' (' + warehouseCode + ')' : ''}</div>
    ${warehouseAddress ? `<div class="meta-item" style="grid-column:1/-1;"><strong>Delivery Address:</strong> ${warehouseAddress}</div>` : ''}
    ${contactPerson || contactPhone ? `<div class="meta-item" style="grid-column:1/-1;"><strong>Contact:</strong> ${contactPerson}${contactPerson && contactPhone ? ' — ' : ''}${contactPhone}</div>` : ''}
    <div class="meta-item"><strong>PO Date:</strong> ${fmtDate(po.po_date)}</div>
    <div class="meta-item"><strong>Expected Delivery:</strong> ${fmtDate(po.expected_delivery_date)}</div>
    <div class="meta-item"><strong>Created By:</strong> ${createdByName || '—'}</div>
    <div class="meta-item"><strong>Approved By:</strong> ${approvedByName || '—'}${po.approved_at ? ' on ' + fmtDate(po.approved_at) : ''}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px;text-align:center;">#</th>
        <th>Product</th>
        <th style="text-align:center;width:60px;">Unit</th>
        <th style="text-align:center;width:60px;">Qty</th>
        <th style="text-align:right;width:90px;">Unit Price</th>
        <th style="text-align:right;width:100px;">Total</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>

  <div class="totals">
    <div><strong>Net of VAT:</strong> ${fmtNum(po.net_amount)}</div>
    <div><strong>VAT (12%):</strong> ${fmtNum(po.vat_amount)}</div>
    <div class="grand">Grand Total: ${fmtNum(po.total_amount)}</div>
  </div>

  ${po.notes ? `<div class="notes"><strong>Notes:</strong> ${po.notes}</div>` : ''}

  ${(po.activity_log && po.activity_log.length > 0) ? `
  <div style="margin:12px 0;">
    <strong style="font-size:13px;">Activity Log</strong>
    <table style="width:100%;margin-top:6px;font-size:11px;border-collapse:collapse;">
      <thead><tr>
        <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #333;font-size:10px;">Date</th>
        <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #333;font-size:10px;">By</th>
        <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #333;font-size:10px;">Status</th>
        <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #333;font-size:10px;">Note</th>
        <th style="text-align:left;padding:4px 6px;border-bottom:1px solid #333;font-size:10px;">Waybill</th>
      </tr></thead>
      <tbody>${po.activity_log.map(a => {
        const byName = ((a.created_by?.firstName || '') + ' ' + (a.created_by?.lastName || '')).trim();
        return `<tr>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;">${fmtDate(a.created_at)}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;">${byName}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;">${a.status_snapshot || ''}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;">${a.message || ''}</td>
        <td style="padding:3px 6px;border-bottom:1px solid #eee;font-weight:600;">${a.courier_waybill || ''}</td>
      </tr>`;
      }).join('')}</tbody>
    </table>
  </div>` : ''}

  <div class="footer">
    <div class="sig-block">
      Prepared By
      ${createdByName ? `<div class="sig-name">${createdByName}</div>` : ''}
    </div>
    <div class="sig-block">
      Approved By
      ${approvedByName ? `<div class="sig-name">${approvedByName}</div>` : ''}
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;
}

module.exports = { renderPurchaseOrderHtml };
