/**
 * BdmReviewQueue — Phase P1 (April 23, 2026).
 *
 * BDM-side mobile page for reviewing proxied entries.
 * Lists proxied entries POSTED against this BDM in the last N days.
 * Each row: doc type, amount, proxy name, "Confirm" / "Dispute" buttons.
 *
 * Banner: "Maria entered 3 sales for you this week — review."
 */
import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, AlertTriangle,
  Receipt, Camera, FileText, Truck, Fuel, Wallet,
  ReceiptText, Landmark, HandCoins, FileBadge,
  RefreshCw, MessageSquare, ThumbsUp,
  ThumbsDown, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../../hooks/useCaptureSubmissions';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowGuide from '../../components/WorkflowGuide';
import '../../../styles/capture-hub.css';

// Icon + color per (workflow_type, sub_type) — must match BdmCaptureHub.WORKFLOWS
// so the BDM sees the same visual identity at capture time and review time.
const WORKFLOW_ICONS = {
  EXPENSE: Receipt,
  SMER: Camera,
  SALES: FileText,
  GRN: Truck,
  FUEL_ENTRY: Fuel,
  PETTY_CASH: Wallet,
  OPENING_AR: FileText,
  COLLECTION: ReceiptText,            // generic CR-style — overridden by sub_type below
  COLLECTION_CR: ReceiptText,
  COLLECTION_DEPOSIT: Landmark,
  COLLECTION_PAID_CSI: HandCoins,
  CWT_INBOUND: FileBadge,
};

const WORKFLOW_COLORS = {
  EXPENSE: '#059669',
  SMER: '#0284c7',
  SALES: '#7c3aed',
  GRN: '#dc2626',
  FUEL_ENTRY: '#ea580c',
  PETTY_CASH: '#ca8a04',
  OPENING_AR: '#6366f1',
  COLLECTION: '#0891b2',
  COLLECTION_CR: '#0891b2',
  COLLECTION_DEPOSIT: '#0d9488',
  COLLECTION_PAID_CSI: '#0ea5e9',
  CWT_INBOUND: '#6366f1',
};

// Friendly display label per (workflow_type, sub_type) — matches the BDM's
// mental model from Capture Hub instead of leaking the raw enum.
const WORKFLOW_LABELS = {
  EXPENSE: 'Expense / OR',
  SMER: 'ODO Reading',
  SALES: 'CSI Delivery Copy',
  GRN: 'GRN Item',
  FUEL_ENTRY: 'Fuel Receipt',
  PETTY_CASH: 'Petty Cash Request',
  OPENING_AR: 'Opening AR',
  COLLECTION: 'Collection',
  COLLECTION_CR: 'Collection Receipt (CR)',
  COLLECTION_DEPOSIT: 'Deposit Slip',
  COLLECTION_PAID_CSI: 'CSI Being Paid',
  CWT_INBOUND: 'CWT (BIR 2307)',
};

// Resolve composite key from item (workflow_type[_sub_type])
function resolveKey(item) {
  if (item?.workflow_type === 'COLLECTION' && item?.sub_type) {
    return `COLLECTION_${item.sub_type}`;
  }
  return item?.workflow_type || 'UNKNOWN';
}

// ── Dispute Modal ──
function DisputeModal({ item, onSubmit, onClose, loading }) {
  const [reason, setReason] = useState('');

  const handleSubmit = useCallback(() => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for the dispute');
      return;
    }
    onSubmit(item._id, reason.trim());
  }, [item, reason, onSubmit]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold text-lg text-red-700">Dispute Entry</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <strong>Warning:</strong> Disputing will file an IncentiveDispute record.
            Finance will investigate and may reverse the entry.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for dispute <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this entry is incorrect..."
              rows={3}
              maxLength={1000}
              className="w-full px-3 py-3 border rounded-lg text-base resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-200 hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !reason.trim()}
              className="flex-1 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              File Dispute
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Review Card ──
function ReviewCard({ item, onAcknowledge, onDispute, loading }) {
  const composite = resolveKey(item);
  const Icon = WORKFLOW_ICONS[composite] || WORKFLOW_ICONS[item.workflow_type] || Receipt;
  const color = WORKFLOW_COLORS[composite] || WORKFLOW_COLORS[item.workflow_type] || '#64748b';
  const label = WORKFLOW_LABELS[composite] || WORKFLOW_LABELS[item.workflow_type] || (item.workflow_type || '').replace(/_/g, ' ');
  const proxyName = item.proxy_id?.name || 'Office team';
  const age = item.proxy_completed_at
    ? Math.round((Date.now() - new Date(item.proxy_completed_at).getTime()) / (1000 * 60 * 60))
    : null;

  return (
    <div className="rq-card" style={{ borderLeft: `4px solid ${color}` }}>
      {/* Header */}
      <div className="rq-card-header">
        <div className="rq-card-icon" style={{ backgroundColor: `${color}15`, color }}>
          <Icon size={20} />
        </div>
        <div className="rq-card-meta">
          <div className="rq-card-label">{label}</div>
          <div className="rq-card-sub">
            Processed by {proxyName}
            {age != null && ` • ${age}h ago`}
          </div>
        </div>
        {item.amount_declared != null && (
          <div className="rq-card-amt">₱{Number(item.amount_declared).toLocaleString()}</div>
        )}
      </div>

      {/* Details */}
      {(item.bdm_notes || item.proxy_notes || item.access_for || item.payment_mode) && (
        <div className="rq-card-body">
          {item.bdm_notes && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: '#475569' }}>
              <MessageSquare size={14} style={{ color: '#94a3b8', flexShrink: 0, marginTop: 2 }} />
              <span>{item.bdm_notes}</span>
            </div>
          )}
          {item.proxy_notes && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: '#1d4ed8' }}>
              <MessageSquare size={14} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }} />
              <span>Proxy: {item.proxy_notes}</span>
            </div>
          )}
          {item.access_for && (
            <div style={{ fontSize: 13, color: '#64748b' }}>For: {item.access_for}</div>
          )}
          {item.payment_mode && (
            <div style={{ fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>Payment: {item.payment_mode}</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="rq-card-actions">
        <button
          onClick={() => onAcknowledge(item._id)}
          disabled={loading}
          className="rq-action confirm"
        >
          <ThumbsUp size={18} /> Confirm
        </button>
        <button
          onClick={() => onDispute(item)}
          disabled={loading}
          className="rq-action dispute"
        >
          <ThumbsDown size={18} /> Dispute
        </button>
      </div>
    </div>
  );
}

// ── Main Component ──
export default function BdmReviewQueue() {
  useAuth();
  const { getMyReviewQueue, acknowledgeCapture, disputeCapture, loading } = useCaptureSubmissions();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [disputeItem, setDisputeItem] = useState(null);

  const loadQueue = useCallback(async () => {
    try {
      const res = await getMyReviewQueue({ days: 30, limit: 50 });
      if (res?.data) {
        setItems(res.data);
        setTotal(res.total || res.data.length);
      }
    } catch {
      // Silently fail
    }
  }, [getMyReviewQueue]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleAcknowledge = useCallback(async (id) => {
    try {
      await acknowledgeCapture(id);
      toast.success('Confirmed! Entry acknowledged.');
      loadQueue();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to acknowledge');
    }
  }, [acknowledgeCapture, loadQueue]);

  const handleDispute = useCallback(async (id, reason) => {
    try {
      await disputeCapture(id, { reason });
      toast.success('Dispute filed. Finance will investigate.');
      setDisputeItem(null);
      loadQueue();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to file dispute');
    }
  }, [disputeCapture, loadQueue]);

  // Group by proxy for the banner
  const proxyStats = {};
  items.forEach(item => {
    const name = item.proxy_id?.name || 'Office team';
    proxyStats[name] = (proxyStats[name] || 0) + 1;
  });

  return (
    <div className="rq-page">
      <WorkflowGuide pageKey="bdm-review-queue" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', margin: 0 }}>Review Queue</h1>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>Confirm or dispute proxied entries</p>
        </div>
        <button
          onClick={loadQueue}
          disabled={loading}
          style={{
            padding: 8,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            borderRadius: 8,
            cursor: 'pointer',
            color: '#475569',
          }}
          aria-label="Refresh"
        >
          <RefreshCw size={18} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
        </button>
      </div>

      {/* Proxy summary banner */}
      {Object.keys(proxyStats).length > 0 && (
        <div style={{
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <AlertTriangle size={16} style={{ color: '#9333ea' }} />
            <span style={{ fontWeight: 600, color: '#6b21a8', fontSize: 14 }}>Review needed</span>
          </div>
          <div style={{ fontSize: 13, color: '#7c3aed', lineHeight: 1.5 }}>
            {Object.entries(proxyStats).map(([name, count], i) => (
              <span key={name}>
                {i > 0 && ', '}
                <strong>{name}</strong> entered {count} item{count > 1 ? 's' : ''} for you
              </span>
            ))}
            {' — please review.'}
          </div>
        </div>
      )}

      {/* Review cards */}
      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 16px' }}>
          <CheckCircle2 size={48} style={{ display: 'block', margin: '0 auto 12px', color: '#86efac' }} />
          <div style={{ color: '#64748b', fontWeight: 500 }}>All caught up!</div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>No entries waiting for your review</div>
          <div style={{
            margin: '16px auto 0',
            maxWidth: 360,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 10,
            padding: 12,
            fontSize: 12,
            color: '#1d4ed8',
            textAlign: 'left',
            lineHeight: 1.5,
          }}>
            <strong>How this works:</strong> When the office team enters expenses,
            sales, collections, or other ERP records on your behalf using your
            captures, the entries appear here for you to confirm or dispute.
            Entries auto-acknowledge after 72 hours.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <ReviewCard
              key={item._id}
              item={item}
              onAcknowledge={handleAcknowledge}
              onDispute={setDisputeItem}
              loading={loading}
            />
          ))}
        </div>
      )}

      {/* Total count */}
      {total > 0 && (
        <div style={{ textAlign: 'center', fontSize: 13, color: '#94a3b8', marginTop: 24 }}>
          {total} item{total > 1 ? 's' : ''} to review
        </div>
      )}

      {/* Dispute Modal */}
      {disputeItem && (
        <DisputeModal
          item={disputeItem}
          onSubmit={handleDispute}
          onClose={() => setDisputeItem(null)}
          loading={loading}
        />
      )}
    </div>
  );
}
