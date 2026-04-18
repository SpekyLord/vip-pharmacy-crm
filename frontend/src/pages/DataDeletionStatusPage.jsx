import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const pageStyles = {
  container: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '48px 24px',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    color: '#1f2937',
    lineHeight: '1.7',
  },
  h1: { fontSize: '32px', marginBottom: '8px', color: '#111827' },
  meta: { color: '#6b7280', fontSize: '14px', marginBottom: '32px' },
  card: {
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
  },
  label: { color: '#6b7280', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  value: { fontSize: '16px', marginBottom: '16px' },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    background: '#eef2ff',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600,
  },
  a: { color: '#2563eb' },
};

const STATUS_COLORS = {
  pending: { background: '#fef3c7', color: '#92400e' },
  completed: { background: '#d1fae5', color: '#065f46' },
  failed: { background: '#fee2e2', color: '#991b1b' },
  not_found: { background: '#e5e7eb', color: '#374151' },
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function DataDeletionStatusPage() {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, error: null, data: null });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/webhooks/facebook/data-deletion/status/${encodeURIComponent(code)}`);
        if (res.status === 404) {
          if (!cancelled) setState({ loading: false, error: null, data: { status: 'not_found' } });
          return;
        }
        if (!res.ok) throw new Error(`Status lookup failed (HTTP ${res.status})`);
        const json = await res.json();
        if (!cancelled) setState({ loading: false, error: null, data: json });
      } catch (err) {
        if (!cancelled) setState({ loading: false, error: err.message, data: null });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const status = state.data?.status || 'pending';
  const badgeStyle = { ...pageStyles.badge, ...(STATUS_COLORS[status] || STATUS_COLORS.pending) };

  return (
    <div style={pageStyles.container}>
      <h1 style={pageStyles.h1}>Data Deletion Status</h1>
      <p style={pageStyles.meta}>
        Confirmation code: <span style={pageStyles.code}>{code}</span>
      </p>

      {state.loading && <p>Loading status…</p>}

      {state.error && (
        <div style={pageStyles.card}>
          <p>We couldn&apos;t load your request right now. Please try again later.</p>
          <p style={pageStyles.meta}>{state.error}</p>
        </div>
      )}

      {!state.loading && !state.error && state.data && status === 'not_found' && (
        <div style={pageStyles.card}>
          <p>
            We could not find a deletion request with this confirmation code. If you just submitted
            the request, please refresh in a few moments.
          </p>
        </div>
      )}

      {!state.loading && !state.error && state.data && status !== 'not_found' && (
        <div style={pageStyles.card}>
          <div style={pageStyles.label}>Status</div>
          <div style={pageStyles.value}>
            <span style={badgeStyle}>{status}</span>
          </div>

          <div style={pageStyles.label}>Requested</div>
          <div style={pageStyles.value}>{formatDate(state.data.requestedAt)}</div>

          <div style={pageStyles.label}>Completed</div>
          <div style={pageStyles.value}>{formatDate(state.data.completedAt)}</div>

          {state.data.deletedCounts && (
            <>
              <div style={pageStyles.label}>Records Removed</div>
              <div style={pageStyles.value}>
                <div>Messenger conversations: {state.data.deletedCounts.communicationLogs ?? 0}</div>
                <div>Contact profiles updated: {(state.data.deletedCounts.doctorsUpdated ?? 0) + (state.data.deletedCounts.clientsUpdated ?? 0)}</div>
              </div>
            </>
          )}
        </div>
      )}

      <p style={pageStyles.meta}>
        Questions? See our{' '}
        <a href="/data-deletion" style={pageStyles.a}>
          Data Deletion instructions
        </a>{' '}
        or contact{' '}
        <a href="mailto:yourpartner@viosintegrated.net" style={pageStyles.a}>
          yourpartner@viosintegrated.net
        </a>
        .
      </p>
    </div>
  );
}
