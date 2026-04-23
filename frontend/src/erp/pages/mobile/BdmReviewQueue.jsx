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
  RefreshCw, MessageSquare, ThumbsUp,
  ThumbsDown, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../../hooks/useCaptureSubmissions';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowGuide from '../../components/WorkflowGuide';

const WORKFLOW_ICONS = {
  EXPENSE: Receipt,
  SMER: Camera,
  SALES: FileText,
  GRN: Truck,
  FUEL_ENTRY: Fuel,
  PETTY_CASH: Wallet,
  OPENING_AR: FileText,
  COLLECTION: Receipt,
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
};

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
  const Icon = WORKFLOW_ICONS[item.workflow_type] || Receipt;
  const color = WORKFLOW_COLORS[item.workflow_type] || '#64748b';
  const proxyName = item.proxy_id?.name || 'Office team';
  const age = item.proxy_completed_at
    ? Math.round((Date.now() - new Date(item.proxy_completed_at).getTime()) / (1000 * 60 * 60))
    : null;

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}15`, color }}
        >
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900">
            {item.workflow_type.replace(/_/g, ' ')}
          </div>
          <div className="text-sm text-gray-500 truncate">
            Processed by {proxyName}
            {age != null && ` • ${age}h ago`}
          </div>
        </div>
        {item.amount_declared != null && (
          <div className="text-right flex-shrink-0">
            <div className="font-bold text-lg">₱{Number(item.amount_declared).toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-4 space-y-2">
        {item.bdm_notes && (
          <div className="flex items-start gap-2 text-sm">
            <MessageSquare size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <span className="text-gray-600">{item.bdm_notes}</span>
          </div>
        )}
        {item.proxy_notes && (
          <div className="flex items-start gap-2 text-sm">
            <MessageSquare size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
            <span className="text-blue-600">Proxy: {item.proxy_notes}</span>
          </div>
        )}
        {item.access_for && (
          <div className="text-sm text-gray-500">For: {item.access_for}</div>
        )}
        {item.payment_mode && (
          <div className="text-sm text-gray-500 capitalize">Payment: {item.payment_mode}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 p-4 pt-0">
        <button
          onClick={() => onAcknowledge(item._id)}
          disabled={loading}
          className="flex-1 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ minHeight: '48px' }}
        >
          <ThumbsUp size={18} /> Confirm
        </button>
        <button
          onClick={() => onDispute(item)}
          disabled={loading}
          className="flex-1 py-3 rounded-xl font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ minHeight: '48px' }}
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
    <div className="max-w-lg mx-auto px-4 py-6 min-h-screen bg-gray-50">
      <WorkflowGuide pageKey="bdm-review-queue" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
          <p className="text-gray-500">Confirm or dispute proxied entries</p>
        </div>
        <button
          onClick={loadQueue}
          disabled={loading}
          className="p-2 hover:bg-white rounded-lg border"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Proxy summary banner */}
      {Object.keys(proxyStats).length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-purple-600" />
            <span className="font-semibold text-purple-800">Review needed</span>
          </div>
          <div className="text-sm text-purple-700">
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
        <div className="text-center py-16">
          <CheckCircle2 size={48} className="mx-auto text-green-300 mb-3" />
          <div className="text-gray-500 font-medium">All caught up!</div>
          <div className="text-sm text-gray-400 mt-1">No entries waiting for your review</div>
        </div>
      ) : (
        <div className="space-y-3">
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
        <div className="text-center text-sm text-gray-400 mt-6">
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
