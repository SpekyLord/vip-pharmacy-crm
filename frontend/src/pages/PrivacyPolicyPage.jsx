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
      <p style={pageStyles.meta}>Last updated: April 18, 2026</p>

      <p style={pageStyles.p}>
        VIOS Integrated (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the VIP Pharmacy CRM platform and associated
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
          <strong>Messaging data from Meta (Facebook Messenger and WhatsApp)</strong>: your
          page-scoped ID (PSID) or WhatsApp phone number, public display name and profile photo
          (when provided by the platform), message content (text, images, files), delivery and
          read receipts, and conversation timestamps.
        </li>
        <li style={pageStyles.li}>
          <strong>Messaging data from Viber</strong>: your Viber sender ID, display name, message
          content, and delivery/seen receipts.
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
      <ul style={pageStyles.ul}>
        <li style={pageStyles.li}>
          <strong>Messenger, Viber, and WhatsApp conversations</strong>: retained up to 90 days
          after the last activity in a conversation, then permanently deleted.
        </li>
        <li style={pageStyles.li}>
          <strong>Security audit logs</strong>: retained for 90 days, then automatically deleted.
        </li>
        <li style={pageStyles.li}>
          <strong>Account data</strong>: retained for the duration of your business relationship
          with us, then deleted within 30 days of account closure, unless longer retention is
          required by law.
        </li>
        <li style={pageStyles.li}>
          <strong>Operational data (visits, GPS, photos)</strong>: retained for the duration of
          the business engagement and up to 7 years thereafter for compliance with Philippine tax
          and audit regulations.
        </li>
        <li style={pageStyles.li}>
          <strong>Financial records</strong>: retained for 10 years as required by the Bureau of
          Internal Revenue and related regulations.
        </li>
      </ul>
      <p style={pageStyles.p}>
        You may request earlier deletion at any time as described on our{' '}
        <a href="/data-deletion" style={pageStyles.a}>
          Data Deletion page
        </a>
        , subject to the legal retention obligations listed above.
      </p>

      <h2 style={pageStyles.h2}>5. International Data Transfers</h2>
      <p style={pageStyles.p}>
        Your messaging data is transmitted through Meta (Facebook Messenger, WhatsApp) and Viber,
        which may process data on servers located outside the Philippines, including in the United
        States and the European Union. By using our messaging services, you acknowledge and consent
        to the transfer of your information to these jurisdictions. Our primary infrastructure
        providers (AWS in the ap-southeast-1 region in Singapore and MongoDB Atlas) also process
        data outside the Philippines under standard contractual safeguards.
      </p>

      <h2 style={pageStyles.h2}>6. Security</h2>
      <p style={pageStyles.p}>
        We use industry-standard security measures including encryption in transit (HTTPS),
        httpOnly cookies for authentication, account lockout protections, and signed URLs for
        media. No system is perfectly secure, but we take reasonable steps to protect your data.
      </p>

      <h2 style={pageStyles.h2}>7. Your Rights</h2>
      <p style={pageStyles.p}>
        Under the Philippine Data Privacy Act (Republic Act No. 10173), you have the right to be
        informed, to object, to access, to rectify, to erase or block, to damages, to data
        portability, and to file a complaint with the National Privacy Commission. To exercise any
        of these rights, contact us using the details below or see our{' '}
        <a href="/data-deletion" style={pageStyles.a}>
          Data Deletion page
        </a>
        .
      </p>

      <h2 style={pageStyles.h2}>8. Children</h2>
      <p style={pageStyles.p}>
        Our services are not directed to children under 13. We do not knowingly collect personal
        information from children.
      </p>

      <h2 style={pageStyles.h2}>9. Changes to This Policy</h2>
      <p style={pageStyles.p}>
        We may update this policy from time to time. Material changes will be posted on this page
        with an updated &quot;Last updated&quot; date.
      </p>

      <h2 style={pageStyles.h2}>10. Contact</h2>
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
