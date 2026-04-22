/**
 * CLMPresenter — Full-screen interactive partnership presentation
 *
 * Veeva CLM-style slide viewer that BDMs use on tablets to pitch the
 * VIP Online Pharmacy Partnership to doctors. Tracks:
 * - Time per slide (slideEvents)
 * - QR code display
 * - Total session duration
 *
 * Props:
 *   session      — CLMSession object (from API after startSession)
 *   doctor       — Doctor object (name, specialization)
 *   onEnd        — callback(sessionId, slideEvents) when BDM ends session
 *   onQrDisplayed — callback(sessionId) when QR slide is shown
 *   messengerPageId — Facebook page username for m.me link (default: 'VIPPharmacyOnline')
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  TrendingUp,
  Heart,
  MapPin,
  Handshake,
  DollarSign,
  Globe,
  MessageCircle,
  Pill,
} from 'lucide-react';
import philippinesMap from '../../assets/philippines-map.png';

// ── Slide definitions ───────────────────────────────────────────────
const SLIDES = [
  {
    id: 0,
    title: 'VIP Inc.',
    subtitle: 'Online Pharmacy Partnership',
    icon: Building2,
    type: 'hero',
  },
  {
    id: 1,
    title: 'The Problem',
    subtitle: 'Why patients need a better option',
    icon: Heart,
    type: 'problem',
  },
  {
    id: 2,
    title: 'Our Solution',
    subtitle: 'VIP Online Pharmacy',
    icon: Pill,
    type: 'solution',
  },
  {
    id: 3,
    title: 'Why It Works',
    subtitle: 'The locality advantage',
    icon: MapPin,
    type: 'why',
  },
  {
    id: 4,
    title: 'The Partnership',
    subtitle: 'What we ask — what you get',
    icon: Handshake,
    type: 'partnership',
  },
  {
    id: 5,
    title: 'Equity Opportunity',
    subtitle: 'Become a shareholder',
    icon: TrendingUp,
    type: 'equity',
  },
  {
    id: 6,
    title: 'Revenue Share',
    subtitle: '25% on exclusive products',
    icon: DollarSign,
    type: 'revenue',
  },
  {
    id: 7,
    title: 'Expansion Roadmap',
    subtitle: 'From Iloilo to nationwide',
    icon: Globe,
    type: 'expansion',
  },
  {
    id: 8,
    title: 'Connect Now',
    subtitle: 'Scan to start your partnership',
    icon: MessageCircle,
    type: 'connect',
  },
];

const CLMPresenter = ({
  session,
  doctor,
  onEnd,
  onQrDisplayed,
  messengerPageId = 'VIPPharmacyOnline',
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideEvents, setSlideEvents] = useState([]);
  const slideEnteredAt = useRef(new Date());
  const touchStartX = useRef(null);
  const containerRef = useRef(null);

  // ── Track slide entry/exit ──────────────────────────────────────
  const recordSlideExit = useCallback(() => {
    const now = new Date();
    const duration = now - slideEnteredAt.current;
    setSlideEvents((prev) => [
      ...prev,
      {
        slideIndex: currentSlide,
        slideTitle: SLIDES[currentSlide]?.title || '',
        enteredAt: slideEnteredAt.current.toISOString(),
        exitedAt: now.toISOString(),
        durationMs: duration,
        interactions: [],
      },
    ]);
  }, [currentSlide]);

  const goToSlide = useCallback(
    (index) => {
      if (index < 0 || index >= SLIDES.length) return;
      recordSlideExit();
      setCurrentSlide(index);
      slideEnteredAt.current = new Date();

      // Notify when QR slide is shown
      if (index === SLIDES.length - 1 && onQrDisplayed && session) {
        onQrDisplayed(session._id);
      }
    },
    [recordSlideExit, onQrDisplayed, session]
  );

  const goNext = useCallback(() => goToSlide(currentSlide + 1), [currentSlide, goToSlide]);
  const goPrev = useCallback(() => goToSlide(currentSlide - 1), [currentSlide, goToSlide]);

  // ── Touch / swipe handling ──────────────────────────────────────
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  // ── Keyboard navigation ─────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape' && onEnd) {
        recordSlideExit();
        onEnd(session?._id, slideEvents);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [goNext, goPrev, onEnd, session, slideEvents, recordSlideExit]);

  // ── End session handler ─────────────────────────────────────────
  const handleEnd = () => {
    recordSlideExit();
    if (onEnd) onEnd(session?._id, slideEvents);
  };

  // ── m.me link for QR ────────────────────────────────────────────
  const messengerRef = session?.messengerRef || 'CLM_DEMO';
  const mmeLink = `https://m.me/${messengerPageId}?ref=${messengerRef}`;

  // ── QR code via Google Charts API ───────────────────────────────
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(mmeLink)}&bgcolor=111111&color=00D4AA`;

  const progress = ((currentSlide + 1) / SLIDES.length) * 100;
  const doctorName = doctor
    ? `Dr. ${doctor.firstName} ${doctor.lastName}`
    : 'VIP Client';

  return (
    <div
      ref={containerRef}
      className="clm-presenter"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{presenterStyles}</style>

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="clm-topbar">
        <div className="clm-topbar-left">
          <span className="clm-slide-counter">
            {currentSlide + 1} / {SLIDES.length}
          </span>
          <span className="clm-doctor-name">{doctorName}</span>
        </div>
        <div className="clm-progress-track">
          <div className="clm-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <button className="clm-close-btn" onClick={handleEnd} title="End Session">
          <X size={20} />
        </button>
      </div>

      {/* ── Slide content ────────────────────────────────────────── */}
      <div className="clm-slide-area">
        <SlideContent
          slide={SLIDES[currentSlide]}
          qrUrl={qrUrl}
          mmeLink={mmeLink}
          philippinesMap={philippinesMap}
          doctorName={doctorName}
        />
      </div>

      {/* ── Navigation ───────────────────────────────────────────── */}
      <div className="clm-nav">
        <button
          className="clm-nav-btn"
          onClick={goPrev}
          disabled={currentSlide === 0}
        >
          <ChevronLeft size={28} />
        </button>
        <div className="clm-dots">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              className={`clm-dot ${i === currentSlide ? 'active' : ''} ${
                i < currentSlide ? 'visited' : ''
              }`}
              onClick={() => goToSlide(i)}
            />
          ))}
        </div>
        <button
          className="clm-nav-btn"
          onClick={goNext}
          disabled={currentSlide === SLIDES.length - 1}
        >
          <ChevronRight size={28} />
        </button>
      </div>
    </div>
  );
};

// ── Individual slide renderer ─────────────────────────────────────
const SlideContent = ({ slide, qrUrl, mmeLink, philippinesMap, doctorName }) => {
  const Icon = slide.icon;

  switch (slide.type) {
    case 'hero':
      return (
        <div className="clm-slide slide-hero">
          <div className="slide-hero-badge">PARTNERSHIP OPPORTUNITY</div>
          <h1 className="slide-hero-title">
            VIP <span className="text-teal">Online Pharmacy</span>
          </h1>
          <p className="slide-hero-subtitle">
            Your gateway to affordable medicine distribution
          </p>
          <div className="slide-hero-tagline">
            <Globe size={18} />
            <span>vippharmacy.online</span>
          </div>
          <div className="slide-hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-value">50K</span>
              <span className="hero-stat-label">Shares Available</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-value">25%</span>
              <span className="hero-stat-label">Revenue Share</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-value">₱0</span>
              <span className="hero-stat-label">Upfront Cost</span>
            </div>
          </div>
        </div>
      );

    case 'problem':
      return (
        <div className="clm-slide slide-problem">
          <div className="slide-icon-badge"><Heart size={28} /></div>
          <h2>The Problem</h2>
          <div className="problem-grid">
            <div className="problem-card">
              <div className="problem-number">70%</div>
              <p>of Filipinos pay out-of-pocket for medicines</p>
            </div>
            <div className="problem-card">
              <div className="problem-number">3-5×</div>
              <p>markup at big chain pharmacies vs. wholesale</p>
            </div>
            <div className="problem-card">
              <div className="problem-number">40%</div>
              <p>of patients skip doses due to cost</p>
            </div>
            <div className="problem-card">
              <div className="problem-number">0</div>
              <p>personalized service at chain drugstores</p>
            </div>
          </div>
          <p className="slide-footnote">
            Big chains dominate — patients deserve a better, more affordable option with personal care.
          </p>
        </div>
      );

    case 'solution':
      return (
        <div className="clm-slide slide-solution">
          <div className="slide-icon-badge"><Pill size={28} /></div>
          <h2>VIP Online Pharmacy</h2>
          <div className="solution-features">
            <div className="solution-feature">
              <div className="feature-icon">🏥</div>
              <h3>Doctor-Partnered</h3>
              <p>Doctors recommend, patients trust. Your endorsement drives orders.</p>
            </div>
            <div className="solution-feature">
              <div className="feature-icon">🚚</div>
              <h3>Free Delivery</h3>
              <p>Direct to patient's door. No pharmacy lines, no waiting.</p>
            </div>
            <div className="solution-feature">
              <div className="feature-icon">💊</div>
              <h3>Affordable Pricing</h3>
              <p>Wholesale-level prices passed to patients. Up to 60% savings.</p>
            </div>
            <div className="solution-feature">
              <div className="feature-icon">📱</div>
              <h3>Messenger Ordering</h3>
              <p>Patients order via Facebook Messenger — no app download needed.</p>
            </div>
          </div>
          <div className="solution-url">
            <Globe size={16} /> vippharmacy.online
          </div>
        </div>
      );

    case 'why':
      return (
        <div className="clm-slide slide-why">
          <div className="slide-icon-badge"><MapPin size={28} /></div>
          <h2>Why It Works</h2>
          <div className="why-layout">
            <div className="why-points">
              <div className="why-point">
                <div className="why-bullet">1</div>
                <div>
                  <h3>Locality Advantage</h3>
                  <p>We operate in areas big chains ignore. Your patients, your territory.</p>
                </div>
              </div>
              <div className="why-point">
                <div className="why-bullet">2</div>
                <div>
                  <h3>Doctor Trust Network</h3>
                  <p>Patients buy from doctors they trust, not from faceless chains.</p>
                </div>
              </div>
              <div className="why-point">
                <div className="why-bullet">3</div>
                <div>
                  <h3>BDM Support</h3>
                  <p>Dedicated Business Development Managers handle logistics — you focus on patients.</p>
                </div>
              </div>
              <div className="why-point">
                <div className="why-bullet">4</div>
                <div>
                  <h3>Proven Model</h3>
                  <p>Already operating in Iloilo City with active partner doctors and growing orders.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'partnership':
      return (
        <div className="clm-slide slide-partnership">
          <div className="slide-icon-badge"><Handshake size={28} /></div>
          <h2>The Partnership</h2>
          <div className="partnership-comparison">
            <div className="partnership-col partnership-ask">
              <h3>What We Ask</h3>
              <ul>
                <li>Recommend VIP Pharmacy to your patients</li>
                <li>Allow us to place a QR code in your clinic</li>
                <li>Provide feedback on patient needs</li>
                <li>Be an advocate for affordable medicine</li>
              </ul>
            </div>
            <div className="partnership-divider">
              <Handshake size={32} />
            </div>
            <div className="partnership-col partnership-get">
              <h3>What You Get</h3>
              <ul>
                <li><strong>50,000 shares</strong> in VIP Inc.</li>
                <li><strong>25% revenue share</strong> on exclusive products</li>
                <li>Monthly rebate payments</li>
                <li>Priority territory rights</li>
                <li>Free incorporation support</li>
              </ul>
            </div>
          </div>
        </div>
      );

    case 'equity':
      return (
        <div className="clm-slide slide-equity">
          <div className="slide-icon-badge"><TrendingUp size={28} /></div>
          <h2>Equity Opportunity</h2>
          <div className="equity-highlight">
            <div className="equity-big-number">50,000</div>
            <div className="equity-label">Shares in VIP Inc.</div>
          </div>
          <div className="equity-details">
            <div className="equity-detail">
              <h3>Territory Incorporation</h3>
              <p>We help incorporate your territory as a separate entity — you become a founding shareholder.</p>
            </div>
            <div className="equity-detail">
              <h3>Invest in Other Territories</h3>
              <p>As we expand, you can invest in new territories and grow your portfolio.</p>
            </div>
            <div className="equity-detail">
              <h3>Long-Term Value</h3>
              <p>As VIP grows nationwide, your shares appreciate. This is a wealth-building partnership.</p>
            </div>
          </div>
        </div>
      );

    case 'revenue':
      return (
        <div className="clm-slide slide-revenue">
          <div className="slide-icon-badge"><DollarSign size={28} /></div>
          <h2>Revenue Share</h2>
          <div className="revenue-example">
            <div className="revenue-header">Monthly Example Calculation</div>
            <div className="revenue-rows">
              <div className="revenue-row">
                <span>Your referred patients order</span>
                <span className="revenue-amount">₱100,000</span>
              </div>
              <div className="revenue-row">
                <span>Exclusive product sales</span>
                <span className="revenue-amount">₱40,000</span>
              </div>
              <div className="revenue-row highlight">
                <span>Your 25% revenue share</span>
                <span className="revenue-amount text-teal">₱10,000</span>
              </div>
              <div className="revenue-row">
                <span>Paid monthly via</span>
                <span className="revenue-amount">Bank Transfer</span>
              </div>
            </div>
          </div>
          <p className="slide-footnote">
            Revenue share applies to exclusive VIP-branded products ordered by your referred patients.
            Regular products earn standard referral bonuses.
          </p>
        </div>
      );

    case 'expansion':
      return (
        <div className="clm-slide slide-expansion">
          <div className="slide-icon-badge"><Globe size={28} /></div>
          <h2>Expansion Roadmap</h2>
          <div className="expansion-layout">
            <div className="expansion-map">
              <img src={philippinesMap} alt="VIP Expansion Map" />
            </div>
            <div className="expansion-timeline">
              <div className="timeline-item active">
                <div className="timeline-dot" />
                <div>
                  <h3>Phase 1 — Now</h3>
                  <p>Iloilo City (HQ), Antique, Roxas City, Kalibo</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  <h3>Phase 2 — 2025</h3>
                  <p>Bacolod, Davao Region, expanded Visayas</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  <h3>Phase 3 — 2026</h3>
                  <p>Mindanao expansion, franchise model launch</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-dot" />
                <div>
                  <h3>Phase 4 — 2027</h3>
                  <p>Nationwide coverage, 500+ partner doctors</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'connect':
      return (
        <div className="clm-slide slide-connect">
          <div className="slide-icon-badge pulse"><MessageCircle size={28} /></div>
          <h2>Start Your Partnership</h2>
          <p className="connect-subtitle">
            Scan this QR code to connect with us on Messenger
          </p>
          <div className="connect-qr-wrapper">
            <img src={qrUrl} alt="Messenger QR Code" className="connect-qr" />
          </div>
          <p className="connect-link">
            Or visit: <a href={mmeLink} target="_blank" rel="noopener noreferrer">{mmeLink}</a>
          </p>
          <div className="connect-doctor-card">
            <span>Presenting to:</span>
            <strong>{doctorName}</strong>
          </div>
        </div>
      );

    default:
      return null;
  }
};

// ── Styles ────────────────────────────────────────────────────────
const presenterStyles = `
  .clm-presenter {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0a0a0a;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e5e5e5;
    user-select: none;
    overflow: hidden;
  }

  /* ── Top bar ─────────────────────────────────────────────────── */
  .clm-topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .clm-topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 200px;
  }
  .clm-slide-counter {
    font-size: 13px;
    font-weight: 600;
    color: #00D4AA;
    background: rgba(0,212,170,0.1);
    padding: 4px 10px;
    border-radius: 6px;
  }
  .clm-doctor-name {
    font-size: 13px;
    color: #999;
  }
  .clm-progress-track {
    flex: 1;
    height: 3px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
    overflow: hidden;
  }
  .clm-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #00D4AA, #00B894);
    border-radius: 2px;
    transition: width 0.4s ease;
  }
  .clm-close-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #999;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .clm-close-btn:hover {
    background: rgba(239,68,68,0.15);
    color: #ef4444;
    border-color: rgba(239,68,68,0.3);
  }

  /* ── Slide area ──────────────────────────────────────────────── */
  .clm-slide-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
    padding: 24px 40px;
  }
  .clm-slide {
    max-width: 960px;
    width: 100%;
    animation: slideIn 0.35s ease;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }
  .clm-slide h2 {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 24px;
    color: #fff;
  }

  /* ── Navigation ──────────────────────────────────────────────── */
  .clm-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 16px 20px;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(8px);
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .clm-nav-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    color: #ccc;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  .clm-nav-btn:hover:not(:disabled) {
    background: rgba(0,212,170,0.15);
    color: #00D4AA;
    border-color: rgba(0,212,170,0.3);
  }
  .clm-nav-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }
  .clm-dots {
    display: flex;
    gap: 8px;
  }
  .clm-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    border: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  .clm-dot.active {
    background: #00D4AA;
    box-shadow: 0 0 8px rgba(0,212,170,0.5);
    transform: scale(1.3);
  }
  .clm-dot.visited {
    background: rgba(0,212,170,0.4);
  }

  /* ── Utility classes ─────────────────────────────────────────── */
  .text-teal { color: #00D4AA; }
  .slide-icon-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: rgba(0,212,170,0.1);
    color: #00D4AA;
    margin-bottom: 16px;
  }
  .slide-icon-badge.pulse {
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0,212,170,0.3); }
    50% { box-shadow: 0 0 0 12px rgba(0,212,170,0); }
  }
  .slide-footnote {
    margin-top: 24px;
    font-size: 13px;
    color: #777;
    font-style: italic;
  }

  /* ── Hero slide ──────────────────────────────────────────────── */
  .slide-hero {
    text-align: center;
    padding: 40px 0;
  }
  .slide-hero-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #00D4AA;
    background: rgba(0,212,170,0.08);
    border: 1px solid rgba(0,212,170,0.2);
    padding: 6px 18px;
    border-radius: 20px;
    margin-bottom: 28px;
  }
  .slide-hero-title {
    font-size: 52px;
    font-weight: 800;
    color: #fff;
    margin-bottom: 12px;
    line-height: 1.1;
  }
  .slide-hero-subtitle {
    font-size: 20px;
    color: #888;
    margin-bottom: 20px;
  }
  .slide-hero-tagline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #00D4AA;
    margin-bottom: 40px;
  }
  .slide-hero-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 32px;
    padding: 28px 40px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    max-width: 600px;
    margin: 0 auto;
  }
  .hero-stat { text-align: center; }
  .hero-stat-value {
    display: block;
    font-size: 36px;
    font-weight: 800;
    color: #00D4AA;
    line-height: 1;
    margin-bottom: 6px;
  }
  .hero-stat-label {
    font-size: 12px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .hero-stat-divider {
    width: 1px;
    height: 40px;
    background: rgba(255,255,255,0.1);
  }

  /* ── Problem slide ───────────────────────────────────────────── */
  .problem-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }
  .problem-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }
  .problem-number {
    font-size: 42px;
    font-weight: 800;
    color: #ef4444;
    line-height: 1;
    margin-bottom: 8px;
  }
  .problem-card p {
    font-size: 14px;
    color: #999;
    line-height: 1.4;
  }

  /* ── Solution slide ──────────────────────────────────────────── */
  .solution-features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  .solution-feature {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 24px;
  }
  .feature-icon {
    font-size: 28px;
    margin-bottom: 10px;
  }
  .solution-feature h3 {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 6px;
  }
  .solution-feature p {
    font-size: 13px;
    color: #999;
    line-height: 1.4;
  }
  .solution-url {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: #00D4AA;
  }

  /* ── Why slide ───────────────────────────────────────────────── */
  .why-layout { }
  .why-points {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .why-point {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 12px;
    padding: 20px;
  }
  .why-bullet {
    min-width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(0,212,170,0.1);
    color: #00D4AA;
    font-weight: 700;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .why-point h3 {
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }
  .why-point p {
    font-size: 13px;
    color: #999;
    line-height: 1.4;
  }

  /* ── Partnership slide ───────────────────────────────────────── */
  .partnership-comparison {
    display: flex;
    gap: 0;
    align-items: stretch;
  }
  .partnership-col {
    flex: 1;
    padding: 28px;
    border-radius: 12px;
  }
  .partnership-ask {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .partnership-get {
    background: rgba(0,212,170,0.05);
    border: 1px solid rgba(0,212,170,0.15);
  }
  .partnership-col h3 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 16px;
    color: #fff;
  }
  .partnership-get h3 { color: #00D4AA; }
  .partnership-col ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .partnership-col li {
    padding: 8px 0;
    font-size: 14px;
    color: #ccc;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    line-height: 1.5;
  }
  .partnership-col li:last-child { border-bottom: none; }
  .partnership-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 60px;
    color: #00D4AA;
    flex-shrink: 0;
  }

  /* ── Equity slide ────────────────────────────────────────────── */
  .equity-highlight {
    text-align: center;
    padding: 32px;
    background: rgba(0,212,170,0.05);
    border: 1px solid rgba(0,212,170,0.15);
    border-radius: 16px;
    margin-bottom: 24px;
  }
  .equity-big-number {
    font-size: 64px;
    font-weight: 800;
    color: #00D4AA;
    line-height: 1;
  }
  .equity-label {
    font-size: 16px;
    color: #999;
    margin-top: 8px;
    text-transform: uppercase;
    letter-spacing: 2px;
  }
  .equity-details {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }
  .equity-detail {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 20px;
  }
  .equity-detail h3 {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 6px;
  }
  .equity-detail p {
    font-size: 13px;
    color: #999;
    line-height: 1.4;
  }

  /* ── Revenue slide ───────────────────────────────────────────── */
  .revenue-example {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
    max-width: 560px;
  }
  .revenue-header {
    padding: 16px 24px;
    font-size: 14px;
    font-weight: 600;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .revenue-rows { padding: 8px 0; }
  .revenue-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 24px;
    font-size: 15px;
    color: #ccc;
  }
  .revenue-row.highlight {
    background: rgba(0,212,170,0.06);
    border-top: 1px solid rgba(0,212,170,0.15);
    border-bottom: 1px solid rgba(0,212,170,0.15);
  }
  .revenue-amount {
    font-weight: 700;
    color: #fff;
  }

  /* ── Expansion slide ─────────────────────────────────────────── */
  .expansion-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    align-items: center;
  }
  .expansion-map img {
    width: 100%;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .expansion-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
    padding-left: 24px;
  }
  .expansion-timeline::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: rgba(255,255,255,0.1);
  }
  .timeline-item {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    padding: 16px 0;
    position: relative;
  }
  .timeline-dot {
    min-width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    border: 2px solid rgba(255,255,255,0.2);
    margin-left: -24px;
    position: relative;
    z-index: 1;
  }
  .timeline-item.active .timeline-dot {
    background: #00D4AA;
    border-color: #00D4AA;
    box-shadow: 0 0 10px rgba(0,212,170,0.4);
  }
  .timeline-item h3 {
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 4px;
  }
  .timeline-item.active h3 { color: #00D4AA; }
  .timeline-item p {
    font-size: 13px;
    color: #999;
    line-height: 1.4;
  }

  /* ── Connect slide ───────────────────────────────────────────── */
  .slide-connect {
    text-align: center;
    padding: 20px 0;
  }
  .connect-subtitle {
    font-size: 18px;
    color: #999;
    margin-bottom: 28px;
  }
  .connect-qr-wrapper {
    display: inline-block;
    padding: 20px;
    background: rgba(0,212,170,0.05);
    border: 2px solid rgba(0,212,170,0.2);
    border-radius: 20px;
    margin-bottom: 20px;
  }
  .connect-qr {
    width: 240px;
    height: 240px;
    border-radius: 12px;
  }
  .connect-link {
    font-size: 13px;
    color: #777;
    margin-bottom: 20px;
  }
  .connect-link a {
    color: #00D4AA;
    text-decoration: none;
  }
  .connect-doctor-card {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px;
    font-size: 14px;
    color: #999;
  }
  .connect-doctor-card strong {
    color: #fff;
  }

  /* ── Responsive (tablet portrait) ────────────────────────────── */
  @media (max-width: 768px) {
    .clm-slide-area { padding: 16px 20px; }
    .slide-hero-title { font-size: 36px; }
    .slide-hero-stats { flex-direction: column; gap: 16px; }
    .hero-stat-divider { width: 40px; height: 1px; }
    .problem-grid { grid-template-columns: 1fr; }
    .solution-features { grid-template-columns: 1fr; }
    .partnership-comparison { flex-direction: column; }
    .partnership-divider { width: 100%; height: 40px; }
    .equity-details { grid-template-columns: 1fr; }
    .expansion-layout { grid-template-columns: 1fr; }
    .equity-big-number { font-size: 48px; }
  }
`;

export default CLMPresenter;
