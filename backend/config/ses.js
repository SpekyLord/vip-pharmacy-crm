/**
 * Email Configuration (Resend)
 *
 * Drop-in replacement for the previous AWS SES config.
 * Exports the same interface: sendEmail, isConfigured, fromEmail, isSandbox
 *
 * Setup:
 * 1. Sign up at https://resend.com
 * 2. Verify your sending domain in the Resend dashboard
 * 3. Create an API key and set RESEND_API_KEY in .env
 * 4. Set RESEND_FROM_EMAIL to a verified sender (e.g. noreply@yourdomain.com)
 */

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@vipcrm.com';
const isSandbox = process.env.SES_SANDBOX_MODE !== 'false';

/**
 * Send an email via Resend (or log in sandbox mode)
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} options.text - Plain text body
 * @returns {Promise<{messageId: string|null}>}
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (isSandbox) {
    console.log('=== EMAIL SANDBOX MODE (email not sent) ===');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text: ${text?.substring(0, 200)}...`);
    console.log('===========================================');
    return { messageId: null };
  }

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: [to],
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { messageId: data.id };
};

/**
 * Check if email configuration is valid
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
};

module.exports = {
  sendEmail,
  isConfigured,
  fromEmail,
  isSandbox,
};
