/**
 * Petty Cash Form HTML Template — Phase 19
 * Shared for both REMITTANCE and REPLENISHMENT forms
 * Mobile-friendly for WiFi printers via window.print()
 */

function renderPettyCashForm(doc, fund, transactions = []) {
  const isRemittance = doc.doc_type === 'REMITTANCE';
  const title = isRemittance ? 'PETTY CASH REMITTANCE SLIP' : 'PETTY CASH REPLENISHMENT SLIP';
  const dateStr = doc.doc_date
    ? new Date(doc.doc_date).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const custodianName = doc.custodian_id?.name || doc.custodian_id?.email || '';
  const fundName = fund?.fund_name || '';
  const fundCode = fund?.fund_code || '';

  let txnRowsHtml = '';
  if (transactions.length) {
    txnRowsHtml = transactions.map((txn, i) => {
      const txnDate = txn.txn_date
        ? new Date(txn.txn_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        : '';
      const desc = txn.source_description || txn.particulars || txn.payee || txn.txn_type;
      return `
        <tr>
          <td style="padding:5px 8px;border-bottom:1px solid #eee;">${i + 1}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #eee;">${txnDate}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #eee;">${desc}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #eee;">${txn.or_number || ''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(txn.amount)}</td>
        </tr>`;
    }).join('');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${doc.doc_number || ''}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #333; }
    .header h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { margin-bottom: 16px; }
    .meta-row { display: flex; justify-content: space-between; margin-bottom: 4px; flex-wrap: wrap; gap: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f5f5f5; padding: 8px; text-align: left; border-bottom: 2px solid #333; font-size: 12px; }
    .total-row { font-weight: bold; font-size: 15px; text-align: right; padding: 12px 8px; border-top: 2px solid #333; }
    .signatures { display: flex; justify-content: space-between; margin-top: 40px; gap: 20px; }
    .sig-block { flex: 1; text-align: center; }
    .sig-line { border-top: 1px solid #333; margin-top: 50px; padding-top: 4px; font-size: 12px; }
    .sig-name { font-weight: bold; margin-top: 4px; }
    .print-btn { display: block; margin: 20px auto; padding: 10px 24px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
    @media print {
      .print-btn { display: none; }
      body { padding: 10px; font-size: 11px; }
      .signatures { margin-top: 60px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div>${doc.doc_number || ''}</div>
  </div>

  <div class="meta">
    <div class="meta-row">
      <span><strong>Fund:</strong> ${fundName} (${fundCode})</span>
      <span><strong>Date:</strong> ${dateStr}</span>
    </div>
    <div class="meta-row">
      <span><strong>Custodian:</strong> ${custodianName}</span>
      <span><strong>Amount:</strong> ${formatCurrency(doc.amount)}</span>
    </div>
  </div>

  ${transactions.length ? `
  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th style="width:80px;">Date</th>
        <th>Description</th>
        <th style="width:80px;">OR#</th>
        <th style="text-align:right;width:100px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${txnRowsHtml}
    </tbody>
  </table>
  ` : ''}

  <div class="total-row">
    TOTAL ${isRemittance ? 'REMITTANCE' : 'REPLENISHMENT'}: ${formatCurrency(doc.amount)}
  </div>

  ${doc.notes ? `<div style="margin-top:12px;font-size:12px;"><strong>Notes:</strong> ${doc.notes}</div>` : ''}

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line">Prepared By (Custodian/eBDM)</div>
      <div class="sig-name">${custodianName}</div>
    </div>
    <div class="sig-block">
      <div class="sig-line">${isRemittance ? 'Received By (Owner/President)' : 'Approved By (Owner/President)'}</div>
      <div class="sig-name"></div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">Print</button>
</body>
</html>`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount || 0);
}

module.exports = { renderPettyCashForm };
