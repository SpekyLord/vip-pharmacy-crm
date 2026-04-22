/**
 * PartnershipCLM Page
 *
 * BDM page for the Closed Loop Marketing module:
 * 1. Select a doctor (VIP Client) to present to
 * 2. Launch the full-screen CLM presentation
 * 3. After session, record notes + interest level
 * 4. View past session history
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import CLMPresenter from '../../components/employee/CLMPresenter';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { useAuth } from '../../hooks/useAuth';
import doctorService from '../../services/doctorService';
import clmService from '../../services/clmService';
import toast from 'react-hot-toast';
import {
  Presentation,
  Search,
  Play,
  Clock,
  Star,
  MessageCircle,
  ChevronRight,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  HelpCircle,
  BarChart3,
} from 'lucide-react';

const PartnershipCLM = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── State ─────────────────────────────────────────────────────
  const [doctors, setDoctors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('present'); // 'present' | 'history'

  // ── Presentation state ────────────────────────────────────────
  const [activeSession, setActiveSession] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [showPresenter, setShowPresenter] = useState(false);

  // ── Post-session modal ────────────────────────────────────────
  const [showEndModal, setShowEndModal] = useState(false);
  const [endSessionData, setEndSessionData] = useState(null);
  const [endForm, setEndForm] = useState({
    interestLevel: 3,
    outcome: 'maybe',
    bdmNotes: '',
    followUpDate: '',
  });

  // ── Fetch data ────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [doctorRes, sessionRes] = await Promise.all([
        doctorService.getAll({ limit: 500 }),
        clmService.getMySessions({ limit: 50 }),
      ]);
      setDoctors(doctorRes.data || []);
      setSessions(sessionRes.data || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  // ── Start presentation ────────────────────────────────────────
  const handleStartPresentation = async (doctor) => {
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

      const res = await clmService.startSession(doctor._id, location);
      setActiveSession(res.data);
      setSelectedDoctor(doctor);
      setShowPresenter(true);
      toast.success('Presentation started');
    } catch (err) {
      toast.error('Failed to start session');
    }
  };

  // ── End presentation ──────────────────────────────────────────
  const handleEndPresentation = async (sessionId, slideEvents) => {
    setShowPresenter(false);

    // Send slide events to backend
    if (sessionId && slideEvents?.length) {
      try {
        await clmService.recordSlideEvents(sessionId, slideEvents);
      } catch {
        // Non-critical — events may be lost
      }
    }

    // Show end-session modal
    setEndSessionData({ sessionId, slideEvents });
    setShowEndModal(true);
  };

  // ── Submit post-session form ──────────────────────────────────
  const handleSubmitEnd = async () => {
    if (!endSessionData?.sessionId) {
      setShowEndModal(false);
      return;
    }
    try {
      await clmService.endSession(endSessionData.sessionId, endForm);
      toast.success('Session recorded');
      setShowEndModal(false);
      setEndSessionData(null);
      setEndForm({ interestLevel: 3, outcome: 'maybe', bdmNotes: '', followUpDate: '' });
      fetchData(); // Refresh sessions
    } catch {
      toast.error('Failed to save session');
    }
  };

  // ── QR displayed callback ─────────────────────────────────────
  const handleQrDisplayed = async (sessionId) => {
    try {
      await clmService.markQrDisplayed(sessionId);
    } catch {
      // Non-critical
    }
  };

  // ── Outcome badge helper ──────────────────────────────────────
  const OutcomeBadge = ({ outcome }) => {
    const config = {
      interested: { icon: CheckCircle2, color: '#00D4AA', label: 'Interested' },
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
  if (showPresenter && activeSession) {
    return (
      <CLMPresenter
        session={activeSession}
        doctor={selectedDoctor}
        onEnd={handleEndPresentation}
        onQrDisplayed={handleQrDisplayed}
      />
    );
  }

  return (
    <div className="clm-layout">
      <style>{pageStyles}</style>
      <Navbar />
      <div className="clm-content">
        <Sidebar />
        <main className="clm-main">
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="clm-page-header">
            <div>
              <h1>
                <Presentation size={24} />
                Partnership Presentation
              </h1>
              <p className="clm-page-subtitle">
                Present the VIP Online Pharmacy partnership to VIP Clients
              </p>
            </div>
          </div>

          {/* ── Tabs ────────────────────────────────────────────── */}
          <div className="clm-tabs">
            <button
              className={`clm-tab ${tab === 'present' ? 'active' : ''}`}
              onClick={() => setTab('present')}
            >
              <Play size={16} /> Present
            </button>
            <button
              className={`clm-tab ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
            >
              <BarChart3 size={16} /> Session History ({sessions.length})
            </button>
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : tab === 'present' ? (
            /* ── Present tab ──────────────────────────────────── */
            <div className="clm-present-tab">
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
                          <h3>
                            Dr. {doc.firstName} {doc.lastName}
                          </h3>
                          <p className="clm-doctor-spec">
                            {doc.specialization || 'General'}
                          </p>
                          {doc.clinicOfficeAddress && (
                            <p className="clm-doctor-addr">{doc.clinicOfficeAddress}</p>
                          )}
                        </div>
                      </div>
                      {lastSession && (
                        <div className="clm-last-session">
                          <Clock size={12} />
                          <span>
                            Last presented:{' '}
                            {new Date(lastSession.createdAt).toLocaleDateString()}
                          </span>
                          {lastSession.outcome && (
                            <OutcomeBadge outcome={lastSession.outcome} />
                          )}
                        </div>
                      )}
                      <button
                        className="clm-present-btn"
                        onClick={() => handleStartPresentation(doc)}
                      >
                        <Play size={16} />
                        Start Presentation
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  );
                })}
                {filteredDoctors.length === 0 && (
                  <div className="clm-empty">
                    <User size={40} />
                    <p>No VIP Clients found</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── History tab ──────────────────────────────────── */
            <div className="clm-history-tab">
              {sessions.length === 0 ? (
                <div className="clm-empty">
                  <BarChart3 size={40} />
                  <p>No sessions yet. Start your first presentation!</p>
                </div>
              ) : (
                <div className="clm-session-list">
                  {sessions.map((s) => (
                    <div key={s._id} className="clm-session-card">
                      <div className="clm-session-top">
                        <div className="clm-session-doctor">
                          <User size={16} />
                          <span>
                            Dr. {s.doctor?.firstName} {s.doctor?.lastName}
                          </span>
                        </div>
                        <OutcomeBadge outcome={s.outcome} />
                      </div>
                      <div className="clm-session-meta">
                        <span>
                          <Calendar size={13} />{' '}
                          {new Date(s.createdAt).toLocaleDateString('en-PH', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>
                          <Clock size={13} />{' '}
                          {s.totalDurationMs
                            ? `${Math.round(s.totalDurationMs / 1000 / 60)} min`
                            : 'In progress'}
                        </span>
                        <span>
                          <Presentation size={13} /> {s.slidesViewedCount || 0}/
                          {s.totalSlides || 9} slides
                        </span>
                        {s.qrScanned && (
                          <span className="clm-qr-badge">
                            <MessageCircle size={13} /> QR Scanned
                          </span>
                        )}
                      </div>
                      {s.interestLevel && (
                        <div className="clm-session-stars">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              size={14}
                              fill={n <= s.interestLevel ? '#00D4AA' : 'transparent'}
                              color={n <= s.interestLevel ? '#00D4AA' : '#555'}
                            />
                          ))}
                        </div>
                      )}
                      {s.bdmNotes && (
                        <p className="clm-session-notes">{s.bdmNotes}</p>
                      )}
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
                  {selectedDoctor
                    ? `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}`
                    : 'this client'}
                </p>

                <div className="clm-form-group">
                  <label>Interest Level</label>
                  <div className="clm-star-input">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        className="clm-star-btn"
                        onClick={() => setEndForm((f) => ({ ...f, interestLevel: n }))}
                      >
                        <Star
                          size={28}
                          fill={n <= endForm.interestLevel ? '#00D4AA' : 'transparent'}
                          color={n <= endForm.interestLevel ? '#00D4AA' : '#555'}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="clm-form-group">
                  <label>Outcome</label>
                  <select
                    value={endForm.outcome}
                    onChange={(e) =>
                      setEndForm((f) => ({ ...f, outcome: e.target.value }))
                    }
                  >
                    <option value="interested">Interested</option>
                    <option value="maybe">Maybe / Needs Follow-up</option>
                    <option value="not_interested">Not Interested</option>
                    <option value="already_partner">Already a Partner</option>
                    <option value="reschedule">Reschedule</option>
                  </select>
                </div>

                <div className="clm-form-group">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Key observations, objections, questions asked..."
                    value={endForm.bdmNotes}
                    onChange={(e) =>
                      setEndForm((f) => ({ ...f, bdmNotes: e.target.value }))
                    }
                  />
                </div>

                <div className="clm-form-group">
                  <label>Follow-up Date</label>
                  <input
                    type="date"
                    value={endForm.followUpDate}
                    onChange={(e) =>
                      setEndForm((f) => ({ ...f, followUpDate: e.target.value }))
                    }
                  />
                </div>

                <div className="clm-modal-actions">
                  <button
                    className="clm-modal-cancel"
                    onClick={() => setShowEndModal(false)}
                  >
                    Skip
                  </button>
                  <button className="clm-modal-submit" onClick={handleSubmitEnd}>
                    Save Session
                  </button>
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
  .clm-layout {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  .clm-content {
    display: flex;
    flex: 1;
  }
  .clm-main {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    background: #f9fafb;
  }
  .clm-page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }
  .clm-page-header h1 {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 24px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 4px 0;
  }
  .clm-page-subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  /* Tabs */
  .clm-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 20px;
    background: #f3f4f6;
    padding: 4px;
    border-radius: 10px;
    width: fit-content;
  }
  .clm-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    background: transparent;
    color: #6b7280;
    font-size: 14px;
    font-weight: 500;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .clm-tab.active {
    background: white;
    color: #1f2937;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  /* Search */
  .clm-search-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    margin-bottom: 20px;
  }
  .clm-search-bar input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 14px;
    color: #1f2937;
    background: transparent;
  }
  .clm-search-bar svg { color: #9ca3af; }

  /* Doctor grid */
  .clm-doctor-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 12px;
  }
  .clm-doctor-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    transition: all 0.2s;
  }
  .clm-doctor-card:hover {
    border-color: #2563eb;
    box-shadow: 0 2px 8px rgba(37,99,235,0.1);
  }
  .clm-doctor-info {
    display: flex;
    gap: 12px;
    margin-bottom: 12px;
  }
  .clm-doctor-avatar {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: #eff6ff;
    color: #2563eb;
    font-weight: 700;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .clm-doctor-info h3 {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 2px 0;
  }
  .clm-doctor-spec {
    font-size: 13px;
    color: #6b7280;
    margin: 0;
  }
  .clm-doctor-addr {
    font-size: 12px;
    color: #9ca3af;
    margin: 2px 0 0 0;
  }
  .clm-last-session {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #9ca3af;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }
  .clm-present-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  .clm-present-btn:hover {
    background: #1d4ed8;
  }
  .clm-present-btn svg:last-child {
    margin-left: auto;
  }

  /* Outcome badge */
  .outcome-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid;
    border-radius: 6px;
    background: transparent;
  }

  /* Session list */
  .clm-session-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .clm-session-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
  }
  .clm-session-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }
  .clm-session-doctor {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }
  .clm-session-meta {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .clm-session-meta span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .clm-qr-badge {
    color: #00D4AA !important;
    font-weight: 500;
  }
  .clm-session-stars {
    display: flex;
    gap: 2px;
    margin-bottom: 6px;
  }
  .clm-session-notes {
    font-size: 13px;
    color: #6b7280;
    margin: 0;
    padding: 8px 12px;
    background: #f9fafb;
    border-radius: 8px;
    line-height: 1.5;
  }

  /* Empty state */
  .clm-empty {
    text-align: center;
    padding: 60px 20px;
    color: #9ca3af;
  }
  .clm-empty p {
    margin-top: 12px;
    font-size: 15px;
  }

  /* Modal */
  .clm-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
  }
  .clm-modal {
    background: white;
    border-radius: 16px;
    padding: 28px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  }
  .clm-modal h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 4px 0;
  }
  .clm-modal-subtitle {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 20px 0;
  }
  .clm-form-group {
    margin-bottom: 16px;
  }
  .clm-form-group label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 6px;
  }
  .clm-star-input {
    display: flex;
    gap: 4px;
  }
  .clm-star-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
  }
  .clm-form-group select,
  .clm-form-group textarea,
  .clm-form-group input[type="date"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    color: #1f2937;
    background: white;
    outline: none;
  }
  .clm-form-group select:focus,
  .clm-form-group textarea:focus,
  .clm-form-group input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
  }
  .clm-modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
  }
  .clm-modal-cancel {
    padding: 10px 20px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #6b7280;
    font-size: 14px;
    cursor: pointer;
  }
  .clm-modal-submit {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: #2563eb;
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .clm-modal-submit:hover {
    background: #1d4ed8;
  }
`;

export default PartnershipCLM;
