/**
 * BdmCaptureHub — Phase P1 (April 23, 2026).
 *
 * Mobile-first landing page for BDM field capture. ONE tap per workflow.
 * 360px min width, large touch targets (≥ 44px).
 *
 * Expenses is the pilot workflow (fully wired). Other workflows are
 * framework-ready — capture card + camera/file input + API call.
 *
 * Rule #9 preservation: BDM can always skip the capture hub and use
 * the regular entry page directly. This flow is ADDITIVE, not mandatory.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera, Receipt, FileText, Truck, Fuel, Wallet,
  MapPin, Clock, Upload,
  ChevronRight, RefreshCw, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../../hooks/useCaptureSubmissions';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowGuide from '../../components/WorkflowGuide';

// ── Workflow definitions ──
const WORKFLOWS = [
  {
    key: 'EXPENSE',
    label: 'Scan OR / Receipt',
    icon: Receipt,
    color: '#059669',
    description: 'Scan official receipt, enter amount + payment mode',
    artifactKind: 'receipt_scan',
    fields: ['amount_declared', 'payment_mode', 'access_for'],
    active: true,
  },
  {
    key: 'SMER',
    label: 'Scan ODO (Start / End)',
    icon: Camera,
    color: '#0284c7',
    description: 'Capture odometer reading photos',
    artifactKind: 'photo',
    fields: [],
    active: true,
  },
  {
    key: 'SALES',
    label: 'Scan Unreceived CSI',
    icon: FileText,
    color: '#7c3aed',
    description: 'OCR scan for proxy entry into ERP',
    artifactKind: 'csi_scan',
    fields: [],
    active: true,
  },
  {
    key: 'GRN',
    label: 'Scan GRN Item',
    icon: Truck,
    color: '#dc2626',
    description: 'Product barcode + qty + batch/expiry + waybill',
    artifactKind: 'barcode_scan',
    fields: [],
    active: true,
  },
  {
    key: 'FUEL_ENTRY',
    label: 'Scan Fuel Receipt',
    icon: Fuel,
    color: '#ea580c',
    description: 'Fuel pump receipt OCR + liters + amount',
    artifactKind: 'fuel_receipt',
    fields: ['amount_declared'],
    active: true,
  },
  {
    key: 'PETTY_CASH',
    label: 'Request Petty Cash',
    icon: Wallet,
    color: '#ca8a04',
    description: 'Mobile request — amount + purpose',
    artifactKind: 'photo',
    fields: ['amount_declared'],
    active: true,
  },
];

// ── GPS helper ──
function useGps() {
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return { gps, gpsError };
}

// ── Capture Card Component ──
function CaptureCard({ workflow, onCapture, disabled }) {
  const Icon = workflow.icon;
  return (
    <button
      onClick={() => onCapture(workflow)}
      disabled={disabled}
      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-gray-300 active:scale-[0.98] transition-all bg-white shadow-sm disabled:opacity-50"
      style={{ minHeight: '72px' }}
    >
      <div
        className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${workflow.color}15`, color: workflow.color }}
      >
        <Icon size={24} />
      </div>
      <div className="flex-1 text-left">
        <div className="font-semibold text-gray-900 text-base">{workflow.label}</div>
        <div className="text-sm text-gray-500 mt-0.5">{workflow.description}</div>
      </div>
      <ChevronRight size={20} className="text-gray-400 flex-shrink-0" />
    </button>
  );
}

// ── Capture Modal ──
function CaptureModal({ workflow, gps, onSubmit, onClose, loading }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [accessFor, setAccessFor] = useState('');

  const handleFileChange = useCallback((e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;
    setFiles(prev => [...prev, ...selected]);
    // Generate previews
    selected.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => setPreviews(prev => [...prev, ev.target.result]);
      reader.readAsDataURL(f);
    });
  }, []);

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (files.length === 0) {
      toast.error('Please capture at least one photo');
      return;
    }

    // Build artifacts — for now, create object URLs as placeholders
    // In production, these would be uploaded to S3 first
    const artifacts = files.map((f, i) => ({
      kind: workflow.artifactKind,
      url: previews[i] || '',
      gps: gps || undefined,
      timestamp: new Date().toISOString(),
      notes: notes || undefined,
    }));

    const payload = {
      workflow_type: workflow.key,
      captured_artifacts: artifacts,
      bdm_notes: notes || undefined,
    };

    if (workflow.fields.includes('amount_declared') && amount) {
      payload.amount_declared = parseFloat(amount);
    }
    if (workflow.fields.includes('payment_mode') && paymentMode) {
      payload.payment_mode = paymentMode;
    }
    if (workflow.fields.includes('access_for') && accessFor) {
      payload.access_for = accessFor;
    }

    await onSubmit(payload);
  }, [files, previews, workflow, gps, notes, amount, paymentMode, accessFor, onSubmit]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${workflow.color}15`, color: workflow.color }}
            >
              <workflow.icon size={20} />
            </div>
            <h2 className="font-bold text-lg">{workflow.label}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Camera / File input */}
          <div>
            <div className="flex gap-2">
              <button
                onClick={() => { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); }}
                className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 active:scale-[0.98] transition-all"
                style={{ minHeight: '56px' }}
              >
                <Camera size={20} /> Take Photo
              </button>
              <button
                onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click(); }}
                className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-gray-700 font-medium hover:bg-gray-100 active:scale-[0.98] transition-all"
                style={{ minHeight: '56px' }}
              >
                <Upload size={20} /> Gallery
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Previews */}
          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {previews.map((src, i) => (
                <div key={i} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border">
                  <img src={src} alt={`Capture ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-0 right-0 bg-red-500 text-white rounded-bl-lg p-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* GPS indicator */}
          <div className="flex items-center gap-2 text-sm">
            <MapPin size={16} className={gps ? 'text-green-600' : 'text-amber-500'} />
            <span className={gps ? 'text-green-700' : 'text-amber-600'}>
              {gps ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${Math.round(gps.accuracy)}m)` : 'Acquiring GPS...'}
            </span>
          </div>

          {/* Workflow-specific fields */}
          {workflow.fields.includes('amount_declared') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full px-3 py-3 border rounded-lg text-base"
              />
            </div>
          )}

          {workflow.fields.includes('payment_mode') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full px-3 py-3 border rounded-lg text-base bg-white"
              >
                <option value="">Select...</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="online">Online Transfer</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>
          )}

          {workflow.fields.includes('access_for') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Who is this for? (ACCESS)</label>
              <input
                type="text"
                value={accessFor}
                onChange={(e) => setAccessFor(e.target.value)}
                placeholder="e.g., Dr. Santos, Hospital X"
                className="w-full px-3 py-3 border rounded-lg text-base"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes for the office team..."
              rows={2}
              maxLength={1000}
              className="w-full px-3 py-3 border rounded-lg text-base resize-none"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || files.length === 0}
            className="w-full py-4 rounded-xl font-bold text-white text-lg disabled:opacity-50 active:scale-[0.98] transition-all"
            style={{ backgroundColor: workflow.color, minHeight: '56px' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={20} className="animate-spin" /> Submitting...
              </span>
            ) : (
              'Submit to Office Queue'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pending count badge ──
function PendingBadge({ count }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
      <Clock size={14} />
      <span>{count} pending in queue</span>
    </div>
  );
}

// ── Main Component ──
export default function BdmCaptureHub() {
  useAuth();
  const { createCapture, getMyCaptures, loading } = useCaptureSubmissions();
  const { gps } = useGps();

  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentCaptures, setRecentCaptures] = useState([]);

  // Load pending count + recent captures
  const loadData = useCallback(async () => {
    try {
      const res = await getMyCaptures({ status: 'PENDING_PROXY', limit: 100 });
      if (res?.data) {
        setPendingCount(res.total || res.data.length);
      }
      const recent = await getMyCaptures({ limit: 5 });
      if (recent?.data) {
        setRecentCaptures(recent.data);
      }
    } catch {
      // Silently fail — non-critical
    }
  }, [getMyCaptures]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCapture = useCallback((workflow) => {
    setActiveWorkflow(workflow);
  }, []);

  const handleSubmit = useCallback(async (payload) => {
    try {
      await createCapture(payload);
      toast.success('Capture submitted to office queue!');
      setActiveWorkflow(null);
      loadData(); // Refresh counts
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to submit capture');
    }
  }, [createCapture, loadData]);

  const STATUS_COLORS = {
    PENDING_PROXY: 'bg-amber-100 text-amber-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    PROCESSED: 'bg-green-100 text-green-700',
    AWAITING_BDM_REVIEW: 'bg-purple-100 text-purple-700',
    ACKNOWLEDGED: 'bg-gray-100 text-gray-600',
    DISPUTED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-gray-100 text-gray-400',
    AUTO_ACKNOWLEDGED: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 min-h-screen bg-gray-50">
      <WorkflowGuide pageKey="bdm-capture-hub" />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Capture Hub</h1>
        <p className="text-gray-500 mt-1">One-tap capture from the field</p>
        <PendingBadge count={pendingCount} />
      </div>

      {/* Workflow cards */}
      <div className="space-y-3 mb-8">
        {WORKFLOWS.filter(w => w.active).map(w => (
          <CaptureCard
            key={w.key}
            workflow={w}
            onCapture={handleCapture}
            disabled={loading}
          />
        ))}
      </div>

      {/* Recent captures */}
      {recentCaptures.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Captures</h2>
          <div className="space-y-2">
            {recentCaptures.map(c => (
              <div key={c._id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div>
                  <div className="font-medium text-sm text-gray-900">{c.workflow_type}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(c.created_at).toLocaleString()}
                    {c.amount_declared ? ` • ₱${c.amount_declared.toLocaleString()}` : ''}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100'}`}>
                  {c.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fallback note */}
      <div className="mt-8 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <strong>Tip:</strong> You can always enter expenses, sales, and other records directly from the regular entry pages.
        The capture hub is an optional shortcut for faster field work.
      </div>

      {/* Capture Modal */}
      {activeWorkflow && (
        <CaptureModal
          workflow={activeWorkflow}
          gps={gps}
          onSubmit={handleSubmit}
          onClose={() => setActiveWorkflow(null)}
          loading={loading}
        />
      )}
    </div>
  );
}
