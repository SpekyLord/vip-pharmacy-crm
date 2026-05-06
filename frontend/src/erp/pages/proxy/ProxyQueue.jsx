/**
 * ProxyQueue — Phase P1 (April 23, 2026).
 *
 * Office-side queue page for processing BDM captures.
 * Filters: workflow type, BDM, date range, status.
 * SLA color coding: < 24h green, 24-48h amber, > 48h red.
 *
 * "Process" button opens the appropriate entry form with captured artifact pre-attached.
 * Proxy completes → CaptureSubmission.status transitions through the pipeline.
 *
 * Rule #19: entity-scoped (backend enforces).
 * Rule #20: Option B — proxy enters, never approves.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  User, Filter, ChevronDown, ChevronUp, Eye,
  Play, ArrowLeft, CheckCircle2, XCircle,
  BarChart3, RefreshCw, Camera, Receipt, FileText,
  Truck, Fuel, Wallet, MapPin, Edit3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../../hooks/useCaptureSubmissions';
import WorkflowGuide from '../../components/WorkflowGuide';
import PhysicalStatusChip from '../../components/PhysicalStatusChip';
import PhysicalStatusOverrideSheet from '../../components/PhysicalStatusOverrideSheet';
import { useAuth } from '../../../hooks/useAuth';
import { userHasFrontendDefault } from '../../utils/captureLifecycleFrontendGates';

// ── Workflow icon map ──
const WORKFLOW_ICONS = {
  EXPENSE: Receipt,
  SMER: Camera,
  SALES: FileText,
  GRN: Truck,
  FUEL_ENTRY: Fuel,
  PETTY_CASH: Wallet,
  OPENING_AR: FileText,
  COLLECTION: BarChart3,
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

const STATUS_OPTIONS = [
  { value: '', label: 'All Actionable' },
  { value: 'PENDING_PROXY', label: 'Pending Proxy' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'PROCESSED', label: 'Processed' },
  { value: 'AWAITING_BDM_REVIEW', label: 'Awaiting BDM Review' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'DISPUTED', label: 'Disputed' },
];

const WORKFLOW_OPTIONS = [
  { value: '', label: 'All Workflows' },
  { value: 'EXPENSE', label: 'Expense / OR' },
  { value: 'SMER', label: 'SMER / ODO' },
  { value: 'SALES', label: 'Sales / CSI' },
  { value: 'GRN', label: 'GRN' },
  { value: 'FUEL_ENTRY', label: 'Fuel Entry' },
  { value: 'PETTY_CASH', label: 'Petty Cash' },
];

// ── SLA color helper ──
function slaClass(ageHours) {
  if (ageHours > 48) return 'bg-red-50 border-red-200 text-red-700';
  if (ageHours > 24) return 'bg-amber-50 border-amber-200 text-amber-700';
  return 'bg-green-50 border-green-200 text-green-700';
}

function slaLabel(ageHours) {
  if (ageHours < 1) return `${Math.round(ageHours * 60)}m`;
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  const days = Math.floor(ageHours / 24);
  const hrs = Math.round(ageHours % 24);
  return `${days}d ${hrs}h`;
}

// ── Queue Stats Banner ──
function StatsBanner({ stats }) {
  if (!stats) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-amber-700">{stats.pending?.total || 0}</div>
        <div className="text-xs text-amber-600">Pending</div>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-blue-700">{stats.in_progress || 0}</div>
        <div className="text-xs text-blue-600">In Progress</div>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-red-700">{stats.pending?.over_24h || 0}</div>
        <div className="text-xs text-red-600">Over 24h SLA</div>
      </div>
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
        <div className="text-2xl font-bold text-green-700">{stats.processed_today || 0}</div>
        <div className="text-xs text-green-600">Processed Today</div>
      </div>
    </div>
  );
}

// PhysicalStatusChip + OverrideSheet were inlined here pre-refactor; both
// now live in `frontend/src/erp/components/`. The chip uses the default
// "Paper: " prefix that ProxyQueue's drawer expects; CaptureArchive renders
// it without the prefix because the row's column header already says "Paper".

// ── Detail Drawer ──
function DetailDrawer({ item, onClose, onPickup, onRelease, onComplete, onOverride, loading, canMarkPaper, canOverride }) {
  // Phase P1.2 Slice 9 — paper_received toggle. Visible only when:
  //   - the capture expects paper (physical_required=true)
  //   - paper hasn't already been received
  //   - the user has MARK_PAPER_RECEIVED
  const [paperReceived, setPaperReceived] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  if (!item) return null;

  const Icon = WORKFLOW_ICONS[item.workflow_type] || Camera;
  const color = WORKFLOW_COLORS[item.workflow_type] || '#64748b';
  const showPaperToggle = canMarkPaper && item.physical_required && item.physical_status === 'PENDING';
  const showOverrideButton = canOverride && item.physical_required;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}15`, color }}
            >
              <Icon size={20} />
            </div>
            <div>
              <h2 className="font-bold text-lg">{item.workflow_type.replace(/_/g, ' ')}</h2>
              <div className="text-sm text-gray-500">
                BDM: {item.bdm_id?.name || 'Unknown'} • {new Date(item.created_at).toLocaleString()}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <XCircle size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status + SLA + paper status (Slice 9) */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full font-medium border ${slaClass(item.age_hours)}`}>
              Age: {slaLabel(item.age_hours)}
            </span>
            <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-600">
              {item.status.replace(/_/g, ' ')}
            </span>
            <PhysicalStatusChip item={item} />
            {showOverrideButton && (
              <button
                onClick={() => setShowOverride(true)}
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                data-testid="proxy-override-open"
              >
                <Edit3 size={12} /> Override
              </button>
            )}
            {item.physical_received_at && (
              <span className="text-xs text-gray-500">
                Received {new Date(item.physical_received_at).toLocaleDateString()}
                {item.physical_received_by?.name ? ` by ${item.physical_received_by.name}` : ''}
              </span>
            )}
          </div>

          {/* BDM notes */}
          {item.bdm_notes && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-xs font-medium text-blue-600 mb-1">BDM Notes</div>
              <div className="text-sm text-blue-800">{item.bdm_notes}</div>
            </div>
          )}

          {/* Amount + Payment */}
          {(item.amount_declared || item.payment_mode || item.access_for) && (
            <div className="grid grid-cols-2 gap-3">
              {item.amount_declared != null && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Amount Declared</div>
                  <div className="font-bold text-lg">₱{Number(item.amount_declared).toLocaleString()}</div>
                </div>
              )}
              {item.payment_mode && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Payment Mode</div>
                  <div className="font-medium capitalize">{item.payment_mode}</div>
                </div>
              )}
              {item.access_for && (
                <div className="bg-gray-50 rounded-lg p-3 col-span-2">
                  <div className="text-xs text-gray-500">For (ACCESS)</div>
                  <div className="font-medium">{item.access_for}</div>
                </div>
              )}
            </div>
          )}

          {/* Captured artifacts */}
          {item.captured_artifacts?.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">
                Captured Artifacts ({item.captured_artifacts.length})
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {item.captured_artifacts.map((a, i) => (
                  <div key={i} className="flex-shrink-0">
                    {a.url && a.url.startsWith('data:') ? (
                      <img src={a.url} alt={`Artifact ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border" />
                    ) : (
                      <div className="w-24 h-24 rounded-lg border bg-gray-100 flex items-center justify-center text-gray-400">
                        <Camera size={24} />
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1 text-center">{a.kind}</div>
                    {a.gps && (
                      <div className="text-xs text-gray-400 flex items-center gap-0.5 justify-center">
                        <MapPin size={10} /> GPS
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Proxy info */}
          {item.proxy_id && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500">Assigned Proxy</div>
              <div className="font-medium">{item.proxy_id?.name || 'Unknown'}</div>
              {item.proxy_started_at && (
                <div className="text-xs text-gray-400 mt-1">
                  Started: {new Date(item.proxy_started_at).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            {item.status === 'PENDING_PROXY' && (
              <button
                onClick={() => onPickup(item._id)}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Play size={18} /> Pick Up
              </button>
            )}
            {item.status === 'IN_PROGRESS' && (
              <>
                <button
                  onClick={() => onRelease(item._id)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={18} /> Release
                </button>
                <button
                  onClick={() => onComplete(item._id, { paper_received: paperReceived })}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} /> Mark Complete{paperReceived ? ' + Paper' : ''}
                </button>
              </>
            )}
          </div>

          {/* Paper-received attestation (Slice 9) — sits between actions and
              the existing button row so the proxy decides BEFORE clicking
              Mark Complete. Hidden on digital-only or already-received. */}
          {item.status === 'IN_PROGRESS' && showPaperToggle && (
            <label className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={paperReceived}
                onChange={(e) => setPaperReceived(e.target.checked)}
                className="mt-0.5"
                data-testid="proxy-paper-received-checkbox"
              />
              <div className="text-sm">
                <div className="font-medium text-amber-900">Paper received now</div>
                <div className="text-xs text-amber-700">
                  Tick this if the physical receipt/CSI is on your desk while
                  you process this entry. It atomically flips Paper status to
                  RECEIVED so it doesn&apos;t need a separate trip to the archive.
                </div>
              </div>
            </label>
          )}
        </div>
      </div>

      {showOverride && (
        <PhysicalStatusOverrideSheet
          currentStatus={item.physical_status || 'PENDING'}
          onClose={() => setShowOverride(false)}
          onApply={async (next) => {
            await onOverride(item._id, next);
            setShowOverride(false);
          }}
          testIdPrefix="proxy-override"
        />
      )}
    </div>
  );
}

// ── Main Component ──
export default function ProxyQueue() {
  const { user } = useAuth();
  const {
    getProxyQueue, getQueueStats, pickupCapture, releaseCapture,
    completeCapture, getCaptureById, overridePhysicalStatus, loading,
  } = useCaptureSubmissions();
  const canMarkPaper = userHasFrontendDefault(user, 'MARK_PAPER_RECEIVED');
  const canOverride = userHasFrontendDefault(user, 'OVERRIDE_PHYSICAL_STATUS');

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const loadQueue = useCallback(async () => {
    try {
      const params = { limit: PAGE_SIZE, skip: page * PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      if (workflowFilter) params.workflow_type = workflowFilter;

      const res = await getProxyQueue(params);
      if (res?.data) {
        setItems(res.data);
        setTotal(res.total || 0);
      }
    } catch (err) {
      if (err?.response?.status === 403) {
        toast.error('Proxy entry rights required to view this queue');
      }
    }
  }, [getProxyQueue, statusFilter, workflowFilter, page]);

  const loadStats = useCallback(async () => {
    try {
      const res = await getQueueStats();
      if (res?.data) setStats(res.data);
    } catch {
      // Stats are non-critical — admin-only
    }
  }, [getQueueStats]);

  useEffect(() => { loadQueue(); }, [loadQueue]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handlePickup = useCallback(async (id) => {
    try {
      await pickupCapture(id);
      toast.success('Picked up! Open the entry form to process.');
      setSelectedItem(null);
      loadQueue();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to pick up');
    }
  }, [pickupCapture, loadQueue]);

  const handleRelease = useCallback(async (id) => {
    try {
      await releaseCapture(id);
      toast.success('Released back to queue');
      setSelectedItem(null);
      loadQueue();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to release');
    }
  }, [releaseCapture, loadQueue]);

  const handleComplete = useCallback(async (id, opts = {}) => {
    try {
      // Phase P1.2 Slice 9 — forward the paper_received flag from the drawer.
      // Backend gates on MARK_PAPER_RECEIVED + physical_required; an unauth'd
      // attempt 403s and the BDM never sees a partial state (status-flip is
      // pre-saved with paper-flip).
      await completeCapture(id, opts);
      toast.success(
        opts.paper_received
          ? 'Marked complete + paper received attested'
          : 'Marked as complete — BDM will be notified for review'
      );
      setSelectedItem(null);
      loadQueue();
      loadStats();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to complete');
    }
  }, [completeCapture, loadQueue, loadStats]);

  const handleOverride = useCallback(async (id, physical_status) => {
    try {
      const res = await overridePhysicalStatus(id, physical_status);
      toast.success(`Override applied — physical_status = ${physical_status}`);
      // Refresh the open drawer with the new physical_* fields so the chip
      // updates without forcing a full row refetch.
      setSelectedItem(prev => (prev && res?.data ? { ...prev, ...res.data } : prev));
      loadQueue();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Override failed');
    }
  }, [overridePhysicalStatus, loadQueue]);

  const handleRowClick = useCallback(async (item) => {
    try {
      const res = await getCaptureById(item._id);
      if (res?.data) setSelectedItem(res.data);
      else setSelectedItem(item);
    } catch {
      setSelectedItem(item);
    }
  }, [getCaptureById]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <WorkflowGuide pageKey="proxy-queue" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proxy Queue</h1>
          <p className="text-gray-500">Process BDM field captures</p>
        </div>
        <button
          onClick={() => { loadQueue(); loadStats(); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <StatsBanner stats={stats} />

      {/* Filters */}
      <div className="mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <Filter size={16} /> Filters
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showFilters && (
          <div className="mt-2 flex flex-wrap gap-3 p-3 bg-gray-50 rounded-lg">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
              className="px-3 py-2 border rounded-lg bg-white text-sm"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={workflowFilter}
              onChange={(e) => { setWorkflowFilter(e.target.value); setPage(0); }}
              className="px-3 py-2 border rounded-lg bg-white text-sm"
            >
              {WORKFLOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Queue table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 font-medium text-gray-600">BDM</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Workflow</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Age</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Proxy</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-400">
                    {loading ? 'Loading...' : 'No items in queue'}
                  </td>
                </tr>
              )}
              {items.map(item => {
                const Icon = WORKFLOW_ICONS[item.workflow_type] || Camera;
                const color = WORKFLOW_COLORS[item.workflow_type] || '#64748b';
                return (
                  <tr
                    key={item._id}
                    onClick={() => handleRowClick(item)}
                    className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-gray-400" />
                        <span className="font-medium">{item.bdm_id?.name || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Icon size={14} style={{ color }} />
                        <span>{item.workflow_type.replace(/_/g, ' ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.amount_declared != null ? `₱${Number(item.amount_declared).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium border ${slaClass(item.age_hours)}`}>
                        {slaLabel(item.age_hours)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium">{item.status.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {item.proxy_id?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button className="p-1.5 hover:bg-gray-100 rounded-lg">
                        <Eye size={16} className="text-gray-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <span className="text-sm text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedItem && (
        <DetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onPickup={handlePickup}
          onRelease={handleRelease}
          onComplete={handleComplete}
          onOverride={handleOverride}
          loading={loading}
          canMarkPaper={canMarkPaper}
          canOverride={canOverride}
        />
      )}
    </div>
  );
}
