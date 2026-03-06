/**
 * AWS SES Configuration
 *
 * This file handles:
 * - AWS SES client initialization
 * - Email sending operations
 * - Sandbox mode for development (logs instead of sending)
 *
 * Reuses same AWS credentials as S3 (IAM user needs ses:SendEmail permission)
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// Initialize SES Client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@vipcrm.com';
const isSandbox = process.env.SES_SANDBOX_MODE !== 'false';

/**
 * Send an email via AWS SES (or log in sandbox mode)
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML body
 * @param {string} options.text - Plain text body
 * @returns {Promise<{messageId: string|null}>}
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (isSandbox) {
    console.log('=== SES SANDBOX MODE (email not sent) ===');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text: ${text?.substring(0, 200)}...`);
    console.log('==========================================');
    return { messageId: null };
  }

  const command = new SendEmailCommand({
    Source: fromEmail,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' },
      },
    },
  });

  const result = await sesClient.send(command);
  return { messageId: result.MessageId };
};

/**
 * Check if SES configuration is valid
 * @returns {boolean}
 */
const isConfigured = () => {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.SES_FROM_EMAIL
  );
};

module.exports = {
  sesClient,
  sendEmail,
  isConfigured,
  fromEmail,
  isSandbox,
};
