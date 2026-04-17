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
  ol: { marginBottom: '16px', paddingLeft: '24px' },
  ul: { marginBottom: '16px', paddingLeft: '24px' },
  li: { marginBottom: '8px' },
  a: { color: '#2563eb' },
  callout: {
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '16px',
  },
};

export default function DataDeletionPage() {
  return (
    <div style={pageStyles.container}>
      <h1 style={pageStyles.h1}>Data Deletion Instructions</h1>
      <p style={pageStyles.meta}>Last updated: April 17, 2026</p>

      <p style={pageStyles.p}>
        VIOS Integrated respects your right to control your personal information. This page
        explains how to request the deletion of data we hold about you, including any information
        obtained through our Facebook Messenger, Viber, or WhatsApp integrations.
      </p>

      <h2 style={pageStyles.h2}>What Data We May Hold</h2>
      <ul style={pageStyles.ul}>
        <li style={pageStyles.li}>
          Your Messenger, Viber, or WhatsApp sender ID and the content of messages you exchanged
          with us.
        </li>
        <li style={pageStyles.li}>
          Any contact information (name, phone, email) you shared with our staff.
        </li>
        <li style={pageStyles.li}>
          Account data if you are a registered user of the CRM (name, email, role, activity logs).
        </li>
      </ul>

      <h2 style={pageStyles.h2}>How to Request Deletion</h2>
      <div style={pageStyles.callout}>
        <p style={{ ...pageStyles.p, marginBottom: '8px' }}>
          <strong>Email:</strong>{' '}
          <a href="mailto:yourpartner@viosintegrated.net" style={pageStyles.a}>
            yourpartner@viosintegrated.net
          </a>
        </p>
        <p style={{ ...pageStyles.p, marginBottom: 0 }}>
          <strong>Subject line:</strong> Data Deletion Request
        </p>
      </div>

      <ol style={pageStyles.ol}>
        <li style={pageStyles.li}>
          Send an email to the address above from the email or phone number associated with your
          data, or include enough detail (Messenger name, Viber display name, WhatsApp number) so
          we can locate your records.
        </li>
        <li style={pageStyles.li}>
          State clearly that you are requesting deletion of your personal data.
        </li>
        <li style={pageStyles.li}>
          We will acknowledge your request within 5 business days and complete the deletion within
          30 days, subject to any legal retention obligations.
        </li>
        <li style={pageStyles.li}>
          You will receive a confirmation email once deletion is complete.
        </li>
      </ol>

      <h2 style={pageStyles.h2}>What Happens After Deletion</h2>
      <p style={pageStyles.p}>
        We will permanently remove your messaging history, contact details, and any associated
        records from our active systems. Backup copies are purged on our standard backup rotation
        cycle. Security audit logs tied to your account are retained for up to 90 days as required
        for fraud prevention and legal compliance, after which they are automatically deleted.
      </p>

      <h2 style={pageStyles.h2}>Exceptions</h2>
      <p style={pageStyles.p}>
        We may retain certain information where required by law (for example, financial records
        required by the Bureau of Internal Revenue) or where necessary to resolve disputes, enforce
        our agreements, or protect our legal rights. When retention is required, we will inform you
        which data is being retained and why.
      </p>

      <h2 style={pageStyles.h2}>Questions</h2>
      <p style={pageStyles.p}>
        If you have questions about this process or our{' '}
        <a href="/privacy" style={pageStyles.a}>
          Privacy Policy
        </a>
        , please contact{' '}
        <a href="mailto:yourpartner@viosintegrated.net" style={pageStyles.a}>
          yourpartner@viosintegrated.net
        </a>
        .
      </p>
    </div>
  );
}
