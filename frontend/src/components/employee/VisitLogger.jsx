/**
 * VisitLogger Component
 *
 * Form for logging doctor visits with:
 * - Photo capture with GPS location
 * - Visit type and purpose
 * - Doctor feedback and notes
 * - Work day validation
 * - FormData submission to backend
 */

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CameraCapture from './CameraCapture';
import ProductDetailModal from './ProductDetailModal';
import EngagementTypeSelector from './EngagementTypeSelector';
import visitService from '../../services/visitService';
import productService from '../../services/productService';
// Phase N — offline persistence (auto-save draft + offline envelope submit)
import { offlineStore } from '../../utils/offlineStore';
import { offlineManager } from '../../utils/offlineManager';

// Phase N — generate a stable client-side UUID for both the visit_drafts
// keyPath and the linked CLMSession.idempotencyKey. The same UUID lands
// on Visit.session_group_id at submit time so the server can pair the
// two halves of a merged in-person encounter.
const generateUuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

import SelectField from '../common/Select';

const visitLoggerStyles = `
  .visit-logger {
    max-width: 600px;
    margin: 0 auto;
    padding: 20px;
  }

  .doctor-info-header {
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: white;
    padding: 20px;
    border-radius: 12px;
    margin-bottom: 24px;
    text-align: center;
  }

  .doctor-info-header h2 {
    margin: 0 0 8px 0;
    font-size: 24px;
  }

  .doctor-details {
    margin: 0 0 12px 0;
    opacity: 0.9;
  }

  .visit-frequency-badge {
    display: inline-block;
    background: rgba(255, 255, 255, 0.2);
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 14px;
  }

  .form-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }

  .form-section h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: #1f2937;
    border-bottom: 2px solid #e5e7eb;
    padding-bottom: 8px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #374151;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .vl-product-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .vl-product-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .vl-product-card:hover {
    background: #eff6ff;
    border-color: #bfdbfe;
  }

  .vl-product-card.selected {
    background: #eff6ff;
    border-color: #2563eb;
  }

  .vl-product-thumb {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    background: #e5e7eb;
    flex-shrink: 0;
  }

  .vl-product-thumb-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    background: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: #9ca3af;
    flex-shrink: 0;
  }

  .vl-product-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vl-product-name {
    font-size: 14px;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vl-product-sub {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vl-product-card input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .vl-view-hint {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 6px;
    text-align: center;
  }

  .form-actions {
    text-align: center;
    padding: 20px 0;
  }

  .btn {
    padding: 12px 24px;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .btn-large {
    padding: 16px 48px;
    font-size: 18px;
    font-weight: 600;
  }

  .submit-hint {
    color: #6b7280;
    font-size: 14px;
    margin-top: 12px;
  }

  @media (max-width: 480px) {
    .visit-logger {
      padding: 12px;
    }
    .doctor-info-header h2 {
      font-size: 20px;
    }
    .form-group input,
    .form-group select,
    .form-group textarea {
      min-height: 44px;
      font-size: 16px;
    }
    .btn {
      min-height: 44px;
    }
    .btn-large {
      width: 100%;
      padding: 14px 24px;
      font-size: 16px;
    }
  }
`;

const VisitLogger = ({ doctor, onSuccess }) => {
  const navigate = useNavigate();
  // Detect a return-from-CLM with an unfinalized session — set by
  // PartnershipCLM when the BDM ends the presenter via Skip (or the
  // overlay) instead of Save Session. Triggers a yellow banner that
  // disables Submit until the BDM resumes and records the session.
  const [searchParams] = useSearchParams();
  const clmPending = searchParams.get('clm_pending') === '1';
  const incomingSessionGroupId = searchParams.get('session_group_id');
  const [photos, setPhotos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailIndex, setDetailIndex] = useState(0);
  const submittingRef = useRef(false);
  const [formData, setFormData] = useState({
    visitType: 'regular',
    purpose: '',
    productsDiscussed: [],
    engagementTypes: [],
    doctorFeedback: '',
    notes: '',
    nextVisitDate: '',
  });

  // Phase N — Stable draft ID for this encounter. Pinned by useRef so it
  // doesn't change on re-render; the same UUID is used for:
  //   - offlineStore.visit_drafts keyPath (draft persistence)
  //   - CameraCapture's draftId prop (Blob persistence)
  //   - Visit.session_group_id at submit time (server-side CLM linkage)
  //   - CLMSession.idempotencyKey when "Start Presentation" is invoked
  // When returning from CLM with ?session_group_id=, prefer that UUID so the
  // visit submit links to the existing CLMSession (Resume CLM flow).
  const draftIdRef = useRef(incomingSessionGroupId || generateUuid());

  // Phase N — Online/offline awareness. The submit branch reads this; the
  // banner text adapts; auto-save only fires when there's something worth
  // saving (photos OR a non-empty form field).
  const [isOnline, setIsOnline] = useState(offlineManager.isOnline);
  useEffect(() => {
    const unsub = offlineManager.onStatusChange(setIsOnline);
    return () => { try { unsub(); } catch { /* ignore */ } };
  }, []);

  // Phase N — Restore draft if VisitLogger remounts after a tab close.
  // Match by doctor._id so re-opening a different VIP Client starts fresh.
  // When NO draft exists, seed productsDiscussed from the VIP Client's tagged
  // Target Products. We co-locate the seed inside this effect instead of a
  // separate one to avoid racing with the async restore (which would otherwise
  // override the seed by replacing formData with the persisted draft fields).
  useEffect(() => {
    if (!doctor?._id) return;
    let cancelled = false;
    (async () => {
      try {
        const drafts = await offlineStore.getVisitDrafts();
        const match = drafts.find((d) => d.doctorId === doctor._id);
        if (cancelled) return;
        // Seed productsDiscussed from the VIP Client's tagged Target Products
        // when the picker is empty — applies whether or not a stale draft
        // exists, because the auto-save creates a content-bearing draft
        // (visitType='regular') on first mount that would otherwise lock the
        // picker empty across reloads.
        const targets = (doctor.targetProducts || [])
          .map((t) => t.product?._id || t.product)
          .filter(Boolean);
        if (match) {
          draftIdRef.current = match.id;
          if (match.formFields) {
            setFormData((prev) => {
              const next = { ...prev, ...match.formFields };
              if (next.productsDiscussed?.length === 0 && targets.length > 0) {
                next.productsDiscussed = targets;
              }
              return next;
            });
          }
          // Photo restoration — re-hydrate object URLs for each persisted ref.
          if (Array.isArray(match.photoRefs) && match.photoRefs.length > 0) {
            const restored = [];
            for (const ref of match.photoRefs) {
              const url = await offlineStore.getVisitPhotoUrl(ref);
              if (url) restored.push({ data: url, photoRef: ref, source: 'restored' });
            }
            if (!cancelled && restored.length > 0) {
              setPhotos(restored);
              toast.success(`Restored ${restored.length} photo(s) from a saved draft.`, { duration: 4000 });
            }
          }
        } else if (targets.length > 0) {
          setFormData((prev) => (
            prev.productsDiscussed.length === 0
              ? { ...prev, productsDiscussed: targets }
              : prev
          ));
        }
      } catch (err) {
        console.warn('[VisitLogger] Phase N draft restore failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [doctor?._id, doctor?.targetProducts]);

  // Phase N — Auto-save the draft on photos / formData change. Debounced
  // by useEffect's natural batching; a real user types or captures slowly
  // enough that this is fine without a setTimeout. Skip when there's
  // nothing meaningful to save (avoid creating empty drafts on first mount).
  useEffect(() => {
    if (!doctor?._id) return;
    const photoRefs = photos.map((p) => p.photoRef).filter(Boolean);
    const hasContent = photoRefs.length > 0 ||
      Object.values(formData).some((v) =>
        Array.isArray(v) ? v.length > 0 : (typeof v === 'string' ? v.trim().length > 0 : false)
      );
    if (!hasContent) return;
    offlineStore.saveVisitDraft({
      id: draftIdRef.current,
      doctorId: doctor._id,
      photoRefs,
      formFields: { ...formData },
      createdAt: new Date().toISOString(),
    }).catch((err) => console.warn('[VisitLogger] Phase N auto-save failed:', err));
  }, [photos, formData, doctor?._id]);

  // Fetch products by doctor's specialization (fallback to all)
  useEffect(() => {
    const fetchProducts = async () => {
      if (!doctor?._id) return;
      try {
        let list = [];
        if (doctor?.specialization) {
          const r = await productService.getBySpecialization(doctor.specialization);
          list = r.data || [];
          // Free-form specializations (Doctor.js:42) often don't exact-match any
          // product's targetSpecializations array — fall back to the full active
          // catalog so the picker isn't silently empty.
          if (list.length === 0) {
            const all = await productService.getAll({ limit: 0 });
            list = all.data || [];
          }
        } else {
          const r = await productService.getAll({ limit: 0 });
          list = r.data || [];
        }
        setProducts(list);
      } catch (err) {
        console.error('Failed to fetch products:', err);
      }
    };
    fetchProducts();
  }, [doctor?._id, doctor?.specialization]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProductToggle = (productId) => {
    setFormData((prev) => ({
      ...prev,
      productsDiscussed: prev.productsDiscussed.includes(productId)
        ? prev.productsDiscussed.filter((id) => id !== productId)
        : [...prev.productsDiscussed, productId],
    }));
  };

  const handlePhotosChange = (capturedPhotos) => {
    setPhotos(capturedPhotos);
  };

  // Convert a base64 data URL to File object with strict validation
  const dataUrlToFile = (dataUrl, filename) => {
    if (typeof dataUrl !== 'string') {
      throw new Error('Photo data is missing or invalid');
    }

    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) {
      throw new Error('Photo data must be a base64 data URL');
    }

    const [, mimeType, base64Body] = match;
    if (!base64Body) {
      throw new Error('Photo data is empty');
    }

    let binaryString;
    try {
      binaryString = atob(base64Body);
    } catch {
      throw new Error('Photo base64 payload is corrupted');
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return new File([bytes], filename, { type: mimeType || 'image/jpeg' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading || submittingRef.current) {
      return;
    }

    // Phase N+ — Block submission when a CLM session is pending finalization.
    // The disabled Submit button covers the happy path; this guard handles
    // programmatic / form-submit-via-Enter-key races.
    if (clmPending) {
      toast.error('Resume the CLM session above and Save it before submitting this visit.');
      return;
    }

    // Validate photos
    if (photos.length === 0) {
      toast.error('Please upload at least 1 photo as proof of visit. Use the camera or gallery button above.');
      return;
    }

    // Validate engagement types
    if (!formData.engagementTypes || formData.engagementTypes.length === 0) {
      toast.error('Please select at least 1 engagement type (e.g. TXT/PROMATS, Voice Call).');
      return;
    }

    // Get GPS location if available - prefer first photo with GPS, not required
    const visitLocation = photos.find(p => p.location)?.location;

    submittingRef.current = true;
    setLoading(true);

    try {
      // Phase N — Branch on online/offline. Both paths include
      // session_group_id so the server can resolve a linked CLMSession by
      // idempotencyKey if the BDM ran "Start Presentation" earlier in
      // this encounter.
      const sessionGroupId = draftIdRef.current;
      const photoRefs = photos.map((p) => p.photoRef).filter(Boolean);

      // Phase N — Offline submit envelope. Photos already live in IndexedDB
      // as Blobs (CameraCapture persisted them via draftId prop); the SW
      // intercepts the JSON envelope POST, queues it, and rebuilds FormData
      // on replay.
      if (!isOnline) {
        if (photoRefs.length !== photos.length) {
          // Mixed state: some photos didn't persist as blobs (rare — failure
          // path of CameraCapture). Surface clearly instead of submitting
          // a partial offline envelope.
          toast.error('Some photos failed to save offline. Please re-capture and try again.');
          return;
        }
        const offlineFields = {
          doctor: doctor._id,
          visitType: formData.visitType,
          purpose: formData.purpose || '',
          doctorFeedback: formData.doctorFeedback || '',
          notes: formData.notes || '',
          session_group_id: sessionGroupId,
          location: visitLocation ? {
            latitude: visitLocation.latitude,
            longitude: visitLocation.longitude,
            accuracy: visitLocation.accuracy,
            capturedAt: photos[0].capturedAt,
          } : null,
          photoMetadata: photos.map((p, i) => ({
            index: i,
            capturedAt: p.capturedAt,
            source: p.source || 'camera',
            hasGps: !!p.location,
          })),
          productsDiscussed: formData.productsDiscussed.length > 0
            ? formData.productsDiscussed.map((id) => ({ product: id, presented: true }))
            : [],
          engagementTypes: formData.engagementTypes,
          nextVisitDate: formData.nextVisitDate || null,
        };
        await visitService.createOffline({ photoRefs, formFields: offlineFields });
        toast.success('Visit saved offline. It will sync when connectivity returns.', { duration: 5000 });
        // Keep the draft until a successful sync — the SW post-message
        // VIP_SYNC_COMPLETE notifies; the simplest contract is "leave draft
        // intact, BDM can revisit if sync fails terminally". Auto-eviction
        // in 7 days handles abandoned drafts.
        onSuccess?.();
        return;
      }

      // Online path — original FormData multipart POST.
      const submitData = new FormData();
      submitData.append('doctor', doctor._id);
      submitData.append('visitType', formData.visitType);
      submitData.append('purpose', formData.purpose);
      submitData.append('doctorFeedback', formData.doctorFeedback);
      submitData.append('notes', formData.notes);
      // Phase N — propagate session_group_id so the server can resolve a
      // linked CLMSession (started earlier via "Start Presentation").
      submitData.append('session_group_id', sessionGroupId);

      // Add location as JSON string (optional — attached when available)
      if (visitLocation) {
        submitData.append('location', JSON.stringify({
          latitude: visitLocation.latitude,
          longitude: visitLocation.longitude,
          accuracy: visitLocation.accuracy,
          capturedAt: photos[0].capturedAt,
        }));
      }

      // Add photo metadata (capturedAt, source per photo)
      const photoMeta = photos.map((p, i) => ({
        index: i,
        capturedAt: p.capturedAt,
        source: p.source || 'camera',
        hasGps: !!p.location,
      }));
      submitData.append('photoMetadata', JSON.stringify(photoMeta));

      // Add products discussed
      if (formData.productsDiscussed.length > 0) {
        const productsData = formData.productsDiscussed.map((productId) => ({
          product: productId,
          presented: true,
        }));
        submitData.append('productsDiscussed', JSON.stringify(productsData));
      }

      // Add engagement types
      if (formData.engagementTypes.length > 0) {
        submitData.append('engagementTypes', JSON.stringify(formData.engagementTypes));
      }

      // Add next visit date if set
      if (formData.nextVisitDate) {
        submitData.append('nextVisitDate', formData.nextVisitDate);
      }

      // Convert and append photos
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        let file;

        try {
          if (photo.file instanceof File) {
            file = photo.file;
          } else if (photo.blob instanceof Blob) {
            file = new File([photo.blob], `visit-photo-${index + 1}.jpg`, {
              type: photo.blob.type || 'image/jpeg',
            });
          } else {
            file = dataUrlToFile(photo.data, `visit-photo-${index + 1}.jpg`);
          }
        } catch {
          toast.error(`Photo ${index + 1} is invalid. Please remove and recapture/upload it.`);
          return;
        }

        submitData.append('photos', file);
      }

      await visitService.create(submitData);
      toast.success('Visit logged successfully!');
      // Phase N — Drop the persisted draft + photos on successful sync.
      try { await offlineStore.deleteVisitDraft(draftIdRef.current); } catch { /* ignore */ }
      onSuccess?.();
    } catch (err) {
      console.error('Failed to log visit:', err);
      console.error('Error response:', err.response?.data);
      // Show detailed validation errors if available
      if (err.response?.data?.errors?.length > 0) {
        const errorMessages = err.response.data.errors.map(e => `${e.field}: ${e.message}`).join(', ');
        toast.error(`Validation failed: ${errorMessages}`);
      } else {
        const msg = err.response?.data?.message || 'Failed to log visit';
        if (msg.includes('weekly') || msg.includes('limit')) {
          toast.error(`${msg} — You can only visit this VIP Client once per week.`, { duration: 6000 });
        } else if (err.response?.status === 413) {
          toast.error('Photos are too large. Try reducing photo quality or uploading fewer photos.', { duration: 6000 });
        } else {
          toast.error(msg, { duration: 5000 });
        }
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="visit-logger">
      <style>{visitLoggerStyles}</style>
      {/* Doctor Info Header */}
      <div className="doctor-info-header">
        <h2>{doctor?.firstName} {doctor?.lastName}</h2>
        <p className="doctor-details">
          {[doctor?.specialization, doctor?.clinicOfficeAddress].filter(Boolean).join(' — ')}
        </p>
        <span className="visit-frequency-badge">
          {doctor?.visitFrequency}x per month
        </span>
        {/* Phase N — Offline indicator. Banner copy inside reassures the BDM
            that work is being saved and will sync when connectivity returns. */}
        {!isOnline && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.18)',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            <strong>Offline.</strong> Photos and form fields are auto-saved.
            Submit will queue until you&apos;re back online.
          </div>
        )}
      </div>

      {/* Phase N — "Run Partnership Presentation" — bridges the Visit and CLM
          into a single encounter. The same UUID (draftIdRef) lands on both
          CLMSession.idempotencyKey and Visit.session_group_id so admin
          analytics can travel either direction. Always rendered when a doctor
          is loaded — BDM can pick products inside the CLM picker, or skip
          products entirely (CLM has its own "Skip — Present without products"
          path). When the BDM returns with clm_pending=1, this panel is
          replaced by the warning banner that gates Submit. */}
      {doctor?._id && !clmPending && (
        <div className="form-section" style={{ background: '#fef3c7', borderColor: '#fcd34d' }}>
          <h3 style={{ borderColor: '#fcd34d' }}>Run Partnership Presentation</h3>
          <p style={{ color: '#78350f', fontSize: 13, marginTop: 0 }}>
            Take this VIP Client through the partnership deck before logging
            the visit. Slide events and product interest are captured to the
            same encounter (linked by ID). Optional — if you don&apos;t have
            an opportunity to present, skip this and go straight to the photo
            proof below.
          </p>
          <button
            type="button"
            onClick={() => {
              navigate(
                `/bdm/partnership?doctorId=${doctor._id}` +
                `&session_group_id=${draftIdRef.current}` +
                `&products=${formData.productsDiscussed.join(',')}`,
              );
            }}
            style={{
              padding: '10px 18px',
              background: '#d97706',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            &#9654; Start Presentation
            {formData.productsDiscussed.length > 0
              ? ` with ${formData.productsDiscussed.length} Product${formData.productsDiscussed.length === 1 ? '' : 's'}`
              : ''}
          </button>
        </div>
      )}
      {/* When the BDM presented but did NOT save the Session Complete form,
          PartnershipCLM appends ?clm_pending=1 on the way back. Block Submit
          and offer a one-click Resume so the BDM can record the session. */}
      {doctor?._id && clmPending && (
        <div className="form-section" style={{ background: '#fef3c7', borderColor: '#dc2626' }}>
          <h3 style={{ borderColor: '#fca5a5', color: '#991b1b' }}>
            CLM session not finalized
          </h3>
          <p style={{ color: '#78350f', fontSize: 13, marginTop: 0 }}>
            You started a partnership presentation for this VIP Client but
            didn&apos;t record the session details (interest level, outcome, notes).
            Visit Submit is blocked until you resume the CLM session and Save
            it — or you can record the session as &quot;Not Interested&quot; if
            no follow-up is warranted.
          </p>
          <button
            type="button"
            onClick={() => {
              navigate(
                `/bdm/partnership?doctorId=${doctor._id}` +
                `&session_group_id=${draftIdRef.current}` +
                `&products=${formData.productsDiscussed.join(',')}`,
              );
            }}
            style={{
              padding: '10px 18px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Resume CLM session
          </button>
        </div>
      )}
      {/* Photo Capture Section */}
      <div className="form-section">
        <h3>Photo Proof *</h3>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>
          Use camera, upload from gallery, or paste from clipboard
        </p>
        <CameraCapture
          onCapture={handlePhotosChange}
          maxPhotos={5}
          draftId={draftIdRef.current}
        />
      </div>
      {/* Visit Details */}
      <div className="form-section">
        <h3>Visit Details</h3>

        <div className="form-group">
          <label htmlFor="visitType">Visit Type</label>
          <SelectField
            id="visitType"
            name="visitType"
            value={formData.visitType}
            onChange={handleChange}
          >
            <option value="regular">Regular</option>
            <option value="follow-up">Follow-up</option>
            <option value="emergency">Emergency</option>
          </SelectField>
        </div>

        <div className="form-group">
          <label htmlFor="purpose">Purpose</label>
          <input
            type="text"
            id="purpose"
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            placeholder="Enter visit purpose"
          />
        </div>
      </div>
      {/* Products Discussed */}
      {products.length > 0 && (
        <div className="form-section">
          <h3>Products Discussed</h3>
          <div className="vl-product-cards">
            {products.map((item, idx) => {
              const prod = item.product || item;
              const productId = prod._id || item._id;
              const isSelected = formData.productsDiscussed.includes(productId);
              return (
                <div
                  key={productId}
                  className={`vl-product-card${isSelected ? ' selected' : ''}`}
                  onClick={() => {
                    setDetailIndex(idx);
                    setDetailProduct(prod);
                  }}
                >
                  {prod.image ? (
                    <img className="vl-product-thumb" src={prod.image} alt={prod.name} />
                  ) : (
                    <div className="vl-product-thumb-placeholder">&#128138;</div>
                  )}
                  <div className="vl-product-info">
                    <span className="vl-product-name">{prod.name || 'Unknown'}</span>
                    {(prod.genericName || prod.dosage) && (
                      <span className="vl-product-sub">
                        {[prod.genericName, prod.dosage].filter(Boolean).join(' - ')}
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleProductToggle(productId)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>
          <p className="vl-view-hint">Tap a product to view details</p>
        </div>
      )}
      {/* Product Detail Modal */}
      {detailProduct && (
        <ProductDetailModal
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          products={products.map((item) => item.product || item)}
          currentIndex={detailIndex}
        />
      )}
      {/* Engagement Types */}
      <div className="form-section">
        <h3>Engagement Type</h3>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>
          Select all engagement types used during this visit
        </p>
        <EngagementTypeSelector
          selected={formData.engagementTypes}
          onChange={(types) => setFormData((prev) => ({ ...prev, engagementTypes: types }))}
        />
      </div>
      {/* Feedback & Notes */}
      <div className="form-section">
        <h3>Feedback & Notes</h3>

        <div className="form-group">
          <label htmlFor="doctorFeedback">VIP Client Feedback</label>
          <textarea
            id="doctorFeedback"
            name="doctorFeedback"
            value={formData.doctorFeedback}
            onChange={handleChange}
            placeholder="Enter VIP Client's feedback or response"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="notes">Additional Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Any additional notes about the visit"
            rows={3}
          />
        </div>

        <div className="form-group">
          <label htmlFor="nextVisitDate">Next Visit Date (Optional)</label>
          <input
            type="date"
            id="nextVisitDate"
            name="nextVisitDate"
            value={formData.nextVisitDate}
            onChange={handleChange}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>
      {/* Submit Button */}
      <div className="form-actions">
        <button
          type="submit"
          disabled={loading || photos.length === 0 || clmPending}
          className="btn btn-primary btn-large"
        >
          {loading ? 'Submitting...' : 'Submit Visit'}
        </button>
        {clmPending && (
          <p className="submit-hint">Resume the CLM session above to enable Submit.</p>
        )}
        {!clmPending && photos.length === 0 && (
          <p className="submit-hint">Take at least 1 photo to submit</p>
        )}
      </div>
    </form>
  );
};

export default VisitLogger;
