/**
 * CaptureArchive — Phase P1.2 Slice 8 (May 06 2026).
 *
 * Browseable archive of every CaptureSubmission scoped to the current entity.
 * Hierarchy: Year → Period (YYYY-MM) → Cycle (C1|C2 half-monthly) → Workflow
 * folder → leaf rows. Multi-select checkboxes feed the bulk Mark-Received
 * action; per-cycle "Download CSV" button calls the audit-report endpoint.
 *
 * Sub-permission gates (frontend mirrors backend via shared
 * `captureLifecycleFrontendGates.js`; server is the gate):
 *   - VIEW_OWN_ARCHIVE       → BDM sees only their own captures (default staff)
 *   - VIEW_ALL_ARCHIVE       → cross-BDM picker (default admin/finance/president)
 *   - BULK_MARK_RECEIVED     → multi-select bulk action button
 *   - GENERATE_CYCLE_REPORT  → CSV download button
 *   - OVERRIDE_PHYSICAL_STATUS → per-row Override link (default president)
 *
 * Backend short-circuits on missing perm with 403 — frontend visibility is
 * cosmetic. Lookup row is the override mechanism (Rule #3); inline DEFAULTS
 * ship with the binary so a fresh deploy works without seeding.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw, Filter, ChevronDown, ChevronRight,
  CheckSquare, Square, Download, Inbox,
  User as UserIcon, Receipt, Camera, FileText, Truck, Fuel, Wallet,
  BarChart3, Package, FileBadge, ScanLine,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../../hooks/useCaptureSubmissions';
import WorkflowGuide from '../../components/WorkflowGuide';
import PhysicalStatusChip from '../../components/PhysicalStatusChip';
import PhysicalStatusOverrideSheet from '../../components/PhysicalStatusOverrideSheet';
import { useAuth } from '../../../hooks/useAuth';
import { userHasFrontendDefault } from '../../utils/captureLifecycleFrontendGates';

// ── Workflow icons mirror BdmCaptureHub / ProxyQueue ──
const WORKFLOW_ICONS = {
  EXPENSE: Receipt,
  SMER: Camera,
  SALES: FileText,
  GRN: Truck,
  FUEL_ENTRY: Fuel,
  PETTY_CASH: Wallet,
  OPENING_AR: FileText,
  COLLECTION: BarChart3,
  CWT_INBOUND: FileBadge,
  UNCATEGORIZED: Package,
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
  CWT_INBOUND: '#9333ea',
  UNCATEGORIZED: '#64748b',
};

function workflowLabel(workflow_type, sub_type) {
  if (workflow_type === 'COLLECTION' && sub_type) {
    return `COLLECTION / ${sub_type}`;
  }
  return workflow_type.replace(/_/g, ' ');
}

// physicalChip() and OverrideSheet were inlined in this file pre-refactor;
// they're now shared components in `frontend/src/erp/components/`. Renders
// here use `<PhysicalStatusChip status=… required=… prefix="" />` to drop
// the "Paper: " prefix that ProxyQueue uses (this page's row column already
// has a "Paper" header so the prefix would be redundant).

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
    });
  } catch {
    return '—';
  }
}

// OverrideSheet was inlined here pre-refactor; now lifted to
// `components/PhysicalStatusOverrideSheet.jsx`.

// ── Main Component ──
export default function CaptureArchive() {
  const { user } = useAuth();
  const {
    getArchiveSummary, getArchiveLeaves, bulkMarkReceived,
    downloadCycleReport, overridePhysicalStatus, loading,
  } = useCaptureSubmissions();

  // Visibility gates (cosmetic — backend is the gate)
  const canViewAll = userHasFrontendDefault(user, 'VIEW_ALL_ARCHIVE');
  const canBulk = userHasFrontendDefault(user, 'BULK_MARK_RECEIVED');
  const canReport = userHasFrontendDefault(user, 'GENERATE_CYCLE_REPORT');
  const canOverride = userHasFrontendDefault(user, 'OVERRIDE_PHYSICAL_STATUS');

  // Tree state — server returns years[].periods[].cycles[] (period='YYYY-MM', cycle='C1'|'C2')
  const [years, setYears] = useState([]);
  const [bdmList, setBdmList] = useState([]);
  const [bdmFilter, setBdmFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  // Expansion keys: `y${year}` | `p${year}-${period}` | `c${period}-${cycle}`
  const [expanded, setExpanded] = useState(() => new Set());

  // Leaves state (when a workflow folder is opened)
  // activeFolder = { year, period, cycle, workflow_type, sub_type? }
  const [activeFolder, setActiveFolder] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [leavesTotal, setLeavesTotal] = useState(0);
  const [physStatusFilter, setPhysStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Selection
  const [selected, setSelected] = useState(() => new Set());

  // Override sheet
  const [overrideRow, setOverrideRow] = useState(null);

  const loadSummary = useCallback(async () => {
    const params = {};
    if (canViewAll && bdmFilter) params.bdm_id = bdmFilter;
    if (yearFilter) params.year = yearFilter;
    try {
      const res = await getArchiveSummary(params);
      if (res?.data) {
        setYears(res.data.years || []);
        if (canViewAll) setBdmList(res.data.bdmList || []);
      }
    } catch (err) {
      if (err?.response?.status === 403) {
        toast.error('You do not have permission to view the archive.');
      } else {
        toast.error(err?.response?.data?.message || 'Failed to load archive');
      }
    }
  }, [getArchiveSummary, canViewAll, bdmFilter, yearFilter]);

  const loadLeaves = useCallback(async () => {
    if (!activeFolder) return;
    const params = {
      period: activeFolder.period,
      cycle: activeFolder.cycle,
      workflow_type: activeFolder.workflow_type,
      limit: PAGE_SIZE,
      skip: page * PAGE_SIZE,
    };
    if (activeFolder.sub_type) params.sub_type = activeFolder.sub_type;
    if (physStatusFilter) params.physical_status = physStatusFilter;
    if (canViewAll && bdmFilter) params.bdm_id = bdmFilter;
    try {
      const res = await getArchiveLeaves(params);
      setLeaves(res?.data || []);
      setLeavesTotal(res?.total || 0);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load captures');
    }
  }, [getArchiveLeaves, activeFolder, page, physStatusFilter, canViewAll, bdmFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadLeaves(); }, [loadLeaves]);
  // Reset selection on folder/page/filter change so stale ids never get
  // bulk-marked.
  useEffect(() => { setSelected(new Set()); }, [activeFolder, page, physStatusFilter, bdmFilter]);

  const toggleNode = useCallback((key) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleFolderOpen = useCallback((year, period, cycle, workflow_type, sub_type) => {
    setActiveFolder({ year, period, cycle, workflow_type, sub_type: sub_type || null });
    setPage(0);
  }, []);

  const handleSelectRow = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelectableIds = useMemo(
    () => leaves
      .filter(r => r.physical_required && r.physical_status !== 'RECEIVED')
      .map(r => String(r._id)),
    [leaves],
  );
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selected.has(id));

  const handleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allSelectableIds));
    }
  }, [allSelected, allSelectableIds]);

  const handleBulkMark = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      const res = await bulkMarkReceived([...selected]);
      const { marked, skipped, not_found } = res?.data || {};
      toast.success(`Marked ${marked || 0} received${skipped ? ` (${skipped} skipped)` : ''}${not_found ? ` (${not_found} not found)` : ''}`);
      setSelected(new Set());
      loadLeaves();
      loadSummary();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Bulk mark failed');
    }
  }, [bulkMarkReceived, selected, loadLeaves, loadSummary]);

  const handleDownloadCsv = useCallback(async (period, cycle) => {
    try {
      const params = { period, cycle };
      if (canViewAll && bdmFilter) params.bdm_id = bdmFilter;
      const res = await downloadCycleReport(params);
      const blob = res?.data instanceof Blob ? res.data : new Blob([res?.data || ''], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cycle-audit-${period}-${cycle}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Cycle audit CSV downloaded');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'CSV download failed');
    }
  }, [downloadCycleReport, canViewAll, bdmFilter]);

  const handleOverrideApply = useCallback(async (next) => {
    if (!overrideRow) return;
    try {
      await overridePhysicalStatus(overrideRow._id, next);
      toast.success(`Override applied — physical_status = ${next}`);
      setOverrideRow(null);
      loadLeaves();
      loadSummary();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Override failed');
    }
  }, [overridePhysicalStatus, overrideRow, loadLeaves, loadSummary]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <WorkflowGuide pageKey="capture-archive" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ScanLine size={22} className="text-indigo-600" /> Capture Archive
          </h1>
          <p className="text-gray-500 text-sm">
            Browse every BDM capture by cycle. Multi-select to mark paper received.
          </p>
        </div>
        <button
          onClick={() => { loadSummary(); loadLeaves(); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3 p-3 bg-gray-50 rounded-lg items-center">
        <Filter size={16} className="text-gray-500" />
        {canViewAll && (
          <select
            value={bdmFilter}
            onChange={(e) => setBdmFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg bg-white text-sm"
            data-testid="archive-bdm-filter"
          >
            <option value="">All BDMs</option>
            {bdmList.map(b => (
              <option key={b._id} value={b._id}>{b.name} ({b.count})</option>
            ))}
          </select>
        )}
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg bg-white text-sm"
          data-testid="archive-year-filter"
        >
          <option value="">All Years</option>
          {years.map(y => (
            <option key={y.year} value={y.year}>{y.year}</option>
          ))}
        </select>
        {!canViewAll && (
          <span className="text-xs text-gray-500 italic">
            Showing your own captures only.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* Left tree */}
        <div className="bg-white border rounded-xl p-3 max-h-[70vh] overflow-y-auto" data-testid="archive-tree">
          {years.length === 0 && (
            <div className="text-center text-gray-400 text-sm py-8 flex flex-col items-center gap-2">
              <Inbox size={28} />
              <span>No captures yet.</span>
            </div>
          )}
          {years.map(y => {
            const yKey = `y${y.year}`;
            const isYearOpen = expanded.has(yKey);
            return (
              <div key={y.year} className="mb-1">
                <button
                  onClick={() => toggleNode(yKey)}
                  className="w-full flex items-center gap-1 text-left px-2 py-1.5 rounded hover:bg-gray-50 font-semibold text-gray-800"
                >
                  {isYearOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>{y.year}</span>
                </button>
                {isYearOpen && y.periods.map(p => {
                  const pKey = `p${p.period}`;
                  const isPeriodOpen = expanded.has(pKey);
                  // Display "May 2026" from period 'YYYY-MM'
                  const [py, pm] = p.period.split('-');
                  const monthName = new Date(Number(py), Number(pm) - 1, 1)
                    .toLocaleDateString(undefined, { month: 'short' });
                  const periodTotal = p.cycles.reduce((acc, c) => acc + (c.total || 0), 0);
                  return (
                    <div key={p.period} className="ml-3">
                      <button
                        onClick={() => toggleNode(pKey)}
                        className="w-full flex items-center gap-1 text-left px-2 py-1 rounded hover:bg-gray-50 text-gray-700 font-medium"
                      >
                        {isPeriodOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>{monthName} {py}</span>
                        <span className="ml-auto text-[10px] px-1 rounded bg-gray-100 text-gray-600">{periodTotal}</span>
                      </button>
                      {isPeriodOpen && p.cycles.map(c => {
                        const cKey = `c${p.period}-${c.cycle}`;
                        const isCycleOpen = expanded.has(cKey);
                        return (
                          <div key={c.cycle} className="ml-4">
                            <div className="flex items-center justify-between gap-1">
                              <button
                                onClick={() => toggleNode(cKey)}
                                className="flex-1 flex items-center gap-1 text-left px-2 py-1.5 rounded hover:bg-gray-50 text-gray-700"
                              >
                                {isCycleOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span className="font-medium">{c.label || c.cycle}</span>
                                <span className="text-xs text-gray-400 ml-1">
                                  ({fmtDate(c.startDate)} – {fmtDate(c.endDate)})
                                </span>
                                <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{c.total}</span>
                              </button>
                              {canReport && (
                                <button
                                  title="Download cycle audit CSV"
                                  onClick={() => handleDownloadCsv(p.period, c.cycle)}
                                  className="p-1 hover:bg-indigo-50 rounded"
                                  data-testid={`archive-download-csv-${p.period}-${c.cycle}`}
                                >
                                  <Download size={14} className="text-indigo-600" />
                                </button>
                              )}
                            </div>
                            {isCycleOpen && c.workflows.map(w => {
                              const Icon = WORKFLOW_ICONS[w.workflow_type] || Camera;
                              const color = WORKFLOW_COLORS[w.workflow_type] || '#64748b';
                              const folderKey = `${w.workflow_type}_${w.sub_type || 'main'}`;
                              const isActive = activeFolder &&
                                activeFolder.period === p.period &&
                                activeFolder.cycle === c.cycle &&
                                activeFolder.workflow_type === w.workflow_type &&
                                (activeFolder.sub_type || null) === (w.sub_type || null);
                              return (
                                <button
                                  key={folderKey}
                                  onClick={() => handleFolderOpen(y.year, p.period, c.cycle, w.workflow_type, w.sub_type)}
                                  data-testid={`archive-folder-${folderKey}`}
                                  className={`w-full ml-4 flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${
                                    isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-gray-50 text-gray-700'
                                  }`}
                                >
                                  <Icon size={14} style={{ color }} />
                                  <span>{workflowLabel(w.workflow_type, w.sub_type)}</span>
                                  <span className="ml-auto flex items-center gap-1">
                                    {w.pending > 0 && (
                                      <span className="text-[10px] px-1 rounded bg-amber-100 text-amber-700">{w.pending}p</span>
                                    )}
                                    {w.missing > 0 && (
                                      <span className="text-[10px] px-1 rounded bg-red-100 text-red-700">{w.missing}m</span>
                                    )}
                                    <span className="text-[10px] px-1 rounded bg-gray-100 text-gray-600">{w.total}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Right pane — leaf list */}
        <div className="bg-white border rounded-xl">
          {!activeFolder && (
            <div className="text-center text-gray-400 text-sm py-16 flex flex-col items-center gap-2">
              <ScanLine size={28} />
              <span>Select a workflow folder on the left.</span>
            </div>
          )}
          {activeFolder && (
            <>
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b bg-gray-50 rounded-t-xl">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span>{workflowLabel(activeFolder.workflow_type, activeFolder.sub_type)}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500 text-xs">{activeFolder.period} {activeFolder.cycle} · {leavesTotal} captures</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={physStatusFilter}
                    onChange={(e) => { setPhysStatusFilter(e.target.value); setPage(0); }}
                    className="px-2 py-1 border rounded bg-white text-xs"
                    data-testid="archive-phys-filter"
                  >
                    <option value="">All paper status</option>
                    <option value="PENDING">Pending</option>
                    <option value="RECEIVED">Received</option>
                    <option value="MISSING">Missing</option>
                    <option value="N_A">Digital only</option>
                  </select>
                  {canBulk && selected.size > 0 && (
                    <button
                      onClick={handleBulkMark}
                      data-testid="archive-bulk-mark"
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                    >
                      <CheckSquare size={14} /> Mark {selected.size} Received
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {canBulk && (
                        <th className="px-3 py-2 w-10">
                          <button
                            onClick={handleSelectAll}
                            className="p-1 hover:bg-gray-100 rounded"
                            disabled={allSelectableIds.length === 0}
                            data-testid="archive-select-all"
                          >
                            {allSelected
                              ? <CheckSquare size={16} className="text-green-600" />
                              : <Square size={16} className="text-gray-400" />}
                          </button>
                        </th>
                      )}
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">BDM</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Amount</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Paper</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Received</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.length === 0 && (
                      <tr>
                        <td colSpan={canBulk ? 8 : 7} className="text-center py-12 text-gray-400">
                          {loading ? 'Loading...' : 'No captures match these filters.'}
                        </td>
                      </tr>
                    )}
                    {leaves.map(r => {
                      const id = String(r._id);
                      const isSelected = selected.has(id);
                      const canSelect = canBulk && r.physical_required && r.physical_status !== 'RECEIVED';
                      return (
                        <tr key={id} className={`border-b ${isSelected ? 'bg-indigo-50/40' : 'hover:bg-gray-50'}`}>
                          {canBulk && (
                            <td className="px-3 py-2">
                              {canSelect ? (
                                <button
                                  onClick={() => handleSelectRow(id)}
                                  className="p-1 hover:bg-gray-100 rounded"
                                  data-testid={`archive-row-select-${id}`}
                                >
                                  {isSelected
                                    ? <CheckSquare size={16} className="text-indigo-600" />
                                    : <Square size={16} className="text-gray-400" />}
                                </button>
                              ) : (
                                <span className="block w-7 h-7" />
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 text-gray-700">{fmtDate(r.created_at)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <UserIcon size={12} className="text-gray-400" />
                              <span>{r.bdm_id?.name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {r.amount_declared != null ? `₱${Number(r.amount_declared).toLocaleString()}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs">{r.status?.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2">
                            <PhysicalStatusChip
                              status={r.physical_status}
                              required={r.physical_required}
                              prefix=""
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">
                            {r.physical_received_at
                              ? `${fmtDate(r.physical_received_at)}${r.physical_received_by?.name ? ` by ${r.physical_received_by.name}` : ''}`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {canOverride && r.physical_required && (
                              <button
                                onClick={() => setOverrideRow(r)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                                data-testid={`archive-row-override-${id}`}
                              >
                                Override
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {leavesTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 rounded-b-xl">
                  <span className="text-xs text-gray-500">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, leavesTotal)} of {leavesTotal}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="px-3 py-1 border rounded text-xs disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      disabled={(page + 1) * PAGE_SIZE >= leavesTotal}
                      className="px-3 py-1 border rounded text-xs disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Override sheet — shared component (Slice 9) */}
      {overrideRow && (
        <PhysicalStatusOverrideSheet
          currentStatus={overrideRow.physical_status}
          onClose={() => setOverrideRow(null)}
          onApply={handleOverrideApply}
          testIdPrefix="archive-override"
        />
      )}
    </div>
  );
}
