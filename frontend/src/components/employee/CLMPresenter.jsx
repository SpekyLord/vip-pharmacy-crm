/**
 * CLMPresenter — Full-screen interactive partnership presentation
 *
 * Props:
 *   session        — CLMSession object (from API after startSession)
 *   doctor         — Doctor object (name, specialization)
 *   products       — Array of CrmProduct objects to show on the products slide
 *   onEnd          — callback(sessionId, slideEvents) when BDM ends session
 *   onQrDisplayed  — callback(sessionId) when QR slide is shown
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  Handshake,
  Globe,
  MessageCircle,
  Pill,
  Package,
  Shield,
} from 'lucide-react';

// CLM assets bundled in public/clm/ for offline availability (no S3 dependency)
const VIP_TRADEMARK = '/clm/vip-trademark.png';
const VIP_LOGO_CIRCLE = '/clm/vip-logo-circle.svg';
const VIPRAZOLE_IMG = '/clm/viprazole.jpg';
const VIPTRIAXONE_IMG = '/clm/viptriaxone.jpg';

const STATIC_SLIDES = [
  { id: 'hero', title: 'VIP Inc.', subtitle: 'Online Pharmacy Partnership', icon: Building2, type: 'hero' },
  { id: 'startup', title: 'Who We Are', subtitle: 'A startup pharma company', icon: Building2, type: 'startup' },
  { id: 'solution', title: 'The Opportunity', subtitle: 'Grow with us', icon: Handshake, type: 'solution' },
  { id: 'integrity', title: 'Professional Integrity', subtitle: 'Your reputation is protected', icon: Shield, type: 'integrity' },
  { id: 'products', title: 'Our Products', subtitle: 'Available through the partnership', icon: Package, type: 'products' },
  { id: 'connect', title: 'Next Steps', subtitle: 'Connect with us', icon: MessageCircle, type: 'connect' },
];

const CLMPresenter = ({ session, doctor, products = [], onEnd, onQrDisplayed }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideEvents, setSlideEvents] = useState([]);
  const slideEnteredAt = useRef(new Date());
  const touchStartX = useRef(null);
  const containerRef = useRef(null);
  const SLIDES = STATIC_SLIDES;
  const totalSlides = SLIDES.length;

  const recordSlideExit = useCallback(() => {
    const now = new Date();
    const duration = now - slideEnteredAt.current;
    setSlideEvents((prev) => [...prev, {
      slideIndex: currentSlide,
      slideTitle: SLIDES[currentSlide]?.title || '',
      enteredAt: slideEnteredAt.current.toISOString(),
      exitedAt: now.toISOString(),
      durationMs: duration,
      interactions: [],
    }]);
  }, [currentSlide, SLIDES]);

  const goToSlide = useCallback((index) => {
    if (index < 0 || index >= totalSlides) return;
    recordSlideExit();
    setCurrentSlide(index);
    slideEnteredAt.current = new Date();
    if (SLIDES[index]?.type === 'connect' && onQrDisplayed && session) {
      onQrDisplayed(session._id);
    }
  }, [recordSlideExit, onQrDisplayed, session, totalSlides, SLIDES]);

  const goNext = useCallback(() => goToSlide(currentSlide + 1), [currentSlide, goToSlide]);
  const goPrev = useCallback(() => goToSlide(currentSlide - 1), [currentSlide, goToSlide]);

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { diff > 0 ? goNext() : goPrev(); }
    touchStartX.current = null;
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape' && onEnd) { recordSlideExit(); onEnd(session?._id, slideEvents); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, onEnd, session, slideEvents, recordSlideExit]);

  const handleEnd = () => { recordSlideExit(); if (onEnd) onEnd(session?._id, slideEvents); };
  const progress = ((currentSlide + 1) / totalSlides) * 100;
  const doctorName = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : 'VIP Client';

  return (
    <div ref={containerRef} className="clm-presenter" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <style>{presenterStyles}</style>
      <div className="clm-topbar">
        <div className="clm-topbar-left">
          <img src={VIP_TRADEMARK} alt="VIP" className="clm-topbar-logo" />
          <span className="clm-slide-counter">{currentSlide + 1} / {totalSlides}</span>
          <span className="clm-doctor-name">{doctorName}</span>
        </div>
        <div className="clm-progress-track">
          <div className="clm-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <button className="clm-close-btn" onClick={handleEnd} title="End Session"><X size={20} /></button>
      </div>
      <div className="clm-slide-area">
        <SlideContent slide={SLIDES[currentSlide]} doctorName={doctorName} products={products} />
      </div>
      <div className="clm-nav">
        <button className="clm-nav-btn" onClick={goPrev} disabled={currentSlide === 0}><ChevronLeft size={28} /></button>
        <div className="clm-dots">
          {SLIDES.map((s, i) => (
            <button key={s.id} className={`clm-dot ${i === currentSlide ? 'active' : ''} ${i < currentSlide ? 'visited' : ''}`} onClick={() => goToSlide(i)} />
          ))}
        </div>
        <button className="clm-nav-btn" onClick={goNext} disabled={currentSlide === totalSlides - 1}><ChevronRight size={28} /></button>
      </div>
    </div>
  );
};

const SlideContent = ({ slide, doctorName, products }) => {
  switch (slide.type) {
    case 'hero':
      return (
        <div className="clm-slide slide-hero">
          <img src={VIP_LOGO_CIRCLE} alt="VIP" className="hero-logo" />
          <div className="hero-badge">PARTNERSHIP OPPORTUNITY</div>
          <h1 className="hero-title">VIP <span className="text-gold">Online Pharmacy</span></h1>
          <p className="hero-subtitle">A startup pharma company capitalizing on local footprint, digitalization, and AI integration</p>
          <div className="hero-url"><Globe size={16} /><span>vippharmacy.online</span></div>
        </div>
      );
    case 'startup':
      return (
        <div className="clm-slide slide-startup">
          <div className="slide-icon-badge"><Building2 size={28} /></div>
          <h2>Who We Are</h2>
          <p className="slide-lead">VIP Inc. is a startup pharmaceutical company built on three pillars:</p>
          <div className="startup-pillars">
            <div className="pillar-card"><div className="pillar-icon">{'\u{1F4CD}'}</div><h3>Local Footprint</h3><p>Operating in areas big chains ignore. We know the communities we serve — your patients, your territory.</p></div>
            <div className="pillar-card"><div className="pillar-icon">{'\u{1F4BB}'}</div><h3>Digitalization</h3><p>Online pharmacy at vippharmacy.online — patients order via Messenger, delivered to their door.</p></div>
            <div className="pillar-card"><div className="pillar-icon">{'\u{1F916}'}</div><h3>AI Integration</h3><p>Smart inventory, demand forecasting, and automated patient engagement powered by AI.</p></div>
          </div>
        </div>
      );
    case 'solution':
      return (
        <div className="clm-slide slide-solution">
          <div className="slide-icon-badge"><Handshake size={28} /></div>
          <h2>Looking for a Partner to Grow With Us</h2>
          <p className="slide-lead">We are not selling to you — we are inviting you to build something together.</p>
          <div className="solution-grid">
            <div className="solution-card"><h3>{'\u{1F91D}'} Partnership, Not Sales</h3><p>You are not a customer. You are a co-builder. Your patients, your territory, our logistics.</p></div>
            <div className="solution-card"><h3>{'\u{1F4E6}'} All Products Available</h3><p>Every pharma product you support for your patients will be available through VIP Pharmacy Online.</p></div>
            <div className="solution-card"><h3>{'\u{1F69A}'} We Handle Logistics</h3><p>Ordering, inventory, delivery, and customer service — all handled by VIP. You focus on patients.</p></div>
            <div className="solution-card"><h3>{'\u{1F4F1}'} Messenger-First</h3><p>Patients connect via Facebook Messenger — no app downloads, no complicated websites.</p></div>
          </div>
        </div>
      );
    case 'integrity':
      return (
        <div className="clm-slide slide-integrity">
          <div className="slide-icon-badge integrity-badge"><Shield size={28} /></div>
          <h2>Your Professional Integrity — Protected</h2>
          <p className="slide-lead">This partnership is designed to never jeopardize your standing as a healthcare professional.</p>
          <div className="integrity-grid">
            <div className="integrity-card"><div className="integrity-icon">{'\u2705'}</div><h3>No Conflict of Interest</h3><p>You are not selling medicines directly. VIP handles all commercial transactions. Your role remains purely clinical.</p></div>
            <div className="integrity-card"><div className="integrity-icon">{'\u2705'}</div><h3>Patient Choice Preserved</h3><p>Patients are free to buy from any pharmacy. VIP is simply an additional, more affordable option.</p></div>
            <div className="integrity-card"><div className="integrity-icon">{'\u2705'}</div><h3>Transparent Operations</h3><p>All transactions are documented. Full audit trail. No hidden arrangements.</p></div>
            <div className="integrity-card"><div className="integrity-icon">{'\u2705'}</div><h3>FDA-Compliant</h3><p>VIP Inc. operates with proper FDA licenses. All products are sourced from licensed distributors.</p></div>
          </div>
        </div>
      );
    case 'products':
      return (
        <div className="clm-slide slide-products">
          <div className="slide-icon-badge"><Package size={28} /></div>
          <h2>Our Products</h2>
          <p className="slide-lead">{products.length > 0 ? `${products.length} product${products.length !== 1 ? 's' : ''} selected for this presentation` : "VIP's own branded products — plus all pharma products you support"}</p>
          <div className="products-grid">
            {products.length > 0 ? (
              products.map((p) => (
                <div key={p._id} className="product-card">
                  {p.image ? (<img src={p.image} alt={p.name} className="product-img" onError={(e) => { e.target.style.display = 'none'; }} />) : (<div className="product-img-placeholder"><Pill size={32} /></div>)}
                  <div className="product-info">
                    <h3>{p.name}</h3>
                    {p.genericName && <p className="product-generic">{p.genericName}</p>}
                    {p.dosage && <p className="product-dosage">{p.dosage}</p>}
                    {p.description && <p className="product-desc">{p.description}</p>}
                    {p.category && <span className="product-cat">{p.category}</span>}
                  </div>
                </div>
              ))
            ) : (
              <>
                <div className="product-card">
                  <img src={VIPRAZOLE_IMG} alt="VIPRAZOLE" className="product-img" />
                  <div className="product-info"><h3>VIPRAZOLE</h3><p className="product-generic">Omeprazole</p><p className="product-dosage">40mg Lyophilized Powder for Injection (IV Infusion)</p><span className="product-cat">Proton Pump Inhibitor</span></div>
                </div>
                <div className="product-card">
                  <img src={VIPTRIAXONE_IMG} alt="VIPTRIAXONE" className="product-img" />
                  <div className="product-info"><h3>VIPTRIAXONE</h3><p className="product-generic">Ceftriaxone</p><p className="product-dosage">1 gram Powder for Injection (I.M./I.V.)</p><span className="product-cat">Anti-Bacterial (3rd Gen Cephalosporin)</span></div>
                </div>
              </>
            )}
          </div>
          <p className="products-footer">All pharma company products that you support will be available through the partnership.</p>
        </div>
      );
    case 'connect':
      return (
        <div className="clm-slide slide-connect">
          <img src={VIP_LOGO_CIRCLE} alt="VIP" className="connect-logo" />
          <h2>Let&apos;s Grow Together</h2>
          <p className="connect-subtitle">Interested in learning more about the partnership?</p>
          <div className="connect-cta">
            <div className="connect-messenger"><MessageCircle size={24} /><div><h3>Messenger Integration</h3><p>Coming soon — pending Meta approval</p></div></div>
            <div className="connect-details">
              <div className="connect-detail"><Globe size={16} /><span>vippharmacy.online</span></div>
              <div className="connect-detail"><span>{'\u{1F4DE}'}</span><span>0917 776 0079</span></div>
              <div className="connect-detail"><span>{'\u2709\uFE0F'}</span><span>sales@vippharmacy.online</span></div>
            </div>
          </div>
          <div className="connect-doctor-card"><span>Presented to:</span><strong>{doctorName}</strong></div>
        </div>
      );
    default:
      return null;
  }
};

const presenterStyles = `
  .clm-presenter { position: fixed; inset: 0; z-index: 9999; background: #FFFFFF; display: flex; flex-direction: column; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; user-select: none; overflow: hidden; }
  .clm-topbar { display: flex; align-items: center; gap: 16px; padding: 10px 20px; background: #1f2937; border-bottom: 3px solid #D4A017; flex-shrink: 0; }
  .clm-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 200px; }
  .clm-topbar-logo { height: 32px; width: auto; object-fit: contain; }
  .clm-slide-counter { font-size: 13px; font-weight: 600; color: #D4A017; background: rgba(212,160,23,0.15); padding: 4px 10px; border-radius: 6px; }
  .clm-doctor-name { font-size: 13px; color: rgba(255,255,255,0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .clm-progress-track { flex: 1; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px; overflow: hidden; }
  .clm-progress-fill { height: 100%; background: #D4A017; transition: width 0.3s ease; border-radius: 2px; }
  .clm-close-btn { background: rgba(255,255,255,0.1); border: none; color: rgba(255,255,255,0.7); width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .clm-close-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
  .clm-slide-area { flex: 1; display: flex; align-items: center; justify-content: center; padding: 24px 40px; overflow-y: auto; }
  .clm-slide { max-width: 900px; width: 100%; animation: slideIn 0.3s ease; }
  @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  .clm-slide h2 { font-size: 28px; font-weight: 700; color: #1f2937; margin-bottom: 8px; text-align: center; }
  .slide-lead { font-size: 16px; color: #6b7280; text-align: center; margin-bottom: 28px; line-height: 1.5; max-width: 640px; margin-left: auto; margin-right: auto; }
  .slide-icon-badge { width: 56px; height: 56px; border-radius: 14px; background: #FFF8E1; color: #D4A017; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
  .integrity-badge { background: #ECFDF5; color: #059669; }
  .slide-hero { text-align: center; padding: 20px 0; }
  .hero-logo { width: 120px; height: 120px; object-fit: contain; margin: 0 auto 20px; display: block; }
  .hero-badge { display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 2px; color: #D4A017; background: #FFF8E1; padding: 6px 16px; border-radius: 20px; margin-bottom: 16px; }
  .hero-title { font-size: 44px; font-weight: 800; color: #1f2937; line-height: 1.1; margin-bottom: 12px; }
  .text-gold { color: #D4A017; }
  .hero-subtitle { font-size: 18px; color: #6b7280; max-width: 560px; margin: 0 auto 24px; line-height: 1.5; }
  .hero-url { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; color: #D4A017; background: #FFF8E1; padding: 10px 24px; border-radius: 10px; border: 1px solid rgba(212,160,23,0.2); }
  .startup-pillars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .pillar-card { background: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 14px; padding: 24px 20px; text-align: center; }
  .pillar-icon { font-size: 32px; margin-bottom: 12px; }
  .pillar-card h3 { font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
  .pillar-card p { font-size: 14px; color: #6b7280; line-height: 1.5; }
  .solution-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .solution-card { background: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 14px; padding: 20px; }
  .solution-card h3 { font-size: 15px; font-weight: 700; color: #1f2937; margin-bottom: 6px; }
  .solution-card p { font-size: 14px; color: #6b7280; line-height: 1.5; }
  .integrity-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .integrity-card { background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 14px; padding: 20px; }
  .integrity-icon { font-size: 20px; margin-bottom: 8px; }
  .integrity-card h3 { font-size: 15px; font-weight: 700; color: #166534; margin-bottom: 6px; }
  .integrity-card p { font-size: 14px; color: #4B5563; line-height: 1.5; }
  .slide-products { max-width: 960px; }
  .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 16px; max-height: 420px; overflow-y: auto; padding-right: 4px; }
  .product-card { background: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden; transition: all 0.2s; }
  .product-card:hover { border-color: #D4A017; box-shadow: 0 2px 12px rgba(212,160,23,0.12); }
  .product-img { width: 100%; height: 160px; object-fit: contain; background: #fff; padding: 8px; }
  .product-img-placeholder { width: 100%; height: 160px; display: flex; align-items: center; justify-content: center; background: #F3F4F6; color: #D1D5DB; }
  .product-info { padding: 14px 16px; }
  .product-info h3 { font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 4px; }
  .product-generic { font-size: 13px; color: #6b7280; margin: 0 0 2px 0; }
  .product-dosage { font-size: 12px; color: #9ca3af; margin: 0 0 4px 0; }
  .product-desc { font-size: 13px; color: #6b7280; line-height: 1.4; margin: 4px 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .product-cat { display: inline-block; font-size: 11px; padding: 2px 8px; background: #FFF8E1; color: #D4A017; border-radius: 4px; font-weight: 600; margin-top: 4px; }
  .products-footer { font-size: 14px; color: #9ca3af; text-align: center; font-style: italic; }
  .slide-connect { text-align: center; padding: 20px 0; }
  .connect-logo { width: 80px; height: 80px; object-fit: contain; margin: 0 auto 16px; display: block; }
  .connect-subtitle { font-size: 17px; color: #6b7280; margin-bottom: 28px; }
  .connect-cta { display: flex; flex-direction: column; gap: 20px; align-items: center; margin-bottom: 28px; }
  .connect-messenger { display: flex; align-items: center; gap: 14px; padding: 20px 32px; background: #FFF8E1; border: 2px solid #D4A017; border-radius: 14px; color: #D4A017; max-width: 400px; width: 100%; }
  .connect-messenger h3 { font-size: 16px; font-weight: 700; color: #1f2937; margin-bottom: 2px; }
  .connect-messenger p { font-size: 13px; color: #9ca3af; }
  .connect-details { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .connect-detail { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #4B5563; font-weight: 500; }
  .connect-doctor-card { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: #F3F4F6; border: 1px solid #E5E7EB; border-radius: 10px; font-size: 14px; color: #6b7280; margin-top: 16px; }
  .connect-doctor-card strong { color: #1f2937; }
  .clm-nav { display: flex; align-items: center; justify-content: center; gap: 20px; padding: 12px 20px; background: #FAFAFA; border-top: 1px solid #E5E7EB; flex-shrink: 0; }
  .clm-nav-btn { width: 48px; height: 48px; border-radius: 12px; border: 1px solid #E5E7EB; background: white; color: #1f2937; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
  .clm-nav-btn:hover:not(:disabled) { background: #FFF8E1; border-color: #D4A017; color: #D4A017; }
  .clm-nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
  .clm-dots { display: flex; gap: 8px; align-items: center; }
  .clm-dot { width: 10px; height: 10px; border-radius: 50%; border: none; background: #D1D5DB; cursor: pointer; transition: all 0.2s; padding: 0; }
  .clm-dot.active { width: 28px; border-radius: 5px; background: #D4A017; }
  .clm-dot.visited { background: rgba(212,160,23,0.4); }
  @media (max-width: 768px) {
    .clm-slide-area { padding: 16px 20px; }
    .hero-title { font-size: 32px; }
    .startup-pillars { grid-template-columns: 1fr; }
    .solution-grid { grid-template-columns: 1fr; }
    .integrity-grid { grid-template-columns: 1fr; }
    .products-grid { grid-template-columns: 1fr; max-height: 360px; }
    .clm-topbar-logo { height: 24px; }
    .clm-doctor-name { display: none; }
  }
  @media (min-width: 769px) and (max-width: 1024px) {
    .hero-title { font-size: 38px; }
    .startup-pillars { gap: 12px; }
    .products-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;

export default CLMPresenter;
