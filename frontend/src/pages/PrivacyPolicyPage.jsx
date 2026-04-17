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

export default function PrivacyPolicyPage() {
  return (
    <div style={pageStyles.container}>
      <h1 style={pageStyles.h1}>Privacy Policy</h1>
      <p style={pageStyles.meta}>Last updated: April 17, 2026</p>

      <p style={pageStyles.p}>
        VIOS Integrated ("we", "us", "our") operates the VIP Pharmacy CRM platform and associated
        Facebook Messenger, Viber, and WhatsApp business messaging integrations. This Privacy
        Policy explains how we collect, use, and protect information when you interact with our
        services.
      </p>

      <h2 style={pageStyles.h2}>1. Information We Collect</h2>
      <p style={pageStyles.p}>We may collect the following categories of information:</p>
      <ul style={pageStyles.ul}>
        <li style={pageStyles.li}>
          <strong>Account data</strong>: name, email address, phone number, and role when you
          register as a user of the CRM.
        </li>
        <li style={pageStyles.li}>
          <strong>Messaging data</strong>: messages you send to our Facebook Page, Viber bot, or
          WhatsApp business number, including sender ID, timestamps, and message content.
        </li>
        <li style={pageStyles.li}>
          <strong>Operational data</strong>: visit records, GPS coordinates, and photos uploaded by
          Business Development Managers during field visits.
        </li>
        <li style={pageStyles.li}>
          <strong>Technical data</strong>: IP address, browser type, and device information for
          security and audit logging.
        </li>
      </ul>

      <h2 style={pageStyles.h2}>2. How We Use Information</h2>
      <ul style={pageStyles.ul}>
        <li style={pageStyles.li}>To operate and maintain the CRM and communication features.</li>
        <li style={pageStyles.li}>
          To route inbound messages from Messenger, Viber, and WhatsApp to the appropriate
          authorized staff.
        </li>
        <li style={pageStyles.li}>
          To send automated business-hours auto-replies when staff are unavailable.
        </li>
        <li style={pageStyles.li}>
          To verify field visits through GPS and photographic evidence.
        </li>
        <li style={pageStyles.li}>To comply with legal obligations and maintain audit logs.</li>
      </ul>

      <h2 style={pageStyles.h2}>3. Information Sharing</h2>
      <p style={pageStyles.p}>
        We do not sell or rent your information. We share data only with:
      </p>
      <ul style={pageStyles.ul}>
        <li style={pageStyles.li}>
          Authorized internal staff who need it to perform their duties.
        </li>
        <li style={pageStyles.li}>
          Service providers (AWS for storage, MongoDB Atlas for database, Resend for email,
          Meta/Viber/WhatsApp for messaging) acting under confidentiality agreements.
        </li>
        <li style={pageStyles.li}>Law enforcement when required by valid legal process.</li>
      </ul>

      <h2 style={pageStyles.h2}>4. Data Retention</h2>
      <p style={pageStyles.p}>
        Account and operational data are retained for the duration of your business relationship
        with us and as required by applicable laws. Security audit logs are retained for 90 days.
        Messaging data is retained as long as necessary to service active conversations and
        contractual engagements.
      </p>

      <h2 style={pageStyles.h2}>5. Security</h2>
      <p style={pageStyles.p}>
        We use industry-standard security measures including encryption in transit (HTTPS),
        httpOnly cookies for authentication, account lockout protections, and signed URLs for
        media. No system is perfectly secure, but we take reasonable steps to protect your data.
      </p>

      <h2 style={pageStyles.h2}>6. Your Rights</h2>
      <p style={pageStyles.p}>
        You may request access to, correction of, or deletion of your personal information by
        contacting us. See our{' '}
        <a href="/data-deletion" style={pageStyles.a}>
          Data Deletion page
        </a>{' '}
        for instructions.
      </p>

      <h2 style={pageStyles.h2}>7. Children</h2>
      <p style={pageStyles.p}>
        Our services are not directed to children under 13. We do not knowingly collect personal
        information from children.
      </p>

      <h2 style={pageStyles.h2}>8. Changes to This Policy</h2>
      <p style={pageStyles.p}>
        We may update this policy from time to time. Material changes will be posted on this page
        with an updated "Last updated" date.
      </p>

      <h2 style={pageStyles.h2}>9. Contact</h2>
      <p style={pageStyles.p}>
        Questions? Email{' '}
        <a href="mailto:yourpartner@viosintegrated.net" style={pageStyles.a}>
          yourpartner@viosintegrated.net
        </a>
        .
      </p>
    </div>
  );
}
