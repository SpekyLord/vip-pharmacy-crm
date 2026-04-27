/**
 * PartnershipCLM Page
 *
 * BDM page for the Closed Loop Marketing module:
 * 1. Select a doctor (VIP Client) to present to
 * 2. Select products to feature in the presentation (from CRM)
 * 3. Launch the full-screen CLM presentation
 * 4. After session, record notes + interest level + product interest
 * 5. View past session history
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import CLMPresenter from '../../components/employee/CLMPresenter';
import OfflineBanner from '../../components/common/OfflineBanner';
import ProductImage from '../../components/common/ProductImage';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PageGuide from '../../components/common/PageGuide';
import { useAuth } from '../../hooks/useAuth';
import { useOffline } from '../../hooks/useOffline';
import { offlineStore } from '../../utils/offlineStore';
import doctorService from '../../services/doctorService';
import productService from '../../services/productService';
import clmService from '../../services/clmService';
import clmBrandingService from '../../services/clmBrandingService';
import toast from 'react-hot-toast';
import {
  Presentation,
  Search,
  Play,
  Clock,
  Star,
  MessageCircle,
  ChevronRight,
  ChevronLeft,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BarChart3,
  Package,
  Check,
} from 'lucide-react';

const PartnershipCLM = () => {
  const { user } = useAuth();
  useOffline(); // initializes offline listeners; OfflineBanner consumes state via its own hook

  // Phase N — Query params from VisitLogger's "Start Presentation" jump.
  // session_group_id is the same UUID that becomes Visit.session_group_id
  // and CLMSession.idempotencyKey, joining the two halves of the encounter.
  const [searchParams] = useSearchParams();
  const incomingDoctorId = searchParams.get('doctorId');
  const incomingGroupId = searchParams.get('session_group_id');
  const incomingProductsCsv = searchParams.get('products') || '';
  // Pin once so the prefill doesn't re-fire on every render — pure observability.
  const prefilledRef = useRef(false);

  // ── State ─────────────────────────────────────────────────────
  const [doctors, setDoctors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [products, setProducts] = useState([]);
  const [branding, setBranding] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [tab, setTab] = useState('present'); // 'present' | 'history'

  // ── Presentation flow: doctor → products → presenting ─────────
  const [step, setStep] = useState('doctor'); // 'doctor' | 'products' | 'presenting'
  const [activeSession, setActiveSession] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());

  // ── Post-session modal ────────────────────────────────────────
  const [showEndModal, setShowEndModal] = useState(false);
  const [endSessionData, setEndSessionData] = useState(null);
  const [productInterest, setProductInterest] = useState({});
  const [endForm, setEndForm] = useState({
    interestLevel: 3,
    outcome: 'maybe',
    bdmNotes: '',
    followUpDate: '',
  });

  // ── Fetch data (with offline fallback) ────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      if (navigator.onLine) {
        // Online: fetch from API and cache for offline use
        const [doctorRes, sessionRes, productRes] = await Promise.all([
          doctorService.getAll({ limit: 500 }),
          clmService.getMySessions({ limit: 50 }),
          productService.getAll({ limit: 500 }),
        ]);
        const doctorData = doctorRes.data || [];
        const productData = (productRes.data || []).filter((p) => p.isActive !== false);
        setDoctors(doctorData);
        setSessions(sessionRes.data || []);
        setProducts(productData);
        // Cache for offline use (fire-and-forget)
        offlineStore.cacheDoctors(doctorData);
        offlineStore.cacheProducts(productData);
        // Cache product image bytes in IndexedDB (survives S3 signed URL expiry)
        offlineStore.cacheProductImages(productData);
      } else {
        // Offline: load from IndexedDB cache
        const [cachedDoctors, cachedProducts] = await Promise.all([
          offlineStore.getCachedDoctors(),
          offlineStore.getCachedProducts(),
        ]);
        setDoctors(cachedDoctors);
        setProducts(cachedProducts.filter((p) => p.isActive !== false));
        setSessions([]); // Sessions not available offline
        if (cachedDoctors.length > 0) {
          toast('Loaded cached data for offline use', { icon: '\u{1F4E1}' });
        } else {
          toast.error('No cached data available. Connect to internet first to load VIP Clients.');
        }
      }
    } catch {
      // Network error — try offline cache as fallback
      try {
        const [cachedDoctors, cachedProducts] = await Promise.all([
          offlineStore.getCachedDoctors(),
          offlineStore.getCachedProducts(),
        ]);
        if (cachedDoctors.length > 0) {
          setDoctors(cachedDoctors);
          setProducts(cachedProducts.filter((p) => p.isActive !== false));
          setSessions([]);
          toast('Using cached data (offline)', { icon: '\u{1F4E1}' });
        } else {
          toast.error('Failed to load data and no offline cache available');
        }
      } catch {
        toast.error('Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Phase N — Auto-prefill when arriving from VisitLogger's "Start
  // Presentation" jump. Once the doctors + products lists are loaded,
  // resolve the IDs from the query string and skip straight to step='products'
  // so the BDM doesn't have to re-pick what they already chose.
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!incomingDoctorId || doctors.length === 0) return;
    const doc = doctors.find((d) => String(d._id) === String(incomingDoctorId));
    if (!doc) return;
    prefilledRef.current = true;
    setSelectedDoctor(doc);
    if (incomingProductsCsv) {
      const ids = incomingProductsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      setSelectedProductIds(new Set(ids));
    }
    setStep('products');
    setTab('present');
  }, [incomingDoctorId, incomingProductsCsv, doctors]);

  // Fetch per-entity CLM branding once the user is loaded. Fire-and-forget:
  // if this fails (offline, network error), CLMPresenter falls back to
  // CLM_DEFAULTS and the pitch still launches — no blocking.
  useEffect(() => {
    const entityId = user?.entity_id || (Array.isArray(user?.entity_ids) && user.entity_ids[0]);
    if (!entityId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await clmBrandingService.get(entityId);
        if (!cancelled) setBranding(res?.data || null);
      } catch {
        if (!cancelled) setBranding(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ── Filtered doctors ──────────────────────────────────────────
  const filteredDoctors = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return doctors;
    return doctors.filter(
      (d) =>
        `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
        (d.specialization || '').toLowerCase().includes(q) ||
        (d.clinicOfficeAddress || '').toLowerCase().includes(q)
    );
  }, [doctors, search]);

  // ── Filtered products ─────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.genericName || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  // ── Select doctor → go to product selection ───────────────────
  const handleSelectDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    setSelectedProductIds(new Set());
    setProductSearch('');
    setStep('products');
  };

  // ── Toggle product selection ──────────────────────────────────
  const toggleProduct = (productId) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // ── Start presentation (works offline) ────────────────────────
  const handleStartPresentation = async () => {
    if (!selectedDoctor) return;
    try {
      let location = {};
      if (navigator.geolocation) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {
          // GPS not available — proceed without
        }
      }
      const productIds = Array.from(selectedProductIds);

      if (navigator.onLine) {
        // Online: normal API flow.
        // Phase N — pass the inbound session_group_id (from VisitLogger
        // "Start Presentation") as idempotencyKey so visitController can
        // resolve the linked CLMSession by that same UUID at submit time.
        // Generates a fresh key when standalone (no incomingGroupId).
        const idempotencyKey = incomingGroupId
          || `clm_${Date.now()}_${selectedDoctor._id}_${Math.random().toString(36).slice(2, 10)}`;
        const res = await clmService.startSession(
          selectedDoctor._id,
          location,
          productIds,
          idempotencyKey,
          'in_person',
        );
        setActiveSession(res.data);
      } else {
        // Offline: create a local draft session
        const offlineSession = {
          _id: `offline_${Date.now()}`,
          offlineQueued: true,
          doctor: selectedDoctor._id,
          location,
          productIds,
          startedAt: new Date().toISOString(),
        };
        setActiveSession(offlineSession);
        toast('Presenting offline — session will sync later', { icon: '\u{1F4E1}' });
      }
      setStep('presenting');
      toast.success('Presentation started');
    } catch {
      // Network error — fall back to offline mode
      const offlineSession = {
        _id: `offline_${Date.now()}`,
        offlineQueued: true,
        doctor: selectedDoctor._id,
        startedAt: new Date().toISOString(),
      };
      setActiveSession(offlineSession);
      setStep('presenting');
      toast('Presenting offline — session will sync later', { icon: '\u{1F4E1}' });
    }
  };

  // ── End presentation (offline-aware) ─────────────────────────
  const handleEndPresentation = async (sessionId, slideEvents) => {
    setStep('doctor');
    // Try to record slide events (non-critical, SW will queue if offline)
    if (sessionId && slideEvents?.length && !String(sessionId).startsWith('offline_')) {
      try {
        await clmService.recordSlideEvents(sessionId, slideEvents);
      } catch {
        // Non-critical — queued by service worker if offline
      }
    }
    // Initialize product interest map from selected products
    const interestMap = {};
    selectedProductIds.forEach((pid) => {
      interestMap[pid] = false;
    });
    setProductInterest(interestMap);
    setEndSessionData({ sessionId, slideEvents });
    setShowEndModal(true);
  };

  // ── Submit post-session form (offline-aware) ──────────────────
  const handleSubmitEnd = async () => {
    if (!endSessionData?.sessionId) {
      setShowEndModal(false);
      return;
    }
    try {
      const productsPresented = Object.entries(productInterest).map(([productId, interested]) => ({
        productId,
        interestShown: interested,
      }));

      const isOfflineSession = String(endSessionData.sessionId).startsWith('offline_');

      if (isOfflineSession) {
        // Save complete draft to IndexedDB for later sync
        // idempotencyKey prevents duplicate sessions if sync replays twice
        const idempotencyKey = `clm_${Date.now()}_${selectedDoctor?._id}_${Math.random().toString(36).slice(2, 10)}`;
        await offlineStore.saveDraft({
          idempotencyKey,
          doctorId: selectedDoctor?._id,
          doctorName: selectedDoctor ? `${selectedDoctor.firstName} ${selectedDoctor.lastName}` : 'Unknown',
          location: activeSession?.location || {},
          productIds: Array.from(selectedProductIds),
          slideEvents: endSessionData.slideEvents || [],
          endForm: { ...endForm },
          productsPresented,
          startedAt: activeSession?.startedAt,
          endedAt: new Date().toISOString(),
        });
        toast.success('Session saved offline \u2014 will sync when connected');
      } else {
        // Online: normal API flow (SW will queue if network fails)
        await clmService.endSession(endSessionData.sessionId, {
          ...endForm,
          productsPresented,
        });
        toast.success('Session recorded');
      }

      setShowEndModal(false);
      setEndSessionData(null);
      setProductInterest({});
      setEndForm({ interestLevel: 3, outcome: 'maybe', bdmNotes: '', followUpDate: '' });
      if (!isOfflineSession) fetchData();
    } catch {
      // Last resort: save as offline draft
      try {
        const productsPresented = Object.entries(productInterest).map(([productId, interested]) => ({
          productId,
          interestShown: interested,
        }));
           const fallbackKey = `clm_${Date.now()}_${selectedDoctor?._id}_${Math.random().toString(36).slice(2, 10)}`;
        await offlineStore.saveDraft({
          idempotencyKey: fallbackKey,
          doctorId: selectedDoctor?._id,
          doctorName: selectedDoctor ? `${selectedDoctor.firstName} ${selectedDoctor.lastName}` : 'Unknown',
          location: activeSession?.location || {},
          productIds: Array.from(selectedProductIds),
          slideEvents: endSessionData.slideEvents || [],
          endForm: { ...endForm },
          productsPresented,
          startedAt: activeSession?.startedAt,
          endedAt: new Date().toISOString(),
        });
        toast.success('Network error — session saved offline');
      } catch {
        toast.error('Failed to save session');
      }
      setShowEndModal(false);
      setEndSessionData(null);
      setProductInterest({});
      setEndForm({ interestLevel: 3, outcome: 'maybe', bdmNotes: '', followUpDate: '' });
    }
  };

   // ── QR displayed callback (skip for offline sessions) ─────────
  const handleQrDisplayed = async (sessionId) => {
    if (!sessionId || String(sessionId).startsWith('offline_')) return;
    try {
      await clmService.markQrDisplayed(sessionId);
    } catch {
      // Non-critical — SW will queue if offline
    }
  };

  // ── Outcome badge helper ──────────────────────────────────────
  const OutcomeBadge = ({ outcome }) => {
    const config = {
      interested: { icon: CheckCircle2, color: '#059669', label: 'Interested' },
      maybe: { icon: HelpCircle, color: '#f59e0b', label: 'Maybe' },
      not_interested: { icon: XCircle, color: '#ef4444', label: 'Not Interested' },
      already_partner: { icon: CheckCircle2, color: '#3b82f6', label: 'Already Partner' },
      reschedule: { icon: Calendar, color: '#8b5cf6', label: 'Reschedule' },
    };
    const c = config[outcome] || config.maybe;
    const Icon = c.icon;
    return (
      <span className="outcome-badge" style={{ color: c.color, borderColor: `${c.color}33` }}>
        <Icon size={14} /> {c.label}
      </span>
    );
  };

  // ── Full-screen presenter ─────────────────────────────────────
  if (step === 'presenting' && activeSession) {
    const selectedProducts = products.filter((p) => selectedProductIds.has(p._id));
    return (
      <CLMPresenter
        session={activeSession}
        doctor={selectedDoctor}
        products={selectedProducts}
        branding={branding}
        onEnd={handleEndPresentation}
        onQrDisplayed={handleQrDisplayed}
      />
    );
  }

  if (loading) return <LoadingSpinner />;

  return (
    <div className="clm-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <OfflineBanner />
      <div className="clm-content">
        <Sidebar />
        <main className="clm-main">
          <PageGuide pageKey="partnership-clm" />
          {/* ── Page header ─────────────────────────────────────── */}
          <div className="clm-page-header">
            <div>
              <h1>
                <Presentation size={24} />
                Partnership Presentation
              </h1>
              <p className="clm-page-subtitle">
                Present the VIP Online Pharmacy Partnership to VIP Clients
              </p>
            </div>
          </div>

          {/* ── Tabs ────────────────────────────────────────────── */}
          <div className="clm-tabs">
            <button
              className={`clm-tab ${tab === 'present' ? 'active' : ''}`}
              onClick={() => { setTab('present'); setStep('doctor'); }}
            >
              <Play size={16} /> Present
            </button>
            <button
              className={`clm-tab ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
            >
              <BarChart3 size={16} /> History ({sessions.length})
            </button>
          </div>

          {tab === 'present' ? (
            step === 'doctor' ? (
              /* ── Step 1: Select Doctor ──────────────────────── */
              <div className="clm-present-tab">
                <div className="clm-step-label">
                  <span className="clm-step-num">1</span>
                  Select a VIP Client to present to
                </div>
                <div className="clm-search-bar">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder="Search VIP Clients by name, specialty, or address..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="clm-doctor-grid">
                  {filteredDoctors.map((doc) => {
                    const lastSession = sessions.find(
                      (s) => (s.doctor?._id || s.doctor) === doc._id
                    );
                    return (
                      <div key={doc._id} className="clm-doctor-card">
                        <div className="clm-doctor-info">
                          <div className="clm-doctor-avatar">
                            {doc.firstName?.[0]}
                            {doc.lastName?.[0]}
                          </div>
                          <div>
                            <h3>Dr. {doc.firstName} {doc.lastName}</h3>
                            <p className="clm-doctor-spec">{doc.specialization || 'General'}</p>
                            {doc.clinicOfficeAddress && (
                              <p className="clm-doctor-addr">{doc.clinicOfficeAddress}</p>
                            )}
                          </div>
                        </div>
                        {lastSession && (
                          <div className="clm-last-session">
                            <Clock size={12} />
                            <span>Last: {new Date(lastSession.createdAt).toLocaleDateString()}</span>
                            {lastSession.outcome && <OutcomeBadge outcome={lastSession.outcome} />}
                          </div>
                        )}
                        <button className="clm-present-btn" onClick={() => handleSelectDoctor(doc)}>
                          <Play size={16} />
                          Select & Choose Products
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    );
                  })}
                  {filteredDoctors.length === 0 && (
                    <div className="clm-empty"><User size={40} /><p>No VIP Clients found</p></div>
                  )}
                </div>
              </div>
            ) : step === 'products' ? (
              /* ── Step 2: Select Products ────────────────────── */
              <div className="clm-products-step">
                <div className="clm-step-header">
                  <button className="clm-back-btn" onClick={() => setStep('doctor')}>
                    <ChevronLeft size={18} /> Back
                  </button>
                  <div>
                    <h2>
                      <Package size={20} />
                      Products for Dr. {selectedDoctor?.firstName} {selectedDoctor?.lastName}
                    </h2>
                    <p className="clm-step-subtitle">
                      Choose which products to feature in the presentation.
                      {selectedDoctor?.specialization && (
                        <> Specialty: <strong>{selectedDoctor.specialization}</strong></>
                      )}
                    </p>
                  </div>
                </div>
                <div className="clm-step-label">
                  <span className="clm-step-num">2</span>
                  Select products to present ({selectedProductIds.size} selected)
                </div>
                <div className="clm-search-bar">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder="Search products by name, generic name, or category..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <div className="clm-product-grid">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProductIds.has(p._id);
                    return (
                      <div
                        key={p._id}
                        className={`clm-product-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleProduct(p._id)}
                      >
                        <div className="clm-product-check">
                          {isSelected ? (
                            <div className="clm-check-on"><Check size={14} /></div>
                          ) : (
                            <div className="clm-check-off" />
                          )}
                        </div>
                        <ProductImage
                          productId={p._id}
                          imageUrl={p.image}
                          alt={p.name}
                          className="clm-product-img"
                          placeholderClassName="clm-product-placeholder"
                        />
                        <div className="clm-product-details">
                          <h4>{p.name}</h4>
                          {p.genericName && <p className="clm-product-generic">{p.genericName}</p>}
                          {p.dosage && <p className="clm-product-dosage">{p.dosage}</p>}
                          <span className="clm-product-cat">{p.category || 'Uncategorized'}</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="clm-empty"><Package size={40} /><p>No products found. Add products in the CRM first.</p></div>
                  )}
                </div>
                <div className="clm-product-actions">
                  <button
                    className="clm-start-btn"
                    onClick={handleStartPresentation}
                    disabled={selectedProductIds.size === 0}
                  >
                    <Presentation size={18} />
                    Start Presentation with {selectedProductIds.size} Product{selectedProductIds.size !== 1 ? 's' : ''}
                    <ChevronRight size={18} />
                  </button>
                  <button className="clm-skip-products-btn" onClick={() => {
                    setSelectedProductIds(new Set());
                    handleStartPresentation();
                  }}>
                    Skip — Present without products
                  </button>
                </div>
              </div>
            ) : null
          ) : (
            /* ── History tab ──────────────────────────────────── */
            <div className="clm-history-tab">
              {sessions.length === 0 ? (
                <div className="clm-empty"><BarChart3 size={40} /><p>No sessions yet. Start your first presentation!</p></div>
              ) : (
                <div className="clm-session-list">
                  {sessions.map((s) => (
                    <div key={s._id} className="clm-session-card">
                      <div className="clm-session-top">
                        <div className="clm-session-doctor">
                          <User size={16} />
                          <span>Dr. {s.doctor?.firstName} {s.doctor?.lastName}</span>
                        </div>
                        <OutcomeBadge outcome={s.outcome} />
                      </div>
                      <div className="clm-session-meta">
                        <span><Calendar size={13} /> {new Date(s.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span><Clock size={13} /> {s.totalDurationMs ? `${Math.round(s.totalDurationMs / 1000 / 60)} min` : 'In progress'}</span>
                        <span><Presentation size={13} /> {s.slidesViewedCount || 0}/{s.totalSlides || 6} slides</span>
                        {s.productsPresented?.length > 0 && (
                          <span><Package size={13} /> {s.productsPresented.length} product{s.productsPresented.length !== 1 ? 's' : ''}</span>
                        )}
                        {s.qrScanned && <span className="clm-qr-badge"><MessageCircle size={13} /> QR Scanned</span>}
                      </div>
                      {s.productsPresented?.length > 0 && (
                        <div className="clm-session-products">
                          {s.productsPresented.map((pp, idx) => (
                            <span key={idx} className={`clm-product-tag ${pp.interestShown ? 'interested' : ''}`}>
                              {pp.interestShown && <CheckCircle2 size={12} />}
                              {pp.productName || 'Product'}
                            </span>
                          ))}
                        </div>
                      )}
                      {s.interestLevel && (
                        <div className="clm-session-stars">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={14} fill={n <= s.interestLevel ? '#D4A017' : 'transparent'} color={n <= s.interestLevel ? '#D4A017' : '#ccc'} />
                          ))}
                        </div>
                      )}
                      {s.bdmNotes && <p className="clm-session-notes">{s.bdmNotes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── End session modal ────────────────────────────────── */}
          {showEndModal && (
            <div className="clm-modal-overlay" onClick={() => setShowEndModal(false)}>
              <div className="clm-modal" onClick={(e) => e.stopPropagation()}>
                <h2>Session Complete</h2>
                <p className="clm-modal-subtitle">
                  Record your observations for{' '}
                  {selectedDoctor ? `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}` : 'this client'}
                </p>

                {/* Product interest section */}
                {Object.keys(productInterest).length > 0 && (
                  <div className="clm-form-group">
                    <label>Product Interest</label>
                    <p className="clm-form-hint">Tap products the doctor showed interest in</p>
                    <div className="clm-interest-grid">
                      {Object.entries(productInterest).map(([productId, interested]) => {
                        const prod = products.find((p) => p._id === productId);
                        return (
                          <button
                            key={productId}
                            className={`clm-interest-btn ${interested ? 'active' : ''}`}
                            onClick={() => setProductInterest((prev) => ({ ...prev, [productId]: !prev[productId] }))}
                          >
                            {interested ? <CheckCircle2 size={16} /> : <Package size={16} />}
                            {prod?.name || 'Product'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="clm-form-group">
                  <label>Interest Level</label>
                  <div className="clm-star-input">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} className="clm-star-btn" onClick={() => setEndForm((f) => ({ ...f, interestLevel: n }))}>
                        <Star size={28} fill={n <= endForm.interestLevel ? '#D4A017' : 'transparent'} color={n <= endForm.interestLevel ? '#D4A017' : '#ccc'} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="clm-form-group">
                  <label>Outcome</label>
                  <select value={endForm.outcome} onChange={(e) => setEndForm((f) => ({ ...f, outcome: e.target.value }))}>
                    <option value="interested">Interested</option>
                    <option value="maybe">Maybe / Needs Follow-up</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="already_partner">Already a Partner</option>
                    <option value="reschedule">Reschedule</option>
                  </select>
                </div>
                <div className="clm-form-group">
                  <label>Notes</label>
                  <textarea rows={3} placeholder="Key observations, objections, questions asked..." value={endForm.bdmNotes} onChange={(e) => setEndForm((f) => ({ ...f, bdmNotes: e.target.value }))} />
                </div>
                <div className="clm-form-group">
                  <label>Follow-up Date</label>
                  <input type="date" value={endForm.followUpDate} onChange={(e) => setEndForm((f) => ({ ...f, followUpDate: e.target.value }))} />
                </div>
                <div className="clm-modal-actions">
                  <button className="clm-modal-cancel" onClick={() => setShowEndModal(false)}>Skip</button>
                  <button className="clm-modal-submit" onClick={handleSubmitEnd}>Save Session</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// ── Page styles ─────────────────────────────────────────────────
const pageStyles = `
  .clm-layout { display: flex; flex-direction: column; min-height: 100vh; }
  .clm-content { display: flex; flex: 1; }
  .clm-main { flex: 1; padding: 24px; overflow-y: auto; background: #f9fafb; }
  .clm-page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .clm-page-header h1 { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 600; color: #1f2937; margin: 0 0 4px 0; }
  .clm-page-subtitle { font-size: 14px; color: #6b7280; margin: 0; }
  .clm-step-label { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: #374151; margin-bottom: 16px; }
  .clm-step-num { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: #1f2937; color: #D4A017; font-size: 13px; font-weight: 700; flex-shrink: 0; }
  .clm-tabs { display: flex; gap: 4px; margin-bottom: 20px; background: #f3f4f6; border-radius: 10px; padding: 4px; }
  .clm-tab { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 8px; background: transparent; color: #6b7280; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
  .clm-tab.active { background: white; color: #1f2937; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .clm-search-bar { display: flex; align-items: center; gap: 10px; padding: 12px 16px; background: white; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 16px; }
  .clm-search-bar input { flex: 1; border: none; outline: none; font-size: 14px; color: #1f2937; background: transparent; }
  .clm-search-bar svg { color: #9ca3af; }
  .clm-doctor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .clm-doctor-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; transition: all 0.2s; }
  .clm-doctor-card:hover { border-color: #D4A017; box-shadow: 0 2px 8px rgba(212,160,23,0.15); }
  .clm-doctor-info { display: flex; gap: 12px; margin-bottom: 12px; }
  .clm-doctor-avatar { width: 44px; height: 44px; border-radius: 10px; background: #FFF8E1; color: #D4A017; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .clm-doctor-info h3 { font-size: 15px; font-weight: 600; color: #1f2937; margin: 0 0 2px 0; }
  .clm-doctor-spec { font-size: 13px; color: #6b7280; margin: 0; }
  .clm-doctor-addr { font-size: 12px; color: #9ca3af; margin: 2px 0 0 0; }
  .clm-last-session { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9ca3af; margin-bottom: 12px; flex-wrap: wrap; }
  .clm-present-btn { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 16px; background: #1f2937; color: #D4A017; border: none; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
  .clm-present-btn:hover { background: #111827; }
  .clm-present-btn svg:last-child { margin-left: auto; }
  /* Product selection step */
  .clm-products-step { max-width: 1000px; }
  .clm-step-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
  .clm-step-header h2 { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 600; color: #1f2937; margin: 0 0 4px 0; }
  .clm-step-subtitle { font-size: 14px; color: #6b7280; margin: 0; }
  .clm-back-btn { display: flex; align-items: center; gap: 4px; padding: 8px 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; color: #374151; font-size: 13px; cursor: pointer; flex-shrink: 0; }
  .clm-back-btn:hover { background: #f9fafb; }
  .clm-product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .clm-product-card { background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 14px; cursor: pointer; transition: all 0.2s; position: relative; }
  .clm-product-card:hover { border-color: #D4A017; }
  .clm-product-card.selected { border-color: #D4A017; background: #FFFDF5; box-shadow: 0 0 0 3px rgba(212,160,23,0.15); }
  .clm-product-check { position: absolute; top: 10px; right: 10px; }
  .clm-check-on { width: 24px; height: 24px; border-radius: 6px; background: #D4A017; color: white; display: flex; align-items: center; justify-content: center; }
  .clm-check-off { width: 24px; height: 24px; border-radius: 6px; border: 2px solid #d1d5db; }
  .clm-product-img { width: 100%; height: 120px; object-fit: contain; border-radius: 8px; margin-bottom: 10px; background: #f9fafb; }
  .clm-product-placeholder { width: 100%; height: 120px; display: flex; align-items: center; justify-content: center; background: #f9fafb; border-radius: 8px; margin-bottom: 10px; color: #d1d5db; }
  .clm-product-details h4 { font-size: 14px; font-weight: 600; color: #1f2937; margin: 0 0 2px 0; }
  .clm-product-generic { font-size: 12px; color: #6b7280; margin: 0; }
  .clm-product-dosage { font-size: 12px; color: #9ca3af; margin: 0; }
  .clm-product-cat { display: inline-block; font-size: 11px; padding: 2px 8px; background: #f3f4f6; border-radius: 4px; color: #6b7280; margin-top: 6px; }
  .clm-product-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .clm-start-btn { display: flex; align-items: center; gap: 8px; padding: 14px 28px; background: #1f2937; color: #D4A017; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .clm-start-btn:hover:not(:disabled) { background: #111827; }
  .clm-start-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .clm-skip-products-btn { padding: 14px 20px; border: 1px solid #e5e7eb; border-radius: 10px; background: white; color: #6b7280; font-size: 14px; cursor: pointer; }
  .clm-skip-products-btn:hover { background: #f9fafb; }
  /* Outcome badge */
  .outcome-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; padding: 2px 8px; border: 1px solid; border-radius: 6px; background: transparent; }
  /* Session list */
  .clm-session-list { display: flex; flex-direction: column; gap: 10px; }
  .clm-session-card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
  .clm-session-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .clm-session-doctor { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; color: #1f2937; }
  .clm-session-meta { display: flex; gap: 16px; font-size: 13px; color: #6b7280; margin-bottom: 8px; flex-wrap: wrap; }
  .clm-session-meta span { display: flex; align-items: center; gap: 4px; }
  .clm-qr-badge { color: #D4A017 !important; font-weight: 500; }
  .clm-session-products { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .clm-product-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 3px 10px; border-radius: 6px; background: #f3f4f6; color: #6b7280; }
  .clm-product-tag.interested { background: #ECFDF5; color: #059669; }
  .clm-session-stars { display: flex; gap: 2px; margin-bottom: 6px; }
  .clm-session-notes { font-size: 13px; color: #6b7280; margin: 0; padding: 8px 12px; background: #f9fafb; border-radius: 8px; line-height: 1.5; }
  .clm-empty { text-align: center; padding: 60px 20px; color: #9ca3af; }
  .clm-empty p { margin-top: 12px; font-size: 15px; }
  /* Modal */
  .clm-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
  .clm-modal { background: white; border-radius: 16px; padding: 28px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
  .clm-modal h2 { font-size: 20px; font-weight: 600; color: #1f2937; margin: 0 0 4px 0; }
  .clm-modal-subtitle { font-size: 14px; color: #6b7280; margin: 0 0 20px 0; }
  .clm-form-group { margin-bottom: 16px; }
  .clm-form-group label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
  .clm-form-hint { font-size: 12px; color: #9ca3af; margin: 0 0 8px 0; }
  .clm-interest-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .clm-interest-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; color: #6b7280; font-size: 13px; cursor: pointer; transition: all 0.2s; }
  .clm-interest-btn.active { border-color: #059669; background: #ECFDF5; color: #059669; }
  .clm-star-input { display: flex; gap: 4px; }
  .clm-star-btn { background: none; border: none; cursor: pointer; padding: 4px; }
  .clm-form-group select, .clm-form-group textarea, .clm-form-group input[type="date"] { width: 100%; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; color: #1f2937; background: white; outline: none; }
  .clm-form-group select:focus, .clm-form-group textarea:focus, .clm-form-group input:focus { border-color: #D4A017; box-shadow: 0 0 0 3px rgba(212,160,23,0.1); }
  .clm-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }
  .clm-modal-cancel { padding: 10px 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: white; color: #6b7280; font-size: 14px; cursor: pointer; }
  .clm-modal-submit { padding: 10px 20px; border: none; border-radius: 8px; background: #1f2937; color: #D4A017; font-size: 14px; font-weight: 500; cursor: pointer; }
  .clm-modal-submit:hover { background: #111827; }
`;

export default PartnershipCLM;
