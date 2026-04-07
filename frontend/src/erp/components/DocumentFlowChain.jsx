/**
 * DocumentFlowChain — Phase 9.3
 *
 * Visual chain showing linked TransactionEvents:
 * CSI -> CR -> CWT_2307 -> Deposit
 *
 * Usage: <DocumentFlowChain eventId="..." />
 */
import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const EVENT_LABELS = {
  CSI: 'CSI',
  CR: 'Collection',
  CR_REVERSAL: 'CR Reversal',
  CWT_2307: 'CWT 2307',
  DEPOSIT: 'Deposit',
  SMER: 'SMER',
  EXPENSE: 'Expense',
  CAR_LOGBOOK: 'Car Logbook',
  PRF: 'PRF',
  CALF: 'CALF',
  GRN: 'GRN',
  DR: 'DR'
};

const EVENT_COLORS = {
  CSI: '#3b82f6',
  CR: '#22c55e',
  CR_REVERSAL: '#ef4444',
  CWT_2307: '#f59e0b',
  DEPOSIT: '#8b5cf6',
  SMER: '#6366f1',
  EXPENSE: '#ec4899',
  CAR_LOGBOOK: '#14b8a6',
  PRF: '#f97316',
  CALF: '#f97316'
};

const STATUS_BADGE = {
  ACTIVE: { bg: '#dcfce7', color: '#166534', label: 'Active' },
  DELETED: { bg: '#fee2e2', color: '#991b1b', label: 'Deleted' }
};

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAmount(payload) {
  const amt = payload?.invoice_total || payload?.cr_amount || payload?.total_reimbursable || payload?.amount || null;
  if (amt == null) return null;
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(amt);
}

export default function DocumentFlowChain({ eventId }) {
  const [chain, setChain] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    api.get(`/erp/documents/flow/${eventId}`)
      .then(res => setChain(res.data?.data || []))
      .catch(err => setError(err.response?.data?.message || 'Failed to load document flow'))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (!eventId) return null;
  if (loading) return <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>Loading document flow...</div>;
  if (error) return <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 0' }}>{error}</div>;
  if (!chain.length) return <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>No linked documents</div>;

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Document Flow
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        {chain.map((evt, i) => {
          const color = EVENT_COLORS[evt.event_type] || '#6b7280';
          const statusBadge = STATUS_BADGE[evt.status] || STATUS_BADGE.ACTIVE;
          const isHighlighted = evt._id === eventId;
          const amt = formatAmount(evt.payload);

          return (
            <React.Fragment key={evt._id}>
              {i > 0 && (
                <div style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1 }}>&#8594;</div>
              )}
              <div style={{
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '6px 10px', borderRadius: 6,
                border: `2px solid ${isHighlighted ? color : '#e5e7eb'}`,
                background: isHighlighted ? `${color}10` : '#fff',
                minWidth: 80, textAlign: 'center'
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.03em'
                }}>
                  {EVENT_LABELS[evt.event_type] || evt.event_type}
                </div>
                {evt.document_ref && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1f2937' }}>
                    {evt.document_ref}
                  </div>
                )}
                <div style={{ fontSize: 10, color: '#6b7280' }}>
                  {formatDate(evt.event_date)}
                </div>
                {amt && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{amt}</div>
                )}
                <div style={{
                  fontSize: 9, padding: '1px 4px', borderRadius: 3,
                  background: statusBadge.bg, color: statusBadge.color, fontWeight: 600
                }}>
                  {statusBadge.label}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
