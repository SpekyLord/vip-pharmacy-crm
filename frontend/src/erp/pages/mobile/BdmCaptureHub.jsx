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
  Camera, Receipt, FileText, Truck, Fuel,
  ReceiptText, Landmark, HandCoins, FileBadge,
  MapPin, Clock, Upload,
  ChevronRight, RefreshCw, X,
  Car, Wallet as WalletOut, Handshake, Banknote, PackageOpen,
  ScanBarcode,
  Sparkles, Check, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import useCaptureSubmissions from '../../hooks/useCaptureSubmissions';
import { useAuth } from '../../../hooks/useAuth';
import WorkflowGuide from '../../components/WorkflowGuide';
import AllocationPanel from './AllocationPanel';
import '../../../styles/capture-hub.css';

// ── Sections + Workflow definitions ──
// Tiles are grouped into 5 sections by the BDM's mental model of WHERE
// the document originates (vehicle, cash-out, customer, bank, stock).
// Order within a section is by frequency-of-use.
//
// `sub_type` is set for COLLECTION variants — backend uses it to route
// the same workflow_type to different physical-paper expectations
// (PAID_CSI is digital-only; CR + DEPOSIT both expect paper).
//
// `digitalOnly` tiles render a small "Digital only" pill so the BDM knows
// no paper trail is expected before opening the modal.
const SECTIONS = [
  { id: 'vehicle',    label: 'Vehicle',           icon: Car,         caption: 'Daily reading' },
  { id: 'cash_out',   label: 'Cash Out',          icon: WalletOut,   caption: 'Money you spent' },
  { id: 'customer',   label: 'Customer Delivery', icon: Handshake,   caption: 'Sale-side documents' },
  { id: 'collection', label: 'Collection',        icon: Banknote,    caption: 'Money coming in' },
  { id: 'inventory',  label: 'Inventory',         icon: PackageOpen, caption: 'Stock received' },
];

const WORKFLOWS = [
  {
    key: 'SMER',
    section: 'vehicle',
    label: 'Scan ODO (Start / End)',
    icon: Camera,
    color: '#0284c7',
    description: 'Daily odometer reading photos — start + end of day',
    artifactKind: 'photo',
    fields: [],
    digitalOnly: true,
    active: true,
  },
  {
    key: 'EXPENSE',
    section: 'cash_out',
    label: 'Scan OR / Receipt',
    icon: Receipt,
    color: '#059669',
    description: 'Official receipt — amount + payment mode',
    artifactKind: 'receipt_scan',
    fields: ['amount_declared', 'payment_mode', 'access_for'],
    active: true,
  },
  {
    key: 'FUEL_ENTRY',
    section: 'cash_out',
    label: 'Scan Fuel Receipt',
    icon: Fuel,
    color: '#ea580c',
    description: 'Fuel pump receipt — liters + amount',
    artifactKind: 'fuel_receipt',
    fields: ['amount_declared'],
    active: true,
  },
  {
    key: 'SALES',
    section: 'customer',
    label: 'Scan CSI (Delivery Copy)',
    icon: FileText,
    color: '#7c3aed',
    description: 'Pink/yellow/duplicate CSI — proof of delivery',
    artifactKind: 'csi_scan',
    fields: ['access_for'],
    active: true,
  },
  {
    key: 'COLLECTION',
    sub_type: 'PAID_CSI',
    section: 'collection',
    label: 'Scan CSI Being Paid',
    icon: HandCoins,
    color: '#0ea5e9',
    description: 'CSI marked paid by customer',
    artifactKind: 'paid_csi_scan',
    fields: ['access_for'],
    digitalOnly: true,
    active: true,
  },
  {
    key: 'COLLECTION',
    sub_type: 'CR',
    section: 'collection',
    label: 'Scan Collection Receipt (CR)',
    icon: ReceiptText,
    color: '#0891b2',
    description: 'CR issued to customer — amount + customer',
    artifactKind: 'cr_scan',
    fields: ['amount_declared', 'access_for'],
    active: true,
  },
  // Phase P1.2 Phase 1 (May 06 2026) — CWT collapsed from a top-level
  // workflow_type='CWT_INBOUND' to a sub_type of COLLECTION. Hospitals send
  // CR + DEPOSIT + CWT together as one collection package, so a single
  // workflow_type covers them all. The composite tile key
  // `${w.key}_${w.sub_type || 'main'}` now resolves to 'COLLECTION_CWT'
  // (vs the legacy 'CWT_INBOUND_main'). Backend rejects standalone
  // workflow_type='CWT_INBOUND' on save (enum was narrowed); migration
  // script flipped all live rows to the new shape.
  {
    key: 'COLLECTION',
    sub_type: 'CWT',
    section: 'collection',
    label: 'Scan CWT (BIR 2307)',
    icon: FileBadge,
    color: '#6366f1',
    description: 'Certificate of withholding tax from customer (paper to Iloilo office)',
    artifactKind: 'cwt_scan',
    fields: ['amount_declared', 'access_for'],
    active: true,
  },
  {
    key: 'COLLECTION',
    sub_type: 'DEPOSIT',
    section: 'collection',
    label: 'Scan Deposit Slip',
    icon: Landmark,
    color: '#0d9488',
    description: 'Bank deposit slip after collection',
    artifactKind: 'deposit_slip',
    fields: ['amount_declared'],
    active: true,
  },
  // Phase P1.2 Slice 6.2 (May 06 2026) — GRN tile splits into two so the
  // proxy can tell at-a-glance which captures need a paper hand-in vs which
  // are pure OCR feedstock.
  //   BATCH_PHOTO (D)  — Digital-only photo of vial/box labels. OCR extracts
  //                      batch + expiry; the physical product itself is the
  //                      source so no paper arrives at office.
  //   WAYBILL     (M)  — Photo of the courier waybill paper. The physical
  //                      paper still needs to be hand-delivered to office —
  //                      Slice 3 reconciliation will block the BDM's per-diem
  //                      cycle if it goes missing.
  {
    key: 'GRN',
    sub_type: 'BATCH_PHOTO',
    section: 'inventory',
    label: 'Scan Batch Photo',
    icon: ScanBarcode,
    color: '#d97706',
    description: 'Photo of vial / box labels — OCR extracts batch + expiry',
    artifactKind: 'barcode_scan',
    fields: [],
    digitalOnly: true,
    active: true,
  },
  {
    key: 'GRN',
    sub_type: 'WAYBILL',
    section: 'inventory',
    label: 'Scan Waybill',
    icon: Truck,
    color: '#dc2626',
    description: 'Courier waybill paper — proof of arrival, paper to office',
    artifactKind: 'photo',
    fields: [],
    active: true,
  },
  // PETTY_CASH tile removed May 05 2026 — petty cash request flow moved
  // off the Capture Hub. Backend enum DROPPED in Phase P1.2 Phase 1 (May 06
  // 2026); no Capture Hub tile, no enum slot, no migration target. Any
  // pre-Phase-1 rows remain readable but cannot be re-saved without admin
  // re-classifying them.
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
//
// Phase P1.2 Slice 5 (May 06 2026) — SMER tile carries an optional lock state
// when prior workdays in the current cycle are unallocated. Tap on a locked
// tile scrolls to the AllocationPanel above instead of opening the modal.
function CaptureCard({ workflow, onCapture, disabled, locked, lockReason, onLockedTap }) {
  const Icon = workflow.icon;
  const handleClick = () => {
    if (locked) {
      onLockedTap?.();
      return;
    }
    onCapture(workflow);
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`ch-tile ${locked ? 'ch-tile-locked' : ''}`}
      style={{ borderLeft: `4px solid ${locked ? '#94a3b8' : workflow.color}` }}
      data-testid={locked ? `ch-tile-locked-${workflow.key}` : undefined}
    >
      <div
        className="ch-tile-icon"
        style={{ backgroundColor: `${locked ? '#94a3b8' : workflow.color}15`, color: locked ? '#475569' : workflow.color }}
      >
        {locked ? <Lock size={22} /> : <Icon size={22} />}
      </div>
      <div className="ch-tile-body">
        <div className="ch-tile-title-row">
          <div className="ch-tile-title">{workflow.label}</div>
          {locked ? (
            <span className="ch-tile-pill ch-tile-pill-lock">
              <Lock size={10} /> Locked
            </span>
          ) : workflow.digitalOnly && (
            <span className="ch-tile-pill">
              <Sparkles size={10} /> Digital only
            </span>
          )}
        </div>
        <div className="ch-tile-desc">
          {locked ? (lockReason || 'Allocate yesterday first') : workflow.description}
        </div>
      </div>
      <ChevronRight size={20} className="ch-tile-chevron" />
    </button>
  );
}

// ── Section Header ──
function SectionHeader({ section, count }) {
  const Icon = section.icon;
  return (
    <div className="ch-section-header">
      <div className="ch-section-icon">
        <Icon size={14} />
      </div>
      <div className="ch-section-meta">
        <div className="ch-section-label">{section.label}</div>
        <div className="ch-section-caption">{section.caption}</div>
      </div>
      <span className="ch-section-count">{count}</span>
    </div>
  );
}

// ── Pending count badge ──
function PendingBadge({ count }) {
  if (!count) return null;
  return (
    <div className="ch-pending-badge">
      <Clock size={14} />
      <span>{count} pending</span>
    </div>
  );
}

// ── Quick Capture button ──
//
// Phase P1.2 Slice 1 (May 2026) — zero-typing entry point. Tap → camera →
// snap → upload to S3 → submit with workflow_type=UNCATEGORIZED. Three
// physical taps, no form fields. The proxy classifies the photo later from
// the Pending-Photos picker on the relevant ERP entry page.
//
// Reasoning (from the locked Path A plan): BDMs send photos via Messenger
// today, not Capture Hub, because the existing 9-tile flow asks them to
// pick a workflow + fill in amount + payment mode + access-for + notes
// BEFORE they've even submitted the photo. Quick Capture inverts that —
// the photo goes up first, classification happens on the office side
// where the proxy is already entering the ERP doc anyway.
//
// Screenshot detection still fires server-side (Phase O) — a 422 redirects
// the BDM to /bdm/comm-log with a friendly toast.
function QuickCaptureButton({ gps, onSuccess, uploadArtifact, createCapture }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handlePick = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const upRes = await uploadArtifact([file], { workflow_type: 'UNCATEGORIZED' });
      const arts = (upRes?.data?.artifacts || []).map((a) => ({
        kind: 'photo',
        url: a.url,
        gps: gps || a.gps || undefined,
        timestamp: a.capturedAt || new Date().toISOString(),
        photoFlags: a.photoFlags,
      }));
      if (arts.length === 0) {
        toast.error('No artifacts returned from upload');
        return;
      }
      await createCapture({
        workflow_type: 'UNCATEGORIZED',
        captured_artifacts: arts,
      });
      toast.success('Quick capture saved! Office will classify.');
      onSuccess?.();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'SCREENSHOT_DETECTED') {
        toast.error('Screenshots belong in Comm Log, not Capture. Redirecting…');
        const redirect = err.response?.data?.redirect || '/bdm/comm-log';
        setTimeout(() => { window.location.href = redirect; }, 700);
        return;
      }
      toast.error(err?.response?.data?.message || 'Quick capture failed');
    } finally {
      setBusy(false);
      // Reset the input so re-picking the same file still triggers onChange
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [uploadArtifact, createCapture, gps, onSuccess]);

  return (
    <>
      <button
        onClick={() => {
          fileRef.current.setAttribute('capture', 'environment');
          fileRef.current.click();
        }}
        disabled={busy}
        className="ch-quick-capture"
        data-testid="ch-quick-capture-btn"
      >
        {busy ? (
          <>
            <RefreshCw size={22} style={{ animation: 'spin 1s linear infinite' }} />
            <span className="ch-quick-capture-label">Uploading…</span>
          </>
        ) : (
          <>
            <Camera size={22} />
            <span className="ch-quick-capture-label">Quick Capture</span>
            <span className="ch-quick-capture-hint">Snap a photo, classify later</span>
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handlePick}
        style={{ display: 'none' }}
      />
    </>
  );
}

// ── Capture Modal ──
//
// Phase P1.2 Slice 1 (May 2026) — handleSubmit now uploads files to S3 via
// uploadArtifact (passed from parent) BEFORE calling onSubmit. The previews
// state remains as inline data URLs purely for the in-modal thumbnails;
// the persisted artifacts always carry S3 URLs.
function CaptureModal({ workflow, gps, onSubmit, onUpload, onClose, loading }) {
  const fileRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('');
  const [accessFor, setAccessFor] = useState('');
  const [uploading, setUploading] = useState(false);

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

    // Phase P1.2 Slice 1 — upload to S3 first, then build artifacts
    // with the returned S3 URLs. Replaces the data-URL stuffing path.
    let artifacts;
    setUploading(true);
    try {
      const upRes = await onUpload(files, { workflow_type: workflow.key });
      artifacts = (upRes?.data?.artifacts || []).map((a) => ({
        kind: workflow.artifactKind,
        url: a.url,
        gps: gps || a.gps || undefined,
        timestamp: a.capturedAt || new Date().toISOString(),
        photoFlags: a.photoFlags,
        notes: notes || undefined,
      }));
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'SCREENSHOT_DETECTED') {
        toast.error('Screenshots belong in Comm Log, not Capture. Redirecting…');
        const redirect = err.response?.data?.redirect || '/bdm/comm-log';
        // Brief delay so the toast lands before the navigation flushes it.
        setTimeout(() => { window.location.href = redirect; }, 700);
        setUploading(false);
        return;
      }
      toast.error(err?.response?.data?.message || 'Photo upload failed');
      setUploading(false);
      return;
    }
    setUploading(false);

    if (!artifacts || artifacts.length === 0) {
      toast.error('No artifacts returned from upload');
      return;
    }

    const payload = {
      workflow_type: workflow.key,
      captured_artifacts: artifacts,
      bdm_notes: notes || undefined,
    };

    if (workflow.sub_type) {
      payload.sub_type = workflow.sub_type;
    }
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
  }, [files, workflow, gps, notes, amount, paymentMode, accessFor, onSubmit, onUpload]);

  return (
    <div className="ch-modal-backdrop">
      <div className="ch-modal">
        {/* Header */}
        <div className="ch-modal-header">
          <div className="ch-modal-header-left">
            <div
              className="ch-modal-icon"
              style={{ backgroundColor: `${workflow.color}15`, color: workflow.color }}
            >
              <workflow.icon size={20} />
            </div>
            <h2 className="ch-modal-title">{workflow.label}</h2>
          </div>
          <button onClick={onClose} className="ch-modal-close" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="ch-modal-body">
          {/* Camera / File input */}
          <div className="ch-capture-row">
            <button
              onClick={() => { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); }}
              className="ch-capture-btn primary"
            >
              <Camera size={20} /> Take Photo
            </button>
            <button
              onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click(); }}
              className="ch-capture-btn secondary"
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
            style={{ display: 'none' }}
          />

          {/* Previews */}
          {previews.length > 0 && (
            <div className="ch-previews">
              {previews.map((src, i) => (
                <div key={i} className="ch-preview">
                  <img src={src} alt={`Capture ${i + 1}`} />
                  <button
                    onClick={() => removeFile(i)}
                    className="ch-preview-remove"
                    aria-label="Remove photo"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* GPS indicator */}
          <div className={`ch-gps-row ${gps ? '' : 'acquiring'}`}>
            <MapPin size={16} />
            <span>
              {gps ? `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${Math.round(gps.accuracy)}m)` : 'Acquiring GPS...'}
            </span>
          </div>

          {/* Digital-only hint */}
          {workflow.digitalOnly && (
            <div className="ch-digital-banner">
              <strong>Digital-only:</strong> No paper expected for this capture.
              Office will process directly from the photo — no hardcopy hand-in.
            </div>
          )}

          {/* Workflow-specific fields */}
          {workflow.fields.includes('amount_declared') && (
            <div>
              <label className="ch-field-label">Amount</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="ch-field-input"
              />
            </div>
          )}

          {workflow.fields.includes('payment_mode') && (
            <div>
              <label className="ch-field-label">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="ch-field-select"
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
              <label className="ch-field-label">
                {workflow.key === 'EXPENSE' ? 'Who is this for? (ACCESS)' : 'Customer / Hospital'}
              </label>
              <input
                type="text"
                value={accessFor}
                onChange={(e) => setAccessFor(e.target.value)}
                placeholder="e.g., Dr. Santos, Hospital X"
                className="ch-field-input"
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="ch-field-label">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes for the office team..."
              rows={2}
              maxLength={1000}
              className="ch-field-textarea"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || uploading || files.length === 0}
            className="ch-submit-btn"
            style={{ backgroundColor: workflow.color }}
          >
            {uploading ? (
              <span className="ch-submit-btn-loading">
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Uploading photos…
              </span>
            ) : loading ? (
              <span className="ch-submit-btn-loading">
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…
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

// ── Main Component ──
export default function BdmCaptureHub() {
  useAuth();
  const { createCapture, uploadArtifact, getMyCaptures, loading } = useCaptureSubmissions();
  const { gps } = useGps();

  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentCaptures, setRecentCaptures] = useState([]);
  // Phase P1.2 Slice 5 — track unallocated workdays so the SMER tile can lock.
  // The AllocationPanel feeds this via onChange after fetching the API. We
  // only lock when the role gate allows allocation (no point locking out a
  // BDM who can't act on the lock prompt).
  const [allocStatus, setAllocStatus] = useState({
    unallocatedCount: 0, canAllocate: false, canMarkNoDrive: false,
  });
  const allocPanelRef = useRef(null);

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
      // A successful SMER capture for today may unlock new auto-fill suggestions
      // for yesterday's allocation panel — re-fetch.
      if (payload?.workflow_type === 'SMER' || payload?.workflow_type === 'UNCATEGORIZED') {
        allocPanelRef.current?.refresh?.();
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to submit capture');
    }
  }, [createCapture, loadData]);

  // Phase P1.2 Slice 5 — scroll to AllocationPanel when a locked tile is tapped.
  const handleLockedTap = useCallback(() => {
    const el = document.getElementById('allocation-panel');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('Allocate prior workdays first.', { icon: '🔒' });
    }
  }, []);

  // Group active workflows by section for the rendered list
  const grouped = SECTIONS.map(s => ({
    section: s,
    workflows: WORKFLOWS.filter(w => w.active && w.section === s.id),
  })).filter(g => g.workflows.length > 0);

  const totalActiveTiles = grouped.reduce((acc, g) => acc + g.workflows.length, 0);

  // SMER tile lock — only lock when there are unallocated days AND the BDM
  // has at least one of the two allocation gates (otherwise locking out a
  // user who can't unblock is a UX dead-end).
  const smerLocked = allocStatus.unallocatedCount > 0 &&
    (allocStatus.canAllocate || allocStatus.canMarkNoDrive);
  const smerLockReason = smerLocked
    ? `Allocate ${allocStatus.unallocatedCount} prior day${allocStatus.unallocatedCount === 1 ? '' : 's'} first`
    : null;

  return (
    <div className="ch-page">
      <WorkflowGuide pageKey="bdm-capture-hub" />

      {/* Header */}
      <div className="ch-header">
        <div className="ch-header-row">
          <div>
            <h1 className="ch-title">Capture Hub</h1>
            <p className="ch-subtitle">
              {totalActiveTiles} capture types — one tap, GPS + photo to office
            </p>
          </div>
          <PendingBadge count={pendingCount} />
        </div>
      </div>

      {/* Phase P1.2 Slice 4 — Tomorrow-drive allocation panel */}
      <AllocationPanel ref={allocPanelRef} onChange={setAllocStatus} />

      {/* Phase P1.2 Slice 1 — Quick Capture (zero-typing path) */}
      <QuickCaptureButton
        gps={gps}
        uploadArtifact={uploadArtifact}
        createCapture={createCapture}
        onSuccess={() => { loadData(); allocPanelRef.current?.refresh?.(); }}
      />

      {/* Sectioned workflow cards */}
      <div className="ch-sections">
        {grouped.map(({ section, workflows }) => (
          <div key={section.id}>
            <SectionHeader section={section} count={workflows.length} />
            <div className="ch-section-tiles">
              {workflows.map(w => (
                <CaptureCard
                  key={`${w.key}_${w.sub_type || 'main'}`}
                  workflow={w}
                  onCapture={handleCapture}
                  disabled={loading}
                  locked={w.key === 'SMER' && smerLocked}
                  lockReason={w.key === 'SMER' ? smerLockReason : null}
                  onLockedTap={handleLockedTap}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Recent captures */}
      {recentCaptures.length > 0 && (
        <>
          <div className="ch-recent-heading">Recent Captures</div>
          <div className="ch-recent-list">
            {recentCaptures.map(c => (
              <div key={c._id} className="ch-recent-row">
                <div className="ch-recent-text">
                  <div className="ch-recent-label">
                    {c.workflow_type.replace(/_/g, ' ')}
                    {c.sub_type ? ` · ${c.sub_type.replace(/_/g, ' ')}` : ''}
                  </div>
                  <div className="ch-recent-meta">
                    {new Date(c.created_at).toLocaleString()}
                    {c.amount_declared ? ` • ₱${c.amount_declared.toLocaleString()}` : ''}
                  </div>
                </div>
                <span className={`ch-recent-status ${(c.status || '').toLowerCase()}`}>
                  {c.status === 'ACKNOWLEDGED' && <Check size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />}
                  {c.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Fallback note */}
      <div className="ch-tip">
        <strong>Tip:</strong> You can always enter expenses, sales, and other records directly from the regular entry pages.
        The capture hub is an optional shortcut for faster field work.
      </div>

      {/* Capture Modal */}
      {activeWorkflow && (
        <CaptureModal
          workflow={activeWorkflow}
          gps={gps}
          onSubmit={handleSubmit}
          onUpload={uploadArtifact}
          onClose={() => setActiveWorkflow(null)}
          loading={loading}
        />
      )}
    </div>
  );
}
