/**
 * ClmBrandingPage — Admin view
 *
 * Per-entity branding + slide body editor for the Partnership Presentation.
 * Three tabs:
 *   Identity   — logos (PNG/JPEG upload) + 5 identity fields + primary color
 *   Slide Content — 6 slide sections with textareas + emoji icon picker
 *   Preview    — embedded CLMPresenter in previewMode with live edits
 *
 * Any unset field falls back to CLM_DEFAULTS (frontend/src/config/clmDefaults.js)
 * at presenter render time. Changes apply to every BDM in this entity on the
 * next CLMPresenter mount.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import PageGuide from '../../components/common/PageGuide';
import CLMPresenter from '../../components/employee/CLMPresenter';
import { useAuth } from '../../hooks/useAuth';
import clmBrandingService from '../../services/clmBrandingService';
import { CLM_DEFAULTS } from '../../config/clmDefaults';
import toast from 'react-hot-toast';
import { Image as ImageIcon, Upload, Save, RotateCcw, Palette, Layout, Eye, ChevronDown, ChevronRight } from 'lucide-react';

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const EMOJI_PALETTE = ['\u{1F4CD}', '\u{1F4BB}', '\u{1F916}', '\u{1F91D}', '\u{1F4E6}', '\u{1F69A}', '\u{1F4F1}', '✅', '\u{1F6E1}️', '\u{1F4AA}', '\u{1F680}', '\u{1F3AF}'];

const TAB_IDENTITY = 'identity';
const TAB_SLIDES = 'slides';
const TAB_PREVIEW = 'preview';

const ClmBrandingPage = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState(TAB_IDENTITY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Branding is the server-persisted state; draft is the in-flight editor state.
  const [branding, setBranding] = useState(null);
  const [draft, setDraft] = useState({});
  const [pendingLogoCircle, setPendingLogoCircle] = useState(null);
  const [pendingLogoTrademark, setPendingLogoTrademark] = useState(null);
  const [pendingCirclePreview, setPendingCirclePreview] = useState(null);
  const [pendingTrademarkPreview, setPendingTrademarkPreview] = useState(null);

  const entityId = useMemo(
    () => user?.entity_id || (Array.isArray(user?.entity_ids) && user.entity_ids[0]) || null,
    [user]
  );

  const fetchBranding = useCallback(async () => {
    if (!entityId) {
      // No entity on user profile — show empty-state with defaults so admin
      // still sees SOMETHING instead of spinning forever.
      setBranding({});
      setDraft({});
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await clmBrandingService.get(entityId);
      const data = res?.data || {};
      setBranding(data);
      setDraft(cloneBranding(data));
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load branding');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  const setDraftField = useCallback((key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setDraftSlide = useCallback((slideKey, field, value) => {
    setDraft((prev) => {
      const slides = { ...(prev.slides || {}) };
      slides[slideKey] = { ...(slides[slideKey] || {}), [field]: value };
      return { ...prev, slides };
    });
  }, []);

  const setDraftCard = useCallback((slideKey, arrayField, index, field, value) => {
    setDraft((prev) => {
      const slides = { ...(prev.slides || {}) };
      const slide = { ...(slides[slideKey] || {}) };
      const defaultArr = CLM_DEFAULTS.slides[slideKey][arrayField];
      const current = Array.isArray(slide[arrayField]) && slide[arrayField].length > 0
        ? slide[arrayField].map((c) => ({ ...c }))
        : defaultArr.map((c) => ({ ...c }));
      current[index] = { ...current[index], [field]: value };
      slide[arrayField] = current;
      slides[slideKey] = slide;
      return { ...prev, slides };
    });
  }, []);

  const resetSlideField = useCallback((slideKey, field) => {
    setDraft((prev) => {
      const slides = { ...(prev.slides || {}) };
      const slide = { ...(slides[slideKey] || {}) };
      delete slide[field];
      slides[slideKey] = slide;
      return { ...prev, slides };
    });
  }, []);

  const handleLogoSelect = useCallback((kind, file) => {
    if (!file) return;
    if (!ALLOWED_MIMES.includes(file.type)) {
      toast.error('Only PNG, JPEG, or WebP allowed.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Image must be under 15 MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    if (kind === 'logoCircle') {
      if (pendingCirclePreview) URL.revokeObjectURL(pendingCirclePreview);
      setPendingLogoCircle(file);
      setPendingCirclePreview(url);
    } else {
      if (pendingTrademarkPreview) URL.revokeObjectURL(pendingTrademarkPreview);
      setPendingLogoTrademark(file);
      setPendingTrademarkPreview(url);
    }
  }, [pendingCirclePreview, pendingTrademarkPreview]);

  useEffect(() => () => {
    if (pendingCirclePreview) URL.revokeObjectURL(pendingCirclePreview);
    if (pendingTrademarkPreview) URL.revokeObjectURL(pendingTrademarkPreview);
  }, [pendingCirclePreview, pendingTrademarkPreview]);

  const handleSave = useCallback(async () => {
    if (!entityId) return;
    setSaving(true);
    try {
      const payload = {
        primaryColor: draft.primaryColor,
        companyName: draft.companyName,
        websiteUrl: draft.websiteUrl,
        salesEmail: draft.salesEmail,
        phone: draft.phone,
        slides: draft.slides,
      };
      if (pendingLogoCircle) payload.logoCircle = pendingLogoCircle;
      if (pendingLogoTrademark) payload.logoTrademark = pendingLogoTrademark;
      const res = await clmBrandingService.update(entityId, payload);
      setBranding(res?.data || {});
      setDraft(cloneBranding(res?.data || {}));
      setPendingLogoCircle(null);
      setPendingLogoTrademark(null);
      if (pendingCirclePreview) { URL.revokeObjectURL(pendingCirclePreview); setPendingCirclePreview(null); }
      if (pendingTrademarkPreview) { URL.revokeObjectURL(pendingTrademarkPreview); setPendingTrademarkPreview(null); }
      toast.success('Branding saved — applies to every BDM in this entity on next session.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }, [entityId, draft, pendingLogoCircle, pendingLogoTrademark, pendingCirclePreview, pendingTrademarkPreview]);

  const handleCancel = useCallback(() => {
    setDraft(cloneBranding(branding || {}));
    setPendingLogoCircle(null);
    setPendingLogoTrademark(null);
    if (pendingCirclePreview) { URL.revokeObjectURL(pendingCirclePreview); setPendingCirclePreview(null); }
    if (pendingTrademarkPreview) { URL.revokeObjectURL(pendingTrademarkPreview); setPendingTrademarkPreview(null); }
  }, [branding, pendingCirclePreview, pendingTrademarkPreview]);

  // Build the branding object fed into the Preview tab. Pending file uploads
  // use their object URLs; saved branding keeps the S3 URL.
  const previewBranding = useMemo(() => {
    const b = { ...(draft || {}) };
    if (pendingCirclePreview) b.logoCircleUrl = pendingCirclePreview;
    if (pendingTrademarkPreview) b.logoTrademarkUrl = pendingTrademarkPreview;
    return b;
  }, [draft, pendingCirclePreview, pendingTrademarkPreview]);

  if (loading) return <LoadingSpinner />;

  const hasPendingChanges =
    pendingLogoCircle || pendingLogoTrademark ||
    JSON.stringify(draft) !== JSON.stringify(branding || {});

  return (
    <div className="clm-br-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="clm-br-content">
        <Sidebar />
        <main className="clm-br-main">
          <PageGuide pageKey="clm-branding" />

          <div className="clm-br-header">
            <h1><Palette size={22} /> CLM Branding & Slide Content</h1>
            <p className="clm-br-subtitle">
              Per-entity pitch deck identity. Any field left blank falls back to the system default.
            </p>
          </div>

          <div className="clm-br-tabs">
            <button className={`clm-br-tab ${tab === TAB_IDENTITY ? 'active' : ''}`} onClick={() => setTab(TAB_IDENTITY)}>
              <ImageIcon size={15} /> Identity
            </button>
            <button className={`clm-br-tab ${tab === TAB_SLIDES ? 'active' : ''}`} onClick={() => setTab(TAB_SLIDES)}>
              <Layout size={15} /> Slide Content
            </button>
            <button className={`clm-br-tab ${tab === TAB_PREVIEW ? 'active' : ''}`} onClick={() => setTab(TAB_PREVIEW)}>
              <Eye size={15} /> Preview
            </button>
          </div>

          {tab === TAB_IDENTITY && (
            <IdentityTab
              draft={draft}
              branding={branding}
              setDraftField={setDraftField}
              pendingCirclePreview={pendingCirclePreview}
              pendingTrademarkPreview={pendingTrademarkPreview}
              onLogoSelect={handleLogoSelect}
            />
          )}
          {tab === TAB_SLIDES && (
            <SlidesTab
              draft={draft}
              setDraftSlide={setDraftSlide}
              setDraftCard={setDraftCard}
              resetSlideField={resetSlideField}
            />
          )}
          {tab === TAB_PREVIEW && (
            <div className="clm-br-preview-wrap">
              <p className="clm-br-preview-hint">Preview renders as BDMs will see it. Keyboard arrows + dots navigate. Edits stream live from the other tabs.</p>
              <div className="clm-br-preview-stage">
                <CLMPresenter
                  session={{ _id: 'preview' }}
                  doctor={{ firstName: 'Preview', lastName: 'Client' }}
                  products={[]}
                  branding={previewBranding}
                  previewMode={true}
                />
              </div>
            </div>
          )}

          <div className="clm-br-footer">
            <button className="clm-br-btn-outline" onClick={handleCancel} disabled={saving || !hasPendingChanges}>
              <RotateCcw size={14} /> Cancel changes
            </button>
            <button className="clm-br-btn-primary" onClick={handleSave} disabled={saving || !hasPendingChanges}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save branding'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Identity tab — logos + 5 text fields + color
// ──────────────────────────────────────────────────────────────────────

const IdentityTab = ({ draft, branding, setDraftField, pendingCirclePreview, pendingTrademarkPreview, onLogoSelect }) => {
  return (
    <div className="clm-br-card">
      <div className="clm-br-logos">
        <LogoCard
          kind="logoCircle"
          label="Circular Logo"
          helper="Shown on hero + connect slides."
          currentUrl={pendingCirclePreview || branding?.logoCircleUrl || CLM_DEFAULTS.logoCircleUrl}
          isDefault={!pendingCirclePreview && !branding?.logoCircleUrl}
          onSelect={onLogoSelect}
        />
        <LogoCard
          kind="logoTrademark"
          label="Trademark Logo"
          helper="Shown on the presentation top bar."
          currentUrl={pendingTrademarkPreview || branding?.logoTrademarkUrl || CLM_DEFAULTS.logoTrademarkUrl}
          isDefault={!pendingTrademarkPreview && !branding?.logoTrademarkUrl}
          onSelect={onLogoSelect}
        />
      </div>

      <div className="clm-br-grid">
        <TextField label="Company Name" value={draft.companyName} placeholder={CLM_DEFAULTS.companyName} maxLength={120} onChange={(v) => setDraftField('companyName', v)} />
        <TextField label="Website URL" value={draft.websiteUrl} placeholder={CLM_DEFAULTS.websiteUrl} maxLength={200} onChange={(v) => setDraftField('websiteUrl', v)} />
        <TextField label="Sales Email" type="email" value={draft.salesEmail} placeholder={CLM_DEFAULTS.salesEmail} maxLength={120} onChange={(v) => setDraftField('salesEmail', v)} />
        <TextField label="Phone" value={draft.phone} placeholder={CLM_DEFAULTS.phone} maxLength={40} onChange={(v) => setDraftField('phone', v)} />
        <ColorField label="Primary Brand Color" value={draft.primaryColor} placeholder={CLM_DEFAULTS.primaryColor} onChange={(v) => setDraftField('primaryColor', v)} />
      </div>
    </div>
  );
};

const LogoCard = ({ kind, label, helper, currentUrl, isDefault, onSelect }) => {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onSelect(kind, file);
  };

  return (
    <div
      className={`clm-br-logo-card ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="clm-br-logo-label">
        {label}
        {isDefault && <span className="clm-br-badge-default">Using default</span>}
      </div>
      <div className="clm-br-logo-preview">
        <img src={currentUrl} alt={label} onError={(e) => { e.target.style.display = 'none'; }} />
      </div>
      <p className="clm-br-helper">{helper}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIMES.join(',')}
        style={{ display: 'none' }}
        onChange={(e) => onSelect(kind, e.target.files?.[0] || null)}
      />
      <button className="clm-br-btn-outline" onClick={() => inputRef.current?.click()}>
        <Upload size={14} /> Upload PNG / JPEG
      </button>
    </div>
  );
};

const TextField = ({ label, value, placeholder, maxLength, type = 'text', onChange }) => (
  <label className="clm-br-field">
    <span className="clm-br-field-label">{label}</span>
    <input
      type={type}
      value={value || ''}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
    <span className="clm-br-field-meta">{(value || '').length} / {maxLength}</span>
  </label>
);

const ColorField = ({ label, value, placeholder, onChange }) => {
  const hex = value || placeholder;
  return (
    <label className="clm-br-field">
      <span className="clm-br-field-label">{label}</span>
      <div className="clm-br-color-row">
        <input
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          value={value || ''}
          placeholder={placeholder}
          maxLength={7}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Slides tab — accordion per slide
// ──────────────────────────────────────────────────────────────────────

const SLIDE_DEFS = [
  { key: 'hero', label: 'Slide 1 — Hero' },
  { key: 'startup', label: 'Slide 2 — Who We Are' },
  { key: 'solution', label: 'Slide 3 — The Opportunity' },
  { key: 'integrity', label: 'Slide 4 — Professional Integrity' },
  { key: 'products', label: 'Slide 5 — Our Products' },
  { key: 'connect', label: 'Slide 6 — Connect' },
];

const SlidesTab = ({ draft, setDraftSlide, setDraftCard, resetSlideField }) => {
  const [openKey, setOpenKey] = useState('hero');
  return (
    <div className="clm-br-card">
      {SLIDE_DEFS.map((def) => (
        <div key={def.key} className="clm-br-accordion">
          <button
            className="clm-br-accordion-head"
            onClick={() => setOpenKey(openKey === def.key ? null : def.key)}
          >
            {openKey === def.key ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>{def.label}</span>
          </button>
          {openKey === def.key && (
            <div className="clm-br-accordion-body">
              <SlideEditor
                slideKey={def.key}
                draft={draft.slides?.[def.key] || {}}
                setDraftSlide={setDraftSlide}
                setDraftCard={setDraftCard}
                resetSlideField={resetSlideField}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const SlideEditor = ({ slideKey, draft, setDraftSlide, setDraftCard, resetSlideField }) => {
  const defaults = CLM_DEFAULTS.slides[slideKey];
  const TA = (field, max, label) => (
    <TextAreaField
      key={field}
      label={label}
      value={draft[field]}
      placeholder={defaults[field]}
      maxLength={max}
      onChange={(v) => setDraftSlide(slideKey, field, v)}
      onReset={() => resetSlideField(slideKey, field)}
    />
  );

  if (slideKey === 'hero') {
    return (
      <>
        {TA('titleAccent', 60, 'Title accent (gold-highlighted portion, e.g. "Online Pharmacy")')}
        {TA('badge', 60, 'Badge (e.g. "PARTNERSHIP OPPORTUNITY")')}
        {TA('subtitle', 300, 'Subtitle')}
      </>
    );
  }
  if (slideKey === 'startup') {
    return (
      <>
        {TA('title', 80, 'Slide title')}
        {TA('lead', 300, 'Lead paragraph')}
        <div className="clm-br-cards-header">3 pillars (order locked to CSS grid)</div>
        <CardsEditor slideKey="startup" arrayField="pillars" maxCount={3} draft={draft.pillars} defaults={defaults.pillars} setDraftCard={setDraftCard} />
      </>
    );
  }
  if (slideKey === 'solution') {
    return (
      <>
        {TA('title', 100, 'Slide title')}
        {TA('lead', 300, 'Lead paragraph')}
        <div className="clm-br-cards-header">4 opportunity cards</div>
        <CardsEditor slideKey="solution" arrayField="cards" maxCount={4} draft={draft.cards} defaults={defaults.cards} setDraftCard={setDraftCard} />
      </>
    );
  }
  if (slideKey === 'integrity') {
    return (
      <>
        {TA('title', 100, 'Slide title')}
        {TA('lead', 300, 'Lead paragraph')}
        <div className="clm-br-cards-header">4 integrity cards</div>
        <CardsEditor slideKey="integrity" arrayField="cards" maxCount={4} draft={draft.cards} defaults={defaults.cards} setDraftCard={setDraftCard} />
      </>
    );
  }
  if (slideKey === 'products') {
    return <>{TA('footer', 300, 'Footer blurb (product cards are data-driven from CRM)')}</>;
  }
  if (slideKey === 'connect') {
    return (
      <>
        {TA('title', 80, 'Slide title')}
        {TA('subtitle', 300, 'Subtitle')}
        {TA('messengerTitle', 80, 'Messenger integration title')}
        {TA('messengerBody', 200, 'Messenger integration body')}
      </>
    );
  }
  return null;
};

const CardsEditor = ({ slideKey, arrayField, maxCount, draft, defaults, setDraftCard }) => {
  const current = Array.isArray(draft) && draft.length > 0 ? draft : defaults;
  const rows = current.slice(0, maxCount);
  while (rows.length < maxCount) rows.push(defaults[rows.length]);
  return (
    <div className="clm-br-cards">
      {rows.map((card, i) => (
        <div key={i} className="clm-br-card-row">
          <div className="clm-br-card-row-head">#{i + 1}</div>
          <EmojiPicker value={card.icon} onChange={(v) => setDraftCard(slideKey, arrayField, i, 'icon', v)} />
          <input
            className="clm-br-card-title"
            type="text"
            value={card.title || ''}
            placeholder={defaults[i]?.title || ''}
            maxLength={60}
            onChange={(e) => setDraftCard(slideKey, arrayField, i, 'title', e.target.value)}
          />
          <textarea
            className="clm-br-card-body"
            value={card.body || ''}
            placeholder={defaults[i]?.body || ''}
            maxLength={400}
            rows={2}
            onChange={(e) => setDraftCard(slideKey, arrayField, i, 'body', e.target.value)}
          />
        </div>
      ))}
    </div>
  );
};

const EmojiPicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="clm-br-emoji">
      <button type="button" className="clm-br-emoji-btn" onClick={() => setOpen(!open)}>{value || '✨'}</button>
      {open && (
        <div className="clm-br-emoji-grid">
          {EMOJI_PALETTE.map((em) => (
            <button key={em} type="button" onClick={() => { onChange(em); setOpen(false); }}>{em}</button>
          ))}
          <input
            type="text"
            placeholder="Paste"
            maxLength={8}
            onBlur={(e) => { if (e.target.value) { onChange(e.target.value); setOpen(false); } }}
          />
        </div>
      )}
    </div>
  );
};

const TextAreaField = ({ label, value, placeholder, maxLength, onChange, onReset }) => (
  <label className="clm-br-field">
    <span className="clm-br-field-label">
      {label}
      <button type="button" className="clm-br-reset-btn" onClick={onReset} title="Reset to default">
        <RotateCcw size={11} /> reset
      </button>
    </span>
    <textarea
      value={value || ''}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={3}
      onChange={(e) => onChange(e.target.value)}
    />
    <span className="clm-br-field-meta">{(value || '').length} / {maxLength}</span>
  </label>
);

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function cloneBranding(b) {
  // Shallow-safe deep clone of a JSON-shaped branding doc (no Dates, no functions).
  return JSON.parse(JSON.stringify(b || {}));
}

// ──────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────

const pageStyles = `
  .clm-br-layout { display: flex; flex-direction: column; min-height: 100vh; background: #f8fafc; }
  .clm-br-content { display: flex; flex: 1; }
  .clm-br-main { flex: 1; padding: 24px; overflow-y: auto; }
  .clm-br-header { margin-bottom: 16px; }
  .clm-br-header h1 { display: flex; align-items: center; gap: 10px; font-size: 22px; color: #111827; margin: 0 0 4px; }
  .clm-br-subtitle { color: #64748b; font-size: 13px; margin: 0; }
  .clm-br-tabs { display: flex; gap: 6px; border-bottom: 1px solid #e5e7eb; margin-bottom: 18px; }
  .clm-br-tab { background: transparent; border: none; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #64748b; cursor: pointer; display: flex; align-items: center; gap: 6px; border-bottom: 2px solid transparent; }
  .clm-br-tab.active { color: #2563eb; border-bottom-color: #2563eb; }
  .clm-br-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; }
  .clm-br-logos { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .clm-br-logo-card { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 14px; background: #f9fafb; text-align: center; transition: background 0.15s; }
  .clm-br-logo-card.drag-over { background: #eff6ff; border-color: #2563eb; }
  .clm-br-logo-label { font-weight: 600; font-size: 13px; color: #111827; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .clm-br-badge-default { background: #e5e7eb; color: #475569; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .clm-br-logo-preview { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; display: flex; align-items: center; justify-content: center; min-height: 110px; margin-bottom: 8px; }
  .clm-br-logo-preview img { max-width: 100%; max-height: 100px; object-fit: contain; }
  .clm-br-helper { font-size: 11px; color: #64748b; margin: 0 0 10px; }
  .clm-br-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .clm-br-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .clm-br-field-label { font-weight: 600; color: #111827; display: flex; justify-content: space-between; align-items: center; }
  .clm-br-field input, .clm-br-field textarea { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: inherit; width: 100%; }
  .clm-br-field textarea { resize: vertical; }
  .clm-br-field-meta { font-size: 10px; color: #94a3b8; align-self: flex-end; }
  .clm-br-color-row { display: flex; gap: 8px; align-items: center; }
  .clm-br-color-row input[type="color"] { width: 40px; height: 36px; padding: 0; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; }
  .clm-br-color-row input[type="text"] { flex: 1; }
  .clm-br-reset-btn { background: transparent; border: none; color: #64748b; font-size: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; }
  .clm-br-reset-btn:hover { color: #2563eb; }
  .clm-br-btn-primary { background: #2563eb; color: #fff; border: none; padding: 9px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .clm-br-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .clm-br-btn-outline { background: transparent; color: #374151; border: 1px solid #d1d5db; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .clm-br-btn-outline:hover:not(:disabled) { background: #f3f4f6; }
  .clm-br-footer { position: sticky; bottom: 0; background: rgba(248, 250, 252, 0.94); backdrop-filter: blur(6px); padding: 12px 0; margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #e5e7eb; }
  .clm-br-accordion { border-bottom: 1px solid #e5e7eb; }
  .clm-br-accordion:last-child { border-bottom: none; }
  .clm-br-accordion-head { width: 100%; background: transparent; border: none; padding: 12px 0; text-align: left; font-size: 14px; font-weight: 600; color: #111827; cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .clm-br-accordion-body { padding: 8px 0 16px; display: flex; flex-direction: column; gap: 12px; }
  .clm-br-cards-header { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 8px; }
  .clm-br-cards { display: flex; flex-direction: column; gap: 10px; }
  .clm-br-card-row { display: grid; grid-template-columns: 40px 52px 1fr; grid-template-rows: auto auto; gap: 6px 10px; align-items: start; padding: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
  .clm-br-card-row-head { font-weight: 700; color: #2563eb; font-size: 12px; align-self: center; }
  .clm-br-card-title { grid-column: 3 / span 1; }
  .clm-br-card-body { grid-column: 1 / -1; min-height: 42px; }
  .clm-br-emoji { position: relative; }
  .clm-br-emoji-btn { width: 40px; height: 40px; font-size: 22px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer; }
  .clm-br-emoji-grid { position: absolute; z-index: 10; top: 48px; left: 0; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; display: grid; grid-template-columns: repeat(6, 32px); gap: 4px; box-shadow: 0 6px 24px rgba(0,0,0,0.1); }
  .clm-br-emoji-grid button { width: 32px; height: 32px; font-size: 18px; border: none; background: transparent; cursor: pointer; border-radius: 4px; }
  .clm-br-emoji-grid button:hover { background: #f3f4f6; }
  .clm-br-emoji-grid input { grid-column: 1 / -1; margin-top: 6px; font-size: 12px; padding: 4px 6px; border: 1px solid #d1d5db; border-radius: 4px; }
  .clm-br-preview-wrap { position: relative; }
  .clm-br-preview-hint { font-size: 12px; color: #64748b; margin: 0 0 10px; }
  .clm-br-preview-stage { position: relative; height: 640px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background: #111; }
  .clm-br-preview-stage .clm-presenter { position: absolute !important; inset: 0 !important; z-index: 1 !important; }
  @media (max-width: 768px) {
    .clm-br-logos, .clm-br-grid { grid-template-columns: 1fr; }
    .clm-br-tab span { display: none; }
  }
`;

export default ClmBrandingPage;
