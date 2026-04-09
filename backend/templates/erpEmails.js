/**
 * ERP Email Templates
 *
 * HTML email templates for ERP document status notifications.
 * Each template function returns { subject, html, text } for use with Resend/SES.
 */

/**
 * Shared base HTML layout with VIP ERP branding
 */
const baseLayout = (title, body) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1e40af;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">VIP ERP</h1>
              <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Pharmaceutical Distribution Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                This is an automated notification from VIP ERP. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Status badge color mapping
 */
const statusColors = {
  POSTED: { bg: '#059669', text: '#ffffff', label: 'Posted' },
  APPROVED: { bg: '#2563eb', text: '#ffffff', label: 'Approved' },
  REJECTED: { bg: '#dc2626', text: '#ffffff', label: 'Rejected' },
  REOPENED: { bg: '#d97706', text: '#ffffff', label: 'Reopened' },
  OVERDUE: { bg: '#dc2626', text: '#ffffff', label: 'Overdue' },
  PENDING_APPROVAL: { bg: '#7c3aed', text: '#ffffff', label: 'Pending Approval' },
};

const statusBadge = (status) => {
  const s = statusColors[status] || { bg: '#6b7280', text: '#ffffff', label: status };
  return `<span style="display:inline-block;padding:4px 12px;border-radius:12px;background:${s.bg};color:${s.text};font-size:12px;font-weight:600;">${s.label}</span>`;
};

// ─── Document Posted Notification ───────────────────────────────────

/**
 * Notify admin/finance when a document is posted
 * @param {Object} data
 * @param {string} data.recipientName
 * @param {string} data.module - e.g., 'Sales', 'Collections', 'Expenses'
 * @param {string} data.docType - e.g., 'CSI', 'CR', 'SMER'
 * @param {string} data.docRef - document reference number
 * @param {string} data.postedBy - name of user who posted
 * @param {string} data.entityName - entity name
 * @param {number} data.amount - total amount (optional)
 * @param {string} data.period - e.g., '2026-04'
 */
const documentPostedTemplate = (data) => {
  const { recipientName, module, docType, docRef, postedBy, entityName, amount, period } = data;
  const subject = `VIP ERP - ${docType} ${docRef || ''} Posted [${entityName}]`;

  const amountRow = amount != null
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1f2937;">₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>`
    : '';

  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Document Posted ${statusBadge('POSTED')}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      A <strong>${docType}</strong> document has been posted in the <strong>${module}</strong> module.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Module</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${module}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Document Type</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${docType}</td></tr>
      ${docRef ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Reference</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${docRef}</td></tr>` : ''}
      ${amountRow}
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Period</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${period || 'N/A'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Posted By</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${postedBy}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Entity</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${entityName}</td></tr>
    </table>`;

  const text = `Hi ${recipientName},\n\nA ${docType} document has been posted in ${module}.\nReference: ${docRef || 'N/A'}\n${amount != null ? `Amount: ₱${amount}\n` : ''}Period: ${period || 'N/A'}\nPosted By: ${postedBy}\nEntity: ${entityName}`;

  return { subject, html: baseLayout(subject, body), text };
};

// ─── Document Reopened Notification ─────────────────────────────────

const documentReopenedTemplate = (data) => {
  const { recipientName, module, docType, docRef, reopenedBy, entityName, reason } = data;
  const subject = `VIP ERP - ${docType} ${docRef || ''} Reopened [${entityName}]`;

  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Document Reopened ${statusBadge('REOPENED')}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      A previously posted <strong>${docType}</strong> document has been <strong>reopened</strong> in the <strong>${module}</strong> module. Journal entries have been reversed.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Module</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${module}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Document</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${docType} ${docRef || ''}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Reopened By</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${reopenedBy}</td></tr>
      ${reason ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Reason</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${reason}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Entity</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${entityName}</td></tr>
    </table>
    <p style="margin:0;color:#dc2626;font-size:13px;font-weight:600;">Action required: Review the reopened document and any reversed journal entries.</p>`;

  const text = `Hi ${recipientName},\n\nA ${docType} document (${docRef || 'N/A'}) has been reopened in ${module}.\nReopened By: ${reopenedBy}\n${reason ? `Reason: ${reason}\n` : ''}Entity: ${entityName}\n\nPlease review the reopened document and reversed journal entries.`;

  return { subject, html: baseLayout(subject, body), text };
};

// ─── Approval Request Notification ──────────────────────────────────

const approvalRequestTemplate = (data) => {
  const { recipientName, module, docType, docRef, requestedBy, entityName, amount, description } = data;
  const subject = `VIP ERP - Approval Required: ${docType} ${docRef || ''} [${entityName}]`;

  const amountRow = amount != null
    ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Amount</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1f2937;">₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>`
    : '';

  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Approval Required ${statusBadge('PENDING_APPROVAL')}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      A <strong>${docType}</strong> document requires your approval.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Module</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${module}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Document</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${docType} ${docRef || ''}</td></tr>
      ${amountRow}
      ${description ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Description</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${description}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Requested By</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${requestedBy}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Entity</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${entityName}</td></tr>
    </table>
    <p style="margin:0;color:#7c3aed;font-size:13px;font-weight:600;">Please log in to the ERP to review and approve or reject this document.</p>`;

  const text = `Hi ${recipientName},\n\nA ${docType} document requires your approval.\nReference: ${docRef || 'N/A'}\n${amount != null ? `Amount: ₱${amount}\n` : ''}Requested By: ${requestedBy}\nEntity: ${entityName}\n\nPlease log in to review.`;

  return { subject, html: baseLayout(subject, body), text };
};

// ─── Approval Decision Notification ─────────────────────────────────

const approvalDecisionTemplate = (data) => {
  const { recipientName, module, docType, docRef, decision, decidedBy, entityName, reason } = data;
  const statusKey = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  const subject = `VIP ERP - ${docType} ${docRef || ''} ${decision} [${entityName}]`;

  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Approval Decision ${statusBadge(statusKey)}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Your <strong>${docType}</strong> document has been <strong>${decision.toLowerCase()}</strong>.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Module</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${module}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Document</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${docType} ${docRef || ''}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Decision</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${decision}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Decided By</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${decidedBy}</td></tr>
      ${reason ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Reason</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${reason}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Entity</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${entityName}</td></tr>
    </table>`;

  const text = `Hi ${recipientName},\n\nYour ${docType} document (${docRef || 'N/A'}) has been ${decision.toLowerCase()}.\nDecided By: ${decidedBy}\n${reason ? `Reason: ${reason}\n` : ''}Entity: ${entityName}`;

  return { subject, html: baseLayout(subject, body), text };
};

// ─── Payroll Posted Notification ────────────────────────────────────

const payrollPostedTemplate = (data) => {
  const { recipientName, period, cycle, postedCount, totalNetPay, postedBy, entityName } = data;
  const subject = `VIP ERP - Payroll Posted: ${period} ${cycle} [${entityName}]`;

  const body = `
    <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Payroll Posted ${statusBadge('POSTED')}</h2>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">Hi ${recipientName},</p>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;">
      Payroll for <strong>${period} ${cycle}</strong> has been posted.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Period</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${period} ${cycle}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Payslips Posted</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${postedCount}</td></tr>
      ${totalNetPay != null ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Total Net Pay</td><td style="padding:8px 0;font-size:14px;font-weight:600;color:#1f2937;">₱${Number(totalNetPay).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Posted By</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${postedBy}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;">Entity</td><td style="padding:8px 0;font-size:14px;color:#1f2937;">${entityName}</td></tr>
    </table>`;

  const text = `Hi ${recipientName},\n\nPayroll for ${period} ${cycle} has been posted.\nPayslips: ${postedCount}\n${totalNetPay != null ? `Total Net Pay: ₱${totalNetPay}\n` : ''}Posted By: ${postedBy}\nEntity: ${entityName}`;

  return { subject, html: baseLayout(subject, body), text };
};

module.exports = {
  documentPostedTemplate,
  documentReopenedTemplate,
  approvalRequestTemplate,
  approvalDecisionTemplate,
  payrollPostedTemplate,
};
