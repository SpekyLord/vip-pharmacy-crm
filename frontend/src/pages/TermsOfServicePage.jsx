const pageStyles = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '48px 24px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    color: '#1f2937',
    lineHeight: '1.7',
  },
  h1: { fontSize: '32px', marginBottom: '8px', color: '#111827' },
  meta: { color: '#6b7280', fontSize: '14px', marginBottom: '32px' },
  h2: { fontSize: '22px', marginTop: '32px', marginBottom: '12px', color: '#111827' },
  p: { marginBottom: '16px' },
  ul: { marginBottom: '16px', paddingLeft: '24px' },
  li: { marginBottom: '8px' },
  a: { color: '#2563eb' },
};

export default function TermsOfServicePage() {
  return (
    <div style={pageStyles.container}>
      <h1 style={pageStyles.h1}>Terms of Service</h1>
      <p style={pageStyles.meta}>Last updated: April 18, 2026</p>

      <p style={pageStyles.p}>
        These Terms of Service ("Terms") govern your access to and use of the VIP Pharmacy CRM
        platform and associated messaging integrations (Facebook Messenger, Viber, WhatsApp)
        operated by VIOS Integrated ("we", "us", "our"). By accessing or using the service, you
        agree to be bound by these Terms.
      </p>

      <h2 style={pageStyles.h2}>1. Eligibility and Accounts</h2>
      <p style={pageStyles.p}>
        Access to the CRM is restricted to authorized personnel of VIOS Integrated and its
        business partners. You are responsible for safeguarding your login credentials and for all
        activity that occurs under your account. You must notify us immediately of any unauthorized
        use or security breach.
      </p>

      <h2 style={pageStyles.h2}>2. Acceptable Use</h2>
      <ul style={pageStyles.ul}>
        <li style={pageStyles.li}>
          Use the service only for legitimate pharmaceutical field operations, customer
          communication, and business administration.
        </li>
        <li style={pageStyles.li}>
          Do not attempt to probe, scan, or test the vulnerability of the system without written
          permission.
        </li>
        <li style={pageStyles.li}>
          Do not upload unlawful, misleading, infringing, or harmful content, including falsified
          visit photos or GPS data.
        </li>
        <li style={pageStyles.li}>
          Do not send spam, unsolicited bulk messages, or content that violates Meta, Viber, or
          WhatsApp platform policies.
        </li>
      </ul>

      <h2 style={pageStyles.h2}>3. Messaging Services</h2>
      <p style={pageStyles.p}>
        When you message our Facebook Page, Viber bot, or WhatsApp business number, your messages
        are routed to authorized staff. Outside business hours (Monday–Friday, 8:00 AM – 5:00 PM
        Philippine Time), an automated reply may be sent. Messages are logged for operational,
        audit, and compliance purposes for up to 90 days after the last activity in a conversation,
        then permanently deleted, except where retention is required by law. Details are described
        in our{' '}
        <a href="/privacy" style={pageStyles.a}>
          Privacy Policy
        </a>
        .
      </p>
      <p style={pageStyles.p}>
        Our use of Facebook Messenger, Viber, and WhatsApp integrations is governed by, and we
        comply with, the{' '}
        <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" style={pageStyles.a}>
          Meta Platform Terms
        </a>
        ,{' '}
        <a href="https://developers.facebook.com/devpolicy/" target="_blank" rel="noopener noreferrer" style={pageStyles.a}>
          Meta Developer Policies
        </a>
        ,{' '}
        <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" style={pageStyles.a}>
          WhatsApp Business Messaging Policy
        </a>
        , and Viber business messaging terms. You must not use our messaging services for any
        purpose prohibited by those policies.
      </p>

      <h2 style={pageStyles.h2}>4. Intellectual Property</h2>
      <p style={pageStyles.p}>
        The CRM, including its code, design, logos, and documentation, is owned by VIOS Integrated
        and protected by intellectual property laws. You may not copy, modify, distribute, or
        reverse-engineer the service except as expressly permitted.
      </p>

      <h2 style={pageStyles.h2}>5. User Content</h2>
      <p style={pageStyles.p}>
        You retain ownership of content you submit (visit photos, GPS coordinates, notes,
        messages). You grant us a limited license to store, process, and display that content as
        needed to operate the service and fulfill our contractual and legal obligations.
      </p>

      <h2 style={pageStyles.h2}>6. Termination</h2>
      <p style={pageStyles.p}>
        We may suspend or terminate access to the service at any time for violation of these Terms,
        end of employment or business relationship, or for security reasons. Upon termination, your
        right to use the service ceases immediately.
      </p>

      <h2 style={pageStyles.h2}>7. Disclaimers</h2>
      <p style={pageStyles.p}>
        The service is provided "as is" and "as available" without warranties of any kind, either
        express or implied. We do not warrant that the service will be uninterrupted, error-free,
        or completely secure.
      </p>

      <h2 style={pageStyles.h2}>8. Limitation of Liability</h2>
      <p style={pageStyles.p}>
        To the fullest extent permitted by law, VIOS Integrated shall not be liable for any
        indirect, incidental, consequential, special, or exemplary damages arising out of or in
        connection with your use of the service.
      </p>

      <h2 style={pageStyles.h2}>9. Changes to Terms</h2>
      <p style={pageStyles.p}>
        We may revise these Terms at any time. Material changes will be communicated by updating
        the "Last updated" date on this page. Continued use of the service after such changes
        constitutes acceptance of the revised Terms.
      </p>

      <h2 style={pageStyles.h2}>10. Governing Law</h2>
      <p style={pageStyles.p}>
        These Terms are governed by and construed in accordance with the laws of the Republic of
        the Philippines. Any disputes shall be resolved in the courts of competent jurisdiction in
        the Philippines.
      </p>

      <h2 style={pageStyles.h2}>11. Contact</h2>
      <p style={pageStyles.p}>
        For questions about these Terms, email{' '}
        <a href="mailto:yourpartner@viosintegrated.net" style={pageStyles.a}>
          yourpartner@viosintegrated.net
        </a>
        .
      </p>
    </div>
  );
}
